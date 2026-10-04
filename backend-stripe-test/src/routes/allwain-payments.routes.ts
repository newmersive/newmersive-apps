import { Request, Response, Router } from "express";
import { ENV } from "../config/env";
import {
  AuthRequest,
  adminOnly,
  authRequired,
} from "../middleware/auth.middleware";
import {
  cancelAllwainOrder,
  chargeAllwainPreorder,
  createAllwainCheckout,
  prepareAllwainCheckoutReview,
  createAllwainBuyerPaymentSetup,
  createAllwainSellerDashboardLink,
  createAllwainSellerOnboarding,
  getAllwainPaymentConfig,
  getAllwainOrderAudit,
  getAllwainBuyerPaymentProfile,
  getAllwainOrderForUser,
  getAllwainOrderSummaryForUser,
  getAllwainSellerPaymentStatus,
  listAllwainOrderPageForUser,
  processAllwainStripeWebhook,
  refreshAllwainSellerOnboarding,
  refundAllwainOrder,
  exportAllwainOrderAuditPdf,
  updateAllwainOrderFulfillment,
} from "../services/allwain-payments.service";
import { notifyAllwainOrderParticipants } from "../services/allwain-notifications.service";
import { appendAllwainAuditEvent } from "../services/allwain-audit";
import {
  getAllwainRecurringPlanForUser,
  listAllwainRecurringPlansForUser,
  updateAllwainRecurringPlan,
} from "../services/allwain-recurring.service";

const router = Router();

function userIdFrom(req: AuthRequest) {
  const userId = req.user?.id;
  if (!userId) throw new Error("UNAUTHORIZED");
  return userId;
}

