import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import Stripe from "stripe";
import { ENV, allwainPublicationCardRequired } from "../config/env";
import { getPrisma } from "../db/prisma";
import {
  getAllwainSellerCommercialModel,
  isAllwainPaymentOnboardingAllowed,
} from "./allwain-participation.service";
import { Offer } from "../shared/types";
import {
  commitAllwainStock,
  releaseAllwainOfferStock,
  reserveAllwainStock,
} from "./allwain-inventory";
import {
  allwainOfferCheckoutDisabled,
  allwainPaymentsConfigured,
  allwainLegalReleaseMatchesStripeMode,
  allwainBusinessOfRecord,
  allwainStripeOnBehalfOfAccount,
  allwainStripeCheckoutCollectionConfig,
  allwainStripeTestCheckoutEnabled,
  allwainStripeTestOfferEnabled,
  allwainStripeModeMatchesConfiguration,
  calculateAllwainRefundAllocation,
  getAllwainDeliveryPricingConfig,
  initialAllwainOrderSettlement,
  normalizeAllwainCommercialModel,
  normalizeAllwainConnectorFeeBps,
  normalizeAllwainFeeBps,
  isAllwainStripeTestDetermination,
  allwainTransferStateAfterSuccessfulCharge,
} from "./allwain-money";
import {
  appendAllwainAuditEvent,
  appendAllwainAuditEventTx,
  canonicalAllwainAuditJson,
  ensureAllwainAuditBaselines,
  verifyAllwainAuditChain,
} from "./allwain-audit";
import {
  notifyAllwainOrderParticipants,
  notifyAllwainUser,
} from "./allwain-notifications.service";
import {
  PAID_PAYMENT_STATUSES,
  allwainPaymentStatusAfterSuccessfulCharge,
  allwainPaymentOperationKey,
  allwainReservationDeadline,
  canApplyCheckoutStatusToAllwainPaymentRecord,
  canTransitionAllwainFulfillment,
  canTransitionAllwainPayment,
  deriveAllwainRefundPaymentStatus,
  deriveAllwainOrderStatus,
  isAllwainActiveDispute,
  isAllwainReservationReleaseable,
} from "./allwain-payment-state";
import { buildTextPdf } from "./pdf.service";
import {
  ensureAllwainOperationalDocumentTx,
  ensureAllwainRequiredFiscalDocumentsTx,
  ensureAllwainOrderComplianceTx,
  allwainSettlementDocumentsReady,
  hasActiveAllwainDocumentMandate,
  isAllwainFiscalProfileReady,
  prepareAllwainOrderPaymentTx,
  recordAllwainPaymentLedgerTx,
  recordAllwainRefundLedgerTx,
  recordAllwainTransferReversalTx,
  recordAllwainTransferTx,
} from "./allwain-compliance.service";
import {
  AllwainReconciliationDifference,
  compareAllwainDisputeWithStripe,
  compareAllwainPaymentWithStripe,
  compareAllwainPayoutWithStripe,
  compareAllwainRefundWithStripe,
  compareAllwainTransferWithStripe,
  missingAllwainProviderObject,
  untrackedAllwainProviderObject,
} from "./allwain-reconciliation";
import {
  listActiveAllwainShoppingListAwardLines,
  refreshAllwainShoppingListAwardStateTx,
} from "./allwain-shopping-list-awards";
import {
  allwainPreorderReminderStage,
  isAllwainSavedPreorderPastDeadline,
  normalizeAllwainPreorderChargeDeadline,
  shouldAdvanceAllwainPreorderReminder,
  type AllwainPreorderReminderStage,
} from "./allwain-preorders";
import {
  allwainRecurringConfigFromContract,
  claimAllwainRecurringOccurrence,
  dueAllwainRecurringPlanIds,
  failAllwainRecurringOccurrence,
  markAllwainRecurringPaymentSucceededTx,
  prepareAllwainRecurringPlanTx,
  recordAllwainRecurringPlanFailure,
  selectAllwainRecurringCarrierQuote,
} from "./allwain-recurring.service";
import { createAllwainCarrierQuotes } from "./allwain-shipping.service";
import { allwainOfferCardImageMeta } from "./allwain-card-images.service";
import {
  allwainConfirmedStripeShipping,
  allwainDeliveryAddressFromCheckout,
  hasConfirmedAllwainPurchaseDetails,
} from "./allwain-purchase-details";

const ACCOUNT_INCLUDES = [
  "configuration.merchant",
  "configuration.recipient",
  "requirements",
  "future_requirements",
  "identity",
] as const;

let stripeClient: Stripe | null = null;

function requirePostgres() {
  if (ENV.STORAGE_DRIVER !== "postgres")
    throw new Error("PAYMENTS_REQUIRE_POSTGRES");
}

function getStripe() {
  if (!ENV.STRIPE_SECRET_KEY) throw new Error("STRIPE_NOT_CONFIGURED");
  if (!stripeClient) {
    stripeClient = new Stripe(ENV.STRIPE_SECRET_KEY, {
      appInfo: { name: "Allwain Marketplace", version: "1.0.0" },
      maxNetworkRetries: 2,
      timeout: 15_000,
    });
  }
  return stripeClient;
}

function requirePaymentsReady() {
  requirePostgres();
  normalizeAllwainFeeBps();
  if (!allwainPaymentsConfigured())
    throw new Error("ALLWAIN_PAYMENTS_NOT_CONFIGURED");
  return getStripe();
}

function requireHttpsUrl(value: string, name: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(`${name}_MUST_USE_HTTPS`);
  return url;
}

function validatedClientReturnUrl(requested?: string) {
  if (!requested)
    return requireHttpsUrl(ENV.ALLWAIN_APP_URL, "ALLWAIN_APP_URL");
  const candidate = new URL(requested);
  const appUrl = requireHttpsUrl(ENV.ALLWAIN_APP_URL, "ALLWAIN_APP_URL");
  const nativeProtocol = `${ENV.ALLWAIN_NATIVE_SCHEME.replace(/:$/, "")}:`;
  const allowedHttps =
    candidate.protocol === "https:" && candidate.hostname === appUrl.hostname;
  const allowedNative = candidate.protocol === nativeProtocol;
  const allowedDevelopment =
    ENV.NODE_ENV !== "production" &&
    ["http:", "https:"].includes(candidate.protocol) &&
    ["localhost", "127.0.0.1"].includes(candidate.hostname);
  if (!allowedHttps && !allowedNative && !allowedDevelopment) {
    throw new Error("INVALID_PAYMENT_RETURN_URL");
  }
  return candidate;
}

function appReturnUrl(kind: string, requested?: string) {
  const base = validatedClientReturnUrl(requested);
  base.searchParams.set("allwain", kind);
  return base.toString();
}

function checkoutSuccessUrl(requested?: string) {
  const base = validatedClientReturnUrl(requested);
  base.searchParams.set("allwain", "payment_success");
  base.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
  return base
    .toString()
    .replace("%7BCHECKOUT_SESSION_ID%7D", "{CHECKOUT_SESSION_ID}");
}

function toJson(value: unknown) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function allwainRefundAllocation(
  order: any,
  payment: any,
  cumulativeBefore: number,
  refundAmount: number,
) {
  return calculateAllwainRefundAllocation({
    grossAmount: Number(payment.amount || order.subtotalAmount),
    sellerAmount: Number(order.sellerAmount ?? payment.sellerAmount ?? 0),
    connectorAmount: Number(
      order.connectorFeeAmount ?? payment.connectorFeeAmount ?? 0,
    ),
    cumulativeBefore,
    refundAmount,
  });
}

function stripeIntegrationIdentifier(
  flow: "checkout" | "preorder",
  operationKey: string,
) {
  const digest = createHash("sha256").update(operationKey).digest();
  const suffix = Array.from(digest.subarray(0, 8), (byte) =>
    String.fromCharCode(97 + (byte % 26)),
  ).join("");
  return `allwain_${flow}_${suffix}`;
}

function accountCapabilityState(account: any) {
  const cardPayments =
    account?.configuration?.merchant?.capabilities?.card_payments;
  const merchantStatus = cardPayments?.status || "pending";
  const stripeBalance =
    account?.configuration?.recipient?.capabilities?.stripe_balance;
  const transfersStatus = stripeBalance?.stripe_transfers?.status || "pending";
  const payoutsStatus = stripeBalance?.payouts?.status || "pending";
  const requirementEntries = Array.isArray(account?.requirements?.entries)
    ? account.requirements.entries
    : [];
  const userActionRequired = requirementEntries.some(
    (entry: any) => entry?.awaiting_action_from === "user",
  );
  const restricted = [merchantStatus, transfersStatus, payoutsStatus].some((status) =>
    ["restricted", "unsupported"].includes(status),
  );
  const chargesEnabled = merchantStatus === "active";
  const transfersEnabled = transfersStatus === "active";
  const payoutsEnabled = payoutsStatus === "active";

  let status = "pending";
  if (chargesEnabled && transfersEnabled && payoutsEnabled) status = "enabled";
  else if (restricted) status = "restricted";
  else if (userActionRequired) status = "requires_information";

  return {
    status,
    merchantStatus,
    chargesEnabled,
    transfersStatus,
    payoutsStatus,
    transfersEnabled,
    payoutsEnabled,
    requirements: {
      entries: requirementEntries.map((entry: any) => ({
        description: entry?.description || null,
        awaitingActionFrom: entry?.awaiting_action_from || null,
        deadlineStatus: entry?.minimum_deadline?.status || null,
        errors: Array.isArray(entry?.errors)
          ? entry.errors.map((error: any) => error?.description).filter(Boolean)
          : [],
      })),
      future: account?.future_requirements || null,
    },
  };
}

async function persistStripeAccountState(userId: string, account: any) {
  const prisma = getPrisma() as any;
  const state = accountCapabilityState(account);
  const record = await prisma.allwainSellerPaymentAccount.upsert({
    where: { userId },
    create: {
      userId,
      stripeAccountId: account.id,
      country: String(account?.identity?.country || "ES").toUpperCase(),
      currency: ENV.ALLWAIN_CURRENCY,
      status: state.status,
      merchantStatus: state.merchantStatus,
      chargesEnabled: state.chargesEnabled,
      transfersEnabled: state.transfersEnabled,
      payoutsEnabled: state.payoutsEnabled,
      requirements: toJson(state.requirements),
      lastSyncedAt: new Date(),
    },
    update: {
      stripeAccountId: account.id,
      status: state.status,
      merchantStatus: state.merchantStatus,
      chargesEnabled: state.chargesEnabled,
      transfersEnabled: state.transfersEnabled,
      payoutsEnabled: state.payoutsEnabled,
      requirements: toJson(state.requirements),
      lastSyncedAt: new Date(),
    },
  });
  const fiscalProfile = await prisma.allwainFiscalProfile.findUnique({
    where: { userId_kind: { userId, kind: "business" } },
  });
  const fiscalReady =
    isAllwainFiscalProfileReady(fiscalProfile) &&
    hasActiveAllwainDocumentMandate(fiscalProfile);
  const profileStatus =
    state.status === "enabled" && fiscalReady
      ? "active"
      : state.status === "pending"
          ? "pending_verification"
          : "onboarding";
  await prisma.allwainSellerProfile.updateMany({
    where: { userId, status: { not: "not_activated" } },
    data: {
      status: profileStatus,
      verifiedAt: profileStatus === "active" ? new Date() : undefined,
      restrictedAt: null,
    },
  });
  return record;
}

async function retrieveAndPersistStripeAccount(
  userId: string,
  accountId: string,
) {
  const stripe = getStripe();
  const account = await stripe.v2.core.accounts.retrieve(accountId, {
    include: [...ACCOUNT_INCLUDES],
  } as any);
  return persistStripeAccountState(userId, account);
}

function sellerAccountDto(record: any, commercialModel = "marketplace") {
  const normalizedModel = normalizeAllwainCommercialModel(commercialModel);
  const platformDirect = normalizedModel === "platform_direct";
  return {
    provider: "stripe",
    configured: Boolean(ENV.STRIPE_SECRET_KEY),
    paymentsEnabled: allwainPaymentsConfigured(),
    commercialModel: normalizedModel,
    businessOfRecord: allwainBusinessOfRecord(normalizedModel),
    usesConnectedAccount: !platformDirect,
    status: platformDirect
      ? allwainPaymentsConfigured()
        ? "enabled"
        : "not_ready"
      : record?.status || "not_started",
    accountCreated: platformDirect || Boolean(record?.stripeAccountId),
    merchantStatus: platformDirect ? "platform_account" : record?.merchantStatus || "pending",
    chargesEnabled: platformDirect
      ? allwainPaymentsConfigured()
      : Boolean(record?.chargesEnabled),
    transfersEnabled: platformDirect ? false : Boolean(record?.transfersEnabled),
    payoutsEnabled: platformDirect
      ? allwainPaymentsConfigured()
      : Boolean(record?.payoutsEnabled),
    requirements: record?.requirements || { entries: [] },
    lastSyncedAt:
      record?.lastSyncedAt?.toISOString?.() || record?.lastSyncedAt || null,
  };
}

async function requirePaymentRecipient(userId: string) {
  const user = await (getPrisma() as any).user.findUnique({
    where: { id: userId },
  });
  if (!user) throw new Error("USER_NOT_FOUND");
  if (
    !(await isAllwainPaymentOnboardingAllowed(
      userId,
      String(user.role).toLowerCase(),
    ))
  ) {
    throw new Error("PAYMENT_RECIPIENT_PROFILE_REQUIRED");
  }
  return user;
}

async function createAccountLink(
  userId: string,
  accountId: string,
  clientReturnUrl?: string,
) {
  const stripe = getStripe();
  const safeReturnUrl = validatedClientReturnUrl(clientReturnUrl).toString();
  const token = jwt.sign(
    {
      subjectUserId: userId,
      accountId,
      purpose: "allwain_connect_refresh",
      clientReturnUrl: safeReturnUrl,
    },
    ENV.JWT_SECRET,
    {
      expiresIn: "20m",
      audience: "allwain-connect-refresh",
      issuer: "newmersive-api",
    },
  );
  const refreshUrl = requireHttpsUrl(ENV.ALLWAIN_API_URL, "ALLWAIN_API_URL");
  refreshUrl.pathname = `${refreshUrl.pathname.replace(/\/$/, "")}/api/allwain/payments/connect/refresh`;
  refreshUrl.searchParams.set("token", token);

  return stripe.v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["merchant", "recipient"],
        collection_options: { fields: "eventually_due" },
        refresh_url: refreshUrl.toString(),
        return_url: appReturnUrl("connect_return", safeReturnUrl),
      },
    },
  });
}

export function getAllwainPaymentConfig() {
  let platformFeeBps: number;
  let connectorPlatformShareBps: number;
  try {
    platformFeeBps = normalizeAllwainFeeBps();
  } catch {
    platformFeeBps = 1_000;
  }
  try {
    connectorPlatformShareBps = normalizeAllwainConnectorFeeBps();
  } catch {
    connectorPlatformShareBps = 200;
  }
  const connectorEffectiveFeeBps =
    (platformFeeBps * connectorPlatformShareBps) / 10_000;
  const platformNetFeeBpsWithConnector = Math.max(
    platformFeeBps - connectorEffectiveFeeBps,
    0,
  );
  const testCheckoutEnabled = allwainStripeTestCheckoutEnabled();
  const legalIdentityConfigured = Boolean(
    ENV.ALLWAIN_LEGAL_NAME &&
      ENV.ALLWAIN_LEGAL_TAX_ID &&
      ENV.ALLWAIN_LEGAL_ADDRESS,
  );
  const readiness = {
    featureFlag: ENV.ALLWAIN_PAYMENTS_ENABLED || testCheckoutEnabled,
    legalRelease: Boolean(
      testCheckoutEnabled ||
        (allwainLegalReleaseMatchesStripeMode() &&
          ENV.ALLWAIN_LEGAL_APPROVAL_REFERENCE),
    ),
    stripeSecret: Boolean(ENV.STRIPE_SECRET_KEY),
    stripeMode: allwainStripeModeMatchesConfiguration(),
    platformWebhook: Boolean(ENV.STRIPE_CONNECT_WEBHOOK_SECRET),
    connectedAccountsWebhook: Boolean(
      ENV.STRIPE_CONNECTED_ACCOUNTS_WEBHOOK_SECRET,
    ),
    thinV2Webhook: Boolean(ENV.STRIPE_CONNECT_THIN_WEBHOOK_SECRET),
    legalIdentity: testCheckoutEnabled || legalIdentityConfigured,
  };
  return {
    provider: "stripe",
    enabled: allwainPaymentsConfigured(),
    currency: ENV.ALLWAIN_CURRENCY,
    platformFeeBps,
    platformFeePercent: platformFeeBps / 100,
    connectorFeeBps: connectorEffectiveFeeBps,
    connectorFeePercent: connectorEffectiveFeeBps / 100,
    connectorShareOfPlatformFeeBps: connectorPlatformShareBps,
    connectorShareOfPlatformFeePercent: connectorPlatformShareBps / 100,
    platformNetFeeBpsWithConnector,
    platformNetFeePercentWithConnector: platformNetFeeBpsWithConnector / 100,
    paymentArchitecture: "separate_charges_and_transfers",
    businessOfRecord: "seller",
    supportedCommercialModels: ["marketplace", "platform_direct"],
    processorFeePayer: "platform",
    deliveryPricing: getAllwainDeliveryPricingConfig(),
    commercialTermsVersion: ENV.ALLWAIN_COMMERCIAL_TERMS_VERSION,
    documentMandateVersion: ENV.ALLWAIN_DOCUMENT_MANDATE_VERSION,
    preorderMandateVersion: ENV.ALLWAIN_PREORDER_MANDATE_VERSION,
    preorderMaximumDays: ENV.ALLWAIN_PREORDER_MAX_DAYS,
    stripeLivemode: ENV.ALLWAIN_STRIPE_LIVEMODE,
    paymentsFeatureFlagConfigured: ENV.ALLWAIN_PAYMENTS_ENABLED,
    stripeTestCheckoutEnabled: testCheckoutEnabled,
    stripeTestCheckoutScope: testCheckoutEnabled
      ? "all_real_user_offers"
      : "disabled",
    stripeTestExcludedOfferKinds: testCheckoutEnabled
      ? ["demo", "synthetic", "checkout_disabled"]
      : [],
    stripeTestFundsFlow: testCheckoutEnabled
      ? "platform_charge_only_no_transfers"
      : "disabled",
    stripeTestFiscalDocumentsIssued: testCheckoutEnabled ? false : null,
    stripeTestSellerTransfersEnabled: testCheckoutEnabled ? false : null,
    legalRequirementsBypassedForTest: testCheckoutEnabled,
    paymentEnvironment: ENV.ALLWAIN_STRIPE_LIVEMODE ? "live" : "test",
    legalReleaseScope: ENV.ALLWAIN_LEGAL_RELEASE_SCOPE,
    publicationCardRequired: allwainPublicationCardRequired(),
    readiness,
    activationBlockers: Object.entries(readiness)
      .filter(([, ready]) => !ready)
      .map(([name]) => name),
    webhookReadiness: {
      platform: Boolean(ENV.STRIPE_CONNECT_WEBHOOK_SECRET),
      connectedAccounts: Boolean(
        ENV.STRIPE_CONNECTED_ACCOUNTS_WEBHOOK_SECRET,
      ),
      thinV2: Boolean(ENV.STRIPE_CONNECT_THIN_WEBHOOK_SECRET),
    },
    legalIdentityConfigured,
    legalIdentityRequired: !testCheckoutEnabled,
    supportsPreorders: true,
  };
}

export async function getAllwainSellerPaymentStatus(userId: string) {
  requirePostgres();
  await requirePaymentRecipient(userId);
  const commercialModel = await getAllwainSellerCommercialModel(userId);
  if (commercialModel === "platform_direct") {
    return sellerAccountDto(null, commercialModel);
  }
  const prisma = getPrisma() as any;
  let record = await prisma.allwainSellerPaymentAccount.findUnique({
    where: { userId },
  });
  if (record?.stripeAccountId && ENV.STRIPE_SECRET_KEY) {
    record = await retrieveAndPersistStripeAccount(
      userId,
      record.stripeAccountId,
    );
  }
  return sellerAccountDto(record, commercialModel);
}

export async function createAllwainSellerOnboarding(
  userId: string,
  clientReturnUrl?: string,
) {
  requirePostgres();
  if ((await getAllwainSellerCommercialModel(userId)) === "platform_direct") {
    throw new Error("PLATFORM_SELLER_USES_PLATFORM_ACCOUNT");
  }
  const user = await requirePaymentRecipient(userId);
  const stripe = getStripe();
  const prisma = getPrisma() as any;
  let record = await prisma.allwainSellerPaymentAccount.findUnique({
    where: { userId },
  });

  if (!record?.stripeAccountId) {
    const account = await stripe.v2.core.accounts.create(
      {
        contact_email: user.email,
        display_name: user.name,
        dashboard: "express",
        defaults: {
          currency: ENV.ALLWAIN_CURRENCY,
          locales: ["es-ES"],
          responsibilities: {
            fees_collector: "application",
            losses_collector: "application",
          },
          profile: {
            business_url: ENV.ALLWAIN_APP_URL,
            product_description:
              "Venta de productos y servicios mediante el marketplace Allwain",
          },
        },
        identity: { country: "es" },
        configuration: {
          merchant: {
            capabilities: {
              card_payments: { requested: true },
            },
          },
          recipient: {
            capabilities: {
              stripe_balance: { stripe_transfers: { requested: true } },
            },
          },
        },
        metadata: { allwainUserId: userId },
        include: [...ACCOUNT_INCLUDES],
      } as any,
      { idempotencyKey: `allwain-connect-account-${userId}` },
    );
    record = await persistStripeAccountState(userId, account);
  } else {
    await stripe.v2.core.accounts.update(
      record.stripeAccountId,
      {
        configuration: {
          merchant: {
            capabilities: { card_payments: { requested: true } },
          },
          recipient: {
            capabilities: {
              stripe_balance: { stripe_transfers: { requested: true } },
            },
          },
        },
        include: [...ACCOUNT_INCLUDES],
      } as any,
    );
    record = await retrieveAndPersistStripeAccount(
      userId,
      record.stripeAccountId,
    );
  }

  const link = await createAccountLink(
    userId,
    record.stripeAccountId,
    clientReturnUrl,
  );
  return {
    url: link.url,
    expiresAt: link.expires_at,
    account: sellerAccountDto(record),
  };
}

export async function refreshAllwainSellerOnboarding(token: string) {
  requirePostgres();
  const payload = jwt.verify(token, ENV.JWT_SECRET, {
    audience: "allwain-connect-refresh",
    issuer: "newmersive-api",
  }) as jwt.JwtPayload & {
    subjectUserId?: string;
    accountId?: string;
    purpose?: string;
    clientReturnUrl?: string;
  };
  if (
    payload.purpose !== "allwain_connect_refresh" ||
    !payload.subjectUserId ||
    !payload.accountId
  ) {
    throw new Error("INVALID_CONNECT_REFRESH_TOKEN");
  }
  const record = await (
    getPrisma() as any
  ).allwainSellerPaymentAccount.findUnique({
    where: { userId: payload.subjectUserId },
  });
  if (!record || record.stripeAccountId !== payload.accountId) {
    throw new Error("CONNECT_ACCOUNT_NOT_FOUND");
  }
  const link = await createAccountLink(
    payload.subjectUserId,
    payload.accountId,
    payload.clientReturnUrl,
  );
  return link.url;
}

export async function createAllwainSellerDashboardLink(userId: string) {
  requirePostgres();
  if ((await getAllwainSellerCommercialModel(userId)) === "platform_direct") {
    throw new Error("PLATFORM_SELLER_USES_PLATFORM_ACCOUNT");
  }
  await requirePaymentRecipient(userId);
  const record = await (
    getPrisma() as any
  ).allwainSellerPaymentAccount.findUnique({
    where: { userId },
  });
  if (!record?.stripeAccountId) throw new Error("CONNECT_ACCOUNT_NOT_FOUND");
  const link = await getStripe().accounts.createLoginLink(
    record.stripeAccountId,
  );
  return { url: link.url };
}

function canBuildOrder(contract: any) {
  return Boolean(
    contract?.offerId &&
    contract?.requesterUserId &&
    contract?.providerUserId &&
    contract?.quantity > 0 &&
    contract?.unit &&
    contract?.unitPrice >= 0 &&
    contract?.subtotalAmount > 0 &&
    Number.isInteger(contract?.platformFeeBps) &&
    Number.isInteger(contract?.platformFeeAmount) &&
    Number.isInteger(contract?.sellerAmount) &&
    contract?.currency,
  );
}

async function ensureOrderForContract(contract: any) {
  const prisma = getPrisma() as any;
  const existing = await prisma.allwainOrder.findUnique({
    where: { contractId: contract.id },
  });
  if (existing) return existing;
  if (!canBuildOrder(contract))
    throw new Error("CONTRACT_PAYMENT_TERMS_MISSING");

  return prisma.$transaction(async (tx: any) => {
    const concurrent = await tx.allwainOrder.findUnique({
      where: { contractId: contract.id },
    });
    if (concurrent) return concurrent;
    const initialPaymentStatus =
      contract.status === "accepted" ? "awaiting_payment" : "awaiting_seller";
    const commercialModel = normalizeAllwainCommercialModel(
      contract.commercialModel,
    );
    const businessOfRecord = allwainBusinessOfRecord(commercialModel);
    const initialSettlement = initialAllwainOrderSettlement(
      contract.platformFeeAmount,
      {
        platformNetFeeAmount:
          contract.platformNetFeeAmount ?? contract.platformFeeAmount,
        connectorFeeAmount: contract.connectorFeeAmount || 0,
        connectorPlatformShareAmount:
          contract.connectorPlatformShareAmount || 0,
        connectorDeliveryAmount: contract.connectorDeliveryAmount || 0,
        carrierDeliveryAmount: contract.carrierDeliveryAmount || 0,
      },
      commercialModel,
    );
    const created = await tx.allwainOrder.create({
      data: {
        contractId: contract.id,
        offerId: contract.offerId,
        shoppingListId: contract.shoppingListId || null,
        acceptedProposalRevisionId:
          contract.acceptedProposalRevisionId || null,
        buyerUserId: contract.requesterUserId,
        sellerUserId: contract.providerUserId,
        paymentMode: contract.paymentMode || "immediate",
        preorderChargeDeadlineAt: contract.preorderChargeDeadlineAt || null,
        status: initialPaymentStatus,
        paymentStatus: initialPaymentStatus,
        fulfillmentStatus: "not_started",
        quantity: contract.quantity,
        unit: contract.unit,
        unitPriceAmount: Math.round(contract.unitPrice * 100),
        subtotalAmount: contract.subtotalAmount,
        shippingAmount: contract.shippingAmount || 0,
        totalAmount:
          contract.subtotalAmount +
          Number(contract.shippingAmount || 0) +
          (contract.platformFeePayer === "buyer"
            ? Number(contract.platformFeeAmount || 0)
            : 0),
        currency: contract.currency,
        platformFeeBps: contract.platformFeeBps,
        platformFeeAmount: contract.platformFeeAmount,
        platformNetFeeAmount: initialSettlement.platformNetFeeAmount,
        platformRetainedAmount:
          commercialModel === "platform_direct"
            ? Number(
                contract.platformRetainedAmount ?? contract.subtotalAmount,
              )
            : initialSettlement.platformNetFeeAmount,
        connectorFeeAmount: initialSettlement.connectorFeeAmount,
        connectorPlatformShareAmount:
          initialSettlement.connectorPlatformShareAmount,
        connectorDeliveryAmount: initialSettlement.connectorDeliveryAmount,
        carrierDeliveryAmount: initialSettlement.carrierDeliveryAmount,
        sellerAmount: contract.sellerAmount,
        feeBasis: contract.feeBasis || "sale_amount",
        platformFeePayer: contract.platformFeePayer || "seller",
        referenceAmount: contract.referenceAmount ?? null,
        acceptedOfferAmount: contract.acceptedOfferAmount ?? null,
        grossSavingsAmount: contract.grossSavingsAmount ?? null,
        netSavingsAmount: contract.netSavingsAmount ?? null,
        commercialModel,
        commercialTermsVersion: ENV.ALLWAIN_COMMERCIAL_TERMS_VERSION,
        businessOfRecord,
        processorFeePayer: "platform",
        paymentArchitecture: initialSettlement.paymentArchitecture,
        sellerTransferStatus: initialSettlement.sellerTransferStatus,
        connectorTransferStatus: initialSettlement.connectorTransferStatus,
        inventoryStatus: contract.inventoryStatus || "reserved",
        deliveryMethod: contract.deliveryMethod || null,
        deliveryChannel:
          contract.deliveryChannel ||
          (contract.deliveryMethod === "shipping"
            ? "carrier"
            : contract.deliveryMethod === "in_person"
              ? "seller"
              : contract.deliveryMethod === "pickup"
                ? "pickup"
                : null),
        deliveryAddress: contract.deliveryAddress || undefined,
        deliveryNotes: contract.deliveryNotes || null,
        reservationExpiresAt:
          contract.inventoryStatus === "reserved"
            ? allwainReservationDeadline()
            : null,
      },
    });
    await tx.allwainOrderStatusEvent.create({
      data: {
        orderId: created.id,
        toStatus: created.status,
        actorUserId: contract.requesterUserId,
        source: "checkout_order_repair",
      },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateId: created.id,
      eventType: "order.created",
      actorUserId: contract.requesterUserId,
      source: "checkout_order_repair",
      payload: {
        contractId: created.contractId,
        offerId: created.offerId,
        buyerUserId: created.buyerUserId,
        sellerUserId: created.sellerUserId,
        paymentStatus: created.paymentStatus,
        fulfillmentStatus: created.fulfillmentStatus,
        amount: created.subtotalAmount,
        currency: created.currency,
        commercialModel: created.commercialModel,
        businessOfRecord: created.businessOfRecord,
        platformRetainedAmount: created.platformRetainedAmount,
        inventoryStatus: created.inventoryStatus,
      },
    });
    return created;
  });
}

