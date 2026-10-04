import {
  expireAuthSession,
  captureAuthSession,
  refreshAuthToken,
  type AuthSessionSnapshot,
} from "../store/authSessionBridge";
import { requireAdminMfa } from "../store/adminMfaBridge";
import { webAuthCoordination } from "../utils/webAuthCoordination";

const envBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
if (process.env.EXPO_PUBLIC_V2_TEST_ONLY === "true") {
  const target = envBaseUrl ? new URL(envBaseUrl) : null;
  if (!target || !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) {
    throw new Error("V2_TEST_API_MUST_BE_LOCAL");
  }
}

export const API_BASE_URL = envBaseUrl || "https://api.allwain.es/api";

export interface AuthResponse {
  token: string;
  refreshToken?: string;
  accessTokenExpiresAt?: string;
  refreshTokenExpiresAt?: string;
  user: {
    id: string;
    email: string;
    role: string;
    name?: string;
    preferredLocale?: string | null;
    analyticsConsent?: boolean | null;
    analyticsConsentVersion?: string | null;
    analyticsConsentUpdatedAt?: string | null;
    sponsorCode?: string;
    referredByCode?: string;
    entitlements?: string[];
    tokens?: number;
    participation?: AllwainParticipation;
  };
  entitlements?: string[];
}

export type AllwainProfileStatus =
  | "not_activated"
  | "onboarding"
  | "pending_verification"
  | "active"
  | "restricted";

export type AllwainCommercialModel = "marketplace" | "platform_direct";
export type AllwainBusinessOfRecord = "seller" | "platform";

export interface AllwainParticipation {
  experience: {
    onboardingVersion: number;
    onboardingCompletedAt?: string | null;
    primaryIntent?: "buy" | "sell" | "connector" | null;
    guidanceEnabled: boolean;
    lastContext?: string | null;
  };
  buyer: { status: "active"; enabled: true };
  seller: {
    status: AllwainProfileStatus;
    enabled: boolean;
    commercialModel: AllwainCommercialModel;
    businessOfRecord: AllwainBusinessOfRecord;
    sellerType?: string | null;
    displayName?: string | null;
    paymentStatus?: string | null;
    fiscalStatus?: string | null;
    fiscalReady: boolean;
    paymentReady: boolean;
    sellerReady: boolean;
    locationLabel?: string | null;
    pickupAddress?: string | null;
    locationReady: boolean;
    shippingPostalCode?: string | null;
    shippingCity?: string | null;
    shippingCountryCode?: string | null;
    shippingPhone?: string | null;
    carrierReady?: boolean;
  };
  connector: {
    status: AllwainProfileStatus;
    enabled: boolean;
    newmersiveId?: string | null;
    referralUrl?: string | null;
    available: boolean;
    radiusKm: 1 | 5 | 10 | 20 | 50;
    locationLabel?: string | null;
    locationMode?: "coordinates" | "label" | "unset";
  };
}

export interface AllwainConnectorNetwork {
  newmersiveId?: string | null;
  referralUrl?: string | null;
  totals: { users: number; sellers: number; active: number };
  items: {
    id: string;
    userId: string;
    displayName: string;
    kind: "buyer" | "seller";
    status: string;
    joinedAt?: string;
    sellerStatus?: string;
  }[];
  pageInfo?: { hasNextPage: boolean; nextCursor?: string | null };
}

export interface AllwainDeliveryOpportunity {
  id: string;
  orderId: string | null;
  title?: string;
  status: "open" | "accepted" | "picked_up" | "delivered" | string;
  feeAmount: number;
  networkBonusAmount?: number;
  currency: string;
  pickupZone: string;
  deliveryZone: string;
  distanceKm?: number | null;
  distanceToPickupKm?: number | null;
  pickupAddress?: string | null;
  deliveryAddress?: string | null;
  seller?: { id: string; name: string } | null;
  buyer?: { id: string; name: string } | null;
  mine: boolean;
  demo?: boolean;
  createdAt: string;
}

export interface AllwainConnectorLogistics {
  radiusKm: 1 | 5 | 10 | 20 | 50;
  items: AllwainDeliveryOpportunity[];
  demoItems?: AllwainDeliveryOpportunity[];
  pageInfo?: { hasNextPage?: boolean; nextCursor?: string | null };
}

export interface AllwainDeliveryPricingConfig {
  currency: string;
  localConnector: {
    available: boolean;
    amount: number;
    pricingMode: "fixed_per_delivery";
  };
  pickup: { available: boolean; amount: number; pricingMode: "free" };
  seller: { available: boolean; amount: number; pricingMode: "free" };
  carrier: {
    available: boolean;
    amount: number | null;
    pricingMode: "provider_quote_required";
    provider?: "sendcloud";
    name?: string;
    configured?: boolean;
  };
}

export interface AllwainCarrierQuote {
  id: string;
  provider: "sendcloud";
  shippingOptionCode: string;
  carrierCode?: string | null;
  carrierName?: string | null;
  serviceName: string;
  amount: number;
  currency: string;
  leadTimeHours?: number | null;
  expiresAt: string;
}

export interface AllwainCarrierShipment {
  id: string;
  orderId: string;
  provider: "sendcloud";
  status: string;
  carrierCode?: string | null;
  carrierName?: string | null;
  serviceName?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  quotedAmount: number;
  actualCostAmount?: number | null;
  currency: string;
  announcedAt?: string | null;
  deliveredAt?: string | null;
  failedAt?: string | null;
  lastEventAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AllwainDeliveryCheckpoint {
  id: string;
  assignmentId: string;
  orderId: string;
  checkpointType: "seller_handoff" | "buyer_delivery";
  status: "pending" | "verified";
  qrValue?: string;
  shortCode?: string;
  expiresAt: string;
  verifiedAt?: string | null;
}

export interface AllwainNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  route?: "order" | "contract" | string | null;
  routeParams?: {
    orderId?: string;
    contractId?: string;
    offerId?: string;
    requestId?: string;
    shoppingListId?: string;
    deliveryId?: string;
    mode?: "buy" | "sell" | "connector";
    [key: string]: unknown;
  } | null;
  readAt?: string | null;
  createdAt: string;
}

export interface AllwainNotificationList {
  items: AllwainNotification[];
  unreadCount: number;
  pageInfo?: { hasNextPage: boolean; nextCursor?: string | null };
}

export interface AllwainCardImageMeta {
  hasImage?: boolean;
  bytesApprox?: number | null;
  mimeType?: string | null;
  url?: string | null;
  key?: string | null;
  source?: "original" | "captured" | "illustrative" | "category";
  illustrative?: boolean;
  alt?: string | null;
  assignedAt?: string | null;
}

