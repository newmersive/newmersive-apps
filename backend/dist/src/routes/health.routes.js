"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
/**
 * GET /health
 *
 * Endpoint sencillo de estado del backend.
 * Se expone como: GET /api/health
 * (asumiendo que en index.ts se monta con router.use("/health", healthRoutes))
 */
router.get("/", (req, res) => {
    try {
        res.json({
            status: "ok",
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            env: process.env.NODE_ENV || "development",
        });
    }
    catch (err) {
        console.error("Error in GET /health:", err);
        res.status(500).json({ status: "error" });
    }
});
exports.default = router;
