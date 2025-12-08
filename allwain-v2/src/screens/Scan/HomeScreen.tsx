import React, { useMemo } from "react";
import { View, Text, Button, StyleSheet } from "react-native";
import { useAuthStore } from "../../store/auth.store";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { MainTabParamList, RootStackParamList } from "../../navigation/types";
import { colors } from "../../theme/colors";

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Inicio">,
  NativeStackScreenProps<RootStackParamList>
>;

export default function HomeScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user);

  const savingSummary = useMemo(
    () => ({
      accumulated: 124.5,
      latestTicket: 18.6,
    }),
    [],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Hola {user?.name || "usuario"}, bienvenido a Allwain
      </Text>
      <Text style={styles.subtitle}>
        Escanea productos, compara tiendas cercanas y mira cuánto puedes ahorrar
        (modelo demo conectado al backend).
      </Text>

      <Button
        title="Escanear producto"
        color={colors.button}
        onPress={() => navigation.navigate("Scan")}
      />

      <View style={styles.summaryCard}>
        <Text style={styles.label}>Ahorro acumulado</Text>
        <Text style={styles.value}>€ {savingSummary.accumulated.toFixed(2)}</Text>
        <Text style={styles.helper}>
          Último ticket escaneado: € {savingSummary.latestTicket.toFixed(2)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    gap: 12,
    backgroundColor: colors.background,
  },
  title: { fontSize: 24, fontWeight: "700", color: colors.text },
  subtitle: { color: colors.mutedText, marginBottom: 8 },
  summaryCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    gap: 4,
  },
  label: { color: colors.mutedText, fontWeight: "700" },
  value: { color: colors.text, fontWeight: "800", fontSize: 24 },
  helper: { color: colors.mutedText },
});
