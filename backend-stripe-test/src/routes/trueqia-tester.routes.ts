import { Router, Response, NextFunction } from "express";
import { authRequired, adminOnly, AuthRequest } from "../middleware/auth.middleware";
import { createOperationRateLimit } from "../middleware/operation-rate-limit.middleware";
import { completeTrueqiaTesterAction, createTrueqiaTesterIncident, getTrueqiaTesterState, listTrueqiaTesterIncidents, listTrueqiaTesterIncidentsForAdmin } from "../services/trueqia-tester.service";

const router = Router();
router.use(authRequired, (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.sourceApp !== "trueqia") return void res.status(403).json({ error: "TRUEQIA_SESSION_REQUIRED" });
  res.setHeader("Cache-Control", "no-store");
  next();
});
const actionQuota = createOperationRateLimit({ scope: "trueqia-tester-progress", maxRequests: 120, windowMs: 60 * 60_000, ipMultiplier: 30, errorCode: "TESTER_RATE_LIMITED" });
const incidentQuota = createOperationRateLimit({ scope: "trueqia-tester-incident", maxRequests: 30, windowMs: 60 * 60_000, ipMultiplier: 30, errorCode: "TESTER_RATE_LIMITED" });
const endpoint = (run: (req: AuthRequest) => Promise<any>, created = false) => async (req: AuthRequest, res: Response) => {
  try {
    const result = await run(req);
    res.status(created && !result.deduplicated ? 201 : 200).json(result);
  } catch (error: any) {
    const code = error?.message;
    if (["INVALID_TESTER_FIELDS", "INVALID_TESTER_REFERENCE", "TESTER_SENSITIVE_DATA"].includes(code)) return void res.status(400).json({ error: code });
    if (code === "TESTER_REFERENCE_CONFLICT") return void res.status(409).json({ error: code });
    if (code === "USER_NOT_FOUND") return void res.status(404).json({ error: code });
    console.error("TRUEQIA_TESTER_ERROR", code);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
};
router.get("/state", endpoint(req => getTrueqiaTesterState(req.user!.id)));
router.patch("/progress/:stepId/actions/:actionId", actionQuota, endpoint(req => completeTrueqiaTesterAction(req.user!.id, req.params.stepId, req.params.actionId, req.body)));
router.get("/incidents", endpoint(req => listTrueqiaTesterIncidents(req.user!.id)));
router.post("/incidents", incidentQuota, endpoint(req => createTrueqiaTesterIncident(req.user!.id, req.body), true));

export const trueqiaTesterAdminRoutes = Router();
trueqiaTesterAdminRoutes.use(authRequired, adminOnly, (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.sourceApp !== "admin") return void res.status(403).json({ error: "ADMIN_SESSION_REQUIRED" });
  res.setHeader("Cache-Control", "no-store");
  next();
});
trueqiaTesterAdminRoutes.get("/incidents", endpoint(req => listTrueqiaTesterIncidentsForAdmin(req.query)));
export default router;
