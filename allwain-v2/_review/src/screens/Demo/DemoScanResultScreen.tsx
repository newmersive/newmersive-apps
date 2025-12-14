import React from "react";
import { View, Text } from "react-native";

export default function DemoScanResultScreen() {
  return (
    <View style={{ flex: 1, padding: 24 }}>
      <Text style={{ fontSize: 24, marginBottom: 12 }}>
        Resultado demo de escaneo
      </Text>
      <Text style={{ marginBottom: 8 }}>
        Etiqueta leída: "Café molido 500g".
      </Text>
      <Text>Tiendas cercanas (ejemplo):</Text>
      <Text>- Tienda A · 2 km · 3,50 €</Text>
      <Text>- Tienda B · 1,2 km · 3,40 €</Text>
      <Text>- Tienda C · 4,8 km · 3,20 € (oferta)</Text>
    </View>
  );
}
