import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useAuthStore } from "../store/auth.store";
import { useOffersStore } from "../store/offers.store";

export default function HomeScreen() {
  const user = useAuthStore((s) => s.user);
  const { items: offers, loading, error, loadOffers } = useOffersStore();

  useFocusEffect(
    useCallback(() => {
      loadOffers();
    }, [loadOffers])
  );

  const onRefresh = async () => {
    await loadOffers();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>TrueQIA</Text>
      <Text style={styles.subtitle}>
        Sesión iniciada como: {user?.name ?? user?.email ?? "pionero"}
      </Text>

      {loading && offers.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.helper}>Cargando ofertas…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={offers}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <Text style={styles.helper}>
              De momento no hay ofertas activas.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              {item.description ? (
                <Text style={styles.cardDesc}>{item.description}</Text>
              ) : null}
              {typeof item.tokens === "number" ? (
                <Text style={styles.cardMeta}>
                  {item.tokens} tokens ofrecidos
                </Text>
              ) : null}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.8,
    marginBottom: 8,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  helper: {
    fontSize: 14,
    opacity: 0.7,
  },
  error: {
    fontSize: 14,
    color: "red",
  },
  card: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: "#f3f3f3",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 14,
    marginBottom: 4,
  },
  cardMeta: {
    fontSize: 12,
    opacity: 0.7,
  },
});
