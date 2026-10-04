import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";
import { AllwainScanExtractedFields, Offer, Product } from "../shared/types";
import {
  getAllwainScanRequests,
  getOffersByOwner,
  getProducts,
  getUsers,
} from "./data.store";
import { getAllwainOfferProviderSummariesPg } from "./data.store.allwain.pg";
import {
  ensureAllwainImageMeta,
  ensureAllwainOfferImage,
  publicRequestCardImageMeta,
} from "./allwain-card-images.service";
import {
  allwainPublicCatalogWhere,
  isPublicCatalogOffer,
} from "./allwain-publication-policy";

function cleanQuery(value: unknown) {
  const query = String(value || "").trim().slice(0, 120);
  if (query.length < 2) throw new Error("SEARCH_QUERY_TOO_SHORT");
  return query;
}

function iso(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value || "");
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function publicText(value: unknown) {
  return typeof value === "string" ? value : null;
}

function publicNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function publicPerson(value: unknown, id: string, fallback: string) {
  const person = record(value);
  return {
    id,
    name: publicText(person.name) || fallback,
    score: publicNumber(person.score) || 0,
    reviewCount: publicNumber(person.reviewCount) || 0,
    completedOrders: publicNumber(person.completedOrders) || 0,
  };
}

function publicDeliveryPricing(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const pricing = record(value);
  const local = record(pricing.localConnector);
  const pickup = record(pricing.pickup);
  const seller = record(pricing.seller);
  const carrier = record(pricing.carrier);
  return {
    currency: publicText(pricing.currency) || "EUR",
    localConnector: {
      available: local.available === true,
      amount: publicNumber(local.amount) || 0,
      pricingMode: "fixed_per_delivery",
    },
    pickup: { available: pickup.available === true, amount: 0, pricingMode: "free" },
    seller: { available: seller.available === true, amount: 0, pricingMode: "free" },
    carrier: {
      available: carrier.available === true,
      amount: publicNumber(carrier.amount),
      pricingMode: "provider_quote_required",
      provider: carrier.provider === "sendcloud" ? "sendcloud" : undefined,
      name: publicText(carrier.name),
      configured: carrier.configured === true,
    },
  };
}

function publicCatalogOffer(offer: Offer, person: unknown) {
  const meta = record(ensureAllwainOfferImage(offer).meta);
  const unit = publicText(offer.unit) || publicText(meta.unit);
  return {
    id: offer.id,
    title: offer.title,
    description: offer.description,
    ownerUserId: offer.ownerUserId,
    price: publicNumber(offer.price),
    allwainType: "catalog",
    allwainStatus: "active",
    currency: publicText(offer.currency) || publicText(meta.currency) || "EUR",
    unit,
    category: publicText(offer.category) || publicText(meta.category),
    subcategory: publicText(offer.subcategory) || publicText(meta.subcategory),
    productKind: publicText(offer.productKind) || publicText(meta.productKind),
    locationLabel: publicText(offer.locationLabel) || publicText(meta.locationLabel),
    commercialModel: offer.commercialModel === "platform_direct" ? "platform_direct" : "marketplace",
    createdAt: iso(offer.createdAt),
    updatedAt: iso(offer.updatedAt),
    meta: {
      unit,
      inventoryManaged: meta.inventoryManaged === true,
      availableQuantity: publicNumber(meta.availableQuantity),
      minQuantity: publicNumber(meta.minQuantity),
      quantityStep: publicNumber(meta.quantityStep),
      maxQuantityPerOrder: publicNumber(meta.maxQuantityPerOrder),
      saleMode: meta.saleMode === "preorder" ? "preorder" : "immediate",
      preorderChargeDeadlineAt: publicText(meta.preorderChargeDeadlineAt),
      deliveryPricing: publicDeliveryPricing(meta.deliveryPricing),
      imageUrl: publicText(meta.imageUrl),
      imageKey: publicText(meta.imageKey),
      imageSource: publicText(meta.imageSource),
      imageIllustrative: meta.imageIllustrative === true,
      imageAlt: publicText(meta.imageAlt),
      imageAssignedAt: publicText(meta.imageAssignedAt),
      demo: meta.demo === true,
      checkoutEnabled: meta.checkoutEnabled !== false,
    },
    provider: publicPerson(person, offer.ownerUserId, "Vendedor"),
  };
}

