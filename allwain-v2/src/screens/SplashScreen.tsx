import React, { useEffect } from "react";
import { View, StyleSheet, Image, ActivityIndicator } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { useAuthStore } from "../store/auth.store";

const BACKGROUND_COLOR = "#FF795A";
const ACCENT_COLOR = "#000000";

const LOGO = require("../assets/logos/allwain-logo.png");

type Props = NativeStackScreenProps<RootStackParamList, "Splash">;

export default function SplashScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const restoreSession = useAuthStore((s) => s.restoreSession);

  useEffect(() => {
    if (!hydrated) {
      restoreSession();
      return;
    }
    const timer = setTimeout(() => {
      if (user) {
        navigation.replace("MainTabs");
      } else {
        navigation.replace("Login");
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [hydrated, navigation, restoreSession, user]);

  return (
    <View style={styles.container}>
      <View style={styles.logoWrapper}>
        <Image source={LOGO} style={styles.logo} resizeMode="contain" />
        {!hydrated ? <ActivityIndicator color="#000" /> : null}
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
    padding: 28,
    borderRadius: 24,
    backgroundColor: BACKGROUND_COLOR,
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  logo: {
    width: 220,
    height: 80,
  },
  accent: {
    position: "absolute",
    bottom: -80,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: ACCENT_COLOR,
    opacity: 0.1,
  },
});
