import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import { Copy, Network, Share2, Store, UserRound } from "lucide-react-native";

import { apiAuthGet, type AllwainConnectorNetwork } from "../../config/api";
import { useAuthStore } from "../../store/auth.store";
import { colors } from "../../theme/colors";
import {
  BigActionButton,
  EmptyState,
  PersonCard,
  StatusChip,
} from "../../components/design-system";

export default function SponsorsScreen() {
  const navigation = useNavigation<any>();
  const userId = useAuthStore((state) => state.user?.id);
  const connector = useAuthStore((state) => state.user?.participation?.connector);
  const [network, setNetwork] = useState<AllwainConnectorNetwork | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadNetwork = useCallback(async (cursor?: string | null) => {
    if (!connector?.enabled) return;
    setLoading(true);
    setError(null);
    try {
      const path = "/allwain/participation/connector/network?limit=30" +
        (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
      const next = await apiAuthGet<AllwainConnectorNetwork>(path);
      setNetwork((current) => cursor && current
        ? {
            ...next,
            items: [
              ...current.items,
              ...next.items.filter(
                (item) => !current.items.some((existing) => existing.id === item.id),
              ),
            ],
          }
        : next);
    } catch (loadError: any) {
      setError(loadError?.message || "No pudimos cargar tu red.");
    } finally {
      setLoading(false);
    }
  }, [connector?.enabled]);

  useFocusEffect(
    useCallback(() => {
      void loadNetwork(null);
    }, [loadNetwork]),
  );

  if (!connector?.enabled) {
    return (
      <View style={styles.centered}>
        <EmptyState
          icon={<Network size={28} color={colors.primary} />}
          title="Activa Conector"
          body="Tu QR, tu red y las entregas cercanas estarán en esta misma cuenta."
          demo={{
            title: "Comercio incorporado",
            meta: "Frutería local · Foios",
            detail: "La atribución queda vinculada a tu Newmersive ID.",
            leading: <Store size={20} color={colors.primary} />,
          }}
        />
        <BigActionButton
          label="Activar Conector"
          onPress={() => navigation.navigate("ActivateConnector")}
        />
      </View>
    );
  }

  const referralValue = network?.referralUrl || connector.referralUrl || "https://allwain.es";
  const newmersiveId = network?.newmersiveId || connector.newmersiveId || "";

  async function copyReferral() {
    setError(null);
    setNotice(null);
    try {
      await Clipboard.setStringAsync(referralValue);
      setNotice("Enlace copiado. Ya puedes enviarlo a quien quieras incorporar.");
    } catch {
      setError("No pudimos copiar el enlace.");
    }
  }

  async function shareReferral() {
    setError(null);
    setNotice(null);
    try {
      await Share.share({
        title: "Únete a Allwain",
        message: `Únete a mi red Allwain: ${referralValue}`,
        url: referralValue,
      });
    } catch {
      setError("No pudimos abrir las opciones para compartir.");
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headingRow}>
        <View>
          <Text style={styles.eyebrow}>MI QR</Text>
          <Text style={styles.title}>Conecta con Allwain</Text>
        </View>
        <StatusChip label="Conector activo" tone="brand" />
      </View>

      <View style={styles.qrSection}>
        <View style={styles.qrFrame}>
          <QRCode value={referralValue} size={178} color={colors.brandDark} backgroundColor="#FFFFFF" />
        </View>
        {newmersiveId ? <Text style={styles.identity}>{newmersiveId}</Text> : null}
        <View style={styles.shareRow}>
          <TouchableOpacity style={styles.shareButton} onPress={() => void copyReferral()}>
            <Copy size={18} color={colors.text} />
            <Text style={styles.shareText}>Copiar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.shareButton, styles.sharePrimary]} onPress={() => void shareReferral()}>
            <Share2 size={18} color={colors.buttonText} />
            <Text style={styles.sharePrimaryText}>Compartir</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.eyebrow}>MI RED</Text>
          <Text style={styles.sectionTitle}>
            {network?.totals.users || 0} {(network?.totals.users || 0) === 1 ? "persona" : "personas"}
          </Text>
        </View>
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      {!loading && !error && !network?.items.length ? (
        <EmptyState
          title="Tu red empieza aquí"
          body="Comparte tu QR o enlace. Las nuevas altas aparecerán sin mostrar datos privados."
          actionLabel="Compartir enlace"
          onAction={() => void shareReferral()}
          demo={{
            title: "María · Comercio local",
            meta: "Incorporada con tu QR",
            detail: "Verás su estado y la actividad atribuible respetando su privacidad.",
            leading: <Store size={20} color={colors.primary} />,
          }}
        />
      ) : null}

      {network?.items.map((person) => (
        <PersonCard
          key={person.id}
          title={person.displayName}
          meta={person.kind === "seller" ? "Vendedor incorporado" : "Persona incorporada"}
          status={person.status === "registered" ? "Registrada" : person.status}
          statusTone={person.status === "registered" ? "success" : "neutral"}
          onContact={
            person.userId && person.userId !== userId
              ? () =>
                  navigation.navigate("ChatThread", {
                    targetUserId: person.userId,
                    targetName: person.displayName,
                    title: "Mensaje privado",
                  })
              : undefined
          }
          leading={
            person.kind === "seller" ? (
              <Store size={20} color={colors.primary} />
            ) : (
              <UserRound size={20} color={colors.primary} />
            )
          }
        />
      ))}

      {network?.pageInfo?.hasNextPage ? (
        <BigActionButton
          label={loading ? "Cargando..." : "Mostrar más personas"}
          disabled={loading}
          onPress={() => void loadNetwork(network.pageInfo?.nextCursor)}
          tone="light"
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 720, alignSelf: "center", padding: 16, paddingBottom: 36, gap: 12 },
  centered: { flex: 1, backgroundColor: colors.background, padding: 18, justifyContent: "center", gap: 14 },
  headingRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: "900" },
  title: { color: colors.text, fontSize: 25, lineHeight: 31, fontWeight: "900", marginTop: 3 },
  qrSection: { alignItems: "center", paddingVertical: 14, gap: 10 },
  qrFrame: { padding: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8 },
  identity: { color: colors.text, fontSize: 16, fontWeight: "900" },
  shareRow: { width: "100%", flexDirection: "row", gap: 10, marginTop: 2 },
  shareButton: { flex: 1, minHeight: 48, borderRadius: 8, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.card, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  sharePrimary: { borderColor: colors.primary, backgroundColor: colors.primary },
  shareText: { color: colors.text, fontWeight: "900" },
  sharePrimaryText: { color: colors.buttonText, fontWeight: "900" },
  sectionHeader: { marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: "900", marginTop: 3 },
  error: { color: colors.danger, fontWeight: "700", lineHeight: 19 },
  notice: { color: colors.success, fontWeight: "800", lineHeight: 19 },
});
