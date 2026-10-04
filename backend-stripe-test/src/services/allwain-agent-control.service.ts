import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";
import { appendAllwainAuditEventTx } from "./allwain-audit";

export type AllwainAgentKey =
  | "product_recognition"
  | "operational_guide"
  | "public_guide"
  | "publication_quality"
  | "chat_translation"
  | "support_triage";

type AgentDefinition = {
  key: AllwainAgentKey;
  name: string;
  purpose: string;
  risk: "low" | "medium" | "high";
  defaultMode: string;
  allowedModes: string[];
  capabilities: string[];
  fallback: string | null;
};

const AGENTS: AgentDefinition[] = [
  {
    key: "product_recognition",
    name: "Lectura y reconocimiento de producto",
    purpose: "Lee imagen, etiqueta, código y texto para preparar fichas y peticiones.",
    risk: "medium",
    defaultMode: "standard",
    allowedModes: ["standard", "ocr_only", "local_only"],
    capabilities: ["OCR", "reconocimiento visual", "extracción estructurada"],
    fallback: "Extracción local por reglas",
  },
  {
    key: "operational_guide",
    name: "Guía operativa Allwain",
    purpose: "Conversa, reúne datos y prepara acciones reales que el usuario confirma.",
    risk: "high",
    defaultMode: "standard",
    allowedModes: ["standard", "local_only"],
    capabilities: ["orientación", "borradores", "publicación confirmada"],
    fallback: "Guía local con reglas y sin generación externa",
  },
  {
    key: "public_guide",
    name: "Guía pública",
    purpose: "Explica Allwain con conocimiento verificado antes del registro.",
    risk: "low",
    defaultMode: "standard",
    allowedModes: ["standard", "verified_only"],
    capabilities: ["respuesta pública", "citas internas", "varios idiomas"],
    fallback: "Respuestas verificadas del corpus local",
  },
  {
    key: "publication_quality",
    name: "Control de publicaciones",
    purpose: "Detecta incoherencias, riesgos, precios absurdos y datos insuficientes.",
    risk: "high",
    defaultMode: "standard",
    allowedModes: ["standard", "rules_only"],
    capabilities: ["aprobar", "pedir mejora", "bloquear publicación"],
    fallback: "Reglas obligatorias de seguridad y coherencia",
  },
  {
    key: "chat_translation",
    name: "Traducción de chat",
    purpose: "Traduce mensajes preservando cantidades, precios, fechas y direcciones.",
    risk: "medium",
    defaultMode: "standard",
    allowedModes: ["standard"],
    capabilities: ["traducción bajo demanda", "caché por mensaje"],
    fallback: null,
  },
  {
    key: "support_triage",
    name: "Clasificación de soporte",
    purpose: "Ordena consultas y separa casos seguros de pagos, identidad o asuntos legales.",
    risk: "high",
    defaultMode: "standard",
    allowedModes: ["standard", "assist", "safe_auto", "rules_only"],
    capabilities: ["clasificación", "prioridad", "borrador de respuesta segura"],
    fallback: "Clasificación local por reglas",
  },
];

const agentByKey = new Map(AGENTS.map((agent) => [agent.key, agent]));
const memoryControls = new Map<AllwainAgentKey, any>();
const runtimeCache = new Map<AllwainAgentKey, { expiresAt: number; value: AllwainAgentRuntimeControl }>();

export class AllwainAgentControlError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "AllwainAgentControlError";
  }
}

export type AllwainAgentRuntimeControl = {
  key: AllwainAgentKey;
  enabled: boolean;
  mode: string;
  operatorInstructions: string | null;
  version: number;
};

function clean(value: unknown, maximum: number) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maximum);
}

function definition(key: unknown) {
  const normalized = clean(key, 80) as AllwainAgentKey;
  const found = agentByKey.get(normalized);
  if (!found) throw new AllwainAgentControlError("AGENT_NOT_FOUND");
  return found;
}

function defaultControl(agent: AgentDefinition): AllwainAgentRuntimeControl {
  return {
    key: agent.key,
    enabled: true,
    mode: agent.defaultMode,
    operatorInstructions: null,
    version: 0,
  };
}

