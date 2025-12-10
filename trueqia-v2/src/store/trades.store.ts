import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { apiAuthPost } from "../../config/api";
import { colors } from "../../config/theme";
import { useAuthStore } from "../../store/auth.store";
import { TrueqiaOffer } from "../../store/offers.store";
import { Trade } from "../../store/trades.store";

type ContractPreviewScreenProps = {
  route: {
    params?: {
      offer?: TrueqiaOffer;
      trade?: Trade;
    };
  };
};

export default function ContractPreviewScreen({ route }: ContractPreviewScreenProps) {
  const offer: TrueqiaOffer | undefined = route.params?.offer;
  const trade: Trade | undefined = route.params?.trade;
  const user = useAuthStore((s) => s.user);

  const [requesterName, setRequesterName] = useState(
    trade?.participants?.[0] || user?.name || "Solicitante",
  );
  const [providerName, setProviderName] = useState(
    trade?.participants?.[1] || offer?.owner?.name || "Proveedor",
  );
  const [tokens, setTokens] = useState(
    offer?.tokens !== undefined
      ? String(offer.tokens)
      : trade?.tokens !== undefined
      ? String(trade.tokens)
      : "10",
  );
  const [notes, setNotes] = useState("");
  const [contractText, setContractText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const offerTitle = useMemo(
    () => trade?.title || offer?.title || "Oferta pendiente",
    [offer?.title, trade?.title],
  );

  const payload = useMemo(
    () => ({
      app: "trueqia",
      title: offerTitle,
      fromUserId: user?.id,
      toUserId: trade?.ownerId || offer?.owner?.id,
      tokens: Number(tokens) || 0,
      offerId: offer?.id || trade?.offerId,
      tradeId: trade?.id,
      requesterName: requesterName.trim(),
      providerName: providerName.trim(),
      notes: notes.trim(),
      description: offer?.description || trade?.title,
    }),
    [
      offer?.description,
      offer?.id,
      offerTitle,
      providerName,
      requesterName,
      tokens,
      trade?.id,
      trade?.offerId,
      trade?.ownerId,
      trade?.title,
      user?.id,
      notes,
    ],
  );

  async function generate() {
    setError(null);
    setLoading(true);
    try {
      const res = await apiAuthPost<{ contractText: string }>(
        "/trueqia/contracts/preview",
        payload,
      );
      setContractText(res.contractText);
    } catch (err: any) {
      setError(
        err?.message === "SESSION_EXPIRED"
          ? "Sesión expirada, vuelve a iniciar sesión."
          : "No se pudo generar el contrato en este momento.",
      );
      setContractText(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (trade?.status === "accepted") {
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade?.id, trade?.status]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
      <Text style={styles.title}>Contrato IA – {offerTitle}</Text>

      <View style={styles.metaBox}>
        <Text style={styles.metaTitle}>Oferta seleccionada</Text>
        {offer?.id && <Text style={styles.metaText}>ID: {offer.id}</Text>}
        {offer?.tokens !== undefined && (
          <Text style={styles.metaText}>Tokens: {offer.tokens}</Text>
        )}
        {offer?.description && <Text style={styles.metaText}>{offer.description}</Text>}
        {trade?.id && (
          <Text style={[styles.metaText, { color: colors.muted }]}>
            Trueque {trade.id} – estado {trade.status || "pending"}
          </Text>
        )}
      </View>

      <Text style={styles.label}>Nombre solicitante</Text>
      <TextInput
        style={styles.input}
        value={requesterName}
        onChangeText={setRequesterName}
        placeholder="Quién solicita la oferta"
      />

      <Text style={styles.label}>Nombre proveedor</Text>
      <TextInput
        style={styles.input}
        value={providerName}
        onChangeText={setProviderName}
        placeholder="Quién provee el servicio"
      />

      <Text style={styles.label}>Tokens</Text>
      <TextInput
        style={styles.input}
        value={tokens}
        onChangeText={setTokens}
        keyboardType="numeric"
      />

      <Text style={styles.label}>Notas adicionales</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={notes}
        onChangeText={setNotes}
        multiline
        placeholder="Términos extras o aclaraciones"
      />

      <TouchableOpacity style={styles.button} onPress={generate} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.buttonText}>Generar contrato</Text>
        )}
      </TouchableOpacity>

      {loading && (
        <View style={styles.statusBox}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>Solicitando contrato…</Text>
        </View>
      )}

      {error && <Text style={[styles.muted, { color: "#B3261E" }]}>{error}</Text>}

      {contractText && (
        <View style={styles.contractBox}>
          <Text style={styles.metaTitle}>Resultado</Text>
          <ScrollView style={styles.contractScroll}>
            <Text style={styles.contractText}>{contractText}</Text>
          </ScrollView>
          <Text style={[styles.muted, { marginTop: 8 }]}>
            Próximamente podrás copiar o compartir este contrato.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
  },
  title: {
    fontSize: 20,
    marginBottom: 12,
    color: colors.text,
    fontWeight: "700",
  },
  metaBox: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  metaTitle: {
    fontWeight: "600",
    marginBottom: 4,
    color: colors.text,
  },
  metaText: {
    color: colors.text,
    marginTop: 2,
  },
  label: {
    fontWeight: "600",
    marginTop: 10,
    marginBottom: 4,
    color: colors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#FFF",
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  button: {
    marginTop: 14,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  buttonText: {
    color: "#FFF",
    fontWeight: "700",
  },
  statusBox: {
    marginTop: 12,
    gap: 6,
  },
  muted: {
    color: colors.muted,
  },
  contractBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: "#FFF",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  contractScroll: {
    maxHeight: 260,
    marginTop: 6,
  },
  contractText: {
    color: colors.text,
    lineHeight: 20,
  },
});

