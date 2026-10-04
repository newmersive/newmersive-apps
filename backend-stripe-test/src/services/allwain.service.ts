import { createHash, randomUUID } from "crypto";
import { allwainAttemptHasFinancialRisk, allwainSelectionClosureMeta, planAllwainRequestRecovery } from "./allwain-request-recovery";
import { discoveryPage, matchesDiscovery, matchesResponse, validateDiscovery, allwainAgreementStatusFilters, type AllwainDiscoveryInput } from "./allwain-discovery";
import { buyerRequestPendingSummary, normalizeRequestProposalPage, requestProposalPage, requestProposalSummary, type RequestProposalPageInput } from "./allwain-request-work";
import {
  Offer,
  Product,
  OrderGroup,
  AllwainSavingTransaction,
  ReferralStat,
  UserRole,
  AllwainScanRequest,
  AllwainScanExtractedFields,
  AllwainScanRequestStatus,
  AllwainScanSourceType,
  AllwainDeliveryChannel,
  Contract,
  Lead,
} from "../shared/types";
import { ENV, allwainPublicationCardRequired } from "../config/env";
import { getPrisma } from "../db/prisma";
import {
  getProducts,
  getProductByEAN,
  getOffersByOwner,
  getOfferById,
  addOffer,
  updateOffer,
  getOrderGroups,
  addOrderGroup,
  updateOrderGroup,
  getUserById,
  upsertUser,
  addSaving,
  addReferralStat,
  getReferralStatsByUser,
  addAllwainScanRequest,
  getAllwainScanRequests,
  updateAllwainScanRequest as saveAllwainScanRequest,
  addLead,
  createContract,
  getContracts,
  getContractById,
  updateContractAcceptance,
  updateContractStatus,
  updateContractDetails,
} from "./data.store";
import {
  scanProductImage,
  ScanProvider,
  type ScanResult,
} from "./scan.service";
import { validateImageDataUrl } from "../security/image-data-url";
import {
  getUserByIdPg,
  upsertUserPg,
  getOfferByIdPg,
  addLeadPg,
  createContractPg,
  getAllwainContractPagePg,
  getContractsPg,
  getContractByIdPg,
  getContractByPurchaseKeyPg,
  updateContractAcceptancePg,
  updateContractStatusPg,
} from "./data.store.pg";
import {
  getAllwainSellerCommercialModel,
  isAllwainSellerEnabled,
} from "./allwain-participation.service";
import {
  getRandomProductPg,
  getProductByEANPg,
  getAllwainProductMatchCandidatesPg,
  getAllwainOffersPg,
  getAllwainOfferPagePg,
  getAllwainOfferProviderSummariesPg,
  getAllwainSellerIdsMatchingPg,
  getAllwainCatalogCommittedOfferIdsPg,
  type AllwainOfferPageInput,
  getAllwainOffersForRequestPg,
  getAllwainBuyerRequestPendingSummaryPg,
  getAllwainRequestProposalSummaryPg,
  getAllwainRequestProposalPagePg,
  addAllwainOfferPg,
  createAllwainAgreementWithStockPg,
  updateAllwainOfferInventoryPg,
  updateAllwainOfferDetailsPg,
  withdrawAllwainProposalPg,
  acceptAllwainContractWithInventoryPg,
  rejectAllwainContractWithInventoryPg,
  getOrderGroupsPg,
  createOrderGroupPg,
  updateOrderGroupPg,
  addSavingPg,
  addReferralStatPg,
  getReferralStatsByUserPg,
  addAllwainScanRequestPg,
  addAllwainScanRequestIfAbsentPg,
  getAllwainScanRequestsPg,
  getAllwainScanRequestByIdPg,
  updateAllwainScanRequestPg,
  transitionAllwainScanRequestPg,
  getAllwainScanRequestPagePg,
  getAllwainProposalSummariesPg,
  getAllwainProposalBySellerPg,
  upsertAllwainRequestProposalPg,
  type AllwainRequestPageInput,
} from "./data.store.allwain.pg";
import { buildTextPdf } from "./pdf.service";
import {
  assertAllwainProductCompliancePublishable,
  normalizeAllwainProductComplianceInput,
} from "./allwain-compliance.service";
import { appendAllwainAuditEvent } from "./allwain-audit";
import {
  commitAllwainStock,
  normalizeAllwainInventoryMeta,
  readAllwainInventory,
  isAllwainOfferArchived,
  releaseAllwainOfferStock,
  reserveAllwainStock,
  updateAllwainInventoryLimits,
  validateAllwainOrderQuantity,
} from "./allwain-inventory";
import {
  allwainOfferCheckoutDisabled,
  allwainPaymentsConfigured,
  calculateAllwainDeliveryAllocation,
  calculateAllwainMoney,
  calculateAllwainSavingsMoney,
  getAllwainDeliveryPricingConfig,
  type AllwainDeliveryAllocation,
} from "./allwain-money";
import {
  assertAllwainProposalActive,
  normalizeAllwainProposalExpiry,
} from "./allwain-proposals";
import { getAllwainReputationSummary } from "./allwain-reputation.service";
import { applyAllwainProductIntelligence } from "./allwain-product-intelligence";
import { normalizeAllwainPreorderChargeDeadline } from "./allwain-preorders";
import {
  assertAllwainPublicationCanProceed,
  attachAllwainPublicationReviewEntity,
  resolveAllwainPublicationReview,
  reviewAllwainPublication,
  type AllwainPublicationDraft,
} from "./allwain-publication-quality.service";
import {
  validateAllwainCarrierQuoteForAgreement,
  type ValidatedAllwainCarrierQuote,
} from "./allwain-shipping.service";
import {
  allwainIllustrativeCardImageMeta,
  allwainOfferCardImageMeta,
  ensureAllwainImageMeta,
  ensureAllwainOfferImage,
  ensureAllwainRequestImageMeta,
  publicRequestCardImageMeta,
  refreshAllwainIllustrativeImageMeta,
  storeAllwainCapturedCardImage,
  type AllwainCardImageSource,
} from "./allwain-card-images.service";
import { notifyAllwainUser } from "./allwain-notifications.service";
import { createAllwainOcrShoppingListDraft } from "./allwain-evidence.service";
import { normalizeAllwainPurchaseDetails } from "./allwain-purchase-details";
import { isCatalogOffer, isPublicCatalogOffer } from "./allwain-publication-policy";
import {
  allwainCatalogEditPatch,
  allwainProposalAggregate,
  assertAllwainOfferVersion,
  type AllwainOfferEditInput,
} from "./allwain-offer-lifecycle";

const ALLOWED_ROLES: UserRole[] = ["user", "buyer", "company", "admin"];
const normalizeRole = (role: any): UserRole =>
  ALLOWED_ROLES.includes(role) ? role : "user";
const usePostgres = () => ENV.STORAGE_DRIVER === "postgres";
const SCAN_STATUSES: AllwainScanRequestStatus[] = [
  "draft",
  "ready",
  "submitted",
  "awarded",
  "closed",
  "canceled",
  "archived",
];

function scanPublicationDraft(
  request: Pick<AllwainScanRequest, "extracted" | "description">,
): AllwainPublicationDraft {
  return {
    entityType: "request",
    title: request.extracted.productName,
    description:
      request.extracted.rawText ||
      request.description ||
      request.extracted.productName,
    category: request.extracted.category,
    productKind: request.extracted.productKind,
    quantity: request.extracted.quantity,
    unit: request.extracted.unit,
    price: request.extracted.targetPrice,
    currency: request.extracted.currency,
    deliveryWindow: request.extracted.deliveryWindow,
    locationLabel:
      request.extracted.locationLabel || request.extracted.deliveryAddress,
    attributes: request.extracted.attributes,
  };
}

async function getAllwainOfferById(offerId: string) {
  const offer = usePostgres()
    ? await getOfferByIdPg(offerId)
    : getOfferById(offerId);
  return offer?.owner === "allwain" ? (offer as Offer) : null;
}

async function getAllwainUserById(userId: string) {
  return usePostgres() ? getUserByIdPg(userId) : getUserById(userId);
}

async function enrichAllwainOffer(offer: Offer) {
  const offerWithImage = ensureAllwainOfferImage(offer);
  const [provider, reputation] = await Promise.all([
    getAllwainUserById(offerWithImage.ownerUserId),
    usePostgres()
      ? getAllwainReputationSummary(offerWithImage.ownerUserId, 0).catch(() => null)
      : Promise.resolve(null),
  ]);
  return {
    ...offerWithImage,
    updatedAt: offerWithImage.updatedAt || offerWithImage.createdAt,
    meta: {
      ...(offerWithImage.meta || {}),
      deliveryPricing: getAllwainDeliveryPricingConfig(),
    },
    provider: {
      id: provider?.id || offerWithImage.ownerUserId,
      name: provider?.name || "Proveedor",
      score: reputation?.score || 0,
      reviewCount: reputation?.reviewCount || 0,
      completedOrders: reputation?.completedOrders || 0,
    },
  };
}

async function getAllwainContracts() {
  return usePostgres() ? getContractsPg() : getContracts();
}

async function getAllwainContractById(contractId: string) {
  return usePostgres()
    ? getContractByIdPg(contractId)
    : getContractById(contractId);
}

async function enrichAllwainContractsWithImages<T extends Contract>(
  contracts: T[],
) {
  const offerIds = Array.from(
    new Set(
      contracts
        .map((contract) => contract.offerId)
        .filter((offerId): offerId is string => Boolean(offerId)),
    ),
  );
  const offers = usePostgres()
    ? offerIds.length
      ? await (getPrisma() as any).offer.findMany({
          where: { id: { in: offerIds }, owner: "allwain" },
        })
      : []
    : offerIds
        .map((offerId) => getOfferById(offerId))
        .filter((offer): offer is Offer => offer?.owner === "allwain");
  const offerById = new Map<string, Offer>(
    offers.map((offer: Offer) => [offer.id, offer]),
  );

  return contracts.map((contract) => {
    const offer = contract.offerId
      ? offerById.get(contract.offerId)
      : undefined;
    return {
      ...contract,
      imageMeta: offer
        ? allwainOfferCardImageMeta(offer)
        : allwainIllustrativeCardImageMeta({
            title: contract.offerTitle || "Pedido Allwain",
            description: contract.description,
          }, contract.createdAt),
    };
  });
}

async function saveAllwainContract(contract: Contract) {
  return usePostgres() ? createContractPg(contract) : createContract(contract);
}

async function updateAllwainContractAcceptance(
  contractId: string,
  patch: Pick<Contract, "status"> &
    Partial<Pick<Contract, "requesterAcceptedAt" | "providerAcceptedAt">>,
) {
  return usePostgres()
    ? updateContractAcceptancePg(contractId, patch)
    : updateContractAcceptance(contractId, patch);
}

async function updateAllwainContractStatus(contractId: string, status: string) {
  return usePostgres()
    ? updateContractStatusPg(contractId, status)
    : updateContractStatus(contractId, status);
}

function isAllwainContractParticipant(contract: Contract, userId: string) {
  return (
    contract.requesterUserId === userId || contract.providerUserId === userId
  );
}

function nextAllwainContractAcceptance(contract: Contract, userId: string) {
  const isRequester = contract.requesterUserId === userId;
  const isProvider = contract.providerUserId === userId;
  if (!isRequester && !isProvider) throw new Error("CONTRACT_NOT_FOUND");

  const acceptedAt = new Date().toISOString();
  const requesterAcceptedAt =
    contract.requesterAcceptedAt || (isRequester ? acceptedAt : null);
  const providerAcceptedAt =
    contract.providerAcceptedAt || (isProvider ? acceptedAt : null);

  return {
    requesterAcceptedAt,
    providerAcceptedAt,
    status:
      requesterAcceptedAt && providerAcceptedAt
        ? "accepted"
        : "partially_accepted",
  };
}

export interface AllwainOrderDeliveryInput {
  buyerCapacity?: "consumer" | "business";
  deliveryMethod?: "shipping" | "pickup" | "in_person";
  deliveryChannel?: AllwainDeliveryChannel;
  deliveryAddress?: string | null;
  deliveryPostalCode?: string | null;
  deliveryCity?: string | null;
  deliveryCountryCode?: string | null;
  deliveryPhone?: string | null;
  deliveryRecipientName?: string | null;
  deliveryEmail?: string | null;
  deliveryUnit?: string | null;
  deliveryDetailsConfirmed?: boolean;
  saveDeliveryDetails?: boolean;
  carrierQuoteId?: string | null;
  deliveryNotes?: string | null;
  deliveryWindow?: Contract["deliveryWindow"] | null;
  recurringOrder?: Contract["recurringOrder"] | null;
  deliveryLatitude?: number | null;
  deliveryLongitude?: number | null;
  purchaseKey?: string | null;
}

interface NormalizedAllwainOrderDelivery {
  recipientDetails: ReturnType<typeof normalizeAllwainPurchaseDetails>;
  buyerCapacity: "consumer" | "business";
  deliveryMethod: "shipping" | "pickup" | "in_person";
  deliveryChannel: AllwainDeliveryChannel;
  deliveryAddress: string | null;
  deliveryPostalCode: string | null;
  deliveryCity: string | null;
  deliveryCountryCode: string | null;
  deliveryPhone: string | null;
  carrierQuoteId: string | null;
  deliveryNotes: string | null;
  deliveryWindow: Contract["deliveryWindow"] | null;
  recurringOrder: Contract["recurringOrder"] | null;
  deliveryLatApprox: number | null;
  deliveryLngApprox: number | null;
}

function normalizeDeliveryCoordinate(value: unknown, min: number, max: number) {
  if (value === null || value === undefined || value === "") return null;
  const coordinate = Number(value);
  if (!Number.isFinite(coordinate) || coordinate < min || coordinate > max) {
    throw new Error("INVALID_DELIVERY_LOCATION");
  }
  return Math.round(coordinate * 1_000) / 1_000;
}

function normalizeRecurringOrder(
  value: AllwainOrderDeliveryInput["recurringOrder"],
): Contract["recurringOrder"] | null {
  if (!value || typeof value !== "object" || value.enabled !== true) {
    return null;
  }
  if (!(["weekly", "biweekly", "monthly"] as const).includes(value.interval)) {
    throw new Error("INVALID_RECURRING_ORDER");
  }
  const label =
    value.interval === "weekly"
      ? "Cada semana"
      : value.interval === "biweekly"
        ? "Cada 15 días"
        : "Cada mes";
  return {
    enabled: true,
    interval: value.interval,
    label,
  };
}

