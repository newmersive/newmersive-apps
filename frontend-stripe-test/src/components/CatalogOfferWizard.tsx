import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ArrowLeft, ChevronDown, Sparkles, X } from "lucide-react-native";

import { BigActionButton } from "./design-system";
import { readJourneyDraft, writeJourneyDraft } from "../utils/journeyDrafts";
import { useAuthStore } from "../store/auth.store";
import { colors } from "../theme/colors";
import {
  isWholeUnit,
  measurementFromProductName,
} from "../utils/productIntelligence";

export type CatalogOfferDraft = {
  title: string;
  productKind: "food" | "goods" | "service" | "other";
  price: string;
  currency: string;
  unit: string;
  availableQuantity: string;
  minQuantity: string;
  quantityStep: string;
  preorder: boolean;
  preorderChargeDeadline: string;
  deliveryEstimate: string;
  shippingWeightKgPerUnit: string;
  description: string;
  foodCategory: string;
  ownProduction: boolean | null;
  originCountry: string;
  originRegion: string;
  responsibleOperator: string;
};

export default function CatalogOfferWizard({
  visible,
  draft,
  busy,
  error,
  onChange,
  onClose,
  onSubmit,
  onDiscard,
  platformDirect = false,
}: {
  visible: boolean;
  draft: CatalogOfferDraft;
  busy: boolean;
  error?: string | null;
  onChange: (patch: Partial<CatalogOfferDraft>) => void;
  onClose: () => void;
  onSubmit: () => void;
  onDiscard?: () => void;
  platformDirect?: boolean;
}) {
  const [step, setStep] = useState(1);
  const [localError, setLocalError] = useState<string | null>(null);
  const [unitOverridden, setUnitOverridden] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const totalSteps = draft.productKind === "food" ? 7 : 6;
  const unitOptions =
    draft.productKind === "service"
      ? [
          ["servicio", "servicio"],
          ["sesion", "sesión"],
          ["hora", "hora"],
          ["dia", "día"],
        ]
      : [
          ["kg", "kg"],
          ["ud", "unidad"],
          ["caja", "caja"],
          ["l", "litro"],
        ];

  const scrollRef = useRef<ScrollView>(null);
  const accountId = useAuthStore(state => state.user?.id || "");
  const operation = "catalog-offer-step";
  const [stepLoaded, setStepLoaded] = useState(false);
  useEffect(() => {
    let current = true;
    setStepLoaded(false);
    if (visible) {
      setLocalError(null);
      void readJourneyDraft<{step:number}>(accountId, operation).then(saved => {
        if (!current) return;
        setStep(Math.max(1, Math.min(totalSteps, saved?.step || 1)));
        setStepLoaded(true);
      });
    }
    return () => { current = false; };
  }, [visible, accountId, operation]);
  useEffect(() => {
    if (!visible || !stepLoaded) return;
    Keyboard.dismiss();
    scrollRef.current?.scrollTo({y:0, animated:false});
    AccessibilityInfo.announceForAccessibility("Paso " + step + " de " + totalSteps);
    void writeJourneyDraft(accountId, operation, {step});
  }, [step, visible, stepLoaded, accountId, operation]);
  function goBack() {
    if (busy) return;
    setLocalError(null);
    if (step > 1) setStep((step - 1));
    else onClose();
  }

  function next(validate: () => string | null) {
    const message = validate();
    if (message) {
      setLocalError(message);
      return;
    }
    setLocalError(null);
    setStep((current) => Math.min(totalSteps, current + 1));
  }

  function presetPreorderDeadline(days: number) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + days);
    onChange({ preorderChargeDeadline: date.toISOString().slice(0, 10) });
  }

  function preorderDeadlineError() {
    if (!draft.preorder) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.preorderChargeDeadline)) {
      return "Indica la fecha límite de cobro con formato AAAA-MM-DD.";
    }
    const deadline = new Date(`${draft.preorderChargeDeadline}T23:59:59.999Z`);
    if (!Number.isFinite(deadline.getTime()) || deadline.getTime() <= Date.now()) {
      return "La fecha límite de cobro debe ser futura.";
    }
    const maximum = Date.now() + 180 * 24 * 60 * 60 * 1_000;
    return deadline.getTime() > maximum
      ? "La fecha límite no puede superar 180 días."
      : null;
  }

  function updateTitle(title: string) {
    if (unitOverridden) {
      onChange({ title });
      return;
    }
    if (draft.productKind === "service") {
      onChange({
        title,
        unit: "servicio",
        minQuantity: "1",
        quantityStep: "1",
      });
      return;
    }
    const measurement = measurementFromProductName(title);
    const oranges = /\b(naranj|mandarin|clementin)/i.test(title);
    onChange({
      title,
      unit: measurement.unit,
      quantityStep: isWholeUnit(measurement.unit) || oranges ? "1" : "0,5",
      ...(oranges ? { minQuantity: "5" } : {}),
    });
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={goBack}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS === "ios" ? "padding" : Platform.OS === "android" ? "height" : undefined}>
        <View style={styles.topBar}>
          <TouchableOpacity
            accessibilityLabel={step === 1 ? "Cerrar" : "Atrás"}
            style={styles.iconButton}
            onPress={goBack}
            disabled={busy}
          >
            {step === 1 ? (
              <X size={22} color={colors.text} />
            ) : (
              <ArrowLeft size={22} color={colors.text} />
            )}
          </TouchableOpacity>
          <Text style={styles.progress}>
            {step} de {totalSteps}
          </Text>
          <TouchableOpacity disabled={busy} onPress={onClose} accessibilityRole="button" accessibilityLabel="Guardar borrador y salir"><Text style={styles.exitText}>Guardar y salir</Text></TouchableOpacity>
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${(step / totalSteps) * 100}%` },
            ]}
          />
        </View>

        <ScrollView ref={scrollRef} style={{flex:1}}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.eyebrow}>NUEVA OFERTA</Text>
          {platformDirect ? (
            <View style={styles.platformNotice}>
              <Sparkles size={18} color={colors.primary} />
              <View style={styles.platformNoticeCopy}>
                <Text style={styles.platformNoticeTitle}>Servicio ofrecido por Allwain</Text>
                <Text style={styles.helper}>
                  Allwain será el vendedor legal. El importe del servicio queda en la cuenta de plataforma y se documenta por separado de las comisiones marketplace.
                </Text>
              </View>
            </View>
          ) : null}

          {step === 1 ? (
            <WizardStep title="¿Qué quieres vender?">
              <TextInput
                accessibilityLabel="Producto o servicio"
                style={styles.input}
                value={draft.title}
                onChangeText={updateTitle}
                placeholder="Ej. Naranjas valencianas"
                placeholderTextColor={colors.mutedText}
                autoFocus
              />
              <View style={styles.kindGrid}>
                {[
                  ["food", "Alimento"],
                  ["goods", "Producto"],
                  ["service", "Servicio"],
                  ["other", "Otro"],
                ].map(([value, label]) => (
                  <TouchableOpacity
                    key={value}
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: draft.productKind === value,
                    }}
                    onPress={() =>
                      onChange({
                        productKind: value as CatalogOfferDraft["productKind"],
                        ...(value === "service"
                          ? {
                              unit: "servicio",
                              minQuantity: "1",
                              quantityStep: "1",
                              shippingWeightKgPerUnit: "",
                            }
                          : {}),
                      })
                    }
                    style={[
                      styles.kindButton,
                      draft.productKind === value && styles.kindSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.kindText,
                        draft.productKind === value && styles.kindSelectedText,
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </WizardStep>
          ) : null}

          {step === 2 ? (
            <WizardStep title="¿Cuánto cuesta?">
              <View style={styles.priceRow}>
                <TextInput
                  accessibilityLabel={`Precio en ${draft.currency}`}
                  style={[styles.input, styles.priceInput]}
                  value={draft.price}
                  onChangeText={(price) => onChange({ price })}
                  placeholder="0,00"
                  placeholderTextColor={colors.mutedText}
                  keyboardType="decimal-pad"
                  autoFocus
                />
                <TouchableOpacity
                  style={styles.currencyButton}
                  onPress={() => setCurrencyOpen((open) => !open)}
                  accessibilityRole="button"
                  accessibilityLabel={`Moneda: ${draft.currency}`}
                >
                  <Text style={styles.currencyCode}>{draft.currency}</Text>
                  <ChevronDown size={16} color={colors.text} />
                </TouchableOpacity>
              </View>
              {currencyOpen ? (
                <View style={styles.currencyGrid}>
                  {[
                    ["EUR", "Euro"],
                    ["USD", "Dólar"],
                    ["GBP", "Libra"],
                    ["CHF", "Franco suizo"],
                  ].map(([code, label]) => (
                    <TouchableOpacity
                      key={code}
                      style={[
                        styles.currencyOption,
                        draft.currency === code && styles.unitSelected,
                      ]}
                      onPress={() => {
                        onChange({ currency: code });
                        setCurrencyOpen(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.unitText,
                          draft.currency === code && styles.unitSelectedText,
                        ]}
                      >
                        {code} · {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
              <Text style={styles.label}>Precio por</Text>
              <View style={styles.units}>
                {unitOptions.map(([unit, label]) => (
                  <TouchableOpacity
                    key={unit}
                    accessibilityRole="button"
                    accessibilityState={{ selected: draft.unit === unit }}
                    onPress={() => {
                      setUnitOverridden(true);
                      onChange({
                        unit,
                        quantityStep: isWholeUnit(unit) ? "1" : draft.quantityStep,
                      });
                    }}
                    style={[
                      styles.unitButton,
                      draft.unit === unit && styles.unitSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.unitText,
                        draft.unit === unit && styles.unitSelectedText,
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.intelligenceHint}>
                <Sparkles size={16} color={colors.primary} />
                <Text style={styles.helper}>
                  Allwain propone la unidad según el producto. Cámbiala solo si vendes en otro formato.
                </Text>
              </View>
            </WizardStep>
          ) : null}

          {step === 3 ? (
            <WizardStep
              title={
                draft.productKind === "service"
                  ? "¿Cuántas reservas puedes atender?"
                  : "¿Cuánto tienes?"
              }
            >
              <TextInput
                accessibilityLabel={
                  draft.productKind === "service"
                    ? "Reservas disponibles"
                    : "Stock total"
                }
                style={styles.input}
                value={draft.availableQuantity}
                onChangeText={(availableQuantity) =>
                  onChange({ availableQuantity })
                }
                placeholder={`Cantidad en ${draft.unit || "unidades"}`}
                placeholderTextColor={colors.mutedText}
                keyboardType="decimal-pad"
                autoFocus
              />
            </WizardStep>
          ) : null}

          {step === 4 ? (
            <WizardStep
              title={
                draft.productKind === "service"
                  ? "¿Cuántas puede reservar cada cliente?"
                  : "¿Cuál es el pedido mínimo?"
              }
            >
              <TextInput
                accessibilityLabel="Pedido mínimo"
                style={styles.input}
                value={draft.minQuantity}
                onChangeText={(minQuantity) => onChange({ minQuantity })}
                placeholder="Ej. 5"
                placeholderTextColor={colors.mutedText}
                keyboardType="decimal-pad"
                autoFocus
              />
              <Text style={styles.label}>Aumentar de</Text>
              <TextInput
                accessibilityLabel="Incremento de cantidad"
                style={styles.input}
                value={draft.quantityStep}
                onChangeText={(quantityStep) => onChange({ quantityStep })}
                placeholder="Ej. 1"
                placeholderTextColor={colors.mutedText}
                keyboardType="decimal-pad"
              />
            </WizardStep>
          ) : null}

          {step === 5 ? (
            <WizardStep title="¿Cómo lo entregarás?">
              {draft.productKind !== "service" &&
              !["kg", "g"].includes(draft.unit.toLowerCase()) ? (
                <>
                  <Text style={styles.label}>
                    ¿Cuánto pesa cada {draft.unit || "unidad"}?
                  </Text>
                  <TextInput
                    accessibilityLabel="Peso para mensajería"
                    style={styles.input}
                    value={draft.shippingWeightKgPerUnit}
                    onChangeText={(shippingWeightKgPerUnit) =>
                      onChange({ shippingWeightKgPerUnit })
                    }
                    placeholder="Peso en kg, por ejemplo 8,5"
                    placeholderTextColor={colors.mutedText}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.helper}>
                    Lo usamos para calcular automáticamente el transporte. El comprador no tendrá que averiguarlo.
                  </Text>
                </>
              ) : null}
              <Text style={styles.label}>¿Cuándo puedes entregarlo?</Text>
              <TextInput
                accessibilityLabel="Plazo de entrega"
                style={styles.input}
                value={draft.deliveryEstimate}
                onChangeText={(deliveryEstimate) =>
                  onChange({ deliveryEstimate })
                }
                placeholder="Ej. Mañana o en 24 horas"
                placeholderTextColor={colors.mutedText}
              />
              <Text style={styles.label}>Añade algo importante</Text>
              <TextInput
                accessibilityLabel="Descripción y condiciones"
                style={[styles.input, styles.notes]}
                value={draft.description}
                onChangeText={(description) => onChange({ description })}
                placeholder="Calidad, origen o condiciones"
                placeholderTextColor={colors.mutedText}
                multiline
                textAlignVertical="top"
              />
              <View style={styles.preorder}>
                <View style={styles.preorderCopy}>
                  <Text style={styles.preorderTitle}>
                    Es una reserva o preventa
                  </Text>
                  <Text style={styles.helper}>
                    El cobro se hará cuando corresponda.
                  </Text>
                </View>
                <Switch
                  value={draft.preorder}
                  onValueChange={(preorder) =>
                    onChange({
                      preorder,
                      preorderChargeDeadline: preorder
                        ? draft.preorderChargeDeadline
                        : "",
                    })
                  }
                  trackColor={{
                    false: colors.cardBorder,
                    true: colors.primary,
                  }}
                  thumbColor={colors.card}
                />
              </View>
              {draft.preorder ? (
                <View style={styles.preorderDeadline}>
                  <Text style={styles.label}>¿Hasta qué día podrá cobrarse?</Text>
                  <Text style={styles.helper}>
                    El comprador verá y autorizará el importe máximo y esta fecha.
                  </Text>
                  <View style={styles.choiceRow}>
                    {[7, 30, 90].map((days) => (
                      <TouchableOpacity
                        key={days}
                        onPress={() => presetPreorderDeadline(days)}
                        style={styles.choiceButton}
                      >
                        <Text style={styles.kindText}>{days} días</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    accessibilityLabel="Fecha límite de cobro"
                    style={styles.input}
                    value={draft.preorderChargeDeadline}
                    onChangeText={(preorderChargeDeadline) =>
                      onChange({ preorderChargeDeadline })
                    }
                    placeholder="AAAA-MM-DD"
                    placeholderTextColor={colors.mutedText}
                  />
                </View>
              ) : null}
            </WizardStep>
          ) : null}

          {draft.productKind === "food" && step === 6 ? (
            <WizardStep title="¿De dónde viene?">
              <Text style={styles.label}>Tipo de alimento</Text>
              <TextInput
                accessibilityLabel="Tipo de alimento"
                style={styles.input}
                value={draft.foodCategory}
                onChangeText={(foodCategory) => onChange({ foodCategory })}
                placeholder="Ej. Fruta fresca"
                placeholderTextColor={colors.mutedText}
                autoFocus
              />
              <Text style={styles.label}>¿Lo produces tú?</Text>
              <View style={styles.choiceRow}>
                {[
                  [true, "Sí"],
                  [false, "No"],
                ].map(([value, label]) => (
                  <TouchableOpacity
                    key={String(value)}
                    onPress={() =>
                      onChange({ ownProduction: value as boolean })
                    }
                    style={[
                      styles.choiceButton,
                      draft.ownProduction === value && styles.kindSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.kindText,
                        draft.ownProduction === value &&
                          styles.kindSelectedText,
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.fieldRow}>
                <View style={styles.fieldColumn}>
                  <Text style={styles.label}>País de origen</Text>
                  <TextInput
                    accessibilityLabel="País de origen"
                    style={styles.input}
                    value={draft.originCountry}
                    onChangeText={(originCountry) =>
                      onChange({
                        originCountry: originCountry.toUpperCase().slice(0, 2),
                      })
                    }
                    placeholder="ES"
                    placeholderTextColor={colors.mutedText}
                    autoCapitalize="characters"
                  />
                </View>
                <View style={styles.fieldColumn}>
                  <Text style={styles.label}>Zona de origen</Text>
                  <TextInput
                    accessibilityLabel="Zona de origen"
                    style={styles.input}
                    value={draft.originRegion}
                    onChangeText={(originRegion) => onChange({ originRegion })}
                    placeholder="Ej. Foios"
                    placeholderTextColor={colors.mutedText}
                  />
                </View>
              </View>
              <Text style={styles.label}>Productor u operador responsable</Text>
              <TextInput
                accessibilityLabel="Operador responsable"
                style={styles.input}
                value={draft.responsibleOperator}
                onChangeText={(responsibleOperator) =>
                  onChange({ responsibleOperator })
                }
                placeholder="Nombre del agricultor, comercio o empresa"
                placeholderTextColor={colors.mutedText}
              />
            </WizardStep>
          ) : null}

          {step === totalSteps ? (
            <WizardStep title="Revisa y publica">
              {platformDirect ? (
                <View style={styles.platformSummary}>
                  <Text style={styles.platformNoticeTitle}>Venta directa de Allwain</Text>
                  <Text style={styles.helper}>
                    No se generará una transferencia a un vendedor externo. El 100 % del precio del servicio corresponde a Allwain antes de impuestos, costes de Stripe y posibles servicios externos.
                  </Text>
                </View>
              ) : null}
              <View style={styles.summary}>
                <SummaryRow label="Producto" value={draft.title} />
                <SummaryRow
                  label="Precio"
                  value={`${draft.price} ${draft.currency} / ${draft.unit}`}
                />
                <SummaryRow
                  label="Disponible"
                  value={`${draft.availableQuantity} ${draft.unit}`}
                />
                <SummaryRow
                  label="Mínimo"
                  value={`${draft.minQuantity} ${draft.unit}`}
                />
                {draft.productKind === "food" ? (
                  <SummaryRow
                    label="Origen"
                    value={`${draft.originRegion || "-"} · ${draft.originCountry}`}
                  />
                ) : null}
                <SummaryRow label="Entrega" value={draft.deliveryEstimate} />
                {draft.shippingWeightKgPerUnit ? (
                  <SummaryRow
                    label="Peso para envío"
                    value={`${draft.shippingWeightKgPerUnit} kg / ${draft.unit}`}
                  />
                ) : null}
                {draft.preorder ? (
                  <SummaryRow
                    label="Cobro antes de"
                    value={draft.preorderChargeDeadline}
                  />
                ) : null}
              </View>
            </WizardStep>
          ) : null}
        </ScrollView>
        <View style={styles.actionFooter}>
          <WizardError message={localError || error} />
          {step === 1 ? (<BigActionButton
                label="Siguiente"
                tone="dark"
                onPress={() =>
                  next(() =>
                    draft.title.trim()
                      ? null
                      : "Escribe el producto o servicio.",
                  )
                }
              />) : null}
          {step === 2 ? (<BigActionButton
                label="Siguiente"
                tone="dark"
                onPress={() =>
                  next(() =>
                    Number(draft.price.replace(",", ".")) > 0
                      ? null
                      : "Escribe un precio mayor que cero.",
                  )
                }
              />) : null}
          {step === 3 ? (<BigActionButton
                label="Siguiente"
                tone="dark"
                onPress={() =>
                  next(() =>
                    Number(draft.availableQuantity.replace(",", ".")) > 0
                      ? null
                      : "Escribe una cantidad mayor que cero.",
                  )
                }
              />) : null}
          {step === 4 ? (<BigActionButton
                label="Siguiente"
                tone="dark"
                onPress={() =>
                  next(() => {
                    const stock = Number(
                      draft.availableQuantity.replace(",", "."),
                    );
                    const minimum = Number(draft.minQuantity.replace(",", "."));
                    const increment = Number(
                      draft.quantityStep.replace(",", "."),
                    );
                    if (!(minimum > 0 && minimum <= stock))
                      return "El mínimo debe estar entre 1 y tu stock.";
                    if (!(increment > 0))
                      return "El aumento debe ser mayor que cero.";
                    return null;
                  })
                }
              />) : null}
          {step === 5 ? (<BigActionButton
                label="Siguiente"
                tone="dark"
                onPress={() =>
                  next(() => {
                    if (
                      draft.productKind !== "service" &&
                      !["kg", "g"].includes(draft.unit.toLowerCase()) &&
                      !(Number(draft.shippingWeightKgPerUnit.replace(",", ".")) > 0)
                    ) {
                      return "Indica el peso de cada unidad para poder calcular la mensajería.";
                    }
                    if (!draft.deliveryEstimate.trim())
                      return "Indica cuándo puedes entregarlo.";
                    return preorderDeadlineError();
                  })
                }
              />) : null}
          {step === 6 && draft.productKind === "food" ? (<BigActionButton
                label="Siguiente"
                tone="dark"
                onPress={() =>
                  next(() => {
                    if (!draft.foodCategory.trim())
                      return "Indica el tipo de alimento.";
                    if (draft.ownProduction === null)
                      return "Indica quién lo produce.";
                    if (!/^[A-Za-z]{2}$/.test(draft.originCountry.trim()))
                      return "Usa un país de dos letras, por ejemplo ES.";
                    if (!draft.responsibleOperator.trim())
                      return "Indica quién responde por este alimento.";
                    return null;
                  })
                }
              />) : null}
          {step === totalSteps ? (<BigActionButton
                label="Publicar oferta"
                tone="dark"
                busy={busy}
                onPress={onSubmit}
              />) : null}
          {onDiscard ? <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={onDiscard}><Text style={styles.discardText}>Descartar borrador</Text></TouchableOpacity> : null}
        </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function WizardStep({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.step}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  );
}

function WizardError({ message }: { message?: string | null }) {
  return message ? <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>{message}</Text> : null;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actionFooter: {paddingHorizontal:22,paddingVertical:12,borderTopWidth:1,borderColor:colors.cardBorder,backgroundColor:colors.card,gap:8,width:"100%",maxWidth:720,alignSelf:"center"},
  exitText: {color:colors.text,fontSize:12,fontWeight:"700",paddingVertical:12},
  discardText: {color:colors.mutedText,textAlign:"center",paddingVertical:6,fontSize:12},
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
  progressFill: { height: 4, backgroundColor: colors.seller },
  content: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    padding: 18,
    paddingBottom: 36,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 20,
  },
  step: { gap: 15 },
  title: {
    color: colors.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
  },
  input: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.card,
    color: colors.text,
    paddingHorizontal: 13,
    paddingVertical: 10,
    fontSize: 17,
  },
  kindGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kindButton: {
    minHeight: 48,
    width: "48%",
    flexGrow: 1,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    paddingHorizontal: 10,
  },
  kindSelected: { backgroundColor: colors.seller, borderColor: colors.seller },
  kindText: { color: colors.text, fontSize: 14, fontWeight: "800" },
  kindSelectedText: { color: colors.buttonText },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  priceInput: { flex: 1 },
  currencyButton: {
    minHeight: 54,
    minWidth: 82,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.card,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 9,
  },
  currencyCode: { color: colors.text, fontSize: 15, fontWeight: "900" },
  currencyGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  currencyOption: {
    minHeight: 42,
    width: "48%",
    flexGrow: 1,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    paddingHorizontal: 8,
  },
  label: { color: colors.text, fontSize: 13, fontWeight: "900" },
  units: {
    minHeight: 48,
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    overflow: "hidden",
  },
  unitButton: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  unitSelected: { backgroundColor: colors.seller },
  unitText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  unitSelectedText: { color: colors.buttonText },
  notes: { minHeight: 86 },
  choiceRow: { minHeight: 48, flexDirection: "row", gap: 8 },
  choiceButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  fieldRow: { flexDirection: "row", gap: 10 },
  fieldColumn: { flex: 1, minWidth: 0, gap: 6 },
  helper: {
    color: colors.mutedText,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  platformNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    backgroundColor: colors.card,
    padding: 12,
    marginBottom: 4,
  },
  platformNoticeCopy: { flex: 1, gap: 3 },
  platformNoticeTitle: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
  },
  platformSummary: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    backgroundColor: colors.card,
    padding: 12,
    gap: 4,
  },
  intelligenceHint: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  error: { color: colors.danger, fontWeight: "700", lineHeight: 19 },
  summary: { borderTopWidth: 1, borderTopColor: colors.cardBorder },
  summaryRow: {
    minHeight: 47,
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
  preorder: {
    minHeight: 74,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.card,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  preorderCopy: { flex: 1, gap: 3 },
  preorderTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  preorderDeadline: { gap: 8 },
});
