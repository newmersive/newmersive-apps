import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Image,
} from "react-native";
import { apiAuthGet, apiAuthPost } from "../../config/api";
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

type ScanResultScreenProps = {
  navigation: any;
  route?: { params?: { initialData?: ScanDemoResponse | null } };
};

export default function ScanResultScreen({
  navigation,
  route,
}: ScanResultScreenProps) {
  const initialData = route?.params?.initialData || null;
  const [data, setData] = useState<ScanDemoResponse | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [interestLoadingId, setInterestLoadingId] = useState<string | null>(
    null
  );

  async function loadScanDemo() {
    try {
      setLoading(true);
      setError(null);
      setActionMessage(null);

      const res = await apiAuthGet<ScanDemoResponse>("/allwain/scan-demo");
      setData(res);
    } catch (err: any) {
      console.error("Error al obtener demo de escaneo", err);
      setError(err?.message || "No se pudo obtener el resultado del escaneo");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleInterest(offer: ScanDemoOffer) {
    try {
      setInterestLoadingId(offer.id);
      setActionMessage(null);
      await apiAuthPost(`/allwain/offers/${offer.id}/interest`, {
        message: `Interés en ${offer.title} desde la demo`,
      });
      setActionMessage("Hemos avisado al comercio. Te contactarán en breve.");
    } catch (err: any) {
      console.error("Error al registrar interés", err);
      setActionMessage(err?.message || "No pudimos enviar tu interés");
    } finally {
      setInterestLoadingId(null);
    }
  }

  useEffect(() => {
    if (!initialData) {
      loadScanDemo();
    }
  }, [initialData]);

  const productImage = useMemo(
    () => data?.product?.imageUrl ?? "https://i.pravatar.cc/300?img=5",
    [data?.product?.imageUrl]
  );

  function extractDistanceKm(offer: ScanDemoOffer) {
    const distance = (offer.meta as any)?.distanceKm;
    if (distance === undefined || distance === null) return null;
    if (typeof distance !== "number" || Number.isNaN(distance)) return null;
    return distance;
  }

  function calculateEstimatedSavings(offer: ScanDemoOffer) {
    const price = offer.price ?? 0;
    if (!price) return 12;
    return Math.max(8, Math.round(price * 0.15));
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Resultado escaneo</Text>

        <View style={styles.headerActions}>
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
            <Text style={styles.buttonText}>Recargar demo</Text>
          </TouchableOpacity>
        </View>

        {loading && (
          <ActivityIndicator
            style={{ marginTop: 16 }}
            color={colors.button}
          />
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        {data && !loading && (
          <>
            <View style={styles.productBox}>
              <Image
                source={{ uri: productImage }}
                style={styles.productImage}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.productName}>{data.product.name}</Text>
                {data.product.brand && (
                  <Text style={styles.productMeta}>
                    Marca: {data.product.brand}
                  </Text>
                )}
                <Text style={styles.productMessage}>{data.message}</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Ofertas detectadas</Text>

            {data.offers.map((offer) => {
              const distance = extractDistanceKm(offer);
              const savings = calculateEstimatedSavings(offer);
              return (
                <View key={offer.id} style={styles.offerCard}>
                  <View style={styles.offerHeader}>
                    <Image
                      source={{
                        uri:
                          (offer.meta as any)?.imageUrl ??
                          "https://i.pravatar.cc/300?img=7",
                      }}
                      style={styles.offerAvatar}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.offerTitle}>{offer.title}</Text>
                      <Text style={styles.offerDescription}>
                        {offer.description}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.offerMetaRow}>
                    {offer.price && (
                      <Text style={styles.offerChip}>
                        €{offer.price.toFixed(2)}
                      </Text>
                    )}
                    {offer.tokens && (
                      <Text style={styles.offerChip}>
                        {offer.tokens} tokens
                      </Text>
                    )}
                    {distance !== null && (
                      <Text style={styles.offerChip}>{distance} km</Text>
                    )}
                    <Text style={styles.offerChip}>
                      Ahorro estimado €{savings}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.button, styles.interestButton]}
                    onPress={() => handleInterest(offer)}
                    disabled={interestLoadingId === offer.id}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.buttonText}>
                      {interestLoadingId === offer.id
                        ? "Enviando..."
                        : "Me interesa"}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </>
        )}

        {!loading && !error && !data && (
          <Text style={[styles.resultText, { marginTop: 12 }]}>
            No hay datos de escaneo todavía.
          </Text>
        )}

        {actionMessage && (
          <Text style={styles.actionMessage}>{actionMessage}</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: colors.background },
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
  headerActions: {
    flexDirection: "row",
    columnGap: 10,
  },
  error: { color: "red", marginTop: 8 },
  resultText: { color: colors.text },
  button: {
    backgroundColor: colors.button,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    flex: 1,
  },
  secondaryButton: {
    backgroundColor: "#202020",
  },
  buttonText: {
    color: colors.buttonText,
    fontWeight: "700",
  },
  productBox: {
    flexDirection: "row",
    columnGap: 12,
    alignItems: "center",
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    padding: 12,
    backgroundColor: colors.card,
  },
  productImage: {
    width: 68,
    height: 68,
    borderRadius: 12,
    backgroundColor: "#eee",
  },
  productName: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  productMeta: { color: "#6c6c6c", fontWeight: "700", marginTop: 2 },
  productMessage: { color: colors.text, marginTop: 6, fontWeight: "600" },
  sectionTitle: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  offerCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  offerHeader: {
    flexDirection: "row",
    columnGap: 10,
    alignItems: "center",
  },
  offerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#f3f3f3",
  },
  offerTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  offerDescription: { color: "#6c6c6c", fontWeight: "600" },
  offerMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
    marginBottom: 10,
  },
  offerChip: {
    backgroundColor: "#fff2ec",
    color: colors.text,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    fontWeight: "800",
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  interestButton: {
    marginTop: 4,
  },
  actionMessage: {
    marginTop: 12,
    color: colors.text,
    fontWeight: "700",
  },
});