export async function getAllwainAgentRuntimeControl(
  rawKey: AllwainAgentKey,
): Promise<AllwainAgentRuntimeControl> {
  const agent = definition(rawKey);
  const cached = runtimeCache.get(agent.key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  let value = defaultControl(agent);
  if (ENV.STORAGE_DRIVER === "postgres") {
    try {
      const row = await (getPrisma() as any).allwainAgentControl.findUnique({
        where: { agentKey: agent.key },
      });
      if (row) {
        value = {
          key: agent.key,
          enabled: Boolean(row.enabled),
          mode: agent.allowedModes.includes(row.mode) ? row.mode : agent.defaultMode,
          operatorInstructions: clean(row.operatorInstructions, 2_000) || null,
          version: Number(row.version || 1),
        };
      }
    } catch (error) {
      console.error("ALLWAIN_AGENT_CONTROL_READ_FAILED", agent.key, error);
    }
  } else if (memoryControls.has(agent.key)) {
    value = memoryControls.get(agent.key);
  }
  runtimeCache.set(agent.key, { expiresAt: Date.now() + 15_000, value });
  return value;
}

function configuration(agent: AgentDefinition) {
  const openAi = Boolean(ENV.OPENAI_API_KEY);
  const vision = Boolean(ENV.GOOGLE_CLOUD_VISION_API_KEY);
  if (agent.key === "product_recognition") {
    const provider = String(ENV.SCAN_PROVIDER || "mock").toLowerCase();
    return {
      provider,
      model: process.env.OPENAI_SCAN_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
      externalConfigured: provider === "google" ? vision : openAi,
      blockers: [
        ...(provider === "google" && !vision ? ["Falta Google Cloud Vision"] : []),
        ...(!openAi ? ["Mejora visual OpenAI no configurada"] : []),
      ],
    };
  }
  if (agent.key === "chat_translation") {
    return {
      provider: "openai",
      model: ENV.ALLWAIN_CHAT_TRANSLATION_MODEL,
      externalConfigured: ENV.ALLWAIN_CHAT_TRANSLATION_ENABLED && openAi,
      blockers: [
        ...(!ENV.ALLWAIN_CHAT_TRANSLATION_ENABLED ? ["Traducción desactivada en servidor"] : []),
        ...(!openAi ? ["Falta proveedor IA"] : []),
      ],
    };
  }
  if (agent.key === "support_triage") {
    return {
      provider: ENV.ALLWAIN_SUPPORT_EXTERNAL_AI_ENABLED ? "local_rules+openai" : "local_rules",
      model: ENV.ALLWAIN_SUPPORT_AI_MODEL,
      externalConfigured: ENV.ALLWAIN_SUPPORT_EXTERNAL_AI_ENABLED && openAi,
      blockers: [
        ...(!ENV.ALLWAIN_SUPPORT_EXTERNAL_AI_ENABLED ? ["Mejora IA externa desactivada"] : []),
        ...(!ENV.ALLWAIN_SUPPORT_INBOX_ENABLED ? ["Buzón de soporte no activado"] : []),
      ],
    };
  }
  const model =
    process.env.OPENAI_DEMO_AGENT_MODEL ||
    process.env.OPENAI_PUBLICATION_REVIEW_MODEL ||
    process.env.OPENAI_CHAT_MODEL ||
    process.env.OPENAI_MODEL ||
    "gpt-4o-mini";
  return {
    provider: openAi ? "openai" : "local",
    model,
    externalConfigured: openAi,
    blockers: openAi ? [] : ["Proveedor IA externo no configurado; funciona el modo local"],
  };
}

function dateIso(value: any) {
  return value instanceof Date ? value.toISOString() : value || null;
}

async function agentMetrics(days: number) {
  if (ENV.STORAGE_DRIVER !== "postgres") return new Map<string, any>();
  const prisma = getPrisma() as any;
  const since = new Date(Date.now() - days * 86_400_000);
  const [usage, reviews, guideActions, translations, supportTickets, latestUsage] = await Promise.all([
    prisma.allwainAiUsageEvent.groupBy({
      by: ["feature", "status"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _avg: { latencyMs: true, confidence: true },
    }),
    prisma.allwainPublicationReview.groupBy({
      by: ["decision"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.allwainAuditEvent.count({
      where: { eventType: "ai_guide.action_executed", occurredAt: { gte: since } },
    }),
    prisma.chatMessageTranslation.count({
      where: { app: "allwain", createdAt: { gte: since } },
    }),
    prisma.allwainSupportTicket.count({ where: { createdAt: { gte: since } } }),
    prisma.allwainAiUsageEvent.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      distinct: ["feature"],
      select: { feature: true, createdAt: true },
    }),
  ]);
  const result = new Map<string, any>();
  for (const group of usage) {
    const current = result.get(group.feature) || {
      runs: 0,
      failures: 0,
      averageLatencyMs: null,
      averageConfidence: null,
    };
    current.runs += Number(group._count?._all || 0);
    if (group.status === "failed") current.failures += Number(group._count?._all || 0);
    if (group._avg?.latencyMs != null) current.averageLatencyMs = Math.round(group._avg.latencyMs);
    if (group._avg?.confidence != null) current.averageConfidence = Number(group._avg.confidence);
    result.set(group.feature, current);
  }
  for (const latest of latestUsage) {
    const current = result.get(latest.feature) || { runs: 0, failures: 0 };
    current.lastActivityAt = dateIso(latest.createdAt);
    result.set(latest.feature, current);
  }
  const qualityByDecision = Object.fromEntries(
    reviews.map((row: any) => [row.decision, Number(row._count?._all || 0)]),
  );
  result.set("publication_quality", {
    runs: Object.values(qualityByDecision).reduce((sum: number, value) => sum + Number(value), 0),
    failures: 0,
    decisions: qualityByDecision,
  });
  result.set("operational_guide", { runs: Number(guideActions), failures: 0, confirmedActions: Number(guideActions) });
  result.set("chat_translation", { runs: Number(translations), failures: 0 });
  result.set("support_triage", { runs: Number(supportTickets), failures: 0, ticketsClassified: Number(supportTickets) });
  return result;
}

export async function getAllwainAgentAdminOverview(daysValue: unknown = 30) {
  const days = Math.max(1, Math.min(365, Math.trunc(Number(daysValue) || 30)));
  const [controls, metrics] = await Promise.all([
    Promise.all(AGENTS.map((agent) => getAllwainAgentRuntimeControl(agent.key))),
    agentMetrics(days),
  ]);
  return {
    days,
    generatedAt: new Date().toISOString(),
    agents: AGENTS.map((agent, index) => {
      const control = controls[index];
      const config = configuration(agent);
      const enabled = control.enabled;
      const fallbackOnly = control.mode.includes("local") || control.mode.includes("rules") || control.mode === "verified_only" || control.mode === "ocr_only";
      const health = !enabled
        ? "paused"
        : config.externalConfigured && !fallbackOnly
          ? "healthy"
          : agent.fallback
            ? "degraded"
            : "not_configured";
      return {
        ...agent,
        control,
        configuration: config,
        health,
        metrics: metrics.get(agent.key) || { runs: 0, failures: 0 },
      };
    }),
  };
}

export async function updateAllwainAgentControl(input: {
  actorUserId: string;
  agentKey: unknown;
  enabled: unknown;
  mode: unknown;
  operatorInstructions?: unknown;
  reason: unknown;
  requestId?: string;
}) {
  const agent = definition(input.agentKey);
  if (typeof input.enabled !== "boolean") {
    throw new AllwainAgentControlError("AGENT_ENABLED_BOOLEAN_REQUIRED");
  }
  const mode = clean(input.mode, 40) || agent.defaultMode;
  if (!agent.allowedModes.includes(mode)) {
    throw new AllwainAgentControlError("INVALID_AGENT_MODE");
  }
  const operatorInstructions = clean(input.operatorInstructions, 2_000) || null;
  const reason = clean(input.reason, 500);
  if (reason.length < 8) throw new AllwainAgentControlError("ADMIN_REASON_REQUIRED");

  let result: AllwainAgentRuntimeControl;
  if (ENV.STORAGE_DRIVER === "postgres") {
    const prisma = getPrisma() as any;
    result = await prisma.$transaction(async (tx: any) => {
      const previous = await tx.allwainAgentControl.findUnique({ where: { agentKey: agent.key } });
      const row = await tx.allwainAgentControl.upsert({
        where: { agentKey: agent.key },
        create: {
          agentKey: agent.key,
          enabled: input.enabled,
          mode,
          operatorInstructions,
          version: 1,
          updatedByUserId: input.actorUserId,
        },
        update: {
          enabled: input.enabled,
          mode,
          operatorInstructions,
          version: { increment: 1 },
          updatedByUserId: input.actorUserId,
        },
      });
      await appendAllwainAuditEventTx(tx, {
        aggregateType: "agent",
        aggregateId: agent.key,
        eventType: "admin.agent_control_updated",
        actorUserId: input.actorUserId,
        actorRole: "admin",
        source: "allwain_admin",
        requestId: input.requestId,
        payload: {
          reason,
          previous: previous
            ? { enabled: previous.enabled, mode: previous.mode, version: previous.version }
            : null,
          next: { enabled: row.enabled, mode: row.mode, version: row.version },
          instructionsChanged:
            String(previous?.operatorInstructions || "") !== String(row.operatorInstructions || ""),
        },
      });
      return {
        key: agent.key,
        enabled: Boolean(row.enabled),
        mode: row.mode,
        operatorInstructions: row.operatorInstructions || null,
        version: Number(row.version),
      };
    });
  } else {
    const previous = memoryControls.get(agent.key) || defaultControl(agent);
    result = {
      key: agent.key,
      enabled: input.enabled,
      mode,
      operatorInstructions,
      version: Number(previous.version || 0) + 1,
    };
    memoryControls.set(agent.key, result);
  }
  runtimeCache.delete(agent.key);
  return result;
}

export function allwainAgentDefinitions() {
  return AGENTS.map((agent) => ({ ...agent }));
}
