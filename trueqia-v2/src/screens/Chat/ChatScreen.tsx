import React, { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
} from "react-native";
import { colors } from "../../config/theme";

type Message = {
  id: string;
  from: "tú" | "contacto";
  text: string;
  time: string;
};

export default function ChatScreen() {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      from: "contacto",
      text: "Hola, ¿te interesa intercambiar 10 tokens por la mentoría?",
      time: "09:30",
    },
    {
      id: "2",
      from: "tú",
      text: "Sí. Genero el contrato IA y te aviso por aquí.",
      time: "09:32",
    },
  ]);

  const listRef = useRef<FlatList<Message>>(null);
  const canSend = useMemo(() => draft.trim().length > 0, [draft]);

  function send() {
    if (!canSend) return;

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");

    const next: Message = {
      id: String(Date.now()),
      from: "tú",
      text: draft.trim(),
      time: `${hh}:${mm}`,
    };

    setMessages((prev) => [...prev, next]);
    setDraft("");

    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Chat</Text>
        <Text style={styles.subtitle}>Conversación segura (demo local)</Text>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.from === "tú" ? styles.bubbleOwn : styles.bubbleRemote,
            ]}
          >
            <Text style={styles.bubbleText}>{item.text}</Text>
            <Text style={styles.time}>{item.time}</Text>
          </View>
        )}
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Escribe un mensaje"
          placeholderTextColor={colors.muted}
          value={draft}
          onChangeText={setDraft}
          multiline
        />
        <TouchableOpacity
          style={[styles.send, !canSend && styles.sendDisabled]}
          onPress={send}
          disabled={!canSend}
          activeOpacity={0.9}
        >
          <Text style={styles.sendText}>Enviar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 18 },
  header: { gap: 4, marginBottom: 10 },
  title: { fontSize: 22, fontWeight: "900", color: colors.text },
  subtitle: { color: colors.muted, fontWeight: "700" },

  list: { paddingVertical: 10, gap: 10, flexGrow: 1 },

  bubble: { maxWidth: "86%", padding: 12, borderRadius: 16 },
  bubbleOwn: { alignSelf: "flex-end", backgroundColor: colors.primary },
  bubbleRemote: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },

  bubbleText: { color: colors.text, fontWeight: "700" },
  time: { color: colors.muted, marginTop: 6, fontSize: 12, fontWeight: "700" },

  inputRow: { flexDirection: "row", gap: 10, paddingTop: 10 },
  input: {
    flex: 1,
    minHeight: 48,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  send: {
    minWidth: 86,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { opacity: 0.55 },
  sendText: { color: "#0b0c0e", fontWeight: "900" },
});

