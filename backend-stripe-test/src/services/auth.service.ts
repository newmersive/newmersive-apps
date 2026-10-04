import bcrypt from "bcryptjs";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import {getNoaGoogleClientId,recordNoaAccountConsent} from "./noa-auth-policy";
import { ENV } from "../config/env";
import { AuthTokenResponse, AuthUser, User, UserRole } from "../shared/types";
import {
  getUserCourseEntitlements,
  toEntitledAuthUser,
} from "./course-entitlements.service";

// JSON driver
import {
  getDatabase,
  getUserByEmail,
  getUserById,
  upsertUser,
  savePasswordResetToken,
  getPasswordResetToken,
  deletePasswordResetTokensForUser,
} from "./data.store";

// Postgres driver
import {
  getUsersPg,
  getUserByEmailPg,
  getUserByIdPg,
  getUserBySponsorCodePg,
  upsertUserPg,
  savePasswordResetTokenPg,
  getPasswordResetTokenPg,
} from "./data.store.pg";
import { getPrisma } from "../db/prisma";
import {
  ensureAllwainParticipationProfiles,
  getAllwainParticipationSnapshot,
  recordAllwainReferralAttribution,
} from "./allwain-participation.service";
import { verifyAppleIdentity } from "./apple-auth.service";
import {
  AuthSessionContext,
  createRefreshSession,
  issueAccessToken,
  listUserSessions,
  revokeAllMemorySessions,
  revokeSession,
  rotateRefreshSession,
} from "./auth-session.service";

const ALLOWED_PUBLIC_ROLES: UserRole[] = ["user", "buyer", "company"];
type SourceApp = "trueqia" | "allwain" | "newmersive";
export type SupportedLocale = "es" | "en" | "fr" | "it" | "zh" | "ar";
const googleOAuthClient = new OAuth2Client();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVALID_LOGIN_PASSWORD_HASH =
  "$2a$12$NHqtredYetp.jnHE7gmT.OJWj3qpvmlhapHh43mGqM4Uq.bZ/xw96";
const LOGIN_FAILURE_WINDOW_MS = 15 * 60_000;
const LOGIN_LOCK_THRESHOLD = 5;
const LOGIN_LOCK_BASE_MS = 30_000;
const LOGIN_LOCK_MAX_MS = 15 * 60_000;
const COMMON_EMAIL_DOMAIN_CORRECTIONS: Record<string, string> = {
  "gamil.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.co": "gmail.com",
  "hotmal.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "outlook.con": "outlook.com",
  "yahoo.con": "yahoo.com",
};

export function suggestEmailCorrection(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  const separator = email.lastIndexOf("@");
  if (separator <= 0) return null;
  const domain = email.slice(separator + 1);
  const correctedDomain = COMMON_EMAIL_DOMAIN_CORRECTIONS[domain];
  return correctedDomain ? `${email.slice(0, separator)}@${correctedDomain}` : null;
}

export function normalizePreferredLocale(value: unknown): SupportedLocale | null {
  const language = String(value || "")
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0];
  return ["es", "en", "fr", "it", "zh", "ar"].includes(language)
    ? (language as SupportedLocale)
    : null;
}

function normalizeRegistrationFields(name: unknown, email: unknown, password: unknown) {
  const cleanName = String(name || "").trim().replace(/\s+/g, " ");
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const cleanPassword = typeof password === "string" ? password : "";

  if (cleanName.length < 2 || cleanName.length > 120) {
    throw new Error("INVALID_NAME");
  }
  if (
    normalizedEmail.length > 254 ||
    !EMAIL_PATTERN.test(normalizedEmail)
  ) {
    throw new Error("INVALID_EMAIL");
  }
  if (suggestEmailCorrection(normalizedEmail)) {
    throw new Error("EMAIL_DOMAIN_TYPO");
  }
  if (cleanPassword.length < 12 || cleanPassword.length > 128) {
    throw new Error("WEAK_PASSWORD");
  }

  return { cleanName, normalizedEmail, cleanPassword };
}

/* =========================
   HELPERS
========================= */

async function toAuthUser(user: User): Promise<AuthUser> {
  const entitlements = await getUserCourseEntitlements((user as any).id);
  const participation = await getAllwainParticipationSnapshot((user as any).id);
  return {
    ...toEntitledAuthUser(user, entitlements),
    participation,
  };
}

