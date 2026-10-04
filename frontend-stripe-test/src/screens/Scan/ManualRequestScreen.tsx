import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { randomUUID } from "expo-crypto";
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ArrowRight, MessageSquareText, Sparkles } from "lucide-react-native";

import type { RootStackParamList } from "../../navigation/types";
import { colors } from "../../theme/colors";
import { interpretDeliveryWindow } from "../../utils/deliveryIntelligence";
import { apiAuthPost, type AllwainScanRequest } from "../../config/api";
import { useAuthStore } from "../../store/auth.store";
import { captureAuthSession } from "../../store/authSessionBridge";
import { clearManualRequestDraft, readManualRequestDraft, saveManualRequestDraft, type ManualRequestDraft } from "../../utils/manualRequestContinuity";
import { useRequestKeyboardLayout } from "../../components/useRequestKeyboardLayout";
import { buyerContinuityCopy, buyerDraftReadError } from "../../i18n/buyerContinuityCopy";
import { useAppTranslation } from "../../i18n/useAppTranslation";

type Props = NativeStackScreenProps<RootStackParamList, "ManualRequest">;

export default function ManualRequestScreen({ navigation }: Props) {
  const accountId = useAuthStore((state) => state.user?.id);
  const { locale } = useAppTranslation();
  const copy = buyerContinuityCopy[locale];
  const { keyboardAvoidingProps, footerPaddingBottom } = useRequestKeyboardLayout();
  const [requestText, setRequestText] = useState("");
  const [attempt, setAttempt] = useState<ManualRequestDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const ledger = useRef<ManualRequestDraft>({ requestText: "" });
  const creating = useRef(false);
  const screen = useRef({ focused: true, generation: 0 });
  const edited = useRef(false);
  const [draftReady, setDraftReady] = useState(false);
  const [hydrateRevision, setHydrateRevision] = useState(0);
  const [draftNotice, setDraftNotice] = useState("");
  function currentActor() { const session = captureAuthSession(), actor = accountId; return () => Boolean(actor) && session.isCurrent() && useAuthStore.getState().user?.id === actor; }
  function currentScreen() { const actor = currentActor(), generation = screen.current.generation; return () => actor() && screen.current.focused && screen.current.generation === generation; }
  useFocusEffect(useCallback(() => {
    screen.current.focused = true; screen.current.generation++;
    const current = currentScreen();
    setDraftReady(false);
    creating.current = false; setBusy(false);
    edited.current = false;
    setRequestText(""); setAttempt(null); ledger.current = { requestText: "" }; setDraftNotice("");
    if (accountId) void readManualRequestDraft(accountId).then((draft) => {
      if (!current()) return;
      ledger.current = draft || { requestText: "" };
      setRequestText(ledger.current.requestText); setAttempt(draft);
      if (draft) setDraftNotice(draft.requestId ? copy.linked : copy.recovered);
      setDraftReady(true);
    }).catch(() => { if (current()) setDraftNotice(buyerDraftReadError[locale]); });
    return () => { screen.current.focused = false; screen.current.generation++; };
  }, [accountId, copy.linked, copy.recovered, copy.saveError, locale, hydrateRevision]));
  useEffect(() => {
    if (!draftReady || !accountId || !edited.current) return;
    const current = currentScreen();
    void saveManualRequestDraft(accountId, ledger.current, currentActor()).then((saved) => {
      if (current() && !saved) setDraftNotice(copy.saveError);
    });
  }, [accountId, draftReady, requestText, copy.saveError]);
  const cleanText = requestText.trim();
  const understoodWindow = interpretDeliveryWindow(requestText);

  async function continueRequest() {
    const current = currentScreen();
    if (!accountId || !draftReady || !current() || creating.current || (!ledger.current.requestId && cleanText.length < 2)) return;
    if (ledger.current.requestId) { navigation.navigate("ScanResult", { requestId: ledger.current.requestId }); return; }
    creating.current = true; setBusy(true); setDraftNotice("");
    const next = ledger.current.creationKey ? ledger.current : { requestText, creationKey: randomUUID(), submittedText: cleanText };
    ledger.current = next; setAttempt(next); edited.current = false;
    try {
      if (!await saveManualRequestDraft(accountId, next, currentActor())) throw new Error(copy.saveError);
      if (!current()) return;
      const created = await apiAuthPost<AllwainScanRequest>("/allwain/scan-requests", { sourceType: "text", rawText: next.submittedText, creationKey: next.creationKey });
      if (!current()) return;
      if (!created?.id || created.userId !== accountId) throw new Error(copy.createError);
      const linked = { ...next, requestId: created.id };
      ledger.current = linked; setAttempt(linked);
      await saveManualRequestDraft(accountId, linked, currentActor());
      if (current()) navigation.navigate("ScanResult", { requestId: created.id });
    } catch (error: any) { if (current()) setDraftNotice(error?.message === copy.saveError ? copy.saveError : copy.createError); }
    finally { if (current()) { creating.current = false; setBusy(false); } }
  }

  async function discard() {
    const current = currentScreen();
    if (!accountId || !current() || creating.current) return;
    edited.current = false;
    const removed = await clearManualRequestDraft(accountId, currentActor());
    if (!current()) return;
    if (!removed) { setDraftNotice(copy.saveError); return; }
    ledger.current = { requestText: "" }; setAttempt(null);
    setRequestText("");
    setDraftNotice("Borrador descartado.");
  }

  async function saveAndExit() {
    const current = currentScreen();
    if (!accountId || !current() || creating.current) return;
    if (accountId && edited.current) {
      const saved = await saveManualRequestDraft(accountId, ledger.current, currentActor());
      if (!current()) return;
      if (!saved) { setDraftNotice(copy.saveError); return; }
    }
    navigation.canGoBack() ? navigation.goBack() : navigation.navigate("MainTabs");
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      {...keyboardAvoidingProps}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.eyebrow}>COMPRADOR</Text>
        <Text style={styles.title}>¿Qué necesitas?</Text>
        <Text style={styles.subtitle}>
          Escríbelo como se lo contarías a una persona.
        </Text>

        <View style={styles.inputCard}>
          <MessageSquareText size={23} color={colors.primary} />
          <TextInput
            style={styles.input}
            value={requestText}
            editable={draftReady && !busy && !attempt?.creationKey && !attempt?.requestId}
            onChangeText={(value) => { if (!currentScreen()() || creating.current || ledger.current.creationKey || ledger.current.requestId) return; edited.current = true; ledger.current = { requestText: value }; setRequestText(value); }}
            placeholder="Ej. Necesito 15 kg de naranjas para la próxima semana"
            placeholderTextColor={colors.mutedText}
            multiline
            textAlignVertical="top"
            autoFocus
            maxLength={1000}
            accessibilityLabel="Describe lo que necesitas"
          />
        </View>

        <View style={styles.understandingCard}>
          <View style={styles.understandingIcon}>
            <Sparkles size={17} color={colors.primary} />
          </View>
          <View style={styles.understandingCopy}>
            <Text style={styles.understandingKicker}>ALLWAIN ENTIENDE</Text>
            <Text style={styles.understandingTitle}>
              {understoodWindow?.label || "Escribe cuándo lo necesitas y lo ordeno por ti"}
            </Text>
            <Text style={styles.understandingText}>
              {understoodWindow
                ? `En el acuerdo aparecerá así y Allwain podrá usarlo para organizar pedidos y entregas. Confianza ${understoodWindow.confidence} %.`
                : "Ejemplos: mañana por la tarde, antes del viernes, entre las 17 y las 20, en 7 días."}
            </Text>
          </View>
        </View>

      </ScrollView>
      <View style={[styles.footer, { paddingBottom: footerPaddingBottom }]}>
        {draftNotice ? <Text accessibilityLiveRegion="polite" style={styles.understandingText}>{draftNotice}</Text> : null}
        {!draftReady && draftNotice ? <TouchableOpacity accessibilityRole="button" style={styles.backButton} onPress={() => setHydrateRevision(value => value + 1)}><Text style={styles.backText}>{copy.retry}</Text></TouchableOpacity> : null}
        {attempt?.creationKey && !attempt.requestId ? <Text style={styles.understandingText}>{copy.ambiguous}</Text> : null}
        <TouchableOpacity
          style={[styles.continueButton, ((!attempt?.requestId && cleanText.length < 2) || busy || !draftReady) && styles.disabled]}
          onPress={() => void continueRequest()}
          disabled={(!attempt?.requestId && cleanText.length < 2) || busy || !draftReady}
          accessibilityRole="button"
        >
          <Text style={styles.continueText}>{busy ? copy.preparing : attempt?.requestId ? copy.continue : attempt?.creationKey ? copy.retry : copy.prepare}</Text>
          <ArrowRight size={20} color={colors.buttonText} />
        </TouchableOpacity>
        <View style={styles.footerLinks}>
          <TouchableOpacity accessibilityRole="button" disabled={busy || !draftReady} style={styles.backButton} onPress={() => void saveAndExit()}><Text style={styles.backText}>Guardar y salir</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" disabled={busy || !draftReady} style={styles.backButton} onPress={() => void discard()}><Text style={styles.backText}>Descartar</Text></TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  footer: { width: "100%", maxWidth: 720, alignSelf: "center", paddingHorizontal: 18, paddingTop: 8, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  footerLinks: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap" },
  content: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    padding: 18,
    paddingBottom: 40,
  },
  backButton: {
    minHeight: 44,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 12,
  },
  backText: { color: colors.text, fontWeight: "800" },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: "900" },
  title: {
    color: colors.text,
    fontSize: 29,
    lineHeight: 35,
    fontWeight: "900",
    marginTop: 4,
  },
  subtitle: {
    color: colors.mutedText,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
    marginTop: 5,
    marginBottom: 18,
  },
  inputCard: {
    minHeight: 190,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.card,
    padding: 14,
  },
  input: {
    flex: 1,
    minHeight: 155,
    color: colors.text,
    fontSize: 17,
    lineHeight: 24,
    padding: 0,
  },
  understandingCard: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderColor: "#FFD0C6",
    borderRadius: 8,
    backgroundColor: "#FFF7F4",
    padding: 12,
  },
  understandingIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  understandingCopy: { flex: 1, minWidth: 0 },
  understandingKicker: { color: colors.primary, fontSize: 10, fontWeight: "900" },
  understandingTitle: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    marginTop: 2,
  },
  understandingText: {
    color: colors.mutedText,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    marginTop: 3,
  },
  continueButton: {
    minHeight: 52,
    marginTop: 14,
    borderRadius: 8,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingHorizontal: 16,
  },
  continueText: { color: colors.buttonText, fontSize: 16, fontWeight: "900" },
  disabled: { opacity: 0.45 },
});
