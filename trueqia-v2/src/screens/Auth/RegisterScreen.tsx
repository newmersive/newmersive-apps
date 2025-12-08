import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { colors } from "../../config/theme";
import { radii, spacing } from "../../config/layout";
import { useAuthStore } from "../../store/auth.store";

export default function RegisterScreen({ navigation }: any) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const register = useAuthStore((s) => s.register);

  async function handleRegister() {
    if (!name || !email || !password) {
      setError("Completa nombre, email y contraseña");
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Crear cuenta</Text>
        <Text style={styles.subtitle}>
          Configura tu perfil para empezar a conectar y negociar con claridad.
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

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Registrar y entrar</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate("Login")}
        >
          <Text style={styles.secondaryText}>Ya tengo cuenta</Text>
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
  title: { fontSize: 28, fontWeight: "800", marginBottom: spacing.s, color: colors.text },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.l,
    padding: spacing.l,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.m,
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.m,
    marginBottom: spacing.m,
    color: colors.text,
    backgroundColor: "#FFFFFF",
    fontSize: 16,
  },
  error: { color: "#B3261E", marginBottom: spacing.m },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.m,
    borderRadius: radii.l,
    alignItems: "center",
  },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 16 },
  buttonDisabled: { opacity: 0.7 },
  secondaryButton: {
    marginTop: spacing.m,
    paddingVertical: spacing.m,
    alignItems: "center",
    borderRadius: radii.m,
  },
  secondaryText: { color: colors.primary, fontWeight: "700" },
});
