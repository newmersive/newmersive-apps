import React, { useEffect, useRef, useState } from "react";
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
import { rememberScanCapture } from "../../utils/scanCaptureMemory";
import { useAuthStore } from "../../store/auth.store";
import { clearJourneyDraft, readJourneyDraft, writeJourneyDraft } from "../../utils/journeyDrafts";
import { useRequestKeyboardLayout } from "../../components/useRequestKeyboardLayout";

type Props = NativeStackScreenProps<RootStackParamList, "ManualRequest">;

export default function ManualRequestScreen({ navigation }: Props) {
  const accountId = useAuthStore((state) => state.user?.id);
  const { keyboardAvoidingProps, footerPaddingBottom } = useRequestKeyboardLayout();
  const [requestText, setRequestText] = useState("");
  const edited = useRef(false);
  const [draftReady, setDraftReady] = useState(false);
  const [draftNotice, setDraftNotice] = useState("");
  useEffect(() => {
    let active = true;
    setDraftReady(false);
    edited.current = false;
    setRequestText("");
    if (!accountId) return;
    void readJourneyDraft<{ requestText: string }>(accountId, "manual-request").then((draft) => {
      if (!active) return;
      if (typeof draft?.requestText === "string") {
        setRequestText(draft.requestText.slice(0, 1000));
        setDraftNotice("Borrador recuperado.");
      }
      setDraftReady(true);
    });
    return () => { active = false; };
  }, [accountId]);
  useEffect(() => {
    if (!draftReady || !accountId || !edited.current) return;
    void writeJourneyDraft(accountId, "manual-request", { requestText }).then((saved) => {
      if (!saved) setDraftNotice("No se ha podido guardar en este dispositivo. Mantén abierta la petición.");
    });
  }, [accountId, draftReady, requestText]);
  const cleanText = requestText.trim();
  const understoodWindow = interpretDeliveryWindow(requestText);

  function continueRequest() {
    if (cleanText.length < 2) return;
    navigation.navigate("ScanResult", rememberScanCapture({
      rawText: cleanText,
      sourceType: "text",
    }));
  }

  async function discard() {
    edited.current = false;
    if (accountId) await clearJourneyDraft(accountId, "manual-request");
    setRequestText("");
    setDraftNotice("Borrador descartado.");
  }

  async function saveAndExit() {
    if (accountId && edited.current) {
      const saved = await writeJourneyDraft(accountId, "manual-request", { requestText });
      if (!saved) { setDraftNotice("No pudimos guardar. Inténtalo de nuevo antes de salir."); return; }
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
            editable={draftReady}
            onChangeText={(value) => { edited.current = true; setRequestText(value); }}
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
        <TouchableOpacity
          style={[styles.continueButton, cleanText.length < 2 && styles.disabled]}
          onPress={continueRequest}
          disabled={cleanText.length < 2}
          accessibilityRole="button"
        >
          <Text style={styles.continueText}>Preparar petición</Text>
          <ArrowRight size={20} color={colors.buttonText} />
        </TouchableOpacity>
        <View style={styles.footerLinks}>
          <TouchableOpacity accessibilityRole="button" style={styles.backButton} onPress={() => void saveAndExit()}><Text style={styles.backText}>Guardar y salir</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" style={styles.backButton} onPress={() => void discard()}><Text style={styles.backText}>Descartar</Text></TouchableOpacity>
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
