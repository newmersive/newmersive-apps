import React, { Suspense } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import { createNativeStackNavigator, type NativeStackHeaderProps } from "@react-navigation/native-stack";

import SplashScreen from "../screens/SplashScreen";
import AuthScreen from "../screens/Auth/AuthScreen";
import ScanScreen from "../screens/Scan/ScanScreen";
import ScanResultScreen from "../screens/Scan/ScanResultScreen";
import MyRequestsScreen from "../screens/Requests/MyRequestsScreen";
import SearchScreen from "../screens/Search/SearchScreen";
import ManualRequestScreen from "../screens/Scan/ManualRequestScreen";
import HowAllwainWorksScreen from "../screens/Guide/HowAllwainWorksScreen";
import NotificationsScreen from "../screens/Notifications/NotificationsScreen";
import ShoppingListsScreen from "../screens/Requests/ShoppingListsScreen";
import ChatListScreen from "../screens/Chat/ChatListScreen";
import ChatScreen from "../screens/Chat/ChatScreen";
import LegalScreen from "../screens/Profile/LegalScreen";
import SellerActivationScreen from "../screens/Participation/SellerActivationScreen";
import ConnectorActivationScreen from "../screens/Participation/ConnectorActivationScreen";
import AdminDashboardScreen from "../screens/Admin/AdminDashboardScreen";
import RoleSwitcher from "../components/design-system/RoleSwitcher";
import MainTabs from "./MainTabs";

import { RootStackParamList } from "./types";
import { demoModeEnabled } from "../config/env";
import DemoLandingScreen from "../screens/Demo/DemoLandingScreen";
import DemoScanResultScreen from "../screens/Demo/DemoScanResultScreen";
import { useAppTranslation } from "../i18n/useAppTranslation";
import { requestCopy } from "../i18n/requestCopy";
import { useAuthStore } from "../store/auth.store";

const Stack = createNativeStackNavigator<RootStackParamList>();
const LazyVideoCallScreen = React.lazy(
  () => import("../screens/Chat/VideoCallScreen"),
);

function DetailHeader({ options, route, navigation }: NativeStackHeaderProps) {
  const insets = useSafeAreaInsets();
  if (["ManualRequest", "ShoppingLists", "ActivateSeller", "Scan", "ScanResult"].includes(route.name)) {
    return <View style={{ paddingTop: insets.top, paddingHorizontal: 16, minHeight: 52 + insets.top, backgroundColor: colors.card, flexDirection: "row", alignItems: "center", gap: 12 }}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Volver" onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate("MainTabs")} style={{ minHeight: 44, justifyContent: "center", paddingRight: 8 }}><Text style={{ color: colors.text, fontWeight: "800" }}>‹ Volver</Text></TouchableOpacity>
      <Text accessibilityRole="header" style={{ color: colors.text, fontWeight: "800", flex: 1 }}>{options.title}</Text>
    </View>;
  }
  return <RoleSwitcher showBack title={options.title} />;
}

function VideoCallRoute(
  props: React.ComponentProps<typeof LazyVideoCallScreen>,
) {
  return (
    <Suspense
      fallback={
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#171817",
          }}
        >
          <ActivityIndicator color="#FF795A" />
        </View>
      }
    >
      <LazyVideoCallScreen {...props} />
    </Suspense>
  );
}

export default function RootNavigator() {
  const { t, locale } = useAppTranslation();
  const appMode = useAuthStore((state) => state.appMode);
  const user = useAuthStore((state) => state.user);
  return (
    <Stack.Navigator initialRouteName={user ? "MainTabs" : "Auth"} screenOptions={{ headerShown: false, header: DetailHeader }}>
      <Stack.Screen name="Splash" component={SplashScreen} />

      {/* AUTH (sin header) */}
      <Stack.Screen name="Auth" component={AuthScreen} />

      {/* APP */}
      {user ? <Stack.Group navigationKey={user.id}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="MyRequests" component={MyRequestsScreen} options={{ headerShown: true, title: requestCopy[locale].title }} />
      <Stack.Screen
        name="Search"
        component={SearchScreen}
        options={{ headerShown: true, title: t("search.searchOffers") }}
      />
      <Stack.Screen
        name="ManualRequest"
        component={ManualRequestScreen}
        options={{ headerShown: true, title: t("home.buyer.request") }}
      />
      <Stack.Screen
        name="HowAllwainWorks"
        component={HowAllwainWorksScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ headerShown: true, title: t("notifications.title") }}
      />
      <Stack.Screen
        name="ShoppingLists"
        component={ShoppingListsScreen}
        options={({ route }) => ({
          headerShown: true,
          title: t((route.params?.mode || appMode) === "sell" ? "shopping.sellerTitle" : "shopping.buyerTitle"),
        })}
      />
      <Stack.Screen
        name="ChatList"
        component={ChatListScreen}
        options={{ headerShown: true, title: t("chat.messages") }}
      />
      <Stack.Screen
        name="ChatThread"
        component={ChatScreen}
        options={{ headerShown: true, title: t("chat.messages") }}
      />
      <Stack.Screen name="VideoCall" component={VideoCallRoute} />
      <Stack.Screen
        name="Legal"
        component={LegalScreen}
        options={({ route }) => ({ headerShown: true, title: t(route.params.document === "privacy" ? "profile.privacy" : "profile.terms") })}
      />
      <Stack.Screen
        name="Scan"
        component={ScanScreen}
        options={{ headerShown: true, title: t("home.buyer.capture") }}
      />
      <Stack.Screen
        name="ScanResult"
        component={ScanResultScreen}
        options={{ headerShown: true, title: t("home.buyer.request") }}
      />
      <Stack.Screen
        name="ActivateSeller"
        component={SellerActivationScreen}
        options={{ headerShown: true, title: t("profile.sales") }}
      />
      <Stack.Screen
        name="ActivateConnector"
        component={ConnectorActivationScreen}
        options={{ headerShown: true, title: t("profile.area") }}
      />
      <Stack.Screen
        name="AdminDashboard"
        component={AdminDashboardScreen}
        options={{ headerShown: true, title: t("profile.admin") }}
      />
      </Stack.Group> : null}

      {/* DEMO */}
      {demoModeEnabled ? (
        <>
          <Stack.Screen name="DemoLanding" component={DemoLandingScreen} />
          <Stack.Screen name="DemoScanResult" component={DemoScanResultScreen} />
        </>
      ) : null}
    </Stack.Navigator>
  );
}
