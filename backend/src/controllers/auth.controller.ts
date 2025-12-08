import { Request, Response } from "express";
import {
  loginUser,
  registerUser,
  getUserProfile,
  requestPasswordReset,
  resetPassword,
} from "../services/auth.service";
import { AuthRequest } from "../middleware/auth.middleware";
import { UserRole } from "../shared/types";

const allowedRoles: UserRole[] = ["user", "company", "admin", "buyer"];

type RegisterRequest = Request<
  Record<string, never>,
  unknown,
  {
    name?: string;
    email?: string;
    password?: string;
    role?: UserRole;
    sponsorCode?: string;
    appMode?: string[];
  }
>;

type LoginRequest = Request<
  Record<string, never>,
  unknown,
  { email?: string; password?: string }
>;

export async function postRegister(req: RegisterRequest, res: Response) {
  try {
    const { name, email, password, role, sponsorCode, appMode } = req.body as any;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "MISSING_FIELDS" });
    }

    const normalizedRole: UserRole =
      role && allowedRoles.includes(role) ? role : "user";

    const result = await registerUser(
      name,
      email,
      password,
      normalizedRole,
      sponsorCode,
      appMode
    );

    return res.status(201).json(result);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "EMAIL_ALREADY_EXISTS") {
      return res.status(409).json({ error: "EMAIL_ALREADY_EXISTS" });
    }
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}

export async function postLogin(req: LoginRequest, res: Response) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "MISSING_FIELDS" });
    }

    const result = await loginUser(email, password);
    return res.status(200).json(result);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "INVALID_CREDENTIALS") {
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

export async function postForgotPassword(req: Request, res: Response) {
  const { email } = req.body as any;

  try {
    if (email) {
      await requestPasswordReset(email);
    }
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}

export async function postResetPassword(req: Request, res: Response) {
  const { token, password } = req.body as any;

  if (!token || !password) {
    return res.status(400).json({ error: "MISSING_FIELDS" });
  }

  try {
    await resetPassword(token, password);
    return res.status(200).json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "INVALID_TOKEN") {
      return res.status(400).json({ error: "INVALID_TOKEN" });
    }
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}
