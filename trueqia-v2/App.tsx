import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  View,
  Text,
  TextInput,
  Button,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useAuthStore } from "./src/store/auth.store";
import { colors } from "./src/config/theme";

function LoadingView() {
  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" />
      <Text style={styles.text}>Cargando sesión…</Text>
    </View>
  );
}

function LoginView() {
  const login = useAuthStore((s) => s.login);
  const hydrated = useAuthStore((s) => s.hydrated);

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!hydrated) {
    return <LoadingView />;
  }

  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (e) {
      setError("Error al iniciar sesión");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>TrueQIA</Text>

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
        <ActivityIndicator size="small" />
      ) : (
        <Button title="Entrar" onPress={handleLogin} />
      )}
    </View>
  );
}

function HomeView() {
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);

  const handleLogout = async () => {
    await logout("Has cerrado sesión");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bienvenido a TrueQIA</Text>
      {user && (
        <Text style={styles.text}>
          Sesión iniciada como: {user.name ?? user.email}
        </Text>
      )}
      <Button title="Cerrar sesión" onPress={handleLogout} />
    </View>
  );
}

export default function App() {
  const token = useAuthStore((s) => s.token);
  const hydrated = useAuthStore((s) => s.hydrated);
  const restoreSession = useAuthStore((s) => s.restoreSession);

  // Llamamos a restoreSession una vez al arrancar
  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  if (!hydrated) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <LoadingView />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {token ? <HomeView /> : <LoginView />}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
    alignItems: "stretch",
    justifyContent: "center",
    gap: 16,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    color: colors.text,
    textAlign: "center",
    marginBottom: 16,
  },
  text: {
    fontSize: 16,
    color: colors.text,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    backgroundColor: "#ffffff",
  },
  error: {
    color: "red",
    textAlign: "center",
  },
});
