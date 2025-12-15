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

function guessCategory(item: any): Filter {
  const raw =
    (item?.category as string | undefined) ||
    (item?.type as string | undefined) ||
    (item?.kind as string | undefined) ||
    (item?.tags as string[] | undefined)?.join(" ");

  const v = (raw || "").toLowerCase();
  if (v.includes("prod")) return "product";
  if (v.includes("serv")) return "service";
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

  const sorted = useMemo(
    () => [...items].sort((a, b) => a.title.localeCompare(b.title)),
    [items],
  );

  const visible = useMemo(() => {
    if (filter === "all") return sorted;
    return sorted.filter((it) => {
      const c = guessCategory(it);
      return c === filter || c === "all";
    });
  }, [filter, sorted]);

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
            style={[styles.chip, filter === key && styles.chipActive]}
            onPress={() => setFilter(key)}
            activeOpacity={0.9}
          >
            <Text style={[styles.chipText, filter === key && styles.chipTextActive]}>
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
        style={{ marginTop: 10 }}
        data={visible}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate("ContractPreview", { offer: item })}
            activeOpacity={0.9}
          >
            <Text style={styles.cardTitle}>{item.title}</Text>
            {item.description ? (
              <Text style={styles.cardDesc}>{item.description}</Text>
            ) : null}
            {typeof item.tokens === "number" ? (
              <Text style={styles.tokens}>{item.tokens} tokens</Text>
            ) : null}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading && !error ? (
            <Text style={styles.statusText}>Aún no hay ofertas disponibles.</Text>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: 18 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 18, backgroundColor: colors.background },

  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontSize: 22, fontWeight: "900", color: colors.text },
  subtitle: { color: colors.muted, fontWeight: "700", marginTop: 2 },

  createButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  createButtonText: { color: "#0b0c0e", fontWeight: "900" },

  filtersRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: "#1f2428" },
  chipText: { color: colors.muted, fontWeight: "800" },
  chipTextActive: { color: colors.text },

  statusBox: { marginTop: 12, gap: 8 },
  statusText: { color: colors.muted, fontWeight: "700" },
  errorText: { color: "#ffaba3" },
  retryButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  retryText: { color: colors.text, fontWeight: "900" },

  card: {
    marginBottom: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 14,
    elevation: 4,
  },
  cardTitle: { color: colors.text, fontWeight: "900", fontSize: 16 },
  cardDesc: { color: colors.muted, marginTop: 6, fontWeight: "700" },
  tokens: { color: colors.primary, marginTop: 8, fontWeight: "900" },
});
