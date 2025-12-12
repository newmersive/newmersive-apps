import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { colors } from "../../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Scan">;

export default function ScanScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.cameraMock}>
        <Text style={styles.cameraText}>Preparando cámara…</Text>
        <Text style={styles.cameraSub}>
          Coloca el producto dentro del encuadre
        </Text>
      </View>

      <View style={styles.info}>
        <Text style={styles.title}>Escanear producto</Text>
        <Text style={styles.subtitle}>
          Analizamos el producto para detectar información relevante y
          mostrarte ofertas o mejoras disponibles.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.primaryButton}
        activeOpacity={0.9}
        onPress={() => navigation.navigate("ScanResult")}
      >
        <Text style={styles.primaryButtonText}>
          Iniciar análisis
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    padding: 20,
    justifyContent: "space-between",
  },
  cameraMock: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  cameraText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  cameraSub: {
    marginTop: 6,
    color: "rgba(255,255,255,0.7)",
    fontWeight: "600",
  },
  info: {
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: "#fff",
  },
  subtitle: {
    marginTop: 6,
    color: "rgba(255,255,255,0.8)",
    fontWeight: "600",
  },
  primaryButton: {
    backgroundColor: colors.button,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
  },
  primaryButtonText: {
    color: colors.buttonText,
    fontWeight: "900",
    fontSize: 16,
  },
});
