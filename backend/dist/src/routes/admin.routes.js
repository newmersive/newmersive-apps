"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const data_store_1 = require("../services/data.store");
const auth_service_1 = require("../services/auth.service");
const router = (0, express_1.Router)();
/* =========================
   GET /admin/dashboard
========================= */
router.get("/dashboard", auth_middleware_1.authRequired, auth_middleware_1.adminOnly, (req, res) => {
    try {
        const db = (0, data_store_1.getDatabase)();
        const totals = {
            users: db.users.length,
            offers: db.offers.length,
            trades: db.trades.length,
            products: db.products.length,
            leadsLocal: db.leads.length,
            leadsGlobal: db.leadsGlobal.length,
            contracts: db.contracts.length,
            orderGroups: db.orderGroups.length,
            referralStats: db.referralStats.length,
            allwainSavings: db.allwainSavings.length,
        };
        res.json({ admin: true, totals });
    }
    catch (err) {
        console.error("Error in GET /admin/dashboard:", err);
        res.status(500).json({ error: "INTERNAL_ERROR" });
    }
});
/* =========================
   GET /admin/summary
========================= */
router.get("/summary", auth_middleware_1.authRequired, auth_middleware_1.adminOnly, (req, res) => {
    try {
        const db = (0, data_store_1.getDatabase)();
        res.json({
            users: db.users.length,
            leads: db.leadsGlobal.length,
            offers: db.offers.length,
            trades: db.trades.length,
        });
    }
    catch (err) {
        console.error("Error in GET /admin/summary:", err);
        res.status(500).json({ error: "INTERNAL_ERROR" });
    }
});
/* =========================
   GET /admin/users
========================= */
router.get("/users", auth_middleware_1.authRequired, auth_middleware_1.adminOnly, async (req, res) => {
    try {
        const users = await (0, auth_service_1.getPublicUsers)();
        res.json({ users });
    }
    catch (err) {
        console.error("Error in GET /admin/users:", err);
        res.status(500).json({ error: "INTERNAL_ERROR" });
    }
});
/* =========================
   GET /admin/leads
========================= */
router.get("/leads", auth_middleware_1.authRequired, auth_middleware_1.adminOnly, (req, res) => {
    try {
        const items = (0, data_store_1.getLeadsGlobal)();
        res.json({ items });
    }
    catch (err) {
        console.error("Error in GET /admin/leads:", err);
        res.status(500).json({ error: "INTERNAL_ERROR" });
    }
});
/* =========================
   GET /admin/ai/activity (stub demo)
========================= */
router.get("/ai/activity", auth_middleware_1.authRequired, auth_middleware_1.adminOnly, (req, res) => {
    try {
        const events = [
            {
                id: "demo-1",
                userEmail: "demo-user@newmersive.local",
                reason: "content_scan",
                severity: "low",
                createdAt: new Date().toISOString(),
            },
        ];
        res.json({ events });
    }
    catch (err) {
        console.error("Error in GET /admin/ai/activity:", err);
        res.status(500).json({ error: "INTERNAL_ERROR" });
    }
});
exports.default = router;
