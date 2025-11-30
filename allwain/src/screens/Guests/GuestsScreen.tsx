import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../../theme/colors";

export default function GuestsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Panel de invitados</Text>
      <Text style={styles.body}>
        Aquí verás tus invitados, cuánto ganan y las comisiones generadas (en
        euros o puntos) cuando Allwain esté conectado a la lógica final.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: colors.salmon },
  title: { fontSize: 24, color: colors.dark, fontWeight: "800", marginBottom: 12 },
  body: { color: colors.dark, fontWeight: "600", opacity: 0.85, lineHeight: 20 },
});
