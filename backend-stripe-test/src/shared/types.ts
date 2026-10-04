export type UserRole = "user" | "buyer" | "company" | "admin";
export type AllwainProfileStatus =
  | "not_activated"
  | "onboarding"
  | "pending_verification"
  | "active"
  | "restricted";
export type AllwainParticipationMode = "buyer" | "seller" | "connector";
export type CourseEntitlement =
  | "course_starter"
  | "course_professional"
  | "mentoring_premium"
  | "admin_course";

/* =========================
   USER & AUTH
========================= */

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash?: string;
  role: UserRole;
  status?: "active" | "disabled" | "locked";
  tokenVersion?: number;
  emailVerifiedAt?: string | Date | null;
  passwordChangedAt?: string | Date | null;
  failedLoginCount?: number;
  lastFailedLoginAt?: string | Date | null;
  lockedUntil?: string | Date | null;
  lastLoginAt?: string | Date | null;
  deletedAt?: string | Date | null;
  createdAt: string;
  sponsorCode?: string | null;
  referredByCode?: string | null;
  avatarUrl?: string | null;
  preferredLocale?: string | null;
  analyticsConsent?: boolean | null;
  analyticsConsentVersion?: string | null;
  analyticsConsentUpdatedAt?: string | Date | null;
  tokens?: number | null;
  allwainBalance?: number | null;
}

export interface CourseEntitlementRecord {
  id: string;
  userId: string;
  email: string;
  product: "newmersive_robot_lab";
  entitlement: CourseEntitlement;
  source: "stripe" | "manual" | "admin" | "import" | "demo";
  metadata?: Record<string, unknown> | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  grantedAt: string;
  updatedAt: string;
}

export type AuthUser = Omit<
  User,
  | "passwordHash"
  | "tokenVersion"
  | "passwordChangedAt"
  | "failedLoginCount"
  | "lastFailedLoginAt"
  | "lockedUntil"
  | "lastLoginAt"
> & {
  entitlements?: CourseEntitlement[];
  participation?: AllwainParticipationSnapshot;
};

