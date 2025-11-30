import React from "react";
import { View, Text } from "react-native";
import { useAuthStore } from "../../store/auth.store";

export default function HomeScreen() {
  const user = useAuthStore((s) => s.user);

  return (
    <View style={{ flex: 1, padding: 24 }}>
      <Text style={{ fontSize: 24, marginBottom: 12 }}>
        Hola {user?.name || "usuario"}, bienvenido a Allwain
      </Text>
      <Text>
        Desde aquí podrás escanear productos, comparar tiendas cercanas y ver
        cuánto podrías ahorrar.
      </Text>
    </View>
  );
}
