import React, { useEffect } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { colors } from "../../config/theme";
import { useTradesStore } from "../../store/trades.store";

export default function TradesScreen() {
  const items = useTradesStore((s) => s.items);
  const loading = useTradesStore((s) => s.loading);
  const error = useTradesStore((s) => s.error);
  const loadTrades = useTradesStore((s) => s.loadTrades);

  useEffect(() => {
    loadTrades();
  }, [loadTrades]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Trueques activos</Text>

      {loading && (
        <View style={styles.statusBox}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.statusText}>Cargando trueques…</Text>
        </View>
      )}

      {error && (
        <View style={styles.statusBox}>
          <Text style={[styles.statusText, { color: "#B3261E" }]}>
            {error === "SESSION_EXPIRED"
              ? "Sesión expirada, vuelve a iniciar sesión."
              : "No pudimos cargar los trueques."}
          </Text>
          <TouchableOpacity onPress={loadTrades} style={styles.retryButton}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 12, paddingVertical: 12 }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            {item.status && <Text style={styles.badge}>{item.status}</Text>}
            {item.participants && (
              <Text style={styles.description}>
                Participantes: {item.participants.join(", ")}
              </Text>
            )}
            {typeof item.tokens === "number" && (
              <Text style={styles.tokens}>{`~${item.tokens} tokens`}</Text>
            )}
          </View>
        )}
        ListEmptyComponent={
          !loading && !error ? (
            <Text style={styles.statusText}>No hay trueques activos aún.</Text>
          ) : null
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
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 4,
  },
  description: {
    color: colors.muted,
    marginBottom: 8,
  },
  tokens: {
    color: colors.primary,
    fontWeight: "700",
  },
  statusBox: {
    marginTop: 12,
  },
  statusText: {
    color: colors.muted,
  },
  retryButton: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  retryText: {
    color: "#FFF",
    fontWeight: "700",
  },
  badge: {
    color: colors.primary,
    fontWeight: "700",
    marginTop: 4,
  },
});
