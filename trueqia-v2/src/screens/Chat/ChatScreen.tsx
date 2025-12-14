import React, { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { colors } from "../../config/theme";

type Message = {
  id: string;
  from: "tú" | "contacto";
  text: string;
  timestamp: string;
};

export default function ChatScreen() {
  const navigation = useNavigation<any>();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      from: "contacto",
      text: "Hola, ¿te interesa intercambiar 10 tokens por la mentoría?",
      timestamp: "09:30",
    },
    {
      id: "2",
      from: "tú",
      text: "Sí, confirmo. Genero el contrato IA y te aviso por aquí.",
      timestamp: "09:32",
    },
  ]);

  const listRef = useRef<FlatList<Message>>(null);

  const canSend = useMemo(() => message.trim().length > 0, [message]);

  function handleSend() {
    if (!canSend) return;
    const next: Message = {
      id: String(Date.now()),
      from: "tú",
      text: message.trim(),
      timestamp: new Date().toLocaleTimeString().slice(0, 5),
    };
    setMessages((prev) => [...prev, next]);
    setMessage("");
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Chat de trueques</Text>
        <Text style={styles.subtitle}>Conversaciones seguras</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Canal principal</Text>
        <Text style={styles.cardPreview}>
          Usa este espacio para confirmar detalles mientras el backend de chat
          se habilita. Los mensajes quedan visibles en tu sesión actual.
        </Text>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.from === "tú" ? styles.bubbleOwn : styles.bubbleRemote,
            ]}
          >
            <Text style={styles.bubbleText}>{item.text}</Text>
            <Text style={styles.time}>{item.timestamp}</Text>
          </View>
        )}
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Escribe un mensaje"
          placeholderTextColor={colors.muted}
          value={message}
          onChangeText={setMessage}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!canSend}
        >
          <Text style={styles.buttonText}>Enviar</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.secondaryCta}
        onPress={() => navigation.navigate("Offers")}
      >
        <Text style={styles.secondaryCtaText}>Explorar ofertas</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
  },
  header: { gap: 4, marginBottom: 12 },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.text,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.muted,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderColor: colors.border,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 12,
    elevation: 3,
    gap: 8,
  },
  cardTitle: {
    color: colors.text,
    fontWeight: "700",
    marginBottom: 4,
  },
  cardPreview: { color: colors.muted },
  listContent: { flexGrow: 1, gap: 10, paddingVertical: 10 },
  bubble: {
    maxWidth: "86%",
    padding: 12,
    borderRadius: 16,
  },
  bubbleOwn: {
    alignSelf: "flex-end",
    backgroundColor: colors.primary,
  },
  bubbleRemote: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleText: {
    color: colors.text,
    fontWeight: "600",
  },
  time: {
    color: colors.muted,
    marginTop: 4,
    fontSize: 12,
  },
  inputRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  input: {
    flex: 1,
    minHeight: 48,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  sendButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 86,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#0b0c0e",
    fontWeight: "800",
  },
  secondaryCta: {
    marginTop: 12,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  secondaryCtaText: {
    color: colors.text,
    fontWeight: "700",
  },
});
