import React, { useCallback, useEffect, useMemo, useState } from "react";
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
      setError("No se pudo cargar el panel de invitados");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const hasReferrals = useMemo(
    () => Boolean(summary?.referrals && summary.referrals.length > 0),
    [summary],
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Patrocinadores e invitados</Text>
      <Text style={styles.subtitle}>
        Consulta el ahorro generado y las comisiones acumuladas por tus invitados.
      </Text>

      {loading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateText}>Cargando invitados…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.stateBox}>
          <Text style={[styles.stateText, styles.error]}>{error}</Text>
          <TouchableOpacity style={styles.button} onPress={loadSummary}>
            <Text style={styles.buttonText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!loading && !error && !summary ? (
        <View style={styles.stateBox}>
          <Text style={styles.stateText}>
            Aún no tenemos datos de tu red de invitados.
          </Text>
          <Text style={styles.helper}>
            Comparte tu código para comenzar a sumar ahorros y comisiones.
          </Text>
        </View>
      ) : null}

      {summary ? (
        <View style={styles.totalsCard}>
          <Text style={styles.sectionLabel}>Resumen</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Total ganado</Text>
            <Text style={styles.rowValue}>€{summary.totalCommission.toFixed(2)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Ahorro estimado</Text>
            <Text style={styles.rowValue}>€{summary.totalSaved.toFixed(2)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Invitados activos</Text>
            <Text style={styles.rowValue}>{summary.invitedCount}</Text>
          </View>
          <Text style={styles.helper}>Balance disponible: €{summary.balance.toFixed(2)}</Text>
        </View>
      ) : null}

      {summary && hasReferrals ? (
        <View style={styles.listContainer}>
          <Text style={styles.sectionLabel}>Invitados</Text>
          <FlatList
            data={summary.referrals}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
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
          />
        </View>
      ) : null}

      {summary && !hasReferrals && !loading ? (
        <View style={styles.stateBox}>
          <Text style={styles.stateText}>Aún no tienes invitados registrados.</Text>
          <Text style={styles.helper}>
            Comparte tus invitaciones para comenzar a generar ahorro en red.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  content: { padding: 18, paddingBottom: 32, gap: 10 },
  title: {
    color: colors.card,
    fontSize: 24,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.card,
    opacity: 0.9,
    fontWeight: "600",
    marginBottom: 10,
  },
  stateBox: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
    gap: 8,
  },
  stateText: { color: colors.text, fontWeight: "700" },
  helper: { color: colors.mutedText, fontWeight: "600" },
  error: { color: colors.danger },
  button: {
    backgroundColor: colors.button,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonText: { color: colors.buttonText, fontWeight: "800" },
  totalsCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
    gap: 8,
  },
  sectionLabel: { color: colors.text, fontWeight: "800", fontSize: 16 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  rowLabel: { color: colors.mutedText, fontWeight: "700" },
  rowValue: { color: colors.text, fontWeight: "800" },
  listContainer: { gap: 10 },
  card: {
    backgroundColor: colors.card,
    padding: 14,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
    gap: 4,
  },
  invitedName: { color: colors.text, fontWeight: "800", fontSize: 16 },
  muted: { color: colors.mutedText, fontWeight: "600" },
});