export function allwainPaymentErrorStatus(code: string) {
  const badRequest = new Set([
    "INVALID_REVIEWED_TOTAL",
    "RESERVATION_CONSENT_REQUIRED",
    "PREORDER_MANDATE_VERSION_MISMATCH",
    "PREORDER_CHARGE_DEADLINE_REQUIRED",
    "INVALID_PREORDER_CHARGE_DEADLINE",
    "PREORDER_CHARGE_DEADLINE_PASSED",
    "PREORDER_CHARGE_DEADLINE_TOO_FAR",
    "COMMERCIAL_TERMS_CONSENT_REQUIRED",
    "COMMERCIAL_TERMS_VERSION_MISMATCH",
    "INVALID_REFUND_AMOUNT",
    "REFUND_AMOUNT_EXCEEDS_PAYMENT",
    "CONTRACT_PAYMENT_TERMS_MISSING",
    "INVALID_PAYMENT_RETURN_URL",
    "INVALID_FULFILLMENT_ACTION",
    "BUYER_PAYMENT_CONSENT_REQUIRED",
    "BUYER_PAYMENT_CONSENT_VERSION_MISMATCH",
    "RECURRING_MANDATE_REQUIRED",
    "RECURRING_MANDATE_VERSION_MISMATCH",
    "RECURRING_PREORDER_NOT_SUPPORTED",
  ]);
  const conflict = new Set([
    "ORDER_TOTAL_CHANGED",
    "AGREEMENT_NOT_ACCEPTED",
    "PREORDER_NOT_READY_TO_CHARGE",
    "PREORDER_MANDATE_NOT_VALID",
    "PREORDER_MANDATE_SNAPSHOT_MISMATCH",
    "PREORDER_PAYMENT_METHOD_MISSING",
    "PAYMENT_REQUIRES_CUSTOMER_ACTION",
    "PAYMENT_FAILED",
    "ORDER_ALREADY_PAID",
    "ORDER_NOT_PAID",
    "ORDER_DISPUTED",
    "INVALID_FULFILLMENT_TRANSITION",
    "ORDER_NOT_PAYABLE",
    "SELLER_FISCAL_PROFILE_REQUIRED",
    "BUYER_FISCAL_PROFILE_REQUIRED",
    "TAX_TREATMENT_NOT_APPROVED",
    "SETTLEMENT_NOT_APPROVED",
    "FOOD_INFORMATION_INCOMPLETE",
    "FISCAL_DOCUMENT_PLAN_NOT_APPROVED",
    "REFUND_ALREADY_PENDING",
    "ORDER_NO_LONGER_CANCELABLE",
    "RECURRING_MANDATE_NOT_VALID",
    "RECURRING_AMOUNT_EXCEEDS_MANDATE",
    "RECURRING_TERMS_CHANGED",
    "RECURRING_CHARGE_IN_PROGRESS",
    "RECURRING_PLAN_TERMINAL",
    "RECURRING_PAYMENT_METHOD_MISSING",
    "LOGISTICS_QR_REQUIRED",
    "CARRIER_TRACKING_REQUIRED",
    "DEMO_OFFER_READ_ONLY",
    "STRIPE_TEST_OFFER_NOT_ELIGIBLE",
    "STRIPE_TEST_ORDER_REQUIRES_TEST_MODE",
    "STRIPE_TEST_ORDER_MARKER_MISMATCH",
    "STRIPE_TEST_TRANSFERS_DISABLED",
  ]);
  const unavailable = new Set([
    "STRIPE_NOT_CONFIGURED",
    "STRIPE_WEBHOOK_NOT_CONFIGURED",
    "ALLWAIN_PAYMENTS_NOT_CONFIGURED",
    "SELLER_PAYMENTS_NOT_READY",
    "PAYMENTS_REQUIRE_POSTGRES",
    "ALLWAIN_LEGAL_IDENTITY_REQUIRED",
  ]);

  if (code === "UNAUTHORIZED") return 401;
  if (
    code === "FORBIDDEN" ||
    code === "SELLER_ROLE_REQUIRED" ||
    code === "PAYMENT_RECIPIENT_PROFILE_REQUIRED"
  ) {
    return 403;
  }
  if (
    [
      "CONTRACT_NOT_FOUND",
      "ORDER_NOT_FOUND",
      "CONNECT_ACCOUNT_NOT_FOUND",
      "RECURRING_PLAN_NOT_FOUND",
    ].includes(code)
  ) {
    return 404;
  }
  if (badRequest.has(code)) return 400;
  if (conflict.has(code)) return 409;
  if (unavailable.has(code)) return 503;
  return null;
}

function sendPaymentError(error: unknown, res: Response) {
  const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
  const status = allwainPaymentErrorStatus(code);
  if (status !== null) return void res.status(status).json({ error: code });

  console.error("ALLWAIN_PAYMENT_ERROR", error);
  return void res.status(500).json({ error: "INTERNAL_ERROR" });
}

router.get("/config", (_req: Request, res: Response) => {
  res.json(getAllwainPaymentConfig());
});

router.get(
  "/buyer/payment-method",
  authRequired,
  async (req: AuthRequest, res: Response) => {
    try {
      res.json(await getAllwainBuyerPaymentProfile(userIdFrom(req)));
    } catch (error) {
      sendPaymentError(error, res);
    }
  },
);

router.post(
  "/buyer/payment-method/setup",
  authRequired,
  async (req: AuthRequest, res: Response) => {
    try {
      res.json(
        await createAllwainBuyerPaymentSetup(userIdFrom(req), {
          consentAccepted: req.body?.consentAccepted === true,
          consentVersion:
            typeof req.body?.consentVersion === "string"
              ? req.body.consentVersion
              : undefined,
          returnUrl:
            typeof req.body?.returnUrl === "string"
              ? req.body.returnUrl
              : undefined,
          requestId: String((req as any).requestId || "") || undefined,
          clientAddress: req.ip || req.socket.remoteAddress || null,
          userAgent:
            typeof req.headers["user-agent"] === "string"
              ? req.headers["user-agent"]
              : null,
        }),
      );
    } catch (error) {
      sendPaymentError(error, res);
    }
  },
);