export interface AllwainOffer {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  title: string;
  description?: string;
  ownerUserId?: string;
  price?: number;
  tokens?: number;
  allwainType?: "catalog" | "proposal" | null;
  allwainStatus?:
    | "active"
    | "paused"
    | "sold_out"
    | "selected"
    | "not_selected"
    | "withdrawn"
    | "closed"
    | null;
  requestId?: string | null;
  shoppingListId?: string | null;
  currency?: string | null;
  unit?: string | null;
  category?: string | null;
  subcategory?: string | null;
  productKind?: string | null;
  locationLabel?: string | null;
  commercialModel?: AllwainCommercialModel;
  proposalExpiresAt?: string | null;
  proposalRevision?: number;
  meta?: {
    distanceKm?: number;
    unit?: string;
    inventoryManaged?: boolean;
    stockQuantity?: number;
    availableQuantity?: number;
    reservedQuantity?: number;
    soldQuantity?: number;
    minQuantity?: number;
    quantityStep?: number;
    maxQuantityPerOrder?: number;
    saleMode?: "immediate" | "preorder";
    preorderChargeDeadlineAt?: string | null;
    deliveryPricing?: AllwainDeliveryPricingConfig;
    imageUrl?: string | null;
    imageKey?: string | null;
    imageSource?: AllwainCardImageMeta["source"];
    imageIllustrative?: boolean;
    imageAlt?: string | null;
    imageAssignedAt?: string | null;
    [key: string]: unknown;
  };
  provider?: {
    id: string;
    name?: string;
    score?: number;
    reviewCount?: number;
    completedOrders?: number;
  };
}

export interface AllwainReview {
  id: string;
  orderId: string;
  authorUserId: string;
  subjectUserId: string;
  subjectRole: "buyer" | "seller" | "connector";
  rating: number;
  comment?: string | null;
  status: "published" | "reported" | "hidden";
  response?: string | null;
  respondedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  author?: {
    id: string;
    name: string;
    avatarUrl?: string | null;
  };
}

export interface AllwainReputationSummary {
  user: { id: string; name: string; avatarUrl?: string | null };
  score: number;
  reviewCount: number;
  completedOrders: number;
  reviews: AllwainReview[];
}

export interface AllwainOrderReviewState {
  orderId: string;
  eligible: boolean;
  fulfillmentStatus: string;
  targets: {
    id: string;
    name: string;
    avatarUrl?: string | null;
    role: "buyer" | "seller" | "connector";
    review?: AllwainReview | null;
  }[];
}

export interface AllwainFiscalProfile {
  id: string;
  kind: "consumer" | "business";
  status: "draft" | "attested" | "verified" | "restricted";
  legalForm?:
    | "individual"
    | "self_employed"
    | "company"
    | "association"
    | "cooperative"
    | "other"
    | null;
  legalName?: string | null;
  tradeName?: string | null;
  taxIdType?: string | null;
  taxId?: string | null;
  vatId?: string | null;
  countryCode: string;
  taxTerritory?: string | null;
  vatRegime:
    "general" | "reagp" | "exempt" | "non_taxable" | "other" | "unknown";
  reagpActivity?: "agricultural_forestry" | "livestock_fishing" | null;
  ownProduction?: boolean | null;
  invoiceEmail?: string | null;
  billingAddress?: { formatted?: string; [key: string]: unknown } | null;
  version: number;
  attestedAt?: string | null;
  documentMandateVersion?: string | null;
  documentMandateAcceptedAt?: string | null;
  documentMandateRevokedAt?: string | null;
  documentMandateActive: boolean;
  verifiedAt?: string | null;
  updatedAt: string;
}

export interface AllwainComplianceProfile {
  profiles: AllwainFiscalProfile[];
  defaults: {
    buyerFiscalProfileId?: string | null;
    sellerFiscalProfileId?: string | null;
  };
  readiness: {
    consumer: boolean;
    business: boolean;
    documentMandate: boolean;
    sellerFiscal: boolean;
    sellerPayments: boolean;
    sellerReady: boolean;
  };
  attestationVersion: string;
  documentMandateVersion: string;
}

export interface AllwainMarketRequest {
  id: string;
  title: string;
  description: string;
  demo?: boolean;
  status: "submitted" | "awarded" | "closed" | "canceled";
  selectedOfferId?: string | null;
  imageMeta?: AllwainCardImageMeta | null;
  extracted: {
    productName?: string | null;
    brand?: string | null;
    category?: string | null;
    ean?: string | null;
    quantity?: number | null;
    unit?: string | null;
    targetPrice?: number | null;
    currency?: string | null;
    deliveryWindow?: string | null;
    deliveryMethod?: "shipping" | "pickup" | "in_person" | null;
    locationLabel?: string | null;
  };
  requester: {
    id: string;
    name: string;
  };
  offerCount: number;
  myOffer?: AllwainOffer | null;
  createdAt: string;
  updatedAt: string;
}

export interface AllwainShoppingListItem {
  id: string;
  position: number;
  productName: string;
  description?: string | null;
  quantity: number;
  unit: string;
  targetUnitPriceAmount?: number | null;
  targetUnitPrice?: number | null;
  category?: string | null;
  subcategory?: string | null;
  productKind?: string | null;
  notes?: string | null;
  reviewStatus?: "selected" | "discarded";
  referencePriceSource?: "manual" | "ocr_document";
  referencePriceLocked?: boolean;
  referenceCapturedAt?: string | null;
  referenceDocumentId?: string | null;
  ocrLineItemId?: string | null;
  qualityDecision?: string | null;
  qualityScore?: number | null;
  imageMeta?: AllwainCardImageMeta | null;
  availabilityStatus?: "open" | "awarded" | "discarded";
  award?: {
    offerId?: string | null;
    orderId: string;
    sellerUserId: string;
    quantity: number;
    orderStatus: string;
    paymentStatus: string;
    fulfillmentStatus: string;
  } | null;
}

export interface AllwainShoppingListProposalItem {
  id: string;
  shoppingListItemId: string;
  position: number;
  productName: string;
  description?: string | null;
  quantity: number;
  unit: string;
  unitPriceAmount: number;
  subtotalAmount: number;
  currency: string;
  isSubstitution: boolean;
  notes?: string | null;
  imageMeta?: AllwainCardImageMeta | null;
}

