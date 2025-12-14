"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const trueqia_service_1 = require("../services/trueqia.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.get("/offers", auth_middleware_1.authRequired, async (req, res) => {
    try {
        const excludeMine = req.query.excludeMine === "true" || req.query.excludeMine === "1";
        const userId = req.user?.id;
        const offers = await (0, trueqia_service_1.listTrueqiaOffers)(excludeMine ? userId : undefined);
        res.json({ items: offers });
    }
    catch (err) {
        console.error("Error in GET /trueqia/offers:", err);
        res.status(500).json({ error: "INTERNAL_ERROR" });
    }
});
router.post("/offers", auth_middleware_1.authRequired, async (req, res) => {
    try {
        const userId = req.user?.id;
        const { title, description, tokens, meta, isUnique } = req.body;
        if (!userId || !title || !description || typeof tokens !== "number") {
            res.status(400).json({ error: "MISSING_FIELDS" });
            return;
        }
        const offer = await (0, trueqia_service_1.createTrueqiaOffer)(userId, title, description, tokens, meta, Boolean(isUnique));
        res.status(201).json(offer);
    }
    catch (err) {
        console.error("Error in POST /trueqia/offers:", err);
        res.status(500).json({ error: "INTERNAL_ERROR" });
    }
});
router.get("/trades", auth_middleware_1.authRequired, async (req, res) => {
    try {
        const userId = req.user?.id;
        const trades = await (0, trueqia_service_1.listTradesForUser)(userId);
        res.json({ items: trades });
    }
    catch (err) {
        console.error("Error in GET /trueqia/trades:", err);
        res.status(500).json({ error: "INTERNAL_ERROR" });
    }
});
router.post("/trades", auth_middleware_1.authRequired, async (req, res) => {
    try {
        const fromUserId = req.user?.id;
        const { toUserId, offerId, tokens } = req.body;
        if (!fromUserId || !toUserId || !offerId) {
            res.status(400).json({ error: "MISSING_FIELDS" });
            return;
        }
        const trade = await (0, trueqia_service_1.createTrade)(fromUserId, toUserId, offerId, typeof tokens === "number" ? tokens : undefined);
        res.status(201).json(trade);
    }
    catch (err) {
        if (err instanceof Error) {
            if (err.message === "INVALID_TOKEN_AMOUNT")
                return void res.status(400).json({ error: "INVALID_TOKEN_AMOUNT" });
            if (err.message === "OFFER_NOT_FOUND")
                return void res.status(404).json({ error: "OFFER_NOT_FOUND" });
            if (err.message === "OFFER_ALREADY_CLAIMED")
                return void res.status(409).json({ error: "OFFER_ALREADY_CLAIMED" });
        }
        console.error("Error in POST /trueqia/trades:", err);
        res.status(500).json({ error: "INTERNAL_ERROR" });
    }
});
router.post("/trades/:id/accept", auth_middleware_1.authRequired, async (req, res) => {
    try {
        const tradeId = req.params.id;
        const trade = await (0, trueqia_service_1.acceptTrade)(tradeId);
        res.json(trade);
    }
    catch (err) {
        if (err instanceof Error) {
            if (err.message === "TRADE_NOT_FOUND")
                return void res.status(404).json({ error: "TRADE_NOT_FOUND" });
            if (err.message === "INSUFFICIENT_TOKENS")
                return void res.status(400).json({ error: "INSUFFICIENT_TOKENS" });
            if (err.message === "OFFER_ALREADY_CLAIMED")
                return void res.status(409).json({ error: "OFFER_ALREADY_CLAIMED" });
            if (err.message === "OFFER_NOT_FOUND")
                return void res.status(404).json({ error: "OFFER_NOT_FOUND" });
        }
        console.error("Error in accept trade:", err);
        res.status(500).json({ error: "INTERNAL_ERROR" });
    }
});
router.post("/trades/:id/reject", auth_middleware_1.authRequired, async (req, res) => {
    try {
        const tradeId = req.params.id;
        const trade = await (0, trueqia_service_1.rejectTrade)(tradeId);
        res.json(trade);
    }
    catch (err) {
        if (err instanceof Error && err.message === "TRADE_NOT_FOUND") {
            res.status(404).json({ error: "TRADE_NOT_FOUND" });
            return;
        }
        console.error("Error in reject trade:", err);
        res.status(500).json({ error: "INTERNAL_ERROR" });
    }
});
router.post("/contracts/preview", auth_middleware_1.authRequired, async (req, res) => {
    try {
        const { offerTitle, requesterName, providerName, tokens } = req.body;
        if (!offerTitle || !requesterName || !providerName || typeof tokens !== "number") {
            res.status(400).json({ error: "MISSING_FIELDS" });
            return;
        }
        const contract = await (0, trueqia_service_1.generateContractPreview)({ offerTitle, requesterName, providerName, tokens });
        res.status(201).json(contract);
    }
    catch (err) {
        console.error("Error in preview contract:", err);
        res.status(500).json({ error: "INTERNAL_ERROR" });
    }
});
exports.default = router;
