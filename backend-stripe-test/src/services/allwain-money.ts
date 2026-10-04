import { ENV } from "../config/env";
import type {
  AllwainBusinessOfRecord,
  AllwainCommercialModel,
  Offer,
} from "../shared/types";

export interface AllwainMoneyBreakdown {
  currency: string;
  commercialModel: AllwainCommercialModel;
  businessOfRecord: AllwainBusinessOfRecord;
  unitPriceAmount: number;
  subtotalAmount: number;
  platformFeeBps: number;
  platformFeeAmount: number;
  platformRetainedAmount: number;
  sellerAmount: number;
}

export interface AllwainSavingsMoneyBreakdown {
  currency: string;
  commercialModel: "marketplace";
  businessOfRecord: "seller";
  feeBasis: "verified_savings";
  platformFeePayer: "buyer";
  referenceAmount: number;
  acceptedOfferAmount: number;
  grossSavingsAmount: number;
  platformFeeBps: number;
  platformFeeAmount: number;
  netSavingsAmount: number;
  buyerSubtotalAmount: number;
  platformRetainedAmount: number;
  sellerAmount: number;
}

export interface AllwainConnectorFeeBreakdown {
  connectorFeeBps: number;
  connectorFeeAmount: number;
  platformNetFeeAmount: number;
}

export interface AllwainDeliveryAllocation {
  shippingAmount: number;
  carrierDeliveryAmount: number;
  connectorPlatformShareAmount: number;
  connectorDeliveryAmount: number;
  connectorFeeAmount: number;
  platformNetFeeAmount: number;
}

export interface AllwainInitialOrderSettlement {
  carrierDeliveryAmount: number;
  platformNetFeeAmount: number;
  connectorFeeAmount: number;
  connectorPlatformShareAmount: number;
  connectorDeliveryAmount: number;
  paymentArchitecture: "separate_charges_and_transfers";
  sellerTransferStatus: "not_started" | "not_required";
  connectorTransferStatus: "not_required" | "not_started";
}

export function normalizeAllwainCommercialModel(
  value: unknown,
): AllwainCommercialModel {
  return value === "platform_direct" ? "platform_direct" : "marketplace";
}

export function allwainBusinessOfRecord(
  value: unknown,
): AllwainBusinessOfRecord {
  return normalizeAllwainCommercialModel(value) === "platform_direct"
    ? "platform"
    : "seller";
}

export interface AllwainRefundAllocation {
  cumulativeBefore: number;
  cumulativeAfter: number;
  sellerAmount: number;
  connectorAmount: number;
  platformAmount: number;
}

function assertFinitePositive(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`INVALID_${name.toUpperCase()}`);
  }
}

export function normalizeAllwainFeeBps(value = ENV.ALLWAIN_PLATFORM_FEE_BPS) {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new Error("INVALID_ALLWAIN_PLATFORM_FEE_BPS");
  }
  return value;
}

export function normalizeAllwainConnectorFeeBps(
  value = ENV.ALLWAIN_CONNECTOR_PLATFORM_SHARE_BPS,
) {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new Error("INVALID_ALLWAIN_CONNECTOR_FEE_BPS");
  }
  return value;
}

export function calculateAllwainConnectorFee(input: {
  subtotalAmount: number;
  platformFeeAmount: number;
  connectorFeeBps?: number;
}): AllwainConnectorFeeBreakdown {
  if (!Number.isSafeInteger(input.subtotalAmount) || input.subtotalAmount < 1) {
    throw new Error("INVALID_SUBTOTAL_AMOUNT");
  }
  if (!Number.isSafeInteger(input.platformFeeAmount) || input.platformFeeAmount < 0) {
    throw new Error("INVALID_PLATFORM_FEE_AMOUNT");
  }
  const connectorFeeBps = normalizeAllwainConnectorFeeBps(input.connectorFeeBps);
  const connectorFeeAmount = Math.round(
    (input.platformFeeAmount * connectorFeeBps) / 10_000,
  );
  return {
    connectorFeeBps,
    connectorFeeAmount,
    platformNetFeeAmount: input.platformFeeAmount - connectorFeeAmount,
  };
}

export function normalizeAllwainLocalDeliveryFeeAmount(
  value = ENV.ALLWAIN_LOCAL_DELIVERY_FEE_AMOUNT,
) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 100_000) {
    throw new Error("INVALID_ALLWAIN_LOCAL_DELIVERY_FEE_AMOUNT");
  }
  return value;
}

