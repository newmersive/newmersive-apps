import React, { useState } from "react";
import {
  View,
  Text,
  Button,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { apiAuthGet } from "../../config/api";

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
      <Text style={styles.title}>Escanear producto</Text>
      <Text style={styles.body}>
        Aquí irá la cámara real y el lector de etiquetas / imagen con IA. Por
        ahora, lanza el flujo demo que consulta /api/allwain/scan-demo y te lleva
        al resultado.
      </Text>

      <Button
        title={loading ? "Consultando demo..." : "Simular escaneo y ver resultado"}
        onPress={handleScan}
        disabled={loading}
      />

      {loading && <ActivityIndicator style={{ marginTop: 16 }} />}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "center" },
  title: { fontSize: 24, marginBottom: 12, fontWeight: "700" },
  body: { marginBottom: 20, color: "#333" },
  error: { marginTop: 12, color: "red" },
});
