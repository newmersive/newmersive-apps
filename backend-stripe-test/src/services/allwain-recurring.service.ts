import crypto, { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";
import type { Offer } from "../shared/types";
import {
  appendAllwainAuditEventTx,
  canonicalAllwainAuditJson,
} from "./allwain-audit";
import {
  ensureAllwainOrderComplianceTx,
  prepareAllwainOrderPaymentTx,
} from "./allwain-compliance.service";
import {
  releaseAllwainOfferStock,
  reserveAllwainStock,
} from "./allwain-inventory";
import {
  allwainOfferCheckoutDisabled,
  allwainBusinessOfRecord,
  allwainStripeOnBehalfOfAccount,
  allwainStripeTestCheckoutEnabled,
  allwainStripeTestOfferEnabled,
  initialAllwainOrderSettlement,
  isAllwainStripeTestDetermination,
  normalizeAllwainCommercialModel,
} from "./allwain-money";
import {
  allwainPaymentOperationKey,
  allwainReservationDeadline,
} from "./allwain-payment-state";

export type AllwainRecurringInterval = "weekly" | "biweekly" | "monthly";

export type AllwainRecurringCarrierQuote = {
  id: string;
  shippingOptionCode: string;
  amount: number;
  currency: string;
};

type RequestEvidence = {
  requestId?: string;
  clientAddress?: string | null;
  userAgent?: string | null;
};

function safeJson(value: unknown) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function snapshotHash(value: unknown) {
  return crypto
    .createHash("sha256")
    .update(canonicalAllwainAuditJson(value))
    .digest("hex");
}

function evidenceHash(value: unknown) {
  return crypto
    .createHmac("sha256", ENV.ALLWAIN_AUDIT_HMAC_SECRET)
    .update(canonicalAllwainAuditJson(value))
    .digest("hex");
}

function privateValueHash(value?: string | null) {
  const normalized = String(value || "").trim();
  return normalized ? evidenceHash(normalized) : null;
}

function normalizeInterval(value: unknown): AllwainRecurringInterval {
  if (value === "weekly" || value === "biweekly" || value === "monthly") {
    return value;
  }
  throw new Error("INVALID_RECURRING_ORDER");
}

export function nextAllwainRecurringRunAt(
  from: Date,
  interval: AllwainRecurringInterval,
  monthlyAnchorDay?: number,
) {
  const next = new Date(from);
  if (interval === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  else if (interval === "biweekly") next.setUTCDate(next.getUTCDate() + 14);
  else {
    const originalDay = Math.min(
      31,
      Math.max(1, Math.trunc(monthlyAnchorDay || next.getUTCDate())),
    );
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const lastDay = new Date(
      Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
    ).getUTCDate();
    next.setUTCDate(Math.min(originalDay, lastDay));
  }
  return next;
}

export function allwainRecurringConfigFromContract(contract: any): null | {
  interval: AllwainRecurringInterval;
  label: string;
  deliveryWindow: any;
} {
  const recurringOrder = contract?.deliveryAddress?.recurringOrder;
  if (!recurringOrder || recurringOrder.enabled !== true) return null;
  const interval = normalizeInterval(recurringOrder.interval);
  return {
    interval,
    label:
      interval === "weekly"
        ? "Cada semana"
        : interval === "biweekly"
          ? "Cada 15 dias"
          : "Cada mes",
    deliveryWindow: contract?.deliveryAddress?.deliveryWindow || null,
  };
}

export function selectAllwainRecurringCarrierQuote(input: {
  quotes: AllwainRecurringCarrierQuote[];
  preferredShippingOptionCode?: string | null;
  nonShippingAmount: number;
  maximumChargeAmount: number;
  currency: string;
}) {
  const currency = String(input.currency).toLowerCase();
  const affordable = input.quotes
    .filter(
      (quote) =>
        String(quote.currency).toLowerCase() === currency &&
        Number.isInteger(quote.amount) &&
        quote.amount >= 0 &&
        input.nonShippingAmount + quote.amount <= input.maximumChargeAmount,
    )
    .sort((left, right) => left.amount - right.amount || left.id.localeCompare(right.id));
  if (!affordable.length) {
    throw new Error("RECURRING_CARRIER_PRICE_REAPPROVAL_REQUIRED");
  }
  return (
    affordable.find(
      (quote) =>
        quote.shippingOptionCode === input.preferredShippingOptionCode,
    ) || affordable[0]
  );
}

function firstRecurringRunAt(config: {
  interval: AllwainRecurringInterval;
  deliveryWindow: any;
}) {
  const now = new Date();
  const requestedStart = config.deliveryWindow?.startAt
    ? new Date(config.deliveryWindow.startAt)
    : null;
  const base =
    requestedStart && Number.isFinite(requestedStart.getTime()) && requestedStart > now
      ? requestedStart
      : now;
  return nextAllwainRecurringRunAt(base, config.interval, base.getUTCDate());
}

function recurringMonthlyAnchorDay(plan: any) {
  const preferred = plan?.deliveryWindow?.startAt
    ? new Date(plan.deliveryWindow.startAt)
    : new Date(plan?.mandateAcceptedAt || plan?.createdAt || Date.now());
  return Number.isFinite(preferred.getTime()) ? preferred.getUTCDate() : 1;
}

function recurringPlanDto(plan: any) {
  return {
    id: plan.id,
    sourceOrderId: plan.sourceOrderId,
    offerId: plan.offerId,
    buyerUserId: plan.buyerUserId,
    sellerUserId: plan.sellerUserId,
    commercialModel: plan.commercialModel,
    businessOfRecord: plan.businessOfRecord,
    platformRetainedAmount: plan.platformRetainedAmount,
    status: plan.status,
    interval: plan.interval,
    quantity: plan.quantity,
    unit: plan.unit,
    unitPriceAmount: plan.unitPriceAmount,
    maximumChargeAmount: plan.maximumChargeAmount,
    shippingAmount: plan.shippingAmount,
    connectorPlatformShareAmount: plan.connectorPlatformShareAmount,
    connectorDeliveryAmount: plan.connectorDeliveryAmount,
    carrierDeliveryAmount: plan.carrierDeliveryAmount,
    currency: plan.currency,
    deliveryMethod: plan.deliveryMethod,
    deliveryChannel: plan.deliveryChannel,
    deliveryAddress: plan.deliveryAddress,
    deliveryNotes: plan.deliveryNotes,
    nextRunAt: plan.nextRunAt?.toISOString?.() || plan.nextRunAt || null,
    lastRunAt: plan.lastRunAt?.toISOString?.() || plan.lastRunAt || null,
    pausedAt: plan.pausedAt?.toISOString?.() || plan.pausedAt || null,
    canceledAt: plan.canceledAt?.toISOString?.() || plan.canceledAt || null,
    completedOccurrences: plan.completedOccurrences,
    failedOccurrences: plan.failedOccurrences,
    consecutiveFailures: plan.consecutiveFailures,
    lastFailureCode: plan.lastFailureCode,
    lastFailureMessage: plan.lastFailureMessage,
    paymentMethodReady: Boolean(
      plan.stripeCustomerId && plan.stripePaymentMethodId,
    ),
    createdAt: plan.createdAt?.toISOString?.() || plan.createdAt,
    updatedAt: plan.updatedAt?.toISOString?.() || plan.updatedAt,
    occurrences: Array.isArray(plan.occurrences)
      ? plan.occurrences.map((item: any) => ({
          id: item.id,
          sequence: item.sequence,
          scheduledFor:
            item.scheduledFor?.toISOString?.() || item.scheduledFor,
          status: item.status,
          orderId: item.orderId,
          attempts: item.attempts,
          failureCode: item.failureCode,
          failureMessage: item.failureMessage,
          paidAt: item.paidAt?.toISOString?.() || item.paidAt || null,
        }))
      : undefined,
  };
}

export async function prepareAllwainRecurringPlanTx(
  tx: any,
  input: {
    order: any;
    contract: any;
    buyerUserId: string;
    accepted: boolean;
    mandateVersion?: string;
  } & RequestEvidence,
) {
  const config = allwainRecurringConfigFromContract(input.contract);
  if (!config) return null;

  const existing = await tx.allwainRecurringPlan.findUnique({
    where: { sourceOrderId: input.order.id },
  });
  if (existing) {
    if (
      existing.buyerUserId !== input.buyerUserId ||
      existing.mandateVersion !== ENV.ALLWAIN_RECURRING_MANDATE_VERSION
    ) {
      throw new Error("RECURRING_MANDATE_NOT_VALID");
    }
    return existing;
  }
  if (input.accepted !== true) throw new Error("RECURRING_MANDATE_REQUIRED");
  if (
    input.mandateVersion &&
    input.mandateVersion !== ENV.ALLWAIN_RECURRING_MANDATE_VERSION
  ) {
    throw new Error("RECURRING_MANDATE_VERSION_MISMATCH");
  }

  const nextRunAt = firstRecurringRunAt(config);
  const mandate = {
    version: ENV.ALLWAIN_RECURRING_MANDATE_VERSION,
    sourceOrderId: input.order.id,
    offerId: input.order.offerId,
    buyerUserId: input.order.buyerUserId,
    sellerUserId: input.order.sellerUserId,
    commercialModel: normalizeAllwainCommercialModel(
      input.order.commercialModel,
    ),
    businessOfRecord:
      input.order.businessOfRecord ||
      allwainBusinessOfRecord(
        normalizeAllwainCommercialModel(input.order.commercialModel),
      ),
    paymentProcessor: "stripe",
    paymentMethodStorage: "stripe",
    chargeType: "recurring_off_session",
    interval: config.interval,
    quantityPerDelivery: Number(input.order.quantity),
    unit: input.order.unit,
    unitPriceAmount: Number(input.order.unitPriceAmount),
    maximumChargePerDelivery: Number(input.order.totalAmount),
    currency: String(input.order.currency).toLowerCase(),
    firstAutomaticChargeAt: nextRunAt.toISOString(),
    deliveryMethod: input.order.deliveryMethod || null,
    deliveryChannel: input.order.deliveryChannel || null,
    deliveryAddress: input.order.deliveryAddress || null,
    commercialTermsVersion: ENV.ALLWAIN_COMMERCIAL_TERMS_VERSION,
    cancellationPath: "/api/allwain/payments/recurring-plans/:id",
    statement:
      "The buyer authorizes one charge for each scheduled delivery at the stated frequency and maximum amount. Each delivery creates its own order, payment, stock movement and audit trail. The plan can be paused or canceled before the next charge.",
  };
  const mandateSnapshotHash = snapshotHash(mandate);
  const evidence = {
    mandate,
    mandateSnapshotHash,
    requestId: input.requestId || null,
    clientAddressHash: privateValueHash(input.clientAddress),
    userAgent: String(input.userAgent || "").slice(0, 500) || null,
    capturedBy: "allwain_backend",
  };
  const consentKey = [
    "allwain-recurring-mandate",
    input.order.id,
    input.buyerUserId,
    ENV.ALLWAIN_RECURRING_MANDATE_VERSION,
  ].join(":");
  const consent = await tx.allwainConsentEvidence.create({
    data: {
      userId: input.buyerUserId,
      orderId: input.order.id,
      consentType: "recurring_payment_mandate",
      documentVersion: ENV.ALLWAIN_RECURRING_MANDATE_VERSION,
      granted: true,
      evidence,
      evidenceHash: evidenceHash(evidence),
      idempotencyKey: consentKey,
    },
  });
  const plan = await tx.allwainRecurringPlan.create({
    data: {
      sourceOrderId: input.order.id,
      offerId: input.order.offerId,
      shoppingListId: input.order.shoppingListId || null,
      buyerUserId: input.order.buyerUserId,
      sellerUserId: input.order.sellerUserId,
      commercialModel: normalizeAllwainCommercialModel(
        input.order.commercialModel,
      ),
      businessOfRecord:
        input.order.businessOfRecord ||
        allwainBusinessOfRecord(
          normalizeAllwainCommercialModel(input.order.commercialModel),
        ),
      platformRetainedAmount: input.order.platformRetainedAmount || 0,
      status: "pending_initial_payment",
      interval: config.interval,
      intervalCount: config.interval === "biweekly" ? 2 : 1,
      timezone: "Europe/Madrid",
      quantity: input.order.quantity,
      unit: input.order.unit,
      unitPriceAmount: input.order.unitPriceAmount,
      maximumChargeAmount: input.order.totalAmount,
      shippingAmount: input.order.shippingAmount || 0,
      connectorPlatformShareAmount:
        input.order.connectorPlatformShareAmount || 0,
      connectorDeliveryAmount: input.order.connectorDeliveryAmount || 0,
      carrierDeliveryAmount: input.order.carrierDeliveryAmount || 0,
      currency: input.order.currency,
      platformFeeBps: input.order.platformFeeBps,
      buyerCapacity: input.order.buyerCapacity,
      deliveryMethod: input.order.deliveryMethod,
      deliveryChannel: input.order.deliveryChannel,
      deliveryAddress: safeJson(input.order.deliveryAddress),
      deliveryNotes: input.order.deliveryNotes,
      deliveryWindow: safeJson(config.deliveryWindow),
      commercialTermsVersion: ENV.ALLWAIN_COMMERCIAL_TERMS_VERSION,
      mandateVersion: ENV.ALLWAIN_RECURRING_MANDATE_VERSION,
      mandateAcceptedAt: consent.occurredAt,
      mandateEvidenceHash: consent.evidenceHash,
      mandateSnapshotHash,
      nextRunAt,
    },
  });
  await tx.allwainOrder.update({
    where: { id: input.order.id },
    data: {
      recurringPlanId: plan.id,
      recurringSequence: 0,
      scheduledFor: input.order.createdAt || new Date(),
    },
  });
  await appendAllwainAuditEventTx(tx, {
    aggregateType: "recurring_plan",
    aggregateId: plan.id,
    orderId: input.order.id,
    eventType: "recurring_plan.authorized",
    actorUserId: input.buyerUserId,
    actorRole: "buyer",
    source: "allwain_checkout",
    requestId: input.requestId,
    payload: {
      sourceOrderId: input.order.id,
      interval: config.interval,
      maximumChargeAmount: input.order.totalAmount,
      currency: input.order.currency,
      mandateVersion: plan.mandateVersion,
      mandateEvidenceHash: plan.mandateEvidenceHash,
      mandateSnapshotHash,
      nextRunAt,
    },
  });
  return plan;
}

export async function markAllwainRecurringPaymentSucceededTx(
  tx: any,
  input: { order: any; payment: any; intent: any; providerEventId?: string },
) {
  const planId = input.order.recurringPlanId;
  if (!planId) return null;
  const plan = await tx.allwainRecurringPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new Error("RECURRING_PLAN_NOT_FOUND");

  const paymentMethodId =
    typeof input.intent?.payment_method === "string"
      ? input.intent.payment_method
      : input.intent?.payment_method?.id || input.payment.stripePaymentMethodId;
  const customerId =
    typeof input.intent?.customer === "string"
      ? input.intent.customer
      : input.intent?.customer?.id || input.payment.stripeCustomerId;
  if (!paymentMethodId || !customerId) {
    await tx.allwainRecurringPlan.update({
      where: { id: plan.id },
      data: {
        status: "requires_action",
        lastFailureCode: "RECURRING_PAYMENT_METHOD_MISSING",
        lastFailureMessage: "The successful payment did not expose a reusable payment method.",
      },
    });
    return null;
  }

  const sequence = Number(input.order.recurringSequence || 0);
  if (sequence > 0) {
    const occurrence = await tx.allwainRecurringOccurrence.findUnique({
      where: { orderId: input.order.id },
    });
    if (occurrence && occurrence.status !== "paid") {
      await tx.allwainRecurringOccurrence.update({
        where: { id: occurrence.id },
        data: {
          status: "paid",
          stripePaymentIntentId: input.intent?.id || occurrence.stripePaymentIntentId,
          attempts: Math.max(1, occurrence.attempts),
          failureCode: null,
          failureMessage: null,
          nextRetryAt: null,
          paidAt: new Date(),
          completedAt: new Date(),
        },
      });
      const completedOccurrences = plan.completedOccurrences + 1;
      const completed = Boolean(
        plan.maxOccurrences && completedOccurrences >= plan.maxOccurrences - 1,
      );
      await tx.allwainRecurringPlan.update({
        where: { id: plan.id },
        data: {
          status: completed ? "completed" : "active",
          stripeCustomerId: customerId,
          stripePaymentMethodId: paymentMethodId,
          completedOccurrences,
          consecutiveFailures: 0,
          lastFailureCode: null,
          lastFailureMessage: null,
          lastRunAt: new Date(),
          ...(completed ? { nextRunAt: null, completedAt: new Date() } : {}),
        },
      });
    }
  } else {
    const now = new Date();
    const nextRunAt =
      plan.nextRunAt && new Date(plan.nextRunAt).getTime() > now.getTime()
        ? plan.nextRunAt
        : nextAllwainRecurringRunAt(
            now,
            normalizeInterval(plan.interval),
            recurringMonthlyAnchorDay(plan),
          );
    await tx.allwainRecurringPlan.update({
      where: { id: plan.id },
      data: {
        status: "active",
        stripeCustomerId: customerId,
        stripePaymentMethodId: paymentMethodId,
        consecutiveFailures: 0,
        lastFailureCode: null,
        lastFailureMessage: null,
        nextRunAt,
      },
    });
  }
  await appendAllwainAuditEventTx(tx, {
    aggregateType: "recurring_plan",
    aggregateId: plan.id,
    orderId: input.order.id,
    eventType:
      sequence > 0
        ? "recurring_plan.occurrence_paid"
        : "recurring_plan.activated",
    source: "stripe_payment_succeeded",
    providerEventId: input.providerEventId,
    payload: {
      orderId: input.order.id,
      paymentId: input.payment.id,
      paymentIntentId: input.intent?.id || null,
      sequence,
      nextRunAt: plan.nextRunAt,
    },
  });
  return plan.id;
}

function recurringContractText(plan: any, offer: any, sequence: number) {
  return [
    "ALLWAIN RECURRING DELIVERY",
    "",
    `Delivery number: ${sequence}`,
    `Offer: ${offer.title}`,
    `Quantity: ${plan.quantity} ${plan.unit}`,
    `Unit price: ${(plan.unitPriceAmount / 100).toFixed(2)} ${String(plan.currency).toUpperCase()}`,
    `Maximum authorized charge: ${(plan.maximumChargeAmount / 100).toFixed(2)} ${String(plan.currency).toUpperCase()}`,
    `Frequency: ${plan.interval}`,
    "This delivery has its own order, payment, inventory movement and audit history.",
  ].join("\n");
}

export async function claimAllwainRecurringOccurrence(
  planId: string,
  now = new Date(),
  options: { carrierQuoteId?: string | null } = {},
) {
  const prisma = getPrisma() as any;
  return prisma.$transaction(async (tx: any) => {
    const planRows = (await tx.$queryRaw(
      Prisma.sql`SELECT * FROM "AllwainRecurringPlan" WHERE "id" = ${planId} FOR UPDATE`,
    )) as any[];
    const plan = planRows[0];
    if (!plan) throw new Error("RECURRING_PLAN_NOT_FOUND");
    if (plan.status !== "active") return null;
    if (!plan.nextRunAt || new Date(plan.nextRunAt) > now) return null;
    if (
      plan.commercialTermsVersion !== ENV.ALLWAIN_COMMERCIAL_TERMS_VERSION ||
      plan.mandateVersion !== ENV.ALLWAIN_RECURRING_MANDATE_VERSION
    ) {
      await tx.allwainRecurringPlan.update({
        where: { id: plan.id },
        data: {
          status: "requires_action",
          lastFailureCode: "RECURRING_TERMS_CHANGED",
          lastFailureMessage: "The recurring plan requires renewed consent.",
        },
      });
      throw new Error("RECURRING_TERMS_CHANGED");
    }
    if (!plan.stripeCustomerId || !plan.stripePaymentMethodId) {
      throw new Error("RECURRING_PAYMENT_METHOD_MISSING");
    }
    const commercialModel = normalizeAllwainCommercialModel(
      plan.commercialModel,
    );
    const platformDirect = commercialModel === "platform_direct";
    const businessOfRecord = allwainBusinessOfRecord(commercialModel);

    const [sourceOrder, seller, sourceDetermination] = await Promise.all([
      tx.allwainOrder.findUnique({
        where: { id: plan.sourceOrderId },
        include: { carrierQuote: true },
      }),
      tx.allwainSellerPaymentAccount.findUnique({
        where: { userId: plan.sellerUserId },
      }),
      tx.allwainTaxDetermination.findUnique({
        where: { orderId: plan.sourceOrderId },
        select: { treatmentCode: true },
      }),
    ]);
    const resolvedSourceContract = sourceOrder
      ? await tx.contract.findUnique({ where: { id: sourceOrder.contractId } })
      : null;
    if (!sourceOrder || !resolvedSourceContract) {
      throw new Error("RECURRING_SOURCE_ORDER_MISSING");
    }
    if (
      isAllwainStripeTestDetermination(sourceDetermination) &&
      !allwainStripeTestCheckoutEnabled()
    ) {
      throw new Error("STRIPE_TEST_ORDER_REQUIRES_TEST_MODE");
    }

    let carrierQuote: any = null;
    if (plan.deliveryChannel === "carrier") {
      if (!options.carrierQuoteId || !sourceOrder.carrierQuote) {
        throw new Error("RECURRING_CARRIER_QUOTE_REQUIRED");
      }
      carrierQuote = await tx.allwainCarrierQuote.findUnique({
        where: { id: options.carrierQuoteId },
      });
      const exactQuantity =
        carrierQuote &&
        Math.abs(Number(carrierQuote.quantity) - Number(plan.quantity)) <
          0.000001;
      if (
        !carrierQuote ||
        carrierQuote.status !== "quoted" ||
        new Date(carrierQuote.expiresAt).getTime() <= now.getTime() ||
        carrierQuote.requestFingerprint !==
          sourceOrder.carrierQuote.requestFingerprint ||
        carrierQuote.buyerUserId !== plan.buyerUserId ||
        carrierQuote.sellerUserId !== plan.sellerUserId ||
        carrierQuote.offerId !== plan.offerId ||
        !exactQuantity ||
        carrierQuote.unit !== plan.unit ||
        String(carrierQuote.currency).toLowerCase() !==
          String(plan.currency).toLowerCase()
      ) {
        throw new Error("RECURRING_CARRIER_QUOTE_MISMATCH");
      }
    }

    const offerRows = (await tx.$queryRaw(
      Prisma.sql`SELECT * FROM "Offer" WHERE "id" = ${plan.offerId} AND "owner" = 'allwain' FOR UPDATE`,
    )) as any[];
    const offer = offerRows[0] as Offer | undefined;
    if (!offer || offer.ownerUserId !== plan.sellerUserId) {
      throw new Error("OFFER_NOT_FOUND");
    }
    if (allwainOfferCheckoutDisabled(offer)) {
      throw new Error("DEMO_OFFER_READ_ONLY");
    }
    const testOnlyTransaction = allwainStripeTestOfferEnabled(offer);
    if (
      !testOnlyTransaction &&
      !platformDirect &&
      (!seller?.stripeAccountId ||
        !seller.chargesEnabled ||
        !seller.transfersEnabled ||
        !seller.payoutsEnabled)
    ) {
      throw new Error("SELLER_PAYMENTS_NOT_READY");
    }
    if (offer.allwainStatus && !["active", "sold_out"].includes(offer.allwainStatus)) {
      throw new Error("OFFER_NOT_AVAILABLE");
    }
    const reservation = reserveAllwainStock(offer, Number(plan.quantity));
    if (reservation.inventory.managed) {
      await tx.offer.update({
        where: { id: offer.id },
        data: {
          meta: reservation.meta,
          allwainStatus:
            reservation.inventory.availableQuantity === 0
              ? "sold_out"
              : offer.allwainStatus || "active",
        },
      });
    }

    const lastOccurrence = await tx.allwainRecurringOccurrence.findFirst({
      where: { planId: plan.id },
      orderBy: { sequence: "desc" },
    });
    const sequence = Number(lastOccurrence?.sequence || 0) + 1;
    const scheduledFor = new Date(plan.nextRunAt);
    const nextRunAt = nextAllwainRecurringRunAt(
      scheduledFor,
      normalizeInterval(plan.interval),
      recurringMonthlyAnchorDay(plan),
    );
    const subtotalAmount = Math.round(
      Number(plan.unitPriceAmount) * Number(plan.quantity),
    );
    const platformFeeAmount = platformDirect
      ? 0
      : Math.round(
          (subtotalAmount * Number(plan.platformFeeBps)) / 10_000,
        );
    const shippingAmount = carrierQuote
      ? Number(carrierQuote.amount)
      : Number(plan.shippingAmount || 0);
    const connectorPlatformShareAmount = platformDirect
      ? 0
      : Number(plan.connectorPlatformShareAmount || 0);
    const connectorDeliveryAmount = Number(
      plan.connectorDeliveryAmount || 0,
    );
    const carrierDeliveryAmount = carrierQuote
      ? Number(carrierQuote.amount)
      : Number(plan.carrierDeliveryAmount || 0);
    const connectorFeeAmount =
      connectorPlatformShareAmount + connectorDeliveryAmount;
    const platformNetFeeAmount =
      platformFeeAmount - connectorPlatformShareAmount;
    const sellerAmount = platformDirect
      ? 0
      : subtotalAmount - platformFeeAmount;
    const platformRetainedAmount = platformDirect
      ? subtotalAmount
      : platformNetFeeAmount;
    const totalAmount = subtotalAmount + shippingAmount;
    const contractId = randomUUID();
    const orderId = randomUUID();
    const contract = await tx.contract.create({
      data: {
        id: contractId,
        app: "allwain",
        type: "recurring_purchase_offer",
        status: "accepted",
        offerId: plan.offerId,
        shoppingListId: plan.shoppingListId || null,
        purchaseKey: `allwain:recurring:${plan.id}:${sequence}`,
        requesterUserId: plan.buyerUserId,
        providerUserId: plan.sellerUserId,
        offerTitle: resolvedSourceContract.offerTitle || offer.title,
        requesterName: resolvedSourceContract.requesterName,
        providerName: resolvedSourceContract.providerName,
        quantity: plan.quantity,
        unit: plan.unit,
        unitPrice: plan.unitPriceAmount / 100,
        totalPrice: totalAmount / 100,
        currency: plan.currency,
        subtotalAmount,
        shippingAmount,
        platformFeeBps: plan.platformFeeBps,
        platformFeeAmount,
        platformNetFeeAmount,
        platformRetainedAmount,
        connectorFeeAmount,
        connectorPlatformShareAmount,
        connectorDeliveryAmount,
        carrierDeliveryAmount,
        carrierQuoteId: carrierQuote?.id || null,
        sellerAmount,
        commercialModel,
        businessOfRecord,
        buyerCapacity: plan.buyerCapacity,
        paymentMode: "immediate",
        paymentStatus: "payment_processing",
        inventoryStatus: reservation.inventory.managed ? "reserved" : null,
        deliveryMethod: plan.deliveryMethod,
        deliveryChannel: plan.deliveryChannel,
        deliveryAddress: safeJson(plan.deliveryAddress),
        deliveryNotes: plan.deliveryNotes,
        deliveryPricingSnapshot: {
          version: "allwain-delivery-pricing-v1",
          channel: plan.deliveryChannel,
          currency: plan.currency,
          shippingAmount,
          connectorPlatformShareAmount,
          connectorDeliveryAmount,
          carrierDeliveryAmount,
          carrierQuoteId: carrierQuote?.id || null,
          carrierName: carrierQuote?.carrierName || null,
          carrierServiceName: carrierQuote?.serviceName || null,
          carrierShippingOptionCode:
            carrierQuote?.shippingOptionCode || null,
          carrierQuoteExpiresAt:
            carrierQuote?.expiresAt?.toISOString?.() ||
            carrierQuote?.expiresAt ||
            null,
          connectorFeeAmount,
          platformNetFeeAmount,
          recurringPlanId: plan.id,
        },
        notes: `Recurring delivery ${sequence}: ${plan.quantity} ${plan.unit}`,
        description: offer.description,
        templateId: "allwain-offer-recurring",
        templateVersion: "1.0.0",
        requesterAcceptedAt: plan.mandateAcceptedAt,
        providerAcceptedAt: new Date(),
        generatedText: recurringContractText(plan, offer, sequence),
      },
    });
    let order = await tx.allwainOrder.create({
      data: {
        id: orderId,
        contractId: contract.id,
        offerId: plan.offerId,
        shoppingListId: plan.shoppingListId || null,
        buyerUserId: plan.buyerUserId,
        sellerUserId: plan.sellerUserId,
        paymentMode: "immediate",
        status: "payment_processing",
        paymentStatus: "payment_processing",
        fulfillmentStatus: "not_started",
        buyerCapacity: plan.buyerCapacity,
        quantity: plan.quantity,
        unit: plan.unit,
        unitPriceAmount: plan.unitPriceAmount,
        subtotalAmount,
        shippingAmount,
        totalAmount,
        currency: plan.currency,
        platformFeeBps: plan.platformFeeBps,
        platformFeeAmount,
        platformRetainedAmount,
        sellerAmount,
        commercialModel,
        commercialTermsVersion: plan.commercialTermsVersion,
        businessOfRecord,
        processorFeePayer: "platform",
        ...initialAllwainOrderSettlement(platformFeeAmount, {
          platformNetFeeAmount,
          connectorFeeAmount,
          connectorPlatformShareAmount,
          connectorDeliveryAmount,
          carrierDeliveryAmount,
        }, commercialModel),
        ...(testOnlyTransaction
          ? {
              sellerTransferStatus: "not_required",
              connectorTransferStatus: "not_required",
              transferStatus: "not_required",
            }
          : {}),
        carrierQuoteId: carrierQuote?.id || null,
        inventoryStatus: reservation.inventory.managed ? "reserved" : "not_managed",
        deliveryMethod: plan.deliveryMethod,
        deliveryChannel: plan.deliveryChannel,
        deliveryAddress: safeJson(plan.deliveryAddress),
        deliveryNotes: plan.deliveryNotes,
        deliveryPricingSnapshot: {
          version: "allwain-delivery-pricing-v1",
          channel: plan.deliveryChannel,
          currency: plan.currency,
          shippingAmount,
          connectorPlatformShareAmount,
          connectorDeliveryAmount,
          carrierDeliveryAmount,
          carrierQuoteId: carrierQuote?.id || null,
          carrierName: carrierQuote?.carrierName || null,
          carrierServiceName: carrierQuote?.serviceName || null,
          carrierShippingOptionCode:
            carrierQuote?.shippingOptionCode || null,
          carrierQuoteExpiresAt:
            carrierQuote?.expiresAt?.toISOString?.() ||
            carrierQuote?.expiresAt ||
            null,
          connectorFeeAmount,
          platformNetFeeAmount,
          recurringPlanId: plan.id,
        },
        recurringPlanId: plan.id,
        recurringSequence: sequence,
        scheduledFor,
        reservationExpiresAt: allwainReservationDeadline(now),
      },
    });
    await tx.allwainOrderStatusEvent.create({
      data: {
        orderId: order.id,
        toStatus: order.status,
        source: "recurring_scheduler",
        metadata: { recurringPlanId: plan.id, sequence, scheduledFor },
      },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateId: order.id,
      eventType: "order.created_from_recurring_plan",
      source: "recurring_scheduler",
      payload: {
        recurringPlanId: plan.id,
        sequence,
        scheduledFor,
        contractId: contract.id,
        offerId: plan.offerId,
        quantity: plan.quantity,
        unit: plan.unit,
        subtotalAmount,
        shippingAmount,
        totalAmount,
        inventoryStatus: order.inventoryStatus,
      },
    });
    await ensureAllwainOrderComplianceTx(tx, order);
    order = await tx.allwainOrder.findUnique({ where: { id: order.id } });
    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (Number(order.totalAmount) > Number(plan.maximumChargeAmount)) {
      throw new Error("RECURRING_AMOUNT_EXCEEDS_MANDATE");
    }
    if (carrierQuote) {
      await tx.allwainCarrierQuote.update({
        where: { id: carrierQuote.id },
        data: { status: "selected", selectedAt: now },
      });
    }

    const derivedTerms = {
      recurringPlanId: plan.id,
      sourceOrderId: plan.sourceOrderId,
      occurrenceSequence: sequence,
      scheduledFor: scheduledFor.toISOString(),
      mandateVersion: plan.mandateVersion,
      mandateEvidenceHash: plan.mandateEvidenceHash,
      mandateSnapshotHash: plan.mandateSnapshotHash,
      commercialTermsVersion: plan.commercialTermsVersion,
      order: {
        orderId: order.id,
        offerId: order.offerId,
        buyerUserId: order.buyerUserId,
        sellerUserId: order.sellerUserId,
        quantity: order.quantity,
        unit: order.unit,
        unitPriceAmount: order.unitPriceAmount,
        totalAmount: order.totalAmount,
        currency: order.currency,
        deliveryChannel: order.deliveryChannel,
        settlementPlanVersion: order.settlementPlanVersion,
        settlementSnapshotHash: order.settlementSnapshotHash,
      },
    };
    const derivedEvidence = {
      recurringPlanId: plan.id,
      derivedFromMandateEvidenceHash: plan.mandateEvidenceHash,
      terms: derivedTerms,
      termsHash: snapshotHash(derivedTerms),
      capturedBy: "allwain_recurring_scheduler",
    };
    const derivedConsent = await tx.allwainConsentEvidence.create({
      data: {
        userId: plan.buyerUserId,
        orderId: order.id,
        consentType: "recurring_occurrence_terms",
        documentVersion: plan.commercialTermsVersion,
        granted: true,
        evidence: derivedEvidence,
        evidenceHash: evidenceHash(derivedEvidence),
        idempotencyKey: [
          "allwain-commercial-terms",
          order.id,
          plan.buyerUserId,
          plan.commercialTermsVersion,
        ].join(":"),
      },
    });
    await tx.allwainOrder.update({
      where: { id: order.id },
      data: {
        commercialTermsAcceptedAt: derivedConsent.occurredAt,
        commercialTermsSnapshotHash: derivedConsent.evidenceHash,
      },
    });
    const prepared = await prepareAllwainOrderPaymentTx(tx, {
      orderId: order.id,
      buyerUserId: plan.buyerUserId,
      commercialTermsAccepted: false,
      recurringPlanId: plan.id,
    });
    if (Boolean(prepared.testOnlyNonFiscal) !== testOnlyTransaction) {
      throw new Error("STRIPE_TEST_ORDER_MARKER_MISMATCH");
    }
    order = prepared.order;
    const payment = await tx.allwainPayment.create({
      data: {
        orderId: order.id,
        kind: "recurring_charge",
        status: "processing",
        operationKey: allwainPaymentOperationKey(
          order.id,
          "recurring_charge",
          1,
        ),
        amount: order.totalAmount,
        currency: order.currency,
        platformFeeAmount: order.platformFeeAmount,
        platformNetFeeAmount:
          order.platformNetFeeAmount ?? order.platformFeeAmount,
        platformRetainedAmount:
          order.platformRetainedAmount ??
          order.platformNetFeeAmount ??
          order.platformFeeAmount,
        sellerAmount: order.sellerAmount,
        commercialModel,
        businessOfRecord,
        connectorFeeAmount: order.connectorFeeAmount || 0,
        connectorPlatformShareAmount:
          order.connectorPlatformShareAmount || 0,
        connectorDeliveryAmount: order.connectorDeliveryAmount || 0,
        carrierDeliveryAmount: order.carrierDeliveryAmount || 0,
        settlementPlanId: prepared.settlement.id,
        settlementPlanVersion: prepared.settlement.version,
        settlementSnapshotHash: prepared.settlement.snapshotHash,
        onBehalfOfStripeAccountId: allwainStripeOnBehalfOfAccount(
          commercialModel,
          seller?.stripeAccountId,
          testOnlyTransaction,
        ),
        sellerTransferStatus:
          platformDirect || testOnlyTransaction ? "not_required" : "not_started",
        connectorTransferStatus: testOnlyTransaction
          ? "not_required"
          : order.connectorTransferStatus || "not_required",
        processorFeePayer: "platform",
        stripeCustomerId: plan.stripeCustomerId,
        stripePaymentMethodId: plan.stripePaymentMethodId,
        metadata: {
          recurringPlanId: plan.id,
          recurringSequence: sequence,
          scheduledFor: scheduledFor.toISOString(),
          mandateVersion: plan.mandateVersion,
          mandateEvidenceHash: plan.mandateEvidenceHash,
          settlementPlanId: prepared.settlement.id,
          settlementPlanVersion: prepared.settlement.version,
          settlementSnapshotHash: prepared.settlement.snapshotHash,
          commercialModel,
          businessOfRecord,
          testOnlyNonFiscal: testOnlyTransaction,
        },
      },
    });
    const occurrence = await tx.allwainRecurringOccurrence.create({
      data: {
        planId: plan.id,
        sequence,
        scheduledFor,
        status: "processing",
        orderId: order.id,
        paymentId: payment.id,
        idempotencyKey: `allwain:recurring:${plan.id}:${sequence}`,
        attempts: 1,
        startedAt: now,
      },
    });
    await tx.allwainRecurringPlan.update({
      where: { id: plan.id },
      data: { nextRunAt },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateType: "recurring_plan",
      aggregateId: plan.id,
      orderId: order.id,
      eventType: "recurring_plan.occurrence_claimed",
      source: "recurring_scheduler",
      payload: {
        occurrenceId: occurrence.id,
        orderId: order.id,
        paymentId: payment.id,
        sequence,
        scheduledFor,
        nextRunAt,
        amount: order.totalAmount,
        currency: order.currency,
        carrierQuoteId: carrierQuote?.id || null,
      },
    });
    return {
      plan,
      occurrence,
      order,
      payment,
      seller,
      testOnlyNonFiscal: testOnlyTransaction,
    };
  });
}

export async function failAllwainRecurringOccurrence(input: {
  orderId: string;
  paymentId: string;
  paymentIntentId?: string | null;
  requiresAction: boolean;
  code?: string | null;
  message?: string | null;
}) {
  const prisma = getPrisma() as any;
  return prisma.$transaction(async (tx: any) => {
    const orderRows = (await tx.$queryRaw(
      Prisma.sql`SELECT * FROM "AllwainOrder" WHERE "id" = ${input.orderId} FOR UPDATE`,
    )) as any[];
    const order = orderRows[0];
    if (!order?.recurringPlanId) return null;
    const occurrence = await tx.allwainRecurringOccurrence.findUnique({
      where: { orderId: order.id },
    });
    if (!occurrence || occurrence.status === "paid") return occurrence;

    let inventoryStatus = order.inventoryStatus;
    if (inventoryStatus === "reserved") {
      const offerRows = (await tx.$queryRaw(
        Prisma.sql`SELECT * FROM "Offer" WHERE "id" = ${order.offerId} FOR UPDATE`,
      )) as any[];
      const offer = offerRows[0] as Offer | undefined;
      if (offer) {
        await tx.offer.update({
          where: { id: offer.id },
          data: {
            meta: releaseAllwainOfferStock(offer, Number(order.quantity)),
            allwainStatus:
              offer.allwainStatus === "sold_out" ? "active" : offer.allwainStatus,
          },
        });
        inventoryStatus = "released";
      }
    }
    const status = input.requiresAction ? "requires_customer_action" : "payment_failed";
    const failureMessage = String(input.message || "Recurring payment failed").slice(
      0,
      500,
    );
    await tx.allwainPayment.update({
      where: { id: input.paymentId },
      data: {
        status,
        stripePaymentIntentId: input.paymentIntentId || undefined,
        failureCode: input.code || null,
        failureMessage,
      },
    });
    await tx.allwainOrder.update({
      where: { id: order.id },
      data: { status, paymentStatus: status, inventoryStatus },
    });
    await tx.contract.update({
      where: { id: order.contractId },
      data: { paymentStatus: status, inventoryStatus, updatedAt: new Date() },
    });
    const updatedOccurrence = await tx.allwainRecurringOccurrence.update({
      where: { id: occurrence.id },
      data: {
        status: input.requiresAction ? "requires_action" : "failed",
        stripePaymentIntentId: input.paymentIntentId || undefined,
        failureCode: input.code || null,
        failureMessage,
        nextRetryAt: null,
      },
    });
    await tx.allwainRecurringPlan.update({
      where: { id: order.recurringPlanId },
      data: {
        status: "requires_action",
        failedOccurrences: { increment: 1 },
        consecutiveFailures: { increment: 1 },
        lastFailureCode: input.code || status,
        lastFailureMessage: failureMessage,
      },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateType: "recurring_plan",
      aggregateId: order.recurringPlanId,
      orderId: order.id,
      eventType: input.requiresAction
        ? "recurring_plan.customer_action_required"
        : "recurring_plan.occurrence_failed",
      source: "stripe_recurring_charge",
      payload: {
        occurrenceId: occurrence.id,
        orderId: order.id,
        paymentId: input.paymentId,
        paymentIntentId: input.paymentIntentId || null,
        failureCode: input.code || null,
        inventoryStatus,
      },
    });
    return updatedOccurrence;
  });
}

export async function recordAllwainRecurringPlanFailure(
  planId: string,
  error: unknown,
) {
  const code = error instanceof Error ? error.message : "RECURRING_CHARGE_FAILED";
  const message = String(error instanceof Error ? error.message : error).slice(0, 500);
  const prisma = getPrisma() as any;
  const result = await prisma.$transaction(async (tx: any) => {
    const rows = (await tx.$queryRaw(
      Prisma.sql`SELECT * FROM "AllwainRecurringPlan" WHERE "id" = ${planId} FOR UPDATE`,
    )) as any[];
    const plan = rows[0];
    if (!plan || plan.status !== "active") return null;
    const lastOccurrence = await tx.allwainRecurringOccurrence.findFirst({
      where: { planId },
      orderBy: { sequence: "desc" },
    });
    const sequence = Number(lastOccurrence?.sequence || 0) + 1;
    const scheduledFor = new Date(plan.nextRunAt || new Date());
    const occurrence = await tx.allwainRecurringOccurrence.create({
      data: {
        planId,
        sequence,
        scheduledFor,
        status: "failed",
        idempotencyKey: `allwain:recurring:${planId}:${sequence}`,
        attempts: 1,
        failureCode: code,
        failureMessage: message,
        startedAt: new Date(),
      },
    });
    await tx.allwainRecurringPlan.update({
      where: { id: planId },
      data: {
        status: "requires_action",
        failedOccurrences: { increment: 1 },
        consecutiveFailures: { increment: 1 },
        lastFailureCode: code,
        lastFailureMessage: message,
      },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateType: "recurring_plan",
      aggregateId: planId,
      eventType: "recurring_plan.scheduling_failed",
      source: "recurring_scheduler",
      payload: { occurrenceId: occurrence.id, sequence, scheduledFor, code },
    });
    return occurrence;
  });
  return result;
}

export async function listAllwainRecurringPlansForUser(userId: string) {
  const prisma = getPrisma() as any;
  const plans = await prisma.allwainRecurringPlan.findMany({
    where: { OR: [{ buyerUserId: userId }, { sellerUserId: userId }] },
    include: { occurrences: { orderBy: { sequence: "desc" }, take: 20 } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return { items: plans.map(recurringPlanDto) };
}

export async function listAllwainRecurringPlansForAdmin(input: {
  limit?: number;
  status?: string | null;
} = {}) {
  const prisma = getPrisma() as any;
  const limit = Math.min(200, Math.max(1, Number(input.limit || 100)));
  const plans = await prisma.allwainRecurringPlan.findMany({
    where: input.status ? { status: input.status } : undefined,
    include: { occurrences: { orderBy: { sequence: "desc" }, take: 5 } },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  return { items: plans.map(recurringPlanDto) };
}

export async function updateAllwainRecurringPlan(
  userId: string,
  planId: string,
  action: "pause" | "resume" | "cancel",
) {
  const prisma = getPrisma() as any;
  const updated = await prisma.$transaction(async (tx: any) => {
    const rows = (await tx.$queryRaw(
      Prisma.sql`SELECT * FROM "AllwainRecurringPlan" WHERE "id" = ${planId} FOR UPDATE`,
    )) as any[];
    const plan = rows[0];
    if (!plan || ![plan.buyerUserId, plan.sellerUserId].includes(userId)) {
      throw new Error("RECURRING_PLAN_NOT_FOUND");
    }
    const processing = await tx.allwainRecurringOccurrence.findFirst({
      where: { planId, status: "processing" },
    });
    if (processing) throw new Error("RECURRING_CHARGE_IN_PROGRESS");
    if (plan.status === "canceled" || plan.status === "completed") {
      throw new Error("RECURRING_PLAN_TERMINAL");
    }
    const now = new Date();
    let data: Record<string, unknown>;
    if (action === "pause") {
      data = { status: "paused", pausedAt: now };
    } else if (action === "cancel") {
      data = { status: "canceled", canceledAt: now, nextRunAt: null };
    } else {
      if (
        plan.mandateVersion !== ENV.ALLWAIN_RECURRING_MANDATE_VERSION ||
        plan.commercialTermsVersion !== ENV.ALLWAIN_COMMERCIAL_TERMS_VERSION
      ) {
        throw new Error("RECURRING_TERMS_CHANGED");
      }
      const paymentProfile = await tx.allwainBuyerPaymentProfile.findUnique({
        where: { userId: plan.buyerUserId },
      });
      const paymentMethodId =
        paymentProfile?.defaultPaymentMethodId || plan.stripePaymentMethodId;
      const customerId = paymentProfile?.stripeCustomerId || plan.stripeCustomerId;
      if (!paymentMethodId || !customerId) {
        throw new Error("RECURRING_PAYMENT_METHOD_MISSING");
      }
      data = {
        status: "active",
        pausedAt: null,
        stripeCustomerId: customerId,
        stripePaymentMethodId: paymentMethodId,
        nextRunAt:
          !plan.nextRunAt || new Date(plan.nextRunAt) <= now
            ? nextAllwainRecurringRunAt(
                now,
                normalizeInterval(plan.interval),
                recurringMonthlyAnchorDay(plan),
              )
            : plan.nextRunAt,
        consecutiveFailures: 0,
        lastFailureCode: null,
        lastFailureMessage: null,
      };
    }
    const saved = await tx.allwainRecurringPlan.update({
      where: { id: planId },
      data,
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateType: "recurring_plan",
      aggregateId: planId,
      eventType: `recurring_plan.${action}d`,
      actorUserId: userId,
      actorRole: userId === plan.buyerUserId ? "buyer" : "seller",
      source: "recurring_plan_controls",
      payload: {
        previousStatus: plan.status,
        nextStatus: saved.status,
        nextRunAt: saved.nextRunAt,
      },
    });
    return saved;
  });
  return recurringPlanDto(updated);
}

export async function dueAllwainRecurringPlanIds(now = new Date(), limit = 25) {
  const prisma = getPrisma() as any;
  const rows = await prisma.allwainRecurringPlan.findMany({
    where: { status: "active", nextRunAt: { lte: now } },
    select: { id: true },
    orderBy: { nextRunAt: "asc" },
    take: Math.min(100, Math.max(1, limit)),
  });
  return rows.map((row: any) => row.id as string);
}

export async function getAllwainRecurringPlanForUser(
  userId: string,
  planId: string,
) {
  const prisma = getPrisma() as any;
  const plan = await prisma.allwainRecurringPlan.findFirst({
    where: {
      id: planId,
      OR: [{ buyerUserId: userId }, { sellerUserId: userId }],
    },
    include: { occurrences: { orderBy: { sequence: "desc" }, take: 100 } },
  });
  if (!plan) throw new Error("RECURRING_PLAN_NOT_FOUND");
  return recurringPlanDto(plan);
}