router.get("/connect/refresh", async (req: Request, res: Response) => {
  try {
    const token = String(req.query.token || "");
    if (!token) throw new Error("INVALID_CONNECT_REFRESH_TOKEN");
    const url = await refreshAllwainSellerOnboarding(token);
    res.redirect(303, url);
  } catch (error) {
    console.error("ALLWAIN_CONNECT_REFRESH_ERROR", error);
    const returnUrl = new URL(ENV.ALLWAIN_APP_URL);
    returnUrl.searchParams.set("allwain", "connect_error");
    res.redirect(303, returnUrl.toString());
  }
});

router.post("/webhook", async (req: Request, res: Response) => {
  try {
    const signatureHeader = req.headers["stripe-signature"];
    const signature = Array.isArray(signatureHeader)
      ? signatureHeader[0]
      : signatureHeader;
    const rawBody = (req as any).rawBody as Buffer | undefined;
    if (!signature || !rawBody)
      return void res.status(400).json({ error: "INVALID_WEBHOOK" });
    res.json(await processAllwainStripeWebhook(rawBody, signature));
  } catch (error: any) {
    const signatureError =
      error?.type === "StripeSignatureVerificationError" ||
      String(error?.message || "")
        .toLowerCase()
        .includes("signature");
    const errorSummary = {
      requestId: String((req as any).requestId || "") || null,
      name: String(error?.name || "Error").slice(0, 80),
      type: String(error?.type || "").slice(0, 80) || null,
      code: String(error?.code || "").slice(0, 80) || null,
      message: String(error?.message || "WEBHOOK_PROCESSING_FAILED").slice(
        0,
        240,
      ),
    };
    const modeMismatch = error?.message === "STRIPE_LIVEMODE_MISMATCH";
    if (signatureError || modeMismatch) {
      console.warn("ALLWAIN_STRIPE_WEBHOOK_REJECTED", errorSummary);
    } else {
      console.error("ALLWAIN_STRIPE_WEBHOOK_ERROR", errorSummary);
    }
    res.status(signatureError ? 400 : modeMismatch ? 409 : 500).json({
      error: signatureError
        ? "INVALID_WEBHOOK_SIGNATURE"
        : modeMismatch
          ? "STRIPE_LIVEMODE_MISMATCH"
          : "WEBHOOK_PROCESSING_FAILED",
    });
  }
});

router.get(
  "/connect",
  authRequired,
  async (req: AuthRequest, res: Response) => {
    try {
      res.json(await getAllwainSellerPaymentStatus(userIdFrom(req)));
    } catch (error) {
      sendPaymentError(error, res);
    }
  },
);

router.post(
  "/connect/onboarding",
  authRequired,
  async (req: AuthRequest, res: Response) => {
    try {
      res.json(
        await createAllwainSellerOnboarding(
          userIdFrom(req),
          typeof req.body?.returnUrl === "string"
            ? req.body.returnUrl
            : undefined,
        ),
      );
    } catch (error) {
      sendPaymentError(error, res);
    }
  },
);

router.post(
  "/connect/dashboard",
  authRequired,
  async (req: AuthRequest, res: Response) => {
    try {
      res.json(await createAllwainSellerDashboardLink(userIdFrom(req)));
    } catch (error) {
      sendPaymentError(error, res);
    }
  },
);

router.get("/orders", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const list = (value: unknown) =>
      typeof value === "string"
        ? value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : undefined;
    const requestedLimit = Number(req.query.limit);
    const limit = Math.max(
      1,
      Math.min(100, Number.isFinite(requestedLimit) ? requestedLimit : 30),
    );
    const scope =
      req.query.scope === "buyer" || req.query.scope === "seller"
        ? req.query.scope
        : null;
    res.json(
      await listAllwainOrderPageForUser(userIdFrom(req), {
        limit,
        cursor:
          typeof req.query.cursor === "string" ? req.query.cursor : null,
        scope,
        statuses: list(req.query.status),
        paymentStatuses: list(req.query.paymentStatus),
        fulfillmentStatuses: list(req.query.fulfillmentStatus),
      }),
    );
  } catch (error) {
    sendPaymentError(error, res);
  }
});

