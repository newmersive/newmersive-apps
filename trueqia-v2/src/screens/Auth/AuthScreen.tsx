import React, { useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors } from "../../config/theme";
import { useAuthStore } from "../../store/auth.store";
import { RootStackParamList } from "../../navigation/RootNavigator";
import { demoModeEnabled } from "../../config/env";

export default function AuthScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "Auth">>();
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const sessionMessage = useAuthStore((s) => s.sessionMessage);
  const clearSessionMessage = useAuthStore((s) => s.clearSessionMessage);

  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sponsorCode, setSponsorCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (sessionMessage) {
      setError(sessionMessage);
      clearSessionMessage();
    }
  }, [sessionMessage, clearSessionMessage]);

  React.useEffect(() => {
    if (route.params?.sponsorCode) {
      setSponsorCode(route.params.sponsorCode);
      setAuthMode("register");
    }
  }, [route.params?.sponsorCode]);

  const handleAuth = async () => {
    const isRegister = authMode === "register";
    if (!email || !password || (isRegister && !name)) {
      setError("Completa nombre, email y contraseña");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      if (authMode === "login") {
        await login(email, password);
      } else {
        await register(name, email, password, sponsorCode.trim() || undefined);
      }
    } catch (err: any) {
      setError(err?.message || "Ocurrió un error. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        <View style={styles.header}>
          <Text style={styles.brand}>TRUEQIA</Text>
          <Text style={styles.subtitle}>Intercambia con confianza</Text>
        </View>

        <View style={styles.modeSwitcher}>
          <TouchableOpacity
            style={[styles.modeButton, authMode === "login" && styles.modeButtonActive]}
            onPress={() => setAuthMode("login")}
            disabled={loading}
          >
            <Text
              style={[styles.modeText, authMode === "login" && styles.modeTextActive]}
            >
              Entrar
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, authMode === "register" && styles.modeButtonActive]}
            onPress={() => setAuthMode("register")}
            disabled={loading}
          >
            <Text
              style={[styles.modeText, authMode === "register" && styles.modeTextActive]}
            >
              Crear cuenta
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          {authMode === "register" && (
            <TextInput
              style={styles.input}
              placeholder="Nombre"
              placeholderTextColor={colors.muted}
              value={name}
              onChangeText={setName}
            />
          )}
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.muted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            placeholder="Contraseña"
            placeholderTextColor={colors.muted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          {authMode === "register" && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Código de invitación (opcional)"
                placeholderTextColor={colors.muted}
                value={sponsorCode}
                onChangeText={setSponsorCode}
                autoCapitalize="characters"
              />
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => navigation.navigate("SponsorQR")}
                disabled={loading}
              >
                <Text style={styles.secondaryButtonText}>Escanear QR de patrocinador</Text>
              </TouchableOpacity>
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleAuth}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {authMode === "login" ? "Entrar" : "Crear cuenta"}
              </Text>
            )}
          </TouchableOpacity>

          {demoModeEnabled ? (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => navigation.navigate("DemoLanding")}
              disabled={loading}
            >
              <Text style={styles.secondaryButtonText}>Explorar demo sin registrarse</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: colors.background,
    justifyContent: "center",
  },
  header: {
    marginBottom: 32,
  },
  brand: {
    fontSize: 28,
    fontWeight: "bold",
    color: colors.text,
  },
  subtitle: {
    marginTop: 8,
    color: colors.muted,
    fontSize: 16,
  },
  form: {
    gap: 12,
  },
  modeSwitcher: {
    flexDirection: "row",
    backgroundColor: "#F6F8FF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginBottom: 12,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "transparent",
  },
  modeButtonActive: {
    backgroundColor: "#FFFFFF",
  },
  modeText: {
    color: colors.muted,
    fontWeight: "600",
  },
  modeTextActive: {
    color: colors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
    color: colors.text,
    backgroundColor: "#FFFFFF",
  },
  error: {
    color: "#B3261E",
    marginTop: 4,
    marginBottom: 4,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 16,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: colors.primary,
    fontWeight: "600",
  },
});
