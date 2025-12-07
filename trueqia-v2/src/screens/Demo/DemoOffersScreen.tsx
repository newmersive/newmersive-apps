import React from "react";
import { View, Text, Button } from "react-native";

const demoOffers = [
  { id: "1", title: "Clases de IA (demo)" },
  { id: "2", title: "Edición de vídeo (demo)" },
];

export default function DemoOffersScreen({ navigation }: any) {
  return (
    <View style={{ flex: 1, padding: 24 }}>
      <Text style={{ fontSize: 24, marginBottom: 16 }}>Ofertas demo</Text>
      {demoOffers.map((o) => (
        <View key={o.id} style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 18 }}>{o.title}</Text>
          <Button
            title="Ver detalle"
            onPress={() => navigation.navigate("DemoOfferDetail", { id: o.id })}
          />
        </View>
      ))}
    </View>
  );
}
