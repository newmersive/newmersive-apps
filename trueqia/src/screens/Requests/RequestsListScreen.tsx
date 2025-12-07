import React from "react";
import { View, Text } from "react-native";

export default function RequestsListScreen() {
  return (
    <View style={{ flex: 1, padding: 24 }}>
      <Text style={{ fontSize: 24, marginBottom: 8 }}>Requests</Text>
      <Text style={{ color: "#444" }}>
        Módulo en desarrollo. Aquí verás tus peticiones y podrás gestionarlas
        cuando esté conectado al backend.
      </Text>
    </View>
  );
}
