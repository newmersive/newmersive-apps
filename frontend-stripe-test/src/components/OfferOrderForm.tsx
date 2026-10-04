import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { MapPin } from "lucide-react-native";
import {
  AllwainContract,
  AllwainCarrierQuote,
  AllwainOffer,
  StructuredDeliveryWindow,
  StructuredRecurringOrder,
} from "../config/api";
import { colors } from "../theme/colors";
import { getAllwainCurrentLocation } from "../utils/currentLocation";
import { interpretDeliveryWindow } from "../utils/deliveryIntelligence";
import { formatCurrency } from "../utils/format";
import {
  calculateAllwainCheckoutPreview,
  getAllwainDeliveryOption,
  getAllwainDeliveryPricing,
} from "../utils/deliveryPricing";
import CarrierQuoteSelector from "./CarrierQuoteSelector";
import { useAuthStore } from "../store/auth.store";
import { loadPurchaseDetails, recipientIssue, recipientSummary, type PurchaseRecipient } from "../utils/purchaseDelivery";

export type OfferDeliveryDraft = PurchaseRecipient & {
  buyerCapacity?: "consumer" | "business";
  deliveryMethod: "shipping" | "pickup" | "in_person";
  deliveryChannel: "carrier" | "local_connector" | "seller" | "pickup";
  deliveryAddress: string;
  deliveryPostalCode?: string;
  deliveryCity?: string;
  deliveryCountryCode?: string;
  deliveryPhone?: string;
  carrierQuoteId?: string;
  carrierQuoteAmount?: number;
  carrierQuoteLabel?: string;
  deliveryNotes: string;
  deliveryWindow?: StructuredDeliveryWindow | null;
  recurringOrder?: StructuredRecurringOrder | null;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  commercialTermsAccepted?: boolean;
  recurringMandateAccepted?: boolean;
};

type Props = {
  offer: AllwainOffer;
  contract?: AllwainContract | null;
  busy?: boolean;
  initialDelivery?: Partial<OfferDeliveryDraft>;
  submitLabel?: string;
  requireRecurringConsent?: boolean;
  onSubmit: (quantity: number, delivery: OfferDeliveryDraft) => Promise<void> | void;
  error?: string | null;
};

export function RecipientFields({ value, pickup, onChange, issue, focusRequest = 0, disabled = false }: {
  value: PurchaseRecipient;
  pickup: boolean;
  onChange: (patch: Partial<OfferDeliveryDraft>) => void;
  issue?: ReturnType<typeof recipientIssue>;
  focusRequest?: number;
  disabled?: boolean;
}) {
  const refs = useRef<Partial<Record<keyof PurchaseRecipient, TextInput | null>>>({});
  useEffect(() => { if (focusRequest && issue) refs.current[issue.field]?.focus(); }, [focusRequest]);
  const input = (field: keyof PurchaseRecipient, label: string, placeholder: string, props: Partial<React.ComponentProps<typeof TextInput>> = {}) => (
    <View style={styles.recipientField}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={(node) => { refs.current[field] = node; }}
        accessibilityLabel={label}
        editable={!disabled}
        style={[styles.input, issue?.field === field && styles.invalidInput]}
        value={String(value[field] || "")}
        onChangeText={(text) => onChange({ [field]: text, deliveryDetailsConfirmed: false })}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedText}
        maxLength={field === "deliveryEmail" ? 254 : field === "deliveryAddress" ? 400 : 160}
        {...props}
      />
      {issue?.field === field ? <Text accessibilityRole="alert" style={styles.validation}>{issue.message}</Text> : null}
    </View>
  );
  return (
    <View style={styles.recipientFields}>
      {input("deliveryRecipientName", pickup ? "Nombre completo de quien recoge" : "Nombre completo del destinatario", "Nombre y apellidos", { autoComplete: "name", textContentType: "name" })}
      {input("deliveryEmail", "Email de contacto", "nombre@ejemplo.com", { autoCapitalize: "none", keyboardType: "email-address", autoComplete: "email", textContentType: "emailAddress" })}
      {input("deliveryPhone", "Teléfono de contacto", "+34 600 000 000", { keyboardType: "phone-pad", autoComplete: "tel", textContentType: "telephoneNumber", maxLength: 40 })}
      {pickup ? <Text style={styles.help}>No hace falta tu dirección. El vendedor confirmará el punto de recogida.</Text> : (
        <>
          {input("deliveryAddress", "Calle y número", "Calle, avenida o punto exacto de entrega", { autoComplete: "street-address", textContentType: "fullStreetAddress" })}
          {input("deliveryUnit", "Piso, puerta o escalera (opcional)", "2.º, puerta 4", { maxLength: 120 })}
          <View style={styles.recipientAddressRow}>
            <View style={styles.recipientAddressColumn}>{input("deliveryPostalCode", "Código postal", "46134", { autoComplete: "postal-code", textContentType: "postalCode", keyboardType: "number-pad", maxLength: 5 })}</View>
            <View style={styles.recipientAddressColumn}>{input("deliveryCity", "Localidad", "Foios", { autoComplete: "address-line2", textContentType: "addressCity", maxLength: 120 })}</View>
          </View>
          {input("deliveryCountryCode", "País de entrega (España: ES)", "ES", { autoCapitalize: "characters", maxLength: 2 })}
        </>
      )}
    </View>
  );
}

