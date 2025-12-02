import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function AdminDashboardScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Panel admin (TrueQIA)</Text>
      <Text style={styles.subtitle}>Módulo en desarrollo</Text>
      <Text style={styles.description}>
        Esta sección es solo una demo. Aquí aparecerán métricas y herramientas
        administrativas cuando se conecte con el backend.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  description: {
    color: "#444",
    lineHeight: 20,
  },
});
