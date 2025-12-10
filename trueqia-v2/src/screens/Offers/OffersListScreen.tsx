import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  Button,
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Image,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useOffersStore } from "../../store/offers.store";
import { useTradesStore } from "../../store/trades.store";

export default function OffersListScreen({ navigation }: any) {
  const items = useOffersStore((s) => s.items);
  const loading = useOffersStore((s) => s.loading);
  const error = useOffersStore((s) => s.error);
  const loadOffers = useOffersStore((s) => s.loadOffers);
  const proposeTrade = useTradesStore((s) => s.proposeTrade);
  const [proposalStatus, setProposalStatus] = useState<Record<string, string | null>>({});

  useFocusEffect(
    useCallback(() => {
      loadOffers();
    }, [loadOffers])
  );

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.title.localeCompare(b.title)),
    [items]
  );

  async function handlePropose(offerId: string, ownerId?: string, tokens?: number) {
    if (!ownerId) {
      setProposalStatus((prev) => ({ ...prev, [offerId]: "Falta dueño" }));
      return;
    }
    setProposalStatus((prev) => ({ ...prev, [offerId]: "Enviando" }));
    const res = await proposeTrade({
      offerId,
      toUserId: ownerId,
      tokens: typeof tokens === "number" ? tokens : undefined,
    });
    if (res) {
      setProposalStatus((prev) => ({ ...prev, [offerId]: res.status || "pending" }));
    } else {
      setProposalStatus((prev) => ({ ...prev, [offerId]: "Error" }));
    }
  }

  return (
    <View style={{ flex: 1, padding: 24 }}>
      <View style={styles.headerRow}>
        <Text style={{ fontSize: 24, marginBottom: 12 }}>Ofertas</Text>
        <Button
          title="Crear"
          onPress={() => navigation.navigate("CreateOffer")}
          color="#0F6CBD"
        />
      </View>
      <Button title="Recargar" onPress={loadOffers} />

      {loading && (
        <View style={styles.statusBox}>
          <ActivityIndicator />
          <Text style={styles.statusText}>Cargando ofertas…</Text>
        </View>
      )}
      {error && (
        <View style={styles.statusBox}>
          <Text style={[styles.statusText, { color: "#C1121F" }]}>
            {error === "SESSION_EXPIRED"
              ? "Sesión expirada, vuelve a iniciar sesión."
              : `No pudimos cargar las ofertas: ${error}`}
          </Text>
          <Button title="Reintentar" onPress={loadOffers} />
        </View>
      )}

      <FlatList
        style={{ marginTop: 12 }}
        data={sortedItems}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.titleRow}>
              {item.owner?.avatar && (
                <Image source={{ uri: item.owner.avatar }} style={styles.avatar} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{item.title}</Text>
                {item.owner?.name && (
                  <Text style={styles.owner}>Por {item.owner.name}</Text>
                )}
              </View>
            </View>
            {item.description && (
              <Text style={styles.description}>{item.description}</Text>
            )}
            {typeof item.tokens === "number" && (
              <Text style={styles.tokens}>{item.tokens} tokens</Text>
            )}
            <Button
              title="Proponer intercambio"
              onPress={() => handlePropose(item.id, item.owner?.id, item.tokens)}
            />
            {proposalStatus[item.id] && (
              <Text style={styles.statusText}>
                Estado: {proposalStatus[item.id]}
              </Text>
            )}
          </View>
        )}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.statusText}>No hay ofertas disponibles.</Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  titleRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  card: {
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
  },
  title: { fontWeight: "600", marginBottom: 4 },
  owner: { color: "#666" },
  description: { color: "#555" },
  tokens: { color: "#0F6CBD", marginTop: 4, fontWeight: "700" },
  statusBox: { marginTop: 12 },
  statusText: { color: "#444", marginTop: 6 },
});
