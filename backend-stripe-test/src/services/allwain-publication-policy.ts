import { Prisma } from "@prisma/client";

type CatalogOffer = {
  owner?: unknown;
  allwainType?: unknown;
  allwainStatus?: unknown;
  requestId?: unknown;
  shoppingListId?: unknown;
  meta?: unknown;
};

function empty(value: unknown) {
  return value === undefined || value === null || value === "";
}

function metadata(offer: CatalogOffer) {
  return offer.meta && typeof offer.meta === "object" && !Array.isArray(offer.meta)
    ? offer.meta as Record<string, unknown>
    : {};
}

export function isCatalogOffer(offer: CatalogOffer) {
  const meta = metadata(offer);
  return offer.owner === "allwain" &&
    (offer.allwainType == null || offer.allwainType === "catalog") &&
    (empty(meta.allwainType) || meta.allwainType === "catalog") &&
    offer.requestId == null && empty(meta.requestId) &&
    offer.shoppingListId == null && empty(meta.shoppingListId) &&
    empty(meta.proposalKind);
}

/** Resolve the owner explicitly: Offer has no User relation. */
export function isPublicCatalogOffer(
  offer: CatalogOffer,
  owner: { deletedAt?: unknown } | null,
) {
  const meta = metadata(offer);
  return isCatalogOffer(offer) &&
    (offer.allwainStatus == null || offer.allwainStatus === "active") &&
    (empty(meta.status) || meta.status === "active") &&
    (empty(meta.archived) || meta.archived === false) &&
    Boolean(owner) && !owner?.deletedAt;
}

function publicMetaValue(path: string, values: Prisma.InputJsonValue[]): Prisma.OfferWhereInput {
  // Both missing JSON paths and SQL NULL meta are valid legacy catalog rows.
  return {
    OR: [
      { meta: { equals: Prisma.DbNull } },
      { meta: { path: [path], equals: Prisma.AnyNull } },
      ...values.map((value) => ({ meta: { path: [path], equals: value } })),
    ],
  };
}

export function allwainCatalogWhere(): Prisma.OfferWhereInput {
  return {
    owner: "allwain",
    requestId: null,
    shoppingListId: null,
    AND: [
      { OR: [{ allwainType: "catalog" }, { allwainType: null }] },
      publicMetaValue("allwainType", ["catalog", ""]),
      publicMetaValue("requestId", [""]),
      publicMetaValue("shoppingListId", [""]),
      publicMetaValue("proposalKind", [""]),
    ],
  };
}

/** Pass deleted User IDs explicitly; there is no Offer -> User Prisma relation. */
export function allwainPublicCatalogWhere(
  deletedOwnerUserIds: readonly string[] = [],
): Prisma.OfferWhereInput {
  return {
    AND: [
      allwainCatalogWhere(),
      { OR: [{ allwainStatus: "active" }, { allwainStatus: null }] },
      publicMetaValue("archived", [false, ""]),
      publicMetaValue("status", ["active", ""]),
      ...(deletedOwnerUserIds.length
        ? [{ ownerUserId: { notIn: [...deletedOwnerUserIds] } }]
        : []),
    ],
  };
}
