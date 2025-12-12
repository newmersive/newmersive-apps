import React, { useMemo } from "react";
import { StyleSheet, Text, View, FlatList } from "react-native";
import { colors } from "../../theme/colors";
import { listContracts } from "../../services/contracts.memory";

export default function ContractsScreen() {
  const contracts = useMemo(() => listContracts(), []);

  if (contracts.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Contratos</Text>
        <Text style={styles.empty}>Aún no tienes acuerdos confirmados.</Text>
        <Text style={styles.helper}>
          Cuando aceptes una oferta, aquí aparecerá el contrato asociado.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Contratos</Text>
      <Text style={styles.subtitle}>
        Acuerdos confirmados tras aceptar ofertas (demo).
      </Text>

      <FlatList
        data={contracts}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.product}</Text>
            <Text style={styles.cardSubtitle}>{item.provider}</Text>

            <Text style={styles.note}>{item.note ?? ""}</Text>
            <Text style={styles.meta}>
              {new Date(item.createdAt).toLocaleString()}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: colors.background, gap: 12 },
  title: { fontSize: 24, fontWeight: "800", color: colors.text },
  subtitle: { color: colors.mutedText, marginBottom: 4 },
  empty: { marginTop: 24, fontSize: 16, fontWeight: "800", color: colors.text },
  helper: { color: colors.mutedText },
  separator: { height: 12 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  cardTitle: { fontSize: 16, fontWeight: "900", color: colors.text },
  cardSubtitle: { color: colors.mutedText, fontWeight: "700" },
  note: { color: colors.text, opacity: 0.9 },
  meta: { color: colors.mutedText, fontSize: 12 },
});
