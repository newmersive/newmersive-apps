import { readJourneyDraft } from "../../utils/journeyDrafts";
import { buyerPaymentLabel } from "../../utils/buyerJourney";
import { pendingBuyerOrder, validatePendingSummary, type RequestPendingSummary } from "../../utils/requestWork";
import { requestWorkCopy } from "../../i18n/requestWorkCopy";
import { readManualRequestDraft } from "../../utils/manualRequestContinuity";
import { buyerDraftReadError, buyerContinuityCopy } from "../../i18n/buyerContinuityCopy";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import {
  Camera,
  CircleDollarSign,
  ClipboardList,
  MapPin,
  Network,
  PackageCheck,
  Plus,
  ScanLine,
  Search,
  ShoppingBag,
  Sparkles,
  Store,
  Truck,
} from "lucide-react-native";

import {
  apiGet,
  apiAuthGet,
  type AllwainPaymentConfig,
  type AllwainConnectorLogistics,
  type AllwainConnectorNetwork,
  type AllwainMarketRequest,
  type AllwainOffer,
  type AllwainOrder,
  type AllwainOrderSummary,
  type AllwainScanRequest,
} from "../../config/api";
import { useAuthStore } from "../../store/auth.store";
import { captureAuthSession } from "../../store/authSessionBridge";
import { colors } from "../../theme/colors";
import { formatCurrency } from "../../utils/format";
import { resolveSellerIncome } from "../../utils/sellerIncome";
import { isAllwainStripeTestMarketplace } from "../../utils/allwainPaymentEnvironment";
import {
  ORANGES_ILLUSTRATIVE_IMAGE,
  isPinnedOrangesOffer,
  preferredOrangesOffer,
} from "../../data/demoOffers";
import {
  ActionCard,
  BigActionButton,
  DeliveryCard,
  EmptyState,
  OfferCard,
  OrderCard,
  PublicationImage,
  ProductCard,
  TodaySummary,
} from "../../components/design-system";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import type { TranslationKey } from "../../i18n";

type Translate = (
  key: TranslationKey,
  replacements?: Record<string, string | number>,
) => string;

function greeting(t: Translate) {
  const hour = new Date().getHours();
  if (hour < 13) return t("home.greeting.morning");
  if (hour < 20) return t("home.greeting.afternoon");
  return t("home.greeting.evening");
}

function firstName(name?: string, email?: string) {
  return (name?.trim().split(/\s+/)[0] || email?.split("@")[0] || "").trim();
}

function requestStatus(request: Pick<AllwainScanRequest, "status">, t: Translate) {
  if (request.status === "submitted") return { label: t("home.request.searching"), action: t("home.request.view"), tone: "success" as const };
  if (request.status === "awarded") return { label: t("home.request.chosen"), action: t("home.request.viewOrder"), tone: "success" as const };
  if (request.status === "ready") return { label: t("home.request.ready"), action: t("home.request.publish"), tone: "brand" as const };
  if (request.status === "closed") return { label: t("home.request.closed"), action: t("home.request.history"), tone: "neutral" as const };
  if (request.status === "canceled") return { label: t("home.request.canceled"), action: t("common.view"), tone: "neutral" as const };
  if (request.status === "archived") return { label: t("home.request.archived"), action: t("common.view"), tone: "neutral" as const };
  return { label: t("home.request.incomplete"), action: t("home.request.continue"), tone: "warning" as const };
}

function money(cents: number, currency = "EUR") {
  return formatCurrency(Number(cents) / 100, currency);
}

function quantityToPrepare(orders: AllwainOrder[]) {
  const pending = orders.filter((order) => ["pending", "preparing"].includes(order.fulfillmentStatus));
  const byUnit = new Map<string, number>();
  pending.forEach((order) => byUnit.set(order.unit, (byUnit.get(order.unit) || 0) + order.quantity));
  const first = [...byUnit.entries()][0];
  if (!first) return "0";
  const suffix = byUnit.size > 1 ? " +" : "";
  return `${first[1]} ${first[0]}${suffix}`;
}

function summarizedQuantity(items: AllwainOrderSummary["toPrepare"], unitFallback: string) {
  const safeItems = Array.isArray(items) ? items : [];
  const first = safeItems.find((item) => Number(item?.quantity) > 0);
  if (!first) return "0";
  return `${first.quantity} ${first.unit || unitFallback}${safeItems.length > 1 ? " +" : ""}`;
}

function summarizedIncome(items: AllwainOrderSummary["pendingIncome"]) {
  const safeItems = Array.isArray(items) ? items : [];
  const first = safeItems.find((item) => Number(item?.amount) > 0);
  if (!first) return money(0);
  return `${money(first.amount, first.currency)}${safeItems.length > 1 ? " +" : ""}`;
}

