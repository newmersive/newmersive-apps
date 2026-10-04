import { Router } from "express";
import { AuthRequest, authRequired } from "../middleware/auth.middleware";
import { beginAdminMfaEnrollment, confirmAdminMfaEnrollment, getAdminMfaStatus, lockAdminSession,
  rotateAdminRecoveryCodes, verifyAdminMfa } from "../services/admin-mfa.service";

const router = Router();
router.use(authRequired, (req: AuthRequest, res, next) => {
  res.set("Cache-Control", "no-store");
  if (req.user?.role !== "admin") { res.status(403).json({ error: "FORBIDDEN" }); return; }
  next();
});

function handler(run: (identity: { id: string; sessionId: string }, body: unknown) => Promise<unknown>) {
  return async (req: AuthRequest, res: any) => {
    try { res.json(await run(req.user!, req.body || {})); }
    catch (error) {
      const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
      const status = code === "FORBIDDEN" ? 403 : code === "ADMIN_MFA_LOCKED" ? 429 :
        ["ADMIN_MFA_NOT_CONFIGURED", "ADMIN_MFA_REQUIRES_POSTGRES", "ADMIN_MFA_SECRET_INVALID"].includes(code) ? 503 :
        code.startsWith("ADMIN_MFA_") ? 400 : 500;
      if (status === 429) res.set("Retry-After", "900");
      res.status(status).json({ error: status === 500 ? "INTERNAL_ERROR" : code });
    }
  };
}

router.get("/status", handler(getAdminMfaStatus));
router.post("/enroll", handler(beginAdminMfaEnrollment));
router.post("/confirm", handler(confirmAdminMfaEnrollment));
router.post("/verify", handler(verifyAdminMfa));
router.post("/recovery-codes", handler(rotateAdminRecoveryCodes));
router.post("/lock", handler(lockAdminSession));
export default router;
