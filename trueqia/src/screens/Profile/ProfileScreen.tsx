import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { colors } from "../../config/theme";
import { useAuthStore } from "../../store/auth.store";

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [loading, setLoading] = useState(false);

  const profile = {
    name: user?.name ?? "Usuario TRUEQIA",
    email: user?.email ?? "usuario@trueqia.com",
    role: user?.role ?? "colaborador",
  };

  async function handleLogout() {
    setLoading(true);
    await logout();
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Perfil</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Nombre</Text>
        <Text style={styles.value}>{profile.name}</Text>

        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{profile.email}</Text>

        <Text style={styles.label}>Rol</Text>
        <Text style={styles.value}>{profile.role}</Text>
      </View>

      <TouchableOpacity
        style={[styles.button, styles.secondaryButton]}
        onPress={() => Alert.alert("Edición pendiente", "Próximamente podrás editar.")}
      >
        <Text style={styles.secondaryText}>Editar (mock)</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={handleLogout} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.buttonText}>Cerrar sesión</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  label: {
    color: colors.muted,
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  value: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
  },
  button: {
    backgroundColor: colors.primary,
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 16,
  },
  secondaryButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: 16,
  },
});
