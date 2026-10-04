import React, { useEffect, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Linking,
} from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors } from "../../theme/colors";
import { useAuthStore } from "../../store/auth.store";
import { RootStackParamList } from "../../navigation/types";
import { demoModeEnabled, googleAuthClientIds } from "../../config/env";
import GoogleAuthButton from "../../components/GoogleAuthButton";
import AppleAuthButton from "../../components/AppleAuthButton";
import { apiPost } from "../../config/api";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { suggestEmailCorrection } from "../../utils/userInputIntelligence";
import { ArrowLeft, Globe } from "lucide-react-native";
import { Picker } from "@react-native-picker/picker";
import { APP_LOCALES, type AppLocale } from "../../i18n";
import { accessCopy } from "../../i18n/uiIntegration";
import { interaction } from "../../components/design-system/foundations";
import { consumePendingJourney } from "../../utils/pendingJourney";

type AuthMode = "login" | "register" | "forgot" | "reset";

export default function AuthScreen() {
  const { t, locale } = useAppTranslation();
  const copy = accessCopy[locale];
  const setLocale = useAuthStore((s) => s.setLocale);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "Auth">>();

  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const sessionMessage = useAuthStore((s) => s.sessionMessage);
  const clearSessionMessage = useAuthStore((s) => s.clearSessionMessage);

  const [mode, setMode] = useState<AuthMode>(
    route.params?.mode === "register" ? "register" : "login",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [sponsorCode, setSponsorCode] = useState("");
  const [testerIntent, setTesterIntent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const googleEnabled =
    Platform.OS === "android"
      ? Boolean(googleAuthClientIds.android)
      : Platform.OS === "ios"
        ? Boolean(googleAuthClientIds.ios)
        : Boolean(googleAuthClientIds.web);
  const appleEnabled = Platform.OS === "ios";
  const emailSuggestion = suggestEmailCorrection(email);

  useEffect(() => {
    if (sessionMessage) {
      setError(sessionMessage);
      clearSessionMessage();
    }
  }, [clearSessionMessage, sessionMessage]);

  useEffect(() => {
    if (route.params?.mode) {
      setMode(route.params.mode);
    }
  }, [route.params?.mode]);

  useEffect(() => {
    if (route.params?.sponsorCode) {
      setSponsorCode(route.params.sponsorCode);
      setMode("register");
    }
  }, [route.params?.sponsorCode]);

  useEffect(() => {
    let active = true;
    const applyIncomingUrl = (href: string | null | undefined) => {
      if (!active || !href) return;
      let parsed: URL;
      try {
        parsed = new URL(href);
      } catch {
        return;
      }
      const referralCode = parsed.searchParams.get("ref")?.trim();
      if (referralCode) {
        setSponsorCode(referralCode);
        setMode("register");
      }
      const wantsTesterCourse = parsed.searchParams.get("intent") === "tester";
      if (wantsTesterCourse) {
        setTesterIntent(true);
        setMode("register");
      } else if (parsed.searchParams.get("mode") === "register") {
        setMode("register");
      }
      const token = parsed.searchParams.get("resetToken")?.trim();
      if (token) {
        setResetToken(token);
        setMode("reset");
      }
    };

    void (async () => {
      const href = Platform.OS === "web"
        ? (globalThis as any)?.location?.href
        : await Linking.getInitialURL();
      applyIncomingUrl(href);
    })().catch(() => undefined);

    const subscription = Platform.OS === "web"
      ? null
      : Linking.addEventListener("url", ({ url }) => applyIncomingUrl(url));
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  const enterApp = async () => {
    const accountId = useAuthStore.getState().user?.id;
    const destination = accountId ? await consumePendingJourney(accountId) : null;
    if (!accountId || useAuthStore.getState().user?.id !== accountId) return;
    if (destination) {
      navigation.reset({ index: destination.name === "MainTabs" ? 0 : 1, routes: destination.name === "MainTabs" ? [destination as any] : [{ name: "MainTabs" }, destination as any] });
      return;
    }
    if (testerIntent) {
      navigation.reset({
        index: 1,
        routes: [
          { name: "MainTabs" },
          { name: "HowAllwainWorks", params: { initialPage: "overview" } },
        ],
      });
      return;
    }
    navigation.reset({
      index: 0,
      routes: [{ name: "MainTabs" }],
    });
  };

  const handleSubmit = async () => {
    if (loading) return;
    const isRegister = mode === "register";

    if (!email || !password || (isRegister && !name)) {
      setError(t("auth.required"));
      return;
    }
    if (isRegister && password.length < 12) {
      setError(t("auth.passwordLength"));
      return;
    }
    if (isRegister && emailSuggestion) {
      setError(`Revisa el email. ¿Querías escribir ${emailSuggestion}?`);
      return;
    }

    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        await register(
          name,
          email,
          password,
          sponsorCode.trim() || undefined,
        );
      } else {
        await login(email, password);
      }
      await enterApp();
    } catch (err: any) {
      setError(err?.message || t("auth.genericError"));
    } finally {
      setLoading(false);
    }
  };

  async function requestReset() {
    if (!email.trim()) {
      setError(t("auth.enterEmail"));
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await apiPost<{ ok: boolean }>("/auth/forgot-password", {
        email: email.trim(),
        sourceApp: "allwain",
      });
      if (!result.ok) throw new Error("RESET_NOT_CONFIRMED");
      setNotice(t("auth.resetRequested"));
    } catch (resetError: any) {
      setError(resetError?.message || t("auth.resetRequestError"));
    } finally {
      setLoading(false);
    }
  }

  async function finishReset() {
    if (password.length < 12) {
      setError(t("auth.passwordLength"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("auth.passwordMismatch"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await apiPost<{ ok: boolean }>("/auth/reset-password", {
        token: resetToken,
        newPassword: password,
      });
      if (!result.ok) throw new Error("RESET_NOT_CONFIRMED");
      setPassword("");
      setConfirmPassword("");
      setResetToken("");
      setMode("login");
      setNotice(t("auth.passwordUpdated"));
      if (Platform.OS === "web") {
        (globalThis as any)?.history?.replaceState?.({}, "", "/");
      }
    } catch {
      setError(t("auth.resetExpired"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.accessToolbar}>
            {Platform.OS === "web" ? (
              <TouchableOpacity
                accessibilityRole="link"
                accessibilityLabel={copy.website}
                {...{ href: "/" }}
                style={styles.websiteLink}
              >
                <ArrowLeft size={18} color={colors.text} style={locale === "ar" ? { transform: [{ scaleX: -1 }] } : undefined} />
                <Text style={styles.websiteText}>{copy.website}</Text>
              </TouchableOpacity>
            ) : null}
            <View style={styles.languageControl}>
              <Globe size={18} color={colors.text} />
              <Picker
                accessibilityLabel={t("profile.language")}
                selectedValue={locale}
                enabled={!loading}
                onValueChange={(value: AppLocale) => void setLocale(value)}
                style={styles.languagePicker}
              >
                {APP_LOCALES.map((item) => <Picker.Item key={item} value={item} label={t(`locale.${item}`)} />)}
              </Picker>
            </View>
          </View>
          <View style={styles.header}>
            <Image
              source={require("../../assets/logos/Logotipo_Allwain_02.png")}
              style={styles.brandLogo}
              resizeMode="contain"
              accessibilityLabel="Allwain"
            />
            <Text accessibilityRole="header" style={styles.accessTitle}>{copy.heading}</Text>
            <Text style={styles.accessIntro}>{copy.intro}</Text>
            <Text style={styles.subtitle}>
              {mode === "login"
                ? t("auth.loginSubtitle")
                : mode === "register"
                  ? t("auth.registerSubtitle")
                  : mode === "forgot"
                    ? t("auth.forgotSubtitle")
                    : t("auth.resetSubtitle")}
            </Text>
          </View>

          {mode === "login" || mode === "register" ? (
            <View style={styles.switcher}>
          <TouchableOpacity
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === "login", disabled: loading }}
            style={[styles.switchButton, mode === "login" && styles.switchActive]}
            onPress={() => setMode("login")}
            disabled={loading}
          >
            <Text
              style={[styles.switchText, mode === "login" && styles.switchTextActive]}
            >
              {t("auth.login")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === "register", disabled: loading }}
            style={[
              styles.switchButton,
              mode === "register" && styles.switchActive,
            ]}
            onPress={() => setMode("register")}
            disabled={loading}
          >
            <Text
              style={[
                styles.switchText,
                mode === "register" && styles.switchTextActive,
              ]}
            >
              {t("auth.register")}
            </Text>
          </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.card}>
          {mode === "forgot" ? (
            <>
              <Text style={styles.flowTitle}>{t("auth.emailQuestion")}</Text>
              <Text style={styles.flowText}>{t("auth.resetHelp")}</Text>
              <Text style={styles.fieldLabel}>{t("auth.email")}</Text>
              <TextInput
                accessibilityLabel={t("auth.email")}
                autoComplete="email"
                returnKeyType="go"
                onSubmitEditing={() => { if (!loading) void requestReset(); }}
                style={styles.input}
                placeholder={t("auth.email")}
                placeholderTextColor="rgba(64, 64, 65, 0.6)"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {notice ? <Text style={styles.notice}>{notice}</Text> : null}
              <TouchableOpacity style={styles.primaryButton} onPress={requestReset} disabled={loading}>
                {loading ? <ActivityIndicator color={colors.buttonText} /> : <Text style={styles.primaryButtonText}>{t("auth.sendLink")}</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.textButton} onPress={() => setMode("login")} disabled={loading}>
                <Text style={styles.textButtonLabel}>{t("auth.backToLogin")}</Text>
              </TouchableOpacity>
            </>
          ) : mode === "reset" ? (
            <>
              <Text style={styles.flowTitle}>{t("auth.newPassword")}</Text>
              <Text style={styles.fieldLabel}>{t("auth.newPasswordPlaceholder")}</Text>
              <TextInput
                accessibilityLabel={t("auth.newPasswordPlaceholder")}
                autoComplete="new-password"
                style={styles.input}
                placeholder={t("auth.newPasswordPlaceholder")}
                placeholderTextColor="rgba(64, 64, 65, 0.6)"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
              <Text style={styles.fieldLabel}>{t("auth.repeatPassword")}</Text>
              <TextInput
                accessibilityLabel={t("auth.repeatPassword")}
                autoComplete="new-password"
                returnKeyType="go"
                onSubmitEditing={() => { if (!loading) void finishReset(); }}
                style={styles.input}
                placeholder={t("auth.repeatPassword")}
                placeholderTextColor="rgba(64, 64, 65, 0.6)"
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <TouchableOpacity style={styles.primaryButton} onPress={finishReset} disabled={loading}>
                {loading ? <ActivityIndicator color={colors.buttonText} /> : <Text style={styles.primaryButtonText}>{t("auth.savePassword")}</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
          {mode === "register" && (
            <>
            <Text style={styles.fieldLabel}>{t("auth.name")}</Text>
            <TextInput
              accessibilityLabel={t("auth.name")}
              autoComplete="name"
              style={styles.input}
              placeholder={t("auth.name")}
              placeholderTextColor="rgba(64, 64, 65, 0.6)"
              value={name}
              onChangeText={setName}
            />
            </>
          )}
          <Text style={styles.fieldLabel}>{t("auth.email")}</Text>
          <TextInput
            style={styles.input}
            accessibilityLabel={t("auth.email")}
            autoComplete="email"
            placeholder={t("auth.email")}
            placeholderTextColor="rgba(64, 64, 65, 0.6)"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          {emailSuggestion ? (
            <TouchableOpacity
              style={styles.suggestionButton}
              onPress={() => {
                setEmail(emailSuggestion);
                setError(null);
              }}
            >
              <Text style={styles.suggestionText}>
                ¿Querías decir {emailSuggestion}?
              </Text>
            </TouchableOpacity>
          ) : null}
          <Text style={styles.fieldLabel}>{t("auth.password")}</Text>
          <TextInput
            style={styles.input}
            accessibilityLabel={t("auth.password")}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            returnKeyType="go"
            onSubmitEditing={() => void handleSubmit()}
            placeholder={t("auth.password")}
            placeholderTextColor="rgba(64, 64, 65, 0.6)"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          {mode === "register" ? <Text style={styles.fieldHint}>{copy.passwordHelp}</Text> : null}

          {mode === "register" && (
            <>
              <Text style={styles.fieldLabel}>{t("auth.invite")}</Text>
              <TextInput
                accessibilityLabel={t("auth.invite")}
                style={styles.input}
                placeholder={t("auth.invite")}
                placeholderTextColor="rgba(64, 64, 65, 0.6)"
                value={sponsorCode}
                onChangeText={setSponsorCode}
                autoCapitalize="characters"
              />
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={mode === "login" ? t("auth.login") : t("auth.register")}
            accessibilityState={{ disabled: loading, busy: loading }}
            style={styles.primaryButton}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.buttonText} />
            ) : (
              <Text style={styles.primaryButtonText}>
                {mode === "login" ? t("auth.login") : t("auth.register")}
              </Text>
            )}
          </TouchableOpacity>

          {mode === "register" ? (
            <Text style={styles.legalNotice}>
              Al crear la cuenta confirmas que tienes al menos 18 años, aceptas las{" "}
              <Text style={styles.legalLink} onPress={() => void Linking.openURL("https://allwain.es/terminos/")}>
                Condiciones
              </Text>{" "}
              y has leído cómo tratamos tus datos en{" "}
              <Text style={styles.legalLink} onPress={() => void Linking.openURL("https://allwain.es/privacidad/")}>
                Privacidad
              </Text>.
            </Text>
          ) : null}

          {mode === "login" ? (
            <TouchableOpacity style={styles.textButton} onPress={() => { setError(null); setNotice(null); setMode("forgot"); }} disabled={loading}>
              <Text style={styles.textButtonLabel}>{t("auth.forgot")}</Text>
            </TouchableOpacity>
          ) : null}

          {googleEnabled || appleEnabled ? (
            <>
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{copy.separator}</Text>
                <View style={styles.dividerLine} />
              </View>

              {googleEnabled ? (
                <GoogleAuthButton
                  sponsorCode={mode === "register" ? sponsorCode : undefined}
                  disabled={loading}
                  onAuthenticated={enterApp}
                  onError={(message) => setError(message || null)}
                />
              ) : null}
              {appleEnabled ? (
                <AppleAuthButton
                  sponsorCode={mode === "register" ? sponsorCode : undefined}
                  disabled={loading}
                  onAuthenticated={enterApp}
                  onError={(message) => setError(message || null)}
                />
              ) : null}
              {mode === "login" ? (
                <Text style={styles.legalNotice}>
                  Si es tu primer acceso, puede crearse una cuenta. Debes tener al menos 18 años. Consulta{" "}
                  <Text style={styles.legalLink} onPress={() => void Linking.openURL("https://allwain.es/terminos/")}>
                    Condiciones
                  </Text>{" "}
                  y{" "}
                  <Text style={styles.legalLink} onPress={() => void Linking.openURL("https://allwain.es/privacidad/")}>
                    Privacidad
                  </Text>.
                </Text>
              ) : null}
            </>
          ) : null}

          {demoModeEnabled ? (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => navigation.navigate("DemoLanding")}
              disabled={loading}
            >
              <Text style={styles.secondaryButtonText}>{t("auth.demo")}</Text>
            </TouchableOpacity>
          ) : null}
            </>
          )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  keyboard: { flex: 1 },
  container: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    padding: 20,
    backgroundColor: colors.background,
    justifyContent: "flex-start",
  },
  accessToolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 28 },
  websiteLink: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 7, paddingEnd: 8 },
  websiteText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  languageControl: { flexDirection: "row", alignItems: "center", gap: 4, marginStart: "auto", borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 10, paddingHorizontal: 9, backgroundColor: colors.card },
  languagePicker: { minHeight: 44, width: 126, color: colors.text, backgroundColor: colors.card, borderWidth: 0, fontSize: 14 },
  accessTitle: { color: colors.text, fontSize: 27, lineHeight: 34, fontWeight: "800", textAlign: "center", marginTop: 20 },
  accessIntro: { color: colors.mutedText, fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 8 },
  fieldLabel: { color: colors.text, fontSize: 13, fontWeight: "700", marginBottom: -6 },
  fieldHint: { color: colors.mutedText, fontSize: 12, lineHeight: 18, marginTop: -6 },
  header: {
    marginBottom: 24,
    alignItems: "center",
  },
  brandLogo: { width: 220, height: 54 },
  subtitle: { color: colors.text, marginTop: 16, fontSize: 16, fontWeight: "600", textAlign: "center" },
  switcher: {
    flexDirection: "row",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 12,
  },
  switchButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.highlight,
  },
  switchActive: {
    backgroundColor: colors.card,
  },
  switchText: {
    color: colors.mutedText,
    fontWeight: "700",
  },
  switchTextActive: {
    color: colors.text,
  },
  card: {
    gap: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 16,
    backgroundColor: colors.card,
    padding: 18,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    padding: 12,
    color: colors.text,
    backgroundColor: colors.card,
    minHeight: 48,
    fontSize: 16,
  },
  suggestionButton: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: "#E6B34F",
    borderRadius: 8,
    backgroundColor: "#FFF8E8",
  },
  suggestionText: { color: colors.text, fontWeight: "800" },
  error: { color: "#B3261E", backgroundColor: "#FFF0EE", borderRadius: 8, padding: 12, lineHeight: 20, marginTop: 4 },
  notice: { color: "#175A46", backgroundColor: "#EAF4F0", borderRadius: 7, padding: 10, fontWeight: "700" },
  legalNotice: { color: colors.mutedText, fontSize: 12, lineHeight: 18, textAlign: "center" },
  legalLink: { color: "#A33722", fontWeight: "800", textDecorationLine: "underline" },
  flowTitle: { color: colors.text, fontSize: 21, fontWeight: "900" },
  flowText: { color: colors.mutedText, lineHeight: 20, fontWeight: "600" },
  primaryButton: {
    backgroundColor: interaction.brandAction,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  primaryButtonText: {
    color: colors.buttonText,
    fontWeight: "700",
    fontSize: 16,
  },
  textButton: { minHeight: 42, alignItems: "center", justifyContent: "center" },
  textButtonLabel: { color: "#A33722", fontWeight: "800" },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.cardBorder },
  dividerText: { color: colors.mutedText, fontWeight: "700" },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.button,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: colors.button,
    fontWeight: "700",
  },
});
