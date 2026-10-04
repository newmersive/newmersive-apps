import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  apiAuthGet,
  apiAuthPost,
  AllwainContract,
  AllwainCheckoutResponse,
  type AllwainCardImageMeta,
  AllwainOffer,
} from "../../config/api";
import { colors } from "../../theme/colors";
import type { OfferDeliveryDraft } from "../../components/OfferOrderForm";
import OfferPurchaseWizard from "../../components/OfferPurchaseWizard";
import {
  EmptyState,
  BigActionButton,
  OfferCard,
  PersonCard,
  PublicationImage,
  ProductCard,
} from "../../components/design-system";
import {
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Store,
  X,
} from "lucide-react-native";
import { useAuthStore } from "../../store/auth.store";
import type { RootStackParamList } from "../../navigation/types";
import { formatCurrency } from "../../utils/format";
import { openExternalUrl } from "../../utils/openExternalUrl";
import { trackAnalyticsEvent } from "../../analytics";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { allwainWebAppReturnUrl } from "../../utils/webAppUrl";
import DiscoveryFilters, { CATALOG_DISCOVERY_FIELDS } from "../../components/DiscoveryFilters";
import { captureAnalyticsGuard, createDiscoveryAnalyticsState, recordAppliedFilters, recordDiscoveryResults } from "../../analytics/purchaseAnalytics";
import { discoveryPageUrl, discoveryQueryKey, useDiscoveryQuery } from "../../utils/discoveryFilters";
import { discoveryFilterCopy } from "../../i18n/discoveryFilterCopy";
import { captureAuthSession } from "../../store/authSessionBridge";

function analyticsDeliveryMethod(value?: string | null) {
  if (
    value === "local_connector" ||
    value === "carrier" ||
    value === "pickup" ||
    value === "seller"
  ) {
    return value;
  }
  return "other" as const;
}

function analyticsCheckoutValue(contract: AllwainContract) {
  const explicit = Number(contract.totalPrice);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  return [
    contract.subtotalAmount,
    contract.shippingAmount,
    contract.carrierDeliveryAmount,
  ].reduce<number>((total, value) => {
    const amount = Number(value);
    return total + (Number.isFinite(amount) ? amount : 0);
  }, 0);
}

type DiscoveryRequest = {
  id: string;
  title: string;
  description?: string | null;
  locationLabel?: string | null;
  unit?: string | null;
  currency?: string | null;
  extracted?: { quantity?: number | null; targetPrice?: number | null };
  requester?: { id: string; name: string };
  imageMeta?: AllwainCardImageMeta | null;
};

type DiscoverySeller = {
  id: string;
  name: string;
  sellerType?: string | null;
  locationLabel?: string | null;
  score: number;
  reviewCount: number;
};

type DiscoveryProduct = {
  id: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  imageIllustrative?: boolean;
  imageAlt?: string | null;
};

type DiscoveryResponse = {
  query: string;
  requests: DiscoveryRequest[];
  sellers: DiscoverySeller[];
  products: DiscoveryProduct[];
};

