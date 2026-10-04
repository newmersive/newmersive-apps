import { finishManualRequestDraft, requestCardReturnUrl } from "../../utils/manualRequestContinuity";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  ActivityIndicator,
  AccessibilityInfo,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  Boxes,
  Check,
  ChevronDown,
  CreditCard,
  MessageCircle,
  Navigation,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sparkles,
} from "lucide-react-native";
import {
  apiGet,
  apiAuthGet,
  apiAuthPatch,
  apiAuthPost,
  AllwainContract,
  AllwainCheckoutResponse,
  AllwainBuyerPaymentProfile,
  AllwainPaymentConfig,
  AllwainOffer,
  AllwainScanCaptureResponse,
  AllwainScanRequest,
} from "../../config/api";
import { RootStackParamList } from "../../navigation/types";
import { colors } from "../../theme/colors";
import { formatCurrency } from "../../utils/format";
import OfferOrderForm, {
  OfferDeliveryDraft,
} from "../../components/OfferOrderForm";
import {
  isWholeUnit,
  measurementForProduct,
  measurementFromProductName,
  MEASUREMENT_OPTIONS,
} from "../../utils/productIntelligence";
import { openExternalUrl } from "../../utils/openExternalUrl";
import { getAllwainCurrentLocation } from "../../utils/currentLocation";
import { interpretDeliveryWindow, StructuredDeliveryWindow } from "../../utils/deliveryIntelligence";
import { DemoCard, OrderCard, PublicationImage } from "../../components/design-system";
import { useAuthStore } from "../../store/auth.store";
import { captureAuthSession } from "../../store/authSessionBridge";
import { createReplyGate, proposalPageUrl, validateProposalPage, type ProposalView, type RequestProposalPage, type RequestWorkDetail } from "../../utils/requestWork";
import { requestWorkCopy } from "../../i18n/requestWorkCopy";
import { buyerContinuityCopy, buyerRecoveryCopy } from "../../i18n/buyerContinuityCopy";
import { trackAnalyticsEvent } from "../../analytics";
import { captureAnalyticsGuard, recordPublicationWithdrawal } from "../../analytics/purchaseAnalytics";
import { ProposalCountdown } from "../../components/ProposalValidityControl";
import { readScanCapture, forgetScanCapture, type ScanCaptureInput } from "../../utils/scanCaptureMemory";
import { useRequestKeyboardLayout } from "../../components/useRequestKeyboardLayout";
import { buyerRequestLifecycleCopy } from "../../i18n/buyerRequestLifecycleCopy";
import { requestCopy } from "../../i18n/requestCopy";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { isRtlLocale } from "../../i18n";
import { AppAlert } from "../../utils/appAlert";
import {
  existingRequestContract, hasRequestOrder, requestPublicationAction,
  transitionRequestPublication, type RequestPublicationAction,
} from "../../utils/requestLifecycle";

type Props = NativeStackScreenProps<RootStackParamList, "ScanResult">;
type DeliveryMethod = "shipping" | "pickup" | "in_person" | null;
type DeliveryChannel = "carrier" | "local_connector" | "seller" | "pickup" | null;

function analyticsRequestSource(value?: string | null) {
  if (
    value === "camera" ||
    value === "image" ||
    value === "barcode" ||
    value === "text"
  ) {
    return value;
  }
  return "manual" as const;
}

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

type ProductForm = {
  productName: string;
  quantity: string;
  unit: string;
  targetPrice: string;
  currency: string;
  brand: string;
  category: string;
  ean: string;
  sku: string;
  supplier: string;
  deliveryWindow: string;
  structuredDeliveryWindow: StructuredDeliveryWindow | null;
  deliveryMethod: DeliveryMethod;
  deliveryChannel: DeliveryChannel;
  deliveryAddress: string;
  deliveryNotes: string;
  locationLabel: string;
  locationLatApprox: number | null;
  locationLngApprox: number | null;
};

type FormErrors = Partial<Record<keyof ProductForm, string>>;

const EMPTY_FORM: ProductForm = {
  productName: "",
  quantity: "",
  unit: "ud",
  targetPrice: "",
  currency: "EUR",
  brand: "",
  category: "",
  ean: "",
  sku: "",
  supplier: "",
  deliveryWindow: "",
  structuredDeliveryWindow: null,
  deliveryMethod: null,
  deliveryChannel: null,
  deliveryAddress: "",
  deliveryNotes: "",
  locationLabel: "",
  locationLatApprox: null,
  locationLngApprox: null,
};

const CURRENCY_OPTIONS = [
  { code: "EUR", label: "Euro" },
  { code: "USD", label: "Dólar estadounidense" },
  { code: "GBP", label: "Libra esterlina" },
  { code: "CHF", label: "Franco suizo" },
] as const;

const DELIVERY_OPTIONS: {
  value: Exclude<DeliveryChannel, null>;
  label: string;
  hint: string;
}[] = [
  { value: "local_connector", label: "Reparto local", hint: "Una persona de la red lo acerca" },
  { value: "carrier", label: "Mensajería", hint: "Envío fuera de la zona local" },
  { value: "pickup", label: "Recogida", hint: "Tú recoges el pedido" },
  { value: "seller", label: "Vendedor", hint: "Entrega directa del vendedor" },
];

function methodForChannel(channel: DeliveryChannel): DeliveryMethod {
  if (channel === "carrier" || channel === "local_connector") return "shipping";
  if (channel === "seller") return "in_person";
  if (channel === "pickup") return "pickup";
  return null;
}

function channelFromFields(fields: AllwainScanRequest["extracted"]): DeliveryChannel {
  if (fields.deliveryChannel) return fields.deliveryChannel;
  if (fields.deliveryMethod === "shipping") return "carrier";
  if (fields.deliveryMethod === "in_person") return "seller";
  if (fields.deliveryMethod === "pickup") return "pickup";
  return null;
}

function formFromRequest(request: AllwainScanRequest): ProductForm {
  const fields = request.extracted;
  const measurement = measurementForProduct(fields);
  return {
    productName: fields.productName || "",
    quantity: fields.quantity == null ? "" : String(fields.quantity),
    unit: measurement.unit,
    targetPrice: fields.targetPrice == null ? "" : String(fields.targetPrice),
    currency: fields.currency || "EUR",
    brand: fields.brand || "",
    category: fields.category || "",
    ean: fields.ean || "",
    sku: fields.sku || "",
    supplier: fields.supplier || "",
    deliveryWindow: fields.deliveryWindow || "",
    structuredDeliveryWindow:
      fields.structuredDeliveryWindow ||
      interpretDeliveryWindow(fields.deliveryWindow || ""),
    deliveryMethod: fields.deliveryMethod || null,
    deliveryChannel: channelFromFields(fields),
    deliveryAddress: fields.deliveryAddress || "",
    deliveryNotes: fields.deliveryNotes || "",
    locationLabel: fields.locationLabel || fields.deliveryAddress || "",
    locationLatApprox: fields.locationLatApprox ?? null,
    locationLngApprox: fields.locationLngApprox ?? null,
  };
}

function optionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function formPayload(form: ProductForm) {
  return {
    productName: form.productName,
    quantity: optionalNumber(form.quantity),
    unit: form.unit,
    targetPrice: optionalNumber(form.targetPrice),
    currency: form.currency,
    brand: form.brand,
    category: form.category,
    ean: form.ean,
    sku: form.sku,
    supplier: form.supplier,
    deliveryWindow: form.deliveryWindow,
    structuredDeliveryWindow:
      form.structuredDeliveryWindow ||
      interpretDeliveryWindow(form.deliveryWindow),
    deliveryMethod: methodForChannel(form.deliveryChannel),
    deliveryChannel: form.deliveryChannel,
    deliveryAddress: form.deliveryAddress,
    deliveryNotes: form.deliveryNotes,
    locationLabel: form.locationLabel || form.deliveryAddress,
    locationLatApprox: form.locationLatApprox,
    locationLngApprox: form.locationLngApprox,
  };
}

