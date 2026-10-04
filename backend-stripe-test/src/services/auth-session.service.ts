import crypto from "crypto";
import jwt from "jsonwebtoken";

import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";
import { User, UserRole } from "../shared/types";
import { getUserById } from "./data.store";

export type AuthSourceApp = "allwain" | "trueqia" | "admin" | "course" | "newmersive";

export type AuthSessionContext = {
  sourceApp?: AuthSourceApp;
  ip?: string | null;
  userAgent?: string | null;
  noaAccountConsent?: {version:string;locale:string};
};

export type ResolvedAuthIdentity = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  sessionId: string;
  sourceApp: AuthSourceApp;
  tokenVersion: number;
};

type SessionRow = {
  id: string;
  userId: string;
  familyId: string;
  refreshTokenHash: string;
  sourceApp: AuthSourceApp;
  userAgentHash: string | null;
  ipHash: string | null;
  tokenVersion: number;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokeReason: string | null;
  rotatedFromId: string | null;
};

type AccessPayload = jwt.JwtPayload & {
  tokenUse?: string;
  sid?: string;
  ver?: number;
  sourceApp?: AuthSourceApp;
};

const ACCESS_TOKEN_ISSUER = "newmersive-auth";
const ACCESS_TOKEN_AUDIENCE = "newmersive-api";
const DEFAULT_ACCESS_TTL_SECONDS = 15 * 60;
const COURSE_ACCESS_TTL_SECONDS = 8 * 60 * 60;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const memorySessionsByHash = new Map<string, SessionRow>();
const memorySessionsById = new Map<string, SessionRow>();

function activeUser(user: any): user is User {
  return Boolean(
    user &&
      !user.deletedAt &&
      [undefined, null, "active"].includes(user.status),
  );
}

function hashRefreshToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function hashContext(kind: "ip" | "ua", value?: string | null) {
  const normalized = String(value || "").trim().slice(0, kind === "ip" ? 128 : 1_000);
  if (!normalized) return null;
  return crypto
    .createHmac("sha256", ENV.COURSE_IP_HASH_SECRET)
    .update(`auth-session:${kind}:${normalized}`)
    .digest("hex");
}

function sourceApp(value: unknown): AuthSourceApp {
  return value === "trueqia" || value === "admin" || value === "course" || value === "newmersive"
    ? value
    : "allwain";
}

function tokenVersion(user: any) {
  const value = Number(user?.tokenVersion || 0);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function accessTtlSeconds(app: AuthSourceApp) {
  return app === "course" ? COURSE_ACCESS_TTL_SECONDS : DEFAULT_ACCESS_TTL_SECONDS;
}

function generateRefreshToken() {
  return crypto.randomBytes(64).toString("base64url");
}

export function normalizeAuthSourceApp(value: unknown): AuthSourceApp {
  return sourceApp(value);
}

export function issueAccessToken(
  user: User,
  sessionId: string,
  appValue: AuthSourceApp,
) {
  const ttlSeconds = accessTtlSeconds(appValue);
  const issuedAt = Date.now();
  const token = jwt.sign(
    {
      tokenUse: "access",
      sid: sessionId,
      ver: tokenVersion(user),
      sourceApp: appValue,
      email: user.email,
      role: user.role,
    },
    ENV.JWT_SECRET,
    {
      algorithm: "HS512",
      audience: ACCESS_TOKEN_AUDIENCE,
      issuer: ACCESS_TOKEN_ISSUER,
      subject: user.id,
      jwtid: crypto.randomUUID(),
      expiresIn: ttlSeconds,
    },
  );
  return {
    token,
    expiresAt: new Date(issuedAt + ttlSeconds * 1_000),
  };
}

export async function createRefreshSession(
  user: User,
  context: AuthSessionContext = {},
) {
  const now = new Date();
  const id = crypto.randomUUID();
  const refreshToken = generateRefreshToken();
  const appValue = sourceApp(context.sourceApp);
  const row: SessionRow = {
    id,
    userId: user.id,
    familyId: id,
    refreshTokenHash: hashRefreshToken(refreshToken),
    sourceApp: appValue,
    userAgentHash: hashContext("ua", context.userAgent),
    ipHash: hashContext("ip", context.ip),
    tokenVersion: tokenVersion(user),
    createdAt: now,
    lastUsedAt: now,
    expiresAt: new Date(now.getTime() + REFRESH_TTL_MS),
    revokedAt: null,
    revokeReason: null,
    rotatedFromId: null,
  };

  if (ENV.STORAGE_DRIVER === "postgres") {
    await (getPrisma() as any).authSession.create({ data: row });
    if (crypto.randomInt(100) === 0) {
      const retentionBoundary = new Date(Date.now() - 90 * 24 * 60 * 60 * 1_000);
      await (getPrisma() as any).authSession.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: retentionBoundary } },
            { revokedAt: { lt: retentionBoundary } },
          ],
        },
      });
    }
  } else {
    memorySessionsByHash.set(row.refreshTokenHash, row);
    memorySessionsById.set(row.id, row);
  }

  return {
    sessionId: row.id,
    refreshToken,
    sourceApp: row.sourceApp,
    expiresAt: row.expiresAt,
  };
}

