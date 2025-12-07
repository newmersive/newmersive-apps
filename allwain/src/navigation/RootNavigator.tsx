import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
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
import { AppStackParamList, RootStackParamList } from "./types";

const AppStack = createNativeStackNavigator<AppStackParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();

function AppNavigator() {
  return (
    <AppStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.salmon },
        headerTitleStyle: { color: colors.dark },
        headerTintColor: colors.dark,
        contentStyle: { backgroundColor: colors.salmon },
      }}
    >
      <AppStack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
      <AppStack.Screen name="Scan" component={ScanScreen} options={{ title: "Escanear" }} />
      <AppStack.Screen name="ScanResult" component={ScanResultScreen} options={{ title: "Resultado" }} />
      <AppStack.Screen name="Guests" component={GuestsScreen} options={{ title: "Invitados y comisiones" }} />
      <AppStack.Screen
        name="DemoLanding"
        component={DemoLandingScreen}
        options={{ title: "Demo AI pricing" }}
      />
      <AppStack.Screen
        name="DemoScanResult"
        component={DemoScanResultScreen}
        options={{ title: "Resultado demo" }}
      />
    </AppStack.Navigator>
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
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {isLogged ? (
        <RootStack.Screen name="App" component={AppNavigator} />
      ) : (
        <RootStack.Screen name="Auth" component={AuthScreen} />
      )}
    </RootStack.Navigator>
  );
}
