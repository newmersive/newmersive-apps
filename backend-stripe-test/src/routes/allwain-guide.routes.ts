import { Router, type Response } from "express";

import {
  type AuthRequest,
  authRequired,
} from "../middleware/auth.middleware";
import {
  AllwainGuideActionError,
  executeAllwainGuideAction,
} from "../services/allwain-guide.service";
import { generateAllwainGuideReply } from "../services/ai/allwain-guide.ai.service";
import { ImageDataUrlError, validateImageDataUrl } from "../security/image-data-url";
import { allwainAiRateLimit } from "../middleware/operation-rate-limit.middleware";

const router = Router();

router.get("/", authRequired, (_req: AuthRequest, res: Response) => {
  res.json({
    name: "Guía Allwain",
    capabilities: ["answer", "create_request", "create_offer"],
    suggestions: [
      "Quiero comprar algo",
      "Quiero vender algo",
      "Analiza una foto",
    ],
  });
});

router.post("/messages", authRequired, allwainAiRateLimit, async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return void res.status(401).json({ error: "UNAUTHORIZED" });
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  let imageBase64 =
    typeof req.body?.imageBase64 === "string" ? req.body.imageBase64 : undefined;
  if (!message && !imageBase64) {
    return void res.status(400).json({ error: "MESSAGE_REQUIRED" });
  }
  if (message.length > 1600) {
    return void res.status(400).json({ error: "MESSAGE_TOO_LONG" });
  }
  if (imageBase64) {
    try {
      imageBase64 = validateImageDataUrl(imageBase64).dataUrl;
    } catch (error) {
      const status =
        error instanceof ImageDataUrlError && error.code === "IMAGE_TOO_LARGE"
          ? 413
          : 400;
      return void res.status(status).json({
        error: error instanceof ImageDataUrlError ? error.code : "INVALID_IMAGE",
      });
    }
  }

  try {
    const result = await generateAllwainGuideReply({
      userId,
      userName:
        typeof req.body?.userName === "string"
          ? req.body.userName.trim().slice(0, 120)
          : undefined,
      message,
      history: req.body?.history,
      currentAction: req.body?.currentAction,
      imageBase64,
    });
    return void res.json(result);
  } catch (error) {
    console.error("Error in POST /allwain/guide/messages:", error);
    return void res.status(502).json({
      error: "ALLWAIN_GUIDE_UNAVAILABLE",
      message: "No he podido analizarlo ahora. Tus datos no se han publicado.",
    });
  }
});

router.post("/actions", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return void res.status(401).json({ error: "UNAUTHORIZED" });
  try {
    const result = await executeAllwainGuideAction({
      userId,
      actorRole: req.user?.role,
      requestId: typeof (req as any).requestId === "string" ? (req as any).requestId : null,
      idempotencyKey: req.body?.idempotencyKey,
      action: req.body?.action,
    });
    return void res.status(201).json(result);
  } catch (error) {
    if (error instanceof AllwainGuideActionError) {
      if (error.message === "SELLER_ROLE_REQUIRED") {
        return void res.status(403).json({ error: error.message });
      }
      if (error.message === "INCOMPLETE_GUIDE_ACTION") {
        return void res.status(422).json({
          error: error.message,
          fields: error.fields,
        });
      }
      if (error.message === "IDEMPOTENCY_KEY_REUSED") {
        return void res.status(409).json({ error: error.message });
      }
      return void res.status(400).json({ error: error.message });
    }
    if (error instanceof Error && error.message === "SELLER_ROLE_REQUIRED") {
      return void res.status(403).json({ error: error.message });
    }
    if (
      error instanceof Error &&
      error.message === "BUYER_PAYMENT_METHOD_REQUIRED"
    ) {
      return void res.status(409).json({ error: error.message });
    }
    console.error("Error in POST /allwain/guide/actions:", error);
    return void res.status(500).json({
      error: "ALLWAIN_GUIDE_ACTION_FAILED",
      message: "No se ha publicado. Revisa el borrador y vuelve a intentarlo.",
    });
  }
});

export default router;
