import { Router } from "express";

import authRoutes from "./auth.routes";
import trueqiaRoutes from "./trueqia.routes";
import allwainRoutes from "./allwain.routes";
import leadsRoutes from "./leads.routes";
import adminRoutes from "./admin.routes";
import healthRoutes from "./health.routes";

const router = Router();

/* =========================
   PUBLIC / SYSTEM
========================= */

router.use("/health", healthRoutes);

/* =========================
   AUTH
========================= */

router.use("/auth", authRoutes);

/* =========================
   TRUEQIA
========================= */

router.use("/trueqia", trueqiaRoutes);

/* =========================
   ALLWAIN
========================= */

router.use("/allwain", allwainRoutes);

/* =========================
   LEADS (WHATSAPP / WEB / APP)
========================= */

router.use("/leads", leadsRoutes);

/* =========================
   ADMIN
========================= */

router.use("/admin", adminRoutes);

export default router;
