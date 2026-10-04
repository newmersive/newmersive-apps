import { ENV, allwainPublicationCardRequired } from "../config/env";
import { createHash } from "node:crypto";
import { getPrisma } from "../db/prisma";
import { appendAllwainAuditEvent } from "./allwain-audit";
import { getAllwainParticipationSnapshot } from "./allwain-participation.service";
import {
  confirmAllwainScanRequest,
  createAllwainOffer,
  createAllwainScanRequest,
  launchAllwainScanRequest,
  requireAllwainBuyerPaymentMethod,
  updateAllwainScanRequest,
} from "./allwain.service";
import {
  type AllwainGuideAction,
  type AllwainGuideOfferFields,
  type AllwainGuideRequestFields,
  normalizeAllwainGuideAction,
} from "./ai/allwain-guide.ai.service";

export class AllwainGuideActionError extends Error {
  constructor(
    message: string,
    readonly fields: string[] = [],
  ) {
    super(message);
  }
}

type GuideActionCacheEntry = {
  actionHash: string;
  result: AllwainGuideExecutionResult;
};

const inFlightActions = new Map<
  string,
  { actionHash: string; promise: Promise<AllwainGuideExecutionResult> }
>();
const completedMemoryActions = new Map<string, GuideActionCacheEntry>();

export type AllwainGuideExecutionResult = {
  type: "offer" | "request";
  id: string;
  title: string;
  status: string;
  idempotent?: boolean;
};

