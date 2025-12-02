import React, { useEffect } from "react";
import {
  View,
  Text,
  Button,
  ActivityIndicator,
  FlatList,
  StyleSheet,
} from "react-native";
import { useOffersStore } from "../../store/offers.store";

export default function OffersListScreen({ navigation }: any) {
  const items = useOffersStore((s) => s.items);
  const loading = useOffersStore((s) => s.loading);
  const error = useOffersStore((s) => s.error);
  const loadOffers = useOffersStore((s) => s.loadOffers);

  useEffect(() => {
    loadOffers();
  }, [loadOffers]);

  return (
    <View style={{ flex: 1, padding: 24 }}>
      <Text style={{ fontSize: 24, marginBottom: 12 }}>Ofertas</Text>
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
            No pudimos cargar las ofertas: {error}
          </Text>
        </View>
      )}

      <FlatList
        style={{ marginTop: 12 }}
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.title}>{item.title}</Text>
            {item.description && (
              <Text style={styles.description}>{item.description}</Text>
            )}
            {typeof item.tokens === "number" && (
              <Text style={styles.tokens}>{item.tokens} tokens</Text>
            )}
            <Button
              title="Previsualizar contrato IA"
              onPress={() =>
                navigation.navigate("ContractPreview", {
                  offer: item,
                })
              }
            />
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
  card: {
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
  },
  title: { fontWeight: "600", marginBottom: 4 },
  description: { color: "#555" },
  tokens: { color: "#0F6CBD", marginTop: 4, fontWeight: "700" },
  statusBox: { marginTop: 12 },
  statusText: { color: "#444", marginTop: 6 },
});
