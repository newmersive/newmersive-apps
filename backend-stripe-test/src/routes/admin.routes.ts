import { Router, Request, Response } from "express";
import {
  AuthRequest,
  authRequired,
  adminOnly,
} from "../middleware/auth.middleware";
import { getGlobalLeads } from "../services/leads.service";
import {
  createAllwainOffer,
  listAllwainAdminScanRequestPage,
} from "../services/allwain.service";
import {
  getDemoEcosystemStatus,
  seedDemoEcosystem,
} from "../services/demo-ecosystem.service";
import {
  getAllwainAdminPaymentOverview,
  restoreAllwainWonDisputeTransfers,
  runAllwainReconciliation,
} from "../services/allwain-payments.service";
import { getAdminDashboardTotals } from "../services/admin-dashboard.service";
import { appendAllwainAuditEvent } from "../services/allwain-audit";
import { listAllwainRecurringPlansForAdmin } from "../services/allwain-recurring.service";
import { getAllwainAiUsageSummary } from "../services/allwain-ai-usage.service";
import { retryAllwainEmailDelivery } from "../services/allwain-mailer.service";
import {
  auditAllwainAdminUserListAccess,
  getAllwainAdminUser,
  listAllwainAdminUsers,
  revokeAllwainAdminUserSessions,
  updateAllwainAdminParticipation,
  updateAllwainAdminUserAccess,
} from "../services/allwain-admin-users.service";
import {
  getAllwainAgentAdminOverview,
  updateAllwainAgentControl,
} from "../services/allwain-agent-control.service";
import {
  getAllwainSupportAdminOverview,
  getAllwainSupportTicketForAdmin,
  listAllwainSupportTicketsForAdmin,
  sendAllwainSupportAdminReply,
  setAllwainSupportAutomationPaused,
  syncAllwainSupportInbox,
  updateAllwainSupportTicket,
  verifyAllwainSupportConnections,
} from "../services/allwain-support.service";

const router = Router();

function adminManagementError(res: Response, err: unknown) {
  const code = err instanceof Error ? err.message : "INTERNAL_ERROR";
  if (["USER_NOT_FOUND", "PARTICIPATION_PROFILE_NOT_FOUND", "AGENT_NOT_FOUND"].includes(code)) {
    res.status(404).json({ error: code });
    return;
  }
  if (
    [
      "INVALID_USER_STATUS",
      "INVALID_PARTICIPATION_FILTER",
      "INVALID_USER_CURSOR",
      "INVALID_ADMIN_USER_ACTION",
      "INVALID_PARTICIPATION_PROFILE",
      "INVALID_PARTICIPATION_ACTION",
      "INVALID_PARTICIPATION_STATUS",
      "ADMIN_REASON_REQUIRED",
      "AGENT_ENABLED_BOOLEAN_REQUIRED",
      "INVALID_AGENT_MODE",
    ].includes(code)
  ) {
    res.status(400).json({ error: code });
    return;
  }
  if (["ADMIN_SELF_ACTION_FORBIDDEN", "ADMIN_ACCOUNT_PROTECTED"].includes(code)) {
    res.status(403).json({ error: code });
    return;
  }
  if (code === "ADMIN_USER_MANAGEMENT_REQUIRES_POSTGRES") {
    res.status(503).json({ error: code });
    return;
  }
  console.error("Allwain admin management error:", err);
  res.status(500).json({ error: "INTERNAL_ERROR" });
}

/* =========================
   GET /admin/dashboard
========================= */

