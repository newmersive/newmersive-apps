import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, FlatList, TouchableOpacity } from "react-native";
import { apiAuthGet, SponsorSummaryResponse } from "../../config/api";
import { colors } from "../../theme/colors";

export default function GuestsScreen() {
  const [summary, setSummary] = useState<SponsorSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSummary() {
    try {
      setLoading(true);
      setError(null);
      const res = await apiAuthGet<SponsorSummaryResponse>("/allwain/sponsors/summary");
      setSummary(res);
    } catch (err) {
      setError("No se pudo cargar el panel de invitados");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSummary();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Panel de invitados</Text>
      <Text style={styles.muted}>
        Resumen real de referidos: ahorro total, comisiones y balance actual.
      </Text>

      <TouchableOpacity onPress={loadSummary} style={styles.reloadButton}>
        <Text style={styles.reloadText}>Actualizar</Text>
      </TouchableOpacity>

      {loading && <ActivityIndicator />}
      {error && <Text style={styles.error}>{error}</Text>}

      {summary && (
        <View style={styles.card}>
          <Text style={styles.highlight}>Invitados: {summary.invitedCount}</Text>
          <Text style={styles.muted}>Ahorro total: €{summary.totalSaved.toFixed(2)}</Text>
          <Text style={styles.muted}>
            Comisión acumulada: €{summary.totalCommission.toFixed(2)}
          </Text>
          <Text style={styles.muted}>Balance disponible: €{summary.balance.toFixed(2)}</Text>
        </View>
      )}

      {summary && summary.referrals.length > 0 && (
        <FlatList
          data={summary.referrals}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.offerTitle}>{item.invitedName || item.invitedUserId}</Text>
              <Text style={styles.muted}>
                Ahorro generado: €{item.totalSavedByInvited.toFixed(2)}
              </Text>
              <Text style={styles.muted}>
                Comisión: €{item.commissionEarned.toFixed(2)}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: "700", color: colors.text },
  error: { color: colors.danger },
  muted: { color: colors.mutedText },
  card: {
    padding: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.card,
    gap: 4,
  },
  offerTitle: { fontSize: 16, fontWeight: "600", color: colors.text },
  highlight: { fontSize: 18, fontWeight: "700", color: colors.primary },
  reloadButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  reloadText: {
    color: "#fff",
    fontWeight: "700",
  },
});