async function ensureBuyerCustomer(user: any) {
  const prisma = getPrisma() as any;
  const existing = await prisma.allwainBuyerPaymentProfile.findUnique({
    where: { userId: user.id },
  });
  if (existing) return existing.stripeCustomerId;

  const customer = await getStripe().customers.create(
    {
      email: user.email,
      name: user.name,
      metadata: { allwainUserId: user.id },
    },
    { idempotencyKey: `allwain-customer-${user.id}` },
  );
  const profile = await prisma.allwainBuyerPaymentProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, stripeCustomerId: customer.id },
    update: {},
  });
  return profile.stripeCustomerId;
}

function buyerPaymentProfileDto(profile: any) {
  if (!profile) {
    return {
      status: "not_started",
      ready: false,
      card: null,
      consentVersion: ENV.ALLWAIN_BUYER_PAYMENT_CONSENT_VERSION,
      lastSyncedAt: null,
    };
  }
  return {
    status: profile.paymentMethodStatus || "not_started",
    ready:
      profile.paymentMethodStatus === "ready" &&
      Boolean(profile.defaultPaymentMethodId),
    card: profile.defaultPaymentMethodId
      ? {
          brand: profile.defaultCardBrand || "card",
          last4: profile.defaultCardLast4 || null,
          expMonth: profile.defaultCardExpMonth || null,
          expYear: profile.defaultCardExpYear || null,
        }
      : null,
    consentVersion: ENV.ALLWAIN_BUYER_PAYMENT_CONSENT_VERSION,
    consentAcceptedAt: mapDate(profile.setupConsentAcceptedAt),
    lastSyncedAt: mapDate(profile.lastSyncedAt),
  };
}

export async function getAllwainBuyerPaymentProfile(userId: string) {
  requirePostgres();
  const profile = await (getPrisma() as any).allwainBuyerPaymentProfile.findUnique({
    where: { userId },
  });
  return buyerPaymentProfileDto(profile);
}

export async function createAllwainBuyerPaymentSetup(
  userId: string,
  input: {
    consentAccepted?: boolean;
    consentVersion?: string;
    returnUrl?: string;
    requestId?: string;
    clientAddress?: string | null;
    userAgent?: string | null;
  },
) {
  const stripe = requirePaymentsReady();
  if (input.consentAccepted !== true) {
    throw new Error("BUYER_PAYMENT_CONSENT_REQUIRED");
  }
  if (input.consentVersion !== ENV.ALLWAIN_BUYER_PAYMENT_CONSENT_VERSION) {
    throw new Error("BUYER_PAYMENT_CONSENT_VERSION_MISMATCH");
  }
  const prisma = getPrisma() as any;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("USER_NOT_FOUND");
  const customerId = await ensureBuyerCustomer(user);
  let profile = await prisma.allwainBuyerPaymentProfile.findUnique({
    where: { userId },
  });
  if (profile?.stripeCheckoutSessionId) {
    const existing = await stripe.checkout.sessions
      .retrieve(profile.stripeCheckoutSessionId)
      .catch(() => null);
    if (existing?.status === "open" && existing.url) {
      return {
        ...buyerPaymentProfileDto(profile),
        url: existing.url,
        sessionId: existing.id,
      };
    }
  }

  const acceptedAt = new Date();
  const evidence = {
    userId,
    consentVersion: input.consentVersion,
    acceptedAt: acceptedAt.toISOString(),
    purpose:
      "Verificar y guardar un metodo de pago para compras, reservas o cobros recurrentes confirmados por el usuario. Durante TEST, publicar ofertas o peticiones no requiere tarjeta ni genera un cobro.",
    chargeRule:
      "Cualquier cobro exige una oferta, importe y condiciones concretas aceptadas por el comprador; la recurrencia requiere un mandato independiente.",
    clientAddress: input.clientAddress || null,
    userAgent: input.userAgent || null,
  };
  const evidenceHash = createHash("sha256")
    .update(canonicalAllwainAuditJson(evidence))
    .digest("hex");
  const metadata = {
    scope: "allwain_buyer_payment_profile",
    buyerUserId: userId,
    consentVersion: input.consentVersion,
    consentEvidenceHash: evidenceHash,
  };
  const session = await stripe.checkout.sessions.create(
    {
      mode: "setup",
      customer: customerId,
      locale: "es",
      payment_method_types: ["card"],
      success_url: checkoutSuccessUrl(input.returnUrl),
      cancel_url: appReturnUrl("card_setup_cancelled", input.returnUrl),
      metadata,
      setup_intent_data: { metadata },
    },
    {
      idempotencyKey: `allwain-buyer-card-${userId}-${Math.floor(
        acceptedAt.getTime() / 300_000,
      )}`,
    },
  );
  profile = await prisma.allwainBuyerPaymentProfile.update({
    where: { userId },
    data: {
      paymentMethodStatus: "setup_pending",
      stripeCheckoutSessionId: session.id,
      stripeSetupIntentId: null,
      setupConsentVersion: input.consentVersion,
      setupConsentAcceptedAt: acceptedAt,
      setupConsentEvidenceHash: evidenceHash,
      lastSyncedAt: acceptedAt,
    },
  });
  await appendAllwainAuditEvent({
    aggregateType: "buyer_payment_profile",
    aggregateId: userId,
    eventType: "buyer.payment_method_setup_started",
    actorUserId: userId,
    source: "stripe_checkout_setup",
    requestId: input.requestId,
    payload: {
      checkoutSessionId: session.id,
      consentVersion: input.consentVersion,
      consentEvidenceHash: evidenceHash,
    },
  });
  return {
    ...buyerPaymentProfileDto(profile),
    url: session.url,
    sessionId: session.id,
  };
}

type PaymentTransitionContext = {
  actorUserId?: string;
  actorRole?: string;
  requestId?: string;
  providerEventId?: string;
};

async function transitionPaymentStatus(
  orderId: string,
  toPaymentStatus: string,
  source: string,
  patch: Record<string, unknown> = {},
  context: PaymentTransitionContext = {},
) {
  const prisma = getPrisma() as any;
  return prisma.$transaction(async (tx: any) => {
    const rows = (await tx.$queryRaw(
      Prisma.sql`SELECT * FROM "AllwainOrder" WHERE "id" = ${orderId} FOR UPDATE`,
    )) as any[];
    const order = rows[0];
    if (!order) throw new Error("ORDER_NOT_FOUND");
    const fromPaymentStatus =
      order.paymentStatus || order.status || "not_started";
    if (!canTransitionAllwainPayment(fromPaymentStatus, toPaymentStatus)) {
      return { order, applied: false, ignoredAsStale: true };
    }
    const nextStatus = deriveAllwainOrderStatus({
      paymentStatus: toPaymentStatus,
      fulfillmentStatus: order.fulfillmentStatus || "not_started",
      disputeStatus: order.disputeStatus,
    });
    const updated = await tx.allwainOrder.update({
      where: { id: orderId },
      data: {
        ...patch,
        paymentStatus: toPaymentStatus,
        status: nextStatus,
      },
    });
    if (order.status !== nextStatus || fromPaymentStatus !== toPaymentStatus) {
      await tx.allwainOrderStatusEvent.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: nextStatus,
          actorUserId: context.actorUserId,
          source,
          metadata: {
            fromPaymentStatus,
            toPaymentStatus,
            providerEventId: context.providerEventId || null,
          },
        },
      });
    }
    await tx.contract.update({
      where: { id: order.contractId },
      data: { paymentStatus: toPaymentStatus, updatedAt: new Date() },
    });
    if (fromPaymentStatus !== toPaymentStatus) {
      await appendAllwainAuditEventTx(tx, {
        aggregateId: orderId,
        eventType: "order.payment_status_changed",
        actorUserId: context.actorUserId,
        actorRole: context.actorRole,
        source,
        requestId: context.requestId,
        providerEventId: context.providerEventId,
        payload: {
          fromPaymentStatus,
          toPaymentStatus,
          fromOrderStatus: order.status,
          toOrderStatus: nextStatus,
        },
      });
    }
    return { order: updated, applied: true, ignoredAsStale: false };
  });
}

async function claimCheckoutPayment(input: {
  orderId: string;
  contractId: string;
  customerId: string;
  setupOnly: boolean;
  actorUserId: string;
  requestId?: string;
}) {
  const prisma = getPrisma() as any;
  return prisma.$transaction(async (tx: any) => {
    const rows = (await tx.$queryRaw(
      Prisma.sql`SELECT * FROM "AllwainOrder" WHERE "id" = ${input.orderId} FOR UPDATE`,
    )) as any[];
    const order = rows[0];
    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (PAID_PAYMENT_STATUSES.has(order.paymentStatus)) {
      return { order, payment: null, alreadyPaid: true };
    }
    const settlement = await tx.allwainSettlementPlan.findFirst({
      where: {
        orderId: order.id,
        version: order.settlementPlanVersion || undefined,
      },
      orderBy: { version: "desc" },
    });
    if (
      !settlement ||
      settlement.status !== "checkout_locked" ||
      !settlement.snapshotHash ||
      settlement.snapshotHash !== order.settlementSnapshotHash
    ) {
      throw new Error("SETTLEMENT_NOT_APPROVED");
    }

    const kind = input.setupOnly ? "setup" : "payment";
    const existing = await tx.allwainPayment.findFirst({
      where: {
        orderId: order.id,
        kind,
        status: { in: ["creating_checkout", "checkout_open"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return { order, payment: existing, alreadyPaid: false };

    const attempt =
      (await tx.allwainPayment.count({ where: { orderId: order.id, kind } })) +
      1;
    const payment = await tx.allwainPayment.create({
      data: {
        orderId: order.id,
        kind,
        status: "creating_checkout",
        operationKey: allwainPaymentOperationKey(order.id, kind, attempt),
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
        connectorFeeAmount: order.connectorFeeAmount || 0,
        connectorPlatformShareAmount:
          order.connectorPlatformShareAmount || 0,
        connectorDeliveryAmount: order.connectorDeliveryAmount || 0,
        carrierDeliveryAmount: order.carrierDeliveryAmount || 0,
        settlementPlanId: settlement.id,
        settlementPlanVersion: settlement.version,
        settlementSnapshotHash: settlement.snapshotHash,
        onBehalfOfStripeAccountId: order.settlementMerchantAccountId,
        processorFeePayer: "platform",
        commercialModel: normalizeAllwainCommercialModel(
          order.commercialModel,
        ),
        businessOfRecord:
          order.businessOfRecord ||
          allwainBusinessOfRecord(
            normalizeAllwainCommercialModel(order.commercialModel),
          ),
        sellerTransferStatus:
          order.sellerTransferStatus ||
          (order.commercialModel === "platform_direct"
            ? "not_required"
            : "not_started"),
        connectorTransferStatus:
          order.connectorTransferStatus || "not_required",
        stripeCustomerId: input.customerId,
        metadata: {
          contractId: input.contractId,
          offerId: order.offerId,
          attempt,
          settlementPlanId: settlement.id,
          settlementPlanVersion: settlement.version,
          settlementSnapshotHash: settlement.snapshotHash,
          commercialModel: normalizeAllwainCommercialModel(
            order.commercialModel,
          ),
          businessOfRecord:
            order.businessOfRecord ||
            allwainBusinessOfRecord(
              normalizeAllwainCommercialModel(order.commercialModel),
            ),
          processorFeePayer: "platform",
        },
      },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateId: order.id,
      eventType: "payment.checkout_claimed",
      actorUserId: input.actorUserId,
      source: input.setupOnly ? "preorder_setup_checkout" : "payment_checkout",
      requestId: input.requestId,
      payload: {
        paymentId: payment.id,
        operationKey: payment.operationKey,
        kind,
        attempt,
        amount: payment.amount,
        currency: payment.currency,
      },
    });
    return { order, payment, alreadyPaid: false };
  });
}

async function reactivateExpiredOrder(
  orderId: string,
  actorUserId: string,
  requestId?: string,
) {
  const prisma = getPrisma() as any;
  return prisma.$transaction(async (tx: any) => {
    const orderRows = (await tx.$queryRaw(
      Prisma.sql`SELECT * FROM "AllwainOrder" WHERE "id" = ${orderId} FOR UPDATE`,
    )) as any[];
    const order = orderRows[0];
    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (
      order.paymentStatus !== "expired" ||
      order.inventoryStatus !== "released"
    )
      return order;

    const offerRows = (await tx.$queryRaw(
      Prisma.sql`SELECT * FROM "Offer" WHERE "id" = ${order.offerId} FOR UPDATE`,
    )) as any[];
    const offer = offerRows[0] as Offer | undefined;
    if (!offer) throw new Error("OFFER_NOT_FOUND");
    const reservation = reserveAllwainStock(offer, order.quantity);
    if (reservation.inventory.managed) {
      await tx.offer.update({
        where: { id: offer.id },
        data: { meta: reservation.meta },
      });
    }
    const reservationExpiresAt = allwainReservationDeadline();
    const updated = await tx.allwainOrder.update({
      where: { id: order.id },
      data: {
        status: "awaiting_payment",
        paymentStatus: "awaiting_payment",
        inventoryStatus: "reserved",
        reservationExpiresAt,
        canceledAt: null,
      },
    });
    await tx.contract.update({
      where: { id: order.contractId },
      data: {
        paymentStatus: "awaiting_payment",
        inventoryStatus: "reserved",
        updatedAt: new Date(),
      },
    });
    await tx.allwainOrderStatusEvent.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: "awaiting_payment",
        actorUserId,
        source: "buyer_reactivated_expired_order",
      },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateId: order.id,
      eventType: "order.reservation_reactivated",
      actorUserId,
      source: "buyer_checkout_retry",
      requestId,
      payload: {
        quantity: order.quantity,
        unit: order.unit,
        reservationExpiresAt,
      },
    });
    return updated;
  });
}

export async function prepareAllwainCheckoutReview(userId: string, contractId: string) {
  requirePostgres();
  const prisma = getPrisma() as any;
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract || contract.app !== "allwain" || contract.requesterUserId !== userId) {
    throw new Error("CONTRACT_NOT_FOUND");
  }
  if (contract.status !== "accepted") throw new Error("AGREEMENT_NOT_ACCEPTED");
  const existing = await ensureOrderForContract(contract);
  await prisma.$transaction(async (tx: any) => {
    const rows = await tx.$queryRaw(
      Prisma.sql`SELECT * FROM "AllwainOrder" WHERE "id" = ${existing.id} FOR UPDATE`,
    );
    const order = rows[0];
    if (!order || order.buyerUserId !== userId) throw new Error("ORDER_NOT_FOUND");
    const currentContract = await tx.contract.findUnique({ where: { id: contractId } });
    if (!currentContract || currentContract.requesterUserId !== userId || currentContract.status !== "accepted") {
      throw new Error("AGREEMENT_NOT_ACCEPTED");
    }
    if (!PAID_PAYMENT_STATUSES.has(order.paymentStatus) &&
      !["refunded", "canceled", "dispute_lost"].includes(order.paymentStatus)) {
      await ensureAllwainOrderComplianceTx(tx, order);
    }
  });
  // No payment customer, session, mandate or consent is created by preparation.
  return getAllwainOrderForUser(userId, existing.id);
}

export async function createAllwainCheckout(
  userId: string,
  contractId: string,
  input: {
    reservationConsent?: boolean;
    reservationConsentVersion?: string;
    commercialTermsAccepted?: boolean;
    commercialTermsVersion?: string;
    recurringMandateAccepted?: boolean;
    recurringMandateVersion?: string;
    payNow?: boolean;
    reviewedTotalAmount?: unknown;
    reviewedCurrency?: unknown;
    returnUrl?: string;
    requestId?: string;
    clientAddress?: string | null;
    userAgent?: string | null;
  } = {},
) {
  const stripe = requirePaymentsReady();
  const prisma = getPrisma() as any;
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
  });
  if (
    !contract ||
    contract.app !== "allwain" ||
    contract.requesterUserId !== userId
  ) {
    throw new Error("CONTRACT_NOT_FOUND");
  }
  if (contract.status !== "accepted") throw new Error("AGREEMENT_NOT_ACCEPTED");

  let order = await ensureOrderForContract(contract);
  if (
    order.paymentStatus === "expired" &&
    order.inventoryStatus === "released"
  ) {
    order = await reactivateExpiredOrder(order.id, userId, input.requestId);
  }
  if (["refunded", "canceled", "dispute_lost"].includes(order.paymentStatus)) {
    throw new Error("ORDER_NOT_PAYABLE");
  }
  if (order.status === "paid" || order.status === "completed") {
    return { alreadyPaid: true, orderId: order.id, status: order.status };
  }
  if (
    order.paymentMode === "preorder" &&
    order.status === "payment_method_saved" &&
    input.payNow !== true
  ) {
    return { reservationReady: true, orderId: order.id, status: order.status };
  }

  const commercialModel = normalizeAllwainCommercialModel(
    order.commercialModel,
  );
  const platformDirect = commercialModel === "platform_direct";
  const offer = (await prisma.offer.findUnique({
    where: { id: order.offerId },
  })) as Offer | null;
  if (allwainOfferCheckoutDisabled(offer)) {
    throw new Error("DEMO_OFFER_READ_ONLY");
  }
  const testOnlyOffer = allwainStripeTestOfferEnabled(offer);
  if (allwainStripeTestCheckoutEnabled() && !testOnlyOffer) {
    throw new Error("STRIPE_TEST_OFFER_NOT_ELIGIBLE");
  }
  let syncedAccount: any = null;
  if (!platformDirect && !testOnlyOffer) {
    const accountRecord = await prisma.allwainSellerPaymentAccount.findUnique({
      where: { userId: order.sellerUserId },
    });
    if (!accountRecord?.stripeAccountId) {
      throw new Error("SELLER_PAYMENTS_NOT_READY");
    }
    syncedAccount = await retrieveAndPersistStripeAccount(
      order.sellerUserId,
      accountRecord.stripeAccountId,
    );
    if (
      !syncedAccount.chargesEnabled ||
      !syncedAccount.transfersEnabled ||
      !syncedAccount.payoutsEnabled
    ) {
      throw new Error("SELLER_PAYMENTS_NOT_READY");
    }
  }
  const prepared = await prisma.$transaction(async (tx: any) => {
    const paymentPreparation = await prepareAllwainOrderPaymentTx(tx, {
      orderId: order.id,
      buyerUserId: userId,
      reviewedTotalAmount: input.reviewedTotalAmount,
      reviewedCurrency: input.reviewedCurrency,
      commercialTermsAccepted: input.commercialTermsAccepted === true,
      commercialTermsVersion: input.commercialTermsVersion,
      preorderMandateAccepted: input.reservationConsent === true,
      preorderMandateVersion: input.reservationConsentVersion,
      requestId: input.requestId,
      clientAddress: input.clientAddress,
      userAgent: input.userAgent,
    });
    const recurringPlan = await prepareAllwainRecurringPlanTx(tx, {
      order: paymentPreparation.order,
      contract,
      buyerUserId: userId,
      accepted: input.recurringMandateAccepted === true,
      mandateVersion: input.recurringMandateVersion,
      requestId: input.requestId,
      clientAddress: input.clientAddress,
      userAgent: input.userAgent,
    });
    return { ...paymentPreparation, recurringPlan };
  });
  order = prepared.order;
  if (Boolean(prepared.testOnlyNonFiscal) !== testOnlyOffer) {
    throw new Error("STRIPE_TEST_ORDER_MARKER_MISMATCH");
  }

  const buyer = await prisma.user.findUnique({ where: { id: userId } });
  if (!buyer) throw new Error("USER_NOT_FOUND");
  const customerId = await ensureBuyerCustomer(buyer);
  const setupOnly = order.paymentMode === "preorder" && input.payNow !== true;
  if (setupOnly && input.reservationConsent !== true) {
    throw new Error("RESERVATION_CONSENT_REQUIRED");
  }

  const claim = await claimCheckoutPayment({
    orderId: order.id,
    contractId,
    customerId,
    setupOnly,
    actorUserId: userId,
    requestId: input.requestId,
  });
  if (claim.alreadyPaid || !claim.payment) {
    return { alreadyPaid: true, orderId: order.id, status: claim.order.status };
  }
  order = claim.order;
  let payment = claim.payment;

  if (payment.stripeCheckoutSessionId) {
    const reusable = await stripe.checkout.sessions.retrieve(
      payment.stripeCheckoutSessionId,
    );
    if (reusable.status === "open" && reusable.url) {
      return {
        url: reusable.url,
        sessionId: reusable.id,
        orderId: order.id,
        mode: setupOnly ? "setup" : "payment",
      };
    }
    if (reusable.status === "complete") {
      await processCheckoutSession(reusable, {
        source: "checkout_recovered",
        requestId: input.requestId,
      });
      return {
        alreadyPaid: true,
        orderId: order.id,
        status: "payment_processing",
      };
    }
    await prisma.allwainPayment.update({
      where: { id: payment.id },
      data: { status: "checkout_expired" },
    });
    await transitionPaymentStatus(
      order.id,
      "awaiting_payment",
      "checkout_reopened",
      {},
      {
        actorUserId: userId,
        requestId: input.requestId,
      },
    );
    const nextClaim = await claimCheckoutPayment({
      orderId: order.id,
      contractId,
      customerId,
      setupOnly,
      actorUserId: userId,
      requestId: input.requestId,
    });
    if (!nextClaim.payment) throw new Error("ORDER_ALREADY_PAID");
    payment = nextClaim.payment;
  }

  const metadata = {
    scope: "allwain_order",
    orderId: order.id,
    contractId,
    paymentId: payment.id,
    buyerUserId: order.buyerUserId,
    sellerUserId: order.sellerUserId,
    settlementPlanVersion: String(order.settlementPlanVersion),
    settlementSnapshotHash: order.settlementSnapshotHash,
    commercialModel,
    businessOfRecord: order.businessOfRecord,
    paymentEnvironment: testOnlyOffer ? "test" : ENV.ALLWAIN_STRIPE_LIVEMODE ? "live" : "test",
    testOnlyNonFiscal: String(testOnlyOffer),
    ...(prepared.recurringPlan
      ? {
          recurringPlanId: prepared.recurringPlan.id,
          recurringMandateVersion: prepared.recurringPlan.mandateVersion,
          recurringMandateEvidenceHash:
            prepared.recurringPlan.mandateEvidenceHash,
        }
      : {}),
    ...(setupOnly
      ? {
          preorderMandateVersion: order.preorderMandateVersion,
          preorderMandateEvidenceHash: order.preorderMandateEvidenceHash,
          preorderChargeDeadlineAt:
            order.preorderChargeDeadlineAt?.toISOString?.() ||
            String(order.preorderChargeDeadlineAt || ""),
        }
      : {}),
  };
  const integrationIdentifier = stripeIntegrationIdentifier(
    setupOnly ? "preorder" : "checkout",
    payment.operationKey || payment.id,
  );
  const onBehalfOfAccountId = allwainStripeOnBehalfOfAccount(
    commercialModel,
    syncedAccount?.stripeAccountId,
    testOnlyOffer,
  );

  try {
    const session = setupOnly
      ? await stripe.checkout.sessions.create(
          {
            mode: "setup",
            currency: order.currency,
            integration_identifier: integrationIdentifier,
            customer: customerId,
            locale: "es",
            client_reference_id: payment.id,
            success_url: checkoutSuccessUrl(input.returnUrl),
            cancel_url: appReturnUrl("payment_cancelled", input.returnUrl),
            metadata,
            setup_intent_data: {
              metadata,
              ...(onBehalfOfAccountId
                ? { on_behalf_of: onBehalfOfAccountId }
                : {}),
            },
            ...allwainStripeCheckoutCollectionConfig({
              testOnlyNonFiscal: testOnlyOffer,
              deliveryMethod: order.deliveryMethod,
              confirmedDeliveryDetails: hasConfirmedAllwainPurchaseDetails(order.deliveryAddress),
              mode: "setup",
            }),
          },
          {
            idempotencyKey: `allwain-checkout-${payment.operationKey || payment.id}`,
          },
        )
      : await stripe.checkout.sessions.create(
          {
            mode: "payment",
            integration_identifier: integrationIdentifier,
            customer: customerId,
            locale: "es",
            client_reference_id: payment.id,
            success_url: checkoutSuccessUrl(input.returnUrl),
            cancel_url: appReturnUrl("payment_cancelled", input.returnUrl),
            metadata,
            ...allwainStripeCheckoutCollectionConfig({
              testOnlyNonFiscal: testOnlyOffer,
              deliveryMethod: order.deliveryMethod,
              confirmedDeliveryDetails: hasConfirmedAllwainPurchaseDetails(order.deliveryAddress),
              mode: "payment",
            }),
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: order.currency,
                  unit_amount: order.totalAmount,
                  product_data: {
                    name: String(contract.offerTitle || "Pedido Allwain").slice(
                      0,
                      120,
                    ),
                    description:
                      `${order.quantity} ${order.unit} · Allwain${testOnlyOffer ? " · Stripe TEST" : ""}`.slice(0, 500),
                    metadata: { offerId: order.offerId, orderId: order.id },
                  },
                },
              },
            ],
            payment_intent_data: {
              transfer_group: `allwain_order_${order.id}`,
              shipping: allwainConfirmedStripeShipping(order.deliveryAddress, order.deliveryMethod),
              ...(onBehalfOfAccountId
                ? { on_behalf_of: onBehalfOfAccountId }
                : {}),
              ...(prepared.recurringPlan
                ? { setup_future_usage: "off_session" as const }
                : {}),
              metadata,
            },
          },
          {
            idempotencyKey: `allwain-checkout-${payment.operationKey || payment.id}`,
          },
        );

    const sessionExpiresAt = new Date(session.expires_at * 1_000);
    await prisma.allwainPayment.update({
      where: { id: payment.id },
      data: {
        status: "checkout_open",
        stripeCheckoutSessionId: session.id,
        checkoutSessionExpiresAt: sessionExpiresAt,
      },
    });
    await transitionPaymentStatus(
      order.id,
      "checkout_open",
      setupOnly
        ? "preorder_setup_checkout_created"
        : "payment_checkout_created",
      {
        reservationExpiresAt: sessionExpiresAt,
        ...(setupOnly ? { reservationConsentAt: new Date() } : {}),
      },
      { actorUserId: userId, requestId: input.requestId },
    );
    await appendAllwainAuditEvent({
      aggregateId: order.id,
      eventType: "payment.checkout_session_created",
      actorUserId: userId,
      source: "stripe_checkout",
      requestId: input.requestId,
      payload: {
        paymentId: payment.id,
        checkoutSessionId: session.id,
        mode: setupOnly ? "setup" : "payment",
        expiresAt: sessionExpiresAt,
      },
    });

    return {
      url: session.url,
      sessionId: session.id,
      orderId: order.id,
      mode: setupOnly ? "setup" : "payment",
    };
  } catch (error: any) {
    const failureCode = error?.code || "stripe_checkout_error";
    const failureMessage = String(
      error?.message || "Stripe checkout error",
    ).slice(0, 500);
    await prisma.allwainPayment.update({
      where: { id: payment.id },
      data: {
        status: "payment_failed",
        failureCode,
        failureMessage,
      },
    });
    await appendAllwainAuditEvent({
      aggregateId: order.id,
      eventType: "payment.checkout_session_failed",
      actorUserId: userId,
      source: "stripe_checkout",
      requestId: input.requestId,
      payload: {
        paymentId: payment.id,
        mode: setupOnly ? "setup" : "payment",
        failureCode,
      },
    });
    throw error;
  }
}

