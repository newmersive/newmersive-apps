import React from "react";
import { View, Text } from "react-native";

export default function ChatListScreen() {
  return (
    <View style={{ flex: 1, padding: 24 }}>
      <Text style={{ fontSize: 24 }}>Chats</Text>
      <Text>Pantalla lista para conectar un sistema de mensajería.</Text>
    </View>
  );
}
