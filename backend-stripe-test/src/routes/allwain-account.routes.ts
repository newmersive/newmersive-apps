import { Response, Router } from "express";
import { AuthRequest, authRequired } from "../middleware/auth.middleware";
import { deleteAllwainAccount } from "../services/allwain-account.service";

const router = Router();

router.delete("/", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) return void res.status(401).json({ error: "UNAUTHORIZED" });
    res.json(await deleteAllwainAccount(req.user.id));
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    if (code === "USER_NOT_FOUND") return void res.status(404).json({ error: code });
    if (code === "ACCOUNT_HAS_OPEN_ORDERS") {
      return void res.status(409).json({ error: code });
    }
    if (code === "ACCOUNT_HAS_OPEN_TRADES") {
      return void res.status(409).json({ error: code });
    }
    if (code === "ACCOUNT_DELETION_REQUIRES_POSTGRES") {
      return void res.status(503).json({ error: code });
    }
    console.error("ALLWAIN_ACCOUNT_DELETE_ERROR", error);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

export default router;
