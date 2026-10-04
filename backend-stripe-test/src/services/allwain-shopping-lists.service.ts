import { randomUUID } from "node:crypto";
import { parse as parseCsv } from "csv-parse/sync";
import { Prisma } from "@prisma/client";
import { discoveryCursor, discoveryDate, discoveryWhere, validateDiscovery, type AllwainDiscoveryInput } from "./allwain-discovery";
import { allwainDiscoveryNearbyIdsPg } from "./data.store.allwain.pg";

import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";
import { appendAllwainAuditEventTx } from "./allwain-audit";
import { notifyAllwainUser } from "./allwain-notifications.service";
import {
  getAllwainSellerCommercialModel,
  isAllwainSellerEnabled,
} from "./allwain-participation.service";
import {
  applyAllwainProductIntelligence,
  normalizeAllwainUnit,
} from "./allwain-product-intelligence";
import {
  assertAllwainPublicationCanProceed,
  reviewAllwainPublication,
  type AllwainPublicationReviewResult,
} from "./allwain-publication-quality.service";
import {
  ALLWAIN_OPEN_SHOPPING_LIST_STATUSES,
  listActiveAllwainShoppingListAwardLines,
} from "./allwain-shopping-list-awards";
import { allwainIllustrativeCardImageMeta } from "./allwain-card-images.service";
import {
  allwainProposalSnapshotHash,
  normalizeAllwainProposalExpiry,
} from "./allwain-proposals";

const MAX_ITEMS = 100;
const MAX_IMPORT_BYTES = 100_000;
const LIST_STATUSES = new Set([
  "draft",
  "published",
  "partially_awarded",
  "awarded",
  "closed",
  "canceled",
  "archived",
]);
const DELIVERY_CHANNELS = new Set([
  "local_connector",
  "carrier",
  "seller",
  "pickup",
]);
const RECURRENCE_INTERVALS = new Set(["weekly", "biweekly", "monthly"]);

type ShoppingListItemInput = {
  id?: unknown;
  productName?: unknown;
  description?: unknown;
  quantity?: unknown;
  unit?: unknown;
  targetUnitPrice?: unknown;
  category?: unknown;
  subcategory?: unknown;
  productKind?: unknown;
  notes?: unknown;
  reviewStatus?: unknown;
};

type ShoppingListInput = {
  title?: unknown;
  description?: unknown;
  currency?: unknown;
  allowSubstitutions?: unknown;
  needByText?: unknown;
  proposalDeadlineAt?: unknown;
  proposalWindowDays?: unknown;
  preferredDeliveryChannel?: unknown;
  deliveryAddress?: unknown;
  deliveryWindow?: unknown;
  recurrence?: unknown;
  locationLabel?: unknown;
  locationLatApprox?: unknown;
  locationLngApprox?: unknown;
  items?: unknown;
};

type ProposalLineInput = {
  shoppingListItemId?: unknown;
  productName?: unknown;
  description?: unknown;
  quantity?: unknown;
  unit?: unknown;
  unitPrice?: unknown;
  isSubstitution?: unknown;
  notes?: unknown;
};

function requirePostgres() {
  if (ENV.STORAGE_DRIVER !== "postgres") {
    throw new Error("SHOPPING_LISTS_REQUIRE_POSTGRES");
  }
}

