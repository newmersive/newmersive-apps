import React, { useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { useAuthStore } from "../../store/auth.store";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { MainTabParamList, RootStackParamList } from "../../navigation/types";
import { colors } from "../../theme/colors";

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Perfil">,
  NativeStackScreenProps<RootStackParamList>
>;

export default function ProfileMainScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const displayName = useMemo(() => {
    if (user?.name) return user.name;
    if (user?.email) return user.email.split("@")[0];
    return "Usuario";
  }, [user?.name, user?.email]);

  function handleLogout() {
    Alert.alert(
      "Cerrar sesión",
      "¿Seguro que quieres cerrar sesión?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Cerrar sesión",
          style: "destructive",
          onPress: () => {
            clearAuth();
            navigation.reset({
              index: 0,
              routes: [{ name: "Login" }],
            });
          },
        },
      ],
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Perfil</Text>

      {/* USUARIO */}
      <View style={styles.card}>
        <Text style={styles.greeting}>Hola, {displayName}</Text>
        {user?.email ? (
          <Text style={styles.textMuted}>{user.email}</Text>
        ) : null}
      </View>

      {/* INFO */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Tu cuenta</Text>
        <Text style={styles.text}>
          Gestiona tu perfil, tus ofertas aceptadas y tus recomendaciones.
        </Text>
        <Text style={styles.textMuted}>Rol: {user?.role ?? "usuario"}</Text>
      </View>

      {/* ACCIONES */}
      <TouchableOpacity
        style={styles.logoutButton}
        activeOpacity={0.9}
        onPress={handleLogout}
      >
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: colors.background,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: colors.text,
  },
  card: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 6,
  },
  greeting: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.text,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: colors.text,
  },
  text: {
    color: colors.text,
    fontWeight: "600",
  },
  textMuted: {
    color: colors.mutedText,
    fontWeight: "600",
  },
  logoutButton: {
    marginTop: 12,
    backgroundColor: colors.button,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  logoutText: {
    color: colors.buttonText,
    fontWeight: "900",
    fontSize: 16,
  },
});
