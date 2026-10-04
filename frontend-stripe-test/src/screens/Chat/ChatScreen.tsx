import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  Check,
  Languages,
  MoreVertical,
  Send,
  ShieldCheck,
  ShieldOff,
  Video,
  X,
} from "lucide-react-native";

import { EmptyState } from "../../components/design-system";
import type { RootStackParamList } from "../../navigation/types";
import { useAuthStore } from "../../store/auth.store";
import { ChatMessage, useChatStore } from "../../store/chat.store";
import { colors } from "../../theme/colors";
import { getVideoCallCapability } from "../../video/videoCall";
import { trackAnalyticsEvent } from "../../analytics";
import { apiAuthPost } from "../../config/api";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import type { AppLocale } from "../../i18n";

type Props = NativeStackScreenProps<RootStackParamList, "ChatThread">;
const AUTO_TRANSLATE_STORAGE_PREFIX = "allwain:chat-auto-translate:v1";

function formatTime(value: string, locale: AppLocale) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const time = date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return date.toDateString() === today.toDateString()
    ? time
    : `${date.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" })} · ${time}`;
}

type MessageTranslation = {
  messageId: string;
  targetLocale: AppLocale;
  sourceLocale?: AppLocale | null;
  translatedText: string;
  cached: boolean;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "A";
}

