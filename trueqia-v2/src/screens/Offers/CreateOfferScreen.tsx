import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { colors } from "../../config/theme";
import { useOffersStore } from "../../store/offers.store";

export default function CreateOfferScreen({ navigation }: any) {
  const createOffer = useOffersStore((s) => s.createOffer);
  const loadOffers = useOffersStore((s) => s.loadOffers);
  const loading = useOffersStore((s) => s.loading);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tokens, setTokens] = useState("");
  const [error, setError] = useState<string | null>(null);

  const numericTokens = useMemo(() => Number(tokens), [tokens]);
  const canSubmit =
    title.trim().length > 0 && Number.isFinite(numericTokens) && numericTokens > 0;

  async function handleSubmit() {
    setError(null);
    if (!canSubmit) {
      setError("Agrega un título y tokens mayores a cero.");
      return;
    }
    try {
      await createOffer({
        title: title.trim(),
        description: description.trim(),
        tokens: numericTokens,
      });
      await loadOffers();
      navigation.navigate("OffersList");
    } catch (err: any) {
      setError(err?.message || "No se pudo crear la oferta.");
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Crear oferta</Text>
      <Text style={styles.subtitle}>
        Publica tu producto o servicio y compártelo con la comunidad.
      </Text>

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

      <TouchableOpacity
        style={[styles.submitButton, !canSubmit || loading ? styles.buttonDisabled : null]}
        onPress={handleSubmit}
        disabled={!canSubmit || loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.submitText}>Publicar</Text>
        )}
      </TouchableOpacity>

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
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8,
    color: colors.text,
  },
  subtitle: {
    color: colors.muted,
    marginBottom: 12,
  },
  label: {
    fontWeight: "700",
    color: colors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: colors.surface,
    color: colors.text,
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
    color: colors.muted,
  },
  submitButton: {
    marginTop: 12,
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
  buttonDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: "#0b0c0e",
    fontWeight: "700",
    fontSize: 16,
  },
});
