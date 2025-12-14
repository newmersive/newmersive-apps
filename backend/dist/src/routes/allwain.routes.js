"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const allwain_service_1 = require("../services/allwain.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
/* =========================
   GET /allwain/scan-demo
========================= */
router.get("/scan-demo", auth_middleware_1.authRequired, async (req, res) => {
    try {
        const { ean } = req.query;
        const result = await (0, allwain_service_1.scanDemoProduct)(ean);
        res.json(result);
    }
    catch (err) {
        console.error("Error in GET /allwain/scan-demo:", err);
        res.status(500).json({ error: "INTERNAL_ERROR" });
    }
});
/* =========================
   GET /allwain/offers
========================= */
router.get("/offers", auth_middleware_1.authRequired, async (req, res) => {
    try {
        const offers = await (0, allwain_service_1.listAllwainOffers)();
        res.json({ items: offers });
    }
    catch (err) {
        console.error("Error in GET /allwain/offers:", err);
        res.status(500).json({ error: "INTERNAL_ERROR" });
    }
});
/* =========================
   POST /allwain/offers
========================= */
router.post("/offers", auth_middleware_1.authRequired, async (req, res) => {
    try {
        const userId = req.user?.id;
        const { title, description, price, productId, meta } = req.body;
        if (!userId || !title || !description || typeof price !== "number") {
            res.status(400).json({ error: "MISSING_FIELDS" });
            return;
        }
        const offer = await (0, allwain_service_1.createAllwainOffer)(userId, title, description, price, productId, meta);
        res.status(201).json(offer);
    }
    catch (err) {
        console.error("Error in POST /allwain/offers:", err);
        res.status(500).json({ error: "INTERNAL_ERROR" });
    }
});
/* =========================
   GET /allwain/order-groups
========================= */
router.get("/order-groups", auth_middleware_1.authRequired, async (req, res) => {
    try {
        const groups = await (0, allwain_service_1.listOrderGroups)();
        res.json({ items: groups });
    }
    catch (err) {
        console.error("Error in GET /allwain/order-groups:", err);
        res.status(500).json({ error: "INTERNAL_ERROR" });
    }
});
/* =========================
   POST /allwain/order-groups
========================= */
router.post("/order-groups", auth_middleware_1.authRequired, async (req, res) => {
    try {
        const { productId, minUnitsPerClient } = req.body;
        if (!productId || typeof minUnitsPerClient !== "number") {
            res.status(400).json({ error: "MISSING_FIELDS" });
            return;
        }
        const group = await (0, allwain_service_1.createOrderGroup)(productId, minUnitsPerClient);
        res.status(201).json(group);
    }
    catch (err) {
        console.error("Error in POST /allwain/order-groups:", err);
        res.status(500).json({ error: "INTERNAL_ERROR" });
    }
});
/* =========================
   POST /allwain/order-groups/:id/join
========================= */
router.post("/order-groups/:id/join", auth_middleware_1.authRequired, async (req, res) => {
    try {
        const userId = req.user?.id;
        const { units } = req.body;
        const groupId = req.params.id;
        if (!userId || typeof units !== "number") {
            res.status(400).json({ error: "MISSING_FIELDS" });
            return;
        }
        const group = await (0, allwain_service_1.joinOrderGroup)(groupId, userId, units);
        res.json(group);
    }
    catch (err) {
        if (err instanceof Error && err.message === "GROUP_NOT_FOUND") {
            res.status(404).json({ error: "GROUP_NOT_FOUND" });
            return;
        }
        console.error("Error in join order group:", err);
        res.status(500).json({ error: "INTERNAL_ERROR" });
    }
});
/* =========================
   POST /allwain/savings
========================= */
router.post("/savings", auth_middleware_1.authRequired, async (req, res) => {
    try {
        const userId = req.user?.id;
        const { amount } = req.body;
        if (!userId || typeof amount !== "number") {
            res.status(400).json({ error: "MISSING_FIELDS" });
            return;
        }
        const result = await (0, allwain_service_1.registerSaving)(userId, amount);
        res.status(201).json(result);
    }
    catch (err) {
        if (err instanceof Error && err.message === "USER_NOT_FOUND") {
            res.status(404).json({ error: "USER_NOT_FOUND" });
            return;
        }
        console.error("Error in POST /allwain/savings:", err);
        res.status(500).json({ error: "INTERNAL_ERROR" });
    }
});
/* =========================
   GET /allwain/sponsors/summary
========================= */
router.get("/sponsors/summary", auth_middleware_1.authRequired, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: "UNAUTHORIZED" });
            return;
        }
        const summary = await (0, allwain_service_1.getSponsorSummary)(userId);
        res.json(summary);
    }
    catch (err) {
        console.error("Error in GET /allwain/sponsors/summary:", err);
        res.status(500).json({ error: "INTERNAL_ERROR" });
    }
});
exports.default = router;
