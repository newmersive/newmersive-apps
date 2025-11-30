import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import SearchScreen from "../screens/Search/SearchScreen";
import DealsScreen from "../screens/Deals/DealsScreen";
import ProfileScreen from "../screens/Profile/ProfileScreen";
import { colors } from "../theme/colors";

const Tab = createBottomTabNavigator();

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.salmon },
        headerTintColor: colors.white,
        tabBarActiveTintColor: colors.dark,
        tabBarInactiveTintColor: "rgba(64,64,65,0.6)",
        tabBarStyle: { backgroundColor: colors.white },
      }}
    >
      <Tab.Screen name="Buscar" component={SearchScreen} />
      <Tab.Screen name="Ofertas" component={DealsScreen} />
      <Tab.Screen name="Perfil" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
