import React, { useEffect } from "react";
import { View, StyleSheet, Image } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/RootNavigator";
import { useAuthStore } from "../store/auth.store";
import { colors } from "../config/theme";

const ACCENT_COLOR = colors.primary;
const BACKGROUND_COLOR = colors.background;

const LOGO = require("../assets/logos/trueqia-logo.png");

type Props = NativeStackScreenProps<RootStackParamList, "Splash">;

export default function SplashScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (user) {
        navigation.replace("MainTabs");
      } else {
        navigation.replace("Auth");
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [navigation, user]);

  return (
    <View style={styles.container}>
      <View style={styles.logoWrapper}>
        <Image source={LOGO} style={styles.logo} resizeMode="contain" />
      </View>
      <View style={styles.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND_COLOR,
    justifyContent: "center",
    alignItems: "center",
  },
  logoWrapper: {
    padding: 32,
    borderRadius: 28,
    backgroundColor: BACKGROUND_COLOR,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  logo: {
    width: 220,
    height: 80,
  },
  accent: {
    position: "absolute",
    bottom: -60,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: ACCENT_COLOR,
    opacity: 0.08,
    transform: [{ scaleX: 1.2 }],
  },
});
