import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/colors";

interface SplashScreenProps {
  onReady: () => void;
}

export default function SplashScreen({ onReady }: SplashScreenProps) {
  useEffect(() => {
    const timer = setTimeout(onReady, 600);
    return () => clearTimeout(timer);
  }, [onReady]);

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>Allwain</Text>
      <Text style={styles.subtitle}>Cargando tu experiencia...</Text>
      <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    padding: 32,
  },
  logo: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.primary,
  },
  subtitle: {
    marginTop: 8,
    color: colors.mutedText,
    fontWeight: "600",
  },
});
