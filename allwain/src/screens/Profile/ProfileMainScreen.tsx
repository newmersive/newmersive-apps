import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useAuthStore } from "../../store/auth.store";
import { colors } from "../../theme/colors";

export default function ProfileMainScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  function logout() {
    clearAuth();
    navigation.replace("Login");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Perfil</Text>
      <Text style={styles.body}>Email: {user?.email}</Text>
      <Text style={styles.body}>Rol: {user?.role}</Text>

      {user?.role === "admin" && (
        <>
          <TouchableOpacity
            style={[styles.primaryButton, { marginTop: 12 }]}
            onPress={() => navigation.navigate("AdminDashboard")}
            activeOpacity={0.9}
          >
            <Text style={styles.primaryButtonText}>Panel Admin</Text>
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity style={[styles.secondaryButton, { marginTop: 12 }]} onPress={logout} activeOpacity={0.9}>
        <Text style={styles.secondaryButtonText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: colors.salmon },
  title: { fontSize: 24, marginBottom: 8, color: colors.dark, fontWeight: "800" },
  body: { color: colors.dark, fontWeight: "600", opacity: 0.9, marginBottom: 4 },
  primaryButton: {
    backgroundColor: colors.dark,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryButtonText: { color: colors.white, fontWeight: "800" },
  secondaryButton: {
    backgroundColor: colors.white,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.dark,
  },
  secondaryButtonText: { color: colors.dark, fontWeight: "800" },
});
