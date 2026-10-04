import type { AllwainOrderSummary } from "../config/api";

export function resolveSellerIncome(summary: AllwainOrderSummary | null) {
  const income = summary?.incomeSummary;
  const empty = { state: "unavailable" as const, items: [] as { currency: string; amount: number }[] };
  if (summary?.scope !== "seller" || !income || income.version !== 1 || income.basis !== "reconciled_recorded_ledger" || !Array.isArray(income.byCurrency)) return empty;
  const valid = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  if (!valid(income.reviewCount) || income.byCurrency.some(row => !row || typeof row !== "object" || !/^[A-Z]{3}$/.test(row.currency) ||
    !valid(row.pendingAmount) || !valid(row.recoveryAmount) || !valid(row.reviewCount))) return empty;
  if (new Set(income.byCurrency.map(row => row.currency)).size !== income.byCurrency.length ||
    income.byCurrency.reduce((sum, row) => sum + row.reviewCount, 0) !== income.reviewCount) return empty;
  if (income.reviewCount > 0 || income.byCurrency.some(row => row.recoveryAmount > 0)) return { state: "review" as const, items: [] };
  return { state: "ready" as const, items: income.byCurrency.filter(row => row.pendingAmount > 0)
    .map(row => ({ currency: row.currency, amount: row.pendingAmount })) };
}
