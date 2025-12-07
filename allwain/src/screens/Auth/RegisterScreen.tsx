import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { NavigationProp, ParamListBase } from "@react-navigation/native";
import { useAuthStore } from "../../store/auth.store";
import { colors } from "../../theme/colors";
import { radii, spacing } from "../../theme/layout";

type Role = "buyer" | "company" | "";
type RegisterScreenProps = { navigation: NavigationProp<ParamListBase> };

export default function RegisterScreen({ navigation }: RegisterScreenProps) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const register = useAuthStore((s) => s.register);

  async function handleRegister() {
    if (!name || !email || !password || !role) {
      setError("Faltan campos o rol");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await register(name, email, password);
      navigation.replace("MainTabs");
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "EMAIL_ALREADY_EXISTS") {
        setError("Ese email ya está registrado");
      } else {
        setError("Error al crear la cuenta");
      }
    } finally {
      setLoading(false);
    }
  }

  function isRoleSelected(r: Role) {
    return role === r;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Crear cuenta</Text>
        <Text style={styles.subtitle}>
          Diseñado para sentirse ligero: completa tus datos y elige tu rol para
          empezar.
        </Text>
      </View>

      <View style={styles.card}>
        <TextInput
          style={styles.input}
          placeholder="Nombre"
          placeholderTextColor={colors.muted}
          value={name}
          onChangeText={setName}
        />

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          placeholderTextColor={colors.muted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <Text style={styles.label}>Rol</Text>
        <View style={styles.rolesRow}>
          <TouchableOpacity
            style={[styles.roleButton, isRoleSelected("buyer") && styles.roleButtonActive]}
            onPress={() => setRole("buyer")}
            activeOpacity={0.9}
          >
            <Text
              style={[
                styles.roleButtonText,
                isRoleSelected("buyer") && styles.roleButtonTextActive,
              ]}
            >
              {isRoleSelected("buyer") ? "✔ Comprador" : "Comprador"}
            </Text>
          </TouchableOpacity>

          <View style={styles.roleSpacer} />

          <TouchableOpacity
            style={[styles.roleButton, isRoleSelected("company") && styles.roleButtonActive]}
            onPress={() => setRole("company")}
            activeOpacity={0.9}
          >
            <Text
              style={[
                styles.roleButtonText,
                isRoleSelected("company") && styles.roleButtonTextActive,
              ]}
            >
              {isRoleSelected("company") ? "✔ Empresa" : "Empresa"}
            </Text>
          </TouchableOpacity>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.primaryButton, (!role || loading) && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={!role || loading}
          activeOpacity={0.9}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.primaryButtonText}>Registrar y entrar</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.l,
    backgroundColor: colors.background,
  },
  header: {
    marginBottom: spacing.l,
  },
  title: { fontSize: 28, fontWeight: "800", marginBottom: spacing.s, color: colors.dark },
  subtitle: {
    color: colors.muted,
    lineHeight: 22,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.l,
    padding: spacing.l,
    borderWidth: 1,
    borderColor: colors.line,
    gap: spacing.s,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.m,
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.m,
    marginBottom: spacing.s,
    backgroundColor: colors.white,
    color: colors.dark,
    fontSize: 16,
  },
  label: {
    marginTop: spacing.s,
    marginBottom: spacing.s,
    fontWeight: "700",
    color: colors.dark,
    opacity: 0.85,
  },
  rolesRow: { flexDirection: "row", alignItems: "center" },
  roleButton: {
    flex: 1,
    backgroundColor: colors.white,
    paddingVertical: spacing.m,
    borderRadius: radii.m,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.line,
  },
  roleButtonActive: {
    borderColor: colors.dark,
  },
  roleButtonText: { color: colors.dark, fontWeight: "700" },
  roleButtonTextActive: { color: colors.dark, fontWeight: "800" },
  roleSpacer: { width: spacing.s },
  error: { color: colors.dark, marginTop: spacing.s, marginBottom: spacing.s, fontWeight: "700" },
  primaryButton: {
    backgroundColor: colors.salmon,
    paddingVertical: spacing.m,
    borderRadius: radii.l,
    alignItems: "center",
    marginTop: spacing.s,
  },
  primaryButtonText: { color: colors.white, fontWeight: "800", fontSize: 16 },
  buttonDisabled: { opacity: 0.7 },
});
