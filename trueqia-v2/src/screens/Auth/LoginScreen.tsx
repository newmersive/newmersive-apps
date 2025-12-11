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

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useAuthStore((s) => s.login);

  async function handleLogin() {
    if (!email || !password) {
      setError("Faltan email o contraseña");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await login(email, password);
      navigation.replace("MainTabs");
    } catch (err: any) {
      if (err?.message === "INVALID_CREDENTIALS") {
        setError("Credenciales incorrectas");
      } else {
        setError("Error al iniciar sesión");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Iniciar sesión</Text>
        <Text style={styles.subtitle}>
          Accede con tus credenciales para seguir tus trueques y ofertas.
        </Text>
      </View>

      <View style={styles.card}>
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
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Entrar</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate("Register")}
        >
          <Text style={styles.secondaryText}>Crear cuenta</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.l,
    justifyContent: "center",
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
    color: COLORS.text,
    backgroundColor: "#FFFFFF",
    marginBottom: SPACING.m,
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
