import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { CompositeScreenProps, useFocusEffect } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  AllwainSellerPaymentStatus,
  AllwainReputationSummary,
  type AllwainPaymentConfig,
  apiGet,
  apiAuthDelete,
  apiAuthGet,
  apiAuthPost,
} from "../../config/api";
import { MainTabParamList, RootStackParamList } from "../../navigation/types";
import { useAuthStore } from "../../store/auth.store";
import { colors } from "../../theme/colors";
import { openExternalUrl } from "../../utils/openExternalUrl";
import { BarChart3, ShieldCheck, Sparkles, Star, X } from "lucide-react-native";
import BuyerBusinessProfilePanel from "../../components/BuyerBusinessProfilePanel";
import ReputationModal from "../../components/ReputationModal";
import AuthSessionsModal from "../../components/AuthSessionsModal";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import {
  APP_LOCALES,
  type AppLocale,
  type TranslationKey,
} from "../../i18n";
import { useAnalyticsConsent } from "../../analytics/AnalyticsConsentProvider";
import {
  isAllwainLivePaymentEnvironment,
  isAllwainStripeTestMarketplace,
} from "../../utils/allwainPaymentEnvironment";

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Perfil">,
  NativeStackScreenProps<RootStackParamList>
>;

function paymentStatusKey(
  status?: AllwainSellerPaymentStatus | null,
): TranslationKey {
  if (!status?.configured || !status.paymentsEnabled) {
    return "profile.payment.statusUnavailable";
  }
  if (status.status === "enabled" && status.paymentsEnabled) {
    return "profile.payment.statusReady";
  }
  if (status.status === "enabled") return "profile.payment.statusVerified";
  if (status.status === "requires_information") {
    return "profile.payment.statusMissing";
  }
  if (status.status === "restricted") return "profile.payment.statusReview";
  if (status.status === "pending") return "profile.payment.statusPending";
  return "profile.payment.statusUnconfigured";
}

function connectReturnUrl() {
  if (Platform.OS === "web") {
    const location = (globalThis as any)?.location;
    if (location?.origin) return `${location.origin}/app/perfil`;
  }
  return "allwain://perfil";
}