export default function ChatScreen({ route, navigation }: Props) {
  const { locale, t } = useAppTranslation();
  const [text, setText] = useState("");
  const [securityConfirmOpen, setSecurityConfirmOpen] = useState(false);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [requestBusy, setRequestBusy] = useState<"accept" | "reject" | null>(null);
  const [videoCallsEnabled, setVideoCallsEnabled] = useState(false);
  const [videoCapabilityLoaded, setVideoCapabilityLoaded] = useState(false);
  const [videoCapabilityNotice, setVideoCapabilityNotice] = useState<string | null>(null);
  const [translations, setTranslations] = useState<Record<string, MessageTranslation>>({});
  const [showOriginal, setShowOriginal] = useState<Record<string, boolean>>({});
  const [translationBusy, setTranslationBusy] = useState<string | null>(null);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [autoTranslate, setAutoTranslate] = useState(false);
  const [autoTranslateHydrated, setAutoTranslateHydrated] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(
    route.params?.conversationId || null,
  );
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const automaticTranslationRequests = useRef(new Set<string>());
  const automaticTranslationBaseline = useRef<string | null>(null);
  const orderId = route.params?.orderId;
  const targetUserId = route.params?.targetUserId;
  const targetName = route.params?.targetName || "Usuario Allwain";
  const userId = useAuthStore((state) => state.user?.id);
  const messages = useChatStore((state) => state.messages);
  const conversation = useChatStore((state) => state.activeConversation);
  const loading = useChatStore((state) => state.loadingMessages);
  const loadingOlder = useChatStore((state) => state.loadingOlderMessages);
  const messagePageInfo = useChatStore((state) => state.messagePageInfo);
  const sending = useChatStore((state) => state.sending);
  const error = useChatStore((state) => state.error);
  const openOrderConversation = useChatStore((state) => state.openOrderConversation);
  const startDirectConversation = useChatStore((state) => state.startDirectConversation);
  const respondToConversationRequest = useChatStore(
    (state) => state.respondToConversationRequest,
  );
  const loadMessages = useChatStore((state) => state.loadMessages);
  const loadOlderMessages = useChatStore((state) => state.loadOlderMessages);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const blockPeer = useChatStore((state) => state.blockPeer);
  const unblockPeer = useChatStore((state) => state.unblockPeer);

  useEffect(() => {
    let active = true;
    setAutoTranslateHydrated(false);
    void AsyncStorage.getItem(`${AUTO_TRANSLATE_STORAGE_PREFIX}:${userId || "device"}`)
      .then((stored) => {
        if (active) setAutoTranslate(stored === "true");
      })
      .finally(() => {
        if (active) setAutoTranslateHydrated(true);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const currentConversation = conversation?.id === conversationId ? conversation : null;
  const composerEnabled = Boolean(
    (!conversationId && targetUserId) || currentConversation?.canSend,
  );
  const canSend = Boolean(
    text.trim().length > 0 &&
      !sending &&
      ((conversationId && currentConversation?.canSend) ||
        (!conversationId && targetUserId)),
  );

  useEffect(() => {
    let active = true;
    async function resolveConversation() {
      if (conversationId || !orderId) return;
      const opened = await openOrderConversation(orderId);
      if (active && opened) setConversationId(opened.id);
    }
    void resolveConversation();
    return () => {
      active = false;
    };
  }, [conversationId, openOrderConversation, orderId]);

  useEffect(() => {
    let active = true;
    if (!conversationId || !currentConversation?.canSend) {
      setVideoCallsEnabled(false);
      setVideoCapabilityLoaded(false);
      return () => {
        active = false;
      };
    }
    void getVideoCallCapability()
      .then((capability) => {
        if (active) {
          setVideoCallsEnabled(capability.enabled);
          setVideoCapabilityLoaded(true);
        }
      })
      .catch(() => {
        if (active) {
          setVideoCallsEnabled(false);
          setVideoCapabilityLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [conversationId, currentConversation?.canSend]);

  useFocusEffect(
    useCallback(() => {
      if (!conversationId) return undefined;
      void loadMessages(conversationId, { markRead: true });
      const timer = setInterval(() => {
        void loadMessages(conversationId, { silent: true, markRead: true });
      }, 4000);
      return () => clearInterval(timer);
    }, [conversationId, loadMessages]),
  );

  const latestMessageId = messages[messages.length - 1]?.id;

  useEffect(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, [latestMessageId]);

  const peerName = useMemo(() => {
    if (currentConversation?.otherUser?.name) return currentConversation.otherUser.name;
    const names = currentConversation?.participants
      .filter((participant) => participant.id !== userId)
      .map((participant) => participant.name)
      .join(", ");
    return names || targetName || "Personas del pedido";
  }, [currentConversation, targetName, userId]);

  async function handleSend() {
    if (!canSend) return;
    const clean = text.trim();
    setText("");
    if (!conversationId && targetUserId) {
      const opened = await startDirectConversation(targetUserId, clean);
      if (opened) {
        setConversationId(opened.id);
        void trackAnalyticsEvent("chat_started", { context: "direct" });
      }
      else setText(clean);
      return;
    }
    if (!conversationId) return;
    const sent = await sendMessage(conversationId, clean);
    if (!sent) setText(clean);
  }

  async function respondToRequest(decision: "accept" | "reject") {
    if (!conversationId || requestBusy) return;
    setRequestBusy(decision);
    await respondToConversationRequest(conversationId, decision);
    setRequestBusy(null);
  }

  const translateMessage = useCallback(async function translateMessage(
    message: ChatMessage,
    options: { toggleExisting?: boolean } = {},
  ) {
    if (!conversationId || translationBusy) return;
    const existing = translations[message.id];
    if (existing?.targetLocale === locale) {
      if (options.toggleExisting === false) return;
      setShowOriginal((current) => ({
        ...current,
        [message.id]: !current[message.id],
      }));
      return;
    }
    setTranslationBusy(message.id);
    setTranslationError(null);
    try {
      const result = await apiAuthPost<MessageTranslation>(
        `/chat/allwain/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(message.id)}/translate`,
        { targetLocale: locale },
        30_000,
      );
      setTranslations((current) => ({ ...current, [message.id]: result }));
      setShowOriginal((current) => ({ ...current, [message.id]: false }));
      void trackAnalyticsEvent("chat_message_translated", {
        target_locale: locale,
        cached: result.cached,
      });
    } catch {
      setTranslationError(t("chat.translationError"));
    } finally {
      setTranslationBusy(null);
    }
  }, [conversationId, locale, t, translationBusy, translations]);

  useEffect(() => {
    if (
      !autoTranslateHydrated ||
      !autoTranslate ||
      !conversationId ||
      translationBusy ||
      loading
    ) return;
    const contextKey = `${conversationId}:${locale}`;
    const incomingMessages = messages.filter(
      (message) => Boolean(message.senderId) && message.senderId !== userId,
    );
    if (automaticTranslationBaseline.current !== contextKey) {
      automaticTranslationBaseline.current = contextKey;
      incomingMessages.slice(0, -1).forEach((message) => {
        automaticTranslationRequests.current.add(`${message.id}:${locale}`);
      });
    }
    const candidate = [...messages]
      .reverse()
      .find((message) => {
        const requestKey = `${message.id}:${locale}`;
        return (
          Boolean(message.senderId) &&
          message.senderId !== userId &&
          translations[message.id]?.targetLocale !== locale &&
          !automaticTranslationRequests.current.has(requestKey)
        );
      });
    if (!candidate) return;
    const requestKey = `${candidate.id}:${locale}`;
    automaticTranslationRequests.current.add(requestKey);
    void translateMessage(candidate, { toggleExisting: false });
  }, [
    autoTranslate,
    autoTranslateHydrated,
    conversationId,
    locale,
    loading,
    messages,
    translationBusy,
    translateMessage,
    translations,
    userId,
  ]);

  async function changeAutoTranslation(enabled: boolean) {
    setAutoTranslate(enabled);
    await AsyncStorage.setItem(
      `${AUTO_TRANSLATE_STORAGE_PREFIX}:${userId || "device"}`,
      String(enabled),
    );
    void trackAnalyticsEvent("chat_auto_translation_changed", {
      enabled,
      target_locale: locale,
    });
  }

  function manageBlock() {
    if (!conversationId || !currentConversation?.otherUser) return;
    setSecurityConfirmOpen(true);
  }

  async function confirmBlockChange() {
    if (!conversationId || !currentConversation?.otherUser || securityBusy) return;
    setSecurityBusy(true);
    const targetId = currentConversation.otherUser.id;
    const changed = currentConversation.blockedByMe
      ? await unblockPeer(conversationId, targetId)
      : await blockPeer(conversationId, targetId);
    setSecurityBusy(false);
    if (changed) setSecurityConfirmOpen(false);
  }

  if (!conversationId && (loading || orderId)) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.loadingText}>{t("chat.opening")}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 120 : 0}
    >
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(peerName)}</Text>
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.peerName} numberOfLines={1}>{peerName}</Text>
          <Text style={styles.contextTitle} numberOfLines={1}>
            {currentConversation?.contextType === "direct" || targetUserId
              ? t("chat.privateMessage")
              : currentConversation?.title || route.params?.title || t("chat.orderTitle")}
          </Text>
        </View>
        {conversationId && currentConversation ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={
              !currentConversation.canSend
                ? t("chat.videoNeedsAcceptance")
                : videoCallsEnabled
                  ? t("chat.videoCall", { name: peerName })
                  : t("chat.videoUnavailable")
            }
            style={[
              styles.videoButton,
              (!currentConversation.canSend || (videoCapabilityLoaded && !videoCallsEnabled)) &&
                styles.videoButtonDisabled,
            ]}
            onPress={() => {
              if (!currentConversation.canSend) {
                setVideoCapabilityNotice(t("chat.videoNeedsAcceptance"));
                return;
              }
              if (!videoCapabilityLoaded) {
                setVideoCapabilityNotice(t("chat.videoChecking"));
                return;
              }
              if (!videoCallsEnabled) {
                setVideoCapabilityNotice(t("chat.videoUnavailableHelp"));
                return;
              }
              setVideoCapabilityNotice(null);
              navigation.navigate("VideoCall", {
                conversationId,
                title: peerName,
              });
            }}
          >
            {!currentConversation.canSend || (videoCapabilityLoaded && !videoCallsEnabled) ? (
              <ShieldOff size={20} color={colors.mutedText} />
            ) : (
              <Video size={19} color={colors.primary} />
            )}
            <Text
              style={[
                styles.videoButtonText,
                (!currentConversation.canSend || (videoCapabilityLoaded && !videoCallsEnabled)) &&
                  styles.videoButtonTextDisabled,
              ]}
              numberOfLines={1}
            >
              {t("chat.videoAction")}
            </Text>
          </TouchableOpacity>
        ) : null}
        {currentConversation?.otherUser ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={currentConversation.blockedByMe ? t("chat.unblockUser") : t("chat.securityOptions")}
            style={styles.iconButton}
            onPress={manageBlock}
          >
            <MoreVertical size={22} color={colors.text} />
          </TouchableOpacity>
        ) : null}
      </View>

      {videoCapabilityNotice ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
          style={styles.videoNotice}
          onPress={() => setVideoCapabilityNotice(null)}
        >
          <Text style={styles.videoNoticeTitle}>{t("chat.videoUnavailable")}</Text>
          <Text style={styles.videoNoticeText}>{videoCapabilityNotice}</Text>
        </TouchableOpacity>
      ) : null}

      {conversationId && currentConversation?.canSend ? (
        <View style={styles.translationBar}>
          <Languages size={19} color={colors.primary} />
          <View style={styles.translationBarCopy}>
            <Text style={styles.translationBarTitle}>{t("chat.autoTranslate")}</Text>
            <Text style={styles.translationBarHelp}>{t("chat.autoTranslateHelp")}</Text>
          </View>
          <Switch
            accessibilityLabel={t("chat.autoTranslate")}
            value={autoTranslate}
            disabled={!autoTranslateHydrated}
            onValueChange={(enabled) => void changeAutoTranslation(enabled)}
            trackColor={{ false: colors.cardBorder, true: "#F5A18D" }}
            thumbColor={autoTranslate ? colors.primary : "#FFFFFF"}
          />
        </View>
      ) : null}

      {currentConversation?.canAccept ? (
        <View style={styles.requestNotice}>
          <View style={styles.requestCopy}>
            <Text style={styles.requestTitle}>{t("chat.requestTitle")}</Text>
            <Text style={styles.requestText}>
              {t("chat.requestBody")}
            </Text>
          </View>
          <View style={styles.requestActions}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t("chat.reject")}
              style={styles.requestSecondary}
              disabled={Boolean(requestBusy)}
              onPress={() => void respondToRequest("reject")}
            >
              {requestBusy === "reject" ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <X size={18} color={colors.text} />
              )}
              <Text style={styles.requestSecondaryText}>{t("chat.reject")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t("chat.accept")}
              style={styles.requestPrimary}
              disabled={Boolean(requestBusy)}
              onPress={() => void respondToRequest("accept")}
            >
              {requestBusy === "accept" ? (
                <ActivityIndicator color={colors.buttonText} />
              ) : (
                <Check size={18} color={colors.buttonText} />
              )}
              <Text style={styles.requestPrimaryText}>{t("chat.accept")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : currentConversation?.requestDirection === "outgoing" ? (
        <View style={styles.blockNotice}>
          <ShieldCheck size={18} color={colors.warning} />
          <Text style={styles.blockNoticeText}>
            {t("chat.requestSent")}
          </Text>
        </View>
      ) : currentConversation?.contextType === "direct" && currentConversation.status === "rejected" ? (
        <View style={styles.blockNotice}>
          <ShieldOff size={18} color={colors.warning} />
          <Text style={styles.blockNoticeText}>
            {t("chat.requestRejected")}
          </Text>
        </View>
      ) : currentConversation && !currentConversation.canSend ? (
        <View style={styles.blockNotice}>
          {currentConversation.blockedByMe ? (
            <ShieldOff size={18} color={colors.warning} />
          ) : (
            <ShieldCheck size={18} color={colors.warning} />
          )}
          <Text style={styles.blockNoticeText}>
            {currentConversation.blockedByMe
              ? t("chat.blockedByMe")
              : t("chat.blockedGeneral")}
          </Text>
        </View>
      ) : null}

      {error && error !== "SESSION_EXPIRED" ? <Text style={styles.error}>{error}</Text> : null}
      {translationError ? <Text style={styles.error}>{translationError}</Text> : null}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(message) => message.id}
        contentContainerStyle={styles.messageList}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        ListHeaderComponent={
          messagePageInfo.hasPreviousPage && conversationId ? (
            <TouchableOpacity
              style={styles.olderButton}
              onPress={() => void loadOlderMessages(conversationId)}
              disabled={loadingOlder}
            >
              {loadingOlder ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.olderButtonText}>{t("chat.loadOlder")}</Text>
              )}
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyLoading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <EmptyState
              title={targetUserId ? t("chat.startWith", { name: targetName }) : t("chat.start")}
              body={
                targetUserId
                  ? t("chat.startRequestBody")
                  : t("chat.startBody")
              }
              demo={{
                title: t("chat.demoClear"),
                meta: t("card.demo"),
                detail: t("chat.demoExample"),
              }}
            />
          )
        }
        renderItem={({ item }) => {
          const mine = item.senderId === userId;
          const system = !item.senderId || item.senderRole === "system";
          const translation =
            translations[item.id]?.targetLocale === locale
              ? translations[item.id]
              : undefined;
          const showingOriginal = Boolean(showOriginal[item.id]);
          const displayedText = translation && !showingOriginal
            ? translation.translatedText
            : item.text;
          if (system) {
            return (
              <View style={styles.systemMessage}>
                <Text style={styles.systemText}>{item.text}</Text>
              </View>
            );
          }
          return (
            <View style={[styles.messageBubble, mine ? styles.messageMine : styles.messageOther]}>
              {!mine ? <Text style={styles.senderName}>{item.senderName}</Text> : null}
              <Text
                style={[
                  styles.messageText,
                  mine && styles.messageTextMine,
                  locale === "ar" && styles.rtlText,
                ]}
              >
                {displayedText}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.translateButton}
                disabled={translationBusy === item.id}
                onPress={() => void translateMessage(item)}
              >
                {translationBusy === item.id ? (
                  <ActivityIndicator size="small" color={mine ? colors.buttonText : colors.primary} />
                ) : null}
                <Text style={[styles.translateText, mine && styles.translateTextMine]}>
                  {translation
                    ? showingOriginal
                      ? t("chat.showTranslation")
                      : t("chat.showOriginal")
                    : t("chat.translate")}
                </Text>
              </TouchableOpacity>
              {translation && !showingOriginal ? (
                <Text style={[styles.translationNotice, mine && styles.messageTimeMine]}>
                  {t("chat.translationNotice")}
                </Text>
              ) : null}
              <Text style={[styles.messageTime, mine && styles.messageTimeMine]}>
                {formatTime(item.createdAt, locale)}
              </Text>
            </View>
          );
        }}
      />

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder={
            !conversationId && targetUserId
              ? t("chat.firstMessage")
              : currentConversation?.canSend
                ? t("chat.writeMessage")
                : t("chat.messagesStopped")
          }
          placeholderTextColor={colors.mutedText}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
          editable={composerEnabled && !sending}
          onSubmitEditing={() => {
            if (Platform.OS === "web") void handleSend();
          }}
        />
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t("chat.sendMessage")}
          style={[styles.sendButton, !canSend && styles.sendDisabled]}
          onPress={handleSend}
          disabled={!canSend}
        >
          {sending ? (
            <ActivityIndicator color={colors.buttonText} />
          ) : (
            <Send size={21} color={colors.buttonText} />
          )}
        </TouchableOpacity>
      </View>

      <Modal
        transparent
        visible={securityConfirmOpen}
        animationType="fade"
        onRequestClose={() => !securityBusy && setSecurityConfirmOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard} accessibilityRole="alert">
            <Text style={styles.modalTitle}>
              {currentConversation?.blockedByMe
                ? t("chat.unblockTitle", { name: peerName })
                : t("chat.blockTitle", { name: peerName })}
            </Text>
            <Text style={styles.modalBody}>
              {currentConversation?.blockedByMe
                ? t("chat.unblockBody")
                : t("chat.blockBody")}
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.modalSecondary}
                disabled={securityBusy}
                onPress={() => setSecurityConfirmOpen(false)}
              >
                <Text style={styles.modalSecondaryText}>{t("common.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.modalPrimary}
                disabled={securityBusy}
                onPress={() => void confirmBlockChange()}
              >
                {securityBusy ? (
                  <ActivityIndicator color={colors.buttonText} />
                ) : (
                  <Text style={styles.modalPrimaryText}>
                    {currentConversation?.blockedByMe ? t("chat.unblock") : t("chat.block")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.background,
  },
  loadingText: { color: colors.mutedText, fontWeight: "700" },
  header: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  iconButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  videoButton: {
    width: 54,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FFC8BA",
    backgroundColor: colors.highlight,
  },
  videoButtonDisabled: {
    borderColor: colors.cardBorder,
    backgroundColor: "#F2F2F0",
  },
  videoButtonText: { color: colors.primary, fontSize: 9, lineHeight: 11, fontWeight: "900" },
  videoButtonTextDisabled: { color: colors.mutedText },
  videoNotice: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    padding: 11,
    gap: 3,
  },
  videoNoticeTitle: { color: colors.text, fontSize: 13, fontWeight: "900" },
  videoNoticeText: { color: colors.mutedText, fontSize: 11, lineHeight: 16, fontWeight: "600" },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.highlight,
    borderWidth: 1,
    borderColor: "#FFC8BA",
  },
  avatarText: { color: colors.primary, fontSize: 14, fontWeight: "900" },
  headerCopy: { flex: 1, minWidth: 0, gap: 2 },
  peerName: { color: colors.text, fontSize: 17, fontWeight: "900" },
  contextTitle: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  translationBar: {
    marginHorizontal: 16,
    marginTop: 10,
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FFC8BA",
    backgroundColor: colors.highlight,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  translationBarCopy: { flex: 1, minWidth: 0, gap: 2 },
  translationBarTitle: { color: colors.text, fontSize: 12, fontWeight: "900" },
  translationBarHelp: { color: colors.mutedText, fontSize: 10, lineHeight: 14, fontWeight: "600" },
  blockNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#F0D59B",
    backgroundColor: "#FFF5DD",
  },
  blockNoticeText: { flex: 1, color: colors.warning, fontSize: 12, lineHeight: 17, fontWeight: "800" },
  requestNotice: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 13,
    gap: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FFC8BA",
    backgroundColor: "#FFFCFB",
  },
  requestCopy: { gap: 3 },
  requestTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  requestText: { color: colors.mutedText, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  requestActions: { flexDirection: "row", gap: 9 },
  requestSecondary: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  requestSecondaryText: { color: colors.text, fontWeight: "900" },
  requestPrimary: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  requestPrimaryText: { color: colors.buttonText, fontWeight: "900" },
  error: {
    color: colors.danger,
    backgroundColor: "#FFF0EE",
    marginHorizontal: 16,
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#F1C4BE",
    fontWeight: "700",
  },
  messageList: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 9,
  },
  emptyLoading: { flex: 1, minHeight: 240, alignItems: "center", justifyContent: "center" },
  olderButton: {
    minHeight: 42,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  olderButtonText: { color: colors.primary, fontSize: 12, fontWeight: "900" },
  systemMessage: {
    alignSelf: "center",
    maxWidth: "92%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#EEEEEC",
  },
  systemText: { color: colors.mutedText, textAlign: "center", fontSize: 12, lineHeight: 17, fontWeight: "700" },
  messageBubble: { maxWidth: "84%", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, gap: 3 },
  messageMine: { alignSelf: "flex-end", backgroundColor: colors.primary },
  messageOther: { alignSelf: "flex-start", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder },
  senderName: { color: colors.primary, fontSize: 11, fontWeight: "900" },
  messageText: { color: colors.text, fontSize: 15, lineHeight: 21, fontWeight: "600" },
  messageTextMine: { color: colors.buttonText },
  rtlText: { textAlign: "right", writingDirection: "rtl" },
  translateButton: {
    minHeight: 30,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
  },
  translateText: { color: colors.primary, fontSize: 11, fontWeight: "900" },
  translateTextMine: { color: colors.buttonText },
  translationNotice: { color: colors.mutedText, fontSize: 9, lineHeight: 13, fontWeight: "600" },
  messageTime: { alignSelf: "flex-end", color: colors.mutedText, fontSize: 10, fontWeight: "700" },
  messageTimeMine: { color: "rgba(255,255,255,0.78)" },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.background,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  sendDisabled: { opacity: 0.42 },
  modalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(20, 20, 18, 0.46)",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    padding: 20,
    gap: 12,
  },
  modalTitle: { color: colors.text, fontSize: 20, lineHeight: 25, fontWeight: "900" },
  modalBody: { color: colors.mutedText, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalSecondary: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  modalSecondaryText: { color: colors.text, fontWeight: "900" },
  modalPrimary: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: colors.danger,
  },
  modalPrimaryText: { color: colors.buttonText, fontWeight: "900" },
});