function mapDate(value: any) {
  return value instanceof Date ? value.toISOString() : value || null;
}

function allwainPreorderDeadlineLabel(value: Date | string | null | undefined) {
  if (!value) return "la fecha acordada";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "la fecha acordada";
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Madrid",
  }).format(date);
}

function orderDto(order: any, payment?: any, offer?: Offer | null) {
  return {
    ...order,
    offerTitle: offer?.title || null,
    imageMeta: offer ? allwainOfferCardImageMeta(offer) : null,
    createdAt: mapDate(order.createdAt),
    updatedAt: mapDate(order.updatedAt),
    paidAt: mapDate(order.paidAt),
    completedAt: mapDate(order.completedAt),
    canceledAt: mapDate(order.canceledAt),
    reservationConsentAt: mapDate(order.reservationConsentAt),
    reservationExpiresAt: mapDate(order.reservationExpiresAt),
    preorderChargeDeadlineAt: mapDate(order.preorderChargeDeadlineAt),
    preorderMandateAcceptedAt: mapDate(order.preorderMandateAcceptedAt),
    readyAt: mapDate(order.readyAt),
    dispatchedAt: mapDate(order.dispatchedAt),
    deliveredAt: mapDate(order.deliveredAt),
    operationalArchivedAt: mapDate(order.operationalArchivedAt),
    latestPayment: payment
      ? {
          id: payment.id,
          kind: payment.kind,
          status: payment.status,
          amount: payment.amount,
          refundedAmount: payment.refundedAmount,
          createdAt: mapDate(payment.createdAt),
          paidAt: mapDate(payment.paidAt),
          transferStatus: payment.transferStatus,
          sellerTransferStatus: payment.sellerTransferStatus,
          connectorTransferStatus: payment.connectorTransferStatus,
          failureMessage: payment.failureMessage || null,
        }
      : null,
  };
}

async function allwainOrderOffersById(orders: any[]) {
  const offerIds = Array.from(
    new Set(
      orders
        .map((order) => order.offerId)
        .filter((offerId): offerId is string => Boolean(offerId)),
    ),
  );
  if (!offerIds.length) return new Map<string, Offer>();
  const rows = await (getPrisma() as any).offer.findMany({
    where: { id: { in: offerIds }, owner: "allwain" },
  });
  return new Map<string, Offer>(
    rows.map((offer: Offer) => [offer.id, offer]),
  );
}

function sellerTransferReady(order: any) {
  return order.fulfillmentStatus === "completed";
}

export async function syncAllwainOrderTransfers(
  orderId: string,
  sourceChargeId?: string | null,
  paymentId?: string | null,
  context: PaymentTransitionContext = {},
) {
  requirePostgres();
  const prisma = getPrisma() as any;
  let order = await prisma.allwainOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("ORDER_NOT_FOUND");
  const testDetermination = await prisma.allwainTaxDetermination.findUnique({
    where: { orderId },
    select: { treatmentCode: true },
  });
  if (isAllwainStripeTestDetermination(testDetermination)) {
    const transferState = {
      sellerTransferStatus: "not_required",
      connectorTransferStatus: "not_required",
      transferStatus: "not_required",
    };
    order = await prisma.allwainOrder.update({
      where: { id: orderId },
      data: transferState,
    });
    await prisma.allwainPayment.updateMany({
      where: { orderId },
      data: transferState,
    });
    return order;
  }
  if (order.paymentArchitecture !== "separate_charges_and_transfers")
    return order;
  if (isAllwainActiveDispute(order.disputeStatus)) return order;

  const payment = paymentId
    ? await prisma.allwainPayment.findUnique({ where: { id: paymentId } })
    : await prisma.allwainPayment.findFirst({
        where: { orderId, paidAt: { not: null } },
        orderBy: { paidAt: "desc" },
      });
  if (!payment) return order;
  const chargeId = sourceChargeId || payment.stripeChargeId;
  if (!chargeId || order.paymentStatus !== "paid") return order;

  const stripe = getStripe();
  const commercialModel = normalizeAllwainCommercialModel(
    order.commercialModel,
  );
  const platformDirect = commercialModel === "platform_direct";
  const sellerAllocated = !platformDirect && Number(order.sellerAmount) > 0;
  let sellerTransferId =
    order.sellerTransferId ||
    payment.sellerTransferId ||
    payment.stripeTransferId ||
    null;
  let connectorTransferId =
    order.connectorTransferId || payment.connectorTransferId || null;
  const transferGroup = `allwain_order_${order.id}`;
  const documentationReady = await allwainSettlementDocumentsReady(order.id);
  const sellerReadyForPayout =
    sellerAllocated && sellerTransferReady(order) && documentationReady;
  const connectorAllocated = Boolean(
    order.connectorUserId && order.connectorFeeAmount > 0,
  );
  const connectorReadyForPayout =
    connectorAllocated &&
    order.fulfillmentStatus === "completed" && documentationReady;
  let sellerAccount: any = null;
  let connectorAccount: any = null;
  let sellerTransferCreated = false;
  let connectorTransferCreated = false;
  let disputeDetectedDuringSettlement = false;
  const paymentMetadata =
    payment.metadata && typeof payment.metadata === "object"
      ? (payment.metadata as Record<string, any>)
      : {};
  const storedSellerAttempt = Math.max(
    1,
    Number(paymentMetadata.sellerTransferAttempt || 1),
  );
  const storedConnectorAttempt = Math.max(
    1,
    Number(paymentMetadata.connectorTransferAttempt || 1),
  );
  const sellerTransferAttempt =
    sellerReadyForPayout &&
    !sellerTransferId &&
    payment.sellerTransferStatus === "failed"
      ? storedSellerAttempt + 1
      : storedSellerAttempt;
  const connectorTransferAttempt =
    connectorReadyForPayout &&
    !connectorTransferId &&
    payment.connectorTransferStatus === "failed"
      ? storedConnectorAttempt + 1
      : storedConnectorAttempt;

  try {
    if (sellerReadyForPayout || sellerTransferId) {
      sellerAccount = await prisma.allwainSellerPaymentAccount.findUnique({
        where: { userId: order.sellerUserId },
      });
    }
    if (sellerReadyForPayout && !sellerTransferId) {
      if (!sellerAccount?.stripeAccountId || !sellerAccount.transfersEnabled) {
        throw new Error("SELLER_PAYMENTS_NOT_READY");
      }
      const transfer = await stripe.transfers.create(
        {
          amount: order.sellerAmount,
          currency: order.currency,
          destination: sellerAccount.stripeAccountId,
          source_transaction: chargeId,
          transfer_group: transferGroup,
          metadata: {
            scope: "allwain_seller",
            orderId: order.id,
            paymentId: payment.id,
          },
        },
        {
          idempotencyKey:
            sellerTransferAttempt === 1
              ? `allwain-order-${order.id}-seller-transfer`
              : `allwain-order-${order.id}-seller-transfer-attempt-${sellerTransferAttempt}`,
        },
      );
      sellerTransferId = transfer.id;
      sellerTransferCreated = true;
    }

    if (connectorReadyForPayout || connectorTransferId) {
      connectorAccount = await prisma.allwainSellerPaymentAccount.findUnique({
        where: { userId: order.connectorUserId },
      });
    }
    if (connectorReadyForPayout && !connectorTransferId) {
      if (
        !connectorAccount?.stripeAccountId ||
        !connectorAccount.transfersEnabled
      ) {
        throw new Error("CONNECTOR_PAYOUTS_NOT_READY");
      }
      const transfer = await stripe.transfers.create(
        {
          amount: order.connectorFeeAmount,
          currency: order.currency,
          destination: connectorAccount.stripeAccountId,
          source_transaction: chargeId,
          transfer_group: transferGroup,
          metadata: {
            scope: "allwain_connector",
            orderId: order.id,
            paymentId: payment.id,
          },
        },
        {
          idempotencyKey:
            connectorTransferAttempt === 1
              ? `allwain-order-${order.id}-connector-transfer`
              : `allwain-order-${order.id}-connector-transfer-attempt-${connectorTransferAttempt}`,
        },
      );
      connectorTransferId = transfer.id;
      connectorTransferCreated = true;
    }

    const sellerTransferStatus = platformDirect
      ? "not_required"
      : sellerTransferId
        ? "transferred"
        : documentationReady
          ? "pending_completed"
          : "pending_documents";
    const connectorTransferStatus = connectorAllocated
      ? connectorTransferId
        ? "transferred"
        : documentationReady
          ? "pending_completed"
          : "pending_documents"
      : "not_required";
    const sellerSettlementComplete = platformDirect || Boolean(sellerTransferId);
    const transferStatus = !sellerSettlementComplete
      ? "pending_fulfillment"
      : connectorAllocated && !connectorTransferId
        ? platformDirect
          ? "platform_retained_connector_pending"
          : "seller_transferred_connector_pending"
        : "transferred";
    order = await prisma.$transaction(async (tx: any) => {
      const orderRows = (await tx.$queryRaw(
        Prisma.sql`SELECT * FROM "AllwainOrder" WHERE "id" = ${order.id} FOR UPDATE`,
      )) as any[];
      const lockedOrder = orderRows[0];
      if (!lockedOrder) throw new Error("ORDER_NOT_FOUND");
      disputeDetectedDuringSettlement = isAllwainActiveDispute(
        lockedOrder.disputeStatus,
      );
      await tx.allwainPayment.update({
        where: { id: payment.id },
        data: {
          stripeTransferId: sellerTransferId,
          sellerTransferId,
          connectorTransferId,
          sellerTransferStatus,
          connectorTransferStatus,
          transferStatus,
          connectorFeeAmount: order.connectorFeeAmount,
          platformNetFeeAmount: order.platformNetFeeAmount,
          platformRetainedAmount: order.platformRetainedAmount,
          failureCode: null,
          failureMessage: null,
          metadata: toJson({
            ...paymentMetadata,
            sellerTransferAttempt,
            connectorTransferAttempt,
          }),
        },
      });
      const updated = await tx.allwainOrder.update({
        where: { id: order.id },
        data: {
          sellerTransferId,
          connectorTransferId,
          sellerTransferStatus,
          connectorTransferStatus,
          transferStatus: disputeDetectedDuringSettlement
            ? lockedOrder.transferStatus
            : transferStatus,
          settlementStatus:
            disputeDetectedDuringSettlement
              ? lockedOrder.settlementStatus
              : transferStatus === "transferred"
              ? "settled"
              : sellerSettlementComplete || sellerTransferId
                ? "partially_settled"
                : lockedOrder.settlementStatus,
        },
      });
      if (sellerTransferId && sellerAccount?.stripeAccountId) {
        await recordAllwainTransferTx(tx, {
          order: updated,
          payment,
          recipientUserId: order.sellerUserId,
          recipientRole: "seller",
          stripeAccountId: sellerAccount.stripeAccountId,
          stripeTransferId: sellerTransferId,
          amount: order.sellerAmount,
          releaseTrigger: "completed_and_documented",
        });
        await ensureAllwainOperationalDocumentTx(
          tx,
          updated,
          "seller_settlement",
          {
            paymentId: payment.id,
            stripeTransferId: sellerTransferId,
            sellerAmount: order.sellerAmount,
            platformFeeAmount: order.platformFeeAmount,
            connectorFeeAmount: order.connectorFeeAmount,
          },
        );
      }
      if (
        connectorTransferId &&
        connectorAccount?.stripeAccountId &&
        order.connectorUserId
      ) {
        await recordAllwainTransferTx(tx, {
          order: updated,
          payment,
          recipientUserId: order.connectorUserId,
          recipientRole: "connector",
          stripeAccountId: connectorAccount.stripeAccountId,
          stripeTransferId: connectorTransferId,
          amount: order.connectorFeeAmount,
          releaseTrigger: "completed_and_documented",
        });
      }
      await appendAllwainAuditEventTx(tx, {
        aggregateId: order.id,
        eventType: "payment.transfers_synchronized",
        source: "stripe_separate_transfers",
        requestId: context.requestId,
        providerEventId: context.providerEventId,
        payload: {
          paymentId: payment.id,
          chargeId,
          sellerTransferId,
          sellerTransferCreated,
          sellerAmount: order.sellerAmount,
          commercialModel,
          businessOfRecord: order.businessOfRecord,
          platformRetainedAmount: order.platformRetainedAmount,
          connectorTransferId,
          connectorTransferCreated,
          connectorFeeAmount: order.connectorFeeAmount,
          documentationReady,
          connectorPayoutEligible: connectorReadyForPayout,
          platformNetFeeAmount: order.platformNetFeeAmount,
          currency: order.currency,
          disputeDetectedDuringSettlement,
        },
      });
      return updated;
    });
    if (disputeDetectedDuringSettlement) {
      try {
        const pendingDispute = await prisma.allwainDispute.findFirst({
          where: { orderId: order.id },
          orderBy: { updatedAt: "desc" },
        });
        if (
          pendingDispute?.stripeDisputeId &&
          isAllwainActiveDispute(pendingDispute.status)
        ) {
          const stripeDispute = await stripe.disputes.retrieve(
            pendingDispute.stripeDisputeId,
          );
          await processDispute(stripeDispute, {
            requestId: context.requestId,
          });
          order = await prisma.allwainOrder.findUnique({
            where: { id: order.id },
          });
        }
      } catch (recoveryError: any) {
        await prisma.$transaction(async (tx: any) => {
          await tx.allwainOrder.update({
            where: { id: order.id },
            data: {
              settlementStatus: "dispute_recovery_attention",
              transferStatus: "reversal_attention",
            },
          });
          await appendAllwainAuditEventTx(tx, {
            aggregateId: order.id,
            eventType: "payment.late_dispute_transfer_recovery_failed",
            source: "stripe_separate_transfers",
            requestId: context.requestId,
            payload: {
              sellerTransferId,
              connectorTransferId,
              error: String(recoveryError?.message || recoveryError).slice(
                0,
                500,
              ),
            },
          });
        });
      }
    }
    return order;
  } catch (error: any) {
    const connectorFailure = error?.message === "CONNECTOR_PAYOUTS_NOT_READY";
    await prisma.$transaction(async (tx: any) => {
      await tx.allwainOrder.update({
        where: { id: order.id },
        data: {
          sellerTransferId,
          connectorTransferId,
          sellerTransferStatus: platformDirect
            ? "not_required"
            : sellerTransferId
              ? "transferred"
              : "failed",
          connectorTransferStatus: connectorFailure
            ? "failed"
            : order.connectorTransferStatus,
          transferStatus: "transfer_failed",
        },
      });
      await tx.allwainPayment.update({
        where: { id: payment.id },
        data: {
          sellerTransferId,
          connectorTransferId,
          sellerTransferStatus: platformDirect
            ? "not_required"
            : sellerTransferId
              ? "transferred"
              : "failed",
          connectorTransferStatus: connectorFailure
            ? "failed"
            : payment.connectorTransferStatus,
          transferStatus: "transfer_failed",
          failureCode: String(
            error?.code || error?.message || "TRANSFER_FAILED",
          ).slice(0, 100),
          failureMessage: String(
            error?.message || "No se pudo repartir el cobro",
          ).slice(0, 500),
          metadata: toJson({
            ...paymentMetadata,
            sellerTransferAttempt,
            connectorTransferAttempt,
          }),
        },
      });
      await appendAllwainAuditEventTx(tx, {
        aggregateId: order.id,
        eventType: "payment.transfer_failed",
        source: "stripe_separate_transfers",
        requestId: context.requestId,
        providerEventId: context.providerEventId,
        payload: {
          paymentId: payment.id,
          chargeId,
          sellerTransferId,
          connectorTransferId,
          error: String(error?.message || error),
        },
      });
    });
    throw error;
  }
}

export async function listAllwainOrdersForUser(userId: string) {
  requirePostgres();
  const prisma = getPrisma() as any;
  const orders = await prisma.allwainOrder.findMany({
    where: {
      operationalArchivedAt: null,
      OR: [{ buyerUserId: userId }, { sellerUserId: userId }],
    },
    orderBy: { createdAt: "desc" },
  });
  const payments = orders.length
    ? await prisma.allwainPayment.findMany({
        where: { orderId: { in: orders.map((order: any) => order.id) } },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const latestByOrder = new Map<string, any>();
  for (const payment of payments) {
    if (!latestByOrder.has(payment.orderId))
      latestByOrder.set(payment.orderId, payment);
  }
  const offersById = await allwainOrderOffersById(orders);
  return orders.map((order: any) =>
    orderDto(
      order,
      latestByOrder.get(order.id),
      offersById.get(order.offerId),
    ),
  );
}

export async function listAllwainOrderPageForUser(
  userId: string,
  input: {
    limit: number;
    cursor?: string | null;
    scope?: "buyer" | "seller" | null;
    statuses?: string[] | null;
    paymentStatuses?: string[] | null;
    fulfillmentStatuses?: string[] | null;
  },
) {
  requirePostgres();
  const prisma = getPrisma() as any;
  const participant =
    input.scope === "buyer"
      ? { buyerUserId: userId }
      : input.scope === "seller"
        ? { sellerUserId: userId }
        : { OR: [{ buyerUserId: userId }, { sellerUserId: userId }] };
  const where = {
    AND: [participant],
    operationalArchivedAt: null,
    ...(input.statuses?.length ? { status: { in: input.statuses } } : {}),
    ...(input.paymentStatuses?.length
      ? { paymentStatus: { in: input.paymentStatuses } }
      : {}),
    ...(input.fulfillmentStatuses?.length
      ? { fulfillmentStatus: { in: input.fulfillmentStatuses } }
      : {}),
  };
  const rows = await prisma.allwainOrder.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const hasNextPage = rows.length > input.limit;
  const pageRows = hasNextPage ? rows.slice(0, input.limit) : rows;
  const payments = pageRows.length
    ? await prisma.allwainPayment.findMany({
        where: { orderId: { in: pageRows.map((order: any) => order.id) } },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const latestByOrder = new Map<string, any>();
  for (const payment of payments) {
    if (!latestByOrder.has(payment.orderId)) {
      latestByOrder.set(payment.orderId, payment);
    }
  }
  const offersById = await allwainOrderOffersById(pageRows);
  return {
    items: pageRows.map((order: any) =>
      orderDto(
        order,
        latestByOrder.get(order.id),
        offersById.get(order.offerId),
      ),
    ),
    pageInfo: {
      hasNextPage,
      nextCursor: hasNextPage
        ? pageRows[pageRows.length - 1]?.id || null
        : null,
    },
  };
}

export async function getAllwainOrderSummaryForUser(
  userId: string,
  scope: "buyer" | "seller",
) {
  requirePostgres();
  const prisma = getPrisma() as any;
  const participant =
    scope === "seller" ? { sellerUserId: userId } : { buyerUserId: userId };
  const visibleParticipant = {
    ...participant,
    operationalArchivedAt: null,
  };
  const payableStatuses = [
    "paid",
    "partially_refunded",
    "refund_pending",
    "legacy_confirmed",
  ];
  const nonTerminalStatuses = {
    notIn: ["completed", "refunded", "canceled", "expired"],
  };

  const [
    totalCount,
    activeCount,
    newCount,
    readyCount,
    completedCount,
    toPrepare,
    pendingIncome,
  ] = await Promise.all([
    prisma.allwainOrder.count({ where: visibleParticipant }),
    prisma.allwainOrder.count({
      where: { ...visibleParticipant, status: nonTerminalStatuses },
    }),
    prisma.allwainOrder.count({
      where: {
        ...visibleParticipant,
        paymentStatus: { in: payableStatuses },
        fulfillmentStatus: "pending",
      },
    }),
    prisma.allwainOrder.count({
      where: {
        ...visibleParticipant,
        paymentStatus: { in: payableStatuses },
        fulfillmentStatus: "ready",
      },
    }),
    prisma.allwainOrder.count({
      where: { ...visibleParticipant, fulfillmentStatus: "completed" },
    }),
    scope === "seller"
      ? prisma.allwainOrder.groupBy({
          by: ["unit"],
          where: {
            ...visibleParticipant,
            paymentStatus: { in: payableStatuses },
            fulfillmentStatus: { in: ["pending", "preparing"] },
          },
          _sum: { quantity: true },
        })
      : Promise.resolve([]),
    scope === "seller"
      ? prisma.allwainOrder.groupBy({
          by: ["currency"],
          where: {
            ...visibleParticipant,
            paymentStatus: { in: payableStatuses },
            status: nonTerminalStatuses,
          },
          _sum: { sellerAmount: true },
        })
      : Promise.resolve([]),
  ]);

  return {
    scope,
    totalCount,
    activeCount,
    newCount,
    readyCount,
    completedCount,
    toPrepare: toPrepare.map((item: any) => ({
      unit: item.unit,
      quantity: Number(item._sum.quantity || 0),
    })),
    pendingIncome: pendingIncome.map((item: any) => ({
      currency: String(item.currency || "EUR").toUpperCase(),
      amount: Number(item._sum.sellerAmount || 0),
    })),
  };
}

const CANCELABLE_PAYMENT_STATUSES = new Set([
  "not_started",
  "awaiting_payment",
  "checkout_open",
  "payment_failed",
  "requires_customer_action",
  "payment_method_saved",
  "payment_canceled",
  "expired",
]);

export async function cancelAllwainOrder(
  userId: string,
  orderId: string,
  requestId?: string,
) {
  requirePostgres();
  const prisma = getPrisma() as any;
  const [actor, preview, previewPayment] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.allwainOrder.findUnique({ where: { id: orderId } }),
    prisma.allwainPayment.findFirst({
      where: { orderId },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (!actor || !preview) throw new Error("ORDER_NOT_FOUND");
  if (preview.buyerUserId !== userId && actor.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  if (preview.status === "canceled" && preview.paymentStatus === "canceled") {
    return orderDto(preview, previewPayment);
  }
  if (!CANCELABLE_PAYMENT_STATUSES.has(preview.paymentStatus)) {
    throw new Error("ORDER_NO_LONGER_CANCELABLE");
  }

  if (previewPayment?.stripeCheckoutSessionId) {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(
      previewPayment.stripeCheckoutSessionId,
    );
    if (session.status === "open") {
      await stripe.checkout.sessions.expire(session.id);
    } else if (session.status === "complete") {
      await processCheckoutSession(session, {
        source: "checkout_recovered_before_cancel",
        requestId,
      });
      const synchronized = await prisma.allwainOrder.findUnique({
        where: { id: orderId },
      });
      if (
        !synchronized ||
        !CANCELABLE_PAYMENT_STATUSES.has(synchronized.paymentStatus)
      ) {
        throw new Error("ORDER_NO_LONGER_CANCELABLE");
      }
    }
  }

  const canceled = await prisma.$transaction(async (tx: any) => {
    const orderRows = (await tx.$queryRaw(
      Prisma.sql`SELECT * FROM "AllwainOrder" WHERE "id" = ${orderId} FOR UPDATE`,
    )) as any[];
    const order = orderRows[0];
    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (order.buyerUserId !== userId && actor.role !== "admin") {
      throw new Error("FORBIDDEN");
    }
    if (order.status === "canceled" && order.paymentStatus === "canceled") {
      return order;
    }
    if (!CANCELABLE_PAYMENT_STATUSES.has(order.paymentStatus)) {
      throw new Error("ORDER_NO_LONGER_CANCELABLE");
    }

    let inventoryStatus = order.inventoryStatus;
    if (order.inventoryStatus === "reserved") {
      const offerRows = (await tx.$queryRaw(
        Prisma.sql`SELECT * FROM "Offer" WHERE "id" = ${order.offerId} FOR UPDATE`,
      )) as any[];
      const offer = offerRows[0] as Offer | undefined;
      if (offer) {
        const released = releaseAllwainOfferStock(offer, order.quantity);
        await tx.offer.update({
          where: { id: offer.id },
          data: released,
        });
      }
      inventoryStatus = "released";
    }

    const now = new Date();
    await tx.allwainPayment.updateMany({
      where: {
        orderId,
        status: {
          in: [
            "creating_checkout",
            "checkout_open",
            "payment_processing",
            "payment_failed",
            "requires_customer_action",
            "payment_method_saved",
          ],
        },
      },
      data: { status: "canceled" },
    });
    const next = await tx.allwainOrder.update({
      where: { id: orderId },
      data: {
        status: "canceled",
        paymentStatus: "canceled",
        inventoryStatus,
        reservationExpiresAt: null,
        canceledAt: now,
      },
    });
    await tx.contract.update({
      where: { id: order.contractId },
      data: {
        paymentStatus: "canceled",
        inventoryStatus,
        updatedAt: now,
      },
    });
    let reopenShoppingList = Boolean(order.shoppingListId && !order.recurringPlanId);
    if (order.recurringPlanId) {
      const canceledPlan = await tx.allwainRecurringPlan.updateMany({
        where: {
          id: order.recurringPlanId,
          sourceOrderId: order.id,
          status: "pending_initial_payment",
        },
        data: {
          status: "canceled",
          canceledAt: now,
          nextRunAt: null,
        },
      });
      if (canceledPlan.count) {
        reopenShoppingList = Boolean(order.shoppingListId);
        await appendAllwainAuditEventTx(tx, {
          aggregateType: "recurring_plan",
          aggregateId: order.recurringPlanId,
          orderId,
          eventType: "recurring_plan.canceled_before_initial_payment",
          actorUserId: userId,
          actorRole: actor.role,
          source: "buyer_canceled_before_payment",
          requestId,
          payload: { sourceOrderId: order.id },
        });
      }
    }
    if (order.shoppingListId && reopenShoppingList) {
      const awardState = await refreshAllwainShoppingListAwardStateTx(
        tx,
        order.shoppingListId,
        now,
      );
      await appendAllwainAuditEventTx(tx, {
        aggregateType: "shopping_list",
        aggregateId: order.shoppingListId,
        eventType: "shopping_list.reopened_after_order_cancel",
        actorUserId: userId,
        actorRole: actor.role,
        source: "buyer_canceled_before_payment",
        requestId,
        payload: {
          orderId,
          offerId: order.offerId,
          previousStatus: awardState.previousStatus,
          nextStatus: awardState.nextStatus,
          awardedItemCount: awardState.awardedItemCount,
          remainingItemCount: awardState.remainingItemCount,
          activeOrderIds: awardState.orderIds,
        },
      });
    }
    await tx.allwainOrderStatusEvent.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: "canceled",
        actorUserId: userId,
        source: "buyer_canceled_before_payment",
      },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateId: orderId,
      eventType: "order.canceled",
      actorUserId: userId,
      actorRole: actor.role,
      source: "buyer_canceled_before_payment",
      requestId,
      payload: {
        previousStatus: order.status,
        previousPaymentStatus: order.paymentStatus,
        inventoryStatus,
        quantityReleased:
          inventoryStatus === "released" ? order.quantity : 0,
        unit: order.unit,
      },
    });
    return next;
  });

  await notifyAllwainOrderParticipants(orderId, {
    excludeUserId: userId,
    type: "order.canceled",
    title: "Pedido cancelado",
    body: "El pedido se ha cancelado antes del pago.",
    dedupeSuffix: requestId || "buyer-cancel",
  });
  const latestPayment = await prisma.allwainPayment.findFirst({
    where: { orderId },
    orderBy: { createdAt: "desc" },
  });
  return orderDto(canceled, latestPayment);
}

const FULFILLMENT_ACTIONS: Record<string, string> = {
  prepare: "preparing",
  ready: "ready",
  dispatch: "dispatched",
  deliver: "delivered",
  complete: "completed",
};

export async function updateAllwainOrderFulfillment(
  userId: string,
  orderId: string,
  action: string,
  requestId?: string,
) {
  requirePostgres();
  const prisma = getPrisma() as any;
  const actor = await prisma.user.findUnique({ where: { id: userId } });
  if (!actor) throw new Error("USER_NOT_FOUND");
  const toFulfillmentStatus = FULFILLMENT_ACTIONS[action];
  if (!toFulfillmentStatus) throw new Error("INVALID_FULFILLMENT_ACTION");

  const updated = await prisma.$transaction(async (tx: any) => {
    const rows = (await tx.$queryRaw(
      Prisma.sql`SELECT * FROM "AllwainOrder" WHERE "id" = ${orderId} FOR UPDATE`,
    )) as any[];
    const order = rows[0];
    if (!order) throw new Error("ORDER_NOT_FOUND");
    const isAdmin = actor.role === "admin";
    const buyerAction = action === "complete";
    const connectorAction = action === "dispatch" || action === "deliver";
    const sellerAction = action === "prepare" || action === "ready";
    if (
      order.deliveryChannel === "local_connector" &&
      connectorAction
    ) {
      throw new Error("LOGISTICS_QR_REQUIRED");
    }
    if (order.deliveryChannel === "carrier" && connectorAction) {
      throw new Error("CARRIER_TRACKING_REQUIRED");
    }
    const allowed =
      isAdmin ||
      (buyerAction && order.buyerUserId === userId) ||
      (sellerAction && order.sellerUserId === userId) ||
      (connectorAction &&
        (order.connectorUserId
          ? order.connectorUserId === userId
          : order.sellerUserId === userId));
    if (!allowed) throw new Error("FORBIDDEN");
    if (
      ![
        "paid",
        "partially_refunded",
        "refund_pending",
        "legacy_confirmed",
      ].includes(order.paymentStatus)
    ) {
      throw new Error("ORDER_NOT_PAID");
    }
    if (
      order.disputeStatus &&
      !["won", "closed_won", "warning_closed"].includes(
        order.disputeStatus,
      )
    ) {
      throw new Error("ORDER_DISPUTED");
    }
    const fromFulfillmentStatus = order.fulfillmentStatus || "pending";
    if (
      !canTransitionAllwainFulfillment(
        fromFulfillmentStatus,
        toFulfillmentStatus,
      )
    ) {
      throw new Error("INVALID_FULFILLMENT_TRANSITION");
    }
    const now = new Date();
    const overall = deriveAllwainOrderStatus({
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: toFulfillmentStatus,
      disputeStatus: order.disputeStatus,
    });
    const timestamps: Record<string, Date> = {};
    if (toFulfillmentStatus === "ready") timestamps.readyAt = now;
    if (toFulfillmentStatus === "dispatched") timestamps.dispatchedAt = now;
    if (toFulfillmentStatus === "delivered") timestamps.deliveredAt = now;
    if (toFulfillmentStatus === "completed") timestamps.completedAt = now;
    const next = await tx.allwainOrder.update({
      where: { id: orderId },
      data: {
        fulfillmentStatus: toFulfillmentStatus,
        status: overall,
        ...timestamps,
      },
    });
    if (fromFulfillmentStatus !== toFulfillmentStatus) {
      await tx.allwainOrderStatusEvent.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: overall,
          actorUserId: userId,
          source: `fulfillment_${action}`,
          metadata: { fromFulfillmentStatus, toFulfillmentStatus },
        },
      });
      await appendAllwainAuditEventTx(tx, {
        aggregateId: orderId,
        eventType: `fulfillment.${toFulfillmentStatus}`,
        actorUserId: userId,
        actorRole: actor.role,
        source: `fulfillment_${action}`,
        requestId,
        payload: {
          fromFulfillmentStatus,
          toFulfillmentStatus,
          fromOrderStatus: order.status,
          toOrderStatus: overall,
        },
      });
    }
    if (["delivered", "completed"].includes(toFulfillmentStatus)) {
      await ensureAllwainOperationalDocumentTx(
        tx,
        next,
        "delivery_confirmation",
        {
          confirmedByUserId: userId,
          confirmedByRole: actor.role,
          fulfillmentStatus: toFulfillmentStatus,
        },
      );
    }
    if (
      toFulfillmentStatus === "completed" &&
      order.shoppingListId &&
      !order.recurringPlanId
    ) {
      const [shoppingList, activeAwardLines] = await Promise.all([
        tx.allwainShoppingList.findUnique({
          where: { id: order.shoppingListId },
          select: { status: true, _count: { select: { items: true } } },
        }),
        listActiveAllwainShoppingListAwardLines(tx, [order.shoppingListId]),
      ]);
      const awardedItemIds = new Set(
        activeAwardLines.map((line: any) => line.shoppingListItemId),
      );
      const everyOrderCompleted = activeAwardLines.every(
        (line: any) => line.order.fulfillmentStatus === "completed",
      );
      if (
        shoppingList?.status === "awarded" &&
        awardedItemIds.size >= Number(shoppingList._count.items) &&
        everyOrderCompleted
      ) {
        await tx.allwainShoppingList.update({
          where: { id: order.shoppingListId },
          data: { status: "closed", closedAt: now },
        });
        await appendAllwainAuditEventTx(tx, {
          aggregateType: "shopping_list",
          aggregateId: order.shoppingListId,
          eventType: "shopping_list.completed",
          actorUserId: userId,
          actorRole: actor.role,
          source: `fulfillment_${action}`,
          requestId,
          payload: {
            orderId,
            offerId: order.offerId,
            completedOrderIds: [
              ...new Set(
                activeAwardLines.map((line: any) => String(line.orderId)),
              ),
            ],
            previousStatus: shoppingList.status,
            nextStatus: "closed",
          },
        });
      }
    }
    return next;
  });
  let synchronized = updated;
  if (
    updated.paymentArchitecture === "separate_charges_and_transfers" &&
    updated.paymentStatus === "paid"
  ) {
    try {
      synchronized = await syncAllwainOrderTransfers(orderId, null, null, {
        actorUserId: userId,
        actorRole: actor.role,
        requestId,
      });
    } catch (error) {
      console.error("ALLWAIN_FULFILLMENT_TRANSFER_SYNC_ERROR", orderId, error);
    }
  }
  await notifyAllwainOrderParticipants(orderId, {
    excludeUserId: userId,
    type: `fulfillment.${toFulfillmentStatus}`,
    title:
      toFulfillmentStatus === "completed"
        ? "Pedido finalizado"
        : toFulfillmentStatus === "delivered"
          ? "Pedido entregado"
          : "Tu pedido ha avanzado",
    body: `Nuevo estado: ${toFulfillmentStatus}.`,
    dedupeSuffix: `${toFulfillmentStatus}:${requestId || "action"}`,
  });
  const latestPayment = await prisma.allwainPayment.findFirst({
    where: { orderId },
    orderBy: { createdAt: "desc" },
  });
  return orderDto(synchronized, latestPayment);
}

async function requireAllwainOrderAccess(userId: string, orderId: string) {
  const prisma = getPrisma() as any;
  const [user, order] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.allwainOrder.findUnique({ where: { id: orderId } }),
  ]);
  if (!user) throw new Error("USER_NOT_FOUND");
  if (!order) throw new Error("ORDER_NOT_FOUND");
  if (
    user.role !== "admin" &&
    order.buyerUserId !== userId &&
    order.sellerUserId !== userId &&
    order.connectorUserId !== userId
  ) {
    throw new Error("FORBIDDEN");
  }
  return { user, order };
}

