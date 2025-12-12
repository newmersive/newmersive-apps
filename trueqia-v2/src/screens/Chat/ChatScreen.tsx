import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { colors } from "../../config/theme";

export default function ChatScreen() {
  const navigation = useNavigation<any>();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Chat de trueques</Text>
      <Text style={styles.subtitle}>Conversaciones seguras</Text>

      <Text style={styles.description}>
        Aquí verás las conversaciones asociadas a tus trueques. Estamos
        habilitando la mensajería segura para coordinar detalles y compartir
        archivos con tus contactos.
      </Text>
      <Text style={styles.caption}>
        Las demás secciones (ofertas, trueques, contratos) siguen activas.
        Recibirás una notificación cuando el chat esté disponible.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Tu chat aparecerá aquí</Text>
        <Text style={styles.cardPreview}>
          En cuanto tengas un trueque activo, crearemos un canal privado para
          que coordines el intercambio sin salir de TrueQIA.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate("Offers")}
      >
        <Text style={styles.buttonText}>Explorar ofertas</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.primary,
  },
  description: {
    color: colors.muted,
    lineHeight: 20,
  },
  caption: {
    color: colors.muted,
    marginTop: 6,
    fontSize: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderColor: colors.border,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
    gap: 8,
  },
  cardTitle: {
    color: colors.text,
    fontWeight: "700",
    marginBottom: 4,
  },
  cardPreview: {
    color: colors.muted,
  },
  button: {
    marginTop: 20,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
    opacity: 0.85,
  },
  buttonText: {
    color: "#FFF",
    fontWeight: "700",
  },
});