function HomeHero({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <View style={styles.heroPanel}>
      <View pointerEvents="none" style={styles.heroHalo} />
      <View pointerEvents="none" style={styles.heroOrbit} />
      <View pointerEvents="none" style={styles.heroPlane} />
      <Image
        accessible={false}
        source={require("../../assets/logos/Imagotipo_Allwain_03.png")}
        resizeMode="contain"
        style={styles.heroMark}
      />
      <View style={styles.heroCopy}>
        <View style={styles.heroEyebrowRow}>
          <View style={styles.heroPulse} />
          <Text style={styles.greeting}>{eyebrow}</Text>
        </View>
        <Text accessibilityRole="header" style={styles.heroTitle}>{title}</Text>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const { t, locale } = useAppTranslation();
  const workCopy = requestWorkCopy[locale];
  const navigation = useNavigation<any>();
  const user = useAuthStore((state) => state.user);
  const [drafts, setDrafts] = useState<{manual:boolean;manualRequestId?:string;owner?:string;list:boolean;catalog:boolean}>({manual:false,list:false,catalog:false});
  const [manualRecoveryFailed, setManualRecoveryFailed] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    const session = captureAuthSession(), actor = user?.id;
    setDrafts({manual:false,list:false,catalog:false});
    setManualRecoveryFailed(false);
    if (user?.id) void Promise.all([
      readManualRequestDraft(user.id).catch(() => {if(active && session.isCurrent() && useAuthStore.getState().user?.id === actor) setManualRecoveryFailed(true);return null;}),readJourneyDraft<{rawText?:string;draftItems?:unknown[];title?:string}>(user.id,"shopping-list"),readJourneyDraft<{title?:string}>(user.id,"catalog-offer"),
    ]).then(([manual,list,catalog]) => {if(active && session.isCurrent() && useAuthStore.getState().user?.id === actor) setDrafts({owner:actor,manual:Boolean(manual?.requestId || manual?.requestText?.trim()),manualRequestId:manual?.requestId,list:Boolean(list?.rawText?.trim() || list?.draftItems?.length || list?.title?.trim()),catalog:Boolean(catalog?.title?.trim())});}).catch(() => undefined);
    return () => {active=false;};
  },[user?.id]));
  const appMode = useAuthStore((state) => state.appMode);
  const participation = user?.participation;
  const [requests, setRequests] = useState<AllwainScanRequest[]>([]);
  const [offers, setOffers] = useState<AllwainOffer[]>([]);
  const [opportunities, setOpportunities] = useState<AllwainMarketRequest[]>([]);
  const [orders, setOrders] = useState<AllwainOrder[]>([]);
  const [orderSummary, setOrderSummary] = useState<AllwainOrderSummary | null>(null);
  const [requestSummary, setRequestSummary] = useState<RequestPendingSummary | null>(null);
  const [summaryOwner, setSummaryOwner] = useState<string | undefined>(undefined);
  const [logistics, setLogistics] = useState<AllwainConnectorLogistics | null>(null);
  const [network, setNetwork] = useState<AllwainConnectorNetwork | null>(null);
  const [paymentConfig, setPaymentConfig] =
    useState<AllwainPaymentConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [verifiedSections, setVerifiedSections] = useState<Partial<Record<
    "requests" | "orders" | "offers" | "opportunities" | "logistics" | "network",
    boolean
  >>>({});

  useEffect(() => {
    let current = true;
    void apiGet<AllwainPaymentConfig>("/allwain/payments/config")
      .then((config) => {
        if (current) setPaymentConfig(config);
      })
      .catch(() => {
        if (current) setPaymentConfig(null);
      });
    return () => {
      current = false;
    };
  }, []);

  function openPrivateMessage(targetId?: string | null, targetName?: string | null) {
    if (!targetId || targetId === user?.id) return;
    navigation.navigate("ChatThread", {
      targetUserId: targetId,
      targetName: targetName || t("home.user"),
      title: t("market.privateMessage"),
    });
  }

  const load = useCallback(async (isCurrent: () => boolean) => {
    if (!participation) return;
    setLoading(true);
    setError(null);
    setOrderSummary(null);
    setRequestSummary(null);
    setSummaryOwner(undefined);
    setVerifiedSections({});
    try {
      if (appMode === "buy") {
        const [requestResult, offerResult, orderResult, summaryResult, pendingResult] = await Promise.allSettled([
          apiAuthGet<{ items?: AllwainScanRequest[] }>("/allwain/scan-requests"),
          apiAuthGet<{ items?: AllwainOffer[] }>("/allwain/offers"),
          apiAuthGet<{ items?: AllwainOrder[] }>("/allwain/payments/orders?scope=buyer"),
          apiAuthGet<AllwainOrderSummary>("/allwain/payments/orders/summary?scope=buyer"),
          apiAuthGet<RequestPendingSummary>("/allwain/scan-requests/summary?limit=3").then(validatePendingSummary),
        ]);
        if (!isCurrent()) return;
        setVerifiedSections({
          requests: requestResult.status === "fulfilled",
          offers: offerResult.status === "fulfilled",
          orders: orderResult.status === "fulfilled",
        });
        if (requestResult.status === "fulfilled") {
          setRequests(
            Array.isArray(requestResult.value.items)
              ? requestResult.value.items
              : [],
          );
        }
        if (offerResult.status === "fulfilled") {
          setOffers(
            Array.isArray(offerResult.value.items)
              ? offerResult.value.items
              : [],
          );
        }
        if (orderResult.status === "fulfilled") {
          setOrders(
            Array.isArray(orderResult.value.items)
              ? orderResult.value.items
              : [],
          );
        }
        if (summaryResult.status === "fulfilled") setOrderSummary(summaryResult.value);
        setSummaryOwner(user?.id);
        if (pendingResult.status === "fulfilled") setRequestSummary(pendingResult.value);
        if ([requestResult, offerResult, orderResult, summaryResult, pendingResult].some((result) => result.status === "rejected")) {
          setError(t("home.partialLoadError"));
        }
      } else if (appMode === "sell" && participation.seller?.enabled) {
        const [requestResult, orderResult, summaryResult] = await Promise.allSettled([
          apiAuthGet<{ items?: AllwainMarketRequest[] }>("/allwain/market/requests"),
          apiAuthGet<{ items?: AllwainOrder[] }>("/allwain/payments/orders?scope=seller"),
          apiAuthGet<AllwainOrderSummary>("/allwain/payments/orders/summary?scope=seller"),
        ]);
        if (!isCurrent()) return;
        setVerifiedSections({
          opportunities: requestResult.status === "fulfilled",
          orders: orderResult.status === "fulfilled",
        });
        if (requestResult.status === "fulfilled") {
          setOpportunities(
            Array.isArray(requestResult.value.items)
              ? requestResult.value.items
              : [],
          );
        }
        if (orderResult.status === "fulfilled") {
          setOrders(
            Array.isArray(orderResult.value.items)
              ? orderResult.value.items
              : [],
          );
        }
        if (summaryResult.status === "fulfilled") setOrderSummary(summaryResult.value);
        if (requestResult.status === "rejected" || orderResult.status === "rejected" || summaryResult.status === "rejected") {
          setError(t("home.partialLoadError"));
        }
      } else if (appMode === "connector" && participation.connector?.enabled) {
        const [logisticsResult, networkResult] = await Promise.allSettled([
          apiAuthGet<AllwainConnectorLogistics>("/allwain/participation/connector/logistics"),
          apiAuthGet<AllwainConnectorNetwork>("/allwain/participation/connector/network"),
        ]);
        if (!isCurrent()) return;
        setVerifiedSections({
          logistics: logisticsResult.status === "fulfilled",
          network: networkResult.status === "fulfilled",
        });
        if (logisticsResult.status === "fulfilled") setLogistics(logisticsResult.value);
        if (networkResult.status === "fulfilled") setNetwork(networkResult.value);
        if (logisticsResult.status === "rejected" || networkResult.status === "rejected") {
          setError(t("home.partialLoadError"));
        }
      }
    } catch (loadError: any) {
      if (isCurrent()) setError(loadError?.message || t("home.loadError"));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [appMode, participation, t, user?.id]);

  useFocusEffect(useCallback(() => {
    let current = true;
    const session = captureAuthSession(), accountId = user?.id;
    void load(() => current && session.isCurrent() && useAuthStore.getState().user?.id === accountId);
    return () => { current = false; };
  }, [load, refreshKey, user?.id]));

  const loadFeedback = error ? (
    <View style={styles.loadNotice} accessibilityLiveRegion="polite">
      <Text style={styles.loadNoticeTitle}>No hemos podido comprobar toda tu actividad</Text>
      <Text style={styles.loadNoticeText}>{error}</Text>
      <BigActionButton
        label={t("common.retry")}
        tone="light"
        busy={loading}
        onPress={() => setRefreshKey((value) => value + 1)}
      />
    </View>
  ) : null;

  const featuredOffer = preferredOrangesOffer(offers);
  const stripeTestMarketplace =
    isAllwainStripeTestMarketplace(paymentConfig);

  const catalogPreview = useMemo(
    () =>
      offers
        .filter(
            (offer) =>
              offer.id !== featuredOffer?.id &&
              !isPinnedOrangesOffer(offer) &&
              offer.ownerUserId !== user?.id &&
            offer.provider?.id !== user?.id &&
            offer.allwainStatus !== "sold_out" &&
            !(
              offer.meta?.inventoryManaged === true &&
              typeof offer.meta?.availableQuantity === "number" &&
              Number(offer.meta.availableQuantity) <
                Number(offer.meta?.minQuantity || 1)
            ),
        )
        .slice(0, 4),
    [featuredOffer?.id, offers, user?.id],
  );

  if (!participation) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const name = firstName(user?.name, user?.email);

  if (appMode === "sell" && !participation.seller?.enabled) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <HomeHero eyebrow={`${greeting(t)}${name ? `, ${name}` : ""}`} title={t("home.seller.question")} />
        <View style={styles.previewList}>
          <ProductCard title={t("home.seller.publishTitle")} meta={t("home.seller.publishMeta")} leading={<Camera size={20} color={colors.primary} />} />
          <OrderCard title={t("home.seller.ordersTitle")} meta={t("home.seller.ordersMeta")} leading={<ClipboardList size={20} color={colors.primary} />} />
          <OrderCard title={t("home.seller.payoutTitle")} meta={t("home.seller.payoutMeta")} leading={<CircleDollarSign size={20} color={colors.primary} />} />
        </View>
        <BigActionButton
          label={participation.seller?.status === "not_activated" ? t("home.seller.activate") : t("home.seller.continueActivation")}
          tone="dark"
          icon={<Store size={20} color={colors.buttonText} />}
          onPress={() => navigation.navigate("ActivateSeller")}
        />
        <BigActionButton
          label={t("home.seller.howItWorks")}
          tone="light"
          icon={<Sparkles size={20} color={colors.primary} />}
          onPress={() => navigation.navigate("HowAllwainWorks", { initialPage: "sell" })}
        />
      </ScrollView>
    );
  }

  if (appMode === "connector" && !participation.connector?.enabled) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <HomeHero eyebrow={`${greeting(t)}${name ? `, ${name}` : ""}`} title={t("home.connector.question")} />
        <View style={styles.previewList}>
          <ProductCard title={t("home.connector.qrTitle")} meta={t("home.connector.qrMeta")} leading={<ScanLine size={20} color={colors.primary} />} />
          <ProductCard title={t("home.connector.networkTitle")} meta={t("home.connector.networkMeta")} leading={<Network size={20} color={colors.primary} />} />
          <DeliveryCard title={t("home.connector.deliveryTitle")} meta={t("home.connector.deliveryMeta")} leading={<Truck size={20} color={colors.primary} />} />
        </View>
        <BigActionButton
          label={participation.connector?.status === "not_activated" ? t("home.connector.activate") : t("home.connector.continueActivation")}
          icon={<MapPin size={20} color={colors.buttonText} />}
          onPress={() => navigation.navigate("ActivateConnector")}
        />
        <BigActionButton
          label={t("home.connector.howItWorks")}
          tone="light"
          icon={<Sparkles size={20} color={colors.primary} />}
          onPress={() => navigation.navigate("HowAllwainWorks", { initialPage: "connector" })}
        />
      </ScrollView>
    );
  }

  if (appMode === "sell") {
    const sellerOrders = orders.filter((order) => order.sellerUserId === user?.id);
    const newOrders = sellerOrders.filter((order) => order.fulfillmentStatus === "pending");
    const readyOrders = sellerOrders.filter((order) => order.fulfillmentStatus === "ready");
    const income = resolveSellerIncome(orderSummary);

    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <HomeHero eyebrow={`${greeting(t)}${name ? `, ${name}` : ""}`} title={t("home.seller.attention")} />
        {drafts.catalog ? <OrderCard title="Tienes una oferta sin publicar" meta="Continúa con los datos que ya has preparado." actionLabel="Continuar oferta" onPress={() => navigation.navigate("Ofertas",{section:"offers",focusKey:String(Date.now())})} /> : null}
        <TodaySummary
          items={[
            { key: "new", value: orderSummary ? String(orderSummary.newCount) : verifiedSections.orders ? String(newOrders.length) : "—", label: t("home.seller.newOrders"), icon: <ShoppingBag size={19} color={colors.primary} /> },
            { key: "prepare", value: orderSummary ? summarizedQuantity(orderSummary.toPrepare, t("home.buyer.unit")) : verifiedSections.orders ? quantityToPrepare(sellerOrders) : "—", label: t("home.seller.toPrepare"), icon: <ClipboardList size={19} color={colors.brandDark} /> },
            stripeTestMarketplace
              ? { key: "income", value: "TEST", label: t("testMarket.status"), icon: <CircleDollarSign size={19} color={colors.primary} /> }
              : { key: "income", value: income.state === "ready" ? summarizedIncome(income.items) : income.state === "review" ? t("home.seller.reviewIncome") : "-", label: income.state === "unavailable" ? t("home.seller.incomeUnavailable") : t("home.seller.toReceive"), icon: <CircleDollarSign size={19} color={colors.primary} /> },
          ]}
          actionLabel={sellerOrders.length ? t("home.seller.viewPreparation") : t("home.seller.viewRequests")}
          onAction={() => navigation.navigate("Ofertas", {section:sellerOrders.length ? "preparation" : "offers",focusKey:String(Date.now())})}
        />

        {!stripeTestMarketplace && income.state === "review" ? (
          <OrderCard title={t("home.seller.reviewIncomeTitle")} meta={t("home.seller.reviewIncomeHelp")}
            actionLabel={t("common.view")} onPress={() => navigation.navigate("Ofertas")}
            leading={<CircleDollarSign size={20} color={colors.primary} />} />
        ) : null}

        {stripeTestMarketplace ? (
          <ProductCard
            title={t("testMarket.sellerReady")}
            meta={t("testMarket.noRealMoney")}
            status={t("testMarket.status")}
            statusTone="success"
            actionLabel={t("testMarket.action")}
            onPress={() => navigation.navigate("Ofertas")}
            leading={<Sparkles size={20} color={colors.primary} />}
          />
        ) : !participation.seller?.sellerReady ? (
          <ProductCard
            title={t("home.seller.completePayments")}
            meta={t("home.seller.completePaymentsMeta")}
            status={t("roles.pending")}
            statusTone="brand"
            actionLabel={t("common.continue")}
            onPress={() => navigation.navigate("ActivateSeller")}
            leading={<CircleDollarSign size={20} color={colors.primary} />}
          />
        ) : null}

        {loadFeedback}
        {loading ? <ActivityIndicator color={colors.primary} /> : null}

        {readyOrders.length ? (
          <OrderCard
            title={readyOrders.length === 1 ? t("home.seller.readyOne") : t("home.seller.readyMany", { count: readyOrders.length })}
            meta={t("home.seller.readyMeta")}
            status={t("home.request.ready")}
            statusTone="success"
            actionLabel={t("home.seller.viewOrders")}
            onPress={() => navigation.navigate("Ofertas", {section:"orders",focusKey:String(Date.now())})}
            leading={<PackageCheck size={20} color={colors.primary} />}
          />
        ) : null}

        <ProductCard
          title={t("home.shopping.title")}
          meta={t("home.shopping.sellerMeta")}
          detail={t("home.shopping.sellerDetail")}
          actionLabel={t("home.shopping.sellerAction")}
          onPress={() => navigation.navigate("ShoppingLists", { mode: "sell" })}
          leading={<ClipboardList size={20} color={colors.primary} />}
        />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t("home.seller.respondNow")}</Text>
          <Text style={styles.sectionCount}>{verifiedSections.opportunities ? opportunities.length : "—"}</Text>
        </View>
        {!loading && verifiedSections.opportunities && !opportunities.length ? (
          <EmptyState
            title={t("home.seller.allDone")}
            body={t("home.seller.newRequestsHere")}
            demo={{
              title: t("home.seller.demoRequestTitle"),
              meta: t("home.seller.demoRequestMeta"),
              detail: t("home.seller.demoRequestDetail"),
              leading: <ClipboardList size={20} color={colors.primary} />,
            }}
          />
        ) : null}
        {opportunities.slice(0, 3).map((request) => (
          <ProductCard
            key={request.id}
            title={request.extracted.productName || request.title}
            meta={`${request.extracted.quantity || t("home.quantityPending")} ${request.extracted.unit || ""}`.trim()}
            detail={request.requester.name}
            status={request.myOffer ? t("home.status.responded") : t("home.status.new")}
            statusTone={request.myOffer ? "success" : "brand"}
            actionLabel={request.myOffer ? t("home.action.review") : t("home.action.prepareOffer")}
            onPress={() => navigation.navigate("Ofertas", { requestId: request.id })}
            onContact={
              request.requester.id !== user?.id
                ? () =>
                    openPrivateMessage(
                      request.requester.id,
                      request.requester.name,
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
        ))}
      </ScrollView>
    );
  }

  if (appMode === "connector") {
    const available = logistics?.items.filter((item) => item.status === "open" && !item.mine) || [];
    const mine = logistics?.items.filter((item) => item.mine && item.status !== "delivered") || [];
    const demoDelivery = logistics?.demoItems?.[0] || null;
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <HomeHero eyebrow={`${greeting(t)}${name ? `, ${name}` : ""}`} title={t("home.connector.nearby")} />
        <TodaySummary
          items={[
            { key: "near", value: verifiedSections.logistics ? String(available.length) : "—", label: t("home.connector.availableDeliveries"), icon: <MapPin size={19} color={colors.primary} /> },
            { key: "mine", value: verifiedSections.logistics ? String(mine.length) : "—", label: t("home.connector.myDeliveries"), icon: <Truck size={19} color={colors.brandDark} /> },
            { key: "network", value: verifiedSections.network ? String(network?.totals.users || 0) : "—", label: t("home.connector.networkPeople"), icon: <Network size={19} color={colors.primary} /> },
          ]}
          actionLabel={t("home.connector.viewDeliveries")}
          onAction={() => navigation.navigate("Ofertas")}
        />
        {loadFeedback}
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        {!loading && verifiedSections.logistics && !available.length ? (
          <EmptyState
            title={t("home.connector.emptyTitle")}
            body={t("home.connector.emptyBody")}
            demo={{
              title:
                demoDelivery?.title ||
                `${demoDelivery?.pickupZone || "Foios"} → ${demoDelivery?.deliveryZone || "Meliana"}`,
              meta: `${demoDelivery?.pickupZone || "Foios"} → ${demoDelivery?.deliveryZone || "Meliana"} · ${t("home.connector.expectedAmount", { amount: money(demoDelivery?.feeAmount || 200, demoDelivery?.currency || "EUR") })}`,
              detail: t("home.connector.demoDetail"),
              actionLabel: demoDelivery ? t("home.connector.tryRoute") : undefined,
              onPress: demoDelivery
                ? () =>
                    navigation.navigate("Ofertas", {
                      deliveryId: demoDelivery.id,
                    })
                : undefined,
              leading: <Truck size={20} color={colors.primary} />,
            }}
          />
        ) : null}
        {available.slice(0, 3).map((item) => (
          <DeliveryCard
            key={item.id}
            title={`${item.pickupZone} → ${item.deliveryZone}`}
            meta={`${typeof item.distanceKm === "number" ? `${item.distanceKm.toFixed(1)} km · ` : ""}${t("home.connector.grossAmount", { amount: money(item.feeAmount, item.currency) })}`}
            status={t("home.status.available")}
            statusTone="brand"
            actionLabel={t("home.action.viewDelivery")}
            onPress={() => navigation.navigate("Ofertas", { deliveryId: item.id })}
            leading={<Truck size={20} color={colors.primary} />}
          />
        ))}
      </ScrollView>
    );
  }

  const buyerOrders = orders.filter((order) => order.buyerUserId === user?.id);
  const pendingOrders = buyerOrders.filter(pendingBuyerOrder);
  const currentRequestSummary = summaryOwner === user?.id ? requestSummary : null;
  const pendingRequests = currentRequestSummary?.items || [];
  const pendingCount = currentRequestSummary && typeof orderSummary?.pendingActionCount === "number"
    ? currentRequestSummary.total + orderSummary.pendingActionCount : null;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <HomeHero eyebrow={`${greeting(t)}${name ? `, ${name}` : ""}`} title={t("home.buyer.question")} />
      {manualRecoveryFailed ? <OrderCard title={buyerDraftReadError[locale]} actionLabel={buyerContinuityCopy[locale].retry} onPress={() => navigation.navigate("ManualRequest")} /> : null}
      {drafts.manual && drafts.owner === user?.id ? <OrderCard title={drafts.manualRequestId ? "Retoma tu petición" : "Tu petición está a medias"} meta={drafts.manualRequestId ? "Continúa en la ficha guardada." : "Recupera el texto que estabas preparando."} actionLabel="Continuar petición" onPress={() => { if (useAuthStore.getState().user?.id !== drafts.owner) return; drafts.manualRequestId ? navigation.navigate("ScanResult", {requestId:drafts.manualRequestId}) : navigation.navigate("ManualRequest"); }} /> : null}
      {drafts.list ? <OrderCard title="Tienes una lista en preparación" meta="Revisa los productos y continúa donde lo dejaste." actionLabel="Continuar lista" onPress={() => navigation.navigate("ShoppingLists",{create:true})} /> : null}
      <View style={styles.actionGrid}>
        <ActionCard title={t("home.buyer.search")} icon={<Search size={23} color={colors.primary} />} onPress={() => navigation.navigate("Search")} />
        <ActionCard title={t("home.buyer.capture")} icon={<Camera size={23} color={colors.primary} />} onPress={() => navigation.navigate("Scan")} />
        <ActionCard title={t("home.buyer.request")} icon={<Plus size={23} color={colors.primary} />} onPress={() => navigation.navigate("ManualRequest")} />
      </View>
      <View style={styles.secondaryActions}>
        <ActionCard variant="compact" title="Mis peticiones" icon={<ClipboardList size={20} color={colors.brandDark} />} onPress={() => navigation.navigate("MyRequests")} />
        <ActionCard variant="compact" title="Mis pedidos" icon={<ShoppingBag size={20} color={colors.brandDark} />} onPress={() => navigation.navigate("Ofertas", { section: "orders", offerId: undefined, contractId: undefined, orderId: undefined, focusKey: String(Date.now()) })} />
      </View>
      <Text style={{ color: colors.mutedText, lineHeight: 20 }}>Acepta una oferta, revisa tu pedido y continúa con el pago. Puedes retomarlo en Mis pedidos.</Text>
      <ProductCard
        title={t("home.shopping.buyerTitle")}
        meta={t("home.shopping.buyerMeta")}
        detail={t("home.shopping.buyerDetail")}
        actionLabel={t("home.shopping.buyerAction")}
        onPress={() => navigation.navigate("ShoppingLists", { mode: "buy" })}
        leading={<ClipboardList size={20} color={colors.primary} />}
      />

      {loadFeedback}
      {loading ? <ActivityIndicator color={colors.primary} /> : null}

      {pendingCount === null || pendingCount > 0 ? (
        <View style={styles.pendingBlock}>
          <View style={[styles.sectionHeader, styles.pendingHeading]}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>{workCopy.pending}</Text>
            <Text style={styles.sectionCount}>{pendingCount ?? "—"}</Text>
          </View>
          <Text style={styles.pendingHelp}>{workCopy.help}</Text>
          {orderSummary?.pendingActionCount ? pendingOrders.slice(0, 2).map((order) => (
            <OrderCard
              key={order.id}
              title={order.offerTitle || `${order.quantity} ${order.unit}`}
              meta={order.fulfillmentStatus === "delivered" ? "Entrega recibida · revisa y confirma" : buyerPaymentLabel(order.paymentStatus) || t("home.buyer.viewOrder")}
              actionLabel={t("home.buyer.viewOrder")}
              onPress={() => navigation.navigate("Ofertas", { section: "orders", orderId: order.id, offerId: undefined, contractId: undefined, focusKey: String(Date.now()) })}
              leading={<ShoppingBag size={20} color={colors.brandDark} />}
            />
          )) : null}
          {pendingRequests.map((request) => (
            <ProductCard
              key={request.id}
              title={request.extracted.productName || request.title || t("home.request.productReview")}
              meta={request.status === "submitted" ? "Tienes propuestas para revisar" : requestStatus(request, t).label}
              actionLabel={request.status === "submitted" ? t("home.action.review") : requestStatus(request, t).action}
              onPress={() => navigation.navigate("ScanResult", { requestId: request.id })}
              leading={<ClipboardList size={20} color={colors.brandDark} />}
            />
          ))}
          <View style={styles.secondaryActions}>
            <ActionCard variant="compact" title={workCopy.requests} icon={<ClipboardList size={20} color={colors.brandDark} />} onPress={() => navigation.navigate("MyRequests")} />
            <ActionCard variant="compact" title={workCopy.orders} icon={<ShoppingBag size={20} color={colors.brandDark} />} onPress={() => navigation.navigate("Ofertas", { section: "orders", focusKey: String(Date.now()) })} />
          </View>
        </View>
      ) : null}

      {featuredOffer ? (
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>{t("home.buyer.tryOffer")}</Text>
          <OfferCard
            title={featuredOffer.title}
            meta={`${typeof featuredOffer.price === "number" ? formatCurrency(featuredOffer.price) : "—"} / ${String(featuredOffer.meta?.unit || t("home.buyer.unit"))}`}
            detail={t("home.buyer.sellerMinimum", { seller: featuredOffer.provider?.name || t("home.buyer.seller"), minimum: String(featuredOffer.meta?.minQuantity || 1), unit: String(featuredOffer.meta?.unit || t("home.buyer.unit")) })}
            status={t("home.status.available")}
            statusTone="neutral"
            actionLabel={t("home.buyer.chooseQuantity")}
            onPress={() => navigation.navigate("Ofertas", { offerId: featuredOffer.id })}
            onContact={
              featuredOffer.provider?.id && featuredOffer.provider.id !== user?.id
                ? () =>
                    openPrivateMessage(
                      featuredOffer.provider?.id,
                      featuredOffer.provider?.name,
                    )
                : undefined
            }
            leading={
              <PublicationImage
                source={ORANGES_ILLUSTRATIVE_IMAGE}
                imageAlt={featuredOffer.title}
                illustrative={featuredOffer.meta?.imageIllustrative === true}
              />
            }
            leadingVariant="image"
          />
        </View>
      ) : null}

      {catalogPreview.length ? (
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t("home.buyer.exploreOffers")}</Text>
            <Text style={styles.sectionCount}>{offers.length}</Text>
          </View>
          {catalogPreview.map((offer) => {
            const unit = String(offer.meta?.unit || offer.unit || t("home.buyer.unit"));
            const minimum = Number(offer.meta?.minQuantity || 1);
            const demo =
              offer.meta?.demo === true &&
              offer.meta?.checkoutEnabled === false;
            const imageUrl =
              typeof offer.meta?.imageUrl === "string"
                ? offer.meta.imageUrl
                : null;
            return (
              <OfferCard
                key={offer.id}
                title={offer.title}
                meta={`${typeof offer.price === "number" ? formatCurrency(offer.price) : t("home.buyer.pendingPrice")} / ${unit}`}
                detail={t("home.buyer.sellerMinimum", { seller: offer.provider?.name || t("home.buyer.seller"), minimum, unit })}
                status={demo ? t("card.demo") : t("home.status.available")}
                statusTone={demo ? "brand" : "neutral"}
                actionLabel={demo ? t("home.buyer.explore") : t("home.buyer.chooseQuantity")}
                onPress={() =>
                  navigation.navigate("Ofertas", { offerId: offer.id })
                }
                onContact={
                  offer.provider?.id && offer.provider.id !== user?.id
                    ? () =>
                        openPrivateMessage(
                          offer.provider?.id,
                          offer.provider?.name,
                        )
                    : undefined
                }
                leading={
                  <PublicationImage
                    imageUrl={imageUrl}
                    imageAlt={offer.meta?.imageAlt || offer.title}
                    illustrative={offer.meta?.imageIllustrative === true || !imageUrl}
                  />
                }
                leadingVariant="image"
              />
            );
          })}
          <BigActionButton
            label={t("home.buyer.viewAllOffers")}
            tone="light"
            icon={<Search size={20} color={colors.primary} />}
            onPress={() => navigation.navigate("Search")}
          />
        </View>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t("home.buyer.activity")}</Text>
        <Text style={styles.sectionCount}>{verifiedSections.requests && verifiedSections.orders ? requests.length + (orderSummary?.totalCount ?? buyerOrders.length) : "—"}</Text>
      </View>
      {!loading && verifiedSections.requests && verifiedSections.orders && !requests.length && !buyerOrders.length ? (
        <EmptyState
          title={t("home.buyer.emptyTitle")}
          body={t("home.buyer.emptyBody")}
          actionLabel={t("home.buyer.createRequest")}
          onAction={() => navigation.navigate("ManualRequest")}
          demo={{
            title: t("home.buyer.demoRecurringTitle"),
            meta: t("home.buyer.demoRecurringMeta"),
            detail: t("home.buyer.demoRecurringDetail"),
            leading: <ShoppingBag size={20} color={colors.primary} />,
          }}
        />
      ) : null}
      {buyerOrders.slice(0, 2).map((order) => (
        <OrderCard
          key={order.id}
          title={order.offerTitle || `${order.quantity} ${order.unit}`}
          meta={`${order.quantity} ${order.unit} · ${money(order.subtotalAmount, order.currency)}`}
          status={buyerPaymentLabel(order.paymentStatus) || (order.fulfillmentStatus === "delivered" ? t("home.buyer.atHome") : order.fulfillmentStatus === "dispatched" ? t("home.buyer.onTheWay") : t("home.buyer.confirmed"))}
          statusTone={order.fulfillmentStatus === "delivered" ? "success" : "brand"}
          actionLabel={t("home.buyer.viewOrder")}
          onPress={() => navigation.navigate("Ofertas", { section: "orders", orderId: order.id, offerId: undefined, contractId: undefined, focusKey: String(Date.now()) })}
          contactLabel={t("home.buyer.talkOrder")}
          onContact={() =>
            navigation.navigate("ChatThread", {
              orderId: order.id,
              title: `${order.quantity} ${order.unit}`,
            })
          }
          leading={
            <PublicationImage
              imageUrl={order.imageMeta?.url}
              imageAlt={order.imageMeta?.alt || order.offerTitle || `${order.quantity} ${order.unit}`}
              illustrative={order.imageMeta?.illustrative === true}
            />
          }
          leadingVariant="image"
        />
      ))}
      {requests.slice(0, 2).map((request) => {
        const status = requestStatus(request, t);
        return (
          <ProductCard
            key={request.id}
            title={request.extracted.productName || request.title || t("home.request.productReview")}
            meta={request.extracted.quantity ? `${request.extracted.quantity} ${request.extracted.unit || ""}`.trim() : t("home.request.quantityPending")}
            status={status.label}
            statusTone={status.tone}
            actionLabel={status.action}
            onPress={() => navigation.navigate("ScanResult", { requestId: request.id })}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loadingScreen: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 720, alignSelf: "center", padding: 16, paddingTop: 14, paddingBottom: 40, gap: 14 },
  heroPanel: {
    position: "relative",
    minHeight: 142,
    overflow: "hidden",
    justifyContent: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(64,64,65,0.22)",
    borderLeftWidth: 5,
    borderLeftColor: colors.brandDark,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 22,
    shadowColor: colors.brandDark,
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.12,
    shadowRadius: 22,
    elevation: 4,
  },
  heroCopy: { position: "relative", zIndex: 2, maxWidth: "82%", gap: 8 },
  heroEyebrowRow: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.62)", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.86)", paddingHorizontal: 10, paddingVertical: 6 },
  heroPulse: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary, borderWidth: 2, borderColor: colors.brandDark },
  heroHalo: { position: "absolute", width: 190, height: 190, borderRadius: 95, right: -62, bottom: -104, backgroundColor: "rgba(255,255,255,0.18)" },
  heroOrbit: { position: "absolute", width: 114, height: 114, borderRadius: 57, right: 18, top: -54, borderWidth: 1, borderColor: "rgba(255,255,255,0.38)" },
  heroPlane: { position: "absolute", width: 260, height: 74, right: -86, top: 47, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.12)", transform: [{ rotate: "-18deg" }] },
  heroMark: { position: "absolute", right: 23, bottom: 21, width: 54, height: 54, opacity: 0.58 },
  greeting: { color: colors.brandDark, fontSize: 13, fontWeight: "800", letterSpacing: 0.15 },
  heroTitle: { color: colors.text, fontSize: 30, lineHeight: 35, fontWeight: "900", letterSpacing: -0.6 },
  actionGrid: { flexDirection: "row", gap: 9, marginTop: -28, marginBottom: 4, paddingHorizontal: 10, zIndex: 3 },
  secondaryActions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  previewList: { gap: 9 },
  sectionBlock: { gap: 10, marginTop: 6 },
  sectionHeader: { marginTop: 5, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  sectionTitle: { flex: 1, color: colors.text, fontSize: 19, lineHeight: 24, fontWeight: "900", letterSpacing: -0.2 },
  sectionCount: { minWidth: 28, height: 28, borderRadius: 14, backgroundColor: colors.highlight, color: colors.brandDark, textAlign: "center", textAlignVertical: "center", lineHeight: 28, fontSize: 12, fontWeight: "900" },
  pendingBlock: { gap: 10, paddingTop: 8 },
  pendingHeading: { borderLeftWidth: 4, borderLeftColor: colors.primary, paddingLeft: 12, paddingVertical: 2 },
  pendingHelp: { color: colors.mutedText, fontSize: 14, lineHeight: 20 },
  loadNotice: { gap: 8, padding: 14, borderRadius: 12, backgroundColor: "#FFF5EE", borderWidth: 1, borderColor: "#E4CABB" },
  loadNoticeTitle: { color: colors.text, fontWeight: "800", fontSize: 15, lineHeight: 21 },
  loadNoticeText: { color: colors.text, fontSize: 14, lineHeight: 20 },
});
