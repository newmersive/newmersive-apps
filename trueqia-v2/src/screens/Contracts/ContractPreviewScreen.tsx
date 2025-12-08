import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Button, ScrollView, ActivityIndicator } from "react-native";
import { apiAuthPost } from "../../config/api";
import { TrueqiaOffer } from "../../store/offers.store";
import { Trade } from "../../store/trades.store";

export default function ContractPreviewScreen({ route }: any) {
  const offer: TrueqiaOffer | undefined = route.params?.offer;
  const trade: Trade | undefined = route.params?.trade;

  const [requesterName, setRequesterName] = useState(
    trade?.participants?.[0] || "Solicitante demo"
  );
  const [providerName, setProviderName] = useState(
    trade?.participants?.[1] || "Proveedor demo"
  );
  const [tokens, setTokens] = useState(
    offer?.tokens !== undefined
      ? String(offer.tokens)
      : trade?.tokens !== undefined
      ? String(trade.tokens)
      : "10"
  );
  const [notes, setNotes] = useState("");
  const [contractText, setContractText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const offerTitle = useMemo(
    () => trade?.title || offer?.title || "Oferta demo",
    [offer?.title, trade?.title]
  );

  async function generate() {
    setError(null);
    setLoading(true);
    const body = {
      offerId: offer?.id || trade?.offerId,
      tradeId: trade?.id,
      offerTitle,
      requesterName,
      providerName,
      tokens: Number(tokens) || 0,
      notes: notes.trim(),
      description: offer?.description,
    };
    try {
      const res = await apiAuthPost<{ contractText: string }>(
        "/trueqia/contracts/preview",
        body
      );
      setContractText(res.contractText);
    } catch (err: any) {
      if (err?.message === "SESSION_EXPIRED") {
        setError("Sesión expirada, vuelve a iniciar sesión.");
      } else {
        setError("No se pudo generar el contrato demo.");
      }
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
    <ScrollView style={{ flex: 1, padding: 24 }}>
      <Text style={{ fontSize: 20, marginBottom: 8 }}>
        Contrato IA – {offerTitle}
      </Text>

      <View style={{ marginBottom: 12 }}>
        <Text style={{ fontWeight: "600" }}>Oferta seleccionada</Text>
        {offer?.id && <Text>ID: {offer.id}</Text>}
        {offer?.tokens !== undefined && <Text>Tokens: {offer.tokens}</Text>}
        {offer?.description && <Text>{offer.description}</Text>}
        {trade?.id && (
          <Text style={{ color: "#444", marginTop: 4 }}>
            Trueque {trade.id} – estado {trade.status || "pending"}
          </Text>
        )}
      </View>

      <Text>Nombre solicitante:</Text>
      <TextInput
        style={{ borderWidth: 1, marginBottom: 8, padding: 8 }}
        value={requesterName}
        onChangeText={setRequesterName}
      />

      <Text>Nombre proveedor:</Text>
      <TextInput
        style={{ borderWidth: 1, marginBottom: 8, padding: 8 }}
        value={providerName}
        onChangeText={setProviderName}
      />

      <Text>Tokens:</Text>
      <TextInput
        style={{ borderWidth: 1, marginBottom: 8, padding: 8 }}
        value={tokens}
        onChangeText={setTokens}
        keyboardType="numeric"
      />

      <Text>Notas adicionales:</Text>
      <TextInput
        style={{ borderWidth: 1, marginBottom: 8, padding: 8, height: 60 }}
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      <Button title="Generar contrato demo" onPress={generate} disabled={loading} />

      {loading && (
        <View style={{ marginTop: 12 }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 6 }}>Solicitando contrato…</Text>
        </View>
      )}

      {error && (
        <Text style={{ color: "#B3261E", marginTop: 8 }}>{error}</Text>
      )}

      {contractText && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontWeight: "bold", marginBottom: 4 }}>
            Resultado:
          </Text>
          <Text>{contractText}</Text>
          <Text style={{ marginTop: 8, color: "#444" }}>
            Próximamente podrás copiar/compartir este contrato.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
