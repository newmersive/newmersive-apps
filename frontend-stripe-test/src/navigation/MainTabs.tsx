import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ClipboardList, Home, Network, ShoppingBag, Sparkles, Truck, UserRound } from "lucide-react-native";

import HomeScreen from "../screens/Scan/HomeScreen";
import OffersScreen from "../screens/Offers/OffersScreen";
import SponsorsScreen from "../screens/Sponsors/SponsorsScreen";
import ProfileMainScreen from "../screens/Profile/ProfileMainScreen";
import DemoAssistantScreen from "../screens/Assistant/DemoAssistantScreen";
import ConnectorOperationsScreen from "../screens/Participation/ConnectorOperationsScreen";
import SellerActivationScreen from "../screens/Participation/SellerActivationScreen";
import MarketRequestsScreen from "../screens/Requests/MarketRequestsScreen";
import RoleSwitcher from "../components/design-system/RoleSwitcher";
import AllwainOnboarding, { ALLWAIN_ONBOARDING_VERSION } from "../components/AllwainOnboarding";
import { apiAuthGet, apiAuthPatch, type AllwainParticipation } from "../config/api";
import { useAuthStore } from "../store/auth.store";
import { colors } from "../theme/colors";
import type { MainTabParamList, RootStackParamList } from "./types";
import { useAppTranslation } from "../i18n/useAppTranslation";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { interaction, layout } from "../components/design-system/foundations";

const Tab = createBottomTabNavigator<MainTabParamList>();

function ActivityScreen() {
  const appMode = useAuthStore((state) => state.appMode);
  const sellerEnabled = useAuthStore(
    (state) => state.user?.participation?.seller?.enabled,
  );
  if (appMode === "connector") return <ConnectorOperationsScreen />;
  if (appMode === "sell" && !sellerEnabled) return <SellerActivationScreen />;
  return <OffersScreen />;
}

