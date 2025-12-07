import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import SearchScreen from "../screens/Search/SearchScreen";
import DealsScreen from "../screens/Deals/DealsScreen";
import ProfileScreen from "../screens/Profile/ProfileScreen";
import { colors } from "../theme/colors";
import { AppTabParamList } from "./types";

const Tab = createBottomTabNavigator<AppTabParamList>();

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.salmon },
        headerTitleStyle: { color: colors.dark },
        headerTintColor: colors.dark,
        tabBarActiveTintColor: colors.dark,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.salmon, borderTopColor: colors.line },
      }}
    >
      <Tab.Screen name="Buscar" component={SearchScreen} />
      <Tab.Screen name="Ofertas" component={DealsScreen} />
      <Tab.Screen name="Perfil" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
