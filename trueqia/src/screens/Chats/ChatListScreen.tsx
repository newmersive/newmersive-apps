import React from "react";
import { View, Text } from "react-native";

export default function ChatListScreen() {
  return (
    <View style={{ flex: 1, padding: 24 }}>
      <Text style={{ fontSize: 24, marginBottom: 8 }}>Chats</Text>
      <Text style={{ color: "#444" }}>
        Módulo en desarrollo. Aquí verás tus conversaciones de trueques cuando
        el chat esté disponible.
      </Text>
    </View>
  );
}
