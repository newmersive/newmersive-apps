export type AllwainReconciliationObject =
  | "payment"
  | "refund"
  | "transfer"
  | "dispute"
  | "payout";

export interface AllwainReconciliationDifference {
  object: AllwainReconciliationObject;
  localId: string;
  providerId: string | null;
  field: string;
  localValue: unknown;
  providerValue: unknown;
  severity: "warning" | "critical";
}

function normalizedCurrency(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function providerId(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    return String((value as { id?: unknown }).id || "") || null;
  }
  return null;
}

function difference(
  object: AllwainReconciliationObject,
  localId: string,
  providerObjectId: string | null,
  field: string,
  localValue: unknown,
  providerValue: unknown,
  severity: "warning" | "critical" = "critical",
): AllwainReconciliationDifference {
  return {
    object,
    localId,
    providerId: providerObjectId,
    field,
    localValue,
    providerValue,
    severity,
  };
}

function compareNumber(
  output: AllwainReconciliationDifference[],
  object: AllwainReconciliationObject,
  localId: string,
  remoteId: string | null,
  field: string,
  localValue: unknown,
  remoteValue: unknown,
) {
  if (Number(localValue) !== Number(remoteValue)) {
    output.push(
      difference(object, localId, remoteId, field, localValue, remoteValue),
    );
  }
}

function compareCurrency(
  output: AllwainReconciliationDifference[],
  object: AllwainReconciliationObject,
  localId: string,
  remoteId: string | null,
  localValue: unknown,
  remoteValue: unknown,
) {
  if (normalizedCurrency(localValue) !== normalizedCurrency(remoteValue)) {
    output.push(
      difference(
        object,
        localId,
        remoteId,
        "currency",
        localValue,
        remoteValue,
      ),
    );
  }
}

const LOCALLY_PAID_STATUSES = new Set([
  "paid",
  "refund_pending",
  "partially_refunded",
  "refunded",
  "disputed",
  "dispute_lost",
]);

export function compareAllwainPaymentWithStripe(local: any, intent: any) {
  const output: AllwainReconciliationDifference[] = [];
  const remoteId = String(intent?.id || local?.stripePaymentIntentId || "") || null;
  const charge =
    intent?.latest_charge && typeof intent.latest_charge === "object"
      ? intent.latest_charge
      : null;
  const balanceTransaction =
    charge?.balance_transaction &&
    typeof charge.balance_transaction === "object"
      ? charge.balance_transaction
      : null;

  compareNumber(
    output,
    "payment",
    local.id,
    remoteId,
    "amount",
    local.amount,
    intent?.amount,
  );
  compareCurrency(
    output,
    "payment",
    local.id,
    remoteId,
    local.currency,
    intent?.currency,
  );

  const locallyPaid = Boolean(local.paidAt) || LOCALLY_PAID_STATUSES.has(local.status);
  if (locallyPaid && intent?.status !== "succeeded") {
    output.push(
      difference(
        "payment",
        local.id,
        remoteId,
        "status",
        local.status,
        intent?.status,
      ),
    );
  } else if (!locallyPaid && intent?.status === "succeeded") {
    output.push(
      difference(
        "payment",
        local.id,
        remoteId,
        "status",
        local.status,
        intent.status,
      ),
    );
  }

  if (charge) {
    const remoteChargeId = providerId(charge);
    if ((local.stripeChargeId || null) !== remoteChargeId) {
      output.push(
        difference(
          "payment",
          local.id,
          remoteId,
          "stripeChargeId",
          local.stripeChargeId || null,
          remoteChargeId,
        ),
      );
    }
    compareNumber(
      output,
      "payment",
      local.id,
      remoteId,
      "refundedAmount",
      local.refundedAmount || 0,
      charge.amount_refunded || 0,
    );
  }

  if (balanceTransaction) {
    if (local.processorFeeAmount === null || local.processorFeeAmount === undefined) {
      output.push(
        difference(
          "payment",
          local.id,
          remoteId,
          "processorFeeAmount",
          local.processorFeeAmount ?? null,
          balanceTransaction.fee,
        ),
      );
    } else {
      compareNumber(
        output,
        "payment",
        local.id,
        remoteId,
        "processorFeeAmount",
        local.processorFeeAmount,
        balanceTransaction.fee,
      );
    }
    if (local.processorNetAmount === null || local.processorNetAmount === undefined) {
      output.push(
        difference(
          "payment",
          local.id,
          remoteId,
          "processorNetAmount",
          local.processorNetAmount ?? null,
          balanceTransaction.net,
        ),
      );
    } else {
      compareNumber(
        output,
        "payment",
        local.id,
        remoteId,
        "processorNetAmount",
        local.processorNetAmount,
        balanceTransaction.net,
      );
    }
  }
  if (
    intent?.metadata?.orderId &&
    String(intent.metadata.orderId) !== String(local.orderId)
  ) {
    output.push(
      difference(
        "payment",
        local.id,
        remoteId,
        "orderId",
        local.orderId,
        intent.metadata.orderId,
      ),
    );
  }
  return output;
}

