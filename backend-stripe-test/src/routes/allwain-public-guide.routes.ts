import { Router, type NextFunction, type Request, type Response } from "express";

import { consumeOperationQuota } from "../middleware/operation-rate-limit.middleware";
import {
  containsLikelyPrivateData,
  generateAllwainPublicGuideReply,
} from "../services/ai/allwain-public-guide.ai.service";
import {
  ALLWAIN_PUBLIC_KNOWLEDGE,
  ALLWAIN_PUBLIC_KNOWLEDGE_VERSION,
} from "../content/allwain-public-guide.knowledge";

const router = Router();
const PUBLIC_GUIDE_LIMIT = 18;
const PUBLIC_GUIDE_WINDOW_MS = 15 * 60_000;

function publicGuideRateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const quota = consumeOperationQuota(
    `allwain-public-guide:ip:${ip}`,
    PUBLIC_GUIDE_LIMIT,
    PUBLIC_GUIDE_WINDOW_MS,
  );
  res.setHeader("RateLimit-Limit", String(PUBLIC_GUIDE_LIMIT));
  res.setHeader("RateLimit-Remaining", String(quota.remaining));
  res.setHeader("RateLimit-Reset", String(Math.ceil(quota.resetAt / 1_000)));
  if (!quota.allowed) {
    res.setHeader(
      "Retry-After",
      String(Math.max(1, Math.ceil((quota.resetAt - Date.now()) / 1_000))),
    );
    return void res.status(429).json({ error: "ALLWAIN_PUBLIC_GUIDE_RATE_LIMITED" });
  }
  next();
}

router.get("/", (_req, res) => {
  res.json({
    name: "Guía IA pública de Allwain",
    knowledgeVersion: ALLWAIN_PUBLIC_KNOWLEDGE_VERSION,
    sourceCount: ALLWAIN_PUBLIC_KNOWLEDGE.length,
    capabilities: ["answer", "explain", "compare"],
    restrictions: ["no_account_access", "no_private_data", "no_actions"],
    canExecute: false,
    suggestions: [
      "¿Por qué Allwain es diferente?",
      "¿Cómo comparo propuestas?",
      "¿Qué gana un vendedor?",
      "¿Qué hace un Conector?",
      "Explícame privacidad y seguridad",
      "¿Cómo se plantea la fiscalidad?",
    ],
  });
});

router.post("/messages", publicGuideRateLimit, async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const history = Array.isArray(req.body?.history)
    ? req.body.history
        .slice(-6)
        .map((item: any) => ({
          role: item?.role === "assistant" ? "assistant" : "user",
          text: typeof item?.text === "string" ? item.text.replace(/\s+/g, " ").trim().slice(0, 480) : "",
        }))
        .filter((item: any) => item.text)
    : [];
  if (!message) {
    return void res.status(400).json({ error: "MESSAGE_REQUIRED" });
  }
  if (message.length > 480) {
    return void res.status(400).json({ error: "MESSAGE_TOO_LONG" });
  }
  if (containsLikelyPrivateData(message)) {
    return void res.status(422).json({
      error: "PRIVATE_DATA_NOT_ALLOWED",
      message: "Reformula la pregunta sin correo, teléfono, documento, tarjeta o cuenta bancaria.",
    });
  }
  if (history.some((item: any) => containsLikelyPrivateData(item.text))) {
    return void res.status(422).json({
      error: "PRIVATE_DATA_NOT_ALLOWED",
      message: "Reformula la conversación sin correo, teléfono, documento, tarjeta o cuenta bancaria.",
    });
  }

  try {
    const result = await generateAllwainPublicGuideReply(message, history, req.body?.locale);
    return void res.json(result);
  } catch (error) {
    console.error("Error in POST /allwain/public-guide/messages:", error);
    return void res.status(502).json({
      error: "ALLWAIN_PUBLIC_GUIDE_UNAVAILABLE",
      message: "La guía no puede responder ahora. Puedes consultar las noticias públicas.",
    });
  }
});

export default router;
