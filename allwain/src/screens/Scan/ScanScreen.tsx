import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors } from "../../theme/colors";

export default function ScanScreen({ navigation }: any) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Escanear producto</Text>
      <Text style={styles.body}>
        Aquí irá la cámara real y el lector de etiquetas / imagen con IA.
        De momento, simulamos el escaneo con un botón.
      </Text>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => navigation.navigate("Resultado")}
        activeOpacity={0.9}
      >
        <Text style={styles.primaryButtonText}>Simular escaneo y ver resultado</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    backgroundColor: colors.salmon,
  },
  title: { fontSize: 24, marginBottom: 12, color: colors.dark, fontWeight: "800" },
  body: {
    marginBottom: 20,
    color: colors.dark,
    fontWeight: "600",
    opacity: 0.85,
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: colors.dark,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryButtonText: { color: colors.white, fontWeight: "800", textAlign: "center" },
});
