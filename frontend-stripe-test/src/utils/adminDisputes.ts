import type { AdminDisputeRecord, AdminDisputeTotals } from "../config/adminDisputes";

// Stripe charge/refund units; ISK and UGX deliberately remain 2-decimal. Unknown exponents stay explicit.
// https://docs.stripe.com/currencies — same bounded map as the Next admin console.
const zeroDecimal = new Set("BIF CLP DJF GNF JPY KMF KRW MGA PYG RWF VND VUV XAF XOF XPF".split(" "));
const twoDecimal = new Set(("USD AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BMD BND BOB BRL BSD BWP BYN BZD " +
  "CAD CDF CHF CNY COP CRC CVE CZK DKK DOP DZD EGP ETB EUR FJD FKP GBP GEL GIP GMD GTQ GYD HKD " +
  "HNL HTG HUF IDR ILS INR ISK JMD KES KGS KHR KYD KZT LAK LBP LKR LRD LSL MAD MDL MKD MMK MNT " +
  "MOP MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD PAB PEN PGK PHP PKR PLN QAR RON RSD RUB " +
  "SAR SBD SCR SEK SGD SHP SLE SOS SRD STD SZL THB TJS TOP TRY TTD TWD TZS UAH UGX UYU UZS WST XCD XCG YER ZAR ZMW").split(" "));

export function disputeMoney(amount: number | null | undefined, currency: string): string {
  if (!Number.isSafeInteger(amount) || !/^[a-z]{3}$/i.test(currency)) return "Sin comprobar";
  const code = currency.toUpperCase();
  const exponent = zeroDecimal.has(code) ? 0 : twoDecimal.has(code) ? 2 : null;
  if (exponent === null) return `${new Intl.NumberFormat("es-ES").format(amount!)} unidades Stripe (${code})`;
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: code,
    minimumFractionDigits: exponent, maximumFractionDigits: exponent }).format(amount! / 10 ** exponent);
}

export function disputeDate(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "Sin comprobar";
  const parsed = new Date(typeof value === "number" ? value * 1000 : value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString("es-ES") : "Sin comprobar";
}

const providerLabels: Record<string, string> = {
  needs_response: "Requiere respuesta", under_review: "En revisión", won: "Ganada", lost: "Perdida",
  warning_needs_response: "Consulta pendiente de respuesta", warning_under_review: "Consulta en revisión",
  warning_closed: "Consulta cerrada", charge_refunded: "Cargo reembolsado", prevented: "Prevenida",
};
const accountingLabels: Record<string, string> = {
  unobserved: "Sin comprobar", observation_pending: "Observación pendiente", reconciliation_required: "Requiere conciliación",
  loss_allocation_review: "Pérdida pendiente de asignación", funds_withdrawn: "Retirada registrada",
  movements_reconciled: "Movimientos conciliados", no_balance_movement: "Sin movimiento observado",
};
export const disputeProviderLabel = (status: string | null) => status ? (providerLabels[status] || "Estado del proveedor por revisar") : "Sin comprobar";
export const disputeAccountingLabel = (status: string) => accountingLabels[status] || "Estado contable por revisar";

const issueLabels: Record<string, string> = {
  accounting_unobserved: "La contabilidad todavía no se ha comprobado.",
  accounting_observation_missing_or_invalid: "Falta una observación válida que respalde el estado contable.",
  provider_status_observation_stale: "El estado del proveedor observado no coincide con el registro actual.",
  accounting_observation_pending: "Hay una observación pendiente de completar.",
  accounting_observation_timestamp_missing: "Falta la fecha de la observación contable.",
  accounting_observation_failed: "La última observación no pudo completarse.",
  balance_movements_missing: "Faltan movimientos para comprobar los importes.",
  local_payment_context_incomplete: "Los datos locales del pago están incompletos.",
  balance_movement_history_invalid: "El historial de movimientos necesita revisión.",
  balance_movement_invalid: "Un movimiento no supera la comprobación de integridad.",
  balance_journal_incomplete: "Faltan asientos válidos para completar el diario.",
  balance_journal_unlinked: "Hay asientos pendientes de vincular con su movimiento.",
  disputed_principal_exceeds_charge: "El principal disputado supera el importe del cobro.",
  withdrawal_evidence_missing: "Falta evidencia de la retirada del principal.",
  withdrawn_principal_differs_from_dispute: "El principal retirado no coincide con el importe disputado.",
  won_principal_not_fully_reinstated: "La disputa está ganada, pero el principal no se ha restituido por completo.",
  lost_principal_receivable_unresolved: "El principal de la disputa perdida sigue pendiente de asignación.",
  reinstatement_exceeds_withdrawal: "El principal restituido supera el principal retirado.",
  stripe_balance_pending: "Hay movimientos pendientes de disponibilidad en Stripe.",
  loss_allocation_review: "La pérdida sigue pendiente de asignación.",
  beneficiary_dispute_distribution_review: "El reparto necesita revisión específica.",
  dispute_amount_exceeds_charge: "El importe disputado requiere revisar su relación con el cobro.",
};
export const disputeIssueLabel = (issue: string) => issueLabels[issue] || `Referencia de revisión: ${issue}`;

export function disputeEvidence(record: AdminDisputeRecord) {
  const a = record.accounting;
  return {
    label: a.quality === "recorded" ? "Movimientos y asientos registrados" : a.quality === "incomplete" ? "Revisión pendiente; evidencia incompleta" : "Sin comprobar",
    warning: a.quality === "incomplete" && a.totals !== null
      ? "Se muestran importes de movimientos anteriores válidos. La última observación está incompleta y puede haber cambios posteriores."
      : a.totals === null ? "No hay evidencia suficiente para comprobar los importes." : null,
    totals: a.quality === "unobserved" ? null : a.totals,
    issues: [...new Set([...a.issues, ...a.reviewReasons])].map(disputeIssueLabel),
  };
}

export const disputeTotalLabels: [keyof AdminDisputeTotals, string][] = [
  ["principalWithdrawn", "Principal retirado"], ["principalReinstated", "Principal restituido"],
  ["principalOutstanding", "Principal pendiente"], ["feesCharged", "Comisiones cobradas"],
  ["feesRefunded", "Comisiones devueltas"], ["feeNet", "Comisiones netas"], ["stripeClearingDelta", "Variación Stripe registrada"],
];

// Each list request also invalidates detail. Epochs never reset, including after blur/MFA/session changes.
export function createDisputeRequestGuard(isAuthorized: () => boolean = () => true) {
  let list = 0;
  let detail = 0;
  return {
    beginList() { detail += 1; return ++list; },
    beginDetail() { return ++detail; },
    invalidateDetail() { detail += 1; },
    invalidate() { list += 1; detail += 1; },
    listCurrent(ticket: number) { return isAuthorized() && list === ticket; },
    detailCurrent(ticket: number) { return isAuthorized() && detail === ticket; },
  };
}
