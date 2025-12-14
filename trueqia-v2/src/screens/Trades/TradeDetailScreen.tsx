import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { colors } from "../../config/theme";
import { Trade, useTradesStore } from "../../store/trades.store";

export default function TradeDetailScreen({ route, navigation }: any) {
  const items = useTradesStore((s) => s.items || []);
  const storeError = useTradesStore((s) => s.error);
  const fetchTradeById = useTradesStore((s) => s.fetchTradeById);
  const acceptTrade = useTradesStore((s) => s.acceptTrade);
  const rejectTrade = useTradesStore((s) => s.rejectTrade);

  const tradeId: string | undefined = route?.params?.tradeId || route?.params?.trade?.id;

  const [trade, setTrade] = useState<Trade | null>(route?.params?.trade || null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<"accept" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const participants = useMemo(
    () => (trade?.participants && trade.participants.length > 0 ? trade.participants.join(" • ") : null),
    [trade?.participants],
  );

  useEffect(() => {
    if (!tradeId) return;
    const existing = items.find((item) => item.id === tradeId);
    if (existing) {
      setTrade(existing);
    }
  }, [items, tradeId]);

  useEffect(() => {
    if (trade || !tradeId) return;
    setError(null);
    setLoading(true);
    fetchTradeById(tradeId)
      .then((res) => {
        if (res) {
          setTrade(res);
        } else {
          setError("No pudimos cargar los detalles del trueque.");
        }
      })
      .catch(() => setError("No pudimos cargar los detalles del trueque."))
      .finally(() => setLoading(false));
  }, [fetchTradeById, trade, tradeId]);

  async function handleAction(action: "accept" | "reject") {
    if (!tradeId || !trade) return;
    setActionLoading(action);
    setError(null);
    const result = action === "accept" ? await acceptTrade(tradeId) : await rejectTrade(tradeId);
    if (result) {
      setTrade(result);
      if (action === "accept") {
        navigation.navigate("ContractPreview", { trade: result, offer: result.offer });
      }
    } else {
      setError("No se pudo actualizar el trueque. Intenta nuevamente.");
    }
    setActionLoading(null);
  }

  const showError = error || storeError;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
      {loading && (
        <View style={styles.statusBox}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>Cargando trueque…</Text>
        </View>
      )}

      {showError && <Text style={[styles.muted, { color: "#B3261E" }]}>{showError}</Text>}

      {trade && (
        <>
          <Text style={styles.title}>{trade.title || "Trueque"}</Text>
          {trade.status && <Text style={styles.badge}>{trade.status}</Text>}
          {trade.description && <Text style={styles.description}>{trade.description}</Text>}

          {participants && <Text style={styles.meta}>Participantes: {participants}</Text>}
          {typeof trade.tokens === "number" && (
            <Text style={styles.meta}>Equilibrio sugerido: {trade.tokens} tokens</Text>
          )}
          {trade.ownerId && <Text style={styles.meta}>Propietario: {trade.ownerId}</Text>}
          {trade.offerId && <Text style={styles.meta}>Oferta origen: {trade.offerId}</Text>}

          <Text style={styles.helper}>
            Aquí podrás ver las condiciones del trueque, mensajes relevantes y el contrato generado
            por la IA.
          </Text>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionButton, styles.acceptButton]}
              onPress={() => handleAction("accept")}
              disabled={actionLoading === "accept"}
            >
              {actionLoading === "accept" ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.actionText}>Aceptar</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.rejectButton]}
              onPress={() => handleAction("reject")}
              disabled={actionLoading === "reject"}
            >
              {actionLoading === "reject" ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.actionText}>Rechazar</Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}

      {!trade && !loading && !showError && (
        <Text style={styles.muted}>No pudimos encontrar este trueque.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
  },
  badge: {
    color: colors.primary,
    fontWeight: "700",
    marginTop: 6,
  },
  description: {
    color: colors.muted,
    lineHeight: 20,
    marginTop: 8,
  },
  meta: {
    color: colors.text,
    fontWeight: "600",
    marginTop: 8,
  },
  helper: {
    color: colors.muted,
    lineHeight: 20,
    marginTop: 12,
  },
  statusBox: {
    marginTop: 20,
    gap: 8,
  },
  muted: {
    color: colors.muted,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
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
});
