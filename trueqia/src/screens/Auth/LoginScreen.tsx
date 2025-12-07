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
    backgroundColor: colors.background,
    padding: spacing.l,
    justifyContent: "center",
  },
  header: {
    marginBottom: spacing.l,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    marginBottom: spacing.s,
    color: colors.text,
  },
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
    color: colors.text,
    backgroundColor: "#FFFFFF",
    marginBottom: spacing.m,
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
