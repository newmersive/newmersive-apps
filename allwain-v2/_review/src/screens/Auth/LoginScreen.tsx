import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { apiPost, API_BASE_URL } from "../../config/api";
import { useAuthStore } from "../../store/auth.store";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState("paco@newmersive.com");
  const [password, setPassword] = useState("123456");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setAuth = useAuthStore((s) => s.setAuth);

  async function handleLogin() {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();

    try {
      setLoading(true);
      setError(null);

      console.log("[LOGIN] base:", API_BASE_URL);
      console.log("[LOGIN] email:", cleanEmail);

      const res = await apiPost<any>("/auth/login", {
        email: cleanEmail,
        password: cleanPass,
      });

      console.log("[LOGIN] res keys:", res ? Object.keys(res) : null);

      if (!res?.token) {
        throw new Error("NO_TOKEN_IN_RESPONSE");
      }

      const user = res.user ?? {};
      setAuth({
        token: String(res.token),
        user: {
          id: String(user.id ?? ""),
          email: String(user.email ?? cleanEmail),
          role: String(user.role ?? "user"),
        },
      });

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
