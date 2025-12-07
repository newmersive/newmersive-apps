import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { ENV } from "../config/env";
import { AuthTokenResponse, AuthUser, User, UserRole } from "../shared/types";
import {
  deletePasswordResetToken,
  getDatabase,
  getPasswordResetToken,
  savePasswordResetToken,
  upsertUser,
} from "./data.store";

let userIdCounter = computeNextUserId();

/**
 * Registro
 */
export async function registerUser(
  name: string,
  email: string,
  password: string,
  role: UserRole = "user",
  sponsorCode?: string
): Promise<AuthTokenResponse> {
  const normalizedEmail = email.toLowerCase();
  const existing = getUserByEmail(normalizedEmail);
  if (existing) throw new Error("EMAIL_ALREADY_EXISTS");

  const passwordHash = await bcrypt.hash(password, 10);
  const newSponsorCode = generateSponsorCode();
  const referredByCode = validateSponsorCode(sponsorCode);

  const user: User = {
    id: String(userIdCounter++),
    name,
    email: normalizedEmail,
    passwordHash,
    role,
    createdAt: new Date().toISOString(),
    tokens: 0,
    allwainBalance: 0,
    sponsorCode: newSponsorCode,
    referredByCode,
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
 * Perf*
