import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { apiPost, AuthResponse } from "../../config/api";
import { useAuthStore } from "../../store/auth.store";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";

const COLORS = {
  background: "#FF795A",
  primary: "#FFFFFF",
  accent: "#000000",
  muted: "rgba(255,255,255,0.7)",
};

const RADIUS = { m: 14, l: 22 };
const SPACING = { s: 8, m: 14, l: 20 };

const INPUT_STYLE = {
  borderWidth: 1,
  borderColor: COLORS.primary,
  backgroundColor: "rgba(255,255,255,0.15)",
  color: COLORS.primary,
  borderRadius: RADIUS.m,
  paddingVertical: SPACING.m,
  paddingHorizontal: SPACING.m,
  fontSize: 16,
};

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setAuth = useAuthStore((s) => s.setAuth);

  async function handleLogin() {
    if (!email || !password) {
      setError("Faltan email o contraseña");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const result = await apiPost<AuthResponse>("/auth/login", {
        email,
        password,
        app: "allwain",
      });

      setAuth(result);
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
        <Text style={styles.brand}>Allwain</Text>
        <Text style={styles.title}>Bienvenido de vuelta</Text>
        <Text style={styles.subtitle}>
          Inicia sesión para continuar tus gestiones y escaneos.
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
            <ActivityIndicator color={COLORS.accent} />
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
  brand: {
    color: COLORS.accent,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    color: COLORS.primary,
    fontSize: 30,
    fontWeight: "800",
    marginTop: SPACING.s,
  },
  subtitle: {
    color: COLORS.muted,
    marginTop: SPACING.s,
    lineHeight: 20,
  },
  card: {
    backgroundColor: "rgba(0,0,0,0.1)",
    borderRadius: RADIUS.l,
    padding: SPACING.l,
    gap: SPACING.m,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  input: INPUT_STYLE,
  error: { color: COLORS.primary, fontWeight: "600" },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.m,
    borderRadius: RADIUS.l,
    alignItems: "center",
  },
  primaryButtonText: {
    color: COLORS.accent,
    fontWeight: "800",
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.85,
  },
  secondaryButton: {
    paddingVertical: SPACING.m,
    alignItems: "center",
    borderRadius: RADIUS.m,
  },
  secondaryText: {
    color: COLORS.primary,
    fontWeight: "700",
    fontSize: 15,
  },
});