export default function MainTabs() {
  const { t } = useAppTranslation();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= layout.wideBreakpoint;
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const user = useAuthStore((state) => state.user);
  const appMode = useAuthStore((state) => state.appMode);
  const setParticipation = useAuthStore((state) => state.setParticipation);
  const setAppMode = useAuthStore((state) => state.setAppMode);
  const participation = user?.participation;
  const userId = user?.id;
  const [participationLoading, setParticipationLoading] = useState(
    !participation,
  );
  const [participationError, setParticipationError] = useState<string | null>(
    null,
  );

  const loadParticipation = useCallback(async () => {
    if (!userId) return;
    setParticipationLoading(true);
    setParticipationError(null);
    try {
      const nextParticipation = await apiAuthGet<AllwainParticipation>(
        "/allwain/participation",
      );
      await setParticipation(nextParticipation);
    } catch (error: any) {
      if (error?.message !== "SESSION_EXPIRED") {
        setParticipationError(
          error?.message || "No pudimos cargar tu espacio de Allwain.",
        );
      }
    } finally {
      setParticipationLoading(false);
    }
  }, [setParticipation, userId]);

  useEffect(() => {
    if (!user) {
      navigation.reset({ index: 0, routes: [{ name: "Auth" }] });
    }
  }, [navigation, user]);

  useEffect(() => {
    if (userId) void loadParticipation();
  }, [loadParticipation, userId]);

  if (!user) {
    return (
      <View style={styles.sessionGate}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!participation && participationLoading) {
    return (
      <View style={styles.sessionGate}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.sessionText}>{t("session.preparing")}</Text>
      </View>
    );
  }

  if (!participation) {
    return (
      <View style={styles.sessionGate}>
        <Text style={styles.sessionTitle}>{t("session.errorTitle")}</Text>
        <Text style={styles.sessionText}>
          {participationError || t("session.errorBody")}
        </Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("common.retry")} style={styles.retryButton} onPress={loadParticipation}>
          <Text style={styles.retryText}>{t("common.retry")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const activityLabel =
    appMode === "buy"
      ? t("nav.offers")
      : appMode === "sell"
        ? t("nav.orders")
        : t("nav.deliveries");
  const homeLabel =
    appMode === "buy"
      ? t("nav.home")
      : appMode === "sell"
        ? t("nav.today")
        : t("nav.nearby");
  const tabPalette = appMode === "sell"
    ? {
        background: colors.seller,
        active: colors.seller,
        inactive: "#FFFFFF",
        activeBackground: "#FFFFFF",
        border: colors.seller,
      }
    : appMode === "connector"
      ? {
          background: colors.connector,
          active: colors.actionInk,
          inactive: "#FFFFFF",
          activeBackground: "#FFFFFF",
          border: colors.connector,
        }
      : {
          background: "rgba(255,255,255,0.96)",
          active: colors.actionInk,
          inactive: colors.mutedText,
          activeBackground: colors.highlight,
          border: colors.cardBorder,
        };

  async function completeOnboarding(intent: "buy" | "sell" | "connector") {
    await apiAuthPatch("/allwain/participation/experience", {
      onboardingVersion: ALLWAIN_ONBOARDING_VERSION,
      primaryIntent: intent,
      guidanceEnabled: true,
      lastContext: intent,
    });
    await setAppMode(intent);
    await loadParticipation();
  }

  return (
    <>
      <Tab.Navigator
      screenOptions={({ route }) => ({
        header: () => <RoleSwitcher />,
        headerShown: true,
        tabBarActiveTintColor: tabPalette.active,
        tabBarInactiveTintColor: tabPalette.inactive,
        tabBarActiveBackgroundColor: tabPalette.activeBackground,
        tabBarHideOnKeyboard: true,
        tabBarLabelPosition: wide ? "beside-icon" : "below-icon",
        tabBarLabelStyle: { fontSize: wide ? 12 : 11, fontWeight: "900", letterSpacing: 0 },
        tabBarItemStyle: { minWidth: 0, minHeight: interaction.targetSize, paddingVertical: 5, marginHorizontal: 2, borderRadius: 12 },
        tabBarStyle: {
          minHeight: 68 + insets.bottom,
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingHorizontal: wide ? 12 : 5,
          width: "100%",
          maxWidth: layout.navigationMaxWidth,
          alignSelf: "center",
          backgroundColor: tabPalette.background,
          borderTopColor: tabPalette.border,
          borderTopWidth: 1,
          shadowColor: colors.brandDark,
          shadowOffset: { width: 0, height: -8 },
          shadowOpacity: 0.1,
          shadowRadius: 18,
          elevation: 12,
        },
        tabBarIcon: ({ color, size }) => {
          const iconSize = Math.min(size, 21);
          if (route.name === "Inicio") return <Home size={iconSize} color={color} />;
          if (route.name === "Ofertas") {
            return appMode === "connector" ? <Truck size={iconSize} color={color} /> : <ShoppingBag size={iconSize} color={color} />;
          }
          if (route.name === "Demandas") return <ClipboardList size={iconSize} color={color} />;
          if (route.name === "ProgramaRecomendados") return <Network size={iconSize} color={color} />;
          if (route.name === "GuiaIA") return <Sparkles size={iconSize} color={color} />;
          return <UserRound size={iconSize} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Inicio" component={HomeScreen} options={{ title: homeLabel, tabBarLabel: homeLabel }} />
      <Tab.Screen name="Ofertas" component={ActivityScreen} options={{ title: activityLabel, tabBarLabel: activityLabel }} />
      <Tab.Screen
        name="Demandas"
        component={MarketRequestsScreen}
        options={{
          title: t("nav.demands"),
          tabBarLabel: t("nav.demands"),
          tabBarButton: appMode === "connector" ? () => null : undefined,
        }}
      />
      <Tab.Screen
        name="ProgramaRecomendados"
        component={SponsorsScreen}
        options={{
          title: t("nav.network"),
          tabBarLabel: t("nav.network"),
          tabBarButton: appMode === "connector" ? undefined : () => null,
        }}
      />
      <Tab.Screen name="GuiaIA" component={DemoAssistantScreen} options={{ title: t("nav.guide"), tabBarLabel: t("nav.guide") }} />
      <Tab.Screen name="Perfil" component={ProfileMainScreen} options={{ title: t("nav.profile") }} />
      </Tab.Navigator>
      <AllwainOnboarding
        userId={user.id}
        experience={participation.experience || {
          onboardingVersion: 0,
          onboardingCompletedAt: null,
          primaryIntent: null,
          guidanceEnabled: true,
          lastContext: null,
        }}
        onComplete={completeOnboarding}
      />
    </>
  );
}

const styles = StyleSheet.create({
  sessionGate: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 24,
    backgroundColor: colors.background,
  },
  sessionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
  },
  sessionText: {
    color: colors.mutedText,
    fontWeight: "700",
    lineHeight: 20,
    textAlign: "center",
  },
  retryButton: {
    minHeight: 46,
    minWidth: 140,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: interaction.brandAction,
    paddingHorizontal: 18,
  },
  retryText: {
    color: colors.buttonText,
    fontWeight: "900",
  },
});
