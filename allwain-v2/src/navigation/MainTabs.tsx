import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { colors } from "../theme/colors";

import HomeScreen from "../screens/Scan/HomeScreen";
import SearchScreen from "../screens/Search/SearchScreen";
import ScanScreen from "../screens/Scan/ScanScreen";
import OffersScreen from "../screens/Offers/OffersScreen";
import GuestsScreen from "../screens/Guests/GuestsScreen";
import ProfileMainScreen from "../screens/Profile/ProfileMainScreen";

const Tab = createBottomTabNavigator();

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: "#fff",
        headerTitleStyle: { color: "#fff" },
        tabBarStyle: { backgroundColor: colors.primary },
        tabBarActiveTintColor: "#fff",
        tabBarInactiveTintColor: "rgba(255, 255, 255, 0.8)",
        tabBarLabelStyle: { fontWeight: "700" },
      }}
    >
      <Tab.Screen name="Inicio" component={HomeScreen} />
      <Tab.Screen name="Buscar" component={SearchScreen} />
      <Tab.Screen name="Escanear" component={ScanScreen} />
      <Tab.Screen name="Ofertas" component={OffersScreen} />
      <Tab.Screen name="Invitados" component={GuestsScreen} />
      <Tab.Screen name="Perfil" component={ProfileMainScreen} />
    </Tab.Navigator>
  );
}
