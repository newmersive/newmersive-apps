import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ENV } from "../config/env";
import { AuthTokenResponse, AuthUser, User, UserRole } from "../shared/types";
import { getDatabase, upsertUser } from "./data.store";

let userIdCounter = 1;

(function seedAdmin() {
  const db = getDatabase();
  const adminEmail = "admin@newmersive.local";
  const existing = db.users.find((u) => u.email === adminEmail);
  if (!existing) {
    const passwordHash = bcrypt.hashSync("admin123", 10);
    const adminUser: User = {
      id: String(userIdCounter++),
      name: "Admin Demo",
      email: adminEmail,
      passwordHash,
      role: "admin",
      createdAt: new Date().toISOString(),
    };
    upsertUser(adminUser);
  } else {
    userIdCounter = Math.max(userIdCounter, Number(existing.id) + 1);
  }
})();

export async function registerUser(
  name: string,
  email: string,
  password: string,
  role: UserRole = "user"
): Promise<AuthTokenResponse> {
  const db = getDatabase();
  const normalizedEmail = email.toLowerCase();
  const existing = db.users.find((u) => u.email === normalizedEmail);
  if (existing) throw new Error("EMAIL_ALREADY_EXISTS");

  const passwordHash = await bcrypt.hash(password, 10);
  const user: User = {
    id: String(++userIdCounter),
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
  const db = getDatabase();
  const normalizedEmail = email.toLowerCase();
  const user = db.users.find((u) => u.email === normalizedEmail);
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
  return getDatabase().users;
}

export function getPublicUsers(): AuthUser[] {
  return getDatabase().users.map((u) => mapUser(u));
}

export function getUserProfile(userId: string): AuthUser | null {
  const user = getDatabase().users.find((u) => u.id === userId);
  return user ? mapUser(user) : null;
}

function mapUser(user: User): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}
