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

export default function LoginScreen({ navigation }: any) {
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
      });

      setAuth(result);
      // RootNavigator se encargará de llevarnos al stack de tabs cuando el usuario exista
    } catch (err: any) {
      console.error("Error al iniciar sesión", err);
      if (err?.message === "INVALID_CREDENTIALS") {
        setError("Credenciales incorrectas");
      } else if (err?.message?.includes("Network request failed")) {
        setError("No se pudo conectar con el servidor. Revisa la URL base o tu red.");
      } else {
        setError(err?.message || "Error al iniciar sesión");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Iniciar sesión</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.mutedText}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          placeholderTextColor={colors.mutedText}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        {loading ? (
          <ActivityIndicator color={colors.button} />
        ) : (
          <TouchableOpacity style={styles.button} onPress={handleLogin}>
            <Text style={styles.buttonText}>Entrar</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={() => navigation.navigate("Register")}
        >
          <Text style={styles.buttonText}>Crear cuenta</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.background,
  },
  card: {
    backgroundColor: colors.card,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 16,
    color: colors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
    color: colors.text,
    backgroundColor: colors.card,
  },
  error: { color: colors.danger, marginBottom: 12 },
  button: {
    backgroundColor: colors.button,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  secondaryButton: {
    marginTop: 12,
  },
  buttonText: {
    color: colors.buttonText,
    fontWeight: "700",
    fontSize: 16,
  },
});
