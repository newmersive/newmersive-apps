import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuthStore } from "../store/auth.store";
import { colors } from "../theme/colors";

export default function CompanyModeSwitch() {
  const user = useAuthStore((state) => state.user);
  const appMode = useAuthStore((state) => state.appMode);
  const setAppMode = useAuthStore((state) => state.setAppMode);
  const companyAccount = user?.role === "company" || user?.role === "admin";

  if (!companyAccount) return null;

  return (
    <View style={styles.band}>
      <View style={styles.inner}>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>MODO EMPRESA</Text>
          <Text style={styles.help}>
            {appMode === "buy"
              ? "Compra y publica tus propias peticiones"
              : "Vende, publica ofertas y responde a clientes"}
          </Text>
        </View>
        <View style={styles.segmented}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ selected: appMode === "buy" }}
            style={[styles.option, appMode === "buy" && styles.optionActive]}
            onPress={() => void setAppMode("buy")}
          >
            <Text
              style={[styles.optionText, appMode === "buy" && styles.optionTextActive]}
            >
              Comprar
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ selected: appMode === "sell" }}
            style={[styles.option, appMode === "sell" && styles.optionActive]}
            onPress={() => void setAppMode("sell")}
          >
            <Text
              style={[styles.optionText, appMode === "sell" && styles.optionTextActive]}
            >
              Vender
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    width: "100%",
    backgroundColor: "#173D35",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inner: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    gap: 10,
  },
  copy: { gap: 2 },
  eyebrow: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  help: { color: "#FFFFFF", fontSize: 13, lineHeight: 18, fontWeight: "600" },
  segmented: {
    minHeight: 46,
    flexDirection: "row",
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
    backgroundColor: "#FFFFFF",
  },
  option: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionActive: { backgroundColor: colors.primary },
  optionText: { color: "#173D35", fontWeight: "900", fontSize: 14 },
  optionTextActive: { color: colors.buttonText },
});
