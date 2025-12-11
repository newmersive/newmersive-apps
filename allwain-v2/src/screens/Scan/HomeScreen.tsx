import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  AllwainOffer,
  ScanDemoResponse,
  apiAuthGet,
  SponsorSummaryResponse,
} from "../../config/api";
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
  const [lastScan, setLastScan] = useState<ScanDemoResponse | null>(null);
  const [featuredOffers, setFeaturedOffers] = useState<AllwainOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiAuthGet<SponsorSummaryResponse>(
        "/allwain/sponsors/summary",
      );
      setSummary(response);

      try {
        const [scanDemo, offers] = await Promise.all([
          apiAuthGet<ScanDemoResponse>("/allwain/scan-demo"),
          apiAuthGet<{ items: AllwainOffer[] }>("/allwain/offers"),
        ]);

        setLastScan(scanDemo);
        setFeaturedOffers(offers?.items || []);
      } catch (secondaryError) {
        console.warn("Datos adicionales de demo no disponibles", secondaryError);
      }
    } catch (err: any) {
      setError("No se ha podido cargar la información de Allwain.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const cards: SummaryCard[] = useMemo(
    () =>
      summary
        ? [
            {
              label: "Ahorro total",
              value: `€${summary.totalSaved.toFixed(2)}`,
            },
            {
              label: "Invitados",
              value: summary.invitedCount.toString(),
            },
            {
              label: "Comisión total",
              value: `€${summary.totalCommission.toFixed(2)}`,
            },
            {
              label: "Balance",
              value: `€${summary.balance.toFixed(2)}`,
            },
          ]
        : [],
    [summary],
  );

  const renderState = () => {
    if (loading && !summary) {
      return (
        <View style={styles.stateCard}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateText}>Cargando panel de Allwain…</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.stateCard}>
          <Text style={[styles.stateText, styles.stateError]}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadData}>
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
            </View>
          ))}
        </View>
      )}

      {lastScan?.product ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Último producto escaneado</Text>
          <Text style={styles.sectionItem}>{lastScan.product.name}</Text>
          {lastScan.product.ean ? (
            <Text style={styles.sectionMeta}>EAN: {lastScan.product.ean}</Text>
          ) : null}
          {lastScan.product.description ? (
            <Text style={styles.sectionMeta}>{lastScan.product.description}</Text>
          ) : null}
        </View>
      ) : null}

      {featuredOffers.length > 0 ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Ofertas destacadas</Text>
          {featuredOffers.map((offer) => (
            <View key={offer.id} style={styles.offerRow}>
              <Text style={styles.offerTitle}>{offer.title}</Text>
              <Text style={styles.offerDescription}>{offer.description}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <TouchableOpacity style={styles.primaryButton} activeOpacity={0.92}>
        <Text style={styles.primaryButtonText}>Escanear producto</Text>
      </TouchableOpacity>
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
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    marginTop: 14,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
    gap: 6,
  },
  sectionTitle: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 16,
    marginBottom: 2,
  },
  sectionItem: { color: colors.text, fontWeight: "700", fontSize: 15 },
  sectionMeta: { color: colors.mutedText, fontWeight: "600" },
  offerRow: {
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: 8,
    marginTop: 6,
    gap: 2,
  },
  offerTitle: { color: colors.text, fontWeight: "700" },
  offerDescription: { color: colors.mutedText, fontWeight: "600" },
  primaryButton: {
    marginTop: 18,
    backgroundColor: colors.button,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 3,
  },
  primaryButtonText: {
    color: colors.buttonText,
    fontWeight: "800",
    fontSize: 16,
  },
});