export interface AllwainShoppingListProposal {
  id: string;
  shoppingListId: string;
  title: string;
  description?: string | null;
  ownerUserId: string;
  price: number;
  currency: string;
  status: string;
  coverageKind?: "full" | "partial";
  coveredItemCount?: number;
  totalItemCount?: number;
  awardedItemCount?: number;
  isSelected?: boolean;
  isSelectable?: boolean;
  deliveryEstimate?: string | null;
  validUntil?: string | null;
  proposalRevision?: number;
  expired?: boolean;
  items: AllwainShoppingListProposalItem[];
  provider: {
    id: string;
    name: string;
    score: number;
    reviewCount: number;
    completedOrders: number;
  };
  meta?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AllwainShoppingList {
  id: string;
  buyerUserId: string;
  sourceShoppingListId?: string | null;
  sourceKind?: "manual" | "ocr_document" | string;
  sourceEvidenceDocumentId?: string | null;
  sourceOcrExtractionId?: string | null;
  buyer: { id: string; name: string };
  title: string;
  description?: string | null;
  demo?: boolean;
  status: "draft" | "published" | "partially_awarded" | "awarded" | "closed" | "canceled" | "archived";
  visibility: "private" | "public";
  currency: string;
  allowSubstitutions: boolean;
  needByText?: string | null;
  proposalDeadlineAt?: string | null;
  preferredDeliveryChannel?: "local_connector" | "carrier" | "seller" | "pickup" | null;
  deliveryAddress?: { formatted?: string; [key: string]: unknown } | null;
  deliveryWindow?: StructuredDeliveryWindow | null;
  recurrence?: StructuredRecurringOrder | null;
  locationLabel?: string | null;
  selectedOfferId?: string | null;
  selectedAt?: string | null;
  publishedAt?: string | null;
  closedAt?: string | null;
  version: number;
  items: AllwainShoppingListItem[];
  awardedItemCount?: number;
  remainingItemCount?: number;
  orderCount?: number;
  proposalCount: number;
  proposals: AllwainShoppingListProposal[];
  myProposal?: AllwainShoppingListProposal | null;
  createdAt: string;
  updatedAt: string;
}

export interface AllwainContract {
  id: string;
  app: "allwain";
  type: string;
  status: string;
  offerId?: string | null;
  shoppingListId?: string | null;
  requesterUserId?: string | null;
  providerUserId?: string | null;
  offerTitle?: string | null;
  imageMeta?: AllwainCardImageMeta | null;
  requesterName?: string | null;
  providerName?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  totalPrice?: number | null;
  currency?: string | null;
  subtotalAmount?: number | null;
  shippingAmount?: number | null;
  carrierDeliveryAmount?: number | null;
  carrierQuoteId?: string | null;
  platformFeeBps?: number | null;
  platformFeeAmount?: number | null;
  platformNetFeeAmount?: number | null;
  platformRetainedAmount?: number | null;
  connectorFeeAmount?: number | null;
  connectorPlatformShareAmount?: number | null;
  connectorDeliveryAmount?: number | null;
  sellerAmount?: number | null;
  proposalRevisionId?: string | null;
  proposalRevision?: number | null;
  feeBasis?: "sale_amount" | "verified_savings";
  platformFeePayer?: "seller" | "buyer" | "platform";
  referenceAmount?: number | null;
  acceptedOfferAmount?: number | null;
  grossSavingsAmount?: number | null;
  netSavingsAmount?: number | null;
  commercialModel?: AllwainCommercialModel;
  businessOfRecord?: AllwainBusinessOfRecord;
  buyerCapacity?: "consumer" | "business" | null;
  paymentMode?: "immediate" | "preorder" | null;
  preorderChargeDeadlineAt?: string | null;
  paymentStatus?: string | null;
  inventoryStatus?: "reserved" | "sold" | "released" | null;
  deliveryMethod?: "shipping" | "pickup" | "in_person" | null;
  deliveryChannel?: "carrier" | "local_connector" | "seller" | "pickup" | null;
  deliveryAddress?: { formatted?: string; [key: string]: unknown } | null;
  deliveryNotes?: string | null;
  deliveryPricingSnapshot?: Record<string, unknown> | null;
  deliveryWindow?: StructuredDeliveryWindow | null;
  recurringOrder?: StructuredRecurringOrder | null;
  notes?: string | null;
  description?: string | null;
  generatedText?: string | null;
  requesterAcceptedAt?: string | null;
  providerAcceptedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StructuredDeliveryWindow {
  rawText: string;
  label: string;
  startAt: string | null;
  endAt: string | null;
  deadlineAt: string | null;
  timeOfDay: "morning" | "midday" | "afternoon" | "evening" | "anytime";
  confidence: number;
  needsChoice: boolean;
}

export interface StructuredRecurringOrder {
  enabled: boolean;
  interval: "weekly" | "biweekly" | "monthly";
  label: string;
}

export interface AllwainRecurringPlan {
  id: string;
  sourceOrderId: string;
  offerId: string;
  shoppingListId?: string | null;
  buyerUserId: string;
  sellerUserId: string;
  commercialModel?: AllwainCommercialModel;
  businessOfRecord?: AllwainBusinessOfRecord;
  platformRetainedAmount?: number;
  status:
    | "pending_initial_payment"
    | "active"
    | "paused"
    | "requires_action"
    | "canceled"
    | "completed";
  interval: StructuredRecurringOrder["interval"];
  quantity: number;
  unit: string;
  unitPriceAmount: number;
  maximumChargeAmount: number;
  shippingAmount?: number;
  carrierDeliveryAmount?: number;
  connectorPlatformShareAmount?: number;
  connectorDeliveryAmount?: number;
  currency: string;
  deliveryMethod?: "shipping" | "pickup" | "in_person" | null;
  deliveryChannel?: "carrier" | "local_connector" | "seller" | "pickup" | null;
  deliveryAddress?: { formatted?: string; [key: string]: unknown } | null;
  deliveryNotes?: string | null;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  pausedAt?: string | null;
  canceledAt?: string | null;
  completedOccurrences: number;
  failedOccurrences: number;
  consecutiveFailures: number;
  lastFailureCode?: string | null;
  lastFailureMessage?: string | null;
  paymentMethodReady: boolean;
  createdAt: string;
  updatedAt: string;
  occurrences?: {
    id: string;
    sequence: number;
    scheduledFor: string;
    status: string;
    orderId?: string | null;
    attempts: number;
    failureCode?: string | null;
    failureMessage?: string | null;
    paidAt?: string | null;
  }[];
}

export interface AllwainSellerPaymentStatus {
  provider: "stripe";
  configured: boolean;
  paymentsEnabled: boolean;
  commercialModel: AllwainCommercialModel;
  businessOfRecord: AllwainBusinessOfRecord;
  usesConnectedAccount: boolean;
  status:
    | "not_started"
    | "pending"
    | "requires_information"
    | "restricted"
    | "enabled"
    | "not_ready";
  accountCreated: boolean;
  transfersEnabled: boolean;
  payoutsEnabled: boolean;
  requirements?: {
    entries?: {
      description?: string | null;
      awaitingActionFrom?: string | null;
      deadlineStatus?: string | null;
      errors?: string[];
    }[];
  };
  lastSyncedAt?: string | null;
}

export interface AllwainOrder {
  id: string;
  purchaseAnalytics?: {
    version: 1;
    transactionId: string;
    paymentEnvironment: "test" | "live";
    currency: string;
    value: number;
  } | null;
  contractId: string;
  offerId: string;
  offerTitle?: string | null;
  imageMeta?: AllwainCardImageMeta | null;
  shoppingListId?: string | null;
  buyerUserId: string;
  sellerUserId: string;
  connectorUserId?: string | null;
  recurringPlanId?: string | null;
  recurringSequence?: number | null;
  scheduledFor?: string | null;
  paymentMode: "immediate" | "preorder";
  preorderChargeDeadlineAt?: string | null;
  status: string;
  paymentStatus: string;
  checkoutBlockReason?: "recurring_charge" | "deferred_charge" | null;
  fulfillmentStatus: string;
  disputeStatus?: string | null;
  transferStatus: string;
  quantity: number;
  unit: string;
  unitPriceAmount: number;
  subtotalAmount: number;
  shippingAmount: number;
  carrierDeliveryAmount?: number;
  carrierQuoteId?: string | null;
  taxAmount: number;
  agriculturalCompensationAmount: number;
  totalAmount: number;
  currency: string;
  platformFeeBps: number;
  platformFeeAmount: number;
  platformNetFeeAmount: number;
  platformRetainedAmount: number;
  sellerAmount: number;
  connectorFeeAmount: number;
  connectorPlatformShareAmount?: number;
  connectorDeliveryAmount?: number;
  refundedAmount?: number;
  taxStatus?: string;
  documentStatus?: string;
  traceabilityStatus?: string;
  settlementStatus?: string;
  buyerCapacity?: "consumer" | "business";
  paymentArchitecture:
    "destination" | "separate_charges_and_transfers" | string;
  commercialModel?: AllwainCommercialModel;
  businessOfRecord?: AllwainBusinessOfRecord;
  sellerTransferId?: string | null;
  connectorTransferId?: string | null;
  sellerTransferStatus?: string;
  connectorTransferStatus?: string;
  inventoryStatus: string;
  deliveryMethod?: "shipping" | "pickup" | "in_person" | null;
  deliveryChannel?: "carrier" | "local_connector" | "seller" | "pickup" | null;
  deliveryAddress?: { formatted?: string; [key: string]: unknown } | null;
  deliveryNotes?: string | null;
  deliveryPricingSnapshot?: Record<string, unknown> | null;
  reservationExpiresAt?: string | null;
  preorderMandateVersion?: string | null;
  preorderMandateAcceptedAt?: string | null;
  paidAt?: string | null;
  readyAt?: string | null;
  dispatchedAt?: string | null;
  deliveredAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  latestPayment?: {
    id: string;
    kind: string;
    status: string;
    amount: number;
    refundedAmount: number;
    transferStatus?: string;
    failureMessage?: string | null;
  } | null;
}

export interface AllwainOrderDocument {
  id: string;
  documentType: string;
  title: string;
  status: string;
  documentNumber?: string | null;
  sourceReference?: string | null;
  totalAmount: number;
  currency: string;
  issuedAt?: string | null;
  contentHash: string;
  signatureRequired: boolean;
  signatureStatus: "not_required" | "pending" | "signed" | "rejected" | string;
  signedAt?: string | null;
  canSign: boolean;
}

export interface AllwainOrderCompliance {
  orderId: string;
  statuses: {
    tax: string;
    documents: string;
    traceability: string;
    settlement: string;
  };
  legalSellerUserId: string;
  commercialTermsVersion: string;
  lines: {
    id: string;
    productName: string;
    quantity: number | string;
    unit: string;
    subtotalAmount: number;
  }[];
  tax?: {
    status: string;
    treatmentCode?: string | null;
    explanation?: string | null;
  } | null;
  settlements: {
    id: string;
    status: string;
    grossAmount: number;
    sellerAmount: number;
    platformFeeAmount: number;
    connectorAmount: number;
    currency: string;
  }[];
  transfers: {
    id: string;
    recipientRole: "seller" | "connector";
    status: string;
    amount: number;
    reversedAmount: number;
    currency: string;
    releaseTrigger: string;
    transferredAt?: string | null;
  }[];
  documents: AllwainOrderDocument[];
  lots: {
    id: string;
    quantity: number | string;
    unit: string;
    lot: {
      id: string;
      code: string;
      status: string;
      originCountry?: string | null;
      originRegion?: string | null;
      recall?: {
        id: string;
        status: string;
        reason: string;
        instructions?: string | null;
        affectedOrderCount: number;
        affectedBuyerCount: number;
        createdAt: string;
      } | null;
    };
    orderLine: { id: string; productName: string };
  }[];
  incidents: {
    id: string;
    type: string;
    status: string;
    reason: string;
    requestedResolution?: string | null;
    createdAt: string;
    reporter?: { id: string; name: string };
  }[];
}

export interface AllwainAuditResponse {
  orderId: string;
  contractId: string;
  evidenceLevel: "technical_tamper_evident";
  legalNotice: string;
  verification: {
    valid: boolean;
    count: number;
    brokenSequence?: number | null;
    headHash?: string | null;
  };
  events: {
    id: string;
    sequence: number;
    eventType: string;
    source: string;
    occurredAt: string;
    actor?: { id: string; name?: string; email?: string; role?: string } | null;
    providerEventId?: string | null;
    eventHash: string;
  }[];
}

export interface AllwainCheckoutResponse {
  url?: string | null;
  sessionId?: string;
  orderId: string;
  mode?: "payment" | "setup";
  status?: string;
  alreadyPaid?: boolean;
  reservationReady?: boolean;
}

export interface AllwainBuyerPaymentProfile {
  status: "not_started" | "setup_pending" | "ready" | "failed";
  ready: boolean;
  card?: {
    brand: string;
    last4?: string | null;
    expMonth?: number | null;
    expYear?: number | null;
  } | null;
  consentVersion: string;
  consentAcceptedAt?: string | null;
  lastSyncedAt?: string | null;
  url?: string | null;
  sessionId?: string;
}

export interface AllwainPaymentConfig {
  enabled: boolean;
  stripeLivemode: boolean;
  paymentEnvironment?: "test" | "live";
  legalReleaseScope?: "none" | "test" | "live";
  publicationCardRequired: boolean;
  stripeTestCheckoutEnabled?: boolean;
  stripeTestCheckoutScope?: string;
  stripeTestExcludedOfferKinds?: string[];
  stripeTestFundsFlow?: string;
  stripeTestFiscalDocumentsIssued?: boolean | null;
  stripeTestSellerTransfersEnabled?: boolean | null;
  legalRequirementsBypassedForTest?: boolean;
  legalIdentityConfigured?: boolean;
  legalIdentityRequired?: boolean;
}

export interface SponsorReferral {
  id: string;
  invitedUserId: string;
  invitedName?: string;
  totalSavedByInvited: number;
  commissionEarned: number;
}

export interface SponsorSummaryResponse {
  totalCommission: number;
  totalSaved: number;
  invitedCount: number;
  balance: number;
  referrals: SponsorReferral[];
}

export interface ScanDemoResponse {
  product?: {
    id: string;
    name: string;
    description?: string;
    brand?: string;
    ean?: string;
  };
  offers?: AllwainOffer[];
  message?: string;
}

export interface AllwainScanExtractedFields {
  productName?: string | null;
  brand?: string | null;
  category?: string | null;
  subcategory?: string | null;
  ean?: string | null;
  sku?: string | null;
  supplier?: string | null;
  quantity?: number | null;
  unit?: string | null;
  targetPrice?: number | null;
  currency?: string | null;
  deliveryWindow?: string | null;
  structuredDeliveryWindow?: StructuredDeliveryWindow | null;
  deliveryMethod?: "shipping" | "pickup" | "in_person" | null;
  deliveryChannel?: "carrier" | "local_connector" | "seller" | "pickup" | null;
  deliveryAddress?: string | null;
  deliveryNotes?: string | null;
  locationLabel?: string | null;
  locationLatApprox?: number | null;
  locationLngApprox?: number | null;
  rawText?: string | null;
  productKind?:
    | "produce_weight"
    | "liquid_bulk"
    | "vehicle"
    | "appliance"
    | "electronics"
    | "service"
    | "general"
    | null;
  measurement?: {
    unit: string;
    label: string;
    quantityLabel: string;
    step: number;
    confidence: number;
    source: "explicit" | "vision" | "category" | "model" | "default" | "user";
  } | null;
  attributes?: {
    key: string;
    label: string;
    value: string;
    confidence?: number;
  }[];
  confidence: number;
  notes?: string[];
}

export interface AllwainScanRequest {
  id: string;
  userId?: string;
  sourceType?: "camera" | "image" | "barcode" | "text" | "demo";
  status:
    | "draft"
    | "ready"
    | "submitted"
    | "awarded"
    | "closed"
    | "canceled"
    | "archived";
  title: string;
  description: string;
  extracted: AllwainScanExtractedFields;
  imageMeta?: AllwainCardImageMeta | null;
  product?: ScanDemoResponse["product"] | null;
  offers: AllwainOffer[];
  selectedOfferId?: string | null;
  selectedAt?: string | null;
  closedAt?: string | null;
  publicationReviewId?: string | null;
  qualityDecision?: "approve" | "improve" | "block" | null;
  qualityScore?: number | null;
  qualityReviewedAt?: string | null;
  paymentGuaranteeStatus?: "not_started" | "setup_pending" | "ready" | "failed";
  paymentGuaranteeConsentVersion?: string | null;
  paymentGuaranteeAcceptedAt?: string | null;
  referencePriceSource?: "manual" | "ocr_document";
  referencePriceLocked?: boolean;
  referenceDocumentId?: string | null;
  ocrExtractionId?: string | null;
  referenceCapturedAt?: string | null;
  ai: {
    provider: "mock" | "google";
    model?: string | null;
    confidence: number;
    summary: string;
    warnings: string[];
    rawData?: Record<string, unknown> | null;
    recovery?: { contractId: string; orderId?: string | null; offerId: string; reason: string; reopenedAt: string; eligibleAlternativeIds: string[] };
  };
  createdAt?: string;
  updatedAt?: string;
}

export type AllwainScanCaptureResponse =
  | { kind: "request"; request: AllwainScanRequest }
  | {
      kind: "shopping_list";
      evidenceDocumentId: string;
      ocrExtractionId: string;
      shoppingList: AllwainShoppingList;
      analysis: {
        provider: "mock" | "google";
        confidence: number;
        summary: string;
        warnings: string[];
        document: {
          kind: "receipt" | "invoice" | "quote" | "purchase_list" | "unknown";
          merchant?: string | null;
          documentDate?: string | null;
          currency: string;
          total?: number | null;
          confidence: number;
          items: {
            productName: string;
            quantity: number;
            unit: string;
            unitPrice: number;
            lineTotal: number;
            currency: string;
            confidence: number;
          }[];
        };
      };
    };

export interface AllwainLiveScanAnalysis {
  status: "scanning" | "ready";
  readingProgress: number;
  confidence: number;
  ready: boolean;
  detectedFields: string[];
  expectedFieldCount: number;
  extracted: AllwainScanExtractedFields;
  signals: {
    textCharacters: number;
    barcode: string | null;
    labels: { name: string; confidence: number }[];
    objects: { name: string; confidence: number }[];
  };
  summary: string;
  warnings: string[];
}

export interface AllwainOrderSummary {
  scope: "buyer" | "seller";
  totalCount: number;
  activeCount: number;
  newCount: number;
  readyCount: number;
  completedCount: number;
  preparationCount?: number;
  pendingActionCount?: number;
  toPrepare: { unit: string; quantity: number }[];
  pendingIncome: { currency: string; amount: number }[];
  incomeSummary?: {
    version: number;
    asOf: string;
    basis: string;
    reviewCount: number;
    byCurrency: { currency: string; pendingAmount: number; recoveryAmount: number; reviewCount: number }[];
  } | null;
}

async function parseResponse(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

let authCookieTail: Promise<unknown> = Promise.resolve();
const AUTH_COOKIE_PATHS = new Set(["/auth/login", "/auth/register", "/auth/google", "/auth/apple",
  "/auth/refresh", "/auth/logout", "/auth/logout-all"]);
function changesAuthCookie(path: string, method: string) {
  return method !== "GET" && (AUTH_COOKIE_PATHS.has(path) || /^\/auth\/sessions\/[^/]+$/.test(path));
}

function serializeAuthCookie<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const remoteCurrent = webAuthCoordination.captureRemote();
  const controller = new AbortController();
  const expired = new Error("La conexión ha tardado demasiado. Inténtalo de nuevo.");
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(expired); }, timeoutMs);
  });
  const pending = authCookieTail.catch(() => undefined).then(async () => {
    if (controller.signal.aborted) throw expired;
    const run = async () => {
      if (controller.signal.aborted) throw expired;
      if (!remoteCurrent()) throw new Error("SESSION_CHANGED");
      const result = await operation(controller.signal);
      if (!remoteCurrent()) throw new Error("SESSION_CHANGED");
      return result;
    };
    const locks = (globalThis as any)?.navigator?.locks;
    return locks?.request
      ? locks.request("newmersive-allwain-auth-cookie", { signal: controller.signal }, run)
      : run();
  });
  // Keep the real operation as the barrier, even if a transport ignores abort.
  // A later login must not race a response that can still apply Set-Cookie.
  authCookieTail = pending.catch(() => undefined);
  return Promise.race([pending, timeout]).finally(() => clearTimeout(timer));
}