function cleanIdempotencyKey(value: unknown) {
  const clean = typeof value === "string" ? value.trim() : "";
  if (!/^[a-zA-Z0-9:_-]{12,160}$/.test(clean)) {
    throw new AllwainGuideActionError("INVALID_IDEMPOTENCY_KEY");
  }
  return clean;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function guideActionHash(action: unknown) {
  return createHash("sha256").update(canonicalJson(action)).digest("hex");
}

async function completedAction(
  userId: string,
  idempotencyKey: string,
  actionHash: string,
): Promise<AllwainGuideExecutionResult | null> {
  if (ENV.STORAGE_DRIVER !== "postgres") return null;
  const event = await (getPrisma() as any).allwainAuditEvent.findFirst({
    where: {
      eventType: "ai_guide.action_executed",
      actorUserId: userId,
      providerEventId: idempotencyKey,
    },
    orderBy: { occurredAt: "desc" },
  });
  if (event?.payload?.actionHash && event.payload.actionHash !== actionHash) {
    throw new AllwainGuideActionError("IDEMPOTENCY_KEY_REUSED");
  }
  const result = event?.payload?.result;
  if (!result?.id || !result?.type) return null;
  return {
    type: result.type,
    id: result.id,
    title: result.title || "Acción publicada",
    status: result.status || "published",
    idempotent: true,
  };
}

function offerCompliance(fields: AllwainGuideOfferFields) {
  return {
    productKind: fields.productKind,
    foodCategory: fields.productKind === "food" ? fields.foodCategory : null,
    ownProduction: fields.productKind === "food" ? fields.ownProduction : null,
    producerName:
      fields.productKind === "food" ? fields.responsibleOperator : null,
    originCountry: fields.productKind === "food" ? fields.originCountry : null,
    originRegion: fields.productKind === "food" ? fields.originRegion : null,
    responsibleOperator:
      fields.productKind === "food" ? fields.responsibleOperator : null,
    onlineInfoComplete: true,
    lotTrackingRequired: fields.productKind === "food",
    nominalUnit: fields.unit,
    metadata: { source: "allwain-ai-guide" },
  };
}

async function publishOffer(
  userId: string,
  action: AllwainGuideAction,
): Promise<AllwainGuideExecutionResult> {
  const fields = action.fields as AllwainGuideOfferFields;
  const offer = await createAllwainOffer(
    userId,
    fields.title || "",
    fields.description || fields.title || "",
    fields.price || 0,
    undefined,
    {
      unit: fields.unit,
      availableQuantity: fields.availableQuantity,
      minQuantity: fields.minQuantity,
      quantityStep: fields.quantityStep,
      saleMode: fields.saleMode,
      preorderChargeDeadlineAt: fields.preorderChargeDeadlineAt,
      deliveryEstimate: fields.deliveryEstimate,
      source: "allwain-ai-guide",
      guideActionId: action.id,
    },
    offerCompliance(fields),
  );
  return {
    type: "offer",
    id: offer.id,
    title: offer.title,
    status: "published",
  };
}

function requestRawText(fields: AllwainGuideRequestFields) {
  return [
    `Producto: ${fields.productName}`,
    `Cantidad: ${fields.quantity} ${fields.unit}`,
    fields.targetPrice ? `Precio: ${fields.targetPrice} EUR` : null,
    `Entrega: ${fields.deliveryWindow}`,
    `Dirección: ${fields.deliveryAddress}`,
    fields.deliveryNotes ? `Indicaciones: ${fields.deliveryNotes}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

async function publishRequest(
  userId: string,
  action: AllwainGuideAction,
): Promise<AllwainGuideExecutionResult> {
  const fields = action.fields as AllwainGuideRequestFields;
  if (allwainPublicationCardRequired()) {
    await requireAllwainBuyerPaymentMethod(userId);
  }
  const draft = await createAllwainScanRequest(userId, {
    sourceType: "text",
    rawText: requestRawText(fields),
    provider: "mock",
  });
  await updateAllwainScanRequest(userId, draft.id, {
    extracted: {
      productName: fields.productName,
      quantity: fields.quantity,
      unit: fields.unit,
      targetPrice: fields.targetPrice,
      currency: fields.currency,
      deliveryWindow: fields.deliveryWindow,
      deliveryMethod: fields.deliveryMethod,
      deliveryAddress: fields.deliveryAddress,
      deliveryNotes: fields.deliveryNotes,
      rawText: requestRawText(fields),
    },
  });
  await confirmAllwainScanRequest(userId, draft.id);
  const launched = await launchAllwainScanRequest(userId, draft.id);
  if (!launched)
    throw new AllwainGuideActionError("REQUEST_PUBLICATION_FAILED");
  return {
    type: "request",
    id: launched.id,
    title: launched.title,
    status: launched.status,
  };
}

async function recordExecution(input: {
  userId: string;
  actorRole?: string | null;
  requestId?: string | null;
  idempotencyKey: string;
  action: AllwainGuideAction;
  result: AllwainGuideExecutionResult;
  actionHash: string;
}) {
  if (ENV.STORAGE_DRIVER !== "postgres") return;
  await appendAllwainAuditEvent({
    aggregateType: input.result.type === "offer" ? "offer" : "scan_request",
    aggregateId: input.result.id,
    eventType: "ai_guide.action_executed",
    actorUserId: input.userId,
    actorRole: input.actorRole || "user",
    source: "allwain_ai_guide",
    requestId: input.requestId,
    providerEventId: input.idempotencyKey,
    payload: {
      actionId: input.action.id,
      actionType: input.action.type,
      confirmedByUser: true,
      actionHash: input.actionHash,
      fields: input.action.fields,
      result: input.result,
    },
  });
}

async function executeOnce(input: {
  userId: string;
  actorRole?: string | null;
  requestId?: string | null;
  idempotencyKey: string;
  actionHash: string;
  action: unknown;
}) {
  const prior = await completedAction(
    input.userId,
    input.idempotencyKey,
    input.actionHash,
  );
  if (prior) return prior;

  const participation = await getAllwainParticipationSnapshot(input.userId);
  const action = normalizeAllwainGuideAction(input.action, {
    sellerEnabled: participation.seller.enabled,
    userName: participation.seller.displayName,
  });
  if (!action) throw new AllwainGuideActionError("INVALID_GUIDE_ACTION");
  if (action.missingFields.length) {
    throw new AllwainGuideActionError(
      "INCOMPLETE_GUIDE_ACTION",
      action.missingFields,
    );
  }
  if (action.status === "requires_seller") {
    throw new AllwainGuideActionError("SELLER_ROLE_REQUIRED");
  }
  if (!action.canExecute)
    throw new AllwainGuideActionError("GUIDE_ACTION_NOT_READY");

  const result =
    action.type === "create_offer"
      ? await publishOffer(input.userId, action)
      : await publishRequest(input.userId, action);
  await recordExecution({ ...input, action, result });
  return result;
}

export async function executeAllwainGuideAction(input: {
  userId: string;
  actorRole?: string | null;
  requestId?: string | null;
  idempotencyKey: unknown;
  action: unknown;
}) {
  const idempotencyKey = cleanIdempotencyKey(input.idempotencyKey);
  const actionHash = guideActionHash(input.action);
  const mapKey = `${input.userId}:${idempotencyKey}`;
  const completedInMemory = completedMemoryActions.get(mapKey);
  if (completedInMemory) {
    if (completedInMemory.actionHash !== actionHash) {
      throw new AllwainGuideActionError("IDEMPOTENCY_KEY_REUSED");
    }
    return { ...completedInMemory.result, idempotent: true };
  }
  const existing = inFlightActions.get(mapKey);
  if (existing) {
    if (existing.actionHash !== actionHash) {
      throw new AllwainGuideActionError("IDEMPOTENCY_KEY_REUSED");
    }
    return existing.promise;
  }
  const promise = executeOnce({ ...input, idempotencyKey, actionHash })
    .then((result) => {
      completedMemoryActions.set(mapKey, { actionHash, result });
      if (completedMemoryActions.size > 500) {
        const oldest = completedMemoryActions.keys().next().value;
        if (oldest) completedMemoryActions.delete(oldest);
      }
      return result;
    })
    .finally(() => {
      inFlightActions.delete(mapKey);
    });
  inFlightActions.set(mapKey, { actionHash, promise });
  return promise;
}
