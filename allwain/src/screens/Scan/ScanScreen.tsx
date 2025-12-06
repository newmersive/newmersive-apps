import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { getAllwainScanDemo } from "../../api/allwain.api";
import { colors } from "../../theme/colors";

export default function ScanScreen({ navigation }: any) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleScan() {
    try {
      setLoading(true);
      setError(null);
      const result = await getAllwainScanDemo();
      navigation.navigate("ScanResult", { result });
    } catch (err: any) {
      if (err?.message === "SESSION_EXPIRED") {
        setError("Tu sesión ha expirado. Vuelve a iniciar sesión.");
      } else {
        setError("No se ha podido completar el escaneo.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Escanear producto</Text>
      <Text style={styles.body}>
        Aquí irá la cámara real y el lector de etiquetas / imagen con IA.
        De momento, conectamos el botón al backend de demo.
      </Text>

      <TouchableOpacity
        style={[styles.primaryButton, loading && styles.buttonDisabled]}
        onPress={handleScan}
        activeOpacity={0.9}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.primaryButtonText}>Escanear ahora</Text>
        )}
      </TouchableOpacity>

      {error && <Text style={styles.error}>{error}</Text>}
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
  buttonDisabled: { opacity: 0.7 },
  error: { color: colors.dark, fontWeight: "700", marginTop: 12 },
});
