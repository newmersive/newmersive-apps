import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from "react-native";
import { useAuthStore } from "../../store/auth.store";
import { colors } from "../../theme/colors";

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const displayUser =
    user || ({ name: "Allwain User", email: "demo@allwain.com", role: "Comprador" } as const);

  function handleEdit() {
    Alert.alert("Función en desarrollo", "Editar perfil estará disponible pronto.");
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Perfil</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Nombre</Text>
        <Text style={styles.value}>{displayUser.name}</Text>

        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{displayUser.email}</Text>

        <Text style={styles.label}>Rol</Text>
        <Text style={styles.value}>{displayUser.role}</Text>

        <Text style={styles.claim}>See more. Be more.</Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleEdit} activeOpacity={0.9}>
        <Text style={styles.buttonText}>Editar perfil (mock)</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutButton} onPress={logout} activeOpacity={0.9}>
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.salmon,
  },
  content: {
    padding: 20,
    paddingBottom: 32,
  },
  heading: {
    color: colors.dark,
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 12,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  label: {
    color: colors.muted,
    fontWeight: "700",
    marginTop: 8,
  },
  value: {
    color: colors.dark,
    fontWeight: "800",
    fontSize: 16,
  },
  claim: {
    color: colors.dark,
    fontWeight: "700",
    marginTop: 14,
  },
  button: {
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.dark,
  },
  buttonText: {
    color: colors.dark,
    fontWeight: "800",
  },
  logoutButton: {
    backgroundColor: colors.dark,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  logoutText: {
    color: colors.white,
    fontWeight: "800",
  },
});
