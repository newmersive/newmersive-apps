import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuthStore } from "../store/auth.store";

import LoginScreen from "../screens/Auth/LoginScreen";
import RegisterScreen from "../screens/Auth/RegisterScreen";

import MainTabs from "./MainTabs";
import ScanScreen from "../screens/Scan/ScanScreen";
import ScanResultScreen from "../screens/Scan/ScanResultScreen";
import { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const user = useAuthStore((s) => s.user);
  const isLogged = Boolean(user);
  const initialRouteName = isLogged ? "MainTabs" : "Login";

  return (
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{ headerShown: false }}
    >
      {!isLogged && (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
        </>
      )}

      {isLogged && (
        <>
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen name="Scan" component={ScanScreen} />
          <Stack.Screen name="ScanResult" component={ScanResultScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}
