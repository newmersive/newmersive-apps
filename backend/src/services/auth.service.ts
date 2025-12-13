import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { ENV } from "../config/env";
import {
  AuthTokenResponse,
  AuthUser,
  User,
  UserRole,
} from "../shared/types";

// JSON driver
import {
  getDatabase,
  getUserByEmail,
  getUserById,
  upsertUser,
  savePasswordResetToken,
  getPasswordResetToken,
  deletePasswordResetToken,
} from "./data.store";

// Postgres driver
import {
  getUsersPg,
  getUserByEmailPg,
  getUserByIdPg,
  upsertUserPg,
  savePasswordResetTokenPg,
  getPasswordResetTokenPg,
  deletePasswordResetTokenPg,
} from "./data.store.pg";

const ALLOWED_ROLES: UserRole[] = ["user", "buyer", "company", "admin"];
type SourceApp = "trueqia" | "allwain";

/* =========================
   HELPERS
========================= */

function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    sponsorCode: user.sponsorCode,
    referredByCode: user.referredByCode,
    avatarUrl: user.avatarUrl,
    tokens: user.tokens,
    allwainBalance: user.allwainBalance,
  };
}

async function getNextUserId(): Promise<string> {
  if (ENV.STORAGE_DRIVER === "postgres") {
    const users = await getUsersPg();
    const max = users.reduce((m, u) => Math.max(m, Number(u.id) || 0), 0);
    return String(max + 1);
  }

  const users = getDatabase().users;
  const max = users.reduce((m, u) => Math.max(m, Number(u.id) || 0), 0);
  return String(max + 1);
}

function generateSponsorCode(): string {
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `SPN-${random}`;
}

async function validateSponsorCode(code?: string): Promise<string | undefined> {
  if (!code) return undefined;
  const normalized = code.trim();

  if (ENV.STORAGE_DRIVER === "postgres") {
    const users = await getUsersPg();
    return users.find(u => u.sponsorCode === normalized) ? normalized : undefined;
  }

  const user = getDatabase().users.find(u => u.sponsorCode === normalized);
  return user ? normalized : undefined;
}

function createAuthTokenResponse(user: User): AuthTokenResponse {
  const token = jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    ENV.JWT_SECRET,
    { expiresIn: "7d" }
  );
  return { token, user: toAuthUser(user) };
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
  sourceApp?: SourceApp
): Promise<AuthTokenResponse> {
  const normalizedEmail = email.toLowerCase();

  const existing =
    ENV.STORAGE_DRIVER === "postgres"
      ? await getUserByEmailPg(normalizedEmail)
      : getUserByEmail(normalizedEmail);

  if (existing) throw new Error("EMAIL_ALREADY_EXISTS");

  const passwordHash = await bcrypt.hash(password, 10);
  const newSponsorCode = generateSponsorCode();
  const referredByCode = await validateSponsorCode(sponsorCode);
  const id = await getNextUserId();

  const user: User = {
    id,
    name,
    email: normalizedEmail,
    passwordHash,
    role: ALLOWED_ROLES.includes(role) ? role : "user",
    createdAt: new Date().toISOString(),
    sponsorCode: newSponsorCode,
    referredByCode,
    tokens: sourceApp === "trueqia" ? 100 : 0,
    allwainBalance: 0,
  };

  ENV.STORAGE_DRIVER === "postgres"
    ? await upsertUserPg(user)
    : upsertUser(user);

  return createAuthTokenResponse(user);
}

/* =========================
   LOGIN
========================= */

export async function loginUser(
  email: string,
  password: string
): Promise<AuthTokenResponse> {
  const normalizedEmail = email.toLowerCase();

  const user =
    ENV.STORAGE_DRIVER === "postgres"
      ? await getUserByEmailPg(normalizedEmail)
      : getUserByEmail(normalizedEmail);

  if (!user) throw new Error("INVALID_CREDENTIALS");

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) throw new Error("INVALID_CREDENTIALS");

  return createAuthTokenResponse(user);
}

/* =========================
   PROFILE
========================= */

export async function getUserProfile(userId: string): Promise<AuthUser | null> {
  const user =
    ENV.STORAGE_DRIVER === "postgres"
      ? await getUserByIdPg(userId)
      : getUserById(userId);

  return user ? toAuthUser(user) : null;
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

  const token = crypto.randomBytes(20).toString("hex");
  const expiresAt = Date.now() + 60 * 60 * 1000;

  ENV.STORAGE_DRIVER === "postgres"
    ? await savePasswordResetTokenPg(token, user.id, expiresAt)
    : savePasswordResetToken(token, user.id, expiresAt);

  return token;
}

export async function resetPassword(token: string, newPassword: string) {
  const record =
    ENV.STORAGE_DRIVER === "postgres"
      ? await getPasswordResetTokenPg(token)
      : getPasswordResetToken(token);

  if (!record) throw new Error("INVALID_TOKEN");

  const user =
    ENV.STORAGE_DRIVER === "postgres"
      ? await getUserByIdPg(record.userId)
      : getUserById(record.userId);

  if (!user) throw new Error("USER_NOT_FOUND");

  user.passwordHash = await bcrypt.hash(newPassword, 10);

  ENV.STORAGE_DRIVER === "postgres"
    ? await upsertUserPg(user)
    : upsertUser(user);
  ENV.STORAGE_DRIVER === "postgres"
    ? await deletePasswordResetTokenPg(token)
    : deletePasswordResetToken(token);
}