function assertCurrentSession(session: AuthSessionSnapshot) {
  if (!session.isCurrent()) throw new Error("SESSION_CHANGED");
}

async function handleUnauthorized(status: number, session: AuthSessionSnapshot) {
  if (status === 401) {
    assertCurrentSession(session);
    await expireAuthSession("Tu sesión ha caducado. Vuelve a iniciar sesión.", session);
    throw new Error("SESSION_EXPIRED");
  }
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs = 20_000,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      credentials: "include",
      ...init,
      signal: controller.signal,
    });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("La conexión ha tardado demasiado. Inténtalo de nuevo.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchAuthorized(
  path: string,
  init: RequestInit,
  session: AuthSessionSnapshot,
  token: string | null,
  timeoutMs = 20_000,
) {
  const logout = path === "/auth/logout";
  const run = async (signal?: AbortSignal) => {
    // Logout was requested for this captured bearer. It is allowed to retire
    // that session after local clearing, but cannot refresh a different one.
    if (!logout) assertCurrentSession(session);
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    else headers.delete("Authorization");
    const res = signal
      ? await fetch(`${API_BASE_URL}${path}`, { credentials: "include", ...init, headers, signal })
      : await fetchWithTimeout(`${API_BASE_URL}${path}`, { ...init, headers }, timeoutMs);
    const data = await parseResponse(res);
    if (signal?.aborted) throw new Error("La conexión ha tardado demasiado. Inténtalo de nuevo.");
    return { res, data };
  };
  return changesAuthCookie(path, init.method || "GET") ? serializeAuthCookie(run, timeoutMs) : run();
}

