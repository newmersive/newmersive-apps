"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const leads_service_1 = require("../services/leads.service");
const router = (0, express_1.Router)();
/* =========================
   GET /leads/global
========================= */
router.get("/global", auth_middleware_1.authRequired, async (_req, res) => {
    try {
        const items = await (0, leads_service_1.getGlobalLeads)();
        res.json({ items });
    }
    catch (err) {
        console.error("Error in GET /leads/global:", err);
        res.status(500).json({ error: "INTERNAL_ERROR" });
    }
});
/* =========================
   POST /leads/whatsapp
========================= */
router.post("/whatsapp", auth_middleware_1.authRequired, async (req, res) => {
    try {
        const { name, phone, email, message, sourceApp, status } = req.body;
        if (!message || !sourceApp) {
            res.status(400).json({ error: "MISSING_FIELDS" });
            return;
        }
        const lead = await (0, leads_service_1.createWhatsappLead)({
            name,
            phone,
            email,
            message,
            sourceApp,
            status,
        });
        res.status(201).json(lead);
    }
    catch (err) {
        console.error("Error in POST /leads/whatsapp:", err);
        res.status(500).json({ error: "INTERNAL_ERROR" });
    }
});
exports.default = router;
