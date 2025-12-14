import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from "react-native";
import { apiAuthGet, apiAuthPost, AllwainOffer } from "../../config/api";
import { colors } from "../../theme/colors";
import { addContractFromOffer, getContracts } from "../../services/contracts.memory";

type ContractItem = {
  id: string;
  title: string;
  status: string;
  createdAt?: string;
  notes?: string;
};

export default function OffersScreen() {
  const [offers, setOffers] = useState<AllwainOffer[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [contractsVersion, setContractsVersion] = useState(0);

  const contracts = useMemo(() => {
    try {
      const raw = getContracts?.() ?? [];
      return raw as ContractItem[];
    } catch {
      return [] as ContractItem[];
    }
  }, [contractsVersion]);

  async function loadOffers() {
    try {
      setLoadingOffers(true);
      setError(null);

      const res = await apiAuthGet<{ items?: AllwainOffer[] }>("/allwain/offers");
      setOffers(res?.items ?? []);
    } catch {
      setError("No se pudieron cargar las ofertas");
    } finally {
      setLoadingOffers(false);
    }
  }

  async function interest(offerId: string) {
    try {
      setBusyId(offerId);
      await apiAuthPost(`/allwain/offers/${offerId}/interest`, {});
      Alert.alert("Enviado", "Hemos registrado tu interés. (demo)");
    } catch (e: any) {
      Alert.alert("Error", e?.message ? String(e.message) : "No se pudo registrar el interés.");
    } finally {
      setBusyId(null);
    }
  }

  function accept(offer: AllwainOffer) {
    addContractFromOffer(offer, "Contrato confirmado tras aceptar la oferta. (demo)");
    setContractsVersion((v) => v + 1);

    Alert.alert(
      "Oferta aceptada",
      "Contrato confirmado y guardado. Lo verás abajo en “Contratos”.",
    );
  }

  useEffect(() => {
    loadOffers();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ofertas</Text>
      <Text style={styles.subtitle}>
        Explora ofertas, muestra interés o acepta una para generar un contrato.
      </Text>

      {/* OFERTAS */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Ofertas disponibles</Text>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={loadOffers}
          disabled={loadingOffers}
        >
          <Text style={styles.refreshText}>
            {loadingOffers ? "Actualizando…" : "Recargar"}
          </Text>
        </TouchableOpacity>
      </View>

      {loadingOffers && (
        <View style={styles.loadingRow}>
          <ActivityIndicator />
          <Text style={styles.muted}>Cargando ofertas…</Text>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {!loadingOffers && offers.length === 0 && (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>Aún no hay ofertas</Text>
          <Text style={styles.muted}>
            En breve verás ofertas de comercios y proveedores cerca de ti. (demo)
          </Text>
        </View>
      )}

      <FlatList
        data={offers}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const price =
            typeof item.price === "number" ? `€${item.price.toFixed(2)}` : null;

          const distance =
            typeof item.meta?.distanceKm === "number"
              ? `${item.meta.distanceKm} km`
              : null;

          const busy = busyId === item.id;

          return (
            <View style={styles.card}>
              <Text style={styles.offerTitle}>{item.title ?? "Oferta"}</Text>

              {item.description ? (
                <Text style={styles.muted}>{item.description}</Text>
              ) : (
                <Text style={styles.muted}>
                  Oferta disponible para mejorar tu compra o servicio. (demo)
                </Text>
              )}

              <View style={styles.metaRow}>
                {price && <Text style={styles.price}>{price}</Text>}
                {distance && <Text style={styles.metaPill}>📍 {distance}</Text>}
              </View>

              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.btnSoft]}
                  activeOpacity={0.9}
                  onPress={() => interest(item.id)}
                  disabled={busy}
                >
                  <Text style={styles.btnSoftText}>
                    {busy ? "Enviando…" : "Me interesa"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, styles.btnPrimary]}
                  activeOpacity={0.9}
                  onPress={() => accept(item)}
                >
                  <Text style={styles.btnPrimaryText}>Aceptar</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        ListFooterComponent={<View style={{ height: 10 }} />}
      />

      {/* CONTRATOS (misma pantalla) */}
      <View style={styles.contractsDivider} />

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Contratos</Text>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={() => setContractsVersion((v) => v + 1)}
        >
          <Text style={styles.refreshText}>Actualizar</Text>
        </TouchableOpacity>
      </View>

      {contracts.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>Sin contratos todavía</Text>
          <Text style={styles.muted}>
            Cuando aceptes una oferta, se generará un contrato aquí. (demo)
          </Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {contracts.slice(0, 6).map((c) => (
            <View key={c.id} style={styles.contractCard}>
              <Text style={styles.contractTitle}>{c.title}</Text>
              <Text style={styles.contractMeta}>
                Estado: {c.status || "confirmado"}
              </Text>
              {c.notes ? <Text style={styles.muted}>{c.notes}</Text> : null}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 18, gap: 10, backgroundColor: colors.background },
  title: { fontSize: 24, fontWeight: "900", color: colors.text },
  subtitle: { color: colors.mutedText, fontWeight: "600", marginBottom: 4 },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  sectionTitle: { fontSize: 16, fontWeight: "900", color: colors.text },
  refreshBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  refreshText: { fontWeight: "800", color: colors.text, fontSize: 12 },

  loadingRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  error: { color: colors.danger, fontWeight: "800" },
  muted: { color: colors.mutedText, fontWeight: "600" },

  emptyBox: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    gap: 6,
  },
  emptyTitle: { fontWeight: "900", color: colors.text },

  card: {
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 14,
    backgroundColor: colors.card,
    marginBottom: 10,
    gap: 8,
  },
  offerTitle: { fontSize: 16, fontWeight: "900", color: colors.text },
  metaRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  price: { color: colors.primary, fontWeight: "900" },
  metaPill: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 12,
    backgroundColor: colors.background,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },

  actionsRow: { flexDirection: "row", gap: 10, marginTop: 6 },
  actionBtn: {
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

  contractsDivider: {
    height: 1,
    backgroundColor: colors.cardBorder,
    marginVertical: 12,
  },
  contractCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    gap: 6,
  },
  contractTitle: { fontWeight: "900", color: colors.text, fontSize: 15 },
  contractMeta: { fontWeight: "800", color: colors.primary },
});
