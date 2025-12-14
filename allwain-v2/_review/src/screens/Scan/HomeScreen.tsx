import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { apiAuthGet, ScanDemoResponse } from "../../config/api";
import { useAuthStore } from "../../store/auth.store";
import { colors } from "../../theme/colors";

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);

  const [lastScan, setLastScan] = useState<ScanDemoResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const loadLastScan = useCallback(async () => {
    try {
      setLoading(true);
      // Fallback demo SOLO si no hay datos reales
      const res = await apiAuthGet<ScanDemoResponse>("/allwain/scan-demo");
      setLastScan(res ?? null);
    } catch {
      setLastScan(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLastScan();
  }, [loadLastScan]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* SALUDO */}
      <Text style={styles.title}>
        Hola, {user?.name || user?.email || "bienvenido"}
      </Text>
      <Text style={styles.subtitle}>
        Escanea productos y recibe mejores precios o servicios personalizados.
      </Text>

      {/* ÚLTIMO ESCANEO */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Último producto escaneado</Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : lastScan?.product ? (
          <>
            <Text style={styles.productName}>
              {lastScan.product.name || "Producto detectado"}
            </Text>
            {lastScan.product.description ? (
              <Text style={styles.productMeta}>
                {lastScan.product.description}
              </Text>
            ) : (
              <Text style={styles.productMeta}>
                Información básica del producto detectada.
              </Text>
            )}
          </>
        ) : (
          <Text style={styles.productMeta}>
            Aún no has escaneado ningún producto.
          </Text>
        )}
      </View>

      {/* CTA PRINCIPAL */}
      <TouchableOpacity
        style={styles.primaryButton}
        activeOpacity={0.9}
        onPress={() => navigation.navigate("Scan")}
      >
        <Text style={styles.primaryButtonText}>Escanear producto</Text>
      </TouchableOpacity>

      {/* ATAJOS */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate("Ofertas")}
        >
          <Text style={styles.secondaryButtonText}>Ver ofertas</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate("ProgramaRecomendados")}
        >
          <Text style={styles.secondaryButtonText}>
            Programa recomendados
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  content: {
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 32,
  },
  title: {
    color: colors.card,
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 6,
  },
  subtitle: {
    color: colors.card,
    opacity: 0.9,
    fontSize: 15,
    marginBottom: 18,
    fontWeight: "600",
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 18,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
    gap: 6,
  },
  cardTitle: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 16,
  },
  productName: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 15,
  },
  productMeta: {
    color: colors.mutedText,
    fontWeight: "600",
    fontSize: 14,
  },
  primaryButton: {
    backgroundColor: colors.button,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 3,
    marginBottom: 14,
  },
  primaryButtonText: {
    color: colors.buttonText,
    fontWeight: "800",
    fontSize: 16,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: colors.card,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  secondaryButtonText: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 14,
  },
});
