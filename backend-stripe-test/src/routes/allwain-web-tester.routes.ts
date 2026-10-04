import { Response, Router } from "express";

import { AuthRequest, authRequired } from "../middleware/auth.middleware";
import {
  completeAllwainAppTesterStep,
  createAllwainWebTesterIncident,
  getAllwainAppTesterState,
  listAllwainWebTesterFeedback,
  listAllwainWebTesterIncidents,
  saveAllwainWebTesterFeedback,
  updateAllwainAppTesterAction,
} from "../services/allwain-web-tester.service";

const router = Router();

const BAD_REQUEST_ERRORS = new Set([
  "INVALID_TESTER_INCIDENT_CATEGORY",
  "INVALID_TESTER_INCIDENT_SEVERITY",
  "TESTER_INCIDENT_DESCRIPTION_REQUIRED",
  "INVALID_TESTER_INCIDENT_SUBJECT",
  "INVALID_TESTER_INCIDENT_SCREEN",
  "INVALID_TESTER_RELEASE",
  "TESTER_CLIENT_REFERENCE_REQUIRED",
  "INVALID_TESTER_CLIENT_REFERENCE",
  "TESTER_INCIDENT_SENSITIVE_DATA",
  "INVALID_TESTER_SUBMISSION_ID",
  "INVALID_TESTER_FEEDBACK_SCHEMA",
  "INVALID_TESTER_FEEDBACK_ANSWERS",
  "INVALID_TESTER_FEEDBACK_KEY",
  "INVALID_TESTER_FEEDBACK_ANSWER",
  "INVALID_TESTER_FEEDBACK_COMMENT",
  "TOO_MANY_TESTER_FEEDBACK_ANSWERS",
  "TESTER_FEEDBACK_CONTENT_REQUIRED",
  "TESTER_FEEDBACK_SENSITIVE_DATA",
  "INVALID_TESTER_INCIDENT_TARGET",
  "INVALID_TESTER_STEP",
  "INVALID_TESTER_PLATFORM",
  "INVALID_TESTER_APP_VERSION",
  "TESTER_APP_VERSION_SENSITIVE_DATA",
  "INVALID_TESTER_PROGRESS_KEY",
  "INVALID_TESTER_PROGRESS_STATUS",
  "TESTER_PLATFORM_REQUIRED",
  "INVALID_TESTER_ACTION",
  "INVALID_TESTER_ACTION_KEY",
  "INVALID_TESTER_ACTION_STATUS",
]);

function requestId(req: AuthRequest) {
  return String((req as any).requestId || "") || null;
}

function sendTesterError(error: unknown, res: Response) {
  const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
  if (BAD_REQUEST_ERRORS.has(code)) {
    res.status(400).json({ error: code });
    return;
  }
  if (code === "USER_NOT_FOUND") {
    res.status(404).json({ error: code });
    return;
  }
  if (code === "TESTER_CLIENT_REFERENCE_CONFLICT" || code === "TESTER_SUBMISSION_ID_CONFLICT") {
    res.status(409).json({ error: code });
    return;
  }
  if (code === "TESTER_PROGRESS_REFERENCE_CONFLICT" || code === "TESTER_ACTION_REFERENCE_CONFLICT") {
    res.status(409).json({ error: code });
    return;
  }
  if (code === "TESTER_FEEDBACK_REQUIRED") {
    res.status(403).json({ error: code });
    return;
  }
  if (code === "POSTGRES_REQUIRED") {
    res.status(503).json({ error: "TESTER_STORAGE_UNAVAILABLE" });
    return;
  }
  console.error("ALLWAIN_WEB_TESTER_ERROR", error);
  res.status(500).json({ error: "INTERNAL_ERROR" });
}

router.get("/state", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return void res.status(401).json({ error: "UNAUTHORIZED" });
    res.json(await getAllwainAppTesterState(req.user.id));
  } catch (error) {
    sendTesterError(error, res);
  }
});

router.patch("/progress/:stepId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return void res.status(401).json({ error: "UNAUTHORIZED" });
    res.json(await completeAllwainAppTesterStep({
      identity: req.user,
      stepId: req.params.stepId,
      body: req.body,
      requestId: requestId(req),
    }));
  } catch (error) {
    sendTesterError(error, res);
  }
});

router.patch(
  "/progress/:stepId/actions/:actionId",
  authRequired,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) return void res.status(401).json({ error: "UNAUTHORIZED" });
      res.json(await updateAllwainAppTesterAction({
        identity: req.user,
        stepId: req.params.stepId,
        actionId: req.params.actionId,
        body: req.body,
        requestId: requestId(req),
      }));
    } catch (error) {
      sendTesterError(error, res);
    }
  },
);

router.get("/incidents", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return void res.status(401).json({ error: "UNAUTHORIZED" });
    res.json(await listAllwainWebTesterIncidents(req.user.id, req.query.limit));
  } catch (error) {
    sendTesterError(error, res);
  }
});

router.post("/incidents", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return void res.status(401).json({ error: "UNAUTHORIZED" });
    const result = await createAllwainWebTesterIncident({
      identity: req.user,
      body: req.body,
      requestId: requestId(req),
    });
    res.status(result.deduplicated ? 200 : 201).json(result);
  } catch (error) {
    sendTesterError(error, res);
  }
});

router.get("/feedback", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return void res.status(401).json({ error: "UNAUTHORIZED" });
    res.json(await listAllwainWebTesterFeedback(req.user.id, req.query.limit));
  } catch (error) {
    sendTesterError(error, res);
  }
});

router.post("/feedback", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return void res.status(401).json({ error: "UNAUTHORIZED" });
    const result = await saveAllwainWebTesterFeedback({
      identity: req.user,
      body: req.body,
      requestId: requestId(req),
    });
    res.status(result.deduplicated ? 200 : 201).json(result);
  } catch (error) {
    sendTesterError(error, res);
  }
});

export default router;