function validateForm(form: ProductForm) {
  const errors: FormErrors = {};
  const quantity = optionalNumber(form.quantity);
  const targetPrice = optionalNumber(form.targetPrice);
  if (!form.productName.trim()) errors.productName = "Indica qué producto necesitas.";
  if (!quantity || quantity <= 0) errors.quantity = "Indica una cantidad válida.";
  if (!form.unit.trim()) errors.unit = "Indica la unidad.";
  if (!form.deliveryWindow.trim()) errors.deliveryWindow = "Indica cuándo lo necesitas.";
  if (!form.deliveryChannel) errors.deliveryChannel = "Selecciona cómo quieres recibirlo.";
  if (!form.deliveryAddress.trim()) errors.deliveryAddress = "Indica el lugar de entrega.";
  if (form.targetPrice.trim() && (!targetPrice || targetPrice <= 0)) {
    errors.targetPrice = "Introduce un precio válido o déjalo vacío.";
  }
  return errors;
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  keyboardType,
  multiline,
  focusOnError,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  error?: string;
  keyboardType?: "default" | "decimal-pad" | "number-pad";
  multiline?: boolean;
  focusOnError?: boolean;
}) {
  const input = useRef<TextInput>(null);
  useEffect(() => { if (focusOnError && error) input.current?.focus(); }, [focusOnError,error]);
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput ref={input} accessibilityLabel={label} aria-invalid={Boolean(error)}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8B9290"
        keyboardType={keyboardType}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        style={[styles.input, multiline && styles.textArea, error && styles.inputError]}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

function Step({ number, label, state }: { number: string; label: string; state: "done" | "active" | "next" }) {
  return (
    <View style={styles.step}>
      <View
        style={[
          styles.stepNumber,
          state === "done" && styles.stepNumberDone,
          state === "active" && styles.stepNumberActive,
        ]}
      >
        <Text style={[styles.stepNumberText, state !== "next" && styles.stepNumberTextActive]}>
          {number}
        </Text>
      </View>
      <Text style={[styles.stepLabel, state === "active" && styles.stepLabelActive]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function DeliveryUnderstandingCard({
  window,
  fallbackText,
}: {
  window: StructuredDeliveryWindow | null;
  fallbackText: string;
}) {
  if (!fallbackText.trim()) return null;
  return (
    <View style={styles.understandingCard}>
      <View style={styles.understandingIcon}>
        <Sparkles size={16} color={colors.primary} />
      </View>
      <View style={styles.understandingCopy}>
        <Text style={styles.understandingKicker}>Allwain entiende</Text>
        <Text style={styles.understandingTitle}>
          {window?.label || fallbackText.trim()}
        </Text>
        <Text style={styles.understandingText}>
          {window?.needsChoice
            ? "La fecha parece ambigua. Puedes escribirla de otra forma o elegirla al confirmar."
            : "Guardaremos esta fecha como dato organizado para preparar ofertas y repartos."}
        </Text>
      </View>
      <Text style={styles.understandingScore}>
        {Math.round((window?.confidence || 0.2) * 100)}%
      </Text>
    </View>
  );
}

function deliveryChannelLabel(channel?: DeliveryChannel) {
  return DELIVERY_OPTIONS.find((option) => option.value === channel)?.label || "";
}

export default function ScanResultScreen({ navigation, route }: Props) {
  const { keyboardAvoidingProps, footerPaddingBottom } = useRequestKeyboardLayout();
  const userId = useAuthStore((state) => state.user?.id);
  const { locale, t } = useAppTranslation();
  const workCopy = requestWorkCopy[locale];
  const continuityCopy = buyerContinuityCopy[locale];
  const lifecycle = buyerRequestLifecycleCopy[locale];
  const labels = requestCopy[locale].states;
  const screen = useRef({ focused: true, generation: 0 });
  const originalAccount = useRef(userId);
  const lifecycleOperation = useRef<string | null>(null);
  const loadRevision = useRef(0);
  const capturePromise = useRef<Promise<AllwainScanCaptureResponse> | null>(null);
  const initialInput = useRef<ScanCaptureInput & { requestId?: string }>({
    ...readScanCapture(route.params?.captureId),
    requestId: route.params?.requestId,
  });
  const formDirty = useRef(false);
  const formRevision = useRef(0);
  const lastRequestState = useRef<{id?:string;status?:string}>({});
  const lastProposalKey = useRef("");
  const scrollRef = useRef<ScrollView>(null);
  const [data, setData] = useState<RequestWorkDetail | null>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const firstError = Object.keys(errors)[0];
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [screenError, setScreenError] = useState("");
  const [notice, setNotice] = useState("");
  const [unitChoicesOpen, setUnitChoicesOpen] = useState(false);
  const [currencyChoicesOpen, setCurrencyChoicesOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [unitOverridden, setUnitOverridden] = useState(false);
  const [offerSort, setOfferSort] = useState<"price" | "rating" | "newest">(
    "price",
  );
  const [proposalView, setProposalView] = useState<ProposalView>("active");
  const [proposalCursors, setProposalCursors] = useState<Array<string | null>>([null]);
  const [proposalIndex, setProposalIndex] = useState(0);
  const [proposalRefresh, setProposalRefresh] = useState(0);
  const [proposalResult, setProposalResult] = useState<{ key: string; value: RequestProposalPage } | null>(null);
  const [proposalError, setProposalError] = useState("");
  const [proposalLoading, setProposalLoading] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [expandedOffer, setExpandedOffer] = useState<string | null>(null);
  const proposalGate = useRef(createReplyGate());
  const effectiveView = data?.status === "submitted" ? proposalView : "all";
  const proposalKey = data?.id ? proposalPageUrl(data.id, offerSort, effectiveView, proposalCursors[proposalIndex]) : "";
  const activeProposalPage = proposalResult?.key === proposalKey ? proposalResult.value : null;
  const proposalRequestId = data?.id;
  const proposalsVisible = Boolean(data && ["submitted", "awarded", "closed", "canceled", "archived"].includes(data.status));
  const [paymentProfile, setPaymentProfile] =
    useState<AllwainBuyerPaymentProfile | null>(null);
  const [publicationCardRequired, setPublicationCardRequired] = useState(false);
  const [cardConsent, setCardConsent] = useState(false);
  const purchaseKeys = useRef<Record<string, string>>({});

  function currentScreen() {
    const generation = screen.current.generation, accountId = userId;
    const session = captureAuthSession();
    return () => screen.current.focused && screen.current.generation === generation &&
      session.isCurrent() && Boolean(accountId) && originalAccount.current === accountId && useAuthStore.getState().user?.id === accountId;
  }

  useEffect(() => {
    if (!proposalsVisible || !proposalRequestId) { proposalGate.current.invalidate(); setProposalResult(null); return; }
    const current = proposalGate.current.begin(currentScreen());
    setProposalLoading(true); setProposalError("");
    if (lastProposalKey.current !== proposalKey) setExpandedOffer(null);
    lastProposalKey.current = proposalKey;
    void apiAuthGet<RequestProposalPage>(proposalKey).then(value => {
      if (current()) setProposalResult({ key: proposalKey, value: validateProposalPage(value, proposalRequestId) });
    }).catch(() => { if (current()) { setProposalResult(null); setProposalError(workCopy.error); } })
      .finally(() => { if (current()) setProposalLoading(false); });
    return () => proposalGate.current.invalidate();
  }, [proposalKey, proposalsVisible, proposalRequestId, proposalRefresh, userId, workCopy.error]);

  function resetProposalPage() { proposalGate.current.invalidate(); setProposalCursors([null]); setProposalIndex(0); setProposalResult(null); setExpandedOffer(null); }
  useEffect(() => { lastRequestState.current = {id:data?.id,status:data?.status}; }, [data?.id,data?.status]);

  useFocusEffect(useCallback(() => {
    const returning = !screen.current.focused;
    screen.current.focused = true; screen.current.generation++;
    if (returning && originalAccount.current === userId) {
      lifecycleOperation.current = null; setBusy(null); setLocating(false);
      void loadRequest({ preserveEdits:true, silent:true, preserveProposals:true }); void loadPublicationPaymentPolicy();
    }
    return () => { screen.current.focused = false; screen.current.generation++; loadRevision.current++; };
  }, [userId]));

  useEffect(() => {
    if (userId === originalAccount.current) return;
    screen.current.generation++; loadRevision.current++;
    setData(null); setForm(EMPTY_FORM); setLoading(false); setBusy(null);
    formDirty.current = false; formRevision.current++; setProposalResult(null);
    setScreenError(lifecycle.changed); purchaseKeys.current = {}; capturePromise.current = null;
  }, [userId, lifecycle.changed]);

  useEffect(() => {
    const requestId = route.params?.requestId;
    if (!requestId || requestId === initialInput.current.requestId) return;
    screen.current.generation++; loadRevision.current++;
    initialInput.current = { requestId }; formDirty.current = false; formRevision.current++;
    capturePromise.current = null;
    lifecycleOperation.current = null; setBusy(null); setNotice("");
    void loadRequest();
  }, [route.params?.requestId]);

  async function loadRequest(options: {preserveEdits?:boolean;silent?:boolean;preserveProposals?:boolean} = {}) {
    const isCurrentScreen = currentScreen();
    const revision = ++loadRevision.current;
    const isCurrent = () => isCurrentScreen() && revision === loadRevision.current;
    if (!isCurrent()) return;
    const scanInput = initialInput.current;
    const editsAtStart = formRevision.current;
    if (options.silent) setRefreshLoading(true); else setLoading(true);
    setScreenError("");
    try {
      let request: AllwainScanRequest;
      if (scanInput?.requestId) {
        request = await apiAuthGet<RequestWorkDetail>(
          `/allwain/scan-requests/${scanInput.requestId}?includeProposals=false`
        );
      } else {
        const rawText = scanInput?.rawText?.trim();
        const barcode = scanInput?.barcode?.trim();
        const imageBase64 = scanInput?.imageBase64?.trim();
        if (!rawText && !barcode && !imageBase64) {
          throw new Error("La captura ya no está disponible. Vuelve a Capturar para seleccionar la imagen o introducir el texto.");
        }
        // Re-entering while OCR is pending must await the same capture, not
        // create a second server draft. The promise remains local to this screen.
        const pending = capturePromise.current || apiAuthPost<AllwainScanCaptureResponse>(
          "/allwain/scan-captures",
          {
          sourceType:
            scanInput?.sourceType ||
            (imageBase64 ? "image" : barcode && !rawText ? "barcode" : "text"),
          rawText,
          barcode,
          imageBase64,
          },
        );
        capturePromise.current = pending;
        let capture: AllwainScanCaptureResponse;
        try { capture = await pending; }
        catch (error) { if (capturePromise.current === pending) capturePromise.current = null; throw error; }
        if (capture.kind === "request" && initialInput.current === scanInput && originalAccount.current === userId && useAuthStore.getState().user?.id === userId) {
          // Keep the server identifier when the user briefly leaves, while
          // guarding all UI updates and navigation with the current focus.
          initialInput.current = { requestId: capture.request.id };
          forgetScanCapture(route.params?.captureId);
        }
        if (!isCurrent()) return;
        if (capture.kind === "shopping_list") {
          forgetScanCapture(route.params?.captureId);
          navigation.replace("ShoppingLists", {
            shoppingListId: capture.shoppingList.id,
            mode: "buy",
          });
          return;
        }
        request = capture.request;
        forgetScanCapture(route.params?.captureId);
        initialInput.current = { requestId: request.id };
      }
      if (!isCurrent()) return;
      if ((scanInput.requestId && request.id !== scanInput.requestId) || (request.userId && request.userId !== userId)) {
        throw new Error(lifecycle.changed);
      }
      if (route.params?.requestId !== request.id) navigation.setParams({ requestId: request.id, captureId: undefined });
      const nextForm = formFromRequest(request);
      const keepEdits = Boolean(options.preserveEdits && formDirty.current || formRevision.current !== editsAtStart);
      setData(request);
      if (!options.preserveProposals || lastRequestState.current.id !== request.id || lastRequestState.current.status !== request.status) resetProposalPage();
      setProposalRefresh(value => value + 1);
      if (!keepEdits) { setForm(nextForm); formDirty.current = false; setUnitOverridden(request.extracted.measurement?.source === "user"); }
      setEditing(previous => request.status === "draft" || (request.status === "ready" && (keepEdits && previous || Object.keys(validateForm(nextForm)).length > 0)));
      if (["submitted","awarded","closed","canceled","archived"].includes(request.status) && userId) await finishManualRequestDraft(userId, request.id, isCurrent);
      if (isCurrent() && options.silent) setNotice(keepEdits ? continuityCopy.changesKept : continuityCopy.refreshed);
    } catch (err: any) {
      if (!isCurrent()) return;
      setScreenError(err?.message || "No pudimos preparar la ficha del producto.");
      if (!options.silent) setData(null);
    } finally {
      if (isCurrent()) { setLoading(false); setRefreshLoading(false); }
    }
  }

  useEffect(() => {
    loadRequest();
    void loadPublicationPaymentPolicy();
    // Route input is captured once; rerunning would create a duplicate draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPublicationPaymentPolicy() {
    const isCurrent = currentScreen();
    try {
      const config = await apiGet<AllwainPaymentConfig>(
        "/allwain/payments/config",
      );
      if (!isCurrent()) return;
      const required = Boolean(config.publicationCardRequired);
      setPublicationCardRequired(required);
      if (required) await refreshPaymentProfile();
    } catch {
      // The backend remains authoritative if the public configuration cannot load.
      if (isCurrent()) setPublicationCardRequired(false);
    }
  }

  async function refreshPaymentProfile() {
    const isCurrent = currentScreen();
    try {
      const profile = await apiAuthGet<AllwainBuyerPaymentProfile>(
        "/allwain/payments/buyer/payment-method",
      );
      if (!isCurrent()) return null;
      setPaymentProfile(profile);
      return profile;
    } catch {
      return null;
    }
  }

  function paymentReturnUrl() {
    if (!data?.id) throw new Error("REQUEST_RETURN_UNAVAILABLE");
    return requestCardReturnUrl(data.id, Platform.OS, (globalThis as any)?.location);
  }

  async function startCardSetup() {
    const isCurrent = currentScreen();
    if (!isCurrent() || busy || lifecycleOperation.current) return;
    if (!cardConsent) {
      setScreenError("Confirma el uso de la tarjeta para continuar.");
      return;
    }
    try {
      setBusy("card");
      setScreenError("");
      const current = paymentProfile || (await refreshPaymentProfile());
      if (!isCurrent()) return;
      const consentVersion =
        current?.consentVersion || "allwain-buyer-payment-method-v1-2026-09-03";
      const setup = await apiAuthPost<AllwainBuyerPaymentProfile>(
        "/allwain/payments/buyer/payment-method/setup",
        {
          consentAccepted: true,
          consentVersion,
          returnUrl: paymentReturnUrl(),
        },
      );
      if (!isCurrent()) return;
      setPaymentProfile(setup);
      if (!setup.url || !/^https:\/\//i.test(setup.url)) {
        throw new Error("Stripe no devolvió un acceso seguro.");
      }
      await openExternalUrl(setup.url);
    } catch (err: any) {
      if (isCurrent()) setScreenError(err?.message || "No se pudo abrir la verificación de tarjeta.");
    } finally {
      if (isCurrent()) setBusy(null);
    }
  }

  function updateField<K extends keyof ProductForm>(key: K, value: ProductForm[K]) {
    formDirty.current = true; formRevision.current++;
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setScreenError("");
    setNotice("");
  }

  function updateProductName(value: string) {
    formDirty.current = true; formRevision.current++;
    setForm((current) => {
      if (unitOverridden) return { ...current, productName: value };
      const measurement = measurementFromProductName(value);
      return { ...current, productName: value, unit: measurement.unit };
    });
    setErrors((current) => ({ ...current, productName: undefined, unit: undefined }));
    setScreenError("");
    setNotice("");
  }

  function chooseUnit(unit: string) {
    setUnitOverridden(true);
    setUnitChoicesOpen(false);
    updateField("unit", unit);
  }

  function updateDeliveryAddress(value: string) {
    formDirty.current = true; formRevision.current++;
    setForm((current) => ({
      ...current,
      deliveryAddress: value,
      locationLabel: value,
      locationLatApprox: null,
      locationLngApprox: null,
    }));
    setErrors((current) => ({ ...current, deliveryAddress: undefined }));
    setScreenError("");
    setNotice("");
  }

  function updateDeliveryWindow(value: string) {
    formDirty.current = true; formRevision.current++;
    setForm((current) => ({
      ...current,
      deliveryWindow: value,
      structuredDeliveryWindow: interpretDeliveryWindow(value),
    }));
    setErrors((current) => ({ ...current, deliveryWindow: undefined }));
    setScreenError("");
    setNotice("");
  }

  async function fillCurrentLocation() {
    const isCurrent = currentScreen();
    if (!isCurrent() || busy || lifecycleOperation.current) return;
    setLocating(true);
    setScreenError("");
    try {
      const location = await getAllwainCurrentLocation();
      if (!isCurrent()) return;
      formDirty.current = true; formRevision.current++;
      setForm((current) => ({
        ...current,
        deliveryAddress: location.address || current.deliveryAddress,
        locationLabel: location.locationLabel,
        locationLatApprox: location.latitude,
        locationLngApprox: location.longitude,
      }));
      if (location.address || form.deliveryAddress.trim()) {
        setErrors((current) => ({ ...current, deliveryAddress: undefined }));
      }
      setNotice(
        location.address
          ? "Dirección obtenida con GPS. Revisa y corrige calle, número, piso y puerta."
          : "GPS añadido. Escribe la dirección de entrega para completarla.",
      );
    } catch (locationError: any) {
      if (isCurrent()) setScreenError(
        locationError?.message || "No pudimos obtener tu ubicación.",
      );
    } finally {
      if (isCurrent()) setLocating(false);
    }
  }

  async function saveDraft() {
    const isCurrent = currentScreen();
    if (!data || !isCurrent() || busy || lifecycleOperation.current) return;
    try {
      setBusy("save");
      setScreenError("");
      const updated = await apiAuthPatch<AllwainScanRequest>(
        `/allwain/scan-requests/${data.id}`,
        { extracted: formPayload(form) }
      );
      if (!isCurrent()) return;
      if (
        updated.id !== data.id ||
        (form.productName.trim() &&
          updated.extracted.productName !== form.productName.trim()) ||
        (form.quantity.trim() &&
          Number(updated.extracted.quantity) !==
            Number(form.quantity.replace(",", ".")))
      ) {
        throw new Error("El servidor no confirmó todos los datos guardados.");
      }
      setData(updated);
      setForm(formFromRequest(updated));
      formDirty.current = false;
      setNotice("Borrador guardado. Puedes continuar más tarde desde Inicio.");
    } catch (err: any) {
      if (isCurrent()) setScreenError(err?.message || "No se pudo guardar el borrador.");
    } finally {
      if (isCurrent()) setBusy(null);
    }
  }

  async function confirmSheet() {
    const isCurrent = currentScreen();
    if (!data || !isCurrent() || busy || lifecycleOperation.current) return;
    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setScreenError("Revisa los campos marcados antes de confirmar la ficha.");
      AccessibilityInfo.announceForAccessibility(Object.values(nextErrors).filter(Boolean).join(". "));
      return;
    }

    try {
      setBusy("confirm");
      setScreenError("");
      const saved = await apiAuthPatch<AllwainScanRequest>(
        `/allwain/scan-requests/${data.id}`,
        { extracted: formPayload(form) }
      );
      if (!isCurrent()) return;
      const confirmed = await apiAuthPost<AllwainScanRequest>(
        `/allwain/scan-requests/${saved.id}/confirm`,
        {}
      );
      if (!isCurrent()) return;
      if (confirmed.id !== data.id || confirmed.status !== "ready") {
        throw new Error("El servidor no confirmó la ficha.");
      }
      setData(confirmed);
      setForm(formFromRequest(confirmed));
      formDirty.current = false;
      setEditing(false);
      scrollRef.current?.scrollTo({y:0,animated:false});
      setNotice("Ficha confirmada. Ya puedes lanzar la petición.");
    } catch (err: any) {
      if (isCurrent()) setScreenError(err?.message || "No se pudo confirmar la ficha.");
    } finally {
      if (isCurrent()) setBusy(null);
    }
  }

  async function launchRequest() {
    const isCurrent = currentScreen();
    if (!data || !isCurrent() || busy || lifecycleOperation.current) return;
    try {
      setBusy("launch");
      setScreenError("");
      if (publicationCardRequired) {
        const currentPayment = await refreshPaymentProfile();
        if (!isCurrent()) return;
        if (!currentPayment?.ready) {
          setScreenError("Añade y verifica una tarjeta antes de publicar la petición.");
          return;
        }
      }
      const launched = await apiAuthPost<AllwainScanRequest>(
        `/allwain/scan-requests/${data.id}/launch`,
        {}
      );
      if (!isCurrent()) return;
      if (launched.id !== data.id || launched.status !== "submitted") {
        throw new Error("El servidor no confirmó el lanzamiento.");
      }
      void trackAnalyticsEvent("request_created", {
        source: analyticsRequestSource(data.sourceType),
      });
      if (userId) await finishManualRequestDraft(userId, launched.id, isCurrent);
      if (!isCurrent()) return;
      setData(launched);
      scrollRef.current?.scrollTo({y:0,animated:false});
      setForm(formFromRequest(launched));
      formDirty.current = false;
      setNotice(
        "Petición publicada. Las propuestas de vendedores aparecerán juntas en esta ficha.",
      );
    } catch (err: any) {
      if (isCurrent()) setScreenError(err?.message || "No se pudo lanzar la petición.");
    } finally {
      if (isCurrent()) setBusy(null);
    }
  }

  async function registerInterest(offerId: string) {
    const isCurrent = currentScreen();
    if (!isCurrent() || busy || lifecycleOperation.current) return;
    try {
      setBusy(offerId);
      setScreenError("");
      setNotice("");
      const lead = await apiAuthPost<{ id: string; offerId?: string | null }>(`/allwain/offers/${offerId}/interest`, {
        source: "scan",
        note: data?.title || form.productName || "Interés desde petición",
      });
      if (!isCurrent()) return;
      if (!lead.id || lead.offerId !== offerId) {
        throw new Error("El servidor no confirmó el interés enviado.");
      }
      setNotice("Interés enviado. El proveedor ha recibido tu solicitud.");
    } catch (err: any) {
      if (isCurrent()) setScreenError(err?.message || "No se pudo enviar. Inténtalo de nuevo.");
    } finally {
      if (isCurrent()) setBusy(null);
    }
  }

  async function requestOffer(
    offer: AllwainOffer,
    quantity: number,
    delivery: OfferDeliveryDraft,
  ) {
    const isCurrent = currentScreen();
    if (!data || !isCurrent() || busy || lifecycleOperation.current) return;
    try {
      setBusy(offer.id);
      setScreenError("");
      setNotice("");
      const purchaseKey =
        purchaseKeys.current[offer.id] ||
        `allwain:${offer.id}:${Date.now()}:${Math.random().toString(36).slice(2, 12)}`;
      purchaseKeys.current[offer.id] = purchaseKey;
      const contract = await apiAuthPost<AllwainContract>(
        `/allwain/offers/${offer.id}/accept`,
        { quantity, ...delivery, purchaseKey }
      );
      if (!isCurrent()) return;
      if (
        !contract.id ||
        contract.offerId !== offer.id ||
        Math.abs(Number(contract.quantity) - quantity) > 0.0001
      ) {
        throw new Error("El servidor no confirmó el pedido completo.");
      }
      navigation.navigate("MainTabs", {
        screen: "Ofertas",
        params: { section: "orders", contractId: contract.id, focusKey: String(Date.now()) },
      });
    } catch (err: any) {
      if (isCurrent()) setScreenError(err?.message || "No se pudo solicitar. Inténtalo de nuevo.");
    } finally {
      if (isCurrent()) setBusy(null);
    }
  }

  function confirmRequestAction(action: RequestPublicationAction) {
    if (!data || !userId || busy || lifecycleOperation.current) return;
    const item = data, accountId = userId, isCurrent = currentScreen();
    const analyticsCurrent = captureAnalyticsGuard(isCurrent);
    AppAlert.alert(lifecycle.actions[action].label, lifecycle.actions[action].confirmation, [
      { text: lifecycle.cancel, style: "cancel" },
      { text: lifecycle.actions[action].label, style: action === "discard" || action === "withdraw" ? "destructive" : "default", onPress: () => {
        if (!isCurrent() || lifecycleOperation.current) return;
        const key = `${item.id}:${screen.current.generation}`;
        lifecycleOperation.current = key; setBusy(`request:${action}`); setScreenError(""); setNotice("");
        void (async () => {
          try {
            const updated = await transitionRequestPublication(item, action, {
              accountId, isCurrent,
              read: id => apiAuthGet<AllwainScanRequest>(`/allwain/scan-requests/${encodeURIComponent(id)}`),
              patch: (id, status) => apiAuthPatch<AllwainScanRequest>(`/allwain/scan-requests/${encodeURIComponent(id)}`, { status }),
            });
            if (!updated || !isCurrent()) return;
            if (action === "withdraw" && updated.status === "canceled") void recordPublicationWithdrawal("request", "buy", analyticsCurrent);
            await finishManualRequestDraft(accountId, updated.id, isCurrent);
            if (!isCurrent()) return;
            setData(updated); setEditing(false); setErrors({}); setNotice(lifecycle.actions[action].done);
            scrollRef.current?.scrollTo({ y: 0, animated: false });
          } catch (err: any) {
            if (isCurrent()) setScreenError(err?.message === "REQUEST_PUBLICATION_CHANGED" ? lifecycle.changed : lifecycle.error);
          } finally {
            if (lifecycleOperation.current === key) lifecycleOperation.current = null;
            if (isCurrent()) setBusy(null);
          }
        })();
      } },
    ]);
  }

  async function openRequestOrder() {
    if (!data || !userId || busy || lifecycleOperation.current) return;
    const isCurrent = currentScreen(), key = `order:${data.id}:${screen.current.generation}`;
    lifecycleOperation.current = key; setBusy("request:order"); setScreenError("");
    try {
      const contractId = await existingRequestContract(data, userId, isCurrent, url => apiAuthGet(url));
      if (!isCurrent()) return;
      if (!contractId) { setScreenError(lifecycle.orderMissing); return; }
      await useAuthStore.getState().setAppMode("buy");
      if (!isCurrent()) return;
      navigation.navigate("MainTabs", { screen: "Ofertas", params: { section: "orders", contractId, focusKey: String(Date.now()) } });
    } catch { if (isCurrent()) setScreenError(lifecycle.orderError); }
    finally {
      if (lifecycleOperation.current === key) lifecycleOperation.current = null;
      if (isCurrent()) setBusy(null);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingTitle}>Leyendo el producto</Text>
        <Text style={styles.loadingText}>Extraemos los datos para crear una ficha editable.</Text>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.loading}>
        <Text style={styles.loadingTitle}>No pudimos crear la ficha</Text>
        <Text style={styles.loadingText}>{screenError}</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => void loadRequest()}>
          <Text style={styles.primaryButtonText}>Reintentar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.textButton} onPress={() => navigation.goBack()}>
          <Text style={styles.textButtonLabel}>Volver a capturar</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const status = data.status;
  const publicationAction = requestPublicationAction(data);
  const showForm = status === "draft" || editing;
  const imageBase64 = initialInput.current?.imageBase64;
  const quantityText = data.extracted.quantity
    ? `${data.extracted.quantity} ${data.extracted.unit || ""}`.trim()
    : "";
  const priceText = data.extracted.targetPrice
    ? `${data.extracted.targetPrice} ${data.extracted.currency || "EUR"}`
    : "Sin precio objetivo";
  const measurement = measurementForProduct({
    productName: form.productName,
    category: form.category,
    productKind: data.extracted.productKind,
    unit: form.unit,
    measurement:
      data.extracted.measurement?.unit === form.unit
        ? data.extracted.measurement
        : undefined,
  });
  const attributes = data.extracted.attributes || [];
  const hasDetectedDetails = Boolean(
    form.brand || form.category || form.ean || form.supplier || attributes.length,
  );
  const sortedOffers = activeProposalPage?.items || [];
  const proposalSummary = activeProposalPage?.summary || data.proposalSummary;
  const chosenProposal = activeProposalPage?.selectedOffer || data.selectedOffer;

  return (
    <SafeAreaView style={[styles.safeArea, { direction: isRtlLocale(locale) ? "rtl" : "ltr" }]} edges={["left", "right"]}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Petición de producto</Text>
        <TouchableOpacity
          style={styles.homeButton}
          onPress={() => navigation.navigate("MainTabs", { screen: "Inicio" })}
        >
          <Text style={styles.homeButtonText}>Inicio</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        {...keyboardAvoidingProps}
      >
        <ScrollView ref={scrollRef}
          style={styles.container}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.progress}>
            <Step number="1" label="Captura" state="done" />
            <Step
              number="2"
              label="Revisar ficha"
              state={showForm ? "active" : "done"}
            />
            <Step
              number="3"
              label="Lanzamiento"
              state={
                ["submitted", "awarded", "closed", "canceled", "archived"].includes(status)
                  ? "done"
                  : status === "ready" && !editing
                    ? "active"
                    : "next"
              }
            />
          </View>

          <View style={styles.headingBlock}>
            <Text style={styles.title}>
              {showForm
                ? status === "ready"
                  ? "Completa la ficha"
                  : "Revisa la ficha"
                : status === "ready"
                  ? "Lista para lanzar"
                  : status === "submitted"
                    ? "Petición activa"
                    : status === "awarded"
                      ? "Propuesta elegida"
                      : status === "canceled"
                        ? "Petición cancelada"
                        : status === "archived"
                          ? labels.archived
                        : "Petición cerrada"}
            </Text>
            <Text style={styles.subtitle}>
              {showForm
                ? status === "ready"
                  ? "Esta ficha es anterior al nuevo flujo. Añade los datos de entrega para volver a confirmarla."
                  : "La IA ha preparado estos datos. Corrige lo necesario antes de confirmarlos."
                : status === "ready"
                  ? "Comprueba el resumen final y lanza la petición cuando esté correcta."
                  : status === "submitted"
                    ? "La petición está publicada y puede recibir propuestas de distintos vendedores."
                    : status === "awarded"
                      ? "Has elegido una propuesta. El pedido y su pago continúan desde Mis pedidos."
                      : "Esta petición conserva todas sus propuestas como historial y ya no recibe nuevas."}
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{lifecycle.statusTitle}: {labels[status]}</Text>
            <Text style={styles.sectionHint}>{lifecycle.hint}</Text>
            {hasRequestOrder(data) ? <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: Boolean(busy) }} disabled={Boolean(busy)} style={[styles.primaryButton, busy && styles.disabledButton]} onPress={() => void openRequestOrder()}><Text style={styles.primaryButtonText}>{busy === "request:order" ? lifecycle.busy : lifecycle.orders}</Text></TouchableOpacity> : null}
            {publicationAction ? <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: Boolean(busy) }} disabled={Boolean(busy)} style={[styles.secondaryButton, busy && styles.disabledButton]} onPress={() => confirmRequestAction(publicationAction)}><Text style={styles.secondaryButtonText}>{busy === `request:${publicationAction}` ? lifecycle.busy : lifecycle.actions[publicationAction].label}</Text></TouchableOpacity> : null}
            {screenError === lifecycle.changed || screenError === lifecycle.orderMissing || screenError === lifecycle.orderError ? <TouchableOpacity accessibilityRole="button" style={styles.textButton} disabled={Boolean(busy)} onPress={() => screenError === lifecycle.changed ? void loadRequest() : void openRequestOrder()}><Text style={styles.textButtonLabel}>{t("common.retry")}</Text></TouchableOpacity> : null}
          </View>
          {status === "submitted" && data.ai.recovery ? <OrderCard title={buyerRecoveryCopy[locale].title} meta={buyerRecoveryCopy[locale].body} actionLabel={buyerRecoveryCopy[locale].previous} onPress={() => { if (!currentScreen()()) return; navigation.navigate("MainTabs",{screen:"Ofertas",params:{section:"orders",contractId:data.ai.recovery?.contractId,orderId:data.ai.recovery?.orderId || undefined,focusKey:String(Date.now())}}); }} /> : null}

          {imageBase64 || data.imageMeta?.url ? (
            <PublicationImage
              imageUrl={imageBase64 || data.imageMeta?.url}
              imageAlt={data.imageMeta?.alt || form.productName || data.title}
              illustrative={!imageBase64 && data.imageMeta?.illustrative === true}
              variant="hero"
            />
          ) : null}

          <View style={styles.aiBand}>
            <View style={styles.aiBandCopy}>
              <Text style={styles.aiBandTitle}>Extracción IA</Text>
              <Text style={styles.aiBandText}>{data.ai.summary}</Text>
            </View>
            <View style={styles.confidenceBadge}>
              <Text style={styles.confidenceValue}>{Math.round((data.ai.confidence || 0) * 100)}%</Text>
              <Text style={styles.confidenceLabel}>confianza</Text>
            </View>
          </View>

          {data.ai.warnings?.length && status === "draft" ? (
            <View style={styles.warningBand}>
              <Text style={styles.warningTitle}>Revisión recomendada</Text>
              <Text style={styles.warningText}>{data.ai.warnings.join(" ")}</Text>
            </View>
          ) : null}

          {screenError ? <Text style={styles.screenError}>{screenError}</Text> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          {showForm ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Producto y cantidad</Text>
              <Text style={styles.sectionHint}>Los campos con * son necesarios para lanzar.</Text>

              <Field
                label="Producto *"
                value={form.productName}
                onChangeText={updateProductName}
                placeholder="Nombre y formato del producto"
                error={errors.productName}
                focusOnError={firstError === "productName"}
              />

              <View style={styles.formRow}>
                <View style={styles.formWide}>
                  <Field
                    label={`${measurement.quantityLabel} *`}
                    value={form.quantity}
                    onChangeText={(value) => updateField("quantity", value)}
                    placeholder={isWholeUnit(measurement.unit) ? "1" : "5"}
                    keyboardType={isWholeUnit(measurement.unit) ? "number-pad" : "decimal-pad"}
                    error={errors.quantity}
                focusOnError={firstError === "quantity"}
                  />
                </View>
                <View style={styles.formNarrow}>
                  <Text style={styles.label}>Se pide por</Text>
                  <TouchableOpacity
                    style={[styles.unitDecision, errors.unit && styles.inputError]}
                    onPress={() => setUnitChoicesOpen((open) => !open)}
                    accessibilityRole="button"
                    accessibilityLabel={`Unidad: ${measurement.label}. Pulsa para cambiarla.`}
                  >
                    {measurement.unit === "kg" ? (
                      <Scale size={18} color={colors.primary} />
                    ) : (
                      <Boxes size={18} color={colors.primary} />
                    )}
                    <Text style={styles.unitDecisionText} numberOfLines={2}>
                      {measurement.label}
                    </Text>
                    <ChevronDown size={16} color={colors.mutedText} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.intelligenceHint}>
                <Sparkles size={15} color={colors.primary} />
                <Text style={styles.intelligenceHintText}>
                  Allwain ha elegido la unidad según el producto. Puedes cambiarla si hace falta.
                </Text>
              </View>

              {unitChoicesOpen ? (
                <View style={styles.unitOptions}>
                  {MEASUREMENT_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.unit}
                      style={[
                        styles.unitOption,
                        form.unit === option.unit && styles.unitOptionActive,
                      ]}
                      onPress={() => chooseUnit(option.unit)}
                    >
                      <Text
                        style={[
                          styles.unitOptionText,
                          form.unit === option.unit && styles.unitOptionTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              <View style={styles.formRow}>
                <View style={styles.formWide}>
                  <Field
                    label="Precio objetivo"
                    value={form.targetPrice}
                    onChangeText={(value) => updateField("targetPrice", value)}
                    placeholder="Opcional"
                    keyboardType="decimal-pad"
                    error={errors.targetPrice}
                focusOnError={firstError === "targetPrice"}
                  />
                </View>
                <View style={styles.formNarrow}>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Moneda</Text>
                    <TouchableOpacity
                      style={styles.unitDecision}
                      onPress={() => setCurrencyChoicesOpen((open) => !open)}
                      accessibilityRole="button"
                      accessibilityLabel={`Moneda: ${form.currency}`}
                    >
                      <Text style={styles.unitDecisionText}>{form.currency}</Text>
                      <ChevronDown size={16} color={colors.mutedText} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {currencyChoicesOpen ? (
                <View style={styles.currencyOptions}>
                  {CURRENCY_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.code}
                      style={[
                        styles.currencyOption,
                        form.currency === option.code && styles.unitOptionActive,
                      ]}
                      onPress={() => {
                        updateField("currency", option.code);
                        setCurrencyChoicesOpen(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.unitOptionText,
                          form.currency === option.code && styles.unitOptionTextActive,
                        ]}
                      >
                        {option.code} · {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              {hasDetectedDetails ? (
                <View style={styles.detectedDetails}>
                  <View style={styles.detectedDetailsHeader}>
                    <View style={styles.detectedDetailsCopy}>
                      <Text style={styles.detectedDetailsTitle}>Datos reconocidos</Text>
                      <Text style={styles.detectedDetailsHint}>
                        Solo mostramos lo que ayuda a identificar el producto.
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => setDetailsOpen((open) => !open)}>
                      <Text style={styles.detailsToggle}>{detailsOpen ? "Cerrar" : "Corregir"}</Text>
                    </TouchableOpacity>
                  </View>
                  {!detailsOpen ? (
                    <View style={styles.detectedSummary}>
                      <SummaryRow label="Marca" value={form.brand} />
                      <SummaryRow label="Categoría" value={form.category} />
                      <SummaryRow label="Código" value={form.ean} />
                      <SummaryRow label="Proveedor" value={form.supplier} />
                      {attributes.map((attribute) => (
                        <SummaryRow
                          key={`${attribute.key}:${attribute.value}`}
                          label={attribute.label}
                          value={attribute.value}
                        />
                      ))}
                    </View>
                  ) : (
                    <View style={styles.detectedEditFields}>
                      {form.brand ? (
                        <Field label="Marca" value={form.brand} onChangeText={(value) => updateField("brand", value)} />
                      ) : null}
                      {form.supplier ? (
                        <Field label="Proveedor" value={form.supplier} onChangeText={(value) => updateField("supplier", value)} />
                      ) : null}
                      {form.ean ? (
                        <Field label="Código EAN" value={form.ean} onChangeText={(value) => updateField("ean", value)} keyboardType="number-pad" />
                      ) : null}
                    </View>
                  )}
                </View>
              ) : null}
            </View>
          ) : null}

          {showForm ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Entrega</Text>
              <Field
                label="¿Cuándo lo necesitas? *"
                value={form.deliveryWindow}
                onChangeText={updateDeliveryWindow}
                placeholder="Ej. antes del 15 de septiembre o en 7-10 días"
                error={errors.deliveryWindow}
                focusOnError={firstError === "deliveryWindow"}
              />
              <DeliveryUnderstandingCard
                window={form.structuredDeliveryWindow}
                fallbackText={form.deliveryWindow}
              />

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Modalidad *</Text>
                <View style={styles.segmentedControl}>
                  {DELIVERY_OPTIONS.map((option) => {
                    const selected = form.deliveryChannel === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        style={[styles.segment, selected && styles.segmentSelected]}
                        onPress={() => {
                          updateField("deliveryChannel", option.value);
                          updateField("deliveryMethod", methodForChannel(option.value));
                        }}
                      >
                        <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.sectionHint}>
                  {DELIVERY_OPTIONS.find((option) => option.value === form.deliveryChannel)?.hint ||
                    "Elige la opción que describe mejor el trayecto."}
                </Text>
                {errors.deliveryChannel ? (
                  <Text style={styles.errorText}>{errors.deliveryChannel}</Text>
                ) : null}
              </View>

              <Field
                label={
                  form.deliveryChannel === "pickup"
                    ? "Punto de recogida *"
                    : form.deliveryChannel === "seller"
                      ? "Lugar de entrega *"
                      : "Dirección de envío *"
                }
                value={form.deliveryAddress}
                onChangeText={updateDeliveryAddress}
                placeholder="Dirección, localidad o punto acordado"
                error={errors.deliveryAddress}
                focusOnError={firstError === "deliveryAddress"}
              />

              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Usar mi ubicación precisa"
                accessibilityState={{ disabled: locating, busy: locating }}
                style={styles.locationButton}
                onPress={() => void fillCurrentLocation()}
                disabled={locating}
              >
                {locating ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <>
                    <Navigation size={18} color={colors.primary} />
                    <Text style={styles.locationButtonText}>Usar mi ubicación</Text>
                  </>
                )}
              </TouchableOpacity>

              <Field
                label="Instrucciones de entrega"
                value={form.deliveryNotes}
                onChangeText={(value) => updateField("deliveryNotes", value)}
                placeholder="Horario, contacto, acceso, embalaje u otras indicaciones"
                multiline
              />
            </View>
          ) : (
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Resumen confirmado</Text>
                {status === "ready" ? (
                  <TouchableOpacity style={styles.editButton} onPress={() => setEditing(true)}>
                    <Text style={styles.editButtonText}>Editar ficha</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <SummaryRow label="Producto" value={data.extracted.productName} />
              <SummaryRow label="Cantidad" value={quantityText} />
              <SummaryRow label="Precio objetivo" value={priceText} />
              <SummaryRow label="Proveedor" value={data.extracted.supplier} />
              <SummaryRow label="Cuándo" value={data.extracted.deliveryWindow} />
              <SummaryRow
                label="Entendido"
                value={data.extracted.structuredDeliveryWindow?.label}
              />
              <SummaryRow
                label="Modalidad"
                value={deliveryChannelLabel(channelFromFields(data.extracted))}
              />
              <SummaryRow label="Lugar" value={data.extracted.deliveryAddress} />
              <SummaryRow label="Indicaciones" value={data.extracted.deliveryNotes} />
            </View>
          )}



          {status === "ready" && !editing ? (
            <View style={styles.launchBand}>
              <Text style={styles.launchTitle}>La ficha aún no está publicada</Text>
              <Text style={styles.launchText}>
                Al lanzarla, los vendedores podrán responder y todas sus propuestas aparecerán juntas en esta ficha.
              </Text>
              {publicationCardRequired ? (
                <View style={styles.paymentCard}>
                  <View style={styles.paymentHeading}>
                    <View style={styles.paymentIcon}>
                      {paymentProfile?.ready ? (
                        <ShieldCheck size={22} color="#16734A" />
                      ) : (
                        <CreditCard size={22} color={colors.primary} />
                      )}
                    </View>
                    <View style={styles.paymentCopy}>
                      <Text style={styles.paymentTitle}>
                        {paymentProfile?.ready
                          ? "Tarjeta verificada"
                          : "Formaliza tu petición"}
                      </Text>
                      <Text style={styles.paymentText}>
                        {paymentProfile?.ready
                          ? `${paymentProfile.card?.brand || "Tarjeta"} terminada en ${paymentProfile.card?.last4 || "••••"}. No se cobra nada al publicar.`
                          : "Stripe verifica tu tarjeta. Publicar no genera ningún cobro; pagarás solo después de aceptar una oferta y su importe exacto."}
                      </Text>
                    </View>
                  </View>
                  {!paymentProfile?.ready ? (
                    <>
                      <TouchableOpacity
                        style={styles.consentRow}
                        onPress={() => setCardConsent((value) => !value)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: cardConsent }}
                      >
                        <View style={[styles.checkbox, cardConsent && styles.checkboxChecked]}>
                          {cardConsent ? <Check size={15} color="#FFFFFF" /> : null}
                        </View>
                        <Text style={styles.consentText}>
                          Autorizo a guardar este método de pago para formalizar operaciones que yo confirme en Allwain.
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.cardButton, (!cardConsent || busy === "card") && styles.disabledButton]}
                        disabled={!cardConsent || busy === "card"}
                        onPress={() => void startCardSetup()}
                      >
                        <CreditCard size={18} color="#FFFFFF" />
                        <Text style={styles.cardButtonText}>
                          {busy === "card" ? "Abriendo Stripe…" : "Añadir tarjeta"}
                        </Text>
                      </TouchableOpacity>
                      {paymentProfile?.status === "setup_pending" ? (
                        <TouchableOpacity
                          style={styles.refreshButton}
                          onPress={() => void refreshPaymentProfile()}
                        >
                          <RefreshCw size={17} color={colors.primary} />
                          <Text style={styles.refreshButtonText}>Ya he terminado en Stripe</Text>
                        </TouchableOpacity>
                      ) : null}
                    </>
                  ) : null}
                </View>
              ) : (
                <View style={styles.paymentCard}>
                  <View style={styles.paymentHeading}>
                    <View style={styles.paymentIcon}>
                      <ShieldCheck size={22} color="#16734A" />
                    </View>
                    <View style={styles.paymentCopy}>
                      <Text style={styles.paymentTitle}>Publica sin tarjeta</Text>
                      <Text style={styles.paymentText}>
                        No necesitas añadir un método de pago para publicar. Se solicitará cuando confirmes una compra, reserva o pedido recurrente.
                      </Text>
                    </View>
                  </View>
                </View>
              )}

            </View>
          ) : null}

          {["submitted", "awarded", "closed", "canceled", "archived"].includes(status) ? (
            <View style={styles.offersSection}>
              <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled:Boolean(busy) || refreshLoading || proposalLoading }} disabled={Boolean(busy) || refreshLoading || proposalLoading} style={styles.refreshButton} onPress={() => void loadRequest({preserveEdits:true,silent:true,preserveProposals:true})}>
                <RefreshCw size={17} color={colors.primary} /><Text style={styles.refreshButtonText}>{continuityCopy.refresh}</Text>
              </TouchableOpacity>
              {refreshLoading ? <ActivityIndicator color={colors.primary} /> : null}
              <Text style={styles.sectionTitle}>
                {workCopy.proposals} ({proposalSummary?.total ?? "—"})
              </Text>
              {proposalSummary ? <Text style={styles.sectionHint}>{workCopy.active}: {proposalSummary.active} · {workCopy.all}: {proposalSummary.total}</Text> : null}
              <Text style={styles.sectionHint}>
                {proposalError ? workCopy.error : proposalLoading || refreshLoading ? lifecycle.busy : proposalSummary?.total
                  ? status === "submitted"
                    ? "Compáralas y elige la que prefieras. Precio, cantidad y vendedor quedan vinculados a esta petición."
                    : "Conservamos la propuesta elegida y las no seleccionadas para que puedas reconstruir la decisión."
                  : status === "submitted"
                    ? "Aún no has recibido propuestas. La petición sigue activa."
                    : "Esta petición terminó sin propuestas."}
              </Text>

              {chosenProposal ? <OrderCard title={workCopy.selected} meta={`${chosenProposal.title}${typeof chosenProposal.price === "number" ? ` · ${formatCurrency(chosenProposal.price)}` : ""}`} actionLabel={lifecycle.orders} onPress={() => void openRequestOrder()} /> : null}
              {proposalLoading ? <ActivityIndicator color={colors.primary} /> : null}
              {proposalError ? <View accessibilityLiveRegion="polite"><Text accessibilityRole="alert" style={styles.errorText}>{proposalError}</Text><TouchableOpacity accessibilityRole="button" style={styles.secondaryButton} onPress={() => setProposalRefresh(value => value + 1)}><Text style={styles.secondaryButtonText}>{workCopy.retry}</Text></TouchableOpacity></View> : null}

              {proposalSummary?.total === 0 && !proposalLoading && !refreshLoading && !proposalError ? (
                <DemoCard
                  title="Así aparecerá una propuesta"
                  meta="Vendedor verificado · Precio y entrega"
                  detail="Cuando llegue la primera, podrás compararla aquí sin salir de tu petición. Esta tarjeta no es una oferta real."
                  leading={<Boxes size={20} color={colors.primary} />}
                />
              ) : null}

              {status === "submitted" ? <View style={styles.segmentedControl}>{(["active", "history", "all"] as const).map(value => <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: effectiveView === value }} style={[styles.segment, effectiveView === value && styles.segmentSelected]} onPress={() => { resetProposalPage(); setProposalView(value); }}><Text style={[styles.segmentText, effectiveView === value && styles.segmentTextSelected]}>{workCopy[value]}</Text></TouchableOpacity>)}</View> : null}
              {(proposalSummary?.total || 0) > 1 ? (
                <View style={styles.segmentedControl}>
                  {([
                    ["price", workCopy.price],
                    ["rating", workCopy.rating],
                    ["newest", workCopy.newest],
                  ] as const).map(([value, label]) => (
                    <TouchableOpacity
                      key={value}
                      style={[
                        styles.segment,
                        offerSort === value && styles.segmentSelected,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: offerSort === value }}
                      onPress={() => { resetProposalPage(); setOfferSort(value); }}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          offerSort === value && styles.segmentTextSelected,
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              {sortedOffers.map((offer) => {
                const offerBusy = busy === offer.id;
                const selected = data.selectedOfferId === offer.id;
                const proposalExpiry =
                  offer.proposalExpiresAt ||
                  (typeof offer.meta?.validUntil === "string"
                    ? offer.meta.validUntil
                    : null);
                const proposalExpired = Boolean(
                  proposalExpiry && new Date(proposalExpiry).getTime() <= Date.now(),
                );
                return (
                  <View key={offer.id} style={styles.offerCard}>
                    <View style={styles.offerIntro}>
                      <View style={styles.offerImageFrame}>
                        <PublicationImage
                          imageUrl={typeof offer.meta?.imageUrl === "string" ? offer.meta.imageUrl : null}
                          imageAlt={typeof offer.meta?.imageAlt === "string" ? offer.meta.imageAlt : offer.title}
                          illustrative={offer.meta?.imageIllustrative === true}
                        />
                      </View>
                      <View style={styles.offerIntroCopy}>
                        <View style={styles.offerHeading}>
                          <Text style={styles.offerTitle}>{offer.title}</Text>
                          {typeof offer.price === "number" ? (
                            <Text style={styles.offerPrice}>{formatCurrency(offer.price)}</Text>
                          ) : null}
                        </View>
                        {offer.provider?.name ? (
                          <Text style={styles.providerText}>
                            {offer.provider.name}
                            {offer.provider.reviewCount
                              ? ` · ${Number(offer.provider.score || 0).toFixed(1)}/5 (${offer.provider.reviewCount})`
                              : " · Sin opiniones todavía"}
                          </Text>
                        ) : null}
                        <Text style={styles.providerText}>
                          {selected
                            ? "Elegida"
                            : offer.allwainStatus === "not_selected"
                              ? "No seleccionada"
                              : offer.allwainStatus === "withdrawn"
                                ? "Retirada"
                                : typeof offer.meta?.deliveryEstimate === "string"
                                  ? `Entrega: ${offer.meta.deliveryEstimate}`
                                  : "Propuesta disponible"}
                        </Text>
                      </View>
                    </View>
                    {offer.description ? <Text style={styles.offerDescription}>{offer.description}</Text> : null}
                    <ProposalCountdown expiresAt={proposalExpiry} compact />
                    {offer.provider?.id && offer.provider.id !== userId ? (
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={`Enviar mensaje privado a ${offer.provider.name || "este vendedor"}`}
                        style={styles.privateMessageAction}
                        onPress={() =>
                          navigation.navigate("ChatThread", {
                            targetUserId: offer.provider?.id,
                            targetName: offer.provider?.name || "Vendedor Allwain",
                            title: "Mensaje privado",
                          })
                        }
                      >
                        <MessageCircle size={18} color={colors.primary} />
                        <Text style={styles.privateMessageText}>Enviar mensaje privado</Text>
                      </TouchableOpacity>
                    ) : null}
                    {status !== "submitted" || proposalExpired || !["active", undefined, null].includes(offer.allwainStatus) ? null : typeof offer.price !== "number" ? (
                    <View style={styles.offerActions}>
                      <TouchableOpacity
                        style={styles.offerSecondaryButton}
                        onPress={() => registerInterest(offer.id)}
                        disabled={offerBusy || proposalLoading || refreshLoading}
                      >
                        <Text style={styles.offerSecondaryText}>Me interesa</Text>
                      </TouchableOpacity>
                    </View>
                    ) : expandedOffer !== offer.id ? (
                      <TouchableOpacity accessibilityRole="button" style={styles.offerSecondaryButton} disabled={Boolean(busy)} onPress={() => setExpandedOffer(offer.id)}><Text style={styles.offerSecondaryText}>{workCopy.review}</Text></TouchableOpacity>
                    ) : (
                      <OfferOrderForm
                        offer={offer}
                        busy={offerBusy || proposalLoading || refreshLoading}
                        initialDelivery={{
                          deliveryMethod: form.deliveryMethod || "shipping",
                          deliveryChannel:
                            form.deliveryChannel ||
                            channelFromFields(data.extracted) ||
                            "carrier",
                          deliveryAddress: form.deliveryAddress,
                          deliveryNotes: form.deliveryNotes,
                          deliveryWindow: form.structuredDeliveryWindow,
                        }}
                        onSubmit={(quantity, delivery) =>
                          requestOffer(offer, quantity, delivery)
                        }
                        requireRecurringConsent
                      />
                    )}
                  </View>
                );
              })}

              {activeProposalPage ? <View style={styles.segmentedControl}>
                <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: proposalIndex === 0 || proposalLoading }} style={styles.segment} disabled={proposalIndex === 0 || proposalLoading} onPress={() => { proposalGate.current.invalidate(); setProposalResult(null); setProposalIndex(index => Math.max(0, index - 1)); }}><Text style={styles.segmentText}>{workCopy.previous}</Text></TouchableOpacity>
                <Text style={styles.segmentText}>{workCopy.page} {proposalIndex + 1}</Text>
                <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: !activeProposalPage.pageInfo.hasNextPage || proposalLoading }} style={styles.segment} disabled={!activeProposalPage.pageInfo.hasNextPage || proposalLoading} onPress={() => { const cursor = activeProposalPage.pageInfo.nextCursor; if (!cursor) return; proposalGate.current.invalidate(); setProposalResult(null); setProposalCursors(cursors => [...cursors.slice(0, proposalIndex + 1), cursor]); setProposalIndex(index => index + 1); }}><Text style={styles.segmentText}>{workCopy.next}</Text></TouchableOpacity>
              </View> : null}

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => navigation.navigate("MainTabs", { screen: "Ofertas" })}
              >
                <Text style={styles.secondaryButtonText}>Ver ofertas y acuerdos</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </ScrollView>
        {(status === "draft" || editing || status === "ready") ? <View style={{paddingHorizontal:18,paddingTop:8,paddingBottom:footerPaddingBottom,backgroundColor:colors.card,borderTopWidth:1,borderColor:colors.cardBorder}}>
          {screenError ? <Text accessibilityRole="alert" style={styles.errorText}>{Object.values(errors).filter(Boolean).join(" · ") || screenError}</Text> : null}
                    {status === "draft" || editing ? (
            <View style={styles.actionStack}>
              <TouchableOpacity
                style={[styles.primaryButton, busy && styles.disabledButton]}
                disabled={Boolean(busy)}
                onPress={confirmSheet}
              >
                <Text style={styles.primaryButtonText}>
                  {busy === "confirm" ? "Confirmando…" : "Confirmar ficha"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryButton, busy && styles.disabledButton]}
                disabled={Boolean(busy)}
                onPress={saveDraft}
              >
                <Text style={styles.secondaryButtonText}>
                  {busy === "save" ? "Guardando…" : "Guardar y continuar después"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {status === "ready" && !editing ? (              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  (busy ||
                    (publicationCardRequired && !paymentProfile?.ready)) &&
                    styles.disabledButton,
                ]}
                disabled={
                  Boolean(busy) ||
                  (publicationCardRequired && !paymentProfile?.ready)
                }
                onPress={launchRequest}
              >
                <Text style={styles.primaryButtonText}>
                  {busy === "launch" ? "Lanzando…" : "Lanzar petición"}
                </Text>
              </TouchableOpacity>) : null}
        </View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: "#FFFFFF" },
  container: { flex: 1, backgroundColor: "#F5F7F6" },
  content: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    padding: 16,
    paddingBottom: 44,
    gap: 14,
  },
  topBar: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E7E5",
    backgroundColor: "#FFFFFF",
  },
  topBarTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  backButton: { minWidth: 58, minHeight: 40, justifyContent: "center" },
  backButtonText: { color: colors.primary, fontWeight: "800" },
  homeButton: { minWidth: 58, minHeight: 40, justifyContent: "center", alignItems: "flex-end" },
  homeButtonText: { color: colors.mutedText, fontWeight: "800" },
  loading: {
    flex: 1,
    backgroundColor: "#F5F7F6",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 12,
  },
  loadingTitle: { color: colors.text, fontSize: 20, fontWeight: "900", textAlign: "center" },
  loadingText: { color: colors.mutedText, fontWeight: "600", textAlign: "center", lineHeight: 21 },
  progress: {
    flexDirection: "row",
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E7E5",
    borderRadius: 8,
  },
  step: { flex: 1, minHeight: 58, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#BCC5C2",
    backgroundColor: "#FFFFFF",
  },
  stepNumberDone: { backgroundColor: "#1F755A", borderColor: "#1F755A" },
  stepNumberActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepNumberText: { color: "#6D7774", fontWeight: "900", fontSize: 12 },
  stepNumberTextActive: { color: "#FFFFFF" },
  stepLabel: { marginTop: 5, color: "#6D7774", fontWeight: "700", fontSize: 11, textAlign: "center" },
  stepLabelActive: { color: colors.text },
  headingBlock: { gap: 5 },
  title: { color: colors.text, fontSize: 24, fontWeight: "900" },
  subtitle: { color: colors.mutedText, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  aiBand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 8,
    backgroundColor: "#EAF4F0",
    borderWidth: 1,
    borderColor: "#CBE3DA",
  },
  aiBandCopy: { flex: 1, gap: 3 },
  aiBandTitle: { color: "#175A46", fontWeight: "900", fontSize: 14 },
  aiBandText: { color: "#315E51", fontWeight: "600", lineHeight: 19 },
  confidenceBadge: { minWidth: 64, alignItems: "center" },
  confidenceValue: { color: "#175A46", fontWeight: "900", fontSize: 20 },
  confidenceLabel: { color: "#55786E", fontWeight: "700", fontSize: 10 },
  warningBand: {
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#D89D2B",
    backgroundColor: "#FFF8E8",
    borderRadius: 6,
    gap: 3,
  },
  warningTitle: { color: "#745112", fontWeight: "900" },
  warningText: { color: "#745E32", fontWeight: "600", lineHeight: 19 },
  screenError: {
    color: colors.danger,
    backgroundColor: "#FFF0EE",
    borderWidth: 1,
    borderColor: "#F3C6BF",
    borderRadius: 6,
    padding: 11,
    fontWeight: "700",
    lineHeight: 19,
  },
  notice: {
    color: "#175A46",
    backgroundColor: "#EAF4F0",
    borderWidth: 1,
    borderColor: "#CBE3DA",
    borderRadius: 6,
    padding: 11,
    fontWeight: "700",
    lineHeight: 19,
  },
  section: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E7E5",
    borderRadius: 8,
    padding: 14,
    gap: 12,
  },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "900" },
  sectionHint: { color: colors.mutedText, fontSize: 13, fontWeight: "600", lineHeight: 18 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  fieldGroup: { flex: 1, gap: 5 },
  label: { color: colors.text, fontWeight: "800", fontSize: 13 },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#C9D1CE",
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  textArea: { minHeight: 92 },
  inputError: { borderColor: colors.danger, backgroundColor: "#FFF9F8" },
  errorText: { color: colors.danger, fontWeight: "700", fontSize: 12, lineHeight: 16 },
  formRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  formWide: { flex: 1.4 },
  formNarrow: { flex: 1 },
  formHalf: { flex: 1 },
  unitDecision: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: "#C9D1CE",
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#FFFFFF",
  },
  unitDecisionText: {
    flex: 1,
    color: colors.text,
    fontWeight: "800",
    fontSize: 13,
    lineHeight: 16,
  },
  intelligenceHint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 2,
  },
  intelligenceHintText: {
    flex: 1,
    color: colors.mutedText,
    fontWeight: "600",
    fontSize: 12,
    lineHeight: 17,
  },
  unitOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  currencyOptions: { gap: 7 },
  currencyOption: {
    minHeight: 40,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#C9D1CE",
    borderRadius: 7,
    paddingHorizontal: 11,
    backgroundColor: "#FFFFFF",
  },
  unitOption: {
    minHeight: 40,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#C9D1CE",
    borderRadius: 7,
    paddingHorizontal: 11,
    backgroundColor: "#FFFFFF",
  },
  unitOptionActive: {
    borderColor: colors.primary,
    backgroundColor: "#FFF4F1",
  },
  unitOptionText: { color: colors.text, fontWeight: "800", fontSize: 12 },
  unitOptionTextActive: { color: colors.primary },
  locationButton: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 7,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  locationButtonText: { color: colors.primary, fontWeight: "900" },
  understandingCard: {
    minHeight: 76,
    borderWidth: 1,
    borderColor: "#CBE3DA",
    borderRadius: 8,
    backgroundColor: "#F1FAF6",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 11,
  },
  understandingIcon: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  understandingCopy: { flex: 1, minWidth: 0, gap: 2 },
  understandingKicker: {
    color: "#55786E",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  understandingTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18,
  },
  understandingText: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
  },
  understandingScore: {
    color: "#175A46",
    fontSize: 12,
    fontWeight: "900",
  },
  detectedDetails: {
    borderTopWidth: 1,
    borderTopColor: "#E2E7E5",
    paddingTop: 13,
    gap: 10,
  },
  detectedDetailsHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  detectedDetailsCopy: { flex: 1, gap: 3 },
  detectedDetailsTitle: { color: colors.text, fontSize: 14, fontWeight: "900" },
  detectedDetailsHint: { color: colors.mutedText, fontSize: 12, fontWeight: "600", lineHeight: 17 },
  detailsToggle: { color: colors.primary, fontSize: 13, fontWeight: "900", paddingVertical: 2 },
  detectedSummary: { gap: 0 },
  detectedEditFields: { gap: 10 },
  segmentedControl: {
    flexDirection: "row",
    padding: 3,
    borderRadius: 8,
    backgroundColor: "#EEF1F0",
    borderWidth: 1,
    borderColor: "#D8DEDC",
    gap: 3,
  },
  segment: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 6, paddingHorizontal: 4 },
  segmentSelected: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: colors.primary },
  segmentText: { color: "#65706D", fontWeight: "800", fontSize: 12, textAlign: "center" },
  segmentTextSelected: { color: colors.primary },
  summaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF1F0",
  },
  summaryLabel: { color: colors.mutedText, fontWeight: "700", fontSize: 13, flex: 0.8 },
  summaryValue: { color: colors.text, fontWeight: "800", fontSize: 13, textAlign: "right", flex: 1.2 },
  editButton: { minHeight: 38, justifyContent: "center", paddingHorizontal: 8 },
  editButtonText: { color: colors.primary, fontWeight: "900", fontSize: 13 },
  actionStack: { gap: 9 },
  primaryButton: {
    minHeight: 50,
    borderRadius: 8,
    backgroundColor: colors.button,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  primaryButtonText: { color: colors.buttonText, fontWeight: "900", fontSize: 15 },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#C9D1CE",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  secondaryButtonText: { color: colors.text, fontWeight: "900", fontSize: 14, textAlign: "center" },
  disabledButton: { opacity: 0.55 },
  textButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12 },
  textButtonLabel: { color: colors.primary, fontWeight: "900" },
  launchBand: {
    backgroundColor: "#172F2A",
    borderRadius: 8,
    padding: 16,
    gap: 9,
  },
  launchTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },
  launchText: { color: "#DCE9E5", fontWeight: "600", lineHeight: 20 },
  paymentCard: {
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    padding: 13,
    gap: 11,
  },
  paymentHeading: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  paymentIcon: {
    width: 38,
    height: 38,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F2F6F4",
  },
  paymentCopy: { flex: 1, minWidth: 0, gap: 3 },
  paymentTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  paymentText: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
  },
  consentRow: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "#9BA7A3",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  consentText: {
    flex: 1,
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  cardButton: {
    minHeight: 46,
    borderRadius: 7,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  cardButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  refreshButton: {
    minHeight: 42,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  refreshButtonText: { color: colors.primary, fontSize: 13, fontWeight: "900" },
  offersSection: { gap: 11 },
  offerCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E7E5",
    borderRadius: 8,
    padding: 14,
    gap: 8,
  },
  offerIntro: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  offerImageFrame: { width: 84, height: 68, borderRadius: 7, overflow: "hidden" },
  offerIntroCopy: { flex: 1, minWidth: 0, gap: 5 },
  offerHeading: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  offerTitle: { flex: 1, color: colors.text, fontWeight: "900", fontSize: 16 },
  offerPrice: { color: "#175A46", fontWeight: "900", fontSize: 14 },
  providerText: { color: colors.mutedText, fontWeight: "700", fontSize: 12 },
  offerDescription: { color: colors.mutedText, fontWeight: "600", lineHeight: 19 },
  privateMessageAction: {
    minHeight: 44,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  privateMessageText: { color: colors.primary, fontWeight: "900", fontSize: 13 },
  offerActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  offerSecondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#C9D1CE",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  offerSecondaryText: { color: colors.text, fontWeight: "900", fontSize: 13 },
  offerPrimaryButton: {
    flex: 1.2,
    minHeight: 44,
    borderRadius: 7,
    backgroundColor: colors.button,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  offerPrimaryText: { color: colors.buttonText, fontWeight: "900", fontSize: 13, textAlign: "center" },
});
