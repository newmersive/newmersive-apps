import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import {
  LeadGlobalSourceApp,
  LeadGlobalStatus,
} from "../shared/types";
import { addLeadGlobal } from "../services/data.store";

const router = Router();

/**
 * POST /leads/whatsapp
 *
 * Punto de entrada para leads capturados por el bot de WhatsApp (u otro sistema externo).
 * Público, sin auth.
 *
 * Body esperado:
 * {
 *   "message": "Estoy interesado en TrueQIA",
 *   "sourceApp": "trueqia" | "allwain",
 *   "phone": "+34...",
 *   "email": "opcional@correo.com",
 *   "name": "Nombre opcional",
 *   "status": "new" | "contacted" | "closed" (opcional)
 * }
 */
router.post(
  "/whatsapp",
  (req: Request, res: Response): void => {
    try {
      const {
        message,
        sourceApp,
        phone,
        email,
        name,
        status,
      } = req.body as {
        message?: string;
        sourceApp?: LeadGlobalSourceApp;
        phone?: string;
        email?: string;
        name?: string;
        status?: LeadGlobalStatus;
      };

      if (!message || !sourceApp) {
        res.status(400).json({ error: "MISSING_FIELDS" });
        return;
      }

      if (!phone && !email) {
        res.status(400).json({ error: "MISSING_CONTACT" });
        return;
      }

      if (sourceApp !== "trueqia" && sourceApp !== "allwain") {
        res.status(400).json({ error: "INVALID_SOURCE_APP" });
        return;
      }

      const normalizedStatus: LeadGlobalStatus =
        status === "contacted" || status === "closed" ? status : "new";

      const lead = addLeadGlobal({
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        channel: "whatsapp",
        sourceApp,
        name,
        phone,
        email,
        message,
        status: normalizedStatus,
        meta: {
          ip: req.ip,
          userAgent: req.headers["user-agent"] || "",
          rawBody: req.body,
        },
      });

      res.status(201).json({
        ok: true,
        id: lead.id,
      });
    } catch (err) {
      console.error("Error in POST /leads/whatsapp:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

export default router;
