import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { colors } from "../../config/theme";
import { useAuthStore } from "../../store/auth.store";
import { UserAvatar } from "./UserAvatar";

export default function ProfileScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [loading, setLoading] = useState(false);

  const profile = {
    name: user?.name ?? "Usuario TRUEQIA",
    email: user?.email ?? "usuario@trueqia.com",
    role: user?.role ?? "colaborador",
    tokens: user?.tokens ?? 0,
  };

  async function handleLogout() {
    setLoading(true);
    await logout();
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Perfil</Text>
          <Text style={styles.subtitle}>Tu identidad y tus tokens en TrueQIA</Text>
        </View>
        <UserAvatar name={profile.name} email={profile.email} avatarUrl={user?.avatarUrl} size={64} />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Nombre</Text>
        <Text style={styles.value}>{profile.name}</Text>

        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{profile.email}</Text>

        <Text style={styles.label}>Rol</Text>
        <Text style={styles.value}>{profile.role}</Text>
      </View>

      <View style={[styles.card, styles.tokensCard]}>
        <View>
          <Text style={styles.label}>Tokens actuales</Text>
          <Text style={styles.tokensValue}>{profile.tokens}</Text>
          <Text style={styles.helper}>Acumula tokens cerrando trueques o invitando contactos.</Text>
        </View>
        <TouchableOpacity
          style={styles.sponsorsButton}
          onPress={() => navigation.navigate("Sponsors")}
        >
          <Text style={styles.sponsorsButtonText}>Ver patrocinadores</Text>
        </TouchableOpacity>
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    marginTop: 4,
    color: colors.muted,
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
  tokensCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  tokensValue: {
    color: colors.primary,
    fontSize: 28,
    fontWeight: "800",
    marginVertical: 4,
  },
  helper: {
    color: colors.muted,
    fontSize: 13,
    maxWidth: "80%",
  },
  sponsorsButton: {
    backgroundColor: "#E9EDFA",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  sponsorsButtonText: {
    color: colors.primary,
    fontWeight: "700",
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