function cleanText(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function optionalText(value: unknown, max: number) {
  const result = cleanText(value, max);
  return result || null;
}

function finitePositive(value: unknown) {
  const number =
    typeof value === "string"
      ? Number(value.trim().replace(",", "."))
      : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function roundedQuantity(value: unknown) {
  const number = finitePositive(value);
  if (number === null || number > 1_000_000) return null;
  return Math.round(number * 1_000) / 1_000;
}

function normalizeCurrency(value: unknown) {
  const currency = cleanText(value || "EUR", 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("INVALID_CURRENCY");
  return currency;
}

function normalizeCoordinates(latitude: unknown, longitude: unknown) {
  if (
    (latitude === undefined || latitude === null || latitude === "") &&
    (longitude === undefined || longitude === null || longitude === "")
  ) {
    return { latitude: null, longitude: null };
  }
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    throw new Error("INVALID_LOCATION");
  }
  return {
    latitude: Math.round(lat * 10_000) / 10_000,
    longitude: Math.round(lng * 10_000) / 10_000,
  };
}

function normalizeRecurrence(value: unknown) {
  if (!value || typeof value !== "object" || (value as any).enabled !== true) {
    return null;
  }
  const interval = cleanText((value as any).interval, 20).toLowerCase();
  if (!RECURRENCE_INTERVALS.has(interval)) {
    throw new Error("INVALID_RECURRENCE");
  }
  return {
    enabled: true,
    interval,
    label:
      interval === "weekly"
        ? "Cada semana"
        : interval === "biweekly"
          ? "Cada 15 días"
          : "Cada mes",
  };
}

function normalizeDeliveryWindow(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const rawText = optionalText((value as any).rawText, 240);
  const label = optionalText((value as any).label, 240);
  if (!rawText && !label) return null;
  return {
    rawText: rawText || label,
    label: label || rawText,
    startAt: optionalText((value as any).startAt, 40),
    endAt: optionalText((value as any).endAt, 40),
    deadlineAt: optionalText((value as any).deadlineAt, 40),
    timeOfDay: optionalText((value as any).timeOfDay, 20) || "anytime",
    confidence: Math.max(
      0,
      Math.min(1, Number((value as any).confidence) || 0),
    ),
    needsChoice: (value as any).needsChoice === true,
  };
}

function normalizeDeadline(input: ShoppingListInput) {
  if (input.proposalDeadlineAt) {
    const date = new Date(String(input.proposalDeadlineAt));
    if (!Number.isFinite(date.getTime()))
      throw new Error("INVALID_PROPOSAL_DEADLINE");
    if (date.getTime() <= Date.now() + 60 * 60 * 1_000) {
      throw new Error("INVALID_PROPOSAL_DEADLINE");
    }
    if (date.getTime() > Date.now() + 180 * 24 * 60 * 60 * 1_000) {
      throw new Error("PROPOSAL_DEADLINE_TOO_FAR");
    }
    return date;
  }
  const days = Math.trunc(Number(input.proposalWindowDays) || 14);
  if (![3, 7, 14, 30, 60, 90].includes(days)) {
    throw new Error("INVALID_PROPOSAL_WINDOW");
  }
  return new Date(Date.now() + days * 24 * 60 * 60 * 1_000);
}

function normalizeDeliveryAddress(value: unknown) {
  if (typeof value === "string") {
    const formatted = optionalText(value, 500);
    return formatted ? { formatted } : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const formatted = optionalText((value as any).formatted, 500);
  return formatted ? { formatted } : null;
}

function normalizedProductInput(
  input: ShoppingListItemInput,
  position: number,
) {
  const productName = cleanText(input.productName, 160);
  if (productName.length < 2)
    throw new Error("INVALID_SHOPPING_LIST_ITEM_NAME");
  const quantity = roundedQuantity(input.quantity);
  if (quantity === null) throw new Error("INVALID_SHOPPING_LIST_ITEM_QUANTITY");

  const suppliedUnit = normalizeAllwainUnit(input.unit);
  if (input.unit && !suppliedUnit)
    throw new Error("INVALID_SHOPPING_LIST_ITEM_UNIT");
  const intelligence = applyAllwainProductIntelligence(
    {
      productName,
      description: undefined,
      category: optionalText(input.category, 80),
      subcategory: optionalText(input.subcategory, 80),
      unit: suppliedUnit,
      productKind: (optionalText(input.productKind, 40) || null) as any,
      quantity,
      rawText: `${quantity} ${suppliedUnit || ""} ${productName}`,
      confidence: 0.8,
      notes: [],
    } as any,
    {
      rawText: `${quantity} ${suppliedUnit || ""} ${productName}`,
      unitSource: suppliedUnit ? "user" : "model",
    },
  );
  const unit = suppliedUnit || intelligence.unit || "ud";
  const targetUnitPrice =
    input.targetUnitPrice === undefined ||
    input.targetUnitPrice === null ||
    input.targetUnitPrice === ""
      ? null
      : finitePositive(input.targetUnitPrice);
  if (
    targetUnitPrice === null &&
    input.targetUnitPrice !== undefined &&
    input.targetUnitPrice !== null &&
    input.targetUnitPrice !== ""
  ) {
    throw new Error("INVALID_SHOPPING_LIST_TARGET_PRICE");
  }
  if (targetUnitPrice !== null && targetUnitPrice > 10_000_000) {
    throw new Error("INVALID_SHOPPING_LIST_TARGET_PRICE");
  }

  return {
    id: randomUUID(),
    position,
    productName,
    description: optionalText(input.description, 1_000),
    quantity,
    unit,
    targetUnitPriceAmount:
      targetUnitPrice === null ? null : Math.round(targetUnitPrice * 100),
    category: optionalText(input.category, 80) || intelligence.category || null,
    subcategory:
      optionalText(input.subcategory, 80) || intelligence.subcategory || null,
    productKind:
      optionalText(input.productKind, 40) ||
      intelligence.productKind ||
      "general",
    notes: optionalText(input.notes, 600),
  };
}

function normalizeItems(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_ITEMS) {
    throw new Error("INVALID_SHOPPING_LIST_ITEMS");
  }
  return value.map((item, index) =>
    normalizedProductInput(
      item && typeof item === "object" ? (item as ShoppingListItemInput) : {},
      index,
    ),
  );
}

function normalizedKey(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function valueFromAliases(row: Record<string, unknown>, aliases: string[]) {
  const normalized = new Map(
    Object.entries(row).map(([key, value]) => [normalizedKey(key), value]),
  );
  for (const alias of aliases) {
    if (normalized.has(alias)) return normalized.get(alias);
  }
  return undefined;
}

function csvDelimiter(firstLine: string) {
  const candidates = [",", ";", "\t"];
  return candidates
    .map((delimiter) => ({
      delimiter,
      count: firstLine.split(delimiter).length - 1,
    }))
    .sort((left, right) => right.count - left.count)[0];
}

function looksLikeCsv(lines: string[]) {
  const first = normalizedKey(lines[0]);
  const delimiter = csvDelimiter(lines[0]);
  return (
    delimiter.count > 0 &&
    /(?:producto|product|articulo|item|cantidad|quantity|qty|unidad|unit)/.test(
      first,
    )
  );
}

function parseCsvItems(rawText: string, lines: string[]) {
  const { delimiter } = csvDelimiter(lines[0]);
  const rows = parseCsv(rawText, {
    bom: true,
    columns: true,
    delimiter,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    trim: true,
  }) as Record<string, unknown>[];
  return rows.map((row) => ({
    productName: valueFromAliases(row, [
      "producto",
      "product",
      "articulo",
      "articulo_producto",
      "item",
      "nombre",
      "name",
    ]),
    quantity:
      valueFromAliases(row, ["cantidad", "quantity", "qty", "cant"]) || 1,
    unit: valueFromAliases(row, ["unidad", "unit", "medida", "formato"]),
    targetUnitPrice: valueFromAliases(row, [
      "precio_objetivo",
      "target_price",
      "precio_unitario",
      "unit_price",
      "precio",
    ]),
    description: valueFromAliases(row, [
      "descripcion",
      "description",
      "detalle",
    ]),
    notes: valueFromAliases(row, ["notas", "notes", "observaciones"]),
    category: valueFromAliases(row, ["categoria", "category"]),
  }));
}

const NATURAL_UNIT_PATTERN =
  "kg|kilo(?:s)?|kilogramo(?:s)?|g|gr|gramo(?:s)?|l|litro(?:s)?|ml|mililitro(?:s)?|ud(?:s)?|unidad(?:es)?|pieza(?:s)?|caja(?:s)?|pack|paquete(?:s)?";

function parseNaturalLine(input: string) {
  let line = input
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  let targetUnitPrice: number | undefined;
  const price = line.match(
    new RegExp(
      `(?:\\s+(?:a|por|@))?\\s+(\\d+(?:[.,]\\d+)?)\\s*(?:€|eur)(?:\\s*\\/\\s*(?:${NATURAL_UNIT_PATTERN}))?$`,
      "i",
    ),
  );
  if (price) {
    targetUnitPrice = Number(price[1].replace(",", "."));
    line = line.slice(0, price.index).trim();
  }

  const leading = line.match(
    new RegExp(
      `^(\\d+(?:[.,]\\d+)?)\\s*(?:(${NATURAL_UNIT_PATTERN}))?\\s+(?:de\\s+)?(.+)$`,
      "i",
    ),
  );
  if (leading) {
    return {
      productName: leading[3],
      quantity: leading[1],
      unit: leading[2],
      targetUnitPrice,
    };
  }
  const trailing = line.match(
    new RegExp(
      `^(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s*(${NATURAL_UNIT_PATTERN})$`,
      "i",
    ),
  );
  if (trailing) {
    return {
      productName: trailing[1],
      quantity: trailing[2],
      unit: trailing[3],
      targetUnitPrice,
    };
  }
  return { productName: line, quantity: 1, targetUnitPrice };
}

export function parseAllwainShoppingListText(rawValue: unknown) {
  const rawText =
    typeof rawValue === "string" ? rawValue.replace(/\r\n/g, "\n") : "";
  if (!rawText.trim()) throw new Error("EMPTY_SHOPPING_LIST_IMPORT");
  if (Buffer.byteLength(rawText, "utf8") > MAX_IMPORT_BYTES) {
    throw new Error("SHOPPING_LIST_IMPORT_TOO_LARGE");
  }
  const lines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) throw new Error("EMPTY_SHOPPING_LIST_IMPORT");
  const rawItems = looksLikeCsv(lines)
    ? parseCsvItems(rawText, lines)
    : lines.map(parseNaturalLine);
  if (rawItems.length > MAX_ITEMS)
    throw new Error("TOO_MANY_SHOPPING_LIST_ITEMS");
  const warnings: string[] = [];
  const items = rawItems.map((item, index) => {
    const normalized = normalizedProductInput(item, index);
    if (!item.unit) {
      warnings.push(
        `${normalized.productName}: hemos propuesto ${normalized.unit} como unidad. Revísala.`,
      );
    }
    return {
      id: normalized.id,
      productName: normalized.productName,
      description: normalized.description,
      quantity: normalized.quantity,
      unit: normalized.unit,
      targetUnitPrice:
        normalized.targetUnitPriceAmount === null
          ? null
          : normalized.targetUnitPriceAmount / 100,
      category: normalized.category,
      subcategory: normalized.subcategory,
      productKind: normalized.productKind,
      notes: normalized.notes,
    };
  });
  return { items, warnings };
}

function normalizeCreateInput(input: ShoppingListInput) {
  const items = normalizeItems(input.items);
  const title =
    cleanText(input.title, 140) ||
    `Compra de ${items
      .slice(0, 2)
      .map((item) => item.productName)
      .join(" y ")}`;
  const coordinates = normalizeCoordinates(
    input.locationLatApprox,
    input.locationLngApprox,
  );
  const preferredDeliveryChannel = optionalText(
    input.preferredDeliveryChannel,
    30,
  );
  if (
    preferredDeliveryChannel &&
    !DELIVERY_CHANNELS.has(preferredDeliveryChannel)
  ) {
    throw new Error("INVALID_DELIVERY_CHANNEL");
  }
  return {
    title,
    description: optionalText(input.description, 1_500),
    currency: normalizeCurrency(input.currency),
    allowSubstitutions: input.allowSubstitutions === true,
    needByText: optionalText(input.needByText, 240),
    proposalDeadlineAt: normalizeDeadline(input),
    preferredDeliveryChannel,
    deliveryAddress: normalizeDeliveryAddress(input.deliveryAddress),
    deliveryWindow: normalizeDeliveryWindow(input.deliveryWindow),
    recurrence: normalizeRecurrence(input.recurrence),
    locationLabel: optionalText(input.locationLabel, 160),
    locationLatApprox: coordinates.latitude,
    locationLngApprox: coordinates.longitude,
    items,
  };
}

function itemPayload(item: any) {
  return {
    id: item.id,
    position: item.position,
    productName: item.productName,
    description: item.description || null,
    quantity: Number(item.quantity),
    unit: item.unit,
    targetUnitPriceAmount: item.targetUnitPriceAmount,
    reviewStatus: item.reviewStatus || "selected",
    referencePriceSource: item.referencePriceSource || "manual",
    referencePriceLocked: item.referencePriceLocked === true,
    referenceCapturedAt: item.referenceCapturedAt?.toISOString?.() || null,
    referenceDocumentId: item.referenceDocumentId || null,
    ocrLineItemId: item.ocrLineItemId || null,
    category: item.category || null,
    subcategory: item.subcategory || null,
    productKind: item.productKind || null,
    notes: item.notes || null,
    qualityDecision: item.qualityDecision || null,
    qualityScore: item.qualityScore ?? null,
    imageMeta: allwainIllustrativeCardImageMeta(
      {
        title: item.productName,
        description: item.description,
        category: item.category,
        subcategory: item.subcategory,
        productKind: item.productKind,
      },
      item.createdAt,
    ),
  };
}

function proposalItemPayload(item: any) {
  return {
    id: item.id,
    shoppingListItemId: item.shoppingListItemId,
    position: item.position,
    productName: item.productName,
    description: item.description || null,
    quantity: Number(item.quantity),
    unit: item.unit,
    unitPriceAmount: item.unitPriceAmount,
    subtotalAmount: item.subtotalAmount,
    currency: item.currency,
    isSubstitution: item.isSubstitution,
    notes: item.notes || null,
    imageMeta: allwainIllustrativeCardImageMeta(
      {
        title: item.productName,
        description: item.description,
      },
      item.createdAt,
    ),
  };
}

async function hydrateShoppingLists(
  rows: any[],
  viewerUserId: string,
  options: {
    includeAllProposals: boolean;
    includeProposals?: boolean;
    includeProposalItems?: boolean;
  },
) {
  if (!rows.length) return [];
  const prisma = getPrisma() as any;
  const listIds = rows.map((row) => row.id);
  const [items, proposals, proposalCounts, awardLines] = await Promise.all([
    prisma.allwainShoppingListItem.findMany({
      where: { shoppingListId: { in: listIds } },
      orderBy: [{ shoppingListId: "asc" }, { position: "asc" }],
    }),
    options.includeProposals === false
      ? Promise.resolve([])
      : prisma.offer.findMany({
          where: {
            shoppingListId: { in: listIds },
            owner: "allwain",
            ...(options.includeAllProposals
              ? {}
              : { ownerUserId: viewerUserId }),
          },
          ...(options.includeProposalItems
            ? {
                include: {
                  shoppingListProposalItems: {
                    orderBy: { position: "asc" },
                  },
                },
              }
            : {}),
          orderBy: [{ price: "asc" }, { createdAt: "asc" }],
        }),
    prisma.offer.groupBy({
      by: ["shoppingListId"],
      where: {
        shoppingListId: { in: listIds },
        owner: "allwain",
        allwainStatus: "active",
        OR: [
          { proposalExpiresAt: null },
          { proposalExpiresAt: { gt: new Date() } },
        ],
      },
      _count: { id: true },
    }),
    listActiveAllwainShoppingListAwardLines(prisma, listIds),
  ]);
  const sellerIds = [
    ...new Set(proposals.map((offer: any) => offer.ownerUserId)),
  ];
  const [users, reputations] = await Promise.all([
    sellerIds.length
      ? prisma.user.findMany({
          where: { id: { in: sellerIds }, deletedAt: null },
          select: { id: true, name: true },
        })
      : [],
    sellerIds.length
      ? prisma.allwainReputation.findMany({
          where: { userId: { in: sellerIds } },
        })
      : [],
  ]);
  const usersById = new Map(users.map((user: any) => [user.id, user]));
  const reputationById = new Map(
    reputations.map((reputation: any) => [reputation.userId, reputation]),
  );
  const itemsByList = new Map<string, any[]>();
  for (const item of items) {
    const collection = itemsByList.get(item.shoppingListId) || [];
    collection.push(itemPayload(item));
    itemsByList.set(item.shoppingListId, collection);
  }
  const proposalsByList = new Map<string, any[]>();
  for (const offer of proposals) {
    const user = usersById.get(offer.ownerUserId) as any;
    const reputation = reputationById.get(offer.ownerUserId) as any;
    const collection = proposalsByList.get(offer.shoppingListId) || [];
    collection.push({
      id: offer.id,
      shoppingListId: offer.shoppingListId,
      title: offer.title,
      description: offer.description,
      ownerUserId: offer.ownerUserId,
      price: offer.price,
      currency: offer.currency || "EUR",
      status: offer.allwainStatus || "active",
      createdAt: offer.createdAt?.toISOString?.() || offer.createdAt || null,
      updatedAt: offer.updatedAt?.toISOString?.() || offer.updatedAt || offer.createdAt?.toISOString?.() || offer.createdAt || null,
      deliveryEstimate:
        typeof offer.meta?.deliveryEstimate === "string"
          ? offer.meta.deliveryEstimate
          : null,
      validUntil:
        offer.proposalExpiresAt?.toISOString?.() ||
        (typeof offer.meta?.validUntil === "string"
          ? offer.meta.validUntil
          : null),
      proposalRevision: Number(offer.proposalRevision || 0),
      expired: Boolean(
        offer.proposalExpiresAt && offer.proposalExpiresAt <= new Date(),
      ),
      items: (offer.shoppingListProposalItems || []).map(proposalItemPayload),
      provider: {
        id: offer.ownerUserId,
        name: user?.name || "Empresa Allwain",
        score: Number(reputation?.averageRating || 0),
        reviewCount: Number(reputation?.reviewCount || 0),
        completedOrders: Number(reputation?.completedOrders || 0),
      },
      meta: offer.meta || {},
    });
    proposalsByList.set(offer.shoppingListId, collection);
  }
  const countByList = new Map(
    proposalCounts
      .filter((count: any) => count.shoppingListId)
      .map((count: any) => [count.shoppingListId, count._count.id]),
  );

  const awardsByList = new Map<string, Map<string, any>>();
  for (const line of awardLines) {
    const shoppingListId = line.order?.shoppingListId;
    if (!shoppingListId || !line.shoppingListItemId) continue;
    const awards = awardsByList.get(shoppingListId) || new Map<string, any>();
    awards.set(line.shoppingListItemId, {
      shoppingListItemId: line.shoppingListItemId,
      offerId: line.offerId,
      orderId: line.orderId,
      sellerUserId: line.sellerUserId,
      quantity: Number(line.quantity),
      orderStatus: line.order.status,
      paymentStatus: line.order.paymentStatus,
      fulfillmentStatus: line.order.fulfillmentStatus,
    });
    awardsByList.set(shoppingListId, awards);
  }

  return rows.map((row) => {
    const allListItems = itemsByList.get(row.id) || [];
    const listItems =
      row.buyerUserId === viewerUserId
        ? allListItems
        : allListItems.filter((item: any) => item.reviewStatus === "selected");
    const actionableItems = listItems.filter(
      (item: any) => item.reviewStatus === "selected",
    );
    const awards = awardsByList.get(row.id) || new Map<string, any>();
    const hydratedProposals = (proposalsByList.get(row.id) || []).map(
      (proposal) => {
        const proposalItemIds = proposal.items.length
          ? proposal.items.map((item: any) => item.shoppingListItemId)
          : [];
        const coveredItemCount = proposalItemIds.length ||
          Number(proposal.meta?.coveredItemCount || proposal.meta?.itemCount || 0);
        const awardedItemCount = proposalItemIds.filter((itemId: string) =>
          awards.has(itemId),
        ).length;
        const coverageKind =
          coveredItemCount >= actionableItems.length ? "full" : "partial";
        return {
          ...proposal,
          coverageKind,
          coveredItemCount,
          totalItemCount: actionableItems.length,
          awardedItemCount,
          isSelected: [...awards.values()].some(
            (award) => award.offerId === proposal.id,
          ),
          isSelectable:
            ALLWAIN_OPEN_SHOPPING_LIST_STATUSES.includes(row.status) &&
            proposal.status === "active" &&
            !proposal.expired &&
            proposalItemIds.length > 0 &&
            awardedItemCount === 0,
        };
      },
    );
    return {
    id: row.id,
    buyerUserId: row.buyerUserId,
    sourceShoppingListId: row.sourceShoppingListId || null,
    sourceKind: row.sourceKind || "manual",
    sourceEvidenceDocumentId:
      row.buyerUserId === viewerUserId
        ? row.sourceEvidenceDocumentId || null
        : null,
    sourceOcrExtractionId:
      row.buyerUserId === viewerUserId ? row.sourceOcrExtractionId || null : null,
    buyer: row.buyer
      ? { id: row.buyer.id, name: row.buyer.name }
      : { id: row.buyerUserId, name: "Comprador Allwain" },
    title: row.title,
    description: row.description || null,
    demo: row.demo === true,
    status: row.status,
    visibility: row.visibility,
    currency: row.currency,
    allowSubstitutions: row.allowSubstitutions,
    needByText: row.needByText || null,
    proposalDeadlineAt: row.proposalDeadlineAt?.toISOString?.() || null,
    preferredDeliveryChannel: row.preferredDeliveryChannel || null,
    deliveryAddress:
      row.buyerUserId === viewerUserId ? row.deliveryAddress || null : null,
    deliveryWindow: row.deliveryWindow || null,
    recurrence: row.recurrence || null,
    locationLabel: row.locationLabel || null,
    selectedOfferId: row.selectedOfferId || null,
    selectedAt: row.selectedAt?.toISOString?.() || null,
    publishedAt: row.publishedAt?.toISOString?.() || null,
    closedAt: row.closedAt?.toISOString?.() || null,
    version: row.version,
    items: listItems.map((item: any) => ({
      ...item,
      award: awards.get(item.id) || null,
      availabilityStatus:
        item.reviewStatus !== "selected"
          ? "discarded"
          : awards.has(item.id)
            ? "awarded"
            : "open",
    })),
    awardedItemCount: awards.size,
    remainingItemCount: Math.max(0, actionableItems.length - awards.size),
    orderCount: new Set([...awards.values()].map((award) => award.orderId)).size,
    proposalCount: Number(countByList.get(row.id) || 0),
    proposals: hydratedProposals,
    myProposal:
      hydratedProposals.find(
        (proposal) => proposal.ownerUserId === viewerUserId,
      ) || null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    };
  });
}

function listSelect() {
  return {
    buyer: { select: { id: true, name: true } },
  };
}

export async function createAllwainShoppingList(
  userId: string,
  input: ShoppingListInput,
) {
  requirePostgres();
  const normalized = normalizeCreateInput(input);
  const prisma = getPrisma() as any;
  const created = await prisma.$transaction(async (tx: any) => {
    const user = await tx.user.findFirst({
      where: { id: userId, deletedAt: null, status: "active" },
      select: { id: true },
    });
    if (!user) throw new Error("USER_NOT_FOUND");
    const list = await tx.allwainShoppingList.create({
      data: {
        id: randomUUID(),
        buyerUserId: userId,
        title: normalized.title,
        description: normalized.description,
        currency: normalized.currency,
        allowSubstitutions: normalized.allowSubstitutions,
        needByText: normalized.needByText,
        proposalDeadlineAt: normalized.proposalDeadlineAt,
        preferredDeliveryChannel: normalized.preferredDeliveryChannel,
        deliveryAddress: normalized.deliveryAddress || undefined,
        deliveryWindow: normalized.deliveryWindow || undefined,
        recurrence: normalized.recurrence || undefined,
        locationLabel: normalized.locationLabel,
        locationLatApprox: normalized.locationLatApprox,
        locationLngApprox: normalized.locationLngApprox,
      },
      include: listSelect(),
    });
    await tx.allwainShoppingListItem.createMany({
      data: normalized.items.map((item) => ({
        ...item,
        shoppingListId: list.id,
      })),
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateType: "shopping_list",
      aggregateId: list.id,
      eventType: "shopping_list.created",
      actorUserId: userId,
      actorRole: "buyer",
      source: "allwain_shopping_list",
      payload: {
        status: "draft",
        version: list.version,
        title: list.title,
        currency: list.currency,
        itemCount: normalized.items.length,
        items: normalized.items.map((item) => ({
          id: item.id,
          position: item.position,
          productName: item.productName,
          quantity: item.quantity,
          unit: item.unit,
          targetUnitPriceAmount: item.targetUnitPriceAmount,
        })),
        recurrence: normalized.recurrence,
      },
    });
    return list;
  });
  return (
    await hydrateShoppingLists([created], userId, {
      includeAllProposals: true,
      includeProposals: false,
    })
  )[0];
}

export async function updateAllwainShoppingList(
  userId: string,
  shoppingListId: string,
  input: ShoppingListInput,
) {
  requirePostgres();
  const normalized = normalizeCreateInput(input);
  const prisma = getPrisma() as any;
  const updated = await prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`shopping_list:${shoppingListId}`}))`,
    );
    const current = await tx.allwainShoppingList.findUnique({
      where: { id: shoppingListId },
    });
    if (!current || current.buyerUserId !== userId) {
      throw new Error("SHOPPING_LIST_NOT_FOUND");
    }
    if (current.status !== "draft") throw new Error("SHOPPING_LIST_LOCKED");
    if (current.sourceKind === "ocr_document") {
      throw new Error("OCR_LIST_REVIEW_ONLY");
    }
    await tx.allwainShoppingListItem.deleteMany({ where: { shoppingListId } });
    await tx.allwainShoppingListItem.createMany({
      data: normalized.items.map((item) => ({
        ...item,
        shoppingListId,
      })),
    });
    const row = await tx.allwainShoppingList.update({
      where: { id: shoppingListId },
      data: {
        title: normalized.title,
        description: normalized.description,
        currency: normalized.currency,
        allowSubstitutions: normalized.allowSubstitutions,
        needByText: normalized.needByText,
        proposalDeadlineAt: normalized.proposalDeadlineAt,
        preferredDeliveryChannel: normalized.preferredDeliveryChannel,
        deliveryAddress: normalized.deliveryAddress || Prisma.JsonNull,
        deliveryWindow: normalized.deliveryWindow || Prisma.JsonNull,
        recurrence: normalized.recurrence || Prisma.JsonNull,
        locationLabel: normalized.locationLabel,
        locationLatApprox: normalized.locationLatApprox,
        locationLngApprox: normalized.locationLngApprox,
        version: { increment: 1 },
      },
      include: listSelect(),
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateType: "shopping_list",
      aggregateId: shoppingListId,
      eventType: "shopping_list.updated",
      actorUserId: userId,
      actorRole: "buyer",
      source: "allwain_shopping_list",
      payload: {
        previousVersion: current.version,
        nextVersion: row.version,
        itemCount: normalized.items.length,
        items: normalized.items.map((item) => ({
          id: item.id,
          productName: item.productName,
          quantity: item.quantity,
          unit: item.unit,
          targetUnitPriceAmount: item.targetUnitPriceAmount,
        })),
      },
    });
    return row;
  });
  return (
    await hydrateShoppingLists([updated], userId, {
      includeAllProposals: true,
      includeProposals: false,
    })
  )[0];
}

export async function reviewAllwainOcrShoppingList(
  userId: string,
  shoppingListId: string,
  input: { selectedItemIds?: unknown },
) {
  requirePostgres();
  if (!Array.isArray(input.selectedItemIds)) {
    throw new Error("INVALID_OCR_LIST_SELECTION");
  }
  const selectedItemIds = [
    ...new Set(
      input.selectedItemIds.map((value) => cleanText(value, 64)).filter(Boolean),
    ),
  ];
  if (selectedItemIds.length < 1 || selectedItemIds.length > MAX_ITEMS) {
    throw new Error("INVALID_OCR_LIST_SELECTION");
  }
  const prisma = getPrisma() as any;
  const updated = await prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`shopping_list:${shoppingListId}`}))`,
    );
    const current = await tx.allwainShoppingList.findUnique({
      where: { id: shoppingListId },
      include: { items: { orderBy: { position: "asc" } } },
    });
    if (!current || current.buyerUserId !== userId) {
      throw new Error("SHOPPING_LIST_NOT_FOUND");
    }
    if (current.status !== "draft") throw new Error("SHOPPING_LIST_LOCKED");
    if (
      current.sourceKind !== "ocr_document" ||
      !current.sourceEvidenceDocumentId
    ) {
      throw new Error("OCR_LIST_REVIEW_ONLY");
    }
    const itemIds = new Set(current.items.map((item: any) => item.id));
    if (selectedItemIds.some((id) => !itemIds.has(id))) {
      throw new Error("INVALID_OCR_LIST_SELECTION");
    }
    const selected = new Set(selectedItemIds);
    for (const item of current.items) {
      const reviewStatus = selected.has(item.id) ? "selected" : "discarded";
      await tx.allwainShoppingListItem.update({
        where: { id: item.id },
        data: { reviewStatus },
      });
      if (item.ocrLineItemId) {
        await tx.allwainOcrLineItem.update({
          where: { id: item.ocrLineItemId },
          data: { reviewStatus },
        });
      }
    }
    const row = await tx.allwainShoppingList.update({
      where: { id: shoppingListId },
      data: { version: { increment: 1 } },
      include: listSelect(),
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateType: "shopping_list",
      aggregateId: shoppingListId,
      eventType: "shopping_list.ocr_selection_reviewed",
      actorUserId: userId,
      actorRole: "buyer",
      source: "allwain_scan_capture",
      payload: {
        evidenceDocumentId: current.sourceEvidenceDocumentId,
        previousVersion: current.version,
        nextVersion: row.version,
        selectedItemIds,
        discardedItemIds: current.items
          .map((item: any) => item.id)
          .filter((id: string) => !selected.has(id)),
      },
    });
    return row;
  });
  return (
    await hydrateShoppingLists([updated], userId, {
      includeAllProposals: true,
      includeProposals: false,
    })
  )[0];
}

