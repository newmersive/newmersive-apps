import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ArrowRight, CalendarDays, ClipboardList, ListChecks, MapPin, MessageCircle } from "lucide-react-native";
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
import type { AppLocale } from "../../i18n";
import { shoppingProposalLifecycle } from "../../utils/shoppingProposalLifecycle";
import { shoppingProposalCopy } from "../../utils/shoppingProposalCopy";
import { captureAuthSession } from "../../store/authSessionBridge";
import DiscoveryFilters from "../../components/DiscoveryFilters";
import { captureAnalyticsGuard, createDiscoveryAnalyticsState, recordAppliedFilters, recordDiscoveryResults } from "../../analytics/purchaseAnalytics";
import VirtualizedResults from "../../components/VirtualizedResults";
import DemandFilterFields from "../../components/DemandFilterFields";
import { discoveryPageUrl, discoveryQueryKey, useDiscoveryQuery } from "../../utils/discoveryFilters";
import { discoveryFilterCopy } from "../../i18n/discoveryFilterCopy";
import { demandFilterSummary } from "../../i18n/demandFilterCopy";
import { createDiscoveryReadGuard, discoveryPageCursor, mergeDiscoveryPage, MARKET_REQUEST_FILTERS, MARKET_LIST_FILTERS, type DiscoveryPageInfo } from "../../utils/marketDiscovery";

type PageInfo = DiscoveryPageInfo;
type MarketRow = { kind: "list"; id: string; value: AllwainShoppingList } | { kind: "request"; id: string; value: AllwainMarketRequest } | { kind: "lists-header" | "requests-header" | "lists-more" | "requests-more"; id: string };

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

function requestResponseLabel(item: AllwainMarketRequest, sellerEnabled: boolean, locale: AppLocale, t: Translate) {
  if (!sellerEnabled) return t("market.activateSeller");
  if (item.myOffer) {
    const c = shoppingProposalCopy(locale);
    if (item.myOffer.allwainStatus === "selected" || item.selectedOfferId === item.myOffer.id) return c.orders;
    if (["withdrawn", "closed", "not_selected"].includes(item.myOffer.allwainStatus || "")) return c.viewHistory;
    return t("market.editProposal");
  }
  return t("market.prepareOffer");
}

