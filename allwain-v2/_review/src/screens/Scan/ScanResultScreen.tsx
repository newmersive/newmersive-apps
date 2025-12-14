import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  ScrollView,
} from "react-native";
import {
  apiAuthGet,
  apiAuthPost,
  ScanDemoResponse,
  AllwainOffer,
} from "../../config/api";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { colors } from "../../theme/colors";
import { addContractFromOffer } from "../../services/contracts.memory";

type Props = NativeStackScreenProps<RootStackParamList, "ScanResult">;

export default function ScanResultScreen({ navigation }: Props) {
  const [data, setData] = useState<ScanDemoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await apiAuthGet<ScanDemoResponse>("/allwain/scan-demo");
        setData(res ?? null);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  async function interest(offerId: string) {
    try {
      setBusyId(offerId);
      await apiAuthPost(`/allwain/offers/${offerId}/interest`, {
        source: "scan",
        note: data?.product?.name ?? "Interés desde escaneo",
      });
      Alert.alert("Interés enviado", "La empresa ha recibido tu solicitud.");
    } catch {
      Alert.alert("Error", "No se pudo registrar el interés.");
    } finally {
      setBusyId(null);
    }
  }

  function accept(offer: AllwainOffer) {
    addContractFromOffer(
      offer,
      `Contrato generado tras análisis del producto.`,
    );

    Alert.alert(
      "Oferta aceptada",
      "El contrato se ha creado correctamente.",
      [{ text: "Ver ofertas", onPress: () => navigation.navigate("Ofertas") }],
    );
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Analizando producto…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Resultado del análisis</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {data?.product?.name ?? "Producto identificado"}
        </Text>
        <Text style={styles.muted}>
          {data?.product?.description ??
            "Hemos detectado información relevante del producto."}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Ofertas disponibles</Text>

      {data?.offers && data.offers.length > 0 ? (
        data.offers.map((offer) => {
          const busy = busyId === offer.id;

          return (
            <View key={offer.id} style={styles.offerCard}>
              <Text style={styles.offerTitle}>{offer.title}</Text>
              {offer.description ? (
                <Text style={styles.muted}>{offer.description}</Text>
              ) : null}

              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.btn, styles.btnSoft]}
                  onPress={() => interest(offer.id)}
                  disabled={busy}
                >
                  <Text style={styles.btnSoftText}>
                    {busy ? "Enviando…" : "Me interesa"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.btn, styles.btnPrimary]}
                  onPress={() => accept(offer)}
                >
                  <Text style={styles.btnPrimaryText}>Aceptar</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      ) : (
        <View style={styles.empty}>
          <Text style={styles.muted}>
            No hay ofertas para este producto por ahora.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: { fontWeight: "700", color: colors.mutedText },

  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 12 },

  title: { fontSize: 22, fontWeight: "900", color: colors.text },
  sectionTitle: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: "900",
    color: colors.text,
  },

  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 14,
    gap: 6,
  },
  cardTitle: { fontWeight: "900", fontSize: 16, color: colors.text },
  muted: { color: colors.mutedText, fontWeight: "600" },

  offerCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 14,
    gap: 8,
  },
  offerTitle: { fontWeight: "900", color: colors.text },

  actionsRow: { flexDirection: "row", gap: 10, marginTop: 6 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
  },
  btnSoft: { backgroundColor: colors.card, borderColor: colors.cardBorder },
  btnSoftText: { fontWeight: "900", color: colors.text },
  btnPrimary: { backgroundColor: colors.button, borderColor: colors.button },
  btnPrimaryText: { fontWeight: "900", color: colors.buttonText },

  empty: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
});