async function getNextUserId(): Promise<string> {
  return crypto.randomUUID();
}

function generateSponsorCode(): string {
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `NID-${random}`;
}

function dateMs(value: unknown) {
  if (!value) return 0;
  const parsed = new Date(value as any).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function loginLockDurationMs(failedLoginCount: number) {
  if (failedLoginCount < LOGIN_LOCK_THRESHOLD) return 0;
  return Math.min(
    LOGIN_LOCK_MAX_MS,
    LOGIN_LOCK_BASE_MS * 2 ** (failedLoginCount - LOGIN_LOCK_THRESHOLD),
  );
}

async function recordFailedLogin(user: User) {
  const now = new Date();
  const withinWindow =
    dateMs(user.lastFailedLoginAt) > now.getTime() - LOGIN_FAILURE_WINDOW_MS;

  if (ENV.STORAGE_DRIVER === "postgres") {
    const prisma = getPrisma() as any;
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: withinWindow ? { increment: 1 } : 1,
        lastFailedLoginAt: now,
      },
      select: { failedLoginCount: true, lockedUntil: true },
    });
    const durationMs = loginLockDurationMs(updated.failedLoginCount);
    if (durationMs > 0) {
      const lockedUntil = new Date(now.getTime() + durationMs);
      await prisma.user.updateMany({
        where: {
          id: user.id,
          OR: [{ lockedUntil: null }, { lockedUntil: { lt: lockedUntil } }],
        },
        data: { lockedUntil },
      });
    }
    return;
  }

  const failedLoginCount = withinWindow
    ? Number(user.failedLoginCount || 0) + 1
    : 1;
  const durationMs = loginLockDurationMs(failedLoginCount);
  upsertUser({
    ...user,
    failedLoginCount,
    lastFailedLoginAt: now,
    lockedUntil: durationMs > 0 ? new Date(now.getTime() + durationMs) : null,
  });
}

async function recordSuccessfulLogin(user: User) {
  const now = new Date();
  if (ENV.STORAGE_DRIVER === "postgres") {
    await (getPrisma() as any).user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lastFailedLoginAt: null,
        lockedUntil: null,
        lastLoginAt: now,
      },
    });
    return;
  }
  upsertUser({
    ...user,
    failedLoginCount: 0,
    lastFailedLoginAt: null,
    lockedUntil: null,
    lastLoginAt: now,
  });
}

async function validateSponsorCode(
  code?: string,
  sourceApp?: SourceApp,
): Promise<string | undefined> {
  if (!code) return undefined;
  const normalized = code.trim().toUpperCase();

  const sponsor = ENV.STORAGE_DRIVER === "postgres"
    ? await getUserBySponsorCodePg(normalized)
    : getDatabase().users.find((user) => user.sponsorCode === normalized);
  if (!sponsor) throw new Error("INVALID_SPONSOR_CODE");

  if (sourceApp === "allwain") {
    const participation = await getAllwainParticipationSnapshot(sponsor.id);
    if (!participation.connector.enabled) {
      throw new Error("REFERRAL_CONNECTOR_NOT_ACTIVE");
    }
  }

  return String(sponsor.sponsorCode);
}

async function createAuthTokenResponse(
  user: User,
  context: AuthSessionContext = {},
): Promise<AuthTokenResponse> {
  if(context.sourceApp==="newmersive"&&context.noaAccountConsent)await recordNoaAccountConsent(user.id,context.noaAccountConsent);
  await ensureAllwainParticipationProfiles(user);
  const entitlements = await getUserCourseEntitlements((user as any).id);
  const participation = await getAllwainParticipationSnapshot((user as any).id);
  const session = await createRefreshSession(user, context);
  const access = issueAccessToken(user, session.sessionId, session.sourceApp);
  return {
    token: access.token,
    refreshToken: session.refreshToken,
    accessTokenExpiresAt: access.expiresAt.toISOString(),
    refreshTokenExpiresAt: session.expiresAt.toISOString(),
    user: {
      ...toEntitledAuthUser(user, entitlements),
      participation,
    },
    entitlements,
  };
}

/* =========================
   PUBLIC USERS (ADMIN)
========================= */

export async function getPublicUsers(): Promise<AuthUser[]> {
  if (ENV.STORAGE_DRIVER === "postgres") {
    const users = await getUsersPg();
    return Promise.all((users as any[]).map((u) => toAuthUser(u as any)));
  }

  return Promise.all(getDatabase().users.map((u) => toAuthUser(u)));
}

