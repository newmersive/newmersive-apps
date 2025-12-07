import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { apiPost, AuthResponse } from "../../config/api";
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

  const setAuth = useAuthStore((s) => s.setAuth);

  async function handleRegister() {
    if (!name || !email || !password || !role) {
      setError("Faltan campos o rol");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const result = await apiPost<AuthResponse>("/auth/register", {
        name,
        email,
        password,
        role,
      });

      setAuth(result);
      // El cambio de store llevará al stack autenticado
    } catch (err: any) {
      console.error("Error al registrar", err);
      if (err?.message === "EMAIL_ALREADY_EXISTS") {
        setError("Ese email ya está registrado");
      } else if (err?.message?.includes("Network request failed")) {
        setError("No se pudo conectar con el servidor. Revisa la URL base o tu red.");
      } else {
        setError(err?.message || "Error al crear la cuenta");
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
      <View style={styles.card}>
        <Text style={styles.title}>Crear cuenta</Text>

        <TextInput
          style={styles.input}
          placeholder="Nombre"
          placeholderTextColor="rgba(64, 64, 65, 0.6)"
          value={name}
          onChangeText={setName}
        />

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="rgba(64, 64, 65, 0.6)"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          placeholderTextColor="rgba(64, 64, 65, 0.6)"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <Text style={styles.label}>Rol</Text>
        <View style={styles.rolesRow}>
          <TouchableOpacity
            style={[
              styles.roleButton,
              isRoleSelected("buyer") && styles.roleButtonActive,
            ]}
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
          <TouchableOpacity
            style={[
              styles.roleButton,
              isRoleSelected("company") && styles.roleButtonActive,
            ]}
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

        {loading ? (
          <ActivityIndicator color={colors.button} />
        ) : (
          <TouchableOpacity
            style={[styles.button, !role && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={!role}
            activeOpacity={0.9}
          >
            <Text style={styles.buttonText}>Registrar y entrar</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.primary,
  },
  card: {
    backgroundColor: colors.card,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 16, color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
    color: colors.text,
    backgroundColor: colors.card,
  },
  label: {
    marginTop: 8,
    marginBottom: 8,
    fontWeight: "700",
    color: colors.text,
  },
  rolesRow: { flexDirection: "row", alignItems: "center", columnGap: 12 },
  roleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: "center",
    backgroundColor: colors.card,
  },
  roleButtonActive: {
    backgroundColor: colors.button,
    borderColor: colors.button,
  },
  roleButtonText: { color: colors.text, fontWeight: "700" },
  roleButtonTextActive: { color: colors.buttonText },
  error: { color: "red", marginTop: 12, marginBottom: 12 },
  button: {
    backgroundColor: colors.button,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: colors.buttonText,
    fontWeight: "700",
    fontSize: 16,
  },
});