router.get(
  "/recurring-plans",
  authRequired,
  async (req: AuthRequest, res: Response) => {
    try {
      res.json(await listAllwainRecurringPlansForUser(userIdFrom(req)));
    } catch (error) {
      sendPaymentError(error, res);
    }
  },
);

router.get(
  "/recurring-plans/:id",
  authRequired,
  async (req: AuthRequest, res: Response) => {
    try {
      res.json(
        await getAllwainRecurringPlanForUser(userIdFrom(req), req.params.id),
      );
    } catch (error) {
      sendPaymentError(error, res);
    }
  },
);

router.patch(
  "/recurring-plans/:id",
  authRequired,
  async (req: AuthRequest, res: Response) => {
    try {
      const action = String(req.body?.action || "");
      if (!(["pause", "resume", "cancel"] as const).includes(action as any)) {
        return void res.status(400).json({ error: "INVALID_RECURRING_ACTION" });
      }
      res.json(
        await updateAllwainRecurringPlan(
          userIdFrom(req),
          req.params.id,
          action as "pause" | "resume" | "cancel",
        ),
      );
    } catch (error) {
      sendPaymentError(error, res);
    }
  },
);

router.get("/orders/summary", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const scope = req.query.scope === "seller" ? "seller" : "buyer";
    res.json(await getAllwainOrderSummaryForUser(userIdFrom(req), scope));
  } catch (error) {
    sendPaymentError(error, res);
  }
});

router.get("/orders/:id", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await getAllwainOrderForUser(userIdFrom(req), req.params.id));
  } catch (error) {
    sendPaymentError(error, res);
  }
});

router.post(
  "/orders/:id/status",
  authRequired,
  async (req: AuthRequest, res: Response) => {
    try {
      const actorUserId = userIdFrom(req);
      const action = String(req.body?.action || "");
      const order = await updateAllwainOrderFulfillment(
        actorUserId,
        req.params.id,
        action,
        String((req as any).requestId || "") || undefined,
      );
      const messages: Record<string, [string, string]> = {
        prepare: [
          "Tu pedido se está preparando",
          "El vendedor ya está preparando tu compra.",
        ],
        ready: [
          "Tu pedido está listo",
          "El pedido puede pasar a recogida o reparto.",
        ],
        dispatch: [
          "Tu pedido está en camino",
          "La entrega ha salido hacia su destino.",
        ],
        deliver: [
          "Pedido entregado",
          "La entrega se ha marcado como realizada.",
        ],
        complete: [
          "Pedido finalizado",
          "El comprador ha confirmado que todo ha terminado.",
        ],
      };
      const message = messages[action];
      if (message) {
        await notifyAllwainOrderParticipants(order.id, {
          excludeUserId: actorUserId,
          type: `fulfillment.${action}`,
          title: message[0],
          body: message[1],
          dedupeSuffix: String(order.updatedAt || action),
        });
      }
      res.json(order);
    } catch (error) {
      sendPaymentError(error, res);
    }
  },
);

router.get(
  "/orders/:id/audit",
  authRequired,
  async (req: AuthRequest, res: Response) => {
    try {
      const actorUserId = userIdFrom(req);
      const audit = await getAllwainOrderAudit(actorUserId, req.params.id);
      await appendAllwainAuditEvent({
        aggregateId: req.params.id,
        eventType: "privacy.order_audit_viewed",
        actorUserId,
        source: "allwain_audit_access",
        requestId: String((req as any).requestId || "") || undefined,
        payload: { format: "json" },
      });
      res.json(audit);
    } catch (error) {
      sendPaymentError(error, res);
    }
  },
);

