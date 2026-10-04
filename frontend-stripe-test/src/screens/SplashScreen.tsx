import React, { useEffect } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { useAuthStore } from "../store/auth.store";
import BrandSplash from "../components/BrandSplash";

const MINIMUM_DISPLAY_MS = 0;

type Props = NativeStackScreenProps<RootStackParamList, "Splash">;

export default function SplashScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);

  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      if (user) {
        navigation.replace("MainTabs");
      } else {
        navigation.replace("Auth");
      }
    }, MINIMUM_DISPLAY_MS);

    return () => clearTimeout(timer);
  }, [hydrated, navigation, user]);

  return <BrandSplash />;
}