function normalizeAllwainOrderDelivery(
  input: AllwainOrderDeliveryInput = {},
): NormalizedAllwainOrderDelivery {
  const buyerCapacity = input.buyerCapacity || "consumer";
  if (!(["consumer", "business"] as const).includes(buyerCapacity)) {
    throw new Error("INVALID_BUYER_CAPACITY");
  }
  const requestedChannel = input.deliveryChannel;
  if (
    requestedChannel &&
    !(["carrier", "local_connector", "seller", "pickup"] as const).includes(
      requestedChannel,
    )
  ) {
    throw new Error("INVALID_DELIVERY_CHANNEL");
  }
  const inferredChannel: AllwainDeliveryChannel =
    input.deliveryMethod === "shipping"
      ? "local_connector"
      : input.deliveryMethod === "in_person"
        ? "seller"
        : "pickup";
  const deliveryChannel = requestedChannel || inferredChannel;
  const deliveryMethod =
    deliveryChannel === "carrier" || deliveryChannel === "local_connector"
      ? "shipping"
      : deliveryChannel === "seller"
        ? "in_person"
        : "pickup";
  if (
    !(["shipping", "pickup", "in_person"] as const).includes(deliveryMethod)
  ) {
    throw new Error("INVALID_DELIVERY_METHOD");
  }
  const deliveryAddress = String(input.deliveryAddress || "").trim() || null;
  const deliveryNotes = String(input.deliveryNotes || "").trim() || null;
  const deliveryPostalCode =
    String(input.deliveryPostalCode || "").trim().toUpperCase().slice(0, 12) || null;
  const deliveryCity = String(input.deliveryCity || "").trim().slice(0, 80) || null;
  const deliveryCountryCode =
    String(input.deliveryCountryCode || "ES").trim().toUpperCase().slice(0, 2) || null;
  const deliveryPhone =
    String(input.deliveryPhone || "").trim().replace(/[^+\d]/g, "").slice(0, 20) || null;
  const carrierQuoteId = String(input.carrierQuoteId || "").trim().slice(0, 100) || null;
  const deliveryWindow =
    input.deliveryWindow && typeof input.deliveryWindow === "object"
      ? input.deliveryWindow
      : null;
  const recurringOrder = normalizeRecurringOrder(input.recurringOrder);
  const recipientDetails = normalizeAllwainPurchaseDetails(input, deliveryMethod === "pickup");
  if (deliveryAddress && deliveryAddress.length > 500) {
    throw new Error("DELIVERY_ADDRESS_TOO_LONG");
  }
  if (deliveryNotes && deliveryNotes.length > 1_000) {
    throw new Error("DELIVERY_NOTES_TOO_LONG");
  }
  if (deliveryMethod !== "pickup" && !deliveryAddress) {
    throw new Error("DELIVERY_ADDRESS_REQUIRED");
  }
  if (deliveryChannel === "carrier") {
    if (!deliveryPostalCode) throw new Error("CARRIER_POSTAL_CODE_REQUIRED");
    if (!deliveryCity) throw new Error("CARRIER_CITY_REQUIRED");
    if (!deliveryCountryCode || !/^[A-Z]{2}$/.test(deliveryCountryCode)) {
      throw new Error("INVALID_CARRIER_COUNTRY");
    }
    if (deliveryPhone && !/^\+?\d{7,18}$/.test(deliveryPhone)) {
      throw new Error("INVALID_CARRIER_PHONE");
    }
    if (!carrierQuoteId) throw new Error("CARRIER_RATE_REQUIRED");
  }
  const deliveryLatApprox = normalizeDeliveryCoordinate(
    input.deliveryLatitude,
    -90,
    90,
  );
  const deliveryLngApprox = normalizeDeliveryCoordinate(
    input.deliveryLongitude,
    -180,
    180,
  );
  if ((deliveryLatApprox === null) !== (deliveryLngApprox === null)) {
    throw new Error("INVALID_DELIVERY_LOCATION");
  }
  return {
    recipientDetails,
    buyerCapacity,
    deliveryMethod,
    deliveryChannel,
    deliveryAddress,
    deliveryPostalCode: recipientDetails?.postalCode ?? (deliveryChannel === "carrier" ? deliveryPostalCode : null),
    deliveryCity: recipientDetails?.city ?? (deliveryChannel === "carrier" ? deliveryCity : null),
    deliveryCountryCode: recipientDetails?.countryCode ?? (deliveryChannel === "carrier" ? deliveryCountryCode : null),
    deliveryPhone: recipientDetails?.phone ?? (deliveryChannel === "carrier" ? deliveryPhone : null),
    carrierQuoteId: deliveryChannel === "carrier" ? carrierQuoteId : null,
    deliveryNotes,
    deliveryWindow,
    recurringOrder,
    deliveryLatApprox: deliveryMethod === "pickup" ? null : deliveryLatApprox,
    deliveryLngApprox: deliveryMethod === "pickup" ? null : deliveryLngApprox,
  };
}

function allwainDeliveryText(delivery: NormalizedAllwainOrderDelivery) {
  if (delivery.deliveryChannel === "local_connector") {
    return `Entrega local Allwain en ${delivery.deliveryAddress}`;
  }
  if (delivery.deliveryChannel === "carrier") {
    return `Envío a ${delivery.deliveryAddress}`;
  }
  if (delivery.deliveryChannel === "seller") {
    return `Entrega personal en ${delivery.deliveryAddress}`;
  }
  return "Recogida en el punto que confirme el proveedor";
}

function allwainAgreementText(
  offer: Offer,
  requesterName: string,
  providerName: string,
  quantity: number,
  unit: string,
  delivery: NormalizedAllwainOrderDelivery,
  allocation: AllwainDeliveryAllocation | null,
  money: {
    subtotalAmount: number;
    buyerSubtotalAmount: number;
    platformFeeBps: number;
    platformFeeAmount: number;
    platformRetainedAmount: number;
    sellerAmount: number;
    commercialModel: "marketplace" | "platform_direct";
    feeBasis: "sale_amount" | "verified_savings";
    referenceAmount: number | null;
    grossSavingsAmount: number | null;
    netSavingsAmount: number | null;
  } | null,
) {
  const unitPrice =
    money
      ? `${(money.subtotalAmount / Math.max(1, quantity) / 100).toFixed(2)} EUR / ${unit}`
      : "por confirmar";
  const totalPrice = money
    ? `${((money.buyerSubtotalAmount + (allocation?.shippingAmount || 0)) / 100).toFixed(2)} EUR`
    : "por confirmar";
  return [
    "ACUERDO DE OFERTA ALLWAIN",
    "",
    `Oferta: ${offer.title}`,
    `Cliente: ${requesterName}`,
    `Proveedor: ${providerName}`,
    `Cantidad solicitada: ${quantity} ${unit}`,
    `Precio unitario: ${unitPrice}`,
    `Total del pedido: ${totalPrice}`,
    `Entrega: ${allwainDeliveryText(delivery)}`,
    ...(delivery.recipientDetails ? [
      `Destinatario: ${delivery.recipientDetails.name}`,
      `Contacto de entrega: ${delivery.recipientDetails.email} · ${delivery.recipientDetails.phone}`,
      ...(delivery.recipientDetails.unit ? [`Piso / puerta: ${delivery.recipientDetails.unit}`] : []),
    ] : []),
    ...(delivery.deliveryWindow?.label
      ? [`Preferencia de entrega: ${delivery.deliveryWindow.label}`]
      : []),
    ...(delivery.recurringOrder?.enabled
      ? [`Pedido recurrente: ${quantity} ${unit} ${delivery.recurringOrder.label.toLowerCase()}`]
      : []),
    ...(delivery.deliveryNotes
      ? [`Indicaciones: ${delivery.deliveryNotes}`]
      : []),
    ...(money
      ? [
          ...(allocation?.shippingAmount
            ? [
                `${delivery.deliveryChannel === "carrier" ? "Transporte" : "Reparto Km 0"}: ${(allocation.shippingAmount / 100).toFixed(2)} EUR`,
              ]
            : []),
          ...(money.commercialModel === "platform_direct"
            ? [
                "Vendedor legal: Allwain",
                `Importe del servicio para Allwain: ${(money.platformRetainedAmount / 100).toFixed(2)} EUR`,
              ]
            : [
                money.feeBasis === "verified_savings"
                  ? `Precio de referencia: ${((money.referenceAmount || 0) / 100).toFixed(2)} EUR`
                  : null,
                money.feeBasis === "verified_savings"
                  ? `Ahorro bruto: ${((money.grossSavingsAmount || 0) / 100).toFixed(2)} EUR`
                  : null,
                `Tarifa Allwain (${(money.platformFeeBps / 100).toFixed(2)}%${money.feeBasis === "verified_savings" ? " del ahorro" : ""}): ${(money.platformFeeAmount / 100).toFixed(2)} EUR`,
                money.feeBasis === "verified_savings"
                  ? `Ahorro final del cliente: ${((money.netSavingsAmount || 0) / 100).toFixed(2)} EUR`
                  : null,
                `Importe para el proveedor: ${(money.sellerAmount / 100).toFixed(2)} EUR`,
              ].filter(Boolean)),
        ]
      : []),
    "",
    offer.description,
    "",
    "El cliente acepta la oferta publicada con sus condiciones y stock disponible.",
    delivery.recurringOrder?.enabled
      ? "Este acuerdo registra la recurrencia solicitada. Cada entrega/cobro deberá quedar confirmada y trazada como operación propia según las condiciones aplicables."
      : "El pedido queda confirmado por ambas partes y continúa directamente al pago.",
  ].join("\n");
}

function buildAllwainOrderContract(
  offer: Offer,
  requester: { id: string; name: string },
  provider: { id: string; name: string },
  quantity: number,
  delivery: NormalizedAllwainOrderDelivery,
  purchaseKey: string | null,
  carrierQuote: ValidatedAllwainCarrierQuote | null,
): Contract {
  const inventory = readAllwainInventory(offer);
  const unitPrice = typeof offer.price === "number" ? offer.price : null;
  const requestId = offerRequestId(offer);
  const shoppingListId = offerShoppingListId(offer);
  const proposalReferenceAmount =
    typeof offer.meta?.referenceAmount === "number" &&
    Number.isSafeInteger(offer.meta.referenceAmount) &&
    offer.meta.referenceAmount > 0
      ? offer.meta.referenceAmount
      : null;
  const proposalAcceptedAmount =
    typeof offer.meta?.acceptedOfferAmount === "number" &&
    Number.isSafeInteger(offer.meta.acceptedOfferAmount) &&
    offer.meta.acceptedOfferAmount > 0
      ? offer.meta.acceptedOfferAmount
      : unitPrice === null
        ? null
        : Math.round(unitPrice * 100);
  const savingsMoney =
    (requestId || shoppingListId) &&
    proposalReferenceAmount !== null &&
    proposalAcceptedAmount !== null
      ? calculateAllwainSavingsMoney({
          referenceAmount: proposalReferenceAmount,
          acceptedOfferAmount: proposalAcceptedAmount,
          currency: offer.currency || undefined,
        })
      : null;
  const money =
    savingsMoney
      ? {
          currency: savingsMoney.currency,
          commercialModel: savingsMoney.commercialModel,
          businessOfRecord: savingsMoney.businessOfRecord,
          subtotalAmount: savingsMoney.acceptedOfferAmount,
          buyerSubtotalAmount: savingsMoney.buyerSubtotalAmount,
          platformFeeBps: savingsMoney.platformFeeBps,
          platformFeeAmount: savingsMoney.platformFeeAmount,
          platformRetainedAmount: savingsMoney.platformRetainedAmount,
          sellerAmount: savingsMoney.sellerAmount,
          feeBasis: savingsMoney.feeBasis,
          platformFeePayer: savingsMoney.platformFeePayer,
          referenceAmount: savingsMoney.referenceAmount,
          acceptedOfferAmount: savingsMoney.acceptedOfferAmount,
          grossSavingsAmount: savingsMoney.grossSavingsAmount,
          netSavingsAmount: savingsMoney.netSavingsAmount,
        }
      : unitPrice === null
      ? null
      : (() => {
          const direct = calculateAllwainMoney({
            unitPrice,
            quantity,
            commercialModel: offer.commercialModel,
          });
          return {
            ...direct,
            buyerSubtotalAmount: direct.subtotalAmount,
            feeBasis: "sale_amount" as const,
            platformFeePayer:
              direct.commercialModel === "platform_direct"
                ? ("platform" as const)
                : ("seller" as const),
            referenceAmount: null,
            acceptedOfferAmount: null,
            grossSavingsAmount: null,
            netSavingsAmount: null,
          };
        })();
  const allocation = money
    ? calculateAllwainDeliveryAllocation({
        deliveryChannel: delivery.deliveryChannel,
        subtotalAmount: money.subtotalAmount,
        platformFeeAmount: money.platformFeeAmount,
        carrierShippingAmount: carrierQuote?.amount,
      })
    : null;
  const totalAmount =
    money === null
      ? null
      : money.buyerSubtotalAmount + (allocation?.shippingAmount || 0);
  const totalPrice = totalAmount === null ? null : totalAmount / 100;
  const paymentMode =
    offer.meta?.saleMode === "preorder" ? "preorder" : "immediate";
  const preorderChargeDeadlineAt =
    paymentMode === "preorder"
      ? normalizeAllwainPreorderChargeDeadline(
          offer.meta?.preorderChargeDeadlineAt,
        ).toISOString()
      : null;
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    app: "allwain",
    type: shoppingListId
      ? "shopping_list_proposal"
      : requestId
        ? "purchase_request_proposal"
        : "purchase_offer",
    status: "accepted",
    offerId: offer.id,
    requestId,
    shoppingListId,
    purchaseKey,
    tradeId: null,
    requesterUserId: requester.id,
    providerUserId: provider.id,
    offerTitle: offer.title,
    requesterName: requester.name,
    providerName: provider.name,
    tokens: null,
    quantity,
    unit: inventory.unit,
    unitPrice,
    totalPrice,
    currency: money?.currency || null,
    subtotalAmount: money?.subtotalAmount ?? null,
    shippingAmount: allocation?.shippingAmount ?? null,
    carrierDeliveryAmount: allocation?.carrierDeliveryAmount ?? null,
    carrierQuoteId: carrierQuote?.id || null,
    platformFeeBps: money?.platformFeeBps ?? null,
    platformFeeAmount: money?.platformFeeAmount ?? null,
    platformNetFeeAmount: allocation?.platformNetFeeAmount ?? null,
    platformRetainedAmount:
      money?.commercialModel === "platform_direct"
        ? money.platformRetainedAmount
        : allocation?.platformNetFeeAmount ?? null,
    connectorFeeAmount: allocation?.connectorFeeAmount ?? null,
    connectorPlatformShareAmount:
      allocation?.connectorPlatformShareAmount ?? null,
    connectorDeliveryAmount: allocation?.connectorDeliveryAmount ?? null,
    sellerAmount: money?.sellerAmount ?? null,
    feeBasis: money?.feeBasis || "sale_amount",
    platformFeePayer: money?.platformFeePayer || "seller",
    referenceAmount: money?.referenceAmount ?? null,
    acceptedOfferAmount: money?.acceptedOfferAmount ?? null,
    grossSavingsAmount: money?.grossSavingsAmount ?? null,
    netSavingsAmount: money?.netSavingsAmount ?? null,
    commercialModel: money?.commercialModel || "marketplace",
    businessOfRecord: money?.businessOfRecord || "seller",
    buyerCapacity: delivery.buyerCapacity,
    paymentMode,
    preorderChargeDeadlineAt,
    paymentStatus: money ? "awaiting_payment" : "not_required",
    inventoryStatus: inventory.managed ? "reserved" : null,
    deliveryMethod: delivery.deliveryMethod,
    deliveryChannel: delivery.deliveryChannel,
    deliveryAddress: delivery.recipientDetails || delivery.deliveryAddress || delivery.deliveryWindow
      ? {
          formatted: delivery.deliveryAddress,
          source: "allwain_order",
          deliveryChannel: delivery.deliveryChannel,
          locationLatApprox: delivery.deliveryLatApprox,
          locationLngApprox: delivery.deliveryLngApprox,
          deliveryWindow: delivery.deliveryWindow,
          recurringOrder: delivery.recurringOrder,
          postalCode: delivery.deliveryPostalCode,
          city: delivery.deliveryCity,
          countryCode: delivery.deliveryCountryCode,
          phone: delivery.deliveryPhone,
          ...(delivery.recipientDetails || {}),
        }
      : null,
    deliveryNotes: delivery.deliveryNotes,
    deliveryPricingSnapshot: allocation
      ? {
          version: "allwain-delivery-pricing-v2",
          channel: delivery.deliveryChannel,
          currency: money?.currency || ENV.ALLWAIN_CURRENCY,
          shippingAmount: allocation.shippingAmount,
          carrierDeliveryAmount: allocation.carrierDeliveryAmount,
          connectorPlatformShareAmount:
            allocation.connectorPlatformShareAmount,
          connectorDeliveryAmount: allocation.connectorDeliveryAmount,
          connectorFeeAmount: allocation.connectorFeeAmount,
          platformNetFeeAmount: allocation.platformNetFeeAmount,
          carrierQuoteId: carrierQuote?.id || null,
          carrierProvider: carrierQuote?.provider || null,
          carrierName: carrierQuote?.carrierName || null,
          carrierServiceName: carrierQuote?.serviceName || null,
          carrierShippingOptionCode: carrierQuote?.shippingOptionCode || null,
          carrierQuoteExpiresAt: carrierQuote?.expiresAt.toISOString() || null,
        }
      : null,
    notes:
      unitPrice === null
        ? `Cantidad: ${quantity} ${inventory.unit} · ${allwainDeliveryText(delivery)}${delivery.deliveryWindow?.label ? ` · ${delivery.deliveryWindow.label}` : ""}${delivery.recurringOrder?.enabled ? ` · ${delivery.recurringOrder.label}` : ""}`
        : `Pedido: ${quantity} ${inventory.unit} · ${unitPrice.toFixed(2)} EUR/${inventory.unit} · Total ${totalPrice?.toFixed(2)} EUR · ${allwainDeliveryText(delivery)}${delivery.deliveryWindow?.label ? ` · ${delivery.deliveryWindow.label}` : ""}${delivery.recurringOrder?.enabled ? ` · ${delivery.recurringOrder.label}` : ""}`,
    description: offer.description,
    templateId: "allwain-offer-standard",
    templateVersion: "1.4.0",
    requesterAcceptedAt: now,
    providerAcceptedAt: now,
    generatedText: allwainAgreementText(
      offer,
      requester.name,
      provider.name,
      quantity,
      inventory.unit,
      delivery,
      allocation,
      money,
    ),
    createdAt: now,
    updatedAt: now,
  };
}

