import React, { useState } from "react";
import { View, Text, TextInput, Button, ScrollView } from "react-native";
import { apiAuthPost } from "../../config/api";

export default function ContractPreviewScreen({ route }: any) {
  const [requesterName, setRequesterName] = useState("Solicitante demo");
  const [providerName, setProviderName] = useState("Proveedor demo");
  const [tokens, setTokens] = useState("10");
  const [notes, setNotes] = useState("");
  const [contractText, setContractText] = useState<string | null>(null);

  const offerTitle = route.params?.offerTitle || "Oferta demo";

  async function generate() {
    const body = {
      offerTitle,
      requesterName,
      providerName,
      tokens: Number(tokens) || 0,
      notes,
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