router.get(
  "/orders/:id/audit/pdf",
  authRequired,
  async (req: AuthRequest, res: Response) => {
    try {
      const actorUserId = userIdFrom(req);
      const pdf = await exportAllwainOrderAuditPdf(
        actorUserId,
        req.params.id,
      );
      await appendAllwainAuditEvent({
        aggregateId: req.params.id,
        eventType: "privacy.order_audit_exported",
        actorUserId,
        source: "allwain_audit_access",
        requestId: String((req as any).requestId || "") || undefined,
        payload: { format: "pdf" },
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${pdf.filename}"`,
      );
      res.send(pdf.buffer);
    } catch (error) {
      sendPaymentError(error, res);
    }
  },
);

router.post("/contracts/:id/prepare", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    res.setHeader("Cache-Control", "private, no-store");
    res.json(await prepareAllwainCheckoutReview(userIdFrom(req), req.params.id));
  } catch (error) {
    sendPaymentError(error, res);
  }
});

router.post(
  "/contracts/:id/checkout",
  authRequired,
  async (req: AuthRequest, res: Response) => {
    try {
      res.json(
        await createAllwainCheckout(userIdFrom(req), req.params.id, {
          reservationConsent: req.body?.reservationConsent === true,
          reservationConsentVersion:
            typeof req.body?.reservationConsentVersion === "string"
              ? req.body.reservationConsentVersion
              : undefined,
          commercialTermsAccepted:
            req.body?.commercialTermsAccepted === true,
          commercialTermsVersion:
            typeof req.body?.commercialTermsVersion === "string"
              ? req.body.commercialTermsVersion
              : undefined,
          recurringMandateAccepted:
            req.body?.recurringMandateAccepted === true,
          recurringMandateVersion:
            typeof req.body?.recurringMandateVersion === "string"
              ? req.body.recurringMandateVersion
              : undefined,
          payNow: req.body?.payNow === true,
          reviewedTotalAmount: req.body?.reviewedTotalAmount,
          reviewedCurrency: req.body?.reviewedCurrency,
          returnUrl:
            typeof req.body?.returnUrl === "string"
              ? req.body.returnUrl
              : undefined,
          requestId: String((req as any).requestId || "") || undefined,
          clientAddress: req.ip || req.socket.remoteAddress || null,
          userAgent:
            typeof req.headers["user-agent"] === "string"
              ? req.headers["user-agent"]
              : null,
        }),
      );
    } catch (error) {
      sendPaymentError(error, res);
    }
  },
);

router.post(
  "/orders/:id/cancel",
  authRequired,
  async (req: AuthRequest, res: Response) => {
    try {
      res.json(
        await cancelAllwainOrder(
          userIdFrom(req),
          req.params.id,
          String((req as any).requestId || "") || undefined,
        ),
      );
    } catch (error) {
      sendPaymentError(error, res);
    }
  },
);

router.post(
  "/orders/:id/charge",
  authRequired,
  async (req: AuthRequest, res: Response) => {
    try {
      res.json(
        await chargeAllwainPreorder(
          userIdFrom(req),
          req.params.id,
          String((req as any).requestId || "") || undefined,
        ),
      );
    } catch (error) {
      sendPaymentError(error, res);
    }
  },
);

router.post(
  "/orders/:id/refund",
  authRequired,
  adminOnly,
  async (req: AuthRequest, res: Response) => {
    try {
      const amount =
        req.body?.amount === undefined ? undefined : Number(req.body.amount);
      res.json(
        await refundAllwainOrder(
          userIdFrom(req),
          req.params.id,
          amount,
          String((req as any).requestId || "") || undefined,
        ),
      );
    } catch (error) {
      sendPaymentError(error, res);
    }
  },
);

export default router;