/* =========================
   REGISTER
========================= */

export async function registerUser(
  name: string,
  email: string,
  password: string,
  role: UserRole = "user",
  sponsorCode?: string,
  sourceApp?: SourceApp,
  preferredLocale?: unknown,
  sessionContext: AuthSessionContext = {},
): Promise<AuthTokenResponse> {
  const { cleanName, normalizedEmail, cleanPassword } =
    normalizeRegistrationFields(name, email, password);

  const existing =
    ENV.STORAGE_DRIVER === "postgres"
      ? await getUserByEmailPg(normalizedEmail)
      : getUserByEmail(normalizedEmail);

  if (existing) throw new Error("EMAIL_ALREADY_EXISTS");

  const passwordHash = await bcrypt.hash(cleanPassword, 12);
  const newSponsorCode = generateSponsorCode();
  const referredByCode = await validateSponsorCode(sponsorCode, sourceApp);
  const id = await getNextUserId();

  const user: User = {
    id,
    name: cleanName,
    email: normalizedEmail,
    passwordHash,
    role:
      sourceApp === "allwain"
        ? "buyer"
        : ALLOWED_PUBLIC_ROLES.includes(role)
          ? role
          : "user",
    createdAt: new Date().toISOString(),
    sponsorCode: newSponsorCode,
    referredByCode,
    preferredLocale: normalizePreferredLocale(preferredLocale),
    tokens: sourceApp === "trueqia" ? 100 : 0,
    allwainBalance: 0,
  };

  if (ENV.STORAGE_DRIVER === "postgres") await upsertUserPg(user);
  else upsertUser(user);
  await ensureAllwainParticipationProfiles(user);
  await recordAllwainReferralAttribution(user);

  return createAuthTokenResponse(user, {
    ...sessionContext,
    sourceApp: sessionContext.sourceApp || sourceApp || "allwain",
  });
}

/* =========================
   GOOGLE IDENTITY
========================= */

export async function loginWithGoogle(
  idToken: string,
  sponsorCode?: string,
  sourceApp: SourceApp = "allwain",
  preferredLocale?: unknown,
  sessionContext: AuthSessionContext = {},
): Promise<AuthTokenResponse> {
  if (!idToken || !ENV.GOOGLE_AUTH_CLIENT_IDS.length) {
    throw new Error("GOOGLE_AUTH_NOT_CONFIGURED");
  }
  if(sourceApp==="newmersive"&&!getNoaGoogleClientId())throw new Error("GOOGLE_AUTH_NOT_CONFIGURED");

  let payload;
  try {
    const ticket = await googleOAuthClient.verifyIdToken({
      idToken,
      audience: sourceApp==="newmersive" ? [getNoaGoogleClientId()] : ENV.GOOGLE_AUTH_CLIENT_IDS,
    });
    payload = ticket.getPayload();
  } catch {
    throw new Error("INVALID_GOOGLE_TOKEN");
  }

  const providerSubject = String(payload?.sub || "");
  const normalizedEmail = String(payload?.email || "").trim().toLowerCase();
  if (!providerSubject || !normalizedEmail || payload?.email_verified !== true) {
    throw new Error("UNVERIFIED_GOOGLE_EMAIL");
  }

  let user: any = null;
  if (ENV.STORAGE_DRIVER === "postgres") {
    const prisma = getPrisma() as any;
    const identity = await prisma.authIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider: "google",
          providerSubject,
        },
      },
    });
    if (identity) user = await getUserByIdPg(identity.userId);
  }

  if (!user) {
    user =
      ENV.STORAGE_DRIVER === "postgres"
        ? await getUserByEmailPg(normalizedEmail)
        : getUserByEmail(normalizedEmail);
  }

  if (!user) {
    const referredByCode = await validateSponsorCode(sponsorCode, sourceApp);
    user = {
      id: await getNextUserId(),
      name: String(payload?.name || normalizedEmail.split("@")[0]).trim().slice(0, 120),
      email: normalizedEmail,
      passwordHash: undefined,
      role: sourceApp === "allwain" ? "buyer" : "user",
      createdAt: new Date().toISOString(),
      sponsorCode: generateSponsorCode(),
      referredByCode,
      avatarUrl: payload?.picture || null,
      emailVerifiedAt: new Date(),
      preferredLocale:
        normalizePreferredLocale(preferredLocale) ||
        normalizePreferredLocale(payload?.locale),
      tokens: sourceApp === "trueqia" ? 100 : 0,
      allwainBalance: 0,
    } satisfies User;
    if (ENV.STORAGE_DRIVER === "postgres") await upsertUserPg(user);
    else upsertUser(user);
  }

  if (ENV.STORAGE_DRIVER === "postgres") {
    const prisma = getPrisma() as any;
    await prisma.authIdentity.upsert({
      where: {
        provider_providerSubject: {
          provider: "google",
          providerSubject,
        },
      },
      create: {
        userId: user.id,
        provider: "google",
        providerSubject,
        email: normalizedEmail,
        emailVerified: true,
        profile: {
          name: payload?.name || null,
          picture: payload?.picture || null,
          locale: payload?.locale || null,
        },
      },
      update: {
        email: normalizedEmail,
        emailVerified: true,
        profile: {
          name: payload?.name || null,
          picture: payload?.picture || null,
          locale: payload?.locale || null,
        },
      },
    });
    if (!(user as any).emailVerifiedAt) {
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      });
      user.emailVerifiedAt = new Date();
    }
  }

  await ensureAllwainParticipationProfiles(user);
  await recordAllwainReferralAttribution(user);
  return createAuthTokenResponse(user, {
    ...sessionContext,
    sourceApp: sessionContext.sourceApp || sourceApp,
  });
}

