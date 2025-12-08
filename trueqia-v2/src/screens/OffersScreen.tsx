import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { useOffersStore } from "../store/offers.store";
import { colors } from "../config/theme";

export default function OffersScreen() {
  const { items, loading, error, loadOffers } = useOffersStore();

  useEffect(() => {
    if (!items || items.length === 0) {
      loadOffers();
    }
  }, [items, loadOffers]);

  if (loading && (!items || items.length === 0)) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.text}>Cargando ofertas…</Text>
      </View>
    );
  }

  if (error && (!items || items.length === 0)) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>
          Error al cargar ofertas: {error}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ofertas disponibles</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            {item.description ? (
              <Text style={styles.cardDesc}>{item.description}</Text>
            ) : null}
            <View style={styles.cardFooter}>
              {item.tokens != null && (
                <Text style={styles.chip}>{item.tokens} tokens</Text>
              )}
              {item.owner?.name && (
                <Text style={styles.owner}>
                  Por: {item.owner.name}
                </Text>
              )}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.text}>
            No hay ofertas todavía. Crea alguna desde el backend o seed demo.
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
    gap: 12,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 4,
  },
  text: {
    fontSize: 14,
    color: colors.text,
    textAlign: "center",
  },
  error: {
    fontSize: 14,
    color: "red",
    textAlign: "center",
  },
  listContent: {
    paddingVertical: 8,
    gap: 8,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#ffffff",
    gap: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  cardDesc: {
    fontSize: 14,
    color: colors.text,
    opacity: 0.9,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    alignItems: "center",
  },
  chip: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  owner: {
    fontSize: 13,
    color: colors.text,
    opacity: 0.8,
  },
});
