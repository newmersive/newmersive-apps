import { apiAuthGet } from "./api";

export type AdminDisputeScope = "attention" | "all";
export type AdminDisputeTotals = {
  principalWithdrawn: number; principalReinstated: number; principalOutstanding: number;
  feesCharged: number; feesRefunded: number; feeNet: number; stripeClearingDelta: number;
};
export type AdminDisputeRecord = {
  id: string; orderId: string; paymentId: string | null; stripeDisputeId: string;
  stripeChargeId: string | null; status: string; amount: number; currency: string;
  reason: string | null; evidenceDueAt: string | null; closedAt: string | null;
  createdAt: string; updatedAt: string; archived: boolean;
  accounting: {
    status: string; revision: number; stateHash: string | null; observedAt: string | null;
    retryAfter: string | null; failureCode: string | null; providerStatus: string | null;
    observationMatched: boolean; reviewReasons: string[]; quality: "unobserved" | "incomplete" | "recorded";
    issues: string[]; totals: AdminDisputeTotals | null;
  };
};
export type AdminDisputeMovement = {
  id: string; stripeAccountId: string; stripeBalanceTransactionId: string; stripeMode: string;
  currency: string; amount: number; fee: number; net: number; reportingCategory: string;
  snapshotHash: string; created: number | null; availableOn: number | null;
  availableStatus: "pending" | "available" | null; journalComplete: boolean;
  journal: { id: string; accountCode: string; direction: string; amount: number; currency: string;
    referenceType: string; referenceId: string; occurredAt: string; component: "principal" | "fee" | null }[];
};
export type AdminDisputePage = {
  items: AdminDisputeRecord[]; total: number; nextCursor: string | null;
  scope: AdminDisputeScope; readAt: string;
};
export type AdminDisputeDetail = { record: AdminDisputeRecord; movements: AdminDisputeMovement[]; readAt: string };

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string";
const nullableText = (v: unknown) => v === null || text(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(text);
const date = (v: unknown) => text(v) && Number.isFinite(Date.parse(v));
const nullableDate = (v: unknown) => v === null || date(v);
const money = (v: unknown) => Number.isSafeInteger(v);
const currency = (v: unknown) => text(v) && /^[A-Za-z]{3}$/.test(v);
const safeId = (v: unknown): v is string => text(v) && /^[A-Za-z0-9_-]{1,100}$/.test(v);
const totalKeys: (keyof AdminDisputeTotals)[] = ["principalWithdrawn", "principalReinstated", "principalOutstanding", "feesCharged", "feesRefunded", "feeNet", "stripeClearingDelta"];

function record(v: unknown): v is AdminDisputeRecord {
  if (!object(v) || !safeId(v.id) || !text(v.orderId) || !nullableText(v.paymentId)
    || !text(v.stripeDisputeId) || !nullableText(v.stripeChargeId) || !text(v.status)
    || !money(v.amount) || !currency(v.currency) || !nullableText(v.reason)
    || !nullableDate(v.evidenceDueAt) || !nullableDate(v.closedAt) || !date(v.createdAt)
    || !date(v.updatedAt) || typeof v.archived !== "boolean" || !object(v.accounting)) return false;
  const a = v.accounting;
  return text(a.status) && Number.isSafeInteger(a.revision) && Number(a.revision) >= 0
    && nullableText(a.stateHash) && nullableDate(a.observedAt) && nullableDate(a.retryAfter)
    && nullableText(a.failureCode) && nullableText(a.providerStatus) && typeof a.observationMatched === "boolean"
    && strings(a.reviewReasons) && strings(a.issues) && ["unobserved", "incomplete", "recorded"].includes(String(a.quality))
    && (a.totals === null || (object(a.totals) && totalKeys.every(key => money((a.totals as Record<string, unknown>)[key]))));
}

function movement(v: unknown): v is AdminDisputeMovement {
  if (!object(v) || ![v.id, v.stripeAccountId, v.stripeBalanceTransactionId, v.stripeMode, v.reportingCategory, v.snapshotHash].every(text)
    || !currency(v.currency) || ![v.amount, v.fee, v.net].every(money)
    || ![v.created, v.availableOn].every(n => n === null || (Number.isSafeInteger(n) && Number(n) >= 0))
    || ![null, "pending", "available"].includes(v.availableStatus as null | string)
    || typeof v.journalComplete !== "boolean" || !Array.isArray(v.journal)) return false;
  return v.journal.every(j => object(j) && [j.id, j.accountCode, j.direction, j.referenceType, j.referenceId].every(text)
    && money(j.amount) && currency(j.currency) && date(j.occurredAt) && [null, "principal", "fee"].includes(j.component as null | string));
}

function invalidResponse(): never { throw new Error("La respuesta de disputas no se puede comprobar. Actualiza para volver a consultar."); }

export function parseAdminDisputePage(value: unknown, scope: AdminDisputeScope): AdminDisputePage {
  if (!object(value) || value.scope !== scope || !date(value.readAt) || !Number.isSafeInteger(value.total)
    || Number(value.total) < 0 || !nullableText(value.nextCursor) || !Array.isArray(value.items)
    || !value.items.every(record) || new Set(value.items.map(row => row.id)).size !== value.items.length) return invalidResponse();
  return value as AdminDisputePage;
}

export function parseAdminDisputeDetail(value: unknown, id: string): AdminDisputeDetail {
  if (!object(value) || !record(value.record) || value.record.id !== id || !date(value.readAt)
    || !Array.isArray(value.movements) || !value.movements.every(movement)
    || new Set(value.movements.map(row => row.id)).size !== value.movements.length) return invalidResponse();
  return value as AdminDisputeDetail;
}

// Keep the authenticated transport and its MFA/session handling. These endpoints return Cache-Control: no-store.
export async function fetchAllwainAdminDisputes(scope: AdminDisputeScope, cursor: string | null = null): Promise<AdminDisputePage> {
  if (scope !== "attention" && scope !== "all") return invalidResponse();
  const query = `scope=${scope}&limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
  return parseAdminDisputePage(await apiAuthGet<unknown>(`/admin/allwain/disputes?${query}`), scope);
}

export async function fetchAllwainAdminDispute(id: string): Promise<AdminDisputeDetail> {
  if (!safeId(id)) return invalidResponse();
  return parseAdminDisputeDetail(await apiAuthGet<unknown>(`/admin/allwain/disputes/${encodeURIComponent(id)}`), id);
}
