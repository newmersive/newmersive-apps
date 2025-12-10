import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../../config/theme";

export default function ChatScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Chats</Text>
      <Text style={styles.subtitle}>Módulo en desarrollo</Text>
      <View style={styles.card}>
        <Text style={styles.description}>
          Estamos preparando la mensajería entre usuarios para coordinar
          trueques y patrocinios.
        </Text>
        <Text style={styles.description}>
          De momento verás este aviso mientras activamos el backend de
          conversaciones.
        </Text>
        <Text style={styles.caption}>
          Las demás secciones (ofertas, trueques, contratos) siguen activas.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.primary,
  },
  description: {
    color: colors.muted,
    lineHeight: 20,
  },
  caption: {
    color: colors.muted,
    marginTop: 6,
    fontSize: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
});
