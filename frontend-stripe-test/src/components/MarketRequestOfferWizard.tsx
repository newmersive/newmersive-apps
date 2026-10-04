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
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ArrowLeft, X } from "lucide-react-native";

import type { AllwainMarketRequest } from "../config/api";
import { readJourneyDraft, writeJourneyDraft } from "../utils/journeyDrafts";
import { useAuthStore } from "../store/auth.store";
import { colors } from "../theme/colors";
import { formatCurrency } from "../utils/format";
import { BigActionButton, StatusChip } from "./design-system";
import {
  ProposalValidityControl,
  nearestProposalDuration,
} from "./ProposalValidityControl";

export type MarketOfferDraft = {
  price: string;
  availableQuantity: string;
  deliveryEstimate: string;
  description: string;
  validForMinutes: number;
};

type Step = 1 | 2 | 3 | 4;

export default function MarketRequestOfferWizard({
  visible,
  request,
  draft,
  busy,
  error,
  onChange,
  onClose,
  onSubmit,
  onDiscard,
}: {
  visible: boolean;
  request: AllwainMarketRequest | null;
  draft: MarketOfferDraft;
  busy: boolean;
  error?: string | null;
  onChange: (patch: Partial<MarketOfferDraft>) => void;
  onClose: () => void;
  onSubmit: () => void;
  onDiscard?: () => void;
}) {
  const [step, setStep] = useState<Step>(1);
  const [localError, setLocalError] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const accountId = useAuthStore(state => state.user?.id || "");
  const operation = `market-offer-step:${request?.id || ""}`;
  const [stepLoaded, setStepLoaded] = useState(false);
  useEffect(() => {
    let current = true;
    setStepLoaded(false);
    if (visible) {
      setLocalError(null);
      void readJourneyDraft<{step:number}>(accountId, operation).then(saved => {
        if (!current) return;
        setStep(Math.max(1, Math.min(4, saved?.step || 1)) as Step);
        setStepLoaded(true);
      });
    }
    return () => { current = false; };
  }, [visible, accountId, operation]);
  useEffect(() => {
    if (!visible || !stepLoaded) return;
    Keyboard.dismiss();
    scrollRef.current?.scrollTo({y:0, animated:false});
    AccessibilityInfo.announceForAccessibility("Paso " + step + " de " + 4);
    void writeJourneyDraft(accountId, operation, {step});
  }, [step, visible, stepLoaded, accountId, operation]);
  function goBack() {
    if (busy) return;
    setLocalError(null);
    if (step > 1) setStep((step - 1) as Step);
    else onClose();
  }

  if (!request) return null;

  const product = request.extracted.productName || request.title;
  const unit = request.extracted.unit || "unidades";
  const requestedQuantity = request.extracted.quantity;
  const currency = request.extracted.currency || "EUR";

  function next(validate: () => string | null) {
    const message = validate();
    if (message) {
      setLocalError(message);
      return;
    }
    setLocalError(null);
    setStep((current) => Math.min(4, current + 1) as Step);
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
          <Text style={styles.progress}>{step} de 4</Text>
          <TouchableOpacity disabled={busy} onPress={onClose} accessibilityRole="button" accessibilityLabel="Guardar borrador y salir"><Text style={styles.exitText}>Guardar y salir</Text></TouchableOpacity>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${step * 25}%` }]} />
        </View>

        <ScrollView ref={scrollRef} style={{flex:1}} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>RESPONDER SOLICITUD</Text>

          {step === 1 ? (
            <WizardStep title="¿A qué precio puedes hacerlo?">
              <View style={styles.requestSummary}>
                <View style={styles.requestHeader}>
                  <Text style={styles.product} numberOfLines={2}>{product}</Text>
                  <StatusChip label="Nueva" tone="warning" />
                </View>
                <Text style={styles.requestMeta}>
                  {requestedQuantity ? `${requestedQuantity} ${unit}` : "Cantidad por concretar"}
                  {` · ${request.requester.name}`}
                </Text>
              </View>
              {request.extracted.targetPrice ? (
                <Text style={styles.helper}>
                  El comprador espera alrededor de {formatCurrency(request.extracted.targetPrice, currency)}.
                </Text>
              ) : null}
              <View style={styles.priceRow}>
                <TextInput
                  accessibilityLabel={`Precio total en ${currency}`}
                  style={[styles.input, styles.priceInput]}
                  value={draft.price}
                  onChangeText={(price) => onChange({ price })}
                  placeholder="0,00"
                  placeholderTextColor={colors.mutedText}
                  keyboardType="decimal-pad"
                  autoFocus
                />
                <Text style={styles.euro}>{currency}</Text>
              </View>
            </WizardStep>
          ) : null}

          {step === 2 ? (
            <WizardStep title="¿Cuánto puedes ofrecer?">
              <TextInput
                accessibilityLabel={`Cantidad disponible en ${unit}`}
                style={styles.input}
                value={draft.availableQuantity}
                onChangeText={(availableQuantity) => onChange({ availableQuantity })}
                placeholder={requestedQuantity ? `${requestedQuantity} ${unit}` : `Cantidad en ${unit}`}
                placeholderTextColor={colors.mutedText}
                keyboardType="decimal-pad"
                autoFocus
              />
              <ProposalValidityControl
                value={nearestProposalDuration(draft.validForMinutes)}
                onChange={(validForMinutes) => onChange({ validForMinutes })}
              />
              <Text style={styles.helper}>Puedes dejarlo vacío si la cantidad se acordará después.</Text>
            </WizardStep>
          ) : null}

          {step === 3 ? (
            <WizardStep title="¿Cuándo lo puedes entregar?">
              <TextInput
                accessibilityLabel="Plazo de entrega"
                style={styles.input}
                value={draft.deliveryEstimate}
                onChangeText={(deliveryEstimate) => onChange({ deliveryEstimate })}
                placeholder="Ej. Mañana o en 3 días"
                placeholderTextColor={colors.mutedText}
                autoFocus
              />
            </WizardStep>
          ) : null}

          {step === 4 ? (
            <WizardStep title="Revisa y envía">
              <View style={styles.summary}>
                <SummaryRow label="Producto" value={product} />
                <SummaryRow label="Precio" value={formatCurrency(Number(draft.price.replace(",", ".")), currency)} />
                <SummaryRow
                  label="Cantidad"
                  value={draft.availableQuantity ? `${draft.availableQuantity} ${unit}` : "Por acordar"}
                />
                <SummaryRow label="Entrega" value={draft.deliveryEstimate} />
                <SummaryRow
                  label="Oferta válida"
                  value={
                    draft.validForMinutes < 1_440
                      ? `${Math.round(draft.validForMinutes / 60)} h`
                      : `${Math.round(draft.validForMinutes / 1_440)} días`
                  }
                />
              </View>
              <Text style={styles.label}>¿Qué debe saber el comprador?</Text>
              <TextInput
                accessibilityLabel="Descripción de la propuesta"
                style={[styles.input, styles.notes]}
                value={draft.description}
                onChangeText={(description) => onChange({ description })}
                placeholder="Calidad, condiciones o detalles importantes"
                placeholderTextColor={colors.mutedText}
                multiline
                textAlignVertical="top"
              />
            </WizardStep>
          ) : null}
        </ScrollView>
        <View style={styles.actionFooter}>
          <WizardError message={localError || error} />
          {step === 1 ? (<BigActionButton
                label="Siguiente"
                tone="dark"
                onPress={() =>
                  next(() => {
                    const proposed = Number(draft.price.replace(",", "."));
                    if (!Number.isFinite(proposed) || proposed <= 0) {
                      return "Escribe un precio mayor que cero.";
                    }
                    const reference = Number(request.extracted.targetPrice);
                    if (Number.isFinite(reference) && reference > 0 && proposed > reference) {
                      return `La oferta no puede superar ${formatCurrency(reference, currency)}.`;
                    }
                    return null;
                  })
                }
              />) : null}
          {step === 2 ? (<BigActionButton
                label="Siguiente"
                tone="dark"
                onPress={() =>
                  next(() => {
                    if (!draft.availableQuantity.trim()) return null;
                    return Number(draft.availableQuantity.replace(",", ".")) > 0
                      ? null
                      : "Escribe una cantidad mayor que cero.";
                  })
                }
              />) : null}
          {step === 3 ? (<BigActionButton
                label="Siguiente"
                tone="dark"
                onPress={() =>
                  next(() =>
                    draft.deliveryEstimate.trim()
                      ? null
                      : "Indica cuándo podrás entregarlo.",
                  )
                }
              />) : null}
          {step === 4 ? (<BigActionButton
                label={request.myOffer ? "Enviar mejora" : "Enviar oferta"}
                tone="dark"
                busy={busy}
                disabled={!draft.description.trim()}
                onPress={onSubmit}
              />) : null}
          {onDiscard ? <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={onDiscard}><Text style={styles.discardText}>Descartar borrador</Text></TouchableOpacity> : null}
        </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function WizardStep({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.step}><Text style={styles.title}>{title}</Text>{children}</View>;
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
  topBar: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, backgroundColor: colors.card },
  iconButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  progress: { color: colors.mutedText, fontSize: 12, fontWeight: "800" },
  progressTrack: { height: 4, backgroundColor: colors.cardBorder },
  progressFill: { height: 4, backgroundColor: colors.seller },
  content: { width: "100%", maxWidth: 620, alignSelf: "center", padding: 18, paddingBottom: 36 },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: "900", marginBottom: 20 },
  step: { gap: 15 },
  title: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: "900" },
  input: { minHeight: 54, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 13, paddingVertical: 10, fontSize: 17 },
  requestSummary: { borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, backgroundColor: colors.card, padding: 13, gap: 7 },
  requestHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  product: { flex: 1, minWidth: 0, color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "900" },
  requestMeta: { color: colors.mutedText, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  priceInput: { flex: 1 },
  euro: { color: colors.text, fontSize: 25, fontWeight: "900" },
  helper: { color: colors.mutedText, fontSize: 13, lineHeight: 19, fontWeight: "600" },
  label: { color: colors.text, fontSize: 13, fontWeight: "900" },
  notes: { minHeight: 96 },
  error: { color: colors.danger, fontWeight: "700", lineHeight: 19 },
  summary: { borderTopWidth: 1, borderTopColor: colors.cardBorder },
  summaryRow: { minHeight: 47, borderBottomWidth: 1, borderBottomColor: colors.cardBorder, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  summaryLabel: { color: colors.mutedText, fontWeight: "700" },
  summaryValue: { flex: 1, color: colors.text, fontWeight: "800", textAlign: "right" },
});