export interface UpdateAllwainScanRequestInput {
  status?: AllwainScanRequestStatus;
  extracted?: Partial<AllwainScanExtractedFields>;
}

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
    labels: Array<{ name: string; confidence: number }>;
    objects: Array<{ name: string; confidence: number }>;
  };
  summary: string;
  warnings: string[];
}

function toNullableString(value: unknown) {
  if (typeof value !== "string") return value === null ? null : undefined;
  const clean = value.trim();
  return clean ? clean : null;
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCurrency(value: unknown, fallback = "EUR") {
  const currency = String(value || fallback).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("INVALID_CURRENCY");
  return currency;
}

function normalizeCoordinate(
  value: unknown,
  current: number | null | undefined,
  min: number,
  max: number,
) {
  if (value === undefined) return current ?? null;
  const coordinate = toNullableNumber(value);
  if (coordinate === null) return null;
  if (coordinate < min || coordinate > max) {
    throw new Error("INVALID_LOCATION");
  }
  return coordinate;
}

function buildScanCopy(extracted: AllwainScanExtractedFields) {
  const productName = extracted.productName || "Peticion Allwain";
  const quantityText = extracted.quantity
    ? `${extracted.quantity}${extracted.unit ? ` ${extracted.unit}` : ""}`
    : "cantidad pendiente";
  const priceText = extracted.targetPrice
    ? `, precio objetivo ${extracted.targetPrice} ${extracted.currency || "EUR"}`
    : "";
  const deliveryText = extracted.deliveryWindow
    ? `, entrega ${extracted.deliveryWindow}`
    : "";

  return {
    title: `Buscar ${productName}`,
    description: `Solicitud generada desde escaneo: ${quantityText}${priceText}${deliveryText}.`,
  };
}

function readLiveVisionSignals(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const name =
        typeof (item as any).name === "string" ? (item as any).name.trim() : "";
      const confidence =
        typeof (item as any).confidence === "number" &&
        Number.isFinite((item as any).confidence)
          ? Math.max(0, Math.min(1, (item as any).confidence))
          : 0;
      return name ? { name, confidence } : null;
    })
    .filter((item): item is { name: string; confidence: number } =>
      Boolean(item),
    )
    .slice(0, 8);
}

function liveScanMetrics(
  extracted: AllwainScanExtractedFields,
  rawData: Record<string, unknown>,
  barcode?: string,
) {
  const fields: Array<[string, boolean, number]> = [
    ["Producto", Boolean(extracted.productName), 22],
    ["Código", Boolean(extracted.ean || barcode), 20],
    ["Marca", Boolean(extracted.brand), 8],
    ["Categoría", Boolean(extracted.category), 8],
    ["Cantidad", Boolean(extracted.quantity), 12],
    ["Formato", Boolean(extracted.unit), 7],
    ["Proveedor", Boolean(extracted.supplier), 8],
    ["Precio", Boolean(extracted.targetPrice), 8],
  ];
  const detectedFields = fields
    .filter(([, detected]) => detected)
    .map(([label]) => label);
  const textCharacters = extracted.rawText?.length || 0;
  const fieldScore =
    fields.reduce(
      (total, [, detected, weight]) => total + (detected ? weight : 0),
      0,
    ) + (textCharacters >= 12 ? 7 : 0);
  const textScore = Math.min(100, Math.round((textCharacters / 120) * 100));
  const labels = readLiveVisionSignals(rawData.visualLabels);
  const objects = readLiveVisionSignals(rawData.detectedObjects);
  const visualScore = Math.round(
    Math.max(
      0,
      ...labels.map((item) => item.confidence),
      ...objects.map((item) => item.confidence),
    ) * 100,
  );
  const calculatedProgress = Math.max(
    barcode || textCharacters || labels.length || objects.length ? 4 : 0,
    Math.min(
      96,
      Math.round(fieldScore * 0.68 + textScore * 0.18 + visualScore * 0.14),
    ),
  );
  const visualIdentityProgress =
    extracted.productName && visualScore >= 62
      ? Math.min(88, Math.round(visualScore * 0.72))
      : 0;
  const readingProgress = Math.max(calculatedProgress, visualIdentityProgress);
  const confidence = Math.min(
    99,
    Math.round(Math.max(extracted.confidence * 100, visualScore * 0.85)),
  );
  const hasStrongVisualSignal = [...objects, ...labels].some(
    (item) => item.confidence >= 0.62,
  );
  const ready =
    Boolean(extracted.productName || extracted.ean || barcode || hasStrongVisualSignal) &&
    Boolean(textCharacters >= 12 || extracted.ean || barcode || hasStrongVisualSignal) &&
    readingProgress >= 40;

  return {
    readingProgress,
    confidence,
    ready,
    detectedFields,
    textCharacters,
    labels,
    objects,
  };
}

function mergeExtractedFields(
  current: AllwainScanExtractedFields,
  patch?: Partial<AllwainScanExtractedFields>,
): AllwainScanExtractedFields {
  if (!patch) return current;

  return {
    ...current,
    productName:
      patch.productName !== undefined
        ? (toNullableString(patch.productName) ?? null)
        : (current.productName ?? null),
    brand:
      patch.brand !== undefined
        ? (toNullableString(patch.brand) ?? null)
        : (current.brand ?? null),
    category:
      patch.category !== undefined
        ? (toNullableString(patch.category) ?? null)
        : (current.category ?? null),
    subcategory:
      patch.subcategory !== undefined
        ? (toNullableString(patch.subcategory) ?? null)
        : (current.subcategory ?? null),
    ean:
      patch.ean !== undefined
        ? (toNullableString(patch.ean) ?? null)
        : (current.ean ?? null),
    sku:
      patch.sku !== undefined
        ? (toNullableString(patch.sku) ?? null)
        : (current.sku ?? null),
    supplier:
      patch.supplier !== undefined
        ? (toNullableString(patch.supplier) ?? null)
        : (current.supplier ?? null),
    quantity:
      patch.quantity !== undefined
        ? toNullableNumber(patch.quantity)
        : (current.quantity ?? null),
    unit:
      patch.unit !== undefined
        ? (toNullableString(patch.unit) ?? null)
        : (current.unit ?? null),
    targetPrice:
      patch.targetPrice !== undefined
        ? toNullableNumber(patch.targetPrice)
        : (current.targetPrice ?? null),
    currency:
      patch.currency !== undefined
        ? normalizeCurrency(patch.currency)
        : normalizeCurrency(current.currency),
    deliveryWindow:
      patch.deliveryWindow !== undefined
        ? (toNullableString(patch.deliveryWindow) ?? null)
        : (current.deliveryWindow ?? null),
    deliveryMethod:
      patch.deliveryMethod === "shipping" ||
      patch.deliveryMethod === "pickup" ||
      patch.deliveryMethod === "in_person"
        ? patch.deliveryMethod
        : patch.deliveryMethod === null
          ? null
          : (current.deliveryMethod ?? null),
    deliveryChannel:
      patch.deliveryChannel === "carrier" ||
      patch.deliveryChannel === "local_connector" ||
      patch.deliveryChannel === "seller" ||
      patch.deliveryChannel === "pickup"
        ? patch.deliveryChannel
        : patch.deliveryChannel === null
          ? null
          : (current.deliveryChannel ?? null),
    deliveryAddress:
      patch.deliveryAddress !== undefined
        ? (toNullableString(patch.deliveryAddress) ?? null)
        : (current.deliveryAddress ?? null),
    deliveryNotes:
      patch.deliveryNotes !== undefined
        ? (toNullableString(patch.deliveryNotes) ?? null)
        : (current.deliveryNotes ?? null),
    locationLabel:
      patch.locationLabel !== undefined
        ? (toNullableString(patch.locationLabel) ?? null)
        : (current.locationLabel ?? null),
    locationLatApprox: normalizeCoordinate(
      patch.locationLatApprox,
      current.locationLatApprox,
      -90,
      90,
    ),
    locationLngApprox: normalizeCoordinate(
      patch.locationLngApprox,
      current.locationLngApprox,
      -180,
      180,
    ),
    productKind:
      patch.productKind !== undefined
        ? patch.productKind
        : (current.productKind ?? null),
    measurement:
      patch.measurement !== undefined
        ? patch.measurement
        : (current.measurement ?? null),
    attributes:
      patch.attributes !== undefined
        ? patch.attributes
        : (current.attributes || []),
    rawText:
      patch.rawText !== undefined
        ? (toNullableString(patch.rawText) ?? null)
        : (current.rawText ?? null),
    confidence:
      typeof patch.confidence === "number" && Number.isFinite(patch.confidence)
        ? Math.max(0, Math.min(1, patch.confidence))
        : current.confidence,
    notes: Array.isArray(patch.notes)
      ? patch.notes.filter((note) => typeof note === "string")
      : current.notes,
  };
}

function missingScanSheetFields(extracted: AllwainScanExtractedFields) {
  const missing: string[] = [];
  if (!extracted.productName?.trim()) missing.push("productName");
  if (!extracted.quantity || extracted.quantity <= 0) missing.push("quantity");
  if (!extracted.unit?.trim()) missing.push("unit");
  if (!extracted.deliveryWindow?.trim()) missing.push("deliveryWindow");
  if (!extracted.deliveryMethod) missing.push("deliveryMethod");
  if (!extracted.deliveryAddress?.trim()) missing.push("deliveryAddress");
  if (
    extracted.targetPrice !== null &&
    extracted.targetPrice !== undefined &&
    extracted.targetPrice <= 0
  ) {
    missing.push("targetPrice");
  }
  return missing;
}

