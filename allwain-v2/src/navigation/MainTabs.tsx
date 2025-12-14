import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import HomeScreen from "../screens/Scan/HomeScreen";
import OffersScreen from "../screens/Offers/OffersScreen";
import SponsorsScreen from "../screens/Sponsors/SponsorsScreen";
import ProfileMainScreen from "../screens/Profile/ProfileMainScreen";
import { MainTabParamList } from "./types";
import HeaderLogo from "../components/HeaderLogo";
import { colors } from "../theme/colors";
import logo from "../assets/logos/logo2.png";

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        headerTitle: () => <HeaderLogo source={logo} />,
        headerTitleAlign: "center",
        headerStyle: { backgroundColor: colors.background },
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
        component={SponsorsScreen}
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
