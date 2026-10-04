import { readJourneyDraft, writeJourneyDraft, clearJourneyDraft } from "../../utils/journeyDrafts";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { buyerCheckoutReturnUrl, buyerReviewAmount } from "../../utils/buyerJourney";
import { sellerCanFulfill, sellerNeedsPreparation } from "../../utils/sellerJourney";
import { AppAlert as Alert } from "../../utils/appAlert";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  AppState,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  RouteProp,
  useFocusEffect,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  AllwainCheckoutResponse,
  AllwainAuditResponse,
  AllwainContract,
  AllwainCarrierShipment,
  AllwainMarketRequest,
  AllwainOffer,
  AllwainOrder,
  AllwainPaymentConfig,
  AllwainRecurringPlan,
  StructuredRecurringOrder,
  API_BASE_URL,
  apiGet,
  apiAuthGet,
  apiAuthPatch,
  apiAuthPost,
} from "../../config/api";
import { useAuthStore } from "../../store/auth.store";
import { captureAuthSession } from "../../store/authSessionBridge";
import {
  CHECKOUT_REVIEW_NOTICE, CHECKOUT_UNKNOWN_NOTICE, checkoutBlockReason,
  checkoutPaymentActionable, refreshBuyerCheckoutOrder, runBuyerCheckout, unresolvedRecurringOrder,
} from "../../utils/buyerCheckout";
import { colors } from "../../theme/colors";
import OfferOrderForm, {
  type OfferDeliveryDraft,
} from "../../components/OfferOrderForm";
import OfferPurchaseWizard from "../../components/OfferPurchaseWizard";
import DeliveryCheckpointPanel from "../../components/DeliveryCheckpointPanel";
import CatalogOfferWizard, {
  type CatalogOfferDraft,
} from "../../components/CatalogOfferWizard";
import MarketRequestOfferWizard, {
  type MarketOfferDraft,
} from "../../components/MarketRequestOfferWizard";
import {
  ProposalCountdown,
  nearestProposalDuration,
} from "../../components/ProposalValidityControl";
import OrderReviewPanel from "../../components/OrderReviewPanel";
import ReputationModal from "../../components/ReputationModal";
import OrderCompliancePanel from "../../components/OrderCompliancePanel";
import {
  BigActionButton,
  EmptyState,
  OfferCard,
  OrderCard,
  PublicationImage,
} from "../../components/design-system";
import {
  CalendarClock,
  Check,
  CreditCard,
  MessageCircle,
  PackagePlus,
  ShoppingBag,
} from "lucide-react-native";
import type {
  MainTabParamList,
  RootStackParamList,
} from "../../navigation/types";
import { openExternalUrl } from "../../utils/openExternalUrl";
import { downloadAuthenticatedFile } from "../../utils/downloadAuthenticatedFile";
import { formatCurrency, formatMinorCurrency } from "../../utils/format";
import {
  ORANGES_ILLUSTRATIVE_IMAGE,
  ORANGES_DEMO_OFFER_ID,
  isPinnedOrangesOffer,
  preferredOrangesOffer,
  resolveOfferDeepLink,
} from "../../data/demoOffers";
import { trackAnalyticsEvent } from "../../analytics";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { allwainWebAppReturnUrl } from "../../utils/webAppUrl";
import {
  isAllwainPaymentEnvironmentReady,
  isAllwainStripeTestMarketplace,
} from "../../utils/allwainPaymentEnvironment";
import type { AppLocale, TranslationKey } from "../../i18n";

type Translate = (
  key: TranslationKey,
  replacements?: Record<string, string | number>,
) => string;

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

const EMPTY_DRAFT: MarketOfferDraft = {
  price: "",
  availableQuantity: "",
  deliveryEstimate: "",
  description: "",
  validForMinutes: 10_080,
};

const EMPTY_CATALOG_DRAFT: CatalogOfferDraft = {
  title: "",
  productKind: "goods",
  price: "",
  currency: "EUR",
  unit: "ud",
  availableQuantity: "",
  minQuantity: "1",
  quantityStep: "1",
  preorder: false,
  preorderChargeDeadline: "",
  deliveryEstimate: "",
  shippingWeightKgPerUnit: "",
  description: "",
  foodCategory: "",
  ownProduction: null,
  originCountry: "ES",
  originRegion: "",
  responsibleOperator: "",
};

type InventoryDraft = {
  stockQuantity: string;
  minQuantity: string;
  quantityStep: string;
};

function agreementStatus(contract: AllwainContract, userId?: string) {
  if (contract.status === "accepted") return "Formalizado";
  if (contract.status === "rejected") return "Rechazado o cancelado";
  if (contract.providerUserId === userId && !contract.providerAcceptedAt) {
    return "Requiere tu confirmación";
  }
  if (contract.requesterUserId === userId && !contract.providerAcceptedAt) {
    return "Esperando al proveedor";
  }
  return "Pendiente de ambas partes";
}

function hasAccepted(contract: AllwainContract, userId?: string) {
  if (!userId) return false;
  return Boolean(
    (contract.requesterUserId === userId && contract.requesterAcceptedAt) ||
    (contract.providerUserId === userId && contract.providerAcceptedAt),
  );
}

function isOwnOffer(offer: AllwainOffer, userId?: string) {
  return offer.ownerUserId === userId || offer.provider?.id === userId;
}

function isOrangesPilotOffer(offer: AllwainOffer) {
  return isPinnedOrangesOffer(offer);
}

function isDemoOffer(offer: AllwainOffer) {
  return offer.meta?.demo === true && offer.meta?.checkoutEnabled === false;
}

function offerMetaText(offer: AllwainOffer, key: string) {
  const value = offer.meta?.[key];
  return typeof value === "string" ? value : null;
}

