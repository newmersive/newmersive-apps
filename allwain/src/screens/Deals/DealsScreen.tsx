import React, { useEffect, useState } from "react";
import { ScrollView, Text, StyleSheet, TouchableOpacity, ActivityIndicator, View } from "react-native";
import { getAllwainOffers, Offer } from "../../api/allwain.api";
import { colors } from "../../theme/colors";

export default function DealsScreen({ navigation }: any) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadOffers() {
    try {
      setLoading(true);
      setError(null);
      const data = await getAllwainOffers();
      setOffers(data);
    } catch (err: any) {
      if (err?.message === "AUTH_EXPIRED") {
        setError("Sesión expirada. Vuelve a iniciar sesión.");
      } else {
        setError("No se pudieron cargar las ofertas.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOffers();
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Ofertas de Allwain</Text>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => navigation.navigate("Scan")}
        activeOpacity={0.9}
      >
        <Text style={styles.primaryButtonText}>Escanear y buscar precio</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => navigation.navigate("Guests")}
        activeOpacity={0.9}
      >
        <Text style={styles.secondaryButtonText}>Ver invitados y comisiones</Text>
      </TouchableOpacity>

      {loading && <ActivityIndicator style={styles.loader} color={colors.dark} />}

      {error && (
        <View style={styles.infoBox}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity style={styles.linkButton} onPress={loadOffers} activeOpacity={0.9}>
            <Text style={styles.linkButtonText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && !error && offers.length === 0 && (
        <Text style={styles.empty}>No hay ofertas disponibles ahora mismo.</Text>
      )}

      {offers.map((deal) => (
        <View key={deal.id} style={styles.card}>
          <Text style={styles.title}>{deal.title}</Text>
          <Text style={styles.price}>{deal.tokens} tokens</Text>
          <Text style={styles.saving}>{deal.description}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.salmon,
  },
  content: {
    padding: 20,
    paddingBottom: 32,
  },
  heading: {
    color: colors.dark,
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 10,
  },
  primaryButton: {
    backgroundColor: colors.dark,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  primaryButtonText: { color: colors.white, fontWeight: "800" },
  secondaryButton: {
    backgroundColor: colors.white,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.dark,
  },
  secondaryButtonText: { color: colors.dark, fontWeight: "800" },
  loader: { marginVertical: 10 },
  infoBox: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 12,
  },
  linkButton: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.dark,
  },
  linkButtonText: { color: colors.white, fontWeight: "800" },
  error: { color: colors.dark, fontWeight: "700" },
  empty: { color: colors.dark, fontWeight: "700", marginBottom: 12 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.line,
    shadowColor: colors.dark,
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  title: {
    color: colors.dark,
    fontWeight: "700",
    fontSize: 16,
    marginBottom: 6,
  },
  price: { color: colors.dark, fontWeight: "800", marginBottom: 4 },
  saving: { color: colors.muted, fontWeight: "700" },
});
