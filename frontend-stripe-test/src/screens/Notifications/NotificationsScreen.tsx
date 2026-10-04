import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { CommonActions, useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Bell, CheckCheck, ChevronRight } from "lucide-react-native";

import {
  apiAuthGet,
  apiAuthPost,
  type AllwainContract,
  type AllwainNotification,
  type AllwainNotificationList,
  type AllwainOrder,
} from "../../config/api";
import type { RootStackParamList } from "../../navigation/types";
import {
  type AllwainAppMode,
  useAuthStore,
} from "../../store/auth.store";
import { useNotificationStore } from "../../store/notification.store";
import { EmptyState } from "../../components/design-system";
import { colors } from "../../theme/colors";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import type { AppLocale } from "../../i18n";

type Props = NativeStackScreenProps<RootStackParamList, "Notifications">;

function dateText(value: string, locale: AppLocale) {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function explicitMode(item: AllwainNotification): AllwainAppMode | null {
  const mode = item.routeParams?.mode;
  return mode === "buy" || mode === "sell" || mode === "connector"
    ? mode
    : null;
}

async function legacyNotificationMode(
  item: AllwainNotification,
  userId?: string,
): Promise<AllwainAppMode | null> {
  const directMode = explicitMode(item);
  if (directMode) return directMode;
  if (item.type === "order.created") return "sell";
  if (!userId) return null;

  const params = item.routeParams || {};
  try {
    if (typeof params.orderId === "string") {
      const order = await apiAuthGet<AllwainOrder>(
        `/allwain/payments/orders/${params.orderId}`,
      );
      if (order?.connectorUserId === userId) return "connector";
      if (order?.sellerUserId === userId) return "sell";
      if (order?.buyerUserId === userId) return "buy";
    }
    if (typeof params.contractId === "string") {
      const contract = await apiAuthGet<AllwainContract>(
        `/allwain/contracts/${params.contractId}`,
      );
      if (contract?.providerUserId === userId) return "sell";
      if (contract?.requesterUserId === userId) return "buy";
    }
  } catch {
    // El destino se abre igualmente; los avisos nuevos ya incluyen el contexto.
  }
  return null;
}

export default function NotificationsScreen({ navigation }: Props) {
  const { locale, t } = useAppTranslation();
  const userId = useAuthStore((state) => state.user?.id);
  const setAppMode = useAuthStore((state) => state.setAppMode);
  const [items, setItems] = useState<AllwainNotification[]>([]);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const setUnreadCount = useNotificationStore((state) => state.setUnreadCount);
  const decrementUnreadCount = useNotificationStore(
    (state) => state.decrementUnreadCount,
  );
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageInfo, setPageInfo] = useState<{
    hasNextPage: boolean;
    nextCursor?: string | null;
  }>({ hasNextPage: false, nextCursor: null });
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (cursor?: string | null) => {
    const append = Boolean(cursor);
    if (append) setLoadingMore(true);
    setError(null);
    try {
      const response = await apiAuthGet<AllwainNotificationList>(
        `/allwain/notifications?limit=40${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      setItems((current) => {
        if (!append) return response.items || [];
        const byId = new Map(current.map((item) => [item.id, item]));
        (response.items || []).forEach((item) => byId.set(item.id, item));
        return [...byId.values()];
      });
      setUnreadCount(response.unreadCount || 0);
      setPageInfo(response.pageInfo || { hasNextPage: false, nextCursor: null });
    } catch (loadError: any) {
      setError(loadError?.message || t("notifications.loadError"));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [setUnreadCount, t]);

  useFocusEffect(
    useCallback(() => {
      void load(null);
    }, [load]),
  );

  async function openItem(item: AllwainNotification) {
    if (!item.readAt) {
      try {
        const updated = await apiAuthPost<AllwainNotification>(
          `/allwain/notifications/${item.id}/read`,
          {},
        );
        if (updated.id !== item.id || !updated.readAt) {
          throw new Error("READ_NOT_CONFIRMED");
        }
        setItems((current) =>
          current.map((candidate) =>
            candidate.id === item.id
              ? { ...candidate, readAt: new Date().toISOString() }
              : candidate,
          ),
        );
        decrementUnreadCount();
      } catch {
        // Abrir el destino es más importante que sincronizar el indicador de lectura.
      }
    }
    const params = item.routeParams || {};
    if (
      item.route === "shopping_list" &&
      typeof params.shoppingListId === "string"
    ) {
      const mode = params.mode === "sell" ? "sell" : "buy";
      await setAppMode(mode);
      navigation.navigate("ShoppingLists", {
        shoppingListId: params.shoppingListId,
        mode,
      });
      return;
    }
    if (item.route === "chat" && typeof params.conversationId === "string") {
      navigation.navigate("ChatThread", {
        conversationId: params.conversationId,
        orderId: typeof params.orderId === "string" ? params.orderId : undefined,
        title: item.title,
      });
      return;
    }
    if (item.route === "reputation" || item.type === "review_received") {
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [
            {
              name: "MainTabs",
              params: {
                screen: "Perfil",
                params: { openReputation: true },
              },
            },
          ],
        }),
      );
      return;
    }
    const targetMode = await legacyNotificationMode(item, userId);
    if (targetMode) await setAppMode(targetMode);
    if (
      typeof params.requestId === "string" &&
      targetMode !== "sell"
    ) {
      navigation.navigate("ScanResult", { requestId: params.requestId });
      return;
    }
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [
          {
            name: "MainTabs",
            params: {
              screen: "Ofertas",
              params: {
                orderId: typeof params.orderId === "string" ? params.orderId : undefined,
                contractId: typeof params.contractId === "string" ? params.contractId : undefined,
                offerId: typeof params.offerId === "string" ? params.offerId : undefined,
                requestId: typeof params.requestId === "string" ? params.requestId : undefined,
                deliveryId: typeof params.deliveryId === "string" ? params.deliveryId : undefined,
              },
            },
          },
        ],
      }),
    );
  }

  async function markAllRead() {
    if (markingAll) return;
    setMarkingAll(true);
    setError(null);
    try {
      const result = await apiAuthPost<{ updated: number }>(
        "/allwain/notifications/read-all",
        {},
      );
      if (!Number.isInteger(result.updated) || result.updated < 0) {
        throw new Error(t("notifications.readNotConfirmed"));
      }
      const now = new Date().toISOString();
      setItems((current) =>
        current.map((item) => ({ ...item, readAt: item.readAt || now })),
      );
      setUnreadCount(0);
    } catch (markError: any) {
      setError(markError?.message || t("notifications.markError"));
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.titleRow}>
        <View>
          <Text style={styles.title}>{t("notifications.title")}</Text>
          <Text style={styles.subtitle}>
            {unreadCount
              ? t("notifications.pending", { count: unreadCount })
              : t("chat.allRead")}
          </Text>
        </View>
        {unreadCount > 0 ? (
          <TouchableOpacity style={styles.readAllButton} onPress={() => void markAllRead()} disabled={markingAll}>
            {markingAll ? <ActivityIndicator color={colors.text} /> : <CheckCheck size={18} color={colors.text} />}
            <Text style={styles.readAllText}>{markingAll ? t("notifications.saving") : t("notifications.markAll")}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <TouchableOpacity style={styles.centerState} onPress={() => void load(null)}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.retryText}>{t("common.retry")}</Text>
        </TouchableOpacity>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bell size={28} color={colors.primary} />}
          title={t("notifications.emptyTitle")}
          body={t("notifications.emptyBody")}
          demo={{
            title: t("notifications.demoTitle"),
            meta: t("notifications.demoMeta"),
            detail: t("notifications.demoDetail"),
            leading: <Bell size={20} color={colors.primary} />,
          }}
        />
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.item, !item.readAt && styles.unreadItem]}
              activeOpacity={0.86}
              onPress={() => void openItem(item)}
            >
              <View style={[styles.dot, item.readAt && styles.readDot]} />
              <View style={styles.itemCopy}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemBody}>{item.body}</Text>
                <Text style={styles.itemDate}>{dateText(item.createdAt, locale)}</Text>
              </View>
              <ChevronRight size={20} color={colors.mutedText} />
            </TouchableOpacity>
          ))}
          {pageInfo.hasNextPage ? (
            <TouchableOpacity
              style={styles.moreButton}
              onPress={() => void load(pageInfo.nextCursor)}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.moreText}>{t("notifications.showOlder")}</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40, gap: 18 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: { color: colors.text, fontSize: 25, fontWeight: "900" },
  subtitle: { color: colors.mutedText, fontWeight: "600", lineHeight: 20 },
  readAllButton: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
  },
  readAllText: { color: colors.text, fontWeight: "800" },
  centerState: { minHeight: 180, alignItems: "center", justifyContent: "center", gap: 9 },
  errorText: { color: colors.danger, fontWeight: "700", textAlign: "center" },
  retryText: { color: colors.primary, fontWeight: "900" },
  list: { gap: 8 },
  item: {
    minHeight: 96,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  unreadItem: { borderColor: colors.primary },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary },
  readDot: { backgroundColor: colors.cardBorder },
  itemCopy: { flex: 1, minWidth: 0, gap: 4 },
  itemTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  itemBody: { color: colors.mutedText, fontWeight: "600", lineHeight: 19 },
  itemDate: { color: colors.mutedText, fontSize: 11, fontWeight: "700" },
  moreButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  moreText: { color: colors.primary, fontWeight: "900" },
});
