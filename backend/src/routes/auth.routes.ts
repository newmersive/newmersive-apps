import { Router, Request, Response } from "express";
import {
  registerUser,
  loginUser,
  getUserProfile,
  requestPasswordReset,
  resetPassword,
} from "../services/auth.service";
import { authRequired } from "../middleware/auth.middleware";
import { ENV } from "../config/env";

const router = Router();

function errorDetail(err: unknown) {
  if (ENV.NODE_ENV === "development") {
    if (err instanceof Error) return err.message;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return undefined;
}

router.post("/register", async (req: Request, res: Response) => {
  try {
    const { name, email, password, role, sponsorCode, sourceApp } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ error: "MISSING_FIELDS" });
      return;
    }

    const result = await registerUser(
      name,
      email,
      password,
      role,
      sponsorCode,
      sourceApp
    );

    res.status(201).json(result);
  } catch (err: unknown) {
    console.error("AUTH_REGISTER_ERROR", err);

    if (err instanceof Error && err.message === "EMAIL_ALREADY_EXISTS") {
      res.status(409).json({ error: "EMAIL_ALREADY_EXISTS" });
      return;
    }

    res.status(500).json({ error: "INTERNAL_ERROR", detail: errorDetail(err) });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const result = await loginUser(email, password);
    res.json(result);
  } catch (err: unknown) {
    console.error("AUTH_LOGIN_ERROR", err);
    res.status(401).json({ error: "INVALID_CREDENTIALS", detail: errorDetail(err) });
  }
});

router.get("/me", authRequired, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const user = await getUserProfile(userId);
    res.json(user);
  } catch (err: unknown) {
    console.error("AUTH_ME_ERROR", err);
    res.status(500).json({ error: "INTERNAL_ERROR", detail: errorDetail(err) });
  }
});

router.post("/forgot-password", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const token = await requestPasswordReset(email);
    res.json({ token }); // demo mode
  } catch (err: unknown) {
    console.error("AUTH_FORGOT_PASSWORD_ERROR", err);
    res.status(500).json({ error: "INTERNAL_ERROR", detail: errorDetail(err) });
  }
});

router.post("/reset-password", async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    await resetPassword(token, newPassword);
    res.json({ ok: true });
  } catch (err: unknown) {
    console.error("AUTH_RESET_PASSWORD_ERROR", err);
    res.status(400).json({ error: "INVALID_TOKEN", detail: errorDetail(err) });
  }
});

export default router;
