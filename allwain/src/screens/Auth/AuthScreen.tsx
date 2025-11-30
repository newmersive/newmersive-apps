import React, { useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useAuthStore } from "../../store/auth.store";
import { colors } from "../../theme/colors";

export default function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);

  async function handleAuth(action: "login" | "register") {
    if (!email || !password) {
      setError("Ingresa email y contraseña");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (action === "login") {
        await login(email, password);
      } else {
        await register(email, password);
      }
    } catch (err) {
      setError("No se pudo procesar la solicitud (mock)");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.branding}>
          <Text style={styles.logo}>allwain</Text>
          <Text style={styles.claim}>See more. Be more.</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="tu@email.com"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor={colors.muted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={() => handleAuth("login")}
            disabled={loading}
            activeOpacity={0.9}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.buttonText}>Entrar</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryAction}
            onPress={() => handleAuth("register")}
            disabled={loading}
          >
            <Text style={styles.secondaryText}>Crear cuenta</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.salmon },
  container: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 40,
    backgroundColor: colors.salmon,
  },
  branding: {
    alignItems: "center",
    marginBottom: 32,
    marginTop: 32,
  },
  logo: {
    color: colors.white,
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: 1.5,
    textTransform: "lowercase",
  },
  claim: {
    color: colors.dark,
    fontSize: 18,
    marginTop: 8,
    fontWeight: "600",
  },
  form: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 20,
    shadowColor: colors.dark,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  label: {
    color: colors.dark,
    fontWeight: "700",
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.white,
    color: colors.dark,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  error: {
    color: colors.dark,
    marginBottom: 12,
    fontWeight: "600",
  },
  button: {
    backgroundColor: colors.dark,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: colors.white,
    fontWeight: "800",
    fontSize: 16,
    letterSpacing: 0.3,
  },
  secondaryAction: {
    marginTop: 12,
    alignItems: "center",
    backgroundColor: colors.white,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.dark,
  },
  secondaryText: {
    color: colors.dark,
    fontWeight: "800",
  },
});
