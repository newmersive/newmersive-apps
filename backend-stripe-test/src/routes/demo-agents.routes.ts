import { Router, Response } from "express";
import { AuthRequest, authRequired } from "../middleware/auth.middleware";
import { demoAiRateLimit } from "../middleware/operation-rate-limit.middleware";
import {
  generateDemoAgentReply,
  isDemoAgentApp,
  listDemoAgents,
} from "../services/ai/demo-agents.ai.service";

const router = Router();

router.get("/:app", authRequired, (req: AuthRequest, res: Response) => {
  const app = String(req.params.app || "").toLowerCase();
  if (!isDemoAgentApp(app)) {
    return res.status(400).json({ error: "INVALID_APP", message: "App no válida" });
  }

  return res.json({ app, agents: listDemoAgents(app) });
});

router.post("/:app/messages", authRequired, demoAiRateLimit, async (req: AuthRequest, res: Response) => {
  const app = String(req.params.app || "").toLowerCase();
  if (!isDemoAgentApp(app)) {
    return res.status(400).json({ error: "INVALID_APP", message: "App no válida" });
  }

  const message = String(req.body?.message || "").trim();
  if (!message) {
    return res.status(400).json({ error: "MESSAGE_REQUIRED", message: "Escribe un mensaje" });
  }

  if (message.length > 1600) {
    return res.status(400).json({ error: "MESSAGE_TOO_LONG", message: "El mensaje es demasiado largo" });
  }

  try {
    const result = await generateDemoAgentReply({
      app,
      agentId: typeof req.body?.agentId === "string" ? req.body.agentId : undefined,
      message,
      history: req.body?.history,
      userName: typeof req.body?.userName === "string" ? req.body.userName.slice(0, 120) : undefined,
    });
    return res.json(result);
  } catch (err) {
    console.error(`Error in POST /demo-agents/${app}/messages:`, err);
    return res.status(502).json({
      error: "DEMO_AGENT_UNAVAILABLE",
      message: "El agente demo no ha podido responder. Inténtalo de nuevo.",
    });
  }
});

export default router;
