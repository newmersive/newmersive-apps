import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ExternalLink, RefreshCw } from "lucide-react-native";
import {
  AllwainSellerPaymentStatus,
  apiAuthGet,
  apiAuthPost,
} from "../config/api";
import { colors } from "../theme/colors";
import { openExternalUrl } from "../utils/openExternalUrl";

function returnUrl() {
  if (Platform.OS === "web") {
    const origin = (globalThis as any)?.location?.origin;
    if (origin) return origin + "/app/perfil";
  }
  return "allwain://perfil";
}

function statusLabel(status?: AllwainSellerPaymentStatus | null) {
  if (!status?.configured || !status.paymentsEnabled) return "Cobros aún no disponibles";
  if (status.usesConnectedAccount === false) return "Cuenta de Allwain activa";
  if (status.status === "enabled" && status.payoutsEnabled) return "Cobros activos";
  if (status.status === "requires_information") return "Faltan datos";
  if (status.status === "restricted") return "Revisión necesaria";
  if (status.status === "pending") return "Verificación en curso";
  return "Configuración pendiente";
}

function paymentErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (message === "PAYMENTS_REQUIRE_POSTGRES") {
    return "Los cobros solo se pueden activar desde la versión online de Allwain.";
  }
  if (
    message === "ALLWAIN_PAYMENTS_NOT_CONFIGURED" ||
    message === "STRIPE_NOT_CONFIGURED"
  ) {
    return "Los cobros todavía no están disponibles.";
  }
  return /^[A-Z0-9_]+$/.test(message) ? fallback : message || fallback;
}

export default function PayoutSetupPanel({
  onStatusChange,
}: {
  onStatusChange?: (status: AllwainSellerPaymentStatus) => void | Promise<void>;
}) {
  const [status, setStatus] = useState<AllwainSellerPaymentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paymentsAvailable = Boolean(status?.configured && status?.paymentsEnabled);
  const platformDirect = status?.usesConnectedAccount === false;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiAuthGet<AllwainSellerPaymentStatus>("/allwain/payments/connect");
      setStatus(response);
      await onStatusChange?.(response);
    } catch (loadError: any) {
      setError(paymentErrorMessage(loadError, "No pudimos consultar tus cobros."));
    } finally {
      setLoading(false);
    }
  }, [onStatusChange]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void load(); });
    const refresh = () => { if (typeof document === "undefined" || document.visibilityState === "visible") void load(); };
    const browserWindow = Platform.OS === "web" && typeof window !== "undefined" &&
      typeof window.addEventListener === "function" && typeof window.removeEventListener === "function"
      ? window : null;
    browserWindow?.addEventListener("focus", refresh);
    return () => { subscription.remove(); browserWindow?.removeEventListener("focus", refresh); };
  }, [load]);

  async function openStripe() {
    setBusy(true);
    setError(null);
    try {
      const path =
        status?.status === "enabled"
          ? "/allwain/payments/connect/dashboard"
          : "/allwain/payments/connect/onboarding";
      const body = path.endsWith("/onboarding") ? { returnUrl: returnUrl() } : {};
      const response = await apiAuthPost<{ url: string }>(path, body);
      if (!response.url || !/^https:\/\//i.test(response.url)) {
        throw new Error("El servidor no devolvió un acceso seguro a Stripe.");
      }
      await openExternalUrl(response.url);
    } catch (openError: any) {
      setError(paymentErrorMessage(openError, "No pudimos abrir la verificación."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.panel}>
      <View style={styles.heading}>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>
            {platformDirect ? "Cobros de Allwain" : "Tus cobros"}
          </Text>
          <Text style={styles.status}>{statusLabel(status)}</Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Actualizar estado de los cobros"
          style={styles.iconButton}
          onPress={() => void load()}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <RefreshCw size={18} color={colors.text} />
          )}
        </TouchableOpacity>
      </View>

      {platformDirect ? (
        <View style={styles.facts}>
          <Text style={styles.fact}>Venta directa de servicios de Allwain</Text>
          <Text style={styles.fact}>
            El importe íntegro del servicio queda en la cuenta de plataforma. Los impuestos y costes se registran por separado.
          </Text>
        </View>
      ) : paymentsAvailable ? (
        <View style={styles.facts}>
          <Text style={styles.fact}>
            Recibir transferencias: {status?.transfersEnabled ? "Activo" : "Pendiente"}
          </Text>
          <Text style={styles.fact}>
            Ingreso en banco: {status?.payoutsEnabled ? "Activo" : "Pendiente"}
          </Text>
        </View>
      ) : (
        <Text style={styles.fact}>Te avisaremos cuando puedas activar tus cobros.</Text>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!platformDirect ? (
        <TouchableOpacity
          style={[styles.action, (!paymentsAvailable || busy) && styles.disabled]}
          onPress={openStripe}
          disabled={!paymentsAvailable || busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.buttonText} />
          ) : (
            <>
              <ExternalLink size={18} color={colors.buttonText} />
              <Text style={styles.actionText}>
                {!paymentsAvailable
                  ? "Cobros no disponibles"
                  : status?.status === "enabled"
                    ? "Abrir panel de cobros"
                    : "Completar verificación"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    padding: 16,
    gap: 12,
  },
  heading: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headingCopy: { flex: 1, gap: 3 },
  title: { color: colors.text, fontSize: 17, fontWeight: "900" },
  status: { color: colors.mutedText, fontWeight: "700" },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  facts: { gap: 4 },
  fact: { color: colors.text, fontWeight: "600" },
  error: { color: colors.danger, fontWeight: "700", lineHeight: 19 },
  action: {
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: colors.button,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
  },
  disabled: { opacity: 0.45 },
  actionText: { color: colors.buttonText, fontWeight: "900", fontSize: 15 },
});
