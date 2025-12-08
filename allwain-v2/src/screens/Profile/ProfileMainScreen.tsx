import React from "react";
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
  const clearAuth = useAuthStore((s) => s.clearAuth);

  function logout() {
    clearAuth();
    navigation.replace("Login");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Perfil</Text>
      <Text style={styles.item}>Email: {user?.email}</Text>
      <Text style={styles.item}>Rol: {user?.role}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Mi patrocinio</Text>
        <Text style={styles.cardText}>
          Consulta la pestaña Patrocinadores para compartir tu QR y ganar euros.
        </Text>
      </View>

      <Button title="Cerrar sesión" color={colors.button} onPress={logout} />
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
});
