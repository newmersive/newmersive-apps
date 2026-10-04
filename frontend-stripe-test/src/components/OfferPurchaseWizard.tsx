import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AccessibilityInfo,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
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
  ArrowLeft,
  Building2,
  Handshake,
  MapPin,
  Star,
  Store,
  Truck,
  UserRound,
  X,
} from "lucide-react-native";

import type {
  AllwainCarrierQuote,
  AllwainOffer,
  StructuredRecurringOrder,
} from "../config/api";
import { RecipientFields, type OfferDeliveryDraft } from "./OfferOrderForm";
import {
  BigActionButton,
  PublicationImage,
  SimpleStepper,
} from "./design-system";
import { colors } from "../theme/colors";
import { formatCurrency } from "../utils/format";
import { getAllwainCurrentLocation } from "../utils/currentLocation";
import { interpretDeliveryWindow } from "../utils/deliveryIntelligence";
import {
  calculateAllwainCheckoutPreview,
  getAllwainDeliveryPricing,
  getAllwainDeliveryOption,
} from "../utils/deliveryPricing";
import BuyerBusinessProfilePanel from "./BuyerBusinessProfilePanel";
import CarrierQuoteSelector from "./CarrierQuoteSelector";
import {
  isPinnedOrangesOffer,
  ORANGES_ILLUSTRATIVE_IMAGE,
} from "../data/demoOffers";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppTranslation } from "../i18n/useAppTranslation";
import { useAuthStore } from "../store/auth.store";
import { loadPurchaseDetails, recipientIssue, recipientSummary } from "../utils/purchaseDelivery";
import { purchaseDraftStore } from "../utils/purchaseDraft";
import { AppAlert } from "../utils/appAlert";

