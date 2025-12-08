import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import TradesScreen from "../screens/Trades/TradesScreen";
import ChatScreen from "../screens/Chat/ChatScreen";
import ProfileScreen from "../screens/Profile/ProfileScreen";
import SponsorsScreen from "../screens/Profile/SponsorsScreen";
import HomeScreen from "../screens/Home/HomeScreen";
import OffersListScreen from "../screens/Offers/OffersListScreen";
import { colors } from "../config/theme";

const Tab = createBottomTabNavigator();
const ProfileStack = createNativeStackNavigator();

function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { color: colors.text },
        headerTintColor: colors.text,
      }}
    >
      <ProfileStack.Screen
        name="ProfileMain"
        component={ProfileScreen}
        options={{ title: "Perfil" }}
      />
      <ProfileStack.Screen
        name="Sponsors"
        component={SponsorsScreen}
        options={{ title: "Patrocinadores" }}
      />
    </ProfileStack.Navigator>
  );
}

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { color: colors.text },
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: "Inicio" }}
      />
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
      <Tab.Screen
        name="Chat"
        component={ChatScreen}
        options={{ title: "Chat" }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStackNavigator}
        options={{ title: "Perfil", headerShown: false }}
      />
    </Tab.Navigator>
  );
}

