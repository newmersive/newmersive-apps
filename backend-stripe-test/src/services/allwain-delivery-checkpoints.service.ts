import crypto from "crypto";
import { Prisma } from "@prisma/client";

import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";
import {
  appendAllwainAuditEventTx,
  canonicalAllwainAuditJson,
} from "./allwain-audit";
import { ensureAllwainOperationalDocumentTx } from "./allwain-compliance.service";
import { deriveAllwainOrderStatus } from "./allwain-payment-state";

export type AllwainDeliveryCheckpointType =
  | "seller_handoff"
  | "buyer_delivery";

interface DeliveryCheckpointContext {
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

const CHECKPOINT_TTL_MS = 15 * 60 * 1000;
const PAID_ORDER_STATUSES = new Set([
  "paid",
  "partially_refunded",
  "refund_pending",
]);

function checkpointSecret() {
  const secret = ENV.ALLWAIN_AUDIT_HMAC_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("ALLWAIN_AUDIT_SECRET_NOT_CONFIGURED");
  }
  return secret;
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmac(value: string) {
  return crypto
    .createHmac("sha256", checkpointSecret())
    .update(value)
    .digest("hex");
}

function safeHexEqual(left: string, right: string) {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) {
    return false;
  }
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function checkpointToken(input: {
  id: string;
  assignmentId: string;
  orderId: string;
  checkpointType: AllwainDeliveryCheckpointType;
  expectedUserId: string;
  expiresAt: Date;
}) {
  const payload = Buffer.from(
    canonicalAllwainAuditJson({
      v: 1,
      id: input.id,
      assignmentId: input.assignmentId,
      orderId: input.orderId,
      checkpointType: input.checkpointType,
      expectedUserId: input.expectedUserId,
      exp: input.expiresAt.toISOString(),
    }),
    "utf8",
  ).toString("base64url");
  const signature = hmac(`allwain-delivery-checkpoint:v1:${payload}`);
  return `awcp1.${payload}.${signature}`;
}

function checkpointShortCode(checkpointId: string, token: string) {
  const material = hmac(
    `allwain-delivery-short-code:v1:${checkpointId}:${token}`,
  );
  const numeric = Number.parseInt(material.slice(0, 12), 16) % 100_000_000;
  return String(numeric).padStart(8, "0");
}

function shortCodeHash(checkpointId: string, shortCode: string) {
  return sha256(`${checkpointId}:${shortCode}`);
}

export function normalizeAllwainDeliveryCheckpointProof(value: unknown) {
  let proof = String(value || "").trim();
  if (!proof) return "";
  try {
    proof = decodeURIComponent(proof);
  } catch {
    // Keep scanners' literal value when it is not URL encoded.
  }
  if (/^https?:\/\//i.test(proof)) {
    try {
      const url = new URL(proof);
      proof = url.searchParams.get("proof") || proof;
    } catch {
      // Validation below will reject malformed values.
    }
  }
  proof = proof.replace(/^allwain-checkpoint:/i, "").trim();
  if (/^awcp1\./i.test(proof)) return proof;
  return proof.replace(/[\s-]+/g, "").toUpperCase();
}

function verifySignedToken(token: string, checkpoint: any) {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "awcp1") return false;
  const expectedSignature = hmac(
    `allwain-delivery-checkpoint:v1:${parts[1]}`,
  );
  if (!safeHexEqual(parts[2], expectedSignature)) return false;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    return Boolean(
      payload?.v === 1 &&
        payload.id === checkpoint.id &&
        payload.assignmentId === checkpoint.assignmentId &&
        payload.orderId === checkpoint.orderId &&
        payload.checkpointType === checkpoint.checkpointType &&
        payload.expectedUserId === checkpoint.expectedUserId &&
        payload.exp === checkpoint.expiresAt.toISOString(),
    );
  } catch {
    return false;
  }
}

function checkpointStateFor(
  type: AllwainDeliveryCheckpointType,
  order: any,
  assignment: any,
) {
  if (order.deliveryChannel !== "local_connector") {
    throw new Error("LOGISTICS_NOT_LOCAL_CONNECTOR");
  }
  if (!PAID_ORDER_STATUSES.has(order.paymentStatus)) {
    throw new Error("ORDER_NOT_PAID");
  }
  if (!assignment.connectorUserId) {
    throw new Error("LOGISTICS_CONNECTOR_NOT_ASSIGNED");
  }
  if (type === "seller_handoff") {
    if (
      assignment.status !== "accepted" ||
      order.fulfillmentStatus !== "ready"
    ) {
      throw new Error("ORDER_NOT_READY_FOR_PICKUP");
    }
    return {
      expectedUserId: order.sellerUserId,
      nextAssignmentStatus: "picked_up",
      nextFulfillmentStatus: "dispatched",
    };
  }
  if (
    assignment.status !== "picked_up" ||
    order.fulfillmentStatus !== "dispatched"
  ) {
    throw new Error("ORDER_NOT_IN_TRANSIT");
  }
  return {
    expectedUserId: order.buyerUserId,
    nextAssignmentStatus: "delivered",
    nextFulfillmentStatus: "delivered",
  };
}

