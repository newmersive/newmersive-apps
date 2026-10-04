import { Response, Router } from "express";
import { AuthRequest, authRequired } from "../middleware/auth.middleware";
import {
  listAllwainNotifications,
  markAllwainNotificationRead,
  markAllwainNotificationsRead,
} from "../services/allwain-notifications.service";

const router = Router();

function userId(req: AuthRequest) {
  if (!req.user?.id) throw new Error("UNAUTHORIZED");
  return req.user.id;
}

function sendError(error: unknown, res: Response) {
  const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
  if (code === "UNAUTHORIZED") return void res.status(401).json({ error: code });
  if (code === "NOTIFICATION_NOT_FOUND") {
    return void res.status(404).json({ error: code });
  }
  console.error("ALLWAIN_NOTIFICATIONS_ROUTE_ERROR", error);
  return void res.status(500).json({ error: "INTERNAL_ERROR" });
}

router.get("/", authRequired, async (req: AuthRequest, res) => {
  try {
    res.json(
      await listAllwainNotifications(
        userId(req),
        Number(req.query.limit),
        typeof req.query.cursor === "string" ? req.query.cursor : null,
      ),
    );
  } catch (error) {
    sendError(error, res);
  }
});

router.post("/:id/read", authRequired, async (req: AuthRequest, res) => {
  try {
    res.json(await markAllwainNotificationRead(userId(req), req.params.id));
  } catch (error) {
    sendError(error, res);
  }
});

router.post("/read-all", authRequired, async (req: AuthRequest, res) => {
  try {
    res.json(await markAllwainNotificationsRead(userId(req)));
  } catch (error) {
    sendError(error, res);
  }
});

export default router;
