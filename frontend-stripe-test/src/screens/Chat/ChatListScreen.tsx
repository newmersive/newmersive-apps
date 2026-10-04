import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { MessageCircle } from "lucide-react-native";

import { ConversationCard, EmptyState } from "../../components/design-system";
import type { RootStackParamList } from "../../navigation/types";
import { ChatConversation, useChatStore } from "../../store/chat.store";
import { colors } from "../../theme/colors";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import type { AppLocale, TranslationKey } from "../../i18n";

type Props = NativeStackScreenProps<RootStackParamList, "ChatList">;
type Tone = "neutral" | "brand" | "success" | "warning" | "dark";

function formatConversationTime(
  value: string | undefined,
  locale: AppLocale,
  yesterdayLabel: string,
) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return yesterdayLabel;
  return date.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
}

function conversationStatus(
  item: ChatConversation,
  t: (key: TranslationKey, replacements?: Record<string, string | number>) => string,
): { label: string; tone: Tone } {
  if (item.blockedByMe) return { label: t("chat.status.blocked"), tone: "warning" };
  if (item.blockedForMe) return { label: t("chat.status.stopped"), tone: "warning" };
  if (item.contextType === "direct" && item.requestDirection === "incoming") {
    return { label: t("chat.status.incoming"), tone: "brand" };
  }
  if (item.contextType === "direct" && item.requestDirection === "outgoing") {
    return { label: t("chat.status.outgoing"), tone: "warning" };
  }
  if (item.contextType === "direct" && item.status === "rejected") {
    return { label: t("chat.status.rejected"), tone: "neutral" };
  }
  if (item.contextType === "direct") return { label: t("chat.status.private"), tone: "success" };
  if (["completed", "delivered"].includes(item.status)) {
    return { label: t("chat.status.finished"), tone: "success" };
  }
  if (["cancelled", "canceled", "refunded", "closed"].includes(item.status)) {
    return { label: t("chat.status.closed"), tone: "neutral" };
  }
  return { label: t("chat.status.order"), tone: "brand" };
}

export default function ChatListScreen({ navigation }: Props) {
  const { locale, t } = useAppTranslation();
  const conversations = useChatStore((state) => state.conversations);
  const unreadCount = useChatStore((state) => state.unreadCount);
  const loading = useChatStore((state) => state.loadingConversations);
  const error = useChatStore((state) => state.error);
  const loadConversations = useChatStore((state) => state.loadConversations);
  const loadMoreConversations = useChatStore((state) => state.loadMoreConversations);
  const pageInfo = useChatStore((state) => state.conversationPageInfo);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void loadConversations();
      const timer = setInterval(() => {
        void loadConversations({ silent: true });
      }, 8000);
      return () => clearInterval(timer);
    }, [loadConversations]),
  );

  async function refresh() {
    setRefreshing(true);
    await loadConversations({ silent: true });
    setRefreshing(false);
  }

  function openConversation(item: ChatConversation) {
    navigation.navigate("ChatThread", {
      conversationId: item.id,
      title: item.title,
    });
  }

  function openOrders() {
    navigation.navigate("MainTabs", { screen: "Ofertas" });
  }

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{t("chat.messages")}</Text>
            <Text style={styles.subtitle}>
              {unreadCount > 0
                ? unreadCount === 1
                  ? t("chat.newOne")
                  : t("chat.newMany", { count: unreadCount })
                : t("chat.allRead")}
            </Text>
          </View>
          <View style={styles.headerMark}>
            <MessageCircle size={23} color={colors.primary} />
          </View>
        </View>

        {error && error !== "SESSION_EXPIRED" ? <Text style={styles.error}>{error}</Text> : null}

        {loading && conversations.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>{t("chat.loading")}</Text>
          </View>
        ) : null}

        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
          }
          onEndReached={() => {
            if (pageInfo.hasNextPage) void loadMoreConversations();
          }}
          onEndReachedThreshold={0.35}
          renderItem={({ item }) => {
            const people = item.otherUser?.name ||
              item.participants.map((participant) => participant.name).join(", ") ||
              t("chat.orderTitle");
            const status = conversationStatus(item, t);
            return (
              <ConversationCard
                name={people}
                title={item.title}
                lastMessage={item.lastMessage?.text}
                time={formatConversationTime(
                  item.lastMessage?.createdAt || item.updatedAt,
                  locale,
                  t("chat.yesterday"),
                )}
                unreadCount={item.unreadCount}
                status={status.label}
                statusTone={status.tone}
                onPress={() => openConversation(item)}
              />
            );
          }}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon={<MessageCircle size={25} color={colors.primary} />}
                title={t("chat.emptyTitle")}
                body={t("chat.emptyBody")}
                actionLabel={t("chat.viewOrders")}
                onAction={openOrders}
                demo={{
                  title: t("chat.demoTitle"),
                  meta: t("chat.demoMeta"),
                  detail: t("chat.demoDetail"),
                  leading: <MessageCircle size={20} color={colors.primary} />,
                }}
              />
            ) : null
          }
          ListFooterComponent={
            loading && conversations.length > 0 ? (
              <View style={styles.listFooter}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, width: "100%", maxWidth: 760, alignSelf: "center", padding: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  headerCopy: { flex: 1, minWidth: 0, gap: 2 },
  title: { color: colors.text, fontSize: 25, lineHeight: 31, fontWeight: "900" },
  subtitle: { color: colors.mutedText, fontSize: 13, fontWeight: "700" },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerMark: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.highlight,
    borderWidth: 1,
    borderColor: "#FFC8BA",
  },
  list: { flexGrow: 1, gap: 10, paddingBottom: 28 },
  loadingBox: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 16 },
  loadingText: { color: colors.mutedText, fontWeight: "700" },
  listFooter: { minHeight: 54, alignItems: "center", justifyContent: "center" },
  error: {
    color: colors.danger,
    backgroundColor: "#FFF0EE",
    borderWidth: 1,
    borderColor: "#F1C4BE",
    borderRadius: 8,
    padding: 11,
    marginBottom: 10,
    fontWeight: "700",
  },
});
