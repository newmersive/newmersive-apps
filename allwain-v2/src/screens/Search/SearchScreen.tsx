import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { colors } from "../../theme/colors";
import { apiAuthGet, AllwainOffer } from "../../config/api";

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const [offers, setOffers] = useState<AllwainOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigation = useNavigation<any>();

  const loadOffers = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await apiAuthGet<{ items: AllwainOffer[] }>("/allwain/offers");
      setOffers(res.items || []);
    } catch (err) {
      setError("No se pudo cargar el catálogo");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOffers();
  }, [loadOffers]);

  const filteredResults = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return offers;
    return offers.filter((item) => {
      const haystack = `${item.title} ${item.description || ""}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [offers, query]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={loadOffers} />}
    >
      <Text style={styles.heading}>¿Qué estás buscando?</Text>

      <View style={styles.card}>
        <TextInput
          style={styles.input}
          placeholder="Buscar productos o servicios"
          placeholderTextColor={colors.mutedText}
          value={query}
          onChangeText={setQuery}
        />
        <TouchableOpacity style={styles.button} activeOpacity={0.9}>
          <Text style={styles.buttonText}>Buscar mejor precio</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionCard, styles.highlighted]}
          onPress={() => navigation.navigate("Escanear")}
          activeOpacity={0.9}
        >
          <Text style={styles.actionTitle}>Escanear</Text>
          <Text style={styles.actionBody}>
            Lanza el flujo demo conectado al backend y ve el resultado.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate("ScanResult")}
          activeOpacity={0.9}
        >
          <Text style={styles.actionTitle}>Ver último resultado</Text>
          <Text style={styles.actionBody}>Abre la vista con el resultado del demo.</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subheading}>Resultados sugeridos</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      {loading && filteredResults.length === 0 ? (
        <ActivityIndicator color={colors.button} />
      ) : filteredResults.length === 0 ? (
        <Text style={styles.resultCompany}>No hay resultados que coincidan.</Text>
      ) : (
        filteredResults.map((item) => {
          const priceLabel =
            typeof item.price === "number"
              ? `${item.price.toFixed(2)} €`
              : typeof item.tokens === "number"
              ? `${item.tokens} tokens`
              : "Precio pendiente";
          return (
            <View key={item.id} style={styles.resultCard}>
              <View style={styles.resultHeader}>
                <Text style={styles.resultTitle}>{item.title}</Text>
                <Text style={styles.resultPrice}>{priceLabel}</Text>
              </View>
              {item.description ? (
                <Text style={styles.resultCompany}>{item.description}</Text>
              ) : null}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
  },
  heading: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 14,
  },
  subheading: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    color: colors.text,
  },
  button: {
    backgroundColor: colors.button,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 12,
  },
  buttonText: {
    color: colors.buttonText,
    fontWeight: "800",
    fontSize: 15,
  },
  actionsRow: {
    flexDirection: "row",
    columnGap: 12,
    marginBottom: 12,
  },
  actionCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  highlighted: {
    borderColor: colors.button,
    borderWidth: 1.2,
    backgroundColor: colors.highlight,
  },
  actionTitle: { color: colors.text, fontWeight: "800", marginBottom: 4 },
  actionBody: { color: colors.mutedText, fontWeight: "700" },
  resultCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  resultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  resultTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 16,
  },
  resultPrice: {
    color: colors.text,
    fontWeight: "800",
  },
  resultCompany: { color: colors.mutedText, fontWeight: "600" },
  error: { color: colors.danger, marginBottom: 8 },
});
