import { Router, Request, Response } from "express";
import { authRequired } from "../middleware/auth.middleware";
import { createWhatsappLead, getGlobalLeads } from "../services/leads.service";

const router = Router();

/* =========================
   GET /leads/global
========================= */
router.get("/global", authRequired, async (_req: Request, res: Response) => {
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
router.post("/whatsapp", authRequired, async (req: Request, res: Response) => {
  try {
    const { name, phone, email, message, sourceApp, status } = req.body as any;

    if (!message || !sourceApp) {
      res.status(400).json({ error: "MISSING_FIELDS" });
      return;
    }

    const lead = await createWhatsappLead({
      name,
      phone,
      email,
      message,
      sourceApp,
      status,
    });

    res.status(201).json(lead);
  } catch (err) {
    console.error("Error in POST /leads/whatsapp:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

export default router;