function publicCheckpoint(checkpoint: any) {
  const token = checkpointToken({
    id: checkpoint.id,
    assignmentId: checkpoint.assignmentId,
    orderId: checkpoint.orderId,
    checkpointType: checkpoint.checkpointType,
    expectedUserId: checkpoint.expectedUserId,
    expiresAt: checkpoint.expiresAt,
  });
  return {
    id: checkpoint.id,
    assignmentId: checkpoint.assignmentId,
    orderId: checkpoint.orderId,
    checkpointType: checkpoint.checkpointType,
    status: checkpoint.status,
    qrValue: `allwain-checkpoint:${token}`,
    shortCode: checkpointShortCode(checkpoint.id, token),
    expiresAt: checkpoint.expiresAt,
  };
}

export async function getAllwainDeliveryCheckpointForUser(
  userId: string,
  orderId: string,
  checkpointType: AllwainDeliveryCheckpointType,
) {
  const prisma = getPrisma() as any;
  return prisma.$transaction(async (tx: any) => {
    const [order, assignment] = await Promise.all([
      tx.allwainOrder.findUnique({ where: { id: orderId } }),
      tx.allwainDeliveryAssignment.findUnique({ where: { orderId } }),
    ]);
    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (!assignment) throw new Error("LOGISTICS_ASSIGNMENT_NOT_FOUND");
    const state = checkpointStateFor(checkpointType, order, assignment);
    if (state.expectedUserId !== userId) throw new Error("FORBIDDEN");

    const existing = await tx.allwainDeliveryCheckpoint.findUnique({
      where: {
        assignmentId_checkpointType: {
          assignmentId: assignment.id,
          checkpointType,
        },
      },
    });
    if (existing?.status === "verified") {
      return {
        id: existing.id,
        assignmentId: existing.assignmentId,
        orderId: existing.orderId,
        checkpointType: existing.checkpointType,
        status: existing.status,
        expiresAt: existing.expiresAt,
        verifiedAt: existing.verifiedAt,
      };
    }

    const now = new Date();
    const reusable =
      existing && existing.expiresAt.getTime() > now.getTime() + 30_000;
    if (reusable) {
      const view = publicCheckpoint(existing);
      if (
        safeHexEqual(existing.tokenHash, sha256(view.qrValue.slice(19))) &&
        existing.shortCodeHash === shortCodeHash(existing.id, view.shortCode)
      ) {
        return view;
      }
    }

    const id = existing?.id || crypto.randomUUID();
    const expiresAt = new Date(now.getTime() + CHECKPOINT_TTL_MS);
    const unsigned = {
      id,
      assignmentId: assignment.id,
      orderId,
      checkpointType,
      expectedUserId: userId,
      expiresAt,
    };
    const token = checkpointToken(unsigned);
    const shortCode = checkpointShortCode(id, token);
    const checkpoint = existing
      ? await tx.allwainDeliveryCheckpoint.update({
          where: { id },
          data: {
            expectedUserId: userId,
            tokenHash: sha256(token),
            shortCodeHash: shortCodeHash(id, shortCode),
            status: "pending",
            expiresAt,
            verifiedByConnectorUserId: null,
            verifiedAt: null,
            evidence: Prisma.JsonNull,
          },
        })
      : await tx.allwainDeliveryCheckpoint.create({
          data: {
            ...unsigned,
            tokenHash: sha256(token),
            shortCodeHash: shortCodeHash(id, shortCode),
            status: "pending",
          },
        });
    return publicCheckpoint(checkpoint);
  });
}

