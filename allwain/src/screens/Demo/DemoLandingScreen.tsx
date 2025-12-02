import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors } from "../../theme/colors";

export default function DemoLandingScreen({ navigation }: any) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bienvenido a Allwain (Demo)</Text>
      <Text style={styles.body}>
        Prueba cómo Allwain escanea productos y busca mejores opciones sin registrarte.
      </Text>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => navigation.navigate("DemoScanResult")}
        activeOpacity={0.9}
      >
        <Text style={styles.primaryButtonText}>Ver demo de resultado</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => navigation.navigate("Scan")}
        activeOpacity={0.9}
      >
        <Text style={styles.secondaryButtonText}>Ir al escaneo conectado</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => navigation.navigate("MainTabs", { screen: "Ofertas" })}
        activeOpacity={0.9}
      >
        <Text style={styles.secondaryButtonText}>Volver a ofertas</Text>
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
    marginBottom: 16,
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
    marginBottom: 12,
  },
  primaryButtonText: { color: colors.white, fontWeight: "800" },
  secondaryButton: {
    backgroundColor: colors.white,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.dark,
  },
  secondaryButtonText: { color: colors.dark, fontWeight: "800" },
});
