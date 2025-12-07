import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
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

type ScanResultScreenProps = {
  navigation: any;
  route?: { params?: { initialData?: ScanDemoResponse | null } };
};

export default function ScanResultScreen({ navigation, route }: ScanResultScreenProps) {
  const initialData = route?.params?.initialData || null;
  const [data, setData] = useState<ScanDemoResponse | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadScanDemo() {
    try {
      setLoading(true);
      setError(null);

      const res = await apiAuthGet<ScanDemoResponse>("/allwain/scan-demo");
      setData(res);
    } catch (err: any) {
      console.error("Error al obtener demo de escaneo", err);
      setError(
        err?.message || "No se pudo obtener el resultado del escaneo"
      );
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!initialData) {
      loadScanDemo();
    }
  }, [initialData]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Resultado escaneo</Text>

        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate("Escanear")}
          activeOpacity={0.9}
        >
          <Text style={styles.buttonText}>Volver a escanear</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={loadScanDemo}
          activeOpacity={0.9}
        >
          <Text style={styles.buttonText}>Recargar resultado demo</Text>
        </TouchableOpacity>

        {loading && (
          <ActivityIndicator style={{ marginTop: 16 }} color={colors.button} />
        )}

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
                <Text style={[styles.resultTitle, { marginTop: 8 }]}>Sugerencias:</Text>
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
              <Text
                style={[styles.resultText, { marginTop: 4, fontStyle: "italic" }]}
              >
                (Modo demo activo)
              </Text>
            )}
          </View>
        )}

        {!loading && !error && !data && (
          <Text style={[styles.resultText, { marginTop: 12 }]}> 
            No hay datos de escaneo todavía.
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: colors.primary },
  card: {
    backgroundColor: colors.card,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 12,
    color: colors.text,
  },
  error: { color: "red", marginTop: 8 },
  resultBox: {
    marginTop: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    backgroundColor: colors.card,
  },
  resultTitle: { fontWeight: "600", marginBottom: 4, color: colors.text },
  resultText: { color: colors.text },
  button: {
    backgroundColor: colors.button,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  secondaryButton: {
    marginTop: 10,
  },
  buttonText: {
    color: colors.buttonText,
    fontWeight: "700",
  },
});