export async function verifyAllwainDeliveryCheckpoint(
  connectorUserId: string,
  assignmentId: string,
  rawProof: unknown,
  context: DeliveryCheckpointContext = {},
) {
  const proof = normalizeAllwainDeliveryCheckpointProof(rawProof);
  if (!proof) throw new Error("LOGISTICS_CHECKPOINT_PROOF_REQUIRED");
  if (proof.length > 2_000) throw new Error("INVALID_LOGISTICS_CHECKPOINT");
  const prisma = getPrisma() as any;

  return prisma.$transaction(async (tx: any) => {
    const assignmentRows = (await tx.$queryRaw(
      Prisma.sql`SELECT * FROM "AllwainDeliveryAssignment" WHERE "id" = ${assignmentId} FOR UPDATE`,
    )) as any[];
    const assignment = assignmentRows[0];
    if (!assignment) throw new Error("LOGISTICS_ASSIGNMENT_NOT_FOUND");
    if (assignment.connectorUserId !== connectorUserId) {
      throw new Error("FORBIDDEN");
    }
    const connector = await tx.allwainConnectorProfile.findUnique({
      where: { userId: connectorUserId },
    });
    if (connector?.status !== "active") throw new Error("CONNECTOR_NOT_ACTIVE");

    const orderRows = (await tx.$queryRaw(
      Prisma.sql`SELECT * FROM "AllwainOrder" WHERE "id" = ${assignment.orderId} FOR UPDATE`,
    )) as any[];
    const order = orderRows[0];
    if (!order) throw new Error("ORDER_NOT_FOUND");
    const checkpointType: AllwainDeliveryCheckpointType =
      assignment.status === "accepted"
        ? "seller_handoff"
        : assignment.status === "picked_up"
          ? "buyer_delivery"
          : (() => {
              throw new Error("INVALID_LOGISTICS_CHECKPOINT_STATE");
            })();
    const state = checkpointStateFor(checkpointType, order, assignment);
    const checkpoint = await tx.allwainDeliveryCheckpoint.findUnique({
      where: {
        assignmentId_checkpointType: {
          assignmentId,
          checkpointType,
        },
      },
    });
    if (!checkpoint || checkpoint.status !== "pending") {
      throw new Error("LOGISTICS_CHECKPOINT_NOT_AVAILABLE");
    }
    if (checkpoint.expiresAt.getTime() <= Date.now()) {
      throw new Error("LOGISTICS_CHECKPOINT_EXPIRED");
    }

    const isToken = proof.startsWith("awcp1.");
    const validProof = isToken
      ? verifySignedToken(proof, checkpoint) &&
        safeHexEqual(checkpoint.tokenHash, sha256(proof))
      : /^[0-9]{8}$/.test(proof) &&
        safeHexEqual(
          checkpoint.shortCodeHash || "",
          shortCodeHash(checkpoint.id, proof),
        );
    if (!validProof) throw new Error("INVALID_LOGISTICS_CHECKPOINT");

    const now = new Date();
    const overall = deriveAllwainOrderStatus({
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: state.nextFulfillmentStatus,
      disputeStatus: order.disputeStatus,
    });
    const evidence = {
      proofType: isToken ? "signed_qr" : "short_code",
      requestId: context.requestId || null,
      ipHash: context.ipAddress
        ? hmac(`allwain-delivery-ip:v1:${context.ipAddress}`)
        : null,
      userAgentHash: context.userAgent
        ? hmac(`allwain-delivery-user-agent:v1:${context.userAgent}`)
        : null,
      verifiedAt: now.toISOString(),
    };
    const evidenceHash = sha256(canonicalAllwainAuditJson(evidence));

    await tx.allwainDeliveryCheckpoint.update({
      where: { id: checkpoint.id },
      data: {
        status: "verified",
        verifiedByConnectorUserId: connectorUserId,
        verifiedAt: now,
        evidence,
      },
    });
    const updatedAssignment = await tx.allwainDeliveryAssignment.update({
      where: { id: assignmentId },
      data:
        checkpointType === "seller_handoff"
          ? { status: "picked_up", pickedUpAt: now }
          : { status: "delivered", deliveredAt: now },
    });
    const updatedOrder = await tx.allwainOrder.update({
      where: { id: order.id },
      data:
        checkpointType === "seller_handoff"
          ? {
              status: overall,
              fulfillmentStatus: "dispatched",
              traceabilityStatus: "pickup_verified",
              dispatchedAt: now,
            }
          : {
              status: overall,
              fulfillmentStatus: "delivered",
              traceabilityStatus: "delivery_verified",
              deliveredAt: now,
            },
    });
    await tx.allwainOrderStatusEvent.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: overall,
        actorUserId: connectorUserId,
        source:
          checkpointType === "seller_handoff"
            ? "connector_pickup_qr"
            : "connector_delivery_qr",
        metadata: {
          checkpointId: checkpoint.id,
          checkpointType,
          evidenceHash,
          fromFulfillmentStatus: order.fulfillmentStatus,
          toFulfillmentStatus: state.nextFulfillmentStatus,
        },
      },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateId: order.id,
      eventType:
        checkpointType === "seller_handoff"
          ? "logistics.pickup_verified"
          : "logistics.delivery_verified",
      actorUserId: connectorUserId,
      actorRole: "connector",
      source: "delivery_checkpoint",
      requestId: context.requestId,
      payload: {
        assignmentId,
        checkpointId: checkpoint.id,
        checkpointType,
        expectedUserId: state.expectedUserId,
        evidenceHash,
        fromFulfillmentStatus: order.fulfillmentStatus,
        toFulfillmentStatus: state.nextFulfillmentStatus,
      },
    });
    if (checkpointType === "buyer_delivery") {
      await ensureAllwainOperationalDocumentTx(
        tx,
        updatedOrder,
        "delivery_confirmation",
        {
          confirmedByUserId: connectorUserId,
          confirmedByRole: "connector",
          checkpointId: checkpoint.id,
          evidenceHash,
          fulfillmentStatus: "delivered",
        },
      );
    }
    return { ...updatedAssignment, mine: true, checkpointType };
  });
}
