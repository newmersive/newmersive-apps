import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuthStore } from "../store/auth.store";

import DemoLandingScreen from "../screens/Demo/DemoLandingScreen";
import DemoScanResultScreen from "../screens/Demo/DemoScanResultScreen";

import LoginScreen from "../screens/Auth/LoginScreen";
import RegisterScreen from "../screens/Auth/RegisterScreen";

import MainTabs from "./MainTabs";
import AdminDashboardScreen from "../screens/Admin/AdminDashboardScreen";

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const user = useAuthStore((s) => s.user);
  const isLogged = Boolean(user);
  const isAdmin = user?.role === "admin";

  return (
    <Stack.Navigator
      key={isLogged ? "app" : "auth"}
      screenOptions={{ headerShown: false }}
    >
      {isLogged ? (
        <>
          <Stack.Screen name="MainTabs" component={MainTabs} />
          {isAdmin && (
            <Stack.Screen
              name="AdminDashboard"
              component={AdminDashboardScreen}
            />
          )}
        </>
      ) : (
        <>
          <Stack.Screen name="DemoLanding" component={DemoLandingScreen} />
          <Stack.Screen name="DemoScanResult" component={DemoScanResultScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}
