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

interface ScanDemoProduct {
  id: string;
  name: string;
  description?: string;
  brand?: string;
  imageUrl?: string;
}

interface ScanDemoOffer {
  id: string;
  title: string;
  description: string;
  owner: string;
  ownerUserId: string;
  price?: number;
  tokens?: number;
  meta?: Record<string, unknown>;
}

interface ScanDemoResponse {
  product: ScanDemoProduct;
  offers: ScanDemoOffer[];
  message: string;
}

export default function ScanScreen({ navigation }: any) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleScan() {
    try {
      setLoading(true);
      setError(null);
      const data = await apiAuthGet<ScanDemoResponse>("/allwain/scan-demo");

      navigation.navigate("Resultado", { initialData: data });
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
          Simula la lectura de una etiqueta o QR, consulta el backend demo y
          navega automáticamente a la pantalla de resultado con ofertas.
        </Text>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleScan}
          disabled={loading}
          activeOpacity={0.9}
        >
          <Text style={styles.buttonText}>
            {loading ? "Consultando demo..." : "Simular escaneo demo"}
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
    backgroundColor: colors.primary,
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
  error: { marginTop: 12, color: "red" },
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