function publicRequestImage(
  value: unknown,
  extracted: AllwainScanExtractedFields,
  title: string,
) {
  const image = record(publicRequestCardImageMeta(
    record(value),
    extracted,
    title,
  ));
  return {
    hasImage: image.hasImage === true,
    url: publicText(image.url),
    key: publicText(image.key),
    source: publicText(image.source),
    illustrative: image.illustrative === true,
    alt: publicText(image.alt),
    assignedAt: publicText(image.assignedAt),
  };
}

function publicProduct(product: Pick<Product, "id" | "name" | "brand" | "category" | "description" | "imageUrl">) {
  const image = ensureAllwainImageMeta(
    null,
    { title: product.name, description: product.description, category: product.category },
    { preferredUrl: product.imageUrl, preferredSource: "original" },
  );
  return {
    id: product.id,
    name: product.name,
    brand: publicText(product.brand),
    category: publicText(product.category),
    description: publicText(product.description),
    imageUrl: publicText(image.imageUrl),
    imageIllustrative: image.imageIllustrative === true,
    imageAlt: publicText(image.imageAlt),
  };
}

function publicRequestExtracted(value: unknown) {
  const extracted = record(value);
  return {
    productName: publicText(extracted.productName),
    description: publicText(extracted.description),
    quantity: publicNumber(extracted.quantity),
    unit: publicText(extracted.unit),
    targetPrice: publicNumber(extracted.targetPrice),
    currency: publicText(extracted.currency) || "EUR",
    category: publicText(extracted.category),
    subcategory: publicText(extracted.subcategory),
    productKind: publicText(extracted.productKind),
  };
}

