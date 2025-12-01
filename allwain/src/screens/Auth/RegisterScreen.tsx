import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useAuthStore } from "../../store/auth.store";
import { colors } from "../../theme/colors";

type Role = "buyer" | "company" | "";

export default function RegisterScreen({ navigation }: any) {
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
    } catch (err: any) {
      if (err?.message === "EMAIL_ALREADY_EXISTS") {
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
      <Text style={styles.title}>Crear cuenta</Text>

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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.salmon,
  },
  title: { fontSize: 24, fontWeight: "800", marginBottom: 16, color: colors.dark },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    backgroundColor: colors.white,
    color: colors.dark,
  },
  label: {
    marginTop: 8,
    marginBottom: 8,
    fontWeight: "700",
    color: colors.dark,
    opacity: 0.85,
  },
  rolesRow: { flexDirection: "row", alignItems: "center" },
  roleButton: {
    flex: 1,
    backgroundColor: colors.white,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.line,
  },
  roleButtonActive: {
    borderColor: colors.dark,
  },
  roleButtonText: { color: colors.dark, fontWeight: "700" },
  roleButtonTextActive: { color: colors.dark, fontWeight: "800" },
  roleSpacer: { width: 12 },
  error: { color: colors.dark, marginTop: 12, marginBottom: 12, fontWeight: "700" },
  primaryButton: {
    backgroundColor: colors.dark,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  primaryButtonText: { color: colors.white, fontWeight: "800", fontSize: 16 },
  buttonDisabled: { opacity: 0.7 },
});
