import React from "react";
import { View, Text, Button } from "react-native";

export default function DemoLandingScreen({ navigation }: any) {
  return (
    <View style={{ flex: 1, padding: 24, justifyContent: "center" }}>
      <Text style={{ fontSize: 24, marginBottom: 12 }}>
        Bienvenido a Allwain (Demo)
      </Text>
      <Text style={{ marginBottom: 16 }}>
        Prueba cómo Allwain escanea productos y busca mejores opciones sin registrarte.
      </Text>
      <Button
        title="Ver demo de resultado"
        onPress={() => navigation.navigate("DemoScanResult")}
      />
      <View style={{ height: 12 }} />
      <Button title="Iniciar sesión" onPress={() => navigation.navigate("Login")} />
      <View style={{ height: 12 }} />
      <Button
        title="Crear cuenta"
        onPress={() => navigation.navigate("Register")}
      />
    </View>
  );
}
