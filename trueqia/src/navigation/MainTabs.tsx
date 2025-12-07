import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import TradesScreen from "../screens/Trades/TradesScreen";
import ChatScreen from "../screens/Chat/ChatScreen";
import ProfileScreen from "../screens/Profile/ProfileScreen";
import { colors } from "../config/theme";
import OffersListScreen from "../screens/Offers/OffersListScreen";

const Tab = createBottomTabNavigator();

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { color: colors.text },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
      }}
    >
      <Tab.Screen
        name="Offers"
        component={OffersListScreen}
        options={{ title: "Ofertas" }}
      />
      <Tab.Screen
        name="Trades"
        component={TradesScreen}
        options={{ title: "Trueques" }}
      />
      <Tab.Screen name="Chat" component={ChatScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: "Perfil" }} />
    </Tab.Navigator>
  );
}
