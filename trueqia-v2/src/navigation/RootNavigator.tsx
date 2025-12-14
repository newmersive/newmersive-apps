import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import AuthScreen from "../screens/Auth/AuthScreen";
import SponsorQRScreen from "../screens/Auth/SponsorQRScreen";
import SplashScreen from "../screens/SplashScreen";
import MainTabs from "./MainTabs";
import OffersListScreen from "../screens/Offers/OffersListScreen";
import TradeDetailScreen from "../screens/Trades/TradeDetailScreen";
import ContractPreviewScreen from "../screens/Contracts/ContractPreviewScreen";
import CreateOfferScreen from "../screens/Offers/CreateOfferScreen";
import DemoLandingScreen from "../screens/Demo/DemoLandingScreen";
import DemoOffersScreen from "../screens/Demo/DemoOffersScreen";
import DemoOfferDetailScreen from "../screens/Demo/DemoOfferDetailScreen";
import HeaderLogo from "../components/HeaderLogo";

import { useAuthStore } from "../store/auth.store";
import { colors } from "../config/theme";
import { demoModeEnabled } from "../config/env";
import logo from "../assets/logos/trueqia-logo2.png";

export type RootStackParamList = {
  Splash: undefined;
  Auth: { sponsorCode?: string } | undefined;
  SponsorQR: { code?: string } | undefined;
  MainTabs: undefined;
  OffersList: undefined;
  TradeDetail: { [key: string]: any } | undefined;
  ContractPreview: { [key: string]: any } | undefined;
  CreateOffer: { [key: string]: any } | undefined;
  DemoLanding: undefined;
  DemoOffers: undefined;
  DemoOfferDetail: { id: string } | undefined;
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
    <Stack.Navigator
      initialRouteName="Splash"
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { color: colors.text },
        headerTitleAlign: "center",
        headerBackTitleVisible: false,
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerTitle: () => <HeaderLogo source={logo} />,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="Splash"
        component={SplashScreen}
        options={{ headerShown: false }}
      />

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
          {demoModeEnabled ? (
            <>
              <Stack.Screen
                name="DemoLanding"
                component={DemoLandingScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="DemoOffers"
                component={DemoOffersScreen}
                options={{ title: "Ofertas demo" }}
              />
              <Stack.Screen
                name="DemoOfferDetail"
                component={DemoOfferDetailScreen}
                options={{ title: "Detalle demo" }}
              />
            </>
          ) : null}
        </>
      )}
    </Stack.Navigator>
  );
}
