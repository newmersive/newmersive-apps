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

type Role = "buyer" | "company" | "";

type Props = NativeStackScreenProps<RootStackParamList, "Register">;

export default function RegisterScreen({ navigation }: Props) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const register = useAuthStore((s) => s.register);

  async function handleRegister() {
    if (!name || !email || !password || !role) {
      setError("Faltan campos o rol");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await register(name, email, password, undefined, role);
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
      <View style={styles.header}>
        <Text style={styles.brand}>Allwain</Text>
        <Text style={styles.title}>Crear cuenta</Text>
        <Text style={styles.subtitle}>
          Completa los datos para comenzar a escanear y gestionar tu negocio.
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

        <View style={styles.rolesHeader}>
          <Text style={styles.label}>Rol</Text>
          <Text style={styles.helper}>Selecciona el tipo de cuenta</Text>
        </View>

        <View style={styles.rolesRow}>
          <TouchableOpacity
            style={[
              styles.roleButton,
              isRoleSelected("buyer") && styles.roleButtonActive,
            ]}
            onPress={() => setRole("buyer")}
          >
            <Text
              style={[
                styles.roleText,
                isRoleSelected("buyer") && styles.roleTextActive,
              ]}
            >
              Comprador
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.roleButton,
              isRoleSelected("company") && styles.roleButtonActive,
            ]}
            onPress={() => setRole("company")}
          >
            <Text
              style={[
                styles.roleText,
                isRoleSelected("company") && styles.roleTextActive,
              ]}
            >
              Empresa
            </Text>
          </TouchableOpacity>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.accent} />
          ) : (
            <Text style={styles.primaryButtonText}>Registrar y entrar</Text>
          )}
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
  rolesHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    color: COLORS.primary,
    fontWeight: "700",
    fontSize: 15,
  },
  helper: {
    color: COLORS.muted,
    fontSize: 13,
  },
  rolesRow: {
    flexDirection: "row",
    gap: SPACING.m,
  },
  roleButton: {
    flex: 1,
    paddingVertical: SPACING.m,
    borderRadius: RADIUS.m,
    borderWidth: 1,
    borderColor: COLORS.primary,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  roleButtonActive: {
    backgroundColor: COLORS.primary,
  },
  roleText: {
    color: COLORS.primary,
    fontWeight: "600",
  },
  roleTextActive: {
    color: COLORS.accent,
  },
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
});
