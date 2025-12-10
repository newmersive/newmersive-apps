import React from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from "react-native";
import { colors } from "../../config/theme";

const demoConversations = [
  {
    id: "1",
    title: "Diseño UX por mentoría",
    preview: "¿Te funciona tener el entregable el viernes?",
  },
  {
    id: "2",
    title: "Clases de inglés",
    preview: "Puedo darte 2 tokens de descuento si iniciamos mañana",
  },
];

export default function ChatScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Chat de trueques</Text>
      <Text style={styles.subtitle}>Módulo en desarrollo</Text>

      <Text style={styles.description}>
        Aquí verás tus conversaciones sobre trueques. Muy pronto podrás
        coordinar detalles, compartir archivos y recibir notificaciones en
        tiempo real.
      </Text>
      <Text style={styles.caption}>
        Las demás secciones (ofertas, trueques, contratos) siguen activas.
      </Text>

      <FlatList
        data={demoConversations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 10, marginTop: 16 }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardPreview}>{item.preview}</Text>
          </View>
        )}
        ListHeaderComponent={() => (
          <Text style={styles.listTitle}>Conversaciones de ejemplo</Text>
        )}
      />

      <TouchableOpacity style={styles.button} disabled>
        <Text style={styles.buttonText}>Pronto podrás chatear aquí</Text>
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
  listTitle: {
    color: colors.text,
    fontWeight: "700",
    marginBottom: 6,
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
