import React from "react";
import { View, Text, Button } from "react-native";
import { useAuthStore } from "../../store/auth.store";

export default function ProfileMainScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  function logout() {
    clearAuth();
    navigation.replace("Login");
  }

  return (
    <View style={{ flex: 1, padding: 24 }}>
      <Text style={{ fontSize: 24 }}>Perfil</Text>
      <Text style={{ marginTop: 8 }}>Email: {user?.email}</Text>
      <Text>Rol: {user?.role}</Text>

      {user?.role === "admin" && (
        <>
          <View style={{ height: 12 }} />
          <Button
            title="Panel admin"
            onPress={() => navigation.navigate("AdminDashboard")}
          />
        </>
      )}

      <View style={{ height: 12 }} />
      <Button title="Cerrar sesión" onPress={logout} />
    </View>
  );
}
