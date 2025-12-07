import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../../config/theme";

export default function TradeDetailScreen({ route }: any) {
  const trade = route?.params?.trade || {};

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{trade.title || "Trueque"}</Text>
      {trade.status && <Text style={styles.badge}>{trade.status}</Text>}
      {trade.description && <Text style={styles.description}>{trade.description}</Text>}

      {trade.participants && (
        <Text style={styles.meta}>Participantes: {trade.participants.join(", ")}</Text>
      )}
      {typeof trade.tokens === "number" && (
        <Text style={styles.meta}>Equilibrio sugerido: ~{trade.tokens} tokens</Text>
      )}

      <Text style={styles.helper}>
        Aquí podrás ver las condiciones del trueque, mensajes relevantes y el contrato
        generado por la IA.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
  },
  badge: {
    color: colors.primary,
    fontWeight: "700",
  },
  description: {
    color: colors.muted,
    lineHeight: 20,
  },
  meta: {
    color: colors.text,
    fontWeight: "600",
  },
  helper: {
    color: colors.muted,
    lineHeight: 20,
    marginTop: 12,
  },
});
