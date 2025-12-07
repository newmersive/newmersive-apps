import React, { useEffect } from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, View } from "react-native";
import AuthScreen from "../screens/Auth/AuthScreen";
import MainTabs from "./MainTabs";
import { useAuthStore } from "../store/auth.store";
import OffersListScreen from "../screens/Offers/OffersListScreen";
import ContractPreviewScreen from "../screens/Contracts/ContractPreviewScreen";
import TradeDetailScreen from "../screens/Trades/TradeDetailScreen";
import { colors } from "../config/theme";

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
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { color: colors.text },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {user ? (
        <>
          <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
          <Stack.Screen
            name="OffersList"
            component={OffersListScreen}
            options={{ title: "Ofertas" }}
          />
          <Stack.Screen
            name="TradeDetail"
            component={TradeDetailScreen}
            options={{ title: "Detalle de trueque" }}
          />
          <Stack.Screen
            name="ContractPreview"
            component={ContractPreviewScreen}
            options={{ title: "Contrato IA" }}
          />
        </>
      ) : (
        <Stack.Screen name="Auth" component={AuthScreen} options={{ headerShown: false }} />
      )}
    </Stack.Navigator>
  );
}