export async function publishAllwainShoppingList(
  userId: string,
  shoppingListId: string,
) {
  requirePostgres();
  const prisma = getPrisma() as any;
  const current = await prisma.allwainShoppingList.findUnique({
    where: { id: shoppingListId },
    include: { items: { orderBy: { position: "asc" } } },
  });
  if (!current || current.buyerUserId !== userId) {
    throw new Error("SHOPPING_LIST_NOT_FOUND");
  }
  if (current.status === "published") {
    const published = await prisma.allwainShoppingList.findUnique({
      where: { id: shoppingListId },
      include: listSelect(),
    });
    return (
      await hydrateShoppingLists([published], userId, {
        includeAllProposals: true,
        includeProposalItems: true,
      })
    )[0];
  }
  if (current.status !== "draft") throw new Error("SHOPPING_LIST_LOCKED");
  const selectedItems = current.items.filter(
    (item: any) => item.reviewStatus === "selected",
  );
  if (
    selectedItems.length < (current.sourceKind === "ocr_document" ? 1 : 2)
  )
    throw new Error("SHOPPING_LIST_REQUIRES_MULTIPLE_ITEMS");
  if (current.proposalDeadlineAt && current.proposalDeadlineAt <= new Date()) {
    throw new Error("INVALID_PROPOSAL_DEADLINE");
  }

  const reviews: Array<AllwainPublicationReviewResult & { itemId: string }> =
    [];
  for (const item of selectedItems) {
    const review = await reviewAllwainPublication(
      userId,
      {
        entityType: "request",
        title: item.productName,
        description:
          item.description ||
          `Necesito ${Number(item.quantity)} ${item.unit} de ${item.productName}.`,
        category: item.category,
        productKind: item.productKind,
        quantity: Number(item.quantity),
        unit: item.unit,
        price:
          item.targetUnitPriceAmount === null
            ? null
            : item.targetUnitPriceAmount / 100,
        currency: current.currency,
        deliveryWindow: current.needByText,
        locationLabel: current.locationLabel,
      },
      { entityId: item.id, useAi: false },
    );
    assertAllwainPublicationCanProceed(review);
    reviews.push({ ...review, itemId: item.id });
  }

  const published = await prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`shopping_list:${shoppingListId}`}))`,
    );
    const locked = await tx.allwainShoppingList.findUnique({
      where: { id: shoppingListId },
    });
    if (!locked || locked.buyerUserId !== userId) {
      throw new Error("SHOPPING_LIST_NOT_FOUND");
    }
    if (locked.status !== "draft" || locked.version !== current.version) {
      throw new Error("SHOPPING_LIST_CHANGED");
    }
    for (const review of reviews) {
      await tx.allwainShoppingListItem.update({
        where: { id: review.itemId },
        data: {
          qualityReviewId: review.id,
          qualityDecision: review.decision,
          qualityScore: review.score,
        },
      });
    }
    const row = await tx.allwainShoppingList.update({
      where: { id: shoppingListId },
      data: {
        status: "published",
        visibility: "public",
        publishedAt: new Date(),
        version: { increment: 1 },
      },
      include: listSelect(),
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateType: "shopping_list",
      aggregateId: shoppingListId,
      eventType: "shopping_list.published",
      actorUserId: userId,
      actorRole: "buyer",
      source: "allwain_shopping_list",
      payload: {
        previousStatus: "draft",
        nextStatus: "published",
        previousVersion: locked.version,
        nextVersion: row.version,
        itemCount: reviews.length,
        quality: reviews.map((review) => ({
          itemId: review.itemId,
          reviewId: review.id,
          decision: review.decision,
          score: review.score,
        })),
      },
    });
    return row;
  });
  return (
    await hydrateShoppingLists([published], userId, {
      includeAllProposals: true,
      includeProposals: false,
    })
  )[0];
}

function normalizeListQuery(input: AllwainDiscoveryInput & {
  limit?: unknown;
  cursor?: unknown;
  query?: unknown;
  status?: unknown;
}) {
  const limit = Math.min(
    50,
    Math.max(1, Math.trunc(Number(input.limit) || 20)),
  );
  const cursor = optionalText(input.cursor, 2048);
  const query = optionalText(input.query, 120);
  const status = optionalText(input.status, 30);
  if (status && !LIST_STATUSES.has(status))
    throw new Error("INVALID_SHOPPING_LIST_STATUS");
  const params = { ...input, limit, cursor, query, status };
  validateDiscovery(params);
  return params;
}

async function shoppingListDiscoveryWhere(input: AllwainDiscoveryInput, userId: string, market: boolean) {
  const { category, subcategory, productKind, unit, minPrice, maxPrice, currency, ...listFields } = input;
  const filters = discoveryWhere({ ...listFields, currency });
  if (category || subcategory || productKind || unit || minPrice != null || maxPrice != null) {
    const itemFilters = discoveryWhere({ category, subcategory, productKind, unit, minPrice: minPrice == null ? null : Math.round(minPrice * 100), maxPrice: maxPrice == null ? null : Math.round(maxPrice * 100) }, { titleField: "productName", priceField: "targetUnitPriceAmount" });
    filters.push({ items: { some: { reviewStatus: "selected", AND: itemFilters } } });
  }
  if (input.deliveryChannel) filters.push({ preferredDeliveryChannel: input.deliveryChannel });
  const before = discoveryDate(input.proposalDeadlineBefore, true), after = discoveryDate(input.proposalDeadlineAfter);
  if (before || after) filters.push({ proposalDeadlineAt: { ...(before ? { lte: before } : {}), ...(after ? { gte: after } : {}) } });
  if (input.radiusKm != null) filters.push({ id: { in: await allwainDiscoveryNearbyIdsPg("AllwainShoppingList", input) } });
  if (market && input.responseStatus) {
    const state: any = input.responseStatus === "expired" ? { allwainStatus: "active", proposalExpiresAt: { lte: new Date() } } : input.responseStatus === "active" ? { allwainStatus: "active", OR: [{ proposalExpiresAt: null }, { proposalExpiresAt: { gt: new Date() } }] } : input.responseStatus === "none" || input.responseStatus === "any" ? {} : { allwainStatus: input.responseStatus };
    filters.push({ offers: { [input.responseStatus === "none" ? "none" : "some"]: { owner: "allwain", ownerUserId: userId, ...state } } });
  }
  return filters;
}

function listSearch(query: string | null) {
  if (!query) return {};
  return {
    OR: [
      { title: { contains: query, mode: "insensitive" } },
      { description: { contains: query, mode: "insensitive" } },
      { locationLabel: { contains: query, mode: "insensitive" } },
      {
        items: {
          some: { productName: { contains: query, mode: "insensitive" } },
        },
      },
    ],
  };
}

export async function listMyAllwainShoppingLists(
  userId: string,
  input: AllwainDiscoveryInput & {
    limit?: unknown;
    cursor?: unknown;
    query?: unknown;
    status?: unknown;
  },
) {
  requirePostgres();
  const params = normalizeListQuery(input);
  const pageCursor = discoveryCursor(params, "shopping-lists-mine", userId);
  const prisma = getPrisma() as any;
  const rows = await prisma.allwainShoppingList.findMany({
    where: {
      buyerUserId: userId,
      ...(params.status ? { status: params.status } : {}),
      ...listSearch(params.query),
      AND: [...await shoppingListDiscoveryWhere(params, userId, false), pageCursor.where()],
    },
    include: listSelect(),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: params.limit + 1,
  });
  const hasNextPage = rows.length > params.limit;
  const pageRows = rows.slice(0, params.limit);
  return {
    items: await hydrateShoppingLists(pageRows, userId, {
      includeAllProposals: true,
      includeProposals: false,
    }),
    pageInfo: {
      hasNextPage,
      nextCursor: hasNextPage ? pageCursor.encode(pageRows.at(-1)) : null,
    },
  };
}

export async function listAllwainShoppingListMarket(
  userId: string,
  input: AllwainDiscoveryInput & { limit?: unknown; cursor?: unknown; query?: unknown },
) {
  requirePostgres();
  const params = normalizeListQuery(input);
  const pageCursor = discoveryCursor(params, "shopping-lists-market", userId);
  const prisma = getPrisma() as any;
  const rows = await prisma.allwainShoppingList.findMany({
    where: {
      status: { in: [...ALLWAIN_OPEN_SHOPPING_LIST_STATUSES] },
      visibility: "public",
      buyerUserId: { not: userId },
      AND: [
        {
          OR: [
            { proposalDeadlineAt: null },
            { proposalDeadlineAt: { gt: new Date() } },
          ],
        },
        listSearch(params.query),
        ...await shoppingListDiscoveryWhere(params, userId, true), pageCursor.where(),
      ],
    },
    include: listSelect(),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: params.limit + 1,
  });
  const hasNextPage = rows.length > params.limit;
  const pageRows = rows.slice(0, params.limit);
  return {
    items: await hydrateShoppingLists(pageRows, userId, {
      includeAllProposals: false,
      includeProposalItems: false,
    }),
    pageInfo: {
      hasNextPage,
      nextCursor: hasNextPage ? pageCursor.encode(pageRows.at(-1)) : null,
    },
  };
}

export async function getAllwainShoppingListForUser(
  userId: string,
  shoppingListId: string,
) {
  requirePostgres();
  const prisma = getPrisma() as any;
  const [user, row, ownProposal] = await Promise.all([
    prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { role: true },
    }),
    prisma.allwainShoppingList.findUnique({
      where: { id: shoppingListId },
      include: listSelect(),
    }),
    prisma.offer.findFirst({
      where: { shoppingListId, ownerUserId: userId, owner: "allwain" },
      select: { id: true },
    }),
  ]);
  if (!user || !row) throw new Error("SHOPPING_LIST_NOT_FOUND");
  const isOwner = row.buyerUserId === userId;
  const isAdmin = String(user.role || "").toLowerCase() === "admin";
  const isOpen =
    ALLWAIN_OPEN_SHOPPING_LIST_STATUSES.includes(row.status) &&
    row.visibility === "public";
  if (!isOwner && !isAdmin && !isOpen && !ownProposal) {
    throw new Error("SHOPPING_LIST_NOT_FOUND");
  }
  return (
    await hydrateShoppingLists([row], userId, {
      includeAllProposals: isOwner || isAdmin,
      includeProposalItems: true,
    })
  )[0];
}

export async function duplicateAllwainShoppingList(
  userId: string,
  shoppingListId: string,
  input: { proposalWindowDays?: unknown } = {},
) {
  requirePostgres();
  const prisma = getPrisma() as any;
  const duplicated = await prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`shopping_list:${shoppingListId}`}))`,
    );
    const source = await tx.allwainShoppingList.findUnique({
      where: { id: shoppingListId },
      include: { items: { orderBy: { position: "asc" } } },
    });
    if (!source || source.buyerUserId !== userId) {
      throw new Error("SHOPPING_LIST_NOT_FOUND");
    }
    const sourceItemsByPosition = new Map<number, any>(
      source.items.map((item: any) => [item.position, item]),
    );
    const nextId = randomUUID();
    const nextItems = source.items.map((item: any) => ({
      id: randomUUID(),
      shoppingListId: nextId,
      position: item.position,
      productName: item.productName,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      targetUnitPriceAmount: item.targetUnitPriceAmount,
      category: item.category,
      subcategory: item.subcategory,
      productKind: item.productKind,
      notes: item.notes,
    }));
    const row = await tx.allwainShoppingList.create({
      data: {
        id: nextId,
        buyerUserId: userId,
        sourceShoppingListId: source.id,
        title: source.title,
        description: source.description,
        status: "draft",
        visibility: "private",
        currency: source.currency,
        allowSubstitutions: source.allowSubstitutions,
        needByText: source.needByText,
        proposalDeadlineAt: normalizeDeadline({
          proposalWindowDays: input.proposalWindowDays,
        }),
        preferredDeliveryChannel: source.preferredDeliveryChannel,
        deliveryAddress: source.deliveryAddress || undefined,
        deliveryWindow: source.deliveryWindow || undefined,
        recurrence: source.recurrence || undefined,
        locationLabel: source.locationLabel,
        locationLatApprox: source.locationLatApprox,
        locationLngApprox: source.locationLngApprox,
      },
      include: listSelect(),
    });
    await tx.allwainShoppingListItem.createMany({ data: nextItems });
    await appendAllwainAuditEventTx(tx, {
      aggregateType: "shopping_list",
      aggregateId: row.id,
      eventType: "shopping_list.duplicated",
      actorUserId: userId,
      actorRole: "buyer",
      source: "allwain_shopping_list",
      payload: {
        sourceShoppingListId: source.id,
        sourceStatus: source.status,
        sourceVersion: source.version,
        itemCount: nextItems.length,
        items: nextItems.map((item: any) => ({
          id: item.id,
          sourceItemId: sourceItemsByPosition.get(item.position)?.id || null,
          productName: item.productName,
          quantity: Number(item.quantity),
          unit: item.unit,
          targetUnitPriceAmount: item.targetUnitPriceAmount,
        })),
      },
    });
    return row;
  });
  return (
    await hydrateShoppingLists([duplicated], userId, {
      includeAllProposals: true,
      includeProposals: false,
    })
  )[0];
}

