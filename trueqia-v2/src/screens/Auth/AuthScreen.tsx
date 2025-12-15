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
  Image,
} from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors } from "../../config/theme";
import { useAuthStore } from "../../store/auth.store";
import { RootStackParamList } from "../../navigation/RootNavigator";
import { demoModeEnabled } from "../../config/env";

const LOGO = require("../../assets/logos/trueqia-logo.png");

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
          <Image source={LOGO} style={styles.logo} resizeMode="contain" />
          <Text style={styles.subtitle}>Intercambia con confianza</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.modeSwitcher}>
            <TouchableOpacity
              style={[
                styles.modeButton,
                authMode === "login" && styles.modeButtonActive,
              ]}
              onPress={() => setAuthMode("login")}
              disabled={loading}
              activeOpacity={0.9}
            >
              <Text
                style={[
                  styles.modeText,
                  authMode === "login" && styles.modeTextActive,
                ]}
              >
                Entrar
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modeButton,
                authMode === "register" && styles.modeButtonActive,
              ]}
              onPress={() => setAuthMode("register")}
              disabled={loading}
              activeOpacity={0.9}
            >
              <Text
                style={[
                  styles.modeText,
                  authMode === "register" && styles.modeTextActive,
                ]}
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
                  activeOpacity={0.9}
                >
                  <Text style={styles.secondaryButtonText}>
                    Escanear QR de patrocinador
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleAuth}
              disabled={loading}
              activeOpacity={0.9}
            >
              {loading ? (
                <ActivityIndicator color="#0b0c0e" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {authMode === "login" ? "Entrar" : "Crear cuenta"}
                </Text>
              )}
            </TouchableOpacity>

            {demoModeEnabled ? (
              <TouchableOpacity
                style={styles.ghostButton}
                onPress={() => navigation.navigate("DemoLanding")}
                disabled={loading}
                activeOpacity={0.9}
              >
                <Text style={styles.ghostText}>Explorar demo sin registrarse</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: colors.background,
    justifyContent: "center",
    gap: 14,
  },
  header: { alignItems: "center", gap: 8, marginBottom: 6 },
  logo: { height: 64, width: 220 },
  subtitle: { color: colors.muted, fontSize: 15, fontWeight: "600" },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 22,
    elevation: 8,
  },

  modeSwitcher: {
    flexDirection: "row",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginBottom: 12,
    backgroundColor: "#2c2728",
  },
  modeButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "transparent",
  },
  modeButtonActive: { backgroundColor: "#3b3536" },
  modeText: { color: colors.muted, fontWeight: "800" },
  modeTextActive: { color: colors.text },

  form: { gap: 12 },

  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    color: colors.text,
    backgroundColor: "#181516",
  },

  error: { color: "#ffaba3", fontWeight: "700" },

  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  primaryButtonText: { color: "#0b0c0e", fontWeight: "900", fontSize: 16 },

  secondaryButton: {
    backgroundColor: "#2c2728",
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
  },
  secondaryButtonText: { color: colors.text, fontWeight: "800" },

  ghostButton: { alignItems: "center", paddingVertical: 10 },
  ghostText: { color: colors.muted, fontWeight: "700" },

  buttonDisabled: { opacity: 0.65 },
});
