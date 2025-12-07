import { Router } from "express";
import { createWhatsappLead } from "../services/leads.service";
import { LeadGlobalSourceApp, LeadGlobalStatus } from "../shared/types";

const router = Router();

router.post("/whatsapp", (req, res) => {
  const { name, phone, email, message, sourceApp, status } = req.body as {
    name?: string;
    phone?: string;
    email?: string;
    message?: string;
    sourceApp?: LeadGlobalSourceApp;
    status?: LeadGlobalStatus;
  };

  const allowedSourceApps: LeadGlobalSourceApp[] = ["trueqia", "allwain"];
  const allowedStatuses: LeadGlobalStatus[] = ["new", "contacted", "closed"];

  if (!message || !sourceApp) {
    return res.status(400).json({ error: "MISSING_FIELDS" });
  }

  if (!allowedSourceApps.includes(sourceApp)) {
    return res.status(400).json({ error: "INVALID_SOURCE_APP" });
  }

  if (!phone && !email) {
    return res.status(400).json({ error: "CONTACT_REQUIRED" });
  }

  if (status && !allowedStatuses.includes(status)) {
    return res.status(400).json({ error: "INVALID_STATUS" });
  }

  const lead = createWhatsappLead({
    name,
    phone,
    email,
    message,
    sourceApp,
    status,
  });

  res.status(201).json({ lead });
});

export default router;
