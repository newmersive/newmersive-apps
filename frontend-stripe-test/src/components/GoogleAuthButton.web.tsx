import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as AuthSession from "expo-auth-session";
import { discovery } from "expo-auth-session/providers/google";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { googleAuthClientIds } from "../config/env";
import { useAuthStore } from "../store/auth.store";
import { colors } from "../theme/colors";
import { useAppTranslation } from "../i18n/useAppTranslation";

WebBrowser.maybeCompleteAuthSession();

type Props = {
  sponsorCode?: string;
  disabled?: boolean;
  onAuthenticated: () => void;
  onError: (message: string) => void;
};

export default function GoogleAuthButton({
  sponsorCode,
  disabled,
  onAuthenticated,
  onError,
}: Props) {
  const { t } = useAppTranslation();
  const loginWithGoogle = useAuthStore((state) => state.loginWithGoogle);
  const [busy, setBusy] = useState(false);
  const nonce = useMemo(() => Crypto.randomUUID(), []);
  const redirectUri = AuthSession.makeRedirectUri({ path: "oauth/google" });
  const [request, , promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: googleAuthClientIds.web || "google-auth-not-configured",
      redirectUri,
      responseType: AuthSession.ResponseType.IdToken,
      usePKCE: false,
      scopes: ["openid", "profile", "email"],
      extraParams: { nonce },
    },
    discovery,
  );

  async function authenticate() {
    if (!googleAuthClientIds.web) {
      onError("Falta conectar Allwain con Google OAuth.");
      return;
    }
    if (!request || !discovery) return;
    setBusy(true);
    onError("");
    try {
      const response = await promptAsync();
      if (response.type !== "success") {
        if (response.type !== "dismiss" && response.type !== "cancel") {
          onError("No se pudo completar el acceso con Google.");
        }
        return;
      }
      const idToken = String(response.params?.id_token || "");
      if (!idToken) throw new Error("GOOGLE_ID_TOKEN_MISSING");
      await loginWithGoogle(idToken, sponsorCode);
      onAuthenticated();
    } catch (error: unknown) {
      onError(
        error instanceof Error
          ? error.message
          : "No se pudo completar el acceso con Google.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={t("auth.google")}
      style={[styles.button, (disabled || busy || !request || !googleAuthClientIds.web) && styles.disabled]}
      onPress={authenticate}
      disabled={disabled || busy || !request || !googleAuthClientIds.web}
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
