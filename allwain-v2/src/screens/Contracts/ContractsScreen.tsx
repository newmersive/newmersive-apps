import React, { useMemo } from "react";
import { StyleSheet, Text, View, FlatList } from "react-native";
import { colors } from "../../theme/colors";

export type Contract = {
  id: string;
  provider: string;
  product: string;
  monthlyCost: number;
  currentSaving: number;
  status: "demo" | "ejemplo";
  note: string;
};

export default function ContractsScreen() {
  const contracts = useMemo<Contract[]>(
    () => [
      {
        id: "a1",
        provider: "Iberluz",
        product: "Cambio de tarifa de luz",
        monthlyCost: 62.4,
        currentSaving: 18.6,
        status: "demo",
        note: "Ejemplo de contrato energético optimizado.",
      },
      {
        id: "b2",
        provider: "FibraMax",
        product: "Contrato de internet fibra 1Gb",
        monthlyCost: 49.9,
        currentSaving: 10.2,
        status: "ejemplo",
        note: "Simulación de conexión de fibra y móvil.",
      },
      {
        id: "c3",
        provider: "ProtecHome",
        product: "Seguro de hogar integral",
        monthlyCost: 22.5,
        currentSaving: 5.4,
        status: "demo",
        note: "Coberturas y precios ilustrativos para la demo.",
      },
    ],
    [],
  );

  const accumulatedSaving = useMemo(
    () => contracts.reduce((acc, contract) => acc + contract.currentSaving, 0),
    [contracts],
  );

  const statusLabel = (status: Contract["status"]) =>
    status === "demo" ? "Demo" : "Ejemplo";

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Contratos</Text>
      <Text style={styles.subtitle}>
        Seguimiento simulado de contratos activos y ahorro mensual estimado.
      </Text>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Ahorro acumulado</Text>
        <Text style={styles.summaryValue}>€ {accumulatedSaving.toFixed(2)}</Text>
        <Text style={styles.helper}>Incluye todos los contratos conectados.</Text>
      </View>

      <FlatList
        data={contracts}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.cardTitle}>{item.provider}</Text>
                <Text style={styles.cardSubtitle}>{item.product}</Text>
              </View>
              <Text style={[styles.status, styles[`status_${item.status}`]]}>
                {statusLabel(item.status)}
              </Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Cuota mensual</Text>
              <Text style={styles.value}>€ {item.monthlyCost.toFixed(2)}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Ahorro estimado</Text>
              <Text style={[styles.value, styles.savingValue]}>
                € {item.currentSaving.toFixed(2)}
              </Text>
            </View>

            <Text style={styles.helper}>
              {item.note}
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
  summaryCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    padding: 14,
  },
  summaryLabel: { color: colors.text, opacity: 0.7, fontWeight: "600" },
  summaryValue: { fontSize: 26, fontWeight: "800", color: colors.text, marginVertical: 4 },
  helper: { color: colors.mutedText },
  separator: { height: 12 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    padding: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  cardTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  cardSubtitle: { color: colors.mutedText },
  status: { fontWeight: "700" },
  status_demo: { color: colors.primary },
  status_ejemplo: { color: colors.warning },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  label: { color: colors.mutedText, fontWeight: "600" },
  value: { color: colors.text, fontWeight: "700" },
  savingValue: { color: colors.primary },
});