export async function searchAllwain(input: {
  userId: string;
  query: unknown;
  limit?: number;
}) {
  const query = cleanQuery(input.query);
  const limit = Math.max(1, Math.min(20, Number(input.limit) || 8));
  if (ENV.STORAGE_DRIVER !== "postgres") {
    const normalized = query.toLowerCase();
    const users = getUsers();
    const usersById = new Map(users.map((user) => [user.id, user]));
    const offers = getOffersByOwner("allwain")
      .filter(
        (offer) =>
          isPublicCatalogOffer(offer, usersById.get(offer.ownerUserId) || null) &&
          offer.ownerUserId !== input.userId &&
          `${offer.title} ${offer.description || ""} ${offer.meta?.category || ""} ${offer.meta?.locationLabel || ""} ${usersById.get(offer.ownerUserId)?.name || ""}`
            .toLowerCase()
            .includes(normalized),
      )
      .slice(0, limit)
      .map((offer) => publicCatalogOffer(offer, usersById.get(offer.ownerUserId)));
    const requests = getAllwainScanRequests()
      .filter(
        (request) =>
          request.status === "submitted" &&
          (request.visibility || "public") === "public" &&
          usersById.has(request.userId) && !usersById.get(request.userId)?.deletedAt &&
          `${request.title} ${request.description} ${request.extracted.category || ""}`
            .toLowerCase()
            .includes(normalized),
      )
      .slice(0, limit)
      .map((request) => ({
        id: request.id,
        title: request.title,
        description: request.description,
        status: request.status,
        category: request.extracted.category || null,
        subcategory: request.extracted.subcategory || null,
        productKind: request.extracted.productKind || null,
        unit: request.extracted.unit || null,
        currency: request.extracted.currency || "EUR",
        locationLabel: request.extracted.locationLabel || null,
        imageMeta: publicRequestImage(
          request.imageMeta,
          request.extracted,
          request.title,
        ),
        extracted: publicRequestExtracted(request.extracted),
        requester: {
          id: request.userId,
          name: usersById.get(request.userId)?.name || "Comprador",
        },
        createdAt: request.createdAt,
      }));
    const products = getProducts()
      .filter(
        (product) =>
          (product.visibility || "public") === "public" &&
          `${product.name} ${product.brand || ""} ${product.category || ""}`
            .toLowerCase()
            .includes(normalized),
      )
      .slice(0, limit)
      .map(publicProduct);
    return { query, offers, requests, sellers: [], products };
  }

  const prisma = getPrisma();
  const deletedUsers = await prisma.user.findMany({
    where: { deletedAt: { not: null } },
    select: { id: true },
  });
  const deletedOwnerUserIds = deletedUsers.map((user) => user.id);
  const [offerRows, requestRows, productRows, matchingUsers, matchingProfiles] =
    await Promise.all([
      prisma.offer.findMany({
        where: {
          AND: [
            allwainPublicCatalogWhere(deletedOwnerUserIds),
            {
              OR: [
                { title: { contains: query, mode: "insensitive" } },
                { description: { contains: query, mode: "insensitive" } },
                { category: { contains: query, mode: "insensitive" } },
                { subcategory: { contains: query, mode: "insensitive" } },
                { locationLabel: { contains: query, mode: "insensitive" } },
              ],
            },
          ],
          NOT: { ownerUserId: input.userId },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
      }),
      prisma.allwainScanRequest.findMany({
        where: {
          status: "submitted",
          visibility: "public",
          ...(deletedOwnerUserIds.length ? { userId: { notIn: deletedOwnerUserIds } } : {}),
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
            { category: { contains: query, mode: "insensitive" } },
            { subcategory: { contains: query, mode: "insensitive" } },
            { locationLabel: { contains: query, mode: "insensitive" } },
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
      }),
      prisma.product.findMany({
        where: {
          visibility: "public",
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { brand: { contains: query, mode: "insensitive" } },
            { category: { contains: query, mode: "insensitive" } },
          ],
        },
        orderBy: { name: "asc" },
        take: limit,
      }),
      prisma.user.findMany({
        where: {
          deletedAt: null,
          name: { contains: query, mode: "insensitive" },
        },
        select: { id: true, name: true },
        take: limit * 2,
      }),
      prisma.allwainSellerProfile.findMany({
        where: {
          status: "active",
          ...(deletedOwnerUserIds.length ? { userId: { notIn: deletedOwnerUserIds } } : {}),
          OR: [
            { displayName: { contains: query, mode: "insensitive" } },
            { sellerType: { contains: query, mode: "insensitive" } },
            { locationLabel: { contains: query, mode: "insensitive" } },
          ],
        },
        take: limit * 2,
      }),
    ]);

  const profileUserIds = matchingProfiles.map((profile) => profile.userId);
  const activeProfilesForUsers = matchingUsers.length
    ? await prisma.allwainSellerProfile.findMany({
        where: {
          status: "active",
          userId: { in: matchingUsers.map((user) => user.id) },
        },
      })
    : [];
  const sellerProfiles = new Map(
    [...matchingProfiles, ...activeProfilesForUsers].map((profile) => [
      profile.userId,
      profile,
    ]),
  );
  const sellerIds = [...new Set([...profileUserIds, ...sellerProfiles.keys()])].slice(
    0,
    limit,
  );
  const providerIds = [
    ...new Set([
      ...offerRows.map((offer) => offer.ownerUserId),
      ...sellerIds,
      ...requestRows.map((request) => request.userId),
    ]),
  ];
  const people = await getAllwainOfferProviderSummariesPg(providerIds);

  const offers = offerRows
    .filter((offer) => isPublicCatalogOffer(offer, people.has(offer.ownerUserId) ? {} : null))
    .map((offer) => publicCatalogOffer(offer as unknown as Offer, people.get(offer.ownerUserId)));
  const requests = requestRows.filter((request) => people.has(request.userId)).map((request) => ({
    id: request.id,
    title: request.title,
    description: request.description,
    status: request.status,
    category: request.category,
    subcategory: request.subcategory,
    productKind: request.productKind,
    unit: request.unit,
    currency: request.currency || "EUR",
    locationLabel: request.locationLabel,
    imageMeta: publicRequestImage(
      request.imageMeta,
      request.extracted as any,
      request.title,
    ),
    extracted: publicRequestExtracted(request.extracted),
    requester: { id: request.userId, name: publicText(record(people.get(request.userId)).name) || "Comprador" },
    createdAt: iso(request.createdAt),
  }));
  const sellers = sellerIds.filter((userId) => people.has(userId)).map((userId) => {
    const profile = sellerProfiles.get(userId);
    const person = people.get(userId);
    return {
      id: userId,
      name: profile?.displayName || person?.name || "Vendedor",
      sellerType: profile?.sellerType || null,
      locationLabel: profile?.locationLabel || null,
      score: person?.score || 0,
      reviewCount: person?.reviewCount || 0,
      completedOrders: person?.completedOrders || 0,
    };
  });
  const products = productRows.map(publicProduct);

  return { query, offers, requests, sellers, products };
}
