import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";

export interface AllwainAuditInput {
  aggregateType?: string;
  aggregateId: string;
  orderId?: string | null;
  eventType: string;
  actorUserId?: string | null;
  actorRole?: string | null;
  source: string;
  requestId?: string | null;
  providerEventId?: string | null;
  occurredAt?: Date;
  payload: Record<string, unknown>;
}

function canonicalValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    );
  }
  return value;
}

export function canonicalAllwainAuditJson(value: unknown) {
  return JSON.stringify(canonicalValue(value));
}

export function buildAllwainAuditHash(input: {
  aggregateType: string;
  aggregateId: string;
  sequence: number;
  eventType: string;
  actorUserId?: string | null;
  actorRole?: string | null;
  source: string;
  requestId?: string | null;
  providerEventId?: string | null;
  occurredAt: Date | string;
  payload: unknown;
  previousHash?: string | null;
}) {
  const secret = ENV.ALLWAIN_AUDIT_HMAC_SECRET;
  if (!secret || secret.length < 16) throw new Error("ALLWAIN_AUDIT_SECRET_NOT_CONFIGURED");
  const material = canonicalAllwainAuditJson({
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    sequence: input.sequence,
    eventType: input.eventType,
    actorUserId: input.actorUserId || null,
    actorRole: input.actorRole || null,
    source: input.source,
    requestId: input.requestId || null,
    providerEventId: input.providerEventId || null,
    occurredAt:
      input.occurredAt instanceof Date ? input.occurredAt.toISOString() : input.occurredAt,
    payload: input.payload,
    previousHash: input.previousHash || null,
  });
  return crypto.createHmac("sha256", secret).update(material).digest("hex");
}

export async function appendAllwainAuditEventTx(tx: any, input: AllwainAuditInput) {
  const aggregateType = input.aggregateType || "order";
  const lockKey = `${aggregateType}:${input.aggregateId}`;
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
  const previous = await tx.allwainAuditEvent.findFirst({
    where: { aggregateType, aggregateId: input.aggregateId },
    orderBy: { sequence: "desc" },
  });
  const sequence = (previous?.sequence || 0) + 1;
  const occurredAt = input.occurredAt || new Date();
  const payload = canonicalValue(input.payload) as Record<string, unknown>;
  const eventHash = buildAllwainAuditHash({
    aggregateType,
    aggregateId: input.aggregateId,
    sequence,
    eventType: input.eventType,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    source: input.source,
    requestId: input.requestId,
    providerEventId: input.providerEventId,
    occurredAt,
    payload,
    previousHash: previous?.eventHash || null,
  });

  return tx.allwainAuditEvent.create({
    data: {
      aggregateType,
      aggregateId: input.aggregateId,
      orderId: input.orderId ?? (aggregateType === "order" ? input.aggregateId : null),
      sequence,
      eventType: input.eventType,
      actorUserId: input.actorUserId || null,
      actorRole: input.actorRole || null,
      source: input.source,
      requestId: input.requestId || null,
      providerEventId: input.providerEventId || null,
      occurredAt,
      payload: payload as any,
      previousHash: previous?.eventHash || null,
      eventHash,
    },
  });
}

export async function appendAllwainAuditEvent(input: AllwainAuditInput) {
  const prisma = getPrisma() as any;
  return prisma.$transaction((tx: any) => appendAllwainAuditEventTx(tx, input));
}

export async function verifyAllwainAuditChain(aggregateType: string, aggregateId: string) {
  const prisma = getPrisma() as any;
  const events = await prisma.allwainAuditEvent.findMany({
    where: { aggregateType, aggregateId },
    orderBy: { sequence: "asc" },
  });
  let previousHash: string | null = null;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const expectedSequence = index + 1;
    const expectedHash = buildAllwainAuditHash({
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      sequence: event.sequence,
      eventType: event.eventType,
      actorUserId: event.actorUserId,
      actorRole: event.actorRole,
      source: event.source,
      requestId: event.requestId,
      providerEventId: event.providerEventId,
      occurredAt: event.occurredAt,
      payload: event.payload,
      previousHash: event.previousHash,
    });
    if (
      event.sequence !== expectedSequence ||
      event.previousHash !== previousHash ||
      event.eventHash !== expectedHash
    ) {
      return {
        valid: false,
        count: events.length,
        brokenSequence: event.sequence,
        headHash: events.at(-1)?.eventHash || null,
      };
    }
    previousHash = event.eventHash;
  }
  return {
    valid: true,
    count: events.length,
    brokenSequence: null,
    headHash: previousHash,
  };
}

export async function ensureAllwainAuditBaselines(limit = 100) {
  if (ENV.STORAGE_DRIVER !== "postgres") return { created: 0 };
  const prisma = getPrisma() as any;
  const batchSize = Math.min(500, Math.max(1, Math.trunc(limit) || 100));
  const orders = await prisma.$queryRaw(Prisma.sql`
    SELECT orders.*
    FROM "AllwainOrder" orders
    WHERE NOT EXISTS (
      SELECT 1
      FROM "AllwainAuditEvent" events
      WHERE events."aggregateType" = 'order'
        AND events."aggregateId" = orders.id
    )
    ORDER BY orders."createdAt" ASC, orders.id ASC
    LIMIT ${batchSize}
  `);
  let created = 0;
  for (const order of orders) {
    try {
      await appendAllwainAuditEvent({
        aggregateId: order.id,
        eventType: "order.audit_baseline_created",
        source: "audit_backfill",
        occurredAt: order.createdAt,
        payload: {
          contractId: order.contractId,
          offerId: order.offerId,
          buyerUserId: order.buyerUserId,
          sellerUserId: order.sellerUserId,
          status: order.status,
          paymentStatus: order.paymentStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          quantity: order.quantity,
          unit: order.unit,
          subtotalAmount: order.subtotalAmount,
          currency: order.currency,
          inventoryStatus: order.inventoryStatus,
          legacySnapshot: true,
        },
      });
      created += 1;
    } catch (error: any) {
      if (error?.code !== "P2002") throw error;
    }
  }
  return { created };
}