export function compareAllwainTransferWithStripe(local: any, remote: any) {
  const output: AllwainReconciliationDifference[] = [];
  const remoteId = String(remote?.id || local?.stripeTransferId || "") || null;
  compareNumber(
    output,
    "transfer",
    local.id,
    remoteId,
    "amount",
    local.amount,
    remote?.amount,
  );
  compareNumber(
    output,
    "transfer",
    local.id,
    remoteId,
    "reversedAmount",
    local.reversedAmount || 0,
    remote?.amount_reversed || 0,
  );
  compareCurrency(
    output,
    "transfer",
    local.id,
    remoteId,
    local.currency,
    remote?.currency,
  );
  const remoteDestination = providerId(remote?.destination);
  if ((local.stripeAccountId || null) !== remoteDestination) {
    output.push(
      difference(
        "transfer",
        local.id,
        remoteId,
        "destination",
        local.stripeAccountId || null,
        remoteDestination,
      ),
    );
  }
  return output;
}

export function compareAllwainRefundWithStripe(local: any, remote: any) {
  const output: AllwainReconciliationDifference[] = [];
  const remoteId = String(remote?.id || local?.stripeRefundId || "") || null;
  compareNumber(
    output,
    "refund",
    local.id,
    remoteId,
    "amount",
    local.amount,
    remote?.amount,
  );
  compareCurrency(
    output,
    "refund",
    local.id,
    remoteId,
    local.currency,
    remote?.currency,
  );
  if (String(local.status) !== String(remote?.status)) {
    output.push(
      difference(
        "refund",
        local.id,
        remoteId,
        "status",
        local.status,
        remote?.status,
        "warning",
      ),
    );
  }
  return output;
}

export function compareAllwainDisputeWithStripe(local: any, remote: any) {
  const output: AllwainReconciliationDifference[] = [];
  const remoteId = String(remote?.id || local?.stripeDisputeId || "") || null;
  compareNumber(
    output,
    "dispute",
    local.id,
    remoteId,
    "amount",
    local.amount,
    remote?.amount,
  );
  compareCurrency(
    output,
    "dispute",
    local.id,
    remoteId,
    local.currency,
    remote?.currency,
  );
  if (String(local.status) !== String(remote?.status)) {
    output.push(
      difference(
        "dispute",
        local.id,
        remoteId,
        "status",
        local.status,
        remote?.status,
      ),
    );
  }
  return output;
}

export function compareAllwainPayoutWithStripe(local: any, remote: any) {
  const output: AllwainReconciliationDifference[] = [];
  const remoteId = String(remote?.id || local?.stripePayoutId || "") || null;
  compareNumber(
    output,
    "payout",
    local.id,
    remoteId,
    "amount",
    local.amount,
    remote?.amount,
  );
  compareCurrency(
    output,
    "payout",
    local.id,
    remoteId,
    local.currency,
    remote?.currency,
  );
  if (String(local.status) !== String(remote?.status)) {
    output.push(
      difference(
        "payout",
        local.id,
        remoteId,
        "status",
        local.status,
        remote?.status,
        "warning",
      ),
    );
  }
  return output;
}

export function missingAllwainProviderObject(
  object: AllwainReconciliationObject,
  localId: string,
  providerObjectId: string | null,
  errorCode?: string | null,
) {
  return difference(
    object,
    localId,
    providerObjectId,
    "providerObject",
    "present_locally",
    errorCode || "unavailable",
    "critical",
  );
}

export function untrackedAllwainProviderObject(
  object: AllwainReconciliationObject,
  providerObjectId: string,
  providerValue: Record<string, unknown> = {},
) {
  return difference(
    object,
    `missing-local:${providerObjectId}`,
    providerObjectId,
    "localObject",
    "missing",
    { presentInProvider: true, ...providerValue },
    "critical",
  );
}
