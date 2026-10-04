import { getPrisma } from "../db/prisma";
import { appendAllwainAuditEventTx } from "./allwain-audit";
import { notifyAllwainUser } from "./allwain-notifications.service";

const REVIEWABLE_FULFILLMENT = new Set(["delivered", "completed"]);
const REVIEW_STATUSES = new Set(["published", "hidden"]);
const PUBLIC_REVIEW_STATUSES = ["published", "reported"];

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  return text ? text.slice(0, maxLength) : null;
}

function participantRole(order: any, userId: string) {
  if (order.buyerUserId === userId) return "buyer";
  if (order.sellerUserId === userId) return "seller";
  if (order.connectorUserId === userId) return "connector";
  return null;
}

function publicName(name: unknown) {
  const parts = String(name || "Usuario Allwain").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] || "Usuario Allwain";
  return `${parts[0]} ${parts[1].slice(0, 1).toUpperCase()}.`;
}

function serializeReview(review: any) {
  return {
    id: review.id,
    orderId: review.orderId,
    authorUserId: review.authorUserId,
    subjectUserId: review.subjectUserId,
    subjectRole: review.subjectRole,
    rating: review.rating,
    comment: review.comment,
    status: review.status,
    response: review.response,
    respondedAt: review.respondedAt,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    author: review.author
      ? {
          id: review.author.id,
          name: publicName(review.author.name),
          avatarUrl: review.author.avatarUrl || null,
        }
      : undefined,
  };
}

