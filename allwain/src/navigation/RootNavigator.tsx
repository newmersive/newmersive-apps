import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuthStore } from "../store/auth.store";
import AuthScreen from "../screens/Auth/AuthScreen";
import MainTabs from "./MainTabs";

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const user = useAuthStore((s) => s.user);
  const isLogged = Boolean(user);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isLogged ? (
        <Stack.Screen name="MainTabs" component={MainTabs} />
      ) : (
        <Stack.Screen name="Auth" component={AuthScreen} />
      )}
    </Stack.Navigator>
  );
}
