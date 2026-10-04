import { Response, Router } from "express";
import { AuthRequest, adminOnly, authRequired } from "../middleware/auth.middleware";
import {
  createAllwainReview,
  getAllwainOrderReviewState,
  getAllwainReputationSummary,
  listReportedAllwainReviews,
  moderateAllwainReview,
  reportAllwainReview,
  respondToAllwainReview,
} from "../services/allwain-reputation.service";

const router = Router();

function userIdFrom(req: AuthRequest) {
  const userId = req.user?.id;
  if (!userId) throw new Error("UNAUTHORIZED");
  return userId;
}

function requestIdFrom(req: AuthRequest) {
  return String((req as any).requestId || "") || undefined;
}

function sendReputationError(error: unknown, res: Response) {
  const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
  if (code === "UNAUTHORIZED") return void res.status(401).json({ error: code });
  if (code === "FORBIDDEN") return void res.status(403).json({ error: code });
  if (["USER_NOT_FOUND", "ORDER_NOT_FOUND", "REVIEW_NOT_FOUND"].includes(code)) {
    return void res.status(404).json({ error: code });
  }
  if (["REVIEW_ALREADY_EXISTS", "ORDER_NOT_REVIEWABLE"].includes(code)) {
    return void res.status(409).json({ error: code });
  }
  if (
    code.startsWith("INVALID_") ||
    code.endsWith("_REQUIRED") ||
    code === "SELF_REVIEW_NOT_ALLOWED"
  ) {
    return void res.status(400).json({ error: code });
  }
  console.error("ALLWAIN_REPUTATION_ERROR", error);
  return void res.status(500).json({ error: "INTERNAL_ERROR" });
}

router.get("/users/:id", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await getAllwainReputationSummary(req.params.id));
  } catch (error) {
    sendReputationError(error, res);
  }
});

router.get("/orders/:id", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await getAllwainOrderReviewState(userIdFrom(req), req.params.id));
  } catch (error) {
    sendReputationError(error, res);
  }
});

router.post("/orders/:id/reviews", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    res.status(201).json(
      await createAllwainReview(
        userIdFrom(req),
        req.params.id,
        req.body || {},
        requestIdFrom(req),
      ),
    );
  } catch (error) {
    sendReputationError(error, res);
  }
});

router.patch("/reviews/:id/response", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    res.json(
      await respondToAllwainReview(
        userIdFrom(req),
        req.params.id,
        req.body || {},
        requestIdFrom(req),
      ),
    );
  } catch (error) {
    sendReputationError(error, res);
  }
});

router.post("/reviews/:id/report", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    res.json(
      await reportAllwainReview(
        userIdFrom(req),
        req.params.id,
        req.body || {},
        requestIdFrom(req),
      ),
    );
  } catch (error) {
    sendReputationError(error, res);
  }
});

router.get("/admin/reviews", authRequired, adminOnly, async (req, res) => {
  try {
    res.json(
      await listReportedAllwainReviews({
        limit: Number(req.query.limit),
        cursor: typeof req.query.cursor === "string" ? req.query.cursor : null,
      }),
    );
  } catch (error) {
    sendReputationError(error, res);
  }
});

router.patch(
  "/admin/reviews/:id",
  authRequired,
  adminOnly,
  async (req: AuthRequest, res: Response) => {
    try {
      res.json(
        await moderateAllwainReview(
          userIdFrom(req),
          req.params.id,
          req.body || {},
          requestIdFrom(req),
        ),
      );
    } catch (error) {
      sendReputationError(error, res);
    }
  },
);

export default router;
