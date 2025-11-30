import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { apiAuthGet } from "../../config/api";
import { colors } from "../../theme/colors";

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

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => navigation.navigate("Escanear")}
        activeOpacity={0.9}
      >
        <Text style={styles.primaryButtonText}>Volver a escanear</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryButton} onPress={loadScanDemo} activeOpacity={0.9}>
        <Text style={styles.secondaryButtonText}>Recargar resultado demo</Text>
      </TouchableOpacity>

      {loading && <ActivityIndicator style={styles.loader} color={colors.dark} />}

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
        <Text style={styles.emptyText}>No hay datos de escaneo todavía.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: colors.salmon },
  title: { fontSize: 24, fontWeight: "800", marginBottom: 12, color: colors.dark },
  error: { color: colors.dark, marginTop: 8, fontWeight: "700" },
  loader: { marginTop: 16 },
  resultBox: {
    marginTop: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.white,
  },
  resultTitle: { fontWeight: "700", marginBottom: 4, color: colors.dark },
  resultText: { color: colors.dark, opacity: 0.9 },
  emptyText: { marginTop: 12, color: colors.dark, fontWeight: "600" },
  primaryButton: {
    backgroundColor: colors.dark,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryButtonText: { color: colors.white, fontWeight: "800" },
  secondaryButton: {
    marginTop: 12,
    backgroundColor: colors.white,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.dark,
  },
  secondaryButtonText: { color: colors.dark, fontWeight: "800" },
});
