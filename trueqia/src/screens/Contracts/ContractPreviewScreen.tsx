import React, { useMemo, useState } from "react";
import { View, Text, TextInput, Button, ScrollView } from "react-native";
import { apiAuthPost } from "../../config/api";
import { TrueqiaOffer } from "../../store/offers.store";

export default function ContractPreviewScreen({ route }: any) {
  const offer: TrueqiaOffer | undefined = route.params?.offer;

  const [requesterName, setRequesterName] = useState("Solicitante demo");
  const [providerName, setProviderName] = useState("Proveedor demo");
  const [tokens, setTokens] = useState(
    offer?.tokens !== undefined ? String(offer.tokens) : "10"
  );
  const [notes, setNotes] = useState("");
  const [contractText, setContractText] = useState<string | null>(null);

  const offerTitle = useMemo(
    () => offer?.title || "Oferta demo",
    [offer?.title]
  );

  async function generate() {
    const body = {
      offerId: offer?.id,
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
    } catch (err) {
      setContractText("Error generando contrato demo.");
    }
  }

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

      <Button title="Generar contrato demo" onPress={generate} />

      {contractText && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontWeight: "bold", marginBottom: 4 }}>
            Resultado:
          </Text>
          <Text>{contractText}</Text>
        </View>
      )}
    </ScrollView>
  );
}