export async function getAllwainOrderForUser(userId: string, orderId: string) {
  requirePostgres();
  const prisma = getPrisma() as any;
  const { order } = await requireAllwainOrderAccess(userId, orderId);
  const [payment, offer] = await Promise.all([
    prisma.allwainPayment.findFirst({
      where: { orderId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.offer.findFirst({
      where: { id: order.offerId, owner: "allwain" },
    }),
  ]);
  return orderDto(order, payment, offer);
}

export async function getAllwainOrderAudit(userId: string, orderId: string) {
  requirePostgres();
  const prisma = getPrisma() as any;
  const { order } = await requireAllwainOrderAccess(userId, orderId);
  const events = await prisma.allwainAuditEvent.findMany({
    where: { aggregateType: "order", aggregateId: orderId },
    orderBy: { sequence: "asc" },
  });
  const actorIds = Array.from(
    new Set<string>(
      events.map((event: any) => event.actorUserId).filter(Boolean),
    ),
  );
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true, role: true },
      })
    : [];
  const actorById = new Map<string, any>(
    actors.map((actor: any) => [actor.id, actor]),
  );
  const verification = await verifyAllwainAuditChain("order", orderId);
  return {
    orderId,
    contractId: order.contractId,
    verification,
    evidenceLevel: "technical_tamper_evident",
    legalNotice:
      "Registro técnico verificable de Allwain. No sustituye por sí solo una firma, sello de tiempo o servicio cualificado eIDAS.",
    events: events.map((event: any) => ({
      id: event.id,
      sequence: event.sequence,
      eventType: event.eventType,
      source: event.source,
      occurredAt: mapDate(event.occurredAt),
      actor: event.actorUserId
        ? actorById.get(event.actorUserId) || { id: event.actorUserId }
        : null,
      requestId: event.requestId,
      providerEventId: event.providerEventId,
      payload: event.payload,
      previousHash: event.previousHash,
      eventHash: event.eventHash,
      hashAlgorithm: event.hashAlgorithm,
    })),
  };
}

export async function exportAllwainOrderAuditPdf(
  userId: string,
  orderId: string,
) {
  const audit = await getAllwainOrderAudit(userId, orderId);
  const lines = [
    `Pedido: ${audit.orderId}`,
    `Contrato: ${audit.contractId}`,
    `Cadena integra: ${audit.verification.valid ? "SI" : "NO"}`,
    `Eventos: ${audit.verification.count}`,
    `Huella final: ${audit.verification.headHash || "sin eventos"}`,
    "",
    audit.legalNotice,
    "",
    ...audit.events.flatMap((event: any) => [
      `${event.sequence}. ${event.occurredAt} | ${event.eventType}`,
      `Origen: ${event.source} | Actor: ${event.actor?.email || event.actor?.id || "sistema"}`,
      `Evento proveedor: ${event.providerEventId || "-"} | Solicitud: ${event.requestId || "-"}`,
      `Huella: ${event.eventHash}`,
      `Datos: ${canonicalAllwainAuditJson(event.payload)}`,
      "",
    ]),
  ];
  return {
    filename: `allwain-trazabilidad-${orderId}.pdf`,
    buffer: buildTextPdf({ title: "Trazabilidad del pedido Allwain", lines }),
  };
}

export async function getAllwainAdminPaymentOverview() {
  requirePostgres();
  const prisma = getPrisma() as any;
  const [
    sellerStatuses,
    sellerAccounts,
    orderStatuses,
    archivedOrderCount,
    paymentTotals,
    recentOrders,
    disputeStatuses,
    recentDisputes,
    payoutStatuses,
    recentPayouts,
    recentReconciliations,
  ] = await Promise.all([
    prisma.allwainSellerPaymentAccount.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.allwainSellerPaymentAccount.findMany({
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    prisma.allwainOrder.groupBy({
      by: ["status"],
      where: { operationalArchivedAt: null },
      _count: { _all: true },
    }),
    prisma.allwainOrder.count({
      where: { operationalArchivedAt: { not: null } },
    }),
    prisma.allwainPayment.aggregate({
      where: {
        kind: { in: ["payment", "deferred_charge"] },
        paidAt: { not: null },
      },
      _sum: {
        amount: true,
        platformFeeAmount: true,
        platformNetFeeAmount: true,
        sellerAmount: true,
        connectorFeeAmount: true,
        carrierDeliveryAmount: true,
        refundedAmount: true,
      },
      _count: { _all: true },
    }),
    prisma.allwainOrder.findMany({
      where: { operationalArchivedAt: null },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: {
        taxDetermination: {
          select: {
            id: true,
            status: true,
            treatmentCode: true,
            explanation: true,
            ruleVersionId: true,
            professionalApprovalReference: true,
          },
        },
      },
    }),
    prisma.allwainDispute.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.allwainDispute.findMany({
      orderBy: { updatedAt: "desc" },
      take: 25,
    }),
    prisma.allwainSellerPayout.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.allwainSellerPayout.findMany({
      orderBy: { updatedAt: "desc" },
      take: 25,
    }),
    prisma.allwainReconciliationRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 10,
    }),
  ]);

  const userIds = Array.from(
    new Set<string>([
      ...sellerAccounts.map((account: any) => account.userId),
      ...recentOrders.flatMap((order: any) =>
        [order.buyerUserId, order.sellerUserId, order.connectorUserId].filter(
          Boolean,
        ),
      ),
    ]),
  );
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const usersById = new Map<string, any>(
    users.map((user: any) => [user.id, user]),
  );
  const statusCounts = Object.fromEntries(
    orderStatuses.map((item: any) => [item.status, item._count._all]),
  );
  const sellerStatusCounts = Object.fromEntries(
    sellerStatuses.map((item: any) => [item.status, item._count._all]),
  );
  const sum = paymentTotals._sum || {};

  return {
    config: getAllwainPaymentConfig(),
    sellers: {
      total: Object.values(sellerStatusCounts).reduce(
        (total: number, count: any) => total + Number(count || 0),
        0,
      ),
      enabled: sellerStatusCounts.enabled || 0,
      requiresInformation: sellerStatusCounts.requires_information || 0,
      pending: sellerStatusCounts.pending || 0,
      items: sellerAccounts.map((account: any) => ({
        userId: account.userId,
        name: usersById.get(account.userId)?.name || "Vendedor",
        email: usersById.get(account.userId)?.email || null,
        status: account.status,
        merchantStatus: account.merchantStatus,
        chargesEnabled: account.chargesEnabled,
        transfersEnabled: account.transfersEnabled,
        payoutsEnabled: account.payoutsEnabled,
        updatedAt: mapDate(account.updatedAt),
      })),
    },
    orders: {
      total: Object.values(statusCounts).reduce(
        (total: number, count: any) => total + Number(count || 0),
        0,
      ),
      archived: archivedOrderCount,
      byStatus: statusCounts,
      paidPayments: paymentTotals._count?._all || 0,
      grossAmount: sum.amount || 0,
      platformFeeAmount: sum.platformFeeAmount || 0,
      platformNetFeeAmount: sum.platformNetFeeAmount || 0,
      sellerAmount: sum.sellerAmount || 0,
      connectorFeeAmount: sum.connectorFeeAmount || 0,
      carrierDeliveryAmount: sum.carrierDeliveryAmount || 0,
      refundedAmount: sum.refundedAmount || 0,
      currency: ENV.ALLWAIN_CURRENCY,
      items: recentOrders.map((order: any) => ({
        id: order.id,
        contractId: order.contractId,
        buyerUserId: order.buyerUserId,
        buyerName: usersById.get(order.buyerUserId)?.name || "Cliente",
        buyerEmail: usersById.get(order.buyerUserId)?.email || null,
        sellerUserId: order.sellerUserId,
        sellerName: usersById.get(order.sellerUserId)?.name || "Vendedor",
        sellerEmail: usersById.get(order.sellerUserId)?.email || null,
        status: order.status,
        paymentStatus: order.paymentStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        settlementStatus: order.settlementStatus,
        taxStatus: order.taxStatus,
        documentStatus: order.documentStatus,
        traceabilityStatus: order.traceabilityStatus,
        taxDetermination: order.taxDetermination,
        disputeStatus: order.disputeStatus,
        transferStatus: order.transferStatus,
        paymentMode: order.paymentMode,
        quantity: order.quantity,
        unit: order.unit,
        subtotalAmount: order.subtotalAmount,
        shippingAmount: order.shippingAmount,
        taxAmount: order.taxAmount,
        agriculturalCompensationAmount:
          order.agriculturalCompensationAmount,
        totalAmount: order.totalAmount,
        platformFeeAmount: order.platformFeeAmount,
        platformNetFeeAmount: order.platformNetFeeAmount,
        sellerAmount: order.sellerAmount,
        connectorUserId: order.connectorUserId,
        connectorName: order.connectorUserId
          ? usersById.get(order.connectorUserId)?.name || "Conector"
          : null,
        connectorEmail: order.connectorUserId
          ? usersById.get(order.connectorUserId)?.email || null
          : null,
        connectorFeeAmount: order.connectorFeeAmount,
        connectorPlatformShareAmount:
          order.connectorPlatformShareAmount || 0,
        connectorDeliveryAmount: order.connectorDeliveryAmount || 0,
        carrierDeliveryAmount: order.carrierDeliveryAmount || 0,
        carrierQuoteId: order.carrierQuoteId || null,
        sellerTransferStatus: order.sellerTransferStatus,
        connectorTransferStatus: order.connectorTransferStatus,
        currency: order.currency,
        deliveryMethod: order.deliveryMethod,
        deliveryAddress: order.deliveryAddress,
        deliveryNotes: order.deliveryNotes,
        createdAt: mapDate(order.createdAt),
        paidAt: mapDate(order.paidAt),
      })),
    },
    disputes: {
      byStatus: Object.fromEntries(
        disputeStatuses.map((item: any) => [item.status, item._count._all]),
      ),
      items: recentDisputes.map((dispute: any) => ({
        id: dispute.id,
        orderId: dispute.orderId,
        status: dispute.status,
        amount: dispute.amount,
        currency: dispute.currency,
        reason: dispute.reason,
        evidenceDueAt: mapDate(dispute.evidenceDueAt),
        updatedAt: mapDate(dispute.updatedAt),
      })),
    },
    payouts: {
      byStatus: Object.fromEntries(
        payoutStatuses.map((item: any) => [item.status, item._count._all]),
      ),
      items: recentPayouts.map((payout: any) => ({
        id: payout.id,
        sellerUserId: payout.sellerUserId,
        status: payout.status,
        amount: payout.amount,
        currency: payout.currency,
        arrivalAt: mapDate(payout.arrivalAt),
        failureCode: payout.failureCode,
        updatedAt: mapDate(payout.updatedAt),
      })),
    },
    reconciliation: {
      items: recentReconciliations.map((run: any) => ({
        id: run.id,
        status: run.status,
        periodStart: mapDate(run.periodStart),
        periodEnd: mapDate(run.periodEnd),
        summary: run.summary,
        error: run.error,
        startedAt: mapDate(run.startedAt),
        completedAt: mapDate(run.completedAt),
      })),
    },
  };
}

const RECONCILIATION_LIMIT_PER_OBJECT = 100;
const RECONCILIATION_MAX_DAYS = 31;
const RECONCILIATION_PROVIDER_SCAN_LIMIT = 500;
const RECONCILIATION_CONNECTED_ACCOUNT_LIMIT = 100;

async function listStripeReconciliationObjects(
  source: any,
  params: Record<string, unknown>,
) {
  const listing = source.list({ ...params, limit: 100 });
  const items = await listing.autoPagingToArray({
    limit: RECONCILIATION_PROVIDER_SCAN_LIMIT + 1,
  });
  return {
    items: items.slice(0, RECONCILIATION_PROVIDER_SCAN_LIMIT),
    limited: items.length > RECONCILIATION_PROVIDER_SCAN_LIMIT,
  };
}

function stripeReconciliationId(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    return String((value as { id?: unknown }).id || "") || null;
  }
  return null;
}

function allwainStripeMetadata(value: any) {
  const scope = String(value?.metadata?.scope || "");
  return scope === "allwain_order" || scope.startsWith("allwain_");
}

function reconciliationDate(value: unknown, fallback: Date) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime()))
    throw new Error("INVALID_RECONCILIATION_PERIOD");
  return parsed;
}

function reconciliationProviderError(error: any) {
  return String(
    error?.code || error?.type || error?.statusCode || "provider_unavailable",
  ).slice(0, 100);
}

function reconciliationRunDto(run: any) {
  return {
    id: run.id,
    provider: run.provider,
    status: run.status,
    periodStart: mapDate(run.periodStart),
    periodEnd: mapDate(run.periodEnd),
    summary: run.summary,
    error: run.error,
    startedAt: mapDate(run.startedAt),
    completedAt: mapDate(run.completedAt),
  };
}