async function requestAuthorized<T>(path: string, init: RequestInit, timeoutMs = 20_000): Promise<T> {
  const session = captureAuthSession();
  if (!session.token) throw new Error("SESSION_EXPIRED");
  if (path !== "/auth/logout") assertCurrentSession(session);
  let { res, data } = await fetchAuthorized(path, init, session, session.token, timeoutMs);
  if (path === "/auth/logout" || path === "/auth/logout-all") {
    if (path === "/auth/logout-all") assertCurrentSession(session);
    // A failed/offline logout confirms only local clearing, never remote
    // revocation. Its result must not expire a newer client identity.
    if (!res.ok) throw new Error("LOGOUT_NOT_CONFIRMED");
    return data as T;
  }
  // Body parsing can finish after logout/login, even when headers arrived
  // before it. Neither a success nor an auth/MFA error may cross identities.
  assertCurrentSession(session);
  if (res.status === 401) {
    // The cookie-writing attempt released its lock before renewal, so refresh
    // cannot deadlock by acquiring that same queue or browser lock recursively.
    const nextToken = await refreshAuthToken(session).catch(() => null);
    assertCurrentSession(session);
    if (nextToken) ({ res, data } = await fetchAuthorized(path, init, session, nextToken, timeoutMs));
    assertCurrentSession(session);
  }
  if (!res.ok) {
    await handleUnauthorized(res.status, session);
    throw new Error(extractErrorMessage(data, res.status));
  }
  return data as T;
}