function normalizeProposalLines(
  items: any[],
  input: unknown,
  allowSubstitutions: boolean,
) {
  if (!Array.isArray(input) || input.length < 1 || input.length > items.length) {
    throw new Error("INVALID_SHOPPING_LIST_PROPOSAL_ITEMS");
  }
  const sourceById = new Map(
    input.map((entry) => [
      cleanText((entry as ProposalLineInput)?.shoppingListItemId, 64),
      entry,
    ]),
  );
  if (sourceById.size !== input.length || sourceById.has("")) {
    throw new Error("INVALID_SHOPPING_LIST_PROPOSAL_ITEMS");
  }
  const selectedItems = items.filter((item) => sourceById.has(item.id));
  if (selectedItems.length !== input.length) {
    throw new Error("INVALID_SHOPPING_LIST_PROPOSAL_ITEMS");
  }
  return selectedItems.map((item) => {
    const source = sourceById.get(item.id) as ProposalLineInput | undefined;
    if (!source) throw new Error("INVALID_SHOPPING_LIST_PROPOSAL_ITEMS");
    const isSubstitution = source.isSubstitution === true;
    if (isSubstitution && !allowSubstitutions) {
      throw new Error("SHOPPING_LIST_SUBSTITUTION_NOT_ALLOWED");
    }
    const productName = isSubstitution
      ? cleanText(source.productName, 160)
      : item.productName;
    if (productName.length < 2)
      throw new Error("INVALID_SHOPPING_LIST_ITEM_NAME");
    const quantity = roundedQuantity(source.quantity ?? item.quantity);
    const unit = normalizeAllwainUnit(source.unit || item.unit);
    if (quantity === null || !unit) {
      throw new Error("INVALID_SHOPPING_LIST_PROPOSAL_ITEM");
    }
    if (
      !isSubstitution &&
      (Math.abs(quantity - Number(item.quantity)) > 0.0001 ||
        unit !== item.unit)
    ) {
      throw new Error("SHOPPING_LIST_PROPOSAL_QUANTITY_MISMATCH");
    }
    const unitPrice = finitePositive(source.unitPrice);
    if (unitPrice === null || unitPrice > 10_000_000) {
      throw new Error("INVALID_OFFER_PRICE");
    }
    const unitPriceAmount = Math.round(unitPrice * 100);
    if (
      item.targetUnitPriceAmount !== null &&
      item.targetUnitPriceAmount !== undefined &&
      unitPriceAmount > Number(item.targetUnitPriceAmount)
    ) {
      throw new Error("OFFER_ABOVE_REFERENCE_PRICE");
    }
    const subtotalAmount = Math.round(quantity * unitPriceAmount);
    if (!Number.isSafeInteger(subtotalAmount) || subtotalAmount <= 0) {
      throw new Error("INVALID_OFFER_PRICE");
    }
    return {
      id: randomUUID(),
      shoppingListItemId: item.id,
      position: item.position,
      productName,
      description: optionalText(source.description, 1_000) || item.description,
      quantity,
      unit,
      unitPriceAmount,
      subtotalAmount,
      isSubstitution,
      notes: optionalText(source.notes, 600),
    };
  });
}