export default function MarketRequestsScreen() {
  const { locale, t } = useAppTranslation();
  const filterCopy = discoveryFilterCopy[locale];
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const sellerEnabled = useAuthStore(
    (state) => state.user?.participation?.seller?.enabled === true,
  );
  const userId = useAuthStore((state) => state.user?.id);
  const appMode = useAuthStore((state) => state.appMode);
  const setAppMode = useAuthStore((state) => state.setAppMode);
  const { query, setQuery, ready } = useDiscoveryQuery(userId || "", "market-requests");
  const appliedKey = discoveryQueryKey(query);
  const scope = `${userId || ""}:${appMode}`;
  const session = captureAuthSession();
  const actorSession = useMemo(() => session, [session.owner, session.generation]);
  const guard = useRef(createDiscoveryReadGuard(scope)).current;
  guard.apply(scope, appliedKey);
  const mounted = useRef(true);
  const pageFlights = useRef(new Set<string>());
  const failedPages = useRef<{ requests?: string | null; lists?: string | null }>({});
  const analyticsState = useRef(createDiscoveryAnalyticsState()).current;
  const [items, setItems] = useState<AllwainMarketRequest[]>([]);
  const [shoppingLists, setShoppingLists] = useState<AllwainShoppingList[]>([]);
  const [page, setPage] = useState<PageInfo>({});
  const [shoppingPage, setShoppingPage] = useState<PageInfo>({});
  const [requestLoading, setRequestLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [requestMoreBusy, setRequestMoreBusy] = useState(false);
  const [listMoreBusy, setListMoreBusy] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const loading = requestLoading || listLoading || !ready;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; guard.invalidate(); }; }, [guard]);
  useLayoutEffect(() => {
    guard.invalidate();
    pageFlights.current.clear();
    failedPages.current = {};
    setItems([]); setShoppingLists([]); setPage({}); setShoppingPage({});
    setRequestError(null); setListError(null);
    setRequestLoading(false); setListLoading(false); setRequestMoreBusy(false); setListMoreBusy(false);
  }, [scope, appliedKey, actorSession, guard]);

  const loadStream = useCallback(async (stream: "requests" | "lists", cursor?: string | null) => {
    if (!ready || !userId || !actorSession.isCurrent()) return;
    const append = Boolean(cursor);
    const flightKey = `${scope}:${appliedKey}:${stream}`;
    if (append && pageFlights.current.has(flightKey)) return;
    pageFlights.current.add(flightKey);
    const ticket = guard.start(stream);
    const current = () => mounted.current && actorSession.isCurrent() && useAuthStore.getState().user?.id === userId && useAuthStore.getState().appMode === appMode && guard.isCurrent(ticket);
    const analyticsCurrent = captureAnalyticsGuard(current);
    const setLoading = stream === "requests" ? setRequestLoading : setListLoading;
    const setMoreBusy = stream === "requests" ? setRequestMoreBusy : setListMoreBusy;
    const setError = stream === "requests" ? setRequestError : setListError;
    if (append) setMoreBusy(true); else setLoading(true);
    setError(null);
    try {
      if (stream === "requests") {
        const result = await apiAuthGet<{ items: AllwainMarketRequest[]; pageInfo?: PageInfo }>(discoveryPageUrl("/allwain/market/requests", query, { limit: 30, cursor: cursor || undefined, allowed: MARKET_REQUEST_FILTERS }));
        if (!current()) return;
        setItems(previous => append ? mergeDiscoveryPage(previous, result.items || []) : result.items || []);
        setPage({ ...result.pageInfo, queryKey: appliedKey });
        if (Array.isArray(result.items)) void recordDiscoveryResults({state:analyticsState,scope:`${scope}:${actorSession.generation}`,queryKey:appliedKey,query,surface:"market_requests",appMode,current:analyticsCurrent,stream:"requests",expectedStreams:["requests","lists"],resultCount:result.items.length,append,allowed:MARKET_REQUEST_FILTERS});
      } else {
        const result = await apiAuthGet<{ items: AllwainShoppingList[]; pageInfo?: PageInfo }>(discoveryPageUrl("/allwain/shopping-lists/market", query, { limit: 25, cursor: cursor || undefined, allowed: MARKET_LIST_FILTERS }));
        if (!current()) return;
        setShoppingLists(previous => append ? mergeDiscoveryPage(previous, result.items || []) : result.items || []);
        setShoppingPage({ ...result.pageInfo, queryKey: appliedKey });
        if (Array.isArray(result.items)) void recordDiscoveryResults({state:analyticsState,scope:`${scope}:${actorSession.generation}`,queryKey:appliedKey,query,surface:"market_requests",appMode,current:analyticsCurrent,stream:"lists",expectedStreams:["requests","lists"],resultCount:result.items.length,append,allowed:MARKET_LIST_FILTERS});
      }
    } catch (loadError: any) {
      if (current()) { failedPages.current[stream] = cursor || null; setError(loadError?.message || t(append ? "market.loadMoreError" : "market.loadError")); }
    } finally {
      if (current()) { pageFlights.current.delete(flightKey); setLoading(false); setMoreBusy(false); }
    }
  }, [ready, userId, appMode, actorSession, scope, appliedKey, query, guard, t]);

  useEffect(() => {
    void loadStream("requests");
    void loadStream("lists");
  }, [loadStream]);

  async function loadMore() {
    const cursor = discoveryPageCursor(page, appliedKey);
    if (cursor && !requestLoading) await loadStream("requests", cursor);
  }

  async function loadMoreShoppingLists() {
    const cursor = discoveryPageCursor(shoppingPage, appliedKey);
    if (cursor && !listLoading) await loadStream("lists", cursor);
  }

  async function operate(item: AllwainMarketRequest) {
    if (!actorSession.isCurrent() || useAuthStore.getState().user?.id !== userId) return;
    if (!sellerEnabled) {
      navigation.navigate("ActivateSeller", { requestId: item.id });
      return;
    }
    await setAppMode("sell");
    if (!actorSession.isCurrent() || useAuthStore.getState().user?.id !== userId || useAuthStore.getState().appMode !== "sell") return;
    navigation.navigate("MainTabs", {
      screen: "Ofertas",
      params: { requestId: item.id },
    });
  }

  async function operateShoppingList(item: AllwainShoppingList) {
    if (!actorSession.isCurrent() || useAuthStore.getState().user?.id !== userId) return;
    if (!sellerEnabled) {
      navigation.navigate("ActivateSeller", { shoppingListId: item.id });
      return;
    }
    await setAppMode("sell");
    if (!actorSession.isCurrent() || useAuthStore.getState().user?.id !== userId || useAuthStore.getState().appMode !== "sell") return;
    navigation.navigate("ShoppingLists", {
      shoppingListId: item.id,
      mode: "sell",
    });
  }

  function renderShoppingList(list: AllwainShoppingList) {
        const firstItem = list.items[0];
        const firstImage = firstItem?.imageMeta;
        const proposalState = shoppingProposalLifecycle(list, list.myProposal);
        const proposalCopy = shoppingProposalCopy(locale);
        return (
        <View testID="market-list-card" style={styles.card}>
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
              {proposalState.retired ? proposalCopy.withdrawn : list.myProposal ? t("market.sentProposal") : t("market.offerScope")}
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
                  {sellerEnabled ? (proposalState.selected ? proposalCopy.orders : proposalState.retired ? proposalCopy.viewHistory : list.myProposal ? t("market.editProposal") : t("market.setPrice")) : t("market.activateSeller")}
                </Text>
                <ArrowRight size={17} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
        );
  }
  function renderRequest(item: AllwainMarketRequest) { return (
        <View testID="market-request-card" style={styles.card}>
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
                  {requestResponseLabel(item, sellerEnabled, locale, t)}
                </Text>
                <ArrowRight size={17} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
  ); }
  const rows = useMemo<MarketRow[]>(() => [
    ...(shoppingLists.length ? [{ kind: "lists-header" as const, id: "lists-header" }, ...shoppingLists.map(value => ({ kind: "list" as const, id: `list:${value.id}`, value }))] : []),
    ...(shoppingPage.hasNextPage ? [{ kind: "lists-more" as const, id: "lists-more" }] : []),
    ...(items.length ? [{ kind: "requests-header" as const, id: "requests-header" }, ...items.map(value => ({ kind: "request" as const, id: `request:${value.id}`, value }))] : []),
    ...(page.hasNextPage ? [{ kind: "requests-more" as const, id: "requests-more" }] : []),
  ], [shoppingLists, items, shoppingPage.hasNextPage, page.hasNextPage]);
  function renderRow(row: MarketRow) {
    if (row.kind === "list") return renderShoppingList(row.value);
    if (row.kind === "request") return renderRequest(row.value);
    if (row.kind === "lists-header" || row.kind === "requests-header") return <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{t(row.kind === "lists-header" ? "market.shoppingLists" : "market.individualRequests")}</Text><Text style={styles.sectionCount}>{row.kind === "lists-header" ? shoppingLists.length : items.length}</Text></View>;
    if (row.kind === "lists-more") return <TouchableOpacity style={styles.more} onPress={() => void loadMoreShoppingLists()} disabled={listMoreBusy || listLoading}>{listMoreBusy ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.moreText}>{t("market.moreLists")}</Text>}</TouchableOpacity>;
    return <TouchableOpacity style={styles.more} onPress={() => void loadMore()} disabled={requestMoreBusy || requestLoading}>{requestMoreBusy ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.moreText}>{t("market.showMore")}</Text>}</TouchableOpacity>;
  }
  return (
    <VirtualizedResults
      testID="market-results"
      restoreKey={`${scope}:market:${appliedKey}`}
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={rows}
      keyExtractor={row => row.id}
      renderItem={({ item }) => renderRow(item)}
      ListHeaderComponent={<View style={styles.overviewHeader}>
      <Text style={styles.eyebrow}>{t("market.eyebrow")}</Text>
      <Text style={styles.title}>{t("market.title")}</Text>
      <Text style={styles.subtitle}>
        {t("market.subtitle")}
      </Text>

      <DiscoveryFilters value={query} onApply={next => { const current = captureAnalyticsGuard(() => mounted.current && actorSession.isCurrent() && useAuthStore.getState().user?.id === userId && useAuthStore.getState().appMode === appMode); void recordAppliedFilters({state:analyticsState,scope:`${scope}:${actorSession.generation}`,queryKey:discoveryQueryKey(next),query:next,surface:"market_requests",appMode,current,allowed:MARKET_REQUEST_FILTERS},appliedKey); setQuery(next); }} kind="requests" allowed={MARKET_REQUEST_FILTERS} disabled={!ready} extra={(draft, setDraft) => <DemandFilterFields value={draft} onChange={setDraft} />} extraSummary={value => demandFilterSummary(locale, value)} />

      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateText}>{t("market.loading")}</Text>
        </View>
      ) : null}
      {!loading && !requestError && !listError && items.length === 0 && shoppingLists.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={25} color={colors.primary} />}
          title={t("market.emptyTitle")}
          body={t("market.emptyBody")}
          demo={{
            title: query.q.trim()
              ? t("market.demoQuery", { query: query.q.trim() })
              : t("market.demoTitle"),
            meta: t("market.demoMeta"),
            detail: t("market.demoDetail"),
            leading: <ClipboardList size={20} color={colors.primary} />,
          }}
        />
      ) : null}

      {listError ? (
        <View style={styles.failure}>
          <Text style={styles.sectionTitle}>{t("market.shoppingLists")}</Text>
          <Text style={styles.error}>{listError}</Text>
          <TouchableOpacity style={styles.more} disabled={listLoading || listMoreBusy} onPress={() => void loadStream("lists", failedPages.current.lists)} accessibilityRole="button">
            <Text style={styles.moreText}>{filterCopy.retry}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {requestError ? (
        <View style={styles.failure}>
          <Text style={styles.sectionTitle}>{t("market.individualRequests")}</Text>
          <Text style={styles.error}>{requestError}</Text>
          <TouchableOpacity style={styles.more} disabled={requestLoading || requestMoreBusy} onPress={() => void loadStream("requests", failedPages.current.requests)} accessibilityRole="button">
            <Text style={styles.moreText}>{filterCopy.retry}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      </View>}
    />
  );
}

const styles = StyleSheet.create({
  overviewHeader: { gap: 11 },
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
  failure: { gap: 8, padding: 12, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, backgroundColor: colors.card },
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
