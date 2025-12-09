import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { useTradesStore } from "../store/trades.store";
import { colors } from "../config/theme";

export default function TradesScreen() {
  const { items, loading, error, loadTrades } = useTradesStore();

  useEffect(() => {
    if (!items || items.length === 0) {
      loadTrades();
    }
  }, [items, loadTrades]);

  if (loading && (!items || items.length === 0)) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.text}>Cargando trueques…</Text>
      </View>
    );
  }

  if (error && (!items || items.length === 0)) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>
          Error al cargar trueques: {error}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Trueques recientes</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <View style={styles.row}>
              {item.status && (
                <Text style={styles.chip}>Estado: {item.status}</Text>
              )}
              {item.tokens != null && (
                <Text style={styles.chip}>{item.tokens} tokens</Text>
              )}
            </View>
            {item.participants && item.participants.length > 0 && (
              <Text style={styles.participants}>
                Participantes: {item.participants.join(", ")}
              </Text>
            )}
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.text}>
            No hay trueques todavía. Crea alguno desde el backend o demo.
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
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  chip: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  participants: {
    fontSize: 13,
    color: colors.text,
    opacity: 0.8,
    marginTop: 4,
  },
});
