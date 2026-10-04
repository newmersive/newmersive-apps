import React, { useCallback, useEffect, useState } from "react";
import { AppState, Image, Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, ArrowRight, Bell, Check, MessageCircle, UserRound } from "lucide-react-native";

import {
  apiGet,
  type AllwainParticipation,
  type AllwainPaymentConfig,
} from "../../config/api";
import { useAuthStore, type AllwainAppMode } from "../../store/auth.store";
import { useChatStore } from "../../store/chat.store";
import { useNotificationStore } from "../../store/notification.store";
import { colors } from "../../theme/colors";
import { interaction, layout, radii } from "./foundations";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { isRtlLocale, type TranslationKey } from "../../i18n";
import { accessCopy } from "../../i18n/uiIntegration";
import { isAllwainStripeTestMarketplace } from "../../utils/allwainPaymentEnvironment";

const spaces: AllwainAppMode[] = ["buy", "sell", "connector"];

function roleStatus(
  mode: AllwainAppMode,
  participation?: AllwainParticipation,
  stripeTestMarketplace = false,
  t: (key: TranslationKey) => string = (key) => key,
) {
  if (mode === "buy") return t("roles.active");
  if (mode === "sell") {
    if (participation?.seller?.status === "restricted") return t("roles.review");
    if (
      participation?.seller?.sellerReady ||
      (stripeTestMarketplace && participation?.seller?.enabled)
    ) {
      return t("roles.active");
    }
    return participation?.seller?.status === "not_activated"
      ? t("roles.activate")
      : t("roles.continue");
  }
  if (participation?.connector?.enabled) return t("roles.active");
  return participation?.connector?.status === "not_activated"
    ? t("roles.activate")
    : t("roles.continue");
}

function roleLabel(mode: AllwainAppMode, t: (key: TranslationKey) => string) {
  if (mode === "buy") return t("roles.buyer");
  if (mode === "sell") return t("roles.seller");
  return t("roles.connector");
}

function accountLabel(fallback: string, name?: string, email?: string) {
  const value = String(name || email?.split("@")[0] || fallback).trim();
  return (value.split(/\s+/)[0] || fallback).slice(0, 16);
}

