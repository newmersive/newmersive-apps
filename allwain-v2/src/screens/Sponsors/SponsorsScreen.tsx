import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { colors } from "../../theme/colors";
import { useAuthStore } from "../../store/auth.store";

type MonthlyHistory = {
  month: string;
  invites: number;
  earnings: number;
};

type SponsorsSnapshot = {
  inviteCount: number;
  totalEarnings: number;
  monthlyHistory: MonthlyHistory[];
};

function buildLocalQrMatrix(seed: string, size = 15) {
  const numericSeed = seed
    .split("")
    .reduce((acc, char, index) => acc + char.charCodeAt(0) * (index + 3), 0);

  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => {
      const value = numericSeed + row * 17 + col * 11 + row * col;
      return value % 2 === 0;
    }),
  );
}

export default function SponsorsScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<SponsorsSnapshot | null>(null);

  const sponsorCode = useMemo(() => {
    if (user?.id) return `ALL-${user.id.slice(0, 6).toUpperCase()}`;
    if (user?.email) return `ALL-${user.email.split("@")[0].toUpperCase()}`;
    return "ALLWAIN-0001";
  }, [user?.email, user?.id]);

  const qrMatrix = useMemo(() => buildLocalQrMatrix(sponsorCode), [sponsorCode]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSnapshot({
        inviteCount: 18,
        totalEarnings: 326.4,
        monthlyHistory: [
          { month: "Abril 2024", invites: 6, earnings: 118.7 },
          { month: "Marzo 2024", invites: 5, earnings: 92.4 },
          { month: "Febrero 2024", invites: 4, earnings: 72.8 },
          { month: "Enero 2024", invites: 3, earnings: 42.5 },
        ],
      });
      setLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <Text style={styles.backButton}>◀ Volver</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Patrocinadores</Text>
        </View>

        <Text style={styles.subtitle}>
          Comparte tu código para invitar amigos, sumar invitados y ver tus
          comisiones simuladas.
        </Text>

        <View style={styles.qrSection}>
          <View style={styles.qrBox}>
            {qrMatrix.map((row, rowIndex) => (
              <View key={`row-${rowIndex}`} style={styles.qrRow}>
                {row.map((filled, colIndex) => (
                  <View
                    key={`cell-${rowIndex}-${colIndex}`}
                    style={[styles.qrCell, filled && styles.qrCellFilled]}
                  />
                ))}
              </View>
            ))}
          </View>
          <View style={styles.codeInfo}>
            <Text style={styles.label}>Código personal</Text>
            <Text style={styles.code}>{sponsorCode}</Text>
            <Text style={styles.helper}>
              QR generado localmente. Tu enlace de invitado quedará listo para
              compartir.
            </Text>
          </View>
        </View>

        {loading && (
          <View style={styles.loader}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.helper, styles.loaderText]}>Cargando datos simulados…</Text>
          </View>
        )}

        {!loading && snapshot && (
          <>
            <View style={styles.statsRow}>
              <View style={[styles.statCard, styles.statCardWithMargin]}>
                <Text style={styles.statLabel}>Invitados</Text>
                <Text style={styles.statValue}>{snapshot.inviteCount}</Text>
                <Text style={styles.helper}>Usuarios que usaron tu código.</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Total ganado</Text>
                <Text style={styles.statValue}>€ {snapshot.totalEarnings.toFixed(2)}</Text>
                <Text style={styles.helper}>Simulado desde backend.</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Histórico mensual</Text>
            <FlatList
              scrollEnabled={false}
              data={snapshot.monthlyHistory}
              keyExtractor={(item) => item.month}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              renderItem={({ item }) => (
                <View style={styles.historyRow}>
                  <View>
                    <Text style={styles.historyMonth}>{item.month}</Text>
                    <Text style={styles.helper}>{item.invites} invitados</Text>
                  </View>
                  <Text style={styles.historyAmount}>€ {item.earnings.toFixed(2)}</Text>
                </View>
              )}
            />
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  content: {
    padding: 24,
  },
  card: {
    backgroundColor: colors.card,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    color: colors.text,
    fontWeight: "700",
  },
  title: {
    fontSize: 22,
    color: colors.text,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 10,
    color: colors.text,
  },
  qrSection: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
  },
  qrBox: {
    backgroundColor: "#fff",
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  qrRow: { flexDirection: "row" },
  qrCell: {
    width: 10,
    height: 10,
    backgroundColor: "#fff",
  },
  qrCellFilled: {
    backgroundColor: "#000",
  },
  codeInfo: { flex: 1, marginLeft: 16 },
  label: {
    color: colors.text,
    fontWeight: "600",
  },
  code: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
    marginVertical: 6,
  },
  helper: {
    color: colors.text,
    opacity: 0.7,
  },
  loader: {
    marginTop: 20,
    alignItems: "center",
  },
  loaderText: { marginTop: 6 },
  statsRow: {
    marginTop: 22,
    flexDirection: "row",
  },
  statCard: {
    flex: 1,
    backgroundColor: "#fdf3ef",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  statCardWithMargin: { marginRight: 12 },
  statLabel: {
    color: colors.text,
    fontWeight: "600",
  },
  statValue: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.text,
    marginVertical: 4,
  },
  sectionTitle: {
    marginTop: 24,
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  separator: {
    height: 1,
    backgroundColor: colors.cardBorder,
    marginVertical: 10,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  historyMonth: {
    color: colors.text,
    fontWeight: "700",
  },
  historyAmount: {
    color: colors.text,
    fontWeight: "800",
  },
});
