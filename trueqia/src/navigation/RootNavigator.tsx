import React, { useEffect } from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ActivityIndicator, View } from "react-native";
import AuthScreen from "../screens/Auth/AuthScreen";
import MainTabs from "./MainTabs";
import { useAuthStore } from "../store/auth.store";

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const restoreSession = useAuthStore((s) => s.restoreSession);

  useEffect(() => {
    if (!hydrated) {
      restoreSession();
    }
  }, [hydrated, restoreSession]);

  if (!hydrated) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator />
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="MainTabs" component={MainTabs} />
        ) : (
          <Stack.Screen name="Auth" component={AuthScreen} />
        )}
      </Stack.Navigator>
    </GestureHandlerRootView>
  );
}
