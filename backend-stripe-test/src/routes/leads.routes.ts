import { Router, Response } from "express";
import {
  AuthRequest,
  adminOnly,
  authRequired,
} from "../middleware/auth.middleware";
import { createWhatsappLead, getGlobalLeads } from "../services/leads.service";
import { LeadGlobalSourceApp } from "../shared/types";

const router = Router();
const ALLOWED_SOURCE_APPS = new Set<LeadGlobalSourceApp>([
  "allwain",
  "trueqia",
  "web",
]);

function optionalText(value: unknown, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error("INVALID_LEAD");
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) throw new Error("INVALID_LEAD");
  return normalized;
}

/* =========================
   GET /leads/global
========================= */
router.get("/global", authRequired, adminOnly, async (_req: AuthRequest, res: Response) => {
  try {
    const items = await getGlobalLeads();
    res.json({ items });
  } catch (err) {
    console.error("Error in GET /leads/global:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

/* =========================
   POST /leads/whatsapp
========================= */
router.post("/whatsapp", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const sourceApp = String(req.body?.sourceApp || "").trim().toLowerCase();
    const message = optionalText(req.body?.message, 2_000);

    if (!message || !ALLOWED_SOURCE_APPS.has(sourceApp as LeadGlobalSourceApp)) {
      res.status(400).json({ error: "INVALID_LEAD" });
      return;
    }

    const lead = await createWhatsappLead({
      name: optionalText(req.body?.name, 120),
      phone: optionalText(req.body?.phone, 40),
      email: optionalText(req.body?.email, 254),
      message,
      sourceApp: sourceApp as LeadGlobalSourceApp,
    });

    res.status(201).json(lead);
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_LEAD") {
      res.status(400).json({ error: "INVALID_LEAD" });
      return;
    }
    console.error("Error in POST /leads/whatsapp:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

export default router;