function extractErrorMessage(data: any, status: number) {
  // Publication screens translate these conflicts in the current locale.
  if (["PROPOSAL_LOCKED", "OFFER_VERSION_CONFLICT", "OFFER_TERMS_LOCKED", "PROPOSAL_WITHDRAWN", "OFFER_CLOSED", "PRODUCT_IDENTITY_CHANGE_REQUIRES_NEW_OFFER"].includes(data?.error)) return data.error;
  if (data?.error === 'ADMIN_MFA_REQUIRED' || data?.error === 'ADMIN_MFA_ENROLLMENT_REQUIRED') {
    requireAdminMfa();
    return 'Confirma el segundo factor para acceder como administrador.';
  }
  if (typeof data?.error === 'string' && data.error.startsWith('ADMIN_MFA_')) return data.error;
  if (data?.error === "INVALID_CREDENTIALS") {
    return "Email o contraseña incorrectos.";
  }
  if (data?.error === "MISSING_FIELDS") {
    return "Completa todos los datos obligatorios.";
  }
  if (data?.error === "EMAIL_ALREADY_EXISTS") {
    return "Este email ya está registrado. Entra con tu contraseña.";
  }
  if (data?.error === "WEAK_PASSWORD") {
    return "Usa una contraseña de al menos 12 caracteres.";
  }
  if (data?.error === "INVALID_EMAIL") {
    return "Escribe un email válido.";
  }
  if (data?.error === "EMAIL_DOMAIN_TYPO") {
    return data?.suggestedEmail
      ? `Revisa el dominio. ¿Querías escribir ${data.suggestedEmail}?`
      : "Revisa el dominio del email.";
  }
  if (data?.error === "INVALID_NAME") {
    return "Escribe tu nombre completo.";
  }
  if (data?.error === "GOOGLE_AUTH_NOT_CONFIGURED") {
    return "El acceso con Google todavía necesita sus credenciales OAuth.";
  }
  if (data?.error === "AUTH_IDENTITY_CONFLICT") {
    return "No podemos conectar este acceso automáticamente. Entra con el método que ya utilizabas o recupera el acceso con tu correo.";
  }
  if (
    data?.error === "INVALID_GOOGLE_TOKEN" ||
    data?.error === "UNVERIFIED_GOOGLE_EMAIL"
  ) {
    return "Google no pudo verificar esta cuenta. Vuelve a intentarlo.";
  }
  if (data?.error === "CONNECTOR_NOT_ACTIVE") {
    return "Activa primero tu espacio Conector.";
  }
  if (data?.error === "LOGISTICS_QR_REQUIRED") {
    return "Esta entrega se confirma escaneando el QR del vendedor o del comprador.";
  }
  if (data?.error === "LOGISTICS_CHECKPOINT_EXPIRED") {
    return "El código ha caducado. Pide que abran de nuevo su QR de entrega.";
  }
  if (data?.error === "INVALID_LOGISTICS_CHECKPOINT") {
    return "Ese QR o código no corresponde a esta entrega.";
  }
  if (data?.error === "PAYLOAD_TOO_LARGE" || status === 413) {
    return "La imagen es demasiado grande. Haz la foto mas cerca o prueba con una imagen mas ligera.";
  }
  if (data?.error === "CANNOT_ACCEPT_OWN_OFFER") {
    return "No puedes solicitar ni aceptar tu propia oferta.";
  }
  if (data?.error === "DELIVERY_ADDRESS_REQUIRED") {
    return "Indica la dirección de entrega o el punto de encuentro.";
  }
  if (data?.error === "INVALID_DELIVERY_METHOD") {
    return "Selecciona una forma de entrega válida.";
  }
  if (
    data?.error === "DELIVERY_ADDRESS_TOO_LONG" ||
    data?.error === "DELIVERY_NOTES_TOO_LONG"
  ) {
    return "Acorta los datos de entrega antes de continuar.";
  }
  if (data?.error === "INVALID_CONTRACT_STATUS") {
    return "Este acuerdo ya no admite esa accion.";
  }
  if (data?.error === "INCOMPLETE_PRODUCT_SHEET") {
    return "Completa los campos obligatorios de producto y entrega.";
  }
  if (data?.error === "INVALID_SCAN_TRANSITION") {
    return "La ficha ha cambiado de estado. Vuelve a abrirla para continuar.";
  }
  if (data?.error === "SCAN_REQUEST_LOCKED") {
    return "La petición ya está lanzada y no se puede modificar.";
  }
  if (data?.error === "SCAN_REQUEST_NOT_FOUND") {
    return "No encontramos esta petición.";
  }
  if (data?.error === "PUBLICATION_BLOCKED") {
    return (
      data?.review?.issues?.[0]?.message ||
      data?.review?.summary ||
      "Corrige la publicación antes de continuar."
    );
  }
  if (data?.error === "BUYER_PAYMENT_METHOD_REQUIRED") {
    return "Añade y verifica una tarjeta antes de publicar la petición.";
  }
  if (data?.error === "BUYER_PAYMENT_CONSENT_REQUIRED") {
    return "Confirma para qué se guardará la tarjeta antes de continuar.";
  }
  if (data?.error === "SELLER_ROLE_REQUIRED") {
    return "Activa Vendedor en tu misma cuenta para publicar esta oferta.";
  }
  if (data?.error === "INCOMPLETE_GUIDE_ACTION") {
    return "El borrador todavía necesita algunos datos antes de publicarse.";
  }
  if (data?.error === "ALLWAIN_GUIDE_UNAVAILABLE") {
    return data?.message || "La Guía no ha podido analizarlo. Nada se ha publicado.";
  }
  if (data?.error === "ALLWAIN_GUIDE_ACTION_FAILED") {
    return data?.message || "No se ha publicado. El borrador sigue disponible.";
  }
  if (data?.error === "OFFER_ALREADY_EXISTS") {
    return "Ya has enviado una oferta para esta petición.";
  }
  if (data?.error === "MARKET_REQUEST_NOT_FOUND") {
    return "La petición ya no está disponible.";
  }
  if (data?.error === "CANNOT_OFFER_OWN_REQUEST") {
    return "No puedes ofertar sobre tu propia petición.";
  }
  if (data?.error === "EMPTY_SHOPPING_LIST_IMPORT") {
    return "La lista está vacía. Escribe al menos un producto.";
  }
  if (data?.error === "SHOPPING_LIST_IMPORT_TOO_LARGE") {
    return "La lista es demasiado grande. Divide el archivo antes de subirlo.";
  }
  if (data?.error === "TOO_MANY_SHOPPING_LIST_ITEMS") {
    return "Cada lista puede contener hasta 100 productos.";
  }
  if (
    data?.error === "INVALID_SHOPPING_LIST_ITEMS" ||
    data?.error === "INVALID_SHOPPING_LIST_ITEM_NAME" ||
    data?.error === "INVALID_SHOPPING_LIST_ITEM_QUANTITY" ||
    data?.error === "INVALID_SHOPPING_LIST_ITEM_UNIT"
  ) {
    return "Revisa el nombre, la cantidad y la unidad de cada producto.";
  }
  if (data?.error === "SHOPPING_LIST_NOT_FOUND") {
    return "No encontramos esta lista de compra.";
  }
  if (data?.error === "SHOPPING_LIST_NOT_OPEN") {
    return "Esta lista ya no admite nuevas propuestas.";
  }
  if (
    data?.error === "SHOPPING_LIST_CHANGED" ||
    data?.error === "SHOPPING_LIST_LOCKED"
  ) {
    return "La lista ha cambiado. Ábrela de nuevo para trabajar con la versión actual.";
  }
  if (data?.error === "INVALID_SHOPPING_LIST_PROPOSAL_ITEMS") {
    return "Elige al menos un producto disponible para enviar tu propuesta.";
  }
  if (data?.error === "SHOPPING_LIST_ITEMS_ALREADY_AWARDED") {
    return "Otro vendedor acaba de cubrir alguno de estos productos. Actualiza la lista y elige los que siguen disponibles.";
  }
  if (data?.error === "SHOPPING_LIST_PROPOSAL_ALREADY_SELECTED") {
    return "Esta propuesta ya fue elegida y no puede modificarse.";
  }
  if (data?.error === "SHOPPING_LIST_PROPOSAL_QUANTITY_MISMATCH") {
    return "Una cantidad no coincide con la lista del comprador.";
  }
  if (data?.error === "SHOPPING_LIST_SUBSTITUTION_NOT_ALLOWED") {
    return "El comprador no acepta productos alternativos en esta lista.";
  }
  if (data?.error === "INVALID_SHOPPING_LIST_SHIPPING_WEIGHT") {
    return "Indica el peso total del paquete para poder calcular la mensajería.";
  }
  if (
    data?.error === "INVALID_OFFER_PRICE" ||
    data?.error === "MISSING_OFFER_FIELDS"
  ) {
    return "Completa precio, descripción y plazo de entrega de la oferta.";
  }
  if (data?.error === "INCOMPLETE_PRODUCT_COMPLIANCE") {
    return "Completa el origen y la persona responsable antes de publicar este alimento.";
  }
  if (data?.error === "SELLER_PAYMENTS_NOT_READY") {
    return "El vendedor todavía debe completar la verificación de cobros con Stripe.";
  }
  if (data?.error === "BUYER_FISCAL_PROFILE_REQUIRED") {
    return "Completa los datos fiscales de la empresa antes de pagar.";
  }
  if (data?.error === "SELLER_FISCAL_PROFILE_REQUIRED") {
    return "El vendedor debe confirmar sus datos fiscales antes de cobrar.";
  }
  if (data?.error === "REFUND_ALREADY_PENDING") {
    return "Ya hay un reembolso en curso para este pedido.";
  }
  if (
    data?.error === "ALLWAIN_PAYMENTS_NOT_CONFIGURED" ||
    data?.error === "STRIPE_NOT_CONFIGURED"
  ) {
    return "Los pagos con tarjeta todavía no están activados en Allwain.";
  }
  if (data?.error === "AGREEMENT_NOT_ACCEPTED") {
    return "Las dos partes deben confirmar el acuerdo antes del pago.";
  }
  if (data?.error === "RESERVATION_CONSENT_REQUIRED") {
    return "Debes autorizar que Stripe guarde el método de pago para esta reserva.";
  }
  if (data?.error === "PAYMENT_REQUIRES_CUSTOMER_ACTION") {
    return "El banco requiere que el cliente confirme el cobro.";
  }
  if (data?.error === "RECURRING_CHARGE_IN_PROGRESS" || data?.error === "DEFERRED_CHARGE_IN_PROGRESS") {
    return "Hay un intento de cobro pendiente de revisión. Actualiza el estado del pedido; la confirmación bancaria todavía no puede completarse desde esta pantalla.";
  }
  if (data?.error === "PAYMENT_FAILED") {
    return "El pago fue rechazado. El cliente debe intentarlo de nuevo.";
  }
  if (data?.error === "ORDER_NOT_PAID") {
    return "El pedido debe estar pagado antes de preparar o entregar.";
  }
  if (data?.error === "SENDCLOUD_NOT_CONFIGURED") {
    return "El transporte nacional todavía no está disponible para esta oferta.";
  }
  if (data?.error === "SENDCLOUD_INTERNATIONAL_NOT_READY") {
    return "Por ahora, el transporte está disponible únicamente para envíos dentro de España.";
  }
  if (data?.error === "SELLER_CARRIER_ADDRESS_REQUIRED") {
    return "El vendedor debe completar su dirección de recogida antes de ofrecer transporte.";
  }
  if (data?.error === "CARRIER_ADDRESS_REQUIRED") {
    return "Escribe la dirección donde debe llegar el pedido.";
  }
  if (data?.error === "CARRIER_POSTAL_CODE_REQUIRED") {
    return "Indica el código postal de entrega.";
  }
  if (data?.error === "CARRIER_CITY_REQUIRED") {
    return "Indica la localidad de entrega.";
  }
  if (data?.error === "INVALID_CARRIER_PHONE") {
    return "Revisa el teléfono de contacto para la entrega.";
  }
  if (data?.error === "CARRIER_WEIGHT_REQUIRED") {
    return "El vendedor debe indicar el peso del producto para calcular el transporte.";
  }
  if (data?.error === "CARRIER_QUOTE_EXPIRED") {
    return "La tarifa de transporte ha caducado. Calcúlala de nuevo para continuar.";
  }
  if (
    data?.error === "CARRIER_QUOTE_NOT_FOUND" ||
    data?.error === "CARRIER_QUOTE_MISMATCH" ||
    data?.error === "CARRIER_QUOTE_ALREADY_USED"
  ) {
    return "La tarifa seleccionada ya no corresponde a este pedido. Calcúlala de nuevo.";
  }
  if (data?.error === "SENDCLOUD_NO_SHIPPING_OPTIONS") {
    return "No encontramos un transporte disponible para este destino y peso.";
  }
  if (data?.error === "SENDCLOUD_TIMEOUT") {
    return "La empresa de transporte está tardando demasiado. Vuelve a calcular la tarifa.";
  }
  if (
    data?.error === "SENDCLOUD_AUTH_FAILED" ||
    data?.error === "SENDCLOUD_REQUEST_FAILED" ||
    data?.error === "SENDCLOUD_REQUEST_REJECTED"
  ) {
    return "No pudimos confirmar el transporte en este momento. Inténtalo de nuevo.";
  }
  if (data?.error === "ORDER_NOT_READY") {
    return "Marca primero el pedido como listo para que la mensajería pueda recogerlo.";
  }
  if (data?.error === "CARRIER_TRACKING_REQUIRED") {
    return "El estado de este envío lo actualizará automáticamente la empresa de transporte.";
  }
  if (data?.error === "CARRIER_RECURRING_REQUOTE_REQUIRED") {
    return "Calcularemos el transporte de cada entrega recurrente cuando llegue su fecha.";
  }
  if (data?.error === "SHIPMENT_CREATE_CONFLICT") {
    return "El envío ya se está creando. Espera unos segundos y actualiza el pedido.";
  }
  if (data?.error === "ORDER_DISPUTED") {
    return "El pedido tiene una incidencia de pago abierta.";
  }
  if (data?.error === "ORDER_NOT_PAYABLE") {
    return "Este pedido está cerrado y no admite un nuevo pago.";
  }
  if (data?.error === "ORDER_NOT_REVIEWABLE") {
    return "Podrás valorar esta operación cuando conste como entregada.";
  }
  if (data?.error === "REVIEW_ALREADY_EXISTS") {
    return "Ya has valorado a esta persona en este pedido.";
  }
  if (data?.error === "INVALID_REVIEW_RATING") {
    return "Elige una puntuación de 1 a 5 estrellas.";
  }
  if (data?.error === "SELF_REVIEW_NOT_ALLOWED") {
    return "No puedes valorarte a ti mismo.";
  }
  if (data?.error === "REVIEW_SUBJECT_REQUIRED") {
    return "Elige a quién quieres valorar.";
  }
  if (data?.error === "REVIEW_RESPONSE_REQUIRED") {
    return "Escribe una respuesta antes de publicarla.";
  }
  if (data?.error === "REPORT_REASON_REQUIRED") {
    return "Explica brevemente qué debemos revisar.";
  }
  if (data?.error === "REVIEW_NOT_FOUND") {
    return "Esta opinión ya no está disponible.";
  }
  if (data?.error === "ACCOUNT_HAS_OPEN_ORDERS") {
    return "Aún tienes pedidos abiertos. Complétalos o cancélalos antes de eliminar la cuenta.";
  }
  if (data?.error === "ACCOUNT_HAS_OPEN_TRADES") {
    return "Aún tienes trueques abiertos en TrueQIA. Ciérralos antes de eliminar tu identidad.";
  }
  if (data?.error === "LAST_ACTIVE_ADMIN_PROTECTED") {
    return "Esta es la última cuenta administradora activa. Debe quedar otra cuenta administradora activa antes de eliminarla.";
  }
  if (data?.error === "SELLER_RESTRICTED") {
    return "Tu perfil de vendedor está restringido. Contacta con soporte para solicitar una revisión.";
  }
  if (data?.error === "CONNECTOR_RESTRICTED") {
    return "Tu perfil de conector está restringido. Contacta con soporte para solicitar una revisión.";
  }
  if (data?.error === "CHAT_BLOCKED") {
    return "Esta conversación está bloqueada. Desbloquéala antes de enviar mensajes.";
  }
  if (data?.error === "CHAT_REQUEST_PENDING") {
    return "Tu solicitud ya está enviada. Podrás continuar cuando la otra persona la acepte.";
  }
  if (data?.error === "CHAT_REQUEST_REQUIRES_RESPONSE") {
    return "Esta persona ya te ha escrito. Abre Mensajes para aceptar o rechazar su solicitud.";
  }
  if (data?.error === "CHAT_REQUEST_REJECTED") {
    return "Esta solicitud de conversación no fue aceptada.";
  }
  if (data?.error === "CHAT_REQUEST_RATE_LIMITED") {
    return "Has iniciado varias conversaciones en poco tiempo. Espera antes de contactar a otra persona.";
  }
  if (data?.error === "DIRECT_CHAT_SELF_FORBIDDEN") {
    return "No puedes enviarte un mensaje a ti mismo.";
  }
  if (data?.error === "VIDEO_CALL_NOT_CONFIGURED") {
    return "Las videollamadas todavía no están activadas.";
  }
  if (data?.error === "VIDEO_CALL_CONTEXT_NOT_ACTIVE") {
    return "Acepta primero la conversación para iniciar una videollamada.";
  }
  if (data?.error === "INVALID_VIDEO_CALL_EVENT") {
    return "No pudimos registrar el estado de la videollamada.";
  }
  if (data?.error === "BLOCK_TARGET_REQUIRED") {
    return "Elige la persona que quieres bloquear.";
  }
  if (data?.error === "OFFER_ABOVE_REFERENCE_PRICE") {
    return "Tu propuesta no puede superar el precio de referencia de la petición.";
  }
  if (data?.error === "PROPOSAL_NOT_IMPROVED") {
    return "La nueva propuesta debe mantener o mejorar el precio anterior.";
  }
  if (
    data?.error === "INVALID_PROPOSAL_DURATION" ||
    data?.error === "PROPOSAL_WINDOW_TOO_SHORT"
  ) {
    return "Elige una duración de oferta entre 1 hora y 30 días.";
  }
  if (data?.error === "PROPOSAL_EXPIRED") {
    return "Esta propuesta ha finalizado. El vendedor puede renovarla antes de continuar.";
  }
  if (data?.error === "DUPLICATE_EVIDENCE_DOCUMENT") {
    return "Esta captura ya está activa. Revísala o anúlala antes de repetirla.";
  }
  if (data?.error === "OCR_EVIDENCE_PERSISTENCE_UNCERTAIN") {
    return "No se ha podido confirmar si se guardó la captura. Comprueba tus listas antes de repetirla.";
  }
  if (data?.error === "OCR_PRICE_LOCKED_RESTART_REQUIRED") {
    return "El precio procede del documento y no se puede editar. Repite la captura para corregirlo.";
  }
  if (data?.error === "OCR_DOCUMENT_REVIEW_REQUIRED") {
    return "Esta imagen contiene precios capturados. Revísalos desde Capturar antes de publicar.";
  }
  if (data?.error === "EVIDENCE_ALREADY_USED") {
    return "Esta captura ya forma parte de una operación y no puede anularse.";
  }
  if (data?.error === "OCR_DOCUMENT_ITEMS_MISSING") {
    return "No hemos encontrado productos con un precio legible. Haz otra captura más nítida.";
  }
  if (data?.error === "INVALID_FULFILLMENT_TRANSITION") {
    return "Ese paso no corresponde al estado actual del pedido.";
  }
  const technicalCode = String(data?.error || "");
  if (/^[A-Z0-9_]+$/.test(technicalCode)) {
    return status >= 500
      ? "No pudimos completar la operación. Inténtalo de nuevo en unos instantes."
      : "No pudimos completar esta acción con los datos indicados.";
  }
  return String(
    data?.message || data?.error || "No pudimos conectar con Allwain.",
  );
}

