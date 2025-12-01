import { Request, Response } from "express";
import { loginUser, registerUser, getUserProfile } from "../services/auth.service";
import { AuthRequest } from "../middleware/auth.middleware";
import { UserRole } from "../shared/types";

const allowedRoles: UserRole[] = ["user", "company", "admin", "buyer"];

export async function postRegister(req: Request, res: Response) {
  try {
    const { name, email, password, role } = req.body as any;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "MISSING_FIELDS" });
    }

    const normalizedRole: UserRole = allowedRoles.includes(role)
      ? role
      : "user";

    const result = await registerUser(name, email, password, normalizedRole);
    return res.status(201).json(result);
  } catch (err: any) {
    if (err.message === "EMAIL_ALREADY_EXISTS") {
      return res.status(409).json({ error: "EMAIL_ALREADY_EXISTS" });
    }
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}

export async function postLogin(req: Request, res: Response) {
  try {
    const { email, password } = req.body as any;
    if (!email || !password) {
      return res.status(400).json({ error: "MISSING_FIELDS" });
    }
    const result = await loginUser(email, password);
    return res.status(200).json(result);
  } catch (err: any) {
    if (err.message === "INVALID_CREDENTIALS") {
      return res.status(401).json({ error: "INVALID_CREDENTIALS" });
    }
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}

export function getProfile(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "UNAUTHORIZED" });
  const profile = getUserProfile(req.user.id);
  if (!profile) return res.status(404).json({ error: "NOT_FOUND" });
  return res.json({ user: profile });
}
