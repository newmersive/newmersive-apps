import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Button,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { apiAuthGet } from "../../config/api";

interface Offer {
  id: string;
  title: string;
  description: string;
  tokens: number;
  owner: string;
  category: string;
}

interface OffersResponse {
  items: Offer[];
}

export default function OffersScreen() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasOffers = useMemo(() => offers.length > 0, [offers]);

  async function loadOffers() {
    try {
      setLoading(true);
      setError(null);
      const data = await apiAuthGet<OffersResponse>("/allwain/offers");
      setOffers(data?.items || []);
    } catch (err: any) {
      console.error("Error al cargar ofertas", err);
      if (err?.status === 401 || err?.message === "UNAUTHORIZED") {
        setError("Sesión expirada o inválida, vuelve a iniciar sesión.");
      } else {
        setError(
          err?.message ||
            "No se pudieron cargar las ofertas, revisa tu conexión o la URL base."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOffers();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Ofertas de tiendas</Text>
        <Button title="Recargar" onPress={loadOffers} disabled={loading} />
      </View>
      <Text style={styles.subtitle}>
        Datos obtenidos de /allwain/offers (requiere usuario autenticado).
      </Text>

      {loading && <ActivityIndicator style={{ marginTop: 16 }} />}

      {error && <Text style={styles.error}>{error}</Text>}

      {!loading && !error && !hasOffers && (
        <Text style={styles.empty}>No hay ofertas disponibles.</Text>
      )}

      <FlatList
        data={offers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => (
          <View style={styles.offerCard}>
            <Text style={styles.offerTitle}>{item.title}</Text>
            <Text style={styles.offerDescription}>{item.description}</Text>
            <Text style={styles.offerMeta}>Categoría: {item.category}</Text>
            <Text style={styles.offerMeta}>Tokens: {item.tokens}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 24, fontWeight: "bold" },
  subtitle: { marginTop: 4, color: "#555" },
  error: { color: "red", marginTop: 12 },
  empty: { marginTop: 16, color: "#666" },
  offerCard: {
    marginTop: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  offerTitle: { fontSize: 18, fontWeight: "600", marginBottom: 4 },
  offerDescription: { color: "#333", marginBottom: 6 },
  offerMeta: { color: "#555" },
});