export async function upsertAllwainShoppingListProposal(
  userId: string,
  shoppingListId: string,
  input: {
    listVersion?: unknown;
    description?: unknown;
    deliveryEstimate?: unknown;
    shippingWeightKg?: unknown;
    validUntil?: unknown;
    validForMinutes?: unknown;
    items?: unknown;
  },
) {
  requirePostgres();
  const prisma = getPrisma() as any;
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null, status: "active" },
    select: { id: true, name: true, role: true },
  });
  if (!user) throw new Error("USER_NOT_FOUND");
  if (
    !(await isAllwainSellerEnabled(
      userId,
      String(user.role || "").toLowerCase(),
    ))
  ) {
    throw new Error("SELLER_ROLE_REQUIRED");
  }
  const list = await prisma.allwainShoppingList.findUnique({
    where: { id: shoppingListId },
    include: { items: { orderBy: { position: "asc" } } },
  });
  if (
    !list ||
    !ALLWAIN_OPEN_SHOPPING_LIST_STATUSES.includes(list.status) ||
    list.visibility !== "public" ||
    list.buyerUserId === userId ||
    (list.proposalDeadlineAt && list.proposalDeadlineAt <= new Date())
  ) {
    throw new Error("SHOPPING_LIST_NOT_OPEN");
  }
  const listVersion = Math.trunc(Number(input.listVersion));
  if (!Number.isInteger(listVersion) || listVersion !== list.version) {
    throw new Error("SHOPPING_LIST_CHANGED");
  }
  const description = cleanText(input.description, 1_500);
  const deliveryEstimate = cleanText(input.deliveryEstimate, 240);
  if (!description || !deliveryEstimate)
    throw new Error("MISSING_OFFER_FIELDS");
  const shippingWeightKg =
    input.shippingWeightKg === undefined ||
    input.shippingWeightKg === null ||
    input.shippingWeightKg === ""
      ? null
      : finitePositive(input.shippingWeightKg);
  if (
    (shippingWeightKg === null &&
      input.shippingWeightKg !== undefined &&
      input.shippingWeightKg !== null &&
      input.shippingWeightKg !== "") ||
    (shippingWeightKg !== null && shippingWeightKg > 1_000) ||
    (list.preferredDeliveryChannel === "carrier" && shippingWeightKg === null)
  ) {
    throw new Error("INVALID_SHOPPING_LIST_SHIPPING_WEIGHT");
  }
  const validUntil = normalizeAllwainProposalExpiry({
    validForMinutes: input.validForMinutes,
    validUntil: input.validUntil,
    ceiling: list.proposalDeadlineAt,
  });
  const proposalEligibleItems = list.items.filter(
    (item: any) => item.reviewStatus === "selected",
  );
  const lines = normalizeProposalLines(
    proposalEligibleItems,
    input.items,
    list.allowSubstitutions,
  );
  const totalAmount = lines.reduce((sum, line) => sum + line.subtotalAmount, 0);
  const referenceAmount = lines.every((line) => {
    const item = list.items.find((candidate: any) => candidate.id === line.shoppingListItemId);
    return item?.targetUnitPriceAmount !== null && item?.targetUnitPriceAmount !== undefined;
  })
    ? lines.reduce((sum, line) => {
        const item = list.items.find((candidate: any) => candidate.id === line.shoppingListItemId);
        return sum + Math.round(Number(item.targetUnitPriceAmount) * line.quantity);
      }, 0)
    : null;
  const qualityReview = await reviewAllwainPublication(
    userId,
    {
      entityType: "proposal",
      title: `Propuesta para ${list.title}`,
      description,
      category: "general",
      productKind: "general",
      quantity: 1,
      unit: "ud",
      price: totalAmount / 100,
      currency: list.currency,
      deliveryWindow: deliveryEstimate,
      locationLabel: list.locationLabel,
    },
    { useAi: process.env.NODE_ENV !== "test" },
  );
  assertAllwainPublicationCanProceed(qualityReview);
  const commercialModel = await getAllwainSellerCommercialModel(userId);

  const result = await prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`shopping_list:${shoppingListId}`}))`,
    );
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "AllwainShoppingList" WHERE "id" = ${shoppingListId} FOR UPDATE`);
    const locked = await tx.allwainShoppingList.findUnique({
      where: { id: shoppingListId },
      include: { items: { orderBy: { position: "asc" } } },
    });
    if (
      !locked ||
      !ALLWAIN_OPEN_SHOPPING_LIST_STATUSES.includes(locked.status) ||
      locked.version !== listVersion ||
      (locked.proposalDeadlineAt && locked.proposalDeadlineAt <= new Date())
    ) {
      throw new Error("SHOPPING_LIST_CHANGED");
    }
    const existing = await tx.offer.findFirst({
      where: { shoppingListId, ownerUserId: userId, owner: "allwain" },
      include: { shoppingListProposalItems: true },
    });
    if (existing?.allwainStatus === "selected") {
      throw new Error("SHOPPING_LIST_PROPOSAL_ALREADY_SELECTED");
    }
    if (existing?.allwainStatus === "withdrawn") throw new Error("PROPOSAL_NOT_EDITABLE");
    const existingLines = new Map<string, number>(
      (existing?.shoppingListProposalItems || []).map(
        (line: any) =>
          [line.shoppingListItemId, Number(line.unitPriceAmount)] as [
            string,
            number,
          ],
      ),
    );
    if (
      lines.some((line) => {
        const previous = existingLines.get(line.shoppingListItemId);
        return previous !== undefined && line.unitPriceAmount > previous;
      })
    ) {
      throw new Error("PROPOSAL_NOT_IMPROVED");
    }
    const awardedItemIds = new Set(
      (
        await listActiveAllwainShoppingListAwardLines(tx, [shoppingListId])
      ).map((line: any) => line.shoppingListItemId),
    );
    if (lines.some((line) => awardedItemIds.has(line.shoppingListItemId))) {
      throw new Error("SHOPPING_LIST_ITEMS_ALREADY_AWARDED");
    }
    const offerId = existing?.id || randomUUID();
    const itemSnapshot = lines.map((line) => ({
      id: line.id,
      shoppingListItemId: line.shoppingListItemId,
      position: line.position,
      productName: line.productName,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitPriceAmount: line.unitPriceAmount,
      subtotalAmount: line.subtotalAmount,
      currency: locked.currency,
      isSubstitution: line.isSubstitution,
      notes: line.notes,
    }));
    const meta = {
      shoppingListId,
      proposalKind: "shopping_list",
      shoppingListVersion: locked.version,
      itemCount: lines.length,
      coveredItemCount: lines.length,
      totalListItemCount: proposalEligibleItems.length,
      coverageKind:
        lines.length === proposalEligibleItems.length ? "full" : "partial",
      shoppingListItems: itemSnapshot,
      unit: "lista",
      currency: locked.currency,
      minQuantity: 1,
      quantityStep: 1,
      maxQuantityPerOrder: 1,
      requestedQuantity: 1,
      inventoryManaged: false,
      deliveryEstimate,
      shippingWeightKg,
      validUntil: validUntil.toISOString(),
      referenceAmount,
      acceptedOfferAmount: totalAmount,
      feeBasis: referenceAmount === null ? "sale_amount" : "verified_savings",
      shoppingListDefaults: {
        recurrence: locked.recurrence,
        deliveryWindow: locked.deliveryWindow,
        preferredDeliveryChannel: locked.preferredDeliveryChannel,
      },
      publicationReviewId: qualityReview.id,
      qualityDecision: qualityReview.decision,
      qualityScore: qualityReview.score,
      demo: locked.demo === true,
      checkoutEnabled: locked.demo !== true,
    };
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
    const offerData = {
      title: `${lines.length === locked.items.length ? "Propuesta completa" : "Propuesta parcial"} de ${user.name}: ${locked.title}`,
      description,
      owner: "allwain",
      ownerUserId: userId,
      commercialModel,
      price: totalAmount / 100,
      meta,
      allwainType: "proposal",
      allwainStatus: "active",
      requestId: null,
      shoppingListId,
      currency: locked.currency,
      unit: "lista",
      category: "multi_categoria",
      productKind: "general",
      locationLabel: locked.locationLabel,
      proposalExpiresAt: validUntil,
      proposalRevision: revision,
    };
    const offer = existing
      ? await tx.offer.update({ where: { id: existing.id }, data: offerData })
      : await tx.offer.create({ data: { id: offerId, ...offerData } });
    await tx.allwainShoppingListProposalItem.deleteMany({
      where: { offerId: offer.id },
    });
    await tx.allwainShoppingListProposalItem.createMany({
      data: lines.map((line) => ({
        ...line,
        shoppingListId,
        offerId: offer.id,
        sellerUserId: userId,
        currency: locked.currency,
      })),
    });
    if (existing) {
      await tx.allwainProposalRevision.updateMany({
        where: { offerId: offer.id, status: "current" },
        data: { status: "superseded" },
      });
    }
    const revisionSnapshot = {
      version: "allwain-proposal-revision-v1",
      offerId: offer.id,
      revision,
      sellerUserId: userId,
      requestId: null,
      shoppingListId,
      totalAmount,
      referenceAmount,
      grossSavingsAmount:
        referenceAmount === null ? null : referenceAmount - totalAmount,
      currency: locked.currency,
      validUntil: validUntil.toISOString(),
      description,
      deliveryEstimate,
      payload: {
        listVersion: locked.version,
        coverageKind: lines.length === locked.items.length ? "full" : "partial",
        items: itemSnapshot,
        shippingWeightKg,
      },
    };
    const proposalRevision = await tx.allwainProposalRevision.create({
      data: {
        id: randomUUID(),
        offerId: offer.id,
        revision,
        sellerUserId: userId,
        shoppingListId,
        totalAmount,
        referenceAmount,
        grossSavingsAmount:
          referenceAmount === null ? null : referenceAmount - totalAmount,
        currency: locked.currency,
        validUntil,
        description,
        deliveryEstimate,
        payload: revisionSnapshot.payload,
        snapshotHash: allwainProposalSnapshotHash(revisionSnapshot),
        status: "current",
      },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateType: "shopping_list",
      aggregateId: shoppingListId,
      eventType: existing
        ? "shopping_list.proposal_updated"
        : "shopping_list.proposal_submitted",
      actorUserId: userId,
      actorRole: "seller",
      source: "allwain_shopping_list",
      payload: {
        offerId: offer.id,
        proposalRevisionId: proposalRevision.id,
        proposalRevision: revision,
        sellerUserId: userId,
        listVersion: locked.version,
        totalAmount,
        currency: locked.currency,
        itemCount: lines.length,
        coverageKind: lines.length === locked.items.length ? "full" : "partial",
        totalListItemCount: locked.items.length,
        items: itemSnapshot,
        deliveryEstimate,
        shippingWeightKg,
        validUntil: validUntil.toISOString(),
        referenceAmount,
        grossSavingsAmount:
          referenceAmount === null ? null : referenceAmount - totalAmount,
        snapshotHash: proposalRevision.snapshotHash,
        qualityReviewId: qualityReview.id,
      },
    });
    return { offerId: offer.id, existing: Boolean(existing) };
  });

  await (getPrisma() as any).allwainPublicationReview.updateMany({
    where: { id: qualityReview.id, entityId: null },
    data: { entityId: result.offerId },
  });
  await notifyAllwainUser({
    userId: list.buyerUserId,
    type: "shopping_list.proposal_received",
    title: "Tienes una propuesta para tu lista",
    body: `${user.name} ha preparado precio para ${lines.length} de ${list.items.length} artículos.`,
    route: "shopping_list",
    routeParams: { shoppingListId, mode: "buy" },
    dedupeKey: `shopping_list.proposal:${shoppingListId}:${result.offerId}:${qualityReview.id}`,
  });
  return {
    created: !result.existing,
    shoppingList: await getAllwainShoppingListForUser(userId, shoppingListId),
  };
}