export function getAllwainDeliveryPricingConfig() {
  return {
    currency: String(ENV.ALLWAIN_CURRENCY || "eur").toLowerCase(),
    localConnector: {
      available: true,
      amount: normalizeAllwainLocalDeliveryFeeAmount(),
      pricingMode: "fixed_per_delivery" as const,
    },
    pickup: {
      available: true,
      amount: 0,
      pricingMode: "free" as const,
    },
    seller: {
      available: true,
      amount: 0,
      pricingMode: "free" as const,
    },
    carrier: {
      available: Boolean(ENV.SENDCLOUD_PUBLIC_KEY && ENV.SENDCLOUD_SECRET_KEY),
      amount: null,
      pricingMode: "provider_quote_required" as const,
      provider: "sendcloud" as const,
      name: "Sendcloud",
      configured: Boolean(ENV.SENDCLOUD_PUBLIC_KEY && ENV.SENDCLOUD_SECRET_KEY),
    },
  };
}

export function calculateAllwainDeliveryAllocation(input: {
  deliveryChannel: "carrier" | "local_connector" | "seller" | "pickup";
  subtotalAmount: number;
  platformFeeAmount: number;
  localDeliveryFeeAmount?: number;
  carrierShippingAmount?: number;
}): AllwainDeliveryAllocation {
  if (!Number.isSafeInteger(input.subtotalAmount) || input.subtotalAmount < 1) {
    throw new Error("INVALID_SUBTOTAL_AMOUNT");
  }
  if (!Number.isSafeInteger(input.platformFeeAmount) || input.platformFeeAmount < 0) {
    throw new Error("INVALID_PLATFORM_FEE_AMOUNT");
  }
  if (input.deliveryChannel === "carrier") {
    const carrierDeliveryAmount = Number(input.carrierShippingAmount);
    if (
      !Number.isSafeInteger(carrierDeliveryAmount) ||
      carrierDeliveryAmount < 0 ||
      carrierDeliveryAmount > 1_000_000
    ) {
      throw new Error("CARRIER_RATE_REQUIRED");
    }
    return {
      shippingAmount: carrierDeliveryAmount,
      carrierDeliveryAmount,
      connectorPlatformShareAmount: 0,
      connectorDeliveryAmount: 0,
      connectorFeeAmount: 0,
      platformNetFeeAmount: input.platformFeeAmount,
    };
  }
  if (input.deliveryChannel !== "local_connector") {
    return {
      shippingAmount: 0,
      carrierDeliveryAmount: 0,
      connectorPlatformShareAmount: 0,
      connectorDeliveryAmount: 0,
      connectorFeeAmount: 0,
      platformNetFeeAmount: input.platformFeeAmount,
    };
  }

  const networkShare = calculateAllwainConnectorFee({
    subtotalAmount: input.subtotalAmount,
    platformFeeAmount: input.platformFeeAmount,
  });
  const connectorDeliveryAmount = normalizeAllwainLocalDeliveryFeeAmount(
    input.localDeliveryFeeAmount,
  );
  return {
    shippingAmount: connectorDeliveryAmount,
    carrierDeliveryAmount: 0,
    connectorPlatformShareAmount: networkShare.connectorFeeAmount,
    connectorDeliveryAmount,
    connectorFeeAmount:
      networkShare.connectorFeeAmount + connectorDeliveryAmount,
    platformNetFeeAmount: networkShare.platformNetFeeAmount,
  };
}

export function calculateAllwainMoney(input: {
  unitPrice: number;
  quantity: number;
  platformFeeBps?: number;
  currency?: string;
  commercialModel?: AllwainCommercialModel;
}): AllwainMoneyBreakdown {
  assertFinitePositive(input.unitPrice, "unit_price");
  assertFinitePositive(input.quantity, "quantity");

  const commercialModel = normalizeAllwainCommercialModel(input.commercialModel);
  const businessOfRecord = allwainBusinessOfRecord(commercialModel);
  const platformFeeBps =
    commercialModel === "platform_direct"
      ? 0
      : normalizeAllwainFeeBps(input.platformFeeBps);
  const currency = String(input.currency || ENV.ALLWAIN_CURRENCY || "eur").toLowerCase();
  if (!/^[a-z]{3}$/.test(currency)) throw new Error("INVALID_CURRENCY");

  const unitPriceAmount = Math.round(input.unitPrice * 100);
  const subtotalAmount = Math.round(input.unitPrice * input.quantity * 100);
  if (!Number.isSafeInteger(subtotalAmount) || subtotalAmount < 1) {
    throw new Error("INVALID_SUBTOTAL_AMOUNT");
  }

  const platformFeeAmount = Math.round((subtotalAmount * platformFeeBps) / 10_000);
  const sellerAmount =
    commercialModel === "platform_direct" ? 0 : subtotalAmount - platformFeeAmount;
  const platformRetainedAmount =
    commercialModel === "platform_direct" ? subtotalAmount : platformFeeAmount;

  return {
    currency,
    commercialModel,
    businessOfRecord,
    unitPriceAmount,
    subtotalAmount,
    platformFeeBps,
    platformFeeAmount,
    platformRetainedAmount,
    sellerAmount,
  };
}

