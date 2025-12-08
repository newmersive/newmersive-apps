import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import HomeScreen from "../screens/Scan/HomeScreen";
import ScanScreen from "../screens/Scan/ScanScreen";
import ScanResultScreen from "../screens/Scan/ScanResultScreen";
import OffersScreen from "../screens/Offers/OffersScreen";
import GuestsScreen from "../screens/Guests/GuestsScreen";
import ProfileMainScreen from "../screens/Profile/ProfileMainScreen";
import { MainTabParamList } from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: true }}>
      <Tab.Screen name="Inicio" component={HomeScreen} />
      <Tab.Screen name="Escanear" component={ScanScreen} />
      <Tab.Screen name="Resultado" component={ScanResultScreen} />
      <Tab.Screen name="Ofertas" component={OffersScreen} />
      <Tab.Screen name="Invitados" component={GuestsScreen} />
      <Tab.Screen name="Perfil" component={ProfileMainScreen} />
    </Tab.Navigator>
  );
}
