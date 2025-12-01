import { Router } from "express";
import healthRoutes from "./health.routes";
import authRoutes from "./auth.routes";
import trueqiaRoutes from "./trueqia.routes";
import allwainRoutes from "./allwain.routes";
import adminRoutes from "./admin.routes";

const router = Router();

router.use("/", healthRoutes);
router.use("/auth", authRoutes);
router.use("/trueqia", trueqiaRoutes);
router.use("/allwain", allwainRoutes);
router.use("/admin", adminRoutes);

export default router;
