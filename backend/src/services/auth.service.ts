import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ENV } from "../config/env";
import { AuthTokenResponse, AuthUser, User, UserRole } from "../shared/types";
import { getUserByEmail, getUsers, upsertUser } from "./data.store";

let userIdCounter = computeNextUserId();

export async function registerUser(
  name: string,
  email: string,
  password: string,
  role: UserRole = "user"
): Promise<AuthTokenResponse> {
  const normalizedEmail = email.toLowerCase();
  const existing = getUserByEmail(normalizedEmail);
  if (existing) throw new Error("EMAIL_ALREADY_EXISTS");

  const passwordHash = await bcrypt.hash(password, 10);
  const user: User = {
    id: String(userIdCounter++),
    name,
    email: normalizedEmail,
    passwordHash,
    role,
    createdAt: new Date().toISOString(),
  };

  upsertUser(user);
  return createAuthTokenResponse(user);
}

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

function createAuthTokenResponse(user: User): AuthTokenResponse {
  const payload = { sub: user.id, email: user.email, role: user.role };
  const token = jwt.sign(payload, ENV.JWT_SECRET, { expiresIn: "7d" });
  return { token, user: mapUser(user) };
}

export function getAllUsers(): User[] {
  return getUsers();
}

export function getPublicUsers(): AuthUser[] {
  return getUsers().map((u) => mapUser(u));
}

export function getUserProfile(userId: string): AuthUser | null {
  const user = getUsers().find((u) => u.id === userId);
  return user ? mapUser(user) : null;
}

function computeNextUserId(): number {
  const numericIds = getUsers()
    .map((user) => Number(user.id))
    .filter((id) => Number.isFinite(id));

  if (numericIds.length === 0) {
    return getUsers().length + 1;
  }

  return Math.max(...numericIds) + 1;
}

function mapUser(user: User): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}