/* =========================
   APPLE IDENTITY
========================= */

export async function loginWithApple(
  idToken: string,
  nonce: string,
  displayName?: string,
  sponsorCode?: string,
  sourceApp: SourceApp = "allwain",
  preferredLocale?: unknown,
  sessionContext: AuthSessionContext = {},
): Promise<AuthTokenResponse> {
  const identity = await verifyAppleIdentity({
    idToken,
    nonce,
    sourceApp: sourceApp === "trueqia" ? "trueqia" : "allwain",
  });

  let user: any = null;
  let storedIdentity: any = null;
  if (ENV.STORAGE_DRIVER === "postgres") {
    const prisma = getPrisma() as any;
    storedIdentity = await prisma.authIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider: "apple",
          providerSubject: identity.subject,
        },
      },
    });
    if (storedIdentity) user = await getUserByIdPg(storedIdentity.userId);
  }

  const verifiedEmail = identity.emailVerified ? identity.email : "";
  if (!user && verifiedEmail) {
    user =
      ENV.STORAGE_DRIVER === "postgres"
        ? await getUserByEmailPg(verifiedEmail)
        : getUserByEmail(verifiedEmail);
  }

  if (!user) {
    if (!verifiedEmail) throw new Error("APPLE_EMAIL_REQUIRED");
    const referredByCode = await validateSponsorCode(sponsorCode, sourceApp);
    const cleanDisplayName = String(displayName || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 120);
    user = {
      id: await getNextUserId(),
      name:
        cleanDisplayName.length >= 2
          ? cleanDisplayName
          : verifiedEmail.split("@")[0] || "Usuario de Apple",
      email: verifiedEmail,
      passwordHash: undefined,
      role: sourceApp === "allwain" ? "buyer" : "user",
      createdAt: new Date().toISOString(),
      sponsorCode: generateSponsorCode(),
      referredByCode,
      preferredLocale: normalizePreferredLocale(preferredLocale),
      emailVerifiedAt: new Date(),
      tokens: sourceApp === "trueqia" ? 100 : 0,
      allwainBalance: 0,
    } satisfies User;
    if (ENV.STORAGE_DRIVER === "postgres") await upsertUserPg(user);
    else upsertUser(user);
  }

  if (ENV.STORAGE_DRIVER === "postgres") {
    const prisma = getPrisma() as any;
    const existingForUser = await prisma.authIdentity.findUnique({
      where: {
        userId_provider: {
          userId: user.id,
          provider: "apple",
        },
      },
    });
    if (
      existingForUser &&
      existingForUser.providerSubject !== identity.subject
    ) {
      throw new Error("AUTH_IDENTITY_CONFLICT");
    }

    const identityEmail = verifiedEmail || storedIdentity?.email || user.email;
    await prisma.authIdentity.upsert({
      where: {
        provider_providerSubject: {
          provider: "apple",
          providerSubject: identity.subject,
        },
      },
      create: {
        userId: user.id,
        provider: "apple",
        providerSubject: identity.subject,
        email: identityEmail,
        emailVerified: identity.emailVerified,
        profile: {
          privateEmail: identity.isPrivateEmail,
          audience: identity.audience,
        },
      },
      update: {
        email: identityEmail,
        emailVerified: identity.emailVerified || storedIdentity?.emailVerified || false,
        profile: {
          privateEmail: identity.isPrivateEmail,
          audience: identity.audience,
        },
      },
    });
    if (identity.emailVerified && !(user as any).emailVerifiedAt) {
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      });
      user.emailVerifiedAt = new Date();
    }
  }

  await ensureAllwainParticipationProfiles(user);
  await recordAllwainReferralAttribution(user);
  return createAuthTokenResponse(user, {
    ...sessionContext,
    sourceApp: sessionContext.sourceApp || sourceApp,
  });
}

