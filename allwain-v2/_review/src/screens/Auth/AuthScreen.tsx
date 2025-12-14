import React, { useEffect, useState } from "react";
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
import { colors } from "../../theme/colors";
import { useAuthStore } from "../../store/auth.store";
import { RootStackParamList } from "../../navigation/RootNavigator";

export default function AuthScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "Auth">>();

  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const sessionMessage = useAuthStore((s) => s.sessionMessage);
  const clearSessionMessage = useAuthStore((s) => s.clearSessionMessage);

  const [mode, setMode] = useState<"login" | "register">(
    route.params?.mode === "register" ? "register" : "login",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sponsorCode, setSponsorCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (sessionMessage) {
      setError(sessionMessage);
      clearSessionMessage();
    }
  }, [clearSessionMessage, sessionMessage]);

  useEffect(() => {
    if (route.params?.mode) {
      setMode(route.params.mode);
    }
  }, [route.params?.mode]);

  useEffect(() => {
    if (route.params?.sponsorCode) {
      setSponsorCode(route.params.sponsorCode);
      setMode("register");
    }
  }, [route.params?.sponsorCode]);

  const handleSubmit = async () => {
    const isRegister = mode === "register";

    if (!email || !password || (isRegister && !name)) {
      setError("Completa nombre, email y contraseña");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        await register(name, email, password, sponsorCode.trim() || undefined);
      } else {
        await login(email, password);
      }
    } catch (err: any) {
      setError(err?.message || "No se pudo completar la acción.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.brand}>ALLWAIN</Text>
          <Text style={styles.subtitle}>Ahorra con estilo salmón</Text>
        </View>

        <View style={styles.switcher}>
          <TouchableOpacity
            style={[styles.switchButton, mode === "login" && styles.switchActive]}
            onPress={() => setMode("login")}
            disabled={loading}
          >
            <Text
              style={[styles.switchText, mode === "login" && styles.switchTextActive]}
            >
              Entrar
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.switchButton,
              mode === "register" && styles.switchActive,
            ]}
            onPress={() => setMode("register")}
            disabled={loading}
          >
            <Text
              style={[
                styles.switchText,
                mode === "register" && styles.switchTextActive,
              ]}
            >
              Crear cuenta
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          {mode === "register" && (
            <TextInput
              style={styles.input}
              placeholder="Nombre"
              placeholderTextColor="rgba(64, 64, 65, 0.6)"
              value={name}
              onChangeText={setName}
            />
          )}
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="rgba(64, 64, 65, 0.6)"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Contraseña"
            placeholderTextColor="rgba(64, 64, 65, 0.6)"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          {mode === "register" && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Código de invitación (opcional)"
                placeholderTextColor="rgba(64, 64, 65, 0.6)"
                value={sponsorCode}
                onChangeText={setSponsorCode}
                autoCapitalize="characters"
              />
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => navigation.navigate("SponsorQR")}
                disabled={loading}
              >
                <Text style={styles.secondaryButtonText}>
                  Usar QR de patrocinador
                </Text>
              </TouchableOpacity>
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.buttonText} />
            ) : (
              <Text style={styles.primaryButtonText}>
                {mode === "login" ? "Entrar" : "Crear cuenta"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.primary },
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: colors.primary,
    justifyContent: "center",
  },
  header: {
    marginBottom: 24,
  },
  brand: { fontSize: 28, fontWeight: "800", color: colors.button },
  subtitle: { color: colors.button, marginTop: 4, fontSize: 16 },
  switcher: {
    flexDirection: "row",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 12,
  },
  switchButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  switchActive: {
    backgroundColor: colors.card,
  },
  switchText: {
    color: colors.button,
    fontWeight: "700",
  },
  switchTextActive: {
    color: colors.text,
  },
  card: {
    backgroundColor: colors.card,
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    padding: 12,
    color: colors.text,
    backgroundColor: colors.card,
  },
  error: { color: "#B3261E", marginTop: 4 },
  primaryButton: {
    backgroundColor: colors.button,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: colors.buttonText,
    fontWeight: "700",
    fontSize: 16,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.button,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: colors.button,
    fontWeight: "700",
  },
});
