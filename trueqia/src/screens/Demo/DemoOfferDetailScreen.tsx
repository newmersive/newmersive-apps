import React from "react";
import { View, Text } from "react-native";

export default function DemoOfferDetailScreen({ route }: any) {
  const id = route.params?.id;
  return (
    <View style={{ flex: 1, padding: 24 }}>
      <Text style={{ fontSize: 24 }}>Detalle demo</Text>
      <Text>ID oferta: {id}</Text>
      <Text style={{ marginTop: 8 }}>
        Aquí verías la explicación completa de la oferta y la propuesta de intercambio.
      </Text>
    </View>
  );
}