function normalizeMatchValue(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchTokens(value?: string | null) {
  return new Set(
    normalizeMatchValue(value)
      .split(" ")
      .filter(
        (token) =>
          token.length >= 3 && !["para", "producto", "buscar"].includes(token),
      ),
  );
}

function productMatchScore(
  extracted: AllwainScanExtractedFields,
  product: Product,
) {
  const requestEan = normalizeMatchValue(extracted.ean);
  const productEan = normalizeMatchValue(product.ean);
  if (requestEan && productEan && requestEan === productEan) return 100;

  let score = 0;
  const requestName = normalizeMatchValue(extracted.productName);
  const productName = normalizeMatchValue(product.name);
  if (
    requestName &&
    productName &&
    (requestName.includes(productName) || productName.includes(requestName))
  ) {
    score += 6;
  }

  const requestWords = matchTokens(extracted.productName);
  const productWords = matchTokens(product.name);
  for (const word of requestWords) {
    if (productWords.has(word)) score += 4;
  }

  if (
    normalizeMatchValue(extracted.category) &&
    normalizeMatchValue(extracted.category) ===
      normalizeMatchValue(product.category)
  ) {
    score += 3;
  }
  if (
    normalizeMatchValue(extracted.brand) &&
    normalizeMatchValue(extracted.brand) === normalizeMatchValue(product.brand)
  ) {
    score += 2;
  }
  return score;
}

async function matchAllwainRequest(
  userId: string,
  extracted: AllwainScanExtractedFields,
  requestId?: string,
) {
  const products = usePostgres()
    ? await getAllwainProductMatchCandidatesPg({
        productName: extracted.productName,
        ean: extracted.ean,
        category: extracted.category,
        brand: extracted.brand,
        limit: 50,
      })
    : getProducts();
  const ranked = (products as Product[])
    .map((product) => ({
      product,
      score: productMatchScore(extracted, product),
    }))
    .sort((a, b) => b.score - a.score);
  const product = ranked[0]?.score >= 3 ? ranked[0].product : null;
  let allOffers: Offer[];
  if (usePostgres()) {
    if (requestId) {
      allOffers = await getAllwainOffersForRequestPg(requestId);
    } else {
      const candidates = new Map<string, Offer>();
      const query = String(product?.name || extracted.productName || "").trim();
      const categoryQuery = String(extracted.category || "").trim();
      if (query) {
        const page = await getAllwainOfferPagePg({
          limit: 50,
          query,
          excludeOwnerUserId: userId,
        });
        for (const offer of page.items) candidates.set(offer.id, offer);
      }
      if (categoryQuery) {
        const page = await getAllwainOfferPagePg({
          limit: 50,
          category: categoryQuery,
          excludeOwnerUserId: userId,
        });
        for (const offer of page.items) candidates.set(offer.id, offer);
      }
      allOffers = [...candidates.values()];
    }
  } else {
    allOffers = getOffersByOwner("allwain");
  }
  const category = normalizeMatchValue(extracted.category);
  const owners = requestId ? null : new Map(
    await Promise.all(
      [...new Set(allOffers.map((offer) => offer.ownerUserId))].map(
        async (ownerId) => [ownerId, await getAllwainUserById(ownerId)] as const,
      ),
    ),
  );
  const matchedOffers = (allOffers as Offer[]).filter((offer) => {
    if (offer.ownerUserId === userId) return false;
    if (requestId) {
      if (offerRequestId(offer) !== requestId) return false;
      try {
        assertAllwainProposalActive(
          offer.proposalExpiresAt ||
            (typeof offer.meta?.validUntil === "string"
              ? offer.meta.validUntil
              : null),
        );
        return true;
      } catch {
        return false;
      }
    }
    if (!isPublicCatalogOffer(offer, owners?.get(offer.ownerUserId) || null)) return false;
    if (product && offer.productId === product.id) return true;
    if (offer.productId) return false;
    return Boolean(
      category &&
      normalizeMatchValue(String(offer.meta?.category || "")) === category,
    );
  });
  const offers = await Promise.all(matchedOffers.map(enrichAllwainOffer));

  return { product, offers };
}

async function findAllwainScanRequest(userId: string, requestId: string) {
  if (usePostgres()) {
    return getAllwainScanRequestByIdPg(requestId, userId);
  }
  const items = getAllwainScanRequests(userId);
  return items.find((item) => item.id === requestId) || null;
}

async function findAllwainScanRequestById(requestId: string) {
  if (usePostgres()) return getAllwainScanRequestByIdPg(requestId);
  return getAllwainScanRequests().find((item) => item.id === requestId) || null;
}

function enrichAllwainRequestImage(request: AllwainScanRequest) {
  return {
    ...request,
    imageMeta: ensureAllwainRequestImageMeta(
      request.imageMeta as Record<string, unknown> | null,
      request.extracted,
      request.title,
    ),
  };
}

async function persistAllwainScanRequest(item: AllwainScanRequest) {
  return usePostgres()
    ? updateAllwainScanRequestPg(item)
    : saveAllwainScanRequest(item);
}

async function refreshSubmittedScanRequest(item: AllwainScanRequest) {
  if (item.status !== "submitted") return item;
  const matched = await matchAllwainRequest(
    item.userId,
    item.extracted,
    item.id,
  );
  const currentOfferIds = item.offers
    .map((offer) => offer.id)
    .sort()
    .join(",");
  const matchedOfferIds = matched.offers
    .map((offer) => offer.id)
    .sort()
    .join(",");
  if (
    item.product?.id === matched.product?.id &&
    currentOfferIds === matchedOfferIds
  ) {
    return item;
  }

  const refreshed: AllwainScanRequest = {
    ...item,
    product: matched.product,
    offers: matched.offers,
    imageMeta: ensureAllwainRequestImageMeta(
      item.imageMeta as Record<string, unknown> | null,
      item.extracted,
      item.title,
    ),
    ai: {
      ...item.ai,
      rawData: {
        ...(item.ai.rawData || {}),
        matchesRefreshedAt: new Date().toISOString(),
        matchedProductId: matched.product?.id || null,
        matchedOfferCount: matched.offers.length,
      },
    },
    updatedAt: new Date().toISOString(),
  };
  return (await persistAllwainScanRequest(refreshed)) || refreshed;
}

/* =========================
   SCAN DEMO
========================= */

export async function scanDemoProduct(ean?: string) {
  const product = usePostgres()
    ? ean
      ? await getProductByEANPg(ean)
      : await getRandomProductPg()
    : ean
      ? getProductByEAN(ean)
      : (getProducts()[Math.floor(Math.random() * getProducts().length)] ??
        null);

  if (!product) {
    return { product: null, offers: [] };
  }

  const candidates = (
    usePostgres() ? await getAllwainOffersPg() : getOffersByOwner("allwain")
  ).filter((o) => o.productId === product.id);
  const owners = new Map(
    await Promise.all(
      [...new Set(candidates.map((offer) => offer.ownerUserId))].map(
        async (ownerId) => [ownerId, await getAllwainUserById(ownerId)] as const,
      ),
    ),
  );
  const offers = candidates.filter((offer) =>
    isPublicCatalogOffer(offer, owners.get(offer.ownerUserId) || null),
  );

  return { product, offers };
}

export async function listAllwainScanRequests(userId?: string) {
  let items: AllwainScanRequest[];
  if (usePostgres()) {
    items = await getAllwainScanRequestsPg(userId);
  } else {
    items = getAllwainScanRequests(userId).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }
  return items.map(enrichAllwainRequestImage);
}

export async function listAllwainAdminScanRequestPage(
  input: Omit<AllwainRequestPageInput, "userId" | "excludeUserId">,
) {
  const normalized = {
    ...input,
    limit: Math.min(100, Math.max(1, Math.trunc(Number(input.limit) || 30))),
    statuses: input.statuses?.filter((status) =>
      SCAN_STATUSES.includes(status as AllwainScanRequestStatus),
    ),
  };
  if (usePostgres()) {
    const page = await getAllwainScanRequestPagePg(normalized);
    return { ...page, items: page.items.map(enrichAllwainRequestImage) };
  }

  let items = (await listAllwainScanRequests()).filter((item) => {
    if (normalized.statuses?.length && !normalized.statuses.includes(item.status)) {
      return false;
    }
    if (
      normalized.query &&
      !`${item.title} ${item.description}`
        .toLowerCase()
        .includes(normalized.query.toLowerCase())
    ) {
      return false;
    }
    return true;
  });
  const start = normalized.cursor
    ? Math.max(0, items.findIndex((item) => item.id === normalized.cursor) + 1)
    : 0;
  const slice = items.slice(start, start + normalized.limit + 1);
  const hasNextPage = slice.length > normalized.limit;
  const pageItems = hasNextPage ? slice.slice(0, normalized.limit) : slice;
  return {
    items: pageItems,
    pageInfo: {
      hasNextPage,
      nextCursor: hasNextPage ? pageItems[pageItems.length - 1]?.id || null : null,
    },
  };
}

export async function listAllwainScanRequestPage(
  userId: string,
  input: Omit<AllwainRequestPageInput, "userId" | "excludeUserId">,
) {
  validateDiscovery(input);
  if (usePostgres()) {
    const page = await getAllwainScanRequestPagePg({
      ...input,
      userId,
      visibility: "public",
    });
    return { ...page, items: page.items.map(enrichAllwainRequestImage) };
  }
  let items = (await listAllwainScanRequests(userId)).filter((item) => {
    if ((item.visibility || "public") !== "public") return false;
    if (input.statuses?.length && !input.statuses.includes(item.status)) return false;
    return matchesDiscovery(item, input, item.extracted.targetPrice);
  });
  return discoveryPage(items, input, "requests", userId);
}

export async function getAllwainScanRequestForUser(
  userId: string,
  requestId: string,
  options: { includeProposals?: boolean } = {},
) {
  const request = await findAllwainScanRequest(userId, requestId);
  if (!request) throw new Error("SCAN_REQUEST_NOT_FOUND");
  const requestWithImage = enrichAllwainRequestImage(request);
  if (
    !["submitted", "awarded", "closed", "canceled", "archived"].includes(requestWithImage.status)
  ) {
    return { ...requestWithImage, offers: requestWithImage.offers.slice(0, 8) };
  }
  const work = await loadRequestProposalWork(userId, requestWithImage, { limit: 20, sort: "newest", view: "all" }, options.includeProposals !== false);
  // Older native clients locate the chosen proposal inside offers. Keep it in
  // their bounded compatibility page; modern clients use selectedOffer + pager.
  const compatibleOffers = options.includeProposals !== false && work.selectedOffer && !work.items.some(offer => offer.id === work.selectedOffer?.id)
    ? [...work.items.slice(0, 19), work.selectedOffer] : work.items;
  return { ...requestWithImage, offers: compatibleOffers, proposalSummary: work.summary, selectedOffer: work.selectedOffer, proposalPageInfo: work.pageInfo };
}

async function enrichRequestProposalsBatch(offers: Offer[]) {
  const ids = [...new Set(offers.map((offer) => offer.ownerUserId))];
  const providers = usePostgres() ? await getAllwainOfferProviderSummariesPg(ids) : new Map((await Promise.all(ids.map(async (id) => [id, await getAllwainUserById(id)] as const))).map(([id, provider]) => [id, { id, name: provider?.name || "Proveedor", score: 0, reviewCount: 0, completedOrders: 0 }]));
  return offers.map((offer) => {
    const withImage = ensureAllwainOfferImage(offer);
    return { ...withImage, updatedAt: withImage.updatedAt || withImage.createdAt, meta: { ...(withImage.meta || {}), deliveryPricing: getAllwainDeliveryPricingConfig() }, provider: providers.get(offer.ownerUserId) || { id: offer.ownerUserId, name: "Proveedor", score: 0, reviewCount: 0, completedOrders: 0 } };
  });
}

async function loadRequestProposalWork(userId: string, request: AllwainScanRequest, rawInput: RequestProposalPageInput, includePage = true) {
  const input = normalizeRequestProposalPage(rawInput);
  if (usePostgres()) {
    const [metadata, page] = await Promise.all([
      getAllwainRequestProposalSummaryPg(request.id, request.selectedOfferId),
      includePage ? getAllwainRequestProposalPagePg(userId, request.id, input) : Promise.resolve({ items: [] as Offer[], pageInfo: { hasNextPage: false, nextCursor: null } }),
    ]);
    const unique = [...new Map([...page.items, ...(metadata.selectedOffer ? [metadata.selectedOffer] : [])].map((offer) => [offer.id, offer])).values()];
    const enriched = new Map((await enrichRequestProposalsBatch(unique)).map((offer) => [offer.id, offer]));
    return { ...page, summary: metadata.summary, items: page.items.map((offer) => enriched.get(offer.id)!), selectedOffer: metadata.selectedOffer ? enriched.get(metadata.selectedOffer.id)! : null };
  }
  const offers = getOffersByOwner("allwain").filter((offer) => offerRequestId(offer) === request.id);
  // JSON storage is for local/small deployments; no per-proposal database reads.
  const selected = offers.find((offer) => offer.id === request.selectedOfferId) || null;
  const page = includePage ? requestProposalPage(offers, userId, request.id, input) : { items: [], pageInfo: { hasNextPage: false, nextCursor: null } };
  const enriched = new Map((await enrichRequestProposalsBatch([...new Map([...page.items, ...(selected ? [selected] : [])].map((offer) => [offer.id, offer])).values()])).map((offer) => [offer.id, offer]));
  return { ...page, summary: requestProposalSummary(offers), items: page.items.map((offer) => enriched.get(offer.id)!), selectedOffer: selected ? enriched.get(selected.id)! : null };
}

export async function listAllwainRequestProposalPage(userId: string, requestId: string, input: RequestProposalPageInput) {
  const request = await findAllwainScanRequest(userId, requestId);
  if (!request) throw new Error("SCAN_REQUEST_NOT_FOUND");
  return loadRequestProposalWork(userId, request, input);
}

export async function getAllwainBuyerRequestPendingSummary(userId: string, limit = 3) {
  return usePostgres() ? getAllwainBuyerRequestPendingSummaryPg(userId, limit) : buyerRequestPendingSummary(getAllwainScanRequests(userId), getOffersByOwner("allwain"), limit);
}

export async function canReadAllwainRequestImage(
  userId: string,
  requestId: string,
) {
  const [request, actor] = await Promise.all([
    findAllwainScanRequestById(requestId),
    getAllwainUserById(userId),
  ]);
  // Publication shares the request's product fields, not its source photo.
  // A capture can contain a receipt even when OCR failed to classify it.
  return Boolean(request && actor && !actor.deletedAt &&
    (!actor.status || actor.status === "active") && request.userId === userId);
}

export async function analyzeAllwainScanPreview(input: {
  sourceType?: AllwainScanSourceType;
  rawText?: string;
  imageBase64?: string;
  barcode?: string;
  provider?: ScanProvider;
}): Promise<AllwainLiveScanAnalysis> {
  const sourceType =
    input.sourceType ||
    (input.barcode ? "barcode" : input.imageBase64 ? "camera" : "text");
  const scan = await scanProductImage({ ...input, sourceType, preview: true });
  const metrics = liveScanMetrics(scan.extracted, scan.rawData, input.barcode);

  return {
    status: metrics.ready ? "ready" : "scanning",
    readingProgress: metrics.readingProgress,
    confidence: metrics.confidence,
    ready: metrics.ready,
    detectedFields: metrics.detectedFields,
    expectedFieldCount: 8,
    extracted: scan.extracted,
    signals: {
      textCharacters: metrics.textCharacters,
      barcode: scan.extracted.ean || input.barcode?.trim() || null,
      labels: metrics.labels,
      objects: metrics.objects,
    },
    summary: scan.summary,
    warnings: scan.warnings,
  };
}

async function createAllwainScanRequestFromResult(
  userId: string,
  input: {
    sourceType: AllwainScanSourceType;
    validatedImage: ReturnType<typeof validateImageDataUrl> | null;
    scan: ScanResult;
    creation?: { id: string; fingerprint: string } | null;
  },
): Promise<AllwainScanRequest> {
  const { sourceType, validatedImage, scan } = input;
  const now = new Date().toISOString();
  const scanCopy = buildScanCopy(scan.extracted);
  const aiRequestTitle =
    typeof scan.rawData.aiRequestTitle === "string"
      ? scan.rawData.aiRequestTitle.trim()
      : "";
  const aiRequestDescription =
    typeof scan.rawData.aiRequestDescription === "string"
      ? scan.rawData.aiRequestDescription.trim()
      : "";
  const scanModel =
    typeof scan.rawData.model === "string"
      ? scan.rawData.model
      : scan.provider === "mock"
        ? "heuristic-v1"
        : "google-vision-text-detection";
  const requestId = input.creation?.id || randomUUID();
  const imageMeta = validatedImage
    ? await storeAllwainCapturedCardImage(
        requestId,
        validatedImage,
        scan.extracted.productName || aiRequestTitle || "Producto fotografiado",
      )
    : ensureAllwainRequestImageMeta(
        null,
        scan.extracted,
        aiRequestTitle || scanCopy.title,
      );

  const request: AllwainScanRequest = {
    id: requestId,
    userId,
    sourceType,
    status: "draft",
    title: aiRequestTitle || scanCopy.title,
    description: aiRequestDescription || scanCopy.description,
    extracted: scan.extracted,
    product: null,
    offers: [],
    imageMeta,
    ai: {
      provider: scan.provider,
      model: scanModel,
      confidence: scan.confidence,
      summary: scan.summary,
      warnings: scan.warnings,
      rawData: {
        ...scan.rawData,
        lifecycleVersion: 2,
        ...(input.creation ? { creationFingerprint: input.creation.fingerprint } : {}),
      },
    },
    createdAt: now,
    updatedAt: now,
  };

  if (!usePostgres()) {
    // JSON storage is synchronous: check and insert without an intervening await.
    // The PostgreSQL path below uses the existing primary key as its final guard.
    const existing = input.creation && getAllwainScanRequests().find(row => row.id === requestId);
    return existing ? replayScanCreation(existing, userId, input.creation!.fingerprint) : addAllwainScanRequest(request);
  }
  if (!input.creation) return addAllwainScanRequestPg(request);
  const inserted = await addAllwainScanRequestIfAbsentPg(request);
  return inserted.created ? inserted.request : replayScanCreation(inserted.request, userId, input.creation.fingerprint);
}

function scanCreationIdentity(userId: string, input: {
  creationKey?: string; sourceType?: AllwainScanSourceType; rawText?: string;
  imageBase64?: string; barcode?: string;
}, sourceType: AllwainScanSourceType) {
  if (input.creationKey === undefined) return null;
  if (typeof input.creationKey !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.creationKey) ||
      sourceType !== "text" || input.imageBase64 || input.barcode || typeof input.rawText !== "string" || !input.rawText.trim()) {
    throw new Error("INVALID_REQUEST_CREATION_KEY");
  }
  const bytes = createHash("sha256").update(JSON.stringify(["allwain-manual-request-v1", userId, input.creationKey.toLowerCase()])).digest().subarray(0, 16);
  // Application-defined UUID v8. The actor and key are hashed, never exposed.
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return { id: `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`,
    fingerprint: createHash("sha256").update(JSON.stringify([sourceType, input.rawText.trim()])).digest("hex") };
}

function replayScanCreation(request: AllwainScanRequest, userId: string, fingerprint: string) {
  if (request.userId !== userId || request.ai?.rawData?.creationFingerprint !== fingerprint) {
    throw new Error("REQUEST_CREATION_CONFLICT");
  }
  // Internal telemetry hint, deliberately absent from the serialized DTO.
  const replay = { ...request };
  Object.defineProperty(replay, "creationReplayed", { value: true, enumerable: false });
  return replay;
}

export async function createAllwainScanRequest(
  userId: string,
  input: {
    sourceType?: AllwainScanSourceType;
    rawText?: string;
    imageBase64?: string;
    barcode?: string;
    provider?: ScanProvider;
    creationKey?: string;
  },
): Promise<AllwainScanRequest> {
  const sourceType =
    input.sourceType ||
    (input.barcode ? "barcode" : input.imageBase64 ? "image" : "text");
  const creation = scanCreationIdentity(userId, input, sourceType);
  if (creation) {
    const existing = await findAllwainScanRequestById(creation.id);
    if (existing) return replayScanCreation(existing, userId, creation.fingerprint);
  }
  const validatedImage = input.imageBase64
    ? validateImageDataUrl(input.imageBase64)
    : null;
  const scan = await scanProductImage({
    ...input,
    sourceType,
    imageBase64: validatedImage?.dataUrl,
  });
  if (validatedImage && scan.document?.items.length) {
    throw new Error("OCR_DOCUMENT_REVIEW_REQUIRED");
  }
  return createAllwainScanRequestFromResult(userId, {
    sourceType,
    validatedImage,
    scan,
    creation,
  });
}

export async function createAllwainScanCapture(
  userId: string,
  input: {
    sourceType?: AllwainScanSourceType;
    rawText?: string;
    imageBase64?: string;
    barcode?: string;
    provider?: ScanProvider;
  },
) {
  const sourceType =
    input.sourceType ||
    (input.barcode ? "barcode" : input.imageBase64 ? "image" : "text");
  const validatedImage = input.imageBase64
    ? validateImageDataUrl(input.imageBase64)
    : null;
  const scan = await scanProductImage({
    ...input,
    sourceType,
    imageBase64: validatedImage?.dataUrl,
  });

  if (validatedImage && scan.document?.items.length) {
    const evidence = await createAllwainOcrShoppingListDraft({
      userId,
      sourceType,
      image: validatedImage,
      scan,
    });
    return {
      kind: "shopping_list" as const,
      ...evidence,
      analysis: {
        provider: scan.provider,
        confidence: scan.confidence,
        summary: scan.summary,
        warnings: scan.warnings,
        document: scan.document,
      },
    };
  }

  return {
    kind: "request" as const,
    request: await createAllwainScanRequestFromResult(userId, {
      sourceType,
      validatedImage,
      scan,
    }),
  };
}

