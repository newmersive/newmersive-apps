import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useAuthStore } from "../store/auth.store";

type TrueqiaOffer = {
  id: string;
  title: string;
  description?: string;
  tokens?: number;
};

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

export default function HomeScreen() {
  const user = useAuthStore((s) => s.user);
  // 👇 ajusta esta línea si en tu store el token se llama distinto
  const token = useAuthStore((s) => (s as any).token as string | undefined);

  const [offers, setOffers] = useState<TrueqiaOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOffers = useCallback(async () => {
    if (!token) {
      setError("Falta token de sesión");
      return;
    }

    try {
      setError(null);
      setLoading(true);

      const res = await fetch(`${API_BASE_URL}/trueqia/offers`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const text = await res.text();
        console.warn("Error /trueqia/offers:", res.status, text);
        setError(`Error ${res.status} al cargar ofertas`);
        return;
      }

      const data = await res.json();
      // el backend devuelve normalmente { items: [...] } o un array directo
      const items: TrueqiaOffer[] = Array.isArray(data)
        ? data
        : Array.isArray(data.items)
        ? data.items
        : [];

      setOffers(items);
    } catch (e: any) {
      console.error("Error fetch /trueqia/offers", e);
      setError("No se ha podido conectar con el servidor");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadOffers();
  }, [loadOffers]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOffers();
    setRefreshing(false);
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
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
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