export function calculateAllwainSavingsMoney(input: {
  referenceAmount: number;
  acceptedOfferAmount: number;
  platformFeeBps?: number;
  currency?: string;
}): AllwainSavingsMoneyBreakdown {
  if (
    !Number.isSafeInteger(input.referenceAmount) ||
    input.referenceAmount < 1
  ) {
    throw new Error("INVALID_REFERENCE_AMOUNT");
  }
  if (
    !Number.isSafeInteger(input.acceptedOfferAmount) ||
    input.acceptedOfferAmount < 1
  ) {
    throw new Error("INVALID_ACCEPTED_OFFER_AMOUNT");
  }
  if (input.acceptedOfferAmount > input.referenceAmount) {
    throw new Error("OFFER_ABOVE_REFERENCE_PRICE");
  }
  const platformFeeBps = normalizeAllwainFeeBps(input.platformFeeBps);
  const currency = String(
    input.currency || ENV.ALLWAIN_CURRENCY || "eur",
  ).toLowerCase();
  if (!/^[a-z]{3}$/.test(currency)) throw new Error("INVALID_CURRENCY");

  const grossSavingsAmount =
    input.referenceAmount - input.acceptedOfferAmount;
  const platformFeeAmount = Math.round(
    (grossSavingsAmount * platformFeeBps) / 10_000,
  );
  const netSavingsAmount = grossSavingsAmount - platformFeeAmount;
  const buyerSubtotalAmount =
    input.acceptedOfferAmount + platformFeeAmount;

  return {
    currency,
    commercialModel: "marketplace",
    businessOfRecord: "seller",
    feeBasis: "verified_savings",
    platformFeePayer: "buyer",
    referenceAmount: input.referenceAmount,
    acceptedOfferAmount: input.acceptedOfferAmount,
    grossSavingsAmount,
    platformFeeBps,
    platformFeeAmount,
    netSavingsAmount,
    buyerSubtotalAmount,
    platformRetainedAmount: platformFeeAmount,
    sellerAmount: input.acceptedOfferAmount,
  };
}

export function initialAllwainOrderSettlement(
  platformFeeAmount: number,
  allocation: Partial<
    Pick<
      AllwainDeliveryAllocation,
      | "connectorFeeAmount"
      | "carrierDeliveryAmount"
      | "connectorPlatformShareAmount"
      | "connectorDeliveryAmount"
      | "platformNetFeeAmount"
    >
  > = {},
  commercialModel: AllwainCommercialModel = "marketplace",
): AllwainInitialOrderSettlement {
  if (!Number.isSafeInteger(platformFeeAmount) || platformFeeAmount < 0) {
    throw new Error("INVALID_PLATFORM_FEE_AMOUNT");
  }
  const connectorPlatformShareAmount =
    allocation.connectorPlatformShareAmount || 0;
  const connectorDeliveryAmount = allocation.connectorDeliveryAmount || 0;
  const carrierDeliveryAmount = allocation.carrierDeliveryAmount || 0;
  const connectorFeeAmount =
    allocation.connectorFeeAmount ??
    connectorPlatformShareAmount + connectorDeliveryAmount;
  const platformNetFeeAmount =
    allocation.platformNetFeeAmount ??
    platformFeeAmount - connectorPlatformShareAmount;
  if (
    ![
      connectorPlatformShareAmount,
      connectorDeliveryAmount,
      carrierDeliveryAmount,
      connectorFeeAmount,
      platformNetFeeAmount,
    ].every((value) => Number.isSafeInteger(value) && value >= 0) ||
    connectorFeeAmount !==
      connectorPlatformShareAmount + connectorDeliveryAmount ||
    platformFeeAmount !==
      platformNetFeeAmount + connectorPlatformShareAmount
  ) {
    throw new Error("INVALID_INITIAL_ORDER_ALLOCATION");
  }
  return {
    carrierDeliveryAmount,
    platformNetFeeAmount,
    connectorFeeAmount,
    connectorPlatformShareAmount,
    connectorDeliveryAmount,
    paymentArchitecture: "separate_charges_and_transfers",
    sellerTransferStatus:
      normalizeAllwainCommercialModel(commercialModel) === "platform_direct"
        ? "not_required"
        : "not_started",
    connectorTransferStatus:
      connectorFeeAmount > 0 ? "not_started" : "not_required",
  };
}

