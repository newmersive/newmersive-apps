import React from "react";
import { StyleSheet, Text, View } from "react-native";
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
  container: { flex: 1, padding: 24, backgroundColor: colors.background },
  title: { fontSize: 24, color: colors.text, fontWeight: "700", marginBottom: 8 },
  body: { color: colors.mutedText, fontWeight: "600", lineHeight: 20 },
});
