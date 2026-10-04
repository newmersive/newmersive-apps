import { createHash } from "node:crypto";

/** Only an authenticated provider confirmation can create this historical proof. */
export function confirmedAllwainPurchaseMetadata(order: any, payment: any, intent: any) {
  if (payment?.provider !== "stripe" || intent?.status !== "succeeded" ||
      typeof intent?.livemode !== "boolean" || typeof intent?.id !== "string" ||
      !intent.id.startsWith("pi_") || (payment.stripePaymentIntentId && payment.stripePaymentIntentId !== intent.id) ||
      !Number.isSafeInteger(payment.amount) || payment.amount <= 0 ||
      payment.amount !== order?.totalAmount || intent.amount_received !== payment.amount ||
      typeof payment.currency !== "string" || !/^[A-Za-z]{3}$/.test(payment.currency) ||
      String(intent.currency).toUpperCase() !== payment.currency.toUpperCase() ||
      String(order.currency).toUpperCase() !== payment.currency.toUpperCase() ||
      payment.orderId !== order.id) return undefined;
  const proof = {version: 1, orderId: order.id, paymentId: payment.id,
    paymentIntentId: intent.id, paymentEnvironment: intent.livemode ? "live" : "test",
    currency: payment.currency.toUpperCase(), amount: payment.amount};
  const metadata = payment.metadata && typeof payment.metadata === "object" && !Array.isArray(payment.metadata) ? payment.metadata : {};
  if (JSON.stringify(metadata.analyticsSettlement) === JSON.stringify(proof)) return undefined;
  // A later callback may enrich a previously paid legacy row, never replace another proof.
  if (metadata.analyticsSettlement) return undefined;
  return {...metadata, analyticsSettlement: proof};
}

/** No ENV fallback: older payments without verified provenance remain unmeasured. */
export function allwainPurchaseAnalyticsReceipt(order: any, payment: any) {
  const proof = payment?.metadata?.analyticsSettlement;
  if (order?.paymentStatus !== "paid" || !order.paidAt || !payment?.paidAt ||
      payment.status !== "paid" || payment.provider !== "stripe" ||
      !["payment", "deferred_charge"].includes(payment.kind) ||
      payment.orderId !== order.id || proof?.version !== 1 || proof.orderId !== order.id ||
      proof.paymentId !== payment.id || proof.paymentIntentId !== payment.stripePaymentIntentId ||
      !["test", "live"].includes(proof.paymentEnvironment) ||
      !Number.isSafeInteger(proof.amount) || proof.amount <= 0 ||
      proof.amount !== payment.amount || proof.amount !== order.totalAmount ||
      !/^[A-Z]{3}$/.test(proof.currency) || proof.currency !== String(order.currency).toUpperCase() ||
      proof.currency !== String(payment.currency).toUpperCase()) return null;
  const transactionHash = createHash("sha256").update(`allwain-purchase-v1:${order.id}`).digest("hex").slice(0, 32);
  return {version: 1 as const, transactionId: `aw_${proof.paymentEnvironment}_${transactionHash}`,
    paymentEnvironment: proof.paymentEnvironment as "test" | "live", currency: proof.currency as string, value: proof.amount / 100};
}
