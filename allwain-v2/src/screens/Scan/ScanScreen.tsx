import React, { useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { apiAuthGet } from "../../config/api";
import { colors } from "../../theme/colors";

interface ScanDemoResponse {
  result: string;
  productName?: string;
  suggestions?: string[];
  user?: string;
  demoMode?: boolean;
}

export default function ScanScreen({ navigation }: any) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleScan() {
    try {
      setLoading(true);
      setError(null);
      const data = await apiAuthGet<ScanDemoResponse>("/allwain/scan-demo");

      navigation.navigate("ScanResult", { initialData: data });
    } catch (err: any) {
      console.error("Error al lanzar demo de escaneo", err);
      setError(err?.message || "No se pudo ejecutar el escaneo demo");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Escanear producto</Text>
        <Text style={styles.body}>
          Aquí irá la cámara real y el lector de etiquetas / imagen con IA. Por
          ahora, lanza el flujo demo que consulta /api/allwain/scan-demo y te
          lleva al resultado.
        </Text>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleScan}
          disabled={loading}
          activeOpacity={0.9}
        >
          <Text style={styles.buttonText}>
            {loading ? "Consultando demo..." : "Simular escaneo y ver resultado"}
          </Text>
        </TouchableOpacity>

        {loading && (
          <ActivityIndicator style={{ marginTop: 16 }} color={colors.button} />
        )}
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  card: {
    backgroundColor: colors.card,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  title: { fontSize: 24, marginBottom: 12, fontWeight: "700", color: colors.text },
  body: { marginBottom: 20, color: colors.text },
  error: { marginTop: 12, color: colors.danger },
  button: {
    backgroundColor: colors.button,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.8 },
  buttonText: {
    color: colors.buttonText,
    fontWeight: "700",
    textAlign: "center",
  },
});
