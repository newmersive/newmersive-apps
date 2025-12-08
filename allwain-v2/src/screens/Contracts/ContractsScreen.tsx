import React, { useMemo } from "react";
import { StyleSheet, Text, View, FlatList } from "react-native";
import { colors } from "../../theme/colors";

export type Contract = {
  id: string;
  provider: string;
  product: string;
  monthlyCost: number;
  currentSaving: number;
  status: "activo" | "pendiente" | "renovacion";
};

export default function ContractsScreen() {
  const contracts = useMemo<Contract[]>(
    () => [
      {
        id: "a1",
        provider: "Iberluz",
        product: "Luz Hogar 4.0",
        monthlyCost: 62.4,
        currentSaving: 18.6,
        status: "activo",
      },
      {
        id: "b2",
        provider: "HogarNet",
        product: "Fibra + Móvil 600Mb",
        monthlyCost: 48.9,
        currentSaving: 12.1,
        status: "pendiente",
      },
      {
        id: "c3",
        provider: "Agua Clara",
        product: "Plan Familiar",
        monthlyCost: 24.5,
        currentSaving: 6.8,
        status: "renovacion",
      },
    ],
    [],
  );

  const accumulatedSaving = useMemo(
    () => contracts.reduce((acc, contract) => acc + contract.currentSaving, 0),
    [contracts],
  );

  function statusLabel(status: Contract["status"]) {
    switch (status) {
      case "activo":
        return "Activo";
      case "pendiente":
        return "Pendiente de firma";
      case "renovacion":
        return "Renovación sugerida";
      default:
        return "";
    }
  }

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
              Datos simulados. El backend devolverá los contratos vinculados al
              usuario y sus ahorros.
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
  status_activo: { color: colors.primary },
  status_pendiente: { color: colors.warning },
  status_renovacion: { color: colors.danger },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  label: { color: colors.mutedText, fontWeight: "600" },
  value: { color: colors.text, fontWeight: "700" },
  savingValue: { color: colors.primary },
});
