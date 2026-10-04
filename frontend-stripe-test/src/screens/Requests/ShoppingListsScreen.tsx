import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AppAlert as Alert } from "../../utils/appAlert";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import * as DocumentPicker from "expo-document-picker";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronRight,
  FileUp,
  ListChecks,
  LockKeyhole,
  MapPin,
  MessageCircle,
  PackageSearch,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingCart,
  Sparkles,
  Trash2,
} from "lucide-react-native";

import {
  apiAuthGet,
  apiAuthPatch,
  apiAuthPost,
  type AllwainContract,
  type AllwainOffer,
  type AllwainShoppingList,
  type AllwainShoppingListItem,
  type AllwainShoppingListProposal,
} from "../../config/api";
import {
  BigActionButton,
  EmptyState,
  PublicationImage,
  StatusChip,
} from "../../components/design-system";
import type { RootStackParamList } from "../../navigation/types";
import { useAuthStore } from "../../store/auth.store";
import { captureAuthSession } from "../../store/authSessionBridge";
import { colors } from "../../theme/colors";
import { useRequestKeyboardLayout } from "../../components/useRequestKeyboardLayout";
import { clearJourneyDraft, readJourneyDraft, writeJourneyDraft } from "../../utils/journeyDrafts";
import { getAllwainCurrentLocation } from "../../utils/currentLocation";
import { interpretDeliveryWindow } from "../../utils/deliveryIntelligence";
import { formatCurrency } from "../../utils/format";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { createShoppingListRequestGuard, shoppingProposalDetailMatches, shoppingProposalLifecycle, shoppingProposalOrderTarget, shoppingProposalWithdrawalConfirmed } from "../../utils/shoppingProposalLifecycle";
import { shoppingProposalCopy, shoppingProposalFailure } from "../../utils/shoppingProposalCopy";
import { useSellerProposalDraft } from "../../utils/useSellerProposalDraft";
import { sellerProposalFingerprint, sellerProposalStamp, sellerProposalSubmissionConfirmed, type SellerProposalForm, type SellerSubmission } from "../../utils/sellerProposalDraft";
import { sellerProposalDraftCopy } from "../../i18n/sellerProposalDraftCopy";
import { captureAnalyticsGuard, createDiscoveryAnalyticsState, recordAppliedFilters, recordDiscoveryResults, recordPublicationWithdrawal } from "../../analytics/purchaseAnalytics";
import type { AppLocale, TranslationKey } from "../../i18n";
import DiscoveryFilters from "../../components/DiscoveryFilters";
import VirtualizedResults from "../../components/VirtualizedResults";
import DemandFilterFields from "../../components/DemandFilterFields";
import { discoveryPageUrl, discoveryQueryKey, useDiscoveryQuery, type DiscoveryQuery } from "../../utils/discoveryFilters";
import { discoveryFilterCopy } from "../../i18n/discoveryFilterCopy";
import { demandFilterSummary } from "../../i18n/demandFilterCopy";
import { discoveryPageCursor, mergeDiscoveryPage, MARKET_LIST_FILTERS, OWN_LIST_FILTERS, type DiscoveryPageInfo } from "../../utils/marketDiscovery";
import {
  ProposalCountdown,
  ProposalValidityControl,
} from "../../components/ProposalValidityControl";

type Props = NativeStackScreenProps<RootStackParamList, "ShoppingLists">;
type PageInfo = DiscoveryPageInfo;
type ScreenView = "overview" | "create" | "detail";
type Recurrence = "once" | "weekly" | "biweekly" | "monthly";
type DeliveryChannel = "local_connector" | "carrier" | "seller" | "pickup";
type Translate = (key: TranslationKey, replacements?: Record<string, string | number>) => string;

type DraftItem = {
  key: string;
  productName: string;
  quantity: string;
  unit: string;
  targetUnitPrice: string;
  notes: string;
  category?: string | null;
  subcategory?: string | null;
  productKind?: string | null;
};
type ListDraft = { wizardStep: number; editingListId: string | null; rawText: string; draftItems: DraftItem[]; title: string; description: string; recurrence: Recurrence; proposalWindowDays: number; needByText: string; locationLabel: string; deliveryChannel: DeliveryChannel; allowSubstitutions: boolean };

const UNITS = [
  ["ud", "Unidades"],
  ["kg", "Kilogramos"],
  ["g", "Gramos"],
  ["l", "Litros"],
  ["ml", "Mililitros"],
  ["caja", "Cajas"],
  ["pack", "Paquetes"],
  ["saco", "Sacos"],
  ["rollo", "Rollos"],
  ["par", "Pares"],
  ["servicio", "Servicios"],
  ["hora", "Horas"],
] as const;

function draftKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function blankItem(): DraftItem {
  return {
    key: draftKey(),
    productName: "",
    quantity: "1",
    unit: "ud",
    targetUnitPrice: "",
    notes: "",
  };
}

function asDraftItem(item: AllwainShoppingListItem): DraftItem {
  const target =
    typeof item.targetUnitPrice === "number"
      ? item.targetUnitPrice
      : typeof item.targetUnitPriceAmount === "number"
        ? item.targetUnitPriceAmount / 100
        : null;
  return {
    key: item.id || draftKey(),
    productName: item.productName,
    quantity: String(item.quantity).replace(".", ","),
    unit: item.unit || "ud",
    targetUnitPrice: target === null ? "" : String(target).replace(".", ","),
    notes: item.notes || "",
    category: item.category,
    subcategory: item.subcategory,
    productKind: item.productKind,
  };
}

function parseNumber(value: string) {
  const result = Number(value.trim().replace(",", "."));
  return Number.isFinite(result) && result > 0 ? result : null;
}

function listStatus(list: AllwainShoppingList, t: Translate) {
  if (list.status === "draft") return { label: t("shopping.status.draft"), tone: "warning" as const };
  if (list.status === "published") return { label: t("shopping.status.published"), tone: "brand" as const };
  if (list.status === "partially_awarded") return { label: t("shopping.status.partial"), tone: "warning" as const };
  if (list.status === "awarded") return { label: t("shopping.status.awarded"), tone: "success" as const };
  if (list.status === "closed") return { label: t("shopping.status.closed"), tone: "success" as const };
  if (list.status === "canceled") return { label: t("shopping.status.canceled"), tone: "neutral" as const };
  return { label: t("shopping.status.archived"), tone: "neutral" as const };
}

function recurrenceLabel(list: AllwainShoppingList, t: Translate) {
  if (!list.recurrence?.enabled) return t("market.singlePurchase");
  if (list.recurrence.interval === "weekly") return t("market.recurrence.weekly");
  if (list.recurrence.interval === "biweekly") return t("market.recurrence.biweekly");
  return t("market.recurrence.monthly");
}

function itemSummary(list: AllwainShoppingList, t: Translate) {
  const names = list.items.slice(0, 3).map((item) => item.productName);
  const remaining = list.items.length - names.length;
  return `${names.join(", ")}${remaining > 0 ? ` · ${t("market.andMore", { count: remaining })}` : ""}`;
}

