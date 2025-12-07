import React from "react";
import { StyleSheet, View, Text } from "react-native";
import { spacing } from "../../config/layout";
import { colors } from "../../config/theme";

export default function RequestsListScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Requests</Text>
      <Text style={styles.subtitle}>
        Módulo en desarrollo. Aquí verás tus peticiones y podrás gestionarlas
        cuando esté conectado al backend.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.l,
    backgroundColor: colors.background,
    justifyContent: "center",
  },
  title: {
    fontSize: 28,
    marginBottom: spacing.s,
    fontWeight: "800",
    color: colors.text,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
  },
});