function offerMetaNumber(offer: AllwainOffer, key: string) {
  const value = offer.meta?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function offerInventory(offer: AllwainOffer, unitFallback = "unidad") {
  const minQuantity = offerMetaNumber(offer, "minQuantity") || 1;
  const quantityStep = offerMetaNumber(offer, "quantityStep") || 1;
  const stockQuantity = offerMetaNumber(offer, "stockQuantity");
  const availableQuantity = offerMetaNumber(offer, "availableQuantity");
  return {
    unit: offerMetaText(offer, "unit") || unitFallback,
    minQuantity,
    quantityStep,
    stockQuantity,
    availableQuantity,
    reservedQuantity: offerMetaNumber(offer, "reservedQuantity") || 0,
    soldQuantity: offerMetaNumber(offer, "soldQuantity") || 0,
    managed:
      offer.meta?.inventoryManaged === true || availableQuantity !== null,
  };
}

function isOfferSoldOut(offer: AllwainOffer) {
  const inventory = offerInventory(offer);
  return (
    offer.allwainStatus === "sold_out" ||
    (inventory.managed &&
      (inventory.availableQuantity === null ||
        inventory.availableQuantity < inventory.minQuantity))
  );
}

function quantityText(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : String(value).replace(".", ",");
}

function moneyText(amount?: number | null, currency = "eur") {
  if (typeof amount !== "number") return "-";
  return formatMinorCurrency(amount, currency);
}

function paymentStatusText(contract: AllwainContract) {
  switch (contract.paymentStatus) {
    case "awaiting_payment":
      return contract.paymentMode === "preorder"
        ? "Tarjeta pendiente"
        : "Pago pendiente";
    case "checkout_open":
      return "Pago iniciado";
    case "payment_processing":
      return "Pago en proceso";
    case "payment_method_saved":
      return "Reserva preparada";
    case "requires_customer_action":
      return "Confirmación bancaria pendiente";
    case "payment_failed":
      return "Pago rechazado";
    case "paid":
      return "Pagado";
    case "partially_refunded":
      return "Reembolso parcial";
    case "refund_pending":
      return "Reembolso en proceso";
    case "refunded":
      return "Reembolsado";
    case "legacy_confirmed":
      return "Confirmado sin pago online";
    default:
      return "Pendiente";
  }
}

function fulfillmentStatusText(status?: string) {
  switch (status) {
    case "pending":
      return "Pendiente de preparación";
    case "preparing":
      return "En preparación";
    case "ready":
      return "Listo para entregar";
    case "dispatched":
      return "En reparto";
    case "delivered":
      return "Entregado";
    case "completed":
      return "Finalizado por el cliente";
    default:
      return "Aún no iniciado";
  }
}

function inventoryStatusText(status?: string) {
  if (status === "reserved") return "Reservado";
  if (status === "committed") return "Confirmado";
  if (status === "released") return "Liberado";
  return "Pendiente";
}

function transferStatusText(status?: string) {
  if (status === "completed" || status === "transferred") return "Liquidado";
  if (status === "processing" || status === "partially_transferred") {
    return "En proceso";
  }
  if (status === "transfer_failed") return "Necesita revisión";
  if (status === "not_required") return "No necesario";
  return "Pendiente";
}

function orderJourneySteps(order: AllwainOrder) {
  const paid = ["paid", "partially_refunded", "legacy_confirmed"].includes(
    order.paymentStatus,
  );
  const cardReady =
    paid ||
    ["payment_method_saved", "requires_customer_action"].includes(
      order.paymentStatus,
    );
  const fulfillmentRank: Record<string, number> = {
    pending: 0,
    preparing: 1,
    ready: 2,
    dispatched: 3,
    delivered: 4,
    completed: 5,
  };
  const rank = fulfillmentRank[order.fulfillmentStatus] || 0;
  const stages = [
    { label: order.paymentMode === "preorder" ? "Reserva" : "Pedido", done: true },
    ...(order.paymentMode === "preorder"
      ? [{ label: "Tarjeta", done: cardReady }]
      : []),
    { label: "Pago", done: paid },
    { label: "Preparación", done: rank >= 2 },
    { label: "Entrega", done: rank >= 4 },
  ];
  const currentIndex = stages.findIndex((stage) => !stage.done);
  return stages.map((stage, index) => ({
    ...stage,
    current: currentIndex === index,
  }));
}

function auditEventLabel(eventType: string) {
  const labels: Record<string, string> = {
    "order.audit_baseline_created": "Inicio del registro verificable",
    "order.created": "Pedido creado",
    "order.status_changed": "Estado del pedido actualizado",
    "order.payment_status_changed": "Estado del pago actualizado",
    "order.canceled": "Pedido cancelado",
    "order.reservation_expired": "Reserva caducada",
    "order.reservation_reactivated": "Reserva reactivada",
    "order.preorder_reminder_scheduled": "Recordatorio de reserva enviado",
    "chat.message_sent": "Mensaje enviado",
    "reputation.review_published": "Opinión publicada",
    "reputation.review_responded": "Opinión respondida",
    "reputation.review_reported": "Opinión enviada a revisión",
    "reputation.review_hidden": "Opinión ocultada por moderación",
    "payment.checkout_session_created": "Pago iniciado",
    "payment.checkout_claimed": "Pago vinculado al pedido",
    "payment.succeeded": "Pago confirmado",
    "payment.refund_claimed": "Reembolso solicitado",
    "payment.refund_confirmed": "Reembolso confirmado",
    "payment.transfers_synchronized": "Reparto del pago actualizado",
    "payment.transfer_failed": "No se pudo completar un reparto",
    "traceability.lot_assigned": "Lote asignado al pedido",
    "incident.opened": "Incidencia comunicada",
  };
  if (labels[eventType]) return labels[eventType];
  if (eventType.startsWith("document.")) return "Documento emitido";
  if (eventType.startsWith("fulfillment.")) return "Entrega actualizada";
  if (eventType.startsWith("payment.dispute_")) return "Disputa de pago actualizada";
  if (eventType.startsWith("payment.reconciliation_")) return "Conciliación de pago realizada";
  if (eventType.startsWith("payment.")) return "Movimiento de pago registrado";
  if (eventType.startsWith("seller.payout_")) return "Ingreso bancario actualizado";
  if (eventType.startsWith("incident.")) return "Incidencia actualizada";
  return "Actividad registrada";
}

function sellerFulfillmentAction(status?: string) {
  if (status === "pending" || status === "not_started") {
    return { action: "prepare", label: "Empezar preparación" };
  }
  if (status === "preparing")
    return { action: "ready", label: "Marcar como listo" };
  if (status === "ready")
    return { action: "dispatch", label: "Iniciar entrega" };
  if (status === "dispatched")
    return { action: "deliver", label: "Marcar como entregado" };
  return null;
}

function carrierShipmentStatus(status?: string | null) {
  if (status === "delivered") return "Entregado por la mensajería";
  if (status === "in_transit") return "En camino";
  if (status === "announced" || status === "announcing") return "Preparando recogida";
  if (status === "failed") return "Necesita revisión";
  if (status === "returned") return "Devuelto";
  if (status === "creating") return "Creando envío";
  if (status === "uncertain") return "Pendiente de comprobar con la mensajería";
  return "Pendiente de crear";
}

function orderErrorMessage(code: string, offer: AllwainOffer) {
  const inventory = offerInventory(offer);
  if (code === "MINIMUM_ORDER_NOT_MET") {
    return `El pedido mínimo es de ${quantityText(inventory.minQuantity)} ${inventory.unit}.`;
  }
  if (code === "INVALID_QUANTITY_STEP") {
    return `La cantidad debe aumentar de ${quantityText(inventory.quantityStep)} en ${quantityText(inventory.quantityStep)} ${inventory.unit}.`;
  }
  if (code === "MAXIMUM_ORDER_EXCEEDED")
    return "La cantidad supera el máximo permitido.";
  if (code === "INSUFFICIENT_STOCK")
    return "No queda stock suficiente para esa cantidad.";
  if (code === "OFFER_TERMS_CHANGED")
    return "La oferta ha cambiado. Actualiza la ficha y revisa las condiciones antes de confirmar.";
  if (code === "INVALID_ORDER_QUANTITY")
    return "Introduce una cantidad válida.";
  return code || "No se pudo registrar el pedido.";
}

function parseNumber(value: string) {
  return Number(value.trim().replace(",", "."));
}

function allwainReturnUrl(path: "payment-return" | "connect-return") {
  if (Platform.OS === "web") {
    const location = (globalThis as any)?.location;
    const returnUrl = allwainWebAppReturnUrl(location);
    if (returnUrl) return returnUrl;
  }
  return path === "payment-return" ? "allwain://ofertas" : "allwain://perfil";
}

function quantityLabel(request: AllwainMarketRequest, t: Translate) {
  const quantity = request.extracted.quantity;
  if (!quantity) return t("market.quantityPending");
  return `${quantity} ${request.extracted.unit || t("market.units")}`;
}

function deliveryMethodLabel(
  method?: AllwainMarketRequest["extracted"]["deliveryMethod"],
  t?: Translate,
) {
  if (method === "shipping") return t ? t("offers.shipping") : "Envío";
  if (method === "pickup") return t ? t("offers.pickup") : "Recogida";
  if (method === "in_person") return t ? t("offers.inPerson") : "Entrega personal";
  return t ? t("offers.deliveryPending") : "Método por concretar";
}

function offerCardDetail(
  offer: AllwainOffer,
  inventory: ReturnType<typeof offerInventory>,
  previousOrders: number,
  locale: AppLocale,
  t: Translate,
  demoPrefix = false,
) {
  const parts: string[] = [];
  if (demoPrefix) parts.push(t("card.demo"));
  parts.push(offer.provider?.name || t("home.buyer.seller"));
  if (offer.provider?.reviewCount) {
    const score = Number(offer.provider.score || 0).toLocaleString(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    const reviews = offer.provider.reviewCount === 1
      ? t("offers.reviewOne")
      : t("offers.reviewMany", { count: offer.provider.reviewCount });
    parts.push(`${score}/5 (${reviews})`);
  } else {
    parts.push(t("offers.noReviews"));
  }
  parts.push(t("offers.minimum", {
    quantity: quantityText(inventory.minQuantity),
    unit: inventory.unit,
  }));
  if (inventory.availableQuantity !== null) {
    parts.push(t("offers.availableQuantity", {
      quantity: `${quantityText(inventory.availableQuantity)} ${inventory.unit}`,
    }));
  }
  if (previousOrders) {
    parts.push(previousOrders === 1
      ? t("offers.previousOne")
      : t("offers.previousMany", { count: previousOrders }));
  }
  return parts.join(" · ");
}

function contractDeliveryText(contract: AllwainContract) {
  const address = contract.deliveryAddress?.formatted;
  if (contract.deliveryChannel === "local_connector") {
    return address
      ? `Reparto local Allwain a ${address}`
      : "Reparto local con Conector";
  }
  if (contract.deliveryChannel === "carrier" || contract.deliveryMethod === "shipping") {
    return address ? `Envío a ${address}` : "Envío a domicilio";
  }
  if (contract.deliveryMethod === "in_person") {
    return address ? `Entrega personal en ${address}` : "Entrega personal";
  }
  return "Recogida acordada con el proveedor";
}

function contractRecurringOrder(contract: AllwainContract) {
  const embedded = contract.deliveryAddress?.recurringOrder;
  if (embedded && typeof embedded === "object") {
    return embedded as unknown as StructuredRecurringOrder;
  }
  return contract.recurringOrder || null;
}

function recurringIntervalLabel(interval: AllwainRecurringPlan["interval"]) {
  if (interval === "weekly") return "Cada semana";
  if (interval === "biweekly") return "Cada dos semanas";
  return "Cada mes";
}

function recurringStatusLabel(status: AllwainRecurringPlan["status"]) {
  const labels: Record<AllwainRecurringPlan["status"], string> = {
    pending_initial_payment: "Se activa tras el primer pago",
    active: "Activa",
    paused: "En pausa",
    requires_action: "Necesita revisar el pago",
    canceled: "Cancelada",
    completed: "Terminada",
  };
  return labels[status];
}

function recurringFailureText(
  plan: AllwainRecurringPlan,
  isSeller: boolean,
) {
  if (plan.status !== "requires_action") return null;
  if (
    plan.lastFailureCode ===
    "RECURRING_CARRIER_PRICE_REAPPROVAL_REQUIRED"
  ) {
    return isSeller
      ? "El transporte supera ahora el máximo autorizado por el cliente. No se ha cobrado ni creado el envío."
      : "El transporte supera el máximo que autorizaste. No se ha cobrado ni creado el envío; puedes mantener el plan para comprobar la próxima fecha o cancelarlo.";
  }
  if (plan.lastFailureCode === "RECURRING_PAYMENT_METHOD_MISSING") {
    return isSeller
      ? "El cliente debe volver a preparar su tarjeta. No se ha realizado ningún cobro."
      : "Necesitamos que vuelvas a preparar tu tarjeta antes de programar otra entrega.";
  }
  if (plan.lastFailureCode === "RECURRING_TERMS_CHANGED") {
    return "Las condiciones han cambiado. Cancela esta programación y crea una nueva para aceptarlas de forma expresa.";
  }
  return "No se ha realizado el siguiente cobro. Revisa la programación antes de continuar.";
}

type PageInfo = {
  hasNextPage?: boolean;
  nextCursor?: string | null;
};

function mergePage<T extends { id: string }>(current: T[], incoming: T[]) {
  const byId = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => byId.set(item.id, item));
  return Array.from(byId.values());
}

export default function OffersScreen() {
  const { locale, t } = useAppTranslation();
  const route = useRoute<RouteProp<MainTabParamList, "Ofertas">>();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const appMode = useAuthStore((state) => state.appMode);
  const setAppMode = useAuthStore((state) => state.setAppMode);
  const userId = user?.id || "";
  const insets = useSafeAreaInsets();
  const [sellerSection, setSellerSection] = useState<"orders" | "offers" | "preparation">("orders");
  const [termsExpanded, setTermsExpanded] = useState<Record<string, boolean>>({});
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [testDetailsOpen, setTestDetailsOpen] = useState(false);
  const returningContract = useRef<string | null>(null);
  const resumeRevision = useRef(0);
  const ordersY = useRef(0);
  const contractPositions = useRef<Record<string, number>>({});
  const cardPositions = useRef<Record<string, number>>({});
  const paymentPositions = useRef<Record<string, number>>({});
  const scrollY = useRef(0);
  const contractViews = useRef<Record<string, View | null>>({});
  const paymentViews = useRef<Record<string, View | null>>({});
  const checkoutAction = useRef(0);
  const loadRevision = useRef(0);
  const explicitOrderRevision = useRef(0);
  const explicitOrders = useRef(new Map<string, {revision:number; order:AllwainOrder}>());
  const [preparedTotals, setPreparedTotals] = useState<Record<string,string>>({});
  const [preparingReview, setPreparingReview] = useState<string | null>(null);
  const reviewRevision = useRef(0);
  useEffect(() => () => { checkoutAction.current++; loadRevision.current++; }, [userId]);
  const isSeller = appMode === "sell";
  const [buyerSection, setBuyerSection] = useState<"orders" | "offers">("offers");
  useEffect(() => {
    const params = route.params;
    if (params?.contractId || params?.orderId || params?.section === "orders") setSellerSection("orders");
    else if (params?.section === "preparation") setSellerSection("preparation");
    else if (params?.requestId || params?.section === "offers") setSellerSection("offers");
    if (params?.contractId || params?.orderId || params?.section === "orders") setBuyerSection("orders");
    else if (params?.offerId || params?.section === "offers") setBuyerSection("offers");
  }, [route.params]);
  const platformDirect =
    user?.participation?.seller?.commercialModel === "platform_direct";

  const [offers, setOffers] = useState<AllwainOffer[]>([]);
  const [contracts, setContracts] = useState<AllwainContract[]>([]);
  const [orders, setOrders] = useState<AllwainOrder[]>([]);
  const [recurringPlans, setRecurringPlans] = useState<AllwainRecurringPlan[]>(
    [],
  );
  const [marketRequests, setMarketRequests] = useState<AllwainMarketRequest[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [offersRequestSettled, setOffersRequestSettled] = useState(false);
  const [verifiedSections, setVerifiedSections] = useState({ offers: false, orders: false, market: false });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const retireCheckoutAction = useCallback(() => {
    checkoutAction.current++;
    setBusyId(value => value?.startsWith("payment:") || value?.startsWith("recurring:") ? null : value);
  }, []);
  const selectContract = useCallback((contractId: string | null) => {
    // Retire before changing the selection: an old GET must not launch checkout.
    retireCheckoutAction();
    reviewRevision.current++;
    setPreparedTotals({});
    setPreparingReview(null);
    setExpandedId(contractId);
  }, [retireCheckoutAction]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null,
  );
  const [offerDraft, setOfferDraft] = useState<MarketOfferDraft>(EMPTY_DRAFT);
  const offerDraftRevision = useRef(0);
  const [catalogReady, setCatalogReady] = useState(false);
  const [marketDraftReady, setMarketDraftReady] = useState(false);
  const [catalogFormOpen, setCatalogFormOpen] = useState(false);
  const [catalogDraft, setCatalogDraft] =
    useState<CatalogOfferDraft>(EMPTY_CATALOG_DRAFT);
  const [inventoryEditId, setInventoryEditId] = useState<string | null>(null);
  const [inventoryDraft, setInventoryDraft] = useState<InventoryDraft>({
    stockQuantity: "",
    minQuantity: "1",
    quantityStep: "1",
  });
  const [reservationConsents, setReservationConsents] = useState<
    Record<string, boolean>
  >({});
  const [commercialTermsConsents, setCommercialTermsConsents] = useState<
    Record<string, boolean>
  >({});
  const [recurringConsents, setRecurringConsents] = useState<
    Record<string, boolean>
  >({});
  const [expandedAuditOrderId, setExpandedAuditOrderId] = useState<
    string | null
  >(null);
  const [auditByOrder, setAuditByOrder] = useState<
    Record<string, AllwainAuditResponse>
  >({});
  const [selectedOffer, setSelectedOffer] = useState<AllwainOffer | null>(null);
  const [shipmentsByOrder, setShipmentsByOrder] = useState<
    Record<string, AllwainCarrierShipment | null>
  >({});
  const [reputationUserId, setReputationUserId] = useState<string | null>(null);
  const [offersPage, setOffersPage] = useState<PageInfo>({});
  const [contractsPage, setContractsPage] = useState<PageInfo>({});
  const [ordersPage, setOrdersPage] = useState<PageInfo>({});
  const [marketPage, setMarketPage] = useState<PageInfo>({});
  const [paymentConfig, setPaymentConfig] =
    useState<AllwainPaymentConfig | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const agreementsY = useRef(0);
  const consumedFocusKey = useRef<string | null>(null);
  const hydratingFocusKey = useRef<string | null>(null);

  useEffect(() => {
    let current = true;
    setCatalogReady(false);
    explicitOrders.current.clear();
    explicitOrderRevision.current = 0;
    setCatalogFormOpen(false);
    setSelectedRequestId(null);
    setSelectedOffer(null);
    setReservationConsents({}); setCommercialTermsConsents({}); setRecurringConsents({});
    void readJourneyDraft<CatalogOfferDraft>(userId, "catalog-offer").then(saved => {
      if (!current) return;
      setCatalogDraft(saved ? {...EMPTY_CATALOG_DRAFT, ...saved} : EMPTY_CATALOG_DRAFT);
      setCatalogReady(true);
    });
    return () => { current = false; offerDraftRevision.current++; resumeRevision.current++; };
  }, [userId]);

  function saveCatalogDraft(patch: Partial<CatalogOfferDraft>) {
    setError(null);
    setCatalogDraft(current => {
      const next = {...current, ...patch};
      void writeJourneyDraft(userId, "catalog-offer", next).then(ok => {
        if (!ok) setError("No se ha podido guardar el borrador en este dispositivo. Mantén la pantalla abierta.");
      });
      return next;
    });
  }
  function saveMarketDraft(patch: Partial<MarketOfferDraft>) {
    setError(null);
    setOfferDraft(current => {
      const next = {...current, ...patch};
      if (selectedRequestId && marketDraftReady) void writeJourneyDraft(userId, "market-offer:" + selectedRequestId, next).then(ok => {
        if (!ok) setError("No se ha podido guardar el borrador en este dispositivo. Mantén la pantalla abierta.");
      });
      return next;
    });
  }
  function discardSellerDraft(kind: "catalog" | "market") {
    if (busyId) return;
    Alert.alert("Descartar borrador", "Se borrará lo que aún no has publicado.", [
      {text:"Seguir editando",style:"cancel"},
      {text:"Descartar",style:"destructive",onPress:() => {
        if (kind === "catalog") {
          void clearJourneyDraft(userId, "catalog-offer");
          void clearJourneyDraft(userId, "catalog-offer-step");
          setCatalogDraft(EMPTY_CATALOG_DRAFT); setCatalogFormOpen(false);
        } else if (selectedRequestId) {
          void clearJourneyDraft(userId, "market-offer:" + selectedRequestId);
          void clearJourneyDraft(userId, "market-offer-step:" + selectedRequestId);
          setSelectedRequestId(null);
          setMarketDraftReady(false);
          offerDraftRevision.current++;
          setError(null);
        }
      }},
    ]);
  }
  function scrollToContract(id: string, payment = false) {
    const target = payment ? paymentViews.current[id] : contractViews.current[id];
    if (target && scrollRef.current) {
      target.measureInWindow((_x, targetY) => scrollRef.current?.getNativeScrollRef()?.measureInWindow((_sx: number, containerY: number) => {
        scrollRef.current?.scrollTo({y:Math.max(0, scrollY.current + targetY - containerY - 8),animated:true});
      }));
      return;
    }
    const y = ordersY.current + (contractPositions.current[id] || 0) +
      (payment ? (cardPositions.current[id] || 0) + (paymentPositions.current[id] || 0) : 0);
    scrollRef.current?.scrollTo({y: Math.max(0,y - 8),animated:true});
  }

  // Returning from the external browser only re-reads server state. It never
  // creates a Checkout session or treats a success URL as proof of payment.
  const paymentSnapshot = useRef<{contracts: AllwainContract[]; orders: AllwainOrder[]}>({contracts, orders});
  paymentSnapshot.current = {contracts, orders};
  const recheckReturnedPayment = useCallback(async () => {
    const id = returningContract.current;
    if (!id || !userId || isSeller || !navigation.isFocused()) return;
    const session = captureAuthSession();
    const revision = ++resumeRevision.current;
    const current = () => session.isCurrent() && revision === resumeRevision.current && navigation.isFocused();
    setCheckingPayment(true);
    setError(null);
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const contract = await apiAuthGet<AllwainContract>("/allwain/contracts/" + encodeURIComponent(id));
        if (!current() || contract.requesterUserId !== userId) return;
        setContracts(items => mergePage(items,[contract]));
        const known: AllwainOrder | undefined = paymentSnapshot.current.orders.find(item => item.contractId === id);
        if (known) {
          const order: AllwainOrder = await apiAuthGet<AllwainOrder>("/allwain/payments/orders/" + encodeURIComponent(known.id));
          if (!current() || order.buyerUserId !== userId || order.contractId !== id) return;
          publishCheckoutOrder(order);
        }
        if (!["payment_processing", "checkout_open"].includes(contract.paymentStatus || "")) break;
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1500));
      }
      if (current()) setNotice("Estado consultado. El pedido muestra la confirmación recibida del servidor.");
    } catch (err: any) {
      if (current()) setError(err?.message || "No pudimos comprobar el pago. Puedes volver a consultar su estado.");
    } finally { if (current()) setCheckingPayment(false); }
  }, [userId, isSeller, navigation]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => { if (state === "active") void recheckReturnedPayment(); });
    const resumed = () => { if (typeof document === "undefined" || document.visibilityState === "visible") void recheckReturnedPayment(); };
    if (Platform.OS === "web") globalThis.addEventListener?.("focus", resumed);
    return () => { subscription.remove(); resumeRevision.current++; if (Platform.OS === "web") globalThis.removeEventListener?.("focus", resumed); };
  }, [recheckReturnedPayment]);
  useEffect(() => {
    if (route.params?.contractId && !isSeller) {
      returningContract.current = route.params.contractId;
      void recheckReturnedPayment();
    }
  }, [route.params?.contractId, route.params?.focusKey, isSeller, recheckReturnedPayment]);

  function openPrivateMessage(targetId?: string | null, targetName?: string | null) {
    if (!targetId || targetId === userId) return;
    navigation.navigate("ChatThread", {
      targetUserId: targetId,
      targetName: targetName || "Usuario Allwain",
      title: "Mensaje privado",
    });
  }

  const loadData = useCallback(async () => {
    const session = captureAuthSession();
    const revision = ++loadRevision.current;
    const initialOrderRevision = explicitOrderRevision.current;
    setLoading(true);
    setOffersRequestSettled(false);
    setVerifiedSections({ offers: false, orders: false, market: false });
    setError(null);
    const marketPromise = isSeller
      ? apiAuthGet<{ items?: AllwainMarketRequest[]; pageInfo?: PageInfo }>(
          "/allwain/market/requests?limit=30",
        )
      : Promise.resolve({
          items: [] as AllwainMarketRequest[],
          pageInfo: {} as PageInfo,
        });
    const [
      offersResult,
      ownOffersResult,
      contractsResult,
      marketResult,
      ordersResult,
      recurringResult,
      paymentConfigResult,
    ] = await Promise.allSettled([
        apiAuthGet<{ items?: AllwainOffer[]; pageInfo?: PageInfo }>(
          `/allwain/offers?scope=${isSeller ? "mine" : "market"}&limit=30`,
        ),
        isSeller
          ? Promise.resolve({ items: [] as AllwainOffer[] })
          : apiAuthGet<{ items?: AllwainOffer[] }>(
              "/allwain/offers?scope=mine&limit=30",
            ),
        apiAuthGet<{ items?: AllwainContract[]; pageInfo?: PageInfo }>(
          `/allwain/contracts?scope=${isSeller ? "seller" : "buyer"}&limit=30`,
        ),
        marketPromise,
        apiAuthGet<{ items?: AllwainOrder[]; pageInfo?: PageInfo }>(
          `/allwain/payments/orders?scope=${isSeller ? "seller" : "buyer"}&limit=30`,
        ),
        apiAuthGet<{ items?: AllwainRecurringPlan[] }>(
          "/allwain/payments/recurring-plans",
        ),
        apiGet<AllwainPaymentConfig>("/allwain/payments/config"),
      ]);

    if (!session.isCurrent() || revision !== loadRevision.current) return;

    setVerifiedSections({
      offers: offersResult.status === "fulfilled" && ownOffersResult.status === "fulfilled",
      orders: contractsResult.status === "fulfilled" && ordersResult.status === "fulfilled",
      market: marketResult.status === "fulfilled",
    });

    if (offersResult.status === "fulfilled") {
      const marketOrSellerOffers = offersResult.value.items || [];
      const ownOffers =
        ownOffersResult.status === "fulfilled"
          ? ownOffersResult.value.items || []
          : [];
      setOffers(
        isSeller
          ? marketOrSellerOffers
          : mergePage(ownOffers, marketOrSellerOffers),
      );
      setOffersPage(offersResult.value.pageInfo || {});
    }
    setOffersRequestSettled(true);
    if (contractsResult.status === "fulfilled") {
      setContracts((contractsResult.value.items || []).map(contract => {
        const fresher = [...explicitOrders.current.values()].find(item => item.revision > initialOrderRevision && item.order.contractId === contract.id);
        return fresher ? {...contract,paymentStatus:fresher.order.paymentStatus} : contract;
      }));
      setContractsPage(contractsResult.value.pageInfo || {});
    }
    if (marketResult.status === "fulfilled") {
      setMarketRequests(marketResult.value.items || []);
      setMarketPage(marketResult.value.pageInfo || {});
    }
    if (ordersResult.status === "fulfilled") {
      setOrders(mergePage(ordersResult.value.items || [], [...explicitOrders.current.values()].filter(item => item.revision > initialOrderRevision).map(item => item.order)));
      setOrdersPage(ordersResult.value.pageInfo || {});
    }
    if (recurringResult.status === "fulfilled") {
      setRecurringPlans(recurringResult.value.items || []);
    }
    setPaymentConfig(
      paymentConfigResult.status === "fulfilled"
        ? paymentConfigResult.value
        : null,
    );

    if (
      [
        offersResult,
        ownOffersResult,
        contractsResult,
        marketResult,
        ordersResult,
        recurringResult,
      ].some(
        (result) => result.status === "rejected",
      )
    ) {
      setError(
        "Parte de la información no pudo actualizarse. Lo disponible sigue visible.",
      );
    }
    setLoading(false);
  }, [isSeller]);

  async function loadMoreOffers() {
    if (!offersPage.nextCursor) return;
    setBusyId("more:offers");
    try {
      const response = await apiAuthGet<{
        items?: AllwainOffer[];
        pageInfo?: PageInfo;
      }>(
        `/allwain/offers?scope=${isSeller ? "mine" : "market"}&limit=30&cursor=${encodeURIComponent(offersPage.nextCursor)}`,
      );
      setOffers((current) => mergePage(current, response.items || []));
      setOffersPage(response.pageInfo || {});
    } catch (err: any) {
      setError(err?.message || "No se pudieron cargar más ofertas.");
    } finally {
      setBusyId(null);
    }
  }

  async function loadMoreMarketRequests() {
    if (!marketPage.nextCursor) return;
    setBusyId("more:market");
    try {
      const response = await apiAuthGet<{
        items?: AllwainMarketRequest[];
        pageInfo?: PageInfo;
      }>(
        `/allwain/market/requests?limit=30&cursor=${encodeURIComponent(marketPage.nextCursor)}`,
      );
      setMarketRequests((current) =>
        mergePage(current, response.items || []),
      );
      setMarketPage(response.pageInfo || {});
    } catch (err: any) {
      setError(err?.message || "No se pudieron cargar más peticiones.");
    } finally {
      setBusyId(null);
    }
  }

  async function loadMoreActivity() {
    if (!contractsPage.nextCursor && !ordersPage.nextCursor) return;
    setBusyId("more:activity");
    try {
      const [contractResult, orderResult] = await Promise.all([
        contractsPage.nextCursor
          ? apiAuthGet<{ items?: AllwainContract[]; pageInfo?: PageInfo }>(
              `/allwain/contracts?scope=${isSeller ? "seller" : "buyer"}&limit=30&cursor=${encodeURIComponent(contractsPage.nextCursor)}`,
            )
          : Promise.resolve({ items: [], pageInfo: {} }),
        ordersPage.nextCursor
          ? apiAuthGet<{ items?: AllwainOrder[]; pageInfo?: PageInfo }>(
              `/allwain/payments/orders?scope=${isSeller ? "seller" : "buyer"}&limit=30&cursor=${encodeURIComponent(ordersPage.nextCursor)}`,
            )
          : Promise.resolve({ items: [], pageInfo: {} }),
      ]);
      setContracts((current) =>
        mergePage(current, contractResult.items || []),
      );
      setOrders((current) => mergePage(current, orderResult.items || []));
      setContractsPage(contractResult.pageInfo || {});
      setOrdersPage(orderResult.pageInfo || {});
    } catch (err: any) {
      setError(err?.message || "No se pudo cargar más actividad.");
    } finally {
      setBusyId(null);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadData();
      void recheckReturnedPayment();
      return () => { retireCheckoutAction(); loadRevision.current++; resumeRevision.current++; reviewRevision.current++; setCheckingPayment(false); setPreparingReview(null); };
    }, [loadData, retireCheckoutAction, recheckReturnedPayment]),
  );

  useEffect(() => {
    const params = route.params;
    if (!params) return;
    const key = `${isSeller ? "sell" : "buy"}:${JSON.stringify(params)}`;
    const knownOrder = params.orderId
      ? orders.find((item) => item.id === params.orderId)
      : undefined;
    const contractId = params.contractId || knownOrder?.contractId;
    const missingOrder = Boolean(
      params.orderId && !orders.some((item) => item.id === params.orderId),
    );
    const missingContract = Boolean(
      contractId && !contracts.some((item) => item.id === contractId),
    );
    const missingOffer = Boolean(
      params.offerId &&
        params.offerId !== ORANGES_DEMO_OFFER_ID &&
        !offers.some((item) => item.id === params.offerId),
    );
    const missingRequest = Boolean(
      isSeller &&
        params.requestId &&
        !marketRequests.some((item) => item.id === params.requestId),
    );
    if (
      !missingOrder &&
      !missingContract &&
      !missingOffer &&
      !missingRequest
    ) {
      return;
    }
    if (hydratingFocusKey.current === key) return;
    hydratingFocusKey.current = key;

    void (async () => {
      try {
        let hydratedOrder = knownOrder;
        if (missingOrder && params.orderId) {
          hydratedOrder = await apiAuthGet<AllwainOrder>(
            `/allwain/payments/orders/${params.orderId}`,
          );
          setOrders((current) => mergePage(current, [hydratedOrder!]));
        }
        const resolvedContractId =
          params.contractId || hydratedOrder?.contractId;
        if (
          resolvedContractId &&
          !contracts.some((item) => item.id === resolvedContractId)
        ) {
          const contract = await apiAuthGet<AllwainContract>(
            `/allwain/contracts/${resolvedContractId}`,
          );
          setContracts((current) => mergePage(current, [contract]));
        }
        if (missingOffer && params.offerId) {
          const offer = await apiAuthGet<AllwainOffer>(
            `/allwain/offers/${params.offerId}`,
          );
          setOffers((current) => mergePage(current, [offer]));
        }
        if (missingRequest && params.requestId) {
          const request = await apiAuthGet<AllwainMarketRequest>(
            `/allwain/market/requests/${params.requestId}`,
          );
          setMarketRequests((current) => mergePage(current, [request]));
        }
      } catch (err: any) {
        setError(
          err?.message ||
            "El aviso apunta a un contenido que ya no está disponible.",
        );
      } finally {
        hydratingFocusKey.current = null;
      }
    })();
  }, [contracts, isSeller, marketRequests, offers, orders, route.params]);

  const sortedContracts = useMemo(
    () =>
      contracts
        .filter((contract) =>
          isSeller
            ? contract.providerUserId === userId
            : contract.requesterUserId === userId,
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [contracts, isSeller, userId],
  );

  const visibleOffers = useMemo(
    () => {
      if (isSeller) return offers.filter((offer) => isOwnOffer(offer, userId));
      const pinnedOffer = preferredOrangesOffer(offers);
      return [
        ...(pinnedOffer ? [pinnedOffer] : []),
        ...offers.filter(
          (offer) =>
            !isPinnedOrangesOffer(offer),
        ),
      ];
    },
    [isSeller, offers, userId],
  );

  const featuredOffers = useMemo(
    () => {
      if (isSeller) return [];
      const offer = preferredOrangesOffer(offers);
      return offer ? [offer] : [];
    },
    [isSeller, offers],
  );

  const stripeTestEnabled = isAllwainStripeTestMarketplace(paymentConfig);
  const paymentEnvironmentReady =
    isAllwainPaymentEnvironmentReady(paymentConfig);

  const ownBuyerOffers = useMemo(
    () =>
      isSeller
        ? []
        : visibleOffers.filter(
            (offer) =>
              isOwnOffer(offer, userId) && !isPinnedOrangesOffer(offer),
          ),
    [isSeller, userId, visibleOffers],
  );

  const regularOffers = useMemo(() => {
    const featuredIds = new Set(featuredOffers.map((offer) => offer.id));
    const ownIds = new Set(ownBuyerOffers.map((offer) => offer.id));
    return visibleOffers.filter(
      (offer) => !featuredIds.has(offer.id) && !ownIds.has(offer.id),
    );
  }, [featuredOffers, ownBuyerOffers, visibleOffers]);

  const selectedMarketRequest = useMemo(
    () =>
      marketRequests.find((request) => request.id === selectedRequestId) ||
      null,
    [marketRequests, selectedRequestId],
  );

  const orderByContract = useMemo(
    () => new Map(orders.map((order) => [order.contractId, order])),
    [orders],
  );

  const visibleRecurringPlans = useMemo(
    () =>
      recurringPlans.filter((plan) =>
        isSeller
          ? plan.sellerUserId === userId
          : plan.buyerUserId === userId,
      ),
    [isSeller, recurringPlans, userId],
  );

  useEffect(() => {
    const params = route.params;
    if (!params) return;
    const focusKey = JSON.stringify(params);
    if (consumedFocusKey.current === focusKey) return;

    if (params.offerId) {
      if (
        params.offerId === ORANGES_DEMO_OFFER_ID &&
        !offersRequestSettled
      ) {
        return;
      }
      const offer = resolveOfferDeepLink(offers, params.offerId);
      if (!offer) return;
      consumedFocusKey.current = focusKey;
      if (typeof offer.price === "number") setSelectedOffer(offer);
      else void sendInterest(offer);
      return;
    }

    if (params.requestId) {
      const request = marketRequests.find(
        (item) => item.id === params.requestId,
      );
      if (!request) return;
      consumedFocusKey.current = focusKey;
      openOfferForm(request);
      return;
    }

    const contractId =
      params.contractId ||
      (params.orderId
        ? orders.find((item) => item.id === params.orderId)?.contractId
        : undefined);
    if (!contractId || !contracts.some((item) => item.id === contractId))
      return;
    consumedFocusKey.current = focusKey;
    selectContract(contractId);
    setTimeout(() => {
      scrollToContract(contractId);
    }, 80);
  }, [
    contracts,
    marketRequests,
    offers,
    offersRequestSettled,
    orders,
    route.params,
    selectContract,
  ]);

  function openOfferForm(request: AllwainMarketRequest) {
    const revision = ++offerDraftRevision.current;
    setMarketDraftReady(false);
    void readJourneyDraft<MarketOfferDraft>(userId, "market-offer:" + request.id).then(saved => {
      if (revision !== offerDraftRevision.current) return;
      if (saved) setOfferDraft(current => ({...current,...saved}));
      setMarketDraftReady(true);
    });
    setError(null);
    setNotice(null);
    setSelectedRequestId(request.id);
    const current = request.myOffer;
    const expiresAt =
      current?.proposalExpiresAt ||
      (typeof current?.meta?.validUntil === "string"
        ? current.meta.validUntil
        : null);
    const remainingMinutes = expiresAt
      ? Math.max(60, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60_000))
      : 10_080;
    setOfferDraft({
      price:
        typeof current?.price === "number"
          ? String(current.price).replace(".", ",")
          : request.extracted.targetPrice
            ? String(request.extracted.targetPrice).replace(".", ",")
            : "",
      availableQuantity:
        typeof current?.meta?.availableQuantity === "number"
          ? String(current.meta.availableQuantity)
          : request.extracted.quantity
            ? String(request.extracted.quantity)
            : "",
      deliveryEstimate:
        (typeof current?.meta?.deliveryEstimate === "string"
          ? current.meta.deliveryEstimate
          : request.extracted.deliveryWindow) || "",
      description: current?.description || "",
      validForMinutes: nearestProposalDuration(remainingMinutes),
    });
  }

  async function closeOfferForm() {
    if (busyId?.startsWith("market:") && selectedRequestId) return;
    if (selectedRequestId && marketDraftReady) {
      const saved = await writeJourneyDraft(userId, "market-offer:" + selectedRequestId, offerDraft);
      if (!saved) { setError("No se ha podido guardar el borrador. Reintenta antes de salir o descártalo expresamente."); return; }
    }
    setSelectedRequestId(null);
    offerDraftRevision.current++;
    setMarketDraftReady(false);
    setError(null);
  }

  async function submitCatalogOffer() {
    const price = parseNumber(catalogDraft.price);
    const availableQuantity = parseNumber(catalogDraft.availableQuantity);
    const minQuantity = parseNumber(catalogDraft.minQuantity);
    const quantityStep = parseNumber(catalogDraft.quantityStep);
    if (!catalogDraft.title.trim() || !Number.isFinite(price) || price <= 0) {
      setError("Completa el producto y un precio mayor que cero.");
      return;
    }
    if (!Number.isFinite(availableQuantity) || availableQuantity <= 0) {
      setError("Indica un stock total mayor que cero.");
      return;
    }
    if (
      !Number.isFinite(minQuantity) ||
      minQuantity <= 0 ||
      minQuantity > availableQuantity
    ) {
      setError(
        "El pedido mínimo debe ser mayor que cero y no superar el stock.",
      );
      return;
    }
    if (!Number.isFinite(quantityStep) || quantityStep <= 0) {
      setError("El incremento de cantidad debe ser mayor que cero.");
      return;
    }
    if (!catalogDraft.deliveryEstimate.trim()) {
      setError("Indica cuándo puedes entregar el pedido.");
      return;
    }
    if (catalogDraft.preorder) {
      const deadline = /^\d{4}-\d{2}-\d{2}$/.test(
        catalogDraft.preorderChargeDeadline,
      )
        ? new Date(`${catalogDraft.preorderChargeDeadline}T23:59:59.999Z`)
        : null;
      if (!deadline || !Number.isFinite(deadline.getTime())) {
        setError("Indica una fecha límite de cobro válida.");
        return;
      }
      if (deadline.getTime() <= Date.now()) {
        setError("La fecha límite de cobro debe ser futura.");
        return;
      }
    }
    if (
      catalogDraft.productKind === "food" &&
      (!catalogDraft.foodCategory.trim() ||
        catalogDraft.ownProduction === null ||
        !/^[A-Za-z]{2}$/.test(catalogDraft.originCountry.trim()) ||
        !catalogDraft.responsibleOperator.trim())
    ) {
      setError("Completa el origen y la persona responsable del alimento.");
      return;
    }

    setBusyId("catalog");
    setError(null);
    setNotice(null);
    try {
      const created = await apiAuthPost<AllwainOffer>("/allwain/offers", {
        title: catalogDraft.title.trim(),
        description:
          catalogDraft.description.trim() || catalogDraft.title.trim(),
        price,
        meta: {
          unit: catalogDraft.unit.trim() || "ud",
          currency: catalogDraft.currency,
          productKind: catalogDraft.productKind,
          category:
            catalogDraft.productKind === "food"
              ? catalogDraft.foodCategory.trim()
              : catalogDraft.productKind,
          locationLabel:
            user?.participation?.seller?.locationLabel || null,
          availableQuantity,
          minQuantity,
          quantityStep,
          saleMode: catalogDraft.preorder ? "preorder" : "immediate",
          preorderChargeDeadlineAt: catalogDraft.preorder
            ? catalogDraft.preorderChargeDeadline
            : null,
          deliveryEstimate: catalogDraft.deliveryEstimate.trim() || null,
          shippingWeightKgPerUnit:
            catalogDraft.productKind !== "service" &&
            !["kg", "g"].includes(catalogDraft.unit.toLowerCase())
              ? parseNumber(catalogDraft.shippingWeightKgPerUnit)
              : null,
        },
        productCompliance: {
          productKind: catalogDraft.productKind,
          foodCategory:
            catalogDraft.productKind === "food"
              ? catalogDraft.foodCategory.trim()
              : null,
          ownProduction:
            catalogDraft.productKind === "food"
              ? catalogDraft.ownProduction
              : null,
          producerName:
            catalogDraft.productKind === "food"
              ? catalogDraft.responsibleOperator.trim()
              : null,
          originCountry:
            catalogDraft.productKind === "food"
              ? catalogDraft.originCountry.trim().toUpperCase()
              : null,
          originRegion:
            catalogDraft.productKind === "food"
              ? catalogDraft.originRegion.trim() || null
              : null,
          responsibleOperator:
            catalogDraft.productKind === "food"
              ? catalogDraft.responsibleOperator.trim()
              : null,
          onlineInfoComplete: true,
          lotTrackingRequired: catalogDraft.productKind === "food",
          nominalUnit: catalogDraft.unit.trim() || "ud",
        },
      });
      const createdInventory = offerInventory(created);
      if (
        !created.id ||
        created.title !== catalogDraft.title.trim() ||
        Math.abs(Number(created.price) - price) > 0.0001 ||
        createdInventory.stockQuantity !== availableQuantity ||
        createdInventory.minQuantity !== minQuantity ||
        createdInventory.quantityStep !== quantityStep
      ) {
        throw new Error("El servidor no confirmó todos los datos de la oferta.");
      }
      void trackAnalyticsEvent("offer_created", {
        offer_type:
          catalogDraft.productKind === "goods" ||
          catalogDraft.productKind === "food" ||
          catalogDraft.productKind === "service"
            ? catalogDraft.productKind
            : "other",
      });
      await clearJourneyDraft(userId, "catalog-offer");
      await clearJourneyDraft(userId, "catalog-offer-step");
      setCatalogDraft(EMPTY_CATALOG_DRAFT);
      setCatalogFormOpen(false);
      setNotice(
        "Oferta publicada. Los compradores ya pueden verla y aceptarla.",
      );
      await loadData();
    } catch (err: any) {
      setError(err?.message || "No se pudo publicar la oferta.");
    } finally {
      setBusyId(null);
    }
  }

  async function submitMarketOffer(request: AllwainMarketRequest) {
    const price = parseNumber(offerDraft.price);
    const availableQuantity = offerDraft.availableQuantity
      ? parseNumber(offerDraft.availableQuantity)
      : undefined;

    if (
      !Number.isFinite(price) ||
      price <= 0 ||
      !offerDraft.deliveryEstimate.trim() ||
      !offerDraft.description.trim()
    ) {
      setError("Completa precio, descripcion y plazo de entrega de la oferta.");
      return;
    }
    const referencePrice = Number(request.extracted.targetPrice);
    if (
      Number.isFinite(referencePrice) &&
      referencePrice > 0 &&
      price > referencePrice
    ) {
      setError(
        `Tu propuesta no puede superar ${formatCurrency(referencePrice, request.extracted.currency || "EUR", locale)}.`,
      );
      return;
    }
    if (
      typeof request.myOffer?.price === "number" &&
      price > request.myOffer.price
    ) {
      setError("Una mejora no puede aumentar el precio de tu propuesta anterior.");
      return;
    }
    if (
      availableQuantity !== undefined &&
      (!Number.isFinite(availableQuantity) || availableQuantity <= 0)
    ) {
      setError("La cantidad disponible debe ser mayor que cero.");
      return;
    }

    setBusyId(`market:${request.id}`);
    setError(null);
    setNotice(null);
    try {
      const created = await apiAuthPost<AllwainOffer>(
        `/allwain/market/requests/${request.id}/offers`,
        {
          price,
          availableQuantity,
          deliveryEstimate: offerDraft.deliveryEstimate.trim(),
          description: offerDraft.description.trim(),
          validForMinutes: offerDraft.validForMinutes,
        },
      );
      if (
        !created.id ||
        Math.abs(Number(created.price) - price) > 0.0001 ||
        created.meta?.requestId !== request.id
      ) {
        throw new Error("El servidor no confirmó la oferta enviada.");
      }
      void trackAnalyticsEvent("proposal_submitted", { source: "request" });
      await clearJourneyDraft(userId, "market-offer:" + request.id);
      await clearJourneyDraft(userId, "market-offer-step:" + request.id);
      setSelectedRequestId(null);
      setMarketDraftReady(false);
      offerDraftRevision.current++;
      setNotice(
        `Oferta enviada a ${request.requester.name}. Ya puede verla y aceptarla.`,
      );
      await loadData();
    } catch (err: any) {
      setError(err?.message || "No se pudo enviar la oferta.");
    } finally {
      setBusyId(null);
    }
  }

  async function sendInterest(offer: AllwainOffer) {
    setBusyId(`interest:${offer.id}`);
    setError(null);
    setNotice(null);
    try {
      const lead = await apiAuthPost<{ id: string; offerId?: string | null }>(
        `/allwain/offers/${offer.id}/interest`, {
        source: "offers",
        },
      );
      if (!lead.id || lead.offerId !== offer.id) {
        throw new Error("El servidor no confirmó el interés enviado.");
      }
      setNotice(`Interes enviado al proveedor de "${offer.title}".`);
    } catch (err: any) {
      setError(err?.message || "No se pudo enviar el interes.");
    } finally {
      setBusyId(null);
    }
  }

  async function requestOffer(
    offer: AllwainOffer,
    quantity: number,
    delivery: OfferDeliveryDraft,
    purchaseKey: string,
  ): Promise<boolean> {
    setBusyId(`offer:${offer.id}`);
    setError(null);
    setNotice(null);
    try {
      const contract = await apiAuthPost<AllwainContract>(
        `/allwain/offers/${offer.id}/accept`,
        { quantity, ...delivery, purchaseKey },
      );
      if (
        !contract.id ||
        contract.offerId !== offer.id ||
        contract.requesterUserId !== userId ||
        Math.abs(Number(contract.quantity) - quantity) > 0.0001
      ) {
        throw new Error("El servidor no confirmó el pedido completo.");
      }
      setContracts((current) => {
        const exists = current.some((item) => item.id === contract.id);
        return exists
          ? current.map((item) => (item.id === contract.id ? contract : item))
          : [contract, ...current];
      });
      await loadData();
      setBuyerSection("orders");
      selectContract(contract.id);
      setTimeout(() => {
        scrollToContract(contract.id);
      }, 100);
      setNotice(
        `Pedido de ${quantityText(contract.quantity || quantity)} ${contract.unit || offerInventory(offer).unit} preparado. Revisa el total definitivo antes de continuar.`,
      );
      return true;
    } catch (err: any) {
      setError(orderErrorMessage(err?.message, offer));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function loadCarrierShipment(orderId: string) {
    setBusyId(`shipment-load:${orderId}`);
    setError(null);
    try {
      const response = await apiAuthGet<{
        shipment: AllwainCarrierShipment | null;
      }>(`/allwain/shipping/orders/${orderId}`);
      setShipmentsByOrder((current) => ({
        ...current,
        [orderId]: response.shipment || null,
      }));
    } catch (shipmentError: any) {
      setError(shipmentError?.message || "No pudimos consultar el transporte.");
    } finally {
      setBusyId(null);
    }
  }

  async function createCarrierShipment(order: AllwainOrder) {
    setBusyId(`shipment-create:${order.id}`);
    setError(null);
    setNotice(null);
    try {
      const response = await apiAuthPost<{
        shipment: AllwainCarrierShipment;
      }>(`/allwain/shipping/orders/${order.id}/shipments`, {});
      if (!response.shipment?.id || response.shipment.orderId !== order.id) {
        throw new Error("El transportista no confirmó el envío.");
      }
      setShipmentsByOrder((current) => ({
        ...current,
        [order.id]: response.shipment,
      }));
      setNotice("Envío enviado a Sendcloud. El seguimiento actualizará el pedido automáticamente.");
      await loadData();
    } catch (shipmentError: any) {
      setError(shipmentError?.message || "No pudimos crear el envío.");
    } finally {
      setBusyId(null);
    }
  }

  function previousOrdersForOffer(offer: AllwainOffer) {
    return contracts.filter(
      (contract) =>
        contract.offerId === offer.id &&
        contract.requesterUserId === userId &&
        contract.status !== "rejected",
    ).length;
  }

  function openInventoryEditor(offer: AllwainOffer) {
    const inventory = offerInventory(offer);
    setInventoryEditId(offer.id);
    setInventoryDraft({
      stockQuantity: quantityText(inventory.stockQuantity || 0),
      minQuantity: quantityText(inventory.minQuantity),
      quantityStep: quantityText(inventory.quantityStep),
    });
  }

  async function saveInventory(offer: AllwainOffer) {
    const stockQuantity = parseNumber(inventoryDraft.stockQuantity);
    const minQuantity = parseNumber(inventoryDraft.minQuantity);
    const quantityStep = parseNumber(inventoryDraft.quantityStep);
    if (
      !Number.isFinite(stockQuantity) ||
      stockQuantity <= 0 ||
      !Number.isFinite(minQuantity) ||
      minQuantity <= 0 ||
      minQuantity > stockQuantity ||
      !Number.isFinite(quantityStep) ||
      quantityStep <= 0
    ) {
      setError("Revisa stock, pedido mínimo e incremento.");
      return;
    }
    setBusyId(`inventory:${offer.id}`);
    setError(null);
    try {
      const updated = await apiAuthPost<AllwainOffer>(
        `/allwain/offers/${offer.id}/inventory`, {
        stockQuantity,
        minQuantity,
        quantityStep,
        },
      );
      const savedInventory = offerInventory(updated);
      if (
        updated.id !== offer.id ||
        savedInventory.stockQuantity !== stockQuantity ||
        savedInventory.minQuantity !== minQuantity ||
        savedInventory.quantityStep !== quantityStep
      ) {
        throw new Error("El servidor no confirmó el inventario guardado.");
      }
      setOffers((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setInventoryEditId(null);
      setNotice("Inventario actualizado.");
      await loadData();
    } catch (err: any) {
      setError(
        err?.message === "STOCK_BELOW_COMMITTED"
          ? "El stock total no puede ser menor que las unidades reservadas y vendidas."
          : err?.message || "No se pudo actualizar el inventario.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function changeOfferStatus(
    offer: AllwainOffer,
    status: "active" | "paused" | "closed",
  ) {
    setBusyId(`status:${offer.id}`);
    setError(null);
    setNotice(null);
    try {
      const updated = await apiAuthPatch<AllwainOffer>(
        `/allwain/offers/${offer.id}`,
        { status },
      );
      setOffers((current) =>
        status === "closed"
          ? current.filter((item) => item.id !== offer.id)
          : current.map((item) => (item.id === offer.id ? updated : item)),
      );
      setNotice(
        status === "closed"
          ? "Oferta cerrada. Conservamos su historial y sus pedidos."
          : status === "paused"
            ? "Oferta pausada. Nadie puede comprarla hasta que la actives."
            : "Oferta activa de nuevo.",
      );
    } catch (err: any) {
      setError(err?.message || "No se pudo actualizar la oferta.");
    } finally {
      setBusyId(null);
    }
  }

  function confirmCloseOffer(offer: AllwainOffer) {
    Alert.alert(
      "Cerrar oferta",
      "Dejará de estar disponible, pero sus pedidos y movimientos seguirán guardados.",
      [
        { text: "Volver", style: "cancel" },
        {
          text: "Cerrar oferta",
          style: "destructive",
          onPress: () => void changeOfferStatus(offer, "closed"),
        },
      ],
    );
  }

  async function updateAgreement(
    contract: AllwainContract,
    action: "accept" | "reject",
  ) {
    setBusyId(`${action}:${contract.id}`);
    setError(null);
    setNotice(null);
    try {
      const updated = await apiAuthPost<AllwainContract>(
        `/allwain/contracts/${contract.id}/${action}`,
        {},
      );
      if (updated.id !== contract.id) {
        throw new Error("El servidor no confirmó el acuerdo actualizado.");
      }
      if (action === "reject" && updated.status !== "rejected") {
        throw new Error("El servidor no confirmó el rechazo del acuerdo.");
      }
      const actorAcceptedAt =
        contract.requesterUserId === userId
          ? updated.requesterAcceptedAt
          : contract.providerUserId === userId
            ? updated.providerAcceptedAt
            : null;
      if (
        action === "accept" &&
        !actorAcceptedAt
      ) {
        throw new Error("El servidor no confirmó tu aceptación.");
      }
      setContracts((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice(
        updated.status === "accepted"
          ? "Acuerdo formalizado por ambas partes."
          : updated.status === "rejected"
            ? "El acuerdo se ha rechazado o cancelado."
            : "Tu aceptacion esta registrada. Falta la otra parte.",
      );
      await loadData();
    } catch (err: any) {
      setError(err?.message || "No se pudo actualizar el acuerdo.");
    } finally {
      setBusyId(null);
    }
  }

  async function openContractCheckout(
    contract: AllwainContract,
    acceptedInCurrentFlow?: boolean,
  ): Promise<boolean> {
    const reviewedOrder = orderByContract.get(contract.id);
    if (!reviewedOrder || preparedTotals[contract.id] !== `${reviewedOrder.totalAmount}:${reviewedOrder.currency?.toUpperCase()}`) {
      setError("Primero debemos comprobar el total completo del pedido. Pulsa Preparar revisión.");
      return false;
    }
    if (!paymentEnvironmentReady) {
      setNotice(null);
      setError(t("offers.paymentEnvironmentUnavailable"));
      return false;
    }
    const current = beginCheckoutAction();
    if (!current()) return false;
    setBusyId(`payment:${contract.id}`);
    setError(null);
    setNotice(null);
    try {
      let checkoutMode: AllwainCheckoutResponse["mode"];
      const result = await runBuyerCheckout({
        buyerId: userId || "", contract, order: orderByContract.get(contract.id), isCurrent: current,
        readOrder: readCheckoutOrder, publishOrder: publishCheckoutOrder,
        postCheckout: async (freshOrder) => {
          const reviewedAmount = buyerReviewAmount(contract, orderByContract.get(contract.id));
          if (freshOrder && (freshOrder.totalAmount !== reviewedAmount || freshOrder.currency?.toUpperCase() !== (contract.currency || "EUR").toUpperCase())) {
            setCommercialTermsConsents(current => ({...current,[contract.id]:false}));
            setReservationConsents(current => ({...current,[contract.id]:false}));
            setRecurringConsents(current => ({...current,[contract.id]:false}));
            throw new Error("El total del pedido ha cambiado. Revisa el importe actualizado y confirma de nuevo las condiciones.");
          }
          const response = await apiAuthPost<AllwainCheckoutResponse>(
            `/allwain/payments/contracts/${contract.id}/checkout`, {
              reservationConsent:
                contract.paymentMode === "preorder"
                  ? reservationConsents[contract.id] === true
                  : undefined,
              commercialTermsAccepted:
                acceptedInCurrentFlow === true ||
                commercialTermsConsents[contract.id] === true,
              recurringMandateAccepted:
                contractRecurringOrder(contract)?.enabled === true
                  ? recurringConsents[contract.id] === true
                  : undefined,
              payNow:
                contract.paymentMode === "preorder" &&
                ["payment_failed", "requires_customer_action"].includes(
                  freshOrder?.paymentStatus || contract.paymentStatus || "",
                ),
              returnUrl: buyerCheckoutReturnUrl(allwainReturnUrl("payment-return"), Platform.OS === "web", contract.id),
              reviewedTotalAmount: reviewedOrder.totalAmount,
              reviewedCurrency: reviewedOrder.currency,
          });
          checkoutMode = response.mode;
          return response;
        },
        openUrl: async (url) => {
          returningContract.current = contract.id;
          void trackAnalyticsEvent("begin_checkout", {
            currency: String(contract.currency || "EUR").toUpperCase(),
            value: analyticsCheckoutValue(contract),
            delivery_method: analyticsDeliveryMethod(contract.deliveryChannel),
            payment_mode:
              contract.paymentMode === "preorder" ? "preorder" : "payment",
          });
          void trackAnalyticsEvent("checkout_opened", {
            payment_mode: checkoutMode === "setup" ? "setup" : "payment",
          });
          if (current()) await openExternalUrl(url);
        },
      });
      if (!current() || result === "retired") return false;
      if (result === "opened") return true;
      if (result === "blocked" || result === "unknown") {
        setNotice(result === "blocked" ? CHECKOUT_REVIEW_NOTICE : CHECKOUT_UNKNOWN_NOTICE);
        return false;
      }
      if (result === "already_paid") {
        setNotice("El pago ya está confirmado.");
        await loadData();
        return true;
      } else if (result === "reservation_ready") {
        setNotice("La tarjeta de la reserva ya está preparada.");
        await loadData();
        return true;
      } else {
        setNotice("Estado actualizado. Revisa los datos del pedido antes de continuar.");
        return false;
      }
    } catch (err: any) {
      if (current()) {
        if (String(err?.message).includes("ORDER_TOTAL_CHANGED")) {
          setPreparedTotals(current => {const next={...current};delete next[contract.id];return next;});
          setCommercialTermsConsents(current => ({...current,[contract.id]:false}));
          setReservationConsents(current => ({...current,[contract.id]:false}));
          setRecurringConsents(current => ({...current,[contract.id]:false}));
          setError("El importe ha cambiado. Vuelve a preparar la revisión y confirma el total actualizado.");
        } else setError(err?.message || "No se pudo abrir el pago seguro.");
      }
      return false;
    } finally {
      if (current()) setBusyId(null);
    }
  }

  function beginCheckoutAction() {
    const session = captureAuthSession();
    const revision = ++checkoutAction.current;
    return () => session.isCurrent() && revision === checkoutAction.current &&
      navigation.isFocused() && useAuthStore.getState().appMode === appMode &&
      Boolean(userId && useAuthStore.getState().user?.id === userId);
  }

  function readCheckoutOrder(orderId: string) {
    return apiAuthGet<AllwainOrder>(`/allwain/payments/orders/${orderId}`);
  }

  function publishCheckoutOrder(order: AllwainOrder) {
    // Protect this order from an older list response without cancelling unrelated
    // offers, payment configuration or the rest of the page load.
    explicitOrders.current.set(order.id, {revision:++explicitOrderRevision.current,order});
    setOrders((current) => mergePage(current, [order]));
    const inventoryStatus = order.inventoryStatus === "reserved" || order.inventoryStatus === "sold" || order.inventoryStatus === "released"
      ? order.inventoryStatus : undefined;
    setContracts((current) => current.map(contract => contract.id === order.contractId
      ? { ...contract, paymentStatus: order.paymentStatus, inventoryStatus: inventoryStatus ?? contract.inventoryStatus } : contract));
  }

  async function preparePaymentReview(contract: AllwainContract) {
    if (contract.requesterUserId !== userId || contract.status !== "accepted") return;
    const session = captureAuthSession();
    const revision = ++reviewRevision.current;
    const current = () => session.isCurrent() && revision === reviewRevision.current && navigation.isFocused();
    setPreparingReview(contract.id);
    setPreparedTotals(values => {const next={...values};delete next[contract.id];return next;});
    setCommercialTermsConsents(values => ({...values,[contract.id]:false}));
    setReservationConsents(values => ({...values,[contract.id]:false}));
    setRecurringConsents(values => ({...values,[contract.id]:false}));
    setError(null);
    try {
      const order = await apiAuthPost<AllwainOrder>(`/allwain/payments/contracts/${contract.id}/prepare`,{});
      if (!current()) return;
      if (order.contractId !== contract.id || order.buyerUserId !== userId || !Number.isSafeInteger(order.totalAmount) || order.totalAmount < 0 || !order.currency) throw new Error("El servidor no confirmó el total de tu pedido.");
      publishCheckoutOrder(order);
      setPreparedTotals(values => ({...values,[contract.id]:`${order.totalAmount}:${order.currency.toUpperCase()}`}));
    } catch (err: any) {if(current()) setError(err?.message || "No se ha podido comprobar el total del pedido.");}
    finally {if(current()) setPreparingReview(null);}
  }
  const reviewEligible = !isSeller && contracts.some(contract => contract.id === expandedId && contract.requesterUserId === userId && contract.status === "accepted" && checkoutPaymentActionable(contract.paymentStatus));
  useEffect(() => {
    const contract = contracts.find(item => item.id === expandedId);
    if (reviewEligible && contract) void preparePaymentReview(contract);
    return () => {reviewRevision.current++;};
  }, [expandedId, reviewEligible, userId]);

  async function refreshCheckoutState(contract: AllwainContract, order: AllwainOrder) {
    const current = beginCheckoutAction();
    if (!current()) return;
    setBusyId(`payment:${contract.id}`); setError(null); setNotice(null);
    try {
      const fresh = await refreshBuyerCheckoutOrder({ buyerId: userId || "", contract, order, isCurrent: current,
        readOrder: readCheckoutOrder, publishOrder: publishCheckoutOrder });
      if (!fresh || !current()) return;
      const block = checkoutBlockReason(fresh);
      setNotice(!checkoutPaymentActionable(fresh.paymentStatus) ? "Estado registrado actualizado. Revisa los datos del pedido."
        : block ? CHECKOUT_REVIEW_NOTICE : block === undefined ? CHECKOUT_UNKNOWN_NOTICE
        : "Estado registrado actualizado. Revisa los datos del pedido.");
    } catch (err: any) {
      if (current()) setError(err?.message || "No se pudo actualizar el estado del pedido.");
    } finally { if (current()) setBusyId(null); }
  }

  async function chargePreorder(contract: AllwainContract) {
    if (!paymentEnvironmentReady) {
      setNotice(null);
      setError(t("offers.paymentEnvironmentUnavailable"));
      return;
    }
    setBusyId(`charge:${contract.id}`);
    setError(null);
    setNotice(null);
    try {
      const orders = await apiAuthGet<{
        items?: { id: string; contractId: string }[];
      }>("/allwain/payments/orders");
      const order = orders.items?.find(
        (item) => item.contractId === contract.id,
      );
      if (!order) throw new Error("No encontramos el pedido de esta reserva.");
      const charge = await apiAuthPost<{
        orderId: string;
        paymentIntentId?: string;
        status?: string;
      }>(`/allwain/payments/orders/${order.id}/charge`, {});
      if (
        charge.orderId !== order.id ||
        !charge.paymentIntentId ||
        !charge.status
      ) {
        throw new Error("El servidor no confirmó la solicitud de cobro.");
      }
      setNotice(
        "Cobro solicitado a Stripe. El estado se actualizará al confirmarse.",
      );
      await loadData();
    } catch (err: any) {
      setError(err?.message || "No se pudo cobrar la reserva.");
    } finally {
      setBusyId(null);
    }
  }

  async function updateFulfillment(order: AllwainOrder, action: string) {
    setBusyId(`fulfillment:${order.id}`);
    setError(null);
    setNotice(null);
    try {
      const updated = await apiAuthPost<AllwainOrder>(
        `/allwain/payments/orders/${order.id}/status`,
        { action },
      );
      const expectedStatus: Record<string, string> = {
        prepare: "preparing",
        ready: "ready",
        dispatch: "dispatched",
        deliver: "delivered",
        complete: "completed",
      };
      if (
        updated.id !== order.id ||
        updated.fulfillmentStatus !== expectedStatus[action]
      ) {
        throw new Error("El servidor no confirmó el nuevo estado del pedido.");
      }
      setOrders((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice(
        action === "complete"
          ? "Entrega confirmada y pedido finalizado."
          : "Estado operativo del pedido actualizado.",
      );
      await loadOrderAudit(order.id, true);
    } catch (err: any) {
      setError(err?.message || "No se pudo actualizar el pedido.");
    } finally {
      setBusyId(null);
    }
  }

  function confirmCancelOrder(order: AllwainOrder) {
    Alert.alert(
      "Cancelar pedido",
      "Se liberará la cantidad reservada. Esta acción solo es posible antes del cobro.",
      [
        { text: "Volver", style: "cancel" },
        {
          text: "Cancelar pedido",
          style: "destructive",
          onPress: () => void cancelOrder(order),
        },
      ],
    );
  }

  async function cancelOrder(order: AllwainOrder) {
    setBusyId(`cancel-order:${order.id}`);
    setError(null);
    setNotice(null);
    try {
      const canceled = await apiAuthPost<AllwainOrder>(
        `/allwain/payments/orders/${order.id}/cancel`,
        {},
      );
      if (canceled.id !== order.id || canceled.status !== "canceled") {
        throw new Error("El servidor no confirmó la cancelación.");
      }
      setOrders((current) =>
        current.map((item) => (item.id === canceled.id ? canceled : item)),
      );
      setNotice("Pedido cancelado. La cantidad vuelve a estar disponible.");
      await loadData();
    } catch (err: any) {
      setError(err?.message || "No se pudo cancelar el pedido.");
    } finally {
      setBusyId(null);
    }
  }

  async function loadOrderAudit(orderId: string, keepOpen = false) {
    if (!keepOpen && expandedAuditOrderId === orderId) {
      setExpandedAuditOrderId(null);
      return;
    }
    setBusyId(`audit:${orderId}`);
    setError(null);
    try {
      const audit = await apiAuthGet<AllwainAuditResponse>(
        `/allwain/payments/orders/${orderId}/audit`,
      );
      setAuditByOrder((current) => ({ ...current, [orderId]: audit }));
      setExpandedAuditOrderId(orderId);
    } catch (err: any) {
      setError(err?.message || "No se pudo verificar la trazabilidad.");
    } finally {
      setBusyId(null);
    }
  }

  async function downloadOrderAuditPdf(orderId: string) {
    if (!token) return;
    setBusyId(`audit-pdf:${orderId}`);
    setError(null);
    setNotice(null);
    try {
      await downloadAuthenticatedFile({
        url: `${API_BASE_URL}/allwain/payments/orders/${orderId}/audit/pdf`,
        token,
        filename: `allwain-trazabilidad-${orderId}.pdf`,
      });
      setNotice("Justificante de trazabilidad preparado.");
    } catch {
      setError("No se pudo preparar el justificante de trazabilidad.");
    } finally {
      setBusyId(null);
    }
  }

  async function updateRecurringPlan(
    plan: AllwainRecurringPlan,
    action: "pause" | "resume" | "cancel",
  ) {
    const current = beginCheckoutAction();
    if (!current()) return;
    if (action === "resume" && unresolvedRecurringOrder(plan)) {
      setNotice(CHECKOUT_REVIEW_NOTICE);
      return;
    }
    setBusyId(`recurring:${plan.id}`);
    setError(null);
    setNotice(null);
    try {
      const updated = await apiAuthPatch<AllwainRecurringPlan>(
        `/allwain/payments/recurring-plans/${plan.id}`,
        { action },
      );
      if (!current()) return;
      if (updated.id !== plan.id || ![updated.buyerUserId, updated.sellerUserId].includes(userId || ""))
        throw new Error("El servidor devolvió una programación que no corresponde a tu cuenta.");
      setRecurringPlans((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice(
        action === "pause"
          ? "Las próximas entregas quedan en pausa."
          : action === "resume"
            ? "Las entregas programadas vuelven a estar activas."
            : "La recurrencia se ha cancelado; no habrá nuevos cobros.",
      );
    } catch (err: any) {
      if (current()) setError(err?.message || "No se pudo actualizar la entrega programada.");
    } finally {
      if (current()) setBusyId(null);
    }
  }

  async function refreshRecurringState(plan: AllwainRecurringPlan) {
    const current = beginCheckoutAction();
    if (!current()) return;
    setBusyId(`recurring:${plan.id}`); setError(null); setNotice(null);
    try {
      const fresh = await apiAuthGet<AllwainRecurringPlan>(`/allwain/payments/recurring-plans/${plan.id}`);
      if (!current()) return;
      if (fresh.id !== plan.id || ![fresh.buyerUserId, fresh.sellerUserId].includes(userId || ""))
        throw new Error("El servidor devolvió una programación que no corresponde a tu cuenta.");
      loadRevision.current++;
      setLoading(false);
      setRecurringPlans((plans) => plans.map(item => item.id === fresh.id ? fresh : item));
      setNotice(unresolvedRecurringOrder(fresh) ? CHECKOUT_REVIEW_NOTICE : "Estado registrado de la programación actualizado.");
    } catch (err: any) {
      if (current()) setError(err?.message || "No se pudo actualizar la programación.");
    } finally { if (current()) setBusyId(null); }
  }

  function confirmCancelRecurring(plan: AllwainRecurringPlan) {
    Alert.alert(
      "Cancelar entregas programadas",
      "No se crearán más pedidos ni cobros. Los pedidos ya creados mantienen su estado.",
      [
        { text: "Volver", style: "cancel" },
        {
          text: "Cancelar recurrencia",
          style: "destructive",
          onPress: () => void updateRecurringPlan(plan, "cancel"),
        },
      ],
    );
  }

  const noInitialData =
    offers.length === 0 &&
    contracts.length === 0 &&
    marketRequests.length === 0 &&
    orders.length === 0 &&
    recurringPlans.length === 0;

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        onScroll={event => {scrollY.current = event.nativeEvent.contentOffset.y;}}
        scrollEventThrottle={16}
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>
              {(isSeller ? t("roles.seller") : t("roles.buyer")).toUpperCase()}
            </Text>
            <Text style={styles.title}>
              {isSeller ? sellerSection === "preparation" ? "Preparación" : sellerSection === "orders" ? "Mis pedidos" : "Ofertas y solicitudes" : buyerSection === "orders" ? "Mis pedidos" : t("offers.buyerTitle")}
            </Text>
            <Text style={styles.subtitle}>
              {isSeller
                ? sellerSection === "offers" ? "Publica o responde a lo que buscan tus clientes." : "Cada pedido, con su siguiente paso."
                : buyerSection === "orders" ? "Revisa el pago y sigue cada compra desde su ficha." : t("offers.buyerSubtitle")}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={loadData}
            disabled={loading}
          >
            <Text style={styles.refreshText}>
              {loading ? "..." : t("common.refresh")}
            </Text>
          </TouchableOpacity>
        </View>

        {loading && noInitialData ? (
          <View style={styles.stateRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.muted}>{t("offers.loading")}</Text>
          </View>
        ) : null}
        {error && (!expandedId || (isSeller ? sellerSection === "offers" : buyerSection === "offers")) && !selectedOffer && !catalogFormOpen && !selectedMarketRequest ? (
          <View style={styles.loadNotice} accessibilityLiveRegion="polite">
            <Text style={styles.loadNoticeText}>{error}</Text>
            <BigActionButton label="Actualizar información" tone="light" busy={loading} onPress={() => void loadData()} />
          </View>
        ) : null}
        {notice && !expandedId ? <Text style={styles.notice}>{notice}</Text> : null}

        {stripeTestEnabled ? (
          <View style={styles.testPaymentNotice} accessibilityRole="summary">
            <View style={styles.testPaymentIcon}>
              <CreditCard size={20} color="#7A351F" />
            </View>
            <View style={styles.testPaymentCopy}>
              <Text style={styles.testPaymentTitle}>{t("offers.testPayments")}</Text>
              <Text style={styles.testPaymentText}>No se cobra dinero real.</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityState={{expanded:testDetailsOpen}} onPress={() => setTestDetailsOpen(open => !open)}><Text style={styles.legalLink}>{testDetailsOpen ? "Ocultar instrucciones" : "Ver tarjeta de prueba"}</Text></TouchableOpacity>
              {testDetailsOpen ? <Text style={styles.testPaymentText}>{t("offers.testPaymentsBody")}</Text> : null}
            </View>
          </View>
        ) : null}

        {!isSeller ? (
          <View accessibilityRole="tablist" style={styles.buyerSectionTabs}>
            {([
              ["orders", "Mis pedidos"],
              ["offers", "Consultar ofertas"],
            ] as const).map(([section, label]) => {
              const selected = buyerSection === section;
              return (
                <TouchableOpacity
                  key={section}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  aria-selected={selected}
                  style={[styles.buyerSectionTab, selected && styles.buyerSectionTabSelected]}
                  onPress={() => setBuyerSection(section)}
                >
                  <Text style={[styles.buyerSectionLabel, selected && styles.buyerSectionLabelSelected]}>{label}</Text>
                  <View style={[styles.buyerSectionIndicator, selected && styles.buyerSectionIndicatorSelected]} />
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
        {isSeller ? <View accessibilityRole="tablist" style={styles.buyerSectionTabs}>
          {([["orders","Pedidos"],["preparation","Preparación"],["offers","Ofertas y solicitudes"]] as const).map(([section,label]) => (
            <TouchableOpacity key={section} accessibilityRole="tab" aria-selected={sellerSection===section} accessibilityState={{selected:sellerSection===section}} style={[styles.buyerSectionTab,sellerSection===section && styles.buyerSectionTabSelected]} onPress={() => {setSellerSection(section);scrollRef.current?.scrollTo({y:0,animated:false});}}>
              <Text style={[styles.buyerSectionLabel,sellerSection===section && styles.buyerSectionLabelSelected]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View> : null}
        <View style={(isSeller ? sellerSection !== "offers" : buyerSection === "orders") ? { display: "none" } : Platform.OS === "web" ? ({ display: "contents" } as any) : undefined}>
        {ownBuyerOffers.length > 0 ? (
          <View style={styles.ownPublicationsSection}>
            <View style={styles.featuredHeading}>
              <View style={styles.featuredHeadingCopy}>
                <Text style={styles.featuredKicker}>
                  {t("offers.yourPublications")}
                </Text>
                <Text style={styles.sectionTitle}>
                  {t("offers.yourPublicationsBody")}
                </Text>
              </View>
            </View>
            {ownBuyerOffers.map((offer) => {
              const imageUrl = offerMetaText(offer, "imageUrl");
              const imageIllustrative = offer.meta?.imageIllustrative === true;
              const inventory = offerInventory(offer, t("home.buyer.unit"));
              const status =
                offer.allwainStatus === "paused"
                  ? t("offers.paused")
                  : offer.allwainStatus === "sold_out"
                    ? t("offers.noStock")
                    : t("offers.active");
              return (
                <OfferCard
                  key={`own:${offer.id}`}
                  title={offer.title}
                  meta={
                    typeof offer.price === "number"
                      ? `${formatCurrency(offer.price, offer.currency || "EUR", locale)} / ${inventory.unit}`
                      : t("offers.pricePending")
                  }
                  detail={`${status} · ${offerCardDetail(offer, inventory, 0, locale, t)}`}
                  status={t("offers.ownPublication")}
                  statusTone="brand"
                  actionLabel={t("offers.manageAsSeller")}
                  onPress={() => void setAppMode("sell")}
                  leading={
                    <PublicationImage
                      imageUrl={imageUrl}
                      imageAlt={offerMetaText(offer, "imageAlt") || offer.title}
                      illustrative={imageIllustrative || !imageUrl}
                    />
                  }
                  leadingVariant="image"
                />
              );
            })}
          </View>
        ) : null}

        {featuredOffers.length > 0 ? (
          <>
            <View style={styles.featuredHeading}>
              <View style={styles.featuredHeadingCopy}>
                <Text style={styles.featuredKicker}>{t("offers.pinnedCard")}</Text>
                <Text style={styles.sectionTitle}>{t("home.buyer.tryOffer")}</Text>
              </View>
              <Text style={styles.featuredBadge}>{t("offers.featured")}</Text>
            </View>
            {featuredOffers.map((offer) => {
              const imageUrl = offerMetaText(offer, "imageUrl");
              const imageIllustrative = offer.meta?.imageIllustrative === true;
              const imageSource = isOrangesPilotOffer(offer)
                ? ORANGES_ILLUSTRATIVE_IMAGE
                : imageUrl
                  ? { uri: imageUrl }
                  : null;
              const inventory = offerInventory(offer, t("home.buyer.unit"));
              const previousOrders = previousOrdersForOffer(offer);
              return (
                <View key={offer.id} style={styles.featuredOfferGroup}>
                  {imageSource && !isDemoOffer(offer) ? (
                    <TouchableOpacity
                      activeOpacity={0.9}
                      accessibilityRole="button"
                      accessibilityLabel={t("offers.featuredImage", { title: offer.title })}
                      onPress={() => {
                        if (typeof offer.price === "number") setSelectedOffer(offer);
                        else void sendInterest(offer);
                      }}
                    >
                      <PublicationImage
                        source={imageSource}
                        imageAlt={offerMetaText(offer, "imageAlt") || offer.title}
                        illustrative={imageIllustrative}
                        variant="hero"
                      />
                    </TouchableOpacity>
                  ) : null}
                  <OfferCard
                    title={offer.title}
                    meta={
                      typeof offer.price === "number"
                        ? `${formatCurrency(offer.price, offer.currency || "EUR", locale)} / ${inventory.unit}`
                        : t("offers.pricePending")
                    }
                    detail={offerCardDetail(offer, inventory, previousOrders, locale, t)}
                    status={t("home.status.available")}
                    statusTone="neutral"
                    actionLabel={
                      typeof offer.price === "number"
                        ? previousOrders
                          ? t("offers.orderAgain")
                          : t("home.buyer.chooseQuantity")
                        : t("offers.interested")
                    }
                    onPress={() => {
                      if (typeof offer.price === "number")
                        setSelectedOffer(offer);
                      else void sendInterest(offer);
                    }}
                    onContact={
                      offer.provider?.id && offer.provider.id !== userId
                        ? () =>
                            openPrivateMessage(
                              offer.provider?.id,
                              offer.provider?.name,
                            )
                        : undefined
                    }
                    leading={
                      imageSource ? (
                        <PublicationImage
                          source={imageSource}
                          imageAlt={offerMetaText(offer, "imageAlt") || offer.title}
                          illustrative={imageIllustrative}
                        />
                      ) : (
                        <ShoppingBag size={20} color={colors.primary} />
                      )
                    }
                    leadingVariant={imageSource ? "image" : "icon"}
                  />
                </View>
              );
            })}
          </>
        ) : null}

        {isSeller ? (
          <>
            <View style={styles.publishSection}>
              <View style={styles.publishHeader}>
                <View style={styles.publishCopy}>
                  <Text style={styles.sectionTitle}>
                    {t("offers.publishTitle")}
                  </Text>
                  <Text style={styles.sectionHelp}>
                    {t("offers.publishBody")}
                  </Text>
                </View>
                {!catalogFormOpen ? (
                  <BigActionButton
                    label={catalogDraft.title.trim() ? "Continuar oferta" : t("offers.newOffer")}
                    tone="dark"
                    icon={<PackagePlus size={19} color={colors.buttonText} />}
                    disabled={!catalogReady}
                    onPress={() => {setError(null); setCatalogFormOpen(true);}}
                  />
                ) : null}
              </View>

            </View>

            <Text style={styles.sectionTitle}>{t("offers.activeRequests")}</Text>
            <Text style={styles.sectionHelp}>
              {t("offers.activeRequestsBody")}
            </Text>
            {marketRequests.length === 0 && !loading && verifiedSections.market ? (
              <EmptyState
                title={t("offers.emptyRequests")}
                body={t("offers.emptyRequestsBody")}
                demo={{
                  title: t("offers.demoRequestTitle"),
                  meta: t("offers.demoRequestMeta"),
                  detail: t("offers.demoRequestDetail"),
                  leading: <CalendarClock size={20} color={colors.primary} />,
                }}
              />
            ) : null}

            {marketRequests.map((request) => {
              const sending = busyId === `market:${request.id}`;
              const myOffer = request.myOffer;
              const targetPrice = request.extracted.targetPrice;
              const currency = request.extracted.currency || "EUR";
              const requestImage = request.imageMeta;
              const deliveryEstimate =
                typeof myOffer?.meta?.deliveryEstimate === "string"
                  ? myOffer.meta.deliveryEstimate
                  : null;

              return (
                <View key={request.id} style={styles.requestCard}>
                  <View style={styles.requestSummary}>
                    <View style={styles.requestImageFrame}>
                      <PublicationImage
                        imageUrl={requestImage?.url}
                        imageAlt={requestImage?.alt || request.title}
                        illustrative={requestImage?.illustrative === true}
                      />
                    </View>
                    <View style={styles.requestSummaryCopy}>
                      <View style={styles.cardHeader}>
                        <Text style={styles.offerTitle}>
                          {request.extracted.productName || request.title}
                        </Text>
                        <Text
                          style={[
                            styles.requestStatus,
                            myOffer && styles.requestStatusSent,
                          ]}
                        >
                          {myOffer
                            ? t("offers.offerSent")
                            : request.demo
                              ? t("card.demo")
                              : t("market.open")}
                        </Text>
                      </View>
                      <Text style={styles.providerText}>
                        {t("offers.buyer", { name: request.requester.name })}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.requestFacts}>
                    <Text style={styles.factText}>
                      {quantityLabel(request, t)}
                    </Text>
                    <Text style={styles.factText}>
                      {deliveryMethodLabel(request.extracted.deliveryMethod, t)}
                    </Text>
                    <Text style={styles.factText}>
                      {request.extracted.deliveryWindow ||
                        t("offers.datePending")}
                    </Text>
                  </View>
                  {targetPrice ? (
                    <Text style={styles.targetPrice}>
                      {t("offers.target", { amount: formatCurrency(targetPrice, currency, locale) })}
                    </Text>
                  ) : null}
                  {request.description ? (
                    <Text style={styles.muted} numberOfLines={3}>
                      {request.description}
                    </Text>
                  ) : null}

                  {request.requester.id !== userId ? (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={t("market.privateMessageTo", { name: request.requester.name })}
                      style={styles.chatButton}
                      onPress={() =>
                        openPrivateMessage(
                          request.requester.id,
                          request.requester.name,
                        )
                      }
                    >
                      <MessageCircle size={19} color={colors.primary} />
                      <Text style={styles.chatButtonText}>{t("card.privateMessage")}</Text>
                    </TouchableOpacity>
                  ) : null}

                  {myOffer ? (
                    <View style={styles.sentOfferSummary}>
                      <Text style={styles.sentOfferPrice}>
                        {t("offers.yourOffer", { amount: typeof myOffer.price === "number" ? formatCurrency(myOffer.price, myOffer.currency || currency, locale) : "-" })}
                      </Text>
                      {myOffer.description ? (
                        <Text style={styles.muted}>{myOffer.description}</Text>
                      ) : null}
                      {deliveryEstimate ? (
                        <Text style={styles.factText}>
                          {t("offers.delivery", { value: deliveryEstimate })}
                        </Text>
                      ) : null}
                      <ProposalCountdown
                        expiresAt={
                          myOffer.proposalExpiresAt ||
                          (typeof myOffer.meta?.validUntil === "string"
                            ? myOffer.meta.validUntil
                            : null)
                        }
                        compact
                      />
                      <TouchableOpacity
                        style={styles.fullPrimaryButton}
                        onPress={() => openOfferForm(request)}
                        disabled={sending}
                      >
                        <Text style={styles.primaryButtonText}>
                          Mejorar o renovar
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.fullPrimaryButton}
                      onPress={() => openOfferForm(request)}
                      disabled={sending}
                    >
                      <Text style={styles.primaryButtonText}>
                        {t("market.prepareOffer")}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
            {marketPage.hasNextPage ? (
              <TouchableOpacity
                style={[styles.fullSoftButton, styles.softButton]}
                onPress={() => void loadMoreMarketRequests()}
                disabled={busyId === "more:market"}
              >
                <Text style={styles.softButtonText}>
                  {busyId === "more:market"
                    ? t("common.loading")
                    : t("offers.moreRequests")}
                </Text>
              </TouchableOpacity>
            ) : null}
            <View style={styles.divider} />
          </>
        ) : null}

        {isSeller || regularOffers.length > 0 || featuredOffers.length === 0 ? (
          <View style={isSeller ? ({ order: 10 } as any) : undefined}>
            <Text style={styles.sectionTitle}>
              {isSeller
                ? t("offers.sellerListTitle")
                : featuredOffers.length > 0
                  ? t("offers.moreOffers")
                  : t("offers.availableOffers")}
            </Text>
            {regularOffers.length === 0 && !loading && verifiedSections.offers ? (
              <EmptyState
                title={isSeller ? t("offers.emptySeller") : t("offers.emptyBuyer")}
                body={
                  isSeller
                    ? t("offers.emptySellerBody")
                    : t("offers.emptyBuyerBody")
                }
                demo={{
                  title: isSeller
                    ? t("offers.demoSellerTitle")
                    : t("offers.demoBuyerTitle"),
                  meta: t("offers.demoOfferMeta"),
                  detail: t("offers.demoOfferDetail"),
                  leading: <PackagePlus size={20} color={colors.primary} />,
                }}
              />
            ) : null}

            {regularOffers.map((offer) => {
              const mine = isOwnOffer(offer, userId);
              const imageUrl = offerMetaText(offer, "imageUrl");
              const imageIllustrative = offer.meta?.imageIllustrative === true;
              const featured = offer.meta?.featured === true;
              const demo = isDemoOffer(offer);
              const inventory = offerInventory(offer, t("home.buyer.unit"));
              const soldOut = isOfferSoldOut(offer);
              const interestBusy = busyId === `interest:${offer.id}`;
              const offerBusy = busyId === `offer:${offer.id}`;
              const inventoryBusy = busyId === `inventory:${offer.id}`;
              const editingInventory = inventoryEditId === offer.id;
              const previousOrders = previousOrdersForOffer(offer);
              if (!isSeller) {
                return (
                  <OfferCard
                    key={offer.id}
                    title={offer.title}
                    meta={
                      typeof offer.price === "number"
                        ? `${formatCurrency(offer.price, offer.currency || "EUR", locale)} / ${inventory.unit}`
                        : t("offers.pricePending")
                    }
                    detail={offerCardDetail(offer, inventory, previousOrders, locale, t, demo)}
                    status={soldOut ? t("offers.soldOut") : demo ? t("card.demo") : featured ? t("offers.featured") : t("home.status.available")}
                    statusTone={soldOut ? "warning" : demo || featured ? "brand" : "neutral"}
                    actionLabel={
                      soldOut
                        ? undefined
                        : demo
                          ? t("home.buyer.explore")
                        : typeof offer.price === "number"
                        ? previousOrders
                          ? t("offers.orderAgain")
                          : t("home.buyer.chooseQuantity")
                        : t("offers.interested")
                    }
                    onPress={soldOut ? undefined : () => {
                      if (typeof offer.price === "number") setSelectedOffer(offer);
                      else void sendInterest(offer);
                    }}
                    onContact={
                      offer.provider?.id && offer.provider.id !== userId
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
                        imageAlt={offerMetaText(offer, "imageAlt") || offer.title}
                        illustrative={imageIllustrative || !imageUrl}
                      />
                    }
                    leadingVariant="image"
                  />
                );
              }
              return (
                <View
                  key={offer.id}
                  style={[styles.card, mine && styles.ownCard]}
                >
                  <PublicationImage
                    imageUrl={imageUrl}
                    imageAlt={offerMetaText(offer, "imageAlt") || offer.title}
                    illustrative={imageIllustrative || !imageUrl}
                    variant="hero"
                  />
                  <View style={styles.cardHeader}>
                    <Text style={styles.offerTitle}>{offer.title}</Text>
                    {typeof offer.price === "number" ? (
                      <Text style={styles.price}>
                        {formatCurrency(offer.price, offer.currency || "EUR", locale)} / {inventory.unit}
                      </Text>
                    ) : null}
                  </View>
                  {offer.description ? (
                    <Text style={styles.muted}>{offer.description}</Text>
                  ) : null}
                  <Text style={styles.providerText}>
                    {mine
                      ? t("offers.sentByYou")
                      : t("offers.provider", { name: offer.provider?.name || t("home.buyer.seller") })}
                  </Text>
                  {featured ? (
                    <Text style={styles.ownFeaturedLabel}>
                      {t("offers.featured")}
                    </Text>
                  ) : null}
                  {mine ? (
                    <Text style={styles.ownFeaturedLabel}>
                      {offer.allwainStatus === "paused"
                        ? t("offers.paused")
                        : offer.allwainStatus === "sold_out"
                          ? t("offers.noStock")
                          : t("offers.active")}
                    </Text>
                  ) : null}
                  {mine ? (
                    <View style={styles.inventoryManager}>
                      <Text style={styles.ownHelp}>
                        {inventory.availableQuantity === null
                          ? "Inventario sin configurar"
                          : `${quantityText(inventory.availableQuantity)} ${inventory.unit} disponibles · ${quantityText(inventory.reservedQuantity)} reservados · ${quantityText(inventory.soldQuantity)} vendidos`}
                      </Text>
                      {!offer.meta?.requestId && !editingInventory ? (
                        <TouchableOpacity
                          style={styles.inventoryEditButton}
                          onPress={() => openInventoryEditor(offer)}
                        >
                          <Text style={styles.inventoryEditText}>
                            Ajustar stock y mínimo
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                      {editingInventory ? (
                        <View style={styles.inventoryForm}>
                          <View style={styles.fieldRow}>
                            <View style={styles.fieldColumn}>
                              <Text style={styles.fieldLabel}>Stock total</Text>
                              <TextInput
                                style={styles.input}
                                value={inventoryDraft.stockQuantity}
                                onChangeText={(stockQuantity) =>
                                  setInventoryDraft((current) => ({
                                    ...current,
                                    stockQuantity,
                                  }))
                                }
                                keyboardType="decimal-pad"
                              />
                            </View>
                            <View style={styles.fieldColumn}>
                              <Text style={styles.fieldLabel}>
                                Pedido mínimo
                              </Text>
                              <TextInput
                                style={styles.input}
                                value={inventoryDraft.minQuantity}
                                onChangeText={(minQuantity) =>
                                  setInventoryDraft((current) => ({
                                    ...current,
                                    minQuantity,
                                  }))
                                }
                                keyboardType="decimal-pad"
                              />
                            </View>
                          </View>
                          <Text style={styles.fieldLabel}>
                            Incremento de cantidad
                          </Text>
                          <TextInput
                            style={styles.input}
                            value={inventoryDraft.quantityStep}
                            onChangeText={(quantityStep) =>
                              setInventoryDraft((current) => ({
                                ...current,
                                quantityStep,
                              }))
                            }
                            keyboardType="decimal-pad"
                          />
                          <View style={styles.actionsRow}>
                            <TouchableOpacity
                              style={[styles.actionBtn, styles.softButton]}
                              onPress={() => setInventoryEditId(null)}
                              disabled={inventoryBusy}
                            >
                              <Text style={styles.softButtonText}>
                                Cancelar
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.actionBtn, styles.primaryButton]}
                              onPress={() => saveInventory(offer)}
                              disabled={inventoryBusy}
                            >
                              {inventoryBusy ? (
                                <ActivityIndicator color={colors.buttonText} />
                              ) : (
                                <Text style={styles.primaryButtonText}>
                                  Guardar inventario
                                </Text>
                              )}
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : null}
                      {!offer.meta?.requestId && !editingInventory ? (
                        <View style={styles.actionsRow}>
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.softButton]}
                            disabled={busyId === `status:${offer.id}`}
                            onPress={() =>
                              void changeOfferStatus(
                                offer,
                                offer.allwainStatus === "paused"
                                  ? "active"
                                  : "paused",
                              )
                            }
                          >
                            <Text style={styles.softButtonText}>
                              {offer.allwainStatus === "paused"
                                ? "Activar"
                                : "Pausar"}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.softButton]}
                            disabled={busyId === `status:${offer.id}`}
                            onPress={() => confirmCloseOffer(offer)}
                          >
                            <Text style={styles.softButtonText}>Cerrar</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                      <Text style={styles.ownHelp}>
                        Cuando un comprador solicite una cantidad aparecerá en
                        Acuerdos.
                      </Text>
                    </View>
                  ) : (
                    <>
                      {typeof offer.price !== "number" ? (
                        <TouchableOpacity
                          style={[styles.fullSoftButton, styles.softButton]}
                          onPress={() => sendInterest(offer)}
                          disabled={interestBusy || offerBusy}
                        >
                          <Text style={styles.softButtonText}>
                            {interestBusy ? "Enviando..." : "Me interesa"}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                      {typeof offer.price === "number" ? (
                        <OfferOrderForm
                          offer={offer}
                          contract={null}
                          busy={offerBusy}
                          onSubmit={(quantity, delivery) => {
                            void requestOffer(
                              offer,
                              quantity,
                              delivery,
                              `allwain:${offer.id}:${Date.now()}:${Math.random().toString(36).slice(2, 12)}`,
                            );
                          }}
                        />
                      ) : null}
                    </>
                  )}
                </View>
              );
            })}
            {offersPage.hasNextPage ? (
              <TouchableOpacity
                style={[styles.fullSoftButton, styles.softButton]}
                onPress={() => void loadMoreOffers()}
                disabled={busyId === "more:offers"}
              >
                <Text style={styles.softButtonText}>
                  {busyId === "more:offers"
                    ? "Cargando..."
                    : "Mostrar más ofertas"}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        </View>
        <View onLayout={event => {ordersY.current = event.nativeEvent.layout.y;}} style={(isSeller ? sellerSection === "offers" : buyerSection === "offers") ? {display:"none"} : undefined}>
        {visibleRecurringPlans.length > 0 ? (
          <View style={styles.recurringSection}>
            <Text style={styles.sectionTitle}>Entregas programadas</Text>
            <Text style={styles.sectionHelp}>
              Cada fecha crea su propio pedido y cobro. Puedes detener las
              siguientes sin alterar las ya realizadas.
            </Text>
            {visibleRecurringPlans.map((plan) => {
              const isBusy = busyId === `recurring:${plan.id}`;
              const nextRun = plan.nextRunAt
                ? new Date(plan.nextRunAt).toLocaleDateString("es-ES", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : null;
              const canPause = plan.status === "active";
              const pendingOrder = unresolvedRecurringOrder(plan);
              const failureText = pendingOrder ? CHECKOUT_REVIEW_NOTICE : recurringFailureText(plan, isSeller);
              const resumeBlockedByConsent = [
                "RECURRING_PAYMENT_METHOD_MISSING",
                "RECURRING_TERMS_CHANGED",
              ].includes(plan.lastFailureCode || "");
              const canResume = !pendingOrder && (
                plan.status === "paused" ||
                (plan.status === "requires_action" &&
                  !isSeller &&
                  !resumeBlockedByConsent));
              const resumeLabel =
                plan.lastFailureCode ===
                "RECURRING_CARRIER_PRICE_REAPPROVAL_REQUIRED"
                  ? "Comprobar próxima fecha"
                  : "Reanudar";
              const canCancel = !["canceled", "completed"].includes(
                plan.status,
              );
              return (
                <View key={plan.id} style={styles.recurringCard}>
                  <View style={styles.recurringHeader}>
                    <View style={styles.recurringIcon}>
                      <CalendarClock size={21} color={colors.primary} />
                    </View>
                    <View style={styles.recurringCopy}>
                      <Text style={styles.recurringTitle}>
                        {quantityText(plan.quantity)} {plan.unit} ·{" "}
                        {recurringIntervalLabel(plan.interval).toLowerCase()}
                      </Text>
                      <Text style={styles.recurringMeta}>
                        Hasta{" "}
                        {formatMinorCurrency(
                          plan.maximumChargeAmount,
                          plan.currency,
                        )}{" "}
                        por entrega
                      </Text>
                    </View>
                    <Text style={styles.recurringStatus}>
                      {recurringStatusLabel(plan.status)}
                    </Text>
                  </View>
                  {nextRun ? (
                    <Text style={styles.recurringNext}>
                      Próximo cobro previsto: {nextRun}
                    </Text>
                  ) : null}
                  <Text style={styles.recurringHistory}>
                    {plan.completedOccurrences} entrega
                    {plan.completedOccurrences === 1 ? "" : "s"} completada
                    {plan.completedOccurrences === 1 ? "" : "s"}
                    {plan.failedOccurrences
                      ? ` · ${plan.failedOccurrences} intento${
                          plan.failedOccurrences === 1 ? "" : "s"
                        } pendiente${plan.failedOccurrences === 1 ? "" : "s"}`
                      : ""}
                  </Text>
                  {failureText ? (
                    <View style={styles.recurringWarning}>
                      <Text style={styles.recurringWarningTitle}>
                        Esta entrega está detenida
                      </Text>
                      <Text style={styles.recurringWarningText}>
                        {failureText}
                      </Text>
                      {pendingOrder ? (
                        <TouchableOpacity style={styles.recurringAction} disabled={isBusy}
                          accessibilityRole="button" accessibilityLabel="Actualizar estado de la programación"
                          onPress={() => void refreshRecurringState(plan)}>
                          <Text style={styles.recurringActionText}>{isBusy ? "Actualizando…" : "Actualizar estado"}</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : null}
                  {canPause || canResume || canCancel ? (
                    <View style={styles.recurringActions}>
                      {canPause ? (
                        <TouchableOpacity
                          style={styles.recurringAction}
                          onPress={() =>
                            void updateRecurringPlan(plan, "pause")
                          }
                          disabled={isBusy}
                        >
                          <Text style={styles.recurringActionText}>Pausar</Text>
                        </TouchableOpacity>
                      ) : null}
                      {canResume ? (
                        <TouchableOpacity
                          style={styles.recurringAction}
                          onPress={() =>
                            void updateRecurringPlan(plan, "resume")
                          }
                          disabled={isBusy}
                        >
                          <Text style={styles.recurringActionText}>
                            {resumeLabel}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                      {canCancel ? (
                        <TouchableOpacity
                          style={styles.recurringAction}
                          onPress={() => confirmCancelRecurring(plan)}
                          disabled={isBusy}
                        >
                          <Text style={styles.recurringCancelText}>
                            Cancelar
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : null}
                  {(isSeller ? plan.buyerUserId : plan.sellerUserId) !==
                  userId ? (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="Enviar mensaje privado sobre esta programación"
                      style={styles.chatButton}
                      onPress={() => {
                        const sourceOrder = orders.find(
                          (order) => order.id === plan.sourceOrderId,
                        );
                        const sourceContract = sourceOrder
                          ? contracts.find(
                              (contract) =>
                                contract.id === sourceOrder.contractId,
                            )
                          : null;
                        openPrivateMessage(
                          isSeller ? plan.buyerUserId : plan.sellerUserId,
                          isSeller
                            ? sourceContract?.requesterName || "Comprador Allwain"
                            : sourceContract?.providerName || "Vendedor Allwain",
                        );
                      }}
                    >
                      <MessageCircle size={19} color={colors.primary} />
                      <Text style={styles.chatButtonText}>
                        Enviar mensaje privado
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}

        <View
          style={styles.divider}
          onLayout={(event) => {
            agreementsY.current = event.nativeEvent.layout.y;
          }}
        />
        <Text style={styles.sectionTitle}>{isSeller && sellerSection === "preparation" ? "Pendientes de preparar o entregar" : "Mis pedidos"}</Text>
        <Text style={styles.sectionHelp}>
          {isSeller ? "Cada acuerdo te muestra el estado y el siguiente paso." : "Oferta aceptada → revisión y pago → preparación y entrega. Cada compra conserva aquí su ficha y su historial."}
        </Text>
        {sortedContracts.filter(contract => !isSeller || sellerSection !== "preparation" || sellerNeedsPreparation(orderByContract.get(contract.id))).length === 0 && !loading && verifiedSections.orders ? (
          <EmptyState
            title={isSeller && sellerSection === "preparation" ? "No hay pedidos que preparar" : "Sin pedidos todavía"}
            body={
              isSeller
                ? "Cuando un comprador haga un pedido aparecerá aquí con su siguiente paso."
                : "Acepta una oferta para iniciar el acuerdo."
            }
            demo={{
              title: "Pedido de 15 kg de naranjas",
              meta: isSeller ? "Tarjeta preparada · Cobro pendiente" : "Reserva confirmada · Cobro posterior",
              detail: "La misma ficha mostrará pago, preparación, envío y entrega sin perder el historial.",
              leading: <ShoppingBag size={20} color={colors.primary} />,
            }}
          />
        ) : null}

        {sortedContracts.filter(contract => !isSeller || sellerSection !== "preparation" || sellerNeedsPreparation(orderByContract.get(contract.id))).map((contract) => {
          const active =
            contract.status !== "accepted" && contract.status !== "rejected";
          const acceptedByUser = hasAccepted(contract, userId);
          const canAccept = active && !acceptedByUser;
          const expanded = expandedId === contract.id;
          const acceptBusy = busyId === `accept:${contract.id}`;
          const rejectBusy = busyId === `reject:${contract.id}`;
          const paymentBusy = busyId === `payment:${contract.id}`;
          const chargeBusy = busyId === `charge:${contract.id}`;
          const isBuyer = contract.requesterUserId === userId;
          const isProvider = contract.providerUserId === userId;
          const order = orderByContract.get(contract.id);
          const audit = order ? auditByOrder[order.id] : undefined;
          const auditExpanded = Boolean(
            order && expandedAuditOrderId === order.id,
          );
          const defaultSellerAction = sellerFulfillmentAction(
            order?.fulfillmentStatus,
          );
          const waitingForConnector = Boolean(
            order?.deliveryChannel === "local_connector" &&
              order.fulfillmentStatus === "ready",
          );
          const waitingForCarrier = Boolean(
            order?.deliveryChannel === "carrier" &&
              order.fulfillmentStatus === "ready",
          );
          const shipment = order ? shipmentsByOrder[order.id] : undefined;
          const nextSellerAction = !sellerCanFulfill(order) || waitingForConnector || waitingForCarrier
            ? null
            : order?.fulfillmentStatus === "ready" &&
                order.deliveryMethod !== "shipping"
              ? { action: "deliver", label: "Confirmar entrega" }
              : defaultSellerAction;
          const durableCheckoutBlock = checkoutBlockReason(order);
          const paymentNeedsAction = checkoutPaymentActionable(contract.paymentStatus);
          const reviewReady = Boolean(order && preparedTotals[contract.id] === `${order.totalAmount}:${order.currency?.toUpperCase()}`);
          const paymentActionable =
            paymentEnvironmentReady &&
            paymentNeedsAction &&
            reviewReady &&
            !durableCheckoutBlock;
          const needsReservationConsent =
            contract.paymentMode === "preorder" &&
            contract.paymentStatus === "awaiting_payment";
          const reservationConsent = reservationConsents[contract.id] === true;
          const commercialTermsConsent =
            commercialTermsConsents[contract.id] === true;
          const recurringOrder = contractRecurringOrder(contract);
          const needsRecurringConsent = Boolean(
            recurringOrder?.enabled && paymentActionable,
          );
          const recurringConsent = recurringConsents[contract.id] === true;
          const quantitySummary =
            typeof contract.quantity === "number"
              ? `${quantityText(contract.quantity)} ${contract.unit || "unidades"}`
              : "Cantidad por concretar";
          const totalSummary =
            typeof contract.totalPrice === "number"
              ? ` · ${formatCurrency(contract.totalPrice, contract.currency || "EUR")}`
              : "";
          const checkoutTotalAmount = buyerReviewAmount(contract, order);
          const preorderChargeDeadlineAt =
            order?.preorderChargeDeadlineAt ||
            contract.preorderChargeDeadlineAt ||
            null;
          const preorderMandateReady =
            contract.paymentMode !== "preorder" ||
            Boolean(preorderChargeDeadlineAt);
          const nextAction = active
            ? canAccept
              ? "Revisar y confirmar"
              : "Esperando a la otra parte"
            : isBuyer && paymentActionable
              ? "Continuar con el pago"
              : isProvider && checkoutPaymentActionable(order?.paymentStatus || contract.paymentStatus)
                ? "Ver pago pendiente"
              : isProvider && nextSellerAction
                ? nextSellerAction.label
                : isProvider && waitingForCarrier
                  ? shipment
                    ? carrierShipmentStatus(shipment.status)
                    : "Crear envío"
                : "Ver pedido";

          return (
            <View ref={node => {contractViews.current[contract.id] = node;}} key={contract.id} onLayout={event => {contractPositions.current[contract.id] = event.nativeEvent.layout.y;}} style={styles.contractGroup}>
              <OrderCard
                title={contract.offerTitle || "Pedido Allwain"}
                meta={`${quantitySummary}${totalSummary}`}
                detail={contractDeliveryText(contract)}
                status={isBuyer && contract.status === "accepted" ? paymentStatusText(contract) : agreementStatus(contract, userId)}
                statusTone={
                  contract.status === "accepted"
                    ? "success"
                    : contract.status === "rejected"
                      ? "neutral"
                      : "warning"
                }
                actionLabel={expanded ? "Ocultar detalle" : nextAction}
                onPress={() => {
                  const opening = !expanded;
                  selectContract(opening ? contract.id : null);
                  if (
                    opening &&
                    order?.deliveryChannel === "carrier" &&
                    shipmentsByOrder[order.id] === undefined
                  ) {
                    void loadCarrierShipment(order.id);
                  }
                }}
                contactLabel="Enviar mensaje privado"
                onContact={
                  isBuyer && contract.providerUserId
                      ? () =>
                          openPrivateMessage(
                            contract.providerUserId,
                            contract.providerName,
                          )
                      : isProvider && contract.requesterUserId
                        ? () =>
                            openPrivateMessage(
                              contract.requesterUserId,
                              contract.requesterName,
                            )
                        : undefined
                }
                leading={
                  <PublicationImage
                    imageUrl={contract.imageMeta?.url}
                    imageAlt={contract.imageMeta?.alt || contract.offerTitle || "Pedido Allwain"}
                    illustrative={contract.imageMeta?.illustrative === true}
                  />
                }
                leadingVariant="image"
              />
              {expanded ? (
                <View onLayout={event => {cardPositions.current[contract.id] = event.nativeEvent.layout.y;}} style={styles.contractCard}>
                  {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
                  {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
                  <View style={styles.cardHeader}>
                    <Text style={styles.offerTitle}>
                      {contract.offerTitle || "Acuerdo Allwain"}
                    </Text>
                    <Text
                      style={[
                        styles.statusBadge,
                        contract.status === "accepted" && styles.statusAccepted,
                        contract.status === "rejected" && styles.statusRejected,
                      ]}
                    >
                      {agreementStatus(contract, userId)}
                    </Text>
                  </View>
                  <Text style={styles.people}>
                    {contract.requesterName || "Cliente"} -{" "}
                    {contract.providerName || "Proveedor"}
                  </Text>
                  {typeof contract.quantity === "number" ? (
                    <View style={styles.contractOrderSummary}>
                      <Text style={styles.contractOrderQuantity}>
                        {quantityText(contract.quantity)}{" "}
                        {contract.unit || "unidades"}
                      </Text>
                      {typeof contract.totalPrice === "number" ? (
                        <Text style={styles.contractOrderTotal}>
                          Total {formatCurrency(contract.totalPrice, contract.currency || "EUR")}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                  {contract.notes ? (
                    <Text style={styles.price}>{contract.notes}</Text>
                  ) : null}
                  {contract.deliveryMethod ? (
                    <View style={styles.contractDeliveryBox}>
                      <Text style={styles.contractDeliveryTitle}>Entrega</Text>
                      <Text style={styles.contractDeliveryText}>
                        {contractDeliveryText(contract)}
                      </Text>
                      {contract.deliveryNotes ? (
                        <Text style={styles.deliveryHelp}>
                          {contract.deliveryNotes}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                  <View style={styles.acceptanceBox}>
                    <Text style={styles.acceptanceText}>
                      Cliente:{" "}
                      {contract.requesterAcceptedAt ? "Aceptado" : "Pendiente"}
                    </Text>
                    <Text style={styles.acceptanceText}>
                      Proveedor:{" "}
                      {contract.providerAcceptedAt ? "Aceptado" : "Pendiente"}
                    </Text>
                  </View>

                  {typeof checkoutTotalAmount === "number" && (!isBuyer || reviewReady || !paymentNeedsAction) ? (
                    <View style={styles.paymentBreakdown}>
                      {contract.feeBasis === "verified_savings" &&
                      typeof contract.referenceAmount === "number" ? (
                        <>
                          <View style={styles.paymentBreakdownRow}>
                            <Text style={styles.paymentBreakdownLabel}>
                              Precio de referencia
                            </Text>
                            <Text style={styles.paymentBreakdownValue}>
                              {moneyText(contract.referenceAmount, contract.currency || "eur")}
                            </Text>
                          </View>
                          <View style={styles.paymentBreakdownRow}>
                            <Text style={styles.paymentBreakdownLabel}>
                              Propuesta del vendedor
                            </Text>
                            <Text style={styles.paymentBreakdownValue}>
                              {moneyText(contract.acceptedOfferAmount, contract.currency || "eur")}
                            </Text>
                          </View>
                          <View style={styles.paymentBreakdownRow}>
                            <Text style={styles.paymentBreakdownLabel}>
                              Servicio Allwain{typeof contract.platformFeeBps === "number"
                                ? ` (${contract.platformFeeBps / 100} % del ahorro)` : ""}
                            </Text>
                            <Text style={styles.paymentBreakdownValue}>
                              {moneyText(contract.platformFeeAmount, contract.currency || "eur")}
                            </Text>
                          </View>
                          <View style={styles.savingsRow}>
                            <Text style={styles.savingsLabel}>Tu ahorro final</Text>
                            <Text style={styles.savingsValue}>
                              {moneyText(contract.netSavingsAmount, contract.currency || "eur")}
                            </Text>
                          </View>
                        </>
                      ) : null}
                      <View style={styles.paymentBreakdownRow}>
                        <Text style={styles.paymentBreakdownLabel}>
                          Producto
                        </Text>
                        <Text style={styles.paymentBreakdownValue}>
                          {moneyText(
                            order?.subtotalAmount ?? contract.subtotalAmount,
                            contract.currency || "eur",
                          )}
                        </Text>
                      </View>
                      {Number(order?.shippingAmount ?? contract.shippingAmount ?? 0) > 0 ? (
                        <View style={styles.paymentBreakdownRow}>
                          <Text style={styles.paymentBreakdownLabel}>Entrega</Text>
                          <Text style={styles.paymentBreakdownValue}>
                            {moneyText(order?.shippingAmount ?? contract.shippingAmount, contract.currency || "eur")}
                          </Text>
                        </View>
                      ) : null}
                      {Number(order?.taxAmount || 0) > 0 ? (
                        <View style={styles.paymentBreakdownRow}>
                          <Text style={styles.paymentBreakdownLabel}>Impuestos</Text>
                          <Text style={styles.paymentBreakdownValue}>
                            {moneyText(order?.taxAmount, contract.currency || "eur")}
                          </Text>
                        </View>
                      ) : null}
                      {Number(order?.agriculturalCompensationAmount || 0) > 0 ? (
                        <View style={styles.paymentBreakdownRow}>
                          <Text style={styles.paymentBreakdownLabel}>
                            Compensación agraria
                          </Text>
                          <Text style={styles.paymentBreakdownValue}>
                            {moneyText(
                              order?.agriculturalCompensationAmount,
                              contract.currency || "eur",
                            )}
                          </Text>
                        </View>
                      ) : null}
                      <View style={styles.paymentBreakdownRow}>
                        <Text style={styles.paymentBreakdownLabel}>
                          Total a pagar
                        </Text>
                        <Text style={styles.paymentBreakdownTotal}>
                          {moneyText(checkoutTotalAmount, contract.currency || "eur")}
                        </Text>
                      </View>
                    </View>
                  ) : null}

                  {contract.generatedText ? (
                    <View>
                      <TouchableOpacity accessibilityRole="button" accessibilityState={{expanded:termsExpanded[contract.id]===true}} onPress={() => setTermsExpanded(current => ({...current,[contract.id]:!current[contract.id]}))} style={styles.refreshBtn}>
                        <Text style={styles.refreshText}>{termsExpanded[contract.id] ? "Ocultar acuerdo completo" : "Consultar acuerdo completo"}</Text>
                      </TouchableOpacity>
                      {termsExpanded[contract.id] ? <Text style={styles.contractText}>{contract.generatedText}</Text> : null}
                    </View>
                  ) : null}

                  {active ? (
                    <View style={styles.actionsRow}>
                      {canAccept ? (
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.primaryButton]}
                          onPress={() => updateAgreement(contract, "accept")}
                          disabled={acceptBusy || rejectBusy}
                        >
                          {acceptBusy ? (
                            <ActivityIndicator color={colors.buttonText} />
                          ) : (
                            <Text style={styles.primaryButtonText}>
                              Confirmar acuerdo
                            </Text>
                          )}
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.waitingBox}>
                          <Text style={styles.waitingText}>
                            Tu aceptación está registrada
                          </Text>
                        </View>
                      )}
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.rejectButton]}
                        onPress={() => updateAgreement(contract, "reject")}
                        disabled={acceptBusy || rejectBusy}
                      >
                        <Text style={styles.rejectButtonText}>
                          {rejectBusy
                            ? "Actualizando..."
                            : contract.requesterUserId === userId
                              ? "Cancelar"
                              : "Rechazar"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : contract.status === "accepted" ? (
                    <Text style={styles.completedText}>
                      Acuerdo confirmado por ambas partes
                    </Text>
                  ) : null}

                  {contract.status === "accepted" &&
                  typeof contract.subtotalAmount === "number" ? (
                    <View ref={node => {paymentViews.current[contract.id] = node;}} onLayout={event => {paymentPositions.current[contract.id] = event.nativeEvent.layout.y;}} style={styles.paymentBox}>
                      {checkingPayment ? <Text accessibilityLiveRegion="polite" style={styles.sectionHelp}>Comprobando pago…</Text> : null}
                      {isBuyer && paymentNeedsAction && !reviewReady ? <View style={styles.recurringWarning}>
                        <Text accessibilityLiveRegion="polite" style={styles.sectionHelp}>{preparingReview === contract.id ? "Calculando el total completo del pedido…" : "Comprueba el total completo antes de aceptar las condiciones y pagar."}</Text>
                        <BigActionButton label="Preparar revisión" tone="light" busy={preparingReview === contract.id} onPress={() => void preparePaymentReview(contract)} />
                      </View> : null}
                      {isBuyer && order ? <TouchableOpacity accessibilityRole="button" onPress={() => void refreshCheckoutState(contract, order)} disabled={paymentBusy || checkingPayment} style={styles.refreshBtn}><Text style={styles.refreshText}>Consultar estado del pago</Text></TouchableOpacity> : null}
                      <View style={styles.paymentStatusRow}>
                        <Text style={styles.paymentBoxTitle}>
                          Pago con Stripe
                        </Text>
                        <Text
                          style={[
                            styles.paymentState,
                            contract.paymentStatus === "paid" &&
                              styles.paymentStateReady,
                            contract.paymentStatus === "payment_failed" &&
                              styles.paymentStateError,
                          ]}
                        >
                          {paymentStatusText(contract)}
                        </Text>
                      </View>

                      {isBuyer && paymentNeedsAction && durableCheckoutBlock && order ? (
                        <View style={styles.recurringWarning}>
                          <Text style={styles.recurringWarningTitle}>El intento de cobro requiere revisión</Text>
                          <Text style={styles.recurringWarningText}>{CHECKOUT_REVIEW_NOTICE}</Text>
                          <TouchableOpacity style={styles.recurringAction} disabled={paymentBusy}
                            accessibilityRole="button" accessibilityLabel="Actualizar estado del pago"
                            onPress={() => void refreshCheckoutState(contract, order)}>
                            <Text style={styles.recurringActionText}>{paymentBusy ? "Actualizando…" : "Actualizar estado"}</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}

                      {isBuyer && reviewReady && needsReservationConsent ? (
                        <View style={styles.consentRow}>
                          <Text style={styles.consentText}>
                            Autorizo a Stripe a guardar el método de pago y un
                            único cobro posterior de hasta{" "}
                            {moneyText(
                              checkoutTotalAmount,
                              contract.currency || "eur",
                            )}
                            {preorderChargeDeadlineAt
                              ? ` antes del ${new Date(preorderChargeDeadlineAt).toLocaleDateString("es-ES")}.`
                              : ". Falta definir la fecha límite de cobro."}
                            {" "}Puedo cancelar antes de que se inicie el cobro,
                            según el estado del pedido y las condiciones aceptadas.
                          </Text>
                          <Switch
                            value={reservationConsent}
                            onValueChange={(value) =>
                              setReservationConsents((current) => ({
                                ...current,
                                [contract.id]: value,
                              }))
                            }
                            trackColor={{
                              false: colors.cardBorder,
                              true: colors.primary,
                            }}
                            thumbColor={colors.card}
                            accessibilityLabel="Autorizar tarjeta para la reserva"
                          />
                        </View>
                      ) : null}

                      {isBuyer && needsRecurringConsent ? (
                        <View style={styles.consentRow}>
                          <Text style={styles.consentText}>
                            Autorizo un cobro de hasta {moneyText(checkoutTotalAmount, contract.currency || "eur")} por cada entrega {recurringOrder?.label?.toLowerCase() || "programada"}. Cada entrega será un pedido independiente y podré pausar o cancelar antes del siguiente cobro.
                          </Text>
                          <Switch
                            value={recurringConsent}
                            onValueChange={(value) =>
                              setRecurringConsents((current) => ({
                                ...current,
                                [contract.id]: value,
                              }))
                            }
                            trackColor={{
                              false: colors.cardBorder,
                              true: colors.primary,
                            }}
                            thumbColor={colors.card}
                            accessibilityLabel="Autorizar cobros recurrentes"
                          />
                        </View>
                      ) : null}

                      {isBuyer && error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
                      {isBuyer && paymentActionable ? (
                        <View style={styles.consentRow}>
                          <View style={styles.consentCopy}>
                            <Text style={styles.consentText}>
                              Confirmo comprar a {contract.providerName || "este vendedor"} por un total de {moneyText(checkoutTotalAmount, contract.currency || "eur")} y acepto las condiciones de compra. Allwain actúa como plataforma intermediaria.
                            </Text>
                            <TouchableOpacity
                              accessibilityRole="link"
                              onPress={() =>
                                void openExternalUrl(
                                  "https://allwain.es/terminos/",
                                )
                              }
                            >
                              <Text style={styles.legalLink}>Leer condiciones</Text>
                            </TouchableOpacity>
                          </View>
                          <Switch
                            value={commercialTermsConsent}
                            onValueChange={(value) =>
                              setCommercialTermsConsents((current) => ({
                                ...current,
                                [contract.id]: value,
                              }))
                            }
                            trackColor={{
                              false: colors.cardBorder,
                              true: colors.primary,
                            }}
                            thumbColor={colors.card}
                            accessibilityLabel="Aceptar condiciones de compra"
                          />
                        </View>
                      ) : null}

                      {isBuyer && paymentActionable ? (
                        <TouchableOpacity
                          accessibilityRole="button"
                          style={[
                            styles.fullPrimaryButton,
                            needsReservationConsent &&
                              !reservationConsent &&
                              styles.disabledButton,
                            !commercialTermsConsent && styles.disabledButton,
                            needsRecurringConsent &&
                              !recurringConsent &&
                              styles.disabledButton,
                            !preorderMandateReady && styles.disabledButton,
                          ]}
                          onPress={() => openContractCheckout(contract)}
                          disabled={
                            paymentBusy ||
                            chargeBusy ||
                            !commercialTermsConsent ||
                            (needsRecurringConsent && !recurringConsent) ||
                            !preorderMandateReady ||
                            (needsReservationConsent && !reservationConsent)
                          }
                        >
                          {paymentBusy ? (
                            <ActivityIndicator color={colors.buttonText} />
                          ) : (
                            <Text style={styles.primaryButtonText}>
                              {contract.paymentMode === "preorder" &&
                              ![
                                "payment_failed",
                                "requires_customer_action",
                              ].includes(contract.paymentStatus || "")
                                ? `Guardar tarjeta y autorizar ${moneyText(checkoutTotalAmount, contract.currency || "eur")}`
                                : contract.paymentStatus === "checkout_open"
                                  ? "Continuar pago con tarjeta"
                                  : `Pagar ${moneyText(checkoutTotalAmount, contract.currency || "eur")} con tarjeta`}
                            </Text>
                          )}
                        </TouchableOpacity>
                      ) : null}

                      {paymentEnvironmentReady &&
                      isProvider &&
                      contract.paymentStatus === "payment_method_saved" ? (
                        <TouchableOpacity
                          style={styles.fullPrimaryButton}
                          onPress={() => chargePreorder(contract)}
                          disabled={paymentBusy || chargeBusy}
                        >
                          {chargeBusy ? (
                            <ActivityIndicator color={colors.buttonText} />
                          ) : (
                            <Text style={styles.primaryButtonText}>
                              Cobrar reserva preparada
                            </Text>
                          )}
                        </TouchableOpacity>
                      ) : null}

                      {isProvider &&
                      contract.paymentStatus === "awaiting_payment" ? (
                        <Text style={styles.paymentHelp}>
                          Esperando el pago del cliente.
                        </Text>
                      ) : null}
                      {contract.paymentStatus === "payment_method_saved" &&
                      isBuyer ? (
                        <Text style={styles.paymentHelp}>
                          Tarjeta preparada. El vendedor solicitará el cobro al
                          confirmar el pedido.
                        </Text>
                      ) : null}
                      {contract.paymentStatus === "paid" ? (
                        <Text style={styles.paymentSuccess}>
                          Pago confirmado por Stripe.
                        </Text>
                      ) : null}
                    </View>
                  ) : null}

                  {order ? (
                    <View style={styles.fulfillmentBox}>
                      <View style={styles.paymentStatusRow}>
                        <View style={styles.fulfillmentTitleGroup}>
                          <Text style={styles.paymentBoxTitle}>
                            Pedido y entrega
                          </Text>
                          <Text style={styles.paymentHelp}>
                            {quantityText(order.quantity)} {order.unit} ·{" "}
                            {moneyText(order.subtotalAmount, order.currency)}
                          </Text>
                        </View>
                        <Text style={styles.fulfillmentState}>
                          {fulfillmentStatusText(order.fulfillmentStatus)}
                        </Text>
                      </View>
                      <View style={styles.orderJourney}>
                        <Text style={styles.orderJourneyTitle}>
                          Así avanza este pedido
                        </Text>
                        {orderJourneySteps(order).map((step, index) => (
                          <View key={step.label} style={styles.orderJourneyRow}>
                            <View
                              style={[
                                styles.orderJourneyMarker,
                                step.done && styles.orderJourneyMarkerDone,
                                step.current && styles.orderJourneyMarkerCurrent,
                              ]}
                            >
                              {step.done ? (
                                <Check size={14} color="#FFFFFF" strokeWidth={3} />
                              ) : (
                                <Text
                                  style={[
                                    styles.orderJourneyNumber,
                                    step.current && styles.orderJourneyNumberCurrent,
                                  ]}
                                >
                                  {index + 1}
                                </Text>
                              )}
                            </View>
                            <Text
                              style={[
                                styles.orderJourneyLabel,
                                step.done && styles.orderJourneyLabelDone,
                                step.current && styles.orderJourneyLabelCurrent,
                              ]}
                            >
                              {step.label}
                              {step.done ? " · Hecho" : step.current ? " · Ahora" : ""}
                            </Text>
                          </View>
                        ))}
                      </View>
                      <View style={styles.orderStateGrid}>
                        <Text style={styles.orderStateText}>
                          Pago: {paymentStatusText(contract)}
                        </Text>
                        <Text style={styles.orderStateText}>
                          Stock: {inventoryStatusText(order.inventoryStatus)}
                        </Text>
                        <Text style={styles.orderStateText}>
                          Liquidación: {transferStatusText(order.transferStatus)}
                        </Text>
                        {order.disputeStatus ? (
                          <Text style={styles.orderStateAlert}>
                            Incidencia de pago abierta
                          </Text>
                        ) : null}
                      </View>

                      {isBuyer &&
                      [
                        "not_started",
                        "awaiting_payment",
                        "checkout_open",
                        "payment_failed",
                        "requires_customer_action",
                        "payment_method_saved",
                        "payment_canceled",
                        "expired",
                      ].includes(order.paymentStatus) &&
                      order.status !== "canceled" ? (
                        <TouchableOpacity
                          style={[styles.fullSoftButton, styles.rejectButton]}
                          onPress={() => confirmCancelOrder(order)}
                          disabled={busyId === `cancel-order:${order.id}`}
                        >
                          <Text style={styles.rejectButtonText}>
                            {busyId === `cancel-order:${order.id}`
                              ? "Cancelando..."
                              : "Cancelar pedido"}
                          </Text>
                        </TouchableOpacity>
                      ) : null}

                      {isProvider && nextSellerAction ? (
                        <TouchableOpacity
                          style={styles.fullPrimaryButton}
                          onPress={() =>
                            updateFulfillment(order, nextSellerAction.action)
                          }
                          disabled={busyId === `fulfillment:${order.id}`}
                        >
                          {busyId === `fulfillment:${order.id}` ? (
                            <ActivityIndicator color={colors.buttonText} />
                          ) : (
                            <Text style={styles.primaryButtonText}>
                              {nextSellerAction.label}
                            </Text>
                          )}
                        </TouchableOpacity>
                      ) : null}
                      {isProvider && waitingForConnector ? (
                        <>
                          <Text style={styles.paymentHelp}>
                            {order.connectorUserId
                              ? "Pedido listo. Enseña el QR al Conector cuando llegue a recogerlo."
                              : "Pedido listo. Allwain está buscando un Conector disponible en tu zona."}
                          </Text>
                          {order.connectorUserId ? (
                            <DeliveryCheckpointPanel
                              orderId={order.id}
                              type="seller_handoff"
                              onVerified={() => void loadData()}
                            />
                          ) : null}
                        </>
                      ) : null}
                      {order.deliveryChannel === "carrier" ? (
                        <View style={styles.carrierBox}>
                          <View style={styles.carrierHeader}>
                            <View style={styles.carrierCopy}>
                              <Text style={styles.carrierTitle}>Mensajería Sendcloud</Text>
                              <Text style={styles.paymentHelp}>
                                {carrierShipmentStatus(shipment?.status)}
                                {shipment?.carrierName
                                  ? ` · ${shipment.carrierName}${shipment.serviceName ? ` ${shipment.serviceName}` : ""}`
                                  : ""}
                              </Text>
                            </View>
                            {busyId === `shipment-load:${order.id}` ? (
                              <ActivityIndicator color={colors.primary} />
                            ) : null}
                          </View>
                          {Number(order.carrierDeliveryAmount || 0) > 0 ? (
                            <Text style={styles.paymentHelp}>
                              Transporte pagado: {moneyText(order.carrierDeliveryAmount, order.currency)}
                            </Text>
                          ) : null}
                          {order.paymentMode === "preorder" &&
                          !["paid", "partially_refunded", "legacy_confirmed"].includes(
                            order.paymentStatus,
                          ) ? (
                            <Text style={styles.carrierNotice}>
                              Esta reserva todavía no se ha enviado al transportista. Se hará únicamente después de ejecutar el cobro y preparar el pedido.
                            </Text>
                          ) : null}
                          {isProvider &&
                          order.fulfillmentStatus === "ready" &&
                          ["paid", "partially_refunded", "legacy_confirmed"].includes(
                            order.paymentStatus,
                          ) &&
                          (!shipment || shipment.status === "failed") ? (
                            <TouchableOpacity
                              style={styles.fullPrimaryButton}
                              onPress={() => void createCarrierShipment(order)}
                              disabled={busyId === `shipment-create:${order.id}`}
                            >
                              {busyId === `shipment-create:${order.id}` ? (
                                <ActivityIndicator color={colors.buttonText} />
                              ) : (
                                <Text style={styles.primaryButtonText}>
                                  {shipment?.status === "failed"
                                    ? "Reintentar envío"
                                    : "Crear envío con Sendcloud"}
                                </Text>
                              )}
                            </TouchableOpacity>
                          ) : null}
                          {shipment?.trackingNumber ? (
                            <Text style={styles.carrierTracking}>
                              Seguimiento: {shipment.trackingNumber}
                            </Text>
                          ) : null}
                          {shipment?.trackingUrl ? (
                            <TouchableOpacity
                              style={styles.fullSoftButton}
                              onPress={() => void openExternalUrl(shipment.trackingUrl!)}
                            >
                              <Text style={styles.softButtonText}>Ver seguimiento</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      ) : null}
                      {isBuyer &&
                      order.deliveryChannel === "local_connector" &&
                      order.connectorUserId &&
                      order.fulfillmentStatus === "dispatched" ? (
                        <DeliveryCheckpointPanel
                          orderId={order.id}
                          type="buyer_delivery"
                          onVerified={() => void loadData()}
                        />
                      ) : null}
                      {isBuyer && order.fulfillmentStatus === "delivered" ? (
                        <TouchableOpacity
                          style={styles.fullPrimaryButton}
                          onPress={() => updateFulfillment(order, "complete")}
                          disabled={busyId === `fulfillment:${order.id}`}
                        >
                          <Text style={styles.primaryButtonText}>
                            Confirmar recepción y finalizar
                          </Text>
                        </TouchableOpacity>
                      ) : null}

                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="Hablar sobre este pedido"
                        style={styles.chatButton}
                        onPress={() =>
                          navigation.navigate("ChatThread", {
                            orderId: order.id,
                            title: contract.offerTitle || "Pedido Allwain",
                          })
                        }
                      >
                        <MessageCircle size={19} color={colors.primary} />
                        <Text style={styles.chatButtonText}>
                          Hablar sobre este pedido
                        </Text>
                      </TouchableOpacity>

                      <OrderReviewPanel orderId={order.id} />

                      <OrderCompliancePanel
                        order={order}
                        isSeller={isProvider}
                        token={token}
                      />

                      <TouchableOpacity
                        style={styles.auditButton}
                        onPress={() => loadOrderAudit(order.id)}
                        disabled={busyId === `audit:${order.id}`}
                      >
                        <Text style={styles.auditButtonText}>
                          {busyId === `audit:${order.id}`
                            ? "Verificando..."
                            : auditExpanded
                              ? "Ocultar trazabilidad"
                              : "Ver trazabilidad verificable"}
                        </Text>
                      </TouchableOpacity>
                      {auditExpanded && audit ? (
                        <View style={styles.auditPanel}>
                          <Text
                            style={
                              audit.verification.valid
                                ? styles.auditValid
                                : styles.auditInvalid
                            }
                          >
                            {audit.verification.valid
                              ? `Cadena íntegra · ${audit.verification.count} eventos`
                              : "La cadena de auditoría no supera la verificación"}
                          </Text>
                          {audit.verification.headHash ? (
                            <Text style={styles.auditHash}>
                              Huella final:{" "}
                              {audit.verification.headHash.slice(0, 20)}...
                            </Text>
                          ) : null}
                          {audit.events.map((event) => (
                            <View key={event.id} style={styles.auditEvent}>
                              <Text style={styles.auditEventTitle}>
                                {event.sequence}.{" "}
                                {auditEventLabel(event.eventType)}
                              </Text>
                              <Text style={styles.auditEventMeta}>
                                {new Date(event.occurredAt).toLocaleString(
                                  "es-ES",
                                )}{" "}
                                ·{" "}
                                {event.actor?.name ||
                                  event.actor?.email ||
                                  "Sistema"}
                              </Text>
                            </View>
                          ))}
                          <Text style={styles.auditNotice}>
                            {audit.legalNotice}
                          </Text>
                          <TouchableOpacity
                            style={styles.auditButton}
                            onPress={() => downloadOrderAuditPdf(order.id)}
                            disabled={busyId === `audit-pdf:${order.id}`}
                          >
                            <Text style={styles.auditButtonText}>
                              {busyId === `audit-pdf:${order.id}`
                                ? "Preparando PDF..."
                                : "Guardar justificante PDF"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
        {contractsPage.hasNextPage || ordersPage.hasNextPage ? (
          <TouchableOpacity
            style={[styles.fullSoftButton, styles.softButton]}
            onPress={() => void loadMoreActivity()}
            disabled={busyId === "more:activity"}
          >
            <Text style={styles.softButtonText}>
              {busyId === "more:activity"
                ? "Cargando..."
                : "Mostrar más pedidos"}
            </Text>
          </TouchableOpacity>
        ) : null}
        </View>
      </ScrollView>
      {(() => {
        const contract = contracts.find(item => item.id === expandedId);
        if (!contract || isSeller || buyerSection !== "orders" || contract.status !== "accepted" || !checkoutPaymentActionable(contract.paymentStatus)) return null;
        const order = orderByContract.get(contract.id);
        const reviewed = Boolean(order && preparedTotals[contract.id] === `${order.totalAmount}:${order.currency?.toUpperCase()}`);
        const blocked = checkoutBlockReason(order);
        const reservationReady = contract.paymentMode !== "preorder" || Boolean(order?.preorderChargeDeadlineAt || contract.preorderChargeDeadlineAt);
        const allConsents = commercialTermsConsents[contract.id] === true &&
          (!(contract.paymentMode === "preorder" && contract.paymentStatus === "awaiting_payment") || reservationConsents[contract.id] === true) &&
          (!contractRecurringOrder(contract)?.enabled || recurringConsents[contract.id] === true);
        const canContinue = reviewed && !blocked && paymentEnvironmentReady && allConsents && reservationReady;
        const paymentUnavailable = loading || !paymentEnvironmentReady;
        return <View testID="order-payment-footer" style={{paddingHorizontal:18,paddingTop:10,paddingBottom:Math.max(10,insets.bottom),borderTopWidth:1,borderColor:colors.cardBorder,backgroundColor:colors.card,gap:6}}>
          {reviewed && order ? <Text style={{color:colors.text,fontWeight:"800",textAlign:"center"}}>Total {moneyText(order.totalAmount,order.currency)}</Text> : null}
          {paymentUnavailable ? <Text accessibilityLiveRegion="polite" style={styles.paymentHelp}>
            {loading ? "Comprobando la disponibilidad del pago…" : paymentConfig ? "Pago no disponible ahora. Puedes consultar tu pedido y volver a comprobarlo." : "No pudimos comprobar la disponibilidad del pago. Tu pedido sigue guardado."}
          </Text> : null}
          <BigActionButton label={paymentUnavailable ? loading ? "Comprobando pago…" : "Actualizar disponibilidad del pago" : !reviewed ? "Comprobar total del pedido" : canContinue ? "Continuar con Stripe" : blocked ? "Revisar estado del pago" : "Revisar pago y condiciones"} tone="dark"
            busy={loading || preparingReview === contract.id || busyId === `payment:${contract.id}`}
            disabled={loading}
            onPress={() => { if(loading) return; if(!paymentEnvironmentReady) void loadData(); else if(!reviewed) void preparePaymentReview(contract); else if(canContinue) void openContractCheckout(contract); else scrollToContract(contract.id,true); }} />
        </View>;
      })()}
      <OfferPurchaseWizard
        visible={Boolean(selectedOffer)}
        offer={selectedOffer}
        busy={Boolean(selectedOffer && busyId === `offer:${selectedOffer.id}`)}
        stripeTestMode={stripeTestEnabled}
        error={error}
        onClearError={() => setError(null)}
        onClose={() => {
          if (selectedOffer?.id === ORANGES_DEMO_OFFER_ID) {
            consumedFocusKey.current = null;
          }
          setSelectedOffer(null);
        }}
        onSubmit={requestOffer}
        onOpenReputation={(providerId) => {
          setReputationUserId(providerId);
        }}
      />
      <ReputationModal
        visible={Boolean(reputationUserId)}
        userId={reputationUserId}
        onClose={() => setReputationUserId(null)}
      />
      <MarketRequestOfferWizard
        visible={Boolean(selectedMarketRequest && marketDraftReady)}
        request={selectedMarketRequest}
        draft={offerDraft}
        busy={Boolean(
          selectedMarketRequest &&
          busyId === `market:${selectedMarketRequest.id}`,
        )}
        error={error}
        onChange={saveMarketDraft}
        onDiscard={() => discardSellerDraft("market")}
        onClose={closeOfferForm}
        onSubmit={() => {
          if (selectedMarketRequest)
            void submitMarketOffer(selectedMarketRequest);
        }}
      />
      <CatalogOfferWizard
        visible={catalogFormOpen}
        draft={catalogDraft}
        busy={busyId === "catalog"}
        error={error}
        platformDirect={platformDirect}
        onChange={saveCatalogDraft}
        onDiscard={() => discardSellerDraft("catalog")}
        onClose={async () => {
          if (busyId === "catalog") return;
          const saved = await writeJourneyDraft(userId, "catalog-offer", catalogDraft);
          if (!saved) { setError("No se ha podido guardar el borrador. Reintenta antes de salir o descártalo expresamente."); return; }
          setCatalogFormOpen(false);
          setError(null);
        }}
        onSubmit={() => void submitCatalogOffer()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, backgroundColor: colors.background },
  content: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    padding: 18,
    paddingBottom: 36,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 6,
  },
  headerCopy: { flex: 1, gap: 4 },
  kicker: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  title: { fontSize: 24, fontWeight: "900", color: colors.text },
  subtitle: { color: colors.mutedText, fontWeight: "600", lineHeight: 20 },
  refreshBtn: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  refreshText: { fontWeight: "900", color: colors.text, fontSize: 12 },
  stateRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  error: {
    color: colors.danger,
    fontWeight: "800",
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#FFF0EE",
    borderWidth: 1,
    borderColor: "#F3C6BF",
  },
  notice: {
    color: colors.text,
    fontWeight: "700",
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#E9F7EF",
    borderWidth: 1,
    borderColor: "#9CC8AE",
  },
  testPaymentNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
    padding: 13,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#F0B7A6",
    backgroundColor: "#FFF3EE",
  },
  testPaymentIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFD9CC",
  },
  testPaymentCopy: { flex: 1, minWidth: 0, gap: 3 },
  testPaymentTitle: { color: "#7A351F", fontSize: 14, fontWeight: "900" },
  testPaymentText: {
    color: "#67483E",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  featuredHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 4,
  },
  featuredHeadingCopy: { flex: 1, gap: 2 },
  featuredKicker: { color: colors.brandDark, fontSize: 11, fontWeight: "900" },
  featuredBadge: {
    color: "#FFFFFF",
    backgroundColor: "#173D35",
    borderRadius: 6,
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 6,
    fontSize: 11,
    fontWeight: "900",
  },
  featuredCard: {
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: colors.card,
  },
  featuredOfferGroup: { gap: 8 },
  ownPublicationsSection: {
    gap: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  featuredBody: { padding: 14, gap: 8 },
  featuredTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
  },
  featuredPrice: { color: colors.brandDark, fontSize: 15, fontWeight: "900" },
  publishSection: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 13,
    gap: 12,
  },
  publishHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  publishCopy: { flex: 1, gap: 3 },
  compactPrimaryButton: {
    minHeight: 42,
    maxWidth: 128,
    borderRadius: 8,
    backgroundColor: colors.button,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  catalogForm: { gap: 8 },
  saleModeRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 6,
  },
  saleModeCopy: { flex: 1, minWidth: 0, gap: 3 },
  saleModeHelp: {
    color: colors.mutedText,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.text,
    marginTop: 6,
  },
  sectionHelp: { color: colors.mutedText, fontWeight: "600", marginBottom: 2 },
  muted: { color: colors.mutedText, fontWeight: "600", lineHeight: 20 },
  recurringSection: { gap: 8, marginTop: 8 },
  recurringCard: {
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    gap: 9,
  },
  recurringHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  recurringIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF1EC",
  },
  recurringCopy: { flex: 1, minWidth: 0, gap: 3 },
  recurringTitle: { color: colors.text, fontWeight: "900", lineHeight: 20 },
  recurringMeta: { color: colors.mutedText, fontWeight: "700", fontSize: 12 },
  recurringStatus: {
    maxWidth: 112,
    color: "#31557A",
    backgroundColor: "#EAF0F8",
    borderRadius: 6,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
    textAlign: "center",
  },
  recurringNext: { color: colors.text, fontWeight: "800" },
  recurringHistory: {
    color: colors.mutedText,
    fontWeight: "600",
    fontSize: 12,
  },
  recurringWarning: {
    borderLeftWidth: 3,
    borderLeftColor: "#D97706",
    backgroundColor: "#FFF7E8",
    paddingHorizontal: 11,
    paddingVertical: 9,
    gap: 3,
  },
  recurringWarningTitle: {
    color: "#7C3F00",
    fontSize: 12,
    fontWeight: "900",
  },
  recurringWarningText: {
    color: "#69421F",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  recurringActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  recurringAction: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.background,
  },
  recurringActionText: { color: colors.text, fontWeight: "900" },
  recurringCancelText: { color: colors.danger, fontWeight: "900" },
  card: {
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.card,
    gap: 8,
  },
  ownCard: { backgroundColor: "#F3F5F7" },
  requestCard: {
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.card,
    gap: 8,
  },
  requestSummary: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  requestImageFrame: {
    width: 84,
    height: 68,
    borderRadius: 6,
    overflow: "hidden",
  },
  requestSummaryCopy: { flex: 1, minWidth: 0, gap: 4 },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  offerTitle: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
    color: colors.text,
  },
  requestStatus: {
    maxWidth: 112,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    overflow: "hidden",
    color: "#175A46",
    backgroundColor: "#E4F3ED",
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
  },
  requestStatusSent: { color: "#31557A", backgroundColor: "#EAF0F8" },
  price: { color: colors.brandDark, fontWeight: "900" },
  providerText: { color: colors.text, fontWeight: "800", fontSize: 13 },
  requestFacts: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  factText: {
    color: colors.mutedText,
    fontWeight: "800",
    fontSize: 12,
    backgroundColor: colors.background,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  targetPrice: { color: colors.brandDark, fontWeight: "900", fontSize: 13 },
  sentOfferSummary: {
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    marginTop: 3,
    paddingTop: 10,
    gap: 5,
  },
  sentOfferPrice: { color: colors.text, fontWeight: "900", fontSize: 14 },
  offerForm: {
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    marginTop: 3,
    paddingTop: 12,
    gap: 8,
  },
  formTitle: { color: colors.text, fontWeight: "900", fontSize: 15 },
  fieldRow: { flexDirection: "row", gap: 10 },
  fieldColumn: { flex: 1, minWidth: 0, gap: 6 },
  fieldLabel: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 12,
    lineHeight: 16,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.card,
    color: colors.text,
    paddingHorizontal: 11,
    paddingVertical: 10,
    fontWeight: "600",
  },
  multilineInput: { minHeight: 88 },
  fullPrimaryButton: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: colors.button,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    marginTop: 3,
  },
  fullSoftButton: {
    width: "100%",
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    marginTop: 4,
  },
  disabledButton: { opacity: 0.45 },
  orderBox: {
    gap: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: "#F6F8F7",
  },
  inventorySummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 6,
  },
  inventoryText: { color: colors.mutedText, fontSize: 12, fontWeight: "800" },
  quantityControlRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  quantityStepButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  quantityStepText: { color: colors.text, fontSize: 24, fontWeight: "900" },
  quantityInput: {
    width: 78,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.card,
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
    paddingHorizontal: 8,
  },
  quantityUnit: { flex: 1, minWidth: 0, color: colors.text, fontWeight: "900" },
  orderTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  orderTotalLabel: { color: colors.mutedText, fontSize: 12, fontWeight: "700" },
  orderTotal: { color: colors.brandDark, fontSize: 16, fontWeight: "900" },
  deliverySegment: {
    minHeight: 42,
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    overflow: "hidden",
  },
  deliverySegmentButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    backgroundColor: colors.card,
  },
  deliverySegmentButtonActive: { backgroundColor: colors.primary },
  deliverySegmentText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  deliverySegmentTextActive: { color: colors.actionInk },
  deliveryHelp: { color: colors.mutedText, fontSize: 12, lineHeight: 17 },
  orderNotesInput: { minHeight: 68 },
  registeredOrder: { gap: 3, paddingVertical: 2 },
  registeredOrderTitle: { color: "#176B3A", fontSize: 12, fontWeight: "900" },
  registeredOrderValue: { color: colors.text, fontSize: 17, fontWeight: "900" },
  soldOutText: { color: colors.danger, fontWeight: "900" },
  inventoryManager: { gap: 9 },
  inventoryEditButton: {
    alignSelf: "flex-start",
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  inventoryEditText: { color: colors.brandDark, fontWeight: "900" },
  inventoryForm: {
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.background,
  },
  ownHelp: { color: colors.mutedText, fontWeight: "700" },
  ownFeaturedLabel: { color: colors.brandDark, fontWeight: "900", fontSize: 12 },
  actionsRow: { flexDirection: "row", gap: 10, marginTop: 4, width: "100%" },
  actionBtn: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  softButton: { backgroundColor: colors.card, borderColor: colors.cardBorder },
  buyerSectionTabs: { flexDirection: "row", gap: 6, marginVertical: 12, padding: 5, borderRadius: 14, backgroundColor: "#F0F2EF", borderWidth: 1, borderColor: colors.cardBorder },
  buyerSectionTab: { flex: 1, minWidth: 0, minHeight: 52, justifyContent: "center", alignItems: "center", gap: 7, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 6, borderRadius: 10, borderWidth: 1, borderColor: "transparent" },
  buyerSectionTabSelected: { backgroundColor: colors.highlight, borderColor: "#E6BCAE" },
  buyerSectionLabel: { color: colors.mutedText, fontSize: 14, lineHeight: 19, fontWeight: "600", textAlign: "center" },
  buyerSectionLabelSelected: { color: colors.actionInk, fontWeight: "900" },
  buyerSectionIndicator: { width: 26, height: 3, borderRadius: 2, backgroundColor: "transparent" },
  buyerSectionIndicatorSelected: { backgroundColor: colors.primary },
  loadNotice: { gap: 10, padding: 14, borderRadius: 12, backgroundColor: "#FFF5EE", borderWidth: 1, borderColor: "#E4CABB" },
  loadNoticeText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  softButtonText: {
    color: colors.text,
    fontWeight: "900",
    textAlign: "center",
  },
  primaryButton: { backgroundColor: colors.button, borderColor: colors.button },
  primaryButtonText: {
    color: colors.actionInk,
    fontWeight: "900",
    textAlign: "center",
  },
  rejectButton: { backgroundColor: colors.card, borderColor: colors.danger },
  rejectButtonText: {
    color: colors.danger,
    fontWeight: "900",
    textAlign: "center",
  },
  divider: { height: 1, backgroundColor: colors.cardBorder, marginVertical: 8 },
  contractGroup: { width: "100%", gap: 8 },
  contractCard: {
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.card,
    gap: 8,
  },
  statusBadge: {
    maxWidth: 150,
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: "hidden",
    textAlign: "center",
  },
  statusAccepted: { color: "#176B3A", backgroundColor: "#E9F7EF" },
  statusRejected: { color: colors.danger, backgroundColor: "#FDEEEE" },
  people: { color: colors.text, fontWeight: "800" },
  contractOrderSummary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 6,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#F6F8F7",
  },
  contractOrderQuantity: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  contractOrderTotal: {
    color: colors.brandDark,
    fontSize: 15,
    fontWeight: "900",
  },
  contractDeliveryBox: {
    gap: 3,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: "#F6F8F7",
  },
  contractDeliveryTitle: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "800",
  },
  contractDeliveryText: { color: colors.text, fontWeight: "900" },
  acceptanceBox: {
    gap: 4,
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.background,
  },
  acceptanceText: { color: colors.mutedText, fontWeight: "800" },
  paymentBreakdown: {
    gap: 5,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  paymentBreakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  paymentBreakdownLabel: {
    flex: 1,
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "700",
  },
  paymentBreakdownValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "900",
  },
  savingsRow: {
    minHeight: 42,
    marginVertical: 4,
    borderRadius: 7,
    backgroundColor: "#EDF7F0",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  savingsLabel: { color: colors.success, fontSize: 13, fontWeight: "900" },
  savingsValue: { color: colors.success, fontSize: 16, fontWeight: "900" },
  paymentBreakdownTotal: {
    color: colors.brandDark,
    fontSize: 14,
    fontWeight: "900",
  },
  contractText: { color: colors.text, lineHeight: 20 },
  textLink: { color: colors.brandDark, fontWeight: "900" },
  waitingBox: { flex: 1, minWidth: 0, justifyContent: "center" },
  waitingText: { color: colors.mutedText, fontWeight: "800" },
  paymentBox: {
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  paymentStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  paymentBoxTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  paymentState: {
    maxWidth: "55%",
    color: colors.brandDark,
    fontSize: 11,
    fontWeight: "900",
    textAlign: "right",
  },
  paymentStateReady: { color: "#176B3A" },
  paymentStateError: { color: colors.danger },
  consentRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.background,
  },
  consentCopy: { flex: 1, minWidth: 0, gap: 4 },
  consentText: {
    flex: 1,
    color: colors.text,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  legalLink: { color: colors.brandDark, fontSize: 12, fontWeight: "900" },
  paymentHelp: {
    color: colors.mutedText,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  carrierBox: {
    gap: 9,
    padding: 11,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: "#F7F9F8",
  },
  carrierHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  carrierCopy: { flex: 1, minWidth: 0, gap: 2 },
  carrierTitle: { color: colors.text, fontSize: 14, fontWeight: "900" },
  carrierNotice: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    padding: 9,
    borderRadius: 6,
    backgroundColor: "#FFF1EC",
  },
  carrierTracking: { color: colors.text, fontSize: 12, fontWeight: "900" },
  paymentSuccess: { color: "#176B3A", fontWeight: "900" },
  fulfillmentBox: {
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  fulfillmentTitleGroup: { flex: 1, gap: 2 },
  fulfillmentState: {
    maxWidth: "48%",
    color: colors.brandDark,
    fontSize: 11,
    fontWeight: "900",
    textAlign: "right",
  },
  orderStateGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  orderJourney: {
    gap: 7,
    paddingVertical: 4,
  },
  orderJourneyTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  orderJourneyRow: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  orderJourneyMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  orderJourneyMarkerDone: {
    borderColor: "#176B4D",
    backgroundColor: "#176B4D",
  },
  orderJourneyMarkerCurrent: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  orderJourneyNumber: {
    color: colors.mutedText,
    fontSize: 11,
    fontWeight: "900",
  },
  orderJourneyNumberCurrent: { color: colors.brandDark },
  orderJourneyLabel: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: "700",
  },
  orderJourneyLabelDone: { color: "#176B4D" },
  orderJourneyLabelCurrent: { color: colors.text, fontWeight: "900" },
  orderStateText: {
    color: colors.mutedText,
    backgroundColor: colors.highlight,
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: "800",
  },
  orderStateAlert: {
    color: colors.danger,
    backgroundColor: "#FDEEEE",
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: "900",
  },
  auditButton: {
    minHeight: 42,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  auditButtonText: {
    color: colors.text,
    fontWeight: "900",
    textAlign: "center",
  },
  chatButton: {
    minHeight: 46,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#FFC8BA",
    backgroundColor: colors.highlight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  chatButtonText: {
    color: colors.text,
    fontWeight: "900",
    textAlign: "center",
  },
  auditPanel: {
    gap: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 10,
    backgroundColor: colors.highlight,
  },
  auditValid: { color: "#176B3A", fontWeight: "900" },
  auditInvalid: { color: colors.danger, fontWeight: "900" },
  auditHash: { color: colors.mutedText, fontSize: 11, fontFamily: "monospace" },
  auditEvent: {
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: 7,
  },
  auditEventTitle: { color: colors.text, fontSize: 12, fontWeight: "800" },
  auditEventMeta: { color: colors.mutedText, fontSize: 11, marginTop: 2 },
  auditNotice: {
    color: colors.mutedText,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 2,
  },
  completedText: { color: "#176B3A", fontWeight: "900" },
});
