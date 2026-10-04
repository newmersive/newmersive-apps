import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";
import { queueAllwainNotificationEmail } from "./allwain-mailer.service";

type NotificationTarget = "buyer" | "seller" | "connector";

export function allwainModeForNotificationTarget(target: NotificationTarget) {
  if (target === "buyer") return "buy" as const;
  if (target === "seller") return "sell" as const;
  return "connector" as const;
}

export interface AllwainNotificationInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  route?: string;
  routeParams?: Record<string, unknown>;
  dedupeKey?: string;
  emailDelivery?: boolean;
}

function serialize(row: any) {
  return {
    ...row,
    readAt: row.readAt instanceof Date ? row.readAt.toISOString() : row.readAt,
    archivedAt:
      row.archivedAt instanceof Date ? row.archivedAt.toISOString() : row.archivedAt,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}

export async function notifyAllwainUser(input: AllwainNotificationInput) {
  if (ENV.STORAGE_DRIVER !== "postgres") return null;
  try {
    const prisma = getPrisma() as any;
    const { emailDelivery = true, ...notificationInput } = input;
    let row: any;
    try {
      row = input.dedupeKey
        ? await prisma.allwainNotification.upsert({
            where: { dedupeKey: input.dedupeKey },
            update: {},
            create: {
              ...notificationInput,
              routeParams: input.routeParams || undefined,
            },
          })
        : await prisma.allwainNotification.create({
            data: {
              ...notificationInput,
              routeParams: input.routeParams || undefined,
            },
          });
    } catch (error: any) {
      if (error?.code !== "P2002" || !input.dedupeKey) throw error;
      row = await prisma.allwainNotification.findUnique({
        where: { dedupeKey: input.dedupeKey },
      });
      if (!row) throw error;
    }
    if (emailDelivery) {
      await queueAllwainNotificationEmail(row.id).catch((error) =>
        console.error("ALLWAIN_EMAIL_QUEUE_ERROR", error),
      );
    }
    return serialize(row);
  } catch (error) {
    console.error("ALLWAIN_NOTIFICATION_ERROR", error);
    return null;
  }
}

export async function notifyAllwainOrderParticipants(
  orderId: string,
  input: Omit<AllwainNotificationInput, "userId" | "dedupeKey" | "routeParams"> & {
    excludeUserId?: string;
    targets?: NotificationTarget[];
    routeParams?: Record<string, unknown>;
    dedupeSuffix?: string;
  },
) {
  if (ENV.STORAGE_DRIVER !== "postgres") return [];
  try {
    const prisma = getPrisma() as any;
    const order = await prisma.allwainOrder.findUnique({ where: { id: orderId } });
    if (!order) return [];
    const targets = input.targets || ["buyer", "seller", "connector"];
    const recipients = new Map<string, NotificationTarget>();
    if (targets.includes("buyer")) recipients.set(order.buyerUserId, "buyer");
    if (targets.includes("seller")) recipients.set(order.sellerUserId, "seller");
    if (targets.includes("connector") && order.connectorUserId) {
      recipients.set(order.connectorUserId, "connector");
    }
    if (input.excludeUserId) recipients.delete(input.excludeUserId);

    return Promise.all(
      Array.from(recipients).map(([userId, target]) =>
        notifyAllwainUser({
          userId,
          type: input.type,
          title: input.title,
          body: input.body,
          route: input.route || "order",
          routeParams: {
            orderId,
            ...input.routeParams,
            mode: allwainModeForNotificationTarget(target),
          },
          dedupeKey: `${input.type}:${orderId}:${input.dedupeSuffix || "event"}:${userId}`,
        }),
      ),
    );
  } catch (error) {
    console.error("ALLWAIN_ORDER_NOTIFICATION_ERROR", error);
    return [];
  }
}

export async function listAllwainNotifications(
  userId: string,
  limit = 40,
  cursor?: string | null,
) {
  if (ENV.STORAGE_DRIVER !== "postgres") {
    return {
      items: [],
      unreadCount: 0,
      pageInfo: { hasNextPage: false, nextCursor: null },
    };
  }
  const prisma = getPrisma() as any;
  const safeLimit = Math.min(Math.max(Math.floor(limit) || 40, 1), 100);
  if (cursor) {
    const target = await prisma.allwainNotification.findFirst({
      where: { id: cursor, userId, archivedAt: null },
      select: { id: true },
    });
    if (!target) throw new Error("NOTIFICATION_NOT_FOUND");
  }
  const [rows, unreadCount] = await Promise.all([
    prisma.allwainNotification.findMany({
      where: { userId, archivedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: safeLimit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
    prisma.allwainNotification.count({
      where: { userId, readAt: null, archivedAt: null },
    }),
  ]);
  const hasNextPage = rows.length > safeLimit;
  const items = hasNextPage ? rows.slice(0, safeLimit) : rows;
  return {
    items: items.map(serialize),
    unreadCount,
    pageInfo: {
      hasNextPage,
      nextCursor: hasNextPage ? items[items.length - 1]?.id || null : null,
    },
  };
}

export async function markAllwainNotificationRead(userId: string, id: string) {
  if (ENV.STORAGE_DRIVER !== "postgres") throw new Error("NOTIFICATION_NOT_FOUND");
  const prisma = getPrisma() as any;
  const result = await prisma.allwainNotification.updateMany({
    where: { id, userId, readAt: null, archivedAt: null },
    data: { readAt: new Date() },
  });
  if (!result.count) {
    const existing = await prisma.allwainNotification.findFirst({
      where: { id, userId, archivedAt: null },
    });
    if (!existing) throw new Error("NOTIFICATION_NOT_FOUND");
  }
  const row = await prisma.allwainNotification.findFirst({
    where: { id, userId, archivedAt: null },
  });
  return serialize(row);
}

export async function markAllwainNotificationsRead(userId: string) {
  if (ENV.STORAGE_DRIVER !== "postgres") return { updated: 0 };
  const prisma = getPrisma() as any;
  const result = await prisma.allwainNotification.updateMany({
    where: { userId, readAt: null, archivedAt: null },
    data: { readAt: new Date() },
  });
  return { updated: result.count };
}
