import React from "react";
import { View, Text } from "react-native";
import { useAuthStore } from "../../store/auth.store";

export default function HomeScreen() {
  const user = useAuthStore((s) => s.user);
  return (
    <View style={{ flex: 1, padding: 24 }}>
      <Text style={{ fontSize: 24, marginBottom: 8 }}>
        Hola {user?.name || "usuario"} 👋
      </Text>
      <Text>
        Bienvenido a TrueQIA. Desde aquí podrás ver ofertas, crear peticiones y
        dejar que la IA te ayude a equilibrar los trueques.
      </Text>
    </View>
  );
}
