import React from "react";
import { View, Text, Button, StyleSheet } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { colors } from "../../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Scan">;

export default function ScanScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Escanear producto</Text>
      <Text style={styles.subtitle}>
        Aquí irá la cámara real y el lector de etiquetas / imagen con IA. De
        momento, simulamos el escaneo con un botón.
      </Text>

      <Button
        title="Simular escaneo y ver resultado"
        color={colors.button}
        onPress={() => navigation.navigate("ScanResult")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "center", gap: 12 },
  title: { fontSize: 24, fontWeight: "700", color: colors.text },
  subtitle: { color: colors.mutedText },
});
