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
import {
  getDatabase,
  getUserByEmail,
  getUserById,
  upsertUser,
  savePasswordResetToken,
  getPasswordResetToken,
  deletePasswordResetToken,
} from "./data.store";

const ALLOWED_ROLES: UserRole[] = ["user", "buyer", "company", "admin"];

type SourceApp = "trueqia" | "allwain";

let userIdCounter = computeNextUserId();

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

function computeNextUserId(): number {
  const users = getDatabase().users;
  const maxId = users.reduce((max, user) => {
    const numericId = Number(user.id);
    return Number.isFinite(numericId) && numericId > max ? numericId : max;
  }, 0);
  return maxId + 1;
}

function generateSponsorCode(): string {
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `SPN-${random}`;
}

function validateSponsorCode(code?: string): string | undefined {
  if (!code) return undefined;
  const normalized = code.trim();
  const user = getDatabase().users.find(
    (u) => u.sponsorCode === normalized
  );
  return user ? normalized : undefined;
}

function createAuthTokenResponse(user: User): AuthTokenResponse {
  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
    },
    ENV.JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );

  return { token, user: toAuthUser(user) };
}

/* =========================
   REGISTRO
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
  const existing = getUserByEmail(normalizedEmail);
  if (existing) throw new Error("EMAIL_ALREADY_EXISTS");

  const safeRole = ALLOWED_ROLES.includes(role) ? role : "user";

  const passwordHash = await bcrypt.hash(password, 10);
  const newSponsorCode = generateSponsorCode();
  const referredByCode = validateSponsorCode(sponsorCode);

  const initialTokens = sourceApp === "trueqia" ? 100 : 0;

  const user: User = {
    id: String(userIdCounter++),
    name,
    email: normalizedEmail,
    passwordHash,
    role: safeRole,
    createdAt: new Date().toISOString(),
    sponsorCode: newSponsorCode,
    referredByCode,
    tokens: initialTokens,
    allwainBalance: 0,
  };

  upsertUser(user);
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
  const user = getUserByEmail(normalizedEmail);
  if (!user) throw new Error("INVALID_CREDENTIALS");

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) throw new Error("INVALID_CREDENTIALS");

  return createAuthTokenResponse(user);
}

/* =========================
   PERFIL
========================= */

export function getUserProfile(userId: string): AuthUser | null {
  const user = getUserById(userId);
  if (!user) return null;
  return toAuthUser(user);
}

export function getPublicUsers(): AuthUser[] {
  return getDatabase().users.map(toAuthUser);
}

/* =========================
   FORGOT / RESET PASSWORD
========================= */

export async function requestPasswordReset(email: string) {
  const user = getUserByEmail(email.toLowerCase());
  if (!user) return;

  const token = crypto.randomBytes(20).toString("hex");
  const expiresAt = Date.now() + 60 * 60 * 1000; // 1h

  savePasswordResetToken(token, user.id, expiresAt);
  // En modo demo, el controlador puede devolver este token.
  return token;
}

export async function resetPassword(token: string, newPassword: string) {
  const record = getPasswordResetToken(token);
  if (!record) throw new Error("INVALID_TOKEN");

  const user = getUserById(record.userId);
  if (!user) {
    deletePasswordResetToken(token);
    throw new Error("USER_NOT_FOUND");
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  upsertUser(user);
  deletePasswordResetToken(token);
}
