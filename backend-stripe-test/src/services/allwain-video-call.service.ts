import { createHash } from "crypto";
import { AccessToken } from "livekit-server-sdk";

import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";
import { appendAllwainAuditEvent } from "./allwain-audit";
import { notifyAllwainUser } from "./allwain-notifications.service";
import { getChatConversation } from "./chat.service";

const TOKEN_TTL_SECONDS = 10 * 60;
const CLOSED_CONTEXT_STATES = new Set([
  "cancelled",
  "canceled",
  "closed",
  "expired",
  "refunded",
  "rejected",
]);

function configuration() {
  const serverUrl = String(ENV.LIVEKIT_URL || "").trim();
  const apiKey = String(ENV.LIVEKIT_API_KEY || "").trim();
  const apiSecret = String(ENV.LIVEKIT_API_SECRET || "").trim();
  const validUrl = /^(wss:\/\/|ws:\/\/localhost(?::\d+)?(?:\/|$))/i.test(serverUrl);
  return {
    enabled:
      ENV.ALLWAIN_VIDEO_CALLS_ENABLED &&
      validUrl &&
      Boolean(apiKey) &&
      apiSecret.length >= 16,
    serverUrl,
    apiKey,
    apiSecret,
  };
}

function roomName(threadId: string) {
  return `allwain-${createHash("sha256").update(threadId).digest("hex").slice(0, 36)}`;
}

async function authorizedConversation(userId: string, threadId: string) {
  const conversation = await getChatConversation(userId, "allwain", threadId);
  if (!conversation.participants.some((participant) => participant.id === userId)) {
    throw new Error("CHAT_NOT_FOUND");
  }
  if (conversation.blockedByMe || conversation.blockedForMe) {
    throw new Error("CHAT_BLOCKED");
  }
  if (conversation.contextType === "direct" && conversation.status !== "active") {
    throw new Error("VIDEO_CALL_CONTEXT_NOT_ACTIVE");
  }
  if (
    conversation.contextType !== "direct" &&
    CLOSED_CONTEXT_STATES.has(String(conversation.status || "").toLowerCase())
  ) {
    throw new Error("VIDEO_CALL_CONTEXT_NOT_ACTIVE");
  }
  return conversation;
}

export function allwainVideoCallCapability() {
  const configured = configuration();
  return {
    enabled: configured.enabled,
    provider: "livekit" as const,
    recording: false,
    endToEndEncryptionPlanned: true,
  };
}

export async function issueAllwainVideoCallToken(userId: string, threadId: string) {
  const configured = configuration();
  if (!configured.enabled) throw new Error("VIDEO_CALL_NOT_CONFIGURED");
  const conversation = await authorizedConversation(userId, threadId);
  const account = await (getPrisma() as any).user.findFirst({
    where: { id: userId, deletedAt: null, status: "active" },
    select: { id: true, name: true, role: true },
  });
  if (!account) throw new Error("USER_NOT_FOUND");

  const room = roomName(threadId);
  const token = new AccessToken(configured.apiKey, configured.apiSecret, {
    identity: userId,
    name: account.name || "Usuario Allwain",
    ttl: TOKEN_TTL_SECONDS,
    metadata: JSON.stringify({ app: "allwain", threadId }),
  });
  token.addGrant({
    roomJoin: true,
    room,
    canPublish: true,
    canSubscribe: true,
  });
  const jwt = await token.toJwt();

  await appendAllwainAuditEvent({
    aggregateType: "chat_thread",
    aggregateId: threadId,
    eventType: "video_call.join_token_issued",
    actorUserId: userId,
    actorRole: account.role || "user",
    source: "allwain_video_call",
    payload: {
      roomHash: createHash("sha256").update(room).digest("hex"),
      expiresInSeconds: TOKEN_TTL_SECONDS,
      recording: false,
    },
  }).catch((error) => console.error("ALLWAIN_VIDEO_CALL_AUDIT_ERROR", error));

  return {
    provider: "livekit" as const,
    serverUrl: configured.serverUrl,
    token: jwt,
    roomName: room,
    expiresInSeconds: TOKEN_TTL_SECONDS,
    conversationId: conversation.id,
    recording: false,
  };
}

export async function recordAllwainVideoCallEvent(
  userId: string,
  threadId: string,
  eventValue: unknown,
  sessionIdValue: unknown,
) {
  const event = String(eventValue || "").trim().toLowerCase();
  if (event !== "started" && event !== "ended") throw new Error("INVALID_VIDEO_CALL_EVENT");
  const sessionId = String(sessionIdValue || "").trim().slice(0, 120);
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(sessionId)) {
    throw new Error("INVALID_VIDEO_CALL_SESSION");
  }
  const conversation = await authorizedConversation(userId, threadId);
  const account = await (getPrisma() as any).user.findFirst({
    where: { id: userId, deletedAt: null, status: "active" },
    select: { id: true, name: true, role: true },
  });
  if (!account) throw new Error("USER_NOT_FOUND");

  await appendAllwainAuditEvent({
    aggregateType: "chat_thread",
    aggregateId: threadId,
    eventType: `video_call.${event}`,
    actorUserId: userId,
    actorRole: account.role || "user",
    source: "allwain_video_call",
    requestId: sessionId,
    payload: { recording: false },
  });

  if (event === "started") {
    await Promise.all(
      conversation.participants
        .filter((participant) => participant.id !== userId)
        .map((participant) =>
          notifyAllwainUser({
            userId: participant.id,
            type: "video_call.started",
            title: `${account.name || "Una persona"} ha iniciado una videollamada`,
            body: "Abre la conversación para unirte. La llamada no se graba.",
            route: "chat",
            routeParams: { conversationId: threadId },
            dedupeKey: `video_call.started:${threadId}:${sessionId}:${participant.id}`,
          }),
        ),
    );
  }

  return { recorded: true, event, sessionId };
}
