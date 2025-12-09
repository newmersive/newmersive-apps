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
import { apiClient } from "../../config/api";

type Product = {
  id: string;
  name: string;
  description?: string;
  ean?: string;
};

type Offer = {
  id: string;
  title: string;
  description?: string;
  price?: number;
  meta?: {
    distanceKm?: number;
    [key: string]: unknown;
  };
};

type ScanDemoResponse = {
  product: Product;
  offers: Offer[];
};

export default function HomeScreen() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => (s as any).token as string | undefined);

  const [scanData, setScanData] = useState<ScanDemoResponse | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!token) {
      setError("Falta token de sesión");
      return;
    }

    try {
      setError(null);
      setLoading(true);

      const [scanRes, offersRes] = await Promise.all([
        apiClient.get<ScanDemoResponse>("/allwain/scan-demo", token),
        apiClient.get<{ items: Offer[] } | Offer[]>("/allwain/offers", token),
      ]);

      const scanParsed: ScanDemoResponse = scanRes.data;
      const offersParsed: Offer[] = Array.isArray(offersRes.data)
        ? offersRes.data
        : Array.isArray((offersRes.data as any).items)
        ? (offersRes.data as any).items
        : [];

      setScanData(scanParsed);
      setOffers(offersParsed);
    } catch (e: any) {
      console.error("Error cargando datos de Allwain:", e);
      setError("No se ha podido cargar la información de Allwain.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const renderOffer = ({ item }: { item: Offer }) => {
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
