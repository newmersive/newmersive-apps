import React from "react";
import { View, Text, StyleSheet, Button } from "react-native";
import { colors } from "../config/theme";

export default function SponsorScreen() {
  const dummyCode = "TQIA-PTR-1234";

  const handleShare = () => {
    // Aquí en el futuro: compartir el código / QR
    console.log("Compartir código patrocinador:", dummyCode);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tu pantalla de patrocinador</Text>
      <Text style={styles.text}>
        Aquí mostraremos tu código o QR único para invitar a otras personas a
        TrueQIA y ganar recompensas.
      </Text>

      <View style={styles.codeBox}>
        <Text style={styles.codeLabel}>Código demo:</Text>
        <Text style={styles.codeValue}>{dummyCode}</Text>
      </View>

      <Button title="Compartir código (demo)" onPress={handleShare} />
      <Text style={styles.helper}>
        Más adelante aquí se integrará el QR real, contadores de personas
        invitadas y las recompensas en tokens.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
    gap: 16,
    justifyContent: "flex-start",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 4,
  },
  text: {
    fontSize: 15,
    color: colors.text,
  },
  codeBox: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#ffffff",
    gap: 4,
  },
  codeLabel: {
    fontSize: 13,
    color: colors.text,
    opacity: 0.7,
  },
  codeValue: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  helper: {
    fontSize: 13,
    color: colors.text,
    opacity: 0.8,
  },
});
