import { allwainProposalSnapshotHash } from "./allwain-proposals";

export const ALLWAIN_OPEN_SHOPPING_LIST_STATUSES = [
  "published",
  "partially_awarded",
] as const;

export const ALLWAIN_INACTIVE_LIST_ORDER_STATUSES = [
  "canceled",
  "expired",
] as const;

export async function listActiveAllwainShoppingListAwardLines(
  tx: any,
  shoppingListIds: string[],
) {
  if (!shoppingListIds.length) return [];
  return tx.allwainOrderLine.findMany({
    where: {
      shoppingListItem: { shoppingListId: { in: shoppingListIds } },
      order: {
        operationalArchivedAt: null,
        status: { notIn: [...ALLWAIN_INACTIVE_LIST_ORDER_STATUSES] },
      },
    },
    select: {
      shoppingListItemId: true,
      offerId: true,
      orderId: true,
      sellerUserId: true,
      quantity: true,
      order: {
        select: {
          shoppingListId: true,
          status: true,
          paymentStatus: true,
          fulfillmentStatus: true,
        },
      },
    },
  });
}

export async function refreshAllwainShoppingListAwardStateTx(
  tx: any,
  shoppingListId: string,
  now = new Date(),
) {
  const list = await tx.allwainShoppingList.findUnique({
    where: { id: shoppingListId },
    select: {
      id: true,
      status: true,
      selectedAt: true,
      selectedOfferId: true,
      _count: { select: { items: true } },
    },
  });
  if (!list) throw new Error("SHOPPING_LIST_NOT_FOUND");

  const activeLines = await listActiveAllwainShoppingListAwardLines(tx, [
    shoppingListId,
  ]);
  const awardedItemIds = new Set(
    activeLines
      .map((line: any) => line.shoppingListItemId)
      .filter((id: unknown): id is string => typeof id === "string"),
  );
  const selectedOfferIds = new Set(
    activeLines
      .map((line: any) => line.offerId)
      .filter((id: unknown): id is string => typeof id === "string"),
  );
  const itemCount = Number(list._count.items);
  const awardedItemCount = awardedItemIds.size;
  const nextStatus =
    awardedItemCount === 0
      ? "published"
      : awardedItemCount >= itemCount
        ? "awarded"
        : "partially_awarded";
  const selectedOfferId =
    nextStatus === "awarded" && selectedOfferIds.size === 1
      ? [...selectedOfferIds][0]
      : null;

  await tx.allwainShoppingList.update({
    where: { id: shoppingListId },
    data: {
      status: nextStatus,
      selectedOfferId,
      selectedAt: awardedItemCount ? list.selectedAt || now : null,
      closedAt: null,
      version: { increment: 1 },
    },
  });

  await tx.offer.updateMany({
    where: {
      shoppingListId,
      allwainStatus: { in: ["selected", "not_selected"] },
      ...(selectedOfferIds.size
        ? { id: { notIn: [...selectedOfferIds] } }
        : {}),
    },
    data: { allwainStatus: "active" },
  });
  // A canceled award keeps its immutable revision. Reopening needs a new
  // revision because each accepted revision belongs to exactly one contract.
  const reopenedOffers = await tx.offer.findMany({
    where: { shoppingListId, allwainStatus: "active" },
    select: { id: true, proposalRevision: true, meta: true },
  });
  for (const offer of reopenedOffers) {
    const previous = await tx.allwainProposalRevision.findUnique({
      where: { offerId_revision: { offerId: offer.id, revision: offer.proposalRevision } },
    });
    if (!previous || previous.status !== "accepted") continue;
    const activeOrder = await tx.allwainOrder.findFirst({
      where: {
        acceptedProposalRevisionId: previous.id,
        status: { notIn: [...ALLWAIN_INACTIVE_LIST_ORDER_STATUSES] },
      },
      select: { id: true },
    });
    if (activeOrder) continue;
    const { id, createdAt, acceptedAt, status, snapshotHash, ...terms } = previous;
    const revision = previous.revision + 1;
    const renewed = { ...terms, revision };
    await tx.allwainProposalRevision.create({
      data: {
        ...renewed,
        status: "current",
        snapshotHash: allwainProposalSnapshotHash({
          version: "allwain-proposal-revision-v1",
          ...renewed,
          validUntil: previous.validUntil.toISOString(),
        }),
      },
    });
    await tx.offer.update({
      where: { id: offer.id },
      data: { proposalRevision: revision, meta: { ...(offer.meta || {}), proposalRevision: revision } },
    });
  }
  if (selectedOfferIds.size) {
    await tx.offer.updateMany({
      where: { id: { in: [...selectedOfferIds] }, shoppingListId },
      data: { allwainStatus: "selected" },
    });
  }
  if (nextStatus === "awarded") {
    await tx.offer.updateMany({
      where: {
        shoppingListId,
        id: { notIn: [...selectedOfferIds] },
        allwainStatus: { in: ["active", "paused"] },
      },
      data: { allwainStatus: "not_selected" },
    });
  }

  return {
    previousStatus: list.status,
    nextStatus,
    itemCount,
    awardedItemCount,
    remainingItemCount: Math.max(0, itemCount - awardedItemCount),
    selectedOfferId,
    selectedOfferIds: [...selectedOfferIds],
    orderIds: [
      ...new Set(activeLines.map((line: any) => String(line.orderId))),
    ],
  };
}
