import React from "react";
import { View, Text } from "react-native";

export default function GuestsScreen() {
  return (
    <View style={{ flex: 1, padding: 24 }}>
      <Text style={{ fontSize: 24 }}>Panel de invitados</Text>
      <Text>
        Aquí verás tus invitados, cuánto ganan y las comisiones generadas (en
        euros o puntos) cuando Allwain esté conectado a la lógica final.
      </Text>
    </View>
  );
}