/* =========================
   LOGIN
========================= */

export async function loginUser(
  email: string,
  password: string,
  sessionContext: AuthSessionContext = {},
): Promise<AuthTokenResponse> {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail || typeof password !== "string" || !password) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const user =
    ENV.STORAGE_DRIVER === "postgres"
      ? await getUserByEmailPg(normalizedEmail)
      : getUserByEmail(normalizedEmail);

  const passwordHash = user?.passwordHash || INVALID_LOGIN_PASSWORD_HASH;
  const match = await bcrypt.compare(password, passwordHash);
  if (
    !user ||
    (user as any).deletedAt ||
    ![undefined, null, "active"].includes((user as any).status) ||
    !user.passwordHash
  ) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const locked = dateMs(user.lockedUntil) > Date.now();
  if (!match) {
    if (!locked) await recordFailedLogin(user as any);
    throw new Error("INVALID_CREDENTIALS");
  }
  if (locked) throw new Error("INVALID_CREDENTIALS");

  await recordSuccessfulLogin(user as any);
  const currentUser = ENV.STORAGE_DRIVER === "postgres"
    ? await getUserByIdPg(user.id)
    : getUserById(user.id);
  if (!currentUser) throw new Error("INVALID_CREDENTIALS");
  return createAuthTokenResponse(currentUser as any, sessionContext);
}

export async function refreshAuthSession(
  refreshToken: string,
  sessionContext: AuthSessionContext = {},
): Promise<AuthTokenResponse> {
  const rotated = await rotateRefreshSession(refreshToken, sessionContext);
  await ensureAllwainParticipationProfiles(rotated.user);
  const entitlements = await getUserCourseEntitlements(rotated.user.id);
  const participation = await getAllwainParticipationSnapshot(rotated.user.id);
  const access = issueAccessToken(
    rotated.user,
    rotated.sessionId,
    rotated.sourceApp,
  );
  return {
    token: access.token,
    refreshToken: rotated.refreshToken,
    accessTokenExpiresAt: access.expiresAt.toISOString(),
    refreshTokenExpiresAt: rotated.expiresAt.toISOString(),
    user: {
      ...toEntitledAuthUser(rotated.user, entitlements),
      participation,
    },
    entitlements,
  };
}

export async function logoutAuthSession(userId: string, sessionId: string) {
  await revokeSession(userId, sessionId, "logout");
}

export async function logoutAllAuthSessions(userId: string) {
  const now = new Date();
  if (ENV.STORAGE_DRIVER === "postgres") {
    await (getPrisma() as any).$transaction(async (tx: any) => {
      await tx.user.update({
        where: { id: userId },
        data: { tokenVersion: { increment: 1 } },
      });
      await tx.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now, revokeReason: "logout_all" },
      });
    });
    return;
  }
  const user = getUserById(userId);
  if (user) upsertUser({ ...user, tokenVersion: Number(user.tokenVersion || 0) + 1 });
  await revokeAllMemorySessions(userId, "logout_all");
}

export async function getAuthSessions(userId: string, currentSessionId: string) {
  return listUserSessions(userId, currentSessionId);
}

