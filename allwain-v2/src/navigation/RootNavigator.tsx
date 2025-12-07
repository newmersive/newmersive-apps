import React, { useCallback, useState } from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuthStore } from "../store/auth.store";

import LoginScreen from "../screens/Auth/LoginScreen";
import RegisterScreen from "../screens/Auth/RegisterScreen";
import SplashScreen from "../screens/Auth/SplashScreen";

import MainTabs from "./MainTabs";
import AdminDashboardScreen from "../screens/Admin/AdminDashboardScreen";
import ScanResultScreen from "../screens/Scan/ScanResultScreen";

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const user = useAuthStore((s) => s.user);
  const isLogged = Boolean(user);
  const isAdmin = user?.role === "admin";
  const [showSplash, setShowSplash] = useState(true);

  const handleSplashDone = useCallback(() => setShowSplash(false), []);

  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false }}
    >
      {showSplash ? (
        <Stack.Screen name="Splash">
          {() => <SplashScreen onReady={handleSplashDone} />}
        </Stack.Screen>
      ) : isLogged ? (
        <>
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen name="ScanResult" component={ScanResultScreen} />
          {isAdmin && (
            <Stack.Screen
              name="AdminDashboard"
              component={AdminDashboardScreen}
            />
          )}
        </>
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}
