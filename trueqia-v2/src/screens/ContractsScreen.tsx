import React from "react";
import { View, Text, StyleSheet, Button } from "react-native";
import { colors } from "../config/theme";

export default function ContractsScreen() {
  const handleGenerateDemo = () => {
    // Aquí en el futuro: llamada real a contrato IA
    console.log("Generar contrato demo");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Contratos IA (demo)</Text>
      <Text style={styles.text}>
        Aquí mostraremos los contratos generados automáticamente por la IA
        en función de los trueques acordados entre las partes.
      </Text>
      <Text style={styles.text}>
        De momento, esta pantalla sirve como demo para explicar la funcionalidad
        y probar el flujo básico dentro de la app.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Contrato demo</Text>
        <Text style={styles.cardBody}>
          Parte A y Parte B acuerdan intercambiar servicios usando tokens de
          TrueQIA. La IA genera las condiciones y las partes las aceptan antes
          de formalizar el trueque.
        </Text>
      </View>

      <Button title="Generar contrato demo" onPress={handleGenerateDemo} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
  },
  text: {
    fontSize: 15,
    color: colors.text,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#ffffff",
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  cardBody: {
    fontSize: 14,
    color: colors.text,
    opacity: 0.9,
  },
});
