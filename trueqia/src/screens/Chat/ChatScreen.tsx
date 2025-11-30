import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
} from "react-native";
import { colors } from "../../config/theme";

type Message = {
  id: string;
  from: "me" | "them";
  body: string;
};

type Conversation = {
  id: string;
  name: string;
  topic: string;
  messages: Message[];
};

const initialConversations: Conversation[] = [
  {
    id: "1",
    name: "Lucía",
    topic: "Trueque de clases",
    messages: [
      { id: "1", from: "them", body: "¿Seguimos con el intercambio?" },
      { id: "2", from: "me", body: "Sí, puedo martes y jueves." },
    ],
  },
  {
    id: "2",
    name: "Andrés",
    topic: "Diseño de logo",
    messages: [
      { id: "1", from: "them", body: "Te paso boceto hoy" },
      { id: "2", from: "me", body: "¡Genial!" },
    ],
  },
  {
    id: "3",
    name: "Equipo TRUEQIA",
    topic: "Novedades",
    messages: [
      { id: "1", from: "them", body: "Prueba la nueva app" },
      { id: "2", from: "me", body: "La interfaz se ve limpia" },
    ],
  },
];

export default function ChatScreen() {
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState(initialConversations[0].id);
  const [draft, setDraft] = useState("");

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? conversations[0],
    [conversations, selectedId]
  );

  const sendMessage = () => {
    if (!draft.trim()) return;

    const updated = conversations.map((conversation) =>
      conversation.id === selectedId
        ? {
            ...conversation,
            messages: [
              ...conversation.messages,
              {
                id: `${conversation.messages.length + 1}`,
                from: "me",
                body: draft.trim(),
              },
            ],
          }
        : conversation
    );

    setConversations(updated);
    setDraft("");
  };

  return (
    <View style={styles.container}>
      <View style={styles.conversationList}>
        <Text style={styles.sectionTitle}>Conversaciones</Text>
        <FlatList
          data={conversations}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12, paddingVertical: 12 }}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.conversationItem,
                item.id === selectedId && styles.conversationItemActive,
              ]}
              onPress={() => setSelectedId(item.id)}
            >
              <Text style={styles.conversationName}>{item.name}</Text>
              <Text style={styles.conversationTopic}>{item.topic}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      <View style={styles.messagesWrapper}>
        <Text style={styles.sectionTitle}>{selectedConversation.name}</Text>
        <FlatList
          data={selectedConversation.messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ gap: 10 }}
          renderItem={({ item }) => (
            <View
              style={[
                styles.message,
                item.from === "me" ? styles.messageMe : styles.messageThem,
              ]}
            >
              <Text
                style={
                  item.from === "me" ? styles.messageTextMe : styles.messageText
                }
              >
                {item.body}
              </Text>
            </View>
          )}
        />
      </View>

      <View style={styles.inputBar}>
        <TextInput
          style={styles.textInput}
          placeholder="Escribe un mensaje"
          placeholderTextColor={colors.muted}
          value={draft}
          onChangeText={setDraft}
        />
        <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
          <Text style={styles.sendButtonText}>Enviar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
    gap: 12,
  },
  conversationList: {
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  conversationItem: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    borderRadius: 12,
    minWidth: 140,
  },
  conversationItemActive: {
    borderColor: colors.primary,
  },
  conversationName: {
    color: colors.text,
    fontWeight: "600",
    marginBottom: 4,
  },
  conversationTopic: {
    color: colors.muted,
  },
  messagesWrapper: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#FFFFFF",
    gap: 10,
  },
  message: {
    padding: 10,
    borderRadius: 10,
    maxWidth: "80%",
  },
  messageMe: {
    alignSelf: "flex-end",
    backgroundColor: colors.primary,
  },
  messageThem: {
    alignSelf: "flex-start",
    backgroundColor: "#F2F6FF",
  },
  messageText: {
    color: colors.text,
  },
  messageTextMe: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    backgroundColor: "#FFFFFF",
  },
  sendButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
  },
  sendButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
