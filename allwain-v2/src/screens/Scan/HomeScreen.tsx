import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { apiAuthGet } from "../../config/api";
import { useAuthStore } from "../../store/auth.store";
import { colors } from "../../theme/colors";

type SponsorSummary = {
  invitedCount: number;
  totalSaved: number;
  totalCommission: number;
  balance: number;
};

export default function HomeScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [summary, setSummary] = useState<SponsorSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSummary() {
    try {
      setLoading(true);
      setError(null);
      const data = await apiAuthGet<SponsorSummary>("/allwain/sponsors/summary");
      setSummary(data);
    } catch (err: any) {
      console.error("Error al cargar resumen", err);
      setError(
        err?.message || "No pudimos calcular tu ahorro acumulado. Intenta de nuevo."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSummary();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Hola {user?.name || "usuario"} 👋</Text>
      <Text style={styles.subheading}>
        Arranca el flujo demo y ve cómo Allwain detecta un producto, encuentra
        ofertas y te muestra cuánto ahorrarías.
      </Text>

      <TouchableOpacity
        style={styles.scanButton}
        onPress={() => navigation.navigate("Escanear")}
        activeOpacity={0.92}
      >
        <Text style={styles.scanLabel}>ESCANEAR PRODUCTO</Text>
        <Text style={styles.scanHint}>Simula el lector y ve el resultado al instante.</Text>
      </TouchableOpacity>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Ahorro total acumulado</Text>
        {loading ? (
          <ActivityIndicator color={colors.button} />
        ) : (
          <Text style={styles.savingsAmount}>
            ${summary?.totalSaved?.toFixed(2) || "0.00"}
          </Text>
        )}
        {error && <Text style={styles.error}>{error}</Text>}
        <Text style={styles.caption}>Datos obtenidos del backend Allwain (demo).</Text>
      </View>

      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate("Ofertas")}
          activeOpacity={0.9}
        >
          <Text style={styles.actionTitle}>Ofertas</Text>
          <Text style={styles.actionBody}>Explora packs y servicios activos.</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate("Resultado")}
          activeOpacity={0.9}
        >
          <Text style={styles.actionTitle}>Historial</Text>
          <Text style={styles.actionBody}>Revisa el último resultado de escaneo.</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate("Perfil")}
          activeOpacity={0.9}
        >
          <Text style={styles.actionTitle}>Perfil</Text>
          <Text style={styles.actionBody}>Tus datos y balance en Allwain.</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: colors.primary },
  heading: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.text,
  },
  subheading: {
    color: colors.text,
    marginTop: 6,
    marginBottom: 18,
    fontWeight: "600",
  },
  scanButton: {
    backgroundColor: colors.button,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 18,
    marginBottom: 16,
  },
  scanLabel: {
    color: colors.buttonText,
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
  },
  scanHint: {
    color: "#f0f0f0",
    textAlign: "center",
    marginTop: 6,
    fontWeight: "700",
  },
  card: {
    backgroundColor: colors.card,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  cardLabel: {
    color: colors.text,
    fontWeight: "800",
    marginBottom: 6,
  },
  savingsAmount: {
    fontSize: 32,
    fontWeight: "900",
    color: colors.text,
  },
  caption: {
    color: "#6c6c6c",
    marginTop: 8,
    fontWeight: "600",
  },
  error: { color: "red", marginTop: 8 },
  quickActions: {
    flexDirection: "row",
    columnGap: 10,
    marginTop: 16,
  },
  actionCard: {
    flex: 1,
    backgroundColor: colors.card,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  actionTitle: { color: colors.text, fontWeight: "800", marginBottom: 4 },
  actionBody: { color: "#6c6c6c", fontWeight: "600" },
});
