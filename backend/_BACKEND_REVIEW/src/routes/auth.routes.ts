import { Router, Request, Response } from "express";
import {
  registerUser,
  loginUser,
  getUserProfile,
  requestPasswordReset,
  resetPassword,
} from "../services/auth.service";
import { authRequired } from "../middleware/auth.middleware";
import { UserRole } from "../shared/types";

const router = Router();

/* =========================
   POST /auth/register
========================= */

router.post(
  "/register",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        name,
        email,
        password,
        role,
        sponsorCode,
        sourceApp,
      } = req.body as {
        name?: string;
        email?: string;
        password?: string;
        role?: UserRole;
        sponsorCode?: string;
        sourceApp?: "trueqia" | "allwain";
      };

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
    } catch (err: any) {
      if (err instanceof Error && err.message === "EMAIL_ALREADY_EXISTS") {
        res.status(400).json({ error: "EMAIL_ALREADY_EXISTS" });
        return;
      }

      console.error("Error in /auth/register:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

/* =========================
   POST /auth/login
========================= */

router.post(
  "/login",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body as {
        email?: string;
        password?: string;
      };

      if (!email || !password) {
        res.status(400).json({ error: "MISSING_FIELDS" });
        return;
      }

      const result = await loginUser(email, password);
      res.json(result);
    } catch (err: any) {
      if (err instanceof Error && err.message === "INVALID_CREDENTIALS") {
        res.status(401).json({ error: "INVALID_CREDENTIALS" });
        return;
      }

      console.error("Error in /auth/login:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

/* =========================
   GET /auth/me
========================= */

router.get(
  "/me",
  authRequired,
  (req: Request, res: Response): void => {
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }

    const profile = getUserProfile(userId);
    if (!profile) {
      res.status(404).json({ error: "USER_NOT_FOUND" });
      return;
    }

    res.json(profile);
  }
);

/* =========================
   POST /auth/forgot-password
========================= */

router.post(
  "/forgot-password",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { email } = req.body as { email?: string };
      if (!email) {
        res.status(400).json({ error: "MISSING_EMAIL" });
        return;
      }

      const token = await requestPasswordReset(email);

      // En modo demo podemos devolver el token para pruebas.
      if (process.env.NODE_ENV !== "production") {
        res.json({ ok: true, token });
      } else {
        res.json({ ok: true });
      }
    } catch (err) {
      console.error("Error in /auth/forgot-password:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

/* =========================
   POST /auth/reset-password
========================= */

router.post(
  "/reset-password",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { token, newPassword } = req.body as {
        token?: string;
        newPassword?: string;
      };

      if (!token || !newPassword) {
        res.status(400).json({ error: "MISSING_FIELDS" });
        return;
      }

      await resetPassword(token, newPassword);
      res.json({ ok: true });
    } catch (err: any) {
      if (err instanceof Error && err.message === "INVALID_TOKEN") {
        res.status(400).json({ error: "INVALID_TOKEN" });
        return;
      }
      if (err instanceof Error && err.message === "USER_NOT_FOUND") {
        res.status(404).json({ error: "USER_NOT_FOUND" });
        return;
      }

      console.error("Error in /auth/reset-password:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

export default router;
