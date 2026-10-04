import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { FileCheck2 } from "lucide-react-native";
import { AllwainContract, apiAuthGet, apiAuthPost } from "../../config/api";
import { EmptyState, PublicationImage } from "../../components/design-system";
import { useAuthStore } from "../../store/auth.store";
import { colors } from "../../theme/colors";

export default function ContractsScreen() {
  const userId = useAuthStore((s) => s.user?.id);
  const [items, setItems] = useState<AllwainContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (cursor?: string, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await apiAuthGet<{
        items?: AllwainContract[];
        pageInfo?: { nextCursor?: string | null };
      }>(`/allwain/contracts?limit=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      setItems((current) =>
        append
          ? Array.from(
              new Map(
                [...current, ...(response.items || [])].map((item) => [
                  item.id,
                  item,
                ]),
              ).values(),
            )
          : response.items || [],
      );
      setNextCursor(response.pageInfo?.nextCursor || null);
    } catch (err: any) {
      setError(err?.message || "No se pudieron cargar los acuerdos.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function accept(item: AllwainContract) {
    setBusyId(item.id);
    try {
      const updated = await apiAuthPost<AllwainContract>(
        `/allwain/contracts/${item.id}/accept`,
        {}
      );
      setItems((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
    } catch (err: any) {
      setError(err?.message || "No se pudo confirmar el acuerdo.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mis acuerdos</Text>
      <Text style={styles.subtitle}>Confirmaciones reales guardadas en Allwain.</Text>
      {loading && items.length === 0 ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onEndReached={() => {
          if (nextCursor && !loadingMore) void load(nextCursor, true);
        }}
        onEndReachedThreshold={0.35}
        ListFooterComponent={
          loadingMore ? <ActivityIndicator color={colors.primary} /> : null
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon={<FileCheck2 size={25} color={colors.primary} />}
              title="Aún no tienes acuerdos"
              body="Cuando elijas una oferta, aquí verás quién participa y qué falta por confirmar."
              demo={{
                title: "Reserva de naranjas",
                meta: "Tú: aceptado · Vendedor: pendiente",
                detail: "Después de ambas confirmaciones aparecerá el paso de pago o reserva.",
                leading: <FileCheck2 size={20} color={colors.primary} />,
              }}
            />
          ) : null
        }
        renderItem={({ item }) => {
          const userAccepted = Boolean(
            (item.requesterUserId === userId && item.requesterAcceptedAt) ||
              (item.providerUserId === userId && item.providerAcceptedAt)
          );
          const canAccept =
            item.status !== "accepted" && item.status !== "rejected" && !userAccepted;
          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.imageFrame}>
                  <PublicationImage
                    imageUrl={item.imageMeta?.url}
                    imageAlt={item.imageMeta?.alt || item.offerTitle || "Acuerdo Allwain"}
                    illustrative={item.imageMeta?.illustrative === true}
                  />
                </View>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>{item.offerTitle || "Acuerdo Allwain"}</Text>
                  <Text style={styles.meta}>
                    Cliente: {item.requesterAcceptedAt ? "aceptado" : "pendiente"}
                  </Text>
                  <Text style={styles.meta}>
                    Proveedor: {item.providerAcceptedAt ? "aceptado" : "pendiente"}
                  </Text>
                </View>
              </View>
              {canAccept ? (
                <TouchableOpacity style={styles.button} onPress={() => accept(item)}>
                  {busyId === item.id ? (
                    <ActivityIndicator color={colors.buttonText} />
                  ) : (
                    <Text style={styles.buttonText}>Confirmar acuerdo</Text>
                  )}
                </TouchableOpacity>
              ) : (
                <Text style={styles.status}>
                  {item.status === "accepted"
                    ? "Formalizado"
                    : item.status === "rejected"
                      ? "Rechazado"
                      : "Esperando a la otra parte"}
                </Text>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: colors.background, gap: 10 },
  title: { fontSize: 24, fontWeight: "900", color: colors.text },
  subtitle: { color: colors.mutedText, marginBottom: 4 },
  error: { color: colors.danger, fontWeight: "800" },
  list: { gap: 10, paddingBottom: 24 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    padding: 16,
    gap: 6,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 11 },
  imageFrame: { width: 84, height: 68, borderRadius: 7, overflow: "hidden" },
  cardCopy: { flex: 1, minWidth: 0, gap: 5 },
  cardTitle: { fontSize: 16, fontWeight: "900", color: colors.text },
  meta: { color: colors.mutedText, fontWeight: "700" },
  status: { color: colors.primary, fontWeight: "900" },
  button: {
    marginTop: 6,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: colors.button,
  },
  buttonText: { color: colors.buttonText, fontWeight: "900" },
});
