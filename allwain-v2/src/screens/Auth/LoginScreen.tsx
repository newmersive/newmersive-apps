import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { apiPost, AuthResponse } from "../../config/api";
import { useAuthStore } from "../../store/auth.store";

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
      <Text style={styles.title}>Iniciar sesión</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      <TextInput
        style={styles.input}
        placeholder="Contraseña"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <ActivityIndicator />
      ) : (
        <Button title="Entrar" onPress={handleLogin} />
      )}

      <View style={{ height: 12 }} />
      <Button
        title="Crear cuenta"
        onPress={() => navigation.navigate("Register")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24 },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
  },
  error: { color: "red", marginBottom: 12 },
});