export interface AllwainParticipationSnapshot {
  experience: {
    onboardingVersion: number;
    onboardingCompletedAt?: string | null;
    primaryIntent?: "buy" | "sell" | "connector" | null;
    guidanceEnabled: boolean;
    lastContext?: string | null;
  };
  buyer: {
    status: "active";
    enabled: true;
  };
  seller: {
    status: AllwainProfileStatus;
    enabled: boolean;
    sellerType?: string | null;
    commercialModel: AllwainCommercialModel;
    businessOfRecord: AllwainBusinessOfRecord;
    displayName?: string | null;
    paymentStatus?: string | null;
    fiscalStatus?: string | null;
    fiscalReady: boolean;
    paymentReady: boolean;
    sellerReady: boolean;
    locationLabel?: string | null;
    pickupAddress?: string | null;
    shippingPostalCode?: string | null;
    shippingCity?: string | null;
    shippingCountryCode?: string | null;
    shippingPhone?: string | null;
    carrierReady: boolean;
    locationReady: boolean;
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

export interface AuthTokenResponse {
  token: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  user: AuthUser;
  entitlements: CourseEntitlement[];
}

/* =========================
   OFFERS
========================= */

export type OfferOwner = "trueqia" | "allwain";
export type AllwainCommercialModel = "marketplace" | "platform_direct";
export type AllwainBusinessOfRecord = "seller" | "platform";

export interface Offer {
  id: string;
  title: string;
  description: string;
  owner: OfferOwner;
  ownerUserId: string;

  tokens?: number | null; // TrueQIA
  price?: number | null;  // Allwain
  productId?: string | null;

  meta?: Record<string, unknown> | null;
  updatedAt?: string;

  // Structured Allwain fields. `meta` remains available while older rows migrate.
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

  /**
   * Si true => oferta única (solo 1 trade puede acabar aceptado).
   * Si false => oferta para muchos (pueden aceptarse múltiples trades).
   */
  isUnique?: boolean;

  createdAt?: string;
}

/* =========================
   TRADES
========================= */

export type TradeStatus = "pending" | "accepted" | "active" | "completed" | "rejected" | "cancelled";

export interface Trade {
  id: string;
  offerId: string;
  fromUserId: string;
  toUserId: string;
  tokens: number;
  status: TradeStatus;
  createdAt: string;
  resolvedAt?: string | null;
  startedAt?: string | null;
  tokensTransferredAt?: string | null;
  trueqiaDetails?: Record<string, any> | null;
  fromCompletedAt?: string | null;
  toCompletedAt?: string | null;
  completedAt?: string | null;
}

/* =========================
   TRUEQIA CHAT
========================= */

export type TrueqiaChatSenderRole = "user" | "system";

export interface TrueqiaChatMessage {
  id: string;
  threadId: string;
  userId: string;
  tradeId?: string | null;
  senderId?: string | null;
  senderName: string;
  senderRole: TrueqiaChatSenderRole;
  text: string;
  createdAt: string;
}

export type ChatApp = "trueqia" | "allwain";
export type ChatContextType = "assistant" | "trade" | "order" | "direct";

export interface ChatThreadRecord {
  id: string;
  app: ChatApp;
  contextType: ChatContextType;
  contextId: string;
  title?: string | null;
  status: string;
  createdByUserId?: string | null;
  acceptedAt?: string | null;
  rejectedAt?: string | null;
  lastMessageAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatParticipantRecord {
  threadId: string;
  userId: string;
  joinedAt: string;
  lastReadAt?: string | null;
  archivedAt?: string | null;
}

export interface ChatBlockRecord {
  app: ChatApp;
  blockerUserId: string;
  blockedUserId: string;
  createdAt: string;
}

/* =========================
   PRODUCTS (ALLWAIN)
========================= */

export interface Product {
  id: string;
  name: string;
  ean?: string | null;
  category?: string | null;
  brand?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  priceTokens?: number | null;
  visibility?: "public" | "internal_test";
}

export type AllwainScanSourceType = "camera" | "image" | "barcode" | "text" | "demo";
export type AllwainDeliveryChannel =
  | "carrier"
  | "local_connector"
  | "seller"
  | "pickup";
export type AllwainScanRequestStatus =
  | "draft"
  | "ready"
  | "submitted"
  | "awarded"
  | "closed"
  | "canceled"
  | "archived";

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
  deliveryChannel?: AllwainDeliveryChannel | null;
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
  attributes?: Array<{
    key: string;
    label: string;
    value: string;
    confidence?: number;
  }>;
  confidence: number;
  notes?: string[];
}

export type AllwainDocumentKind =
  | "product"
  | "receipt"
  | "invoice"
  | "quote"
  | "purchase_list"
  | "unknown";

export interface AllwainScanDocumentItem {
  rawText: string;
  productName: string;
  description?: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  currency: string;
  confidence: number;
  taxIncluded?: boolean | null;
  discountAmount?: number | null;
}

export interface AllwainScanDocument {
  kind: AllwainDocumentKind;
  merchant?: string | null;
  documentDate?: string | null;
  currency: string;
  total?: number | null;
  confidence: number;
  items: AllwainScanDocumentItem[];
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

export interface AllwainScanRequest {
  id: string;
  userId: string;
  sourceType: AllwainScanSourceType;
  status: AllwainScanRequestStatus;
  visibility?: "public" | "internal_test";
  title: string;
  description: string;
  extracted: AllwainScanExtractedFields;
  product?: Product | null;
  offers: Offer[];
  selectedOfferId?: string | null;
  selectedAt?: string | null;
  closedAt?: string | null;
  category?: string | null;
  subcategory?: string | null;
  productKind?: string | null;
  unit?: string | null;
  currency?: string | null;
  locationLabel?: string | null;
  locationLatApprox?: number | null;
  locationLngApprox?: number | null;
  imageMeta?: {
    hasImage: boolean;
    bytesApprox?: number | null;
    mimeType?: string | null;
    url?: string | null;
    key?: string | null;
    source?: "original" | "captured" | "illustrative" | "category";
    illustrative?: boolean;
    alt?: string | null;
    assignedAt?: string | null;
  } | null;
  publicationReviewId?: string | null;
  qualityDecision?: "approve" | "improve" | "block" | null;
  qualityScore?: number | null;
  qualityReviewedAt?: string | null;
  paymentGuaranteeStatus?:
    | "not_started"
    | "setup_pending"
    | "ready"
    | "failed";
  paymentGuaranteeConsentVersion?: string | null;
  paymentGuaranteeAcceptedAt?: string | null;
  paymentGuaranteeEvidenceHash?: string | null;
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
  createdAt: string;
  updatedAt: string;
}

/* =========================
   ORDER GROUPS (ALLWAIN)
========================= */

export interface OrderGroupParticipant {
  userId: string;
  units: number;
}

export interface OrderGroup {
  id: string;
  productId: string;
  totalUnits: number;
  minUnitsPerClient: number;
  status: "open" | "closed";
  participants: OrderGroupParticipant[];
}

/* =========================
   SAVINGS + REFERRALS (ALLWAIN)
========================= */

export interface AllwainSavingTransaction {
  id: string;
  userId: string;
  amount: number;
  createdAt: string;
}

export interface ReferralStat {
  id: string;
  userId: string; // sponsor user id
  invitedUserId: string;
  totalSavedByInvited: number;
  commissionEarned: number;
  monthlyHistory: any[];
}

/* =========================
   LEADS
========================= */

export type LeadGlobalSourceApp = "trueqia" | "allwain" | "web";
export type LeadGlobalStatus = "new" | "contacted" | "qualified" | "lost" | "won";

export interface Lead {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  source: string;
  message?: string | null;
  offerId?: string | null;
  userId?: string | null;
  status: string;
  createdAt?: string;
  notes?: string | null;
}

export interface LeadGlobal {
  id: string;
  createdAt: string;
  channel: "whatsapp" | "web" | "app";
  sourceApp: LeadGlobalSourceApp;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  message: string;
  status: LeadGlobalStatus;
  meta?: Record<string, unknown> | null;
}

/* =========================
   CONTRACTS
========================= */

export type TrueqiaContractTemplateId =
  | "trueqia-trade-standard"
  | "trueqia-professional-services"
  | "trueqia-content-rights"
  | "trueqia-creative-collaboration";

export interface Contract {
  id: string;
  app: "trueqia" | "allwain";
  type: string;
  status: string;
  version?: number;
  replacesId?: string | null;
  offerId?: string | null;
  requestId?: string | null;
  shoppingListId?: string | null;
  acceptedProposalRevisionId?: string | null;
  purchaseKey?: string | null;
  tradeId?: string | null;
  requesterUserId?: string | null;
  providerUserId?: string | null;
  offerTitle?: string | null;
  requesterName?: string | null;
  providerName?: string | null;
  tokens?: number | null;
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
  deliveryChannel?: AllwainDeliveryChannel | null;
  deliveryAddress?: Record<string, unknown> | null;
  deliveryNotes?: string | null;
  deliveryPricingSnapshot?: Record<string, unknown> | null;
  deliveryWindow?: StructuredDeliveryWindow | null;
  recurringOrder?: StructuredRecurringOrder | null;
  notes?: string | null;
  description?: string | null;
  templateId?: string | null;
  templateVersion?: string | null;
  requesterAcceptedAt?: string | null;
  providerAcceptedAt?: string | null;
  basePdfId?: string | null;
  generatedText?: string | null;
  operationalArchivedAt?: string | null;
  operationalArchiveReason?: string | null;
  operationalArchiveBatch?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DemoContractInput {
  offerTitle: string;
  requesterName: string;
  providerName: string;
  tokens: number;
  offerId?: string | null;
  tradeId?: string | null;
  requesterUserId?: string | null;
  providerUserId?: string | null;
  notes?: string | null;
  description?: string | null;
  templateId?: string | null;
}