export function calculateAllwainRefundAllocation(input: {
  grossAmount: number;
  sellerAmount: number;
  connectorAmount?: number;
  cumulativeBefore: number;
  refundAmount: number;
}): AllwainRefundAllocation {
  const gross = input.grossAmount;
  const connectorShare = input.connectorAmount || 0;
  if (!Number.isSafeInteger(gross) || gross < 1) {
    throw new Error("INVALID_PAYMENT_AMOUNT");
  }
  if (
    !Number.isSafeInteger(input.sellerAmount) ||
    input.sellerAmount < 0 ||
    !Number.isSafeInteger(connectorShare) ||
    connectorShare < 0 ||
    input.sellerAmount + connectorShare > gross
  ) {
    throw new Error("INVALID_PAYMENT_ALLOCATION");
  }
  if (
    !Number.isSafeInteger(input.cumulativeBefore) ||
    input.cumulativeBefore < 0 ||
    !Number.isSafeInteger(input.refundAmount) ||
    input.refundAmount < 0
  ) {
    throw new Error("INVALID_REFUND_AMOUNT");
  }
  const cumulativeAfter = input.cumulativeBefore + input.refundAmount;
  if (cumulativeAfter > gross) {
    throw new Error("REFUND_AMOUNT_EXCEEDS_PAYMENT");
  }
  const proportionalDelta = (share: number) =>
    Math.max(
      0,
      Math.round((share * cumulativeAfter) / gross) -
        Math.round((share * input.cumulativeBefore) / gross),
    );
  let sellerAmount = proportionalDelta(input.sellerAmount);
  const connectorAmount = proportionalDelta(connectorShare);
  let platformAmount = input.refundAmount - sellerAmount - connectorAmount;
  if (platformAmount < 0) {
    sellerAmount = Math.max(0, sellerAmount + platformAmount);
    platformAmount = input.refundAmount - sellerAmount - connectorAmount;
  }
  return {
    cumulativeBefore: input.cumulativeBefore,
    cumulativeAfter,
    sellerAmount,
    connectorAmount,
    platformAmount,
  };
}

export function allwainStripeTestCheckoutEnabled() {
  return Boolean(
    ENV.ALLWAIN_STRIPE_TEST_CHECKOUT_ENABLED &&
      !ENV.ALLWAIN_STRIPE_LIVEMODE &&
      allwainStripeModeMatchesConfiguration(),
  );
}

export const ALLWAIN_STRIPE_TEST_TREATMENT_CODE =
  "stripe_test_non_fiscal";

export function allwainOfferCheckoutDisabled(
  offer: Pick<Offer, "owner" | "ownerUserId" | "meta"> | null | undefined,
) {
  const meta =
    offer?.meta && typeof offer.meta === "object"
      ? offer.meta
      : {};
  return Boolean(
    !offer ||
      offer.owner !== "allwain" ||
      !String(offer.ownerUserId || "").trim() ||
      meta.demo === true ||
      meta.synthetic === true ||
      meta.checkoutEnabled === false,
  );
}

/**
 * TEST checkout is available to every actionable Allwain offer owned by a
 * user. Demo/synthetic cards and anything explicitly marked read-only never
 * become payable, even if a client tries to call the endpoint directly.
 */
export function allwainStripeTestOfferEnabled(
  offer: Pick<Offer, "owner" | "ownerUserId" | "meta"> | null | undefined,
) {
  return Boolean(
    allwainStripeTestCheckoutEnabled() &&
      !allwainOfferCheckoutDisabled(offer),
  );
}

/** A durable marker: it keeps TEST orders non-fiscal and non-transferable. */
export function isAllwainStripeTestDetermination(
  determination: { treatmentCode?: unknown } | null | undefined,
) {
  return (
    String(determination?.treatmentCode || "") ===
    ALLWAIN_STRIPE_TEST_TREATMENT_CODE
  );
}

export function allwainStripeOnBehalfOfAccount(
  commercialModel: unknown,
  stripeAccountId: unknown,
  testOnlyNonFiscal = false,
) {
  if (
    testOnlyNonFiscal ||
    normalizeAllwainCommercialModel(commercialModel) === "platform_direct"
  ) {
    return null;
  }
  const accountId = String(stripeAccountId || "").trim();
  return accountId || null;
}