export async function updateAllwainScanRequest(
  userId: string,
  requestId: string,
  input: UpdateAllwainScanRequestInput,
) {
  const current = await findAllwainScanRequest(userId, requestId);
  if (!current) {
    throw new Error("SCAN_REQUEST_NOT_FOUND");
  }

  if (input.status && !SCAN_STATUSES.includes(input.status)) {
    throw new Error("INVALID_SCAN_STATUS");
  }
  if (input.status && input.status !== current.status) {
    if (input.extracted) throw new Error("INVALID_SCAN_TRANSITION");
    const allowed: Partial<
      Record<AllwainScanRequestStatus, AllwainScanRequestStatus[]>
    > = {
      draft: ["canceled"],
      ready: ["canceled"],
      submitted: ["canceled"],
      awarded: ["closed"],
      closed: ["archived"],
      canceled: ["archived"],
    };
    if (!allowed[current.status]?.includes(input.status)) {
      throw new Error("INVALID_SCAN_TRANSITION");
    }
    if (usePostgres()) {
      return transitionAllwainScanRequestPg({
        userId,
        requestId,
        fromStatus: current.status,
        toStatus: input.status,
      });
    }
    const transitioned: AllwainScanRequest = {
      ...current,
      status: input.status,
      closedAt: ["closed", "canceled"].includes(input.status)
        ? new Date().toISOString()
        : current.closedAt,
      updatedAt: new Date().toISOString(),
    };
    if (["closed", "canceled"].includes(input.status)) {
      for (const proposal of getOffersByOwner("allwain")) {
        if (offerRequestId(proposal) !== requestId) continue;
        if (!["active", "paused"].includes(proposal.allwainStatus || "active")) continue;
        updateOffer({ ...proposal, allwainStatus: "withdrawn" });
      }
    }
    return persistAllwainScanRequest(transitioned);
  }
  if (
    (current.status === "submitted" || current.status === "archived") &&
    input.extracted
  ) {
    throw new Error("SCAN_REQUEST_LOCKED");
  }
  if (
    current.referencePriceLocked &&
    input.extracted &&
    Object.prototype.hasOwnProperty.call(input.extracted, "targetPrice")
  ) {
    const previous = Math.round(Number(current.extracted.targetPrice) * 100);
    const next = Math.round(Number(input.extracted.targetPrice) * 100);
    if (!Number.isFinite(previous) || !Number.isFinite(next) || previous !== next) {
      throw new Error("OCR_PRICE_LOCKED_RESTART_REQUIRED");
    }
  }

  const mergedExtracted = mergeExtractedFields(current.extracted, input.extracted);
  const extracted = applyAllwainProductIntelligence(mergedExtracted, {
    rawText: mergedExtracted.rawText,
    unitSource: input.extracted?.unit !== undefined ? "user" : undefined,
  });
  const scanCopy = buildScanCopy(extracted);
  const editedAfterConfirmation =
    current.status === "ready" && Boolean(input.extracted);
  const updated: AllwainScanRequest = {
    ...current,
    status: editedAfterConfirmation ? "draft" : current.status,
    title: scanCopy.title,
    description: scanCopy.description,
    extracted,
    imageMeta: ensureAllwainRequestImageMeta(
      current.imageMeta as Record<string, unknown> | null,
      extracted,
      scanCopy.title,
    ),
    product: editedAfterConfirmation ? null : current.product,
    offers: editedAfterConfirmation ? [] : current.offers,
    ...(input.extracted
      ? {
          publicationReviewId: null,
          qualityDecision: null,
          qualityScore: null,
          qualityReviewedAt: null,
        }
      : {}),
    ai: editedAfterConfirmation
      ? {
          ...current.ai,
          rawData: {
            ...(current.ai.rawData || {}),
            confirmedAt: null,
          },
        }
      : current.ai,
    updatedAt: new Date().toISOString(),
  };

  return persistAllwainScanRequest(updated);
}

export async function confirmAllwainScanRequest(
  userId: string,
  requestId: string,
) {
  const current = await findAllwainScanRequest(userId, requestId);
  if (!current) throw new Error("SCAN_REQUEST_NOT_FOUND");
  const missingFields = missingScanSheetFields(current.extracted);
  if (missingFields.length) {
    throw new Error(`INCOMPLETE_PRODUCT_SHEET:${missingFields.join(",")}`);
  }
  if (
    current.status === "ready" &&
    current.publicationReviewId &&
    current.qualityDecision &&
    current.qualityDecision !== "block"
  ) {
    return current;
  }
  if (current.status !== "draft") throw new Error("INVALID_SCAN_TRANSITION");

  const qualityReview = await reviewAllwainPublication(
    userId,
    scanPublicationDraft(current),
    { entityId: current.id, useAi: true },
  );
  assertAllwainPublicationCanProceed(qualityReview);

  const scanCopy = buildScanCopy(current.extracted);
  const confirmed: AllwainScanRequest = {
    ...current,
    status: "ready",
    title: scanCopy.title,
    description: scanCopy.description,
    imageMeta: ensureAllwainRequestImageMeta(
      current.imageMeta as Record<string, unknown> | null,
      current.extracted,
      scanCopy.title,
    ),
    publicationReviewId: qualityReview.id,
    qualityDecision: qualityReview.decision,
    qualityScore: qualityReview.score,
    qualityReviewedAt: new Date().toISOString(),
    ai: {
      ...current.ai,
      rawData: {
        ...(current.ai.rawData || {}),
        lifecycleVersion: 2,
        confirmedAt: new Date().toISOString(),
      },
    },
    updatedAt: new Date().toISOString(),
  };
  return persistAllwainScanRequest(confirmed);
}

export async function requireAllwainBuyerPaymentMethod(userId: string) {
  let buyerPaymentProfile: any = null;
  if (usePostgres()) {
    buyerPaymentProfile = await (
      getPrisma() as any
    ).allwainBuyerPaymentProfile.findUnique({ where: { userId } });
    const now = new Date();
    const cardExpired =
      buyerPaymentProfile?.defaultCardExpYear &&
      (buyerPaymentProfile.defaultCardExpYear < now.getUTCFullYear() ||
        (buyerPaymentProfile.defaultCardExpYear === now.getUTCFullYear() &&
          Number(buyerPaymentProfile.defaultCardExpMonth || 0) <
            now.getUTCMonth() + 1));
    if (
      buyerPaymentProfile?.paymentMethodStatus !== "ready" ||
      !buyerPaymentProfile.defaultPaymentMethodId ||
      cardExpired
    ) {
      throw new Error("BUYER_PAYMENT_METHOD_REQUIRED");
    }
  }
  return buyerPaymentProfile;
}

export async function launchAllwainScanRequest(
  userId: string,
  requestId: string,
) {
  const current = await findAllwainScanRequest(userId, requestId);
  if (!current) throw new Error("SCAN_REQUEST_NOT_FOUND");
  if (current.status === "submitted")
    return refreshSubmittedScanRequest(current);
  if (current.status !== "ready") throw new Error("INVALID_SCAN_TRANSITION");

  const missingFields = missingScanSheetFields(current.extracted);
  if (missingFields.length) {
    throw new Error(`INCOMPLETE_PRODUCT_SHEET:${missingFields.join(",")}`);
  }

  const publicationCardRequired = allwainPublicationCardRequired();
  const buyerPaymentProfile = publicationCardRequired
    ? await requireAllwainBuyerPaymentMethod(userId)
    : null;

  const matched = await matchAllwainRequest(
    userId,
    current.extracted,
    current.id,
  );
  const scanCopy = buildScanCopy(current.extracted);
  const launched: AllwainScanRequest = {
    ...current,
    status: "submitted",
    title: scanCopy.title,
    description: scanCopy.description,
    imageMeta: ensureAllwainRequestImageMeta(
      current.imageMeta as Record<string, unknown> | null,
      current.extracted,
      scanCopy.title,
    ),
    product: matched.product,
    offers: matched.offers,
    paymentGuaranteeStatus: buyerPaymentProfile ? "ready" : "not_started",
    paymentGuaranteeConsentVersion:
      buyerPaymentProfile?.setupConsentVersion || null,
    paymentGuaranteeAcceptedAt:
      buyerPaymentProfile?.setupConsentAcceptedAt?.toISOString?.() ||
      buyerPaymentProfile?.setupConsentAcceptedAt ||
      null,
    paymentGuaranteeEvidenceHash:
      buyerPaymentProfile?.setupConsentEvidenceHash || null,
    ai: {
      ...current.ai,
      rawData: {
        ...(current.ai.rawData || {}),
        lifecycleVersion: 2,
        launchedAt: new Date().toISOString(),
        matchedProductId: matched.product?.id || null,
        matchedOfferCount: matched.offers.length,
      },
    },
    updatedAt: new Date().toISOString(),
  };
  const persisted = await persistAllwainScanRequest(launched);
  if (!persisted) throw new Error("ALLWAIN_REQUEST_PERSIST_FAILED");
  if (usePostgres()) {
    await appendAllwainAuditEvent({
      aggregateType: "market_request",
      aggregateId: persisted.id,
      eventType: "request.published",
      actorUserId: userId,
      actorRole: "buyer",
      source: "allwain_request_launch",
      payload: {
        qualityReviewId: persisted.publicationReviewId || null,
        qualityDecision: persisted.qualityDecision || null,
        qualityScore: persisted.qualityScore ?? null,
        paymentMethodRequiredAtPublication:
          publicationCardRequired,
        paymentGuaranteeStatus: persisted.paymentGuaranteeStatus,
        paymentGuaranteeConsentVersion:
          persisted.paymentGuaranteeConsentVersion || null,
        paymentGuaranteeEvidenceHash:
          persisted.paymentGuaranteeEvidenceHash || null,
      },
    });
  }
  return persisted;
}

/* =========================
   OFFERS
========================= */

function isAllwainSellerRole(role?: UserRole | null) {
  return role === "company" || role === "admin";
}

async function getAllAllwainScanRequests() {
  return usePostgres() ? getAllwainScanRequestsPg() : getAllwainScanRequests();
}

function offerRequestId(offer: Offer) {
  if (typeof offer.requestId === "string" && offer.requestId) {
    return offer.requestId;
  }
  return typeof offer.meta?.requestId === "string"
    ? offer.meta.requestId
    : null;
}

function offerShoppingListId(offer: Offer) {
  if (typeof offer.shoppingListId === "string" && offer.shoppingListId) {
    return offer.shoppingListId;
  }
  return typeof offer.meta?.shoppingListId === "string"
    ? offer.meta.shoppingListId
    : null;
}

function normalizePurchaseKey(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const key = String(value).trim();
  if (!/^[A-Za-z0-9._:-]{12,120}$/.test(key)) {
    throw new Error("INVALID_PURCHASE_KEY");
  }
  return key;
}

function structuredAllwainOfferFields(
  meta: Record<string, unknown>,
  type: "catalog" | "proposal",
) {
  const text = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : null;
  return {
    allwainType: type,
    allwainStatus: "active" as const,
    requestId: type === "proposal" ? text(meta.requestId) : null,
    currency: normalizeCurrency(meta.currency),
    unit: text(meta.unit),
    category: text(meta.category),
    subcategory: text(meta.subcategory),
    productKind: text(meta.productKind),
    locationLabel: text(meta.locationLabel) || text(meta.location),
  };
}

async function requireAllwainSeller(userId: string) {
  const user = await getAllwainUserById(userId);
  if (!user) throw new Error("USER_NOT_FOUND");
  if (!(await isAllwainSellerEnabled(userId, normalizeRole(user.role)))) {
    throw new Error("SELLER_ROLE_REQUIRED");
  }
  return user;
}