async function recomputeAllwainReputationTx(tx: any, userId: string) {
  const [aggregate, lastReview, completedOrders] = await Promise.all([
    tx.allwainReview.aggregate({
      where: { subjectUserId: userId, status: { in: PUBLIC_REVIEW_STATUSES } },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    tx.allwainReview.findFirst({
      where: { subjectUserId: userId, status: { in: PUBLIC_REVIEW_STATUSES } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    tx.allwainOrder.count({
      where: {
        fulfillmentStatus: { in: Array.from(REVIEWABLE_FULFILLMENT) },
        OR: [
          { buyerUserId: userId },
          { sellerUserId: userId },
          { connectorUserId: userId },
        ],
      },
    }),
  ]);
  const averageRating = Number((aggregate._avg.rating || 0).toFixed(2));
  const reviewCount = Number(aggregate._count._all || 0);
  return tx.allwainReputation.upsert({
    where: { userId },
    create: {
      userId,
      averageRating,
      reviewCount,
      completedOrders,
      lastReviewAt: lastReview?.createdAt || null,
    },
    update: {
      averageRating,
      reviewCount,
      completedOrders,
      lastReviewAt: lastReview?.createdAt || null,
    },
  });
}

export async function getAllwainReputationSummary(userId: string, reviewLimit = 8) {
  const prisma = getPrisma() as any;
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, name: true, avatarUrl: true },
  });
  if (!user) throw new Error("USER_NOT_FOUND");
  const [stored, reviews, completedOrders] = await Promise.all([
    prisma.allwainReputation.findUnique({ where: { userId } }),
    prisma.allwainReview.findMany({
      where: { subjectUserId: userId, status: { in: PUBLIC_REVIEW_STATUSES } },
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(reviewLimit, 0), 50),
    }),
    prisma.allwainOrder.count({
      where: {
        fulfillmentStatus: { in: Array.from(REVIEWABLE_FULFILLMENT) },
        OR: [
          { buyerUserId: userId },
          { sellerUserId: userId },
          { connectorUserId: userId },
        ],
      },
    }),
  ]);
  return {
    user: { id: user.id, name: user.name, avatarUrl: user.avatarUrl || null },
    score: stored ? Number(stored.averageRating) : 0,
    reviewCount: stored?.reviewCount || 0,
    completedOrders,
    reviews: reviews.map(serializeReview),
  };
}

export async function getAllwainOrderReviewState(userId: string, orderId: string) {
  const prisma = getPrisma() as any;
  const order = await prisma.allwainOrder.findUnique({ where: { id: orderId } });
  if (!order || !participantRole(order, userId)) throw new Error("ORDER_NOT_FOUND");
  const targetIds = [order.buyerUserId, order.sellerUserId, order.connectorUserId]
    .filter((id): id is string => Boolean(id && id !== userId));
  const [users, existing] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: targetIds }, deletedAt: null },
      select: { id: true, name: true, avatarUrl: true },
    }),
    prisma.allwainReview.findMany({
      where: { orderId, authorUserId: userId, subjectUserId: { in: targetIds } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const reviewsBySubject = new Map(existing.map((review: any) => [review.subjectUserId, review]));
  return {
    orderId,
    eligible: REVIEWABLE_FULFILLMENT.has(order.fulfillmentStatus),
    fulfillmentStatus: order.fulfillmentStatus,
    targets: users.map((user: any) => ({
      id: user.id,
      name: user.name,
      avatarUrl: user.avatarUrl || null,
      role: participantRole(order, user.id),
      review: reviewsBySubject.has(user.id)
        ? serializeReview(reviewsBySubject.get(user.id))
        : null,
    })),
  };
}

export async function createAllwainReview(
  authorUserId: string,
  orderId: string,
  input: Record<string, unknown>,
  requestId?: string,
) {
  const subjectUserId = String(input.subjectUserId || "").trim();
  const rating = Number(input.rating);
  const comment = cleanText(input.comment, 2_000);
  if (!subjectUserId) throw new Error("REVIEW_SUBJECT_REQUIRED");
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error("INVALID_REVIEW_RATING");
  if (subjectUserId === authorUserId) throw new Error("SELF_REVIEW_NOT_ALLOWED");
  const prisma = getPrisma() as any;
  let result: any;
  try {
    result = await prisma.$transaction(async (tx: any) => {
      const order = await tx.allwainOrder.findUnique({ where: { id: orderId } });
      const authorRole = order ? participantRole(order, authorUserId) : null;
      const subjectRole = order ? participantRole(order, subjectUserId) : null;
      if (!order || !authorRole || !subjectRole) throw new Error("ORDER_NOT_FOUND");
      if (!REVIEWABLE_FULFILLMENT.has(order.fulfillmentStatus)) {
        throw new Error("ORDER_NOT_REVIEWABLE");
      }
      const existing = await tx.allwainReview.findUnique({
        where: { orderId_authorUserId_subjectUserId: { orderId, authorUserId, subjectUserId } },
      });
      if (existing) throw new Error("REVIEW_ALREADY_EXISTS");
      const review = await tx.allwainReview.create({
        data: {
          orderId,
          authorUserId,
          subjectUserId,
          subjectRole,
          rating,
          comment,
        },
        include: { author: { select: { id: true, name: true, avatarUrl: true } } },
      });
      await recomputeAllwainReputationTx(tx, subjectUserId);
      await appendAllwainAuditEventTx(tx, {
        aggregateId: orderId,
        eventType: "reputation.review_published",
        actorUserId: authorUserId,
        actorRole: authorRole,
        source: "allwain_reputation",
        requestId,
        payload: { reviewId: review.id, subjectUserId, subjectRole, rating },
      });
      return { review, order };
    });
  } catch (error: any) {
    if (error?.code === "P2002") throw new Error("REVIEW_ALREADY_EXISTS");
    throw error;
  }
  await notifyAllwainUser({
    userId: subjectUserId,
    type: "review_received",
    title: "Tienes una nueva opinión",
    body: `${rating} de 5 estrellas en una operación completada.`,
    route: "reputation",
    routeParams: { orderId, reviewId: result.review.id },
    dedupeKey: `review_received:${result.review.id}:${subjectUserId}`,
  });
  return serializeReview(result.review);
}

export async function respondToAllwainReview(
  subjectUserId: string,
  reviewId: string,
  input: Record<string, unknown>,
  requestId?: string,
) {
  const response = cleanText(input.response, 1_000);
  if (!response) throw new Error("REVIEW_RESPONSE_REQUIRED");
  const prisma = getPrisma() as any;
  return prisma.$transaction(async (tx: any) => {
    const review = await tx.allwainReview.findUnique({ where: { id: reviewId } });
    if (!review || review.subjectUserId !== subjectUserId || review.status === "hidden") {
      throw new Error("REVIEW_NOT_FOUND");
    }
    const updated = await tx.allwainReview.update({
      where: { id: reviewId },
      data: { response, respondedAt: new Date() },
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateId: review.orderId,
      eventType: "reputation.review_responded",
      actorUserId: subjectUserId,
      actorRole: review.subjectRole,
      source: "allwain_reputation",
      requestId,
      payload: { reviewId },
    });
    return serializeReview(updated);
  });
}

export async function reportAllwainReview(
  userId: string,
  reviewId: string,
  input: Record<string, unknown>,
  requestId?: string,
) {
  const reason = cleanText(input.reason, 1_000);
  if (!reason) throw new Error("REPORT_REASON_REQUIRED");
  const prisma = getPrisma() as any;
  return prisma.$transaction(async (tx: any) => {
    const review = await tx.allwainReview.findUnique({ where: { id: reviewId } });
    if (!review) throw new Error("REVIEW_NOT_FOUND");
    const order = await tx.allwainOrder.findUnique({ where: { id: review.orderId } });
    if (!order || !participantRole(order, userId)) throw new Error("FORBIDDEN");
    if (review.authorUserId !== userId && review.subjectUserId !== userId) {
      throw new Error("FORBIDDEN");
    }
    const updated = await tx.allwainReview.update({
      where: { id: reviewId },
      data: { status: "reported", reportedAt: new Date(), reportReason: reason },
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
    });
    await recomputeAllwainReputationTx(tx, review.subjectUserId);
    await appendAllwainAuditEventTx(tx, {
      aggregateId: review.orderId,
      eventType: "reputation.review_reported",
      actorUserId: userId,
      source: "allwain_reputation",
      requestId,
      payload: { reviewId, reason },
    });
    return serializeReview(updated);
  });
}

export async function moderateAllwainReview(
  adminUserId: string,
  reviewId: string,
  input: Record<string, unknown>,
  requestId?: string,
) {
  const status = String(input.status || "").trim().toLowerCase();
  if (!REVIEW_STATUSES.has(status)) throw new Error("INVALID_REVIEW_STATUS");
  const moderationReason = cleanText(input.reason, 1_000);
  if (status === "hidden" && !moderationReason) throw new Error("MODERATION_REASON_REQUIRED");
  const prisma = getPrisma() as any;
  return prisma.$transaction(async (tx: any) => {
    const review = await tx.allwainReview.findUnique({ where: { id: reviewId } });
    if (!review) throw new Error("REVIEW_NOT_FOUND");
    const updated = await tx.allwainReview.update({
      where: { id: reviewId },
      data: {
        status,
        moderatedByUserId: adminUserId,
        moderationReason,
      },
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
    });
    await recomputeAllwainReputationTx(tx, review.subjectUserId);
    await appendAllwainAuditEventTx(tx, {
      aggregateId: review.orderId,
      eventType: `reputation.review_${status}`,
      actorUserId: adminUserId,
      actorRole: "admin",
      source: "allwain_reputation",
      requestId,
      payload: { reviewId, status, moderationReason },
    });
    return serializeReview(updated);
  });
}

export async function listReportedAllwainReviews(
  options: { limit?: number; cursor?: string | null } = {},
) {
  const prisma = getPrisma() as any;
  const limit = Math.min(100, Math.max(1, Math.trunc(Number(options.limit) || 50)));
  const rows = await prisma.allwainReview.findMany({
    where: { status: "reported" },
    include: {
      author: { select: { id: true, name: true, email: true, avatarUrl: true } },
      subject: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
    orderBy: [{ reportedAt: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  });
  const hasNextPage = rows.length > limit;
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
  const items = pageRows.map((review: any) => ({
    ...serializeReview(review),
    reportReason: review.reportReason,
    reportedAt: review.reportedAt,
    moderationReason: review.moderationReason,
    author: review.author,
    subject: review.subject,
  }));
  return {
    items,
    pageInfo: {
      hasNextPage,
      nextCursor: hasNextPage ? pageRows[pageRows.length - 1]?.id || null : null,
    },
  };
}
