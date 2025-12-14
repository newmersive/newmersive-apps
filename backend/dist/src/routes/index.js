"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_routes_1 = __importDefault(require("./auth.routes"));
const trueqia_routes_1 = __importDefault(require("./trueqia.routes"));
const allwain_routes_1 = __importDefault(require("./allwain.routes"));
const leads_routes_1 = __importDefault(require("./leads.routes"));
const admin_routes_1 = __importDefault(require("./admin.routes"));
const health_routes_1 = __importDefault(require("./health.routes"));
const router = (0, express_1.Router)();
/* =========================
   PUBLIC / SYSTEM
========================= */
router.use("/health", health_routes_1.default);
/* =========================
   AUTH
========================= */
router.use("/auth", auth_routes_1.default);
/* =========================
   TRUEQIA
========================= */
router.use("/trueqia", trueqia_routes_1.default);
/* =========================
   ALLWAIN
========================= */
router.use("/allwain", allwain_routes_1.default);
/* =========================
   LEADS (WHATSAPP / WEB / APP)
========================= */
router.use("/leads", leads_routes_1.default);
/* =========================
   ADMIN
========================= */
router.use("/admin", admin_routes_1.default);
exports.default = router;
