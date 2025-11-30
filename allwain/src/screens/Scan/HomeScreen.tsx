import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../../theme/colors";
import { useAuthStore } from "../../store/auth.store";

export default function HomeScreen() {
  const user = useAuthStore((s) => s.user);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Hola {user?.name || "usuario"}, bienvenido a Allwain
      </Text>
      <Text style={styles.body}>
        Desde aquí podrás escanear productos, comparar tiendas cercanas y ver
        cuánto podrías ahorrar.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: colors.salmon },
  title: { fontSize: 24, marginBottom: 12, color: colors.dark, fontWeight: "800" },
  body: { color: colors.dark, fontWeight: "600", opacity: 0.85, lineHeight: 20 },
});
