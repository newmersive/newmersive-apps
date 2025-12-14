import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { API_BASE_URL } from "../../config/api";
import { useAuthStore } from "../../store/auth.store";
import { demoModeEnabled } from "../../config/env";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState("paco@newmersive.com");
  const [password, setPassword] = useState("123456");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useAuthStore((s) => s.login);

  async function handleLogin() {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();

    try {
      setLoading(true);
      setError(null);

      console.log("[LOGIN] base:", API_BASE_URL);
      console.log("[LOGIN] email:", cleanEmail);

      await login(cleanEmail, cleanPass);

      console.log("[LOGIN] setAuth OK, navigating -> MainTabs");
      navigation.replace("MainTabs");
    } catch (e: any) {
      const msg = String(e?.message ?? "UNKNOWN_ERROR");
      console.log("[LOGIN] ERROR:", msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Allwain</Text>

      <Text style={styles.debug}>API: {API_BASE_URL}</Text>

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

      <TouchableOpacity
        style={styles.button}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.buttonText}>Entrar</Text>
        )}
      </TouchableOpacity>

      {demoModeEnabled ? (
        <TouchableOpacity
          style={[styles.button, { backgroundColor: "#FFE1D9" }]}
          onPress={() => navigation.navigate("DemoLanding")}
        >
          <Text style={[styles.buttonText, { color: "#000" }]}>Probar demo</Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity onPress={() => navigation.navigate("Register")}>
        <Text style={styles.link}>Crear cuenta</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FF795A",
    padding: 24,
    justifyContent: "center",
  },
  title: { fontSize: 32, fontWeight: "800", color: "#000", marginBottom: 10 },
  debug: { fontSize: 12, color: "#000", opacity: 0.7, marginBottom: 12 },
  input: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  error: { color: "#000", fontWeight: "800", marginBottom: 8 },
  button: {
    backgroundColor: "#fff",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { fontWeight: "800", fontSize: 16 },
  link: { marginTop: 16, textAlign: "center", fontWeight: "700", color: "#000" },
});
