import { ENV } from "../config/env";

const DAY_MS = 24 * 60 * 60 * 1_000;

export type AllwainPreorderReminderStage = "30_days" | "7_days" | "1_day";

const REMINDER_STAGE_RANK: Record<AllwainPreorderReminderStage, number> = {
  "30_days": 1,
  "7_days": 2,
  "1_day": 3,
};

function configuredMaximumDays() {
  const value = Math.floor(Number(ENV.ALLWAIN_PREORDER_MAX_DAYS));
  return Number.isFinite(value) && value > 0 ? value : 180;
}

export function normalizeAllwainPreorderChargeDeadline(
  value: unknown,
  now = new Date(),
) {
  const raw = typeof value === "string" ? value.trim() : value;
  if (!raw) throw new Error("PREORDER_CHARGE_DEADLINE_REQUIRED");
  const dateOnly =
    typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? `${raw}T23:59:59.999Z`
      : raw;
  const deadline = new Date(dateOnly as string | number | Date);
  if (!Number.isFinite(deadline.getTime())) {
    throw new Error("INVALID_PREORDER_CHARGE_DEADLINE");
  }
  if (deadline.getTime() <= now.getTime()) {
    throw new Error("PREORDER_CHARGE_DEADLINE_PASSED");
  }
  if (deadline.getTime() - now.getTime() > configuredMaximumDays() * DAY_MS) {
    throw new Error("PREORDER_CHARGE_DEADLINE_TOO_FAR");
  }
  return deadline;
}

export function allwainPreorderMaximumDays() {
  return configuredMaximumDays();
}

export function allwainPreorderReminderStage(
  deadline: Date | string | null | undefined,
  now = new Date(),
): AllwainPreorderReminderStage | null {
  if (!deadline) return null;
  const instant = deadline instanceof Date ? deadline : new Date(deadline);
  const remaining = instant.getTime() - now.getTime();
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  if (remaining <= DAY_MS) return "1_day";
  if (remaining <= 7 * DAY_MS) return "7_days";
  if (remaining <= 30 * DAY_MS) return "30_days";
  return null;
}

export function shouldAdvanceAllwainPreorderReminder(
  current: string | null | undefined,
  next: AllwainPreorderReminderStage,
) {
  const currentRank = current
    ? REMINDER_STAGE_RANK[current as AllwainPreorderReminderStage] || 0
    : 0;
  return REMINDER_STAGE_RANK[next] > currentRank;
}

export function isAllwainSavedPreorderPastDeadline(
  order: {
    paymentMode?: string | null;
    paymentStatus?: string | null;
    preorderChargeDeadlineAt?: Date | string | null;
  },
  now = new Date(),
) {
  if (
    order.paymentMode !== "preorder" ||
    order.paymentStatus !== "payment_method_saved" ||
    !order.preorderChargeDeadlineAt
  ) {
    return false;
  }
  const deadline =
    order.preorderChargeDeadlineAt instanceof Date
      ? order.preorderChargeDeadlineAt
      : new Date(order.preorderChargeDeadlineAt);
  return (
    Number.isFinite(deadline.getTime()) && deadline.getTime() <= now.getTime()
  );
}