export default function RoleSwitcher({
  showBack = false,
  title,
}: {
  showBack?: boolean;
  title?: string;
}) {
  const { locale, t } = useAppTranslation();
  const { width } = useWindowDimensions();
  const rtl = isRtlLocale(locale);
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const appMode = useAuthStore((state) => state.appMode);
  const setAppMode = useAuthStore((state) => state.setAppMode);
  const user = useAuthStore((state) => state.user);
  const participation = useAuthStore((state) => state.user?.participation);
  const notificationUnreadCount = useNotificationStore((state) => state.unreadCount);
  const refreshUnreadCount = useNotificationStore((state) => state.refreshUnreadCount);
  const chatUnreadCount = useChatStore((state) => state.unreadCount);
  const loadConversations = useChatStore((state) => state.loadConversations);
  const [paymentConfig, setPaymentConfig] =
    useState<AllwainPaymentConfig | null>(null);

  useEffect(() => {
    let current = true;
    void apiGet<AllwainPaymentConfig>("/allwain/payments/config")
      .then((config) => {
        if (current) setPaymentConfig(config);
      })
      .catch(() => {
        if (current) setPaymentConfig(null);
      });
    return () => {
      current = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      const loadIndicators = () => {
        void refreshUnreadCount().catch(() => undefined);
        void loadConversations({ silent: true });
      };
      loadIndicators();
      const timer = setInterval(loadIndicators, 10000);
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active") loadIndicators();
      });
      return () => {
        clearInterval(timer);
        subscription.remove();
      };
    }, [loadConversations, refreshUnreadCount]),
  );

  async function selectMode(mode: AllwainAppMode) {
    await setAppMode(mode);
    const routeNames: string[] = navigation.getState?.()?.routeNames || [];
    if (routeNames.includes("Inicio")) {
      navigation.navigate("Inicio");
      return;
    }
    if (routeNames.includes("MainTabs")) {
      navigation.navigate("MainTabs", { screen: "Inicio" });
    }
  }

  function openNotifications() {
    const routeNames: string[] = navigation.getState?.()?.routeNames || [];
    if (routeNames.includes("Notifications")) {
      navigation.navigate("Notifications");
      return;
    }
    navigation.getParent?.()?.navigate("Notifications");
  }

  function openMessages() {
    const routeNames: string[] = navigation.getState?.()?.routeNames || [];
    if (routeNames.includes("ChatList")) {
      navigation.navigate("ChatList");
      return;
    }
    navigation.getParent?.()?.navigate("ChatList");
  }

  function openProfile() {
    const routeNames: string[] = navigation.getState?.()?.routeNames || [];
    if (routeNames.includes("Perfil")) {
      navigation.navigate("Perfil");
      return;
    }
    if (routeNames.includes("MainTabs")) {
      navigation.navigate("MainTabs", { screen: "Perfil" });
    }
  }

  function goBack() {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate("MainTabs", { screen: "Inicio" });
  }

  const profileLabel = `${t("nav.profile")}: ${user?.name || user?.email || "Allwain"}`;
  const unreadLabel = (label: string, count: number) =>
    count > 0 ? `${label}. ${t("card.unread", { count })}` : label;
  const stripeTestMarketplace =
    isAllwainStripeTestMarketplace(paymentConfig);
  const logo = (
    <Image
      source={require("../../assets/logos/Logotipo_Allwain_02.png")}
      resizeMode="contain"
      style={styles.logo}
      accessibilityLabel="Allwain"
    />
  );

  return (
    <View
      style={[
        styles.header,
        { paddingTop: Platform.OS === "web" ? 4 : Math.max(insets.top, 4) },
      ]}
    >
      <View style={styles.inner}>
      <View style={[styles.brandRow, rtl && styles.reverseRow]}>
        {Platform.OS === "web" ? (
          <TouchableOpacity
            {...{ href: "/" }}
            accessibilityRole="link"
            accessibilityLabel={accessCopy[locale].website}
            style={styles.brandLink}
          >
            {logo}
          </TouchableOpacity>
        ) : logo}
        <View style={[styles.headerActions, rtl && styles.reverseRow]}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={unreadLabel(t("chat.messages"), chatUnreadCount)}
          style={styles.iconButton}
          onPress={openMessages}
        >
          <MessageCircle size={21} color={colors.text} />
          {chatUnreadCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{chatUnreadCount > 9 ? "9+" : chatUnreadCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={unreadLabel(t("notifications.title"), notificationUnreadCount)}
          style={styles.iconButton}
          onPress={openNotifications}
        >
          <Bell size={21} color={colors.text} />
          {notificationUnreadCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {notificationUnreadCount > 9 ? "9+" : notificationUnreadCount}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={profileLabel}
          style={styles.accountButton}
          onPress={openProfile}
        >
          <UserRound size={20} color={colors.text} />
          {width >= 600 ? (
            <Text style={styles.accountText} numberOfLines={1}>
              {accountLabel(t("nav.profile"), user?.name, user?.email)}
            </Text>
          ) : null}
        </TouchableOpacity>
        </View>
      </View>

      {showBack ? (
        <View style={[styles.pageRow, rtl && styles.reverseRow]}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t("common.back")}
            onPress={goBack}
            style={[styles.backButton, rtl && styles.reverseRow]}
          >
            {rtl ? <ArrowRight size={19} color={colors.text} /> : <ArrowLeft size={19} color={colors.text} />}
            <Text style={styles.backText}>{t("common.back")}</Text>
          </TouchableOpacity>
          <View style={styles.pageCopy}>
            <Text accessibilityRole="header" numberOfLines={1} style={[styles.pageTitle, rtl && styles.rtlText]}>
              {title || t("nav.home")}
            </Text>
            <Text numberOfLines={1} style={[styles.pageContext, rtl && styles.rtlText]}>{roleLabel(appMode, t)}</Text>
          </View>
        </View>
      ) : (
      <View accessibilityRole="tablist" style={[styles.tabs, rtl && styles.reverseRow]}>
        {spaces.map((mode) => {
          const label = roleLabel(mode, t);
          const selected = mode === appMode;
          const background =
            mode === "buy" ? colors.buyer : mode === "sell" ? colors.seller : colors.connector;
          const foreground = mode === "sell" ? colors.buttonText : colors.actionInk;
          return (
            <TouchableOpacity
              key={mode}
              accessibilityRole="tab"
              accessibilityLabel={`${label}. ${roleStatus(mode, participation, stripeTestMarketplace, t)}`}
              accessibilityState={{ selected }}
              aria-selected={selected}
              activeOpacity={0.86}
              onPress={() => void selectMode(mode)}
              style={[
                styles.tab,
                { backgroundColor: background },
                selected && styles.tabSelected,
                selected && { borderBottomColor: mode === "sell" ? colors.primary : colors.actionInk },
              ]}
            >
              <View style={[styles.tabHeading, rtl && styles.reverseRow, selected && { borderColor: foreground }]}>
              <Text style={[styles.tabLabel, { color: foreground }, selected && styles.tabLabelSelected]} numberOfLines={1}>
                {label}
              </Text>
              {selected ? <Check size={13} strokeWidth={3} color={foreground} /> : null}
              </View>
              <Text
                style={[
                  styles.tabStatus,
                  { color: foreground },
                ]}
                numberOfLines={1}
              >
                {roleStatus(mode, participation, stripeTestMarketplace, t)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    borderTopWidth: 3,
    borderTopColor: colors.primary,
    shadowColor: colors.brandDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 4,
    zIndex: 4,
  },
  inner: { width: "100%", maxWidth: layout.navigationMaxWidth, alignSelf: "center" },
  brandRow: {
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  logo: { width: 136, height: 33, flexShrink: 1 },
  brandLink: { minHeight: interaction.targetSize, justifyContent: "center", flexShrink: 1 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  accountButton: {
    minWidth: interaction.targetSize,
    minHeight: interaction.targetSize,
    maxWidth: 170,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.highlight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  accountText: {
    flexShrink: 1,
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  iconButton: {
    width: interaction.targetSize,
    height: interaction.targetSize,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF8F5",
  },
  badge: {
    position: "absolute",
    right: 1,
    top: 1,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 3,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: interaction.brandAction,
    borderWidth: 1,
    borderColor: colors.card,
  },
  badgeText: { color: colors.actionInk, fontSize: 10, fontWeight: "900" },
  tabs: {
    flexDirection: "row",
    paddingTop: 3,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 68,
    borderWidth: 0,
    borderBottomWidth: 4,
    borderBottomColor: "transparent",
    paddingHorizontal: 6,
    paddingVertical: 7,
  },
  tabSelected: {
    borderBottomWidth: 4,
    shadowColor: colors.brandDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 1,
  },
  tabHeading: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "100%", paddingHorizontal: 5, paddingVertical: 3, borderWidth: 1, borderColor: "transparent", borderRadius: 999 },
  tabLabel: { fontSize: 12, fontWeight: "600", flexShrink: 1 },
  tabLabelSelected: { fontWeight: "900" },
  tabStatus: { marginTop: 3, fontSize: 11, fontWeight: "600" },
  pageRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 10, paddingTop: 4 },
  backButton: { minHeight: interaction.targetSize, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radii.card, borderWidth: 1, borderColor: colors.cardBorder },
  backText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  pageCopy: { flex: 1, minWidth: 0, gap: 2 },
  pageTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  pageContext: { color: colors.mutedText, fontSize: 11, fontWeight: "600" },
  reverseRow: { flexDirection: "row-reverse" },
  rtlText: { textAlign: "right" },
});
