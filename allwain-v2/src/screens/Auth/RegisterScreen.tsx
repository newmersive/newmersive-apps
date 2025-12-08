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
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";

type Role = "buyer" | "company" | "";

type Props = NativeStackScreenProps<RootStackParamList, "Register">;

export default function RegisterScreen({ navigation }: Props) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setAuth = useAuthStore((s) => s.setAuth);

  async function handleRegister() {
    if (!name || !email || !password || !role) {
      setError("Faltan campos o rol");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const result = await apiPost<AuthResponse>("/auth/register", {
        name,
        email,
        password,
        role,
      });

      setAuth(result);
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

  function isRoleSelected(r: Role) {
    return role === r;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Crear cuenta</Text>

      <TextInput
        style={styles.input}
        placeholder="Nombre"
        value={name}
        onChangeText={setName}
      />

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

      <Text style={styles.label}>Rol</Text>
      <View style={styles.rolesRow}>
        <View style={styles.roleButtonWrapper}>
          <Button
            title={isRoleSelected("buyer") ? "✔ Comprador" : "Comprador"}
            onPress={() => setRole("buyer")}
          />
        </View>
        <View style={{ width: 12 }} />
        <View style={styles.roleButtonWrapper}>
          <Button
            title={isRoleSelected("company") ? "✔ Empresa" : "Empresa"}
            onPress={() => setRole("company")}
          />
        </View>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <ActivityIndicator />
      ) : (
        <Button
          title="Registrar y entrar"
          onPress={handleRegister}
          disabled={!role}
        />
      )}
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
  label: { marginTop: 8, marginBottom: 8, fontWeight: "600" },
  rolesRow: { flexDirection: "row", alignItems: "center" },
  roleButtonWrapper: { flex: 1 },
  error: { color: "red", marginTop: 12, marginBottom: 12 },
});
