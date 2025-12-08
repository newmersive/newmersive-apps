import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { ENV } from "../config/env";
import { AuthTokenResponse, AuthUser, User, UserRole } from "../shared/types";
import {
  getDatabase,
  getUserByEmail,
  getUserById,
  upsertUser,
} from "./data.store";

let userIdCounter = computeNextUserId();
const passwordResetTokens = new Map<string, string>();

/**
 * Registro
 */
export async function registerUser(
  name: string,
  email: string,
  password: string,
  role: UserRole = "user",
  sponsorCode?: string,
  appModes?: string[]
): Promise<AuthTokenResponse> {
  const normalizedEmail = email.toLowerCase();
  const existing = getUserByEmail(normalizedEmail);
  if (existing) throw new Error("EMAIL_ALREADY_EXISTS");

  const passwordHash = await bcrypt.hash(password, 10);
  const newSponsorCode = generateSponsorCode();
  const referredByCode = validateSponsorCode(sponsorCode);
  const normalizedModes = appModes?.map((mode) => mode.toLowerCase());
  const initialTokens = normalizedModes?.includes("trueqia") ? 100 : 0;

  const user: User = {
    id: String(userIdCounter++),
    name,
    email: normalizedEmail,
    passwordHash,
    role,
    createdAt: new Date().toISOString(),
    tokens: initialTokens,
    allwainBalance: 0,
    sponsorCode: newSponsorCode,
    referredByCode,
    appMode: appModes,
  };

  upsertUser(user);
  return createAuthTokenResponse(user);
}

/**
 * Login
 */
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

/**
 * Perfil
 */
export function getUserProfile(userId: string): AuthUser | null {
  const user = getUserById(userId);
  if (!user) return null;

  const { passwordHash, ...publicUser } = user;
  return publicUser;
}

export function getPublicUsers(): AuthUser[] {
  return getDatabase().users.map(({ passwordHash, ...user }) => user);
}

/**
 * Forgot password
 */
export async function requestPasswordReset(email: string) {
  const user = getUserByEmail(email.toLowerCase());
  if (!user) return;

  const token = crypto.randomBytes(20).toString("hex");
  passwordResetTokens.set(token, user.email);
}

export async function resetPassword(token: string, newPassword: string) {
  const email = passwordResetTokens.get(token);
  if (!email) throw new Error("INVALID_TOKEN");

  const user = getUserByEmail(email);
  if (!user) throw new Error("USER_NOT_FOUND");

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  upsertUser(user);
  passwordResetTokens.delete(token);
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
  const user = getDatabase().users.find((u) => u.sponsorCode === normalized);
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

  const publicUser: AuthUser = {
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

  return { token, user: publicUser };
}