export function allwainStripeCheckoutCollectionConfig(input: {
  testOnlyNonFiscal: boolean;
  deliveryMethod?: string | null;
  confirmedDeliveryDetails?: boolean;
  mode: "setup" | "payment";
}) {
  const cardOnly = input.testOnlyNonFiscal
    ? { payment_method_types: ["card"] as ["card"] }
    : {};
  const shippingAddress =
    !input.testOnlyNonFiscal && !input.confirmedDeliveryDetails && input.deliveryMethod === "shipping"
      ? {
          shipping_address_collection: {
            allowed_countries: ["ES"] as ["ES"],
          },
        }
      : {};
  const livePaymentIdentity =
    !input.testOnlyNonFiscal && input.mode === "payment"
      ? {
          billing_address_collection: "required" as const,
          phone_number_collection: { enabled: true },
        }
      : {};
  return { ...cardOnly, ...shippingAddress, ...livePaymentIdentity };
}

export function allwainTransferStateAfterSuccessfulCharge(input: {
  testOnlyNonFiscal: boolean;
  platformDirect: boolean;
  separateTransfers: boolean;
  existingSellerTransferId?: string | null;
  destinationTransferId?: string | null;
  connectorAllocated: boolean;
}) {
  const sellerTransferId =
    input.separateTransfers || input.platformDirect
      ? input.existingSellerTransferId || null
      : input.destinationTransferId || null;
  if (input.testOnlyNonFiscal) {
    return {
      sellerTransferId,
      sellerTransferStatus: "not_required" as const,
      connectorTransferStatus: "not_required" as const,
      transferStatus: "not_required" as const,
    };
  }
  return {
    sellerTransferId,
    sellerTransferStatus: input.platformDirect
      ? ("not_required" as const)
      : sellerTransferId
        ? ("transferred" as const)
        : input.separateTransfers
          ? ("pending_completed_and_documented" as const)
          : ("pending_confirmation" as const),
    connectorTransferStatus: input.connectorAllocated
      ? ("pending" as const)
      : ("not_required" as const),
    transferStatus: input.separateTransfers
      ? sellerTransferId
        ? ("transferred" as const)
        : ("pending_fulfillment" as const)
      : input.destinationTransferId
        ? ("transferred" as const)
        : ("pending_confirmation" as const),
  };
}

export function allwainPaymentsConfigured() {
  const testCheckoutEnabled = allwainStripeTestCheckoutEnabled();
  const providerReady = Boolean(
    (ENV.ALLWAIN_PAYMENTS_ENABLED || testCheckoutEnabled) &&
      ENV.STRIPE_SECRET_KEY &&
      allwainStripeModeMatchesConfiguration() &&
      ENV.STRIPE_CONNECT_WEBHOOK_SECRET &&
      ENV.STRIPE_CONNECT_THIN_WEBHOOK_SECRET &&
      ENV.STRIPE_CONNECTED_ACCOUNTS_WEBHOOK_SECRET,
  );
  if (!providerReady) return false;

  // The hosted TEST lane bypasses only the platform release/identity gates.
  // Stripe mode matching and every webhook remain mandatory.
  if (testCheckoutEnabled) return true;

  // Existing legally complete TEST configurations remain valid. LIVE stays
  // fail-closed, including when a stale TEST override is present.
  return Boolean(
    !ENV.ALLWAIN_STRIPE_TEST_CHECKOUT_ENABLED &&
      allwainLegalReleaseMatchesStripeMode() &&
      ENV.ALLWAIN_LEGAL_APPROVAL_REFERENCE &&
      ENV.ALLWAIN_LEGAL_NAME &&
      ENV.ALLWAIN_LEGAL_TAX_ID &&
      ENV.ALLWAIN_LEGAL_ADDRESS,
  );
}

export function allwainLegalReleaseMatchesStripeMode() {
  if (!ENV.ALLWAIN_LEGAL_RELEASE_APPROVED) return false;
  if (ENV.ALLWAIN_STRIPE_LIVEMODE) {
    return ENV.ALLWAIN_LEGAL_RELEASE_SCOPE === "live";
  }
  return ["test", "live"].includes(ENV.ALLWAIN_LEGAL_RELEASE_SCOPE);
}

export function allwainStripeModeMatchesConfiguration() {
  const key = String(ENV.STRIPE_SECRET_KEY || "");
  if (!key) return false;
  const isLiveKey = key.startsWith("sk_live_") || key.startsWith("rk_live_");
  const isTestKey = key.startsWith("sk_test_") || key.startsWith("rk_test_");
  if (!isLiveKey && !isTestKey) return false;
  return ENV.ALLWAIN_STRIPE_LIVEMODE ? isLiveKey : isTestKey;
}
