import React from "react";
import { View, Text, Button, StyleSheet } from "react-native";
import { useAuthStore } from "../../store/auth.store";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { MainTabParamList } from "../../navigation/types";
import { colors } from "../../theme/colors";

type Props = BottomTabScreenProps<MainTabParamList, "Inicio">;

export default function HomeScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Hola {user?.name || "usuario"}, bienvenido a Allwain
      </Text>
      <Text style={styles.subtitle}>
        Escanea productos, compara tiendas cercanas y mira cuánto puedes ahorrar
        (modelo demo conectado al backend).
      </Text>

      <Button
        title="Escanear producto"
        color={colors.button}
        onPress={() => navigation.navigate("Escanear")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "center", gap: 12 },
  title: { fontSize: 24, fontWeight: "700", color: colors.text },
  subtitle: { color: colors.mutedText, marginBottom: 8 },
});
