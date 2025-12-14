import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  Image,
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

export default function SponsorsScreen() {
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<SponsorsSnapshot | null>(null);

  const referralCode = useMemo(() => {
    if (user?.id) return `ALL-${String(user.id).slice(0, 6).toUpperCase()}`;
    if (user?.email) return `ALL-${user.email.split("@")[0].toUpperCase()}`;
    return "ALLWAIN-0001";
  }, [user?.email, user?.id]);

  const qrUri = useMemo(
    () =>
      `https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=${encodeURIComponent(
        referralCode,
      )}`,
    [referralCode],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      // Datos de ejemplo (demo bonita)
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
    }, 450);

    return () => clearTimeout(timer);
  }, []);

  function copyCode() {
    Alert.alert("Copiado", `Código copiado: ${referralCode} (demo)`);
  }

  function share() {
    Alert.alert("Compartir", "Compartir enlace/QR (demo).");
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>Programa recomendados</Text>
        <Text style={styles.subtitle}>
          Invita a otros usuarios con tu código. Tus recomendaciones te darán un
          beneficio continuo (demo).
        </Text>

        <View style={styles.qrSection}>
          <View style={styles.qrBox}>
            <Image
              source={{ uri: qrUri }}
              style={styles.qrImage}
              resizeMode="contain"
            />
          </View>

          <View style={styles.codeInfo}>
            <Text style={styles.label}>Tu código</Text>
            <Text style={styles.code}>{referralCode}</Text>
            <Text style={styles.helper}>
              QR optimizado para web y móvil. Compártelo para que se registren
              con tu recomendación. (demo)
            </Text>

            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[styles.btn, styles.btnSoft]}
                activeOpacity={0.9}
                onPress={copyCode}
              >
                <Text style={styles.btnSoftText}>Copiar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary]}
                activeOpacity={0.9}
                onPress={share}
              >
                <Text style={styles.btnPrimaryText}>Compartir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {loading && (
          <View style={styles.loader}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.helper, styles.loaderText]}>
              Cargando estadísticas… (demo)
            </Text>
          </View>
        )}

        {!loading && snapshot && (
          <>
            <View style={styles.statsRow}>
              <View style={[styles.statCard, styles.statCardWithMargin]}>
                <Text style={styles.statLabel}>Recomendaciones</Text>
                <Text style={styles.statValue}>{snapshot.inviteCount}</Text>
                <Text style={styles.helper}>
                  Personas registradas con tu código. (demo)
                </Text>
              </View>

              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Beneficio acumulado</Text>
                <Text style={styles.statValue}>
                  € {snapshot.totalEarnings.toFixed(2)}
                </Text>
                <Text style={styles.helper}>Estimación simulada. (demo)</Text>
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
                    <Text style={styles.helper}>{item.invites} recomendaciones</Text>
                  </View>
                  <Text style={styles.historyAmount}>
                    € {item.earnings.toFixed(2)}
                  </Text>
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
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24 },

  card: {
    backgroundColor: colors.card,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 10,
  },

  title: { fontSize: 22, color: colors.text, fontWeight: "900" },
  subtitle: { marginTop: 2, color: colors.text, opacity: 0.85, fontWeight: "600" },

  qrSection: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  qrBox: {
    backgroundColor: colors.card,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 2,
  },
  qrImage: { width: 180, height: 180 },

  codeInfo: { flex: 1, marginLeft: 16, gap: 6 },
  label: { color: colors.text, fontWeight: "800" },
  code: {
    fontSize: 20,
    fontWeight: "900",
    color: colors.text,
    marginTop: 2,
  },
  helper: { color: colors.text, opacity: 0.7, fontWeight: "600" },

  btnRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
  },
  btnSoft: { backgroundColor: colors.card, borderColor: colors.cardBorder },
  btnSoftText: { color: colors.text, fontWeight: "900" },
  btnPrimary: { backgroundColor: colors.button, borderColor: colors.button },
  btnPrimaryText: { color: colors.buttonText, fontWeight: "900" },

  loader: { marginTop: 14, alignItems: "center" },
  loaderText: { marginTop: 6 },

  statsRow: { marginTop: 16, flexDirection: "row" },
  statCard: {
    flex: 1,
    backgroundColor: colors.highlight,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 4,
  },
  statCardWithMargin: { marginRight: 12 },
  statLabel: { color: colors.text, fontWeight: "800" },
  statValue: {
    fontSize: 26,
    fontWeight: "900",
    color: colors.text,
    marginTop: 2,
  },

  sectionTitle: {
    marginTop: 18,
    fontSize: 18,
    fontWeight: "900",
    color: colors.text,
  },
  separator: { height: 1, backgroundColor: colors.cardBorder, marginVertical: 10 },

  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  historyMonth: { color: colors.text, fontWeight: "800" },
  historyAmount: { color: colors.text, fontWeight: "900" },
});

