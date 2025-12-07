import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuthStore } from "../store/auth.store";

import DemoLandingScreen from "../screens/Demo/DemoLandingScreen";
import DemoScanResultScreen from "../screens/Demo/DemoScanResultScreen";

import AuthScreen from "../screens/Auth/AuthScreen";
import SponsorQRScreen from "../screens/Auth/SponsorQRScreen";

import MainTabs from "./MainTabs";
import AdminDashboardScreen from "../screens/Admin/AdminDashboardScreen";
import SponsorsScreen from "../screens/Sponsors/SponsorsScreen";
import { colors } from "../theme/colors";

export type RootStackParamList = {
  Auth:
    | {
        sponsorCode?: string;
        mode?: "login" | "register";
      }
    | undefined;
  SponsorQR: { code?: string } | undefined;
  DemoLanding: undefined;
  DemoScanResult: undefined;
  MainTabs: undefined;
  AdminDashboard: undefined;
  Sponsors: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!hydrated) {
      restoreSession();
    }
  }, [hydrated, restoreSession]);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator
      key={user ? "app" : "auth"}
      screenOptions={{ headerShown: false }}
    >
      {user ? (
        <>
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen name="Sponsors" component={SponsorsScreen} />
          {isAdmin && (
            <Stack.Screen
              name="AdminDashboard"
              component={AdminDashboardScreen}
            />
          )}
        </>
      ) : (
        <>
          <Stack.Screen name="Auth" component={AuthScreen} />
          <Stack.Screen name="SponsorQR" component={SponsorQRScreen} />
          <Stack.Screen name="DemoLanding" component={DemoLandingScreen} />
          <Stack.Screen
            name="DemoScanResult"
            component={DemoScanResultScreen}
          />
        </>
      )}
    </Stack.Navigator>
  );
}