router.get("/dashboard", authRequired, adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const totals = await getAdminDashboardTotals();

    res.json({ admin: true, totals });
  } catch (err) {
    console.error("Error in GET /admin/dashboard:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

/* =========================
   GET /admin/summary
========================= */

router.get("/summary", authRequired, adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const totals = await getAdminDashboardTotals();

    res.json({
      users: totals.users,
      leads: totals.leadsGlobal,
      offers: totals.offers,
      trades: totals.trades,
      scanRequests: totals.allwainScanRequests,
    });
  } catch (err) {
    console.error("Error in GET /admin/summary:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

/* =========================
   GET /admin/allwain/scan-requests
========================= */

router.get("/allwain/scan-requests", authRequired, adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const requestedLimit = Number(req.query.limit);
    const statuses =
      typeof req.query.status === "string"
        ? req.query.status
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
        : undefined;
    res.json(
      await listAllwainAdminScanRequestPage({
        limit: Math.max(
          1,
          Math.min(100, Number.isFinite(requestedLimit) ? requestedLimit : 30),
        ),
        cursor: typeof req.query.cursor === "string" ? req.query.cursor : null,
        query: typeof req.query.q === "string" ? req.query.q.trim() : null,
        statuses,
      }),
    );
  } catch (err) {
    console.error("Error in GET /admin/allwain/scan-requests:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get("/allwain/payments", authRequired, adminOnly, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }
    const overview = await getAllwainAdminPaymentOverview();
    await appendAllwainAuditEvent({
      aggregateType: "admin_access",
      aggregateId: req.user.id,
      eventType: "privacy.admin_payment_overview_accessed",
      actorUserId: req.user.id,
      actorRole: "admin",
      source: "allwain_admin",
      requestId: String((req as any).requestId || "") || undefined,
      payload: {
        resource: "allwain_payment_overview",
        returnedAt: new Date().toISOString(),
      },
    });
    res.json(overview);
  } catch (err) {
    console.error("Error in GET /admin/allwain/payments:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get(
  "/allwain/recurring-plans",
  authRequired,
  adminOnly,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ error: "UNAUTHORIZED" });
        return;
      }
      const result = await listAllwainRecurringPlansForAdmin({
        limit: Number(req.query.limit),
        status:
          typeof req.query.status === "string" ? req.query.status : null,
      });
      await appendAllwainAuditEvent({
        aggregateType: "admin_access",
        aggregateId: req.user.id,
        eventType: "privacy.admin_recurring_plans_accessed",
        actorUserId: req.user.id,
        actorRole: "admin",
        source: "allwain_admin",
        requestId: String((req as any).requestId || "") || undefined,
        payload: {
          resource: "allwain_recurring_plans",
          returnedItems: result.items.length,
        },
      });
      res.json(result);
    } catch (err) {
      console.error("Error in GET /admin/allwain/recurring-plans:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

router.post(
  "/allwain/reconciliation",
  authRequired,
  adminOnly,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ error: "UNAUTHORIZED" });
        return;
      }
      res.json(
        await runAllwainReconciliation(req.user.id, {
          periodStart: req.body?.periodStart,
          periodEnd: req.body?.periodEnd,
        }),
      );
    } catch (err: any) {
      const code = String(err?.message || "INTERNAL_ERROR");
      if (code === "INVALID_RECONCILIATION_PERIOD") {
        res.status(400).json({ error: code });
        return;
      }
      if (code === "RECONCILIATION_ALREADY_RUNNING") {
        res.status(409).json({ error: code });
        return;
      }
      if (
        [
          "STRIPE_NOT_CONFIGURED",
          "ALLWAIN_PAYMENTS_NOT_CONFIGURED",
          "PAYMENTS_REQUIRE_POSTGRES",
        ].includes(code)
      ) {
        res.status(503).json({ error: code });
        return;
      }
      console.error("Error in POST /admin/allwain/reconciliation:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

router.post(
  "/allwain/orders/:id/restore-dispute-transfers",
  authRequired,
  adminOnly,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ error: "UNAUTHORIZED" });
        return;
      }
      res.json(
        await restoreAllwainWonDisputeTransfers(
          req.user.id,
          req.params.id,
          String((req as any).requestId || "") || undefined,
        ),
      );
    } catch (err: any) {
      const code = String(err?.message || "INTERNAL_ERROR");
      if (["ORDER_NOT_FOUND", "PAYMENT_NOT_FOUND"].includes(code)) {
        res.status(404).json({ error: code });
        return;
      }
      if (
        [
          "DISPUTE_NOT_WON",
          "NO_DISPUTE_TRANSFER_RECOVERY",
          "ORDER_NOT_PAYABLE",
          "STRIPE_TEST_TRANSFERS_DISABLED",
        ].includes(code)
      ) {
        res.status(409).json({ error: code });
        return;
      }
      if (
        [
          "STRIPE_NOT_CONFIGURED",
          "ALLWAIN_PAYMENTS_NOT_CONFIGURED",
          "PAYMENTS_REQUIRE_POSTGRES",
        ].includes(code)
      ) {
        res.status(503).json({ error: code });
        return;
      }
      console.error(
        "Error in POST /admin/allwain/orders/:id/restore-dispute-transfers:",
        err,
      );
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

router.get(
  "/allwain/support",
  authRequired,
  adminOnly,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ error: "UNAUTHORIZED" });
        return;
      }
      const overview = await getAllwainSupportAdminOverview();
      await appendAllwainAuditEvent({
        aggregateType: "admin_access",
        aggregateId: req.user.id,
        eventType: "privacy.admin_support_overview_accessed",
        actorUserId: req.user.id,
        actorRole: "admin",
        source: "allwain_admin",
        requestId: String((req as any).requestId || "") || undefined,
        payload: { resource: "allwain_support_overview" },
      });
      res.json(overview);
    } catch (err) {
      console.error("Error in GET /admin/allwain/support:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

router.get(
  "/allwain/support/tickets",
  authRequired,
  adminOnly,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ error: "UNAUTHORIZED" });
        return;
      }
      const result = await listAllwainSupportTicketsForAdmin({
        status: typeof req.query.status === "string" ? req.query.status : null,
        query: typeof req.query.q === "string" ? req.query.q : null,
        limit: Number(req.query.limit),
      });
      await appendAllwainAuditEvent({
        aggregateType: "admin_access",
        aggregateId: req.user.id,
        eventType: "privacy.admin_support_tickets_accessed",
        actorUserId: req.user.id,
        actorRole: "admin",
        source: "allwain_admin",
        requestId: String((req as any).requestId || "") || undefined,
        payload: { resource: "allwain_support_tickets", returnedItems: result.items.length },
      });
      res.json(result);
    } catch (err) {
      console.error("Error in GET /admin/allwain/support/tickets:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

router.get(
  "/allwain/support/tickets/:id",
  authRequired,
  adminOnly,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ error: "UNAUTHORIZED" });
        return;
      }
      const ticket = await getAllwainSupportTicketForAdmin(req.params.id);
      await appendAllwainAuditEvent({
        aggregateType: "support_ticket",
        aggregateId: req.params.id,
        eventType: "privacy.admin_support_ticket_accessed",
        actorUserId: req.user.id,
        actorRole: "admin",
        source: "allwain_admin",
        requestId: String((req as any).requestId || "") || undefined,
        payload: { resource: "allwain_support_ticket" },
      });
      res.json(ticket);
    } catch (err: any) {
      if (String(err?.message) === "SUPPORT_TICKET_NOT_FOUND") {
        res.status(404).json({ error: "SUPPORT_TICKET_NOT_FOUND" });
        return;
      }
      console.error("Error in GET /admin/allwain/support/tickets/:id:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

router.post(
  "/allwain/support/sync",
  authRequired,
  adminOnly,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ error: "UNAUTHORIZED" });
        return;
      }
      const result = await syncAllwainSupportInbox(Number(req.body?.limit) || 25);
      await appendAllwainAuditEvent({
        aggregateType: "support_inbox",
        aggregateId: "primary",
        eventType: "support.inbox_sync_requested",
        actorUserId: req.user.id,
        actorRole: "admin",
        source: "allwain_admin",
        requestId: String((req as any).requestId || "") || undefined,
        payload: {
          status: result.status,
          discovered: result.discovered,
          imported: result.imported,
        },
      });
      res.json(result);
    } catch (err) {
      console.error("Error in POST /admin/allwain/support/sync:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

router.post(
  "/allwain/support/verify",
  authRequired,
  adminOnly,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ error: "UNAUTHORIZED" });
        return;
      }
      const result = await verifyAllwainSupportConnections();
      await appendAllwainAuditEvent({
        aggregateType: "support_inbox",
        aggregateId: "primary",
        eventType: "support.connections_verified",
        actorUserId: req.user.id,
        actorRole: "admin",
        source: "allwain_admin",
        requestId: String((req as any).requestId || "") || undefined,
        payload: { smtpOk: result.smtp.ok, imapOk: result.imap.ok },
      });
      res.json(result);
    } catch (err) {
      console.error("Error in POST /admin/allwain/support/verify:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

router.post(
  "/allwain/support/tickets/:id/reply",
  authRequired,
  adminOnly,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ error: "UNAUTHORIZED" });
        return;
      }
      res.json(
        await sendAllwainSupportAdminReply({
          ticketId: req.params.id,
          adminUserId: req.user.id,
          body: String(req.body?.body || ""),
          resolve: req.body?.resolve === true,
          requestId: String((req as any).requestId || "") || undefined,
        }),
      );
    } catch (err: any) {
      const code = String(err?.message || "INTERNAL_ERROR");
      if (code === "SUPPORT_TICKET_NOT_FOUND") {
        res.status(404).json({ error: code });
        return;
      }
      if (code === "SUPPORT_MESSAGE_REQUIRED") {
        res.status(400).json({ error: code });
        return;
      }
      if (["SMTP_NOT_CONFIGURED", "EMAIL_DELIVERY_DISABLED", "EMAIL_RECIPIENT_NOT_ALLOWED"].includes(code)) {
        res.status(503).json({ error: code });
        return;
      }
      console.error("Error in POST /admin/allwain/support/tickets/:id/reply:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

router.patch(
  "/allwain/support/tickets/:id",
  authRequired,
  adminOnly,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ error: "UNAUTHORIZED" });
        return;
      }
      res.json(
        await updateAllwainSupportTicket({
          ticketId: req.params.id,
          adminUserId: req.user.id,
          status: req.body?.status,
          priority: req.body?.priority,
          assignToMe: req.body?.assignToMe === true,
          requestId: String((req as any).requestId || "") || undefined,
        }),
      );
    } catch (err: any) {
      const code = String(err?.message || "INTERNAL_ERROR");
      if (code === "SUPPORT_TICKET_NOT_FOUND") {
        res.status(404).json({ error: code });
        return;
      }
      if (["INVALID_SUPPORT_STATUS", "INVALID_SUPPORT_PRIORITY"].includes(code)) {
        res.status(400).json({ error: code });
        return;
      }
      console.error("Error in PATCH /admin/allwain/support/tickets/:id:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

router.patch(
  "/allwain/support/control",
  authRequired,
  adminOnly,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ error: "UNAUTHORIZED" });
        return;
      }
      if (typeof req.body?.paused !== "boolean") {
        res.status(400).json({ error: "SUPPORT_PAUSED_BOOLEAN_REQUIRED" });
        return;
      }
      res.json(
        await setAllwainSupportAutomationPaused({
          adminUserId: req.user.id,
          paused: req.body.paused,
          requestId: String((req as any).requestId || "") || undefined,
        }),
      );
    } catch (err) {
      console.error("Error in PATCH /admin/allwain/support/control:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

router.post(
  "/allwain/email-deliveries/:id/retry",
  authRequired,
  adminOnly,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ error: "UNAUTHORIZED" });
        return;
      }
      const result = await retryAllwainEmailDelivery(req.params.id);
      await appendAllwainAuditEvent({
        aggregateType: "email_delivery",
        aggregateId: req.params.id,
        eventType: "support.email_delivery_retry_requested",
        actorUserId: req.user.id,
        actorRole: "admin",
        source: "allwain_admin",
        requestId: String((req as any).requestId || "") || undefined,
        payload: { status: result?.status || "unknown" },
      });
      res.json(result);
    } catch (err: any) {
      if (String(err?.message) === "EMAIL_DELIVERY_NOT_FOUND") {
        res.status(404).json({ error: "EMAIL_DELIVERY_NOT_FOUND" });
        return;
      }
      console.error("Error in POST /admin/allwain/email-deliveries/:id/retry:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

router.post("/allwain/offers", authRequired, adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const targetUserId = String(req.body?.targetUserId || "");
    const title = String(req.body?.title || "");
    const description = String(req.body?.description || "");
    const price = Number(req.body?.price);
    if (!targetUserId || !title.trim() || !description.trim() || !Number.isFinite(price)) {
      res.status(400).json({ error: "MISSING_FIELDS" });
      return;
    }

    const inputMeta =
      req.body?.meta && typeof req.body.meta === "object" ? req.body.meta : {};
    const {
      requestId: _ignoredRequestId,
      source: _ignoredSource,
      ...publicMeta
    } = inputMeta as Record<string, unknown>;
    const offer = await createAllwainOffer(
      targetUserId,
      title,
      description,
      price,
      req.body?.productId ? String(req.body.productId) : undefined,
      {
        ...publicMeta,
        featured: req.body?.featured === true,
        source: "allwain-admin-campaign",
      },
    );
    res.status(201).json(offer);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "USER_NOT_FOUND") {
        res.status(404).json({ error: "USER_NOT_FOUND" });
        return;
      }
      if (err.message === "SELLER_ROLE_REQUIRED") {
        res.status(422).json({ error: "TARGET_MUST_BE_SELLER" });
        return;
      }
      if (err.message === "INVALID_OFFER_PRICE" || err.message === "MISSING_OFFER_FIELDS") {
        res.status(400).json({ error: err.message });
        return;
      }
      if (
        [
          "MISSING_STOCK_QUANTITY",
          "INVALID_MIN_QUANTITY",
          "INVALID_MAX_QUANTITY",
          "INVALID_QUANTITY_STEP",
        ].includes(err.message)
      ) {
        res.status(400).json({ error: err.message });
        return;
      }
    }
    console.error("Error in POST /admin/allwain/offers:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

/* =========================
   GET /admin/users
========================= */

router.get("/users", authRequired, adminOnly, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }
    const result = await listAllwainAdminUsers({
      limit: req.query.limit,
      cursor: req.query.cursor,
      query: req.query.q,
      status: req.query.status,
      participation: req.query.participation,
    });
    await auditAllwainAdminUserListAccess({
      actorUserId: req.user.id,
      returned: result.users.length,
      queryApplied: Boolean(req.query.q || req.query.status || req.query.participation),
      requestId: String((req as any).requestId || "") || undefined,
    });
    res.json(result);
  } catch (err) {
    adminManagementError(res, err);
  }
});