export async function listAllwainMarketRequests(userId: string) {
  await requireAllwainSeller(userId);
  const [requests, allOffers] = await Promise.all([
    getAllAllwainScanRequests(),
    usePostgres()
      ? getAllwainOffersPg()
      : Promise.resolve(getOffersByOwner("allwain")),
  ]);

  const visible = requests
    .filter(
      (request) =>
        request.status === "submitted" &&
        request.userId !== userId &&
        (request.visibility || "public") === "public",
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return Promise.all(
    visible.map(async (request) => {
      const directOffers = (allOffers as Offer[]).filter(
        (offer) => offerRequestId(offer) === request.id,
      );
      const requester = await getAllwainUserById(request.userId);
      const myOffer =
        directOffers.find((offer) => offer.ownerUserId === userId) || null;
      return {
        id: request.id,
        title: request.title,
        description: request.description,
        status: request.status,
        imageMeta: publicRequestCardImageMeta(
          request.imageMeta as Record<string, unknown> | null,
          request.extracted,
          request.title,
        ),
        demo:
          (request.ai as any)?.demo === true ||
          (request.ai as any)?.rawData?.demo === true,
        extracted: {
          productName: request.extracted.productName || null,
          brand: request.extracted.brand || null,
          category: request.extracted.category || null,
          subcategory: request.extracted.subcategory || null,
          productKind: request.extracted.productKind || null,
          ean: request.extracted.ean || null,
          quantity: request.extracted.quantity || null,
          unit: request.extracted.unit || null,
          targetPrice: request.extracted.targetPrice || null,
          currency: request.extracted.currency || "EUR",
          deliveryWindow: request.extracted.deliveryWindow || null,
          deliveryMethod: request.extracted.deliveryMethod || null,
          locationLabel:
            request.extracted.locationLabel || request.locationLabel || null,
        },
        requester: {
          id: requester?.id || request.userId,
          name: requester?.name || "Comprador",
        },
        offerCount: directOffers.filter((offer) => (offer.allwainStatus || "active") === "active" && (!offer.proposalExpiresAt || Date.parse(offer.proposalExpiresAt) > Date.now())).length,
        myOffer: myOffer ? await enrichAllwainOffer(myOffer) : null,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
      };
    }),
  );
}

function allwainMarketRequestView(
  request: AllwainScanRequest,
  requesterName: string,
  offerCount: number,
  myOffer: Offer | null,
) {
  return {
    id: request.id,
    title: request.title,
    description: request.description,
    status: request.status,
    imageMeta: publicRequestCardImageMeta(
      request.imageMeta as Record<string, unknown> | null,
      request.extracted,
      request.title,
    ),
    selectedOfferId: request.selectedOfferId || null,
    demo:
      (request.ai as any)?.demo === true ||
      (request.ai as any)?.rawData?.demo === true,
    extracted: {
      productName: request.extracted.productName || null,
      brand: request.extracted.brand || null,
      category: request.extracted.category || null,
      subcategory: request.extracted.subcategory || null,
      ean: request.extracted.ean || null,
      quantity: request.extracted.quantity || null,
      unit: request.extracted.unit || null,
      targetPrice: request.extracted.targetPrice || null,
      currency: request.extracted.currency || "EUR",
      deliveryWindow: request.extracted.deliveryWindow || null,
      deliveryMethod: request.extracted.deliveryMethod || null,
      locationLabel:
        request.extracted.locationLabel || request.locationLabel || null,
    },
    requester: {
      id: request.userId,
      name: requesterName || "Comprador",
    },
    offerCount,
    myOffer,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}

export async function listAllwainMarketRequestPage(
  userId: string,
  input: Omit<
    AllwainRequestPageInput,
    "userId" | "excludeUserId" | "statuses" | "visibility"
  >,
) {
  validateDiscovery(input);
  if (usePostgres()) {
    const page = await getAllwainScanRequestPagePg({
      ...input,
      excludeUserId: userId,
      statuses: ["submitted"],
      visibility: "public",
      sellerResponseUserId: userId,
    });
    const requestIds = page.items.map((item) => item.id);
    const [proposals, requesters] = await Promise.all([
      getAllwainProposalSummariesPg(requestIds, userId),
      getAllwainOfferProviderSummariesPg(
        page.items.map((item) => item.userId),
      ),
    ]);
    return {
      ...page,
      items: page.items.map((request) =>
        allwainMarketRequestView(
          request,
          requesters.get(request.userId)?.name || "Comprador",
          proposals.counts.get(request.id) || 0,
          proposals.mine.get(request.id) || null,
        ),
      ),
    };
  }

  const allItems = await listAllwainMarketRequests(userId);
  const rawById = new Map(getAllwainScanRequests().map((item) => [item.id, item]));
  const filtered = allItems.filter((item) => {
    return matchesDiscovery(rawById.get(item.id) || item, input, item.extracted.targetPrice) && matchesResponse(item.myOffer, input.responseStatus);
  });
  return discoveryPage(filtered, input, "requests", userId);
}

export async function getAllwainMarketRequestForSeller(
  userId: string,
  requestId: string,
) {
  await requireAllwainSeller(userId);
  const request = await findAllwainScanRequestById(requestId);
  if (
    !request ||
    request.userId === userId ||
    request.status !== "submitted" ||
    (request.visibility || "public") !== "public"
  ) {
    throw new Error("MARKET_REQUEST_NOT_FOUND");
  }
  if (usePostgres()) {
    const [proposals, requesters] = await Promise.all([
      getAllwainProposalSummariesPg([request.id], userId),
      getAllwainOfferProviderSummariesPg([request.userId]),
    ]);
    return allwainMarketRequestView(
      request,
      requesters.get(request.userId)?.name || "Comprador",
      proposals.counts.get(request.id) || 0,
      proposals.mine.get(request.id) || null,
    );
  }
  const visible = await listAllwainMarketRequests(userId);
  const item = visible.find((candidate) => candidate.id === requestId);
  if (!item) throw new Error("MARKET_REQUEST_NOT_FOUND");
  return item;
}

export async function createAllwainOfferForRequest(
  userId: string,
  requestId: string,
  input: {
    price: number;
    description: string;
    deliveryEstimate: string;
    availableQuantity?: number | null;
    publicationReviewId?: string | null;
    validForMinutes?: unknown;
  },
) {
  const seller = await requireAllwainSeller(userId);
  const commercialModel = await getAllwainSellerCommercialModel(userId);
  const request = usePostgres()
    ? await getAllwainScanRequestByIdPg(requestId)
    : (await getAllAllwainScanRequests()).find((item) => item.id === requestId) || null;
  if (
    !request ||
    request.status !== "submitted" ||
    (request.visibility || "public") !== "public"
  )
    throw new Error("MARKET_REQUEST_NOT_FOUND");
  if (request.userId === userId) throw new Error("CANNOT_OFFER_OWN_REQUEST");
  if (!Number.isFinite(input.price) || input.price <= 0)
    throw new Error("INVALID_OFFER_PRICE");
  const totalAmount = Math.round(input.price * 100);
  const referenceAmount =
    typeof request.extracted.targetPrice === "number" &&
    Number.isFinite(request.extracted.targetPrice) &&
    request.extracted.targetPrice > 0
      ? Math.round(request.extracted.targetPrice * 100)
      : null;
  if (referenceAmount !== null && totalAmount > referenceAmount) {
    throw new Error("OFFER_ABOVE_REFERENCE_PRICE");
  }
  const validUntil = normalizeAllwainProposalExpiry({
    validForMinutes: input.validForMinutes,
  });

  const description = input.description.trim();
  const deliveryEstimate = input.deliveryEstimate.trim();
  if (!description || !deliveryEstimate)
    throw new Error("MISSING_OFFER_FIELDS");

  const existing = usePostgres()
    ? await getAllwainProposalBySellerPg(requestId, userId)
    : getOffersByOwner("allwain").find(
        (offer) =>
          offer.ownerUserId === userId && offerRequestId(offer) === requestId,
      );
  if (existing?.allwainStatus === "withdrawn") throw new Error("PROPOSAL_NOT_EDITABLE");
  if (
    existing?.price != null &&
    totalAmount > Math.round(Number(existing.price) * 100)
  ) {
    throw new Error("PROPOSAL_NOT_IMPROVED");
  }

  const productName = request.extracted.productName || "la petición";
  const availableQuantity =
    typeof input.availableQuantity === "number" &&
    Number.isFinite(input.availableQuantity) &&
    input.availableQuantity > 0
      ? input.availableQuantity
      : request.extracted.quantity || null;
  const requestImageMeta = publicRequestCardImageMeta(
    request.imageMeta as Record<string, unknown> | null,
    request.extracted,
    request.title,
  );
  const directOfferMeta = normalizeAllwainInventoryMeta(
    ensureAllwainImageMeta({
      requestId,
      source: "allwain-market-response",
      category: request.extracted.category || null,
      requestedQuantity: request.extracted.quantity || null,
      unit: request.extracted.unit || null,
      availableQuantity,
      minQuantity: request.extracted.quantity || 1,
      maxQuantityPerOrder: request.extracted.quantity || undefined,
      quantityStep: 1,
      deliveryEstimate,
      ...((request.ai as any)?.demo === true
        ? {
            demo: true,
            demoLabel: "Propuesta de demostración",
            synthetic: true,
            checkoutEnabled: false,
          }
        : {}),
    }, {
      title: productName,
      description,
      category: request.extracted.category,
      subcategory: request.extracted.subcategory,
      productKind: request.extracted.productKind,
    }, {
      preferredUrl: requestImageMeta.url,
      preferredSource: requestImageMeta.source as AllwainCardImageSource,
    }),
    { requireStock: false },
  );
  const publicationDraft: AllwainPublicationDraft = {
    entityType: "proposal",
    title: productName,
    description,
    category: request.extracted.category,
    productKind: request.extracted.productKind,
    quantity: availableQuantity,
    unit: request.extracted.unit,
    price: input.price,
    currency: request.extracted.currency,
    deliveryWindow: deliveryEstimate,
    locationLabel:
      request.extracted.locationLabel || request.extracted.deliveryAddress,
  };
  const qualityReview = input.publicationReviewId
    ? await resolveAllwainPublicationReview(
        userId,
        publicationDraft,
        input.publicationReviewId,
      )
    : await reviewAllwainPublication(userId, publicationDraft, { useAi: true });
  assertAllwainPublicationCanProceed(qualityReview);
  const offer: Offer = {
    id: randomUUID(),
    title: `Oferta de ${seller.name || "proveedor"}: ${productName}`,
    description,
    owner: "allwain",
    ownerUserId: userId,
    commercialModel,
    price: input.price,
    productId: request.product?.id || null,
    meta: {
      ...directOfferMeta,
      validUntil: validUntil.toISOString(),
      referenceAmount,
      acceptedOfferAmount: totalAmount,
      feeBasis: referenceAmount === null ? "sale_amount" : "verified_savings",
      publicationReviewId: qualityReview.id,
      qualityDecision: qualityReview.decision,
      qualityScore: qualityReview.score,
    },
    ...structuredAllwainOfferFields(directOfferMeta, "proposal"),
    proposalExpiresAt: validUntil.toISOString(),
    proposalRevision: Number(existing?.proposalRevision || 0) + 1,
    createdAt: new Date().toISOString(),
  };

  let saved: Offer;
  try {
    if (usePostgres()) {
      saved = await upsertAllwainRequestProposalPg({
        offer,
        requestId,
        sellerUserId: userId,
        totalAmount,
        referenceAmount,
        validUntil,
        deliveryEstimate,
        snapshotPayload: {
          productName,
          description,
          availableQuantity,
          requestedQuantity: request.extracted.quantity || null,
          unit: request.extracted.unit || null,
          deliveryEstimate,
          publicationReviewId: qualityReview.id,
        },
      });
    } else if (existing) {
      const current = getOfferById(existing.id);
      if (!current || current.allwainStatus === "withdrawn") throw new Error("PROPOSAL_NOT_EDITABLE");
      if (current.allwainStatus === "selected") throw new Error("PROPOSAL_NOT_EDITABLE");
      saved = updateOffer({ ...current, ...offer, id: existing.id, updatedAt: new Date().toISOString() }) as Offer;
    } else {
      saved = addOffer(offer);
    }
  } catch (error: any) {
    if (error?.code === "P2002") throw new Error("OFFER_ALREADY_EXISTS");
    throw error;
  }
  await attachAllwainPublicationReviewEntity(qualityReview.id, saved.id);
  await refreshSubmittedScanRequest(request);
  await notifyAllwainUser({
    userId: request.userId,
    type: "request.offer_received",
    title: "Has recibido una nueva oferta",
    body: `${seller.name || "Un vendedor"} ha respondido a ${request.extracted.productName || "tu petición"}.`,
    route: "request",
    routeParams: {
      requestId: request.id,
      offerId: saved.id,
      mode: "buy",
    },
    dedupeKey: `request.offer_received:${request.id}:${saved.id}:${saved.proposalRevision || 1}:${request.userId}`,
    emailDelivery: false,
  });
  return enrichAllwainOffer(saved);
}

export async function listAllwainOffers(userId?: string) {
  const offers = usePostgres()
    ? await getAllwainOffersPg()
    : getOffersByOwner("allwain");
  const sortOffers = (items: Offer[]) =>
    items.sort((a, b) => {
      const featuredDifference =
        Number(Boolean(b.meta?.featured)) - Number(Boolean(a.meta?.featured));
      if (featuredDifference) return featuredDifference;
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
  const owners = new Map(
    await Promise.all(
      [...new Set((offers as Offer[]).map((offer) => offer.ownerUserId))].map(
        async (ownerId) => [ownerId, await getAllwainUserById(ownerId)] as const,
      ),
    ),
  );
  const visible = (offers as Offer[]).filter((offer) => {
    if (isPublicCatalogOffer(offer, owners.get(offer.ownerUserId) || null)) {
      return true;
    }
    return (
      userId === offer.ownerUserId &&
      isCatalogOffer(offer) &&
      !isAllwainOfferArchived(offer) &&
      ["paused", "sold_out"].includes(offer.allwainStatus || "active")
    );
  });
  const enriched = await Promise.all(visible.map(enrichAllwainOffer));
  return sortOffers(enriched);
}

export async function listAllwainOfferPage(
  userId: string,
  input: AllwainOfferPageInput,
) {
  validateDiscovery(input, input.sort);
  if (input.radiusKm != null) throw new Error("INVALID_DISCOVERY_LOCATION");
  if (input.ownerUserId && input.ownerUserId !== userId) {
    throw new Error("OFFER_NOT_FOUND");
  }
  if (usePostgres()) {
    const page = await getAllwainOfferPagePg({
      ...input,
      searchOwnerUserIds: input.query
        ? await getAllwainSellerIdsMatchingPg(input.query)
        : null,
    });
    const providers = await getAllwainOfferProviderSummariesPg(
      page.items.map((offer) => offer.ownerUserId),
    );
    const committedIds = input.ownerUserId ? await getAllwainCatalogCommittedOfferIdsPg(page.items.map((offer) => offer.id)) : new Set<string>();
    return {
      ...page,
      items: page.items.map((offer) => {
        const offerWithImage = ensureAllwainOfferImage(offer);
        return {
          ...offerWithImage,
          updatedAt: offerWithImage.updatedAt || offerWithImage.createdAt,
          meta: {
            ...(offerWithImage.meta || {}),
            ...(input.ownerUserId && isCatalogOffer(offerWithImage) ? { catalogTermsLocked: committedIds.has(offerWithImage.id) || readAllwainInventory(offerWithImage).reservedQuantity > 0 || readAllwainInventory(offerWithImage).soldQuantity > 0 } : {}),
            deliveryPricing: getAllwainDeliveryPricingConfig(),
          },
          provider: providers.get(offerWithImage.ownerUserId) || {
            id: offerWithImage.ownerUserId,
            name: "Vendedor",
            score: 0,
            reviewCount: 0,
            completedOrders: 0,
          },
        };
      }),
    };
  }

  const normalizedQuery = input.query?.trim().toLowerCase() || "";
  const sourceOffers = input.ownerUserId
    ? getOffersByOwner("allwain").filter(
        (offer) =>
          offer.ownerUserId === userId &&
          (input.type === "all" || (input.type === "proposal" ? !isCatalogOffer(offer) : isCatalogOffer(offer))) &&
          (!input.view || (input.view === "history" ? input.type === "proposal" || input.type === "all" ? ["selected", "not_selected", "withdrawn", "closed"] : ["closed"] : ["active", "paused", "sold_out"]).includes(offer.allwainStatus || "active")) &&
          (input.status
            ? (offer.allwainStatus || "active") === input.status
            : input.view === "history"
            ? (input.type === "proposal" || input.type === "all" ? ["selected", "not_selected", "withdrawn", "closed"] : ["closed"]).includes(offer.allwainStatus || "active")
            : !isAllwainOfferArchived(offer) &&
              ["active", "paused", "sold_out", ...((input.type === "proposal" || input.type === "all") && !input.view ? ["selected", "not_selected"] : [])].includes(offer.allwainStatus || "active")),
      )
    : await listAllwainOffers();
  let items = sourceOffers.filter((offer) => {
    if (input.ownerUserId && offer.ownerUserId !== input.ownerUserId) return false;
    if (input.excludeOwnerUserId && offer.ownerUserId === input.excludeOwnerUserId) return false;
    if (input.status && String(offer.allwainStatus || "active") !== input.status) return false;
    if ((input.sort === "price_asc" || input.sort === "price_desc") && offer.price == null) return false;
    return matchesDiscovery(offer, input, offer.price);
  });
  const page = discoveryPage(items, input, "offers", input.ownerUserId || input.excludeOwnerUserId || "market");
  const pageItems = page.items;
  return {
    items: input.ownerUserId
      ? await Promise.all(pageItems.map((offer) => enrichAllwainOffer({ ...offer, meta: { ...(offer.meta || {}), ...(isCatalogOffer(offer) ? { catalogTermsLocked: getContracts().some((contract) => contract.app === "allwain" && contract.offerId === offer.id) || readAllwainInventory(offer).reservedQuantity > 0 || readAllwainInventory(offer).soldQuantity > 0 } : {}) } })))
      : pageItems,
    pageInfo: page.pageInfo,
  };
}

export async function createAllwainOffer(
  userId: string,
  title: string,
  description: string,
  price: number,
  productId?: string,
  meta?: Record<string, unknown>,
  productCompliance?: Record<string, unknown>,
  publicationReviewId?: string | null,
): Promise<Offer> {
  await requireAllwainSeller(userId);
  const commercialModel = await getAllwainSellerCommercialModel(userId);
  const cleanTitle = title.trim();
  const cleanDescription = description.trim();
  if (!cleanTitle || !cleanDescription) throw new Error("MISSING_OFFER_FIELDS");
  if (!Number.isFinite(price) || price <= 0)
    throw new Error("INVALID_OFFER_PRICE");
  const intelligence = applyAllwainProductIntelligence(
    {
      productName: cleanTitle,
      category:
        typeof meta?.category === "string" ? meta.category : null,
      unit: typeof meta?.unit === "string" ? meta.unit : null,
      rawText: `${cleanTitle} ${cleanDescription}`,
      confidence: 0.6,
    },
    {
      rawText: `${cleanTitle} ${cleanDescription}`,
      unitSource: "model",
    },
  );
  const categoryByKind: Partial<Record<string, string>> = {
    produce_weight: "alimentacion",
    liquid_bulk: "alimentacion",
    vehicle: "vehiculos",
    appliance: "electrodomesticos",
    electronics: "electronica",
    service: "servicios",
  };
  const citrus = /\b(naranj\w*|mandarin\w*|clementin\w*|limon\w*)\b/i.test(
    cleanTitle.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
  );
  const saleMode = meta?.saleMode === "preorder" ? "preorder" : "immediate";
  const preorderChargeDeadlineAt =
    saleMode === "preorder"
      ? normalizeAllwainPreorderChargeDeadline(
          meta?.preorderChargeDeadlineAt,
        ).toISOString()
      : null;
  const intelligentMeta = ensureAllwainImageMeta(
    {
      ...(meta || {}),
      saleMode,
      preorderChargeDeadlineAt,
      unit: intelligence.unit || "ud",
      productKind: intelligence.productKind || "general",
      category:
        categoryByKind[intelligence.productKind || ""] ||
        intelligence.category ||
        "general",
      ...(citrus
        ? {
            minQuantity: Math.max(5, Number(meta?.minQuantity) || 0),
            quantityStep: 1,
          }
        : {}),
    },
    {
      title: cleanTitle,
      description: cleanDescription,
      category: intelligence.category || meta?.category,
      subcategory: meta?.subcategory,
      productKind: intelligence.productKind,
    },
  );
  const inventoryMeta = normalizeAllwainInventoryMeta(intelligentMeta, {
    requireStock: true,
  });
  const normalizedCompliance = productCompliance
    ? normalizeAllwainProductComplianceInput(productCompliance)
    : undefined;
  if (normalizedCompliance)
    assertAllwainProductCompliancePublishable(normalizedCompliance);

  const publicationDraft: AllwainPublicationDraft = {
    entityType: "catalog_offer",
    title: cleanTitle,
    description: cleanDescription,
    category: String(inventoryMeta.category || "") || null,
    productKind: String(inventoryMeta.productKind || "") || null,
    quantity: Number(
      inventoryMeta.stockQuantity || inventoryMeta.availableQuantity || 0,
    ),
    unit: String(inventoryMeta.unit || "ud"),
    price,
    currency: String(inventoryMeta.currency || "EUR"),
    deliveryWindow:
      typeof inventoryMeta.deliveryEstimate === "string"
        ? inventoryMeta.deliveryEstimate
        : typeof inventoryMeta.preorderChargeDeadlineAt === "string"
          ? inventoryMeta.preorderChargeDeadlineAt
          : "Disponibilidad indicada por el vendedor",
    locationLabel:
      typeof inventoryMeta.locationLabel === "string"
        ? inventoryMeta.locationLabel
        : null,
  };
  const qualityReview = publicationReviewId
    ? await resolveAllwainPublicationReview(
        userId,
        publicationDraft,
        publicationReviewId,
      )
    : await reviewAllwainPublication(userId, publicationDraft, { useAi: true });
  assertAllwainPublicationCanProceed(qualityReview);

  const offer: Offer = {
    id: randomUUID(),
    title: cleanTitle,
    description: cleanDescription,
    owner: "allwain",
    ownerUserId: userId,
    commercialModel,
    price,
    productId,
    meta: {
      ...inventoryMeta,
      publicationReviewId: qualityReview.id,
      qualityDecision: qualityReview.decision,
      qualityScore: qualityReview.score,
    },
    ...structuredAllwainOfferFields(inventoryMeta, "catalog"),
    createdAt: new Date().toISOString(),
  };

  const saved = usePostgres()
    ? await addAllwainOfferPg(offer, normalizedCompliance)
    : addOffer({
        ...offer,
        meta: normalizedCompliance
          ? { ...offer.meta, productCompliance: normalizedCompliance }
          : offer.meta,
      });
  if (normalizedCompliance && usePostgres()) {
    await appendAllwainAuditEvent({
      aggregateType: "offer_compliance",
      aggregateId: saved.id,
      eventType: "product_compliance.published",
      actorUserId: userId,
      actorRole: "seller",
      source: "allwain_offer_creation",
      payload: {
        offerId: saved.id,
        productKind: normalizedCompliance.productKind,
        onlineInfoComplete: normalizedCompliance.onlineInfoComplete,
        lotTrackingRequired: normalizedCompliance.lotTrackingRequired,
      },
      });
  }
  await attachAllwainPublicationReviewEntity(qualityReview.id, saved.id);
  if (usePostgres()) {
    await appendAllwainAuditEvent({
      aggregateType: "offer",
      aggregateId: saved.id,
      eventType: "publication.quality_reviewed",
      actorUserId: userId,
      actorRole: "seller",
      source: "allwain_publication_gate",
      payload: {
        reviewId: qualityReview.id,
        decision: qualityReview.decision,
        score: qualityReview.score,
        provider: qualityReview.provider,
      },
    });
  }
  return saved;
}

export async function updateAllwainOfferInventory(
  userId: string,
  offerId: string,
  input: { stockQuantity: number; minQuantity: number; quantityStep: number },
) {
  const actor = await requireAllwainSeller(userId);
  const offer = await getAllwainOfferById(offerId);
  if (
    !offer ||
    (offer.ownerUserId !== userId && normalizeRole(actor.role) !== "admin")
  ) {
    throw new Error("OFFER_NOT_FOUND");
  }
  if (!isCatalogOffer(offer)) throw new Error("INVENTORY_NOT_EDITABLE");

  const updated = usePostgres()
    ? await updateAllwainOfferInventoryPg({
        offerId,
        userId,
        allowAnyOwner: normalizeRole(actor.role) === "admin",
        ...input,
      })
    : (() => {
        const meta = updateAllwainInventoryLimits(offer, input);
        return updateOffer({
          ...offer,
          updatedAt: new Date().toISOString(),
          meta,
          allwainStatus:
            offer.allwainStatus === "sold_out" &&
            (readAllwainInventory({ meta }).availableQuantity || 0) > 0
              ? "active"
              : offer.allwainStatus || "active",
        });
      })();
  if (!updated) throw new Error("OFFER_NOT_FOUND");
  return enrichAllwainOffer(updated);
}

export async function updateAllwainOffer(
  userId: string,
  offerId: string,
  input: AllwainOfferEditInput,
) {
  const actor = await requireAllwainSeller(userId);
  const preview = await getAllwainOfferById(offerId);
  // JSON writes are synchronous. Read again after the await, then validate and
  // save in the same turn so a queued edit cannot overwrite a newer close.
  const offer = usePostgres() ? preview : getOfferById(offerId);
  if (
    !offer ||
    offer.owner !== "allwain" ||
    (offer.ownerUserId !== userId && normalizeRole(actor.role) !== "admin")
  ) {
    throw new Error("OFFER_NOT_FOUND");
  }
  if (
    !isCatalogOffer(offer) ||
    (isAllwainOfferArchived(offer) && offer.allwainStatus !== "closed")
  ) {
    throw new Error("OFFER_EDIT_NOT_ALLOWED");
  }
  const title = input.title === undefined ? undefined : input.title.trim();
  const description =
    input.description === undefined ? undefined : input.description.trim();
  if (title !== undefined && !title) throw new Error("MISSING_OFFER_FIELDS");
  if (description !== undefined && !description)
    throw new Error("MISSING_OFFER_FIELDS");
  if (
    input.price !== undefined &&
    (!Number.isFinite(input.price) || input.price <= 0)
  ) {
    throw new Error("INVALID_OFFER_PRICE");
  }
  const edit = !usePostgres() ? allwainCatalogEditPatch(offer, input, getContracts().some((contract) => contract.app === "allwain" && contract.offerId === offer.id)) : null;
  const currentStatus = offer.allwainStatus || "active";
  if (input.status) {
    const allowed: Record<string, string[]> = {
      active: ["paused", "closed"],
      paused: ["active", "closed"],
      sold_out: ["active", "closed"],
      closed: [],
    };
    if (input.status !== currentStatus && !allowed[currentStatus]?.includes(input.status)) {
      throw new Error("INVALID_OFFER_TRANSITION");
    }
    if (
      input.status === "active" &&
      currentStatus === "sold_out" &&
      (readAllwainInventory(offer).availableQuantity || 0) <= 0
    ) {
      throw new Error("INSUFFICIENT_STOCK");
    }
  }
  if (
    !usePostgres() && input.status === "closed" &&
    currentStatus === "closed" && isAllwainOfferArchived(offer) &&
    title === undefined && description === undefined && input.price === undefined && !edit?.metaChanged
  ) {
    return enrichAllwainOffer(offer);
  }
  const refreshedImageMeta =
    !usePostgres() && (title !== undefined || description !== undefined || input.category !== undefined || input.subcategory !== undefined)
      ? refreshAllwainIllustrativeImageMeta(edit?.meta, {
          title: title ?? offer.title,
          description: description ?? offer.description,
          category: edit?.columns.category ?? offer.category ?? offer.meta?.category,
          subcategory: edit?.columns.subcategory ?? offer.subcategory ?? offer.meta?.subcategory,
          productKind: offer.productKind || offer.meta?.productKind,
        })
      : undefined;
  const patch = {
    ...input,
    title,
    description,
    price: input.price,
    status: input.status,
  };
  const updated = usePostgres()
    ? await updateAllwainOfferDetailsPg({
        offerId,
        userId,
        allowAnyOwner: normalizeRole(actor.role) === "admin",
        ...patch,
      })
    : updateOffer({
        ...offer,
        ...edit!.columns,
        updatedAt: new Date().toISOString(),
        ...(refreshedImageMeta || edit?.metaChanged ? { meta: refreshedImageMeta || edit!.meta } : {}),
        ...(input.status !== undefined
          ? {
              allwainStatus: input.status,
              meta:
                input.status === "closed"
                  ? {
                      ...(refreshedImageMeta || edit!.meta || {}),
                      archived: true,
                      status: "archived",
                      availableQuantity: 0,
                      archivedAt: offer.meta?.archivedAt || new Date().toISOString(),
                    }
                  : {
                      ...(refreshedImageMeta || edit!.meta || {}),
                      archived: false,
                      status: input.status,
                    },
            }
          : {}),
      });
  if (!updated) throw new Error("OFFER_NOT_FOUND");
  return enrichAllwainOffer({ ...updated, meta: { ...(updated.meta || {}), catalogTermsLocked: usePostgres() ? updated.meta?.catalogTermsLocked === true : getContracts().some((contract) => contract.app === "allwain" && contract.offerId === updated.id) || readAllwainInventory(updated).reservedQuantity > 0 || readAllwainInventory(updated).soldQuantity > 0 } });
}

export async function withdrawAllwainProposal(userId: string, offerId: string, input: { expectedUpdatedAt?: unknown } = {}) {
  await requireAllwainSeller(userId);
  if (usePostgres()) return enrichAllwainOffer(await withdrawAllwainProposalPg({ userId, offerId, ...input }));
  const offer = getOfferById(offerId);
  if (!offer || offer.owner !== "allwain" || offer.ownerUserId !== userId) throw new Error("OFFER_NOT_FOUND");
  const aggregate = allwainProposalAggregate(offer);
  if (!aggregate.requestId && !aggregate.shoppingListId) throw new Error("PROPOSAL_REQUIRED");
  if (offer.allwainStatus === "withdrawn") return enrichAllwainOffer(offer);
  assertAllwainOfferVersion(offer, input.expectedUpdatedAt);
  if (offer.allwainStatus === "selected" || getContracts().some((contract) => contract.app === "allwain" && contract.offerId === offer.id)) {
    throw new Error("PROPOSAL_LOCKED");
  }
  if (!["active", "paused", "not_selected"].includes(offer.allwainStatus || "active")) throw new Error("PROPOSAL_NOT_EDITABLE");
  const now = new Date().toISOString();
  const updated = updateOffer({ ...offer, allwainStatus: "withdrawn", updatedAt: now, meta: { ...(offer.meta || {}), status: "withdrawn", withdrawnAt: now } });
  if (!updated) throw new Error("OFFER_NOT_FOUND");
  return enrichAllwainOffer(updated);
}

async function assertAllwainOfferVisibleToBuyer(userId: string, offer: Offer) {
  const requestId = offerRequestId(offer);
  const shoppingListId = offerShoppingListId(offer);
  if (!requestId && !shoppingListId) return;
  if (shoppingListId) {
    if (!usePostgres()) throw new Error("OFFER_NOT_FOUND");
    const list = await (getPrisma() as any).allwainShoppingList.findUnique({
      where: { id: shoppingListId },
      select: {
        buyerUserId: true,
        status: true,
        selectedOfferId: true,
      },
    });
    if (
      !list ||
      list.buyerUserId !== userId ||
      !["published", "partially_awarded"].includes(list.status)
    ) {
      throw new Error("OFFER_NOT_FOUND");
    }
    return;
  }
  if (!requestId) throw new Error("OFFER_NOT_FOUND");
  const request = usePostgres()
    ? await getAllwainScanRequestByIdPg(requestId)
    : (await getAllAllwainScanRequests()).find((item) => item.id === requestId) || null;
  if (!request || request.userId !== userId || request.status !== "submitted") {
    throw new Error("OFFER_NOT_FOUND");
  }
}

function assertAllwainOfferIsActionable(offer: Offer) {
  if (isAllwainOfferArchived(offer) || (offer.allwainStatus && !["active", "sold_out"].includes(offer.allwainStatus))) {
    throw new Error("OFFER_NOT_AVAILABLE");
  }
  if (allwainOfferCheckoutDisabled(offer)) {
    throw new Error("DEMO_OFFER_READ_ONLY");
  }
  if (offerRequestId(offer) || offerShoppingListId(offer)) {
    assertAllwainProposalActive(
      offer.proposalExpiresAt ||
        (typeof offer.meta?.validUntil === "string"
          ? offer.meta.validUntil
          : null),
    );
  }
}

export async function registerAllwainOfferInterest(
  userId: string,
  offerId: string,
  input?: { source?: string; note?: string },
) {
  const offer = await getAllwainOfferById(offerId);
  if (!offer) throw new Error("OFFER_NOT_FOUND");
  if (offer.ownerUserId === userId) throw new Error("CANNOT_ACCEPT_OWN_OFFER");
  assertAllwainOfferIsActionable(offer);
  await assertAllwainOfferVisibleToBuyer(userId, offer);

  const user = usePostgres()
    ? await getUserByIdPg(userId)
    : getUserById(userId);
  if (!user) throw new Error("USER_NOT_FOUND");

  const lead: Lead = {
    id: randomUUID(),
    name: user.name,
    email: user.email,
    source: `allwain:${input?.source || "app"}`,
    message: input?.note?.trim() || `Interes en la oferta: ${offer.title}`,
    offerId,
    userId,
    status: "new",
    createdAt: new Date().toISOString(),
  };

  return usePostgres() ? addLeadPg(lead) : addLead(lead);
}

export async function createAllwainAgreement(
  userId: string,
  offerId: string,
  requestedQuantity?: number,
  deliveryInput: AllwainOrderDeliveryInput = {},
) {
  const purchaseKey = normalizePurchaseKey(deliveryInput.purchaseKey);
  if (purchaseKey) {
    const existing = usePostgres()
      ? await getContractByPurchaseKeyPg(purchaseKey)
      : (await getAllwainContracts()).find(
          (item) => item.purchaseKey === purchaseKey,
        );
    if (existing) {
      if (
        existing.offerId !== offerId ||
        existing.requesterUserId !== userId ||
        existing.app !== "allwain"
      ) {
        throw new Error("IDEMPOTENCY_KEY_REUSED");
      }
      return (await enrichAllwainContractsWithImages([existing]))[0];
    }
  }
  const offer = await getAllwainOfferById(offerId);
  if (!offer) throw new Error("OFFER_NOT_FOUND");
  if (offer.ownerUserId === userId) throw new Error("CANNOT_ACCEPT_OWN_OFFER");
  assertAllwainOfferIsActionable(offer);
  await assertAllwainOfferVisibleToBuyer(userId, offer);

  const requester = usePostgres()
    ? await getUserByIdPg(userId)
    : getUserById(userId);
  const provider = usePostgres()
    ? await getUserByIdPg(offer.ownerUserId)
    : getUserById(offer.ownerUserId);
  if (!requester || !provider) throw new Error("USER_NOT_FOUND");
  const inventory = readAllwainInventory(offer);
  const quantity = requestedQuantity ?? inventory.minQuantity;
  validateAllwainOrderQuantity(offer, quantity);
  const delivery = normalizeAllwainOrderDelivery(deliveryInput);
  const carrierQuote =
    delivery.deliveryChannel === "carrier"
      ? await validateAllwainCarrierQuoteForAgreement({
          quoteId: delivery.carrierQuoteId as string,
          buyerUserId: userId,
          offerId,
          sellerUserId: offer.ownerUserId,
          quantity,
          unit: inventory.unit,
          address: {
            addressLine1: delivery.deliveryAddress,
            postalCode: delivery.deliveryPostalCode,
            city: delivery.deliveryCity,
            countryCode: delivery.deliveryCountryCode,
            phone: delivery.deliveryPhone,
          },
          currency: String(offer.currency || offer.meta?.currency || ENV.ALLWAIN_CURRENCY),
        })
      : null;
  const contract = buildAllwainOrderContract(
    offer,
    { id: requester.id, name: requester.name },
    { id: provider.id, name: provider.name },
    quantity,
    delivery,
    purchaseKey,
    carrierQuote,
  );

  if (usePostgres()) {
    const created = await createAllwainAgreementWithStockPg({
      offerId,
      userId,
      quantity,
      contract,
      expectedUpdatedAt: offer.updatedAt ? new Date(offer.updatedAt).toISOString() : undefined,
    });
    return {
      ...created,
      imageMeta: allwainOfferCardImageMeta(offer),
    };
  }

  const requestId = offerRequestId(offer);
  const requestToAward = requestId
    ? (await getAllAllwainScanRequests()).find((item) => item.id === requestId)
    : null;
  if (
    requestId &&
    (!requestToAward ||
      requestToAward.userId !== userId ||
      requestToAward.status !== "submitted" ||
      requestToAward.selectedOfferId)
  ) {
    throw new Error("MARKET_REQUEST_NOT_OPEN");
  }
  const currentOffer = getOfferById(offer.id);
  if (!currentOffer) throw new Error("OFFER_NOT_FOUND");
  assertAllwainOfferIsActionable(currentOffer);
  if ((currentOffer.updatedAt || currentOffer.createdAt) !== (offer.updatedAt || offer.createdAt)) throw new Error("OFFER_VERSION_CONFLICT");
  const reservation = reserveAllwainStock(currentOffer, quantity);
  if (reservation.inventory.managed) {
    updateOffer({
      ...currentOffer,
      updatedAt: new Date().toISOString(),
      meta: reservation.meta,
      allwainStatus:
        offerRequestId(offer)
          ? "selected"
          : reservation.inventory.availableQuantity === 0
            ? "sold_out"
            : offer.allwainStatus || "active",
    });
  }
  if (requestId && requestToAward) {
    await persistAllwainScanRequest({
      ...requestToAward,
      status: "awarded",
      selectedOfferId: offer.id,
      selectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    for (const proposal of getOffersByOwner("allwain")) {
      if (offerRequestId(proposal) !== requestId) continue;
      if (proposal.id !== offer.id && !["active", "paused"].includes(proposal.allwainStatus || "active")) continue;
      updateOffer({
        ...proposal,
        allwainStatus:
          proposal.id === offer.id ? "selected" : "not_selected",
        ...(proposal.id !== offer.id ? { meta: allwainSelectionClosureMeta(proposal, offer.id) } : {}),
      });
    }
  }
  const created = createContract(contract);
  return {
    ...created,
    imageMeta: allwainOfferCardImageMeta(offer),
  };
}

export async function listAllwainContractsForUser(userId: string) {
  const contracts = (await getAllwainContracts())
    .filter(
      (contract) =>
        contract.app === "allwain" &&
        !contract.operationalArchivedAt &&
        isAllwainContractParticipant(contract, userId),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return enrichAllwainContractsWithImages(contracts);
}

export async function listAllwainContractPage(
  userId: string,
  input: AllwainDiscoveryInput & {
    limit: number;
    cursor?: string | null;
    scope?: "buyer" | "seller" | null;
    statuses?: string[] | null;
    query?: string | null;
    offerId?: string | null;
    paymentStatuses?: string[] | null;
    fulfillmentStatuses?: string[] | null;
  },
) {
  validateDiscovery(input);
  input = { ...input, contractStatuses: allwainAgreementStatusFilters(input.contractStatuses) };
  if (usePostgres()) {
    const page = await getAllwainContractPagePg(userId, input);
    return {
      ...page,
      items: await enrichAllwainContractsWithImages(page.items),
    };
  }
  const all = (await listAllwainContractsForUser(userId)).filter((contract) => {
    if (input.offerId && contract.offerId !== input.offerId) return false;
    if (input.scope === "buyer" && contract.requesterUserId !== userId)
      return false;
    if (input.scope === "seller" && contract.providerUserId !== userId)
      return false;
    if (input.statuses?.length && !input.statuses.includes(contract.status))
      return false;
    if (input.contractStatuses?.length && !input.contractStatuses.includes(contract.status)) return false;
    if (input.paymentStatuses?.length && !input.paymentStatuses.includes(contract.paymentStatus || "not_started")) return false;
    if (input.fulfillmentStatuses?.length) return false; // Orders exist only in PostgreSQL storage.
    if (input.deliveryChannel && contract.deliveryChannel !== input.deliveryChannel) return false;
    if (!matchesDiscovery({ ...contract, title: contract.offerTitle }, { dateFrom: input.dateFrom, dateTo: input.dateTo })) return false;
    if (input.query) {
      const haystack = `${contract.id} ${contract.offerTitle || ""} ${contract.requesterName || ""} ${contract.providerName || ""}`.toLowerCase();
      if (!haystack.includes(input.query.toLowerCase())) return false;
    }
    return true;
  });
  return discoveryPage(all, input, "contracts", userId);
}

export async function getAllwainContractForUser(
  userId: string,
  contractId: string,
) {
  const contract = await getAllwainContractById(contractId);
  if (
    !contract ||
    contract.app !== "allwain" ||
    !isAllwainContractParticipant(contract, userId)
  ) {
    throw new Error("CONTRACT_NOT_FOUND");
  }
  return (await enrichAllwainContractsWithImages([contract]))[0];
}

async function hasAllwainOfferHistory(userId: string, offerId: string) {
  if (!usePostgres()) {
    return getContracts().some(
      (contract) =>
        contract.app === "allwain" &&
        contract.offerId === offerId &&
        isAllwainContractParticipant(contract, userId),
    );
  }
  const prisma = getPrisma();
  const [contract, order] = await Promise.all([
    prisma.contract.findFirst({
      where: {
        app: "allwain",
        offerId,
        OR: [{ requesterUserId: userId }, { providerUserId: userId }],
      },
      select: { id: true },
    }),
    prisma.allwainOrder.findFirst({
      where: {
        offerId,
        OR: [
          { buyerUserId: userId },
          { sellerUserId: userId },
          { connectorUserId: userId },
        ],
      },
      select: { id: true },
    }),
  ]);
  return Boolean(contract || order);
}

export async function getAllwainOfferForUser(userId: string, offerId: string) {
  const offer = await getAllwainOfferById(offerId);
  if (!offer) throw new Error("OFFER_NOT_FOUND");
  const requestId = offerRequestId(offer);
  const shoppingListId = offerShoppingListId(offer);
  let shoppingListDefaults: Record<string, unknown> | null = null;
  if (!requestId && !shoppingListId && offer.ownerUserId !== userId) {
    const owner = await getAllwainUserById(offer.ownerUserId);
    if (
      !isPublicCatalogOffer(offer, owner || null) &&
      !(await hasAllwainOfferHistory(userId, offer.id))
    ) {
      throw new Error("OFFER_NOT_FOUND");
    }
  }
  if (requestId && offer.ownerUserId !== userId) {
    const request = await findAllwainScanRequestById(requestId);
    if (
      (!request || request.userId !== userId) &&
      !(await hasAllwainOfferHistory(userId, offer.id))
    ) {
      throw new Error("OFFER_NOT_FOUND");
    }
  }
  if (shoppingListId && offer.ownerUserId !== userId) {
    const list = usePostgres() ? await (getPrisma() as any).allwainShoppingList.findUnique({
      where: { id: shoppingListId },
      select: {
        buyerUserId: true,
        recurrence: true,
        deliveryWindow: true,
        preferredDeliveryChannel: true,
        deliveryAddress: true,
      },
    }) : null;
    if (
      (!list || list.buyerUserId !== userId) &&
      !(await hasAllwainOfferHistory(userId, offer.id))
    ) {
      throw new Error("OFFER_NOT_FOUND");
    }
    if (list?.buyerUserId === userId) {
      shoppingListDefaults = {
        recurrence: list.recurrence,
        deliveryWindow: list.deliveryWindow,
        preferredDeliveryChannel: list.preferredDeliveryChannel,
        deliveryAddress: list.deliveryAddress,
      };
    }
  }
  const ownCatalog = offer.ownerUserId === userId && isCatalogOffer(offer);
  const committed = ownCatalog && (usePostgres()
    ? (await getAllwainCatalogCommittedOfferIdsPg([offer.id])).has(offer.id)
    : getContracts().some((contract) => contract.app === "allwain" && contract.offerId === offer.id));
  const ownMeta = ownCatalog ? {
    ...(offer.meta || {}),
    catalogTermsLocked: committed || readAllwainInventory(offer).reservedQuantity > 0 || readAllwainInventory(offer).soldQuantity > 0,
  } : offer.meta;
  return enrichAllwainOffer(
    shoppingListDefaults
      ? {
          ...offer,
          meta: {
            ...(ownMeta || {}),
            shoppingListDefaults,
          },
        }
      : { ...offer, meta: ownMeta },
  );
}

export async function acceptAllwainContract(
  userId: string,
  contractId: string,
) {
  if (usePostgres()) {
    const updated = await acceptAllwainContractWithInventoryPg(
      contractId,
      userId,
    );
    return (await enrichAllwainContractsWithImages([updated]))[0];
  }
  const contract = await getAllwainContractById(contractId);
  if (
    !contract ||
    contract.app !== "allwain" ||
    !isAllwainContractParticipant(contract, userId)
  ) {
    throw new Error("CONTRACT_NOT_FOUND");
  }

  if (contract.status === "accepted") {
    return (await enrichAllwainContractsWithImages([contract]))[0];
  }
  if (contract.status !== "draft" && contract.status !== "partially_accepted") {
    throw new Error("INVALID_CONTRACT_STATUS");
  }

  const acceptance = nextAllwainContractAcceptance(contract, userId);
  let inventoryStatus = contract.inventoryStatus;
  if (
    acceptance.status === "accepted" &&
    inventoryStatus === "reserved" &&
    contract.offerId &&
    typeof contract.quantity === "number"
  ) {
    if (!allwainPaymentsConfigured() || !contract.subtotalAmount) {
      const offer = getOfferById(contract.offerId);
      if (offer?.owner === "allwain") {
        updateOffer({
          ...offer,
          meta: commitAllwainStock(offer, contract.quantity),
        });
        inventoryStatus = "sold";
      }
    }
  }
  const paymentStatus =
    acceptance.status !== "accepted"
      ? contract.paymentStatus
      : allwainPaymentsConfigured() && contract.subtotalAmount
        ? "awaiting_payment"
        : contract.subtotalAmount
          ? "legacy_confirmed"
          : "not_required";
  const updated = updateContractDetails(contractId, {
    ...acceptance,
    inventoryStatus,
    paymentStatus,
  });
  if (!updated) throw new Error("CONTRACT_NOT_FOUND");
  return (await enrichAllwainContractsWithImages([updated]))[0];
}

async function recoverJsonAllwainRejectedRequest(contract: Contract) {
  if (!contract.requestId || contract.shoppingListId) return;
  const request = getAllwainScanRequests().find(row => row.id === contract.requestId);
  const offers = getOffersByOwner("allwain").filter(row => offerRequestId(row) === contract.requestId);
  const contracts = getContracts().filter(row => row.app === "allwain" && row.requestId === contract.requestId);
  const eligibleSellerIds = offers.filter(row => {
    const seller = getUserById(row.ownerUserId);
    return seller && !seller.deletedAt && (!seller.status || seller.status === "active");
  }).map(row => row.ownerUserId).filter((id): id is string => Boolean(id));
  const plan = planAllwainRequestRecovery({ request, contract, contracts, offers, eligibleSellerIds, reason: "contract_rejected" });
  if (plan && request) {
    for (const patch of plan.offerPatches) {
      const proposal = getOfferById(patch.id);
      if (proposal) updateOffer({ ...proposal, ...patch } as Offer);
    }
    await persistAllwainScanRequest({ ...request, ...plan.requestPatch, updatedAt: plan.requestPatch.updatedAt.toISOString() } as AllwainScanRequest);
  }
}

export async function rejectAllwainContract(
  userId: string,
  contractId: string,
) {
  if (usePostgres()) {
    const updated = await rejectAllwainContractWithInventoryPg(
      contractId,
      userId,
    );
    return (await enrichAllwainContractsWithImages([updated]))[0];
  }
  const contract = await getAllwainContractById(contractId);
  if (
    !contract ||
    contract.app !== "allwain" ||
    !isAllwainContractParticipant(contract, userId)
  ) {
    throw new Error("CONTRACT_NOT_FOUND");
  }
  if (contract.status === "rejected") {
    await recoverJsonAllwainRejectedRequest(contract);
    return (await enrichAllwainContractsWithImages([contract]))[0];
  }
  if (contract.status === "accepted")
    throw new Error("INVALID_CONTRACT_STATUS");
  if (allwainAttemptHasFinancialRisk(contract, [], [])) throw new Error("INVALID_CONTRACT_STATUS");
  let inventoryStatus = contract.inventoryStatus;
  if (
    inventoryStatus === "reserved" &&
    contract.offerId &&
    typeof contract.quantity === "number"
  ) {
    const offer = getOfferById(contract.offerId);
    if (offer?.owner === "allwain") {
      const released = releaseAllwainOfferStock(offer, contract.quantity);
      updateOffer({
        ...offer,
        ...released,
      });
      inventoryStatus = "released";
    }
  }
  const updated = updateContractDetails(contractId, {
    status: "rejected",
    inventoryStatus,
  });
  if (!updated) throw new Error("CONTRACT_NOT_FOUND");
  await recoverJsonAllwainRejectedRequest(updated);
  return (await enrichAllwainContractsWithImages([updated]))[0];
}

export async function exportAllwainContractPdf(
  userId: string,
  contractId: string,
) {
  const contract = await getAllwainContractById(contractId);
  if (
    !contract ||
    contract.app !== "allwain" ||
    !isAllwainContractParticipant(contract, userId)
  ) {
    throw new Error("CONTRACT_NOT_FOUND");
  }

  const lines = [
    `Acuerdo: ${contract.offerTitle || "Oferta Allwain"}`,
    `ID: ${contract.id}`,
    `Estado: ${contract.status}`,
    `Cliente: ${contract.requesterName || "-"}`,
    `Proveedor: ${contract.providerName || "-"}`,
    typeof contract.quantity === "number"
      ? `Cantidad: ${contract.quantity} ${contract.unit || "unidades"}`
      : null,
    typeof contract.unitPrice === "number"
      ? `Precio unitario: ${contract.unitPrice.toFixed(2)} EUR`
      : null,
    typeof contract.totalPrice === "number"
      ? `Total: ${contract.totalPrice.toFixed(2)} EUR`
      : null,
    contract.notes || null,
    `Creado: ${contract.createdAt}`,
    "",
    ...(contract.generatedText || "Acuerdo sin texto").split("\n"),
  ].filter((line): line is string => line !== null);

  return {
    filename: `allwain-acuerdo-${contract.id}.pdf`,
    buffer: buildTextPdf({ title: "Acuerdo Allwain", lines }),
  };
}

/* =========================
   ORDER GROUPS
========================= */

export async function listOrderGroups() {
  return usePostgres() ? getOrderGroupsPg() : getOrderGroups();
}

export async function createOrderGroup(
  productId: string,
  minUnitsPerClient: number,
): Promise<OrderGroup> {
  const group: OrderGroup = {
    id: randomUUID(),
    productId,
    totalUnits: 0,
    minUnitsPerClient,
    status: "open",
    participants: [],
  };

  return usePostgres() ? createOrderGroupPg(group) : addOrderGroup(group);
}

export async function joinOrderGroup(
  groupId: string,
  userId: string,
  units: number,
) {
  const groups = usePostgres() ? await getOrderGroupsPg() : getOrderGroups();
  const group = groups.find((g) => g.id === groupId);
  if (!group) throw new Error("GROUP_NOT_FOUND");

  const participants = group.participants as any[];

  const participant = participants.find((p) => p.userId === userId);
  if (participant) participant.units += units;
  else participants.push({ userId, units });

  group.totalUnits += units;
  group.participants = participants;

  return usePostgres() ? updateOrderGroupPg(group) : updateOrderGroup(group);
}

/* =========================
   SAVINGS + REFERRALS
========================= */

export async function registerSaving(
  userId: string,
  amount: number,
): Promise<{ saving: AllwainSavingTransaction; referral?: ReferralStat }> {
  const user = usePostgres()
    ? await getUserByIdPg(userId)
    : getUserById(userId);
  if (!user) throw new Error("USER_NOT_FOUND");

  const saving: AllwainSavingTransaction = {
    id: randomUUID(),
    userId,
    amount,
    createdAt: new Date().toISOString(),
  };

  if (usePostgres()) await addSavingPg(saving);
  else addSaving(saving);

  user.allwainBalance = ((user as any).allwainBalance || 0) + amount;
  (user as any).role = normalizeRole((user as any).role);
  if (usePostgres()) await upsertUserPg(user as any);
  else upsertUser(user as any);

  let referral: ReferralStat | undefined;

  if ((user as any).referredByCode) {
    const stats = usePostgres()
      ? await getReferralStatsByUserPg((user as any).referredByCode)
      : getReferralStatsByUser((user as any).referredByCode);
    const sponsorId = (stats as any)?.[0]?.userId;

    if (sponsorId) {
      const sponsor = usePostgres()
        ? await getUserByIdPg(sponsorId)
        : getUserById(sponsorId);
      if (sponsor) {
        const commission = amount * 0.1;

        (sponsor as any).allwainBalance =
          ((sponsor as any).allwainBalance || 0) + commission;
        (sponsor as any).role = normalizeRole((sponsor as any).role);
        if (usePostgres()) await upsertUserPg(sponsor as any);
        else upsertUser(sponsor as any);

        referral = {
          id: randomUUID(),
          userId: (sponsor as any).id,
          invitedUserId: (user as any).id,
          totalSavedByInvited: amount,
          commissionEarned: commission,
          monthlyHistory: [],
        };

        if (usePostgres()) await addReferralStatPg(referral);
        else addReferralStat(referral);
      }
    }
  }

  return { saving, referral };
}

export async function getSponsorSummary(userId: string) {
  const stats = usePostgres()
    ? await getReferralStatsByUserPg(userId)
    : getReferralStatsByUser(userId);

  const totalInvited = stats.length;
  const totalSaved = (stats as any[]).reduce(
    (s, r) => s + (r.totalSavedByInvited || 0),
    0,
  );
  const totalCommission = (stats as any[]).reduce(
    (s, r) => s + (r.commissionEarned || 0),
    0,
  );

  return {
    totalInvited,
    totalSaved,
    totalCommission,
    referrals: stats,
  };
}
