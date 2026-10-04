import { Router } from "express";

import authRoutes from "./auth.routes";
import noaCommunityRoutes from "./noa-community.routes";
import trueqiaRoutes from "./trueqia.routes";
import trueqiaTesterRoutes, { trueqiaTesterAdminRoutes } from "./trueqia-tester.routes";
import allwainRoutes from "./allwain.routes";
import leadsRoutes from "./leads.routes";
import adminRoutes from "./admin.routes";
import healthRoutes from "./health.routes";
import entitlementsRoutes from "./entitlements.routes";
import courseRoutes from "./course.routes";
import demoAgentsRoutes from "./demo-agents.routes";
import allwainGuideRoutes from "./allwain-guide.routes";
import allwainPublicGuideRoutes from "./allwain-public-guide.routes";
import allwainPaymentsRoutes from "./allwain-payments.routes";
import allwainParticipationRoutes from "./allwain-participation.routes";
import allwainNotificationsRoutes from "./allwain-notifications.routes";
import allwainAccountRoutes from "./allwain-account.routes";
import allwainComplianceRoutes from "./allwain-compliance.routes";
import allwainReputationRoutes from "./allwain-reputation.routes";
import allwainShippingRoutes from "./allwain-shipping.routes";
import allwainShoppingListsRoutes from "./allwain-shopping-lists.routes";
import allwainWebTesterRoutes from "./allwain-web-tester.routes";
import chatRoutes from "./chat.routes";

const router = Router();

/* =========================
   PUBLIC / SYSTEM
========================= */

router.use("/health", healthRoutes);
router.use("/allwain/public-guide", allwainPublicGuideRoutes);

/* =========================
   AUTH
========================= */

router.use("/auth", authRoutes);
router.use("/noa/community", noaCommunityRoutes);
router.use("/account", allwainAccountRoutes);
router.use("/chat", chatRoutes);

/* =========================
   COURSE ENTITLEMENTS
========================= */

router.use("/entitlements", entitlementsRoutes);

/* =========================
   NEWMERSIVE ROBOT LAB
========================= */

router.use("/course", courseRoutes);

/* =========================
   DEMO AGENTS
========================= */

router.use("/demo-agents", demoAgentsRoutes);
router.use("/allwain/guide", allwainGuideRoutes);

/* =========================
   TRUEQIA
========================= */

router.use("/trueqia/tester", trueqiaTesterRoutes);
router.use("/trueqia", trueqiaRoutes);

/* =========================
   ALLWAIN
========================= */

router.use("/allwain/payments", allwainPaymentsRoutes);
router.use("/allwain/participation", allwainParticipationRoutes);
router.use("/allwain/notifications", allwainNotificationsRoutes);
router.use("/allwain/account", allwainAccountRoutes);
router.use("/allwain/compliance", allwainComplianceRoutes);
router.use("/allwain/reputation", allwainReputationRoutes);
router.use("/allwain/shipping", allwainShippingRoutes);
router.use("/allwain/shopping-lists", allwainShoppingListsRoutes);
router.use("/allwain/tester", allwainWebTesterRoutes);
router.use("/allwain", allwainRoutes);

/* =========================
   LEADS (WHATSAPP / WEB / APP)
========================= */

router.use("/leads", leadsRoutes);

/* =========================
   ADMIN
========================= */

router.use("/admin/trueqia/tester", trueqiaTesterAdminRoutes);
router.use("/admin", adminRoutes);

export default router;