export async function revokeAuthSession(
  userId: string,
  currentSessionId: string,
  targetSessionId: string,
) {
  if (!targetSessionId) throw new Error("SESSION_NOT_FOUND");
  if (ENV.STORAGE_DRIVER === "postgres") {
    const target = await (getPrisma() as any).authSession.findFirst({
      where: { id: targetSessionId, userId, revokedAt: null },
      select: { id: true },
    });
    if (!target) throw new Error("SESSION_NOT_FOUND");
  } else {
    const sessions = await listUserSessions(userId, currentSessionId);
    if (!sessions.some((item) => item.id === targetSessionId)) {
      throw new Error("SESSION_NOT_FOUND");
    }
  }
  await revokeSession(userId, targetSessionId, "user_revoked");
  return { currentRevoked: currentSessionId === targetSessionId };
}

/* =========================
   PROFILE
========================= */

export async function getUserProfile(userId: string): Promise<AuthUser | null> {
  const user =
    ENV.STORAGE_DRIVER === "postgres"
      ? await getUserByIdPg(userId)
      : getUserById(userId);

  return user ? toAuthUser(user as any) : null;
}

export const ANALYTICS_CONSENT_VERSION = "allwain-analytics-v1-2026-09-06";

export async function updateUserPreferences(
  userId: string,
  input: { locale?: unknown; analyticsConsent?: unknown },
): Promise<AuthUser> {
  const hasLocale = input.locale !== undefined;
  const hasAnalyticsConsent = input.analyticsConsent !== undefined;
  if (!hasLocale && !hasAnalyticsConsent) throw new Error("EMPTY_PREFERENCES");

  const preferredLocale = hasLocale
    ? normalizePreferredLocale(input.locale)
    : null;
  if (hasLocale && !preferredLocale) throw new Error("UNSUPPORTED_LOCALE");
  if (hasAnalyticsConsent && typeof input.analyticsConsent !== "boolean") {
    throw new Error("INVALID_ANALYTICS_CONSENT");
  }

  const analyticsConsent = hasAnalyticsConsent
    ? (input.analyticsConsent as boolean)
    : undefined;
  const analyticsConsentUpdatedAt = hasAnalyticsConsent ? new Date() : undefined;

  if (ENV.STORAGE_DRIVER === "postgres") {
    const prisma = getPrisma();
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new Error("USER_NOT_FOUND");

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          ...(preferredLocale ? { preferredLocale } : {}),
          ...(analyticsConsent !== undefined
            ? {
                analyticsConsent,
                analyticsConsentVersion: ANALYTICS_CONSENT_VERSION,
                analyticsConsentUpdatedAt,
              }
            : {}),
        },
      });

      if (
        analyticsConsent !== undefined &&
        (existing.analyticsConsent !== analyticsConsent ||
          existing.analyticsConsentVersion !== ANALYTICS_CONSENT_VERSION)
      ) {
        const evidence = {
          application: "allwain",
          consentMode: "basic",
          purpose: "product_analytics",
          action: analyticsConsent ? "granted" : "denied_or_withdrawn",
          occurredAt: analyticsConsentUpdatedAt?.toISOString(),
        };
        await tx.allwainConsentEvidence.create({
          data: {
            userId,
            consentType: "product_analytics",
            documentVersion: ANALYTICS_CONSENT_VERSION,
            granted: analyticsConsent,
            evidence,
            evidenceHash: crypto
              .createHash("sha256")
              .update(JSON.stringify(evidence))
              .digest("hex"),
          },
        });
      }
    });
  } else {
    const user = getUserById(userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    upsertUser({
      ...user,
      ...(preferredLocale ? { preferredLocale } : {}),
      ...(analyticsConsent !== undefined
        ? {
            analyticsConsent,
            analyticsConsentVersion: ANALYTICS_CONSENT_VERSION,
            analyticsConsentUpdatedAt: analyticsConsentUpdatedAt?.toISOString(),
          }
        : {}),
    });
  }

  const updated = await getUserProfile(userId);
  if (!updated) throw new Error("USER_NOT_FOUND");
  return updated;
}

/* =========================
   PASSWORD RESET
========================= */

export async function requestPasswordReset(email: string) {
  const normalized = email.toLowerCase();

  const user =
    ENV.STORAGE_DRIVER === "postgres"
      ? await getUserByEmailPg(normalized)
      : getUserByEmail(normalized);

  if (!user) return;

  const token = crypto.randomBytes(32).toString("hex");
  const storedToken = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = Date.now() + 60 * 60 * 1000;

  if (ENV.STORAGE_DRIVER === "postgres") {
    await savePasswordResetTokenPg(storedToken, (user as any).id, expiresAt);
  } else {
    savePasswordResetToken(storedToken, (user as any).id, expiresAt);
  }

  return token;
}

