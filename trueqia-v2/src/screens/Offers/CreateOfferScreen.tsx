import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useOffersStore } from "../../store/offers.store";

export default function CreateOfferScreen({ navigation }: any) {
  const createOffer = useOffersStore((s) => s.createOffer);
  const loading = useOffersStore((s) => s.loading);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tokens, setTokens] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canSubmit = title.trim().length > 0;

  async function handleSubmit() {
    setError(null);
    try {
      await createOffer({
        title: title.trim(),
        description: description.trim(),
        tokens: tokens ? Number(tokens) : undefined,
      });
      navigation.goBack();
    } catch (err: any) {
      setError(err?.message || "No se pudo crear la oferta.");
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Crear oferta</Text>

      <Text style={styles.label}>Título</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="Clases de inglés, asesoría, etc."
      />

      <Text style={styles.label}>Descripción</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="Incluye detalles de tu oferta"
        multiline
      />

      <Text style={styles.label}>Tokens</Text>
      <TextInput
        style={styles.input}
        value={tokens}
        onChangeText={setTokens}
        placeholder="Ej: 10"
        keyboardType="numeric"
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Button title="Publicar" onPress={handleSubmit} disabled={!canSubmit || loading} />

      {loading && (
        <View style={styles.loadingBox}>
          <ActivityIndicator />
          <Text style={styles.muted}>Enviando oferta…</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 16,
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8,
  },
  label: {
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 10,
  },
  multiline: {
    minHeight: 90,
    textAlignVertical: "top",
  },
  error: {
    color: "#B3261E",
  },
  loadingBox: {
    marginTop: 10,
    gap: 6,
  },
  muted: {
    color: "#555",
  },
});
