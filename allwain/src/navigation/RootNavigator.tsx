import React, { useEffect } from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuthStore } from "../store/auth.store";
import AuthScreen from "../screens/Auth/AuthScreen";
import MainTabs from "./MainTabs";
import ScanScreen from "../screens/Scan/ScanScreen";
import ScanResultScreen from "../screens/Scan/ScanResultScreen";
import GuestsScreen from "../screens/Guests/GuestsScreen";
import DemoLandingScreen from "../screens/Demo/DemoLandingScreen";
import DemoScanResultScreen from "../screens/Demo/DemoScanResultScreen";
import { colors } from "../theme/colors";
import { ActivityIndicator, View } from "react-native";

const Stack = createNativeStackNavigator();

function AppNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.salmon },
        headerTitleStyle: { color: colors.dark },
        headerTintColor: colors.dark,
        contentStyle: { backgroundColor: colors.salmon },
      }}
    >
      <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen name="Scan" component={ScanScreen} options={{ title: "Escanear" }} />
      <Stack.Screen name="ScanResult" component={ScanResultScreen} options={{ title: "Resultado" }} />
      <Stack.Screen name="Guests" component={GuestsScreen} options={{ title: "Invitados y comisiones" }} />
      <Stack.Screen name="DemoLanding" component={DemoLandingScreen} options={{ title: "Demo AI pricing" }} />
      <Stack.Screen name="DemoScanResult" component={DemoScanResultScreen} options={{ title: "Resultado demo" }} />
    </Stack.Navigator>
  );
}

export default function RootNavigator() {
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const isLogged = Boolean(user);

  useEffect(() => {
    if (!hydrated) {
      restoreSession();
    }
  }, [hydrated, restoreSession]);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.salmon }}>
        <ActivityIndicator color={colors.dark} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isLogged ? (
        <Stack.Screen name="App" component={AppNavigator} />
      ) : (
        <Stack.Screen name="Auth" component={AuthScreen} />
      )}
    </Stack.Navigator>
  );
}
