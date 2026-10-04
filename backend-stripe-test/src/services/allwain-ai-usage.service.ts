import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";

type UsageInput = {
  userId?: string | null;
  operation:
    | "preview"
    | "request_creation"
    | "document_list_creation"
    | "scan_capture";
  provider?: string | null;
  model?: string | null;
  sourceType?: string | null;
  requestRecordId?: string | null;
  status: "succeeded" | "failed";
  inputBytes?: number | null;
  category?: string | null;
  productKind?: string | null;
  confidence?: number | null;
  detectedFields?: number | null;
  latencyMs?: number | null;
  errorCode?: string | null;
};

function boundedInteger(value: number | null | undefined) {
  return Number.isFinite(value) ? Math.max(0, Math.round(Number(value))) : null;
}

function boundedConfidence(value: number | null | undefined) {
  return Number.isFinite(value)
    ? Math.max(0, Math.min(1, Number(value)))
    : null;
}

function clean(value: string | null | undefined, maximum = 120) {
  const normalized = String(value || "").trim();
  return normalized ? normalized.slice(0, maximum) : null;
}

export function allwainImageInputBytes(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const payload = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  return Math.max(0, Math.floor((payload.length * 3) / 4));
}

export function safeAllwainAiErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /^[A-Z0-9_:-]{1,100}$/.test(message)
    ? message
    : "AI_PROVIDER_ERROR";
}

export async function recordAllwainAiUsage(input: UsageInput) {
  if (ENV.STORAGE_DRIVER !== "postgres") return null;
  try {
    return await (getPrisma() as any).allwainAiUsageEvent.create({
      data: {
        userId: clean(input.userId, 80),
        feature: "product_recognition",
        operation: input.operation,
        provider: clean(input.provider, 60) || "configured_provider",
        model: clean(input.model, 100),
        sourceType: clean(input.sourceType, 30),
        requestRecordId: clean(input.requestRecordId, 80),
        status: input.status,
        inputBytes: boundedInteger(input.inputBytes),
        category: clean(input.category, 80),
        productKind: clean(input.productKind, 80),
        confidence: boundedConfidence(input.confidence),
        detectedFields: boundedInteger(input.detectedFields),
        latencyMs: boundedInteger(input.latencyMs),
        errorCode: clean(input.errorCode, 100),
      },
    });
  } catch (error) {
    console.error("ALLWAIN_AI_USAGE_RECORD_FAILED", safeAllwainAiErrorCode(error));
    return null;
  }
}

export async function getAllwainAiUsageSummary(daysValue: unknown = 30) {
  if (ENV.STORAGE_DRIVER !== "postgres") {
    return { configured: false, days: 0, total: 0, groups: [], recent: [] };
  }
  const days = Math.max(1, Math.min(365, Number(daysValue) || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1_000);
  const prisma = getPrisma() as any;
  const [groups, recent, total] = await Promise.all([
    prisma.allwainAiUsageEvent.groupBy({
      by: ["provider", "operation", "status", "sourceType", "category", "productKind"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _avg: { latencyMs: true, confidence: true },
      orderBy: { _count: { id: "desc" } },
      take: 100,
    }),
    prisma.allwainAiUsageEvent.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        operation: true,
        provider: true,
        model: true,
        sourceType: true,
        requestRecordId: true,
        status: true,
        inputBytes: true,
        category: true,
        productKind: true,
        confidence: true,
        detectedFields: true,
        latencyMs: true,
        errorCode: true,
        createdAt: true,
      },
    }),
    prisma.allwainAiUsageEvent.count({ where: { createdAt: { gte: since } } }),
  ]);
  return {
    configured: true,
    days,
    since: since.toISOString(),
    total,
    groups: groups.map((group: any) => ({
      provider: group.provider,
      operation: group.operation,
      status: group.status,
      sourceType: group.sourceType,
      category: group.category,
      productKind: group.productKind,
      count: group._count?._all || 0,
      averageLatencyMs: group._avg?.latencyMs ?? null,
      averageConfidence: group._avg?.confidence ?? null,
    })),
    recent: recent.map((event: any) => ({
      ...event,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}
