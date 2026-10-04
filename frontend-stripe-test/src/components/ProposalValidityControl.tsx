import Slider from "@react-native-community/slider";
import { Clock3 } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors } from "../theme/colors";

const DURATIONS = [60, 360, 720, 1_440, 4_320, 10_080, 20_160, 43_200] as const;

function durationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1_440) return `${Math.round(minutes / 60)} h`;
  const days = Math.round(minutes / 1_440);
  return days === 1 ? "1 día" : `${days} días`;
}

export function nearestProposalDuration(minutes?: number | null) {
  const candidate = Number(minutes) || 10_080;
  return DURATIONS.reduce((nearest, duration) =>
    Math.abs(duration - candidate) < Math.abs(nearest - candidate)
      ? duration
      : nearest,
  );
}

export function ProposalValidityControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (minutes: number) => void;
}) {
  const index = Math.max(0, DURATIONS.indexOf(nearestProposalDuration(value)));
  return (
    <View style={styles.control}>
      <View style={styles.headingRow}>
        <View style={styles.labelRow}>
          <Clock3 size={17} color={colors.seller} />
          <Text style={styles.label}>¿Cuánto dura tu oferta?</Text>
        </View>
        <Text style={styles.value}>{durationLabel(DURATIONS[index])}</Text>
      </View>
      <Slider
        accessibilityLabel="Duración de la oferta"
        accessibilityValue={{ text: durationLabel(DURATIONS[index]) }}
        minimumValue={0}
        maximumValue={DURATIONS.length - 1}
        step={1}
        value={index}
        minimumTrackTintColor={colors.seller}
        maximumTrackTintColor={colors.cardBorder}
        thumbTintColor={colors.primary}
        onValueChange={(next) => onChange(DURATIONS[Math.round(next)])}
      />
      <View style={styles.rangeRow}>
        <Text style={styles.range}>1 hora</Text>
        <Text style={styles.range}>30 días</Text>
      </View>
      <Text style={styles.help}>
        Al terminar la cuenta atrás dejará de poder aceptarse. Podrás renovarla con una propuesta nueva.
      </Text>
    </View>
  );
}

export function formatProposalCountdown(expiresAt?: string | null, now = Date.now()) {
  if (!expiresAt) return null;
  const remaining = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return "Finalizada";
  const totalMinutes = Math.max(1, Math.ceil(remaining / 60_000));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  if (totalMinutes < 1_440) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
  }
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  return hours ? `${days} d ${hours} h` : `${days} d`;
}

export function ProposalCountdown({
  expiresAt,
  compact = false,
}: {
  expiresAt?: string | null;
  compact?: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  const label = useMemo(
    () => formatProposalCountdown(expiresAt, now),
    [expiresAt, now],
  );
  if (!label) return null;
  const expired = label === "Finalizada";
  return (
    <View
      style={[
        styles.countdown,
        compact && styles.countdownCompact,
        expired && styles.countdownExpired,
      ]}
    >
      <Clock3 size={compact ? 13 : 15} color={expired ? colors.danger : colors.text} />
      <Text style={[styles.countdownText, expired && styles.countdownTextExpired]}>
        {expired ? label : `Quedan ${label}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  control: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 5,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  label: { color: colors.text, fontSize: 13, fontWeight: "900" },
  value: { color: colors.primary, fontSize: 16, fontWeight: "900" },
  rangeRow: { flexDirection: "row", justifyContent: "space-between" },
  range: { color: colors.mutedText, fontSize: 11, fontWeight: "700" },
  help: { color: colors.mutedText, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  countdown: {
    alignSelf: "flex-start",
    minHeight: 30,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 7,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.background,
  },
  countdownCompact: { minHeight: 26, paddingHorizontal: 7 },
  countdownExpired: { borderColor: "#E7B7AF", backgroundColor: "#FFF2EF" },
  countdownText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  countdownTextExpired: { color: colors.danger },
});