export async function runAllwainReconciliation(
  actorUserId: string | null,
  input: { periodStart?: unknown; periodEnd?: unknown } = {},
  context: { system?: boolean } = {},
) {
  const stripe = requirePaymentsReady();
  const prisma = getPrisma() as any;
  if (!context.system) {
    if (!actorUserId) throw new Error("USER_NOT_FOUND");
    const actor = await prisma.user.findUnique({ where: { id: actorUserId } });
    if (!actor) throw new Error("USER_NOT_FOUND");
    if (actor.role !== "admin") throw new Error("FORBIDDEN");
  }

  const now = new Date();
  const periodEnd = reconciliationDate(input.periodEnd, now);
  const periodStart = reconciliationDate(
    input.periodStart,
    new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1_000),
  );
  const periodMs = periodEnd.getTime() - periodStart.getTime();
  if (
    periodMs <= 0 ||
    periodMs > RECONCILIATION_MAX_DAYS * 24 * 60 * 60 * 1_000 ||
    periodEnd.getTime() > now.getTime() + 5 * 60_000
  ) {
    throw new Error("INVALID_RECONCILIATION_PERIOD");
  }

  const run = await prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('allwain:stripe:reconciliation'))`,
    );
    const staleBefore = new Date(Date.now() - 30 * 60_000);
    await tx.allwainReconciliationRun.updateMany({
      where: { status: "running", startedAt: { lt: staleBefore } },
      data: {
        status: "failed",
        error: "La ejecución superó 30 minutos y se cerró como interrumpida.",
        completedAt: new Date(),
      },
    });
    const active = await tx.allwainReconciliationRun.findFirst({
      where: { status: "running" },
      select: { id: true },
    });
    if (active) throw new Error("RECONCILIATION_ALREADY_RUNNING");
    return tx.allwainReconciliationRun.create({
      data: {
        periodStart,
        periodEnd,
        startedByUserId: actorUserId,
      },
    });
  });

  try {
    const updatedRange = { gte: periodStart, lte: periodEnd };
    const [paymentsRaw, transfersRaw, disputesRaw, payoutsRaw] =
      await Promise.all([
        prisma.allwainPayment.findMany({
          where: {
            provider: "stripe",
            updatedAt: updatedRange,
            OR: [
              { stripePaymentIntentId: { not: null } },
              { stripeRefundId: { not: null } },
            ],
          },
          orderBy: { updatedAt: "asc" },
          take: RECONCILIATION_LIMIT_PER_OBJECT + 1,
        }),
        prisma.allwainTransfer.findMany({
          where: {
            updatedAt: updatedRange,
            stripeTransferId: { not: null },
          },
          orderBy: { updatedAt: "asc" },
          take: RECONCILIATION_LIMIT_PER_OBJECT + 1,
        }),
        prisma.allwainDispute.findMany({
          where: { updatedAt: updatedRange },
          orderBy: { updatedAt: "asc" },
          take: RECONCILIATION_LIMIT_PER_OBJECT + 1,
        }),
        prisma.allwainSellerPayout.findMany({
          where: { updatedAt: updatedRange },
          orderBy: { updatedAt: "asc" },
          take: RECONCILIATION_LIMIT_PER_OBJECT + 1,
        }),
      ]);
    const limited = {
      payments: paymentsRaw.length > RECONCILIATION_LIMIT_PER_OBJECT,
      transfers: transfersRaw.length > RECONCILIATION_LIMIT_PER_OBJECT,
      disputes: disputesRaw.length > RECONCILIATION_LIMIT_PER_OBJECT,
      payouts: payoutsRaw.length > RECONCILIATION_LIMIT_PER_OBJECT,
    };
    const payments = paymentsRaw.slice(0, RECONCILIATION_LIMIT_PER_OBJECT);
    const transfers = transfersRaw.slice(0, RECONCILIATION_LIMIT_PER_OBJECT);
    const disputes = disputesRaw.slice(0, RECONCILIATION_LIMIT_PER_OBJECT);
    const payouts = payoutsRaw.slice(0, RECONCILIATION_LIMIT_PER_OBJECT);
    const differences: AllwainReconciliationDifference[] = [];
    let checked = 0;
    let providerErrors = 0;

    for (const payment of payments) {
      if (payment.stripePaymentIntentId) {
        try {
          const intent = await stripe.paymentIntents.retrieve(
            payment.stripePaymentIntentId,
            { expand: ["latest_charge.balance_transaction"] },
          );
          differences.push(...compareAllwainPaymentWithStripe(payment, intent));
          checked += 1;
        } catch (error: any) {
          providerErrors += 1;
          differences.push(
            missingAllwainProviderObject(
              "payment",
              payment.id,
              payment.stripePaymentIntentId,
              reconciliationProviderError(error),
            ),
          );
        }
      }
      if (payment.stripeRefundId) {
        try {
          const refund = await stripe.refunds.retrieve(payment.stripeRefundId);
          differences.push(...compareAllwainRefundWithStripe(payment, refund));
          checked += 1;
        } catch (error: any) {
          providerErrors += 1;
          differences.push(
            missingAllwainProviderObject(
              "refund",
              payment.id,
              payment.stripeRefundId,
              reconciliationProviderError(error),
            ),
          );
        }
      }
    }
    for (const transfer of transfers) {
      try {
        const remote = await stripe.transfers.retrieve(transfer.stripeTransferId);
        differences.push(...compareAllwainTransferWithStripe(transfer, remote));
        checked += 1;
      } catch (error: any) {
        providerErrors += 1;
        differences.push(
          missingAllwainProviderObject(
            "transfer",
            transfer.id,
            transfer.stripeTransferId,
            reconciliationProviderError(error),
          ),
        );
      }
    }
    for (const dispute of disputes) {
      try {
        const remote = await stripe.disputes.retrieve(dispute.stripeDisputeId);
        differences.push(...compareAllwainDisputeWithStripe(dispute, remote));
        checked += 1;
      } catch (error: any) {
        providerErrors += 1;
        differences.push(
          missingAllwainProviderObject(
            "dispute",
            dispute.id,
            dispute.stripeDisputeId,
            reconciliationProviderError(error),
          ),
        );
      }
    }
    for (const payout of payouts) {
      try {
        const remote = await (stripe.payouts as any).retrieve(
          payout.stripePayoutId,
          {},
          { stripeAccount: payout.stripeAccountId },
        );
        differences.push(...compareAllwainPayoutWithStripe(payout, remote));
        checked += 1;
      } catch (error: any) {
        providerErrors += 1;
        differences.push(
          missingAllwainProviderObject(
            "payout",
            payout.id,
            payout.stripePayoutId,
            reconciliationProviderError(error),
          ),
        );
      }
    }

    const providerCreated = {
      gte: Math.floor(periodStart.getTime() / 1_000),
      lte: Math.floor(periodEnd.getTime() / 1_000),
    };
    const [remotePaymentScan, remoteRefundScan, remoteTransferScan, remoteDisputeScan] =
      await Promise.all([
        listStripeReconciliationObjects(stripe.paymentIntents, {
          created: providerCreated,
        }),
        listStripeReconciliationObjects(stripe.refunds, {
          created: providerCreated,
        }),
        listStripeReconciliationObjects(stripe.transfers, {
          created: providerCreated,
        }),
        listStripeReconciliationObjects(stripe.disputes, {
          created: providerCreated,
          expand: ["data.payment_intent"],
        }),
      ]);

    const remotePaymentIntents = remotePaymentScan.items.filter(
      (item: any) => allwainStripeMetadata(item),
    );
    const remotePaymentIntentIds = remotePaymentIntents.map((item: any) => item.id);
    const knownPaymentIntents = new Set(
      (
        await prisma.allwainPayment.findMany({
          where: { stripePaymentIntentId: { in: remotePaymentIntentIds } },
          select: { stripePaymentIntentId: true },
        })
      ).map((item: any) => item.stripePaymentIntentId),
    );
    for (const remote of remotePaymentIntents) {
      if (!knownPaymentIntents.has(remote.id)) {
        differences.push(
          untrackedAllwainProviderObject("payment", remote.id, {
            orderId: remote.metadata?.orderId || null,
            paymentId: remote.metadata?.paymentId || null,
            status: remote.status,
          }),
        );
      }
    }

    const refundPaymentIntentIds = remoteRefundScan.items
      .map((item: any) => stripeReconciliationId(item.payment_intent))
      .filter((id: string | null): id is string => Boolean(id));
    const disputePaymentIntentIds = remoteDisputeScan.items
      .map((item: any) => stripeReconciliationId(item.payment_intent))
      .filter((id: string | null): id is string => Boolean(id));
    const knownAllwainPaymentIntentIds = new Set(
      (
        await prisma.allwainPayment.findMany({
          where: {
            stripePaymentIntentId: {
              in: [...new Set([...refundPaymentIntentIds, ...disputePaymentIntentIds])],
            },
          },
          select: { stripePaymentIntentId: true },
        })
      ).map((item: any) => item.stripePaymentIntentId),
    );
    const remoteRefunds = remoteRefundScan.items.filter((item: any) => {
      const paymentIntentId = stripeReconciliationId(item.payment_intent);
      return (
        allwainStripeMetadata(item) ||
        Boolean(paymentIntentId && knownAllwainPaymentIntentIds.has(paymentIntentId))
      );
    });
    const knownRefunds = new Set(
      (
        await prisma.allwainPayment.findMany({
          where: { stripeRefundId: { in: remoteRefunds.map((item: any) => item.id) } },
          select: { stripeRefundId: true },
        })
      ).map((item: any) => item.stripeRefundId),
    );
    for (const remote of remoteRefunds) {
      if (!knownRefunds.has(remote.id)) {
        differences.push(
          untrackedAllwainProviderObject("refund", remote.id, {
            orderId: remote.metadata?.orderId || null,
            paymentIntentId: stripeReconciliationId(remote.payment_intent),
            status: remote.status,
          }),
        );
      }
    }

    const remoteTransfers = remoteTransferScan.items.filter(
      (item: any) =>
        allwainStripeMetadata(item) ||
        String(item.transfer_group || "").startsWith("allwain_order_"),
    );
    const knownTransfers = new Set(
      (
        await prisma.allwainTransfer.findMany({
          where: { stripeTransferId: { in: remoteTransfers.map((item: any) => item.id) } },
          select: { stripeTransferId: true },
        })
      ).map((item: any) => item.stripeTransferId),
    );
    for (const remote of remoteTransfers) {
      if (!knownTransfers.has(remote.id)) {
        differences.push(
          untrackedAllwainProviderObject("transfer", remote.id, {
            orderId: remote.metadata?.orderId || null,
            paymentId: remote.metadata?.paymentId || null,
            destination: stripeReconciliationId(remote.destination),
          }),
        );
      }
    }

    const remoteDisputes = remoteDisputeScan.items.filter((item: any) => {
      const paymentIntent = item.payment_intent;
      const paymentIntentId = stripeReconciliationId(paymentIntent);
      return (
        allwainStripeMetadata(paymentIntent) ||
        Boolean(paymentIntentId && knownAllwainPaymentIntentIds.has(paymentIntentId))
      );
    });
    const knownDisputes = new Set(
      (
        await prisma.allwainDispute.findMany({
          where: { stripeDisputeId: { in: remoteDisputes.map((item: any) => item.id) } },
          select: { stripeDisputeId: true },
        })
      ).map((item: any) => item.stripeDisputeId),
    );
    for (const remote of remoteDisputes) {
      if (!knownDisputes.has(remote.id)) {
        differences.push(
          untrackedAllwainProviderObject("dispute", remote.id, {
            paymentIntentId: stripeReconciliationId(remote.payment_intent),
            status: remote.status,
          }),
        );
      }
    }

    const connectedAccountsRaw = await prisma.allwainSellerPaymentAccount.findMany({
      where: { stripeAccountId: { not: null }, payoutsEnabled: true },
      select: { stripeAccountId: true },
      orderBy: { createdAt: "asc" },
      take: RECONCILIATION_CONNECTED_ACCOUNT_LIMIT + 1,
    });
    const connectedAccountLimited =
      connectedAccountsRaw.length > RECONCILIATION_CONNECTED_ACCOUNT_LIMIT;
    const connectedAccounts = connectedAccountsRaw.slice(
      0,
      RECONCILIATION_CONNECTED_ACCOUNT_LIMIT,
    );
    let remotePayoutCount = 0;
    let remotePayoutLimited = false;
    for (const account of connectedAccounts) {
      const remotePayoutScan = await listStripeReconciliationObjects(
        {
          list: (params: Record<string, unknown>) =>
            stripe.payouts.list(params, {
              stripeAccount: account.stripeAccountId,
            }),
        },
        { created: providerCreated },
      );
      remotePayoutLimited = remotePayoutLimited || remotePayoutScan.limited;
      remotePayoutCount += remotePayoutScan.items.length;
      const knownPayouts = new Set(
        (
          await prisma.allwainSellerPayout.findMany({
            where: {
              stripePayoutId: {
                in: remotePayoutScan.items.map((item: any) => item.id),
              },
            },
            select: { stripePayoutId: true },
          })
        ).map((item: any) => item.stripePayoutId),
      );
      for (const remote of remotePayoutScan.items) {
        if (!knownPayouts.has(remote.id)) {
          differences.push(
            untrackedAllwainProviderObject("payout", remote.id, {
              stripeAccountId: account.stripeAccountId,
              status: remote.status,
            }),
          );
        }
      }
    }

    const summary = {
      checked,
      providerErrors,
      differenceCount: differences.length,
      criticalDifferenceCount: differences.filter(
        (item) => item.severity === "critical",
      ).length,
      localObjects: {
        payments: payments.filter((item: any) => item.stripePaymentIntentId)
          .length,
        refunds: payments.filter((item: any) => item.stripeRefundId).length,
        transfers: transfers.length,
        disputes: disputes.length,
        payouts: payouts.length,
      },
      providerObjects: {
        payments: remotePaymentIntents.length,
        refunds: remoteRefunds.length,
        transfers: remoteTransfers.length,
        disputes: remoteDisputes.length,
        payouts: remotePayoutCount,
      },
      limited: {
        ...limited,
        providerPayments: remotePaymentScan.limited,
        providerRefunds: remoteRefundScan.limited,
        providerTransfers: remoteTransferScan.limited,
        providerDisputes: remoteDisputeScan.limited,
        providerPayouts: remotePayoutLimited,
        connectedAccounts: connectedAccountLimited,
      },
      differences: differences.slice(0, 250),
    };
    const reconciliationIncomplete = Object.values(summary.limited).some(Boolean);
    const status = differences.length || reconciliationIncomplete
      ? "completed_with_differences"
      : "completed";
    const completed = await prisma.$transaction(async (tx: any) => {
      const saved = await tx.allwainReconciliationRun.update({
        where: { id: run.id },
        data: { status, summary: toJson(summary), completedAt: new Date() },
      });
      await appendAllwainAuditEventTx(tx, {
        aggregateType: "reconciliation",
        aggregateId: run.id,
        eventType: `payment.reconciliation_${status}`,
        actorUserId,
        actorRole: context.system ? "system" : "admin",
        source: context.system
          ? "allwain_scheduled_reconciliation"
          : "allwain_admin_reconciliation",
        payload: {
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          checked,
          providerErrors,
          differenceCount: differences.length,
          criticalDifferenceCount: summary.criticalDifferenceCount,
          limited: summary.limited,
        },
      });
      return saved;
    });
    return reconciliationRunDto(completed);
  } catch (error: any) {
    await prisma.$transaction(async (tx: any) => {
      await tx.allwainReconciliationRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          error: String(error?.message || error).slice(0, 1_000),
          completedAt: new Date(),
        },
      });
      await appendAllwainAuditEventTx(tx, {
        aggregateType: "reconciliation",
        aggregateId: run.id,
        eventType: "payment.reconciliation_failed",
        actorUserId,
        actorRole: context.system ? "system" : "admin",
        source: context.system
          ? "allwain_scheduled_reconciliation"
          : "allwain_admin_reconciliation",
        payload: {
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          errorCode: reconciliationProviderError(error),
        },
      });
    });
    throw error;
  }
}

export async function runScheduledAllwainReconciliation() {
  if (!allwainPaymentsConfigured() || ENV.STORAGE_DRIVER !== "postgres") {
    return { skipped: true, reason: "payments_not_enabled" };
  }
  const prisma = getPrisma() as any;
  const latest = await prisma.allwainReconciliationRun.findFirst({
    orderBy: { startedAt: "desc" },
    select: { startedAt: true },
  });
  const interval = Math.max(
    60 * 60 * 1_000,
    Number(ENV.ALLWAIN_RECONCILIATION_INTERVAL_MS) || 86_400_000,
  );
  if (
    latest?.startedAt &&
    Date.now() - new Date(latest.startedAt).getTime() < interval
  ) {
    return { skipped: true, reason: "not_due" };
  }
  try {
    return await runAllwainReconciliation(null, {}, { system: true });
  } catch (error: any) {
    if (error?.message === "RECONCILIATION_ALREADY_RUNNING") {
      return { skipped: true, reason: "already_running" };
    }
    throw error;
  }
}

export async function restoreAllwainWonDisputeTransfers(
  actorUserId: string,
  orderId: string,
  requestId?: string,
) {
  const stripe = requirePaymentsReady();
  const prisma = getPrisma() as any;
  const [actor, order, dispute, payment, determination] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorUserId } }),
    prisma.allwainOrder.findUnique({ where: { id: orderId } }),
    prisma.allwainDispute.findFirst({
      where: {
        orderId,
        status: { in: ["won", "closed_won", "warning_closed"] },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.allwainPayment.findFirst({
      where: { orderId, paidAt: { not: null } },
      orderBy: { paidAt: "desc" },
    }),
    prisma.allwainTaxDetermination.findUnique({
      where: { orderId },
      select: { treatmentCode: true },
    }),
  ]);
  if (!actor) throw new Error("USER_NOT_FOUND");
  if (actor.role !== "admin") throw new Error("FORBIDDEN");
  if (!order) throw new Error("ORDER_NOT_FOUND");
  if (!dispute) throw new Error("DISPUTE_NOT_WON");
  if (!payment) throw new Error("PAYMENT_NOT_FOUND");
  if (isAllwainStripeTestDetermination(determination)) {
    throw new Error("STRIPE_TEST_TRANSFERS_DISABLED");
  }
  if (["refunded", "dispute_lost"].includes(order.paymentStatus))
    throw new Error("ORDER_NOT_PAYABLE");

  const metadata =
    dispute.metadata && typeof dispute.metadata === "object"
      ? (dispute.metadata as Record<string, any>)
      : {};
  const recovery = Array.isArray(metadata.transferRecovery)
    ? metadata.transferRecovery
    : [];
  const amountsByRole = new Map<"seller" | "connector", number>();
  for (const item of recovery) {
    const role = item?.role === "connector" ? "connector" : "seller";
    if (item?.status !== "succeeded" || Number(item?.amount || 0) < 1) continue;
    amountsByRole.set(
      role,
      (amountsByRole.get(role) || 0) + Number(item.amount),
    );
  }
  if (!amountsByRole.size) throw new Error("NO_DISPUTE_TRANSFER_RECOVERY");

  const results: Array<Record<string, unknown>> = [];
  for (const [role, amount] of amountsByRole) {
    const recipientUserId =
      role === "seller" ? order.sellerUserId : order.connectorUserId;
    if (!recipientUserId) continue;
    const operationKey = `allwain-dispute-${dispute.id}-${role}-restoration`;
    const existing = await prisma.allwainTransfer.findUnique({
      where: { idempotencyKey: operationKey },
    });
    if (existing?.stripeTransferId) {
      results.push({
        role,
        amount,
        status: "already_restored",
        transferId: existing.stripeTransferId,
      });
      continue;
    }
    const account = await prisma.allwainSellerPaymentAccount.findUnique({
      where: { userId: recipientUserId },
    });
    if (!account?.stripeAccountId || !account.transfersEnabled) {
      results.push({ role, amount, status: "account_not_ready" });
      continue;
    }
    try {
      const transfer = await stripe.transfers.create(
        {
          amount,
          currency: order.currency,
          destination: account.stripeAccountId,
          transfer_group: `allwain_order_${order.id}`,
          metadata: {
            scope: "allwain_dispute_restoration",
            orderId: order.id,
            paymentId: payment.id,
            disputeId: dispute.stripeDisputeId,
            recipientRole: role,
          },
        },
        { idempotencyKey: operationKey },
      );
      await prisma.$transaction(async (tx: any) => {
        await recordAllwainTransferTx(tx, {
          order,
          payment,
          recipientUserId,
          recipientRole: role,
          stripeAccountId: account.stripeAccountId,
          stripeTransferId: transfer.id,
          amount,
          releaseTrigger: "dispute_won",
          idempotencyKey: operationKey,
        });
        await tx.allwainOrder.update({
          where: { id: order.id },
          data: {
            ...(role === "seller"
              ? {
                  sellerTransferId: transfer.id,
                  sellerTransferStatus: "transferred",
                }
              : {
                  connectorTransferId: transfer.id,
                  connectorTransferStatus: "transferred",
                }),
          },
        });
        await tx.allwainPayment.update({
          where: { id: payment.id },
          data: {
            ...(role === "seller"
              ? {
                  sellerTransferId: transfer.id,
                  sellerTransferStatus: "transferred",
                }
              : {
                  connectorTransferId: transfer.id,
                  connectorTransferStatus: "transferred",
                }),
          },
        });
        await appendAllwainAuditEventTx(tx, {
          aggregateId: order.id,
          eventType: `payment.${role}_transfer_restored_after_dispute`,
          actorUserId,
          actorRole: "admin",
          source: "allwain_admin_dispute_restoration",
          requestId,
          payload: {
            disputeId: dispute.stripeDisputeId,
            stripeTransferId: transfer.id,
            amount,
            currency: order.currency,
            recipientUserId,
          },
        });
      });
      results.push({ role, amount, status: "restored", transferId: transfer.id });
    } catch (error: any) {
      const errorMessage = String(error?.message || error).slice(0, 500);
      await prisma.$transaction(async (tx: any) => {
        await tx.allwainOrder.update({
          where: { id: order.id },
          data: {
            settlementStatus: "dispute_retransfer_attention",
            transferStatus: "retransfer_failed",
          },
        });
        await appendAllwainAuditEventTx(tx, {
          aggregateId: order.id,
          eventType: `payment.${role}_transfer_restoration_failed`,
          actorUserId,
          actorRole: "admin",
          source: "allwain_admin_dispute_restoration",
          requestId,
          payload: {
            disputeId: dispute.stripeDisputeId,
            amount,
            currency: order.currency,
            recipientUserId,
            error: errorMessage,
          },
        });
      });
      results.push({ role, amount, status: "failed", error: errorMessage });
    }
  }

  const failed = results.some((item) =>
    ["failed", "account_not_ready"].includes(String(item.status)),
  );
  const restored = results.some((item) =>
    ["restored", "already_restored"].includes(String(item.status)),
  );
  const current = await prisma.allwainOrder.update({
    where: { id: order.id },
    data: failed
      ? {
          settlementStatus: "dispute_retransfer_attention",
          transferStatus: "retransfer_attention",
        }
      : restored
        ? { settlementStatus: "settled", transferStatus: "transferred" }
        : {},
  });
  if (restored && !failed) {
    await notifyAllwainOrderParticipants(order.id, {
      type: "payment.dispute_transfers_restored",
      title: "Liquidación restaurada",
      body: "Los importes retenidos durante la disputa vuelven a estar liquidados.",
      dedupeSuffix: dispute.stripeDisputeId,
    });
  }
  return {
    orderId: order.id,
    disputeId: dispute.stripeDisputeId,
    settlementStatus: current.settlementStatus,
    transferStatus: current.transferStatus,
    results,
  };
}

async function markAllwainOrderPaid(
  orderId: string,
  paymentId: string,
  intent: any,
  context: PaymentTransitionContext = {},
) {
  const prisma = getPrisma() as any;
  const result = await prisma.$transaction(async (tx: any) => {
    const orderRows = (await tx.$queryRaw(
      Prisma.sql`SELECT * FROM "AllwainOrder" WHERE "id" = ${orderId} FOR UPDATE`,
    )) as any[];
    const order = orderRows[0];
    if (!order) throw new Error("ORDER_NOT_FOUND");
    const platformDirect =
      normalizeAllwainCommercialModel(order.commercialModel) ===
      "platform_direct";
    const [payment, determination] = await Promise.all([
      tx.allwainPayment.findUnique({ where: { id: paymentId } }),
      tx.allwainTaxDetermination.findUnique({
        where: { orderId: order.id },
        select: { treatmentCode: true },
      }),
    ]);
    const testOnlyTransaction =
      isAllwainStripeTestDetermination(determination);
    if (!payment) throw new Error("PAYMENT_NOT_FOUND");

    const latestCharge = intent?.latest_charge;
    const charge =
      latestCharge && typeof latestCharge === "object" ? latestCharge : null;
    const chargeId =
      typeof latestCharge === "string" ? latestCharge : charge?.id || null;
    const balanceTransaction =
      charge?.balance_transaction &&
      typeof charge.balance_transaction === "object"
        ? charge.balance_transaction
        : null;
    const balanceTransactionId =
      typeof charge?.balance_transaction === "string"
        ? charge.balance_transaction
        : balanceTransaction?.id || null;
    const accountingData = {
      ...(intent?.id ? { stripePaymentIntentId: intent.id } : {}),
      ...(chargeId ? { stripeChargeId: chargeId } : {}),
      ...(balanceTransactionId
        ? { stripeBalanceTransactionId: balanceTransactionId }
        : {}),
      ...(typeof balanceTransaction?.fee === "number"
        ? { processorFeeAmount: balanceTransaction.fee }
        : {}),
      ...(typeof balanceTransaction?.net === "number"
        ? { processorNetAmount: balanceTransaction.net }
        : {}),
    };
    const accountingChanged =
      (intent?.id && payment.stripePaymentIntentId !== intent.id) ||
      (chargeId && payment.stripeChargeId !== chargeId) ||
      (balanceTransactionId &&
        payment.stripeBalanceTransactionId !== balanceTransactionId) ||
      (typeof balanceTransaction?.fee === "number" &&
        payment.processorFeeAmount !== balanceTransaction.fee) ||
      (typeof balanceTransaction?.net === "number" &&
        payment.processorNetAmount !== balanceTransaction.net);

    if (payment.paidAt) {
      if (accountingChanged) {
        const updatedPayment = await tx.allwainPayment.update({
          where: { id: payment.id },
          data: accountingData,
        });
        if (balanceTransactionId) {
          await recordAllwainPaymentLedgerTx(tx, order, updatedPayment);
        }
        await appendAllwainAuditEventTx(tx, {
          aggregateId: order.id,
          eventType: "payment.processor_accounting_updated",
          source: "stripe_payment_succeeded",
          requestId: context.requestId,
          providerEventId: context.providerEventId,
          payload: {
            paymentId: payment.id,
            chargeId,
            balanceTransactionId,
            processorFeeAmount: balanceTransaction?.fee ?? null,
            processorNetAmount: balanceTransaction?.net ?? null,
          },
        });
      }
      return { order, duplicate: false, alreadyProcessed: true };
    }

    const otherPaidPayment = await tx.allwainPayment.findFirst({
      where: {
        orderId,
        id: { not: payment.id },
        kind: { in: ["payment", "deferred_charge"] },
        paidAt: { not: null },
      },
      orderBy: { paidAt: "asc" },
    });
    const paymentIsTooLate = ["canceled", "expired", "refunded"].includes(
      order.paymentStatus,
    );
    if (otherPaidPayment || paymentIsTooLate) {
      const latestCharge = intent?.latest_charge;
      const charge =
        latestCharge && typeof latestCharge === "object" ? latestCharge : null;
      await tx.allwainPayment.update({
        where: { id: payment.id },
        data: {
          status: "duplicate_payment",
          stripePaymentIntentId: intent?.id || payment.stripePaymentIntentId,
          stripeChargeId:
            typeof latestCharge === "string"
              ? latestCharge
              : charge?.id || null,
          failureCode: otherPaidPayment
            ? "ORDER_ALREADY_PAID"
            : "ORDER_NO_LONGER_PAYABLE",
          failureMessage:
            "Cobro recibido fuera del estado pagable; reembolso automático pendiente",
        },
      });
      await appendAllwainAuditEventTx(tx, {
        aggregateId: order.id,
        eventType: "payment.duplicate_or_late_charge_detected",
        source: "stripe_payment_succeeded",
        providerEventId: context.providerEventId,
        payload: {
          paymentId: payment.id,
          paymentIntentId: intent?.id || null,
          existingPaidPaymentId: otherPaidPayment?.id || null,
          orderPaymentStatus: order.paymentStatus,
        },
      });
      return { order, duplicate: true, alreadyProcessed: false };
    }

    const contractRows = (await tx.$queryRaw(
      Prisma.sql`SELECT * FROM "Contract" WHERE "id" = ${order.contractId} FOR UPDATE`,
    )) as any[];
    const contract = contractRows[0];
    const offerRows = (await tx.$queryRaw(
      Prisma.sql`SELECT * FROM "Offer" WHERE "id" = ${order.offerId} FOR UPDATE`,
    )) as any[];
    const offer = offerRows[0] as Offer | undefined;
    let inventoryStatus = order.inventoryStatus;
    if (inventoryStatus === "reserved" && offer) {
      await tx.offer.update({
        where: { id: offer.id },
        data: { meta: commitAllwainStock(offer, order.quantity) },
      });
      inventoryStatus = "sold";
    }

    const destinationTransferId =
      typeof charge?.transfer === "string"
        ? charge.transfer
        : charge?.transfer?.id || null;
    const separateTransfers =
      order.paymentArchitecture === "separate_charges_and_transfers";
    const transferState = allwainTransferStateAfterSuccessfulCharge({
      testOnlyNonFiscal: testOnlyTransaction,
      platformDirect,
      separateTransfers,
      existingSellerTransferId: order.sellerTransferId,
      destinationTransferId,
      connectorAllocated: Boolean(
        order.connectorUserId && order.connectorFeeAmount > 0,
      ),
    });
    const {
      sellerTransferId,
      sellerTransferStatus,
      connectorTransferStatus,
      transferStatus,
    } = transferState;
    const now = new Date();
    const paidPaymentStatus = allwainPaymentStatusAfterSuccessfulCharge(
      order.disputeStatus,
    );
    const updatedPayment = await tx.allwainPayment.update({
      where: { id: payment.id },
      data: {
        status: paidPaymentStatus,
        ...accountingData,
        stripeTransferId: sellerTransferId,
        sellerTransferId,
        sellerTransferStatus,
        connectorTransferStatus,
        transferStatus,
        paidAt: now,
        failureCode: null,
        failureMessage: null,
      },
    });
    const updated = await tx.allwainOrder.update({
      where: { id: order.id },
      data: {
        status: deriveAllwainOrderStatus({
          paymentStatus: paidPaymentStatus,
          fulfillmentStatus: order.fulfillmentStatus || "pending",
          disputeStatus: order.disputeStatus,
        }),
        paymentStatus: paidPaymentStatus,
        fulfillmentStatus:
          order.fulfillmentStatus === "not_started"
            ? "pending"
            : order.fulfillmentStatus,
        sellerTransferId,
        sellerTransferStatus,
        connectorTransferStatus,
        transferStatus,
        inventoryStatus,
        ...(testOnlyTransaction
          ? { documentStatus: "test_only_not_issued" }
          : {}),
        reservationExpiresAt: null,
        paidAt: now,
      },
    });
    if (contract) {
      await tx.contract.update({
        where: { id: contract.id },
        data: {
          paymentStatus: paidPaymentStatus,
          inventoryStatus,
          updatedAt: now,
        },
      });
    }
    await tx.allwainOrderStatusEvent.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: updated.status,
        source: "stripe_payment_succeeded",
        metadata: {
          paymentIntentId: intent?.id || null,
          providerEventId: context.providerEventId || null,
        },
      },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateId: order.id,
      eventType: "payment.succeeded",
      source: "stripe_payment_succeeded",
      requestId: context.requestId,
      providerEventId: context.providerEventId,
      payload: {
        paymentId: payment.id,
        paymentIntentId: intent?.id || null,
        chargeId:
          typeof latestCharge === "string" ? latestCharge : charge?.id || null,
        sellerTransferId,
        amount: payment.amount,
        currency: payment.currency,
        platformFeeAmount: payment.platformFeeAmount,
        platformRetainedAmount: payment.platformRetainedAmount,
        sellerAmount: payment.sellerAmount,
        commercialModel: payment.commercialModel,
        businessOfRecord: payment.businessOfRecord,
        inventoryStatus,
        paymentStatus: paidPaymentStatus,
      },
    });
    await ensureAllwainOrderComplianceTx(tx, updated);
    await recordAllwainPaymentLedgerTx(tx, updated, updatedPayment);
    if (testOnlyTransaction) {
      await appendAllwainAuditEventTx(tx, {
        aggregateId: order.id,
        eventType: "payment.stripe_test_fiscal_document_skipped",
        source: "allwain_stripe_test_gate",
        requestId: context.requestId,
        providerEventId: context.providerEventId,
        payload: {
          paymentId: updatedPayment.id,
          reason: "test_only_no_legal_effect",
          documentStatus: "test_only_not_issued",
        },
      });
    } else {
      await ensureAllwainRequiredFiscalDocumentsTx(tx, updated);
    }
    await ensureAllwainOperationalDocumentTx(
      tx,
      updated,
      "purchase_confirmation",
      {
        paymentId: updatedPayment.id,
        stripePaymentIntentId: updatedPayment.stripePaymentIntentId,
        stripeChargeId: updatedPayment.stripeChargeId,
      },
    );
    await markAllwainRecurringPaymentSucceededTx(tx, {
      order: updated,
      payment: updatedPayment,
      intent,
      providerEventId: context.providerEventId,
    });
    return { order: updated, duplicate: false, alreadyProcessed: false };
  });

  if (result.duplicate && intent?.id) {
    const separateTransfers =
      result.order.paymentArchitecture === "separate_charges_and_transfers";
    const refund = await getStripe().refunds.create(
      {
        payment_intent: intent.id,
        ...(!separateTransfers
          ? { reverse_transfer: true, refund_application_fee: true }
          : {}),
        metadata: { scope: "allwain_duplicate_payment", orderId, paymentId },
      },
      { idempotencyKey: `allwain-duplicate-refund-${paymentId}` },
    );
    await prisma.$transaction(async (tx: any) => {
      await tx.allwainPayment.update({
        where: { id: paymentId },
        data: {
          status: "duplicate_refunded",
          stripeRefundId: refund.id,
          refundedAmount: refund.amount,
        },
      });
      await appendAllwainAuditEventTx(tx, {
        aggregateId: orderId,
        eventType: "payment.duplicate_refunded",
        source: "stripe_automatic_refund",
        providerEventId: context.providerEventId,
        payload: {
          paymentId,
          paymentIntentId: intent.id,
          refundId: refund.id,
          amount: refund.amount,
          status: refund.status,
        },
      });
    });
  }
  if (!result.duplicate) {
    if (!result.alreadyProcessed) {
      await notifyAllwainOrderParticipants(orderId, {
        targets: ["buyer", "seller"],
        type: "payment.succeeded",
        title: "Pago confirmado",
        body: "Stripe ha confirmado el pago. El pedido puede continuar.",
        dedupeSuffix: paymentId,
      });
    }
    const latestCharge = intent?.latest_charge;
    const chargeId =
      typeof latestCharge === "string"
        ? latestCharge
        : latestCharge?.id || null;
    if (
      result.order.paymentArchitecture === "separate_charges_and_transfers" &&
      chargeId
    ) {
      return syncAllwainOrderTransfers(orderId, chargeId, paymentId, context);
    }
  }
  return result.order;
}

async function processBuyerPaymentProfileSession(
  session: any,
  context: PaymentTransitionContext & { source?: string } = {},
) {
  const userId = String(session?.metadata?.buyerUserId || "");
  if (!userId || session.mode !== "setup") return;
  const prisma = getPrisma() as any;
  const profile = await prisma.allwainBuyerPaymentProfile.findUnique({
    where: { userId },
  });
  if (
    !profile ||
    profile.stripeCustomerId !==
      (typeof session.customer === "string"
        ? session.customer
        : session.customer?.id)
  ) {
    throw new Error("BUYER_PAYMENT_PROFILE_MISMATCH");
  }
  const setupIntentId =
    typeof session.setup_intent === "string"
      ? session.setup_intent
      : session.setup_intent?.id;
  if (!setupIntentId) throw new Error("SETUP_INTENT_MISSING");
  const setupIntent: any = await getStripe().setupIntents.retrieve(
    setupIntentId,
    { expand: ["payment_method"] },
  );
  if (setupIntent.status !== "succeeded") {
    await prisma.allwainBuyerPaymentProfile.update({
      where: { userId },
      data: {
        paymentMethodStatus: "failed",
        stripeSetupIntentId: setupIntentId,
        lastSyncedAt: new Date(),
      },
    });
    return;
  }
  const paymentMethod = setupIntent.payment_method;
  const paymentMethodId =
    typeof paymentMethod === "string" ? paymentMethod : paymentMethod?.id;
  if (!paymentMethodId) throw new Error("PAYMENT_METHOD_MISSING");
  const card =
    paymentMethod && typeof paymentMethod === "object"
      ? paymentMethod.card
      : (await getStripe().paymentMethods.retrieve(paymentMethodId) as any).card;
  await getStripe().customers.update(profile.stripeCustomerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });
  const now = new Date();
  await prisma.allwainBuyerPaymentProfile.update({
    where: { userId },
    data: {
      paymentMethodStatus: "ready",
      defaultPaymentMethodId: paymentMethodId,
      defaultCardBrand: card?.brand || null,
      defaultCardLast4: card?.last4 || null,
      defaultCardExpMonth: card?.exp_month || null,
      defaultCardExpYear: card?.exp_year || null,
      stripeSetupIntentId: setupIntentId,
      stripeCheckoutSessionId: session.id,
      lastSyncedAt: now,
    },
  });
  await appendAllwainAuditEvent({
    aggregateType: "buyer_payment_profile",
    aggregateId: userId,
    eventType: "buyer.payment_method_ready",
    actorUserId: userId,
    source: context.source || "stripe_setup_succeeded",
    providerEventId: context.providerEventId,
    payload: {
      checkoutSessionId: session.id,
      setupIntentId,
      paymentMethodFingerprint: createHash("sha256")
        .update(paymentMethodId)
        .digest("hex"),
      cardBrand: card?.brand || null,
      cardLast4: card?.last4 || null,
    },
  });
}

async function processCheckoutSession(
  session: any,
  context: PaymentTransitionContext & { source?: string } = {},
) {
  if (session?.metadata?.scope === "allwain_buyer_payment_profile") {
    await processBuyerPaymentProfileSession(session, context);
    return;
  }
  const prisma = getPrisma() as any;
  const payment = await prisma.allwainPayment.findFirst({
    where: {
      OR: [
        { stripeCheckoutSessionId: session.id },
        ...(session?.metadata?.paymentId
          ? [{ id: session.metadata.paymentId }]
          : []),
      ],
    },
  });
  if (!payment) return;
  const order = await prisma.allwainOrder.findUnique({
    where: { id: payment.orderId },
  });
  if (!order) throw new Error("ORDER_NOT_FOUND");

  const shippingDetails =
    session?.collected_information?.shipping_details ||
    session?.shipping_details ||
    null;
  const checkoutDeliveryAddress = allwainDeliveryAddressFromCheckout(
    order.deliveryAddress,
    shippingDetails,
    session?.customer_details?.phone,
  );
  if (checkoutDeliveryAddress) {
    const validatedAddress = toJson(checkoutDeliveryAddress);
    await prisma.$transaction([
      prisma.allwainOrder.update({
        where: { id: order.id },
        data: { deliveryAddress: validatedAddress },
      }),
      prisma.contract.update({
        where: { id: order.contractId },
        data: { deliveryAddress: validatedAddress, updatedAt: new Date() },
      }),
    ]);
  }

  if (session.mode === "setup") {
    const setupIntentId =
      typeof session.setup_intent === "string"
        ? session.setup_intent
        : session.setup_intent?.id;
    if (!setupIntentId) throw new Error("SETUP_INTENT_MISSING");
    const setupIntent: any =
      await getStripe().setupIntents.retrieve(setupIntentId);
    const paymentMethodId =
      typeof setupIntent.payment_method === "string"
        ? setupIntent.payment_method
        : setupIntent.payment_method?.id;
    await prisma.allwainPayment.update({
      where: { id: payment.id },
      data: {
        status: "payment_method_saved",
        stripeSetupIntentId: setupIntentId,
        stripePaymentMethodId: paymentMethodId || null,
      },
    });
    if (order.recurringPlanId && paymentMethodId) {
      await prisma.allwainRecurringPlan.updateMany({
        where: {
          id: order.recurringPlanId,
          buyerUserId: order.buyerUserId,
          status: "pending_initial_payment",
        },
        data: {
          stripeCustomerId: payment.stripeCustomerId,
          stripePaymentMethodId: paymentMethodId,
        },
      });
    }
    await transitionPaymentStatus(
      order.id,
      "payment_method_saved",
      context.source || "stripe_setup_succeeded",
      { reservationExpiresAt: order.preorderChargeDeadlineAt },
      {
        actorUserId: order.buyerUserId,
        requestId: context.requestId,
        providerEventId: context.providerEventId,
      },
    );
    await notifyAllwainOrderParticipants(order.id, {
      targets: ["buyer", "seller"],
      type: "order.preorder_ready",
      title: "Reserva preparada",
      body: `La tarjeta está guardada, pero todavía no se ha cobrado. El vendedor podrá confirmar el cobro hasta el ${allwainPreorderDeadlineLabel(order.preorderChargeDeadlineAt)}. El envío solo se creará después del pago.`,
      dedupeSuffix: setupIntentId,
    });
    return;
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;
  if (canApplyCheckoutStatusToAllwainPaymentRecord(payment)) {
    await prisma.allwainPayment.update({
      where: { id: payment.id },
      data: {
        status:
          session.payment_status === "paid"
            ? "processing"
            : "payment_processing",
        stripePaymentIntentId: paymentIntentId || null,
      },
    });
  } else if (paymentIntentId && !payment.stripePaymentIntentId) {
    await prisma.allwainPayment.update({
      where: { id: payment.id },
      data: { stripePaymentIntentId: paymentIntentId },
    });
  }
  if (session.payment_status === "paid" && paymentIntentId) {
    const intent: any = await getStripe().paymentIntents.retrieve(
      paymentIntentId,
      {
        expand: ["latest_charge.balance_transaction"],
      },
    );
    await markAllwainOrderPaid(order.id, payment.id, intent, context);
  } else {
    await transitionPaymentStatus(
      order.id,
      "payment_processing",
      context.source || "stripe_checkout_completed",
      {},
      context,
    );
  }
}

async function processPaymentIntent(
  intent: any,
  context: PaymentTransitionContext = {},
) {
  const prisma = getPrisma() as any;
  const authoritative: any = await getStripe().paymentIntents.retrieve(
    intent.id,
    {
      expand: ["latest_charge.balance_transaction"],
    },
  );
  const payment = await prisma.allwainPayment.findFirst({
    where: {
      OR: [
        { stripePaymentIntentId: authoritative.id },
        ...(authoritative?.metadata?.paymentId
          ? [{ id: authoritative.metadata.paymentId }]
          : []),
      ],
    },
  });
  if (!payment) return;
  if (authoritative.status === "succeeded") {
    await markAllwainOrderPaid(
      payment.orderId,
      payment.id,
      authoritative,
      context,
    );
    return;
  }
  const failedStatus =
    authoritative.status === "canceled"
      ? "payment_canceled"
      : authoritative.status === "requires_action"
        ? "requires_customer_action"
        : "payment_failed";
  await prisma.allwainPayment.update({
    where: { id: payment.id },
    data: {
      status: failedStatus,
      stripePaymentIntentId: authoritative.id,
      failureCode: authoritative.last_payment_error?.code || null,
      failureMessage: authoritative.last_payment_error?.message || null,
    },
  });
  await transitionPaymentStatus(
    payment.orderId,
    failedStatus,
    `stripe_${failedStatus}`,
    {},
    context,
  );
}

async function reverseAllwainTransfersForExternalRefund(
  order: any,
  payment: any,
  refundPayment: any,
  allocation: any,
  context: PaymentTransitionContext,
) {
  const stripe = getStripe();
  const prisma = getPrisma() as any;
  for (const item of [
    {
      role: "seller" as const,
      transferId: order.sellerTransferId || payment.sellerTransferId,
      amount: Number(allocation?.sellerAmount || 0),
    },
    {
      role: "connector" as const,
      transferId: order.connectorTransferId || payment.connectorTransferId,
      amount: Number(allocation?.connectorAmount || 0),
    },
  ]) {
    if (!item.transferId || item.amount < 1) continue;
    try {
      const reversal = await stripe.transfers.createReversal(
        item.transferId,
        {
          amount: item.amount,
          metadata: {
            scope: "allwain_refund",
            orderId: order.id,
            refundPaymentId: refundPayment.id,
            recipientRole: item.role,
          },
        },
        {
          idempotencyKey: `allwain-external-refund-${refundPayment.stripeRefundId}-${item.role}-reversal`,
        },
      );
      await prisma.$transaction(async (tx: any) => {
        await recordAllwainTransferReversalTx(tx, {
          order,
          payment,
          recipientRole: item.role,
          stripeTransferId: item.transferId,
          stripeReversalId: reversal.id,
          amount: item.amount,
        });
        await appendAllwainAuditEventTx(tx, {
          aggregateId: order.id,
          eventType: `payment.${item.role}_transfer_reversed`,
          source: "stripe_external_refund",
          providerEventId: context.providerEventId,
          payload: {
            refundPaymentId: refundPayment.id,
            stripeRefundId: refundPayment.stripeRefundId,
            stripeTransferId: item.transferId,
            stripeReversalId: reversal.id,
            amount: item.amount,
          },
        });
      });
    } catch (error: any) {
      const failureMessage = String(
        error?.message || "Stripe transfer reversal error",
      ).slice(0, 500);
      await prisma.$transaction(async (tx: any) => {
        await tx.allwainTransfer.updateMany({
          where: { stripeTransferId: item.transferId },
          data: {
            status: "reversal_failed",
            failureCode: error?.code || null,
            failureMessage,
          },
        });
        await tx.allwainOrder.update({
          where: { id: order.id },
          data: {
            transferStatus: "reversal_attention",
            settlementStatus: "refund_reversal_attention",
            ...(item.role === "seller"
              ? { sellerTransferStatus: "reversal_failed" }
              : { connectorTransferStatus: "reversal_failed" }),
          },
        });
        await appendAllwainAuditEventTx(tx, {
          aggregateId: order.id,
          eventType: `payment.${item.role}_transfer_reversal_failed`,
          source: "stripe_external_refund",
          providerEventId: context.providerEventId,
          payload: {
            refundPaymentId: refundPayment.id,
            stripeRefundId: refundPayment.stripeRefundId,
            stripeTransferId: item.transferId,
            amount: item.amount,
            error: failureMessage,
          },
        });
      });
      throw error;
    }
  }
}

async function processChargeRefunded(
  charge: any,
  context: PaymentTransitionContext = {},
) {
  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id;
  if (!paymentIntentId) return;
  const prisma = getPrisma() as any;
  const payment = await prisma.allwainPayment.findUnique({
    where: { stripePaymentIntentId: paymentIntentId },
  });
  if (!payment) return;
  const fullyRefunded = charge.amount_refunded >= charge.amount;
  const duplicateRefund =
    ["duplicate_payment", "duplicate_refunded"].includes(payment.status) ||
    ["ORDER_ALREADY_PAID", "ORDER_NO_LONGER_PAYABLE"].includes(
      payment.failureCode || "",
    );
  let refunds = Array.isArray(charge.refunds?.data) ? charge.refunds.data : [];
  if (charge.refunds?.has_more && charge.id) {
    refunds = (
      await getStripe().refunds.list({ charge: charge.id, limit: 100 })
    ).data;
  }
  if (duplicateRefund) {
    await prisma.$transaction(async (tx: any) => {
      for (const refund of refunds) {
        await tx.allwainPayment.updateMany({
          where: { stripeRefundId: refund.id },
          data: { status: refund.status || "pending" },
        });
      }
      await tx.allwainPayment.update({
        where: { id: payment.id },
        data: {
          refundedAmount: charge.amount_refunded,
          status: "duplicate_refunded",
        },
      });
    });
    await appendAllwainAuditEvent({
      aggregateId: payment.orderId,
      eventType: "payment.duplicate_refund_confirmed",
      source: "stripe_charge_refunded",
      providerEventId: context.providerEventId,
      payload: {
        paymentId: payment.id,
        paymentIntentId,
        amountRefunded: charge.amount_refunded,
      },
    });
    return;
  }

  const transferReversals: Array<{
    order: any;
    refundPayment: any;
    allocation: any;
  }> = [];

  await prisma.$transaction(async (tx: any) => {
    const orderRows = (await tx.$queryRaw(
      Prisma.sql`SELECT * FROM "AllwainOrder" WHERE "id" = ${payment.orderId} FOR UPDATE`,
    )) as any[];
    const order = orderRows[0];
    if (!order) return;
    const succeededRefunds = refunds
      .filter((refund: any) => refund.status === "succeeded")
      .sort(
        (left: any, right: any) =>
          Number(left.created || 0) - Number(right.created || 0),
      );
    let cumulative = 0;
    for (const refund of refunds) {
      let refundPayment = await tx.allwainPayment.findUnique({
        where: { stripeRefundId: refund.id },
      });
      const orderedIndex = succeededRefunds.findIndex(
        (item: any) => item.id === refund.id,
      );
      const deterministicBefore = succeededRefunds
        .slice(0, Math.max(0, orderedIndex))
        .reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
      const storedMetadata = (refundPayment?.metadata || {}) as Record<
        string,
        any
      >;
      const allocation =
        storedMetadata.refundAllocation ||
        allwainRefundAllocation(
          order,
          payment,
          deterministicBefore,
          Number(refund.amount || 0),
        );
      if (!refundPayment) {
        refundPayment = await tx.allwainPayment.create({
          data: {
            orderId: order.id,
            kind: "refund",
            status: refund.status || "pending",
            operationKey: `allwain:stripe-refund:${refund.id}`,
            amount: Number(refund.amount || 0),
            currency: String(refund.currency || order.currency).toLowerCase(),
            platformFeeAmount: 0,
            platformRetainedAmount: 0,
            sellerAmount: 0,
            commercialModel: normalizeAllwainCommercialModel(
              order.commercialModel,
            ),
            businessOfRecord: order.businessOfRecord,
            stripeRefundId: refund.id,
            metadata: {
              originalPaymentId: payment.id,
              source: "stripe_dashboard_or_external",
              refundAllocation: allocation,
            },
          },
        });
      } else {
        refundPayment = await tx.allwainPayment.update({
          where: { id: refundPayment.id },
          data: {
            status: refund.status || "pending",
            metadata: {
              ...storedMetadata,
              originalPaymentId: payment.id,
              refundAllocation: allocation,
            },
          },
        });
      }
      if (refund.status !== "succeeded") continue;
      cumulative += Number(refund.amount || 0);
      await recordAllwainRefundLedgerTx(tx, {
        order,
        originalPayment: payment,
        refundPayment,
        stripeRefundId: refund.id,
        refundAmount: Number(refund.amount || 0),
        sellerAmount: Number(allocation.sellerAmount || 0),
        connectorAmount: Number(allocation.connectorAmount || 0),
        platformAmount: Number(allocation.platformAmount || 0),
        totalRefunded: Math.max(
          cumulative,
          Number(allocation.cumulativeAfter || 0),
        ),
      });
      await ensureAllwainOperationalDocumentTx(
        tx,
        order,
        "refund_confirmation",
        {
          sourceReference: refund.id,
          refundAmount: Number(refund.amount || 0),
          totalRefunded: Math.max(
            cumulative,
            Number(allocation.cumulativeAfter || 0),
          ),
          stripeRefundId: refund.id,
        },
      );
      await appendAllwainAuditEventTx(tx, {
        aggregateId: order.id,
        eventType: "payment.refund_confirmed",
        source: "stripe_charge_refunded",
        providerEventId: context.providerEventId,
        payload: {
          paymentId: payment.id,
          refundPaymentId: refundPayment.id,
          stripeRefundId: refund.id,
          amount: refund.amount,
          allocation,
        },
      });
      transferReversals.push({ order, refundPayment, allocation });
    }
    await tx.allwainPayment.update({
      where: { id: payment.id },
      data: {
        refundedAmount: charge.amount_refunded,
        status: fullyRefunded ? "refunded" : "partially_refunded",
      },
    });
  });
  for (const item of transferReversals) {
    await reverseAllwainTransfersForExternalRefund(
      item.order,
      payment,
      item.refundPayment,
      item.allocation,
      context,
    );
  }
  await transitionPaymentStatus(
    payment.orderId,
    fullyRefunded ? "refunded" : "partially_refunded",
    "stripe_charge_refunded",
    { refundedAmount: charge.amount_refunded },
    context,
  );
}

async function registerStripeEvent(event: any) {
  if (Boolean(event?.livemode) !== ENV.ALLWAIN_STRIPE_LIVEMODE) {
    throw new Error("STRIPE_LIVEMODE_MISMATCH");
  }
  const prisma = getPrisma() as any;
  const existing = await prisma.allwainStripeEvent.findUnique({
    where: { providerEventId: event.id },
  });
  if (existing?.status === "processed")
    return { duplicate: true, record: existing };
  if (
    existing?.status === "processing" &&
    Date.now() - new Date(existing.createdAt).getTime() < 5 * 60_000
  ) {
    return { duplicate: true, record: existing };
  }
  if (existing) {
    const record = await prisma.allwainStripeEvent.update({
      where: { id: existing.id },
      data: { status: "processing", error: null },
    });
    return { duplicate: false, record };
  }
  try {
    const record = await prisma.allwainStripeEvent.create({
      data: {
        providerEventId: event.id,
        type: event.type,
        livemode: Boolean(event.livemode),
        accountId: event.account || event?.related_object?.id || null,
        metadata: { created: event.created || null },
      },
    });
    return { duplicate: false, record };
  } catch (error: any) {
    if (error?.code !== "P2002") throw error;
    const concurrent = await prisma.allwainStripeEvent.findUnique({
      where: { providerEventId: event.id },
    });
    return { duplicate: true, record: concurrent };
  }
}

async function finishStripeEvent(recordId: string, error?: unknown) {
  await (getPrisma() as any).allwainStripeEvent.update({
    where: { id: recordId },
    data: error
      ? {
          status: "failed",
          error: String((error as any)?.message || error).slice(0, 1_000),
        }
      : { status: "processed", processedAt: new Date(), error: null },
  });
}

async function syncAccountFromWebhook(accountId: string) {
  const record = await (
    getPrisma() as any
  ).allwainSellerPaymentAccount.findUnique({
    where: { stripeAccountId: accountId },
  });
  if (record) await retrieveAndPersistStripeAccount(record.userId, accountId);
}

async function expireAllwainReservation(
  orderId: string,
  source: string,
  context: PaymentTransitionContext = {},
  force = false,
) {
  const prisma = getPrisma() as any;
  const expired = await prisma.$transaction(async (tx: any) => {
    const rows = (await tx.$queryRaw(
      Prisma.sql`SELECT * FROM "AllwainOrder" WHERE "id" = ${orderId} FOR UPDATE`,
    )) as any[];
    const order = rows[0];
    if (!order) return false;
    const now = new Date();
    const savedPreorderAtDeadline = isAllwainSavedPreorderPastDeadline(
      order,
      now,
    );
    if (
      !isAllwainReservationReleaseable(order) &&
      !savedPreorderAtDeadline
    ) {
      return false;
    }
    if (
      !force &&
      (!order.reservationExpiresAt || order.reservationExpiresAt > now)
    ) {
      return false;
    }

    const offerRows = (await tx.$queryRaw(
      Prisma.sql`SELECT * FROM "Offer" WHERE "id" = ${order.offerId} FOR UPDATE`,
    )) as any[];
    const offer = offerRows[0] as Offer | undefined;
    if (offer) {
      const released = releaseAllwainOfferStock(offer, order.quantity);
      await tx.offer.update({
        where: { id: offer.id },
        data: released,
      });
    }
    await tx.allwainPayment.updateMany({
      where: {
        orderId,
        status: {
          in: [
            "creating_checkout",
            "checkout_open",
            "payment_processing",
            "payment_method_saved",
          ],
        },
      },
      data: { status: "checkout_expired" },
    });
    await tx.allwainOrder.update({
      where: { id: orderId },
      data: {
        status: "expired",
        paymentStatus: "expired",
        inventoryStatus: "released",
        reservationExpiresAt: null,
        canceledAt: now,
      },
    });
    await tx.contract.update({
      where: { id: order.contractId },
      data: {
        paymentStatus: "expired",
        inventoryStatus: "released",
        updatedAt: now,
      },
    });
    await tx.allwainOrderStatusEvent.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: "expired",
        source,
        metadata: { providerEventId: context.providerEventId || null },
      },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateId: orderId,
      eventType: "order.reservation_expired",
      source,
      requestId: context.requestId,
      providerEventId: context.providerEventId,
      payload: {
        previousPaymentStatus: order.paymentStatus,
        quantityReleased: order.quantity,
        unit: order.unit,
      },
    });
    return true;
  });
  if (expired) {
    await notifyAllwainOrderParticipants(orderId, {
      targets: ["buyer", "seller"],
      type: "order.reservation_expired",
      title: "La reserva ha caducado",
      body: "No se realizó ningún cobro. El stock reservado vuelve a estar disponible y el historial permanece guardado.",
      dedupeSuffix: source,
    });
  }
  return expired;
}

function allwainPreorderReminderCopy(
  stage: AllwainPreorderReminderStage,
  deadline: Date | string,
) {
  const date = allwainPreorderDeadlineLabel(deadline);
  if (stage === "1_day") {
    return {
      title: "La reserva vence en menos de un día",
      body: `El vendedor debe confirmar el cobro antes del ${date}. Hasta entonces no se cobrará ni se solicitará el envío.`,
    };
  }
  if (stage === "7_days") {
    return {
      title: "Queda una semana para confirmar la reserva",
      body: `La reserva sigue preparada para cobro hasta el ${date}. El envío solo se solicitará después de pagar.`,
    };
  }
  return {
    title: "Tu reserva sigue preparada",
    body: `La tarjeta está guardada y todavía no hay ningún cobro. La fecha límite para confirmarlo es el ${date}.`,
  };
}

export async function runAllwainPreorderReminderMaintenance(now = new Date()) {
  if (ENV.STORAGE_DRIVER !== "postgres") {
    return { candidates: 0, notified: 0, failed: 0 };
  }
  const prisma = getPrisma() as any;
  const reminderLimit = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000);
  const orders = await prisma.allwainOrder.findMany({
    where: {
      operationalArchivedAt: null,
      paymentMode: "preorder",
      paymentStatus: "payment_method_saved",
      status: { notIn: ["expired", "canceled", "completed"] },
      preorderChargeDeadlineAt: { gt: now, lte: reminderLimit },
    },
    select: {
      id: true,
      preorderChargeDeadlineAt: true,
      preorderReminderStage: true,
    },
    orderBy: [{ preorderChargeDeadlineAt: "asc" }, { id: "asc" }],
    take: 500,
  });
  const result = { candidates: orders.length, notified: 0, failed: 0 };
  for (const order of orders) {
    const stage = allwainPreorderReminderStage(
      order.preorderChargeDeadlineAt,
      now,
    );
    if (
      !stage ||
      !shouldAdvanceAllwainPreorderReminder(order.preorderReminderStage, stage)
    ) {
      continue;
    }
    try {
      const claimed = await prisma.$transaction(async (tx: any) => {
        const update = await tx.allwainOrder.updateMany({
          where: {
            id: order.id,
            preorderReminderStage: order.preorderReminderStage,
          },
          data: { preorderReminderStage: stage },
        });
        if (!update.count) return false;
        await appendAllwainAuditEventTx(tx, {
          aggregateId: order.id,
          eventType: "order.preorder_reminder_scheduled",
          source: "preorder_reminder_maintenance",
          payload: {
            stage,
            chargeDeadlineAt: order.preorderChargeDeadlineAt,
          },
        });
        return true;
      });
      if (!claimed) continue;
      const copy = allwainPreorderReminderCopy(
        stage,
        order.preorderChargeDeadlineAt,
      );
      await notifyAllwainOrderParticipants(order.id, {
        targets: ["buyer", "seller"],
        type: "order.preorder_reminder",
        title: copy.title,
        body: copy.body,
        dedupeSuffix: stage,
      });
      result.notified += 1;
    } catch (error) {
      result.failed += 1;
      console.error("ALLWAIN_PREORDER_REMINDER_ERROR", order.id, error);
    }
  }
  return result;
}

async function prepareAllwainRecurringCarrierQuoteId(planId: string) {
  const prisma = getPrisma() as any;
  const plan = await prisma.allwainRecurringPlan.findUnique({
    where: { id: planId },
  });
  if (!plan || plan.deliveryChannel !== "carrier") return null;
  const sourceOrder = await prisma.allwainOrder.findUnique({
    where: { id: plan.sourceOrderId },
    include: { carrierQuote: true },
  });
  if (!sourceOrder?.carrierQuote) {
    throw new Error("RECURRING_CARRIER_SOURCE_QUOTE_MISSING");
  }
  const address =
    plan.deliveryAddress && typeof plan.deliveryAddress === "object"
      ? plan.deliveryAddress
      : {};
  const result = await createAllwainCarrierQuotes(plan.buyerUserId, {
    offerId: plan.offerId,
    quantity: Number(plan.quantity),
    addressLine1: String(address.formatted || ""),
    postalCode: String(address.postalCode || ""),
    city: String(address.city || ""),
    countryCode: String(address.countryCode || "ES"),
    phone: String(address.phone || "") || null,
  });
  const selected = selectAllwainRecurringCarrierQuote({
    quotes: result.quotes,
    preferredShippingOptionCode:
      sourceOrder.carrierQuote.shippingOptionCode,
    nonShippingAmount:
      Number(sourceOrder.totalAmount) - Number(sourceOrder.shippingAmount || 0),
    maximumChargeAmount: Number(plan.maximumChargeAmount),
    currency: plan.currency,
  });
  return selected.id;
}

export async function runAllwainRecurringPaymentMaintenance(now = new Date()) {
  if (ENV.STORAGE_DRIVER !== "postgres" || !allwainPaymentsConfigured()) {
    return { due: 0, recovered: 0, paid: 0, pending: 0, failed: 0 };
  }
  const stripe = requirePaymentsReady();
  const prisma = getPrisma() as any;
  const duePlanIds = await dueAllwainRecurringPlanIds(now, 25);
  const processingOccurrences = await prisma.allwainRecurringOccurrence.findMany({
    where: { status: "processing" },
    orderBy: { startedAt: "asc" },
    take: 50,
  });
  const claims: any[] = [];
  for (const occurrence of processingOccurrences) {
    const [plan, order, payment, determination] = await Promise.all([
      prisma.allwainRecurringPlan.findUnique({ where: { id: occurrence.planId } }),
      occurrence.orderId
        ? prisma.allwainOrder.findUnique({ where: { id: occurrence.orderId } })
        : null,
      occurrence.paymentId
        ? prisma.allwainPayment.findUnique({ where: { id: occurrence.paymentId } })
        : null,
      occurrence.orderId
        ? prisma.allwainTaxDetermination.findUnique({
            where: { orderId: occurrence.orderId },
            select: { treatmentCode: true },
          })
        : null,
    ]);
    const seller = plan
      ? await prisma.allwainSellerPaymentAccount.findUnique({
          where: { userId: plan.sellerUserId },
        })
      : null;
    const platformDirect =
      order &&
      normalizeAllwainCommercialModel(order.commercialModel) ===
        "platform_direct";
    const testOnlyNonFiscal =
      isAllwainStripeTestDetermination(determination);
    if (
      plan &&
      order &&
      payment &&
      (platformDirect || testOnlyNonFiscal || seller)
    ) {
      claims.push({
        plan,
        order,
        payment,
        occurrence,
        seller,
        recovered: true,
        testOnlyNonFiscal,
      });
    }
  }

  let schedulingFailures = 0;
  for (const planId of duePlanIds) {
    if (claims.some((claim) => claim.plan.id === planId)) continue;
    try {
      const carrierQuoteId =
        await prepareAllwainRecurringCarrierQuoteId(planId);
      const claim = await claimAllwainRecurringOccurrence(planId, now, {
        carrierQuoteId,
      });
      if (claim) claims.push({ ...claim, recovered: false });
    } catch (error) {
      schedulingFailures += 1;
      await recordAllwainRecurringPlanFailure(planId, error);
      const plan = await prisma.allwainRecurringPlan.findUnique({
        where: { id: planId },
      });
      if (plan) {
        const priceReapprovalRequired =
          error instanceof Error &&
          error.message ===
            "RECURRING_CARRIER_PRICE_REAPPROVAL_REQUIRED";
        await notifyAllwainUser({
          userId: plan.buyerUserId,
          type: "recurring.requires_action",
          title: priceReapprovalRequired
            ? "El transporte ha cambiado de precio"
            : "Revisa tu pedido recurrente",
          body: priceReapprovalRequired
            ? "No se ha realizado ningún cobro ni envío. Revisa el nuevo transporte y confirma el máximo antes de continuar."
            : "No hemos podido preparar la siguiente entrega. Abre tus pedidos para revisar el motivo.",
          route: "recurring_plan",
          routeParams: { planId },
          dedupeKey: `recurring.requires_action:${planId}:${plan.updatedAt?.toISOString?.() || now.toISOString()}`,
        });
      }
    }
  }

  const result = {
    due: duePlanIds.length,
    recovered: processingOccurrences.length,
    paid: 0,
    pending: 0,
    failed: schedulingFailures,
  };
  for (const claim of claims) {
    const {
      plan,
      order,
      payment,
      occurrence,
      seller,
      testOnlyNonFiscal,
    } = claim;
    const commercialModel = normalizeAllwainCommercialModel(
      order.commercialModel,
    );
    const platformDirect = commercialModel === "platform_direct";
    const onBehalfOfAccountId = allwainStripeOnBehalfOfAccount(
      commercialModel,
      seller?.stripeAccountId,
      Boolean(testOnlyNonFiscal),
    );
    let intent: any = null;
    if (testOnlyNonFiscal && !allwainStripeTestCheckoutEnabled()) {
      await failAllwainRecurringOccurrence({
        orderId: order.id,
        paymentId: payment.id,
        requiresAction: false,
        code: "STRIPE_TEST_ORDER_REQUIRES_TEST_MODE",
        message: "A TEST-only recurring charge cannot run outside Stripe TEST.",
      });
      result.failed += 1;
      continue;
    }
    try {
      const metadata = {
        scope: "allwain_order",
        orderId: order.id,
        contractId: order.contractId,
        paymentId: payment.id,
        recurringPlanId: plan.id,
        recurringOccurrenceId: occurrence.id,
        recurringSequence: String(occurrence.sequence),
        mandateVersion: plan.mandateVersion,
        mandateEvidenceHash: plan.mandateEvidenceHash,
        settlementPlanVersion: String(order.settlementPlanVersion || ""),
        settlementSnapshotHash: String(order.settlementSnapshotHash || ""),
        commercialModel,
        businessOfRecord: order.businessOfRecord,
        paymentEnvironment: testOnlyNonFiscal ? "test" : ENV.ALLWAIN_STRIPE_LIVEMODE ? "live" : "test",
        testOnlyNonFiscal: String(Boolean(testOnlyNonFiscal)),
      };
      intent = payment.stripePaymentIntentId
        ? await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId, {
            expand: ["latest_charge.balance_transaction"],
          })
        : await stripe.paymentIntents.create(
            {
              amount: order.totalAmount,
              currency: order.currency,
              customer: payment.stripeCustomerId,
              payment_method: payment.stripePaymentMethodId,
              off_session: true,
              confirm: true,
              transfer_group: `allwain_order_${order.id}`,
              ...(onBehalfOfAccountId
                ? { on_behalf_of: onBehalfOfAccountId }
                : {}),
              metadata,
            },
            {
              idempotencyKey: `allwain-recurring-${occurrence.id}`,
            },
          );
      await prisma.$transaction([
        prisma.allwainPayment.update({
          where: { id: payment.id },
          data: { stripePaymentIntentId: intent.id, status: intent.status },
        }),
        prisma.allwainRecurringOccurrence.update({
          where: { id: occurrence.id },
          data: { stripePaymentIntentId: intent.id },
        }),
      ]);
      if (intent.status === "succeeded") {
        const expanded = intent.latest_charge?.balance_transaction
          ? intent
          : await stripe.paymentIntents.retrieve(intent.id, {
              expand: ["latest_charge.balance_transaction"],
            });
        try {
          await markAllwainOrderPaid(order.id, payment.id, expanded, {
            source: "recurring_scheduler",
          } as any);
          result.paid += 1;
        } catch (postPaymentError) {
          result.pending += 1;
          console.error(
            "ALLWAIN_RECURRING_POST_PAYMENT_SYNC_ERROR",
            order.id,
            postPaymentError,
          );
        }
        continue;
      }
      if (
        ["requires_action", "requires_payment_method", "canceled"].includes(
          intent.status,
        )
      ) {
        const requiresAction = intent.status === "requires_action";
        await failAllwainRecurringOccurrence({
          orderId: order.id,
          paymentId: payment.id,
          paymentIntentId: intent.id,
          requiresAction,
          code: intent.last_payment_error?.code || intent.status,
          message:
            intent.last_payment_error?.message ||
            "Stripe could not complete the recurring charge.",
        });
        await notifyAllwainOrderParticipants(order.id, {
          targets: ["buyer"],
          type: "recurring.requires_action",
          title: "Necesitamos que revises el pago",
          body: "La entrega recurrente no se ha cobrado. Abre el pedido para completar o actualizar el pago.",
          dedupeSuffix: occurrence.id,
        });
        result.failed += 1;
      } else {
        result.pending += 1;
      }
    } catch (error: any) {
      const failedIntent = error?.payment_intent || error?.raw?.payment_intent;
      if (failedIntent?.status === "succeeded") {
        result.pending += 1;
        console.error(
          "ALLWAIN_RECURRING_SUCCEEDED_INTENT_SYNC_PENDING",
          order.id,
          error,
        );
        continue;
      }
      const requiresAction = failedIntent?.status === "requires_action";
      await failAllwainRecurringOccurrence({
        orderId: order.id,
        paymentId: payment.id,
        paymentIntentId: failedIntent?.id || intent?.id || null,
        requiresAction,
        code: error?.code || failedIntent?.status || "recurring_charge_failed",
        message: error?.message || "Stripe could not complete the recurring charge.",
      });
      await notifyAllwainOrderParticipants(order.id, {
        targets: ["buyer"],
        type: "recurring.requires_action",
        title: "Necesitamos que revises el pago",
        body: "La entrega recurrente no se ha cobrado. Abre el pedido para completar o actualizar el pago.",
        dedupeSuffix: occurrence.id,
      });
      result.failed += 1;
    }
  }
  return result;
}

export async function runAllwainPaymentMaintenance() {
  if (ENV.STORAGE_DRIVER !== "postgres") {
    return {
      baselines: 0,
      expired: 0,
      reminders: { candidates: 0, notified: 0, failed: 0 },
      transfersRetried: 0,
      transferFailures: 0,
    };
  }
  const prisma = getPrisma() as any;
  const baseline = await ensureAllwainAuditBaselines();
  const dueOrders = await prisma.allwainOrder.findMany({
    where: {
      operationalArchivedAt: null,
      inventoryStatus: "reserved",
      reservationExpiresAt: { lte: new Date() },
      paymentStatus: { notIn: Array.from(PAID_PAYMENT_STATUSES) },
    },
    select: { id: true },
    take: 100,
  });
  let expired = 0;
  for (const order of dueOrders) {
    if (await expireAllwainReservation(order.id, "reservation_maintenance"))
      expired += 1;
  }
  const reminders = await runAllwainPreorderReminderMaintenance();
  const sellerReleaseCondition = {
    fulfillmentStatus: "completed",
    documentStatus: "complete",
  };
  const pendingTransfers = await prisma.allwainOrder.findMany({
    where: {
      operationalArchivedAt: null,
      paymentArchitecture: "separate_charges_and_transfers",
      paymentStatus: { in: ["paid", "partially_refunded", "refund_pending"] },
      OR: [
        { transferStatus: "transfer_failed" },
        {
          paymentStatus: "paid",
          sellerTransferId: null,
          ...sellerReleaseCondition,
        },
        {
          paymentStatus: "paid",
          connectorUserId: { not: null },
          connectorFeeAmount: { gt: 0 },
          connectorTransferId: null,
          fulfillmentStatus: { in: ["delivered", "completed"] },
        },
      ],
    },
    select: { id: true },
    take: 100,
  });
  let transfersRetried = 0;
  let transferFailures = 0;
  for (const order of pendingTransfers) {
    try {
      await syncAllwainOrderTransfers(order.id);
      transfersRetried += 1;
    } catch (error) {
      transferFailures += 1;
      console.error("ALLWAIN_TRANSFER_RETRY_ERROR", order.id, error);
    }
  }
  const recurring = await runAllwainRecurringPaymentMaintenance();
  return {
    baselines: baseline.created,
    expired,
    reminders,
    transfersRetried,
    transferFailures,
    recurring,
  };
}

async function processChargeUpdated(
  charge: any,
  context: PaymentTransitionContext = {},
) {
  const prisma = getPrisma() as any;
  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id;
  const payment = await prisma.allwainPayment.findFirst({
    where: {
      OR: [
        { stripeChargeId: charge.id },
        ...(paymentIntentId
          ? [{ stripePaymentIntentId: paymentIntentId }]
          : []),
      ],
    },
  });
  if (!payment || !charge.paid) return;
  const order = await prisma.allwainOrder.findUnique({
    where: { id: payment.orderId },
  });
  if (!order) return;
  const balanceTransactionReference = charge.balance_transaction;
  const balanceTransaction =
    typeof balanceTransactionReference === "string"
      ? await getStripe().balanceTransactions.retrieve(
          balanceTransactionReference,
        )
      : balanceTransactionReference &&
          typeof balanceTransactionReference === "object"
        ? balanceTransactionReference
        : null;
  const accountingData = {
    stripeChargeId: charge.id,
    ...(balanceTransaction?.id
      ? { stripeBalanceTransactionId: balanceTransaction.id }
      : {}),
    ...(typeof balanceTransaction?.fee === "number"
      ? { processorFeeAmount: balanceTransaction.fee }
      : {}),
    ...(typeof balanceTransaction?.net === "number"
      ? { processorNetAmount: balanceTransaction.net }
      : {}),
  };
  const accountingChanged =
    payment.stripeChargeId !== charge.id ||
    (balanceTransaction?.id &&
      payment.stripeBalanceTransactionId !== balanceTransaction.id) ||
    (typeof balanceTransaction?.fee === "number" &&
      payment.processorFeeAmount !== balanceTransaction.fee) ||
    (typeof balanceTransaction?.net === "number" &&
      payment.processorNetAmount !== balanceTransaction.net);
  if (order.paymentArchitecture === "separate_charges_and_transfers") {
    await prisma.$transaction(async (tx: any) => {
      const updatedPayment = await tx.allwainPayment.update({
        where: { id: payment.id },
        data: accountingData,
      });
      if (balanceTransaction?.id) {
        await recordAllwainPaymentLedgerTx(tx, order, updatedPayment);
      }
      if (accountingChanged) {
        await appendAllwainAuditEventTx(tx, {
          aggregateId: payment.orderId,
          eventType: "payment.processor_accounting_updated",
          source: "stripe_charge_updated",
          providerEventId: context.providerEventId,
          payload: {
            paymentId: payment.id,
            chargeId: charge.id,
            balanceTransactionId: balanceTransaction?.id || null,
            processorFeeAmount: balanceTransaction?.fee ?? null,
            processorNetAmount: balanceTransaction?.net ?? null,
          },
        });
      }
    });
    await syncAllwainOrderTransfers(order.id, charge.id, payment.id, context);
    return;
  }
  const transferId =
    typeof charge.transfer === "string"
      ? charge.transfer
      : charge.transfer?.id || null;
  const transferStatus = transferId ? "transferred" : "missing_after_charge";
  await prisma.$transaction(async (tx: any) => {
    const updatedPayment = await tx.allwainPayment.update({
      where: { id: payment.id },
      data: {
        ...accountingData,
        stripeTransferId: transferId,
        transferStatus,
      },
    });
    if (balanceTransaction?.id) {
      await recordAllwainPaymentLedgerTx(tx, order, updatedPayment);
    }
    await tx.allwainOrder.update({
      where: { id: payment.orderId },
      data: { transferStatus },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateId: payment.orderId,
      eventType: transferId
        ? "payment.transfer_confirmed"
        : "payment.transfer_missing",
      source: "stripe_charge_updated",
      providerEventId: context.providerEventId,
      payload: {
        paymentId: payment.id,
        chargeId: charge.id,
        balanceTransactionId: balanceTransaction?.id || null,
        processorFeeAmount: balanceTransaction?.fee ?? null,
        processorNetAmount: balanceTransaction?.net ?? null,
        transferId,
        transferStatus,
      },
    });
  });
}

async function processDispute(
  dispute: any,
  context: PaymentTransitionContext = {},
) {
  const prisma = getPrisma() as any;
  const chargeId =
    typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
  const paymentIntentId =
    typeof dispute.payment_intent === "string"
      ? dispute.payment_intent
      : dispute.payment_intent?.id;
  const payment = await prisma.allwainPayment.findFirst({
    where: {
      OR: [
        ...(chargeId ? [{ stripeChargeId: chargeId }] : []),
        ...(paymentIntentId
          ? [{ stripePaymentIntentId: paymentIntentId }]
          : []),
      ],
    },
  });
  if (!payment) return;
  const order = await prisma.allwainOrder.findUnique({
    where: { id: payment.orderId },
  });
  if (!order) return;
  const existingDispute = await prisma.allwainDispute.findUnique({
    where: { stripeDisputeId: dispute.id },
  });
  const existingMetadata =
    existingDispute?.metadata && typeof existingDispute.metadata === "object"
      ? (existingDispute.metadata as Record<string, any>)
      : {};
  const won = ["won", "closed_won", "warning_closed"].includes(
    dispute.status,
  );
  const lost = ["lost", "closed_lost"].includes(dispute.status);
  const closed = won || lost;
  const restoredPaymentStatus =
    payment.refundedAmount >= payment.amount
      ? "refunded"
      : payment.refundedAmount > 0
        ? "partially_refunded"
        : "paid";
  const recoveryResults: Array<Record<string, unknown>> = [];
  let recoverySatisfiedByLedger = false;
  const shouldRecoverTransfers =
    !won && order.paymentArchitecture === "separate_charges_and_transfers";

  if (shouldRecoverTransfers) {
    const disputedAmount = Math.min(
      Number(payment.amount || order.subtotalAmount),
      Math.max(0, Number(dispute.amount || 0)),
    );
    const allocation = allwainRefundAllocation(
      order,
      payment,
      0,
      disputedAmount,
    );
    const candidates = [
      {
        role: "seller" as const,
        transferId: order.sellerTransferId || payment.sellerTransferId,
        amount: allocation.sellerAmount,
      },
      {
        role: "connector" as const,
        transferId: order.connectorTransferId || payment.connectorTransferId,
        amount: allocation.connectorAmount,
      },
    ];

    for (const candidate of candidates) {
      if (!candidate.transferId || candidate.amount < 1) continue;
      const transferRecord = await prisma.allwainTransfer.findFirst({
        where: { stripeTransferId: candidate.transferId },
      });
      const remainingAmount = transferRecord
        ? Math.max(0, transferRecord.amount - transferRecord.reversedAmount)
        : candidate.amount;
      const amount = Math.min(candidate.amount, remainingAmount);
      if (amount < 1) {
        recoveryResults.push({
          role: candidate.role,
          transferId: candidate.transferId,
          amount: 0,
          status: "already_reversed",
        });
        continue;
      }
      try {
        const reversal = await getStripe().transfers.createReversal(
          candidate.transferId,
          {
            amount,
            metadata: {
              scope: "allwain_dispute",
              orderId: order.id,
              paymentId: payment.id,
              disputeId: dispute.id,
              recipientRole: candidate.role,
            },
          },
          {
            idempotencyKey: `allwain-dispute-${dispute.id}-${candidate.role}-reversal`,
          },
        );
        recoveryResults.push({
          role: candidate.role,
          transferId: candidate.transferId,
          reversalId: reversal.id,
          amount,
          status: "succeeded",
        });
        await prisma.$transaction(async (tx: any) => {
          const recordedTransfer = await recordAllwainTransferReversalTx(tx, {
            order,
            payment,
            recipientRole: candidate.role,
            stripeTransferId: candidate.transferId,
            stripeReversalId: reversal.id,
            amount,
          });
          const roleStatus = recordedTransfer?.status || "partially_reversed";
          await tx.allwainOrder.update({
            where: { id: order.id },
            data:
              candidate.role === "seller"
                ? { sellerTransferStatus: roleStatus }
                : { connectorTransferStatus: roleStatus },
          });
          await tx.allwainPayment.update({
            where: { id: payment.id },
            data:
              candidate.role === "seller"
                ? { sellerTransferStatus: roleStatus }
                : { connectorTransferStatus: roleStatus },
          });
          await appendAllwainAuditEventTx(tx, {
            aggregateId: order.id,
            eventType: `payment.${candidate.role}_transfer_reversed_for_dispute`,
            source: "stripe_dispute",
            providerEventId: context.providerEventId,
            payload: {
              disputeId: dispute.id,
              transferId: candidate.transferId,
              reversalId: reversal.id,
              amount,
            },
          });
        });
      } catch (reversalError: any) {
        const errorMessage = String(
          reversalError?.message || "Stripe transfer reversal error",
        ).slice(0, 500);
        recoveryResults.push({
          role: candidate.role,
          transferId: candidate.transferId,
          amount,
          status: "failed",
          error: errorMessage,
        });
        await prisma.$transaction(async (tx: any) => {
          await tx.allwainTransfer.updateMany({
            where: { stripeTransferId: candidate.transferId },
            data: {
              status: "reversal_failed",
              failureCode: reversalError?.code || null,
              failureMessage: errorMessage,
            },
          });
          await appendAllwainAuditEventTx(tx, {
            aggregateId: order.id,
            eventType: `payment.${candidate.role}_transfer_reversal_failed_for_dispute`,
            source: "stripe_dispute",
            providerEventId: context.providerEventId,
            payload: {
              disputeId: dispute.id,
              transferId: candidate.transferId,
              amount,
              error: errorMessage,
            },
          });
        });
      }
    }
    const transferredCandidates = candidates.filter(
      (candidate) => candidate.transferId && candidate.amount > 0,
    );
    if (transferredCandidates.length) {
      const transferRows = await prisma.allwainTransfer.findMany({
        where: {
          stripeTransferId: {
            in: transferredCandidates.map((candidate) => candidate.transferId),
          },
        },
      });
      recoverySatisfiedByLedger = transferredCandidates.every((candidate) => {
        const transfer = transferRows.find(
          (item: any) => item.stripeTransferId === candidate.transferId,
        );
        return (
          transfer &&
          Number(transfer.reversedAmount || 0) >=
            Math.min(Number(candidate.amount), Number(transfer.amount || 0))
        );
      });
    }
  }

  const recoveryWasActionable =
    shouldRecoverTransfers && recoveryResults.length > 0;
  const recoveryAttemptedAt = recoveryWasActionable
    ? new Date().toISOString()
    : existingMetadata.recoveryAttemptedAt || null;
  const recoveryByTransfer = new Map<string, Record<string, unknown>>();
  for (const item of Array.isArray(existingMetadata.transferRecovery)
    ? existingMetadata.transferRecovery
    : []) {
    recoveryByTransfer.set(`${item?.role || "unknown"}:${item?.transferId || "unknown"}`, item);
  }
  for (const item of recoveryResults) {
    const key = `${item.role || "unknown"}:${item.transferId || "unknown"}`;
    const previous = recoveryByTransfer.get(key);
    if (item.status === "already_reversed" && previous?.status === "succeeded") {
      continue;
    }
    recoveryByTransfer.set(key, item);
  }
  const transferRecovery = Array.from(recoveryByTransfer.values());
  const recoveryFailed = transferRecovery.some(
    (item: any) => item?.status === "failed",
  );
  const recoverySucceeded =
    recoverySatisfiedByLedger ||
    transferRecovery.some((item: any) => item?.status === "succeeded");

  await prisma.$transaction(async (tx: any) => {
    const orderRows = (await tx.$queryRaw(
      Prisma.sql`SELECT * FROM "AllwainOrder" WHERE "id" = ${payment.orderId} FOR UPDATE`,
    )) as any[];
    const order = orderRows[0];
    if (!order) return;
    await tx.allwainDispute.upsert({
      where: { stripeDisputeId: dispute.id },
      create: {
        orderId: order.id,
        paymentId: payment.id,
        stripeDisputeId: dispute.id,
        stripeChargeId: chargeId || null,
        status: dispute.status,
        amount: dispute.amount,
        currency: String(dispute.currency || order.currency).toLowerCase(),
        reason: dispute.reason || null,
        evidenceDueAt: dispute.evidence_details?.due_by
          ? new Date(dispute.evidence_details.due_by * 1_000)
          : null,
        balanceTransactionId:
          typeof dispute.balance_transactions?.[0] === "string"
            ? dispute.balance_transactions[0]
            : dispute.balance_transactions?.[0]?.id || null,
        metadata: toJson({
          ...existingMetadata,
          stripe: dispute.metadata || {},
          recoveryAttemptedAt,
          transferRecovery,
        }),
        closedAt: closed ? new Date() : null,
      },
      update: {
        status: dispute.status,
        reason: dispute.reason || null,
        evidenceDueAt: dispute.evidence_details?.due_by
          ? new Date(dispute.evidence_details.due_by * 1_000)
          : null,
        metadata: toJson({
          ...existingMetadata,
          stripe: dispute.metadata || {},
          recoveryAttemptedAt,
          transferRecovery,
        }),
        closedAt: closed ? new Date() : null,
      },
    });
    const paymentStatus = lost
      ? "dispute_lost"
      : won
        ? restoredPaymentStatus
        : "disputed";
    const disputeStatus = dispute.status;
    const overall = deriveAllwainOrderStatus({
      paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      disputeStatus,
    });
    await tx.allwainPayment.update({
      where: { id: payment.id },
      data: { status: paymentStatus },
    });
    await tx.allwainOrder.update({
      where: { id: order.id },
      data: {
        paymentStatus,
        disputeStatus,
        status: overall,
        settlementStatus: lost
          ? recoveryFailed
            ? "dispute_recovery_attention"
            : recoverySucceeded
              ? "dispute_lost_recovered"
              : "dispute_lost"
          : won && recoverySucceeded
            ? "dispute_won_retransfer_pending"
            : !closed && recoveryFailed
              ? "dispute_recovery_attention"
              : !closed
                ? "dispute_open"
                : order.settlementStatus,
        transferStatus: recoveryFailed
          ? "reversal_attention"
          : recoverySucceeded
            ? "reversed_for_dispute"
            : order.transferStatus,
      },
    });
    await tx.contract.update({
      where: { id: order.contractId },
      data: { paymentStatus, updatedAt: new Date() },
    });
    await tx.allwainOrderStatusEvent.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: overall,
        source: "stripe_dispute",
        metadata: { disputeId: dispute.id, disputeStatus },
      },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateId: order.id,
      eventType: `payment.dispute_${closed ? "closed" : "updated"}`,
      source: "stripe_dispute",
      providerEventId: context.providerEventId,
      payload: {
        disputeId: dispute.id,
        disputeStatus,
        amount: dispute.amount,
        currency: dispute.currency,
        reason: dispute.reason || null,
        paymentStatus,
        transferRecovery,
      },
    });
  });
  if (!won && order.paymentArchitecture === "separate_charges_and_transfers") {
    const freshOrder = await prisma.allwainOrder.findUnique({
      where: { id: order.id },
    });
    const transferIds = [
      freshOrder?.sellerTransferId,
      freshOrder?.connectorTransferId,
    ].filter(Boolean);
    if (transferIds.length) {
      const transferRows = await prisma.allwainTransfer.findMany({
        where: { stripeTransferId: { in: transferIds } },
      });
      const outstandingTransfer = transferIds.some((transferId: string) => {
        const row = transferRows.find(
          (item: any) => item.stripeTransferId === transferId,
        );
        return !row || Number(row.reversedAmount || 0) < Number(row.amount || 0);
      });
      if (outstandingTransfer && !recoveryWasActionable) {
        await processDispute(dispute, context);
        return;
      }
    }
  }
  await notifyAllwainOrderParticipants(order.id, {
    type: closed ? "payment.dispute_closed" : "payment.dispute_opened",
    title: lost
      ? "La disputa se ha resuelto a favor del comprador"
      : won
        ? "La disputa se ha cerrado"
        : "Se ha abierto una disputa de pago",
    body: lost
      ? "El pago se ha revertido y la operación queda pendiente de revisión."
      : won
        ? "Stripe ha cerrado la disputa. Puedes consultar el estado del pedido."
        : "La operación queda en revisión hasta que Stripe resuelva la disputa.",
    dedupeSuffix: `${dispute.id}:${dispute.status}`,
  });
}

async function processTransferReversed(
  stripeTransfer: any,
  context: PaymentTransitionContext = {},
) {
  if (!stripeTransfer?.id) return;
  const prisma = getPrisma() as any;
  let transferRecord = await prisma.allwainTransfer.findFirst({
    where: { stripeTransferId: stripeTransfer.id },
  });
  let order = transferRecord
    ? await prisma.allwainOrder.findUnique({ where: { id: transferRecord.orderId } })
    : await prisma.allwainOrder.findFirst({
        where: {
          OR: [
            { sellerTransferId: stripeTransfer.id },
            { connectorTransferId: stripeTransfer.id },
          ],
        },
      });
  if (!order) return;
  const recipientRole: "seller" | "connector" =
    transferRecord?.recipientRole === "connector" ||
    order.connectorTransferId === stripeTransfer.id
      ? "connector"
      : "seller";
  const payment = transferRecord?.paymentId
    ? await prisma.allwainPayment.findUnique({ where: { id: transferRecord.paymentId } })
    : await prisma.allwainPayment.findFirst({
        where: { orderId: order.id, paidAt: { not: null } },
        orderBy: { paidAt: "desc" },
      });
  if (!payment) return;
  let reversals = Array.isArray(stripeTransfer.reversals?.data)
    ? stripeTransfer.reversals.data
    : [];
  if (stripeTransfer.reversals?.has_more) {
    reversals = (
      await getStripe().transfers.listReversals(stripeTransfer.id, { limit: 100 })
    ).data;
  }
  for (const reversal of reversals) {
    await prisma.$transaction(async (tx: any) => {
      transferRecord = await recordAllwainTransferReversalTx(tx, {
        order,
        payment,
        recipientRole,
        stripeTransferId: stripeTransfer.id,
        stripeReversalId: reversal.id,
        amount: Number(reversal.amount || 0),
      });
      const scope = String(reversal.metadata?.scope || "");
      const roleStatus =
        Number(stripeTransfer.amount_reversed || 0) >= Number(stripeTransfer.amount || 0)
          ? "reversed"
          : "partially_reversed";
      const transferStatus = scope === "allwain_refund"
        ? "reversed_for_refund"
        : scope === "allwain_dispute"
          ? "reversed_for_dispute"
          : "reversal_attention";
      await tx.allwainOrder.update({
        where: { id: order.id },
        data: {
          transferStatus,
          ...(recipientRole === "seller"
            ? { sellerTransferStatus: roleStatus }
            : { connectorTransferStatus: roleStatus }),
        },
      });
      await appendAllwainAuditEventTx(tx, {
        aggregateId: order.id,
        eventType: `payment.${recipientRole}_transfer_reversal_confirmed`,
        source: "stripe_transfer_reversed",
        providerEventId: context.providerEventId,
        payload: {
          stripeTransferId: stripeTransfer.id,
          stripeReversalId: reversal.id,
          amount: reversal.amount,
          scope: scope || null,
          transferStatus: transferRecord?.status || roleStatus,
        },
      });
    });
  }
}

async function stripePayoutBalanceTransactions(
  payoutId: string,
  stripeAccountId: string,
) {
  const stripe = getStripe();
  const items: any[] = [];
  let startingAfter: string | undefined;
  for (;;) {
    const page: any = await (stripe.balanceTransactions as any).list(
      {
        payout: payoutId,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      },
      { stripeAccount: stripeAccountId },
    );
    items.push(...(page.data || []));
    if (!page.has_more || !page.data?.length) break;
    startingAfter = page.data[page.data.length - 1].id;
  }
  return items;
}

async function processSellerPayout(
  payout: any,
  stripeAccountId: string | undefined,
  context: PaymentTransitionContext = {},
) {
  if (!stripeAccountId) return;
  const prisma = getPrisma() as any;
  const sellerAccount = await prisma.allwainSellerPaymentAccount.findUnique({
    where: { stripeAccountId },
  });
  const balanceTransactions =
    payout.status === "paid"
      ? await stripePayoutBalanceTransactions(payout.id, stripeAccountId)
      : [];
  const exactTransferAmounts = new Map<string, number>();
  for (const transaction of balanceTransactions) {
    const sourceId =
      typeof transaction.source === "string"
        ? transaction.source
        : transaction.source?.id;
    if (!sourceId?.startsWith("tr_") || Number(transaction.net || 0) <= 0) {
      continue;
    }
    exactTransferAmounts.set(
      sourceId,
      (exactTransferAmounts.get(sourceId) || 0) + Number(transaction.net),
    );
  }
  const destinationSummary = payout.destination
    ? `Destino Stripe ${String(typeof payout.destination === "string" ? payout.destination : payout.destination.id).slice(-8)}`
    : null;
  await prisma.$transaction(async (tx: any) => {
    const payoutRecord = await tx.allwainSellerPayout.upsert({
      where: { stripePayoutId: payout.id },
      create: {
        sellerUserId: sellerAccount?.userId || null,
        stripeAccountId,
        stripePayoutId: payout.id,
        status: payout.status,
        amount: payout.amount,
        currency: String(payout.currency || ENV.ALLWAIN_CURRENCY).toLowerCase(),
        arrivalAt: payout.arrival_date
          ? new Date(payout.arrival_date * 1_000)
          : null,
        failureCode: payout.failure_code || null,
        failureMessage: payout.failure_message || null,
        destinationSummary,
      metadata: toJson({
        ...(payout.metadata || {}),
        balanceTransactionIds: balanceTransactions.map((item) => item.id),
      }),
      },
      update: {
        status: payout.status,
        arrivalAt: payout.arrival_date
          ? new Date(payout.arrival_date * 1_000)
          : null,
        failureCode: payout.failure_code || null,
        failureMessage: payout.failure_message || null,
        destinationSummary,
        metadata: toJson({
          ...(payout.metadata || {}),
          balanceTransactionIds: balanceTransactions.map((item) => item.id),
        }),
      },
    });
    await tx.$queryRaw(
      Prisma.sql`SELECT * FROM "AllwainSellerPayout" WHERE "id" = ${payoutRecord.id} FOR UPDATE`,
    );
    let allocatedAmount = 0;
    let unallocatedAmount = Number(payout.amount || 0);
    if (
      payout.status === "paid" &&
      sellerAccount?.userId &&
      Number(payout.amount || 0) > 0
    ) {
      const existingAllocations = await tx.allwainPayoutAllocation.findMany({
        where: { sellerPayoutId: payoutRecord.id },
      });
      allocatedAmount = existingAllocations.reduce(
        (total: number, allocation: any) => total + Number(allocation.amount || 0),
        0,
      );
      const exactTotal = Array.from(exactTransferAmounts.values()).reduce(
        (sum, amount) => sum + amount,
        0,
      );
      const canAllocateExactly =
        exactTransferAmounts.size > 0 &&
        exactTotal <= Number(payout.amount || 0);
      if (canAllocateExactly) {
        const transfers = await tx.allwainTransfer.findMany({
          where: {
            stripeTransferId: { in: Array.from(exactTransferAmounts.keys()) },
            recipientUserId: sellerAccount.userId,
          },
        });
        const byStripeId = new Map(
          transfers.map((transfer: any) => [transfer.stripeTransferId, transfer]),
        );
        for (const [stripeTransferId, exactAmount] of exactTransferAmounts) {
          const transfer: any = byStripeId.get(stripeTransferId);
          if (!transfer) continue;
          const amount = Math.min(
            exactAmount,
            Math.max(0, Number(transfer.amount) - Number(transfer.reversedAmount || 0)),
          );
          if (amount < 1) continue;
          const allocation = await tx.allwainPayoutAllocation.upsert({
            where: {
              sellerPayoutId_transferId: {
                sellerPayoutId: payoutRecord.id,
                transferId: transfer.id,
              },
            },
            create: {
              sellerPayoutId: payoutRecord.id,
              transferId: transfer.id,
              orderId: transfer.orderId,
              amount,
              currency: payoutRecord.currency,
              source: "stripe_payout_balance_transaction",
            },
            update: {},
          });
          allocatedAmount += existingAllocations.some(
            (item: any) => item.id === allocation.id,
          )
            ? 0
            : amount;
          await appendAllwainAuditEventTx(tx, {
            aggregateId: transfer.orderId,
            eventType: "seller.payout_allocated",
            actorUserId: sellerAccount.userId,
            source: "stripe_payout_reconciliation",
            providerEventId: context.providerEventId,
            payload: {
              payoutId: payout.id,
              payoutAllocationId: allocation.id,
              stripeTransferId,
              amount,
              currency: payoutRecord.currency,
              allocationPolicy: "stripe_balance_transaction_exact",
            },
          });
        }
      }
      unallocatedAmount = Math.max(
        0,
        Number(payout.amount || 0) - allocatedAmount,
      );
      await tx.allwainSellerPayout.update({
        where: { id: payoutRecord.id },
        data: {
          metadata: toJson({
            ...(payout.metadata || {}),
            reconciliation: {
              policy: "stripe_payout_balance_transaction_exact",
              status:
                unallocatedAmount === 0
                  ? "reconciled"
                  : "requires_manual_reconciliation",
              allocatedAmount,
              unallocatedAmount,
              exactTransferTotal: exactTotal,
              balanceTransactionCount: balanceTransactions.length,
              reconciledAt: new Date().toISOString(),
            },
          }),
        },
      });
    }
    await appendAllwainAuditEventTx(tx, {
      aggregateType: "seller_payment_account",
      aggregateId: stripeAccountId,
      eventType: `seller.payout_${payout.status}`,
      actorUserId: sellerAccount?.userId || null,
      source: "stripe_payout",
      providerEventId: context.providerEventId,
      payload: {
        payoutId: payout.id,
        amount: payout.amount,
        currency: payout.currency,
        status: payout.status,
        arrivalAt: payout.arrival_date || null,
        failureCode: payout.failure_code || null,
        allocatedAmount,
        unallocatedAmount,
      },
    });
  });
}

export async function processAllwainStripeWebhook(
  rawBody: Buffer,
  signature: string,
) {
  requirePostgres();
  if (!ENV.STRIPE_CONNECT_WEBHOOK_SECRET)
    throw new Error("STRIPE_WEBHOOK_NOT_CONFIGURED");
  const stripe = getStripe();
  const preview = JSON.parse(rawBody.toString("utf8"));
  const isV2 = String(preview?.type || "").startsWith("v2.");
  let event: any;
  if (isV2) {
    const candidateSecrets = Array.from(
      new Set(
        [
          ENV.STRIPE_CONNECT_THIN_WEBHOOK_SECRET,
          ENV.STRIPE_CONNECT_WEBHOOK_SECRET,
          ENV.STRIPE_CONNECTED_ACCOUNTS_WEBHOOK_SECRET,
        ].filter((secret): secret is string => Boolean(secret)),
      ),
    );
    let signatureError: unknown;
    for (const secret of candidateSecrets) {
      try {
        event = stripe.parseEventNotification(rawBody, signature, secret);
        break;
      } catch (error) {
        signatureError = error;
      }
    }
    if (!event) throw signatureError || new Error("INVALID_WEBHOOK_SIGNATURE");
  } else {
    const candidateSecrets = Array.from(
      new Set(
        [
          ENV.STRIPE_CONNECT_WEBHOOK_SECRET,
          ENV.STRIPE_CONNECTED_ACCOUNTS_WEBHOOK_SECRET,
        ].filter((secret): secret is string => Boolean(secret)),
      ),
    );
    let signatureError: unknown;
    for (const secret of candidateSecrets) {
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, secret);
        break;
      } catch (error) {
        signatureError = error;
      }
    }
    if (!event) throw signatureError || new Error("INVALID_WEBHOOK_SIGNATURE");
  }
  const registration = await registerStripeEvent(event);
  if (registration.duplicate) return { received: true, duplicate: true };

  try {
    if (isV2) {
      const accountId = event?.related_object?.id;
      if (accountId && String(event.type).startsWith("v2.core.account")) {
        await syncAccountFromWebhook(accountId);
      }
    } else {
      const object: any = event.data?.object;
      const webhookContext = { providerEventId: event.id };
      switch (event.type) {
        case "account.updated":
          await syncAccountFromWebhook(object.id);
          break;
        case "checkout.session.completed":
        case "checkout.session.async_payment_succeeded":
          if (
            object?.metadata?.scope === "allwain_order" ||
            object?.metadata?.scope === "allwain_buyer_payment_profile"
          ) {
            const session = await stripe.checkout.sessions.retrieve(object.id);
            await processCheckoutSession(session, webhookContext);
          }
          break;
        case "checkout.session.async_payment_failed":
        case "checkout.session.expired": {
          if (object?.metadata?.scope === "allwain_buyer_payment_profile") {
            await (getPrisma() as any).allwainBuyerPaymentProfile.updateMany({
              where: {
                userId: String(object.metadata.buyerUserId || ""),
                stripeCheckoutSessionId: object.id,
                paymentMethodStatus: "setup_pending",
              },
              data: {
                paymentMethodStatus: "failed",
                lastSyncedAt: new Date(),
              },
            });
            break;
          }
          const payment = await (getPrisma() as any).allwainPayment.findUnique({
            where: { stripeCheckoutSessionId: object.id },
          });
          if (payment) {
            const session = await stripe.checkout.sessions.retrieve(object.id);
            if (session.status === "complete") {
              await processCheckoutSession(session, webhookContext);
            } else if (event.type.endsWith("expired")) {
              await expireAllwainReservation(
                payment.orderId,
                event.type,
                webhookContext,
                true,
              );
            } else {
              await (getPrisma() as any).allwainPayment.update({
                where: { id: payment.id },
                data: { status: "payment_failed" },
              });
              await transitionPaymentStatus(
                payment.orderId,
                "payment_failed",
                event.type,
                {},
                webhookContext,
              );
            }
          }
          break;
        }
        case "payment_intent.succeeded":
        case "payment_intent.payment_failed":
        case "payment_intent.canceled":
          if (object?.metadata?.scope === "allwain_order") {
            await processPaymentIntent(object, webhookContext);
          }
          break;
        case "charge.refunded":
          await processChargeRefunded(object, webhookContext);
          break;
        case "charge.updated":
          await processChargeUpdated(object, webhookContext);
          break;
        case "charge.dispute.created":
        case "charge.dispute.updated":
        case "charge.dispute.closed":
          await processDispute(object, webhookContext);
          break;
        case "transfer.reversed":
          await processTransferReversed(object, webhookContext);
          break;
        case "payout.created":
        case "payout.updated":
        case "payout.paid":
        case "payout.failed":
          await processSellerPayout(object, event.account, webhookContext);
          break;
        default:
          break;
      }
    }
    await finishStripeEvent(registration.record.id);
    return { received: true, duplicate: false };
  } catch (error) {
    await finishStripeEvent(registration.record.id, error);
    throw error;
  }
}

export async function chargeAllwainPreorder(
  userId: string,
  orderId: string,
  requestId?: string,
) {
  const stripe = requirePaymentsReady();
  const prisma = getPrisma() as any;
  const actor = await prisma.user.findUnique({ where: { id: userId } });
  if (!actor) throw new Error("USER_NOT_FOUND");
  const claim = await prisma.$transaction(async (tx: any) => {
    const orderRows = (await tx.$queryRaw(
      Prisma.sql`SELECT * FROM "AllwainOrder" WHERE "id" = ${orderId} FOR UPDATE`,
    )) as any[];
    const order = orderRows[0];
    if (!order || (order.sellerUserId !== userId && actor.role !== "admin")) {
      throw new Error("ORDER_NOT_FOUND");
    }
    const commercialModel = normalizeAllwainCommercialModel(
      order.commercialModel,
    );
    const platformDirect = commercialModel === "platform_direct";
    if (
      order.paymentMode !== "preorder" ||
      order.paymentStatus !== "payment_method_saved"
    ) {
      throw new Error("PREORDER_NOT_READY_TO_CHARGE");
    }
    const chargeDeadline = normalizeAllwainPreorderChargeDeadline(
      order.preorderChargeDeadlineAt,
    );
    const setupPayment = await tx.allwainPayment.findFirst({
      where: {
        orderId,
        kind: "setup",
        status: "payment_method_saved",
        stripePaymentMethodId: { not: null },
        stripeCustomerId: { not: null },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!setupPayment) throw new Error("PREORDER_PAYMENT_METHOD_MISSING");
    const seller = await tx.allwainSellerPaymentAccount.findUnique({
      where: { userId: order.sellerUserId },
    });
    const [determination, settlement, consent, preorderMandate] =
      await Promise.all([
      tx.allwainTaxDetermination.findUnique({ where: { orderId } }),
      tx.allwainSettlementPlan.findFirst({
        where: { orderId },
        orderBy: { version: "desc" },
      }),
      tx.allwainConsentEvidence.findFirst({
        where: {
          orderId,
          userId: order.buyerUserId,
          consentType: "marketplace_purchase_terms",
          documentVersion: ENV.ALLWAIN_COMMERCIAL_TERMS_VERSION,
          granted: true,
        },
      }),
      tx.allwainConsentEvidence.findFirst({
        where: {
          orderId,
          userId: order.buyerUserId,
          consentType: "preorder_off_session_mandate",
          documentVersion: ENV.ALLWAIN_PREORDER_MANDATE_VERSION,
          granted: true,
        },
        orderBy: { occurredAt: "desc" },
      }),
    ]);
    const testOnlyNonFiscal =
      isAllwainStripeTestDetermination(determination);
    if (testOnlyNonFiscal && !allwainStripeTestCheckoutEnabled()) {
      throw new Error("STRIPE_TEST_ORDER_REQUIRES_TEST_MODE");
    }
    if (
      !testOnlyNonFiscal &&
      !platformDirect &&
      (!seller?.stripeAccountId ||
        !seller.chargesEnabled ||
        !seller.transfersEnabled ||
        !seller.payoutsEnabled)
    ) {
      throw new Error("SELLER_PAYMENTS_NOT_READY");
    }
    if (determination?.status !== "determined") {
      throw new Error("TAX_TREATMENT_NOT_APPROVED");
    }
    if (
      !settlement ||
      settlement.status !== "checkout_locked" ||
      settlement.snapshotHash !== order.settlementSnapshotHash
    ) {
      throw new Error("SETTLEMENT_NOT_APPROVED");
    }
    if (!consent?.evidenceHash) {
      throw new Error("COMMERCIAL_TERMS_CONSENT_REQUIRED");
    }
    const mandateSnapshot = preorderMandate?.evidence?.mandate;
    if (
      !preorderMandate?.evidenceHash ||
      preorderMandate.evidenceHash !== order.preorderMandateEvidenceHash ||
      order.preorderMandateVersion !== ENV.ALLWAIN_PREORDER_MANDATE_VERSION ||
      !order.preorderMandateAcceptedAt ||
      Number(mandateSnapshot?.maximumChargeAmount) !== Number(order.totalAmount) ||
      String(mandateSnapshot?.currency || "").toLowerCase() !==
        String(order.currency).toLowerCase() ||
      String(mandateSnapshot?.chargeDeadlineAt || "") !==
        chargeDeadline.toISOString() ||
      Number(mandateSnapshot?.settlementPlanVersion) !==
        Number(order.settlementPlanVersion) ||
      String(mandateSnapshot?.settlementSnapshotHash || "") !==
        String(order.settlementSnapshotHash || "")
    ) {
      throw new Error("PREORDER_MANDATE_NOT_VALID");
    }
    let payment = await tx.allwainPayment.findFirst({
      where: { orderId, kind: "deferred_charge", status: "processing" },
      orderBy: { createdAt: "desc" },
    });
    if (!payment) {
      const attempt =
        (await tx.allwainPayment.count({
          where: { orderId, kind: "deferred_charge" },
        })) + 1;
      payment = await tx.allwainPayment.create({
        data: {
          orderId,
          kind: "deferred_charge",
          status: "processing",
          operationKey: allwainPaymentOperationKey(
            orderId,
            "deferred_charge",
            attempt,
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
          businessOfRecord: order.businessOfRecord,
          connectorFeeAmount: order.connectorFeeAmount || 0,
          connectorPlatformShareAmount:
            order.connectorPlatformShareAmount || 0,
          connectorDeliveryAmount: order.connectorDeliveryAmount || 0,
          carrierDeliveryAmount: order.carrierDeliveryAmount || 0,
          settlementPlanId: settlement.id,
          settlementPlanVersion: settlement.version,
          settlementSnapshotHash: settlement.snapshotHash,
          onBehalfOfStripeAccountId: allwainStripeOnBehalfOfAccount(
            commercialModel,
            seller?.stripeAccountId,
            testOnlyNonFiscal,
          ),
          processorFeePayer: "platform",
          sellerTransferStatus:
            order.sellerTransferStatus ||
            (platformDirect || testOnlyNonFiscal
              ? "not_required"
              : "not_started"),
          connectorTransferStatus: testOnlyNonFiscal
            ? "not_required"
            : order.connectorTransferStatus || "not_required",
          stripeCustomerId: setupPayment.stripeCustomerId,
          stripePaymentMethodId: setupPayment.stripePaymentMethodId,
          metadata: {
            attempt,
            settlementPlanId: settlement.id,
            settlementPlanVersion: settlement.version,
            settlementSnapshotHash: settlement.snapshotHash,
            preorderMandateVersion: order.preorderMandateVersion,
            preorderMandateEvidenceHash: order.preorderMandateEvidenceHash,
            preorderChargeDeadlineAt: chargeDeadline.toISOString(),
            commercialModel,
            businessOfRecord: order.businessOfRecord,
            processorFeePayer: "platform",
            testOnlyNonFiscal,
          },
        },
      });
      await appendAllwainAuditEventTx(tx, {
        aggregateId: orderId,
        eventType: "payment.deferred_charge_claimed",
        actorUserId: userId,
        actorRole: actor.role,
        source: "seller_preorder_charge",
        requestId,
        payload: {
          paymentId: payment.id,
          operationKey: payment.operationKey,
          amount: payment.amount,
          currency: payment.currency,
        },
      });
    }
    return {
      order,
      setupPayment,
      seller,
      payment,
      chargeDeadline,
      commercialModel,
      platformDirect,
      testOnlyNonFiscal,
    };
  });
  const {
    order,
    setupPayment,
    seller,
    payment,
    chargeDeadline,
    commercialModel,
    platformDirect,
    testOnlyNonFiscal,
  } = claim;
  const metadata = {
    scope: "allwain_order",
    orderId,
    contractId: order.contractId,
    paymentId: payment.id,
    preorderMandateVersion: order.preorderMandateVersion,
    preorderMandateEvidenceHash: order.preorderMandateEvidenceHash,
    preorderChargeDeadlineAt: chargeDeadline.toISOString(),
    commercialModel,
    businessOfRecord: order.businessOfRecord,
    paymentEnvironment: testOnlyNonFiscal ? "test" : ENV.ALLWAIN_STRIPE_LIVEMODE ? "live" : "test",
    testOnlyNonFiscal: String(testOnlyNonFiscal),
  };
  const onBehalfOfAccountId = allwainStripeOnBehalfOfAccount(
    commercialModel,
    seller?.stripeAccountId,
    testOnlyNonFiscal,
  );

  try {
    const intent: any = payment.stripePaymentIntentId
      ? await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId, {
          expand: ["latest_charge.balance_transaction"],
        })
      : await stripe.paymentIntents.create(
          {
            amount: order.totalAmount,
            currency: order.currency,
            customer: setupPayment.stripeCustomerId,
            payment_method: setupPayment.stripePaymentMethodId,
            off_session: true,
            confirm: true,
            transfer_group: `allwain_order_${order.id}`,
            ...(onBehalfOfAccountId
              ? { on_behalf_of: onBehalfOfAccountId }
              : {}),
            metadata,
          },
          {
            idempotencyKey: `allwain-preorder-${payment.operationKey || payment.id}`,
          },
        );
    await prisma.allwainPayment.update({
      where: { id: payment.id },
      data: { stripePaymentIntentId: intent.id, status: intent.status },
    });
    if (intent.status === "succeeded") {
      const expanded: any = await stripe.paymentIntents.retrieve(intent.id, {
        expand: ["latest_charge.balance_transaction"],
      });
      await markAllwainOrderPaid(order.id, payment.id, expanded, {
        actorUserId: userId,
        actorRole: actor.role,
        requestId,
      });
    } else {
      await transitionPaymentStatus(
        order.id,
        "payment_processing",
        "preorder_charge_started",
        {},
        { actorUserId: userId, actorRole: actor.role, requestId },
      );
    }
    return { orderId, paymentIntentId: intent.id, status: intent.status };
  } catch (error: any) {
    const intent = error?.payment_intent || error?.raw?.payment_intent;
    const requiresAction = intent?.status === "requires_action";
    await prisma.allwainPayment.update({
      where: { id: payment.id },
      data: {
        status: requiresAction ? "requires_customer_action" : "payment_failed",
        stripePaymentIntentId: intent?.id || null,
        failureCode: error?.code || null,
        failureMessage: String(
          error?.message || "No se pudo realizar el cobro",
        ).slice(0, 500),
      },
    });
    await transitionPaymentStatus(
      order.id,
      requiresAction ? "requires_customer_action" : "payment_failed",
      "preorder_charge_failed",
      {},
      { actorUserId: userId, actorRole: actor.role, requestId },
    );
    throw new Error(
      requiresAction ? "PAYMENT_REQUIRES_CUSTOMER_ACTION" : "PAYMENT_FAILED",
    );
  }
}

export async function refundAllwainOrder(
  adminUserId: string,
  orderId: string,
  amount?: number,
  requestId?: string,
) {
  const stripe = requirePaymentsReady();
  const prisma = getPrisma() as any;
  const actor = await prisma.user.findUnique({ where: { id: adminUserId } });
  if (!actor || actor.role !== "admin") throw new Error("FORBIDDEN");
  const claim = await prisma.$transaction(async (tx: any) => {
    const orderRows = (await tx.$queryRaw(
      Prisma.sql`SELECT * FROM "AllwainOrder" WHERE "id" = ${orderId} FOR UPDATE`,
    )) as any[];
    const order = orderRows[0];
    if (!order) throw new Error("ORDER_NOT_FOUND");
    const payment = await tx.allwainPayment.findFirst({
      where: {
        orderId,
        kind: { in: ["payment", "deferred_charge"] },
        paidAt: { not: null },
        stripePaymentIntentId: { not: null },
      },
      orderBy: { paidAt: "desc" },
    });
    if (!payment?.stripePaymentIntentId)
      throw new Error("PAID_PAYMENT_NOT_FOUND");
    const grossRemaining = payment.amount - payment.refundedAmount;
    const refundAmount = amount === undefined ? grossRemaining : amount;
    if (!Number.isInteger(refundAmount) || refundAmount < 1) {
      throw new Error("INVALID_REFUND_AMOUNT");
    }
    const pendingRefund = await tx.allwainPayment.findFirst({
      where: {
        orderId,
        kind: "refund",
        status: { in: ["creating_refund", "pending", "requires_action"] },
      },
      orderBy: { createdAt: "asc" },
    });
    if (pendingRefund) {
      if (pendingRefund.amount !== refundAmount)
        throw new Error("REFUND_ALREADY_PENDING");
      return {
        order,
        payment,
        refundPayment: pendingRefund,
        refundAmount,
        allocation: (pendingRefund.metadata as any)?.refundAllocation,
      };
    }
    if (refundAmount > grossRemaining)
      throw new Error("REFUND_AMOUNT_EXCEEDS_PAYMENT");
    const allocation = allwainRefundAllocation(
      order,
      payment,
      payment.refundedAmount,
      refundAmount,
    );
    const operationKey = `allwain:refund:${orderId}:${allocation.cumulativeBefore}:${allocation.cumulativeAfter}`;
    const existing = await tx.allwainPayment.findUnique({
      where: { operationKey },
    });
    if (existing) {
      return {
        order,
        payment,
        refundPayment: existing,
        refundAmount,
        allocation,
      };
    }
    const refundPayment = await tx.allwainPayment.create({
      data: {
        orderId,
        kind: "refund",
        status: "creating_refund",
        operationKey,
        amount: refundAmount,
        currency: payment.currency,
        platformFeeAmount: 0,
        platformRetainedAmount: 0,
        sellerAmount: 0,
        commercialModel: normalizeAllwainCommercialModel(
          order.commercialModel,
        ),
        businessOfRecord: order.businessOfRecord,
        metadata: {
          originalPaymentId: payment.id,
          refundAllocation: allocation,
        },
      },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateId: orderId,
      eventType: "payment.refund_claimed",
      actorUserId: adminUserId,
      actorRole: actor.role,
      source: "admin_refund",
      requestId,
      payload: {
        refundPaymentId: refundPayment.id,
        originalPaymentId: payment.id,
        operationKey,
        amount: refundAmount,
        currency: payment.currency,
      },
    });
    return { order, payment, refundPayment, refundAmount, allocation };
  });
  if (claim.refundPayment.stripeRefundId) {
    return {
      id: claim.refundPayment.stripeRefundId,
      status: claim.refundPayment.status,
      amount: claim.refundPayment.amount,
      orderId,
    };
  }
  try {
    const separateTransfers =
      claim.order.paymentArchitecture === "separate_charges_and_transfers";
    const allocation =
      claim.allocation ||
      allwainRefundAllocation(
        claim.order,
        claim.payment,
        claim.payment.refundedAmount || 0,
        claim.refundAmount,
      );
    const refund = await stripe.refunds.create(
      {
        payment_intent: claim.payment.stripePaymentIntentId,
        amount: claim.refundAmount,
        ...(!separateTransfers
          ? { reverse_transfer: true, refund_application_fee: true }
          : {}),
        metadata: {
          scope: "allwain_order",
          orderId,
          refundPaymentId: claim.refundPayment.id,
          adminUserId,
        },
      },
      { idempotencyKey: claim.refundPayment.operationKey },
    );
    const transferReversals: Array<Record<string, unknown>> = [];
    if (separateTransfers) {
      for (const transfer of [
        {
          id: claim.order.sellerTransferId || claim.payment.sellerTransferId,
          amount: allocation.sellerAmount,
          role: "seller" as const,
        },
        {
          id:
            claim.order.connectorTransferId ||
            claim.payment.connectorTransferId,
          amount: allocation.connectorAmount,
          role: "connector" as const,
        },
      ]) {
        if (!transfer.id || transfer.amount < 1) continue;
        try {
          const reversal = await stripe.transfers.createReversal(
            transfer.id,
            {
              amount: transfer.amount,
              metadata: {
                scope: "allwain_refund",
                orderId,
                refundPaymentId: claim.refundPayment.id,
                recipientRole: transfer.role,
              },
            },
            {
              idempotencyKey: `${claim.refundPayment.operationKey}-${transfer.role}-reversal`,
            },
          );
          transferReversals.push({
            role: transfer.role,
            transferId: transfer.id,
            reversalId: reversal.id,
            amount: transfer.amount,
            status: "succeeded",
          });
          await prisma.$transaction(async (tx: any) => {
            await recordAllwainTransferReversalTx(tx, {
              order: claim.order,
              payment: claim.payment,
              recipientRole: transfer.role,
              stripeTransferId: transfer.id,
              stripeReversalId: reversal.id,
              amount: transfer.amount,
            });
            await appendAllwainAuditEventTx(tx, {
              aggregateId: orderId,
              eventType: `payment.${transfer.role}_transfer_reversed`,
              actorUserId: adminUserId,
              actorRole: actor.role,
              source: "admin_refund",
              requestId,
              payload: {
                refundPaymentId: claim.refundPayment.id,
                stripeRefundId: refund.id,
                stripeTransferId: transfer.id,
                stripeReversalId: reversal.id,
                amount: transfer.amount,
              },
            });
          });
        } catch (reversalError: any) {
          const failureMessage = String(
            reversalError?.message || "Stripe transfer reversal error",
          ).slice(0, 500);
          transferReversals.push({
            role: transfer.role,
            transferId: transfer.id,
            amount: transfer.amount,
            status: "failed",
            error: failureMessage,
          });
          await prisma.$transaction(async (tx: any) => {
            await tx.allwainTransfer.updateMany({
              where: { stripeTransferId: transfer.id },
              data: {
                status: "reversal_failed",
                failureCode: reversalError?.code || null,
                failureMessage,
              },
            });
            await tx.allwainOrder.update({
              where: { id: orderId },
              data: {
                transferStatus: "reversal_attention",
                ...(transfer.role === "seller"
                  ? { sellerTransferStatus: "reversal_failed" }
                  : { connectorTransferStatus: "reversal_failed" }),
              },
            });
            await appendAllwainAuditEventTx(tx, {
              aggregateId: orderId,
              eventType: `payment.${transfer.role}_transfer_reversal_failed`,
              actorUserId: adminUserId,
              actorRole: actor.role,
              source: "admin_refund",
              requestId,
              payload: {
                refundPaymentId: claim.refundPayment.id,
                stripeRefundId: refund.id,
                stripeTransferId: transfer.id,
                amount: transfer.amount,
                error: failureMessage,
              },
            });
          });
        }
      }
    }
    await prisma.allwainPayment.update({
      where: { id: claim.refundPayment.id },
      data: {
        status: refund.status || "pending",
        stripeRefundId: refund.id,
        metadata: {
          ...((claim.refundPayment.metadata as Record<string, unknown>) || {}),
          originalPaymentId: claim.payment.id,
          stripeRefundId: refund.id,
          refundAllocation: allocation,
          transferReversals,
        },
      },
    });
    const cumulativeRefunded =
      refund.status === "succeeded"
        ? Math.min(
            claim.payment.amount,
            (claim.payment.refundedAmount || 0) + refund.amount,
          )
        : claim.payment.refundedAmount || 0;
    const nextPaymentStatus = deriveAllwainRefundPaymentStatus({
      refundStatus: refund.status,
      cumulativeRefunded,
      paymentAmount: claim.payment.amount,
    });
    await transitionPaymentStatus(
      orderId,
      nextPaymentStatus,
      refund.status === "succeeded"
        ? "refund_confirmed_by_api"
        : "refund_created",
      { refundedAmount: cumulativeRefunded },
      {
        actorUserId: adminUserId,
        actorRole: actor.role,
        requestId,
      },
    );
    return {
      id: refund.id,
      status: refund.status,
      amount: refund.amount,
      orderId,
    };
  } catch (error: any) {
    await prisma.allwainPayment.update({
      where: { id: claim.refundPayment.id },
      data: {
        status: "refund_failed",
        failureCode: error?.code || null,
        failureMessage: String(error?.message || "Stripe refund error").slice(
          0,
          500,
        ),
      },
    });
    throw error;
  }
}
