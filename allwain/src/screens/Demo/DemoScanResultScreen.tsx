import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../../theme/colors";

export default function DemoScanResultScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Resultado demo de escaneo</Text>
      <Text style={styles.body}>
        Etiqueta leída: "Café molido 500g".
      </Text>
      <Text style={styles.body}>Tiendas cercanas (ejemplo):</Text>
      <Text style={styles.listItem}>- Tienda A · 2 km · 3,50 €</Text>
      <Text style={styles.listItem}>- Tienda B · 1,2 km · 3,40 €</Text>
      <Text style={styles.listItem}>- Tienda C · 4,8 km · 3,20 € (oferta)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: colors.salmon },
  title: { fontSize: 24, marginBottom: 12, color: colors.dark, fontWeight: "800" },
  body: { marginBottom: 8, color: colors.dark, fontWeight: "600", opacity: 0.85 },
  listItem: { color: colors.dark, fontWeight: "600", opacity: 0.9 },
});