/** PUBLIC (sin token) */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  const data = await parseResponse(res);

  if (!res.ok) {
    const msg = extractErrorMessage(data, res.status);
    throw new Error(msg);
  }

  return data as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const run = async (signal?: AbortSignal) => {
    const init: RequestInit = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    const res = signal
      ? await fetch(`${API_BASE_URL}${path}`, { credentials: "include", ...init, signal })
      : await fetchWithTimeout(`${API_BASE_URL}${path}`, init);
    const data = await parseResponse(res);
    if (signal?.aborted) throw new Error("La conexión ha tardado demasiado. Inténtalo de nuevo.");
    if (!res.ok) throw new Error(extractErrorMessage(data, res.status));
    return data as T;
  };
  return changesAuthCookie(path, "POST") ? serializeAuthCookie(run, 20_000) : run();
}

/** AUTH (con token) */
export async function apiAuthGet<T>(path: string): Promise<T> {
  return requestAuthorized<T>(path, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

}

export async function apiAuthPost<T>(
  path: string,
  body: unknown,
  timeoutMs = 20_000,
): Promise<T> {
  return requestAuthorized<T>(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    timeoutMs,
  );

}

export async function apiAuthPatch<T>(path: string, body: unknown): Promise<T> {
  return requestAuthorized<T>(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

}

export async function apiAuthDelete<T>(path: string): Promise<T> {
  return requestAuthorized<T>(path, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });
}
