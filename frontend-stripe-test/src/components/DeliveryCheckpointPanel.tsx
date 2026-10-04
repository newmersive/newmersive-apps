import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { CheckCircle2, QrCode } from "lucide-react-native";

import {
  apiAuthGet,
  type AllwainDeliveryCheckpoint,
} from "../config/api";
import { colors } from "../theme/colors";
import { BigActionButton } from "./design-system";

interface Props {
  orderId: string;
  type: "seller_handoff" | "buyer_delivery";
  onVerified?: () => void;
}

export default function DeliveryCheckpointPanel({
  orderId,
  type,
  onVerified,
}: Props) {
  const [open, setOpen] = useState(false);
  const [checkpoint, setCheckpoint] = useState<AllwainDeliveryCheckpoint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const next = await apiAuthGet<AllwainDeliveryCheckpoint>(
        `/allwain/participation/logistics/orders/${orderId}/checkpoint?type=${type}`,
      );
      setCheckpoint(next);
      if (next.status === "verified") onVerified?.();
    } catch (loadError: any) {
      setError(loadError?.message || "No pudimos preparar el código.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [onVerified, orderId, type]);

  useEffect(() => {
    if (!open || checkpoint?.status === "verified") return;
    const timer = setInterval(() => void load(true), 5_000);
    return () => clearInterval(timer);
  }, [checkpoint?.status, load, open]);

  async function showCheckpoint() {
    setOpen(true);
    await load();
  }

  if (!open) {
    return (
      <BigActionButton
        label={type === "seller_handoff" ? "Mostrar QR de recogida" : "Mostrar QR de entrega"}
        icon={<QrCode size={20} color={colors.buttonText} />}
        onPress={() => void showCheckpoint()}
      />
    );
  }

  if (checkpoint?.status === "verified") {
    return (
      <View style={styles.verifiedBox}>
        <CheckCircle2 size={25} color="#176B3A" />
        <View style={styles.copy}>
          <Text style={styles.verifiedTitle}>Verificación realizada</Text>
          <Text style={styles.help}>El movimiento ha quedado registrado en la trazabilidad del pedido.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.eyebrow}>CÓDIGO DE UN SOLO USO</Text>
      <Text style={styles.title}>
        {type === "seller_handoff"
          ? "Enséñaselo al Conector al recoger"
          : "Enséñaselo al Conector al entregar"}
      </Text>
      <Text style={styles.help}>
        Caduca en 15 minutos. También puedes dictar el código de 8 cifras.
      </Text>
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {checkpoint?.qrValue ? (
        <View style={styles.qrFrame}>
          <QRCode
            value={checkpoint.qrValue}
            size={188}
            color={colors.brandDark}
            backgroundColor="#FFFFFF"
          />
        </View>
      ) : null}
      {checkpoint?.shortCode ? (
        <Text selectable style={styles.code}>{checkpoint.shortCode}</Text>
      ) : null}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => setOpen(false)}>
          <Text style={styles.secondaryText}>Ocultar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => void load()}>
          <Text style={styles.secondaryText}>Renovar código</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    alignItems: "center",
    gap: 9,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
  },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: "900" },
  title: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "900", textAlign: "center" },
  help: { color: colors.mutedText, lineHeight: 19, fontWeight: "600", textAlign: "center" },
  error: { color: colors.danger, fontWeight: "800", textAlign: "center" },
  qrFrame: {
    width: 212,
    height: 212,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: "#FFFFFF",
  },
  code: { color: colors.brandDark, fontSize: 27, fontWeight: "900", letterSpacing: 0 },
  actions: { width: "100%", flexDirection: "row", gap: 8 },
  secondaryButton: {
    flex: 1,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.background,
    paddingHorizontal: 8,
  },
  secondaryText: { color: colors.text, fontWeight: "900", textAlign: "center" },
  verifiedBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#9CC8AE",
    borderRadius: 8,
    backgroundColor: "#E9F7EF",
  },
  copy: { flex: 1, gap: 2 },
  verifiedTitle: { color: "#176B3A", fontWeight: "900" },
});

