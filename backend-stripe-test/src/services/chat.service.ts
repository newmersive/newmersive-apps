import { createHash, randomUUID } from "crypto";
import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";
import {
  ChatApp,
  ChatBlockRecord,
  ChatContextType,
  ChatParticipantRecord,
  ChatThreadRecord,
  TrueqiaChatMessage,
} from "../shared/types";
import {
  getDatabase,
  getOfferById,
  getTradeById,
  getTrades,
  getUserById,
  persistDatabase,
} from "./data.store";
import { appendAllwainAuditEvent } from "./allwain-audit";
import { notifyAllwainUser } from "./allwain-notifications.service";

const CHAT_APPS: ChatApp[] = ["trueqia", "allwain"];
const CHAT_CONTEXTS: ChatContextType[] = ["assistant", "trade", "order", "direct"];
const MESSAGE_LIMIT = 500;
const DEFAULT_CONVERSATION_LIMIT = 30;
const DEFAULT_MESSAGE_LIMIT = 50;
const DIRECT_REQUESTS_PER_HOUR = 8;

type ContextAccess = {
  app: ChatApp;
  contextType: ChatContextType;
  contextId: string;
  threadId: string;
  title: string;
  status: string;
  participantIds: string[];
  anchorUserId: string;
  createdByUserId?: string | null;
};

export type ChatParticipantDto = {
  id: string;
  name: string;
  avatarUrl?: string | null;
};

export type ChatConversationDto = {
  id: string;
  app: ChatApp;
  contextType: ChatContextType;
  contextId: string;
  title: string;
  status: string;
  participants: ChatParticipantDto[];
  otherUser?: ChatParticipantDto | null;
  lastMessage?: TrueqiaChatMessage | null;
  unreadCount: number;
  blockedByMe: boolean;
  blockedForMe: boolean;
  canSend: boolean;
  requestDirection: "incoming" | "outgoing" | null;
  canAccept: boolean;
  canReject: boolean;
  createdAt: string;
  updatedAt: string;
};

function usePostgres() {
  return ENV.STORAGE_DRIVER === "postgres";
}

export function parseChatApp(value: unknown): ChatApp {
  const app = String(value || "").toLowerCase() as ChatApp;
  if (!CHAT_APPS.includes(app)) throw new Error("INVALID_CHAT_APP");
  return app;
}

export function parseChatContext(value: unknown): ChatContextType {
  const context = String(value || "").toLowerCase() as ChatContextType;
  if (!CHAT_CONTEXTS.includes(context)) throw new Error("INVALID_CHAT_CONTEXT");
  return context;
}

function threadIdFor(app: ChatApp, contextType: ChatContextType, contextId: string) {
  if (app === "trueqia" && contextType === "assistant") {
    return `trueqia:${contextId}:main`;
  }
  return `${app}:${contextType}:${contextId}`;
}

function directContextId(app: ChatApp, leftUserId: string, rightUserId: string) {
  const pair = [leftUserId, rightUserId].sort().join(":");
  return createHash("sha256").update(`${app}:direct:${pair}`).digest("hex").slice(0, 40);
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value || new Date().toISOString());
}

function cleanMessageText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\r\n?/g, "\n").slice(0, 2000);
}

