import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import AuthScreen from "../screens/Auth/AuthScreen";
import SponsorQRScreen from "../screens/Auth/SponsorQRScreen";
import MainTabs from "./MainTabs";
import OffersListScreen from "../screens/Offers/OffersListScreen";
import TradeDetailScreen from "../screens/Trades/TradeDetailScreen";
import ContractPreviewScreen from "../screens/Contracts/ContractPreviewScreen";
import CreateOfferScreen from "../screens/Offers/CreateOfferScreen";

import { useAuthStore } from "../store/auth.store";
import { colors } from "../config/theme";

export type RootStackParamList = {
  Auth: { sponsorCode?: string } | undefined;
  SponsorQR: { code?: string } | undefined;
  MainTabs: undefined;
  OffersList: undefined;
  TradeDetail: { [key: string]: any } | undefined;
  ContractPreview: { [key: string]: any } | undefined;
  CreateOffer: { [key: string]: any } | undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

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
    <GestureHandlerRootView style={{ flex: 1 }}>
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
            <Stack.Screen
              name="MainTabs"
              component={MainTabs}
              options={{ headerShown: false }}
            />
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
            <Stack.Screen
              name="CreateOffer"
              component={CreateOfferScreen}
              options={{ title: "Crear oferta" }}
            />
          </>
        ) : (
          <>
            <Stack.Screen
              name="Auth"
              component={AuthScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="SponsorQR"
              component={SponsorQRScreen}
              options={{ title: "Invitación" }}
            />
          </>
        )}
      </Stack.Navigator>
    </GestureHandlerRootView>
  );
}


  );
}