function dateLabel(value: string | null | undefined, locale: AppLocale, t: Translate) {
  if (!value) return t("shopping.noDeadline");
  return new Date(value).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function euroInput(cents?: number | null) {
  return typeof cents === "number"
    ? String(cents / 100).replace(".", ",")
    : "";
}

export default function ShoppingListsScreen({ navigation, route }: Props) {
  const { keyboardAvoidingProps, footerPaddingBottom } = useRequestKeyboardLayout(10);
  const wizardScroll = useRef<ScrollView>(null);
  const productInputs = useRef<Record<string, TextInput | null>>({});
  const productOffsets = useRef<Record<string, number>>({});
  const titleInput = useRef<TextInput>(null);
  const { locale, t } = useAppTranslation();
  const user = useAuthStore((state) => state.user);
  const renderedSession = captureAuthSession();
  const actorSession = useMemo(() => renderedSession, [renderedSession.owner, renderedSession.generation]);
  const appMode = useAuthStore((state) => state.appMode);
  const setAppMode = useAuthStore((state) => state.setAppMode);
  const sellerEnabled = user?.participation?.seller?.enabled === true;
  const sellerMode = route.params?.mode === "sell" || (route.params?.mode !== "buy" && appMode === "sell");
  const screenScope = `${user?.id || ""}:${sellerMode ? "sell" : "buy"}`;
  const requestGuard = useRef(createShoppingListRequestGuard(screenScope)).current;
  requestGuard.setScope(screenScope);
  const mounted = useRef(true);
  const isCurrentScope = useCallback(() => {
    const live = useAuthStore.getState();
    const liveSellerMode = route.params?.mode === "sell" || (route.params?.mode !== "buy" && live.appMode === "sell");
    return mounted.current && actorSession.isCurrent() && Boolean(user?.id) && live.user?.id === user?.id && liveSellerMode === sellerMode;
  }, [user?.id, actorSession, sellerMode, route.params?.mode]);

  const [view, setView] = useState<ScreenView>(route.params?.create ? "create" : route.params?.shoppingListId ? "detail" : "overview");
  const [lists, setLists] = useState<AllwainShoppingList[]>([]);
  const [selectedState, setSelectedState] = useState<{ scope: string; list: AllwainShoppingList } | null>(null);
  const selected = selectedState?.scope === screenScope ? selectedState.list : null;
  const setSelected = useCallback((list: AllwainShoppingList | null) => {
    setSelectedState(list ? { scope: screenScope, list } : null);
  }, [screenScope]);
  const [page, setPage] = useState<PageInfo>({});
  const { query, setQuery, ready: queryReady } = useDiscoveryQuery(user?.id || "", sellerMode ? "shopping-market" : "shopping-mine");
  const appliedKey = discoveryQueryKey(query);
  const appliedQueryRef = useRef(query);
  const appliedKeyRef = useRef(appliedKey);
  appliedQueryRef.current = query;
  appliedKeyRef.current = appliedKey;
  const overviewStarted = useRef<string | null>(null);
  const overviewDirty = useRef(false);
  const overviewFlight = useRef<string | null>(null);
  const failedOverview = useRef<string | null>(null);
  const analyticsState = useRef(createDiscoveryAnalyticsState()).current;
  const filterCopy = discoveryFilterCopy[locale];
  const setMutatedList = useCallback((list: AllwainShoppingList) => {
    overviewDirty.current = true;
    requestGuard.invalidate("overview");
    overviewFlight.current = null;
    setSelected(list);
  }, [requestGuard, setSelected]);
  const [loading, setLoading] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const sellerDraftExit = useRef<(() => Promise<boolean>) | null>(null);
  const draftExitPending = useRef(false);
  const bypassDraftExit = useRef(false);
  const registerSellerDraftExit = useCallback((handler: (() => Promise<boolean>) | null) => { sellerDraftExit.current = handler; }, []);
  const orderLookupBusy = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const [wizardStep, setWizardStep] = useState(1);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [rawText, setRawText] = useState("");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence>("once");
  const [proposalWindowDays, setProposalWindowDays] = useState(14);
  const [needByText, setNeedByText] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [locationCoords, setLocationCoords] = useState<{ latitude?: number; longitude?: number }>({});
  const [deliveryChannel, setDeliveryChannel] = useState<DeliveryChannel>("local_connector");
  const [allowSubstitutions, setAllowSubstitutions] = useState(false);
  const [locating, setLocating] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const draftAccount = useRef<string | null>(null);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const localDraft = useMemo<ListDraft>(() => ({ wizardStep, editingListId, rawText, draftItems, title, description, recurrence, proposalWindowDays, needByText, locationLabel, deliveryChannel, allowSubstitutions }), [wizardStep, editingListId, rawText, draftItems, title, description, recurrence, proposalWindowDays, needByText, locationLabel, deliveryChannel, allowSubstitutions]);
  const hasDraft = Boolean(rawText || draftItems.length || title);
  const persistDraft = useCallback(async () => {
    if (!user?.id || draftAccount.current !== user.id || !draftReady || !hasDraft) return true;
    return writeJourneyDraft(user.id, "shopping-list", localDraft);
  }, [user?.id, draftReady, hasDraft, localDraft]);

  useEffect(() => {
    let active = true;
    if (!user?.id) return;
    void readJourneyDraft<ListDraft>(user.id, "shopping-list").then((draft) => {
      if (!active) return;
      if (draft && Array.isArray(draft.draftItems) && typeof draft.rawText === "string") {
        setWizardStep([1, 2, 3].includes(draft.wizardStep) ? draft.wizardStep : 1);
        setEditingListId(draft.editingListId || null);
        setRawText(draft.rawText);
        setDraftItems(draft.draftItems.filter((item) => typeof item?.productName === "string" && typeof item.quantity === "string" && typeof item.unit === "string" && typeof item.targetUnitPrice === "string" && typeof item.notes === "string"));
        setTitle(draft.title || ""); setDescription(draft.description || "");
        setRecurrence(draft.recurrence || "once"); setProposalWindowDays(draft.proposalWindowDays || 14);
        setNeedByText(draft.needByText || ""); setLocationLabel(draft.locationLabel || "");
        setDeliveryChannel(draft.deliveryChannel || "local_connector"); setAllowSubstitutions(draft.allowSubstitutions === true);
        setDraftNotice("Borrador recuperado. Por privacidad, vuelve a indicar la dirección exacta si hace falta.");
      }
      draftAccount.current = user.id;
      setDraftReady(true);
    });
    return () => { active = false; };
  }, [user?.id]);
  useEffect(() => {
    if (view !== "create") return;
    void persistDraft().then((saved) => { if (!saved) setDraftNotice("No pudimos guardar en este dispositivo. Mantén abierta la lista."); });
  }, [view, persistDraft]);
  useEffect(() => { wizardScroll.current?.scrollTo({ y: 0, animated: false }); setError(null); }, [wizardStep]);
  useEffect(() => navigation.addListener("beforeRemove", (event) => {
    if (bypassDraftExit.current) { bypassDraftExit.current = false; return; }
    if (view === "detail" && selected && selected.buyerUserId !== user?.id && sellerDraftExit.current && ["GO_BACK", "POP"].includes(event.data.action.type)) {
      event.preventDefault();
      if (draftExitPending.current) return;
      draftExitPending.current = true;
      void sellerDraftExit.current().then(saved => {
        if (saved && isCurrentScope()) { bypassDraftExit.current = true; navigation.dispatch(event.data.action); }
      }).finally(() => { draftExitPending.current = false; });
      return;
    }
    if (view !== "create" || !["GO_BACK", "POP"].includes(event.data.action.type)) return;
    event.preventDefault();
    if (wizardStep > 1) setWizardStep((current) => current - 1);
    else { setView("overview"); navigation.setParams({ create: false }); }
  }), [navigation, view, wizardStep, selected, user?.id, isCurrentScope]);

  const resetWizard = useCallback(() => {
    setWizardStep(1);
    setEditingListId(null);
    setRawText("");
    setDraftItems([]);
    setWarnings([]);
    setTitle("");
    setDescription("");
    setRecurrence("once");
    setProposalWindowDays(14);
    setNeedByText("");
    setDeliveryAddress("");
    setLocationLabel("");
    setLocationCoords({});
    setDeliveryChannel("local_connector");
    setAllowSubstitutions(false);
    setError(null);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; requestGuard.invalidate(); };
  }, [requestGuard]);
  useLayoutEffect(() => {
    requestGuard.invalidate();
    setLists([]); setPage({}); setSelected(null);
    setLoading(false); setMoreBusy(false); setBusy(false); setError(null);
    setOverviewLoading(false); setOverviewError(null);
    overviewStarted.current = null; overviewFlight.current = null; overviewDirty.current = false;
    orderLookupBusy.current = false;
  }, [screenScope, requestGuard, setSelected]);
  useLayoutEffect(() => {
    requestGuard.invalidate("overview");
    overviewStarted.current = null; overviewFlight.current = null; failedOverview.current = null;
    setLists([]); setPage({}); setOverviewLoading(false); setMoreBusy(false); setOverviewError(null);
  }, [appliedKey, actorSession, requestGuard]);
  useLayoutEffect(() => { draftAccount.current = null; resetWizard(); setDraftReady(false); setDraftNotice(null); }, [user?.id, resetWizard]);

  const loadOverview = useCallback(async (search: DiscoveryQuery = appliedQueryRef.current, cursor?: string | null) => {
    if (!queryReady || !isCurrentScope()) return;
    const queryKey = discoveryQueryKey(search);
    if (queryKey !== appliedKeyRef.current) return;
    const flightKey = `${screenScope}:${queryKey}`;
    if (cursor && overviewFlight.current === flightKey) return;
    overviewFlight.current = flightKey;
    overviewStarted.current = flightKey;
    const ticket = requestGuard.start("overview");
    const current = () => isCurrentScope() && requestGuard.isCurrent(ticket) && appliedKeyRef.current === queryKey;
    const analyticsCurrent = captureAnalyticsGuard(current);
    const append = Boolean(cursor);
    if (append) setMoreBusy(true);
    else setOverviewLoading(true);
    setOverviewError(null);
    try {
      const endpoint = sellerMode ? "/allwain/shopping-lists/market" : "/allwain/shopping-lists/mine";
      const response = await apiAuthGet<{ items: AllwainShoppingList[]; pageInfo?: PageInfo }>(
        discoveryPageUrl(endpoint, search, { limit: 25, cursor: cursor || undefined, allowed: sellerMode ? MARKET_LIST_FILTERS : OWN_LIST_FILTERS }),
      );
      if (!current()) return;
      setLists((current) => {
        if (!append) return response.items || [];
        return mergeDiscoveryPage(current, response.items || []);
      });
      setPage({ ...response.pageInfo, queryKey });
      overviewDirty.current = false;
      if (Array.isArray(response.items)) void recordDiscoveryResults({state:analyticsState,scope:`${screenScope}:${actorSession.generation}`,queryKey,query:search,surface:"shopping_lists",appMode:sellerMode ? "sell" : "buy",current:analyticsCurrent,resultCount:response.items.length,append,allowed:sellerMode ? MARKET_LIST_FILTERS : OWN_LIST_FILTERS});
    } catch (loadError: any) {
      if (!current()) return;
      failedOverview.current = cursor || null;
      setOverviewError(loadError?.message || filterCopy.error);
    } finally {
      if (current()) { overviewFlight.current = null; setOverviewLoading(false); setMoreBusy(false); }
    }
  }, [sellerMode, screenScope, queryReady, requestGuard, isCurrentScope, filterCopy.error]);

  const loadDetail = useCallback(async (shoppingListId: string) => {
    const ticket = requestGuard.start("detail");
    const current = () => isCurrentScope() && requestGuard.isCurrent(ticket);
    setLoading(true);
    setError(null);
    try {
      const result = await apiAuthGet<AllwainShoppingList>(
        `/allwain/shopping-lists/${shoppingListId}`,
      );
      if (!current()) return;
      setSelected(result);
      setView("detail");
    } catch (loadError: any) {
      if (!current()) return;
      setError(loadError?.message || "No pudimos abrir esta lista.");
    } finally {
      if (current()) setLoading(false);
    }
  }, [requestGuard, isCurrentScope, screenScope, setSelected]);

  useFocusEffect(
    useCallback(() => {
      if (route.params?.create) {
        setView("create");
        return;
      }
      if (route.params?.shoppingListId) {
        void loadDetail(route.params.shoppingListId);
        return;
      }
      if (viewRef.current === "create") return;
      setView("overview");
      if (overviewStarted.current !== `${screenScope}:${appliedKey}` || overviewDirty.current) void loadOverview();
    }, [loadDetail, loadOverview, resetWizard, screenScope, appliedKey, route.params?.create, route.params?.shoppingListId]),
  );

  function beginCreate() {
    setView("create");
  }

  async function discardDraft() {
    if (user?.id) await clearJourneyDraft(user.id, "shopping-list");
    resetWizard();
    setDraftNotice("Borrador descartado.");
  }

  async function openCamera() {
    const saved = await persistDraft();
    if (!saved) { setError("No pudimos guardar la lista antes de abrir la cámara. Inténtalo de nuevo."); return; }
    navigation.navigate("Scan", { returnTo: "shopping-list" });
  }

  async function saveAndExit() {
    if (!await persistDraft()) { setError("No pudimos guardar. Inténtalo de nuevo antes de salir."); return; }
    setView("overview");
    navigation.setParams({ create: false });
    void loadOverview(query);
  }

  function openList(list: AllwainShoppingList) {
    setSelected(list);
    setView("detail");
    void loadDetail(list.id);
  }

  function back() {
    if (view === "detail" && selected && selected.buyerUserId !== user?.id && sellerDraftExit.current) {
      if (draftExitPending.current) return;
      draftExitPending.current = true;
      void sellerDraftExit.current().then(saved => { if (saved && isCurrentScope()) leaveDetail(); }).finally(() => { draftExitPending.current = false; });
      return;
    }
    leaveDetail();
  }

  function leaveDetail() {
    requestGuard.invalidate("detail");
    if (view === "create" && wizardStep > 1) {
      setWizardStep((current) => current - 1);
      return;
    }
    if (view === "create" && editingListId && selected) {
      setView("detail");
      return;
    }
    if (view === "create") navigation.setParams({ create: false });
    setSelected(null);
    setView("overview");
    navigation.setParams({ shoppingListId: undefined, create: false });
    if (overviewDirty.current || overviewStarted.current !== `${screenScope}:${appliedKey}`) void loadOverview();
  }

  async function parseListText(text = rawText) {
    if (!text.trim()) {
      setError("Escribe o sube al menos un producto.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const parsed = await apiAuthPost<{ items: AllwainShoppingListItem[]; warnings?: string[] }>(
        "/allwain/shopping-lists/parse",
        { rawText: text },
      );
      setDraftItems((parsed.items || []).map(asDraftItem));
      setWarnings(parsed.warnings || []);
      setWizardStep(2);
    } catch (parseError: any) {
      setError(parseError?.message || "No pudimos leer esa lista.");
    } finally {
      setBusy(false);
    }
  }

  async function chooseFile() {
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/plain", "text/csv", "application/csv", "text/comma-separated-values"],
        copyToCacheDirectory: true,
        multiple: false,
        base64: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (asset.size && asset.size > 100_000) {
        setError("La lista supera 100 KB. Divide el archivo en listas más pequeñas.");
        return;
      }
      const fileText = asset.file
        ? await asset.file.text()
        : await (async () => {
            const { File } = await import("expo-file-system");
            return new File(asset.uri).text();
          })();
      setRawText(fileText);
      await parseListText(fileText);
    } catch (fileError: any) {
      setError(fileError?.message || "No pudimos abrir el archivo.");
    }
  }

  function updateDraftItem(key: string, patch: Partial<DraftItem>) {
    setDraftItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }

  function reviewDetails() {
    const invalid = draftItems.find(
      (item) => item.productName.trim().length < 2 || !parseNumber(item.quantity) || !item.unit,
    );
    if (!draftItems.length || invalid) {
      setError("Revisa que cada producto tenga nombre, cantidad y unidad.");
      if (invalid) {
        wizardScroll.current?.scrollTo({ y: productOffsets.current[invalid.key] || 0, animated: true });
        productInputs.current[invalid.key]?.focus();
      }
      return;
    }
    setTitle((current) => current || `Compra de ${draftItems.slice(0, 2).map((item) => item.productName.trim()).join(" y ")}`);
    setError(null);
    setWizardStep(3);
  }

  function editDraft(list: AllwainShoppingList) {
    if (hasDraft) {
      if (editingListId === list.id) { setView("create"); return; }
      Alert.alert("Tienes una lista sin enviar", "Puedes continuar el borrador actual o descartarlo para editar esta lista.", [
        { text: "Volver", style: "cancel" },
        { text: "Continuar borrador", onPress: () => setView("create") },
        { text: "Descartar y editar", style: "destructive", onPress: () => { void (async () => { if (user?.id) await clearJourneyDraft(user.id, "shopping-list"); applyListDraft(list); })(); } },
      ]);
      return;
    }
    applyListDraft(list);
  }

  function applyListDraft(list: AllwainShoppingList) {
    const deadlineDays = list.proposalDeadlineAt
      ? Math.max(
          3,
          Math.round(
            (new Date(list.proposalDeadlineAt).getTime() - Date.now()) /
              (24 * 60 * 60 * 1_000),
          ),
        )
      : 14;
    const closestWindow = [3, 7, 14, 30].reduce((closest, value) =>
      Math.abs(value - deadlineDays) < Math.abs(closest - deadlineDays)
        ? value
        : closest,
    );
    setEditingListId(list.id);
    setDraftItems(list.items.map(asDraftItem));
    setWarnings([]);
    setTitle(list.title);
    setDescription(list.description || "");
    setRecurrence(
      list.recurrence?.enabled
        ? (list.recurrence.interval as Recurrence)
        : "once",
    );
    setProposalWindowDays(closestWindow);
    setNeedByText(list.needByText || list.deliveryWindow?.rawText || "");
    setDeliveryAddress(list.deliveryAddress?.formatted || "");
    setLocationLabel(list.locationLabel || "");
    setLocationCoords({});
    setDeliveryChannel(list.preferredDeliveryChannel || "local_connector");
    setAllowSubstitutions(list.allowSubstitutions);
    setWizardStep(2);
    setView("create");
    setError(null);
  }

  async function fillCurrentLocation() {
    setLocating(true);
    setError(null);
    try {
      const location = await getAllwainCurrentLocation();
      setDeliveryAddress((current) => location.address || current);
      setLocationLabel((current) =>
        location.city || location.locationLabel || current,
      );
      setLocationCoords({ latitude: location.latitude, longitude: location.longitude });
    } catch (locationError: any) {
      setError(locationError?.message || "No pudimos obtener tu ubicación. Puedes escribirla.");
    } finally {
      setLocating(false);
    }
  }

  function payload() {
    return {
      title: title.trim(),
      description: description.trim() || null,
      currency: "EUR",
      allowSubstitutions,
      needByText: needByText.trim() || null,
      proposalWindowDays,
      preferredDeliveryChannel: deliveryChannel,
      deliveryAddress: deliveryAddress.trim() || null,
      deliveryWindow: interpretDeliveryWindow(needByText),
      recurrence:
        recurrence === "once"
          ? null
          : {
              enabled: true,
              interval: recurrence,
              label:
                recurrence === "weekly"
                  ? "Cada semana"
                  : recurrence === "biweekly"
                    ? "Cada 15 días"
                    : "Cada mes",
            },
      locationLabel: locationLabel.trim() || null,
      locationLatApprox: locationCoords.latitude,
      locationLngApprox: locationCoords.longitude,
      items: draftItems.map((item) => ({
        productName: item.productName.trim(),
        quantity: parseNumber(item.quantity),
        unit: item.unit,
        targetUnitPrice: parseNumber(item.targetUnitPrice),
        notes: item.notes.trim() || null,
        category: item.category,
        subcategory: item.subcategory,
        productKind: item.productKind,
      })),
    };
  }

  async function saveList(publish: boolean) {
    if (busy) return;
    const accountId = user?.id;
    if (!accountId) return;
    if (!title.trim()) {
      setError("Pon un nombre a la lista para reconocerla después.");
      wizardScroll.current?.scrollTo({ y: 0, animated: true });
      titleInput.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    let created: AllwainShoppingList | null = null;
    try {
      created = editingListId
        ? await apiAuthPatch<AllwainShoppingList>(
            `/allwain/shopping-lists/${editingListId}`,
            payload(),
          )
        : await apiAuthPost<AllwainShoppingList>(
            "/allwain/shopping-lists",
            payload(),
          );
      if (useAuthStore.getState().user?.id !== accountId) return;
      setEditingListId(created.id);
      // Once the server creates a draft, retries must update that same list.
      await writeJourneyDraft(accountId, "shopping-list", { ...localDraft, editingListId: created.id });
      if (useAuthStore.getState().user?.id !== accountId) return;
      const result = publish
        ? await apiAuthPost<AllwainShoppingList>(
            `/allwain/shopping-lists/${created.id}/publish`,
            {},
          )
        : created;
      if (useAuthStore.getState().user?.id !== accountId) return;
      setMutatedList(result);
      setView("detail");
      if (user?.id) await clearJourneyDraft(user.id, "shopping-list");
      resetWizard();
      navigation.setParams({ shoppingListId: result.id, mode: "buy", create: false });
      Alert.alert(
        publish ? "Lista publicada" : "Borrador guardado",
        publish
          ? "Las empresas ya pueden responder por uno, varios o todos los productos."
          : "Podrás revisarla y publicarla cuando quieras.",
      );
    } catch (saveError: any) {
      if (created) {
        setMutatedList(created);
        setView("detail");
        setError("La lista quedó guardada como borrador. Revisa las indicaciones antes de publicarla.");
      } else {
        setError(saveError?.message || "No pudimos guardar la lista.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function publishDraft() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const published = await apiAuthPost<AllwainShoppingList>(
        `/allwain/shopping-lists/${selected.id}/publish`,
        {},
      );
      setMutatedList(published);
    } catch (publishError: any) {
      setError(publishError?.message || "No pudimos publicar la lista.");
    } finally {
      setBusy(false);
    }
  }

  async function saveOcrSelection(
    selectedItemIds: string[],
    publishAfterReview: boolean,
  ) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const reviewed = await apiAuthPatch<AllwainShoppingList>(
        `/allwain/shopping-lists/${selected.id}/ocr-review`,
        { selectedItemIds },
      );
      if (!publishAfterReview) {
        setMutatedList(reviewed);
        return;
      }
      const published = await apiAuthPost<AllwainShoppingList>(
        `/allwain/shopping-lists/${reviewed.id}/publish`,
        {},
      );
      setMutatedList(published);
      Alert.alert(
        "Peticiones publicadas",
        `${selectedItemIds.length} producto${selectedItemIds.length === 1 ? "" : "s"} ya puede${selectedItemIds.length === 1 ? "" : "n"} recibir propuestas.`,
      );
    } catch (reviewError: any) {
      setError(
        reviewError?.message || "No pudimos guardar la selección del documento.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function restartOcrCapture() {
    if (!selected?.sourceEvidenceDocumentId) {
      setError("No encontramos la evidencia original para repetir la captura.");
      return;
    }
    Alert.alert(
      "Repetir captura",
      "Este resultado quedará anulado y conservaremos su historial. Después podrás fotografiar el documento de nuevo.",
      [
        { text: "Volver", style: "cancel" },
        {
          text: "Anular y repetir",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            setError(null);
            try {
              await apiAuthPost(
                `/allwain/scan-captures/${selected.sourceEvidenceDocumentId}/annul`,
                { reason: "ocr_incorrect_restart" },
              );
              navigation.replace("Scan");
            } catch (restartError: any) {
              setError(
                restartError?.message || "No pudimos anular esta captura.",
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  async function cancelList() {
    if (!selected || !user?.id || sellerMode || !isCurrentScope()) return;
    const item = selected;
    const accountId = user.id;
    const analyticsCurrent = captureAnalyticsGuard(isCurrentScope);
    Alert.alert(
      "Cancelar lista",
      "Las propuestas quedarán cerradas. Esta acción no afecta a pedidos ya adjudicados.",
      [
        { text: "Volver", style: "cancel" },
        {
          text: "Cancelar lista",
          style: "destructive",
          onPress: async () => {
            if (!isCurrentScope()) return;
            setBusy(true);
            try {
              const canceled = await apiAuthPost<AllwainShoppingList>(
                `/allwain/shopping-lists/${item.id}/cancel`,
                {},
              );
              if (!isCurrentScope()) return;
              if (canceled.id !== item.id || canceled.buyerUserId !== accountId || canceled.status !== "canceled") throw new Error("El servidor no confirmó la cancelación de esta lista.");
              void recordPublicationWithdrawal("shopping_list","buy",analyticsCurrent);
              setMutatedList(canceled);
            } catch (cancelError: any) {
              if (isCurrentScope()) setError(cancelError?.message || "No pudimos cancelar la lista.");
            } finally {
              if (isCurrentScope()) setBusy(false);
            }
          },
        },
      ],
    );
  }

  async function duplicateList(selectedItemIds?: string[]) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const copy = await apiAuthPost<AllwainShoppingList>(
        `/allwain/shopping-lists/${selected.id}/duplicate`,
        { proposalWindowDays: 14 },
      );
      setMutatedList(copy);
      editDraft(selectedItemIds ? { ...copy, items: selected.items.filter(item => selectedItemIds.includes(item.id)) } : copy);
      Alert.alert(
        "Lista preparada",
        "Hemos copiado los productos en un borrador nuevo. Revisa fecha y entrega antes de publicarlo.",
      );
    } catch (duplicateError: any) {
      setError(duplicateError?.message || "No pudimos preparar una nueva compra.");
    } finally {
      setBusy(false);
    }
  }

  async function chooseProposal(proposal: AllwainShoppingListProposal) {
    if (!selected || !shoppingProposalLifecycle(selected, proposal).canAccept || !isCurrentScope()) return;
    const session = captureAuthSession(), accountId = user?.id;
    await setAppMode("buy");
    if (!mounted.current || !session.isCurrent() || useAuthStore.getState().user?.id !== accountId || useAuthStore.getState().appMode !== "buy") return;
    navigation.navigate("MainTabs", {
      screen: "Ofertas",
      params: { offerId: proposal.id },
    });
  }

  async function openProposalOrders(proposal: AllwainShoppingListProposal, scope: "buyer" | "seller") {
    const accountId = user?.id;
    if (!accountId || busy || orderLookupBusy.current || !isCurrentScope()) return;
    orderLookupBusy.current = true;
    const ticket = requestGuard.start("orders");
    const current = () => isCurrentScope() && requestGuard.isCurrent(ticket);
    setBusy(true); setError(null);
    try {
      const response = await apiAuthGet<{ items: AllwainContract[]; pageInfo?: PageInfo }>(
        `/allwain/contracts?scope=${scope}&offerId=${encodeURIComponent(proposal.id)}&limit=2`,
      );
      if (!current()) return;
      const copy = shoppingProposalCopy(locale);
      const target = shoppingProposalOrderTarget(response.items || [], response.pageInfo?.hasNextPage === true, proposal.id, accountId, scope);
      if (!target) { setError(copy.ordersError); return; }
      await setAppMode(scope === "seller" ? "sell" : "buy");
      if (!current()) return;
      const navigate = () => { if (current()) navigation.navigate("MainTabs", { screen: "Ofertas", params: target }); };
      if (target.contractId) navigate();
      else Alert.alert(copy.orders, copy.multipleOrders, [
        { text: copy.cancel, style: "cancel" },
        { text: copy.orders, onPress: navigate },
      ]);
    } catch (orderError: any) {
      if (current()) setError(orderError?.message || shoppingProposalCopy(locale).ordersError);
    } finally {
      if (current()) { orderLookupBusy.current = false; setBusy(false); }
    }
  }

  function messageUser(targetUserId: string, targetName: string) {
    navigation.navigate("ChatThread", {
      targetUserId,
      targetName,
      title: selected?.title || "Lista de compra",
    });
  }

  if (view === "create") {
    return (
      <KeyboardAvoidingView style={styles.screen} {...keyboardAvoidingProps}>
      <View style={styles.wizardHeading}>
        <ScreenBack title="Nueva lista de compra" onPress={back} />
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${(wizardStep / 3) * 100}%` }]} />
        </View>
        <Text style={styles.stepLabel}>PASO {wizardStep} DE 3</Text>
      </View>
      <ScrollView ref={wizardScroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {draftNotice ? <Text accessibilityLiveRegion="polite" style={styles.fieldHint}>{draftNotice}</Text> : null}
        {wizardStep === 1 ? (
          <View style={styles.section}>
            <Text style={styles.title}>¿Qué sueles comprar?</Text>
            <Text style={styles.subtitle}>
              Una línea por producto. Allwain reconocerá cantidades y unidades para que no tengas que rellenar una ficha larga.
            </Text>
            <TextInput
              style={styles.largeInput}
              value={rawText}
              onChangeText={setRawText}
              multiline
              textAlignVertical="top"
              placeholder={"10 kg de naranjas\n6 l de leche\n2 paquetes de café"}
              placeholderTextColor={colors.mutedText}
              accessibilityLabel="Productos de la lista"
            />
            <BigActionButton
              label="Leer ticket o presupuesto (foto)"
              tone="light"
              icon={<FileUp size={20} color={colors.primary} />}
              onPress={() => void openCamera()}
            />
            <Text style={styles.fieldHint}>Fotografía el documento o sube una imagen. Después podrás seleccionar sus productos y preparar una lista editable.</Text>
            <BigActionButton
              label="Subir TXT o CSV"
              tone="light"
              icon={<FileUp size={20} color={colors.primary} />}
              onPress={() => void chooseFile()}
            />
            <TouchableOpacity
              style={styles.textAction}
              onPress={() => {
                setDraftItems([blankItem()]);
                setWizardStep(2);
              }}
            >
              <Plus size={18} color={colors.primary} />
              <Text style={styles.textActionLabel}>Añadir a mano</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {wizardStep === 2 ? (
          <View style={styles.section}>
            <Text style={styles.title}>Revisa los productos</Text>
            <Text style={styles.subtitle}>
              Ya hemos estructurado la lista. Corrige solo lo que necesites.
            </Text>
            {warnings.length ? (
              <View style={styles.notice}>
                <Sparkles size={18} color={colors.primary} />
                <View style={styles.noticeCopy}>
                  {warnings.map((warning) => (
                    <Text key={warning} style={styles.noticeText}>{warning}</Text>
                  ))}
                </View>
              </View>
            ) : null}
            {draftItems.map((item, index) => (
              <View key={item.key} style={styles.editItem} onLayout={(event) => { productOffsets.current[item.key] = event.nativeEvent.layout.y; }}>
                <View style={styles.editItemHeader}>
                  <Text style={styles.itemNumber}>{index + 1}</Text>
                  <TextInput
                    ref={(input) => { productInputs.current[item.key] = input; }}
                    style={[styles.input, styles.itemNameInput]}
                    value={item.productName}
                    onChangeText={(productName) => updateDraftItem(item.key, { productName })}
                    placeholder="Producto"
                    placeholderTextColor={colors.mutedText}
                  />
                  <TouchableOpacity
                    accessibilityLabel={`Quitar ${item.productName || "producto"}`}
                    style={styles.iconButton}
                    onPress={() => setDraftItems((current) => current.filter((candidate) => candidate.key !== item.key))}
                  >
                    <Trash2 size={19} color={colors.danger} />
                  </TouchableOpacity>
                </View>
                <View style={styles.twoColumns}>
                  <View style={styles.fieldColumn}>
                    <Text style={styles.label}>Cantidad</Text>
                    <TextInput
                      style={styles.input}
                      value={item.quantity}
                      onChangeText={(quantity) => updateDraftItem(item.key, { quantity })}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={styles.fieldColumn}>
                    <Text style={styles.label}>Unidad</Text>
                    <View style={styles.pickerFrame}>
                      <Picker
                        selectedValue={item.unit}
                        onValueChange={(unit) => updateDraftItem(item.key, { unit })}
                        style={styles.picker}
                      >
                        {UNITS.map(([value, label]) => (
                          <Picker.Item key={value} value={value} label={label} />
                        ))}
                      </Picker>
                    </View>
                  </View>
                </View>
                <Text style={styles.label}>Precio máximo por unidad (opcional)</Text>
                <TextInput
                  style={styles.input}
                  value={item.targetUnitPrice}
                  onChangeText={(targetUnitPrice) => updateDraftItem(item.key, { targetUnitPrice })}
                  keyboardType="decimal-pad"
                  placeholder="Ej. 1,50"
                  placeholderTextColor={colors.mutedText}
                />
              </View>
            ))}
            <TouchableOpacity
              style={styles.addRow}
              onPress={() => setDraftItems((current) => [...current, blankItem()])}
            >
              <Plus size={19} color={colors.primary} />
              <Text style={styles.addRowText}>Otro producto</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {wizardStep === 3 ? (
          <View style={styles.section}>
            <Text style={styles.title}>¿Cómo quieres comprar?</Text>
            <Text style={styles.subtitle}>
              Las empresas verán los productos y tu zona aproximada. La dirección exacta seguirá siendo privada.
            </Text>
            <Field label="Nombre de la lista">
              <TextInput ref={titleInput} style={styles.input} value={title} onChangeText={setTitle} placeholder="Compra semanal de oficina" placeholderTextColor={colors.mutedText} />
            </Field>
            <Field label="¿Se repite?">
              <View style={styles.choiceGrid}>
                <Choice label="Una vez" selected={recurrence === "once"} onPress={() => setRecurrence("once")} />
                <Choice label="Cada semana" selected={recurrence === "weekly"} onPress={() => setRecurrence("weekly")} />
                <Choice label="Cada 15 días" selected={recurrence === "biweekly"} onPress={() => setRecurrence("biweekly")} />
                <Choice label="Cada mes" selected={recurrence === "monthly"} onPress={() => setRecurrence("monthly")} />
              </View>
            </Field>
            <Field label="¿Cuánto tiempo damos para mejorar el precio?">
              <Text style={styles.fieldHint}>Cuanto más tiempo, más empresas podrán competir por la lista.</Text>
              <View style={styles.choiceGrid}>
                {[3, 7, 14, 30].map((days) => (
                  <Choice key={days} label={`${days} días`} selected={proposalWindowDays === days} onPress={() => setProposalWindowDays(days)} />
                ))}
              </View>
            </Field>
            <Field label="¿Cuándo lo necesitas?">
              <TextInput style={styles.input} value={needByText} onChangeText={setNeedByText} placeholder="Ej. el próximo viernes por la mañana" placeholderTextColor={colors.mutedText} />
              {needByText.trim() ? (
                <View style={styles.understanding}>
                  <Check size={16} color={colors.success} />
                  <Text style={styles.understandingText}>{interpretDeliveryWindow(needByText)?.label || needByText}</Text>
                </View>
              ) : null}
            </Field>
            <Field label="¿Cómo prefieres recibirlo?">
              <View style={styles.choiceGrid}>
                <Choice label="Reparto local" selected={deliveryChannel === "local_connector"} onPress={() => setDeliveryChannel("local_connector")} />
                <Choice label="Mensajería" selected={deliveryChannel === "carrier"} onPress={() => setDeliveryChannel("carrier")} />
                <Choice label="Lo entrega la empresa" selected={deliveryChannel === "seller"} onPress={() => setDeliveryChannel("seller")} />
                <Choice label="Recogeré yo" selected={deliveryChannel === "pickup"} onPress={() => setDeliveryChannel("pickup")} />
              </View>
            </Field>
            <Field label="Zona de entrega">
              <TextInput style={styles.input} value={locationLabel} onChangeText={setLocationLabel} placeholder="Foios, Valencia" placeholderTextColor={colors.mutedText} />
              {deliveryChannel !== "pickup" ? (
                <TextInput style={styles.input} value={deliveryAddress} onChangeText={setDeliveryAddress} placeholder="Dirección exacta (privada)" placeholderTextColor={colors.mutedText} />
              ) : null}
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Usar mi ubicación precisa"
                accessibilityState={{ disabled: locating, busy: locating }}
                style={styles.locationButton}
                onPress={() => void fillCurrentLocation()}
                disabled={locating}
              >
                {locating ? <ActivityIndicator color={colors.primary} /> : <MapPin size={18} color={colors.primary} />}
                <Text style={styles.locationButtonText}>{locating ? "Buscando ubicación" : "Usar mi ubicación"}</Text>
              </TouchableOpacity>
            </Field>
            <View style={styles.switchRow}>
              <View style={styles.switchCopy}>
                <Text style={styles.label}>Aceptar alternativas equivalentes</Text>
                <Text style={styles.fieldHint}>La empresa deberá indicar claramente qué producto cambia.</Text>
              </View>
              <Switch value={allowSubstitutions} onValueChange={setAllowSubstitutions} trackColor={{ false: colors.cardBorder, true: colors.primary }} />
            </View>
            <Field label="Algo más que deban saber (opcional)">
              <TextInput style={styles.mediumInput} multiline textAlignVertical="top" value={description} onChangeText={setDescription} placeholder="Calidad, marcas preferidas o condiciones" placeholderTextColor={colors.mutedText} />
            </Field>
            <View style={styles.finalSummary}>
              <ListChecks size={22} color={colors.primary} />
              <Text style={styles.finalSummaryText}>
                {draftItems.length} producto{draftItems.length === 1 ? "" : "s"} · {recurrence === "once" ? "una compra" : "compra recurrente"} · propuestas durante {proposalWindowDays} días
              </Text>
            </View>
          </View>
        ) : null}
      </ScrollView>
      <View style={[styles.wizardFooter, { paddingBottom: footerPaddingBottom }]}>
        {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
        <BigActionButton label={wizardStep === 1 ? "Entender mi lista" : wizardStep === 2 ? "Continuar" : "Publicar y recibir propuestas"} busy={busy} disabled={!draftReady} onPress={() => wizardStep === 1 ? void parseListText() : wizardStep === 2 ? reviewDetails() : void saveList(true)} />
        {wizardStep === 3 ? <TouchableOpacity style={styles.textAction} disabled={busy} onPress={() => void saveList(false)}><Text style={styles.textActionLabel}>Guardar borrador en mi cuenta</Text></TouchableOpacity> : null}
        <View style={styles.draftActions}>
          <TouchableOpacity style={styles.textAction} disabled={busy} onPress={() => void saveAndExit()}><Text style={styles.textActionLabel}>Guardar y salir</Text></TouchableOpacity>
          <TouchableOpacity style={styles.textAction} disabled={busy} onPress={() => void discardDraft()}><Text style={styles.textActionLabel}>Descartar</Text></TouchableOpacity>
        </View>
      </View>
      </KeyboardAvoidingView>
    );
  }

  if (view === "detail") {
    const list = selected;
    const owner = Boolean(list && list.buyerUserId === user?.id);
    const ocrReview = Boolean(
      list && owner && list.sourceKind === "ocr_document" && list.status === "draft",
    );
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenBack title={t("shopping.detailTitle")} onPress={back} />
        {loading && !list ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {list ? (
          <>
            <View style={styles.detailHeader}>
              <View style={styles.detailTitleRow}>
                <Text testID="shopping-selected-title" style={styles.detailTitle}>{list.title}</Text>
                <StatusChip {...listStatus(list, t)} />
              </View>
              <Text style={styles.detailMeta}>
                {list.items.length === 1
                  ? t("shopping.productOne")
                  : t("shopping.productMany", { count: list.items.length })} · {(list.remainingItemCount ?? list.items.length) === 1
                    ? t("shopping.pendingOne")
                    : t("shopping.pendingMany", { count: list.remainingItemCount ?? list.items.length })} · {recurrenceLabel(list, t)}
              </Text>
              {list.demo ? (
                <View style={styles.demoNotice}>
                  <Sparkles size={17} color={colors.primary} />
                  <Text style={styles.demoNoticeText}>{t("shopping.demoNotice")}</Text>
                </View>
              ) : null}
              {!owner ? <Text style={styles.detailMeta}>{t("shopping.requestedBy", { name: list.buyer.name })} · {list.locationLabel || t("shopping.areaPending")}</Text> : null}
              {list.description ? <Text style={styles.detailDescription}>{list.description}</Text> : null}
            </View>

            {!ocrReview ? <SectionTitle title={t("shopping.includes")} count={list.items.length} /> : null}
            {!ocrReview ? <View style={styles.lines}>
              {list.items.map((item) => (
                <View key={item.id} style={styles.line}>
                  {item.imageMeta?.url ? (
                    <View style={styles.lineImage}>
                      <PublicationImage
                        imageUrl={item.imageMeta.url}
                        imageAlt={item.imageMeta.alt || item.productName}
                        illustrative={item.imageMeta.illustrative === true}
                      />
                    </View>
                  ) : null}
                  <View style={styles.lineCopy}>
                    <Text style={styles.lineName}>{item.productName}</Text>
                    {item.notes ? <Text style={styles.lineNote}>{item.notes}</Text> : null}
                    {typeof item.targetUnitPriceAmount === "number" ? (
                      <Text style={styles.targetPrice}>
                        {t("shopping.targetMaximum", { amount: `${formatCurrency(item.targetUnitPriceAmount / 100, list.currency, locale)}/${item.unit}` })}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.lineAside}>
                    <Text style={styles.lineQuantity}>{item.quantity} {item.unit}</Text>
                    {item.availabilityStatus === "awarded" ? <StatusChip label={t("shopping.covered")} tone="success" /> : null}
                  </View>
                </View>
              ))}
            </View> : null}
            <View style={styles.factsBand}>
              <Fact icon={<CalendarClock size={17} color={colors.primary} />} label={t("shopping.proposalsUntil")} value={dateLabel(list.proposalDeadlineAt, locale, t)} />
              <Fact icon={<MapPin size={17} color={colors.primary} />} label={t("shopping.area")} value={list.locationLabel || t("shopping.pending")} />
              <Fact icon={<RefreshCw size={17} color={colors.primary} />} label={t("shopping.frequency")} value={recurrenceLabel(list, t)} />
            </View>

            {owner ? (
              <BuyerListActions
                list={list}
                busy={busy}
                onPublish={() => void publishDraft()}
                onEdit={() => editDraft(list)}
                onCancel={() => void cancelList()}
                onDuplicate={(itemIds) => void duplicateList(itemIds)}
                onChoose={(proposal) => void chooseProposal(proposal)}
                onOrders={(proposal) => void openProposalOrders(proposal, "buyer")}
                onMessage={messageUser}
                onSaveOcrSelection={(ids) => void saveOcrSelection(ids, false)}
                onPublishOcrSelection={(ids) => void saveOcrSelection(ids, true)}
                onRestartOcr={() => void restartOcrCapture()}
              />
            ) : (
              <SellerProposalEditor
                key={`${screenScope}:${actorSession.generation}:${list.id}`}
                list={list}
                actorAccountId={user?.id || ""}
                registerDraftExit={registerSellerDraftExit}
                onExit={leaveDetail}
                sellerEnabled={sellerEnabled}
                busy={busy}
                setBusy={setBusy}
                onActivate={() => navigation.navigate("ActivateSeller", { shoppingListId: list.id })}
                isCurrentScope={isCurrentScope}
                onSaved={(updated) => { requestGuard.invalidate("detail"); setMutatedList(updated); }}
                onError={setError}
                onMessage={() => messageUser(list.buyer.id, list.buyer.name)}
                onOrders={() => { if (list.myProposal) void openProposalOrders(list.myProposal, "seller"); }}
              />
            )}
          </>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <VirtualizedResults
      testID="shopping-overview-results"
      restoreKey={`${screenScope}:shopping-overview:${appliedKey}`}
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={lists}
      keyExtractor={list => list.id}
      ListHeaderComponent={<View style={styles.overviewHeader}>
      <Text style={styles.eyebrow}>{sellerMode ? t("shopping.sellerEyebrow") : t("shopping.buyerEyebrow")}</Text>
      <Text style={styles.title}>{sellerMode ? t("shopping.sellerTitle") : t("shopping.buyerTitle")}</Text>
      <Text style={styles.subtitle}>
        {sellerMode
          ? t("shopping.sellerSubtitle")
          : t("shopping.buyerSubtitle")}
      </Text>
      {!sellerMode ? (
        <BigActionButton label={hasDraft ? "Continuar lista sin enviar" : t("shopping.newList")} icon={<Plus size={20} color="#FFFFFF" />} onPress={beginCreate} disabled={!draftReady} />
      ) : !sellerEnabled ? (
        <BigActionButton label={t("home.seller.activate")} tone="dark" onPress={() => navigation.navigate("ActivateSeller")} />
      ) : null}
      <DiscoveryFilters value={query} onApply={next => { const current = captureAnalyticsGuard(isCurrentScope); void recordAppliedFilters({state:analyticsState,scope:`${screenScope}:${actorSession.generation}`,queryKey:discoveryQueryKey(next),query:next,surface:"shopping_lists",appMode:sellerMode ? "sell" : "buy",current,allowed:sellerMode ? MARKET_LIST_FILTERS : OWN_LIST_FILTERS},appliedKey); setQuery(next); }} kind="requests" disabled={!queryReady}
        allowed={sellerMode ? MARKET_LIST_FILTERS : OWN_LIST_FILTERS}
        statuses={sellerMode ? undefined : ["draft", "published", "partially_awarded", "awarded", "closed", "canceled", "archived"].map(status => ({ value: status, label: listStatus({ status } as AllwainShoppingList, t).label }))}
        extra={(draft, setDraft) => <DemandFilterFields value={draft} onChange={setDraft} lists own={!sellerMode} />}
        extraSummary={value => demandFilterSummary(locale, value)}
      />
      {overviewLoading || !queryReady ? <ActivityIndicator color={colors.primary} /> : null}
      {overviewError ? <View style={styles.discoveryFailure}><Text style={styles.error}>{overviewError}</Text><BigActionButton label={filterCopy.retry} tone="light" busy={overviewLoading || moreBusy} onPress={() => void loadOverview(appliedQueryRef.current, failedOverview.current)} /></View> : null}
      {queryReady && !overviewLoading && !overviewError && !lists.length ? (
        <EmptyState
          icon={<ShoppingCart size={24} color={colors.primary} />}
          title={sellerMode ? t("shopping.emptySellerTitle") : t("shopping.emptyBuyerTitle")}
          body={sellerMode ? t("shopping.emptySellerBody") : t("shopping.emptyBuyerBody")}
          actionLabel={sellerMode ? undefined : t("shopping.createFirst")}
          onAction={sellerMode ? undefined : beginCreate}
        />
      ) : null}
      </View>}
      renderItem={({ item: list }) => {
        const status = listStatus(list, t);
        const firstImage = list.items[0]?.imageMeta;
        return (
          <TouchableOpacity testID="shopping-list-card" style={styles.listCard} onPress={() => openList(list)} activeOpacity={0.86}>
            <View style={styles.listCardTop}>
              {firstImage?.url ? (
                <View style={styles.listImage}>
                  <PublicationImage
                    imageUrl={firstImage.url}
                    imageAlt={firstImage.alt || list.items[0]?.productName || list.title}
                    illustrative={firstImage.illustrative === true}
                  />
                </View>
              ) : (
                <View style={styles.listIcon}><ListChecks size={21} color={colors.primary} /></View>
              )}
              <View style={styles.listCardCopy}>
                <View style={styles.listTitleRow}>
                  <Text style={styles.listCardTitle} numberOfLines={2}>{list.title}</Text>
                </View>
                <View style={styles.listBadgeRow}>
                  {list.demo ? <StatusChip label={t("card.demo")} tone="brand" /> : null}
                  <StatusChip label={status.label} tone={status.tone} />
                </View>
                <Text style={styles.listCardMeta} numberOfLines={2}>{itemSummary(list, t)}</Text>
                {(list.awardedItemCount || 0) > 0 ? (
                  <Text style={styles.coverageMeta}>{t("shopping.coverage", { covered: list.awardedItemCount || 0, total: list.items.length })}</Text>
                ) : null}
              </View>
            </View>
            <View style={styles.listCardFooter}>
              <Text style={styles.proposalCount}>{list.proposalCount === 1 ? t("shopping.proposalOne") : t("shopping.proposalMany", { count: list.proposalCount })}</Text>
              <Text style={styles.openLabel}>{sellerMode ? (shoppingProposalLifecycle(list, list.myProposal).selected ? t("shopping.proposalSelected") : shoppingProposalLifecycle(list, list.myProposal).retired ? shoppingProposalCopy(locale).viewHistory : list.myProposal ? t("shopping.editProposal") : t("shopping.prepareProposal")) : t("shopping.open")}</Text>
              <ChevronRight size={18} color={colors.primary} />
            </View>
          </TouchableOpacity>
        );
      }}
      ListFooterComponent={<View>

      {discoveryPageCursor(page, appliedKey) ? (
        <BigActionButton label={t("market.showMore")} tone="light" busy={moreBusy} disabled={overviewLoading} onPress={() => void loadOverview(appliedQueryRef.current, discoveryPageCursor(page, appliedKey))} />
      ) : null}
      </View>}
    />
  );
}

function OcrListReview({
  list,
  busy,
  onSave,
  onPublish,
  onRestart,
  onEditCopy,
}: {
  list: AllwainShoppingList;
  busy: boolean;
  onSave: (itemIds: string[]) => void;
  onPublish: (itemIds: string[]) => void;
  onRestart: () => void;
  onEditCopy: (itemIds: string[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setSelectedIds(
      Object.fromEntries(
        list.items.map((item) => [item.id, item.reviewStatus !== "discarded"]),
      ),
    );
  }, [list.id, list.items]);

  const selected = list.items.filter((item) => selectedIds[item.id]);
  const referenceTotal = selected.reduce((sum, item) => {
    if (typeof item.targetUnitPriceAmount !== "number") return sum;
    return sum + (item.targetUnitPriceAmount * item.quantity) / 100;
  }, 0);

  function toggle(itemId: string) {
    setSelectedIds((current) => ({ ...current, [itemId]: !current[itemId] }));
  }

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Elige qué quieres mejorar</Text>
      <Text style={styles.subtitle}>
        Allwain ha leído el documento. Desmarca lo que no quieras publicar y confirma la selección.
      </Text>
      <View style={styles.evidenceNotice}>
        <LockKeyhole size={19} color={colors.success} />
        <View style={styles.noticeCopy}>
          <Text style={styles.evidenceTitle}>Precios capturados y protegidos</Text>
          <Text style={styles.fieldHint}>
            El precio queda vinculado al documento. Si alguno es incorrecto, anula esta lectura y repite la captura.
          </Text>
        </View>
      </View>
      <View style={styles.lines}>
        {list.items.map((item) => {
          const checked = selectedIds[item.id] === true;
          const unitPrice =
            typeof item.targetUnitPriceAmount === "number"
              ? item.targetUnitPriceAmount / 100
              : null;
          return (
            <TouchableOpacity
              key={item.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={`${checked ? "Excluir" : "Incluir"} ${item.productName}`}
              style={[styles.ocrReviewItem, !checked && styles.ocrReviewItemOff]}
              activeOpacity={0.82}
              onPress={() => toggle(item.id)}
            >
              <View style={[styles.checkBox, checked && styles.checkBoxSelected]}>
                {checked ? <Check size={14} color="#FFFFFF" /> : null}
              </View>
              {item.imageMeta?.url ? (
                <View style={styles.lineImage}>
                  <PublicationImage
                    imageUrl={item.imageMeta.url}
                    imageAlt={item.imageMeta.alt || item.productName}
                    illustrative={item.imageMeta.illustrative === true}
                  />
                </View>
              ) : null}
              <View style={styles.lineCopy}>
                <Text style={styles.lineName} numberOfLines={2}>{item.productName}</Text>
                <Text style={styles.lineNote}>{item.quantity} {item.unit}</Text>
              </View>
              <View style={styles.ocrPrice}>
                <LockKeyhole size={13} color={colors.success} />
                <Text style={styles.ocrPriceText}>
                  {unitPrice === null
                    ? "No leído"
                    : `${formatCurrency(unitPrice, list.currency)}/${item.unit}`}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      <BigActionButton label="Añadir o editar productos en una lista" tone="light" onPress={() => onEditCopy(selected.map(item => item.id))} disabled={busy || !selected.length} />
      <Text style={styles.fieldHint}>Crea un borrador editable con los productos seleccionados. Puedes añadir, quitar y corregir líneas; el documento original conserva sus precios capturados.</Text>
      <View style={styles.totalBand}>
        <Text style={styles.totalBandLabel}>REFERENCIA SELECCIONADA</Text>
        <Text style={styles.totalBandValue}>{formatCurrency(referenceTotal, list.currency)}</Text>
      </View>
      <BigActionButton
        label={`Publicar ${selected.length} petición${selected.length === 1 ? "" : "es"}`}
        onPress={() => onPublish(selected.map((item) => item.id))}
        busy={busy}
        disabled={!selected.length}
      />
      <BigActionButton
        label="Guardar selección"
        tone="light"
        onPress={() => onSave(selected.map((item) => item.id))}
        disabled={busy || !selected.length}
      />
      <TouchableOpacity
        style={styles.restartCapture}
        onPress={onRestart}
        disabled={busy}
      >
        <RotateCcw size={18} color={colors.danger} />
        <Text style={styles.restartCaptureText}>No se ha leído bien: repetir captura</Text>
      </TouchableOpacity>
    </View>
  );
}

function BuyerListActions({
  list,
  busy,
  onPublish,
  onEdit,
  onCancel,
  onDuplicate,
  onChoose,
  onOrders,
  onMessage,
  onSaveOcrSelection,
  onPublishOcrSelection,
  onRestartOcr,
}: {
  list: AllwainShoppingList;
  busy: boolean;
  onPublish: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onDuplicate: (itemIds?: string[]) => void;
  onChoose: (proposal: AllwainShoppingListProposal) => void;
  onOrders: (proposal: AllwainShoppingListProposal) => void;
  onMessage: (userId: string, name: string) => void;
  onSaveOcrSelection: (itemIds: string[]) => void;
  onPublishOcrSelection: (itemIds: string[]) => void;
  onRestartOcr: () => void;
}) {
  const { locale } = useAppTranslation();
  const copy = shoppingProposalCopy(locale);
  if (list.status === "draft") {
    if (list.sourceKind === "ocr_document") {
      return (
        <OcrListReview
          list={list}
          busy={busy}
          onSave={onSaveOcrSelection}
          onPublish={onPublishOcrSelection}
          onRestart={onRestartOcr}
          onEditCopy={onDuplicate}
        />
      );
    }
    return (
      <View style={styles.section}>
        <Text style={styles.title}>Lista lista para publicar</Text>
        <Text style={styles.subtitle}>Al publicar, las empresas podrán responder por uno, varios o todos los productos.</Text>
        <BigActionButton label="Editar borrador" tone="light" onPress={onEdit} disabled={busy} />
        <BigActionButton label="Publicar lista" onPress={onPublish} busy={busy} />
      </View>
    );
  }
  return (
    <View style={styles.section}>
      <SectionTitle title="Propuestas recibidas" count={list.proposalCount} />
      {!list.proposals.length ? (
        <EmptyState
          icon={<PackageSearch size={24} color={colors.primary} />}
          title="Las empresas están a tiempo de responder"
          body="Aquí verás propuestas completas y parciales para comparar producto por producto."
        />
      ) : null}
      {list.proposals.map((proposal) => {
        const lifecycle = shoppingProposalLifecycle(list, proposal);
        return (
        <View key={proposal.id} style={[styles.proposalCard, list.selectedOfferId === proposal.id && styles.selectedProposal]}>
          <View style={styles.proposalTop}>
            <View style={styles.proposalCopy}>
              <Text style={styles.proposalProvider}>{proposal.provider.name}</Text>
              <Text style={styles.proposalScore}>
                {proposal.provider.reviewCount
                  ? `${proposal.provider.score.toFixed(1).replace(".", ",")} de 5 · ${proposal.provider.reviewCount} opiniones`
                  : "Empresa aún sin opiniones"}
              </Text>
              {lifecycle.withdrawn ? <StatusChip label={copy.withdrawn} tone="neutral" /> :
                lifecycle.retired ? <StatusChip label={copy.unavailable} tone="neutral" /> :
                  lifecycle.selected ? <StatusChip label="Elegida" tone="success" /> : null}
              <StatusChip
                label={proposal.coverageKind === "full" ? "Lista completa" : `${proposal.coveredItemCount || proposal.items.length} de ${proposal.totalItemCount || list.items.length} productos`}
                tone={proposal.coverageKind === "full" ? "success" : "warning"}
              />
            </View>
            <Text style={styles.proposalTotal}>{formatCurrency(proposal.price, proposal.currency)}</Text>
          </View>
          {proposal.items.map((item) => (
            <View key={item.id} style={styles.proposalLine}>
              {item.imageMeta?.url ? (
                <View style={styles.proposalLineImage}>
                  <PublicationImage
                    imageUrl={item.imageMeta.url}
                    imageAlt={item.imageMeta.alt || item.productName}
                    illustrative={item.imageMeta.illustrative === true}
                  />
                </View>
              ) : null}
              <View style={styles.proposalLineCopy}>
                <Text style={styles.proposalLineName} numberOfLines={1}>{item.productName}</Text>
                <Text style={styles.proposalLineUnit}>
                  {item.quantity} {item.unit} · {formatCurrency(item.unitPriceAmount / 100, item.currency)}/{item.unit}
                  {item.isSubstitution ? " · alternativa" : ""}
                </Text>
              </View>
              <Text style={styles.proposalLinePrice}>{formatCurrency(item.subtotalAmount / 100, item.currency)}</Text>
            </View>
          ))}
          <Text style={styles.proposalDetail}>{proposal.deliveryEstimate || "Entrega por concretar"}</Text>
          {!lifecycle.retired && !lifecycle.selected ? <ProposalCountdown expiresAt={proposal.validUntil} compact /> : null}
          {proposal.description ? <Text style={styles.proposalDescription}>{proposal.description}</Text> : null}
          <View style={styles.proposalActions}>
            <TouchableOpacity style={styles.messageButton} onPress={() => onMessage(proposal.provider.id, proposal.provider.name)}>
              <MessageCircle size={17} color={colors.primary} />
              <Text style={styles.messageButtonText}>Mensaje privado</Text>
            </TouchableOpacity>
            {lifecycle.selected ? (
              <TouchableOpacity style={styles.messageButton} onPress={() => onOrders(proposal)} disabled={busy}>
                <ShoppingCart size={17} color={colors.primary} />
                <Text style={styles.messageButtonText}>{copy.orders}</Text>
              </TouchableOpacity>
            ) : lifecycle.withdrawn ? (
              <StatusChip label={copy.withdrawn} tone="neutral" />
            ) : lifecycle.retired ? (
              <StatusChip label={copy.unavailable} tone="neutral" />
            ) : lifecycle.canAccept ? (
              <TouchableOpacity style={styles.chooseButton} onPress={() => onChoose(proposal)} disabled={busy}>
                <Text style={styles.chooseButtonText}>{proposal.coverageKind === "full" ? "Elegir y pagar" : "Elegir esta parte"}</Text>
                <ChevronRight size={17} color="#FFFFFF" />
              </TouchableOpacity>
            ) : ["published", "partially_awarded"].includes(list.status) ? (
              <Text style={styles.proposalUnavailable}>{lifecycle.expired ? copy.expired : copy.covered}</Text>
            ) : null}
          </View>
        </View>
      ); })}
      {list.status === "published" ? (
        <TouchableOpacity style={styles.cancelAction} onPress={onCancel} disabled={busy}>
          <Text style={styles.cancelActionText}>Cancelar esta lista</Text>
        </TouchableOpacity>
      ) : null}
      {["awarded", "closed", "canceled", "archived"].includes(list.status) ? (
        <BigActionButton
          label="Comprar esta lista otra vez"
          tone="light"
          icon={<RefreshCw size={19} color={colors.primary} />}
          onPress={() => onDuplicate()}
          busy={busy}
        />
      ) : null}
    </View>
  );
}

function SellerProposalEditor({
  list,
  actorAccountId,
  registerDraftExit,
  onExit,
  sellerEnabled,
  busy,
  setBusy,
  onActivate,
  onSaved,
  onError,
  onMessage,
  onOrders,
  isCurrentScope,
}: {
  list: AllwainShoppingList;
  actorAccountId: string;
  registerDraftExit?: (handler: (() => Promise<boolean>) | null) => void;
  onExit?: () => void;
  sellerEnabled: boolean;
  busy: boolean;
  setBusy: (value: boolean) => void;
  onActivate: () => void;
  onSaved: (list: AllwainShoppingList) => void;
  onError: (message: string | null) => void;
  onMessage: () => void;
  onOrders: () => void;
  isCurrentScope: () => boolean;
}) {
  const { locale } = useAppTranslation();
  const copy = shoppingProposalCopy(locale);
  const draftCopy = sellerProposalDraftCopy[locale] || sellerProposalDraftCopy.es;
  const lifecycle = shoppingProposalLifecycle(list, list.myProposal);
  const liveList = useRef(list);
  liveList.current = list;
  const mounted = useRef(true);
  const mutationRevision = useRef(0);
  const mutationBusy = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; mutationRevision.current += 1; };
  }, []);
  const isCurrentMutation = (revision: number, listId: string) =>
    mounted.current && isCurrentScope() && mutationRevision.current === revision && liveList.current.id === listId;
  const existingByItem = useMemo(
    () => new Map((list.myProposal?.items || []).map((item) => [item.shoppingListItemId, item])),
    [list.myProposal],
  );
  const openItems = useMemo(
    () => list.items.filter((item) => item.availabilityStatus !== "awarded" && item.availabilityStatus !== "discarded" && item.reviewStatus !== "discarded"),
    [list.items],
  );
  const draft = useSellerProposalDraft(actorAccountId, list, isCurrentScope);
  const draftSnapshot = `${sellerProposalFingerprint(list)}:${sellerProposalStamp(list.myProposal)}:${JSON.stringify(draft.form)}`;
  const liveDraftSnapshot = useRef(draftSnapshot);
  liveDraftSnapshot.current = draftSnapshot;
  const { selectedItems, prices, substitutions, substitutionNames, description, deliveryEstimate, shippingWeightKg, validForMinutes } = draft.form;
  function field<K extends keyof SellerProposalForm>(name: K, update: React.SetStateAction<SellerProposalForm[K]>) {
    if (busy || mutationBusy.current || !draft.ready || !lifecycle.canEdit) return;
    draft.update(current => ({ ...current, [name]: typeof update === "function" ? (update as (old: SellerProposalForm[K]) => SellerProposalForm[K])(current[name]) : update }));
  }
  const setSelectedItems = (value: React.SetStateAction<Record<string, boolean>>) => field("selectedItems", value);
  const setPrices = (value: React.SetStateAction<Record<string, string>>) => field("prices", value);
  const setSubstitutions = (value: React.SetStateAction<Record<string, boolean>>) => field("substitutions", value);
  const setSubstitutionNames = (value: React.SetStateAction<Record<string, string>>) => field("substitutionNames", value);
  const setDescription = (value: string) => field("description", value);
  const setDeliveryEstimate = (value: string) => field("deliveryEstimate", value);
  const setShippingWeightKg = (value: string) => field("shippingWeightKg", value);
  const setValidForMinutes = (value: number) => field("validForMinutes", value);

  async function saveForExit() {
    if (busy || mutationBusy.current || !isCurrentScope()) return false;
    mutationBusy.current = true; setBusy(true);
    try {
      const saved = await draft.save();
      if (!mounted.current || !isCurrentScope()) return false;
      if (!saved) onError(draftCopy.storageError);
      return saved;
    } finally { if (mounted.current && isCurrentScope()) { mutationBusy.current = false; setBusy(false); } }
  }
  useEffect(() => { registerDraftExit?.(saveForExit); return () => registerDraftExit?.(null); }, [registerDraftExit, draft.save, busy, list.id, actorAccountId]);
  useFocusEffect(useCallback(() => () => { if (!mutationBusy.current) void draft.save(); }, [draft.save]));

  function confirmDiscard() {
    if (busy || mutationBusy.current || draft.recovering || !isCurrentScope()) return;
    const revision = mutationRevision.current;
    const confirmedSnapshot = liveDraftSnapshot.current;
    Alert.alert(draftCopy.discardTitle, draftCopy.discardBody, [
      { text: draftCopy.cancel, style: "cancel" },
      { text: draftCopy.discard, style: "destructive", onPress: () => {
        if (!isCurrentMutation(revision, list.id) || confirmedSnapshot !== liveDraftSnapshot.current || busy || mutationBusy.current) return;
        mutationBusy.current = true; setBusy(true);
        void draft.discard().then(removed => { if (mounted.current && isCurrentScope() && !removed) onError(draftCopy.storageError); }).finally(() => { if (mounted.current && isCurrentScope()) { mutationBusy.current = false; setBusy(false); } });
      } },
    ]);
  }
  const draftBanner = <View style={styles.section}>
    {draft.recovering ? <Text style={styles.fieldHint}>{draftCopy.recovering}</Text> : null}
    {draft.storageError ? <Text accessibilityRole="alert" style={styles.error}>{draftCopy.storageError}</Text> : null}
    {draft.notice ? <Text style={styles.fieldHint}>{draftCopy[draft.notice]}</Text> : null}
    {!draft.ready && !draft.recovering ? <BigActionButton label={draftCopy.retry} onPress={() => void draft.recover()} disabled={busy} /> : null}
    {draft.requiresReview && lifecycle.canEdit ? <BigActionButton label={draftCopy.review} onPress={draft.acknowledge} disabled={busy || !draft.ready} /> : null}
  </View>;

  const proposalItems = useMemo(
    () => openItems.filter((item) => selectedItems[item.id]),
    [openItems, selectedItems],
  );
  const total = useMemo(
    () =>
      proposalItems.reduce((sum, item) => {
        const unitPrice = parseNumber(prices[item.id] || "");
        return sum + (unitPrice === null ? 0 : unitPrice * item.quantity);
      }, 0),
    [prices, proposalItems],
  );
  const complete =
    proposalItems.length > 0 &&
    proposalItems.every(
      (item) =>
        parseNumber(prices[item.id] || "") !== null &&
        (!substitutions[item.id] ||
          (substitutionNames[item.id] || "").trim().length >= 2),
    ) &&
    (list.preferredDeliveryChannel !== "carrier" ||
      parseNumber(shippingWeightKg) !== null) &&
    proposalItems.every((item) => {
      const price = parseNumber(prices[item.id] || "");
      if (price === null) return false;
      const reference = item.targetUnitPriceAmount;
      if (typeof reference === "number" && Math.round(price * 100) > reference) {
        return false;
      }
      const previous = existingByItem.get(item.id)?.unitPriceAmount;
      return typeof previous !== "number" || Math.round(price * 100) <= previous;
    });
  const coversAllPending =
    openItems.length > 0 && proposalItems.length === openItems.length;

  function chooseAllPending() {
    setSelectedItems(
      Object.fromEntries(
        list.items.map((item) => [
          item.id,
          item.availabilityStatus !== "awarded" && item.availabilityStatus !== "discarded" && item.reviewStatus !== "discarded",
        ]),
      ),
    );
  }

  function choosePart() {
    const first = openItems[0];
    setSelectedItems(
      Object.fromEntries(list.items.map((item) => [item.id, item.id === first?.id])),
    );
  }

  function toggleItem(item: AllwainShoppingListItem) {
    if (item.availabilityStatus === "awarded" || item.availabilityStatus === "discarded" || item.reviewStatus === "discarded") return;
    setSelectedItems((current) => ({
      ...current,
      [item.id]: !current[item.id],
    }));
  }

  async function submit() {
    if (mutationBusy.current || busy || !isCurrentScope() || !draft.ready || draft.requiresReview || !shoppingProposalLifecycle(liveList.current, liveList.current.myProposal).canEdit) return;
    if (!complete || !description.trim() || !deliveryEstimate.trim()) {
      onError("Elige al menos un producto e indica sus precios, cómo lo servirás y el plazo de entrega.");
      return;
    }
    mutationBusy.current = true;
    const revision = ++mutationRevision.current;
    setBusy(true);
    onError(null);
    const submission: SellerSubmission = {
      listVersion: list.version, description: description.trim(), deliveryEstimate: deliveryEstimate.trim(), shippingWeightKg: parseNumber(shippingWeightKg), validForMinutes,
      items: proposalItems.map(item => ({ shoppingListItemId: item.id, productName: substitutions[item.id] ? (substitutionNames[item.id] || "").trim() : item.productName, quantity: item.quantity, unit: item.unit, unitPrice: parseNumber(prices[item.id] || ""), isSubstitution: substitutions[item.id] === true })),
    };
    const sourceFingerprint = sellerProposalFingerprint(list);
    const sourceProposalStamp = sellerProposalStamp(list.myProposal);
    const sourceCurrent = () => sellerProposalFingerprint(liveList.current) === sourceFingerprint && sellerProposalStamp(liveList.current.myProposal) === sourceProposalStamp;
    try {
      if (!await draft.save()) throw new Error(draftCopy.storageError);
      if (!isCurrentMutation(revision, list.id)) return;
      if (!sourceCurrent()) throw new Error(draftCopy.freshChanged);
      const fresh = await apiAuthGet<AllwainShoppingList>(`/allwain/shopping-lists/${encodeURIComponent(list.id)}`);
      if (!isCurrentMutation(revision, list.id)) return;
      if (!sourceCurrent()) throw new Error(draftCopy.freshChanged);
      if (fresh.id !== list.id || fresh.buyerUserId !== list.buyerUserId || (fresh.myProposal && (fresh.myProposal.ownerUserId || fresh.myProposal.provider?.id) !== actorAccountId)) throw new Error(draftCopy.receiptError);
      if (sellerProposalFingerprint(fresh) !== sellerProposalFingerprint(list) || sellerProposalStamp(fresh.myProposal) !== sellerProposalStamp(list.myProposal) || !shoppingProposalLifecycle(fresh, fresh.myProposal).canEdit || (fresh.proposalDeadlineAt && Date.parse(fresh.proposalDeadlineAt) <= Date.now())) {
        onSaved(fresh); onError(draftCopy.freshChanged); return;
      }
      const updated = await apiAuthPost<AllwainShoppingList>(
        `/allwain/shopping-lists/${encodeURIComponent(list.id)}/proposals`, submission,
      );
      if (!isCurrentMutation(revision, list.id)) return;
      if (!sourceCurrent()) throw new Error(draftCopy.freshChanged);
      if (!sellerProposalSubmissionConfirmed(fresh, updated, actorAccountId, submission)) throw new Error(draftCopy.receiptError);
      const cleared = await draft.discard(true);
      if (!isCurrentMutation(revision, list.id)) return;
      if (!sourceCurrent()) throw new Error(draftCopy.freshChanged);
      onSaved(updated);
      if (!cleared) onError(draftCopy.cleanupError);
      Alert.alert(
        "Propuesta enviada",
        coversAllPending
          ? "Has puesto precio a todos los productos pendientes."
          : `Has puesto precio a ${proposalItems.length} producto${proposalItems.length === 1 ? "" : "s"}.`,
      );
    } catch (submitError: any) {
      if (!isCurrentMutation(revision, list.id)) return;
      if (["SHOPPING_LIST_CHANGED", "SHOPPING_LIST_ITEMS_ALREADY_AWARDED", "SHOPPING_LIST_NOT_OPEN", "SHOPPING_LIST_PROPOSAL_ALREADY_SELECTED", "PROPOSAL_NOT_EDITABLE", "PROPOSAL_NOT_IMPROVED"].includes(submitError?.message)) {
        try {
          const fresh = await apiAuthGet<AllwainShoppingList>(`/allwain/shopping-lists/${encodeURIComponent(list.id)}`);
          if (!isCurrentMutation(revision, list.id)) return;
          if (fresh.id === list.id && fresh.buyerUserId === list.buyerUserId && (!fresh.myProposal || (fresh.myProposal.ownerUserId || fresh.myProposal.provider?.id) === actorAccountId)) onSaved(fresh);
        } catch { /* Keep the saved local form until the latest list can be verified. */ }
      }
      onError(shoppingProposalFailure(locale, submitError, "No pudimos enviar la propuesta."));
    } finally {
      if (isCurrentMutation(revision, list.id)) { mutationBusy.current = false; setBusy(false); }
    }
  }

  function confirmWithdrawal() {
    const proposal = list.myProposal;
    if (!proposal || busy || mutationBusy.current || !lifecycle.canWithdraw || !isCurrentScope()) return;
    Alert.alert(copy.confirmTitle, copy.confirmBody, [
      { text: copy.cancel, style: "cancel" },
      { text: copy.withdraw, style: "destructive", onPress: () => {
        const current = liveList.current.myProposal;
        if (!mounted.current || !isCurrentScope() || current?.id !== proposal.id || current.updatedAt !== proposal.updatedAt ||
          !shoppingProposalLifecycle(liveList.current, current).canWithdraw) return;
        void withdrawProposal(proposal);
      } },
    ]);
  }

  async function withdrawProposal(proposal: AllwainShoppingListProposal) {
    if (mutationBusy.current || !isCurrentScope()) return;
    mutationBusy.current = true;
    const revision = ++mutationRevision.current;
    const analyticsCurrent = captureAnalyticsGuard(() => isCurrentMutation(revision, list.id));
    setBusy(true); onError(null);
    let retired = false;
    try {
      const receipt = await apiAuthPost<AllwainOffer>(`/allwain/offers/${encodeURIComponent(proposal.id)}/withdraw`, { expectedUpdatedAt: proposal.updatedAt });
      if (!isCurrentMutation(revision, list.id)) return;
      if (!shoppingProposalWithdrawalConfirmed(proposal, receipt)) throw new Error(copy.withdrawError);
      void recordPublicationWithdrawal("proposal", "sell", analyticsCurrent);
      retired = true;
      // Hide edit/accept immediately, including when the detail refresh fails.
      const retiredProposal = { ...proposal, status: "withdrawn", isSelectable: false };
      onSaved({ ...liveList.current, myProposal: retiredProposal,
        proposals: liveList.current.proposals.map((item) => item.id === proposal.id ? retiredProposal : item) });
      const updated = await apiAuthGet<AllwainShoppingList>(`/allwain/shopping-lists/${encodeURIComponent(list.id)}`);
      if (!shoppingProposalDetailMatches(list, updated, proposal)) throw new Error(copy.refreshError);
      if (isCurrentMutation(revision, list.id)) onSaved({ ...updated,
        myProposal: updated.myProposal?.id === proposal.id
          ? { ...updated.myProposal, status: "withdrawn", isSelectable: false }
          : retiredProposal,
        proposals: updated.proposals.map((item) => item.id === proposal.id ? { ...item, status: "withdrawn", isSelectable: false } : item),
      });
    } catch (withdrawError: any) {
      if (!isCurrentMutation(revision, list.id)) return;
      if (!retired) {
        // The buyer may have chosen it meanwhile, or a timed-out request may have committed.
        try {
          const currentList = await apiAuthGet<AllwainShoppingList>(`/allwain/shopping-lists/${encodeURIComponent(list.id)}`);
          if (!isCurrentMutation(revision, list.id)) return;
          if (!shoppingProposalDetailMatches(list, currentList, proposal)) throw new Error(copy.withdrawError);
          onSaved(currentList);
          if (currentList.myProposal?.status === "withdrawn") { void recordPublicationWithdrawal("proposal", "sell", analyticsCurrent); onError(null); return; }
        } catch { /* Keep the failed mutation visible if its current state cannot be verified. */ }
      }
      if (isCurrentMutation(revision, list.id)) onError(retired ? copy.refreshError : shoppingProposalFailure(locale, withdrawError, copy.withdrawError));
    } finally {
      if (isCurrentMutation(revision, list.id)) { mutationBusy.current = false; setBusy(false); }
    }
  }

  if (!sellerEnabled) {
    return (
      <View style={styles.section}>
        <Text style={styles.title}>¿Puedes preparar esta compra?</Text>
        <Text style={styles.subtitle}>Activa Vendedor en esta misma cuenta para enviar una propuesta.</Text>
        <BigActionButton label="Activar Vendedor" tone="dark" onPress={onActivate} />
      </View>
    );
  }
  if (lifecycle.selected) {
    return (
      <View style={styles.section}>
        {draftBanner}
        <TouchableOpacity style={styles.cancelAction} onPress={confirmDiscard} disabled={busy || draft.recovering}><Text style={styles.cancelActionText}>{draftCopy.discard}</Text></TouchableOpacity>
        <Text style={styles.title}>Tu propuesta ha sido elegida</Text>
        <Text style={styles.subtitle}>Estos productos ya forman parte de un pedido. Puedes seguir el cobro y la preparación desde tus pedidos.</Text>
        <View style={styles.totalBand}>
          <Text style={styles.totalBandLabel}>IMPORTE ELEGIDO</Text>
          <Text style={styles.totalBandValue}>{formatCurrency(list.myProposal?.price || 0, list.currency)}</Text>
        </View>
        <BigActionButton label={copy.orders} tone="dark" icon={<ShoppingCart size={18} color="#FFFFFF" />} onPress={onOrders} />
        <TouchableOpacity style={styles.messageButtonWide} onPress={onMessage}>
          <MessageCircle size={18} color={colors.primary} />
          <Text style={styles.messageButtonText}>Hablar con el comprador</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (lifecycle.retired || !lifecycle.open) {
    return (
      <View style={styles.section}>
        {draftBanner}
        <TouchableOpacity style={styles.cancelAction} onPress={confirmDiscard} disabled={busy || draft.recovering}><Text style={styles.cancelActionText}>{draftCopy.discard}</Text></TouchableOpacity>
        <StatusChip label={lifecycle.withdrawn ? copy.withdrawn : lifecycle.retired ? copy.unavailable : copy.closed} tone="neutral" />
        <Text style={styles.subtitle}>{lifecycle.withdrawn ? copy.withdrawnBody : lifecycle.retired ? copy.unavailableBody : copy.closedBody}</Text>
        {list.myProposal ? (
          <View style={styles.proposalCard}>
            <Text style={styles.proposalTotal}>{formatCurrency(list.myProposal.price, list.currency)}</Text>
            {list.myProposal.description ? <Text style={styles.proposalDescription}>{list.myProposal.description}</Text> : null}
            {list.myProposal.items.map((item) => (
              <View key={item.id} style={styles.proposalLine}>
                <Text style={styles.proposalLineName}>{item.productName} · {item.quantity} {item.unit}</Text>
                <Text style={styles.proposalLinePrice}>{formatCurrency(item.subtotalAmount / 100, item.currency)}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <TouchableOpacity style={styles.messageButtonWide} onPress={onMessage}>
          <MessageCircle size={18} color={colors.primary} />
          <Text style={styles.messageButtonText}>Hablar con el comprador</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <View style={styles.section}>
      {draftBanner}
      <SectionTitle title={list.myProposal ? "Tu propuesta" : "¿Qué puedes servir?"} count={proposalItems.length} />
      <Text style={styles.subtitle}>
        {list.myProposal
          ? `Has incluido ${proposalItems.length} de ${list.items.length} productos. Puedes cambiar la selección mientras no haya sido elegida.`
          : "Puedes ofrecer toda la compra o solamente los productos que tengas disponibles."}
      </Text>
      <View style={styles.choiceGrid}>
        <Choice label={`Todo lo pendiente (${openItems.length})`} selected={coversAllPending} onPress={chooseAllPending} />
        <Choice label="Elegir productos" selected={!coversAllPending} onPress={choosePart} />
      </View>
      {list.items.map((item) => (
        <View key={item.id} style={[styles.priceItem, item.availabilityStatus === "awarded" && styles.priceItemUnavailable]}>
          <View style={styles.priceRow}>
            <TouchableOpacity
              accessibilityRole="checkbox"
              accessibilityLabel={`Incluir ${item.productName}`}
              accessibilityState={{
                checked: selectedItems[item.id] === true,
                disabled: !draft.ready || busy || item.availabilityStatus === "awarded" || item.availabilityStatus === "discarded" || item.reviewStatus === "discarded",
              }}
              style={[styles.checkBox, selectedItems[item.id] && styles.checkBoxSelected]}
              onPress={() => toggleItem(item)}
              disabled={!draft.ready || busy || item.availabilityStatus === "awarded" || item.availabilityStatus === "discarded" || item.reviewStatus === "discarded"}
            >
              {selectedItems[item.id] ? <Check size={14} color="#FFFFFF" /> : null}
            </TouchableOpacity>
            {item.imageMeta?.url ? (
              <View style={styles.priceItemImage}>
                <PublicationImage
                  imageUrl={item.imageMeta.url}
                  imageAlt={item.imageMeta.alt || item.productName}
                  illustrative={item.imageMeta.illustrative === true}
                />
              </View>
            ) : null}
            <View style={styles.priceProduct}>
              <Text style={styles.lineName}>{item.productName}</Text>
              <Text style={styles.lineNote}>
                {item.quantity} {item.unit}{item.availabilityStatus === "awarded" ? " · ya cubierto" : selectedItems[item.id] ? " · incluido" : " · no incluido"}
              </Text>
              {typeof item.targetUnitPriceAmount === "number" ? (
                <Text style={styles.targetPrice}>
                  Máximo orientativo: {formatCurrency(item.targetUnitPriceAmount / 100, list.currency)}/{item.unit}
                </Text>
              ) : null}
            </View>
            {selectedItems[item.id] && item.availabilityStatus !== "awarded" ? <View style={styles.priceInputFrame}>
              <TextInput
                editable={draft.ready && !busy}
                accessibilityLabel={`Precio por unidad de ${item.productName}`}
                testID={`seller-proposal-price:${item.id}`}
                style={styles.priceInput}
                value={prices[item.id] || ""}
                onChangeText={(value) => setPrices((current) => ({ ...current, [item.id]: value }))}
                keyboardType="decimal-pad"
                placeholder="0,00"
                placeholderTextColor={colors.mutedText}
              />
              <Text style={styles.priceSuffix}>€/{item.unit}</Text>
            </View> : null}
          </View>
          {selectedItems[item.id] && (() => {
            const price = parseNumber(prices[item.id] || "");
            const reference = item.targetUnitPriceAmount;
            const previous = existingByItem.get(item.id)?.unitPriceAmount;
            if (price !== null && typeof reference === "number" && Math.round(price * 100) > reference) {
              return <Text style={styles.inlinePriceError}>No puede superar el precio de referencia.</Text>;
            }
            if (price !== null && typeof previous === "number" && Math.round(price * 100) > previous) {
              return <Text style={styles.inlinePriceError}>La nueva propuesta debe mantener o mejorar tu precio anterior.</Text>;
            }
            return null;
          })()}
          {list.allowSubstitutions && selectedItems[item.id] && item.availabilityStatus !== "awarded" ? (
            <View style={styles.substitutionArea}>
              <TouchableOpacity
                style={styles.substitutionToggle}
                testID={`seller-proposal-substitution:${item.id}`}
                accessibilityRole="checkbox"
                accessibilityLabel={`Ofrecer alternativa para ${item.productName}`}
                accessibilityState={{ checked: substitutions[item.id] === true, disabled: !draft.ready || busy }}
                disabled={!draft.ready || busy}
                onPress={() =>
                  setSubstitutions((current) => ({
                    ...current,
                    [item.id]: !current[item.id],
                  }))
                }
              >
                <View style={[styles.checkBox, substitutions[item.id] && styles.checkBoxSelected]}>
                  {substitutions[item.id] ? <Check size={14} color="#FFFFFF" /> : null}
                </View>
                <Text style={styles.substitutionToggleText}>Ofrecer alternativa equivalente</Text>
              </TouchableOpacity>
              {substitutions[item.id] ? (
                <TextInput
                  editable={draft.ready && !busy}
                  accessibilityLabel={`Alternativa para ${item.productName}`}
                  testID={`seller-proposal-substitution-name:${item.id}`}
                  maxLength={160}
                  style={styles.input}
                  value={substitutionNames[item.id] || ""}
                  onChangeText={(value) =>
                    setSubstitutionNames((current) => ({
                      ...current,
                      [item.id]: value,
                    }))
                  }
                  placeholder="Nombre exacto de la alternativa"
                  placeholderTextColor={colors.mutedText}
                />
              ) : null}
            </View>
          ) : null}
        </View>
      ))}
      <View style={styles.totalBand}>
        <Text style={styles.totalBandLabel}>{coversAllPending ? "TOTAL DE LO PENDIENTE" : "TOTAL DE TU PROPUESTA"}</Text>
        <Text style={styles.totalBandValue}>{formatCurrency(total, list.currency)}</Text>
      </View>
      <Field label="¿Cuándo puedes entregarlo?">
        <TextInput testID="seller-proposal-delivery" accessibilityLabel="Plazo de entrega de la propuesta" style={styles.input} value={deliveryEstimate} onChangeText={setDeliveryEstimate} editable={draft.ready && !busy} maxLength={240} placeholder="Ej. en 48 horas" placeholderTextColor={colors.mutedText} />
      </Field>
      <Field
        label={
          list.preferredDeliveryChannel === "carrier"
            ? "Peso total para mensajería"
            : "Peso total del paquete (opcional)"
        }
      >
        <TextInput
          style={styles.input}
          value={shippingWeightKg}
          testID="seller-proposal-shipping-weight"
          editable={draft.ready && !busy}
          onChangeText={setShippingWeightKg}
          keyboardType="decimal-pad"
          placeholder="Ej. 12,5 kg"
          placeholderTextColor={colors.mutedText}
        />
        <Text style={styles.fieldHint}>
          {list.preferredDeliveryChannel === "carrier"
            ? "Lo necesitamos para calcular el precio real del transporte."
            : "Permite ofrecer mensajería si el comprador la elige."}
        </Text>
      </Field>
      <Field label="Resume tu propuesta">
        <TextInput testID="seller-proposal-description" accessibilityLabel="Descripción de la propuesta" style={styles.mediumInput} multiline textAlignVertical="top" value={description} onChangeText={setDescription} editable={draft.ready && !busy} maxLength={1500} placeholder="Calidad, marcas y condiciones incluidas" placeholderTextColor={colors.mutedText} />
      </Field>
      <ProposalValidityControl
        value={validForMinutes}
        onChange={setValidForMinutes}
      />
      {list.myProposal ? (
        <ProposalCountdown expiresAt={list.myProposal.validUntil} />
      ) : null}
      <BigActionButton label={list.myProposal ? "Actualizar propuesta" : coversAllPending ? "Enviar propuesta completa" : "Enviar propuesta parcial"} tone="dark" onPress={() => void submit()} busy={busy} disabled={!complete || !draft.ready || draft.requiresReview || busy} />
      <View style={styles.draftActions}>
        <TouchableOpacity testID="seller-proposal-save-exit" accessibilityRole="button" accessibilityLabel={draftCopy.saveExit} style={styles.textAction} disabled={busy || !draft.ready} onPress={() => void saveForExit().then(saved => { if (saved && mounted.current && isCurrentScope()) onExit?.(); })}><Text style={styles.textActionLabel}>{draftCopy.saveExit}</Text></TouchableOpacity>
        <TouchableOpacity testID="seller-proposal-discard" accessibilityRole="button" accessibilityLabel={draftCopy.discard} style={styles.textAction} disabled={busy || draft.recovering} onPress={confirmDiscard}><Text style={styles.textActionLabel}>{draftCopy.discard}</Text></TouchableOpacity>
      </View>
      {lifecycle.canWithdraw ? (
        <TouchableOpacity style={styles.cancelAction} onPress={confirmWithdrawal} disabled={busy} accessibilityRole="button">
          <View style={styles.withdrawAction}>
            <Trash2 size={17} color={colors.danger} />
            <Text style={styles.cancelActionText}>{copy.withdraw}</Text>
          </View>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity style={styles.messageButtonWide} onPress={onMessage}>
        <MessageCircle size={18} color={colors.primary} />
        <Text style={styles.messageButtonText}>Preguntar al comprador</Text>
      </TouchableOpacity>
    </View>
  );
}

function ScreenBack({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <View style={styles.screenBack}>
      <TouchableOpacity style={styles.iconButton} onPress={onPress} accessibilityLabel="Volver">
        <ArrowLeft size={22} color={colors.text} />
      </TouchableOpacity>
      <Text style={styles.screenBackTitle}>{title}</Text>
      <View style={styles.iconButton} />
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.choice, selected && styles.choiceSelected]} onPress={onPress}>
      {selected ? <Check size={16} color={colors.primary} /> : null}
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionCount}>{count}</Text>
    </View>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={styles.fact}>
      {icon}
      <View style={styles.factCopy}>
        <Text style={styles.factLabel}>{label}</Text>
        <Text style={styles.factValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overviewHeader: { gap: 11 },
  screen: { flex: 1, backgroundColor: colors.background },
  wizardHeading: { width: "100%", maxWidth: 900, alignSelf: "center", paddingHorizontal: 16, paddingTop: 8 },
  wizardFooter: { width: "100%", maxWidth: 900, alignSelf: "center", paddingHorizontal: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.cardBorder, backgroundColor: colors.card, gap: 4 },
  draftActions: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap" },
  content: { width: "100%", maxWidth: 720, alignSelf: "center", padding: 16, paddingBottom: 48, gap: 13 },
  eyebrow: { color: colors.brandDark, fontSize: 11, fontWeight: "900" },
  title: { color: colors.text, fontSize: 27, lineHeight: 33, fontWeight: "900" },
  subtitle: { color: colors.mutedText, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  section: { gap: 14 },
  screenBack: { minHeight: 45, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  screenBackTitle: { flex: 1, textAlign: "center", color: colors.text, fontSize: 17, fontWeight: "900" },
  iconButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: colors.cardBorder, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.primary },
  stepLabel: { color: colors.brandDark, fontSize: 12, fontWeight: "900" },
  largeInput: { minHeight: 190, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, backgroundColor: colors.card, color: colors.text, fontSize: 16, lineHeight: 25, padding: 14 },
  mediumInput: { minHeight: 95, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, backgroundColor: colors.card, color: colors.text, fontSize: 15, lineHeight: 21, padding: 12 },
  input: { minHeight: 51, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, backgroundColor: colors.card, color: colors.text, fontSize: 15, paddingHorizontal: 12, paddingVertical: 9 },
  textAction: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  textActionLabel: { color: colors.brandDark, fontSize: 14, fontWeight: "900" },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 9, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: "#FFC8BA", backgroundColor: colors.highlight },
  noticeCopy: { flex: 1, gap: 4 },
  noticeText: { color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: "700" },
  editItem: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.cardBorder, gap: 10 },
  editItemHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemNumber: { width: 28, height: 28, borderRadius: 14, textAlign: "center", textAlignVertical: "center", backgroundColor: colors.highlight, color: colors.brandDark, fontWeight: "900" },
  itemNameInput: { flex: 1, minWidth: 0 },
  twoColumns: { flexDirection: "row", gap: 10 },
  fieldColumn: { flex: 1, minWidth: 0, gap: 6 },
  label: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "900" },
  pickerFrame: { minHeight: 51, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, backgroundColor: colors.card, overflow: "hidden", justifyContent: "center" },
  picker: { width: "100%", color: colors.text },
  addRow: { minHeight: 48, borderWidth: 1, borderStyle: "dashed", borderColor: colors.primary, borderRadius: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  addRowText: { color: colors.brandDark, fontWeight: "900" },
  field: { gap: 7 },
  fieldHint: { color: colors.mutedText, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  choiceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: { minHeight: 45, minWidth: 112, flexGrow: 1, flexBasis: "44%", borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, backgroundColor: colors.card, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  choiceSelected: { borderColor: colors.primary, backgroundColor: colors.highlight },
  choiceText: { color: colors.text, textAlign: "center", fontSize: 13, fontWeight: "800" },
  choiceTextSelected: { color: colors.brandDark },
  understanding: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 10, borderRadius: 7, backgroundColor: "#EDF7F0" },
  understandingText: { flex: 1, color: colors.success, fontSize: 12, lineHeight: 17, fontWeight: "800" },
  locationButton: { minHeight: 44, borderWidth: 1, borderColor: colors.primary, borderRadius: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  locationButtonText: { color: colors.brandDark, fontWeight: "900", fontSize: 13 },
  switchRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.cardBorder, paddingVertical: 10 },
  switchCopy: { flex: 1, minWidth: 0, gap: 3 },
  finalSummary: { flexDirection: "row", alignItems: "center", gap: 10, padding: 13, borderRadius: 8, backgroundColor: colors.highlight },
  finalSummaryText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: "800" },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19, fontWeight: "800" },
  discoveryFailure: { gap: 8 },
  searchRow: { minHeight: 52, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, backgroundColor: colors.card, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 12 },
  searchInput: { flex: 1, minWidth: 0, color: colors.text, fontSize: 15, paddingVertical: 10 },
  searchGo: { width: 44, height: 44, marginRight: 3, borderRadius: 7, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  listCard: { borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, backgroundColor: colors.card, padding: 14, gap: 12 },
  listCardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  listIcon: { width: 42, height: 42, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.highlight },
  listImage: { width: 76, height: 64, borderRadius: 8, overflow: "hidden" },
  listCardCopy: { flex: 1, minWidth: 0, gap: 4 },
  listTitleRow: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  listBadgeRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  listCardTitle: { flex: 1, minWidth: 0, color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "900" },
  listCardMeta: { color: colors.mutedText, fontSize: 12, lineHeight: 17, fontWeight: "700" },
  coverageMeta: { color: colors.brandDark, fontSize: 11, lineHeight: 16, fontWeight: "900" },
  listCardFooter: { minHeight: 34, borderTopWidth: 1, borderTopColor: colors.cardBorder, paddingTop: 10, flexDirection: "row", alignItems: "center", gap: 7 },
  proposalCount: { flex: 1, color: colors.mutedText, fontSize: 12, fontWeight: "800" },
  openLabel: { color: colors.brandDark, fontSize: 12, fontWeight: "900" },
  detailHeader: { gap: 8 },
  detailTitleRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  detailTitle: { flex: 1, minWidth: 0, color: colors.text, fontSize: 27, lineHeight: 33, fontWeight: "900" },
  detailMeta: { color: colors.mutedText, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  detailDescription: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  demoNotice: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 11, borderWidth: 1, borderColor: "#FFC8BA", borderRadius: 8, backgroundColor: colors.highlight },
  demoNoticeText: { flex: 1, color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: "800" },
  sectionTitleRow: { minHeight: 32, flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  sectionTitle: { flex: 1, color: colors.text, fontSize: 18, fontWeight: "900" },
  sectionCount: { minWidth: 27, height: 27, borderRadius: 14, backgroundColor: colors.highlight, color: colors.brandDark, textAlign: "center", textAlignVertical: "center", fontSize: 11, fontWeight: "900" },
  lines: { borderTopWidth: 1, borderTopColor: colors.cardBorder },
  line: { minHeight: 58, borderBottomWidth: 1, borderBottomColor: colors.cardBorder, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9 },
  lineImage: { width: 58, height: 48, borderRadius: 8, overflow: "hidden" },
  lineCopy: { flex: 1, minWidth: 0, gap: 3 },
  lineAside: { alignItems: "flex-end", gap: 5 },
  lineName: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  lineNote: { color: colors.mutedText, fontSize: 11, lineHeight: 16, fontWeight: "600" },
  lineQuantity: { color: colors.text, fontSize: 14, fontWeight: "900" },
  factsBand: { gap: 9, paddingVertical: 4 },
  fact: { flexDirection: "row", alignItems: "center", gap: 9 },
  factCopy: { flex: 1, minWidth: 0 },
  factLabel: { color: colors.mutedText, fontSize: 10, fontWeight: "800" },
  factValue: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "800" },
  proposalCard: { borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, backgroundColor: colors.card, padding: 14, gap: 10 },
  selectedProposal: { borderColor: colors.success },
  proposalTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  proposalCopy: { flex: 1, minWidth: 0, gap: 3 },
  proposalProvider: { color: colors.text, fontSize: 16, fontWeight: "900" },
  proposalScore: { color: colors.mutedText, fontSize: 11, fontWeight: "700" },
  proposalTotal: { color: colors.text, fontSize: 21, fontWeight: "900" },
  proposalLine: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 7, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  proposalLineImage: { width: 46, height: 40, borderRadius: 7, overflow: "hidden" },
  proposalLineName: { flex: 1, minWidth: 0, color: colors.text, fontSize: 12, fontWeight: "700" },
  proposalLineCopy: { flex: 1, minWidth: 0, gap: 2 },
  proposalLineUnit: { color: colors.mutedText, fontSize: 10, lineHeight: 14, fontWeight: "700" },
  proposalLinePrice: { color: colors.text, fontSize: 12, fontWeight: "900" },
  proposalDetail: { color: colors.brandDark, fontSize: 12, fontWeight: "900" },
  proposalDescription: { color: colors.mutedText, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  proposalActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: 8, paddingTop: 3 },
  proposalUnavailable: { flex: 1, color: colors.mutedText, textAlign: "right", fontSize: 11, lineHeight: 15, fontWeight: "800" },
  messageButton: { minHeight: 42, borderWidth: 1, borderColor: "#FFC8BA", borderRadius: 7, backgroundColor: colors.highlight, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  messageButtonWide: { minHeight: 48, borderWidth: 1, borderColor: "#FFC8BA", borderRadius: 8, backgroundColor: colors.highlight, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  messageButtonText: { color: colors.brandDark, fontSize: 12, fontWeight: "900" },
  chooseButton: { minHeight: 42, borderRadius: 7, backgroundColor: colors.primary, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  chooseButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  cancelAction: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  cancelActionText: { color: colors.danger, fontSize: 13, fontWeight: "800" },
  withdrawAction: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  priceItem: { borderBottomWidth: 1, borderBottomColor: colors.cardBorder, paddingVertical: 8, gap: 7 },
  priceItemUnavailable: { opacity: 0.55 },
  priceRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 8 },
  priceItemImage: { width: 42, height: 42, borderRadius: 7, overflow: "hidden" },
  priceProduct: { flex: 1, minWidth: 0, gap: 3 },
  targetPrice: { color: colors.brandDark, fontSize: 12, lineHeight: 17, fontWeight: "800" },
  priceInputFrame: { width: 118, height: 48, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, backgroundColor: colors.card, flexDirection: "row", alignItems: "center", paddingHorizontal: 7 },
  priceInput: { flex: 1, minWidth: 0, color: colors.text, textAlign: "right", fontSize: 15, fontWeight: "900", paddingVertical: 8 },
  priceSuffix: { color: colors.mutedText, fontSize: 11, fontWeight: "700", marginLeft: 4 },
  inlinePriceError: { color: colors.danger, fontSize: 11, lineHeight: 15, fontWeight: "800", paddingLeft: 30 },
  substitutionArea: { width: "100%", gap: 8, paddingTop: 2 },
  substitutionToggle: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 8 },
  substitutionToggleText: { flex: 1, color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: "800" },
  evidenceNotice: { flexDirection: "row", alignItems: "flex-start", gap: 9, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: "#B9D9C1", backgroundColor: "#EDF7F0" },
  evidenceTitle: { color: colors.success, fontSize: 13, lineHeight: 18, fontWeight: "900" },
  ocrReviewItem: { minHeight: 68, borderBottomWidth: 1, borderBottomColor: colors.cardBorder, flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 9 },
  ocrReviewItemOff: { opacity: 0.52 },
  ocrPrice: { maxWidth: 126, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4 },
  ocrPriceText: { color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: "900", textAlign: "right" },
  restartCapture: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  restartCaptureText: { color: colors.danger, fontSize: 13, lineHeight: 18, fontWeight: "900", textAlign: "center" },
  checkBox: { width: 22, height: 22, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 4, alignItems: "center", justifyContent: "center", backgroundColor: colors.card },
  checkBoxSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  totalBand: { minHeight: 66, borderRadius: 8, backgroundColor: colors.seller, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  totalBandLabel: { flex: 1, color: "#D7D7D7", fontSize: 11, fontWeight: "900" },
  totalBandValue: { color: "#FFFFFF", fontSize: 24, fontWeight: "900" },
});

