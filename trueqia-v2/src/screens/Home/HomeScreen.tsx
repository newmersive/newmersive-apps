import React, { useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useAuthStore } from "../../store/auth.store";
import { useOffersStore } from "../../store/offers.store";
import { colors } from "../../config/theme";
import { spacing } from "../../config/layout";

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const { items, loading, error, loadOffers } = useOffersStore();

  useFocusEffect(
    useCallback(() => {
      loadOffers();
    }, [loadOffers])
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hola {user?.name || "usuario"} 👋</Text>
      <Text style={styles.subtitle}>
        Bienvenido a TrueQIA. Desde aquí podrás ver ofertas reales y explorar
        trueques.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Tu cuenta</Text>
        <Text style={styles.cardBody}>Nombre: {user?.name || "-"}</Text>
        <Text style={styles.cardBody}>Email: {user?.email || "-"}</Text>
      </View>

      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Ofertas destacadas</Text>
        <TouchableOpacity onPress={() => navigation.navigate("Offers")}>
          <Text style={styles.link}>Ver todas</Text>
        </TouchableOpacity>
      </View>

      {loading && (
        <View style={styles.statusBox}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.statusText}>Cargando ofertas…</Text>
        </View>
      )}

      {error && !loading && (
        <View style={styles.statusBox}>
          <Text style={[styles.statusText, styles.errorText]}>
            {error === "SESSION_EXPIRED"
              ? "Sesión expirada, inicia sesión nuevamente"
              : `No pudimos cargar las ofertas: ${error}`}
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadOffers}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && !error && (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <Text style={styles.statusText}>No hay ofertas disponibles.</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.offerCard}>
              <Text style={styles.offerTitle}>{item.title}</Text>
              {item.description && (
                <Text style={styles.offerDescription}>{item.description}</Text>
              )}
              {typeof item.tokens === "number" && (
                <Text style={styles.tokens}>{item.tokens} tokens</Text>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.l,
    backgroundColor: colors.background,
    justifyContent: "center",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.m,
    marginBottom: spacing.s,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    marginBottom: spacing.s,
    color: colors.text,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.muted,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  link: {
    color: colors.primary,
    fontWeight: "700",
  },
  card: {
    marginTop: spacing.m,
    padding: spacing.m,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 6,
  },
  cardTitle: {
    fontWeight: "800",
    color: colors.text,
    marginBottom: 4,
  },
  cardBody: {
    color: colors.muted,
  },
  statusBox: {
    marginTop: spacing.s,
    marginBottom: spacing.s,
    gap: 6,
  },
  statusText: {
    color: colors.muted,
  },
  errorText: {
    color: "#B3261E",
  },
  retryButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  retryText: {
    color: "#fff",
    fontWeight: "700",
  },
  offerCard: {
    padding: spacing.m,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    marginBottom: spacing.s,
    gap: 6,
  },
  offerTitle: {
    fontWeight: "800",
    color: colors.text,
  },
  offerDescription: {
    color: colors.muted,
  },
  tokens: {
    color: colors.primary,
    fontWeight: "700",
  },
});