function metaNumber(offer: AllwainOffer, key: string) {
  const value = offer.meta?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metaText(offer: AllwainOffer, key: string) {
  const value = offer.meta?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function displayQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}

function parseQuantity(value: string) {
  return Number(value.trim().replace(",", "."));
}

function DeliveryUnderstanding({ window }: { window: StructuredDeliveryWindow | null }) {
  if (!window?.rawText) return null;
  return (
    <View style={styles.understandingCard}>
      <Text style={styles.understandingKicker}>Allwain entiende</Text>
      <Text style={styles.understandingTitle}>{window.label}</Text>
      <Text style={styles.understandingText}>
        {window.needsChoice
          ? "Parece un poco ambiguo. Puedes escribirlo de otra forma si quieres afinarlo."
          : "Lo guardamos como fecha organizada para preparar entrega y reparto."}
      </Text>
    </View>
  );
}

export default function OfferOrderForm({
  offer,
  contract,
  busy = false,
  initialDelivery,
  submitLabel = "Solicitar esta cantidad",
  requireRecurringConsent = false,
  onSubmit,
  error,
}: Props) {
  const user = useAuthStore((state) => state.user);
  const activeScope = `${user?.id || ""}:${offer.id}`;
  const activeScopeRef = useRef(activeScope);
  activeScopeRef.current = activeScope;
  const [formScope, setFormScope] = useState(activeScope);
  const accountRef = useRef(user?.id);
  const submitting = useRef(false);
  const changed = useRef(false);
  const unit = metaText(offer, "unit") || "unidad";
  const minQuantity = metaNumber(offer, "minQuantity") || 1;
  const quantityStep = metaNumber(offer, "quantityStep") || 1;
  const availableQuantity = metaNumber(offer, "availableQuantity");
  const managed = offer.meta?.inventoryManaged === true || availableQuantity !== null;
  const registeredQuantity =
    typeof contract?.quantity === "number" ? contract.quantity : null;
  const [quantity, setQuantity] = useState(
    displayQuantity(registeredQuantity || minQuantity),
  );
  const [delivery, setDelivery] = useState<OfferDeliveryDraft>({
    deliveryRecipientName: initialDelivery?.deliveryRecipientName || user?.name || "",
    deliveryEmail: initialDelivery?.deliveryEmail || user?.email || "",
    deliveryUnit: initialDelivery?.deliveryUnit || "",
    deliveryDetailsConfirmed: false,
    saveDeliveryDetails: false,
    deliveryMethod: initialDelivery?.deliveryMethod || "shipping",
    deliveryChannel:
      initialDelivery?.deliveryChannel ||
      (initialDelivery?.deliveryMethod === "pickup"
        ? "pickup"
        : initialDelivery?.deliveryMethod === "in_person"
          ? "seller"
          : "local_connector"),
    deliveryAddress: initialDelivery?.deliveryAddress || "",
    deliveryPostalCode: initialDelivery?.deliveryPostalCode || "",
    deliveryCity: initialDelivery?.deliveryCity || "",
    deliveryCountryCode: initialDelivery?.deliveryCountryCode || "ES",
    deliveryPhone: initialDelivery?.deliveryPhone || "",
    carrierQuoteId: initialDelivery?.carrierQuoteId,
    carrierQuoteAmount: initialDelivery?.carrierQuoteAmount,
    carrierQuoteLabel: initialDelivery?.carrierQuoteLabel,
    deliveryNotes: initialDelivery?.deliveryNotes || "",
    deliveryWindow: initialDelivery?.deliveryWindow || null,
    recurringOrder: initialDelivery?.recurringOrder || null,
    deliveryLatitude: initialDelivery?.deliveryLatitude,
    deliveryLongitude: initialDelivery?.deliveryLongitude,
    commercialTermsAccepted: false,
    recurringMandateAccepted: false,
  });
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [profileRetry, setProfileRetry] = useState(0);
  const [validation, setValidation] = useState<ReturnType<typeof recipientIssue>>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const [submittingHere, setSubmittingHere] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (formScope === activeScope) return;
    const sameAccount = accountRef.current === user?.id;
    accountRef.current = user?.id;
    changed.current = false;
    submitting.current = false;
    setSubmittingHere(false);
    setLocating(false);
    setLocationError(null);
    setValidation(null);
    setSubmitError(null);
    setProfileNotice(null);
    setDelivery({ deliveryMethod: "shipping", deliveryChannel: "local_connector", deliveryAddress: "", deliveryNotes: "", deliveryCountryCode: "ES", ...(sameAccount ? initialDelivery : {}), deliveryRecipientName: user?.name || "", deliveryEmail: user?.email || "", commercialTermsAccepted: false, recurringMandateAccepted: false, deliveryDetailsConfirmed: false, saveDeliveryDetails: false });
    setFormScope(activeScope);
  }, [activeScope, formScope, user?.id]);

  useEffect(() => {
    let active = true;
    const accountId = user?.id;
    if (!accountId || registeredQuantity !== null || formScope !== activeScope) return;
    void loadPurchaseDetails().then((details) => {
      if (!active || useAuthStore.getState().user?.id !== accountId) return;
      if (!details) { setProfileNotice("Puedes guardar estos datos al preparar el pedido para reutilizarlos en próximas compras."); return; }
      if (changed.current) { setProfileNotice("Tus datos guardados están disponibles. Hemos conservado los cambios que estabas escribiendo."); return; }
      setDelivery((current) => ({ ...current, ...details, ...initialDelivery, deliveryDetailsConfirmed: false, saveDeliveryDetails: false, commercialTermsAccepted: false, recurringMandateAccepted: false }));
      setProfileNotice("Hemos rellenado tus últimos datos guardados. Revisa que correspondan a esta compra.");
    }).catch(() => { if (active) setProfileNotice("No pudimos recuperar tus datos guardados. Puedes reintentar o escribirlos aquí."); });
    return () => { active = false; };
  }, [offer.id, user?.id, profileRetry, registeredQuantity, formScope]);

  useEffect(() => {
    setQuantity(displayQuantity(registeredQuantity || minQuantity));
  }, [offer.id, minQuantity, registeredQuantity]);

  const parsedQuantity = parseQuantity(quantity);
  const deliveryPricing = getAllwainDeliveryPricing(offer);
  const deliveryOption = getAllwainDeliveryOption(
    offer,
    delivery.deliveryChannel,
  );
  const soldOut = managed && (availableQuantity === null || availableQuantity < minQuantity);
  const stepAligned = Number.isFinite(parsedQuantity)
    ? Math.abs(
        (parsedQuantity - minQuantity) / quantityStep -
          Math.round((parsedQuantity - minQuantity) / quantityStep),
      ) < 0.000001
    : false;
  const valid =
    Number.isFinite(parsedQuantity) &&
    parsedQuantity >= minQuantity &&
    stepAligned &&
    deliveryOption.available &&
    (delivery.deliveryChannel !== "carrier" || Boolean(delivery.carrierQuoteId)) &&
    (delivery.deliveryChannel === "pickup" || Boolean(delivery.deliveryAddress.trim())) &&
    (!managed || (availableQuantity !== null && parsedQuantity <= availableQuantity));
  const recurringConsentReady =
    !requireRecurringConsent ||
    !delivery.recurringOrder?.enabled ||
    delivery.recurringMandateAccepted === true;
  const checkoutPreview = useMemo(
    () =>
      calculateAllwainCheckoutPreview({
        offer,
        quantity: parsedQuantity,
        deliveryChannel: delivery.deliveryChannel,
        carrierShippingAmount: delivery.carrierQuoteAmount,
      }),
    [delivery.carrierQuoteAmount, delivery.deliveryChannel, offer, parsedQuantity],
  );
  const currency = offer.currency || deliveryPricing.currency || "EUR";
  const quoteContext = JSON.stringify([activeScope, parsedQuantity, delivery.deliveryAddress, delivery.deliveryPostalCode, delivery.deliveryCity, delivery.deliveryCountryCode, delivery.deliveryPhone]);
  const quoteContextRef = useRef(quoteContext);
  quoteContextRef.current = quoteContext;

  function adjust(direction: -1 | 1) {
    const current = Number.isFinite(parsedQuantity) ? parsedQuantity : minQuantity;
    let next = Math.max(minQuantity, current + direction * quantityStep);
    if (availableQuantity !== null) next = Math.min(next, availableQuantity);
    setQuantity(displayQuantity(next));
    updateDelivery({
      carrierQuoteId: undefined,
      carrierQuoteAmount: undefined,
      carrierQuoteLabel: undefined,
    });
  }

  function changeQuantity(value: string) {
    setQuantity(value);
    updateDelivery({
      carrierQuoteId: undefined,
      carrierQuoteAmount: undefined,
      carrierQuoteLabel: undefined,
    });
  }

  function updateDelivery(patch: Partial<OfferDeliveryDraft>) {
    changed.current = true;
    setValidation(null);
    setSubmitError(null);
    const affectsRecipient = ["deliveryRecipientName", "deliveryEmail", "deliveryPhone", "deliveryAddress", "deliveryUnit", "deliveryPostalCode", "deliveryCity", "deliveryCountryCode", "deliveryChannel"].some((key) => key in patch);
    const affectsAmount = "deliveryChannel" in patch || "carrierQuoteId" in patch;
    setDelivery((current) => ({ ...current, ...patch, ...(affectsRecipient ? { deliveryDetailsConfirmed: false } : {}), ...(affectsAmount ? { recurringMandateAccepted: false } : {}) }));
  }

  function updateCarrierAddress(patch: Partial<OfferDeliveryDraft>) {
    updateDelivery({
      ...patch,
      carrierQuoteId: undefined,
      carrierQuoteAmount: undefined,
      carrierQuoteLabel: undefined,
    });
  }

  function selectCarrierQuote(quote: AllwainCarrierQuote | null) {
    updateDelivery({
      carrierQuoteId: quote?.id,
      carrierQuoteAmount: quote?.amount,
      carrierQuoteLabel: quote
        ? `${quote.carrierName || "Mensajería"} · ${quote.serviceName}`
        : undefined,
    });
  }

  function updateDeliveryWindowText(rawText: string) {
    updateDelivery({ deliveryWindow: interpretDeliveryWindow(rawText) });
  }

  function updateRecurrence(interval: StructuredRecurringOrder["interval"] | null) {
    updateDelivery({
      recurringOrder: interval
        ? {
            enabled: true,
            interval,
            label:
              interval === "weekly"
                ? "Cada semana"
                : interval === "biweekly"
                  ? "Cada 15 días"
                  : "Cada mes",
          }
        : null,
      recurringMandateAccepted: false,
    });
  }

  async function fillCurrentLocation() {
    const locatingScope = activeScope;
    setLocating(true);
    setLocationError(null);
    try {
      const location = await getAllwainCurrentLocation({ preciseDelivery: true });
      if (activeScopeRef.current !== locatingScope) return;
      updateDelivery({
        deliveryAddress: location.address || delivery.deliveryAddress,
        deliveryLatitude: location.latitude,
        deliveryLongitude: location.longitude,
        deliveryPostalCode: location.postalCode || delivery.deliveryPostalCode,
        deliveryCity: location.city || delivery.deliveryCity,
        deliveryCountryCode:
          location.countryCode || delivery.deliveryCountryCode || "ES",
        carrierQuoteId: undefined,
        carrierQuoteAmount: undefined,
        carrierQuoteLabel: undefined,
      });
    } catch (error: any) {
      if (activeScopeRef.current === locatingScope) setLocationError(error?.message || "No pudimos obtener tu ubicación.");
    } finally {
      if (activeScopeRef.current === locatingScope) setLocating(false);
    }
  }

  async function submit() {
    if (submitting.current || busy || formScope !== activeScope || !user?.id) return;
    const issue = recipientIssue(delivery, delivery.deliveryChannel === "pickup");
    if (issue) { setValidation(issue); setFocusRequest((value) => value + 1); return; }
    if (!valid || !recurringConsentReady || !delivery.deliveryDetailsConfirmed) return;
    submitting.current = true;
    setSubmittingHere(true);
    setSubmitError(null);
    const submittingScope = activeScope;
    try { await onSubmit(parsedQuantity, delivery); }
    catch (error: any) { if (activeScopeRef.current === submittingScope) setSubmitError(error?.message || "No pudimos preparar el pedido. Revisa los datos e inténtalo de nuevo."); }
    finally { if (activeScopeRef.current === submittingScope) { submitting.current = false; setSubmittingHere(false); } }
  }

  if (formScope !== activeScope) return <ActivityIndicator color={colors.primary} />;

  if (registeredQuantity !== null) {
    return (
      <View style={styles.registered}>
        <Text style={styles.registeredTitle}>Pedido registrado</Text>
        <Text style={styles.registeredValue}>
          {displayQuantity(registeredQuantity)} {contract?.unit || unit}
          {typeof contract?.totalPrice === "number"
            ? ` · ${formatCurrency(contract.totalPrice, contract.currency || "EUR")}`
            : ""}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container} pointerEvents={busy || submittingHere ? "none" : "auto"}>
      <View style={styles.stockRow}>
        <Text style={styles.stockText}>
          Mínimo {displayQuantity(minQuantity)} {unit}
        </Text>
        <Text style={styles.stockText}>
          {availableQuantity === null
            ? "Disponibilidad por confirmar"
            : `${displayQuantity(availableQuantity)} ${unit} disponibles`}
        </Text>
      </View>

      {soldOut ? (
        <Text style={styles.soldOut}>Agotado temporalmente</Text>
      ) : (
        <>
          <View style={styles.quantityRow}>
            <TouchableOpacity
              style={styles.stepButton}
              onPress={() => adjust(-1)}
              accessibilityLabel={`Restar ${displayQuantity(quantityStep)} ${unit}`}
            >
              <Text style={styles.stepButtonText}>-</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.quantityInput}
              value={quantity}
              onChangeText={changeQuantity}
              keyboardType="decimal-pad"
              accessibilityLabel={`Cantidad en ${unit}`}
            />
            <Text style={styles.unit}>{unit}</Text>
            <TouchableOpacity
              style={styles.stepButton}
              onPress={() => adjust(1)}
              accessibilityLabel={`Sumar ${displayQuantity(quantityStep)} ${unit}`}
            >
              <Text style={styles.stepButtonText}>+</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.help}>
              Incrementos de {displayQuantity(quantityStep)} {unit}
            </Text>
            {checkoutPreview.productAmount !== null ? (
              <Text style={styles.total}>
                Producto {formatCurrency(checkoutPreview.productAmount, currency)}
              </Text>
            ) : null}
          </View>

          <Text style={styles.label}>Forma de entrega</Text>
          <View style={styles.segment}>
            {([
              ["local_connector", "Reparto local", "shipping"],
              ["carrier", "Mensajería", "shipping"],
              ["pickup", "Recogida", "pickup"],
              ["seller", "Vendedor", "in_person"],
            ] as const).map(([channel, label, method]) => {
              const selected = delivery.deliveryChannel === channel;
              const option = getAllwainDeliveryOption(offer, channel);
              const disabled = !option.available;
              const pricedLabel =
                channel === "local_connector"
                  ? `${label} · ${formatCurrency(deliveryPricing.localConnector.amount / 100, currency)}`
                  : channel === "pickup"
                    ? `${label} · Gratis`
                    : channel === "carrier"
                      ? `${label} · Calcular`
                      : label;
              return (
                <TouchableOpacity
                  key={channel}
                  style={[
                    styles.segmentButton,
                    selected && styles.segmentButtonActive,
                    disabled && styles.segmentButtonDisabled,
                  ]}
                  disabled={disabled}
                  onPress={() =>
                    updateDelivery(
                      channel === "pickup"
                        ? {
                            deliveryMethod: method,
                            deliveryChannel: channel,
                            deliveryAddress: "",
                            deliveryLatitude: undefined,
                            deliveryLongitude: undefined,
                          }
                        : {
                            deliveryMethod: method,
                            deliveryChannel: channel,
                            ...(channel === "carrier"
                              ? {
                                  recurringOrder: null,
                                  recurringMandateAccepted: false,
                                  carrierQuoteId: undefined,
                                  carrierQuoteAmount: undefined,
                                  carrierQuoteLabel: undefined,
                                }
                              : {}),
                          },
                    )
                  }
                  accessibilityState={{ selected, disabled }}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      selected && styles.segmentTextActive,
                      disabled && styles.segmentTextDisabled,
                    ]}
                  >
                    {pricedLabel}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.help}>
            {delivery.deliveryChannel === "local_connector"
              ? "Una persona Conector cercana recoge y entrega con confirmación QR. Son 2 € por cada pedido."
              : delivery.deliveryChannel === "carrier"
                ? "Calcularemos el precio real de Sendcloud antes de crear el pedido."
                : delivery.deliveryChannel === "seller"
                  ? "El vendedor realiza la entrega directamente."
                  : "Tú recoges el pedido en el punto acordado."}
          </Text>

          {profileNotice ? <Text style={styles.help}>{profileNotice}</Text> : null}
          {profileNotice?.startsWith("No pudimos") ? <TouchableOpacity accessibilityRole="button" style={styles.locationButton} onPress={() => setProfileRetry((value) => value + 1)}><Text style={styles.locationButtonText}>Reintentar datos guardados</Text></TouchableOpacity> : null}
          <RecipientFields value={delivery} pickup={delivery.deliveryChannel === "pickup"} onChange={updateCarrierAddress} issue={validation} focusRequest={focusRequest} disabled={busy || submittingHere} />
          {delivery.deliveryChannel !== "pickup" ? (
            <>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Usar mi ubicación precisa" style={styles.locationButton} onPress={() => void fillCurrentLocation()} disabled={locating || busy}>
                {locating ? <ActivityIndicator color={colors.primary} /> : <><MapPin size={17} color={colors.brandDark} /><Text style={styles.locationButtonText}>Usar mi ubicación</Text></>}
              </TouchableOpacity>
              {locationError ? <Text accessibilityRole="alert" style={styles.validation}>{locationError}</Text> : null}
              <Text style={styles.help}>Revisa calle, número, piso y puerta. Puedes corregir cualquier dato obtenido con la ubicación.</Text>
            </>
          ) : null}
          {delivery.deliveryChannel === "carrier" ? <CarrierQuoteSelector key={quoteContext} offer={offer} quantity={parsedQuantity} address={{addressLine1: delivery.deliveryAddress, postalCode: delivery.deliveryPostalCode || "", city: delivery.deliveryCity || "", countryCode: delivery.deliveryCountryCode || "ES", phone: delivery.deliveryPhone}} selectedQuoteId={delivery.carrierQuoteId} onSelect={(quote) => { if (quoteContextRef.current === quoteContext) selectCarrierQuote(quote); }} /> : null}

          <Text style={styles.label}>¿Cuándo te viene bien?</Text>
          <TextInput
            style={styles.input}
            value={delivery.deliveryWindow?.rawText || ""}
            onChangeText={updateDeliveryWindowText}
            placeholder="Ej. mañana por la tarde o de 17 a 20"
            placeholderTextColor={colors.mutedText}
          />
          <DeliveryUnderstanding window={delivery.deliveryWindow || null} />

          <Text style={styles.label}>¿Lo quieres repetir?</Text>
          {delivery.deliveryChannel === "carrier" ? (
            <Text style={styles.help}>
              Antes de cada entrega recalcularemos el transporte. Si el nuevo total supera el máximo autorizado, no cobraremos ni crearemos el envío hasta que lo confirmes.
            </Text>
          ) : null}
          <View style={styles.recurrenceGrid}>
            {([
              [null, "Solo esta vez"],
              ["weekly", "Cada semana"],
              ["biweekly", "Cada 15 días"],
              ["monthly", "Cada mes"],
            ] as const).map(([interval, label]) => {
              const selected =
                interval === null
                  ? !delivery.recurringOrder?.enabled
                  : delivery.recurringOrder?.interval === interval;
              return (
                <TouchableOpacity
                  key={interval || "once"}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
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
            <>
              <Text style={styles.help}>
                El acuerdo indicará {displayQuantity(parsedQuantity)} {unit}{" "}
                {delivery.recurringOrder.label.toLowerCase()}.
              </Text>
              {requireRecurringConsent ? (
                <View style={styles.recurringConsentRow}>
                  <Text style={styles.recurringConsentText}>
                    Autorizo un cobro de hasta {checkoutPreview.totalAmount === null ? "el total mostrado" : formatCurrency(checkoutPreview.totalAmount, currency)} por cada entrega programada. Cada entrega será un pedido independiente y podré pausar o cancelar antes del siguiente cobro.{delivery.deliveryChannel === "carrier" ? " Allwain recalculará el transporte y me pedirá confirmación si el total supera ese máximo." : ""}
                  </Text>
                  <Switch
                    value={delivery.recurringMandateAccepted === true}
                    onValueChange={(recurringMandateAccepted) =>
                      updateDelivery({ recurringMandateAccepted })
                    }
                    trackColor={{ false: colors.cardBorder, true: colors.primary }}
                    thumbColor={colors.card}
                    accessibilityLabel="Autorizar cobros recurrentes"
                  />
                </View>
              ) : null}
            </>
          ) : null}

          <Text style={styles.label}>Más detalles para el vendedor</Text>
          <TextInput
            style={[styles.input, styles.notes]}
            value={delivery.deliveryNotes}
            onChangeText={(deliveryNotes) => updateDelivery({ deliveryNotes })}
            placeholder="Acceso, referencia o teléfono alternativo (opcional)"
            placeholderTextColor={colors.mutedText}
            multiline
            textAlignVertical="top"
          />
          {!stepAligned && quantity.trim() ? (
            <Text style={styles.validation}>
              Usa incrementos de {displayQuantity(quantityStep)} {unit} desde el mínimo.
            </Text>
          ) : null}
          {delivery.carrierQuoteLabel ? (
            <Text style={styles.help}>Servicio elegido: {delivery.carrierQuoteLabel}</Text>
          ) : null}
          {checkoutPreview.totalAmount !== null ? (
            <View style={styles.priceBreakdown}>
              <View style={styles.priceRow}>
                <Text style={styles.help}>Producto</Text>
                <Text style={styles.priceValue}>
                  {formatCurrency(checkoutPreview.productAmount || 0, currency)}
                </Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={styles.help}>Entrega</Text>
                <Text style={styles.priceValue}>
                  {checkoutPreview.shippingAmountMinor === 0
                    ? "Sin coste"
                    : formatCurrency(
                        (checkoutPreview.shippingAmountMinor || 0) / 100,
                        currency,
                      )}
                </Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={styles.priceTotalLabel}>Total estimado</Text>
                <Text style={styles.priceTotal}>
                  {formatCurrency(checkoutPreview.totalAmount, currency)}
                </Text>
              </View>
            </View>
          ) : null}
          <View style={styles.recipientReview}>
            <Text style={styles.priceTotalLabel}>Revisa a quién va dirigido</Text>
            <Text style={styles.help}>{delivery.deliveryRecipientName || "Nombre pendiente"} · {delivery.deliveryPhone || "Teléfono pendiente"}</Text>
            <Text style={styles.help}>{delivery.deliveryEmail || "Email pendiente"}</Text>
            <Text style={styles.help}>{recipientSummary(delivery, delivery.deliveryChannel === "pickup")}</Text>
          </View>
          <View style={styles.consentRow}><View style={styles.consentCopy}><Text style={styles.consentText}>He revisado el destinatario, el contacto y los datos de entrega.</Text></View><Switch accessibilityLabel="Confirmar datos de entrega" value={delivery.deliveryDetailsConfirmed === true} onValueChange={(deliveryDetailsConfirmed) => updateDelivery({deliveryDetailsConfirmed})} trackColor={{false:colors.cardBorder,true:colors.primary}} /></View>
          <View style={styles.consentRow}><View style={styles.consentCopy}><Text style={styles.consentText}>Usar estos datos en próximas compras</Text><Text style={styles.help}>Se guardarán al preparar el pedido, solo para tu cuenta.</Text></View><Switch accessibilityLabel="Usar estos datos en próximas compras" value={delivery.saveDeliveryDetails === true} onValueChange={(saveDeliveryDetails) => updateDelivery({saveDeliveryDetails})} trackColor={{false:colors.cardBorder,true:colors.primary}} /></View>
          {error || submitError ? <Text accessibilityRole="alert" style={styles.validation}>{error || submitError}</Text> : null}
          <View style={styles.consentRow}>
            <View style={styles.consentCopy}>
              <Text style={styles.consentText}>
                Primero prepararemos el pedido y calcularemos su total definitivo. Podrás revisarlo y aceptar las condiciones antes de abrir Stripe.
              </Text>
              <TouchableOpacity
                accessibilityRole="link"
                onPress={() =>
                  void Linking.openURL("https://allwain.es/terminos/")
                }
              >
                <Text style={styles.legalLink}>Leer condiciones</Text>
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity
            style={[
              styles.submit,
              (!valid || !recurringConsentReady || !delivery.deliveryDetailsConfirmed) && styles.disabled,
            ]}
            accessibilityRole="button"
            onPress={() => void submit()}
            disabled={!valid || !recurringConsentReady || !delivery.deliveryDetailsConfirmed || busy || submittingHere}
          >
            {busy || submittingHere ? (
              <ActivityIndicator color={colors.buttonText} />
            ) : (
              <Text style={styles.submitText}>{submitLabel}</Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  recipientFields: { gap: 12 },
  recipientField: { gap: 6 },
  recipientAddressRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  recipientAddressColumn: { flexGrow: 1, flexBasis: 120, minWidth: 110 },
  invalidInput: { borderColor: colors.danger, borderWidth: 2 },
  recipientReview: { gap: 6, padding: 12, borderRadius: 12, backgroundColor: colors.highlight },
  container: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: 12,
    gap: 9,
  },
  stockRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  stockText: { color: colors.mutedText, fontSize: 12, fontWeight: "700", flexShrink: 1 },
  quantityRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepButton: {
    width: 42,
    height: 42,
    borderRadius: 6,
    backgroundColor: colors.highlight,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  stepButtonText: { color: colors.text, fontSize: 22, fontWeight: "800" },
  quantityInput: {
    width: 74,
    height: 42,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    color: colors.text,
    backgroundColor: colors.card,
    textAlign: "center",
    fontWeight: "800",
  },
  unit: { color: colors.text, fontWeight: "700", flex: 1 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  total: { color: colors.text, fontWeight: "800" },
  label: { color: colors.text, fontSize: 12, fontWeight: "800", marginTop: 2 },
  segment: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  segmentButton: {
    minHeight: 40,
    flexGrow: 1,
    flexBasis: "47%",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  segmentButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmentButtonDisabled: { opacity: 0.52, backgroundColor: colors.background },
  segmentText: { color: colors.text, fontSize: 12, fontWeight: "700", textAlign: "center" },
  segmentTextActive: { color: colors.buttonText },
  segmentTextDisabled: { color: colors.mutedText },
  addressRow: { flexDirection: "row", gap: 7 },
  addressPostal: { flex: 0.75, minWidth: 0, gap: 6 },
  addressCity: { flex: 1.25, minWidth: 0, gap: 6 },
  input: {
    minHeight: 44,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  notes: { minHeight: 68 },
  locationButton: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  locationButtonText: { color: colors.primary, fontWeight: "800" },
  understandingCard: {
    borderWidth: 1,
    borderColor: "#CBE3DA",
    borderRadius: 6,
    backgroundColor: "#F1FAF6",
    padding: 10,
    gap: 2,
  },
  understandingKicker: {
    color: "#55786E",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  understandingTitle: { color: colors.text, fontSize: 13, fontWeight: "900" },
  understandingText: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
  },
  help: { color: colors.mutedText, fontSize: 12, lineHeight: 17, flexShrink: 1 },
  recurrenceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  recurrenceOption: {
    minHeight: 40,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 6,
    paddingHorizontal: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  recurrenceOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.highlight,
  },
  recurrenceText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  recurrenceTextActive: { color: colors.primary },
  recurringConsentRow: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    padding: 12,
    backgroundColor: colors.card,
  },
  recurringConsentText: {
    flex: 1,
    color: colors.text,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  validation: { color: colors.danger, fontSize: 12, fontWeight: "700" },
  priceBreakdown: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.card,
    padding: 12,
    gap: 8,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  priceValue: { color: colors.text, fontSize: 13, fontWeight: "800" },
  priceTotalLabel: { color: colors.text, fontSize: 15, fontWeight: "900" },
  priceTotal: { color: colors.primary, fontSize: 17, fontWeight: "900" },
  consentRow: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: 10,
  },
  consentCopy: { flex: 1, minWidth: 0, gap: 4 },
  consentText: { color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  legalLink: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  submit: {
    minHeight: 46,
    borderRadius: 6,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  submitText: { color: colors.buttonText, fontWeight: "800", textAlign: "center" },
  disabled: { opacity: 0.45 },
  soldOut: { color: colors.danger, fontWeight: "800" },
  registered: {
    marginTop: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.highlight,
    padding: 12,
  },
  registeredTitle: { color: colors.mutedText, fontSize: 12, fontWeight: "800" },
  registeredValue: { color: colors.text, fontWeight: "800", marginTop: 3 },
});