export default function SearchScreen() {
  const { locale, t } = useAppTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const userId = useAuthStore((state) => state.user?.id);
  const sellerEnabled = useAuthStore(
    (state) => state.user?.participation?.seller?.enabled,
  );
  const setAppMode = useAuthStore((state) => state.setAppMode);
  const appMode = useAuthStore(state => state.appMode);
  const { query: appliedQuery, setQuery: setAppliedQuery, ready } = useDiscoveryQuery(userId, "catalog");
  const query = appliedQuery.q;
  const setQuery = (q: string) => setAppliedQuery({ ...appliedQuery, q });
  const filterCopy = discoveryFilterCopy[locale];
  const searchInput = useRef<TextInput>(null);
  const [offers, setOffers] = useState<AllwainOffer[]>([]);
  const [contracts, setContracts] = useState<AllwainContract[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<AllwainOffer | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryResponse | null>(null);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const category = appliedQuery.category, unit = appliedQuery.unit;
  const [resultsKey, setResultsKey] = useState("");
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [discoveryKey, setDiscoveryKey] = useState("");
  const failedCursor = useRef<string | undefined>(undefined);
  const focused = useRef(false);
  // Invalidate responses as soon as the query changes, including its debounce.
  const searchRevision = useRef(0);
  const searchKey = `${userId || ""}:${appMode}:${discoveryQueryKey(appliedQuery)}`;
  const currentSearchKey = useRef(searchKey);
  currentSearchKey.current = searchKey;
  const pageInFlight = useRef<string | null>(null);
  const analyticsState = useRef(createDiscoveryAnalyticsState()).current;
  const supplementaryDiscovery = query.trim().length >= 2 && !CATALOG_DISCOVERY_FIELDS.some(field => field !== "q" && field !== "sort" && Boolean((appliedQuery as any)[field])) && appliedQuery.sort === "newest";

  const loadOffers = useCallback(async (_search?: string, cursor?: string) => {
    const key = searchKey;
    if (!ready || !focused.current || key !== currentSearchKey.current) return;
    if (cursor && pageInFlight.current === `${key}:${cursor}`) return;
    const revision = cursor ? searchRevision.current : ++searchRevision.current;
    const session = captureAuthSession();
    const current = () => focused.current && session.isCurrent() && key === currentSearchKey.current && revision === searchRevision.current;
    const analyticsCurrent = captureAnalyticsGuard(current);
    const pageKey = `${key}:${cursor || ""}`;
    pageInFlight.current = pageKey;
    if (cursor) setLoadingMore(true);
    else { setLoading(true); setOffers([]); setResultsKey(""); setHasNextPage(false); setNextCursor(null); }
    setCatalogError(null); failedCursor.current = undefined;
    try {
      const response = await apiAuthGet<{
        items: AllwainOffer[];
        pageInfo?: { hasNextPage?: boolean; nextCursor?: string | null };
      }>(discoveryPageUrl("/allwain/offers", appliedQuery, { fixed: { scope: "market" }, cursor, allowed: CATALOG_DISCOVERY_FIELDS }));
      if (!current()) return;
      setOffers((current) => {
        if (!cursor) return response.items || [];
        const byId = new Map(current.map((item) => [item.id, item]));
        for (const item of response.items || []) byId.set(item.id, item);
        return [...byId.values()];
      });
      setResultsKey(key);
      setHasNextPage(response.pageInfo?.hasNextPage === true);
      setNextCursor(response.pageInfo?.nextCursor || null);
      if (Array.isArray(response.items)) void recordDiscoveryResults({state:analyticsState,scope:`${userId || ""}:${appMode}:${session.generation}`,queryKey:key,query:appliedQuery,surface:"search",appMode,current:analyticsCurrent,stream:"catalog",expectedStreams:supplementaryDiscovery ? ["catalog","discovery"] : ["catalog"],resultCount:response.items.filter(item => item.ownerUserId !== userId && item.provider?.id !== userId).length,append:Boolean(cursor),allowed:CATALOG_DISCOVERY_FIELDS});
    } catch (err: any) {
      if (!current()) return;
      if (/CURSOR/i.test(String(err?.code || err?.message || ""))) { setOffers([]); setResultsKey(""); setHasNextPage(false); setNextCursor(null); failedCursor.current = undefined; }
      else failedCursor.current = cursor;
      setCatalogError(filterCopy.error);
    } finally {
      if (pageInFlight.current === pageKey) pageInFlight.current = null;
      if (current()) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [searchKey, ready, filterCopy.error]);

  useEffect(() => {
    const session = captureAuthSession(); let active = true;
    void apiAuthGet<{ items: AllwainContract[] }>("/allwain/contracts")
      .then((response) => { if (active && session.isCurrent()) setContracts(response.items || []); })
      .catch(() => { if (active && session.isCurrent()) setContracts([]); });
    return () => { active = false; setContracts([]); };
  }, [userId]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    setHasNextPage(false);
    setNextCursor(null);
    setLoadingMore(false);
    setDiscoveryLoading(false);
    setLoading(true);
    setSelectedOffer(null); setCatalogError(null);
    const timer = setTimeout(() => void loadOffers(query, undefined), 0);
    return () => { focused.current = false; clearTimeout(timer); searchRevision.current++; pageInFlight.current = null; };
  }, [loadOffers, query]));

  useEffect(() => {
    const clean = query.trim();
    const additionalFilters = CATALOG_DISCOVERY_FIELDS.some(field => field !== "q" && field !== "sort" && Boolean((appliedQuery as any)[field])) || appliedQuery.sort !== "newest";
    if (!ready || clean.length < 2 || additionalFilters) {
      setDiscovery(null);
      setDiscoveryLoading(false);
      return;
    }
    let active = true; const key = searchKey, session = captureAuthSession();
    const analyticsCurrent = captureAnalyticsGuard(() => active && focused.current && session.isCurrent() && currentSearchKey.current === key);
    setDiscovery(null); setDiscoveryKey("");
    const timer = setTimeout(async () => {
      setDiscoveryLoading(true);
      try {
        const result = await apiAuthGet<DiscoveryResponse>(
          `/allwain/search?q=${encodeURIComponent(clean)}&limit=6`,
        );
        if (active && focused.current && session.isCurrent() && currentSearchKey.current === key) {
          setDiscovery(result); setDiscoveryKey(key);
          if ([result.requests,result.sellers,result.products].every(Array.isArray)) void recordDiscoveryResults({state:analyticsState,scope:`${userId || ""}:${appMode}:${session.generation}`,queryKey:key,query:appliedQuery,surface:"search",appMode,current:analyticsCurrent,stream:"discovery",expectedStreams:["catalog","discovery"],resultCount:result.requests.length+result.sellers.length+result.products.length,allowed:CATALOG_DISCOVERY_FIELDS});
        }
      } catch {
        if (active && focused.current && session.isCurrent() && currentSearchKey.current === key) setDiscovery(null);
      } finally {
        if (active && focused.current && session.isCurrent() && currentSearchKey.current === key) setDiscoveryLoading(false);
      }
    }, 280);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchKey, ready]);

  const filteredResults = useMemo(() => {
    const availableOffers = resultsKey === searchKey ? offers.filter(
      (item) => item.ownerUserId !== userId && item.provider?.id !== userId,
    ) : [];
    return availableOffers;
  }, [offers, userId, resultsKey, searchKey]);

  const hasDiscovery = Boolean(
    discoveryKey === searchKey && (discovery?.requests.length ||
      discovery?.sellers.length ||
      discovery?.products.length),
  );

  async function openRequest(request: DiscoveryRequest) {
    if (!sellerEnabled) {
      navigation.navigate("ActivateSeller");
      return;
    }
    await setAppMode("sell");
    navigation.navigate("MainTabs", {
      screen: "Ofertas",
      params: { requestId: request.id },
    });
  }

  function openPrivateMessage(targetId?: string | null, targetName?: string | null) {
    if (!targetId || targetId === userId) return;
    navigation.navigate("ChatThread", {
      targetUserId: targetId,
      targetName: targetName || t("home.user"),
      title: t("chat.privateMessage"),
    });
  }

  const renderPrice = (item: AllwainOffer) => {
    if (typeof item.price === "number") {
      return formatCurrency(item.price, item.currency || "EUR", locale);
    }
    if (typeof item.tokens === "number") {
      return `${item.tokens} tokens`;
    }
    return t("offers.pricePending");
  };

  async function requestOffer(
    offer: AllwainOffer,
    quantity: number,
    delivery: OfferDeliveryDraft,
    purchaseKey: string,
  ): Promise<boolean> {
    const session = captureAuthSession();
    if (!focused.current || !session.isCurrent() || resultsKey !== currentSearchKey.current || useAuthStore.getState().user?.id !== userId) return false;
    setBusyId(offer.id);
    setError(null);
    setNotice(null);
    try {
      const contract = await apiAuthPost<AllwainContract>(
        `/allwain/offers/${offer.id}/accept`,
        { quantity, ...delivery, purchaseKey },
      );
      if (!session.isCurrent()) return false;
      if (
        !contract.id ||
        contract.offerId !== offer.id ||
        Number(contract.quantity) !== quantity ||
        contract.requesterUserId !== userId
      ) {
        throw new Error(t("search.orderNotConfirmed"));
      }
      setContracts((current) => [
        contract,
        ...current.filter((item) => item.id !== contract.id),
      ]);
      // Refresh the current filtered query; a catalog-wide response must not
      // replace a newer search after this operation.
      void loadOffers(query);
      navigation.navigate("MainTabs", {
        screen: "Ofertas",
        params: { section: "orders", contractId: contract.id, focusKey: String(Date.now()) },
      });
      return true;
    } catch (err: any) {
      if (!session.isCurrent()) return false;
      setError(err?.message || t("search.orderError"));
      return false;
    } finally {
      if (session.isCurrent()) setBusyId(null);
    }
  }

  const renderOffer = ({ item }: { item: AllwainOffer }) => {
    const previousOrders = contracts.filter(
      (candidate) =>
        candidate.offerId === item.id &&
        candidate.requesterUserId === userId &&
        candidate.status !== "rejected",
    ).length;
    const itemUnit = typeof item.meta?.unit === "string" ? item.meta.unit : t("home.buyer.unit");
    const minimum =
      typeof item.meta?.minQuantity === "number" ? item.meta.minQuantity : 1;
    const imageUrl =
      typeof item.meta?.imageUrl === "string" ? item.meta.imageUrl : null;
    return (
      <OfferCard
        title={item.title}
        meta={`${renderPrice(item)} / ${itemUnit}`}
        detail={`${item.provider?.name || t("home.buyer.seller")} · ${t("offers.minimum", { quantity: minimum, unit: itemUnit })}${previousOrders ? ` · ${previousOrders === 1 ? t("offers.previousOne") : t("offers.previousMany", { count: previousOrders })}` : ""}`}
        status={t("home.status.available")}
        statusTone="neutral"
        actionLabel={previousOrders ? t("offers.orderAgain") : t("home.buyer.chooseQuantity")}
        onPress={() => { if (resultsKey === currentSearchKey.current && focused.current && useAuthStore.getState().user?.id === userId) setSelectedOffer(item); }}
        onContact={
          item.provider?.id && item.provider.id !== userId
            ? () => openPrivateMessage(item.provider?.id, item.provider?.name)
            : undefined
        }
        leading={
          <PublicationImage
            imageUrl={imageUrl}
            imageAlt={item.meta?.imageAlt || item.title}
            illustrative={item.meta?.imageIllustrative === true || !imageUrl}
          />
        }
        leadingVariant="image"
      />
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>{t("search.eyebrow")}</Text>
      <Text style={styles.heading}>{t("search.title")}</Text>
      <DiscoveryFilters value={appliedQuery} onApply={next => { const session = captureAuthSession(); const current = captureAnalyticsGuard(() => focused.current && session.isCurrent() && useAuthStore.getState().user?.id === userId && useAuthStore.getState().appMode === appMode); void recordAppliedFilters({state:analyticsState,scope:`${userId || ""}:${appMode}:${session.generation}`,queryKey:`${userId || ""}:${appMode}:${discoveryQueryKey(next)}`,query:next,surface:"search",appMode,current,allowed:CATALOG_DISCOVERY_FIELDS},searchKey); setAppliedQuery(next); }} kind="catalog" disabled={Boolean(busyId)} />

      {loading && filteredResults.length === 0 ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateText}>{t("search.loading")}</Text>
        </View>
      ) : null}

      {catalogError ? <View style={styles.stateBox}><Text accessibilityRole="alert" style={styles.error}>{catalogError}</Text><BigActionButton tone="light" label={filterCopy.retry} onPress={() => void loadOffers(query, failedCursor.current)} /></View> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      {!loading && !discoveryLoading && !catalogError && !error && filteredResults.length === 0 && !hasDiscovery ? (
        <EmptyState
          title={t(query.trim() || category || unit ? "search.emptyTitle" : "search.startTitle")}
          body={t(query.trim() || category || unit ? "search.emptyBody" : "search.startBody")}
          actionLabel={t("search.requestIt")}
          onAction={() => navigation.navigate("ManualRequest")}
          demo={{
            title: query.trim()
              ? t("search.demoQuery", { query: query.trim() })
              : t("search.demoTitle"),
            meta: t("search.demoMeta"),
            detail: t("search.demoDetail"),
            leading: <ShoppingBag size={20} color={colors.primary} />,
          }}
        />
      ) : null}

      <FlatList
        data={filteredResults}
        keyExtractor={(item) => item.id}
        renderItem={renderOffer}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          hasDiscovery ? (
            <View style={styles.discoverySections}>
              {discovery?.sellers.length ? (
                <View style={styles.discoverySection}>
                  <Text style={styles.sectionTitle}>{t("search.sellers")}</Text>
                  {discovery.sellers.map((seller) => (
                    <PersonCard
                      key={seller.id}
                      title={seller.name}
                      meta={seller.locationLabel || seller.sellerType || t("search.sellerFallback")}
                      detail={
                        seller.reviewCount
                          ? t("search.sellerReviews", { score: seller.score.toFixed(1), count: seller.reviewCount })
                          : t("offers.noReviews")
                      }
                      actionLabel={t("search.viewSellerOffers")}
                      onPress={() => setQuery(seller.name)}
                      onContact={
                        seller.id !== userId
                          ? () => openPrivateMessage(seller.id, seller.name)
                          : undefined
                      }
                      leading={<Store size={20} color={colors.primary} />}
                    />
                  ))}
                </View>
              ) : null}

              {discovery?.products.length ? (
                <View style={styles.discoverySection}>
                  <Text style={styles.sectionTitle}>{t("search.products")}</Text>
                  {discovery.products.map((product) => (
                    <ProductCard
                      key={product.id}
                      title={product.name}
                      meta={[product.brand, product.category].filter(Boolean).join(" · ")}
                      detail={product.description || undefined}
                      actionLabel={t("search.searchOffers")}
                      onPress={() => setQuery(product.name)}
                      leading={
                        <PublicationImage
                          imageUrl={product.imageUrl}
                          imageAlt={product.imageAlt || product.name}
                          illustrative={product.imageIllustrative === true}
                        />
                      }
                      leadingVariant="image"
                    />
                  ))}
                </View>
              ) : null}

              {discovery?.requests.length ? (
                <View style={styles.discoverySection}>
                  <Text style={styles.sectionTitle}>{t("offers.activeRequests")}</Text>
                  {discovery.requests.map((request) => {
                    const quantity = request.extracted?.quantity;
                    return (
                      <ProductCard
                        key={request.id}
                        title={request.title}
                        meta={`${request.requester?.name || t("roles.buyer")}${request.locationLabel ? ` · ${request.locationLabel}` : ""}`}
                        detail={
                          quantity
                            ? `${quantity} ${request.unit || t("market.units")} · ${request.description || ""}`
                            : request.description || undefined
                        }
                        actionLabel={sellerEnabled ? t("search.respond") : t("home.seller.activate")}
                        onPress={() => void openRequest(request)}
                        onContact={
                          request.requester?.id && request.requester.id !== userId
                            ? () =>
                                openPrivateMessage(
                                  request.requester?.id,
                                  request.requester?.name,
                                )
                            : undefined
                        }
                        leading={
                          <PublicationImage
                            imageUrl={request.imageMeta?.url}
                            imageAlt={request.imageMeta?.alt || request.title}
                            illustrative={request.imageMeta?.illustrative === true}
                          />
                        }
                        leadingVariant="image"
                      />
                    );
                  })}
                </View>
              ) : null}

              {filteredResults.length ? (
                <Text style={styles.sectionTitle}>{t("offers.availableOffers")}</Text>
              ) : null}
            </View>
          ) : discoveryLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : null
        }
        onEndReached={() => {
          if (resultsKey === searchKey && !catalogError && hasNextPage && nextCursor && !loadingMore && !loading) {
            void loadOffers(query, nextCursor);
          }
        }}
        onEndReachedThreshold={0.35}
        ListFooterComponent={
          loadingMore ? <ActivityIndicator color={colors.primary} /> : null
        }
      />
      <OfferPurchaseWizard
        visible={Boolean(selectedOffer && resultsKey === searchKey)}
        offer={selectedOffer}
        busy={Boolean(selectedOffer && busyId === selectedOffer.id)}
        error={error}
        onClearError={() => setError(null)}
        onClose={() => setSelectedOffer(null)}
        onSubmit={requestOffer}
        requireRecurringConsent
      />
    </View>
  );
}

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.filterChip, selected && styles.filterChipSelected]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.filterChipText,
          selected && styles.filterChipTextSelected,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    backgroundColor: colors.background,
    padding: 18,
  },
  backButton: {
    minHeight: 44,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 8,
  },
  backText: { color: colors.text, fontWeight: "800" },
  eyebrow: { color: colors.text, fontSize: 12, fontWeight: "900" },
  heading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
    marginTop: 3,
    marginBottom: 12,
  },
  label: { color: colors.mutedText, fontWeight: "700", marginBottom: 6 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 8,
    minHeight: 54,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  input: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.card,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
  },
  filterButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  filters: {
    padding: 18,
    gap: 8,
  },
  filterBackdrop: { flex: 1, padding: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(39,39,41,0.45)" },
  filterDialog: { width: "100%", maxWidth: 540, maxHeight: "90%", backgroundColor: colors.background, borderRadius: 24, borderWidth: 1, borderColor: colors.cardBorder, overflow: "hidden" },
  filterHeader: { paddingLeft: 18, paddingRight: 8, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: colors.cardBorder, flexShrink: 0 },
  filterTitle: { flex: 1, color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "800" },
  filterScroll: { flexGrow: 0, flexShrink: 1 },
  filterFooter: { padding: 18, borderTopWidth: 1, borderTopColor: colors.cardBorder, flexShrink: 0 },
  filterLabel: { color: colors.text, fontSize: 12, fontWeight: "900" },
  filterOptions: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  filterChip: {
    minHeight: 44,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    paddingHorizontal: 11,
    backgroundColor: colors.card,
  },
  filterChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.highlight,
  },
  filterChipText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  filterChipTextSelected: { color: colors.actionInk },
  error: { color: colors.danger, fontWeight: "700", marginTop: 8 },
  notice: {
    color: "#176B3A",
    backgroundColor: "#E9F7EF",
    borderRadius: 6,
    padding: 10,
    fontWeight: "700",
    marginBottom: 8,
  },
  ownOffer: { color: colors.mutedText, fontWeight: "800", marginTop: 8 },
  stateBox: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
    marginBottom: 10,
  },
  stateText: { color: colors.text, fontWeight: "700" },
  resultCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
    marginBottom: 10,
  },
  resultTitle: { color: colors.text, fontWeight: "700", fontSize: 16 },
  resultPrice: { color: colors.text, fontWeight: "800", marginTop: 4 },
  resultBody: { color: colors.mutedText, fontWeight: "600", marginTop: 4 },
  listContent: { paddingBottom: 20, gap: 10 },
  discoverySections: { gap: 18, marginBottom: 8 },
  discoverySection: { gap: 8 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
});

