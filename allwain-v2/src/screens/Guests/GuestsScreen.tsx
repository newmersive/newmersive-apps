import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { apiAuthGet, SponsorSummaryResponse } from "../../config/api";
import { colors } from "../../theme/colors";

export default function GuestsScreen() {
  const [summary, setSummary] = useState<SponsorSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiAuthGet<SponsorSummaryResponse>(
        "/allwain/sponsors/summary",
      );
      setSummary(res);
    } catch (err: any) {
      setError(err?.message || "No se pudo cargar el panel de invitados");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const hasReferrals = (summary?.referrals?.length || 0) > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Tu red de invitados</Text>
      <Text style={styles.subtitle}>
        Consulta el ahorro generado y las comisiones acumuladas por tus invitados.
      </Text>

      {loading && (
        <View style={styles.stateBox}>
          <ActivityIndicator color={colors.card} />
          <Text style={styles.stateText}>Cargando invitados…</Text>
        </View>
      )}

      {error && (
        <View style={styles.stateBox}>
          <Text style={[styles.stateText, styles.error]}>{error}</Text>
          <TouchableOpacity style={styles.button} onPress={loadSummary}>
            <Text style={styles.buttonText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && !error && !summary && (
        <View style={styles.stateBox}>
          <Text style={styles.stateText}>
            Aún no tenemos datos de tu red de invitados.
          </Text>
          <Text style={styles.stateHelper}>
            Comparte tu código para comenzar a sumar ahorros y comisiones.
          </Text>
        </View>
      )}

      {summary && (
        <View style={styles.totalsCard}>
          <Text style={styles.sectionLabel}>Resumen</Text>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total ganado</Text>
            <Text style={styles.totalValue}>€{summary.totalCommission.toFixed(2)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Ahorro estimado</Text>
            <Text style={styles.totalValue}>€{summary.totalSaved.toFixed(2)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Invitados activos</Text>
            <Text style={styles.totalValue}>{summary.invitedCount}</Text>
          </View>
          <Text style={styles.helperText}>
            Balance disponible: €{summary.balance.toFixed(2)}
          </Text>
        </View>
      )}

      {summary && hasReferrals ? (
        <View style={styles.listContainer}>
          <Text style={styles.sectionLabel}>Invitados</Text>
          <FlatList
            data={summary.referrals}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Text style={styles.invitedName}>
                  {item.invitedName || item.invitedUserId}
                </Text>
                <Text style={styles.muted}>
                  Ahorro generado: €{item.totalSavedByInvited.toFixed(2)}
                </Text>
                <Text style={styles.muted}>
                  Comisión: €{item.commissionEarned.toFixed(2)}
                </Text>
              </View>
            )}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          />
        </View>
      ) : null}

      {summary && !hasReferrals && !loading ? (
        <View style={styles.stateBox}>
          <Text style={styles.stateText}>Aún no tienes invitados registrados.</Text>
          <Text style={styles.stateHelper}>
            Comparte tus invitaciones para comenzar a generar ahorro en red.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  content: { padding: 20, gap: 12 },
  title: { fontSize: 24, fontWeight: "800", color: colors.card },
  subtitle: {
    color: colors.card,
    fontWeight: "600",
    opacity: 0.95,
    marginBottom: 8,
  },
  sectionLabel: { color: colors.mutedText, fontWeight: "800", marginBottom: 8 },
  stateBox: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  stateText: { color: colors.text, fontWeight: "700", marginBottom: 4 },
  stateHelper: { color: colors.mutedText, fontWeight: "600" },
  error: { color: colors.danger },
  button: {
    marginTop: 8,
    backgroundColor: colors.card,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  buttonText: { color: colors.text, fontWeight: "800" },
  totalsCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
    gap: 10,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: { color: colors.mutedText, fontWeight: "700" },
  totalValue: { color: colors.text, fontWeight: "800", fontSize: 18 },
  helperText: { color: colors.mutedText, fontWeight: "600" },
  listContainer: { gap: 8 },
  card: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.card,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  invitedName: { fontSize: 16, fontWeight: "700", color: colors.text },
  muted: { color: colors.mutedText, fontWeight: "600" },
});
