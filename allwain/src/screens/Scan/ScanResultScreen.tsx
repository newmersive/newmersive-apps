import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Button } from "react-native";
import { apiAuthGet } from "../../config/api";

interface ScanDemoResponse {
  result: string;
  productName?: string;
  suggestions?: string[];
  user?: string;
  demoMode?: boolean;
}

export default function ScanResultScreen({ navigation }: any) {
  const [data, setData] = useState<ScanDemoResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadScanDemo() {
    try {
      setLoading(true);
      setError(null);

      const res = await apiAuthGet<ScanDemoResponse>("/allwain/scan-demo");
      setData(res);
    } catch (err: any) {
      setError("No se pudo obtener el resultado del escaneo");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadScanDemo();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Resultado escaneo</Text>

      <Button title="Volver a escanear" onPress={() => navigation.navigate("Escanear")} />
      <View style={{ height: 12 }} />
      <Button title="Recargar resultado demo" onPress={loadScanDemo} />

      {loading && <ActivityIndicator style={{ marginTop: 16 }} />}

      {error && <Text style={styles.error}>{error}</Text>}

      {data && !loading && (
        <View style={styles.resultBox}>
          <Text style={styles.resultTitle}>Respuesta backend:</Text>
          <Text style={styles.resultText}>{data.result}</Text>

          {data.productName && (
            <Text style={styles.resultText}>
              Producto detectado: {data.productName}
            </Text>
          )}

          {data.suggestions && data.suggestions.length > 0 && (
            <>
              <Text style={[styles.resultTitle, { marginTop: 8 }]}>
                Sugerencias:
              </Text>
              {data.suggestions.map((s, idx) => (
                <Text key={idx} style={styles.resultText}>
                  • {s}
                </Text>
              ))}
            </>
          )}

          {data.user && (
            <Text style={[styles.resultText, { marginTop: 8 }]}>
              Usuario: {data.user}
            </Text>
          )}

          {data.demoMode && (
            <Text style={[styles.resultText, { marginTop: 4, fontStyle: "italic" }]}>
              (Modo demo activo)
            </Text>
          )}
        </View>
      )}

      {!loading && !error && !data && (
        <Text style={{ marginTop: 12 }}>No hay datos de escaneo todavía.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 12 },
  error: { color: "red", marginTop: 8 },
  resultBox: {
    marginTop: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
  },
  resultTitle: { fontWeight: "600", marginBottom: 4 },
  resultText: { color: "#333" },
});
