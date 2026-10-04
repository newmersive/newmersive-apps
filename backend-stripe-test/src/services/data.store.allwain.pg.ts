import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";
import {
  Contract,
  Offer,
  Product,
  OrderGroup,
  AllwainSavingTransaction,
  ReferralStat,
  AllwainScanRequest,
} from "../shared/types";
import {
  isAllwainOfferArchived,
  archiveAllwainOfferMeta,
  commitAllwainStock,
  readAllwainInventory,
  releaseAllwainOfferStock,
  reserveAllwainStock,
  updateAllwainInventoryLimits,
} from "./allwain-inventory";
import { appendAllwainAuditEventTx } from "./allwain-audit";
import { ensureAllwainOrderComplianceTx } from "./allwain-compliance.service";
import { allwainReservationDeadline } from "./allwain-payment-state";
import {
  allwainBusinessOfRecord,
  calculateAllwainDeliveryAllocation,
  calculateAllwainSavingsMoney,
  initialAllwainOrderSettlement,
  normalizeAllwainCommercialModel,
} from "./allwain-money";
import {
  allwainProposalSnapshotHash,
  assertAllwainProposalActive,
} from "./allwain-proposals";
import {
  ALLWAIN_OPEN_SHOPPING_LIST_STATUSES,
  listActiveAllwainShoppingListAwardLines,
  refreshAllwainShoppingListAwardStateTx,
} from "./allwain-shopping-list-awards";

/* =========================
   PRODUCTS
========================= */

export async function getRandomProductPg(): Promise<Product | null> {
  const prisma = getPrisma();
  const count = await prisma.product.count({ where: { visibility: "public" } });
  if (!count) return null;
  return (await prisma.product.findFirst({
    where: { visibility: "public" },
    orderBy: { id: "asc" },
    skip: Math.floor(Math.random() * count),
  })) as any;
}

export async function getProductByEANPg(ean: string): Promise<Product | null> {
  const prisma = getPrisma();
  return (await prisma.product.findFirst({
    where: { ean, visibility: "public" },
  })) as any;
}

export async function getAllwainProductMatchCandidatesPg(input: {
  productName?: string | null;
  ean?: string | null;
  category?: string | null;
  brand?: string | null;
  limit?: number;
}): Promise<Product[]> {
  const prisma = getPrisma();
  const limit = Math.min(100, Math.max(1, Math.trunc(input.limit || 50)));
  const productName = String(input.productName || "").trim();
  const ean = String(input.ean || "").trim();
  const category = String(input.category || "").trim();
  const brand = String(input.brand || "").trim();
  const nameTokens = productName
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .slice(0, 4);
  const exactEan = ean
    ? await prisma.product.findFirst({
        where: { ean, visibility: "public" },
      })
    : null;
  const filters: Prisma.ProductWhereInput[] = [
    ...(productName
      ? [{ name: { contains: productName, mode: "insensitive" as const } }]
      : []),
    ...nameTokens.map((token) => ({
      name: { contains: token, mode: "insensitive" as const },
    })),
    ...(category
      ? [{ category: { equals: category, mode: "insensitive" as const } }]
      : []),
    ...(brand
      ? [{ brand: { equals: brand, mode: "insensitive" as const } }]
      : []),
  ];
  const rows = filters.length
    ? await prisma.product.findMany({
        where: { visibility: "public", OR: filters },
        take: limit,
      })
    : [];
  const unique = new Map<string, Product>();
  if (exactEan) unique.set(exactEan.id, exactEan as any);
  for (const row of rows) unique.set(row.id, row as any);
  return [...unique.values()].slice(0, limit);
}

/* =========================
   OFFERS
========================= */

export async function getAllwainOffersPg(): Promise<Offer[]> {
  const prisma = getPrisma();
  const offers = (await prisma.offer.findMany({
    where: { owner: "allwain" },
  })) as any[];
  return offers.filter((offer) => !isAllwainOfferArchived(offer)) as any;
}

export interface AllwainOfferPageInput {
  limit: number;
  cursor?: string | null;
  query?: string | null;
  category?: string | null;
  subcategory?: string | null;
  productKind?: string | null;
  currency?: string | null;
  unit?: string | null;
  status?: string | null;
  ownerUserId?: string | null;
  excludeOwnerUserId?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  sort?: "newest" | "price_asc" | "price_desc";
  searchOwnerUserIds?: string[] | null;
}

export async function getAllwainOfferPagePg(input: AllwainOfferPageInput) {
  const prisma = getPrisma();
  const activeStatus = input.status
    ? { allwainStatus: input.status }
    : {
        OR: [
          {
            allwainStatus: {
              in: input.ownerUserId
                ? ["active", "paused", "sold_out"]
                : ["active"],
            },
          },
          { allwainStatus: null },
        ],
      };
  const where: Prisma.OfferWhereInput = {
    owner: "allwain",
    requestId: null,
    shoppingListId: null,
    AND: [
      activeStatus,
      input.query
        ? {
            OR: [
              { title: { contains: input.query, mode: "insensitive" } },
              { description: { contains: input.query, mode: "insensitive" } },
              { category: { contains: input.query, mode: "insensitive" } },
              { subcategory: { contains: input.query, mode: "insensitive" } },
              { locationLabel: { contains: input.query, mode: "insensitive" } },
              ...(input.searchOwnerUserIds?.length
                ? [{ ownerUserId: { in: input.searchOwnerUserIds } }]
                : []),
            ],
          }
        : {},
    ],
    ...(input.category
      ? { category: { equals: input.category, mode: "insensitive" } }
      : {}),
    ...(input.subcategory
      ? { subcategory: { equals: input.subcategory, mode: "insensitive" } }
      : {}),
    ...(input.productKind ? { productKind: input.productKind } : {}),
    ...(input.currency ? { currency: input.currency.toUpperCase() } : {}),
    ...(input.unit
      ? { unit: { equals: input.unit, mode: "insensitive" } }
      : {}),
    ...(input.ownerUserId ? { ownerUserId: input.ownerUserId } : {}),
    ...(input.excludeOwnerUserId
      ? { NOT: { ownerUserId: input.excludeOwnerUserId } }
      : {}),
    ...(input.minPrice !== null && input.minPrice !== undefined
      ? { price: { gte: input.minPrice } }
      : {}),
  };
  if (input.maxPrice !== null && input.maxPrice !== undefined) {
    where.price = {
      ...((where.price as Prisma.FloatNullableFilter) || {}),
      lte: input.maxPrice,
    };
  }
  const orderBy: Prisma.OfferOrderByWithRelationInput[] =
    input.sort === "price_asc"
      ? [{ price: "asc" }, { id: "asc" }]
      : input.sort === "price_desc"
        ? [{ price: "desc" }, { id: "desc" }]
        : [{ createdAt: "desc" }, { id: "desc" }];
  const rows = await prisma.offer.findMany({
    where,
    orderBy,
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const hasNextPage = rows.length > input.limit;
  const pageRows = hasNextPage ? rows.slice(0, input.limit) : rows;
  return {
    items: pageRows.map(mapOfferRow),
    pageInfo: {
      hasNextPage,
      nextCursor: hasNextPage
        ? pageRows[pageRows.length - 1]?.id || null
        : null,
    },
  };
}

export async function getAllwainSellerIdsMatchingPg(
  query: string,
  limit = 100,
) {
  const prisma = getPrisma();
  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      name: { contains: query, mode: "insensitive" },
    },
    select: { id: true },
    take: limit,
  });
  const profiles = await prisma.allwainSellerProfile.findMany({
    where: {
      status: "active",
      OR: [
        { displayName: { contains: query, mode: "insensitive" } },
        { locationLabel: { contains: query, mode: "insensitive" } },
        { sellerType: { contains: query, mode: "insensitive" } },
      ],
    },
    select: { userId: true },
    take: limit,
  });
  return [
    ...new Set([
      ...users.map((item) => item.id),
      ...profiles.map((item) => item.userId),
    ]),
  ].slice(0, limit);
}

