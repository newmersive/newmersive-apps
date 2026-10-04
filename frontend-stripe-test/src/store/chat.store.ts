import { create } from "zustand";
import { apiAuthGet, apiAuthPost } from "../config/api";

export type ChatMessage = {
  id: string;
  threadId: string;
  senderId?: string | null;
  senderName: string;
  senderRole: "user" | "system";
  text: string;
  createdAt: string;
};

export type ChatParticipant = {
  id: string;
  name: string;
  avatarUrl?: string | null;
};

export type ChatConversation = {
  id: string;
  app: "allwain";
  contextType: "order" | "direct";
  contextId: string;
  title: string;
  status: string;
  participants: ChatParticipant[];
  otherUser?: ChatParticipant | null;
  lastMessage?: ChatMessage | null;
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

type ChatState = {
  conversations: ChatConversation[];
  conversationPageInfo: { hasNextPage: boolean; nextCursor?: string | null };
  unreadCount: number;
  messages: ChatMessage[];
  messagePageInfo: { hasPreviousPage: boolean; previousCursor?: string | null };
  activeConversation: ChatConversation | null;
  loadingConversations: boolean;
  loadingMessages: boolean;
  loadingOlderMessages: boolean;
  sending: boolean;
  error: string | null;
  loadConversations: (options?: { silent?: boolean; append?: boolean }) => Promise<void>;
  loadMoreConversations: () => Promise<void>;
  openOrderConversation: (orderId: string) => Promise<ChatConversation | null>;
  startDirectConversation: (targetUserId: string, text: string) => Promise<ChatConversation | null>;
  respondToConversationRequest: (
    conversationId: string,
    decision: "accept" | "reject",
  ) => Promise<boolean>;
  loadMessages: (conversationId: string, options?: { silent?: boolean; markRead?: boolean; before?: string | null }) => Promise<void>;
  loadOlderMessages: (conversationId: string) => Promise<void>;
  sendMessage: (conversationId: string, text: string) => Promise<ChatMessage | null>;
  markRead: (conversationId: string) => Promise<void>;
  blockPeer: (conversationId: string, targetUserId?: string) => Promise<boolean>;
  unblockPeer: (conversationId: string, targetUserId?: string) => Promise<boolean>;
};

function path(conversationId: string) {
  return `/chat/allwain/conversations/${encodeURIComponent(conversationId)}`;
}

function message(error: any, fallback: string) {
  if (error?.message === "SESSION_EXPIRED") return "SESSION_EXPIRED";
  return error?.message || fallback;
}

function merge(items: ChatConversation[], next: ChatConversation) {
  return items.some((item) => item.id === next.id)
    ? items.map((item) => (item.id === next.id ? { ...item, ...next } : item))
    : [next, ...items];
}

function mergeConversationPages(
  current: ChatConversation[],
  incoming: ChatConversation[],
) {
  const byId = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => byId.set(item.id, { ...byId.get(item.id), ...item }));
  return [...byId.values()].sort((left, right) => {
    const leftDate = left.lastMessage?.createdAt || left.updatedAt;
    const rightDate = right.lastMessage?.createdAt || right.updatedAt;
    return rightDate.localeCompare(leftDate);
  });
}

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => byId.set(item.id, item));
  return [...byId.values()].sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
  );
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  conversationPageInfo: { hasNextPage: false, nextCursor: null },
  unreadCount: 0,
  messages: [],
  messagePageInfo: { hasPreviousPage: false, previousCursor: null },
  activeConversation: null,
  loadingConversations: false,
  loadingMessages: false,
  loadingOlderMessages: false,
  sending: false,
  error: null,

  loadConversations: async (options) => {
    if (!options?.silent) set({ loadingConversations: true, error: null });
    try {
      const cursor = options?.append
        ? get().conversationPageInfo.nextCursor
        : null;
      if (options?.append && !cursor) return;
      const response = await apiAuthGet<{
        items?: ChatConversation[];
        unreadCount?: number;
        pageInfo?: { hasNextPage: boolean; nextCursor?: string | null };
      }>(
        `/chat/allwain/conversations?limit=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      const incoming = response.items || [];
      const conversations =
        options?.append || options?.silent
          ? mergeConversationPages(get().conversations, incoming)
          : incoming;
      const activeId = get().activeConversation?.id;
      set({
        conversations,
        unreadCount: Number(response.unreadCount || 0),
        conversationPageInfo: response.pageInfo || {
          hasNextPage: false,
          nextCursor: null,
        },
        activeConversation: activeId
          ? conversations.find((item) => item.id === activeId) || get().activeConversation
          : get().activeConversation,
        loadingConversations: false,
      });
    } catch (error: any) {
      set({ error: message(error, "No se pudieron cargar las conversaciones."), loadingConversations: false });
    }
  },

  loadMoreConversations: async () => {
    if (get().loadingConversations || !get().conversationPageInfo.hasNextPage) return;
    set({ loadingConversations: true });
    await get().loadConversations({ silent: true, append: true });
  },

  openOrderConversation: async (orderId) => {
    set({ error: null });
    try {
      const conversation = await apiAuthPost<ChatConversation>(
        `/chat/allwain/contexts/order/${encodeURIComponent(orderId)}/open`,
        {},
      );
      set({ activeConversation: conversation, conversations: merge(get().conversations, conversation) });
      return conversation;
    } catch (error: any) {
      set({ error: message(error, "No se pudo abrir la conversación del pedido.") });
      return null;
    }
  },

  startDirectConversation: async (targetUserId, text) => {
    const clean = text.trim();
    if (!clean) return null;
    set({ sending: true, error: null });
    try {
      const result = await apiAuthPost<{
        conversation: ChatConversation;
        message?: ChatMessage | null;
      }>(`/chat/allwain/direct/${encodeURIComponent(targetUserId)}`, { text: clean });
      const nextMessages = result.message
        ? mergeMessages(get().messages, [result.message])
        : get().messages;
      set({
        activeConversation: result.conversation,
        conversations: merge(get().conversations, result.conversation),
        messages: nextMessages,
        sending: false,
      });
      await get().loadMessages(result.conversation.id, {
        silent: true,
        markRead: true,
      });
      return result.conversation;
    } catch (error: any) {
      set({
        error: message(error, "No se pudo enviar la solicitud de conversación."),
        sending: false,
      });
      return null;
    }
  },

  respondToConversationRequest: async (conversationId, decision) => {
    set({ error: null });
    try {
      const conversation = await apiAuthPost<ChatConversation>(
        `${path(conversationId)}/request-response`,
        { decision },
      );
      set({
        activeConversation: conversation,
        conversations: merge(get().conversations, conversation),
      });
      await get().loadMessages(conversationId, { silent: true, markRead: true });
      await get().loadConversations({ silent: true });
      return true;
    } catch (error: any) {
      set({ error: message(error, "No se pudo responder a esta solicitud.") });
      return false;
    }
  },

  loadMessages: async (conversationId, options) => {
    const loadingOlder = Boolean(options?.before);
    if (loadingOlder) {
      set({ loadingOlderMessages: true, error: null });
    } else if (!options?.silent) {
      set({
        loadingMessages: true,
        error: null,
        messages: get().activeConversation?.id === conversationId ? get().messages : [],
        messagePageInfo: { hasPreviousPage: false, previousCursor: null },
      });
    }
    try {
      const response = await apiAuthGet<{
        conversation: ChatConversation;
        items?: ChatMessage[];
        pageInfo?: { hasPreviousPage: boolean; previousCursor?: string | null };
      }>(
        `${path(conversationId)}/messages?limit=50${options?.before ? `&before=${encodeURIComponent(options.before)}` : ""}`,
      );
      const incoming = response.items || [];
      const preserveCurrent =
        get().activeConversation?.id === conversationId &&
        (options?.silent || loadingOlder);
      set({
        activeConversation: response.conversation,
        conversations: merge(get().conversations, response.conversation),
        messages: preserveCurrent
          ? mergeMessages(get().messages, incoming)
          : incoming,
        messagePageInfo: response.pageInfo || {
          hasPreviousPage: false,
          previousCursor: null,
        },
        loadingMessages: false,
        loadingOlderMessages: false,
      });
      if (options?.markRead !== false) await get().markRead(conversationId);
    } catch (error: any) {
      set({
        error: message(error, "No se pudieron cargar los mensajes."),
        loadingMessages: false,
        loadingOlderMessages: false,
      });
    }
  },

  loadOlderMessages: async (conversationId) => {
    const pageInfo = get().messagePageInfo;
    if (get().loadingOlderMessages || !pageInfo.hasPreviousPage || !pageInfo.previousCursor) return;
    await get().loadMessages(conversationId, {
      silent: true,
      markRead: false,
      before: pageInfo.previousCursor,
    });
  },

  sendMessage: async (conversationId, text) => {
    const clean = text.trim();
    if (!clean) return null;
    set({ sending: true, error: null });
    try {
      const item = await apiAuthPost<ChatMessage>(`${path(conversationId)}/messages`, { text: clean });
      set({ messages: [...get().messages, item], sending: false });
      await get().loadMessages(conversationId, { silent: true, markRead: true });
      await get().loadConversations({ silent: true });
      return item;
    } catch (error: any) {
      set({ error: message(error, "No se pudo enviar el mensaje."), sending: false });
      return null;
    }
  },

  markRead: async (conversationId) => {
    try {
      await apiAuthPost(`${path(conversationId)}/read`, {});
      const conversations = get().conversations.map((item) =>
        item.id === conversationId ? { ...item, unreadCount: 0 } : item,
      );
      set({
        conversations,
        unreadCount: conversations.reduce((sum, item) => sum + item.unreadCount, 0),
        activeConversation:
          get().activeConversation?.id === conversationId
            ? { ...get().activeConversation!, unreadCount: 0 }
            : get().activeConversation,
      });
    } catch {
      // The next poll retries read state without interrupting the conversation.
    }
  },

  blockPeer: async (conversationId, targetUserId) => {
    try {
      await apiAuthPost(`${path(conversationId)}/block`, { targetUserId });
      await get().loadMessages(conversationId, { silent: true, markRead: false });
      return true;
    } catch (error: any) {
      set({ error: message(error, "No se pudo bloquear a esta persona.") });
      return false;
    }
  },

  unblockPeer: async (conversationId, targetUserId) => {
    try {
      await apiAuthPost(`${path(conversationId)}/unblock`, { targetUserId });
      await get().loadMessages(conversationId, { silent: true, markRead: false });
      return true;
    } catch (error: any) {
      set({ error: message(error, "No se pudo desbloquear a esta persona.") });
      return false;
    }
  },
}));
