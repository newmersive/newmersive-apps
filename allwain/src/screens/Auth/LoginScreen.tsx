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

type LoginScreenProps = { navigation: NavigationProp<ParamListBase> };

export default function LoginScreen({ navigation }: LoginScreenProps) {
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
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "INVALID_CREDENTIALS") {
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
          Continúa con tu cuenta para seguir gestionando tus invitaciones y
          experiencias.
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
          activeOpacity={0.9}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.primaryButtonText}>Entrar</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate("Register")}
          activeOpacity={0.9}
        >
          <Text style={styles.secondaryButtonText}>Crear cuenta</Text>
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
  title: {
    fontSize: 28,
    fontWeight: "800",
    marginBottom: spacing.s,
    color: colors.dark,
  },
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
    backgroundColor: colors.white,
    color: colors.dark,
    fontSize: 16,
  },
  error: { color: colors.dark, marginBottom: 12, fontWeight: "700" },
  primaryButton: {
    backgroundColor: colors.salmon,
    paddingVertical: spacing.m,
    borderRadius: radii.l,
    alignItems: "center",
  },
  primaryButtonText: {
    color: colors.white,
    fontWeight: "800",
    fontSize: 16,
  },
  buttonDisabled: { opacity: 0.7 },
  secondaryButton: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.m,
    borderRadius: radii.m,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.line,
  },
  secondaryButtonText: { color: colors.dark, fontWeight: "800" },
});