export async function getAllwainOfferProviderSummariesPg(userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return new Map<string, any>();
  const prisma = getPrisma();
  const [users, reputations] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, name: true },
    }),
    prisma.allwainReputation.findMany({
      where: { userId: { in: ids } },
      select: {
        userId: true,
        averageRating: true,
        reviewCount: true,
        completedOrders: true,
      },
    }),
  ]);
  const reputationByUser = new Map(
    reputations.map((item) => [item.userId, item]),
  );
  return new Map(
    users.map((user) => {
      const reputation = reputationByUser.get(user.id);
      return [
        user.id,
        {
          id: user.id,
          name: user.name,
          score: reputation ? Number(reputation.averageRating) : 0,
          reviewCount: reputation?.reviewCount || 0,
          completedOrders: reputation?.completedOrders || 0,
        },
      ];
    }),
  );
}

export async function getAllwainOffersForRequestPg(
  requestId: string,
): Promise<Offer[]> {
  const prisma = getPrisma();
  const offers = await prisma.offer.findMany({
    where: {
      owner: "allwain",
      requestId,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return offers.map(mapOfferRow);
}

export async function addAllwainOfferPg(
  offer: Offer,
  productCompliance?: Record<string, unknown>,
): Promise<Offer> {
  const prisma = getPrisma();
  if (!productCompliance) {
    return (await prisma.offer.create({ data: offer as any })) as any;
  }
  return prisma.$transaction(async (tx: any) => {
    const created = await tx.offer.create({ data: offer as any });
    await tx.allwainProductComplianceProfile.create({
      data: {
        offerId: created.id,
        sellerUserId: offer.ownerUserId,
        ...productCompliance,
      },
    });
    return created as any;
  });
}

export async function upsertAllwainRequestProposalPg(input: {
  offer: Offer;
  requestId: string;
  sellerUserId: string;
  totalAmount: number;
  referenceAmount: number | null;
  validUntil: Date;
  deliveryEstimate: string;
  snapshotPayload: Record<string, unknown>;
}): Promise<Offer> {
  const prisma = getPrisma() as any;
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`request_proposal:${input.requestId}:${input.sellerUserId}`}))`,
    );
    const requestRows = (await tx.$queryRaw(
      Prisma.sql`SELECT * FROM "AllwainScanRequest" WHERE "id" = ${input.requestId} FOR UPDATE`,
    )) as any[];
    const request = requestRows[0];
    if (
      !request ||
      request.status !== "submitted" ||
      request.visibility !== "public" ||
      request.userId === input.sellerUserId ||
      request.selectedOfferId
    ) {
      throw new Error("MARKET_REQUEST_NOT_FOUND");
    }

    const existingRows = (await tx.$queryRaw(
      Prisma.sql`SELECT * FROM "Offer" WHERE "owner" = 'allwain' AND "requestId" = ${input.requestId} AND "ownerUserId" = ${input.sellerUserId} ORDER BY "createdAt" ASC LIMIT 1 FOR UPDATE`,
    )) as any[];
    const existing = existingRows[0] || null;
    if (
      existing &&
      !["active", "paused", "withdrawn"].includes(
        String(existing.allwainStatus || "active"),
      )
    ) {
      throw new Error("PROPOSAL_NOT_EDITABLE");
    }
    const existingAmount = existing?.price
      ? Math.round(Number(existing.price) * 100)
      : null;
    if (existingAmount !== null && input.totalAmount > existingAmount) {
      throw new Error("PROPOSAL_NOT_IMPROVED");
    }

    const latestRevision = existing
      ? await tx.allwainProposalRevision.findFirst({
          where: { offerId: existing.id },
          orderBy: { revision: "desc" },
          select: { revision: true },
        })
      : null;
    const revision = Math.max(
      Number(existing?.proposalRevision || 0),
      Number(latestRevision?.revision || 0),
    ) + 1;
    const offerId = existing?.id || input.offer.id;
    const snapshot = {
      version: "allwain-proposal-revision-v1",
      offerId,
      revision,
      sellerUserId: input.sellerUserId,
      requestId: input.requestId,
      shoppingListId: null,
      totalAmount: input.totalAmount,
      referenceAmount: input.referenceAmount,
      grossSavingsAmount:
        input.referenceAmount === null
          ? null
          : input.referenceAmount - input.totalAmount,
      currency: String(input.offer.currency || "EUR").toUpperCase(),
      validUntil: input.validUntil.toISOString(),
      description: input.offer.description,
      deliveryEstimate: input.deliveryEstimate,
      payload: input.snapshotPayload,
    };
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...base } =
      input.offer as any;
    const offerData = {
      ...base,
      requestId: input.requestId,
      ownerUserId: input.sellerUserId,
      proposalExpiresAt: input.validUntil,
      proposalRevision: revision,
      allwainStatus: "active",
      meta: {
        ...((input.offer.meta || {}) as Record<string, unknown>),
        validUntil: input.validUntil.toISOString(),
        proposalRevision: revision,
      },
    };
    const offer = existing
      ? await tx.offer.update({ where: { id: existing.id }, data: offerData })
      : await tx.offer.create({ data: { id: offerId, ...offerData } });

    if (existing) {
      await tx.allwainProposalRevision.updateMany({
        where: { offerId, status: "current" },
        data: { status: "superseded" },
      });
    }
    const revisionRow = await tx.allwainProposalRevision.create({
      data: {
        id: randomUUID(),
        offerId,
        revision,
        sellerUserId: input.sellerUserId,
        requestId: input.requestId,
        totalAmount: input.totalAmount,
        referenceAmount: input.referenceAmount,
        grossSavingsAmount:
          input.referenceAmount === null
            ? null
            : input.referenceAmount - input.totalAmount,
        currency: String(input.offer.currency || "EUR").toUpperCase(),
        validUntil: input.validUntil,
        description: input.offer.description,
        deliveryEstimate: input.deliveryEstimate,
        payload: input.snapshotPayload,
        snapshotHash: allwainProposalSnapshotHash(snapshot),
        status: "current",
      },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateType: "market_request",
      aggregateId: input.requestId,
      eventType: existing
        ? "market_request.proposal_revised"
        : "market_request.proposal_submitted",
      actorUserId: input.sellerUserId,
      actorRole: "seller",
      source: "allwain_market_request",
      payload: {
        offerId,
        proposalRevisionId: revisionRow.id,
        revision,
        previousAmount: existingAmount,
        totalAmount: input.totalAmount,
        referenceAmount: input.referenceAmount,
        grossSavingsAmount: revisionRow.grossSavingsAmount,
        validUntil: input.validUntil.toISOString(),
        snapshotHash: revisionRow.snapshotHash,
      },
    });
    return mapOfferRow(offer);
  });
}

function mapOfferRow(row: any): Offer {
  return {
    ...row,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : row.createdAt,
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : row.updatedAt,
    proposalExpiresAt:
      row.proposalExpiresAt instanceof Date
        ? row.proposalExpiresAt.toISOString()
        : row.proposalExpiresAt,
  };
}

function mapContractRow(row: any): Contract {
  return {
    ...row,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : row.createdAt,
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : row.updatedAt,
    requesterAcceptedAt:
      row.requesterAcceptedAt instanceof Date
        ? row.requesterAcceptedAt.toISOString()
        : row.requesterAcceptedAt,
    providerAcceptedAt:
      row.providerAcceptedAt instanceof Date
        ? row.providerAcceptedAt.toISOString()
        : row.providerAcceptedAt,
  };
}

function canCreateAllwainOrder(contract: Contract) {
  return Boolean(
    contract.offerId &&
    contract.requesterUserId &&
    contract.providerUserId &&
    typeof contract.quantity === "number" &&
    contract.quantity > 0 &&
    contract.unit &&
    typeof contract.unitPrice === "number" &&
    typeof contract.subtotalAmount === "number" &&
    typeof contract.platformFeeBps === "number" &&
    typeof contract.platformFeeAmount === "number" &&
    typeof contract.sellerAmount === "number" &&
    contract.currency,
  );
}

async function ensureAllwainOrderTx(
  tx: any,
  contract: Contract,
  status: string,
  source: string,
  actorUserId?: string,
) {
  if (!canCreateAllwainOrder(contract)) return null;

  const existing = await tx.allwainOrder.findUnique({
    where: { contractId: contract.id },
  });
  const terminalStatuses = new Set([
    "paid",
    "completed",
    "refunded",
    "canceled",
    "expired",
    "dispute_lost",
  ]);
  const nextStatus =
    existing && terminalStatuses.has(existing.status)
      ? existing.status
      : status;
  const paymentStatus =
    existing && terminalStatuses.has(existing.status)
      ? existing.paymentStatus
      : nextStatus;
  const shippingAmount = Number(contract.shippingAmount || 0);
  const commercialModel = normalizeAllwainCommercialModel(
    contract.commercialModel,
  );
  const businessOfRecord = allwainBusinessOfRecord(commercialModel);
  const initialSettlement = initialAllwainOrderSettlement(
    contract.platformFeeAmount as number,
    {
      platformNetFeeAmount:
        contract.platformNetFeeAmount ?? contract.platformFeeAmount ?? 0,
      connectorFeeAmount: contract.connectorFeeAmount || 0,
      connectorPlatformShareAmount: contract.connectorPlatformShareAmount || 0,
      connectorDeliveryAmount: contract.connectorDeliveryAmount || 0,
      carrierDeliveryAmount: contract.carrierDeliveryAmount || 0,
    },
    commercialModel,
  );
  const platformRetainedAmount =
    commercialModel === "platform_direct"
      ? Number(contract.platformRetainedAmount ?? contract.subtotalAmount ?? 0)
      : initialSettlement.platformNetFeeAmount;
  const platformFeePayer = contract.platformFeePayer || "seller";
  const buyerPlatformFeeAmount =
    platformFeePayer === "buyer" ? Number(contract.platformFeeAmount || 0) : 0;
  const data = {
    offerId: contract.offerId as string,
    shoppingListId: contract.shoppingListId || null,
    acceptedProposalRevisionId: contract.acceptedProposalRevisionId || null,
    buyerUserId: contract.requesterUserId as string,
    sellerUserId: contract.providerUserId as string,
    buyerCapacity: contract.buyerCapacity || "consumer",
    paymentMode: contract.paymentMode || "immediate",
    preorderChargeDeadlineAt: contract.preorderChargeDeadlineAt || null,
    status: nextStatus,
    paymentStatus,
    fulfillmentStatus: existing?.fulfillmentStatus || "not_started",
    quantity: contract.quantity as number,
    unit: contract.unit as string,
    unitPriceAmount: Math.round((contract.unitPrice as number) * 100),
    subtotalAmount: contract.subtotalAmount as number,
    shippingAmount,
    carrierDeliveryAmount: initialSettlement.carrierDeliveryAmount,
    carrierQuoteId: contract.carrierQuoteId || null,
    totalAmount:
      (contract.subtotalAmount as number) +
      shippingAmount +
      buyerPlatformFeeAmount,
    currency: contract.currency as string,
    platformFeeBps: contract.platformFeeBps as number,
    platformFeeAmount: contract.platformFeeAmount as number,
    platformNetFeeAmount: initialSettlement.platformNetFeeAmount,
    platformRetainedAmount,
    connectorFeeAmount: initialSettlement.connectorFeeAmount,
    connectorPlatformShareAmount:
      initialSettlement.connectorPlatformShareAmount,
    connectorDeliveryAmount: initialSettlement.connectorDeliveryAmount,
    sellerAmount: contract.sellerAmount as number,
    feeBasis: contract.feeBasis || "sale_amount",
    platformFeePayer,
    referenceAmount: contract.referenceAmount ?? null,
    acceptedOfferAmount: contract.acceptedOfferAmount ?? null,
    grossSavingsAmount: contract.grossSavingsAmount ?? null,
    netSavingsAmount: contract.netSavingsAmount ?? null,
    commercialModel,
    commercialTermsVersion: ENV.ALLWAIN_COMMERCIAL_TERMS_VERSION,
    businessOfRecord,
    processorFeePayer: "platform",
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
    deliveryPricingSnapshot: contract.deliveryPricingSnapshot || undefined,
    reservationExpiresAt:
      (source === "agreement_accepted" &&
      contract.inventoryStatus === "reserved"
        ? allwainReservationDeadline()
        : existing?.reservationExpiresAt) ||
      (contract.inventoryStatus === "reserved"
        ? allwainReservationDeadline()
        : null),
  };

  if (!existing) {
    const created = await tx.allwainOrder.create({
      data: {
        contractId: contract.id,
        ...data,
        paymentArchitecture: initialSettlement.paymentArchitecture,
        sellerTransferStatus: initialSettlement.sellerTransferStatus,
        connectorTransferStatus: initialSettlement.connectorTransferStatus,
      },
    });
    await tx.allwainOrderStatusEvent.create({
      data: {
        orderId: created.id,
        fromStatus: null,
        toStatus: created.status,
        actorUserId: contract.requesterUserId,
        source,
      },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateId: created.id,
      eventType: "order.created",
      actorUserId: actorUserId || contract.requesterUserId,
      source,
      payload: {
        contractId: created.contractId,
        offerId: created.offerId,
        shoppingListId: created.shoppingListId,
        buyerUserId: created.buyerUserId,
        sellerUserId: created.sellerUserId,
        paymentMode: created.paymentMode,
        paymentStatus: created.paymentStatus,
        fulfillmentStatus: created.fulfillmentStatus,
        quantity: created.quantity,
        unit: created.unit,
        subtotalAmount: created.subtotalAmount,
        shippingAmount: created.shippingAmount,
        carrierDeliveryAmount: created.carrierDeliveryAmount,
        carrierQuoteId: created.carrierQuoteId,
        totalAmount: created.totalAmount,
        currency: created.currency,
        platformFeeAmount: created.platformFeeAmount,
        feeBasis: created.feeBasis,
        platformFeePayer: created.platformFeePayer,
        referenceAmount: created.referenceAmount,
        acceptedOfferAmount: created.acceptedOfferAmount,
        grossSavingsAmount: created.grossSavingsAmount,
        netSavingsAmount: created.netSavingsAmount,
        acceptedProposalRevisionId: created.acceptedProposalRevisionId,
        platformNetFeeAmount: created.platformNetFeeAmount,
        platformRetainedAmount: created.platformRetainedAmount,
        connectorFeeAmount: created.connectorFeeAmount,
        connectorPlatformShareAmount: created.connectorPlatformShareAmount,
        connectorDeliveryAmount: created.connectorDeliveryAmount,
        sellerAmount: created.sellerAmount,
        commercialModel: created.commercialModel,
        businessOfRecord: created.businessOfRecord,
        inventoryStatus: created.inventoryStatus,
        reservationExpiresAt: created.reservationExpiresAt,
        deliveryMethod: created.deliveryMethod,
        deliveryChannel: created.deliveryChannel,
      },
    });
    await ensureAllwainOrderComplianceTx(tx, created);
    return created;
  }

  if (
    existing.commercialTermsAcceptedAt ||
    [
      "checkout_locked",
      "locked",
      "settled",
      "partially_refunded",
      "refunded",
    ].includes(existing.settlementStatus)
  ) {
    return existing;
  }

  const updated = await tx.allwainOrder.update({
    where: { id: existing.id },
    data,
  });
  if (existing.status !== updated.status) {
    await tx.allwainOrderStatusEvent.create({
      data: {
        orderId: updated.id,
        fromStatus: existing.status,
        toStatus: updated.status,
        source,
      },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateId: updated.id,
      eventType: "order.status_changed",
      actorUserId,
      source,
      payload: {
        fromStatus: existing.status,
        toStatus: updated.status,
        fromPaymentStatus: existing.paymentStatus,
        toPaymentStatus: updated.paymentStatus,
        inventoryStatus: updated.inventoryStatus,
      },
    });
  }
  await ensureAllwainOrderComplianceTx(tx, updated);
  return updated;
}

async function lockAllwainOffer(
  tx: any,
  offerId: string,
): Promise<Offer | null> {
  const rows = (await tx.$queryRaw(
    Prisma.sql`SELECT * FROM "Offer" WHERE "id" = ${offerId} AND "owner" = 'allwain' FOR UPDATE`,
  )) as any[];
  return rows[0] ? mapOfferRow(rows[0]) : null;
}

async function lockAllwainContract(
  tx: any,
  contractId: string,
): Promise<Contract | null> {
  const rows = (await tx.$queryRaw(
    Prisma.sql`SELECT * FROM "Contract" WHERE "id" = ${contractId} AND "app" = 'allwain' FOR UPDATE`,
  )) as any[];
  return rows[0] ? mapContractRow(rows[0]) : null;
}

async function lockAllwainScanRequest(tx: any, requestId: string) {
  const rows = (await tx.$queryRaw(
    Prisma.sql`SELECT * FROM "AllwainScanRequest" WHERE "id" = ${requestId} FOR UPDATE`,
  )) as any[];
  return rows[0] || null;
}

async function lockAllwainShoppingList(tx: any, shoppingListId: string) {
  const rows = (await tx.$queryRaw(
    Prisma.sql`SELECT * FROM "AllwainShoppingList" WHERE "id" = ${shoppingListId} FOR UPDATE`,
  )) as any[];
  return rows[0] || null;
}

export async function createAllwainAgreementWithStockPg(input: {
  offerId: string;
  userId: string;
  quantity: number;
  contract: Contract;
}): Promise<Contract> {
  const prisma = getPrisma() as any;
  return prisma.$transaction(async (tx: any) => {
    if (input.contract.purchaseKey) {
      const existing = await tx.contract.findUnique({
        where: { purchaseKey: input.contract.purchaseKey },
      });
      if (existing) {
        if (
          existing.app !== "allwain" ||
          existing.offerId !== input.offerId ||
          existing.requesterUserId !== input.userId
        ) {
          throw new Error("IDEMPOTENCY_KEY_REUSED");
        }
        return mapContractRow(existing);
      }
    }

    const initialOfferRow = await tx.offer.findFirst({
      where: { id: input.offerId, owner: "allwain" },
    });
    if (!initialOfferRow) throw new Error("OFFER_NOT_FOUND");
    const initialOffer = mapOfferRow(initialOfferRow);
    const initialRequestId =
      input.contract.requestId ||
      initialOffer.requestId ||
      (typeof initialOffer.meta?.requestId === "string"
        ? initialOffer.meta.requestId
        : null);
    const initialShoppingListId =
      input.contract.shoppingListId ||
      initialOffer.shoppingListId ||
      (typeof initialOffer.meta?.shoppingListId === "string"
        ? initialOffer.meta.shoppingListId
        : null);

    // Competing proposals share one aggregate. Lock it before an individual
    // offer so two selections cannot deadlock while closing the alternatives.
    const request = initialRequestId
      ? await lockAllwainScanRequest(tx, initialRequestId)
      : null;
    const shoppingList = initialShoppingListId
      ? await lockAllwainShoppingList(tx, initialShoppingListId)
      : null;
    const offer = await lockAllwainOffer(tx, input.offerId);
    if (!offer) throw new Error("OFFER_NOT_FOUND");
    if (input.contract.purchaseKey) {
      const existingAfterLock = await tx.contract.findUnique({
        where: { purchaseKey: input.contract.purchaseKey },
      });
      if (existingAfterLock) {
        if (
          existingAfterLock.app !== "allwain" ||
          existingAfterLock.offerId !== input.offerId ||
          existingAfterLock.requesterUserId !== input.userId
        ) {
          throw new Error("IDEMPOTENCY_KEY_REUSED");
        }
        return mapContractRow(existingAfterLock);
      }
    }

    const requestId =
      input.contract.requestId ||
      offer.requestId ||
      (typeof offer.meta?.requestId === "string" ? offer.meta.requestId : null);
    const shoppingListId =
      input.contract.shoppingListId ||
      offer.shoppingListId ||
      (typeof offer.meta?.shoppingListId === "string"
        ? offer.meta.shoppingListId
        : null);
    if (
      requestId !== initialRequestId ||
      shoppingListId !== initialShoppingListId
    ) {
      throw new Error("OFFER_NOT_AVAILABLE");
    }
    if (requestId) {
      if (
        !request ||
        request.userId !== input.userId ||
        request.status !== "submitted" ||
        request.selectedOfferId
      ) {
        throw new Error("MARKET_REQUEST_NOT_OPEN");
      }
      if (offer.allwainType && offer.allwainType !== "proposal") {
        throw new Error("OFFER_NOT_FOUND");
      }
      if (
        offer.allwainStatus &&
        !["active", "selected"].includes(offer.allwainStatus)
      ) {
        throw new Error("OFFER_NOT_AVAILABLE");
      }
    }
    if (shoppingListId) {
      if (
        !shoppingList ||
        shoppingList.buyerUserId !== input.userId ||
        !ALLWAIN_OPEN_SHOPPING_LIST_STATUSES.includes(shoppingList.status) ||
        offer.shoppingListId !== shoppingListId
      ) {
        throw new Error("SHOPPING_LIST_NOT_OPEN");
      }
      if (offer.allwainType && offer.allwainType !== "proposal") {
        throw new Error("OFFER_NOT_FOUND");
      }
      if (
        offer.allwainStatus &&
        offer.allwainStatus !== "active"
      ) {
        throw new Error("OFFER_NOT_AVAILABLE");
      }
      const proposalItems = await tx.allwainShoppingListProposalItem.findMany({
        where: { shoppingListId, offerId: offer.id },
        select: { shoppingListItemId: true },
      });
      if (!proposalItems.length) {
        throw new Error("SHOPPING_LIST_PROPOSAL_ITEMS_MISSING");
      }
      const proposalItemIds = new Set(
        proposalItems.map((item: any) => item.shoppingListItemId),
      );
      const activeAwards = await listActiveAllwainShoppingListAwardLines(tx, [
        shoppingListId,
      ]);
      if (
        activeAwards.some((line: any) =>
          proposalItemIds.has(line.shoppingListItemId),
        )
      ) {
        throw new Error("SHOPPING_LIST_ITEMS_ALREADY_AWARDED");
      }
    } else if (
      !requestId &&
      offer.allwainStatus &&
      !["active", "sold_out"].includes(offer.allwainStatus)
    ) {
      throw new Error("OFFER_NOT_AVAILABLE");
    }

    let effectiveContract = input.contract;
    let acceptedProposalRevision: any = null;
    if (requestId || shoppingListId) {
      assertAllwainProposalActive(offer.proposalExpiresAt);
      acceptedProposalRevision = await tx.allwainProposalRevision.findUnique({
        where: {
          offerId_revision: {
            offerId: offer.id,
            revision: Number(offer.proposalRevision || 0),
          },
        },
      });
      if (
        !acceptedProposalRevision ||
        acceptedProposalRevision.status !== "current" ||
        acceptedProposalRevision.sellerUserId !== offer.ownerUserId ||
        acceptedProposalRevision.requestId !== requestId ||
        acceptedProposalRevision.shoppingListId !== shoppingListId
      ) {
        throw new Error("PROPOSAL_REVISION_MISMATCH");
      }
      assertAllwainProposalActive(acceptedProposalRevision.validUntil);
      if (
        Math.round(Number(offer.price || 0) * 100) !==
        Number(acceptedProposalRevision.totalAmount)
      ) {
        throw new Error("PROPOSAL_REVISION_MISMATCH");
      }

      const referenceAmount =
        acceptedProposalRevision.referenceAmount === null
          ? null
          : Number(acceptedProposalRevision.referenceAmount);
      if (referenceAmount !== null) {
        const savings = calculateAllwainSavingsMoney({
          referenceAmount,
          acceptedOfferAmount: Number(acceptedProposalRevision.totalAmount),
          platformFeeBps: Number(
            input.contract.platformFeeBps ?? ENV.ALLWAIN_PLATFORM_FEE_BPS,
          ),
          currency: String(
            acceptedProposalRevision.currency || input.contract.currency || "EUR",
          ),
        });
        const deliveryChannel =
          input.contract.deliveryChannel ||
          (input.contract.deliveryMethod === "shipping"
            ? "carrier"
            : input.contract.deliveryMethod === "in_person"
              ? "seller"
              : "pickup");
        const allocation = calculateAllwainDeliveryAllocation({
          deliveryChannel,
          subtotalAmount: savings.acceptedOfferAmount,
          platformFeeAmount: savings.platformFeeAmount,
          carrierShippingAmount:
            input.contract.carrierDeliveryAmount ||
            input.contract.shippingAmount ||
            undefined,
        });
        const buyerTotalAmount =
          savings.buyerSubtotalAmount + allocation.shippingAmount;
        effectiveContract = {
          ...input.contract,
          acceptedProposalRevisionId: acceptedProposalRevision.id,
          unitPrice:
            savings.acceptedOfferAmount / Math.max(1, input.quantity) / 100,
          totalPrice: buyerTotalAmount / 100,
          currency: savings.currency,
          subtotalAmount: savings.acceptedOfferAmount,
          shippingAmount: allocation.shippingAmount,
          carrierDeliveryAmount: allocation.carrierDeliveryAmount,
          platformFeeBps: savings.platformFeeBps,
          platformFeeAmount: savings.platformFeeAmount,
          platformNetFeeAmount: allocation.platformNetFeeAmount,
          platformRetainedAmount: allocation.platformNetFeeAmount,
          connectorFeeAmount: allocation.connectorFeeAmount,
          connectorPlatformShareAmount:
            allocation.connectorPlatformShareAmount,
          connectorDeliveryAmount: allocation.connectorDeliveryAmount,
          sellerAmount: savings.sellerAmount,
          feeBasis: savings.feeBasis,
          platformFeePayer: savings.platformFeePayer,
          referenceAmount: savings.referenceAmount,
          acceptedOfferAmount: savings.acceptedOfferAmount,
          grossSavingsAmount: savings.grossSavingsAmount,
          netSavingsAmount: savings.netSavingsAmount,
          commercialModel: savings.commercialModel,
          businessOfRecord: savings.businessOfRecord,
        };
      } else {
        effectiveContract = {
          ...input.contract,
          acceptedProposalRevisionId: acceptedProposalRevision.id,
        };
      }
    }

    const reservation = reserveAllwainStock(offer, input.quantity);
    if (reservation.inventory.managed) {
      await tx.offer.update({
        where: { id: offer.id },
        data: {
          meta: reservation.meta,
          allwainStatus:
            requestId || shoppingListId
              ? "selected"
              : reservation.inventory.availableQuantity === 0
                ? "sold_out"
                : offer.allwainStatus || "active",
        },
      });
    }

    const contractData = {
      ...effectiveContract,
      quantity: reservation.quantity,
      unit: reservation.inventory.unit,
      unitPrice:
        typeof effectiveContract.unitPrice === "number"
          ? effectiveContract.unitPrice
          : typeof offer.price === "number"
            ? offer.price
            : null,
      totalPrice:
        typeof offer.price === "number"
          ? (effectiveContract.totalPrice ??
            Math.round(
              offer.price * reservation.quantity * 100 +
                Number(effectiveContract.shippingAmount || 0),
            ) / 100)
          : null,
      inventoryStatus: reservation.inventory.managed ? "reserved" : null,
      requestId,
      shoppingListId,
      updatedAt: new Date(),
    };

    const created = await tx.contract.create({ data: contractData as any });
    if (acceptedProposalRevision) {
      await tx.allwainProposalRevision.update({
        where: { id: acceptedProposalRevision.id },
        data: { status: "accepted", acceptedAt: new Date() },
      });
    }
    const mapped = mapContractRow(created);
    if (requestId) {
      const now = new Date();
      await tx.allwainScanRequest.update({
        where: { id: requestId },
        data: {
          status: "awarded",
          selectedOfferId: offer.id,
          selectedAt: now,
        },
      });
      await tx.offer.update({
        where: { id: offer.id },
        data: { allwainStatus: "selected" },
      });
      await tx.offer.updateMany({
        where: {
          owner: "allwain",
          requestId,
          id: { not: offer.id },
          allwainStatus: { in: ["active", "paused"] },
        },
        data: { allwainStatus: "not_selected" },
      });
      await appendAllwainAuditEventTx(tx, {
        aggregateType: "market_request",
        aggregateId: requestId,
        eventType: "market_request.offer_selected",
        actorUserId: input.userId,
        actorRole: "buyer",
        source: "allwain_direct_purchase",
        payload: {
          offerId: offer.id,
          proposalRevisionId: acceptedProposalRevision?.id || null,
          proposalRevision: acceptedProposalRevision?.revision || null,
          contractId: created.id,
          referenceAmount: mapped.referenceAmount ?? null,
          acceptedOfferAmount: mapped.acceptedOfferAmount ?? null,
          grossSavingsAmount: mapped.grossSavingsAmount ?? null,
          platformFeeAmount: mapped.platformFeeAmount ?? null,
          netSavingsAmount: mapped.netSavingsAmount ?? null,
          previousStatus: "submitted",
          nextStatus: "awarded",
        },
      });
    }
    const order = await ensureAllwainOrderTx(
      tx,
      mapped,
      mapped.subtotalAmount ? "awaiting_payment" : "legacy_confirmed",
      "agreement_created",
      input.userId,
    );
    if (shoppingListId) {
      if (!order) throw new Error("SHOPPING_LIST_ORDER_NOT_CREATED");
      const awardState = await refreshAllwainShoppingListAwardStateTx(
        tx,
        shoppingListId,
      );
      await appendAllwainAuditEventTx(tx, {
        aggregateType: "shopping_list",
        aggregateId: shoppingListId,
        orderId: order.id,
        eventType:
          awardState.nextStatus === "awarded"
            ? "shopping_list.fully_awarded"
            : "shopping_list.partially_awarded",
        actorUserId: input.userId,
        actorRole: "buyer",
        source: "allwain_direct_purchase",
        payload: {
          offerId: offer.id,
          proposalRevisionId: acceptedProposalRevision?.id || null,
          proposalRevision: acceptedProposalRevision?.revision || null,
          sellerUserId: offer.ownerUserId,
          contractId: created.id,
          orderId: order.id,
          totalAmount: created.subtotalAmount,
          buyerTotalAmount: mapped.totalPrice
            ? Math.round(mapped.totalPrice * 100)
            : null,
          referenceAmount: mapped.referenceAmount ?? null,
          acceptedOfferAmount: mapped.acceptedOfferAmount ?? null,
          grossSavingsAmount: mapped.grossSavingsAmount ?? null,
          platformFeeAmount: mapped.platformFeeAmount ?? null,
          netSavingsAmount: mapped.netSavingsAmount ?? null,
          currency: created.currency,
          previousStatus: awardState.previousStatus,
          nextStatus: awardState.nextStatus,
          awardedItemCount: awardState.awardedItemCount,
          remainingItemCount: awardState.remainingItemCount,
          selectedOfferIds: awardState.selectedOfferIds,
        },
      });
    }
    if (mapped.carrierQuoteId && order) {
      const selected = await tx.allwainCarrierQuote.updateMany({
        where: {
          id: mapped.carrierQuoteId,
          status: "quoted",
          buyerUserId: input.userId,
          sellerUserId: offer.ownerUserId,
          offerId: offer.id,
          expiresAt: { gt: new Date() },
        },
        data: { status: "selected", selectedAt: new Date() },
      });
      if (selected.count !== 1) throw new Error("CARRIER_QUOTE_ALREADY_USED");
      await appendAllwainAuditEventTx(tx, {
        aggregateId: order.id,
        eventType: "carrier.quote_selected",
        actorUserId: input.userId,
        actorRole: "buyer",
        source: "agreement_created",
        payload: {
          carrierQuoteId: mapped.carrierQuoteId,
          carrierDeliveryAmount: order.carrierDeliveryAmount,
          shippingAmount: order.shippingAmount,
          currency: order.currency,
        },
      });
    }
    return mapped;
  }, {
    maxWait: 5_000,
    timeout: 20_000,
  });
}

export async function updateAllwainOfferInventoryPg(input: {
  offerId: string;
  userId: string;
  allowAnyOwner: boolean;
  stockQuantity: number;
  minQuantity: number;
  quantityStep: number;
}): Promise<Offer> {
  const prisma = getPrisma() as any;
  return prisma.$transaction(async (tx: any) => {
    const offer = await lockAllwainOffer(tx, input.offerId);
    if (
      !offer ||
      (!input.allowAnyOwner && offer.ownerUserId !== input.userId)
    ) {
      throw new Error("OFFER_NOT_FOUND");
    }
    const meta = updateAllwainInventoryLimits(offer, input);
    const nextInventory = readAllwainInventory({ meta });
    const updated = await tx.offer.update({
      where: { id: offer.id },
      data: {
        meta,
        allwainStatus:
          offer.allwainStatus === "sold_out" &&
          (nextInventory.availableQuantity || 0) > 0
            ? "active"
            : offer.allwainStatus || "active",
      },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateType: "offer",
      aggregateId: offer.id,
      eventType: "inventory.updated",
      actorUserId: input.userId,
      actorRole: input.allowAnyOwner ? "admin" : "seller",
      source: "allwain_inventory_update",
      payload: {
        previous: readAllwainInventory(offer),
        current: readAllwainInventory(updated),
      },
    });
    return mapOfferRow(updated);
  });
}

export async function updateAllwainOfferDetailsPg(input: {
  offerId: string;
  userId: string;
  allowAnyOwner: boolean;
  title?: string;
  description?: string;
  price?: number;
  status?: "active" | "paused" | "closed";
  meta?: Record<string, unknown>;
}): Promise<Offer> {
  const prisma = getPrisma() as any;
  return prisma.$transaction(async (tx: any) => {
    const offer = await lockAllwainOffer(tx, input.offerId);
    if (
      !offer ||
      (!input.allowAnyOwner && offer.ownerUserId !== input.userId)
    ) {
      throw new Error("OFFER_NOT_FOUND");
    }
    if (offerRequestIdPg(offer)) throw new Error("OFFER_EDIT_NOT_ALLOWED");
    const previousStatus = offer.allwainStatus || "active";
    const nextStatus = input.status || previousStatus;
    const currentMeta = input.meta || offer.meta;
    const meta =
      nextStatus === "closed"
        ? archiveAllwainOfferMeta(currentMeta)
        : { ...(currentMeta || {}), archived: false, status: nextStatus };
    const updated = await tx.offer.update({
      where: { id: offer.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.price !== undefined ? { price: input.price } : {}),
        ...(input.status !== undefined || input.meta !== undefined
          ? { allwainStatus: nextStatus, meta }
          : {}),
      },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateType: "offer",
      aggregateId: offer.id,
      eventType: "offer.updated",
      actorUserId: input.userId,
      actorRole: input.allowAnyOwner ? "admin" : "seller",
      source: "allwain_offer_update",
      payload: {
        previousStatus,
        nextStatus,
        titleChanged: input.title !== undefined && input.title !== offer.title,
        descriptionChanged:
          input.description !== undefined &&
          input.description !== offer.description,
        priceChanged: input.price !== undefined && input.price !== offer.price,
      },
    });
    return mapOfferRow(updated);
  });
}

function offerRequestIdPg(offer: Offer) {
  return (
    offer.requestId ||
    (typeof offer.meta?.requestId === "string" ? offer.meta.requestId : null)
  );
}

export async function acceptAllwainContractWithInventoryPg(
  contractId: string,
  userId: string,
): Promise<Contract> {
  const prisma = getPrisma() as any;
  return prisma.$transaction(async (tx: any) => {
    const preview = await tx.contract.findUnique({ where: { id: contractId } });
    if (!preview || preview.app !== "allwain")
      throw new Error("CONTRACT_NOT_FOUND");
    const offer = preview.offerId
      ? await lockAllwainOffer(tx, preview.offerId)
      : null;
    const contract = await lockAllwainContract(tx, contractId);
    if (
      !contract ||
      (contract.requesterUserId !== userId &&
        contract.providerUserId !== userId)
    ) {
      throw new Error("CONTRACT_NOT_FOUND");
    }
    if (contract.status === "accepted") return contract;
    if (
      contract.status !== "draft" &&
      contract.status !== "partially_accepted"
    ) {
      throw new Error("INVALID_CONTRACT_STATUS");
    }

    const now = new Date();
    const requesterAcceptedAt =
      contract.requesterAcceptedAt ||
      (contract.requesterUserId === userId ? now.toISOString() : null);
    const providerAcceptedAt =
      contract.providerAcceptedAt ||
      (contract.providerUserId === userId ? now.toISOString() : null);
    const status =
      requesterAcceptedAt && providerAcceptedAt
        ? "accepted"
        : "partially_accepted";
    let inventoryStatus = contract.inventoryStatus;

    const paymentRequired =
      typeof contract.subtotalAmount === "number" &&
      contract.subtotalAmount > 0;

    if (
      status === "accepted" &&
      inventoryStatus === "reserved" &&
      offer &&
      typeof contract.quantity === "number" &&
      !paymentRequired
    ) {
      await tx.offer.update({
        where: { id: offer.id },
        data: { meta: commitAllwainStock(offer, contract.quantity) },
      });
      inventoryStatus = "sold";
    }

    const paymentStatus =
      status !== "accepted"
        ? contract.paymentStatus
        : paymentRequired
          ? "awaiting_payment"
          : contract.subtotalAmount
            ? "legacy_confirmed"
            : "not_required";

    const updated = await tx.contract.update({
      where: { id: contract.id },
      data: {
        status,
        requesterAcceptedAt: requesterAcceptedAt
          ? new Date(requesterAcceptedAt)
          : null,
        providerAcceptedAt: providerAcceptedAt
          ? new Date(providerAcceptedAt)
          : null,
        inventoryStatus,
        paymentStatus,
        updatedAt: now,
      },
    });
    const mapped = mapContractRow(updated);
    await ensureAllwainOrderTx(
      tx,
      mapped,
      status === "accepted"
        ? paymentRequired
          ? "awaiting_payment"
          : "legacy_confirmed"
        : "awaiting_seller",
      "agreement_accepted",
      userId,
    );
    return mapped;
  });
}

export async function rejectAllwainContractWithInventoryPg(
  contractId: string,
  userId: string,
): Promise<Contract> {
  const prisma = getPrisma() as any;
  return prisma.$transaction(async (tx: any) => {
    const preview = await tx.contract.findUnique({ where: { id: contractId } });
    if (!preview || preview.app !== "allwain")
      throw new Error("CONTRACT_NOT_FOUND");
    const offer = preview.offerId
      ? await lockAllwainOffer(tx, preview.offerId)
      : null;
    const contract = await lockAllwainContract(tx, contractId);
    if (
      !contract ||
      (contract.requesterUserId !== userId &&
        contract.providerUserId !== userId)
    ) {
      throw new Error("CONTRACT_NOT_FOUND");
    }
    if (contract.status === "rejected") return contract;
    if (contract.status === "accepted")
      throw new Error("INVALID_CONTRACT_STATUS");

    let inventoryStatus = contract.inventoryStatus;
    if (
      inventoryStatus === "reserved" &&
      offer &&
      typeof contract.quantity === "number"
    ) {
      const released = releaseAllwainOfferStock(offer, contract.quantity);
      await tx.offer.update({
        where: { id: offer.id },
        data: released,
      });
      inventoryStatus = "released";
    }

    const updated = await tx.contract.update({
      where: { id: contract.id },
      data: {
        status: "rejected",
        inventoryStatus,
        paymentStatus: contract.subtotalAmount
          ? "canceled"
          : contract.paymentStatus,
        updatedAt: new Date(),
      },
    });
    const order = await tx.allwainOrder.findUnique({
      where: { contractId: contract.id },
    });
    if (
      order &&
      !["paid", "completed", "refunded", "canceled"].includes(order.status)
    ) {
      const canceledOrder = await tx.allwainOrder.update({
        where: { id: order.id },
        data: {
          status: "canceled",
          paymentStatus: "canceled",
          inventoryStatus,
          reservationExpiresAt: null,
          canceledAt: new Date(),
        },
      });
      await tx.allwainOrderStatusEvent.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: "canceled",
          actorUserId: userId,
          source: "agreement_rejected",
        },
      });
      await appendAllwainAuditEventTx(tx, {
        aggregateId: canceledOrder.id,
        eventType: "order.canceled",
        actorUserId: userId,
        source: "agreement_rejected",
        payload: {
          previousStatus: order.status,
          inventoryStatus,
          contractStatus: "rejected",
        },
      });
    }
    return mapContractRow(updated);
  });
}

/* =========================
   ORDER GROUPS
========================= */

export async function getOrderGroupsPg(): Promise<OrderGroup[]> {
  const prisma = getPrisma();
  return (await prisma.orderGroup.findMany()) as any;
}

export async function createOrderGroupPg(
  group: OrderGroup,
): Promise<OrderGroup> {
  const prisma = getPrisma();
  return (await prisma.orderGroup.create({ data: group as any })) as any;
}

export async function updateOrderGroupPg(
  group: OrderGroup,
): Promise<OrderGroup> {
  const prisma = getPrisma();
  return (await prisma.orderGroup.update({
    where: { id: group.id },
    data: group as any,
  })) as any;
}

/* =========================
   SAVINGS
========================= */

export async function addSavingPg(tx: AllwainSavingTransaction) {
  const prisma = getPrisma();
  return prisma.allwainSavingTransaction.create({ data: tx as any });
}

export async function addReferralStatPg(stat: ReferralStat) {
  const prisma = getPrisma();
  return prisma.referralStat.create({ data: stat as any });
}

export async function getReferralStatsByUserPg(userId: string) {
  const prisma = getPrisma();
  return prisma.referralStat.findMany({ where: { userId } });
}

/* =========================
   SCAN REQUESTS
========================= */

function mapScanRequestPg(row: any): AllwainScanRequest {
  return {
    id: row.id,
    userId: row.userId,
    sourceType: row.sourceType,
    status: row.status,
    visibility: row.visibility || "public",
    title: row.title,
    description: row.description,
    extracted: row.extracted,
    product: row.product ?? null,
    offers: row.offers || [],
    selectedOfferId: row.selectedOfferId || null,
    selectedAt:
      row.selectedAt instanceof Date
        ? row.selectedAt.toISOString()
        : row.selectedAt || null,
    closedAt:
      row.closedAt instanceof Date
        ? row.closedAt.toISOString()
        : row.closedAt || null,
    category: row.category || null,
    subcategory: row.subcategory || null,
    productKind: row.productKind || null,
    unit: row.unit || null,
    currency: row.currency || null,
    locationLabel: row.locationLabel || null,
    locationLatApprox: row.locationLatApprox ?? null,
    locationLngApprox: row.locationLngApprox ?? null,
    imageMeta: row.imageMeta ?? null,
    publicationReviewId: row.publicationReviewId || null,
    qualityDecision: row.qualityDecision || null,
    qualityScore: row.qualityScore ?? null,
    qualityReviewedAt:
      row.qualityReviewedAt instanceof Date
        ? row.qualityReviewedAt.toISOString()
        : row.qualityReviewedAt || null,
    paymentGuaranteeStatus: row.paymentGuaranteeStatus || "not_started",
    paymentGuaranteeConsentVersion: row.paymentGuaranteeConsentVersion || null,
    paymentGuaranteeAcceptedAt:
      row.paymentGuaranteeAcceptedAt instanceof Date
        ? row.paymentGuaranteeAcceptedAt.toISOString()
        : row.paymentGuaranteeAcceptedAt || null,
    paymentGuaranteeEvidenceHash: row.paymentGuaranteeEvidenceHash || null,
    referencePriceSource: row.referencePriceSource || "manual",
    referencePriceLocked: row.referencePriceLocked === true,
    referenceDocumentId: row.referenceDocumentId || null,
    ocrExtractionId: row.ocrExtractionId || null,
    referenceCapturedAt:
      row.referenceCapturedAt instanceof Date
        ? row.referenceCapturedAt.toISOString()
        : row.referenceCapturedAt || null,
    ai: row.ai,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : row.createdAt,
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : row.updatedAt,
  };
}

function optionalJson(value: unknown) {
  return value === null || value === undefined ? undefined : (value as any);
}

function scanRequestToPgData(item: AllwainScanRequest) {
  return {
    id: item.id,
    userId: item.userId,
    sourceType: item.sourceType,
    status: item.status,
    visibility: item.visibility || "public",
    title: item.title,
    description: item.description,
    extracted: item.extracted as any,
    product: optionalJson(item.product),
    offers: item.offers as any,
    selectedOfferId: item.selectedOfferId || null,
    selectedAt: item.selectedAt ? new Date(item.selectedAt) : null,
    closedAt: item.closedAt ? new Date(item.closedAt) : null,
    category: item.extracted.category || item.category || null,
    subcategory: item.extracted.subcategory || item.subcategory || null,
    productKind: item.extracted.productKind || item.productKind || null,
    unit: item.extracted.unit || item.unit || null,
    currency: String(
      item.extracted.currency || item.currency || "EUR",
    ).toUpperCase(),
    locationLabel:
      item.extracted.locationLabel ||
      item.extracted.deliveryAddress ||
      item.locationLabel ||
      null,
    locationLatApprox:
      item.extracted.locationLatApprox ?? item.locationLatApprox ?? null,
    locationLngApprox:
      item.extracted.locationLngApprox ?? item.locationLngApprox ?? null,
    imageMeta: optionalJson(item.imageMeta),
    publicationReviewId: item.publicationReviewId || null,
    qualityDecision: item.qualityDecision || null,
    qualityScore: item.qualityScore ?? null,
    qualityReviewedAt: item.qualityReviewedAt
      ? new Date(item.qualityReviewedAt)
      : null,
    paymentGuaranteeStatus: item.paymentGuaranteeStatus || "not_started",
    paymentGuaranteeConsentVersion: item.paymentGuaranteeConsentVersion || null,
    paymentGuaranteeAcceptedAt: item.paymentGuaranteeAcceptedAt
      ? new Date(item.paymentGuaranteeAcceptedAt)
      : null,
    paymentGuaranteeEvidenceHash: item.paymentGuaranteeEvidenceHash || null,
    referencePriceSource: item.referencePriceSource || "manual",
    referencePriceLocked: item.referencePriceLocked === true,
    referenceDocumentId: item.referenceDocumentId || null,
    ocrExtractionId: item.ocrExtractionId || null,
    referenceCapturedAt: item.referenceCapturedAt
      ? new Date(item.referenceCapturedAt)
      : null,
    ai: item.ai as any,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
  };
}

function scanRequestUpdateToPgData(item: AllwainScanRequest) {
  return {
    status: item.status,
    visibility: item.visibility || "public",
    title: item.title,
    description: item.description,
    extracted: item.extracted as any,
    product: optionalJson(item.product),
    offers: item.offers as any,
    selectedOfferId: item.selectedOfferId || null,
    selectedAt: item.selectedAt ? new Date(item.selectedAt) : null,
    closedAt: item.closedAt ? new Date(item.closedAt) : null,
    category: item.extracted.category || item.category || null,
    subcategory: item.extracted.subcategory || item.subcategory || null,
    productKind: item.extracted.productKind || item.productKind || null,
    unit: item.extracted.unit || item.unit || null,
    currency: String(
      item.extracted.currency || item.currency || "EUR",
    ).toUpperCase(),
    locationLabel:
      item.extracted.locationLabel ||
      item.extracted.deliveryAddress ||
      item.locationLabel ||
      null,
    locationLatApprox:
      item.extracted.locationLatApprox ?? item.locationLatApprox ?? null,
    locationLngApprox:
      item.extracted.locationLngApprox ?? item.locationLngApprox ?? null,
    imageMeta: optionalJson(item.imageMeta),
    publicationReviewId: item.publicationReviewId || null,
    qualityDecision: item.qualityDecision || null,
    qualityScore: item.qualityScore ?? null,
    qualityReviewedAt: item.qualityReviewedAt
      ? new Date(item.qualityReviewedAt)
      : null,
    paymentGuaranteeStatus: item.paymentGuaranteeStatus || "not_started",
    paymentGuaranteeConsentVersion: item.paymentGuaranteeConsentVersion || null,
    paymentGuaranteeAcceptedAt: item.paymentGuaranteeAcceptedAt
      ? new Date(item.paymentGuaranteeAcceptedAt)
      : null,
    paymentGuaranteeEvidenceHash: item.paymentGuaranteeEvidenceHash || null,
    referencePriceSource: item.referencePriceSource || "manual",
    referencePriceLocked: item.referencePriceLocked === true,
    referenceDocumentId: item.referenceDocumentId || null,
    ocrExtractionId: item.ocrExtractionId || null,
    referenceCapturedAt: item.referenceCapturedAt
      ? new Date(item.referenceCapturedAt)
      : null,
    ai: item.ai as any,
    updatedAt: new Date(item.updatedAt),
  };
}

export async function getAllwainScanRequestsPg(
  userId?: string,
): Promise<AllwainScanRequest[]> {
  const prisma = getPrisma() as any;
  const items = await prisma.allwainScanRequest.findMany({
    where: userId ? { userId } : undefined,
    orderBy: { createdAt: "desc" },
  });

  return items.map(mapScanRequestPg);
}

export async function getAllwainScanRequestByIdPg(
  requestId: string,
  userId?: string,
): Promise<AllwainScanRequest | null> {
  const item = await getPrisma().allwainScanRequest.findFirst({
    where: {
      id: requestId,
      ...(userId ? { userId } : {}),
    },
  });
  return item ? mapScanRequestPg(item) : null;
}

export async function getAllwainProposalBySellerPg(
  requestId: string,
  sellerUserId: string,
): Promise<Offer | null> {
  const item = await getPrisma().offer.findFirst({
    where: {
      owner: "allwain",
      requestId,
      ownerUserId: sellerUserId,
    },
  });
  return item ? mapOfferRow(item) : null;
}

export interface AllwainRequestPageInput {
  limit: number;
  cursor?: string | null;
  userId?: string | null;
  excludeUserId?: string | null;
  statuses?: string[] | null;
  visibility?: string | null;
  query?: string | null;
  category?: string | null;
  productKind?: string | null;
  unit?: string | null;
  currency?: string | null;
}

export async function getAllwainScanRequestPagePg(
  input: AllwainRequestPageInput,
) {
  const prisma = getPrisma();
  const rows = await prisma.allwainScanRequest.findMany({
    where: {
      ...(input.userId ? { userId: input.userId } : {}),
      ...(input.excludeUserId ? { NOT: { userId: input.excludeUserId } } : {}),
      ...(input.statuses?.length ? { status: { in: input.statuses } } : {}),
      ...(input.visibility ? { visibility: input.visibility } : {}),
      ...(input.query
        ? {
            OR: [
              { title: { contains: input.query, mode: "insensitive" } },
              { description: { contains: input.query, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(input.category
        ? { category: { equals: input.category, mode: "insensitive" } }
        : {}),
      ...(input.productKind ? { productKind: input.productKind } : {}),
      ...(input.unit
        ? { unit: { equals: input.unit, mode: "insensitive" } }
        : {}),
      ...(input.currency ? { currency: input.currency.toUpperCase() } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const hasNextPage = rows.length > input.limit;
  const pageRows = hasNextPage ? rows.slice(0, input.limit) : rows;
  return {
    items: pageRows.map(mapScanRequestPg),
    pageInfo: {
      hasNextPage,
      nextCursor: hasNextPage
        ? pageRows[pageRows.length - 1]?.id || null
        : null,
    },
  };
}

export async function getAllwainProposalSummariesPg(
  requestIds: string[],
  sellerUserId?: string,
) {
  const ids = [...new Set(requestIds.filter(Boolean))];
  if (!ids.length) {
    return {
      counts: new Map<string, number>(),
      mine: new Map<string, Offer>(),
    };
  }
  const prisma = getPrisma();
  const [counts, mine] = await Promise.all([
    prisma.offer.groupBy({
      by: ["requestId"],
      where: {
        owner: "allwain",
        requestId: { in: ids },
        allwainStatus: { notIn: ["withdrawn"] },
        OR: [
          { proposalExpiresAt: null },
          { proposalExpiresAt: { gt: new Date() } },
        ],
      },
      _count: { id: true },
    }),
    sellerUserId
      ? prisma.offer.findMany({
          where: {
            owner: "allwain",
            requestId: { in: ids },
            ownerUserId: sellerUserId,
          },
        })
      : Promise.resolve([]),
  ]);
  return {
    counts: new Map(
      counts
        .filter((item) => item.requestId)
        .map((item) => [item.requestId as string, item._count.id]),
    ),
    mine: new Map(
      mine.map((item) => [item.requestId as string, mapOfferRow(item)]),
    ),
  };
}

export async function addAllwainScanRequestPg(
  item: AllwainScanRequest,
): Promise<AllwainScanRequest> {
  const prisma = getPrisma() as any;
  const created = await prisma.allwainScanRequest.create({
    data: scanRequestToPgData(item),
  });

  return mapScanRequestPg(created);
}

export async function updateAllwainScanRequestPg(
  item: AllwainScanRequest,
): Promise<AllwainScanRequest | null> {
  const prisma = getPrisma() as any;
  try {
    const updated = await prisma.allwainScanRequest.update({
      where: { id: item.id },
      data: scanRequestUpdateToPgData(item),
    });

    return mapScanRequestPg(updated);
  } catch {
    return null;
  }
}

export async function transitionAllwainScanRequestPg(input: {
  userId: string;
  requestId: string;
  fromStatus: string;
  toStatus: string;
}): Promise<AllwainScanRequest> {
  const prisma = getPrisma() as any;
  return prisma.$transaction(async (tx: any) => {
    const request = await lockAllwainScanRequest(tx, input.requestId);
    if (!request || request.userId !== input.userId) {
      throw new Error("SCAN_REQUEST_NOT_FOUND");
    }
    if (request.status === input.toStatus) return mapScanRequestPg(request);
    if (request.status !== input.fromStatus) {
      throw new Error("INVALID_SCAN_TRANSITION");
    }
    const now = new Date();
    const updated = await tx.allwainScanRequest.update({
      where: { id: input.requestId },
      data: {
        status: input.toStatus,
        closedAt: ["closed", "canceled"].includes(input.toStatus)
          ? now
          : request.closedAt,
      },
    });
    if (["closed", "canceled"].includes(input.toStatus)) {
      await tx.offer.updateMany({
        where: {
          owner: "allwain",
          requestId: input.requestId,
          allwainStatus: { in: ["active", "paused"] },
        },
        data: { allwainStatus: "withdrawn" },
      });
    }
    await appendAllwainAuditEventTx(tx, {
      aggregateType: "market_request",
      aggregateId: input.requestId,
      eventType: "market_request.status_changed",
      actorUserId: input.userId,
      actorRole: "buyer",
      source: "allwain_request_update",
      payload: {
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
      },
    });
    return mapScanRequestPg(updated);
  });
}