function metaNumber(offer: AllwainOffer, key: string) {
  const value = offer.meta?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metaText(offer: AllwainOffer, key: string) {
  const value = offer.meta?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export default function OfferPurchaseWizard({
  offer,
  visible,
  busy,
  onClose,
  onSubmit,
  onOpenReputation,
  requireRecurringConsent = true,
  stripeTestMode = false,
  error,
  onClearError,
}: {
  offer: AllwainOffer | null;
  visible: boolean;
  busy: boolean;
  onClose: () => void;
  onOpenReputation?: (userId: string) => void;
  requireRecurringConsent?: boolean;
  stripeTestMode?: boolean;
  error?: string | null;
  onClearError?: () => void;
  onSubmit: (
    offer: AllwainOffer,
    quantity: number,
    delivery: OfferDeliveryDraft,
    purchaseKey: string,
  ) => Promise<boolean>;
}) {
  const { locale, t } = useAppTranslation();
  const user = useAuthStore((state) => state.user);
  const scope = `${user?.id || ""}:${offer?.id || ""}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const scrollRef = useRef<ScrollView>(null);
  const headingRef = useRef<Text>(null);
  const submitLock = useRef(false);
  const finished = useRef(false);
  const [initializedScope, setInitializedScope] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [showTestDetails, setShowTestDetails] = useState(false);
  const [savingExit, setSavingExit] = useState(false);
  const [recipientValidation, setRecipientValidation] = useState<ReturnType<typeof recipientIssue>>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const [viewportHeight, setViewportHeight] = useState<number | undefined>(undefined);
  const [step, setStep] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [delivery, setDelivery] = useState<OfferDeliveryDraft>({
    buyerCapacity: "consumer",
    deliveryMethod: "shipping",
    deliveryChannel: "local_connector",
    deliveryAddress: "",
    deliveryPostalCode: "",
    deliveryCity: "",
    deliveryCountryCode: "ES",
    deliveryPhone: "",
    deliveryNotes: "",
    deliveryWindow: null,
    recurringOrder: null,
    commercialTermsAccepted: false,
    recurringMandateAccepted: false,
  });
  const [validation, setValidation] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [buyerBusinessReady, setBuyerBusinessReady] = useState(false);
  const [purchaseKey, setPurchaseKey] = useState("");
  const totalSteps = delivery.buyerCapacity === "business" ? 6 : 5;

  const unit = offer ? metaText(offer, "unit") || "unidad" : "unidad";
  const minQuantity = offer ? metaNumber(offer, "minQuantity") || 1 : 1;
  const quantityStep = offer ? metaNumber(offer, "quantityStep") || 1 : 1;
  const availableQuantity = offer
    ? metaNumber(offer, "availableQuantity")
    : null;
  const maxQuantity = availableQuantity ?? Number.MAX_SAFE_INTEGER;
  const quantityValid = Number.isFinite(quantity) && quantity >= minQuantity && quantity <= maxQuantity &&
    Math.abs((quantity - minQuantity) / quantityStep - Math.round((quantity - minQuantity) / quantityStep)) < 0.000001;
  const quoteContext = JSON.stringify([scope, quantity, delivery.deliveryAddress, delivery.deliveryPostalCode, delivery.deliveryCity, delivery.deliveryCountryCode, delivery.deliveryPhone]);
  const quoteContextRef = useRef(quoteContext);
  quoteContextRef.current = quoteContext;
  const isDemoOffer =
    offer?.meta?.demo === true && offer.meta?.checkoutEnabled === false;
  const isPlatformDirect = offer?.commercialModel === "platform_direct";
  const isShoppingList = offer?.meta?.proposalKind === "shopping_list";
  const shoppingListItems = useMemo(() => {
    const value = offer?.meta?.shoppingListItems;
    return Array.isArray(value)
      ? (value.filter(
          (item) => item && typeof item === "object",
        ) as Record<string, unknown>[])
      : [];
  }, [offer]);

  useEffect(() => {
    if (!visible || !offer) return;
    let active = true;
    const openingScope = scope;
    const accountId = user?.id;
    setInitializedScope(null);
    setExitOpen(false);
    setSubmitting(false);
    setSavingExit(false);
    setLocating(false);
    setRecipientValidation(null);
    setStorageError(null);
    setDraftNotice(null);
    setShowTestDetails(false);
    finished.current = false;
    submitLock.current = false;
    const defaults =
      offer.meta?.shoppingListDefaults &&
      typeof offer.meta.shoppingListDefaults === "object" &&
      !Array.isArray(offer.meta.shoppingListDefaults)
        ? (offer.meta.shoppingListDefaults as Record<string, unknown>)
        : {};
    const preferredChannel = ["local_connector", "carrier", "seller", "pickup"].includes(
      String(defaults.preferredDeliveryChannel || ""),
    )
      ? (String(defaults.preferredDeliveryChannel) as OfferDeliveryDraft["deliveryChannel"])
      : "local_connector";
    const addressValue = defaults.deliveryAddress;
    const defaultAddress =
      typeof addressValue === "string"
        ? addressValue
        : addressValue &&
            typeof addressValue === "object" &&
            typeof (addressValue as any).formatted === "string"
          ? (addressValue as any).formatted
          : "";
    const defaultWindow =
      defaults.deliveryWindow && typeof defaults.deliveryWindow === "object"
        ? (defaults.deliveryWindow as OfferDeliveryDraft["deliveryWindow"])
        : null;
    const defaultRecurrence =
      defaults.recurrence &&
      typeof defaults.recurrence === "object" &&
      (defaults.recurrence as any).enabled === true
        ? (defaults.recurrence as StructuredRecurringOrder)
        : null;
    const initialDelivery: OfferDeliveryDraft = {
      deliveryRecipientName: user?.name || "",
      deliveryEmail: user?.email || "",
      deliveryUnit: "",
      deliveryDetailsConfirmed: false,
      saveDeliveryDetails: false,
      buyerCapacity: "consumer",
      deliveryMethod:
        preferredChannel === "pickup"
          ? "pickup"
          : preferredChannel === "seller"
            ? "in_person"
            : "shipping",
      deliveryChannel: preferredChannel,
      deliveryAddress: defaultAddress,
      deliveryPostalCode: "",
      deliveryCity: "",
      deliveryCountryCode: "ES",
      deliveryPhone: "",
      deliveryNotes: "",
      deliveryWindow: defaultWindow,
      recurringOrder: defaultRecurrence,
      deliveryLatitude: undefined,
      deliveryLongitude: undefined,
      commercialTermsAccepted: false,
      recurringMandateAccepted: false,
    };
    setValidation(null);
    setBuyerBusinessReady(false);
    void (async () => {
      const [saved, profile] = await Promise.allSettled([
        accountId ? purchaseDraftStore.read(accountId, offer.id) : Promise.resolve({ draft: null }),
        accountId ? loadPurchaseDetails() : Promise.resolve(null),
      ]);
      if (!active || scopeRef.current !== openingScope) return;
      const recovery = saved.status === "fulfilled" ? saved.value : null;
      const draft = recovery?.draft;
      const details = profile.status === "fulfilled" ? profile.value : null;
      const startingDelivery = { ...initialDelivery, ...details, ...(defaultAddress ? { deliveryAddress: defaultAddress } : {}), ...(draft?.delivery || {}), commercialTermsAccepted: false, recurringMandateAccepted: false, deliveryDetailsConfirmed: false, saveDeliveryDetails: false };
      setDelivery(startingDelivery);
      setQuantity(draft?.quantity || minQuantity);
      // A restored quote may have expired; recheck the recipient and shipping step.
      setStep(draft ? Math.min(draft.step, 3) : 1);
      setPurchaseKey(draft?.purchaseKey || `allwain:${offer.id}:${Date.now()}:${Math.random().toString(36).slice(2, 12)}`);
      setStorageError(recovery && "error" in recovery ? recovery.error || null : null);
      setDraftNotice(draft ? "Hemos recuperado tu compra. Revisa los datos; las autorizaciones se vuelven a confirmar." : null);
      setProfileNotice(profile.status === "rejected" ? "No pudimos recuperar tus datos guardados. Puedes escribirlos o volver a intentarlo." : details ? "Tus datos guardados están rellenados. Puedes cambiarlos para esta compra." : null);
      setInitializedScope(openingScope);
    })();
    return () => { active = false; };
  }, [offer?.id, user?.id, visible]);

  useEffect(() => {
    const viewport = Platform.OS === "web" ? (globalThis as any).visualViewport : null;
    if (!viewport) return;
    const update = () => setViewportHeight(viewport.height);
    update();
    viewport.addEventListener("resize", update);
    return () => viewport.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (!visible || initializedScope !== scope || finished.current || !user?.id || !offer) return;
    const savingScope = scope;
    const timer = setTimeout(() => {
      if (finished.current || scopeRef.current !== savingScope) return;
      void purchaseDraftStore.save(user.id, offer.id, { quantity, step, delivery, purchaseKey }).then((result) => {
        if (scopeRef.current === savingScope && !result.saved) setStorageError(result.error || "No se ha podido guardar el borrador.");
      });
    }, 450);
    return () => clearTimeout(timer);
  }, [visible, initializedScope, scope, quantity, step, delivery, purchaseKey]);

  useEffect(() => {
    if (!visible || initializedScope !== scope) return;
    Keyboard.dismiss();
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      if (Platform.OS === "web") (headingRef.current as any)?.focus?.();
      else AccessibilityInfo.announceForAccessibility(`Paso ${step} de ${totalSteps}`);
    }, 30);
    return () => clearTimeout(timer);
  }, [step, initializedScope, visible, scope]);

  const deliveryPricing = getAllwainDeliveryPricing(offer);
  const checkoutPreview = useMemo(
    () =>
      calculateAllwainCheckoutPreview({
        offer,
        quantity,
        deliveryChannel: delivery.deliveryChannel,
        carrierShippingAmount: delivery.carrierQuoteAmount,
      }),
    [delivery.carrierQuoteAmount, delivery.deliveryChannel, offer, quantity],
  );
  const currency = offer?.currency || deliveryPricing.currency || "EUR";

  if (!offer) return null;

  function nextFromAddress() {
    const issue = recipientIssue(delivery, delivery.deliveryChannel === "pickup");
    setRecipientValidation(issue);
    if (issue) { setValidation(issue.message); setFocusRequest((value) => value + 1); return; }
    if (
      delivery.deliveryChannel !== "pickup" &&
      !delivery.deliveryAddress.trim()
    ) {
      setValidation(t("purchase.errorAddress"));
      return;
    }
    if (delivery.deliveryChannel === "carrier") {
      if (!delivery.deliveryPostalCode?.trim() || !delivery.deliveryCity?.trim()) {
        setValidation(t("purchase.errorCarrierAddress"));
        return;
      }
      if (!delivery.carrierQuoteId) {
        setValidation(t("purchase.errorCarrierQuote"));
        return;
      }
    }
    setValidation(null);
    goToStep(4);
  }

  async function fillCurrentLocation() {
    const locatingScope = scope;
    setLocating(true);
    setValidation(null);
    try {
      const location = await getAllwainCurrentLocation({ preciseDelivery: true });
      if (scopeRef.current !== locatingScope) return;
      setDelivery((current) => ({
        ...current,
        deliveryDetailsConfirmed: false,
        recurringMandateAccepted: false,
        deliveryAddress: location.address || current.deliveryAddress,
        deliveryLatitude: location.latitude,
        deliveryLongitude: location.longitude,
        deliveryPostalCode: location.postalCode || current.deliveryPostalCode,
        deliveryCity: location.city || current.deliveryCity,
        deliveryCountryCode:
          location.countryCode || current.deliveryCountryCode || "ES",
        carrierQuoteId: undefined,
        carrierQuoteAmount: undefined,
        carrierQuoteLabel: undefined,
      }));
    } catch (error: any) {
      if (scopeRef.current === locatingScope) setValidation(error?.message || t("purchase.errorLocation"));
    } finally {
      if (scopeRef.current === locatingScope) setLocating(false);
    }
  }

  async function submit() {
    if (!purchaseKey || submitLock.current || busy || initializedScope !== scope || !user?.id) return;
    if (!quantityValid) { setValidation("Revisa la cantidad disponible y el incremento del producto."); goToStep(1); return; }
    const issue = recipientIssue(delivery, delivery.deliveryChannel === "pickup");
    if (issue || (delivery.deliveryChannel === "carrier" && !delivery.carrierQuoteId)) {
      goToStep(3); setRecipientValidation(issue); setValidation(issue?.message || t("purchase.errorCarrierQuote")); setFocusRequest((value) => value + 1); return;
    }
    if (!delivery.deliveryDetailsConfirmed) { setValidation("Confirma que has revisado el destinatario y la entrega."); return; }
    submitLock.current = true;
    setSubmitting(true);
    setValidation(null);
    onClearError?.();
    const submittingScope = scope;
    try {
      const completed = await onSubmit(offer!, quantity, delivery, purchaseKey);
      if (scopeRef.current !== submittingScope) return;
      if (completed) {
        finished.current = true;
        const cleared = await purchaseDraftStore.remove(user.id, offer!.id);
        if (scopeRef.current !== submittingScope) return;
        onClose();
        if (!cleared) AppAlert.alert("Pedido preparado", "No se pudo limpiar el borrador de este dispositivo. Tu pedido ya está preparado: continúa desde Mis pedidos.");
      }
    } catch (submitError: any) { if (scopeRef.current === submittingScope) setValidation(submitError?.message || "No pudimos preparar el pedido. Tu edición sigue aquí."); }
    finally { if (scopeRef.current === submittingScope) { submitLock.current = false; setSubmitting(false); } }
  }

  function goToStep(next: number) {
    setValidation(null);
    setRecipientValidation(null);
    onClearError?.();
    setStep(next);
  }

  function back() {
    if (busy || submitting || savingExit) return;
    if (initializedScope !== scope) { onClose(); return; }
    if (exitOpen) setExitOpen(false);
    else if (step > 1) goToStep(step - 1);
    else { Keyboard.dismiss(); setExitOpen(true); }
  }

  async function saveAndExit() {
    if (!user?.id || !offer || savingExit || busy || submitting) return;
    setSavingExit(true);
    const exitingScope = scope;
    const result = await purchaseDraftStore.save(user.id, offer.id, { quantity, step, delivery, purchaseKey });
    if (scopeRef.current !== exitingScope) return;
    setSavingExit(false);
    if (result.saved) { finished.current = true; onClose(); }
    else setStorageError(result.error || "No se ha podido guardar. Reintenta o descarta el borrador.");
  }

  async function discardAndExit() {
    if (!offer || savingExit || busy || submitting) return;
    if (!user?.id) { onClose(); return; }
    setSavingExit(true);
    finished.current = true;
    const exitingScope = scope;
    const removed = await purchaseDraftStore.remove(user.id, offer.id);
    if (scopeRef.current !== exitingScope) return;
    setSavingExit(false);
    if (removed) onClose();
    else { finished.current = false; setStorageError("No se ha podido eliminar el borrador guardado. Reintenta para descartarlo."); }
  }

  async function retrySavedDetails() {
    const currentScope = scope;
    setProfileNotice("Consultando tus datos guardados…");
    try {
      const details = await loadPurchaseDetails();
      if (scopeRef.current !== currentScope) return;
      if (details) setDelivery((current) => ({ ...current, ...details, carrierQuoteId: undefined, carrierQuoteAmount: undefined, carrierQuoteLabel: undefined, deliveryDetailsConfirmed: false, recurringMandateAccepted: false }));
      setProfileNotice(details ? "Datos recuperados. Revisa que correspondan a esta compra." : "Todavía no tienes datos guardados para próximas compras.");
    } catch { if (scopeRef.current === currentScope) setProfileNotice("No pudimos recuperar tus datos guardados. Puedes escribirlos o volver a intentarlo."); }
  }

  function updateRecurrence(interval: StructuredRecurringOrder["interval"] | null) {
    setDelivery((current) => ({
      ...current,
      recurringOrder: interval
        ? {
            enabled: true,
            interval,
            label:
              interval === "weekly"
                ? t("purchase.weekly")
                : interval === "biweekly"
                  ? t("purchase.biweekly")
                  : t("purchase.monthly"),
          }
        : null,
      recurringMandateAccepted: false,
    }));
  }

  function changeQuantity(next: number) {
    setQuantity(next);
    setDelivery((current) => ({
      ...current,
      recurringMandateAccepted: false,
      carrierQuoteId: undefined,
      carrierQuoteAmount: undefined,
      carrierQuoteLabel: undefined,
    }));
  }

  function updateCarrierAddress(patch: Partial<OfferDeliveryDraft>) {
    setDelivery((current) => ({
      ...current,
      ...patch,
      deliveryDetailsConfirmed: false,
      recurringMandateAccepted: false,
      carrierQuoteId: undefined,
      carrierQuoteAmount: undefined,
      carrierQuoteLabel: undefined,
    }));
  }

  function selectCarrierQuote(quote: AllwainCarrierQuote | null) {
    setDelivery((current) => ({
      ...current,
      carrierQuoteId: quote?.id,
      carrierQuoteAmount: quote?.amount,
      carrierQuoteLabel: quote
        ? `${quote.carrierName || t("purchase.carrierFallback")} · ${quote.serviceName}`
        : undefined,
    }));
    setValidation(null);
  }

  const deliveryLabel =
    delivery.deliveryChannel === "local_connector"
      ? t("purchase.deliveryLocalLabel")
      : delivery.deliveryChannel === "carrier"
        ? t("purchase.deliveryCarrierLabel")
        : delivery.deliveryChannel === "pickup"
          ? t("purchase.deliveryPickupLabel")
          : t("purchase.deliverySellerLabel");
  const sellerName = offer.provider?.name || t("purchase.sellerFallback");
  const preorderDeadline = metaText(offer, "preorderChargeDeadlineAt");
  const imageUrl = metaText(offer, "imageUrl");
  const isOrangesOffer = isPinnedOrangesOffer(offer);
  const productImage = isOrangesOffer
    ? ORANGES_ILLUSTRATIVE_IMAGE
    : imageUrl
      ? { uri: imageUrl }
      : null;
  const originLabel =
    offer.locationLabel || metaText(offer, "origin") || metaText(offer, "originRegion");
  const working = busy || submitting || savingExit;
  const finalStep = step === totalSteps;
  const nextDisabled = initializedScope !== scope || working ||
    (step === 1 && !quantityValid) ||
    (step === 2 && !getAllwainDeliveryOption(offer, delivery.deliveryChannel).available) ||
    (step === 5 && delivery.buyerCapacity === "business" && !buyerBusinessReady) ||
    (finalStep && !isDemoOffer && (!delivery.deliveryDetailsConfirmed ||
      Boolean(delivery.recurringOrder?.enabled && requireRecurringConsent && !delivery.recurringMandateAccepted)));
  function next() {
    if (nextDisabled) return;
    if (finalStep) { if (isDemoOffer) void discardAndExit(); else void submit(); }
    else if (step === 3) nextFromAddress();
    else goToStep(step + 1);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={back}>
      <SafeAreaView style={[styles.safeArea, viewportHeight ? { height: viewportHeight, maxHeight: viewportHeight, flexBasis: viewportHeight, flexGrow: 0, flexShrink: 0 } : undefined]}>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === "ios" ? "padding" : Platform.OS === "android" ? "height" : undefined}>
        <View style={styles.topBar}>
          <TouchableOpacity
            accessibilityLabel={
              step === 1 ? t("common.close") : t("common.back")
            }
            style={styles.iconButton}
            accessibilityRole="button"
            disabled={working}
            onPress={back}
          >
            {step === 1 ? (
              <X size={22} color={colors.text} />
            ) : (
              <ArrowLeft size={22} color={colors.text} />
            )}
          </TouchableOpacity>
          <Text style={styles.progress}>
            {t("purchase.progress", { step, total: totalSteps })}
          </Text>
          {step > 1 ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Guardar o descartar y salir" style={styles.iconButton} disabled={working} onPress={() => { Keyboard.dismiss(); setExitOpen(true); }}><X size={22} color={colors.text} /></TouchableOpacity> : <View style={styles.iconButton} />}
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${(step / totalSteps) * 100}%` },
            ]}
          />
        </View>

        <ScrollView
          testID="purchase-wizard-scroll"
          ref={scrollRef}
          style={styles.scroll}
          pointerEvents={busy || submitting ? "none" : "auto"}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {initializedScope !== scope ? <View style={styles.loadingPanel}><ActivityIndicator color={colors.primary} /><Text style={styles.helper}>Preparando tu compra…</Text></View> : exitOpen ? (
            <View style={styles.step}>
              <Text accessibilityRole="header" style={styles.title}>¿Continuamos después?</Text>
              <Text style={styles.helper}>El borrador queda asociado a tu cuenta y a este producto durante 4 horas. En la web se conserva en esta pestaña; en la app, en este dispositivo.</Text>
              {storageError ? <Text accessibilityRole="alert" style={styles.error}>{storageError}</Text> : null}
              <BigActionButton label="Guardar y salir" onPress={() => void saveAndExit()} busy={savingExit} />
              <BigActionButton label="Seguir con la compra" tone="light" onPress={() => setExitOpen(false)} disabled={savingExit} />
              <TouchableOpacity accessibilityRole="button" style={styles.discardButton} disabled={savingExit} onPress={() => void discardAndExit()}><Text style={styles.discardText}>Descartar borrador y salir</Text></TouchableOpacity>
            </View>
          ) : <>
          {draftNotice ? <Text style={styles.savedNotice}>{draftNotice}</Text> : null}
          <Text style={styles.offerName}>{offer.title}</Text>
          {isDemoOffer ? (
            <View style={styles.demoNotice}>
              <Text style={styles.demoNoticeTitle}>{t("purchase.demoTitle")}</Text>
              <Text style={styles.demoNoticeText}>
                {t("purchase.demoBody")}
              </Text>
            </View>
          ) : null}
          {stripeTestMode && !isDemoOffer ? (
            <View style={styles.testNotice}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={showTestDetails ? "Ocultar detalles de Stripe TEST" : "Ver detalles de Stripe TEST"} accessibilityState={{ expanded: showTestDetails }} style={styles.testNoticeToggle} onPress={() => setShowTestDetails((current) => !current)}>
                <Text style={styles.demoNoticeTitle}>Stripe TEST · Sin cargos reales</Text>
                <Text style={styles.testNoticeLink}>{showTestDetails ? "Ocultar detalles" : "Ver detalles"}</Text>
              </TouchableOpacity>
              {showTestDetails ? <Text style={styles.demoNoticeText}>{t("offers.testPaymentsBody")}</Text> : null}
            </View>
          ) : null}
          {offer.provider?.id ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t("purchase.viewReviews", {
                seller: offer.provider.name || t("purchase.thisSeller"),
              })}
              style={styles.providerRow}
              onPress={() => onOpenReputation?.(offer.provider!.id)}
              disabled={!onOpenReputation}
            >
              <Star
                size={18}
                color={colors.primary}
                fill={
                  offer.provider.reviewCount ? colors.primary : "transparent"
                }
              />
              <View style={styles.providerCopy}>
                <Text style={styles.providerName}>
                  {offer.provider.name || t("purchase.sellerFallback")}
                </Text>
                <Text style={styles.providerScore}>
                  {offer.provider.reviewCount
                    ? t(
                        offer.provider.reviewCount === 1
                          ? "purchase.reviewOne"
                          : "purchase.reviewMany",
                        {
                          score: Number(offer.provider.score || 0).toLocaleString(
                            locale,
                            {
                              minimumFractionDigits: 1,
                              maximumFractionDigits: 1,
                            },
                          ),
                          count: offer.provider.reviewCount,
                        },
                      )
                    : t("purchase.noReviews")}
                </Text>
              </View>
            </TouchableOpacity>
          ) : null}

          {step === 1 ? (
            <View style={styles.step}>
              <Text ref={headingRef} accessibilityRole="header" {...(Platform.OS === "web" ? { tabIndex: -1 } : {})} style={styles.title}>
                {isShoppingList
                  ? t("purchase.includedTitle")
                  : t("purchase.quantityTitle")}
              </Text>
              {isShoppingList ? (
                <>
                  <Text style={styles.helper}>
                    {t("purchase.reviewProposal", { seller: sellerName })}
                  </Text>
                  <View style={styles.shoppingListLines}>
                    {shoppingListItems.map((item, index) => (
                      <View
                        key={String(item.id || item.shoppingListItemId || index)}
                        style={styles.shoppingListLine}
                      >
                        <View style={styles.shoppingListLineCopy}>
                          <Text style={styles.shoppingListLineName} numberOfLines={2}>
                            {String(item.productName || t("purchase.productFallback"))}
                          </Text>
                          <Text style={styles.shoppingListLineQuantity}>
                            {String(item.quantity || "")} {String(item.unit || "")}
                          </Text>
                        </View>
                        <Text style={styles.shoppingListLineTotal}>
                          {typeof item.subtotalAmount === "number"
                            ? formatCurrency(item.subtotalAmount / 100, currency, locale)
                            : ""}
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.helper}>
                    {availableQuantity !== null
                      ? t("purchase.minimumAvailable", {
                          minimum: minQuantity,
                          unit,
                          available: availableQuantity,
                        })
                      : t("purchase.minimum", {
                          minimum: minQuantity,
                          unit,
                        })}
                  </Text>
                  <SimpleStepper
                    value={quantity}
                    onChange={changeQuantity}
                    min={minQuantity}
                    max={maxQuantity}
                    step={quantityStep}
                    unit={unit}
                  />
                </>
              )}
              {checkoutPreview.productAmount !== null ? (
                <Text style={styles.total}>
                  {formatCurrency(checkoutPreview.productAmount, currency, locale)}
                </Text>
              ) : null}
              <View style={styles.productContext}>
                {productImage ? (
                  <PublicationImage
                    source={productImage}
                    imageAlt={metaText(offer, "imageAlt") || t("purchase.image", { title: offer.title })}
                    illustrative={offer.meta?.imageIllustrative === true}
                    variant="hero"
                  />
                ) : null}
                {offer.description?.trim() ? (
                  <Text style={styles.productDescription}>{offer.description.trim()}</Text>
                ) : null}
                <View style={styles.productFacts}>
                  <SummaryRow
                    label={
                      isPlatformDirect
                        ? t("purchase.offers")
                        : t("purchase.sells")
                    }
                    value={isPlatformDirect ? "Allwain" : sellerName}
                  />
                  {originLabel ? (
                    <SummaryRow label={t("purchase.from")} value={originLabel} />
                  ) : null}
                  {!isShoppingList ? (
                    <SummaryRow
                      label={t("purchase.available")}
                      value={
                        availableQuantity === null
                          ? t("purchase.byConditions")
                          : `${availableQuantity} ${unit}`
                      }
                    />
                  ) : null}
                </View>
              </View>

            </View>
          ) : null}

          {step === 2 ? (
            <View style={styles.step}>
              <Text ref={headingRef} accessibilityRole="header" {...(Platform.OS === "web" ? { tabIndex: -1 } : {})} style={styles.title}>{t("purchase.deliveryTitle")}</Text>
              <DeliveryChoice
                icon={<Handshake size={22} color={colors.primary} />}
                disabled={!deliveryPricing.localConnector.available}
                label={t("purchase.localDelivery", {
                  price: formatCurrency(
                    deliveryPricing.localConnector.amount / 100,
                    currency,
                    locale,
                  ),
                })}
                selected={delivery.deliveryChannel === "local_connector"}
                onPress={() =>
                  setDelivery((current) => ({
                    ...current,
                    deliveryMethod: "shipping",
                    deliveryChannel: "local_connector",
                    deliveryDetailsConfirmed: false,
                    recurringMandateAccepted: false,
                  }))
                }
              />
              <Text style={styles.choiceHint}>
                {t("purchase.localHelp")}
              </Text>
              <DeliveryChoice
                icon={<Truck size={22} color={colors.primary} />}
                label={t("purchase.carrierPrice", {
                  carrier: deliveryPricing.carrier.name || "Sendcloud",
                })}
                selected={delivery.deliveryChannel === "carrier"}
                disabled={!deliveryPricing.carrier.available}
                onPress={() =>
                  setDelivery((current) => ({
                    ...current,
                    deliveryMethod: "shipping",
                    deliveryChannel: "carrier",
                    deliveryDetailsConfirmed: false,
                    recurringOrder: null,
                    recurringMandateAccepted: false,
                    carrierQuoteId: undefined,
                    carrierQuoteAmount: undefined,
                    carrierQuoteLabel: undefined,
                  }))
                }
              />
              <Text style={styles.choiceHint}>
                {t("purchase.carrierHelp")}
              </Text>
              <DeliveryChoice
                icon={<Store size={22} color={colors.primary} />}
                disabled={!deliveryPricing.pickup.available}
                label={t("purchase.pickupFree")}
                selected={delivery.deliveryChannel === "pickup"}
                onPress={() =>
                  setDelivery((current) => ({
                    ...current,
                    deliveryMethod: "pickup",
                    deliveryChannel: "pickup",
                    deliveryDetailsConfirmed: false,
                    recurringMandateAccepted: false,
                    deliveryAddress: "",
                    deliveryLatitude: undefined,
                    deliveryLongitude: undefined,
                  }))
                }
              />
              <DeliveryChoice
                icon={<Handshake size={22} color={colors.primary} />}
                disabled={!deliveryPricing.seller.available}
                label={t("purchase.sellerDeliveryFree")}
                selected={delivery.deliveryChannel === "seller"}
                onPress={() =>
                  setDelivery((current) => ({
                    ...current,
                    deliveryMethod: "in_person",
                    deliveryChannel: "seller",
                    deliveryDetailsConfirmed: false,
                    recurringMandateAccepted: false,
                  }))
                }
              />

            </View>
          ) : null}

          {step === 3 ? (
            <View style={styles.step}>
              <Text ref={headingRef} accessibilityRole="header" {...(Platform.OS === "web" ? { tabIndex: -1 } : {})} style={styles.title}>
                {delivery.deliveryChannel === "pickup"
                  ? t("purchase.indicationTitle")
                  : t("purchase.addressTitle")}
              </Text>
              {profileNotice ? <Text style={styles.helper}>{profileNotice}</Text> : null}
              {profileNotice?.startsWith("No pudimos") ? <TouchableOpacity accessibilityRole="button" style={styles.locationButton} onPress={() => void retrySavedDetails()}><Text style={styles.locationButtonText}>Reintentar datos guardados</Text></TouchableOpacity> : null}
              {delivery.deliveryChannel !== "pickup" ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Usar mi ubicación precisa" style={styles.locationButton} onPress={() => void fillCurrentLocation()} disabled={locating}><MapPin size={18} color={colors.brandDark} /><Text style={styles.locationButtonText}>{locating ? "Obteniendo ubicación…" : "Usar mi ubicación"}</Text></TouchableOpacity> : null}
              <RecipientFields value={delivery} pickup={delivery.deliveryChannel === "pickup"} onChange={updateCarrierAddress} issue={recipientValidation} focusRequest={focusRequest} disabled={busy || submitting} />
              {delivery.deliveryChannel !== "pickup" ? <Text style={styles.helper}>La ubicación te ayuda a rellenar la dirección. Comprueba calle y número, y añade piso, puerta e instrucciones si hacen falta.</Text> : null}
              {delivery.deliveryChannel === "carrier" ? <CarrierQuoteSelector key={quoteContext} offer={offer} quantity={quantity} address={{addressLine1: delivery.deliveryAddress, postalCode: delivery.deliveryPostalCode || "", city: delivery.deliveryCity || "", countryCode: delivery.deliveryCountryCode || "ES", phone: delivery.deliveryPhone}} selectedQuoteId={delivery.carrierQuoteId} onSelect={(quote) => { if (quoteContextRef.current === quoteContext) selectCarrierQuote(quote); }} /> : null}
              <View style={styles.field}>
                <Text style={styles.label}>{t("purchase.when")}</Text>
                <TextInput
                  accessibilityLabel={t("purchase.preferredTime")}
                  style={styles.input}
                  value={delivery.deliveryWindow?.rawText || ""}
                  onChangeText={(rawText) =>
                    setDelivery((current) => ({
                      ...current,
                      deliveryWindow: interpretDeliveryWindow(rawText),
                    }))
                  }
                  placeholder={t("purchase.whenPlaceholder")}
                  placeholderTextColor={colors.mutedText}
                />
                <DeliveryUnderstanding window={delivery.deliveryWindow || null} />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>{t("purchase.repeat")}</Text>
                {delivery.deliveryChannel === "carrier" ? (
                  <Text style={styles.helper}>
                    {t("purchase.carrierRecurringHelp")}
                  </Text>
                ) : null}
                <View style={styles.recurrenceGrid}>
                  {([
                    [null, t("purchase.once")],
                    ["weekly", t("purchase.weekly")],
                    ["biweekly", t("purchase.biweekly")],
                    ["monthly", t("purchase.monthly")],
                  ] as const).map(([interval, label]) => {
                    const selected =
                      interval === null
                        ? !delivery.recurringOrder?.enabled
                        : delivery.recurringOrder?.interval === interval;
                    return (
                      <TouchableOpacity
                        key={interval || "once"}
                        accessibilityRole="button"
                        accessibilityState={{
                          selected,
                        }}
                        style={[
                          styles.recurrenceOption,
                          selected && styles.recurrenceOptionActive,
                        ]}
                        onPress={() => updateRecurrence(interval)}
                      >
                        <Text
                          style={[
                            styles.recurrenceText,
                            selected && styles.recurrenceTextActive,
                          ]}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {delivery.recurringOrder?.enabled ? (
                  <Text style={styles.helper}>
                    {t("purchase.recurrenceSummary", {
                      quantity,
                      unit,
                      frequency: delivery.recurringOrder.label.toLowerCase(),
                    })}
                  </Text>
                ) : null}
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>{t("purchase.moreDetails")}</Text>
                <TextInput
                  accessibilityLabel={t("purchase.sellerNote")}
                  style={[styles.input, styles.notes]}
                  value={delivery.deliveryNotes}
                  onChangeText={(deliveryNotes) =>
                    setDelivery((current) => ({ ...current, deliveryNotes }))
                  }
                  placeholder={t("purchase.detailsPlaceholder")}
                  placeholderTextColor={colors.mutedText}
                  multiline
                  textAlignVertical="top"
                />
              </View>
              {validation ? (
                <Text style={styles.error}>{validation}</Text>
              ) : null}

            </View>
          ) : null}

          {step === 4 ? (
            <View style={styles.step}>
              <Text ref={headingRef} accessibilityRole="header" {...(Platform.OS === "web" ? { tabIndex: -1 } : {})} style={styles.title}>{t("purchase.forWhomTitle")}</Text>
              <DeliveryChoice
                icon={<UserRound size={22} color={colors.primary} />}
                label={t("purchase.forMe")}
                selected={delivery.buyerCapacity !== "business"}
                onPress={() =>
                  setDelivery((current) => ({
                    ...current,
                    buyerCapacity: "consumer",
                  }))
                }
              />
              <DeliveryChoice
                icon={<Building2 size={22} color={colors.primary} />}
                label={t("purchase.forBusiness")}
                selected={delivery.buyerCapacity === "business"}
                onPress={() =>
                  setDelivery((current) => ({
                    ...current,
                    buyerCapacity: "business",
                  }))
                }
              />
              <Text style={styles.helper}>
                {t("purchase.forWhomHelp")}
              </Text>

            </View>
          ) : null}

          {delivery.buyerCapacity === "business" && step === 5 ? (
            <View style={styles.step}>
              <Text ref={headingRef} accessibilityRole="header" {...(Platform.OS === "web" ? { tabIndex: -1 } : {})} style={styles.title}>{t("purchase.businessNameTitle")}</Text>
              <BuyerBusinessProfilePanel
                onReadyChange={setBuyerBusinessReady}
              />

            </View>
          ) : null}

          {step === totalSteps ? (
            <View style={styles.step}>
              <Text ref={headingRef} accessibilityRole="header" {...(Platform.OS === "web" ? { tabIndex: -1 } : {})} style={styles.title}>{t("purchase.reviewTitle")}</Text>
              <View style={styles.summary}>
                <SummaryRow label="Producto" value={offer.title} />
                <SummaryRow label={t("purchase.seller")} value={sellerName} />
                <SummaryRow label="Destinatario" value={delivery.deliveryRecipientName || "Pendiente"} />
                <SummaryRow label="Contacto" value={[delivery.deliveryEmail, delivery.deliveryPhone].filter(Boolean).join(" · ")} />
                <SummaryRow label="Dirección o recogida" value={recipientSummary(delivery, delivery.deliveryChannel === "pickup")} />
                {delivery.deliveryNotes ? <SummaryRow label="Instrucciones" value={delivery.deliveryNotes} /> : null}
                <SummaryRow
                  label={
                    isShoppingList
                      ? t("purchase.purchase")
                      : t("purchase.quantity")
                  }
                  value={
                    isShoppingList
                      ? t("purchase.productCount", {
                          count: shoppingListItems.length,
                        })
                      : `${quantity} ${unit}`
                  }
                />
                <SummaryRow label={t("purchase.delivery")} value={deliveryLabel} />
                {delivery.carrierQuoteLabel ? (
                  <SummaryRow
                    label={t("purchase.service")}
                    value={delivery.carrierQuoteLabel}
                  />
                ) : null}
                <SummaryRow
                  label={t("purchase.purchase")}
                  value={
                    delivery.buyerCapacity === "business"
                      ? t("purchase.forBusiness")
                      : t("purchase.forMe")
                  }
                />

                {delivery.deliveryWindow?.label ? (
                  <SummaryRow
                    label={t("purchase.whenSummary")}
                    value={delivery.deliveryWindow.label}
                  />
                ) : null}
                {delivery.recurringOrder?.enabled ? (
                  <SummaryRow
                    label={t("purchase.repetition")}
                    value={
                      isShoppingList
                        ? t("purchase.selectionRecurrence", {
                            frequency: delivery.recurringOrder.label.toLowerCase(),
                          })
                        : t("purchase.quantityRecurrence", {
                            quantity,
                            unit,
                            frequency: delivery.recurringOrder.label.toLowerCase(),
                          })
                    }
                  />
                ) : null}
                {checkoutPreview.productAmount !== null ? (
                  <SummaryRow
                    label={t("purchase.product")}
                    value={formatCurrency(
                      checkoutPreview.productAmount,
                      currency,
                      locale,
                    )}
                  />
                ) : null}
                {checkoutPreview.shippingAmountMinor !== null ? (
                  <SummaryRow
                    label={t("purchase.delivery")}
                    value={
                      checkoutPreview.shippingAmountMinor === 0
                        ? t("purchase.noCost")
                        : formatCurrency(
                            checkoutPreview.shippingAmountMinor / 100,
                            currency,
                            locale,
                          )
                    }
                  />
                ) : null}
                {checkoutPreview.totalAmount !== null ? (
                  <SummaryRow
                    label="Total estimado antes de preparar el pedido"
                    value={formatCurrency(
                      checkoutPreview.totalAmount,
                      currency,
                      locale,
                    )}
                    strong
                  />
                ) : null}
                {offer.meta?.saleMode === "preorder" && preorderDeadline ? (
                  <SummaryRow
                    label={t("purchase.chargeBefore")}
                    value={new Date(preorderDeadline).toLocaleDateString(locale)}
                  />
                ) : null}
              </View>
              <Text style={styles.helper}>Este resumen incluye el producto y la entrega indicados. Al preparar el pedido verás el total definitivo y su desglose antes de aceptar las condiciones y abrir Stripe.</Text>
              <View style={styles.consentRow}><View style={styles.consentCopy}><Text style={styles.consentText}>He revisado el destinatario, el contacto y los datos de entrega.</Text></View><Switch accessibilityLabel="Confirmar datos de entrega" value={delivery.deliveryDetailsConfirmed === true} onValueChange={(deliveryDetailsConfirmed) => setDelivery((current) => ({...current,deliveryDetailsConfirmed}))} trackColor={{false:colors.cardBorder,true:colors.primary}} /></View>
              <View style={styles.consentRow}><View style={styles.consentCopy}><Text style={styles.consentText}>Usar estos datos en próximas compras</Text><Text style={styles.helper}>Se guardarán al preparar el pedido, solo para tu cuenta. Puedes corregirlos en la próxima compra.</Text></View><Switch accessibilityLabel="Usar estos datos en próximas compras" value={delivery.saveDeliveryDetails === true} onValueChange={(saveDeliveryDetails) => setDelivery((current) => ({...current,saveDeliveryDetails}))} trackColor={{false:colors.cardBorder,true:colors.primary}} /></View>
              {delivery.recurringOrder?.enabled && requireRecurringConsent ? (
                <View style={styles.consentRow}>
                  <View style={styles.consentCopy}>
                    <Text style={styles.consentText}>
                      {t("purchase.recurringConsent", {
                        amount:
                          checkoutPreview.totalAmount === null
                            ? t("purchase.recurringFallbackTotal")
                            : formatCurrency(
                                checkoutPreview.totalAmount,
                                currency,
                                locale,
                              ),
                        frequency: delivery.recurringOrder.label.toLowerCase(),
                      })}
                      {delivery.deliveryChannel === "carrier"
                        ? t("purchase.recurringCarrierExtra")
                        : ""}
                    </Text>
                  </View>
                  <Switch
                    value={delivery.recurringMandateAccepted === true}
                    onValueChange={(recurringMandateAccepted) =>
                      setDelivery((current) => ({
                        ...current,
                        recurringMandateAccepted,
                      }))
                    }
                    trackColor={{ false: colors.cardBorder, true: colors.primary }}
                    thumbColor={colors.card}
                    accessibilityLabel={t("purchase.authorizeRecurring")}
                  />
                </View>
              ) : null}
              <View style={styles.consentRow}>
                <View style={styles.consentCopy}>
                  <Text style={styles.consentText}>
                    {isPlatformDirect
                      ? t("purchase.platformTerms")
                      : t("purchase.marketplaceTerms")}
                  </Text>
                  <TouchableOpacity
                    accessibilityRole="link"
                    onPress={() =>
                      void Linking.openURL("https://allwain.es/terminos/")
                    }
                  >
                    <Text style={styles.legalLink}>{t("purchase.readTerms")}</Text>
                  </TouchableOpacity>
                </View>
              </View>

            </View>
          ) : null}
          </>}
        </ScrollView>
        {!exitOpen ? <View testID="purchase-wizard-footer" style={styles.footer}>
          {error || validation ? <Text accessibilityRole="alert" style={styles.footerError}>{error || validation}</Text> : null}
          {storageError ? <TouchableOpacity accessibilityRole="button" onPress={() => { Keyboard.dismiss(); setExitOpen(true); }}><Text style={styles.footerError}>El borrador no está guardado. Reintentar guardado</Text></TouchableOpacity> : null}
          {step === 1 && !quantityValid ? <Text style={styles.footerError}>Revisa la cantidad: mínimo {minQuantity} {unit}, incrementos de {quantityStep}{availableQuantity !== null ? ` y ${availableQuantity} disponibles` : ""}.</Text> : null}
          {finalStep && !isDemoOffer && !delivery.deliveryDetailsConfirmed ? <Text style={styles.footerHelp}>Revisa el resumen y confirma los datos de entrega para continuar.</Text> : null}
          <BigActionButton label={finalStep ? (isDemoOffer ? t("purchase.closeDemo") : t("purchase.reviewPayment")) : step === 3 || (step === 5 && delivery.buyerCapacity === "business") ? t("purchase.reviewOrder") : t("purchase.next")} onPress={next} disabled={nextDisabled} busy={busy || submitting} />
        </View> : null}
      </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function DeliveryChoice({
  icon,
  label,
  selected,
  disabled = false,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.choice,
        selected && styles.choiceSelected,
        disabled && styles.choiceDisabled,
      ]}
    >
      <View style={styles.choiceIcon}>{icon}</View>
      <Text style={[styles.choiceText, disabled && styles.choiceTextDisabled]}>
        {label}
      </Text>
      <View style={[styles.radio, selected && styles.radioSelected]} />
    </TouchableOpacity>
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, strong && styles.summaryStrong]}>
        {value}
      </Text>
    </View>
  );
}

function DeliveryUnderstanding({
  window,
}: {
  window: OfferDeliveryDraft["deliveryWindow"] | null;
}) {
  const { t } = useAppTranslation();
  if (!window?.rawText) return null;
  return (
    <View style={styles.understandingCard}>
      <Text style={styles.understandingKicker}>{t("purchase.understands")}</Text>
      <Text style={styles.understandingTitle}>{window.label}</Text>
      <Text style={styles.understandingText}>
        {window.needsChoice
          ? t("purchase.understandingChoice")
          : t("purchase.understandingSaved")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  keyboard: { flex: 1, minHeight: 0 },
  scroll: { flex: 1, minHeight: 0 },
  loadingPanel: { minHeight: 200, alignItems: "center", justifyContent: "center", gap: 12 },
  footer: { width: "100%", maxWidth: 660, alignSelf: "center", paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.cardBorder, gap: 8 },
  footerError: { color: colors.danger, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  footerHelp: { color: colors.mutedText, fontSize: 12, lineHeight: 17 },
  savedNotice: { color: colors.text, backgroundColor: colors.highlight, padding: 12, borderRadius: 12, lineHeight: 20, marginBottom: 12 },
  discardButton: { minHeight: 48, alignItems: "center", justifyContent: "center", padding: 12 },
  discardText: { color: colors.danger, fontWeight: "800", fontSize: 14 },
  safeArea: { flex: 1, backgroundColor: colors.background },
  topBar: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    backgroundColor: colors.card,
  },
  iconButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  progress: { color: colors.mutedText, fontSize: 12, fontWeight: "800" },
  progressTrack: { height: 4, backgroundColor: colors.cardBorder },
  progressFill: { height: 4, backgroundColor: colors.primary },
  content: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    padding: 18,
    paddingBottom: 36,
  },
  offerName: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 20,
  },
  providerRow: {
    minHeight: 54,
    marginTop: -10,
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 10,
  },
  providerCopy: { flex: 1, minWidth: 0, gap: 2 },
  providerName: { color: colors.text, fontSize: 14, fontWeight: "900" },
  providerScore: { color: colors.mutedText, fontSize: 12, fontWeight: "700" },
  demoNotice: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    backgroundColor: colors.highlight,
    padding: 12,
    gap: 3,
    marginTop: -8,
    marginBottom: 18,
  },
  demoNoticeTitle: { color: colors.brandDark, fontSize: 13, fontWeight: "900" },
  demoNoticeText: { color: colors.text, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  testNotice: { borderWidth: 1, borderColor: colors.primary, borderRadius: 8, backgroundColor: colors.highlight, paddingHorizontal: 12, paddingBottom: 6, marginTop: -8, marginBottom: 18 },
  testNoticeToggle: { minHeight: 48, justifyContent: "center", gap: 3, paddingVertical: 6 },
  testNoticeLink: { color: colors.brandDark, fontSize: 12, fontWeight: "700", textDecorationLine: "underline" },
  step: { gap: 15 },
  title: {
    color: colors.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
  },
  helper: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  total: { color: colors.text, fontSize: 25, fontWeight: "900" },
  productContext: {
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: 14,
    gap: 12,
  },
  productDescription: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
  },
  productFacts: { borderTopWidth: 1, borderTopColor: colors.cardBorder },
  shoppingListLines: {
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  shoppingListLine: {
    minHeight: 54,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  shoppingListLineCopy: { flex: 1, minWidth: 0, gap: 2 },
  shoppingListLineName: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
  },
  shoppingListLineQuantity: {
    color: colors.mutedText,
    fontSize: 11,
    fontWeight: "700",
  },
  shoppingListLineTotal: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  choice: {
    minHeight: 66,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.card,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  choiceSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.highlight,
  },
  choiceDisabled: { opacity: 0.55, backgroundColor: colors.background },
  choiceHint: {
    marginTop: -9,
    paddingHorizontal: 10,
    color: colors.mutedText,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  choiceIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceText: { flex: 1, color: colors.text, fontSize: 16, fontWeight: "900" },
  choiceTextDisabled: { color: colors.mutedText },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.cardBorder,
  },
  radioSelected: { borderWidth: 6, borderColor: colors.primary },
  field: { gap: 7 },
  addressRow: { flexDirection: "row", gap: 8 },
  addressPostal: { flex: 0.75, minWidth: 0, gap: 7 },
  addressCity: { flex: 1.25, minWidth: 0, gap: 7 },
  label: { color: colors.text, fontSize: 13, fontWeight: "900" },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.card,
    color: colors.text,
    paddingHorizontal: 13,
    paddingVertical: 10,
    fontSize: 16,
  },
  notes: { minHeight: 82 },
  locationButton: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  locationButtonText: { color: colors.brandDark, fontWeight: "900" },
  understandingCard: {
    borderWidth: 1,
    borderColor: "#CBE3DA",
    borderRadius: 8,
    backgroundColor: "#F1FAF6",
    padding: 11,
    gap: 2,
  },
  understandingKicker: {
    color: "#55786E",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  understandingTitle: { color: colors.text, fontSize: 14, fontWeight: "900" },
  understandingText: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
  },
  recurrenceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  recurrenceOption: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  recurrenceOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.highlight,
  },
  recurrenceText: { color: colors.text, fontSize: 13, fontWeight: "800" },
  recurrenceTextActive: { color: colors.brandDark },
  pickupNote: {
    minHeight: 62,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.card,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  error: { color: colors.danger, fontWeight: "700" },
  consentRow: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: 12,
  },
  consentCopy: { flex: 1, minWidth: 0, gap: 4 },
  consentText: { color: colors.text, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  legalLink: { color: colors.brandDark, fontSize: 12, fontWeight: "900" },
  summary: { borderTopWidth: 1, borderTopColor: colors.cardBorder },
  summaryRow: {
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  summaryLabel: { color: colors.mutedText, fontWeight: "700" },
  summaryValue: {
    flex: 1,
    color: colors.text,
    fontWeight: "800",
    textAlign: "right",
  },
  summaryStrong: { fontSize: 18, fontWeight: "900" },
});
