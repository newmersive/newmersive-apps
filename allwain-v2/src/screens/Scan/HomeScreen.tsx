import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useAuthStore } from "../../store/auth.store";
import { colors } from "../../theme/colors";

export default function HomeScreen() {
  const user = useAuthStore((s) => s.user);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>
          Hola {user?.name || "usuario"}, bienvenido a Allwain
        </Text>
        <Text style={styles.body}>
          Desde aquí podrás escanear productos, comparar tiendas cercanas y ver
          cuánto podrías ahorrar.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: colors.primary },
  card: {
    backgroundColor: colors.card,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  title: { fontSize: 24, marginBottom: 12, color: colors.text, fontWeight: "700" },
  body: { color: colors.text },
});
