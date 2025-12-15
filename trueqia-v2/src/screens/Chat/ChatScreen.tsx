import React, { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { colors } from "../../config/theme";

type Message = {
  id: string;
  from: "me" | "other";
  text: string;
  time: string;
};

export default function ChatScreen() {
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      from: "other",
      text: "Hola, ¿te interesa intercambiar 10 tokens por la mentoría?",
      time: "09:30",
    },
    {
      id: "2",
      from: "me",
      text: "Sí. Genero el contrato IA y te confirmo por aquí.",
      time: "09:32",
    },
  ]);

  const listRef = useRef<FlatList<Message>>(null);
  const canSend = useMemo(() => text.trim().length > 0, [text]);

  function handleSend() {
    if (!canSend) return;

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");

    const next: Message = {
      id: String(Date.now()),
      from: "me",
      text: text.trim(),
      time: `${hh}:${mm}`,
    };

    setMessages((prev) => [...prev, next]);
    setText("");

    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Chat de trueques</Text>
        <Text style={styles.subtitle}>Conversaciones seguras</Text>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Canal principal</Text>
        <Text style={styles.infoText}>
          Este chat funciona en modo demo (sesión local). Luego lo conectamos al backend para
          guardar conversaciones y adjuntos.
        </Text>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const isMe = item.from === "me";
          return (
            <View
              style={[
                styles.bubble,
                isMe ? styles.bubbleMe : styles.bubbleOther,
              ]}
            >
              <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>
                {item.text}
              </Text>
              <Text style={styles.time}>{item.time}</Text>
            </View>
          );
        }}
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Escribe un mensaje"
          placeholderTextColor={colors.muted}
          value={text}
          onChangeText={setText}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!canSend}
          activeOpacity={0.9}
        >
          <Text style={styles.sendText}>Enviar</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 18 },
  header: { gap: 4, marginBottom: 10 },
  title: { fontSize: 24, fontWeight: "900", color: colors.text },
  subtitle: { fontSize: 14, fontWeight: "800", color: colors.primary },

  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
    gap: 6,
  },
  infoTitle: { color: colors.text, fontWeight: "900" },
  infoText: { color: colors.muted, fontWeight: "700", lineHeight: 20 },

  listContent: { flexGrow: 1, gap: 10, paddingVertical: 10 },

  bubble: {
    maxWidth: "86%",
    padding: 12,
    borderRadius: 16,
  },
  bubbleMe: {
    alignSelf: "flex-end",
    backgroundColor: colors.primary,
  },
  bubbleOther: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleText: { color: colors.text, fontWeight: "700" },
  bubbleTextMe: { color: "#0b0c0e" },
  time: { color: colors.muted, marginTop: 6, fontSize: 12, fontWeight: "700" },

  inputRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-end",
    paddingTop: 10,
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontWeight: "700",
  },
  sendButton: {
    minWidth: 92,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: colors.primary,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  sendButtonDisabled: { opacity: 0.5 },
  sendText: { color: "#0b0c0e", fontWeight: "900" },
});
