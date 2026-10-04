import React from "react";
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
  useWindowDimensions,
} from "react-native";
import { ChevronRight, MessageCircle, Minus, Plus } from "lucide-react-native";

import { colors } from "../../theme/colors";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { interaction, radii, spacing } from "./foundations";

type Tone = "neutral" | "brand" | "success" | "warning" | "dark";

const toneStyles: Record<Tone, { background: string; foreground: string; border: string }> = {
  neutral: { background: "#F0F0EE", foreground: colors.text, border: colors.cardBorder },
  brand: { background: colors.highlight, foreground: "#A33722", border: "#FFC8BA" },
  success: { background: "#E8F4EC", foreground: "#24663A", border: "#C9E4D1" },
  warning: { background: "#FFF4DB", foreground: "#7A5612", border: "#F1D79E" },
  dark: { background: colors.seller, foreground: colors.buttonText, border: colors.seller },
};

export function StatusChip({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const { t } = useAppTranslation();
  const palette = toneStyles[tone];
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: palette.background, borderColor: palette.border },
      ]}
      accessibilityLabel={t("card.status", { label })}
    >
      <Text style={[styles.chipText, { color: palette.foreground }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

export function BigActionButton({
  label,
  onPress,
  icon,
  tone = "brand",
  disabled = false,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  icon?: React.ReactNode;
  tone?: "brand" | "dark" | "light";
  disabled?: boolean;
  busy?: boolean;
}) {
  const backgroundColor = tone === "dark" ? colors.brandDark : tone === "light" ? colors.glass : interaction.brandAction;
  const foreground = tone === "brand" ? colors.actionInk : tone === "light" ? colors.text : colors.buttonText;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      aria-disabled={disabled || busy}
      aria-busy={busy}
      activeOpacity={0.86}
      disabled={disabled || busy}
      onPress={onPress}
      style={[
        styles.bigButton,
        { backgroundColor, borderColor: tone === "light" ? colors.cardBorder : backgroundColor },
        disabled && styles.disabled,
        busy && styles.busy,
      ]}
    >
      {busy ? <ActivityIndicator color={foreground} /> : icon}
      <Text style={[styles.bigButtonText, { color: foreground }]} numberOfLines={2}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function ActionCard({
  title,
  subtitle,
  icon,
  onPress,
  accent = colors.primary,
  disabled = false,
  busy = false,
  variant = "default",
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  onPress: () => void;
  accent?: string;
  disabled?: boolean;
  busy?: boolean;
  variant?: "default" | "compact";
}) {
  const { width } = useWindowDimensions();
  const compact = variant === "compact";
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      accessibilityState={{ disabled: disabled || busy, busy }}
      aria-disabled={disabled || busy}
      aria-busy={busy}
      disabled={disabled || busy}
      activeOpacity={0.86}
      onPress={onPress}
      style={[styles.actionCard, width < 360 && styles.actionCardCompact, compact && styles.compactActionCard, disabled && styles.disabled, busy && styles.busy]}
    >
      <View style={[styles.actionIcon, { borderColor: accent }, compact && styles.compactActionIcon]}>{busy ? <ActivityIndicator color={interaction.brandText} /> : icon}</View>
      {compact ? (
        <View style={styles.compactActionCopy}>
          <Text style={styles.compactActionTitle} numberOfLines={2}>{title}</Text>
          {subtitle ? <Text style={styles.actionSubtitle} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
      ) : (
        <>
          <Text style={styles.actionTitle} numberOfLines={2}>{title}</Text>
          {subtitle ? <Text style={styles.actionSubtitle} numberOfLines={2}>{subtitle}</Text> : null}
        </>
      )}
    </TouchableOpacity>
  );
}

type ObjectCardProps = {
  title: string;
  meta?: string;
  detail?: string;
  status?: string;
  statusTone?: Tone;
  actionLabel?: string;
  onPress?: () => void;
  contactLabel?: string;
  onContact?: () => void;
  leading?: React.ReactNode;
  leadingVariant?: "icon" | "image";
  style?: StyleProp<ViewStyle>;
};

export type DemoCardProps = Omit<
  ObjectCardProps,
  "status" | "statusTone" | "style"
> & {
  status?: string;
  style?: StyleProp<ViewStyle>;
};

function ObjectCard({
  title,
  meta,
  detail,
  status,
  statusTone,
  actionLabel,
  onPress,
  contactLabel,
  onContact,
  leading,
  leadingVariant = "icon",
  style,
}: ObjectCardProps) {
  const { t } = useAppTranslation();
  const resolvedContactLabel = contactLabel || t("card.privateMessage");
  const content = (
    <>
      <View style={styles.objectTop}>
        {leading ? (
          <View
            style={[
              styles.objectLeading,
              leadingVariant === "image" && styles.objectImageLeading,
            ]}
          >
            {leading}
          </View>
        ) : null}
        <View style={styles.objectCopy}>
          <Text style={styles.objectTitle} numberOfLines={2}>{title}</Text>
          {meta ? <Text style={styles.objectMeta} numberOfLines={2}>{meta}</Text> : null}
        </View>
        {status ? <StatusChip label={status} tone={statusTone} /> : null}
      </View>
      {detail ? <Text style={styles.objectDetail} numberOfLines={3}>{detail}</Text> : null}
      {actionLabel ? (
        <View style={styles.objectAction}>
          <Text style={styles.objectActionText}>{actionLabel}</Text>
          <ChevronRight size={18} color={interaction.brandText} strokeWidth={2.5} />
        </View>
      ) : null}
    </>
  );

  if (onContact) {
    return (
      <View style={[styles.objectCard, style]}>
        {onPress ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`${title}${actionLabel ? `. ${actionLabel}` : ""}`}
            activeOpacity={0.86}
            onPress={onPress}
            style={styles.objectMainAction}
          >
            {content}
          </TouchableOpacity>
        ) : (
          <View style={styles.objectMainAction}>{content}</View>
        )}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`${resolvedContactLabel}: ${title}`}
          activeOpacity={0.82}
          onPress={onContact}
          style={styles.objectContactAction}
        >
          <MessageCircle size={18} color={interaction.brandText} strokeWidth={2.5} />
          <Text style={styles.objectContactText}>{resolvedContactLabel}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (onPress) {
    return (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`${title}${actionLabel ? `. ${actionLabel}` : ""}`}
        activeOpacity={0.86}
        onPress={onPress}
        style={[styles.objectCard, style]}
      >
        {content}
      </TouchableOpacity>
    );
  }
  return <View style={[styles.objectCard, style]}>{content}</View>;
}

export function OrderCard(props: ObjectCardProps) { return <ObjectCard {...props} />; }
export function ProductCard(props: ObjectCardProps) { return <ObjectCard {...props} />; }
export function OfferCard(props: ObjectCardProps) { return <ObjectCard {...props} />; }
export function DeliveryCard(props: ObjectCardProps) { return <ObjectCard {...props} />; }
export function PersonCard(props: ObjectCardProps) { return <ObjectCard {...props} />; }

export function DemoCard({
  status,
  style,
  ...props
}: DemoCardProps) {
  const { t } = useAppTranslation();
  return (
    <ObjectCard
      {...props}
      status={status || t("card.demo")}
      statusTone="brand"
      style={[styles.demoCard, style]}
    />
  );
}

export function NotificationBadge({ count }: { count: number }) {
  const { t } = useAppTranslation();
  if (count <= 0) return null;
  return (
    <View style={styles.notificationBadge} accessibilityLabel={t("card.unread", { count })}>
      <Text style={styles.notificationBadgeText}>{count > 99 ? "99+" : count}</Text>
    </View>
  );
}

export function ConversationCard({
  name,
  title,
  lastMessage,
  time,
  unreadCount,
  status,
  statusTone = "neutral",
  onPress,
}: {
  name: string;
  title?: string;
  lastMessage?: string;
  time?: string;
  unreadCount: number;
  status?: string;
  statusTone?: Tone;
  onPress: () => void;
}) {
  const { t } = useAppTranslation();
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${name}. ${unreadCount ? `${t("card.unread", { count: unreadCount })}.` : ""} ${t("card.openConversation")}`}
      activeOpacity={0.86}
      onPress={onPress}
      style={[styles.conversationCard, unreadCount > 0 && styles.conversationUnread]}
    >
      <View style={styles.conversationAvatar}>
        <Text style={styles.conversationInitials}>{initials || "A"}</Text>
      </View>
      <View style={styles.conversationCopy}>
        <View style={styles.conversationTop}>
          <Text style={styles.conversationName} numberOfLines={1}>{name}</Text>
          {time ? <Text style={styles.conversationTime}>{time}</Text> : null}
        </View>
        {title ? <Text style={styles.conversationTitle} numberOfLines={1}>{title}</Text> : null}
        <Text
          style={[styles.conversationMessage, unreadCount > 0 && styles.conversationMessageUnread]}
          numberOfLines={2}
        >
          {lastMessage || t("card.noMessages")}
        </Text>
        {status ? <StatusChip label={status} tone={statusTone} /> : null}
      </View>
      <View style={styles.conversationAside}>
        <NotificationBadge count={unreadCount} />
        <ChevronRight size={18} color={colors.mutedText} />
      </View>
    </TouchableOpacity>
  );
}

export function SimpleStepper({
  value,
  onChange,
  min = 1,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  unit,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  const { t } = useAppTranslation();
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  return (
    <View style={styles.stepper}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={t("card.subtract", { step, unit: unit ? ` ${unit}` : "" })}
        accessibilityState={{ disabled: value <= min }}
        aria-disabled={value <= min}
        disabled={value <= min}
        onPress={() => onChange(clamp(value - step))}
        style={[styles.stepButton, value <= min && styles.disabled]}
      >
        <Minus size={20} color={colors.text} />
      </TouchableOpacity>
      <View style={styles.stepValueFrame}>
        <TextInput
          accessibilityLabel={t("card.quantity", { unit: unit ? ` (${unit})` : "" })}
          keyboardType="numeric"
          value={String(value)}
          onChangeText={(text) => {
            const parsed = Number(text.replace(",", "."));
            if (Number.isFinite(parsed)) onChange(clamp(parsed));
          }}
          style={styles.stepValue}
          selectTextOnFocus
        />
        {unit ? <Text style={styles.stepUnit} numberOfLines={1}>{unit}</Text> : null}
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={t("card.add", { step, unit: unit ? ` ${unit}` : "" })}
        accessibilityState={{ disabled: value >= max }}
        aria-disabled={value >= max}
        disabled={value >= max}
        onPress={() => onChange(clamp(value + step))}
        style={[styles.stepButton, value >= max && styles.disabled]}
      >
        <Plus size={20} color={colors.text} />
      </TouchableOpacity>
    </View>
  );
}

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
  icon,
  demo,
}: {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
  demo?: DemoCardProps;
}) {
  return (
    <View style={[styles.emptyState, demo && styles.emptyStateWithDemo]}>
      {icon ? <View style={styles.emptyIcon}>{icon}</View> : null}
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={actionLabel} onPress={onAction} style={styles.emptyAction}>
          <Text style={styles.emptyActionText}>{actionLabel}</Text>
          <ChevronRight size={18} color={interaction.brandText} />
        </TouchableOpacity>
      ) : null}
      {demo ? <DemoCard {...demo} /> : null}
    </View>
  );
}

export function TodaySummary({
  title,
  items,
  actionLabel,
  onAction,
}: {
  title?: string;
  items: { key: string; value: string; label: string; icon?: React.ReactNode }[];
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { t } = useAppTranslation();
  return (
    <View style={styles.summary}>
      <Text style={styles.summaryTitle}>{(title || t("card.today")).toUpperCase()}</Text>
      <View style={styles.summaryItems}>
        {items.map((item) => (
          <View key={item.key} style={styles.summaryItem}>
            <View style={styles.summaryIcon}>{item.icon}</View>
            <Text style={styles.summaryValue}>{item.value}</Text>
            <Text style={styles.summaryLabel}>{item.label}</Text>
          </View>
        ))}
      </View>
      {actionLabel && onAction ? (
        <BigActionButton label={actionLabel} onPress={onAction} tone="dark" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    maxWidth: 118,
    borderRadius: radii.control,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  chipText: { fontSize: 11, lineHeight: 15, fontWeight: "800", textAlign: "center" },
  bigButton: {
    minHeight: 54,
    borderRadius: radii.card,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: colors.brandDark,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 3,
  },
  bigButtonText: { flexShrink: 1, fontSize: 15, lineHeight: 21, fontWeight: "900", textAlign: "center" },
  disabled: { opacity: 0.48 },
  busy: { opacity: 0.85 },
  actionCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 126,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.glass,
    padding: 14,
    alignItems: "flex-start",
    shadowColor: colors.brandDark,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  actionIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.card,
    borderWidth: 1.5,
    backgroundColor: colors.highlight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  actionCardCompact: { paddingHorizontal: 6 },
  compactActionCard: {
    flexBasis: 148,
    minWidth: 148,
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: colors.card,
    shadowOpacity: 0,
    elevation: 0,
  },
  compactActionIcon: { width: 30, height: 30, borderRadius: 10, borderWidth: 1, marginBottom: 0, flexShrink: 0 },
  compactActionCopy: { flex: 1, minWidth: 0 },
  compactActionTitle: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "800" },
  actionTitle: { color: colors.text, fontWeight: "900", fontSize: 14 },
  actionSubtitle: { color: colors.mutedText, fontWeight: "600", fontSize: 11, lineHeight: 15, marginTop: 3 },
  objectCard: {
    width: "100%",
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.glass,
    padding: 14,
    gap: 9,
    shadowColor: colors.brandDark,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.07,
    shadowRadius: 13,
    elevation: 2,
  },
  objectMainAction: { gap: 9 },
  demoCard: {
    marginTop: 8,
    backgroundColor: "#FFF8F5",
    borderStyle: "solid",
    borderColor: "#FFC8BA",
  },
  objectTop: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 10 },
  objectLeading: {
    width: 40,
    height: 40,
    borderRadius: radii.card,
    backgroundColor: colors.highlight,
    alignItems: "center",
    justifyContent: "center",
  },
  objectImageLeading: {
    width: 84,
    height: 68,
    overflow: "hidden",
    backgroundColor: "#ECECE8",
  },
  objectCopy: { flex: 1, minWidth: 120, gap: 3 },
  objectTitle: { color: colors.text, fontWeight: "900", fontSize: 17, lineHeight: 22 },
  objectMeta: { color: colors.text, fontWeight: "700", fontSize: 13, lineHeight: 18 },
  objectDetail: { color: colors.mutedText, fontWeight: "600", fontSize: 13, lineHeight: 18 },
  objectAction: {
    minHeight: 34,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  objectActionText: { color: interaction.brandText, fontWeight: "900", fontSize: 13, flexShrink: 1 },
  objectContactAction: {
    minHeight: interaction.targetSize,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  objectContactText: { color: interaction.brandText, fontWeight: "900", fontSize: 13, flexShrink: 1 },
  notificationBadge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: "center", justifyContent: "center", backgroundColor: interaction.brandAction },
  notificationBadgeText: { color: colors.buttonText, fontSize: 10, fontWeight: "900" },
  conversationCard: { width: "100%", minHeight: 96, flexDirection: "row", alignItems: "flex-start", gap: 11, borderRadius: radii.card, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.glass, padding: 13 },
  conversationUnread: { borderColor: colors.primary, backgroundColor: "#FFF8F5" },
  conversationAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: colors.highlight, borderWidth: 1, borderColor: "#FFC8BA" },
  conversationInitials: { color: interaction.brandText, fontSize: 15, fontWeight: "900" },
  conversationCopy: { flex: 1, minWidth: 0, gap: 3 },
  conversationTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  conversationName: { flex: 1, color: colors.text, fontSize: 15, fontWeight: "900" },
  conversationTime: { color: colors.mutedText, fontSize: 10, fontWeight: "700" },
  conversationTitle: { color: interaction.brandText, fontSize: 12, fontWeight: "800" },
  conversationMessage: { color: colors.mutedText, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  conversationMessageUnread: { color: colors.text, fontWeight: "800" },
  conversationAside: { minWidth: 25, minHeight: 66, alignItems: "center", justifyContent: "space-between", gap: 8 },
  stepper: {
    width: "100%",
    maxWidth: 280,
    height: 52,
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    overflow: "hidden",
    backgroundColor: colors.glass,
  },
  stepButton: { width: 52, alignItems: "center", justifyContent: "center" },
  stepValueFrame: {
    flex: 1,
    minWidth: 0,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.cardBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  stepValue: { width: 52, color: colors.text, fontSize: 17, fontWeight: "900", textAlign: "right", padding: 0 },
  stepUnit: { flexShrink: 1, color: colors.mutedText, fontSize: 12, fontWeight: "700", marginLeft: 5, maxWidth: 82 },
  emptyState: {
    width: "100%",
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderStyle: "dashed",
    borderRadius: radii.card,
    backgroundColor: colors.glass,
    padding: spacing.md,
    alignItems: "flex-start",
    gap: 6,
  },
  emptyStateWithDemo: {
    borderWidth: 0,
    backgroundColor: "transparent",
    padding: 0,
  },
  emptyIcon: { marginBottom: 2 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
  emptyBody: { color: colors.mutedText, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  emptyAction: { minHeight: interaction.targetSize, flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  emptyActionText: { color: interaction.brandText, fontWeight: "900", fontSize: 13, flexShrink: 1 },
  summary: {
    width: "100%",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    padding: 18,
    gap: 15,
    borderTopWidth: 4,
    borderTopColor: colors.primary,
    shadowColor: colors.brandDark,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.07,
    shadowRadius: 13,
    elevation: 2,
  },
  summaryTitle: { color: colors.mutedText, fontSize: 11, fontWeight: "900" },
  summaryItems: { flexDirection: "row", gap: 8 },
  summaryItem: { flex: 1, minWidth: 0, alignItems: "flex-start", gap: 3 },
  summaryIcon: { height: 22, justifyContent: "center" },
  summaryValue: { color: colors.text, fontSize: 23, lineHeight: 27, fontWeight: "900" },
  summaryLabel: { color: colors.mutedText, fontSize: 11, lineHeight: 15, fontWeight: "700" },
});
