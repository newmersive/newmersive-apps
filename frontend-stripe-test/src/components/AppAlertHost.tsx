import React, { useSyncExternalStore } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ShieldCheck } from "lucide-react-native";
import { colors } from "../theme/colors";
import { chooseAppAlert, dismissAppAlert, getAppAlert, subscribeAppAlert } from "../utils/appAlert";

export default function AppAlertHost() {
  const request = useSyncExternalStore(subscribeAppAlert, getAppAlert, () => null);
  if (Platform.OS !== "web" || !request) return null;
  const hasCancel = request.buttons.some((button) => button.style === "cancel");
  return (
    <Modal
      key={request.id}
      visible
      transparent
      animationType="fade"
      accessibilityLabel={request.title}
      onRequestClose={() => dismissAppAlert(request.id)}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.icon}><ShieldCheck size={26} color={colors.actionInk} /></View>
            <Text accessibilityRole="header" style={styles.title}>{request.title}</Text>
            {request.message ? <Text style={styles.message}>{request.message}</Text> : null}
            <View style={styles.actions}>
              {request.buttons.map((button, index) => (
                <Pressable
                  key={`${request.id}-${index}`}
                  accessibilityRole="button"
                  onPress={() => chooseAppAlert(request.id, index)}
                  style={({ pressed }) => [
                    styles.button,
                    button.style === "cancel" ? styles.cancel : styles.confirm,
                    button.style === "destructive" && styles.destructive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.buttonText, button.style === "destructive" && styles.destructiveText]}>
                    {button.text || (hasCancel ? "Continuar" : "Entendido")}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(39,39,41,0.48)", justifyContent: "center", alignItems: "center", padding: 20 },
  card: { width: "100%", maxWidth: 460, maxHeight: "90%", backgroundColor: colors.card, borderRadius: 24, borderWidth: 1, borderColor: colors.cardBorder, overflow: "hidden" },
  content: { padding: 24, gap: 16 },
  icon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.highlight, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, lineHeight: 28, fontWeight: "800", color: colors.text },
  message: { fontSize: 16, lineHeight: 24, color: colors.text },
  actions: { gap: 10, marginTop: 8 },
  button: { minHeight: 48, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  cancel: { backgroundColor: colors.card, borderColor: colors.cardBorder },
  confirm: { backgroundColor: colors.primary, borderColor: colors.primary },
  destructive: { backgroundColor: colors.danger, borderColor: colors.danger },
  buttonText: { color: colors.actionInk, fontWeight: "700", fontSize: 15, textAlign: "center" },
  destructiveText: { color: "#FFFFFF" },
  pressed: { opacity: 0.82 },
});
