import React from "react";
import { View, Text } from "react-native";

export default function RequestsListScreen() {
  return (
    <View style={{ flex: 1, padding: 24 }}>
      <Text style={{ fontSize: 24 }}>Requests</Text>
      <Text>Pantalla lista para conectar peticiones reales al backend.</Text>
    </View>
  );
}
