import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { apiAuthGet, SponsorSummaryResponse } from "../../config/api";
import { useAuthStore } from "../../store/auth.store";
import { colors } from "../../theme/colors";

type SummaryCard = {
  label: string;
  value: string;
  helper?: string;
};

export default function HomeScreen() {
  const user = useAuthStore((s) => s.user);

  const [summary, setSummary] = useState<SponsorSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiAuthGet<SponsorSummaryResponse>(
        "/allwain/sponsors/summary",
      );
      setSummary(response);
    } catch (err: any) {
      const message = err?.message || "No se ha podido cargar la información";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const cards: SummaryCard[] = summary
    ? [
        {
          label: "Ahorro total acumulado",
          value: `€${summary.totalSaved.toFixed(2)}`,
          helper: "Incluye el ahorro generado por tu red",
        },
        {
          label: "Invitados",
          value: summary.invitedCount.toString(),
          helper: "Personas que usan tu código",
        },
        {
          label: "Comisiones totales",
          value: `€${summary.totalCommission.toFixed(2)}`,
          helper: "Pendientes y liquidadas",
        },
      ]
    : [];

  const renderState = () => {
    if (loading && !summary) {
      return (
        <View style={styles.stateCard}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateText}>Cargando datos de Allwain…</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.stateCard}>
          <Text style={[styles.stateText, styles.stateError]}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadSummary}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!summary) {
      return (
        <View style={styles.stateCard}>
          <Text style={styles.stateText}>
            Aún no hay datos disponibles sobre tu ahorro o invitaciones.
          </Text>
          <Text style={styles.stateHelper}>
            Invita a tus contactos para empezar a generar ahorro.
          </Text>
        </View>
      );
    }

    return null;
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Hola, {user?.name || "patrocinador"}</Text>
      <Text style={styles.subtitle}>
        Consulta tu panel de Allwain con tus ahorros, invitados y comisiones.
      </Text>

      {renderState()}

      {summary && (
        <View style={styles.cardsGrid}>
          {cards.map((card) => (
            <View key={card.label} style={styles.card}>
              <Text style={styles.cardLabel}>{card.label}</Text>
              <Text style={styles.cardValue}>{card.value}</Text>
              {card.helper ? (
                <Text style={styles.cardHelper}>{card.helper}</Text>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  content: {
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 32,
  },
  title: {
    color: colors.card,
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 6,
  },
  subtitle: {
    color: colors.card,
    opacity: 0.9,
    fontSize: 15,
    marginBottom: 16,
    fontWeight: "600",
  },
  stateCard: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 14,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  stateText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 6,
  },
  stateHelper: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: "600",
  },
  stateError: {
    color: colors.danger,
  },
  retryButton: {
    marginTop: 8,
    backgroundColor: colors.primary,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  retryText: {
    color: colors.buttonText,
    fontWeight: "800",
    fontSize: 15,
  },
  cardsGrid: {
    gap: 12,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  cardLabel: {
    color: colors.mutedText,
    fontWeight: "700",
    marginBottom: 6,
  },
  cardValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 4,
  },
  cardHelper: {
    color: colors.mutedText,
    fontWeight: "600",
  },
});
