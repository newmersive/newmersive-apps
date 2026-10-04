import React, { useEffect, useState } from "react";
import { Platform, StyleSheet } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";

import { useAuthStore } from "../store/auth.store";

type Props = {
  sponsorCode?: string;
  disabled?: boolean;
  onAuthenticated: () => void;
  onError: (message: string) => void;
};

function appleError(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code || "")
      : "";
  if (code === "ERR_REQUEST_CANCELED") return "";
  if (error instanceof Error && error.message === "APPLE_EMAIL_REQUIRED") {
    return "Apple no proporcionó un email verificable para crear la cuenta.";
  }
  return error instanceof Error
    ? error.message
    : "No se pudo completar el acceso con Apple.";
}

export default function AppleAuthButton({
  sponsorCode,
  disabled,
  onAuthenticated,
  onError,
}: Props) {
  const createChallenge = useAuthStore(
    (state) => state.createAppleLoginChallenge,
  );
  const loginWithApple = useAuthStore((state) => state.loginWithApple);
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    AppleAuthentication.isAvailableAsync()
      .then(setAvailable)
      .catch(() => setAvailable(false));
  }, []);

  if (Platform.OS !== "ios" || !available) return null;

  async function authenticate() {
    if (disabled || busy) return;
    setBusy(true);
    onError("");
    try {
      const nonce = await createChallenge();
      const state = Crypto.randomUUID();
      const credential = await AppleAuthentication.signInAsync({
        nonce,
        state,
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (credential.state !== state) {
        throw new Error("La respuesta de Apple no coincide con esta solicitud.");
      }
      if (!credential.identityToken) {
        throw new Error("Apple no devolvió una identidad válida.");
      }
      const displayName = credential.fullName
        ? AppleAuthentication.formatFullName(credential.fullName)
        : undefined;
      await loginWithApple(
        credential.identityToken,
        nonce,
        displayName,
        sponsorCode,
      );
      onAuthenticated();
    } catch (error: unknown) {
      onError(appleError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={8}
      style={[styles.button, (disabled || busy) && styles.disabled]}
      onPress={authenticate}
    />
  );
}

const styles = StyleSheet.create({
  button: { width: "100%", height: 48 },
  disabled: { opacity: 0.55 },
});
