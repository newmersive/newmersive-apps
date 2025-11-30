import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../../theme/colors";

export default function OffersScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ofertas de tiendas</Text>
      <Text style={styles.body}>
        Aquí se mostrarán las ofertas y promociones de las tiendas cercanas
        según lo que escanees (conexión futura a IA y APIs de comercios).
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: colors.salmon },
  title: { fontSize: 24, color: colors.dark, fontWeight: "800", marginBottom: 12 },
  body: { color: colors.dark, fontWeight: "600", opacity: 0.85, lineHeight: 20 },
});
