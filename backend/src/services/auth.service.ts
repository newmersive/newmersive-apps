import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ENV } from "../config/env";
import { AuthTokenResponse, User, UserRole } from "../shared/types";

const users: User[] = [];
let userIdCounter = 1;

// Seed admin
(function seedAdmin() {
  const adminEmail = "admin@newmersive.local";
  const exists = users.find(u => u.email === adminEmail);
  if (!exists) {
    const passwordHash = bcrypt.hashSync("admin123", 10);
    users.push({
      id: String(userIdCounter++),
      name: "Admin Demo",
      email: adminEmail,
      passwordHash,
      role: "admin",
      createdAt: new Date()
    });
  }
})();

export async function registerUser(
  name: string,
  email: string,
  password: string,
  role: UserRole = "user"
): Promise<AuthTokenResponse> {
  const existing = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existing) throw new Error("EMAIL_ALREADY_EXISTS");

  const passwordHash = await bcrypt.hash(password, 10);
  const user: User = {
    id: String(userIdCounter++),
    name,
    email: email.toLowerCase(),
    passwordHash,
    role,
    createdAt: new Date()
  };

  users.push(user);
  return createAuthTokenResponse(user);
}

export async function loginUser(
  email: string,
  password: string
): Promise<AuthTokenResponse> {
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error("INVALID_CREDENTIALS");

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) throw new Error("INVALID_CREDENTIALS");

  return createAuthTokenResponse(user);
}

function createAuthTokenResponse(user: User): AuthTokenResponse {
  const payload = { sub: user.id, email: user.email, role: user.role };
  const token = jwt.sign(payload, ENV.JWT_SECRET, { expiresIn: "7d" });
  return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role }};
}

export function getAllUsers(): User[] {
  return users;
}

export function getPublicUsers(): Array<Omit<User, "passwordHash">> {
  return users.map(({ id, name, email, role, createdAt }) => ({
    id,
    name,
    email,
    role,
    createdAt
  }));
}
