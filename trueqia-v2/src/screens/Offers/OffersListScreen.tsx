import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  FlatList,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { colors } from "../../config/theme";
import { useOffersStore } from "../../store/offers.store";

type Filter = "all" | "product" | "service";

function getCategory(item: any): Filter {
  const raw =
    (item?.category as string | undefined) ||
    (item?.type as string | undefined) ||
    (item?.kind as string | undefined) ||
    (item?.tags as string[] | undefined)?.join(" ");

  const value = (raw || "").toLowerCase();
  if (value.includes("prod")) return "product";
  if (value.includes("serv")) return "service";
  return "all";
}

export default function OffersListScreen({ navigation }: any) {
  const items = useOffersStore((s) => s.items);
  const loading = useOffersStore((s) => s.loading);
  const error = useOffersStore((s) => s.error);
  const loadOffers = useOffersStore((s) => s.loadOffers);

  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    loadOffers();
  }, [loadOffers]);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.title.localeCompare(b.title)),
    [items],
  );

  const visibleItems = useMemo(() => {
    if (filter === "all") return sortedItems;
    return sortedItems.filter((item) => {
      const c = getCategory(item);
      return c === filter || c === "all";
    });
  }, [filter, sortedItems]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Ofertas</Text>
          <Text style={styles.subtitle}>Productos y servicios listos para trueque</Text>
        </View>

        <TouchableOpacity
          style={styles.createButton}
          onPress={() => navigation.navigate("CreateOffer")}
          activeOpacity={0.9}
        >
          <Text style={styles.createButtonText}>Crear oferta</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filtersRow}>
        {(
          [
            { key: "all", label: "Todas" },
            { key: "product", label: "Productos" },
            { key: "service", label: "Servicios" },
          ] as { key: Filter; label: string }[]
        ).map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.filterChip, filter === key && styles.filterChipActive]}
            onPress={() => setFilter(key)}
            activeOpacity={0.9}
          >
            <Text style={[styles.filterText, filter === key && styles.filterTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
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
              ? "Sesión expirada, vuelve a iniciar sesión."
              : `No pudimos cargar las ofertas: ${error}`}
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadOffers} activeOpacity={0.9}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        style={{ marginTop: 12 }}
        data={visibleItems}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate("ContractPreview", { offer: item })}
            activeOpacity={0.9}
          >
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              {item.description ? (
                <Text style={styles.description}>{item.description}</Text>
              ) : null}
              {typeof item.tokens === "number" ? (
                <Text style={styles.tokens}>{item.tokens} tokens</Text>
              ) : null}
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading && !error ? (
            <Text style={styles.statusText}>Aún no hay ofertas disponibles.</Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: colors.background },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  title: { fontSize: 24, marginBottom: 4, color: colors.text, fontWeight: "900" },
  subtitle: { color: colors.muted, fontWeight: "700" },

  createButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  createButtonText: { color: "#0b0c0e", fontWeight: "900" },

  filtersRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    marginBottom: 6,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterChipActive: {
    borderColor: colors.primary,
    backgroundColor: "#1f2428",
  },
  filterText: { color: colors.muted, fontWeight: "800" },
  filterTextActive: { color: colors.text },

  card: {
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  cardTitle: { fontWeight: "900", color: colors.text, fontSize: 16 },
  description: { color: colors.muted, fontWeight: "700" },
  tokens: { color: colors.primary, fontWeight: "900" },

  statusBox: { marginTop: 12, gap: 8 },
  statusText: { color: colors.muted, marginTop: 2, fontWeight: "700" },
  errorText: { color: "#ffaba3" },
  retryButton: {
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: "flex-start",
  },
  retryText: { color: colors.text, fontWeight: "900" },
});
