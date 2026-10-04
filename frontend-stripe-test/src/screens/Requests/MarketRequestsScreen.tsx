import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ArrowRight, CalendarDays, ClipboardList, ListChecks, MapPin, MessageCircle, Search } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import {
  apiAuthGet,
  type AllwainMarketRequest,
  type AllwainShoppingList,
} from "../../config/api";
import type { RootStackParamList } from "../../navigation/types";
import { EmptyState, PublicationImage } from "../../components/design-system";
import { useAuthStore } from "../../store/auth.store";
import { colors } from "../../theme/colors";
import { formatCurrency } from "../../utils/format";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import type { TranslationKey } from "../../i18n";

type PageInfo = { hasNextPage?: boolean; nextCursor?: string | null };

type Translate = (
  key: TranslationKey,
  replacements?: Record<string, string | number>,
) => string;

function requestQuantity(item: AllwainMarketRequest, t: Translate) {
  if (!item.extracted.quantity) return t("market.quantityPending");
  return `${item.extracted.quantity} ${item.extracted.unit || t("market.units")}`;
}

function recurrenceLabel(
  recurrence: AllwainShoppingList["recurrence"],
  t: Translate,
) {
  if (!recurrence?.enabled) return t("market.singlePurchase");
  if (recurrence.interval === "weekly") return t("market.recurrence.weekly");
  if (recurrence.interval === "biweekly") return t("market.recurrence.biweekly");
  return t("market.recurrence.monthly");
}