async function resolveUser(userId: string) {
  if (ENV.STORAGE_DRIVER === "postgres") {
    return (getPrisma() as any).user.findUnique({ where: { id: userId } });
  }
  return getUserById(userId) as any;
}

export async function resolveAccessToken(token: string): Promise<ResolvedAuthIdentity> {
  const payload = jwt.verify(token, ENV.JWT_SECRET, {
    algorithms: ["HS512"],
    audience: ACCESS_TOKEN_AUDIENCE,
    issuer: ACCESS_TOKEN_ISSUER,
    clockTolerance: 5,
  }) as AccessPayload;

  if (
    payload.tokenUse !== "access" ||
    typeof payload.sub !== "string" ||
    typeof payload.sid !== "string" ||
    !Number.isInteger(payload.ver) ||
    !["allwain", "trueqia", "admin", "course", "newmersive"].includes(String(payload.sourceApp))
  ) {
    throw new Error("INVALID_ACCESS_TOKEN");
  }

  const now = new Date();
  let session: any;
  if (ENV.STORAGE_DRIVER === "postgres") {
    session = await (getPrisma() as any).authSession.findUnique({
      where: { id: payload.sid },
    });
  } else {
    session = memorySessionsById.get(payload.sid);
  }

  if (
    !session ||
    session.userId !== payload.sub ||
    session.revokedAt ||
    new Date(session.expiresAt).getTime() <= now.getTime() ||
    Number(session.tokenVersion) !== Number(payload.ver)
  ) {
    throw new Error("SESSION_REVOKED_OR_EXPIRED");
  }

  const user: any = await resolveUser(payload.sub);
  if (!activeUser(user) || tokenVersion(user) !== Number(payload.ver)) {
    throw new Error("USER_DISABLED_OR_SESSION_REVOKED");
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt:
      (user as any).createdAt instanceof Date
        ? (user as any).createdAt.toISOString()
        : String((user as any).createdAt),
    sessionId: session.id,
    sourceApp: sourceApp(session.sourceApp),
    tokenVersion: tokenVersion(user),
  };
}

async function rotatePostgresRefreshSession(
  refreshTokenHash: string,
  nextRefreshTokenHash: string,
  context: AuthSessionContext,
) {
  const prisma = getPrisma() as any;
  return prisma.$transaction(async (tx: any) => {
    const now = new Date();
    const current = await tx.authSession.findUnique({
      where: { refreshTokenHash },
    });
    if (!current) return { error: "INVALID_REFRESH_TOKEN" };

    if (current.revokedAt) {
      if (current.revokeReason === "rotated") {
        await tx.authSession.updateMany({
          where: { familyId: current.familyId, revokedAt: null },
          data: { revokedAt: now, revokeReason: "refresh_reuse_detected" },
        });
        return { error: "REFRESH_TOKEN_REUSED" };
      }
      return { error: "REFRESH_TOKEN_REVOKED" };
    }
    if (new Date(current.expiresAt).getTime() <= now.getTime()) {
      await tx.authSession.update({
        where: { id: current.id },
        data: { revokedAt: now, revokeReason: "expired" },
      });
      return { error: "REFRESH_TOKEN_EXPIRED" };
    }

    const user = await tx.user.findUnique({ where: { id: current.userId } });
    if (!activeUser(user) || tokenVersion(user) !== Number(current.tokenVersion)) {
      await tx.authSession.updateMany({
        where: { familyId: current.familyId, revokedAt: null },
        data: { revokedAt: now, revokeReason: "user_or_version_invalid" },
      });
      return { error: "REFRESH_TOKEN_REVOKED" };
    }

    const claimed = await tx.authSession.updateMany({
      where: { id: current.id, revokedAt: null },
      data: { revokedAt: now, revokeReason: "rotated", lastUsedAt: now },
    });
    if (claimed.count !== 1) {
      await tx.authSession.updateMany({
        where: { familyId: current.familyId, revokedAt: null },
        data: { revokedAt: now, revokeReason: "refresh_reuse_detected" },
      });
      return { error: "REFRESH_TOKEN_REUSED" };
    }

    const next = await tx.authSession.create({
      data: {
        userId: current.userId,
        familyId: current.familyId,
        refreshTokenHash: nextRefreshTokenHash,
        sourceApp: current.sourceApp,
        userAgentHash: hashContext("ua", context.userAgent) || current.userAgentHash,
        ipHash: hashContext("ip", context.ip) || current.ipHash,
        tokenVersion: current.tokenVersion,
        expiresAt: current.expiresAt,
        rotatedFromId: current.id,
      },
    });
    return { user, session: next };
  });
}

