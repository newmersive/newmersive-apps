import React, { useMemo, useState } from "react";
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

type ContractPayload = {
  title: string;
  tokens: number;
  fromUserId?: string;
  toUserId?: string;
  offerId?: string;
  tradeId?: string;
  requesterName?: string;
  providerName?: string;
  notes?: string;
  description?: string;
};

export default function ContractPreviewScreen({ route }: ContractPreviewScreenProps) {
  const offer: TrueqiaOffer | undefined = route.params?.offer;
  const trade: Trade | undefined = route.params?.trade;
  const user = useAuthStore((s) => s.user);

  const defaultTokens = trade?.tokens ?? offer?.tokens ?? 0;
  const [requesterName, setRequesterName] = useState(
    trade?.participants?.[0] || user?.name || "Solicitante",
  );
  const [providerName, setProviderName] = useState(
    trade?.participants?.[1] || offer?.owner?.name || "Proveedor",
  );
  const [tokens, setTokens] = useState(String(defaultTokens));
  const [notes, setNotes] = useState("");
  const [contractText, setContractText] = useState<string | null>(null);
  const [finalContract, setFinalContract] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(() => trade?.title || offer?.title || "Contrato", [offer?.title, trade?.title]);

  const payload = useMemo<ContractPayload>(() => {
    const numericTokens = Number(tokens);
    return {
      title,
      tokens: Number.isFinite(numericTokens) ? numericTokens : 0,
      fromUserId: user?.id,
      toUserId: trade?.ownerId || offer?.owner?.id,
      offerId: offer?.id || trade?.offerId,
      tradeId: trade?.id,
      requesterName: requesterName.trim() || undefined,
      providerName: providerName.trim() || undefined,
      notes: notes.trim() || undefined,
      description: offer?.description || trade?.description || trade?.title,
    };
  }, [title, tokens, user?.id, trade, offer, requesterName, providerName, notes]);

  async function generate() {
    setError(null);
    setLoading(true);
    setFinalContract(null);
    try {
      const res = await apiAuthPost<{ contractText: string }>(
        "/trueqia/contracts/preview",
        payload,
      );
      setContractText(res.contractText);
    } catch (err: any) {
      const message =
        err?.message === "SESSION_EXPIRED"
          ? "Sesión expirada, vuelve a iniciar sesión."
          : "No se pudo generar el contrato en este momento.";
      setError(message);
      setContractText(null);
    } finally {
      setLoading(false);
    }
  }

  function confirmContract() {
    if (!contractText) return;
    setFinalContract(contractText);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
      <Text style={styles.title}>Contrato IA – {title}</Text>

      <View style={styles.metaBox}>
        {offer?.id && <Text style={styles.metaText}>Oferta: {offer.id}</Text>}
        {trade?.id && <Text style={styles.metaText}>Trueque: {trade.id}</Text>}
        {typeof defaultTokens === "number" && (
          <Text style={styles.metaText}>Tokens sugeridos: {defaultTokens}</Text>
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

      {contractText && !loading ? (
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={confirmContract}
        >
          <Text style={styles.buttonText}>Confirmar y guardar</Text>
        </TouchableOpacity>
      ) : null}

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
            Revisa la vista previa y confírmala para fijar la versión final.
          </Text>
        </View>
      )}

      {finalContract && (
        <View style={[styles.contractBox, styles.finalBox]}>
          <Text style={styles.metaTitle}>Contrato final</Text>
          <ScrollView style={styles.contractScroll}>
            <Text style={styles.contractText}>{finalContract}</Text>
          </ScrollView>
          <Text style={[styles.muted, { marginTop: 8 }]}>
            Copia y comparte este contrato generado por IA.
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
    gap: 4,
  },
  metaText: {
    color: colors.text,
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
    backgroundColor: colors.surface,
    color: colors.text,
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
    color: "#0b0c0e",
    fontWeight: "800",
  },
  secondaryButton: {
    backgroundColor: colors.accent,
    marginTop: 8,
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
    backgroundColor: colors.surface,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  metaTitle: {
    fontWeight: "600",
    marginBottom: 4,
    color: colors.text,
  },
  contractScroll: {
    maxHeight: 260,
    marginTop: 6,
  },
  contractText: {
    color: colors.text,
    lineHeight: 20,
  },
  finalBox: {
    borderColor: colors.primary,
    shadowOpacity: 0.12,
  },
});
