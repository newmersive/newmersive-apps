import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, FlatList, StyleSheet } from "react-native";
import { apiAuthGet, AllwainOffer } from "../../config/api";
import { colors } from "../../theme/colors";

export default function OffersScreen() {
  const [offers, setOffers] = useState<AllwainOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadOffers() {
    try {
      setLoading(true);
      setError(null);
      const res = await apiAuthGet<{ items: AllwainOffer[] }>("/allwain/offers");
      setOffers(res.items || []);
    } catch (err) {
      setError("No se pudieron cargar las ofertas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOffers();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ofertas de tiendas</Text>

      {loading && <ActivityIndicator />}
      {error && <Text style={styles.error}>{error}</Text>}

      {!loading && offers.length === 0 && (
        <Text style={styles.muted}>
          No hay ofertas disponibles por ahora. Pulsa recargar para intentar de
          nuevo.
        </Text>
      )}

      <FlatList
        data={offers}
        onRefresh={loadOffers}
        refreshing={loading}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.offerTitle}>{item.title}</Text>
            <Text style={styles.muted}>{item.description}</Text>
            {item.price && <Text style={styles.price}>€{item.price}</Text>}
            {item.meta?.distanceKm && (
              <Text style={styles.muted}>
                Distancia: {item.meta["distanceKm"]} km
              </Text>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: "700", color: colors.text },
  error: { color: colors.danger },
  muted: { color: colors.mutedText },
  card: {
    padding: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.card,
    marginBottom: 10,
  },
  offerTitle: { fontSize: 16, fontWeight: "600", color: colors.text },
  price: { color: colors.primary, marginTop: 4, fontWeight: "700" },
});