export async function cancelAllwainShoppingList(
  userId: string,
  shoppingListId: string,
) {
  requirePostgres();
  const prisma = getPrisma() as any;
  const row = await prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`shopping_list:${shoppingListId}`}))`,
    );
    const current = await tx.allwainShoppingList.findUnique({
      where: { id: shoppingListId },
    });
    if (!current || current.buyerUserId !== userId) {
      throw new Error("SHOPPING_LIST_NOT_FOUND");
    }
    if (
      ["partially_awarded", "awarded", "closed", "canceled", "archived"].includes(
        current.status,
      )
    ) {
      throw new Error("SHOPPING_LIST_LOCKED");
    }
    const canceled = await tx.allwainShoppingList.update({
      where: { id: shoppingListId },
      data: {
        status: "canceled",
        closedAt: new Date(),
        version: { increment: 1 },
      },
      include: listSelect(),
    });
    await tx.offer.updateMany({
      where: {
        shoppingListId,
        allwainStatus: { in: ["active", "paused"] },
      },
      data: { allwainStatus: "withdrawn" },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateType: "shopping_list",
      aggregateId: shoppingListId,
      eventType: "shopping_list.canceled",
      actorUserId: userId,
      actorRole: "buyer",
      source: "allwain_shopping_list",
      payload: {
        previousStatus: current.status,
        nextStatus: "canceled",
        previousVersion: current.version,
        nextVersion: canceled.version,
      },
    });
    return canceled;
  });
  return (
    await hydrateShoppingLists([row], userId, {
      includeAllProposals: true,
      includeProposalItems: true,
    })
  )[0];
}