router.get("/users/:id", authRequired, adminOnly, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }
    const user = await getAllwainAdminUser(req.params.id);
    await appendAllwainAuditEvent({
      aggregateType: "admin_access",
      aggregateId: req.user.id,
      eventType: "privacy.admin_user_detail_accessed",
      actorUserId: req.user.id,
      actorRole: "admin",
      source: "allwain_admin",
      requestId: String((req as any).requestId || "") || undefined,
      payload: { targetUserId: req.params.id },
    });
    res.json(user);
  } catch (err) {
    adminManagementError(res, err);
  }
});

router.patch("/users/:id/access", authRequired, adminOnly, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }
    res.json(
      await updateAllwainAdminUserAccess({
        actorUserId: req.user.id,
        userId: req.params.id,
        action: req.body?.action,
        reason: req.body?.reason,
        requestId: String((req as any).requestId || "") || undefined,
      }),
    );
  } catch (err) {
    adminManagementError(res, err);
  }
});

router.post("/users/:id/revoke-sessions", authRequired, adminOnly, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }
    res.json(
      await revokeAllwainAdminUserSessions({
        actorUserId: req.user.id,
        userId: req.params.id,
        reason: req.body?.reason,
        requestId: String((req as any).requestId || "") || undefined,
      }),
    );
  } catch (err) {
    adminManagementError(res, err);
  }
});

