import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Button } from "react-native";
import { apiAuthGet, ScanDemoResponse } from "../../config/api";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { colors } from "../../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "ScanResult">;

export default function ScanResultScreen({ navigation }: Props) {
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

      <Button
        title="Volver a escanear"
        color={colors.button}
        onPress={() => navigation.replace("Scan")}
      />
      <View style={{ height: 12 }} />
      <Button
        title="Recargar resultado demo"
        color={colors.button}
        onPress={loadScanDemo}
      />

      {loading && <ActivityIndicator style={{ marginTop: 16 }} />}

      {error && <Text style={styles.error}>{error}</Text>}

      {data && !loading && (
        <View style={styles.resultBox}>
          <Text style={styles.resultTitle}>Mensaje</Text>
          <Text style={styles.resultText}>{data.message || "Demo de escaneo"}</Text>

          {data.product && (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.resultTitle}>Producto detectado</Text>
              <Text style={styles.resultText}>{data.product.name}</Text>
              {data.product.description && (
                <Text style={styles.resultText}>{data.product.description}</Text>
              )}
            </View>
          )}

          {data.offers && data.offers.length > 0 && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.resultTitle}>Ofertas cercanas</Text>
              {data.offers.map((offer) => (
                <View key={offer.id} style={{ marginTop: 6 }}>
                  <Text style={styles.resultText}>{offer.title}</Text>
                  {offer.price && (
                    <Text style={styles.resultMuted}>Precio: €{offer.price}</Text>
                  )}
                  {offer.meta?.distanceKm && (
                    <Text style={styles.resultMuted}>
                      Distancia: {offer.meta["distanceKm"]} km
                    </Text>
                  )}
                </View>
              ))}
            </View>
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
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 12, color: colors.text },
  error: { color: colors.danger, marginTop: 8 },
  resultBox: {
    marginTop: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 6,
    backgroundColor: colors.card,
  },
  resultTitle: { fontWeight: "600", marginBottom: 4, color: colors.text },
  resultText: { color: colors.text },
  resultMuted: { color: colors.mutedText },
});
