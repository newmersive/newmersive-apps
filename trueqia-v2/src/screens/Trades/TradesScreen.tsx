import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { colors } from "../../config/theme";
import { useTradesStore } from "../../store/trades.store";

export default function TradesScreen({ navigation }: any) {
  const items = useTradesStore((s) => s.items);
  const loading = useTradesStore((s) => s.loading);
  const error = useTradesStore((s) => s.error);
  const loadTrades = useTradesStore((s) => s.loadTrades);
  const acceptTrade = useTradesStore((s) => s.acceptTrade);
  const rejectTrade = useTradesStore((s) => s.rejectTrade);
  const [actionLoading, setActionLoading] = useState<
    Record<string, "accept" | "reject" | null>
  >({});
  const [actionError, setActionError] = useState<string | null>(null);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.title.localeCompare(b.title)),
    [items]
  );

  useEffect(() => {
    loadTrades();
  }, [loadTrades]);

  async function handleAction(id: string, action: "accept" | "reject") {
    setActionError(null);
    setActionLoading((prev) => ({ ...prev, [id]: action }));
    const res =
      action === "accept" ? await acceptTrade(id) : await rejectTrade(id);
    if (!res) {
      setActionError("No se pudo actualizar el trueque. Intenta de nuevo.");
    }
    setActionLoading((prev) => ({ ...prev, [id]: null }));
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Trueques activos</Text>
      <TouchableOpacity onPress={loadTrades} style={styles.reloadButton}>
        <Text style={styles.reloadText}>Actualizar</Text>
      </TouchableOpacity>

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

      {actionError && (
        <Text style={[styles.statusText, { color: "#B3261E" }]}>{actionError}</Text>
      )}

      <FlatList
        data={sortedItems}
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
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.actionButton, styles.acceptButton]}
                onPress={() => handleAction(item.id, "accept")}
                disabled={actionLoading[item.id] === "accept"}
              >
                {actionLoading[item.id] === "accept" ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.actionText}>Aceptar</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.rejectButton]}
                onPress={() => handleAction(item.id, "reject")}
                disabled={actionLoading[item.id] === "reject"}
              >
                {actionLoading[item.id] === "reject" ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.actionText}>Rechazar</Text>
                )}
              </TouchableOpacity>
            </View>
            {item.status === "accepted" && (
              <TouchableOpacity
                style={styles.contractButton}
                onPress={() => navigation.navigate("ContractPreview", { trade: item })}
              >
                <Text style={styles.contractText}>Ver contrato</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        ListEmptyComponent={
          !loading && !error ? (
            <Text style={styles.statusText}>Todavía no tienes trueques activos.</Text>
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
  reloadButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: colors.primary,
    marginTop: 8,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  reloadText: {
    color: "#FFF",
    fontWeight: "700",
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
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  acceptButton: {
    backgroundColor: "#0E9F6E",
  },
  rejectButton: {
    backgroundColor: "#C1121F",
  },
  actionText: {
    color: "#FFF",
    fontWeight: "700",
  },
  contractButton: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  contractText: {
    color: "#FFF",
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
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
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
