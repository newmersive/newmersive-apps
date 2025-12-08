import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../../config/theme";

export default function ChatScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Chats</Text>
      <Text style={styles.subtitle}>Módulo en desarrollo</Text>
      <Text style={styles.description}>
        Aquí verás tus conversaciones y podrás chatear sobre los trueques. Esta
        sección es una demo y pronto estará conectada al backend.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
    gap: 8,
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
});
