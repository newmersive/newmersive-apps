import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useAuthStore } from "../../store/auth.store";
import { colors } from "../../theme/colors";

export default function ProfileMainScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  async function handleLogout() {
    await logout();
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Perfil</Text>
        <Text style={styles.detail}>Email: {user?.email}</Text>
        <Text style={styles.detail}>Rol: {user?.role}</Text>

        {user?.role === "admin" && (
          <TouchableOpacity
            style={styles.button}
            onPress={() => navigation.navigate("AdminDashboard")}
            activeOpacity={0.9}
          >
            <Text style={styles.buttonText}>Panel Admin</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.button}
          onPress={handleLogout}
          activeOpacity={0.9}
        >
          <Text style={styles.buttonText}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: colors.primary },
  card: {
    backgroundColor: colors.card,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  title: { fontSize: 24, marginBottom: 12, color: colors.text, fontWeight: "700" },
  detail: { color: colors.text, marginBottom: 6 },
  button: {
    marginTop: 12,
    backgroundColor: colors.button,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonText: { color: colors.buttonText, fontWeight: "700" },
});