function rotateMemoryRefreshSession(
  refreshTokenHash: string,
  nextRefreshTokenHash: string,
  context: AuthSessionContext,
) {
  const now = new Date();
  const current = memorySessionsByHash.get(refreshTokenHash);
  if (!current) return { error: "INVALID_REFRESH_TOKEN" } as const;
  if (current.revokedAt) {
    if (current.revokeReason === "rotated") {
      for (const session of memorySessionsById.values()) {
        if (session.familyId === current.familyId && !session.revokedAt) {
          session.revokedAt = now;
          session.revokeReason = "refresh_reuse_detected";
        }
      }
      return { error: "REFRESH_TOKEN_REUSED" } as const;
    }
    return { error: "REFRESH_TOKEN_REVOKED" } as const;
  }
  if (current.expiresAt.getTime() <= now.getTime()) {
    current.revokedAt = now;
    current.revokeReason = "expired";
    return { error: "REFRESH_TOKEN_EXPIRED" } as const;
  }
  const user: any = getUserById(current.userId);
  if (!activeUser(user) || tokenVersion(user) !== current.tokenVersion) {
    current.revokedAt = now;
    current.revokeReason = "user_or_version_invalid";
    return { error: "REFRESH_TOKEN_REVOKED" } as const;
  }

  current.revokedAt = now;
  current.revokeReason = "rotated";
  current.lastUsedAt = now;
  const next: SessionRow = {
    ...current,
    id: crypto.randomUUID(),
    refreshTokenHash: nextRefreshTokenHash,
    userAgentHash: hashContext("ua", context.userAgent) || current.userAgentHash,
    ipHash: hashContext("ip", context.ip) || current.ipHash,
    createdAt: now,
    lastUsedAt: now,
    revokedAt: null,
    revokeReason: null,
    rotatedFromId: current.id,
  };
  memorySessionsByHash.set(next.refreshTokenHash, next);
  memorySessionsById.set(next.id, next);
  return { user, session: next };
}

export async function rotateRefreshSession(
  refreshToken: string,
  context: AuthSessionContext = {},
) {
  if (typeof refreshToken !== "string" || refreshToken.length < 64 || refreshToken.length > 512) {
    throw new Error("INVALID_REFRESH_TOKEN");
  }
  const currentHash = hashRefreshToken(refreshToken);
  const nextRefreshToken = generateRefreshToken();
  const nextHash = hashRefreshToken(nextRefreshToken);
  const outcome = ENV.STORAGE_DRIVER === "postgres"
    ? await rotatePostgresRefreshSession(currentHash, nextHash, context)
    : rotateMemoryRefreshSession(currentHash, nextHash, context);

  if ((outcome as any).error) throw new Error((outcome as any).error);
  const user = (outcome as any).user as User;
  const session = (outcome as any).session as SessionRow;
  return {
    user,
    sessionId: session.id,
    refreshToken: nextRefreshToken,
    sourceApp: sourceApp(session.sourceApp),
    expiresAt: new Date(session.expiresAt),
  };
}

export async function revokeSession(
  userId: string,
  sessionId: string,
  reason = "logout",
) {
  const now = new Date();
  if (ENV.STORAGE_DRIVER === "postgres") {
    await (getPrisma() as any).authSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: now, revokeReason: reason.slice(0, 80) },
    });
    return;
  }
  const session = memorySessionsById.get(sessionId);
  if (session?.userId === userId && !session.revokedAt) {
    session.revokedAt = now;
    session.revokeReason = reason.slice(0, 80);
  }
}

export async function revokeAllMemorySessions(userId: string, reason: string) {
  const now = new Date();
  for (const session of memorySessionsById.values()) {
    if (session.userId === userId && !session.revokedAt) {
      session.revokedAt = now;
      session.revokeReason = reason.slice(0, 80);
    }
  }
}

export async function listUserSessions(userId: string, currentSessionId: string) {
  const now = new Date();
  const rows: SessionRow[] = ENV.STORAGE_DRIVER === "postgres"
    ? await (getPrisma() as any).authSession.findMany({
        where: { userId, revokedAt: null, expiresAt: { gt: now } },
        orderBy: { lastUsedAt: "desc" },
        take: 50,
      })
    : [...memorySessionsById.values()]
        .filter((item) => item.userId === userId && !item.revokedAt && item.expiresAt > now)
        .sort((a, b) => b.lastUsedAt.getTime() - a.lastUsedAt.getTime())
        .slice(0, 50);

  return rows.map((item) => ({
    id: item.id,
    sourceApp: sourceApp(item.sourceApp),
    current: item.id === currentSessionId,
    createdAt: new Date(item.createdAt).toISOString(),
    lastUsedAt: new Date(item.lastUsedAt).toISOString(),
    expiresAt: new Date(item.expiresAt).toISOString(),
  }));
}

export const AUTH_REFRESH_COOKIE = "newmersive_refresh";
export const AUTH_REFRESH_MAX_AGE_MS = REFRESH_TTL_MS;
