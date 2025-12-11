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

const COLORS = {
  background: "#FFFFFF",
  primary: "#004BFF",
  text: "#0A0A0A",
  muted: "rgba(0,0,0,0.5)",
  surface: "#F7F7F9",
  border: "#E5E7EB",
};

const RADIUS = { s: 10, m: 14, l: 22 };
const SPACING = { s: 8, m: 12, l: 20 };

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
          placeholderTextColor={COLORS.muted}
          value={name}
          onChangeText={setName}
        />

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={COLORS.muted}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          placeholderTextColor={COLORS.muted}
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
    padding: SPACING.l,
    backgroundColor: COLORS.background,
  },
  header: {
    marginBottom: SPACING.l,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    marginBottom: SPACING.s,
    color: COLORS.text,
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.l,
    padding: SPACING.l,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.m,
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.m,
    marginBottom: SPACING.m,
    color: COLORS.text,
    backgroundColor: "#FFFFFF",
    fontSize: 16,
  },
  error: { color: "#B3261E", marginBottom: SPACING.m },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.m,
    borderRadius: RADIUS.l,
    alignItems: "center",
  },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 16 },
  buttonDisabled: { opacity: 0.7 },
  secondaryButton: {
    marginTop: SPACING.m,
    paddingVertical: SPACING.m,
    alignItems: "center",
    borderRadius: RADIUS.m,
  },
  secondaryText: { color: COLORS.primary, fontWeight: "700" },
});
