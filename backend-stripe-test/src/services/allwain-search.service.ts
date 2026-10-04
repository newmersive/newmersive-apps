import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";
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
  ensureAllwainRequestImageMeta,
} from "./allwain-card-images.service";

function cleanQuery(value: unknown) {
  const query = String(value || "").trim().slice(0, 120);
  if (query.length < 2) throw new Error("SEARCH_QUERY_TOO_SHORT");
  return query;
}

function iso(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value || "");
}

function publicRequestExtracted(value: unknown) {
  const extracted =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    productName: extracted.productName ?? null,
    description: extracted.description ?? null,
    quantity: extracted.quantity ?? null,
    unit: extracted.unit ?? null,
    targetPrice: extracted.targetPrice ?? null,
    currency: extracted.currency ?? "EUR",
    category: extracted.category ?? null,
    subcategory: extracted.subcategory ?? null,
    productKind: extracted.productKind ?? null,
    deliveryWindow: extracted.deliveryWindow ?? null,
    deliveryMethod: extracted.deliveryMethod ?? null,
    attributes: Array.isArray(extracted.attributes) ? extracted.attributes : [],
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
          !offer.meta?.requestId &&
          offer.ownerUserId !== input.userId &&
          `${offer.title} ${offer.description || ""} ${offer.meta?.category || ""} ${offer.meta?.locationLabel || ""} ${usersById.get(offer.ownerUserId)?.name || ""}`
            .toLowerCase()
            .includes(normalized),
      )
      .slice(0, limit)
      .map((offer) => ({
        ...ensureAllwainOfferImage(offer),
        provider: {
          id: offer.ownerUserId,
          name: usersById.get(offer.ownerUserId)?.name || "Vendedor",
          score: 0,
          reviewCount: 0,
          completedOrders: 0,
        },
      }));
    const requests = getAllwainScanRequests()
      .filter(
        (request) =>
          request.status === "submitted" &&
          (request.visibility || "public") === "public" &&
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
        imageMeta: ensureAllwainRequestImageMeta(
          request.imageMeta as Record<string, unknown> | null,
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
      .map((product) => {
        const image = ensureAllwainImageMeta(
          null,
          {
            title: product.name,
            description: product.description,
            category: product.category,
          },
          { preferredUrl: product.imageUrl, preferredSource: "original" },
        );
        return {
          ...product,
          imageUrl: image.imageUrl,
          imageIllustrative: image.imageIllustrative,
          imageAlt: image.imageAlt,
        };
      });
    return { query, offers, requests, sellers: [], products };
  }

  const prisma = getPrisma();
  const [offerRows, requestRows, productRows, matchingUsers, matchingProfiles] =
    await Promise.all([
      prisma.offer.findMany({
        where: {
          owner: "allwain",
          requestId: null,
          OR: [{ allwainStatus: "active" }, { allwainStatus: null }],
          AND: [
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

  const offers = offerRows.map((offer) => ({
    ...ensureAllwainOfferImage(offer as any),
    createdAt: iso(offer.createdAt),
    updatedAt: iso(offer.updatedAt),
    provider: people.get(offer.ownerUserId) || {
      id: offer.ownerUserId,
      name: "Vendedor",
      score: 0,
      reviewCount: 0,
      completedOrders: 0,
    },
  }));
  const requests = requestRows.map((request) => ({
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
    imageMeta: ensureAllwainRequestImageMeta(
      request.imageMeta as Record<string, unknown> | null,
      request.extracted as any,
      request.title,
    ),
    extracted: publicRequestExtracted(request.extracted),
    requester: people.get(request.userId) || {
      id: request.userId,
      name: "Comprador",
    },
    createdAt: iso(request.createdAt),
  }));
  const sellers = sellerIds.map((userId) => {
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
  const products = productRows.map((product) => {
    const image = ensureAllwainImageMeta(
      null,
      {
        title: product.name,
        description: product.description,
        category: product.category,
      },
      { preferredUrl: product.imageUrl, preferredSource: "original" },
    );
    return {
      id: product.id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      description: product.description,
      imageUrl: image.imageUrl,
      imageIllustrative: image.imageIllustrative,
      imageAlt: image.imageAlt,
    };
  });

  return { query, offers, requests, sellers, products };
}