export async function resetPassword(token: string, newPassword: string) {
  if (
    !token ||
    typeof newPassword !== "string" ||
    newPassword.length < 12 ||
    newPassword.length > 128
  ) {
    throw new Error("INVALID_RESET");
  }
  const storedToken = crypto.createHash("sha256").update(token).digest("hex");
  const record =
    ENV.STORAGE_DRIVER === "postgres"
      ? await getPasswordResetTokenPg(storedToken)
      : getPasswordResetToken(storedToken);

  if (!record || Number((record as any).expiresAt) <= Date.now()) throw new Error("INVALID_TOKEN");
  const passwordHash = await bcrypt.hash(newPassword, 12);
  if (ENV.STORAGE_DRIVER === "postgres") {
    const prisma = getPrisma() as any;
    const changed = await prisma.$transaction(async (tx: any) => {
      const claimed = await tx.passwordResetToken.deleteMany({
        where: {
          token: storedToken,
          userId: (record as any).userId,
          expiresAt: { gt: BigInt(Date.now()) },
        },
      });
      if (claimed.count !== 1) return false;
      const user = await tx.user.findFirst({
        where: { id: (record as any).userId, deletedAt: null, status: "active" },
        select: { id: true },
      });
      if (!user) return false;
      const now = new Date();
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          passwordChangedAt: now,
          tokenVersion: { increment: 1 },
          failedLoginCount: 0,
          lastFailedLoginAt: null,
          lockedUntil: null,
        },
      });
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
      await tx.authSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now, revokeReason: "password_reset" },
      });
      return true;
    });
    if (!changed) throw new Error("INVALID_TOKEN");
    return;
  }

  const user = getUserById((record as any).userId);
  if (!user) throw new Error("USER_NOT_FOUND");
  upsertUser({
    ...user,
    passwordHash,
    passwordChangedAt: new Date(),
    tokenVersion: Number(user.tokenVersion || 0) + 1,
    failedLoginCount: 0,
    lastFailedLoginAt: null,
    lockedUntil: null,
  });
  deletePasswordResetTokensForUser(user.id);
  await revokeAllMemorySessions(user.id, "password_reset");
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  if (
    !currentPassword ||
    typeof newPassword !== "string" ||
    newPassword.length < 12 ||
    newPassword.length > 128
  ) {
    throw new Error("INVALID_PASSWORD_CHANGE");
  }
  const user = ENV.STORAGE_DRIVER === "postgres"
    ? await getUserByIdPg(userId)
    : getUserById(userId);
  if (!user?.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new Error("INVALID_CREDENTIALS");
  }
  if (await bcrypt.compare(newPassword, user.passwordHash)) {
    throw new Error("PASSWORD_REUSE");
  }
  const previousHash = user.passwordHash;
  const passwordHash = await bcrypt.hash(newPassword, 12);
  const now = new Date();
  if (ENV.STORAGE_DRIVER === "postgres") {
    const changed = await (getPrisma() as any).$transaction(async (tx: any) => {
      const updated = await tx.user.updateMany({
        where: {
          id: userId,
          passwordHash: previousHash,
          deletedAt: null,
          status: "active",
        },
        data: {
          passwordHash,
          passwordChangedAt: now,
          tokenVersion: { increment: 1 },
          failedLoginCount: 0,
          lastFailedLoginAt: null,
          lockedUntil: null,
        },
      });
      if (updated.count !== 1) return false;
      await tx.passwordResetToken.deleteMany({ where: { userId } });
      await tx.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now, revokeReason: "password_change" },
      });
      return true;
    });
    if (!changed) throw new Error("PASSWORD_CHANGE_CONFLICT");
    return;
  }
  upsertUser({
    ...user,
    passwordHash,
    passwordChangedAt: now,
    tokenVersion: Number(user.tokenVersion || 0) + 1,
    failedLoginCount: 0,
    lastFailedLoginAt: null,
    lockedUntil: null,
  } as User);
  deletePasswordResetTokensForUser(userId);
  await revokeAllMemorySessions(userId, "password_change");
}
