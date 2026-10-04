import { Response, Router } from "express";
import { AuthRequest, authRequired } from "../middleware/auth.middleware";
import {
  allwainVideoCallCapability,
  issueAllwainVideoCallToken,
  recordAllwainVideoCallEvent,
} from "../services/allwain-video-call.service";
import {
  blockChatUser,
  listChatConversations,
  listChatMessages,
  markChatRead,
  openChatContext,
  respondToDirectChatRequest,
  sendChatMessage,
  startDirectChat,
  unblockChatUser,
} from "../services/chat.service";
import { translateAllwainChatMessage } from "../services/chat-translation.service";
import { allwainAiRateLimit } from "../middleware/operation-rate-limit.middleware";

const router = Router();

function currentUserId(req: AuthRequest) {
  if (!req.user?.id) throw new Error("UNAUTHORIZED");
  return req.user.id;
}

function sendChatError(error: unknown, res: Response) {
  const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
  if (code === "UNAUTHORIZED") return void res.status(401).json({ error: code });
  if (
    code === "INVALID_CHAT_APP" ||
    code === "INVALID_CHAT_CONTEXT" ||
    code === "INVALID_CHAT_MESSAGE" ||
    code === "INVALID_CHAT_REQUEST_DECISION" ||
    code === "DIRECT_CHAT_SELF_FORBIDDEN"
  ) {
    return void res.status(400).json({ error: code });
  }
  if (code === "CHAT_NOT_FOUND" || code === "CHAT_MESSAGE_NOT_FOUND") {
    return void res.status(404).json({ error: code });
  }
  if (
    code === "CHAT_BLOCKED" ||
    code === "CHAT_REQUEST_PENDING" ||
    code === "CHAT_REQUEST_REQUIRES_RESPONSE" ||
    code === "CHAT_REQUEST_REJECTED" ||
    code === "CHAT_REQUEST_ALREADY_RESOLVED" ||
    code === "CHAT_CLOSED"
  ) {
    return void res.status(409).json({ error: code });
  }
  if (
    code === "BLOCK_TARGET_REQUIRED" ||
    code === "DIRECT_CHAT_TARGET_REQUIRED" ||
    code === "CHAT_REQUEST_NOT_RECIPIENT"
  ) {
    return void res.status(422).json({ error: code });
  }
  if (code === "CHAT_REQUEST_RATE_LIMITED") {
    res.setHeader("Retry-After", "3600");
    return void res.status(429).json({ error: code });
  }
  if (code === "ALLWAIN_AI_RATE_LIMITED") {
    return void res.status(429).json({ error: code });
  }
  if (code === "VIDEO_CALL_NOT_CONFIGURED") {
    return void res.status(503).json({ error: code });
  }
  if (
    code === "CHAT_TRANSLATION_NOT_CONFIGURED" ||
    code === "CHAT_TRANSLATION_REQUIRES_POSTGRES" ||
    code === "CHAT_TRANSLATION_PROVIDER_ERROR"
  ) {
    return void res.status(503).json({ error: code });
  }
  if (
    code === "UNSUPPORTED_TRANSLATION_LOCALE" ||
    code === "CHAT_TRANSLATION_INVALID_RESPONSE"
  ) {
    return void res.status(400).json({ error: code });
  }
  if (code === "VIDEO_CALL_CONTEXT_NOT_ACTIVE") {
    return void res.status(409).json({ error: code });
  }
  if (code === "INVALID_VIDEO_CALL_EVENT" || code === "INVALID_VIDEO_CALL_SESSION") {
    return void res.status(400).json({ error: code });
  }
  if (code === "USER_NOT_FOUND") return void res.status(404).json({ error: code });
  console.error("CHAT_ROUTE_ERROR", error);
  return void res.status(500).json({ error: "INTERNAL_ERROR" });
}

router.get("/:app/conversations", authRequired, async (req: AuthRequest, res) => {
  try {
    res.json(
      await listChatConversations(currentUserId(req), req.params.app, {
        limit: Number(req.query.limit) || undefined,
        cursor:
          typeof req.query.cursor === "string" ? req.query.cursor : null,
      }),
    );
  } catch (error) {
    sendChatError(error, res);
  }
});

