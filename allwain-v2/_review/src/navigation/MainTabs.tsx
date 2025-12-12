import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import HomeScreen from "../screens/Scan/HomeScreen";
import OffersScreen from "../screens/Offers/OffersScreen";
import SponsorScreen from "../screens/Sponsor/SponsorScreen";
import ProfileMainScreen from "../screens/Profile/ProfileMainScreen";
import { MainTabParamList } from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
      }}
    >
      <Tab.Screen
        name="Inicio"
        component={HomeScreen}
        options={{ title: "Inicio" }}
      />

      <Tab.Screen
        name="Ofertas"
        component={OffersScreen}
        options={{ title: "Ofertas y contratos" }}
      />

      <Tab.Screen
        name="ProgramaRecomendados"
        component={SponsorScreen}
        options={{ title: "Programa recomendados" }}
      />

      <Tab.Screen
        name="Perfil"
        component={ProfileMainScreen}
        options={{ title: "Perfil" }}
      />
    </Tab.Navigator>
  );
}
