import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { googleAuthClientIds } from "../config/env";
import { useAuthStore } from "../store/auth.store";
import { colors } from "../theme/colors";
import { useAppTranslation } from "../i18n/useAppTranslation";

type Props = {
  sponsorCode?: string;
  disabled?: boolean;
  onAuthenticated: () => void;
  onError: (message: string) => void;
};

if (googleAuthClientIds.web) {
  GoogleSignin.configure({
    webClientId: googleAuthClientIds.web,
    iosClientId: googleAuthClientIds.ios || undefined,
    offlineAccess: false,
  });
}

function googleNativeAuthReady() {
  if (!googleAuthClientIds.web) return false;
  if (Platform.OS === "ios") return Boolean(googleAuthClientIds.ios);
  if (Platform.OS === "android") return Boolean(googleAuthClientIds.android);
  return false;
}

function googleNativeError(error: unknown) {
  if (isErrorWithCode(error)) {
    if (error.code === statusCodes.IN_PROGRESS) {
      return "El acceso con Google ya está abierto.";
    }
    if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return "Actualiza Google Play Services para continuar.";
    }
  }
  return error instanceof Error
    ? error.message
    : "No se pudo completar el acceso con Google.";
}

export default function GoogleAuthButton({
  sponsorCode,
  disabled,
  onAuthenticated,
  onError,
}: Props) {
  const { t } = useAppTranslation();
  const loginWithGoogle = useAuthStore((state) => state.loginWithGoogle);
  const [busy, setBusy] = useState(false);
  const googleReady = googleNativeAuthReady();

  async function authenticate() {
    if (!googleReady) {
      onError("Falta conectar Allwain con Google OAuth.");
      return;
    }
    setBusy(true);
    onError("");
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) return;
      const idToken = String(
        response.data.idToken || (await GoogleSignin.getTokens()).idToken || "",
      );
      if (!idToken) throw new Error("GOOGLE_ID_TOKEN_MISSING");
      await loginWithGoogle(idToken, sponsorCode);
      onAuthenticated();
    } catch (error: unknown) {
      onError(googleNativeError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={t("auth.google")}
      style={[styles.button, (disabled || busy || !googleReady) && styles.disabled]}
      onPress={authenticate}
      disabled={disabled || busy || !googleReady}
    >
      {busy ? (
        <ActivityIndicator color={colors.brandDark} />
      ) : (
        <>
          <View style={styles.googleMark}>
            <Text style={styles.googleLetter}>G</Text>
          </View>
          <Text style={styles.label}>{t("auth.google")}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.card,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 14,
  },
  disabled: { opacity: 0.55 },
  googleMark: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  googleLetter: {
    color: "#4285F4",
    fontSize: 18,
    fontWeight: "900",
  },
  label: { color: colors.brandDark, fontWeight: "800", fontSize: 15 },
});
