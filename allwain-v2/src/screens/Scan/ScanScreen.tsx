import React from "react";
import { View, Text, Button } from "react-native";

export default function ScanScreen({ navigation }: any) {
  return (
    <View style={{ flex: 1, padding: 24, justifyContent: "center" }}>
      <Text style={{ fontSize: 24, marginBottom: 12 }}>
        Escanear producto
      </Text>
      <Text style={{ marginBottom: 20 }}>
        Aquí irá la cámara real y el lector de etiquetas / imagen con IA.
        De momento, simulamos el escaneo con un botón.
      </Text>

      <Button
        title="Simular escaneo y ver resultado"
        onPress={() => navigation.navigate("Resultado")}
      />
    </View>
  );
}