export default function ProfileMainScreen({ navigation, route }: Props) {
  const { locale, t } = useAppTranslation();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const setLocale = useAuthStore((s) => s.setLocale);
  const {
    status: analyticsStatus,
    busy: analyticsBusy,
    error: analyticsError,
    decide: setAnalyticsConsent,
  } = useAnalyticsConsent();
  const [languageBusy, setLanguageBusy] = useState(false);
  const [languageError, setLanguageError] = useState<string | null>(null);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<AllwainSellerPaymentStatus | null>(null);
  const [paymentConfig, setPaymentConfig] = useState<AllwainPaymentConfig | null>(null);
  const [paymentConfigLoading, setPaymentConfigLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState<"onboarding" | "dashboard" | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [reputation, setReputation] = useState<AllwainReputationSummary | null>(null);
  const [reputationOpen, setReputationOpen] = useState(false);
  const [businessProfileOpen, setBusinessProfileOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const paymentsAvailable = Boolean(
    paymentStatus?.configured && paymentStatus?.paymentsEnabled,
  );
  const testMarketplace = isAllwainStripeTestMarketplace(paymentConfig);
  const livePaymentEnvironment = isAllwainLivePaymentEnvironment(paymentConfig);
  const platformDirect = paymentStatus?.usesConnectedAccount === false;
  const hasPayoutRole = Boolean(
    user?.role === "admin" ||
      (user?.participation?.seller &&
        user.participation.seller.status !== "not_activated") ||
      user?.participation?.connector?.enabled,
  );

  const displayName = useMemo(() => {
    if (user?.name) return user.name;
    if (user?.email) return user.email.split("@")[0];
    return t("profile.userFallback");
  }, [t, user?.name, user?.email]);

  const loadPaymentStatus = useCallback(async () => {
    if (!hasPayoutRole) return;
    setPaymentLoading(true);
    setPaymentError(null);
    try {
      setPaymentStatus(
        await apiAuthGet<AllwainSellerPaymentStatus>("/allwain/payments/connect"),
      );
    } catch (error: any) {
      setPaymentError(error?.message || t("profile.errorPaymentStatus"));
    } finally {
      setPaymentLoading(false);
    }
  }, [hasPayoutRole, t]);

  const loadPaymentEnvironment = useCallback(async () => {
    if (!hasPayoutRole) return;
    setPaymentConfigLoading(true);
    setPaymentError(null);
    try {
      const config = await apiGet<AllwainPaymentConfig>(
        "/allwain/payments/config",
      );
      setPaymentConfig(config);
      if (isAllwainLivePaymentEnvironment(config)) {
        await loadPaymentStatus();
      } else {
        setPaymentStatus(null);
      }
    } catch (error: any) {
      setPaymentConfig(null);
      setPaymentStatus(null);
      setPaymentError(error?.message || t("profile.errorPaymentStatus"));
    } finally {
      setPaymentConfigLoading(false);
    }
  }, [hasPayoutRole, loadPaymentStatus, t]);

  const loadReputation = useCallback(async () => {
    if (!user?.id) return;
    try {
      setReputation(
        await apiAuthGet<AllwainReputationSummary>(
          `/allwain/reputation/users/${user.id}`,
        ),
      );
    } catch {
      setReputation(null);
    }
  }, [user?.id]);

  const handleBusinessReadyChange = useCallback((_ready: boolean) => {}, []);

  useEffect(() => {
    const refresh = () => { if (navigation.isFocused()) void loadPaymentEnvironment(); };
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") refresh(); });
    const browserWindow = Platform.OS === "web" && typeof window !== "undefined" &&
      typeof window.addEventListener === "function" && typeof window.removeEventListener === "function"
      ? window : null;
    browserWindow?.addEventListener("focus", refresh);
    return () => { subscription.remove(); browserWindow?.removeEventListener("focus", refresh); };
  }, [loadPaymentEnvironment, navigation]);

  useFocusEffect(
    useCallback(() => {
      void loadPaymentEnvironment();
      void loadReputation();
      if (route.params?.openReputation) {
        setReputationOpen(true);
        navigation.setParams({ openReputation: undefined });
      }
    }, [loadPaymentEnvironment, loadReputation, navigation, route.params?.openReputation]),
  );

  async function openStripeOnboarding() {
    setPaymentBusy("onboarding");
    setPaymentError(null);
    try {
      const response = await apiAuthPost<{ url: string }>(
        "/allwain/payments/connect/onboarding",
        { returnUrl: connectReturnUrl() },
      );
      if (!response.url || !/^https:\/\//i.test(response.url)) {
        throw new Error(t("profile.errorStripeLink"));
      }
      await openExternalUrl(response.url);
    } catch (error: any) {
      setPaymentError(error?.message || t("profile.errorStripeOnboarding"));
    } finally {
      setPaymentBusy(null);
    }
  }

  async function openStripeDashboard() {
    setPaymentBusy("dashboard");
    setPaymentError(null);
    try {
      const response = await apiAuthPost<{ url: string }>(
        "/allwain/payments/connect/dashboard",
        {},
      );
      if (!response.url || !/^https:\/\//i.test(response.url)) {
        throw new Error(t("profile.errorStripeLink"));
      }
      await openExternalUrl(response.url);
    } catch (error: any) {
      setPaymentError(error?.message || t("profile.errorStripeDashboard"));
    } finally {
      setPaymentBusy(null);
    }
  }

  async function confirmLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await clearAuth();
      const rootNavigation = (navigation.getParent() || navigation) as any;
      rootNavigation.reset({
        index: 0,
        routes: [{ name: "Auth", params: { mode: "login" } }],
      });
    } finally {
      setLoggingOut(false);
      setLogoutConfirmOpen(false);
    }
  }

  async function confirmDeleteAccount() {
    if (deletingAccount) return;
    setDeletingAccount(true);
    setAccountError(null);
    try {
      const result = await apiAuthDelete<{ deleted: true }>("/allwain/account");
      if (result.deleted !== true) {
        throw new Error(t("profile.errorDeleteNotConfirmed"));
      }
      if (user?.id) {
        await AsyncStorage.multiRemove([
          `allwain:guide:${user.id}:v1`,
          `allwain:onboarding:3:${user.id}`,
          `allwain:onboarding:4:${user.id}`,
        ]).catch(() => undefined);
      }
      await clearAuth();
      const rootNavigation = (navigation.getParent() || navigation) as any;
      rootNavigation.reset({ index: 0, routes: [{ name: "Auth", params: { mode: "login" } }] });
    } catch (error: any) {
      setAccountError(error?.message || t("profile.errorDelete"));
      setDeleteConfirmOpen(false);
    } finally {
      setDeletingAccount(false);
    }
  }

  async function changeLanguage(nextLocale: AppLocale) {
    if (languageBusy || nextLocale === locale) return;
    setLanguageBusy(true);
    setLanguageError(null);
    try {
      await setLocale(nextLocale);
    } catch (error: any) {
      setLanguageError(
        error?.message || "No se pudo guardar el idioma seleccionado.",
      );
    } finally {
      setLanguageBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t("profile.title")}</Text>

      <View style={styles.card}>
        <Text style={styles.greeting}>{t("profile.hello", { name: displayName })}</Text>
        {user?.email ? <Text style={styles.textMuted}>{user.email}</Text> : null}
        <Text style={styles.textMuted}>{t("profile.oneAccount")}</Text>
      </View>

      <TouchableOpacity
        style={styles.reputationCard}
        activeOpacity={0.88}
        onPress={() => setReputationOpen(true)}
      >
        <View style={styles.reputationIcon}>
          <Star size={22} color={colors.primary} fill={colors.primary} />
        </View>
        <View style={styles.reputationCopy}>
          <Text style={styles.cardTitle}>{t("profile.reputation")}</Text>
          <Text style={styles.textMuted}>
            {reputation?.reviewCount
              ? t(
                  reputation.reviewCount === 1
                    ? "profile.reviewSummaryOne"
                    : "profile.reviewSummaryMany",
                  {
                    score: reputation.score.toFixed(1),
                    count: reputation.reviewCount,
                  },
                )
              : t("profile.noReviews")}
          </Text>
        </View>
        <Text style={styles.accountRowAction}>{t("common.view")}</Text>
      </TouchableOpacity>

      {hasPayoutRole && paymentConfigLoading ? (
        <View style={styles.card}>
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.textMuted}>{t("profile.payment.updating")}</Text>
          </View>
        </View>
      ) : null}

      {hasPayoutRole && testMarketplace ? (
        <View style={[styles.card, styles.testMarketCard]} accessibilityRole="summary">
          <View style={styles.paymentHeader}>
            <View style={styles.paymentHeaderCopy}>
              <Text style={styles.cardTitle}>{t("testMarket.title")}</Text>
              <Text style={styles.textMuted}>{t("testMarket.subtitle")}</Text>
            </View>
            <View style={[styles.statusPill, styles.statusPillReady]}>
              <Text style={styles.statusPillText}>{t("testMarket.status")}</Text>
            </View>
          </View>
          <View style={styles.paymentFacts}>
            <Text style={styles.text}>{t("testMarket.open")}</Text>
            <Text style={styles.textMuted}>{t("testMarket.noRealMoney")}</Text>
            <Text style={styles.textMuted}>{t("testMarket.liveUnavailable")}</Text>
          </View>
        </View>
      ) : null}

      {hasPayoutRole && livePaymentEnvironment ? (
        <View style={styles.card}>
          <View style={styles.paymentHeader}>
            <View style={styles.paymentHeaderCopy}>
              <Text style={styles.cardTitle}>
                {t(
                  platformDirect
                    ? "profile.payment.allwainTitle"
                    : "profile.payment.title",
                )}
              </Text>
              <Text style={styles.textMuted}>
                {t(
                  platformDirect
                    ? "profile.payment.platformSubtitle"
                    : "profile.payment.subtitle",
                )}
              </Text>
            </View>
            <View
              style={[
                styles.statusPill,
                paymentStatus?.status === "enabled" && styles.statusPillReady,
              ]}
            >
              <Text style={styles.statusPillText}>
                {t(paymentStatusKey(paymentStatus))}
              </Text>
            </View>
          </View>

          {paymentLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.textMuted}>{t("profile.payment.updating")}</Text>
            </View>
          ) : platformDirect ? (
            <View style={styles.paymentFacts}>
              <Text style={styles.text}>{t("profile.payment.directActive")}</Text>
              <Text style={styles.textMuted}>
                {t("profile.payment.directHelp")}
              </Text>
            </View>
          ) : !paymentsAvailable ? (
            <Text style={styles.text}>{t("profile.payment.notify")}</Text>
          ) : (
            <View style={styles.paymentFacts}>
              <Text style={styles.text}>
                {t("profile.payment.receiving", {
                  status: t(
                    paymentStatus?.transfersEnabled
                      ? "profile.payment.active"
                      : "profile.payment.pending",
                  ),
                })}
              </Text>
              <Text style={styles.text}>
                {t("profile.payment.bank", {
                  status: t(
                    paymentStatus?.payoutsEnabled
                      ? "profile.payment.active"
                      : "profile.payment.pending",
                  ),
                })}
              </Text>
            </View>
          )}

          {paymentError ? <Text style={styles.errorText}>{paymentError}</Text> : null}

          <View style={styles.paymentActions}>
            {platformDirect ? null : paymentStatus?.status === "enabled" && paymentsAvailable ? (
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={openStripeDashboard}
                disabled={paymentBusy !== null}
              >
                {paymentBusy === "dashboard" ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <Text style={styles.secondaryButtonText}>
                    {t("profile.payment.view")}
                  </Text>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  !paymentsAvailable && styles.disabledButton,
                ]}
                onPress={openStripeOnboarding}
                disabled={paymentBusy !== null || !paymentsAvailable}
              >
                {paymentBusy === "onboarding" ? (
                  <ActivityIndicator color={colors.buttonText} />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {!paymentsAvailable
                      ? t("profile.payment.unavailableAction")
                      : paymentStatus?.accountCreated
                        ? t("profile.payment.continue")
                        : t("profile.payment.activate")}
                  </Text>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={loadPaymentStatus} disabled={paymentLoading}>
              <Text style={styles.textLink}>{t("profile.payment.refresh")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("profile.account")}</Text>
        <TouchableOpacity
          style={styles.accountRow}
          onPress={() => navigation.navigate("HowAllwainWorks", { initialPage: "overview" })}
        >
          <View style={styles.adminRowLabel}>
            <Sparkles size={19} color={colors.primary} />
            <Text style={styles.accountRowText}>{t("profile.howWorks")}</Text>
          </View>
          <Text style={styles.accountRowAction}>{t("common.view")}</Text>
        </TouchableOpacity>
        <View style={styles.languageSection}>
          <View style={styles.languageCopy}>
            <Text style={styles.accountRowText}>{t("profile.language")}</Text>
            <Text style={styles.languageHelp}>{t("profile.languageHelp")}</Text>
          </View>
          <View style={styles.languageOptions}>
            {APP_LOCALES.map((option) => (
              <TouchableOpacity
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected: locale === option, busy: languageBusy }}
                style={[
                  styles.languageOption,
                  locale === option && styles.languageOptionSelected,
                ]}
                onPress={() => void changeLanguage(option)}
                disabled={languageBusy}
              >
                <Text
                  style={[
                    styles.languageOptionText,
                    locale === option && styles.languageOptionTextSelected,
                  ]}
                >
                  {t(`locale.${option}` as "locale.es")}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        {languageError ? <Text style={styles.errorText}>{languageError}</Text> : null}
        <TouchableOpacity
          style={styles.accountRow}
          onPress={() => setBusinessProfileOpen(true)}
        >
          <Text style={styles.accountRowText}>{t("profile.businessData")}</Text>
          <Text style={styles.accountRowAction}>{t("common.view")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.accountRow} onPress={() => setSessionsOpen(true)}>
          <Text style={styles.accountRowText}>{t("profile.sessions")}</Text>
          <Text style={styles.accountRowAction}>{t("common.view")}</Text>
        </TouchableOpacity>
        {user?.participation?.seller?.status !== "not_activated" ? (
          <TouchableOpacity
            style={styles.accountRow}
            onPress={() => navigation.navigate("ActivateSeller")}
          >
            <Text style={styles.accountRowText}>{t("profile.sales")}</Text>
            <Text style={styles.accountRowAction}>{t("common.view")}</Text>
          </TouchableOpacity>
        ) : null}
        {user?.participation?.connector?.enabled ? (
          <TouchableOpacity
            style={styles.accountRow}
            onPress={() => navigation.navigate("ActivateConnector")}
          >
            <Text style={styles.accountRowText}>{t("profile.area")}</Text>
            <Text style={styles.accountRowAction}>{t("common.change")}</Text>
          </TouchableOpacity>
        ) : null}
        {user?.role === "admin" ? (
          <TouchableOpacity
            style={styles.accountRow}
            onPress={() => navigation.navigate("AdminDashboard")}
          >
            <View style={styles.adminRowLabel}>
              <ShieldCheck size={19} color={colors.primary} />
              <Text style={styles.accountRowText}>{t("profile.admin")}</Text>
            </View>
            <Text style={styles.accountRowAction}>{t("common.view")}</Text>
          </TouchableOpacity>
        ) : null}
        <View style={styles.analyticsRow}>
          <View style={styles.analyticsCopy}>
            <View style={styles.adminRowLabel}>
              <BarChart3 size={19} color={colors.primary} />
              <Text style={styles.accountRowText}>{t("profile.analyticsTitle")}</Text>
            </View>
            <Text style={styles.languageHelp}>
              {t("profile.analyticsHelp")}
            </Text>
          </View>
          <Switch
            accessibilityLabel={t("profile.analyticsLabel")}
            accessibilityHint={t("profile.analyticsHint")}
            value={analyticsStatus === "granted"}
            disabled={analyticsBusy}
            onValueChange={(nextValue) => void setAnalyticsConsent(nextValue)}
            trackColor={{ false: "#D5D5D1", true: "#FFB19F" }}
            thumbColor={analyticsStatus === "granted" ? colors.primary : "#FFFFFF"}
          />
        </View>
        {analyticsError ? <Text style={styles.errorText}>{analyticsError}</Text> : null}
        <TouchableOpacity
          style={styles.accountRow}
          onPress={() => navigation.navigate("Legal", { document: "privacy" })}
        >
          <Text style={styles.accountRowText}>{t("profile.privacy")}</Text>
          <Text style={styles.accountRowAction}>{t("common.view")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.accountRow}
          onPress={() => navigation.navigate("Legal", { document: "terms" })}
        >
          <Text style={styles.accountRowText}>{t("profile.terms")}</Text>
          <Text style={styles.accountRowAction}>{t("common.view")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.accountRow} onPress={() => setDeleteConfirmOpen(true)}>
          <Text style={styles.deleteText}>{t("profile.delete")}</Text>
        </TouchableOpacity>
        {accountError ? <Text style={styles.errorText}>{accountError}</Text> : null}
      </View>

      <TouchableOpacity
        style={styles.logoutButton}
        activeOpacity={0.9}
        onPress={() => setLogoutConfirmOpen(true)}
      >
        <Text style={styles.logoutText}>{t("profile.logout")}</Text>
      </TouchableOpacity>

      <ReputationModal
        userId={user?.id || null}
        visible={reputationOpen}
        onClose={() => {
          setReputationOpen(false);
          void loadReputation();
        }}
      />

      <AuthSessionsModal
        visible={sessionsOpen}
        onClose={() => setSessionsOpen(false)}
        onSignedOut={async () => {
          setSessionsOpen(false);
          await clearAuth(t("profile.sessionSignedOut"));
          const rootNavigation = (navigation.getParent() || navigation) as any;
          rootNavigation.reset({
            index: 0,
            routes: [{ name: "Auth", params: { mode: "login" } }],
          });
        }}
      />

      <Modal
        visible={businessProfileOpen}
        animationType="slide"
        onRequestClose={() => setBusinessProfileOpen(false)}
      >
        <View style={styles.businessModalScreen}>
          <View style={styles.businessModalHeader}>
            <View style={styles.businessModalTitleCopy}>
              <Text style={styles.modalTitle}>{t("profile.businessModalTitle")}</Text>
              <Text style={styles.textMuted}>{t("profile.businessModalSubtitle")}</Text>
            </View>
            <TouchableOpacity
              style={styles.iconButton}
              accessibilityLabel={t("profile.closeBusinessData")}
              onPress={() => setBusinessProfileOpen(false)}
            >
              <X size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.businessModalContent}>
            {businessProfileOpen ? (
              <BuyerBusinessProfilePanel
                allowEdit
                onReadyChange={handleBusinessReadyChange}
              />
            ) : null}
          </ScrollView>
        </View>
      </Modal>

      <Modal
        transparent
        visible={logoutConfirmOpen}
        animationType="fade"
        onRequestClose={() => !loggingOut && setLogoutConfirmOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalPanel}>
            <Text style={styles.modalTitle}>{t("profile.logout")}</Text>
            <Text style={styles.modalText}>
              {t("profile.logoutBody")}
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setLogoutConfirmOpen(false)}
                disabled={loggingOut}
              >
                <Text style={styles.cancelText}>{t("common.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={confirmLogout}
                disabled={loggingOut}
              >
                {loggingOut ? (
                  <ActivityIndicator color={colors.buttonText} />
                ) : (
                  <Text style={styles.confirmText}>{t("profile.logout")}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={deleteConfirmOpen}
        animationType="fade"
        onRequestClose={() => !deletingAccount && setDeleteConfirmOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalPanel}>
            <Text style={styles.modalTitle}>{t("profile.delete")}</Text>
            <Text style={styles.modalText}>
              {t("profile.deleteBody")}
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setDeleteConfirmOpen(false)}
                disabled={deletingAccount}
              >
                <Text style={styles.cancelText}>{t("common.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.deleteButton]}
                onPress={confirmDeleteAccount}
                disabled={deletingAccount}
              >
                {deletingAccount ? (
                  <ActivityIndicator color={colors.buttonText} />
                ) : (
                  <Text style={styles.confirmText}>{t("profile.deleteConfirm")}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, paddingBottom: 36, gap: 12 },
  title: { fontSize: 24, fontWeight: "900", color: colors.text },
  card: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 8,
  },
  testMarketCard: {
    backgroundColor: "rgba(255,240,236,0.86)",
    borderColor: "rgba(255,121,90,0.42)",
    borderRadius: 16,
    shadowColor: colors.brandDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 2,
  },
  greeting: { fontSize: 18, fontWeight: "900", color: colors.text },
  reputationCard: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  reputationIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: colors.background,
  },
  reputationCopy: { flex: 1, minWidth: 0, gap: 3 },
  cardTitle: { fontSize: 16, fontWeight: "900", color: colors.text },
  text: { color: colors.text, fontWeight: "600" },
  textMuted: { color: colors.mutedText, fontWeight: "600" },
  paymentHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  paymentHeaderCopy: { flex: 1, gap: 2 },
  statusPill: {
    maxWidth: "48%",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  statusPillReady: { borderColor: colors.primary },
  statusPillText: { color: colors.text, fontSize: 12, fontWeight: "900" },
  loadingRow: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 8 },
  paymentFacts: { gap: 4 },
  paymentActions: { marginTop: 4, gap: 10, alignItems: "stretch" },
  primaryButton: {
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: colors.button,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  primaryButtonText: { color: colors.buttonText, fontWeight: "900", fontSize: 15 },
  secondaryButton: {
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  secondaryButtonText: { color: colors.text, fontWeight: "900", fontSize: 15 },
  disabledButton: { opacity: 0.45 },
  textLink: { color: colors.primary, fontWeight: "900", textAlign: "center" },
  errorText: { color: colors.danger || "#9f2d24", fontWeight: "700", lineHeight: 19 },
  accountRow: {
    minHeight: 45,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  accountRowText: { color: colors.text, fontWeight: "800" },
  adminRowLabel: { flexDirection: "row", alignItems: "center", gap: 9 },
  accountRowAction: { color: colors.primary, fontWeight: "900" },
  analyticsRow: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingVertical: 10,
  },
  analyticsCopy: { flex: 1, minWidth: 0, gap: 4 },
  languageSection: {
    minHeight: 76,
    alignItems: "stretch",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingVertical: 10,
  },
  languageCopy: { width: "100%", gap: 2 },
  languageHelp: {
    color: colors.mutedText,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  languageOptions: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  languageOption: {
    flexGrow: 1,
    flexBasis: "30%",
    minWidth: 84,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 6,
  },
  languageOptionSelected: { backgroundColor: colors.text },
  languageOptionText: { color: colors.text, fontSize: 12, fontWeight: "900" },
  languageOptionTextSelected: { color: colors.card },
  deleteText: { color: colors.danger || "#9f2d24", fontWeight: "900" },
  logoutButton: {
    marginTop: 8,
    backgroundColor: colors.button,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  logoutText: { color: colors.buttonText, fontWeight: "900", fontSize: 16 },
  businessModalScreen: { flex: 1, backgroundColor: colors.background },
  businessModalHeader: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  businessModalTitleCopy: { flex: 1, minWidth: 0, gap: 2 },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  businessModalContent: {
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    padding: 18,
    paddingBottom: 40,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.42)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalPanel: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    padding: 18,
    gap: 10,
  },
  modalTitle: { color: colors.text, fontSize: 19, fontWeight: "900" },
  modalText: { color: colors.mutedText, lineHeight: 20, fontWeight: "600" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 6 },
  modalButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  cancelButton: { backgroundColor: colors.card, borderColor: colors.cardBorder },
  cancelText: { color: colors.text, fontWeight: "900" },
  confirmButton: { backgroundColor: colors.button, borderColor: colors.button },
  deleteButton: { backgroundColor: colors.danger || "#9f2d24", borderColor: colors.danger || "#9f2d24" },
  confirmText: { color: colors.buttonText, fontWeight: "900" },
});
