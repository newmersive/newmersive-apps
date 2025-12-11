import React, { useMemo } from "react";
import { View, Text, Button, StyleSheet } from "react-native";
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
  const logout = useAuthStore((s) => s.logout);

  const initials = useMemo(() => {
    if (!user?.name) return "";
    return user.name
      .split(" ")
      .map((part) => part[0])
      .join("");
  }, [user?.name]);

  async function handleLogout() {
    await logout("Has cerrado sesión");
    navigation.reset({ index: 0, routes: [{ name: "Login" }] });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Perfil</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Hola, {user?.name || "patrocinador"}</Text>
        <Text style={styles.cardText}>Email: {user?.email}</Text>
        <Text style={styles.cardText}>Rol: {user?.role}</Text>
        {initials ? (
          <Text style={styles.cardHelper}>Identificador: {initials}</Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Mi ahorro estimado</Text>
        <Text style={styles.cardText}>
          Tus ahorros y comisiones se actualizarán al sincronizar con Allwain.
        </Text>
      </View>

      <Button
        title="Cerrar sesión"
        color={colors.button}
        onPress={handleLogout}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: colors.background, gap: 12 },
  title: { fontSize: 24, fontWeight: "800", color: colors.text },
  item: { color: colors.text },
  card: {
    backgroundColor: colors.card,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 6,
  },
  cardTitle: { color: colors.text, fontWeight: "800", fontSize: 16 },
  cardText: { color: colors.mutedText },
  cardHelper: { color: colors.text, fontWeight: "700" },
});