function uniqueIds(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

async function resolveContext(
  userId: string,
  app: ChatApp,
  contextType: ChatContextType,
  contextId: string,
): Promise<ContextAccess> {
  if (app === "trueqia" && contextType === "assistant") {
    if (contextId !== userId) throw new Error("CHAT_NOT_FOUND");
    return {
      app,
      contextType,
      contextId,
      threadId: threadIdFor(app, contextType, contextId),
      title: "Guía TrueQIA",
      status: "active",
      participantIds: [userId],
      anchorUserId: userId,
    };
  }

  if (app === "trueqia" && contextType === "trade") {
    const trade = usePostgres()
      ? await (getPrisma() as any).trade.findUnique({ where: { id: contextId } })
      : getTradeById(contextId);
    if (!trade || (trade.fromUserId !== userId && trade.toUserId !== userId)) {
      throw new Error("CHAT_NOT_FOUND");
    }
    const offer = usePostgres()
      ? await (getPrisma() as any).offer.findUnique({ where: { id: trade.offerId } })
      : getOfferById(trade.offerId);
    return {
      app,
      contextType,
      contextId,
      threadId: threadIdFor(app, contextType, contextId),
      title: offer?.title || "Trueque",
      status: trade.status || "pending",
      participantIds: uniqueIds([trade.fromUserId, trade.toUserId]),
      anchorUserId: trade.fromUserId,
    };
  }

  if (app === "allwain" && contextType === "order" && usePostgres()) {
    const prisma = getPrisma() as any;
    const order = await prisma.allwainOrder.findUnique({ where: { id: contextId } });
    if (!order) throw new Error("CHAT_NOT_FOUND");
    const participantIds = uniqueIds([
      order.buyerUserId,
      order.sellerUserId,
      order.connectorUserId,
    ]);
    if (!participantIds.includes(userId)) throw new Error("CHAT_NOT_FOUND");
    const offer = await prisma.offer.findUnique({ where: { id: order.offerId } });
    return {
      app,
      contextType,
      contextId,
      threadId: threadIdFor(app, contextType, contextId),
      title: offer?.title || `Pedido de ${order.quantity} ${order.unit}`,
      status: order.status || "pending",
      participantIds,
      anchorUserId: order.buyerUserId,
    };
  }

  if (contextType === "direct") {
    if (usePostgres()) {
      const prisma = getPrisma() as any;
      const thread = await prisma.chatThread.findFirst({
        where: { app, contextType: "direct", contextId },
      });
      if (!thread) throw new Error("CHAT_NOT_FOUND");
      const participants = await prisma.chatParticipant.findMany({
        where: { threadId: thread.id, archivedAt: null },
        select: { userId: true },
      });
      const participantIds = participants.map((item: any) => item.userId);
      if (!participantIds.includes(userId)) throw new Error("CHAT_NOT_FOUND");
      return {
        app,
        contextType,
        contextId,
        threadId: thread.id,
        title: thread.title || "Conversación privada",
        status: thread.status,
        participantIds,
        anchorUserId: thread.createdByUserId || participantIds[0] || userId,
        createdByUserId: thread.createdByUserId || null,
      };
    }

    const db = getDatabase();
    const thread = db.chatThreads.find(
      (item) =>
        item.app === app &&
        item.contextType === "direct" &&
        item.contextId === contextId,
    );
    if (!thread) throw new Error("CHAT_NOT_FOUND");
    const participantIds = db.chatParticipants
      .filter((item) => item.threadId === thread.id && !item.archivedAt)
      .map((item) => item.userId);
    if (!participantIds.includes(userId)) throw new Error("CHAT_NOT_FOUND");
    return {
      app,
      contextType,
      contextId,
      threadId: thread.id,
      title: thread.title || "Conversación privada",
      status: thread.status,
      participantIds,
      anchorUserId: thread.createdByUserId || participantIds[0] || userId,
      createdByUserId: thread.createdByUserId || null,
    };
  }

  throw new Error("CHAT_NOT_FOUND");
}

function latestJsonMessage(threadId: string) {
  return getDatabase().trueqiaChatMessages
    .filter((message) => message.threadId === threadId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}

async function ensureContextThread(access: ContextAccess) {
  const now = new Date();
  if (usePostgres()) {
    const prisma = getPrisma() as any;
    const thread = await prisma.chatThread.upsert({
      where: {
        app_contextType_contextId: {
          app: access.app,
          contextType: access.contextType,
          contextId: access.contextId,
        },
      },
      update: {
        title: access.title,
        status: access.status,
        ...(access.createdByUserId
          ? { createdByUserId: access.createdByUserId }
          : {}),
      },
      create: {
        id: access.threadId,
        app: access.app,
        contextType: access.contextType,
        contextId: access.contextId,
        title: access.title,
        status: access.status,
        createdByUserId: access.createdByUserId || undefined,
      },
    });
    await Promise.all(
      access.participantIds.map((participantUserId) =>
        prisma.chatParticipant.upsert({
          where: {
            threadId_userId: { threadId: thread.id, userId: participantUserId },
          },
          update: { archivedAt: null },
          create: { threadId: thread.id, userId: participantUserId },
        }),
      ),
    );
    return thread;
  }

  const db = getDatabase();
  let thread = db.chatThreads.find(
    (item) =>
      item.app === access.app &&
      item.contextType === access.contextType &&
      item.contextId === access.contextId,
  );
  const nowIso = now.toISOString();
  if (!thread) {
    const previous = latestJsonMessage(access.threadId);
    thread = {
      id: access.threadId,
      app: access.app,
      contextType: access.contextType,
      contextId: access.contextId,
      title: access.title,
      status: access.status,
      createdByUserId: access.createdByUserId || null,
      acceptedAt: null,
      rejectedAt: null,
      lastMessageAt: previous?.createdAt || null,
      createdAt: previous?.createdAt || nowIso,
      updatedAt: nowIso,
    };
    db.chatThreads.push(thread);
  } else {
    thread.title = access.title;
    thread.status = access.status;
    if (access.createdByUserId) thread.createdByUserId = access.createdByUserId;
    thread.updatedAt = nowIso;
  }
  for (const participantUserId of access.participantIds) {
    const existing = db.chatParticipants.find(
      (item) => item.threadId === thread!.id && item.userId === participantUserId,
    );
    if (existing) {
      existing.archivedAt = null;
    } else {
      db.chatParticipants.push({
        threadId: thread.id,
        userId: participantUserId,
        joinedAt: thread.createdAt,
        lastReadAt: thread.lastMessageAt || null,
        archivedAt: null,
      });
    }
  }
  persistDatabase();
  return thread;
}

async function ensureWelcome(access: ContextAccess) {
  if (access.app !== "trueqia" || access.contextType !== "trade") return;
  if (usePostgres()) {
    const prisma = getPrisma() as any;
    const count = await prisma.trueqiaChatMessage.count({
      where: { threadId: access.threadId },
    });
    if (count) return;
    const createdAt = new Date();
    await prisma.trueqiaChatMessage.create({
      data: {
        id: randomUUID(),
        threadId: access.threadId,
        userId: access.anchorUserId,
        tradeId: access.contextId,
        senderName: "TrueQIA",
        senderRole: "system",
        text: `Conversación sobre \"${access.title}\". Acordad aquí los detalles del trueque.`,
        createdAt,
      },
    });
    await prisma.chatThread.update({
      where: { id: access.threadId },
      data: { lastMessageAt: createdAt },
    });
    return;
  }
  const db = getDatabase();
  if (db.trueqiaChatMessages.some((message) => message.threadId === access.threadId)) return;
  const createdAt = new Date().toISOString();
  db.trueqiaChatMessages.push({
    id: randomUUID(),
    threadId: access.threadId,
    userId: access.anchorUserId,
    tradeId: access.contextId,
    senderId: null,
    senderName: "TrueQIA",
    senderRole: "system",
    text: `Conversación sobre \"${access.title}\". Acordad aquí los detalles del trueque.`,
    createdAt,
  });
  const thread = db.chatThreads.find((item) => item.id === access.threadId);
  if (thread) thread.lastMessageAt = createdAt;
  persistDatabase();
}

export async function openChatContext(
  userId: string,
  appValue: unknown,
  contextValue: unknown,
  contextId: string,
) {
  const app = parseChatApp(appValue);
  const contextType = parseChatContext(contextValue);
  const access = await resolveContext(userId, app, contextType, contextId);
  await ensureContextThread(access);
  await ensureWelcome(access);
  return conversationById(userId, app, access.threadId);
}

async function chatAccount(userId: string) {
  return usePostgres()
    ? (getPrisma() as any).user.findUnique({ where: { id: userId } })
    : getUserById(userId);
}

async function directPairIsBlocked(app: ChatApp, leftUserId: string, rightUserId: string) {
  if (usePostgres()) {
    return Boolean(
      await (getPrisma() as any).chatBlock.findFirst({
        where: {
          app,
          OR: [
            { blockerUserId: leftUserId, blockedUserId: rightUserId },
            { blockerUserId: rightUserId, blockedUserId: leftUserId },
          ],
        },
        select: { blockerUserId: true },
      }),
    );
  }
  return getDatabase().chatBlocks.some(
    (item) =>
      item.app === app &&
      ((item.blockerUserId === leftUserId && item.blockedUserId === rightUserId) ||
        (item.blockerUserId === rightUserId && item.blockedUserId === leftUserId)),
  );
}

async function findDirectThread(app: ChatApp, contextId: string) {
  if (usePostgres()) {
    return (getPrisma() as any).chatThread.findFirst({
      where: { app, contextType: "direct", contextId },
    });
  }
  return (
    getDatabase().chatThreads.find(
      (item) =>
        item.app === app &&
        item.contextType === "direct" &&
        item.contextId === contextId,
    ) || null
  );
}

async function enforceDirectRequestQuota(app: ChatApp, userId: string) {
  const since = new Date(Date.now() - 60 * 60_000);
  const count = usePostgres()
    ? await (getPrisma() as any).chatThread.count({
        where: {
          app,
          contextType: "direct",
          createdByUserId: userId,
          createdAt: { gte: since },
        },
      })
    : getDatabase().chatThreads.filter(
        (item) =>
          item.app === app &&
          item.contextType === "direct" &&
          item.createdByUserId === userId &&
          new Date(item.createdAt).getTime() >= since.getTime(),
      ).length;
  if (count >= DIRECT_REQUESTS_PER_HOUR) {
    throw new Error("CHAT_REQUEST_RATE_LIMITED");
  }
}

export async function startDirectChat(
  userId: string,
  appValue: unknown,
  targetUserIdValue: unknown,
  textValue: unknown,
) {
  const app = parseChatApp(appValue);
  const targetUserId = String(targetUserIdValue || "").trim();
  const text = cleanMessageText(textValue);
  if (!targetUserId) throw new Error("DIRECT_CHAT_TARGET_REQUIRED");
  if (targetUserId === userId) throw new Error("DIRECT_CHAT_SELF_FORBIDDEN");
  if (!text) throw new Error("INVALID_CHAT_MESSAGE");

  const [sender, target] = await Promise.all([
    chatAccount(userId),
    chatAccount(targetUserId),
  ]);
  if (
    !sender ||
    (sender as any).deletedAt ||
    ((sender as any).status && (sender as any).status !== "active")
  ) {
    throw new Error("USER_NOT_FOUND");
  }
  if (
    !target ||
    (target as any).deletedAt ||
    ((target as any).status && (target as any).status !== "active")
  ) {
    throw new Error("USER_NOT_FOUND");
  }
  if (await directPairIsBlocked(app, userId, targetUserId)) {
    throw new Error("CHAT_BLOCKED");
  }

  const contextId = directContextId(app, userId, targetUserId);
  const existing = await findDirectThread(app, contextId);
  if (existing) {
    const conversation = await conversationById(userId, app, existing.id);
    if (!conversation.participants.some((item) => item.id === targetUserId)) {
      throw new Error("CHAT_NOT_FOUND");
    }
    if (existing.status === "active") {
      const message = await sendChatMessage(userId, app, existing.id, text);
      return {
        conversation: await conversationById(userId, app, existing.id),
        message,
        created: false,
      };
    }
    if (existing.status === "pending") {
      throw new Error(
        existing.createdByUserId === userId
          ? "CHAT_REQUEST_PENDING"
          : "CHAT_REQUEST_REQUIRES_RESPONSE",
      );
    }
    if (existing.status === "rejected") throw new Error("CHAT_REQUEST_REJECTED");
    throw new Error("CHAT_CLOSED");
  }

  await enforceDirectRequestQuota(app, userId);
  const createdAt = new Date();
  const threadId = threadIdFor(app, "direct", contextId);
  const message: TrueqiaChatMessage = {
    id: randomUUID(),
    threadId,
    userId,
    tradeId: null,
    senderId: userId,
    senderName: (sender as any).name || "Usuario",
    senderRole: "user",
    text,
    createdAt: createdAt.toISOString(),
  };

  if (usePostgres()) {
    const prisma = getPrisma() as any;
    await prisma.$transaction(async (tx: any) => {
      await tx.chatThread.create({
        data: {
          id: threadId,
          app,
          contextType: "direct",
          contextId,
          title: "Conversación privada",
          status: "pending",
          createdByUserId: userId,
          lastMessageAt: createdAt,
          createdAt,
        },
      });
      await tx.chatParticipant.createMany({
        data: [
          { threadId, userId, joinedAt: createdAt, lastReadAt: createdAt },
          { threadId, userId: targetUserId, joinedAt: createdAt },
        ],
      });
      await tx.trueqiaChatMessage.create({
        data: { ...message, tradeId: undefined, createdAt },
      });
    });
  } else {
    const db = getDatabase();
    db.chatThreads.push({
      id: threadId,
      app,
      contextType: "direct",
      contextId,
      title: "Conversación privada",
      status: "pending",
      createdByUserId: userId,
      acceptedAt: null,
      rejectedAt: null,
      lastMessageAt: message.createdAt,
      createdAt: message.createdAt,
      updatedAt: message.createdAt,
    });
    db.chatParticipants.push(
      {
        threadId,
        userId,
        joinedAt: message.createdAt,
        lastReadAt: message.createdAt,
        archivedAt: null,
      },
      {
        threadId,
        userId: targetUserId,
        joinedAt: message.createdAt,
        lastReadAt: null,
        archivedAt: null,
      },
    );
    db.trueqiaChatMessages.push(message);
    persistDatabase();
  }

  if (app === "allwain" && usePostgres()) {
    await notifyAllwainUser({
      userId: targetUserId,
      type: "chat.request",
      title: `Mensaje privado de ${(sender as any).name || "un usuario"}`,
      body: text.length > 120 ? `${text.slice(0, 117)}...` : text,
      route: "chat",
      routeParams: { conversationId: threadId },
      dedupeKey: `chat.request:${threadId}:${targetUserId}`,
    });
    await appendAllwainAuditEvent({
      aggregateType: "chat_thread",
      aggregateId: threadId,
      eventType: "chat.contact_requested",
      actorUserId: userId,
      actorRole: (sender as any).role || "user",
      source: "allwain_chat",
      payload: {
        targetUserId,
        messageId: message.id,
        contentSha256: createHash("sha256").update(text).digest("hex"),
      },
    }).catch((error) => console.error("ALLWAIN_CHAT_AUDIT_ERROR", error));
  }

  return {
    conversation: await conversationById(userId, app, threadId),
    message,
    created: true,
  };
}

export async function respondToDirectChatRequest(
  userId: string,
  appValue: unknown,
  threadId: string,
  decisionValue: unknown,
) {
  const app = parseChatApp(appValue);
  const decision = String(decisionValue || "").toLowerCase();
  if (decision !== "accept" && decision !== "reject") {
    throw new Error("INVALID_CHAT_REQUEST_DECISION");
  }
  const conversation = await conversationById(userId, app, threadId);
  if (conversation.contextType !== "direct") throw new Error("CHAT_NOT_FOUND");
  if (conversation.status !== "pending") throw new Error("CHAT_REQUEST_ALREADY_RESOLVED");

  const thread = usePostgres()
    ? await (getPrisma() as any).chatThread.findUnique({ where: { id: threadId } })
    : getDatabase().chatThreads.find((item) => item.id === threadId);
  if (!thread || !thread.createdByUserId || thread.createdByUserId === userId) {
    throw new Error("CHAT_REQUEST_NOT_RECIPIENT");
  }
  if (decision === "accept" && conversation.blockedForMe) throw new Error("CHAT_BLOCKED");

  const decidedAt = new Date();
  const nextStatus = decision === "accept" ? "active" : "rejected";
  const systemMessage: TrueqiaChatMessage = {
    id: randomUUID(),
    threadId,
    userId: thread.createdByUserId,
    tradeId: null,
    senderId: null,
    senderName: "Allwain",
    senderRole: "system",
    text:
      decision === "accept"
        ? "Solicitud aceptada. Ya podéis hablar con tranquilidad."
        : "La solicitud de conversación no ha sido aceptada.",
    createdAt: decidedAt.toISOString(),
  };

  if (usePostgres()) {
    const prisma = getPrisma() as any;
    await prisma.$transaction(async (tx: any) => {
      const updated = await tx.chatThread.updateMany({
        where: { id: threadId, app, contextType: "direct", status: "pending" },
        data: {
          status: nextStatus,
          acceptedAt: decision === "accept" ? decidedAt : null,
          rejectedAt: decision === "reject" ? decidedAt : null,
          lastMessageAt: decidedAt,
        },
      });
      if (updated.count !== 1) throw new Error("CHAT_REQUEST_ALREADY_RESOLVED");
      await tx.trueqiaChatMessage.create({
        data: { ...systemMessage, tradeId: undefined, createdAt: decidedAt },
      });
      await tx.chatParticipant.update({
        where: { threadId_userId: { threadId, userId } },
        data: { lastReadAt: decidedAt },
      });
    });
  } else {
    thread.status = nextStatus;
    thread.acceptedAt = decision === "accept" ? systemMessage.createdAt : null;
    thread.rejectedAt = decision === "reject" ? systemMessage.createdAt : null;
    thread.lastMessageAt = systemMessage.createdAt;
    thread.updatedAt = systemMessage.createdAt;
    getDatabase().trueqiaChatMessages.push(systemMessage);
    const membership = getDatabase().chatParticipants.find(
      (item) => item.threadId === threadId && item.userId === userId,
    );
    if (membership) membership.lastReadAt = systemMessage.createdAt;
    persistDatabase();
  }

  if (app === "allwain" && usePostgres()) {
    const account = await chatAccount(userId);
    await notifyAllwainUser({
      userId: thread.createdByUserId,
      type: `chat.request_${decision}ed`,
      title:
        decision === "accept"
          ? `${(account as any)?.name || "La otra persona"} ha aceptado hablar contigo`
          : "Tu solicitud de conversación no ha sido aceptada",
      body:
        decision === "accept"
          ? "Ya podéis enviaros mensajes privados en Allwain."
          : "No podrás enviar nuevos mensajes en esta conversación.",
      route: "chat",
      routeParams: { conversationId: threadId },
      dedupeKey: `chat.request_${decision}ed:${threadId}`,
    });
    await appendAllwainAuditEvent({
      aggregateType: "chat_thread",
      aggregateId: threadId,
      eventType: `chat.contact_${decision}ed`,
      actorUserId: userId,
      actorRole: (account as any)?.role || "user",
      source: "allwain_chat",
      payload: { requestedByUserId: thread.createdByUserId },
    }).catch((error) => console.error("ALLWAIN_CHAT_AUDIT_ERROR", error));
  }

  return conversationById(userId, app, threadId);
}

async function ensureThreadsForUser(userId: string, app: ChatApp) {
  if (app === "trueqia") {
    const trades = usePostgres()
      ? await (getPrisma() as any).trade.findMany({
          where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
          orderBy: { createdAt: "desc" },
        })
      : getTrades().filter(
          (trade) => trade.fromUserId === userId || trade.toUserId === userId,
        );
    for (const trade of trades) {
      const access = await resolveContext(userId, app, "trade", trade.id);
      await ensureContextThread(access);
      await ensureWelcome(access);
    }
    return;
  }

  if (app === "allwain" && usePostgres()) {
    const orders = await (getPrisma() as any).allwainOrder.findMany({
      where: {
        operationalArchivedAt: null,
        OR: [
          { buyerUserId: userId },
          { sellerUserId: userId },
          { connectorUserId: userId },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
    for (const order of orders) {
      const access = await resolveContext(userId, app, "order", order.id);
      await ensureContextThread(access);
    }
  }
}

function mapMessage(row: any): TrueqiaChatMessage {
  return {
    id: row.id,
    threadId: row.threadId,
    userId: row.userId,
    tradeId: row.tradeId ?? null,
    senderId: row.senderId ?? null,
    senderName: row.senderName,
    senderRole: row.senderRole,
    text: row.text,
    createdAt: iso(row.createdAt),
  };
}

async function postgresConversationDto(
  userId: string,
  app: ChatApp,
  thread: any,
): Promise<ChatConversationDto> {
  const prisma = getPrisma() as any;
  const participation = await prisma.chatParticipant.findUnique({
    where: { threadId_userId: { threadId: thread.id, userId } },
  });
  if (!participation || participation.archivedAt) throw new Error("CHAT_NOT_FOUND");
  const participantRows = await prisma.chatParticipant.findMany({
    where: { threadId: thread.id, archivedAt: null },
  });
  const ids = participantRows.map((item: any) => item.userId);
  const users = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, avatarUrl: true },
      })
    : [];
  const participants: ChatParticipantDto[] = ids.map((id: string) => {
    const account = users.find((item: any) => item.id === id);
    return {
      id,
      name: account?.name || "Usuario",
      avatarUrl: account?.avatarUrl || null,
    };
  });
  const otherIds = ids.filter((id: string) => id !== userId);
  const lastMessageRow = await prisma.trueqiaChatMessage.findFirst({
    where: { threadId: thread.id },
    orderBy: { createdAt: "desc" },
  });
  const unreadWhere: any = {
    threadId: thread.id,
    senderId: { not: null, notIn: [userId] },
  };
  if (participation.lastReadAt) unreadWhere.createdAt = { gt: participation.lastReadAt };
  const [unreadCount, blocks] = await Promise.all([
    prisma.trueqiaChatMessage.count({ where: unreadWhere }),
    otherIds.length
      ? prisma.chatBlock.findMany({
          where: {
            app,
            OR: [
              { blockerUserId: userId, blockedUserId: { in: otherIds } },
              { blockerUserId: { in: otherIds }, blockedUserId: userId },
            ],
          },
        })
      : [],
  ]);
  const blockedByMe = blocks.some((item: any) => item.blockerUserId === userId);
  const blockedForMe = blocks.some((item: any) => item.blockedUserId === userId);
  const otherUser = participants.length === 2
    ? participants.find((item) => item.id !== userId) || null
    : null;
  const directPending = thread.contextType === "direct" && thread.status === "pending";
  const requestDirection = directPending
    ? thread.createdByUserId === userId
      ? "outgoing"
      : "incoming"
    : null;
  return {
    id: thread.id,
    app,
    contextType: thread.contextType,
    contextId: thread.contextId,
    title:
      thread.contextType === "direct"
        ? otherUser?.name || "Conversación privada"
        : thread.title || otherUser?.name || "Conversación",
    status: thread.status,
    participants,
    otherUser,
    lastMessage: lastMessageRow ? mapMessage(lastMessageRow) : null,
    unreadCount,
    blockedByMe,
    blockedForMe,
    canSend:
      (thread.contextType === "direct"
        ? thread.status === "active"
        : thread.status !== "closed") &&
      !blockedByMe &&
      !blockedForMe,
    requestDirection,
    canAccept: requestDirection === "incoming" && !blockedByMe && !blockedForMe,
    canReject: requestDirection === "incoming",
    createdAt: iso(thread.createdAt),
    updatedAt: iso(thread.updatedAt),
  };
}

function jsonConversationDto(
  userId: string,
  app: ChatApp,
  thread: ChatThreadRecord,
): ChatConversationDto {
  const db = getDatabase();
  const participation = db.chatParticipants.find(
    (item) => item.threadId === thread.id && item.userId === userId && !item.archivedAt,
  );
  if (!participation) throw new Error("CHAT_NOT_FOUND");
  const ids = db.chatParticipants
    .filter((item) => item.threadId === thread.id && !item.archivedAt)
    .map((item) => item.userId);
  const participants = ids.map((id) => {
    const account = getUserById(id);
    return { id, name: account?.name || "Usuario", avatarUrl: account?.avatarUrl || null };
  });
  const otherIds = ids.filter((id) => id !== userId);
  const messages = db.trueqiaChatMessages
    .filter((message) => message.threadId === thread.id)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const unreadCount = messages.filter(
    (message) =>
      Boolean(message.senderId) &&
      message.senderId !== userId &&
      (!participation.lastReadAt || message.createdAt > participation.lastReadAt),
  ).length;
  const blocks = db.chatBlocks.filter(
    (item) =>
      item.app === app &&
      ((item.blockerUserId === userId && otherIds.includes(item.blockedUserId)) ||
        (otherIds.includes(item.blockerUserId) && item.blockedUserId === userId)),
  );
  const blockedByMe = blocks.some((item) => item.blockerUserId === userId);
  const blockedForMe = blocks.some((item) => item.blockedUserId === userId);
  const otherUser = participants.length === 2
    ? participants.find((item) => item.id !== userId) || null
    : null;
  const directPending = thread.contextType === "direct" && thread.status === "pending";
  const requestDirection = directPending
    ? thread.createdByUserId === userId
      ? "outgoing"
      : "incoming"
    : null;
  return {
    id: thread.id,
    app,
    contextType: thread.contextType,
    contextId: thread.contextId,
    title:
      thread.contextType === "direct"
        ? otherUser?.name || "Conversación privada"
        : thread.title || otherUser?.name || "Conversación",
    status: thread.status,
    participants,
    otherUser,
    lastMessage: messages.length ? messages[messages.length - 1] : null,
    unreadCount,
    blockedByMe,
    blockedForMe,
    canSend:
      (thread.contextType === "direct"
        ? thread.status === "active"
        : thread.status !== "closed") &&
      !blockedByMe &&
      !blockedForMe,
    requestDirection,
    canAccept: requestDirection === "incoming" && !blockedByMe && !blockedForMe,
    canReject: requestDirection === "incoming",
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
  };
}

async function conversationById(userId: string, app: ChatApp, threadId: string) {
  if (usePostgres()) {
    const thread = await (getPrisma() as any).chatThread.findFirst({
      where: { id: threadId, app },
    });
    if (!thread) throw new Error("CHAT_NOT_FOUND");
    return postgresConversationDto(userId, app, thread);
  }
  const thread = getDatabase().chatThreads.find(
    (item) => item.id === threadId && item.app === app,
  );
  if (!thread) throw new Error("CHAT_NOT_FOUND");
  return jsonConversationDto(userId, app, thread);
}

export async function getChatConversation(
  userId: string,
  appValue: unknown,
  threadId: string,
) {
  return conversationById(userId, parseChatApp(appValue), threadId);
}

async function postgresUnreadTotal(userId: string, app: ChatApp) {
  const prisma = getPrisma() as any;
  const rows = await prisma.$queryRaw<Array<{ count: bigint | number }>>`
    SELECT COUNT(*) AS "count"
    FROM "TrueqiaChatMessage" message
    INNER JOIN "ChatParticipant" participant
      ON participant."threadId" = message."threadId"
    INNER JOIN "ChatThread" thread
      ON thread."id" = message."threadId"
    WHERE participant."userId" = ${userId}
      AND participant."archivedAt" IS NULL
      AND thread."app" = ${app}
      AND message."senderId" IS NOT NULL
      AND message."senderId" <> ${userId}
      AND (
        participant."lastReadAt" IS NULL
        OR message."createdAt" > participant."lastReadAt"
      )
  `;
  return Number(rows[0]?.count || 0);
}

export async function listChatConversations(
  userId: string,
  appValue: unknown,
  options: { limit?: number; cursor?: string | null } = {},
) {
  const app = parseChatApp(appValue);
  const limit = Math.max(
    1,
    Math.min(100, Number(options.limit) || DEFAULT_CONVERSATION_LIMIT),
  );
  let conversations: ChatConversationDto[];
  let hasNextPage = false;
  let nextCursor: string | null = null;
  let unreadCount = 0;
  if (usePostgres()) {
    const prisma = getPrisma() as any;
    const memberships = await prisma.chatParticipant.findMany({
      where: { userId, archivedAt: null },
      select: { threadId: true },
    });
    const membershipIds = memberships.map((item: any) => item.threadId);
    if (options.cursor && !membershipIds.includes(options.cursor)) {
      throw new Error("CHAT_NOT_FOUND");
    }
    const rows = memberships.length
      ? await prisma.chatThread.findMany({
          where: {
            id: { in: membershipIds },
            app,
            contextType: { not: "assistant" },
          },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          take: limit + 1,
          ...(options.cursor
            ? { cursor: { id: options.cursor }, skip: 1 }
            : {}),
        })
      : [];
    hasNextPage = rows.length > limit;
    const threads = hasNextPage ? rows.slice(0, limit) : rows;
    nextCursor = hasNextPage ? threads[threads.length - 1]?.id || null : null;
    conversations = await Promise.all(
      threads.map((thread: any) => postgresConversationDto(userId, app, thread)),
    );
    unreadCount = await postgresUnreadTotal(userId, app);
  } else {
    const ids = getDatabase().chatParticipants
      .filter((item) => item.userId === userId && !item.archivedAt)
      .map((item) => item.threadId);
    const all = getDatabase().chatThreads
      .filter(
        (thread) =>
          ids.includes(thread.id) && thread.app === app && thread.contextType !== "assistant",
      )
      .map((thread) => jsonConversationDto(userId, app, thread));
    all.sort((left, right) => {
      const leftDate = left.lastMessage?.createdAt || left.updatedAt;
      const rightDate = right.lastMessage?.createdAt || right.updatedAt;
      return rightDate.localeCompare(leftDate);
    });
    unreadCount = all.reduce((sum, item) => sum + item.unreadCount, 0);
    const start = options.cursor
      ? Math.max(0, all.findIndex((item) => item.id === options.cursor) + 1)
      : 0;
    const rows = all.slice(start, start + limit + 1);
    hasNextPage = rows.length > limit;
    conversations = hasNextPage ? rows.slice(0, limit) : rows;
    nextCursor = hasNextPage
      ? conversations[conversations.length - 1]?.id || null
      : null;
  }
  conversations.sort((left, right) => {
    const leftDate = left.lastMessage?.createdAt || left.updatedAt;
    const rightDate = right.lastMessage?.createdAt || right.updatedAt;
    return rightDate.localeCompare(leftDate);
  });
  return {
    items: conversations,
    unreadCount,
    pageInfo: { hasNextPage, nextCursor },
  };
}

export async function listChatMessages(
  userId: string,
  appValue: unknown,
  threadId: string,
  options: { limit?: number; before?: string | null } = {},
) {
  const app = parseChatApp(appValue);
  const conversation = await conversationById(userId, app, threadId);
  const limit = Math.max(
    1,
    Math.min(100, Number(options.limit) || DEFAULT_MESSAGE_LIMIT),
  );
  let items: TrueqiaChatMessage[];
  let hasPreviousPage = false;
  if (usePostgres()) {
    if (options.before) {
      const cursor = await (getPrisma() as any).trueqiaChatMessage.findFirst({
        where: { id: options.before, threadId },
        select: { id: true },
      });
      if (!cursor) throw new Error("CHAT_NOT_FOUND");
    }
    const rows = await (getPrisma() as any).trueqiaChatMessage.findMany({
      where: { threadId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: Math.min(MESSAGE_LIMIT, limit + 1),
      ...(options.before
        ? { cursor: { id: options.before }, skip: 1 }
        : {}),
    });
    hasPreviousPage = rows.length > limit;
    items = (hasPreviousPage ? rows.slice(0, limit) : rows)
      .reverse()
      .map(mapMessage);
  } else {
    const all = getDatabase().trueqiaChatMessages
      .filter((message) => message.threadId === threadId)
      .sort(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
      );
    const end = options.before
      ? all.findIndex((message) => message.id === options.before)
      : all.length;
    if (options.before && end < 0) throw new Error("CHAT_NOT_FOUND");
    const start = Math.max(0, end - limit);
    items = all.slice(start, end);
    hasPreviousPage = start > 0;
  }
  return {
    conversation,
    items,
    pageInfo: {
      hasPreviousPage,
      previousCursor: hasPreviousPage ? items[0]?.id || null : null,
    },
  };
}

export async function getChatMessageTranslationSource(
  userId: string,
  appValue: unknown,
  threadId: string,
  messageId: string,
) {
  const app = parseChatApp(appValue);
  await conversationById(userId, app, threadId);
  const message = usePostgres()
    ? await (getPrisma() as any).trueqiaChatMessage.findFirst({
        where: { id: messageId, threadId },
      })
    : getDatabase().trueqiaChatMessages.find(
        (item) => item.id === messageId && item.threadId === threadId,
      );
  if (!message) throw new Error("CHAT_MESSAGE_NOT_FOUND");
  return {
    app,
    threadId,
    messageId,
    text: cleanMessageText(message.text),
  };
}

async function messageAccess(userId: string, app: ChatApp, threadId: string) {
  const conversation = await conversationById(userId, app, threadId);
  if (!conversation.canSend) {
    if (conversation.contextType === "direct") {
      if (conversation.status === "pending") throw new Error("CHAT_REQUEST_PENDING");
      if (conversation.status === "rejected") throw new Error("CHAT_REQUEST_REJECTED");
      if (conversation.status === "closed") throw new Error("CHAT_CLOSED");
    }
    throw new Error("CHAT_BLOCKED");
  }
  if (!conversation.participants.some((item) => item.id === userId)) {
    throw new Error("CHAT_NOT_FOUND");
  }
  return conversation;
}

export async function sendChatMessage(
  userId: string,
  appValue: unknown,
  threadId: string,
  textValue: unknown,
) {
  const app = parseChatApp(appValue);
  const text = cleanMessageText(textValue);
  if (!text) throw new Error("INVALID_CHAT_MESSAGE");
  const conversation = await messageAccess(userId, app, threadId);
  const account = usePostgres()
    ? await (getPrisma() as any).user.findUnique({ where: { id: userId } })
    : getUserById(userId);
  if (!account || (account as any).deletedAt) throw new Error("USER_NOT_FOUND");
  const access = await resolveContext(
    userId,
    app,
    conversation.contextType,
    conversation.contextId,
  );
  const createdAt = new Date();
  const message: TrueqiaChatMessage = {
    id: randomUUID(),
    threadId,
    userId: access.anchorUserId,
    tradeId:
      app === "trueqia" && conversation.contextType === "trade"
        ? conversation.contextId
        : null,
    senderId: userId,
    senderName: (account as any).name || "Usuario",
    senderRole: "user",
    text,
    createdAt: createdAt.toISOString(),
  };

  if (usePostgres()) {
    const prisma = getPrisma() as any;
    await prisma.$transaction(async (tx: any) => {
      await tx.trueqiaChatMessage.create({
        data: {
          ...message,
          tradeId: message.tradeId || undefined,
          senderId: message.senderId || undefined,
          createdAt,
        },
      });
      await tx.chatThread.update({
        where: { id: threadId },
        data: { lastMessageAt: createdAt },
      });
      await tx.chatParticipant.update({
        where: { threadId_userId: { threadId, userId } },
        data: { lastReadAt: createdAt },
      });
    });
  } else {
    const db = getDatabase();
    db.trueqiaChatMessages.push(message);
    const thread = db.chatThreads.find((item) => item.id === threadId);
    if (thread) {
      thread.lastMessageAt = message.createdAt;
      thread.updatedAt = message.createdAt;
    }
    const membership = db.chatParticipants.find(
      (item) => item.threadId === threadId && item.userId === userId,
    );
    if (membership) membership.lastReadAt = message.createdAt;
    persistDatabase();
  }

  const recipientIds = conversation.participants
    .map((item) => item.id)
    .filter((id) => id !== userId);
  if (app === "allwain" && usePostgres()) {
    await Promise.all(
      recipientIds.map((recipientId) =>
        notifyAllwainUser({
          userId: recipientId,
          type: "chat.message",
          title: `Nuevo mensaje de ${(account as any).name || "un usuario"}`,
          body: text.length > 120 ? `${text.slice(0, 117)}...` : text,
          route: "chat",
          routeParams: {
            conversationId: threadId,
            ...(conversation.contextType === "order"
              ? { orderId: conversation.contextId }
              : {}),
          },
          dedupeKey: `chat.message:${message.id}:${recipientId}`,
        }),
      ),
    );
    try {
      await appendAllwainAuditEvent({
        aggregateType:
          conversation.contextType === "direct" ? "chat_thread" : "order",
        aggregateId:
          conversation.contextType === "direct" ? threadId : conversation.contextId,
        orderId:
          conversation.contextType === "order" ? conversation.contextId : null,
        eventType: "chat.message_sent",
        actorUserId: userId,
        actorRole: (account as any).role || "user",
        source: "allwain_chat",
        payload: {
          messageId: message.id,
          threadId,
          recipients: recipientIds,
          contentSha256: createHash("sha256").update(text).digest("hex"),
        },
      });
    } catch (error) {
      console.error("ALLWAIN_CHAT_AUDIT_ERROR", error);
    }
  }
  return message;
}

export async function markChatRead(userId: string, appValue: unknown, threadId: string) {
  const app = parseChatApp(appValue);
  await conversationById(userId, app, threadId);
  const readAt = new Date();
  if (usePostgres()) {
    await (getPrisma() as any).chatParticipant.update({
      where: { threadId_userId: { threadId, userId } },
      data: { lastReadAt: readAt },
    });
  } else {
    const participant = getDatabase().chatParticipants.find(
      (item) => item.threadId === threadId && item.userId === userId,
    );
    if (!participant) throw new Error("CHAT_NOT_FOUND");
    participant.lastReadAt = readAt.toISOString();
    persistDatabase();
  }
  return { readAt: readAt.toISOString() };
}

async function blockTarget(
  userId: string,
  app: ChatApp,
  threadId: string,
  targetUserId?: string,
) {
  const conversation = await conversationById(userId, app, threadId);
  const peers = conversation.participants.filter((item) => item.id !== userId);
  const target = targetUserId
    ? peers.find((item) => item.id === targetUserId)
    : peers.length === 1
      ? peers[0]
      : null;
  if (!target) throw new Error("BLOCK_TARGET_REQUIRED");
  return target;
}

export async function blockChatUser(
  userId: string,
  appValue: unknown,
  threadId: string,
  targetUserId?: string,
) {
  const app = parseChatApp(appValue);
  const target = await blockTarget(userId, app, threadId, targetUserId);
  const createdAt = new Date();
  if (usePostgres()) {
    await (getPrisma() as any).chatBlock.upsert({
      where: {
        app_blockerUserId_blockedUserId: {
          app,
          blockerUserId: userId,
          blockedUserId: target.id,
        },
      },
      update: {},
      create: { app, blockerUserId: userId, blockedUserId: target.id, createdAt },
    });
  } else {
    const db = getDatabase();
    if (
      !db.chatBlocks.some(
        (item) =>
          item.app === app &&
          item.blockerUserId === userId &&
          item.blockedUserId === target.id,
      )
    ) {
      db.chatBlocks.push({
        app,
        blockerUserId: userId,
        blockedUserId: target.id,
        createdAt: createdAt.toISOString(),
      });
      persistDatabase();
    }
  }
  return { blockedUserId: target.id, blockedAt: createdAt.toISOString() };
}

export async function unblockChatUser(
  userId: string,
  appValue: unknown,
  threadId: string,
  targetUserId?: string,
) {
  const app = parseChatApp(appValue);
  const target = await blockTarget(userId, app, threadId, targetUserId);
  if (usePostgres()) {
    await (getPrisma() as any).chatBlock.deleteMany({
      where: { app, blockerUserId: userId, blockedUserId: target.id },
    });
  } else {
    const db = getDatabase();
    db.chatBlocks = db.chatBlocks.filter(
      (item: ChatBlockRecord) =>
        !(
          item.app === app &&
          item.blockerUserId === userId &&
          item.blockedUserId === target.id
        ),
    );
    persistDatabase();
  }
  return { blockedUserId: target.id, unblocked: true };
}