export default function MarketRequestsScreen() {
  const { t } = useAppTranslation();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const sellerEnabled = useAuthStore(
    (state) => state.user?.participation?.seller?.enabled === true,
  );
  const userId = useAuthStore((state) => state.user?.id);
  const setAppMode = useAuthStore((state) => state.setAppMode);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<AllwainMarketRequest[]>([]);
  const [shoppingLists, setShoppingLists] = useState<AllwainShoppingList[]>([]);
  const [page, setPage] = useState<PageInfo>({});
  const [shoppingPage, setShoppingPage] = useState<PageInfo>({});
  const [loading, setLoading] = useState(true);
  const [moreBusy, setMoreBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (search = "") => {
    setLoading(true);
    setError(null);
    try {
      const suffix = search.trim() ? `&q=${encodeURIComponent(search.trim())}` : "";
      const [requestsResult, listsResult] = await Promise.allSettled([
        apiAuthGet<{ items: AllwainMarketRequest[]; pageInfo?: PageInfo }>(
          `/allwain/market/requests?limit=30${suffix}`,
        ),
        apiAuthGet<{ items: AllwainShoppingList[]; pageInfo?: PageInfo }>(
          `/allwain/shopping-lists/market?limit=25${suffix}`,
        ),
      ]);
      if (requestsResult.status === "fulfilled") {
        setItems(requestsResult.value.items || []);
        setPage(requestsResult.value.pageInfo || {});
      } else {
        setItems([]);
        setPage({});
      }
      if (listsResult.status === "fulfilled") {
        setShoppingLists(listsResult.value.items || []);
        setShoppingPage(listsResult.value.pageInfo || {});
      } else {
        setShoppingLists([]);
        setShoppingPage({});
      }
      if (requestsResult.status === "rejected" && listsResult.status === "rejected") {
        throw requestsResult.reason;
      }
      if (requestsResult.status === "rejected" || listsResult.status === "rejected") {
        setError(t("market.partialLoadError"));
      }
    } catch (loadError: any) {
      setError(loadError?.message || t("market.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore() {
    if (!page.nextCursor) return;
    setMoreBusy(true);
    try {
      const response = await apiAuthGet<{
        items: AllwainMarketRequest[];
        pageInfo?: PageInfo;
      }>(`/allwain/market/requests?limit=30&cursor=${encodeURIComponent(page.nextCursor)}${query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ""}`);
      const merged = new Map(items.map((item) => [item.id, item]));
      (response.items || []).forEach((item) => merged.set(item.id, item));
      setItems(Array.from(merged.values()));
      setPage(response.pageInfo || {});
    } catch (loadError: any) {
      setError(loadError?.message || t("market.loadMoreError"));
    } finally {
      setMoreBusy(false);
    }
  }

  async function loadMoreShoppingLists() {
    if (!shoppingPage.nextCursor) return;
    setMoreBusy(true);
    try {
      const response = await apiAuthGet<{
        items: AllwainShoppingList[];
        pageInfo?: PageInfo;
      }>(`/allwain/shopping-lists/market?limit=25&cursor=${encodeURIComponent(shoppingPage.nextCursor)}${query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ""}`);
      const merged = new Map(shoppingLists.map((item) => [item.id, item]));
      (response.items || []).forEach((item) => merged.set(item.id, item));
      setShoppingLists(Array.from(merged.values()));
      setShoppingPage(response.pageInfo || {});
    } catch (loadError: any) {
      setError(loadError?.message || t("market.loadMoreListsError"));
    } finally {
      setMoreBusy(false);
    }
  }

  async function operate(item: AllwainMarketRequest) {
    if (!sellerEnabled) {
      navigation.navigate("ActivateSeller", { requestId: item.id });
      return;
    }
    await setAppMode("sell");
    navigation.navigate("MainTabs", {
      screen: "Ofertas",
      params: { requestId: item.id },
    });
  }

  async function operateShoppingList(item: AllwainShoppingList) {
    if (!sellerEnabled) {
      navigation.navigate("ActivateSeller", { shoppingListId: item.id });
      return;
    }
    await setAppMode("sell");
    navigation.navigate("ShoppingLists", {
      shoppingListId: item.id,
      mode: "sell",
    });
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.eyebrow}>{t("market.eyebrow")}</Text>
      <Text style={styles.title}>{t("market.title")}</Text>
      <Text style={styles.subtitle}>
        {t("market.subtitle")}
      </Text>

      <View style={styles.searchRow}>
        <Search size={19} color={colors.mutedText} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={t("market.searchPlaceholder")}
          placeholderTextColor={colors.mutedText}
          returnKeyType="search"
          onSubmitEditing={() => void load(query)}
        />
        <TouchableOpacity style={styles.searchButton} onPress={() => void load(query)}>
          <ArrowRight size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateText}>{t("market.loading")}</Text>
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!loading && !error && items.length === 0 && shoppingLists.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={25} color={colors.primary} />}
          title={t("market.emptyTitle")}
          body={t("market.emptyBody")}
          demo={{
            title: query.trim()
              ? t("market.demoQuery", { query: query.trim() })
              : t("market.demoTitle"),
            meta: t("market.demoMeta"),
            detail: t("market.demoDetail"),
            leading: <ClipboardList size={20} color={colors.primary} />,
          }}
        />
      ) : null}

      {shoppingLists.length ? (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t("market.shoppingLists")}</Text>
          <Text style={styles.sectionCount}>{shoppingLists.length}</Text>
        </View>
      ) : null}
      {shoppingLists.map((list) => {
        const firstItem = list.items[0];
        const firstImage = firstItem?.imageMeta;
        return (
        <View key={list.id} style={styles.card}>
          <View style={styles.cardHeader}>
            {firstImage?.url ? (
              <View style={styles.publicationImageFrame}>
                <PublicationImage
                  imageUrl={firstImage.url}
                  imageAlt={firstImage.alt || firstItem?.productName || list.title}
                  illustrative={firstImage.illustrative === true}
                />
              </View>
            ) : (
              <View style={styles.listLeading}>
                <ListChecks size={20} color={colors.primary} />
              </View>
            )}
            <View style={styles.cardCopy}>
              <Text style={styles.cardTitle} numberOfLines={2}>{list.title}</Text>
              <Text style={styles.buyer}>
                {t("market.requestedBy", { name: list.buyer.name })}{list.demo ? ` · ${t("market.demoSuffix")}` : ""}
              </Text>
            </View>
            <View style={styles.status}>
              <Text style={styles.statusText}>
                {t("market.remaining", { count: list.remainingItemCount ?? list.items.length })}
              </Text>
            </View>
          </View>
          <Text style={styles.description} numberOfLines={3}>
            {list.items.slice(0, 4).map((item) => `${item.quantity} ${item.unit} ${item.productName}`).join(" · ")}
            {list.items.length > 4 ? ` · ${t("market.andMore", { count: list.items.length - 4 })}` : ""}
          </Text>
          <View style={styles.inline}>
            <CalendarDays size={15} color={colors.mutedText} />
            <Text style={styles.inlineText}>
              {recurrenceLabel(list.recurrence, t)} · {list.proposalCount === 1 ? t("market.proposalOne") : t("market.proposalMany", { count: list.proposalCount })}
            </Text>
          </View>
          {list.locationLabel ? (
            <View style={styles.inline}>
              <MapPin size={15} color={colors.mutedText} />
              <Text style={styles.inlineText}>{list.locationLabel}</Text>
            </View>
          ) : null}
          <View style={styles.footer}>
            <Text style={styles.offersCount}>
              {list.myProposal ? t("market.sentProposal") : t("market.offerScope")}
            </Text>
            <View style={styles.cardActions}>
              {list.buyer.id !== userId ? (
                <TouchableOpacity
                  style={styles.messageAction}
                  onPress={() => navigation.navigate("ChatThread", {
                    targetUserId: list.buyer.id,
                    targetName: list.buyer.name,
                    title: list.title,
                  })}
                >
                  <MessageCircle size={17} color={colors.primary} />
                  <Text style={styles.messageActionText}>{t("market.privateMessage")}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.action} onPress={() => void operateShoppingList(list)}>
                <Text style={styles.actionText}>
                  {sellerEnabled ? (list.myProposal ? t("market.editProposal") : t("market.setPrice")) : t("market.activateSeller")}
                </Text>
                <ArrowRight size={17} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
        );
      })}
      {shoppingPage.hasNextPage ? (
        <TouchableOpacity style={styles.more} onPress={() => void loadMoreShoppingLists()} disabled={moreBusy}>
          {moreBusy ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.moreText}>{t("market.moreLists")}</Text>}
        </TouchableOpacity>
      ) : null}

      {items.length ? (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t("market.individualRequests")}</Text>
          <Text style={styles.sectionCount}>{items.length}</Text>
        </View>
      ) : null}

      {items.map((item) => (
        <View key={item.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.publicationImageFrame}>
              <PublicationImage
                imageUrl={item.imageMeta?.url}
                imageAlt={item.imageMeta?.alt || item.title}
                illustrative={item.imageMeta?.illustrative === true}
              />
            </View>
            <View style={styles.cardCopy}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.extracted.productName || item.title}
              </Text>
              <Text style={styles.buyer}>{t("market.requestedBy", { name: item.requester.name })}</Text>
            </View>
            <View style={styles.status}>
              <Text style={styles.statusText}>{t("market.open")}</Text>
            </View>
          </View>
          <View style={styles.facts}>
            <Text style={styles.fact}>{requestQuantity(item, t)}</Text>
            {item.extracted.targetPrice ? (
              <Text style={styles.fact}>
                {t("market.upTo", { amount: formatCurrency(item.extracted.targetPrice, item.extracted.currency || "EUR") })}
              </Text>
            ) : null}
          </View>
          {item.extracted.locationLabel ? (
            <View style={styles.inline}>
              <MapPin size={15} color={colors.mutedText} />
              <Text style={styles.inlineText}>{item.extracted.locationLabel}</Text>
            </View>
          ) : null}
          {item.extracted.deliveryWindow ? (
            <View style={styles.inline}>
              <CalendarDays size={15} color={colors.mutedText} />
              <Text style={styles.inlineText}>{item.extracted.deliveryWindow}</Text>
            </View>
          ) : null}
          {item.description ? (
            <Text style={styles.description} numberOfLines={3}>{item.description}</Text>
          ) : null}
          <View style={styles.footer}>
            <Text style={styles.offersCount}>
              {item.offerCount === 1 ? t("market.proposalOne") : t("market.proposalMany", { count: item.offerCount })}
            </Text>
            <View style={styles.cardActions}>
              {item.requester.id !== userId ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t("market.privateMessageTo", { name: item.requester.name })}
                  style={styles.messageAction}
                  onPress={() =>
                    navigation.navigate("ChatThread", {
                      targetUserId: item.requester.id,
                      targetName: item.requester.name,
                      title: t("market.privateMessage"),
                    })
                  }
                >
                  <MessageCircle size={17} color={colors.primary} />
                  <Text style={styles.messageActionText}>{t("market.privateMessage")}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.action} onPress={() => void operate(item)}>
                <Text style={styles.actionText}>
                  {sellerEnabled ? t("market.prepareOffer") : t("market.activateSeller")}
                </Text>
                <ArrowRight size={17} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ))}

      {page.hasNextPage ? (
        <TouchableOpacity style={styles.more} onPress={() => void loadMore()} disabled={moreBusy}>
          {moreBusy ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.moreText}>{t("market.showMore")}</Text>}
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 720, alignSelf: "center", padding: 16, paddingBottom: 40, gap: 11 },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: "900" },
  title: { color: colors.text, fontSize: 27, lineHeight: 33, fontWeight: "900" },
  subtitle: { color: colors.mutedText, fontSize: 14, lineHeight: 20, fontWeight: "600", marginBottom: 4 },
  searchRow: { minHeight: 52, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, backgroundColor: colors.card, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 12 },
  searchInput: { flex: 1, minWidth: 0, color: colors.text, fontSize: 15, paddingVertical: 10 },
  searchButton: { width: 44, height: 44, marginRight: 3, borderRadius: 7, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  state: { minHeight: 90, alignItems: "center", justifyContent: "center", gap: 8 },
  stateText: { color: colors.mutedText, fontSize: 13, lineHeight: 18, fontWeight: "600", textAlign: "center" },
  error: { color: colors.danger, fontWeight: "700", lineHeight: 19 },
  card: { borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, padding: 14, backgroundColor: colors.card, gap: 10 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  cardCopy: { flex: 1, minWidth: 0, gap: 3 },
  cardTitle: { color: colors.text, fontSize: 18, lineHeight: 23, fontWeight: "900" },
  buyer: { color: colors.mutedText, fontSize: 12, fontWeight: "700" },
  status: { borderWidth: 1, borderColor: colors.primary, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 4 },
  statusText: { color: colors.primary, fontSize: 9, fontWeight: "900" },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  fact: { color: colors.text, fontSize: 12, fontWeight: "800", backgroundColor: colors.highlight, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 5 },
  inline: { flexDirection: "row", alignItems: "center", gap: 6 },
  inlineText: { color: colors.mutedText, fontSize: 12, fontWeight: "700", flex: 1 },
  description: { color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: "600" },
  sectionHeader: { marginTop: 7, flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { flex: 1, color: colors.text, fontSize: 18, fontWeight: "900" },
  sectionCount: { minWidth: 28, height: 28, borderRadius: 14, backgroundColor: colors.highlight, color: colors.primary, textAlign: "center", textAlignVertical: "center", lineHeight: 28, fontSize: 11, fontWeight: "900" },
  listLeading: { width: 40, height: 40, borderRadius: 7, backgroundColor: colors.highlight, alignItems: "center", justifyContent: "center" },
  publicationImageFrame: { width: 84, height: 68, borderRadius: 6, overflow: "hidden" },
  footer: { minHeight: 46, borderTopWidth: 1, borderTopColor: colors.cardBorder, paddingTop: 10, gap: 8 },
  offersCount: { color: colors.mutedText, fontSize: 11, fontWeight: "700" },
  cardActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: 8 },
  messageAction: { minHeight: 42, borderRadius: 7, borderWidth: 1, borderColor: "#FFC8BA", backgroundColor: colors.highlight, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  messageActionText: { color: colors.primary, fontWeight: "900", fontSize: 12 },
  action: { minHeight: 42, borderRadius: 7, backgroundColor: colors.primary, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  actionText: { color: "#FFFFFF", fontWeight: "900", fontSize: 12 },
  more: { minHeight: 48, borderWidth: 1, borderColor: colors.primary, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  moreText: { color: colors.primary, fontWeight: "900" },
});