router.patch("/users/:id/participation", authRequired, adminOnly, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }
    res.json(
      await updateAllwainAdminParticipation({
        actorUserId: req.user.id,
        userId: req.params.id,
        profile: req.body?.profile,
        action: req.body?.action,
        reason: req.body?.reason,
        requestId: String((req as any).requestId || "") || undefined,
      }),
    );
  } catch (err) {
    adminManagementError(res, err);
  }
});

/* =========================
   DEMO ECOSYSTEM
========================= */

router.get("/demo-ecosystem", authRequired, adminOnly, async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json(await getDemoEcosystemStatus());
  } catch (err) {
    console.error("Error in GET /admin/demo-ecosystem:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/demo-ecosystem/seed", authRequired, adminOnly, async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json(await seedDemoEcosystem());
  } catch (err) {
    console.error("Error in POST /admin/demo-ecosystem/seed:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

/* =========================
   GET /admin/leads
========================= */

router.get("/leads", authRequired, adminOnly, async (_req: Request, res: Response): Promise<void> => {
  try {
    const items = await getGlobalLeads();
    res.json({ items });
  } catch (err) {
    console.error("Error in GET /admin/leads:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

/* =========================
   GET /admin/ai/activity
========================= */

router.get("/ai/activity", authRequired, adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const summary = await getAllwainAiUsageSummary(req.query.days);
    res.json({
      events: summary.recent,
      configured: summary.configured,
      summary,
    });
  } catch (err) {
    console.error("Error in GET /admin/ai/activity:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get("/allwain/ai-usage", authRequired, adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await getAllwainAiUsageSummary(req.query.days));
  } catch (err) {
    console.error("Error in GET /admin/allwain/ai-usage:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get("/allwain/agents", authRequired, adminOnly, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }
    const result = await getAllwainAgentAdminOverview(req.query.days);
    await appendAllwainAuditEvent({
      aggregateType: "admin_access",
      aggregateId: req.user.id,
      eventType: "privacy.admin_agents_overview_accessed",
      actorUserId: req.user.id,
      actorRole: "admin",
      source: "allwain_admin",
      requestId: String((req as any).requestId || "") || undefined,
      payload: { days: result.days, returnedAgents: result.agents.length },
    });
    res.json(result);
  } catch (err) {
    adminManagementError(res, err);
  }
});

router.patch("/allwain/agents/:key", authRequired, adminOnly, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }
    res.json(
      await updateAllwainAgentControl({
        actorUserId: req.user.id,
        agentKey: req.params.key,
        enabled: req.body?.enabled,
        mode: req.body?.mode,
        operatorInstructions: req.body?.operatorInstructions,
        reason: req.body?.reason,
        requestId: String((req as any).requestId || "") || undefined,
      }),
    );
  } catch (err) {
    adminManagementError(res, err);
  }
});

export default router;
