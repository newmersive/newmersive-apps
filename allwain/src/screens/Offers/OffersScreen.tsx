import React from "react";
import { View, Text } from "react-native";

export default function OffersScreen() {
  return (
    <View style={{ flex: 1, padding: 24 }}>
      <Text style={{ fontSize: 24 }}>Ofertas de tiendas</Text>
      <Text>
        Aquí se mostrarán las ofertas y promociones de las tiendas cercanas
        según lo que escanees (conexión futura a IA y APIs de comercios).
      </Text>
    </View>
  );
}
