import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiAuthGet, AllwainOffer } from "../../config/api";
import { colors } from "../../theme/colors";

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const [offers, setOffers] = useState<AllwainOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOffers = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiAuthGet<{ items: AllwainOffer[] }>("/allwain/offers");
      setOffers(res.items || []);
    } catch (err: any) {
      setError("No se pudo cargar el catálogo");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOffers();
  }, []);

  const filteredResults = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return offers;

    return offers.filter((item) => {
      const haystack = `${item.title} ${item.description || ""}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [offers, query]);

  const renderPrice = (item: AllwainOffer) => {
    if (typeof item.price === "number") {
      return `${item.price.toFixed(2)} €`;
    }
    if (typeof item.tokens === "number") {
      return `${item.tokens} tokens`;
    }
    return "Precio pendiente";
  };

  const renderOffer = ({ item }: { item: AllwainOffer }) => (
    <View style={styles.resultCard}>
      <Text style={styles.resultTitle}>{item.title}</Text>
      <Text style={styles.resultBody}>{item.description}</Text>
      <Text style={styles.resultPrice}>{renderPrice(item)}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Catálogo de Allwain</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Busca ofertas</Text>
        <TextInput
          style={styles.input}
          placeholder="Introduce un texto"
          placeholderTextColor={colors.mutedText}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
      </View>

      {loading && filteredResults.length === 0 ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateText}>Cargando catálogo…</Text>
        </View>
      ) : null}

      {error ? (
        <Text style={styles.error}>No se pudo cargar el catálogo</Text>
      ) : null}

      {!loading && !error && filteredResults.length === 0 ? (
        <View style={styles.stateBox}>
          <Text style={styles.stateText}>No hay resultados que coincidan.</Text>
        </View>
      ) : null}

      <FlatList
        data={filteredResults}
        keyExtractor={(item) => item.id}
        renderItem={renderOffer}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20 },
  heading: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 14,
  },
  label: { color: colors.mutedText, fontWeight: "700", marginBottom: 6 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    color: colors.text,
  },
  error: { color: colors.danger, fontWeight: "700", marginTop: 8 },
  stateBox: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
    marginBottom: 10,
  },
  stateText: { color: colors.text, fontWeight: "700" },
  resultCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
    marginBottom: 10,
  },
  resultTitle: { color: colors.text, fontWeight: "700", fontSize: 16 },
  resultPrice: { color: colors.text, fontWeight: "800", marginTop: 4 },
  resultBody: { color: colors.mutedText, fontWeight: "600", marginTop: 4 },
  listContent: { paddingBottom: 20 },
});