router.post(
  "/:app/direct/:targetUserId",
  authRequired,
  async (req: AuthRequest, res) => {
    try {
      const result = await startDirectChat(
        currentUserId(req),
        req.params.app,
        req.params.targetUserId,
        req.body?.text,
      );
      res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      sendChatError(error, res);
    }
  },
);

router.get(
  "/allwain/video-capability",
  authRequired,
  async (_req: AuthRequest, res) => {
    res.json(allwainVideoCallCapability());
  },
);

router.post(
  "/allwain/conversations/:id/video-token",
  authRequired,
  async (req: AuthRequest, res) => {
    try {
      res.json(await issueAllwainVideoCallToken(currentUserId(req), req.params.id));
    } catch (error) {
      sendChatError(error, res);
    }
  },
);

router.post(
  "/allwain/conversations/:id/video-event",
  authRequired,
  async (req: AuthRequest, res) => {
    try {
      res.json(
        await recordAllwainVideoCallEvent(
          currentUserId(req),
          req.params.id,
          req.body?.event,
          req.body?.sessionId,
        ),
      );
    } catch (error) {
      sendChatError(error, res);
    }
  },
);

router.post(
  "/:app/conversations/:id/request-response",
  authRequired,
  async (req: AuthRequest, res) => {
    try {
      res.json(
        await respondToDirectChatRequest(
          currentUserId(req),
          req.params.app,
          req.params.id,
          req.body?.decision,
        ),
      );
    } catch (error) {
      sendChatError(error, res);
    }
  },
);

router.post(
  "/:app/contexts/:contextType/:contextId/open",
  authRequired,
  async (req: AuthRequest, res) => {
    try {
      res.json(
        await openChatContext(
          currentUserId(req),
          req.params.app,
          req.params.contextType,
          req.params.contextId,
        ),
      );
    } catch (error) {
      sendChatError(error, res);
    }
  },
);

router.get(
  "/:app/conversations/:id/messages",
  authRequired,
  async (req: AuthRequest, res) => {
    try {
      res.json(
        await listChatMessages(currentUserId(req), req.params.app, req.params.id, {
          limit: Number(req.query.limit) || undefined,
          before:
            typeof req.query.before === "string" ? req.query.before : null,
        }),
      );
    } catch (error) {
      sendChatError(error, res);
    }
  },
);

router.post(
  "/:app/conversations/:id/messages",
  authRequired,
  async (req: AuthRequest, res) => {
    try {
      const item = await sendChatMessage(
        currentUserId(req),
        req.params.app,
        req.params.id,
        req.body?.text,
      );
      res.status(201).json(item);
    } catch (error) {
      sendChatError(error, res);
    }
  },
);

router.post(
  "/allwain/conversations/:id/messages/:messageId/translate",
  authRequired,
  allwainAiRateLimit,
  async (req: AuthRequest, res) => {
    try {
      res.json(
        await translateAllwainChatMessage({
          userId: currentUserId(req),
          threadId: req.params.id,
          messageId: req.params.messageId,
          targetLocale: req.body?.targetLocale,
          requestId: String((req as any).requestId || "") || undefined,
        }),
      );
    } catch (error) {
      sendChatError(error, res);
    }
  },
);

router.post(
  "/:app/conversations/:id/read",
  authRequired,
  async (req: AuthRequest, res) => {
    try {
      res.json(await markChatRead(currentUserId(req), req.params.app, req.params.id));
    } catch (error) {
      sendChatError(error, res);
    }
  },
);

router.post(
  "/:app/conversations/:id/block",
  authRequired,
  async (req: AuthRequest, res) => {
    try {
      res.json(
        await blockChatUser(
          currentUserId(req),
          req.params.app,
          req.params.id,
          req.body?.targetUserId,
        ),
      );
    } catch (error) {
      sendChatError(error, res);
    }
  },
);

router.post(
  "/:app/conversations/:id/unblock",
  authRequired,
  async (req: AuthRequest, res) => {
    try {
      res.json(
        await unblockChatUser(
          currentUserId(req),
          req.params.app,
          req.params.id,
          req.body?.targetUserId,
        ),
      );
    } catch (error) {
      sendChatError(error, res);
    }
  },
);

export default router;
