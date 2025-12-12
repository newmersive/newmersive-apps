import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/RootNavigator";
import { colors } from "../../config/theme";

const FALLBACK_SPONSOR_CODE = "SPONSOR-QR";

type Props = NativeStackScreenProps<RootStackParamList, "SponsorQR">;

export default function SponsorQRScreen({ navigation, route }: Props) {
  const handleUseCode = (code?: string) => {
    navigation.navigate("Auth", { sponsorCode: code || FALLBACK_SPONSOR_CODE });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Escanear QR de patrocinador</Text>
      <Text style={styles.subtitle}>
        Escanea el código de invitación de tu patrocinador para continuar con el
        registro. Si llegaste desde un lector externo, verás el código
        detectado listo para usar.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Código detectado</Text>
        <Text style={styles.code}>{route.params?.code || FALLBACK_SPONSOR_CODE}</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => handleUseCode(route.params?.code)}
        >
          <Text style={styles.buttonText}>Usar en registro</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.link} onPress={() => handleUseCode()}>
        <Text style={styles.linkText}>Ingresar con este código</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
    justifyContent: "center",
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: colors.text,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  cardTitle: {
    color: colors.muted,
    fontWeight: "600",
  },
  code: {
    fontSize: 18,
    fontWeight: "bold",
    color: colors.text,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  link: {
    alignItems: "center",
    padding: 8,
  },
  linkText: {
    color: colors.primary,
    fontWeight: "600",
  },
});
