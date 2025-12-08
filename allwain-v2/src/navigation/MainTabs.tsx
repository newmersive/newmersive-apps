import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import HomeScreen from "../screens/Scan/HomeScreen";
import SponsorsScreen from "../screens/Sponsors/SponsorsScreen";
import ContractsScreen from "../screens/Contracts/ContractsScreen";
import ProfileMainScreen from "../screens/Profile/ProfileMainScreen";
import { MainTabParamList } from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: true }}>
      <Tab.Screen name="Inicio" component={HomeScreen} />
      <Tab.Screen name="Patrocinadores" component={SponsorsScreen} />
      <Tab.Screen name="Contratos" component={ContractsScreen} />
      <Tab.Screen name="Perfil" component={ProfileMainScreen} />
    </Tab.Navigator>
  );
}
