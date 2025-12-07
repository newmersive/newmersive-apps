import React from "react";
import { StyleSheet, View, Text } from "react-native";
import { useAuthStore } from "../../store/auth.store";
import { colors } from "../../config/theme";
import { spacing } from "../../config/layout";

export default function HomeScreen() {
  const user = useAuthStore((s) => s.user);
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hola {user?.name || "usuario"} 👋</Text>
      <Text style={styles.subtitle}>
        Bienvenido a TrueQIA. Desde aquí podrás ver ofertas, crear peticiones y
        dejar que la IA te ayude a equilibrar los trueques.
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
    fontWeight: "800",
    marginBottom: spacing.s,
    color: colors.text,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.muted,
  },
});
