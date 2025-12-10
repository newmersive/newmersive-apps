import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  RefreshControl,
} from "react-native";
import { useAuthStore } from "../../store/auth.store";
import {
  apiAuthGet,
  SponsorSummaryResponse,
  AllwainOffer,
  ScanDemoResponse,
} from "../../config/api";

export default function HomeScreen() {
  const user = useAuthStore((s) => s.user);

  const [summary, setSummary] = useState<SponsorSummaryResponse | null>(null);
  const [scanData, setScanData] = useState<ScanDemoResponse | null>(null);
  const [offers, setOffers] = useState<AllwainOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);

      const [scanParsed, offersRes, summaryRes] = await Promise.all([
        apiAuthGet<ScanDemoResponse>("/allwain/scan-demo"),
        apiAuthGet<{ items: AllwainOffer[] }>("/allwain/offers"),
        apiAuthGet<SponsorSummaryResponse>("/allwain/sponsors/summary"),
      ]);

      const offersParsed: AllwainOffer[] = Array.isArray(offersRes.items)
        ? offersRes.items
        : [];

      setScanData(scanParsed);
      setSummary(summaryRes);
      setOffers(offersParsed);
    } catch (e: any) {
      console.error("Error cargando datos de Allwain:", e);
      setError("No se ha podido cargar la información de Allwain.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const renderOffer = ({ item }: { item: AllwainOffer }) => {
    const distance =
      typeof item.meta?.distanceKm === "number"
        ? item.meta.distanceKm.toFixed(1)
        : null;

    const price =
      typeof item.price === "number" ? item.price.toFixed(2) : null;

    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        {item.description ? (
          <Text style={styles.cardDesc}>{item.description}</Text>
        ) : null}

        <View style={styles.cardMetaRow}>
          {price !== null && (
            <Text style={styles.cardMeta}>Precio: {price} €</Text>
          )}
          {distance !== null && (
            <Text style={styles.cardMeta}>A {distance} km de ti</Text>
          )}
        </View>
      </View>
    );
  };

  if (loading && !scanData) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.helper}>Cargando datos de Allwain…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Allwain – Escaneo demo</Text>
      <Text style={styles.subtitle}>
        Sesión iniciada como: {user?.name ?? user?.email ?? "usuario"}
      </Text>

      {summary && (
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Ahorro total</Text>
            <Text style={styles.summaryValue}>€ {summary.totalSaved.toFixed(2)}</Text>
            <Text style={styles.helper}>Histórico generado por tus invitaciones.</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Invitados</Text>
            <Text style={styles.summaryValue}>{summary.invitedCount}</Text>
            <Text style={styles.helper}>Participantes conectados a tu cuenta.</Text>
          </View>
        </View>
      )}

      {scanData ? (
        <View style={styles.productBox}>
          <Text style={styles.sectionTitle}>Producto detectado</Text>
          <Text style={styles.productName}>{scanData.product.name}</Text>
          {scanData.product.description ? (
            <Text style={styles.productDesc}>
              {scanData.product.description}
            </Text>
          ) : null}
          {scanData.product.ean ? (
            <Text style={styles.productMeta}>EAN: {scanData.product.ean}</Text>
          ) : null}
        </View>
      ) : (
        <Text style={styles.helper}>
          No se ha recibido información de producto.
        </Text>
      )}

      <Text style={styles.sectionTitle}>Ofertas cercanas</Text>

      <FlatList
        data={offers}
        keyExtractor={(item) => item.id}
        renderItem={renderOffer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <Text style={styles.helper}>De momento no hay ofertas activas.</Text>
        }
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 16,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 12,
    marginBottom: 6,
  },
  summaryRow: {
    flexDirection: "row",
    columnGap: 12,
    marginBottom: 10,
  },
  summaryCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e6e6e6",
    gap: 6,
  },
  summaryLabel: { fontSize: 13, color: "#555" },
  summaryValue: { fontSize: 18, fontWeight: "800", color: "#0F6CBD" },
  productBox: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#f5f5f5",
  },
  productName: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  productDesc: {
    fontSize: 14,
    marginBottom: 4,
  },
  productMeta: {
    fontSize: 12,
    opacity: 0.7,
  },
  listContent: {
    paddingTop: 4,
  },
  card: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#ffffff",
    marginBottom: 8,
    elevation: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 14,
    marginBottom: 4,
  },
  cardMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cardMeta: {
    fontSize: 12,
    opacity: 0.75,
  },
  helper: {
    fontSize: 13,
    opacity: 0.7,
    textAlign: "center",
  },
  error: {
    fontSize: 14,
    color: "red",
    textAlign: "center",
  },
});
