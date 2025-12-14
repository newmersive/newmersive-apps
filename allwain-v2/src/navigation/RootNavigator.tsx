import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import AuthScreen from "../screens/Auth/AuthScreen";
import LoginScreen from "../screens/Auth/LoginScreen";
import RegisterScreen from "../screens/Auth/RegisterScreen";
import SplashScreen from "../screens/SplashScreen";
import SponsorQRScreen from "../screens/Auth/SponsorQRScreen";
import ScanScreen from "../screens/Scan/ScanScreen";
import ScanResultScreen from "../screens/Scan/ScanResultScreen";
import MainTabs from "./MainTabs";
import { RootStackParamList } from "./types";
import { demoModeEnabled } from "../config/env";
import DemoLandingScreen from "../screens/Demo/DemoLandingScreen";
import DemoScanResultScreen from "../screens/Demo/DemoScanResultScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Splash"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Auth" component={AuthScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="SponsorQR" component={SponsorQRScreen} />
      <Stack.Screen name="Scan" component={ScanScreen} />
      <Stack.Screen name="ScanResult" component={ScanResultScreen} />
      {demoModeEnabled ? (
        <>
          <Stack.Screen name="DemoLanding" component={DemoLandingScreen} />
          <Stack.Screen
            name="DemoScanResult"
            component={DemoScanResultScreen}
          />
        </>
      ) : null}
      <Stack.Screen name="MainTabs" component={MainTabs} />
    </Stack.Navigator>
  );
}
