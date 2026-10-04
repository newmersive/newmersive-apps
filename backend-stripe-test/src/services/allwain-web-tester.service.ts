import crypto from "crypto";
import { Prisma } from "@prisma/client";

import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";
import { appendAllwainAuditEventTx, canonicalAllwainAuditJson } from "./allwain-audit";
import { classifyAllwainSupportMessage } from "./allwain-support.service";
import { containsLikelyPrivateData } from "./ai/allwain-public-guide.ai.service";

const INCIDENT_CATEGORIES = new Set([
  "functionality",
  "accessibility",
  "content",
  "translation",
  "performance",
  "account",
  "other",
]);
const INCIDENT_SEVERITIES = new Set(["low", "normal", "high", "blocking"]);
const SUPPORTED_LOCALES = new Set(["es", "en", "fr", "it", "zh", "ar"]);
const INCIDENT_TARGETS = new Set(["web", "app"]);
const TESTER_PLATFORMS = new Set(["web", "android", "ios", "unknown"]);
const SAFE_TOKEN = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const SAFE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,99}$/;
const SAFE_RELEASE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const SAFE_APP_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+() -]{0,79}$/;
export const ALLWAIN_APP_TESTER_PROGRAM_ID = "allwain-app-pilot-v1";
export const ALLWAIN_APP_TESTER_STEP_IDS = [
  "access",
  "profile",
  "capture",
  "buy",
  "compare",
  "sell",
  "connector",
  "notifications",
  "delivery",
  "assistant",
  "accessibility",
  "support",
] as const;
const ALLWAIN_APP_TESTER_STEPS = new Set<string>(ALLWAIN_APP_TESTER_STEP_IDS);
export const ALLWAIN_APP_TESTER_ACTION_IDS = ["a1", "a2"] as const;
const ALLWAIN_APP_TESTER_ACTIONS = new Set<string>(ALLWAIN_APP_TESTER_ACTION_IDS);
const FEEDBACK_SCHEMA_V1 = {
  web_clara: new Set(["yes", "partial", "no"]),
  propuesta_clara: new Set(["yes", "partial", "no"]),
  preventa: new Set(["yes", "maybe", "no"]),
  valor: new Set(["freshness", "savings", "local_economy"]),
  sostenibilidad: new Set(["yes", "partial", "no"]),
  tester: new Set(["yes", "maybe", "not_now"]),
  papel: new Set(["buyer", "seller", "connector", "observer"]),
} as const;

type WebTesterIdentity = {
  id: string;
  email: string;
  role: string;
};

export type AllwainWebTesterIncidentInput = {
  category: string;
  severity: "low" | "normal" | "high" | "blocking";
  subject: string | null;
  description: string;
  steps: string | null;
  screen: string | null;
  locale: string;
  release: string | null;
  clientReference: string | null;
  target: "web" | "app";
  stepId: string | null;
  platform: "web" | "android" | "ios" | "unknown";
  appVersion: string | null;
};

export type AllwainWebTesterFeedbackInput = {
  submissionId: string;
  schemaVersion: number;
  locale: string;
  release: string | null;
  answers: Record<string, string>;
  comment: string | null;
};

export type AllwainAppTesterProgressInput = {
  status: "completed";
  platform: "web" | "android" | "ios" | "unknown";
  appVersion: string | null;
  clientReference: string;
};

export type AllwainAppTesterActionProgressInput = {
  status: "pending" | "completed";
  platform: "web" | "android" | "ios" | "unknown";
  appVersion: string | null;
  clientReference: string;
};

function cleanText(value: unknown, maximum: number) {
  return String(value ?? "")
    .replace(/\0/g, "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, maximum);
}

function cleanLine(value: unknown, maximum: number) {
  return cleanText(value, maximum).replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeLocale(value: unknown) {
  const locale = cleanLine(value, 12).toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LOCALES.has(locale) ? locale : "es";
}

function normalizeTesterPlatform(value: unknown, fallback: "web" | "unknown" = "unknown") {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") throw new Error("INVALID_TESTER_PLATFORM");
  const platform = cleanLine(value, 16).toLowerCase();
  if (!TESTER_PLATFORMS.has(platform)) throw new Error("INVALID_TESTER_PLATFORM");
  return platform as AllwainAppTesterProgressInput["platform"];
}

function normalizeOptionalAppVersion(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error("INVALID_TESTER_APP_VERSION");
  const appVersion = cleanLine(value, 80);
  if (!SAFE_APP_VERSION.test(appVersion)) throw new Error("INVALID_TESTER_APP_VERSION");
  if (containsLikelyPrivateData(appVersion)) {
    throw new Error("TESTER_APP_VERSION_SENSITIVE_DATA");
  }
  return appVersion;
}

export function normalizeAllwainAppTesterStepId(value: unknown) {
  if (typeof value !== "string") throw new Error("INVALID_TESTER_STEP");
  const stepId = cleanLine(value, 24).toLowerCase();
  if (!ALLWAIN_APP_TESTER_STEPS.has(stepId)) throw new Error("INVALID_TESTER_STEP");
  return stepId;
}

export function normalizeAllwainAppTesterActionId(value: unknown) {
  if (typeof value !== "string") throw new Error("INVALID_TESTER_ACTION");
  const actionId = cleanLine(value, 8).toLowerCase();
  if (!ALLWAIN_APP_TESTER_ACTIONS.has(actionId)) throw new Error("INVALID_TESTER_ACTION");
  return actionId;
}

function requirePostgres() {
  if (ENV.STORAGE_DRIVER !== "postgres") throw new Error("POSTGRES_REQUIRED");
}

async function lockActiveTesterUser(tx: any, userId: string) {
  const lockKey = `allwain-account:${userId}`;
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, deletedAt: true },
  });
  if (!user || user.deletedAt) throw new Error("USER_NOT_FOUND");
  return user;
}

function serializeDate(value: unknown) {
  return value instanceof Date ? value.toISOString() : value;
}

function publicMessage(row: any) {
  return {
    id: row.id,
    direction: row.direction,
    channel: row.channel,
    body: row.bodyText,
    status: row.status,
    aiGenerated: row.aiGenerated === true,
    createdAt: serializeDate(row.createdAt),
    sentAt: serializeDate(row.sentAt),
  };
}

function publicIncident(row: any) {
  const triage = row?.aiTriage && typeof row.aiTriage === "object" ? row.aiTriage : {};
  return {
    id: row.id,
    subject: row.subject,
    category: row.category,
    priority: row.priority,
    riskLevel: row.riskLevel,
    status: row.status,
    source: row.source,
    createdAt: serializeDate(row.createdAt),
    updatedAt: serializeDate(row.updatedAt),
    lastMessageAt: serializeDate(row.lastMessageAt),
    context: {
      target: triage.target === "app" ? "app" : "web",
      stepId: ALLWAIN_APP_TESTER_STEPS.has(triage.stepId) ? triage.stepId : null,
      platform: TESTER_PLATFORMS.has(triage.platform) ? triage.platform : "unknown",
      appVersion: typeof triage.appVersion === "string" ? triage.appVersion : null,
    },
    messages: Array.isArray(row.messages) ? row.messages.map(publicMessage) : [],
  };
}

function defaultIncidentSubject(category: string, target: "web" | "app") {
  const labels: Record<string, string> = {
    functionality: "Funcionamiento",
    accessibility: "Accesibilidad",
    content: "Contenido",
    translation: "Traducción",
    performance: "Rendimiento",
    account: "Acceso o cuenta",
    other: "Otra observación",
  };
  return `Prueba ${target === "app" ? "app" : "web"}: ${labels[category] || labels.other}`;
}

export function normalizeAllwainWebTesterIncidentInput(
  value: unknown,
): AllwainWebTesterIncidentInput {
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  if (input.description !== undefined && typeof input.description !== "string") {
    throw new Error("TESTER_INCIDENT_DESCRIPTION_REQUIRED");
  }
  const category = cleanLine(input.category, 40).toLowerCase();
  if (!INCIDENT_CATEGORIES.has(category)) throw new Error("INVALID_TESTER_INCIDENT_CATEGORY");
  const severity = cleanLine(input.severity || "normal", 20).toLowerCase();
  if (!INCIDENT_SEVERITIES.has(severity)) throw new Error("INVALID_TESTER_INCIDENT_SEVERITY");
  const description = cleanText(input.description, 5_000);
  if (description.length < 10) throw new Error("TESTER_INCIDENT_DESCRIPTION_REQUIRED");
  const rawSubject = cleanLine(input.subject, 160);
  if (rawSubject && rawSubject.length < 3) throw new Error("INVALID_TESTER_INCIDENT_SUBJECT");
  const steps = cleanText(input.steps, 2_000) || null;
  const screen = cleanLine(input.screen, 40).toLowerCase() || null;
  if (screen && !SAFE_TOKEN.test(screen)) throw new Error("INVALID_TESTER_INCIDENT_SCREEN");
  const release = cleanLine(input.release, 80) || null;
  if (release && !SAFE_RELEASE.test(release)) throw new Error("INVALID_TESTER_RELEASE");
  const target = cleanLine(input.target || "web", 12).toLowerCase();
  if (!INCIDENT_TARGETS.has(target)) throw new Error("INVALID_TESTER_INCIDENT_TARGET");
  const stepId = input.stepId === undefined || input.stepId === null || input.stepId === ""
    ? null
    : normalizeAllwainAppTesterStepId(input.stepId);
  const platform = normalizeTesterPlatform(input.platform, target === "web" ? "web" : "unknown");
  const appVersion = normalizeOptionalAppVersion(input.appVersion);
  if (input.clientReference !== undefined && typeof input.clientReference !== "string") {
    throw new Error("INVALID_TESTER_CLIENT_REFERENCE");
  }
  const clientReference = cleanLine(input.clientReference, 100) || null;
  if (!clientReference) throw new Error("TESTER_CLIENT_REFERENCE_REQUIRED");
  if (!SAFE_REFERENCE.test(clientReference)) {
    throw new Error("INVALID_TESTER_CLIENT_REFERENCE");
  }
  if (containsLikelyPrivateData([rawSubject, description, steps].filter(Boolean).join("\n"))) {
    throw new Error("TESTER_INCIDENT_SENSITIVE_DATA");
  }
  return {
    category,
    severity: severity as AllwainWebTesterIncidentInput["severity"],
    subject: rawSubject || null,
    description,
    steps,
    screen,
    locale: normalizeLocale(input.locale),
    release,
    clientReference,
    target: target as AllwainWebTesterIncidentInput["target"],
    stepId,
    platform,
    appVersion,
  };
}

function normalizeFeedbackAnswer(key: string, value: unknown) {
  const allowed = FEEDBACK_SCHEMA_V1[key as keyof typeof FEEDBACK_SCHEMA_V1];
  if (!allowed) throw new Error("INVALID_TESTER_FEEDBACK_KEY");
  if (typeof value !== "string") throw new Error("INVALID_TESTER_FEEDBACK_ANSWER");
  const answer = value.trim().toLowerCase();
  if (!answer || !SAFE_TOKEN.test(answer) || !allowed.has(answer as never)) {
    throw new Error("INVALID_TESTER_FEEDBACK_ANSWER");
  }
  return answer;
}

function requestFingerprint(value: unknown) {
  return crypto.createHash("sha256").update(canonicalAllwainAuditJson(value)).digest("hex");
}

function incidentFingerprint(incident: AllwainWebTesterIncidentInput) {
  return requestFingerprint({
    category: incident.category,
    severity: incident.severity,
    subject: incident.subject,
    description: incident.description,
    steps: incident.steps,
    screen: incident.screen,
    locale: incident.locale,
    release: incident.release,
    target: incident.target,
    stepId: incident.stepId,
    platform: incident.platform,
    appVersion: incident.appVersion,
  });
}

export function normalizeAllwainAppTesterProgressInput(
  value: unknown,
): AllwainAppTesterProgressInput {
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const allowedKeys = new Set(["status", "platform", "appVersion", "clientReference"]);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw new Error("INVALID_TESTER_PROGRESS_KEY");
  }
  if (input.status !== "completed") throw new Error("INVALID_TESTER_PROGRESS_STATUS");
  if (input.platform === undefined) throw new Error("TESTER_PLATFORM_REQUIRED");
  const platform = normalizeTesterPlatform(input.platform);
  const appVersion = normalizeOptionalAppVersion(input.appVersion);
  if (typeof input.clientReference !== "string") {
    throw new Error("TESTER_CLIENT_REFERENCE_REQUIRED");
  }
  const clientReference = cleanLine(input.clientReference, 100);
  if (!clientReference) throw new Error("TESTER_CLIENT_REFERENCE_REQUIRED");
  if (!SAFE_REFERENCE.test(clientReference)) {
    throw new Error("INVALID_TESTER_CLIENT_REFERENCE");
  }
  return { status: "completed", platform, appVersion, clientReference };
}

export function normalizeAllwainAppTesterActionProgressInput(
  value: unknown,
): AllwainAppTesterActionProgressInput {
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const allowedKeys = new Set(["status", "platform", "appVersion", "clientReference"]);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw new Error("INVALID_TESTER_ACTION_KEY");
  }
  if (input.status !== "pending" && input.status !== "completed") {
    throw new Error("INVALID_TESTER_ACTION_STATUS");
  }
  if (input.platform === undefined) throw new Error("TESTER_PLATFORM_REQUIRED");
  const platform = normalizeTesterPlatform(input.platform);
  const appVersion = normalizeOptionalAppVersion(input.appVersion);
  if (typeof input.clientReference !== "string") {
    throw new Error("TESTER_CLIENT_REFERENCE_REQUIRED");
  }
  const clientReference = cleanLine(input.clientReference, 100);
  if (!clientReference) throw new Error("TESTER_CLIENT_REFERENCE_REQUIRED");
  if (!SAFE_REFERENCE.test(clientReference)) {
    throw new Error("INVALID_TESTER_CLIENT_REFERENCE");
  }
  return { status: input.status, platform, appVersion, clientReference };
}

function feedbackFingerprint(feedback: AllwainWebTesterFeedbackInput) {
  return requestFingerprint({
    schemaVersion: feedback.schemaVersion,
    locale: feedback.locale,
    release: feedback.release,
    answers: feedback.answers,
    comment: feedback.comment,
  });
}

function storedIncidentFingerprint(ticket: any) {
  const value = ticket?.aiTriage?.requestFingerprint;
  return typeof value === "string" ? value : null;
}

function assertIncidentRetry(ticket: any, userId: string, fingerprint: string) {
  if (
    ticket?.requesterUserId !== userId ||
    ticket?.source !== "web_tester" ||
    storedIncidentFingerprint(ticket) !== fingerprint
  ) {
    throw new Error("TESTER_CLIENT_REFERENCE_CONFLICT");
  }
}

export function normalizeAllwainWebTesterFeedbackInput(
  value: unknown,
): AllwainWebTesterFeedbackInput {
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const submissionId = cleanLine(input.submissionId, 100);
  if (!SAFE_REFERENCE.test(submissionId)) throw new Error("INVALID_TESTER_SUBMISSION_ID");
  const schemaVersion = input.schemaVersion ?? 1;
  if (schemaVersion !== 1) {
    throw new Error("INVALID_TESTER_FEEDBACK_SCHEMA");
  }
  const rawAnswers = input.answers;
  if (!rawAnswers || typeof rawAnswers !== "object" || Array.isArray(rawAnswers)) {
    throw new Error("INVALID_TESTER_FEEDBACK_ANSWERS");
  }
  const entries = Object.entries(rawAnswers as Record<string, unknown>);
  const answerEntries = entries;
  if (answerEntries.length > Object.keys(FEEDBACK_SCHEMA_V1).length) {
    throw new Error("TOO_MANY_TESTER_FEEDBACK_ANSWERS");
  }
  const answers = Object.fromEntries(
    answerEntries.map(([key, answer]) => [key, normalizeFeedbackAnswer(key, answer)]),
  );
  if (input.comment !== undefined && input.comment !== null && typeof input.comment !== "string") {
    throw new Error("INVALID_TESTER_FEEDBACK_COMMENT");
  }
  const comment = cleanText(input.comment, 600) || null;
  if (comment && containsLikelyPrivateData(comment)) {
    throw new Error("TESTER_FEEDBACK_SENSITIVE_DATA");
  }
  if (!Object.keys(answers).length && (!comment || comment.length < 3)) {
    throw new Error("TESTER_FEEDBACK_CONTENT_REQUIRED");
  }
  const release = cleanLine(input.release, 80) || null;
  if (release && !SAFE_RELEASE.test(release)) throw new Error("INVALID_TESTER_RELEASE");
  return {
    submissionId,
    schemaVersion,
    locale: normalizeLocale(input.locale),
    release,
    answers,
    comment,
  };
}

function priorityForIncident(
  severity: AllwainWebTesterIncidentInput["severity"],
  triagePriority: string,
) {
  const rank: Record<string, number> = { low: 0, normal: 1, high: 2, urgent: 3 };
  const reported = severity === "blocking" ? "high" : severity;
  return (rank[triagePriority] || 0) > (rank[reported] || 0) ? triagePriority : reported;
}

export async function createAllwainWebTesterIncident(input: {
  identity: WebTesterIdentity;
  body: unknown;
  requestId?: string | null;
}) {
  requirePostgres();
  const incident = normalizeAllwainWebTesterIncidentInput(input.body);
  const prisma = getPrisma() as any;
  if (!await hasAllwainTesterFeedback(prisma, input.identity.id)) {
    throw new Error("TESTER_FEEDBACK_REQUIRED");
  }
  const fingerprint = incidentFingerprint(incident);
  const providerMessageId = `web-tester:${input.identity.id}:${incident.clientReference}`;
  const duplicate = await prisma.allwainSupportMessage.findUnique({
    where: { providerMessageId },
    include: { ticket: { include: { messages: { orderBy: { createdAt: "asc" } } } } },
  });
  if (duplicate) {
    if (duplicate.authorUserId !== input.identity.id) {
      throw new Error("TESTER_CLIENT_REFERENCE_CONFLICT");
    }
    assertIncidentRetry(duplicate.ticket, input.identity.id, fingerprint);
    return { incident: publicIncident(duplicate.ticket), deduplicated: true };
  }

  const subject = incident.subject || defaultIncidentSubject(incident.category, incident.target);
  const bodyText = incident.steps
    ? `${incident.description}\n\nPasos para reproducir:\n${incident.steps}`
    : incident.description;
  const triage = classifyAllwainSupportMessage(subject, bodyText);
  const now = new Date();
  let ticket: any;
  try {
    ticket = await prisma.$transaction(async (tx: any) => {
      const user = await lockActiveTesterUser(tx, input.identity.id);
      const created = await tx.allwainSupportTicket.create({
        data: {
          requesterUserId: input.identity.id,
          requesterEmail: user.email || input.identity.email,
          requesterName: cleanLine(user.name, 160) || null,
          subject,
          category: incident.category,
          priority: priorityForIncident(incident.severity, triage.priority),
          riskLevel: triage.riskLevel,
          status: "open",
          source: "web_tester",
          aiSummary: triage.summary,
          aiTriage: {
            ...triage,
            reportedCategory: incident.category,
            reportedSeverity: incident.severity,
            screen: incident.screen,
            locale: incident.locale,
            release: incident.release,
            target: incident.target,
            stepId: incident.stepId,
            platform: incident.platform,
            appVersion: incident.appVersion,
            requestFingerprint: fingerprint,
          },
          automationDisposition: "human_review",
          lastMessageAt: now,
        },
      });
      await tx.allwainSupportMessage.create({
        data: {
          ticketId: created.id,
          direction: "inbound",
          channel: "web",
          authorUserId: input.identity.id,
          fromEmail: user.email || input.identity.email,
          toEmail: ENV.ALLWAIN_SUPPORT_EMAIL,
          subject,
          bodyText,
          providerMessageId,
          status: "received",
          aiGenerated: false,
          requiresApproval: false,
          createdAt: now,
        },
      });
      await appendAllwainAuditEventTx(tx, {
        aggregateType: "support_ticket",
        aggregateId: created.id,
        eventType: "support.web_tester_incident_created",
        actorUserId: input.identity.id,
        actorRole: input.identity.role,
        source: "web_tester",
        requestId: input.requestId,
        payload: {
          channel: "web",
          category: incident.category,
          severity: incident.severity,
          screen: incident.screen,
          locale: incident.locale,
          release: incident.release,
          target: incident.target,
          stepId: incident.stepId,
          platform: incident.platform,
          appVersion: incident.appVersion,
        },
      });
      return tx.allwainSupportTicket.findUnique({
        where: { id: created.id },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
    });
  } catch (error: any) {
    if (error?.code === "P2002") {
      const duplicate = await prisma.allwainSupportMessage.findUnique({
        where: { providerMessageId },
        include: { ticket: { include: { messages: { orderBy: { createdAt: "asc" } } } } },
      });
      if (duplicate?.authorUserId === input.identity.id && duplicate.ticket) {
        assertIncidentRetry(duplicate.ticket, input.identity.id, fingerprint);
        return { incident: publicIncident(duplicate.ticket), deduplicated: true };
      }
    }
    throw error;
  }
  if (!ticket) throw new Error("SUPPORT_TICKET_NOT_FOUND");
  return { incident: publicIncident(ticket), deduplicated: false };
}

export async function listAllwainWebTesterIncidents(userId: string, limitValue?: unknown) {
  requirePostgres();
  const prisma = getPrisma() as any;
  if (!await hasAllwainTesterFeedback(prisma, userId)) {
    throw new Error("TESTER_FEEDBACK_REQUIRED");
  }
  const limit = Math.min(50, Math.max(1, Math.floor(Number(limitValue) || 25)));
  const rows = await prisma.allwainSupportTicket.findMany({
    where: { requesterUserId: userId, source: "web_tester" },
    orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
    take: limit,
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  return { items: rows.map(publicIncident) };
}

export async function saveAllwainWebTesterFeedback(input: {
  identity: WebTesterIdentity;
  body: unknown;
  requestId?: string | null;
}) {
  requirePostgres();
  const feedback = normalizeAllwainWebTesterFeedbackInput(input.body);
  const fingerprint = feedbackFingerprint(feedback);
  const prisma = getPrisma() as any;
  const event = await prisma.$transaction(async (tx: any) => {
    await lockActiveTesterUser(tx, input.identity.id);
    const aggregateType = "web_tester_feedback";
    const aggregateId = feedback.submissionId;
    const lockKey = `${aggregateType}:${aggregateId}`;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
    const existing = await tx.allwainAuditEvent.findFirst({
      where: {
        aggregateType,
        aggregateId,
        eventType: "web_tester.feedback_submitted",
      },
    });
    if (existing) {
      if (
        existing.actorUserId !== input.identity.id ||
        existing.payload?.requestFingerprint !== fingerprint
      ) {
        throw new Error("TESTER_SUBMISSION_ID_CONFLICT");
      }
      return { row: existing, deduplicated: true };
    }
    const row = await appendAllwainAuditEventTx(tx, {
      aggregateType,
      aggregateId,
      eventType: "web_tester.feedback_submitted",
      actorUserId: input.identity.id,
      actorRole: input.identity.role,
      source: "web_tester",
      requestId: input.requestId,
      providerEventId: feedback.submissionId,
      payload: {
        schemaVersion: feedback.schemaVersion,
        locale: feedback.locale,
        release: feedback.release,
        answers: feedback.answers,
        comment: feedback.comment,
        requestFingerprint: fingerprint,
      },
    });
    return { row, deduplicated: false };
  });
  return {
    receipt: {
      id: event.row.id,
      submissionId: event.row.aggregateId,
      submittedAt: serializeDate(event.row.occurredAt),
    },
    deduplicated: event.deduplicated,
  };
}

export async function listAllwainWebTesterFeedback(userId: string, limitValue?: unknown) {
  requirePostgres();
  const limit = Math.min(20, Math.max(1, Math.floor(Number(limitValue) || 10)));
  const rows = await (getPrisma() as any).allwainAuditEvent.findMany({
    where: {
      aggregateType: "web_tester_feedback",
      eventType: "web_tester.feedback_submitted",
      actorUserId: userId,
    },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: limit,
  });
  return {
    items: rows.map((row: any) => ({
      id: row.id,
      submissionId: row.aggregateId,
      submittedAt: serializeDate(row.occurredAt),
      schemaVersion: row.payload?.schemaVersion,
      locale: row.payload?.locale,
      release: row.payload?.release ?? null,
      answers: row.payload?.answers || {},
      comment: row.payload?.comment ?? null,
    })),
  };
}

function publicAppTesterProgress(row: any, stepId?: string) {
  if (!row) {
    return {
      stepId: stepId || null,
      status: "pending",
      platform: "unknown",
      appVersion: null,
      completedAt: null,
      updatedAt: null,
    };
  }
  return {
    stepId: row.stepId,
    status: row.status === "completed" ? "completed" : "pending",
    platform: TESTER_PLATFORMS.has(row.platform) ? row.platform : "unknown",
    appVersion: typeof row.appVersion === "string" ? row.appVersion : null,
    completedAt: serializeDate(row.completedAt),
    updatedAt: serializeDate(row.updatedAt),
  };
}

function publicAppTesterActionProgress(
  row: any,
  stepId?: string,
  actionId?: string,
  completedRouteFallback?: any,
) {
  if (!row) {
    if (completedRouteFallback?.status === "completed") {
      return {
        stepId: stepId || completedRouteFallback.stepId || null,
        actionId: actionId || null,
        status: "completed",
        platform: TESTER_PLATFORMS.has(completedRouteFallback.platform)
          ? completedRouteFallback.platform
          : "unknown",
        appVersion: typeof completedRouteFallback.appVersion === "string"
          ? completedRouteFallback.appVersion
          : null,
        completedAt: serializeDate(completedRouteFallback.completedAt),
        updatedAt: serializeDate(completedRouteFallback.updatedAt),
      };
    }
    return {
      stepId: stepId || null,
      actionId: actionId || null,
      status: "pending",
      platform: "unknown",
      appVersion: null,
      completedAt: null,
      updatedAt: null,
    };
  }
  return {
    stepId: row.stepId,
    actionId: row.actionId,
    status: row.status === "completed" ? "completed" : "pending",
    platform: TESTER_PLATFORMS.has(row.platform) ? row.platform : "unknown",
    appVersion: typeof row.appVersion === "string" ? row.appVersion : null,
    completedAt: serializeDate(row.completedAt),
    updatedAt: serializeDate(row.updatedAt),
  };
}

async function findLatestAllwainTesterFeedback(client: any, userId: string) {
  return client.allwainAuditEvent.findFirst({
    where: {
      aggregateType: "web_tester_feedback",
      eventType: "web_tester.feedback_submitted",
      actorUserId: userId,
    },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
  });
}

async function hasAllwainTesterFeedback(client: any, userId: string) {
  return Boolean(await findLatestAllwainTesterFeedback(client, userId));
}

function preferredRoleFromFeedback(feedback: any) {
  const role = feedback?.payload?.answers?.papel;
  return ["buyer", "seller", "connector", "observer"].includes(role) ? role : null;
}

export async function getAllwainAppTesterState(userId: string) {
  requirePostgres();
  const prisma = getPrisma() as any;
  const [latestFeedback, rows, actionRows] = await Promise.all([
    findLatestAllwainTesterFeedback(prisma, userId),
    prisma.allwainAppTesterProgress.findMany({
      where: { userId, programId: ALLWAIN_APP_TESTER_PROGRAM_ID },
      orderBy: [{ completedAt: "asc" }, { stepId: "asc" }],
    }),
    prisma.allwainAppTesterActionProgress.findMany({
      where: { userId, programId: ALLWAIN_APP_TESTER_PROGRAM_ID },
      orderBy: [{ stepId: "asc" }, { actionId: "asc" }],
    }),
  ]);
  const progressByStep = new Map(rows.map((row: any) => [row.stepId, row]));
  const actionProgressByKey = new Map(
    actionRows.map((row: any) => [`${row.stepId}:${row.actionId}`, row]),
  );
  const items = ALLWAIN_APP_TESTER_STEP_IDS.map((stepId) => {
    const routeProgress = progressByStep.get(stepId);
    const actions = ALLWAIN_APP_TESTER_ACTION_IDS.map((actionId) =>
      publicAppTesterActionProgress(
        actionProgressByKey.get(`${stepId}:${actionId}`),
        stepId,
        actionId,
        routeProgress,
      ));
    return {
      ...publicAppTesterProgress(routeProgress, stepId),
      actions,
      completedActionCount: actions.filter((action) => action.status === "completed").length,
      totalActionCount: ALLWAIN_APP_TESTER_ACTION_IDS.length,
    };
  });
  const completedCount = items.filter((item) => item.status === "completed").length;
  const completedActionCount = items.reduce(
    (total, item) => total + item.completedActionCount,
    0,
  );
  return {
    qualified: Boolean(latestFeedback),
    profile: { preferredRole: preferredRoleFromFeedback(latestFeedback) },
    program: {
      id: ALLWAIN_APP_TESTER_PROGRAM_ID,
      steps: [...ALLWAIN_APP_TESTER_STEP_IDS],
      actionsPerStep: [...ALLWAIN_APP_TESTER_ACTION_IDS],
      totalActions: ALLWAIN_APP_TESTER_STEP_IDS.length * ALLWAIN_APP_TESTER_ACTION_IDS.length,
    },
    progress: {
      items,
      completedCount,
      totalCount: ALLWAIN_APP_TESTER_STEP_IDS.length,
      completedActionCount,
      totalActionCount: ALLWAIN_APP_TESTER_STEP_IDS.length * ALLWAIN_APP_TESTER_ACTION_IDS.length,
    },
  };
}

export async function completeAllwainAppTesterStep(input: {
  identity: WebTesterIdentity;
  stepId: unknown;
  body: unknown;
  requestId?: string | null;
}) {
  requirePostgres();
  const stepId = normalizeAllwainAppTesterStepId(input.stepId);
  const progress = normalizeAllwainAppTesterProgressInput(input.body);
  const fingerprint = requestFingerprint({
    programId: ALLWAIN_APP_TESTER_PROGRAM_ID,
    stepId,
    status: progress.status,
    platform: progress.platform,
    appVersion: progress.appVersion,
  });
  const prisma = getPrisma() as any;
  return prisma.$transaction(async (tx: any) => {
    await lockActiveTesterUser(tx, input.identity.id);
    if (!await hasAllwainTesterFeedback(tx, input.identity.id)) {
      throw new Error("TESTER_FEEDBACK_REQUIRED");
    }

    const aggregateType = "app_tester_progress_request";
    const aggregateId = progress.clientReference;
    const referenceLock = `${aggregateType}:${aggregateId}`;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${referenceLock}))`);
    const existingRequest = await tx.allwainAuditEvent.findFirst({
      where: {
        aggregateType,
        aggregateId,
        eventType: "app_tester.progress_completed",
      },
    });
    if (existingRequest) {
      if (
        existingRequest.actorUserId !== input.identity.id ||
        existingRequest.payload?.requestFingerprint !== fingerprint
      ) {
        throw new Error("TESTER_PROGRESS_REFERENCE_CONFLICT");
      }
      const existingProgress = await tx.allwainAppTesterProgress.findUnique({
        where: {
          userId_programId_stepId: {
            userId: input.identity.id,
            programId: ALLWAIN_APP_TESTER_PROGRAM_ID,
            stepId,
          },
        },
      });
      if (!existingProgress) throw new Error("TESTER_PROGRESS_NOT_FOUND");
      return {
        qualified: true,
        program: { id: ALLWAIN_APP_TESTER_PROGRAM_ID },
        progress: { item: publicAppTesterProgress(existingProgress) },
        deduplicated: true,
      };
    }

    const completedAt = new Date();
    const saved = await tx.allwainAppTesterProgress.upsert({
      where: {
        userId_programId_stepId: {
          userId: input.identity.id,
          programId: ALLWAIN_APP_TESTER_PROGRAM_ID,
          stepId,
        },
      },
      create: {
        userId: input.identity.id,
        programId: ALLWAIN_APP_TESTER_PROGRAM_ID,
        stepId,
        status: "completed",
        platform: progress.platform,
        appVersion: progress.appVersion,
        clientReference: progress.clientReference,
        completedAt,
      },
      update: {
        status: "completed",
        platform: progress.platform,
        appVersion: progress.appVersion,
        clientReference: progress.clientReference,
      },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateType,
      aggregateId,
      eventType: "app_tester.progress_completed",
      actorUserId: input.identity.id,
      actorRole: input.identity.role,
      source: "app_tester",
      requestId: input.requestId,
      providerEventId: progress.clientReference,
      payload: {
        programId: ALLWAIN_APP_TESTER_PROGRAM_ID,
        stepId,
        status: "completed",
        platform: progress.platform,
        appVersion: progress.appVersion,
        requestFingerprint: fingerprint,
      },
    });
    return {
      qualified: true,
      program: { id: ALLWAIN_APP_TESTER_PROGRAM_ID },
      progress: { item: publicAppTesterProgress(saved) },
      deduplicated: false,
    };
  });
}

export async function updateAllwainAppTesterAction(input: {
  identity: WebTesterIdentity;
  stepId: unknown;
  actionId: unknown;
  body: unknown;
  requestId?: string | null;
}) {
  requirePostgres();
  const stepId = normalizeAllwainAppTesterStepId(input.stepId);
  const actionId = normalizeAllwainAppTesterActionId(input.actionId);
  const progress = normalizeAllwainAppTesterActionProgressInput(input.body);
  const fingerprint = requestFingerprint({
    programId: ALLWAIN_APP_TESTER_PROGRAM_ID,
    stepId,
    actionId,
    status: progress.status,
    platform: progress.platform,
    appVersion: progress.appVersion,
  });
  const prisma = getPrisma() as any;
  return prisma.$transaction(async (tx: any) => {
    await lockActiveTesterUser(tx, input.identity.id);
    if (!await hasAllwainTesterFeedback(tx, input.identity.id)) {
      throw new Error("TESTER_FEEDBACK_REQUIRED");
    }

    const aggregateType = "app_tester_action_request";
    const aggregateId = progress.clientReference;
    const referenceLock = `${aggregateType}:${aggregateId}`;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${referenceLock}))`);
    const existingRequest = await tx.allwainAuditEvent.findFirst({
      where: {
        aggregateType,
        aggregateId,
        eventType: "app_tester.action_updated",
      },
    });
    if (existingRequest) {
      if (
        existingRequest.actorUserId !== input.identity.id ||
        existingRequest.payload?.requestFingerprint !== fingerprint
      ) {
        throw new Error("TESTER_ACTION_REFERENCE_CONFLICT");
      }
      const existingProgress = await tx.allwainAppTesterActionProgress.findUnique({
        where: {
          userId_programId_stepId_actionId: {
            userId: input.identity.id,
            programId: ALLWAIN_APP_TESTER_PROGRAM_ID,
            stepId,
            actionId,
          },
        },
      });
      if (!existingProgress) throw new Error("TESTER_ACTION_NOT_FOUND");
      return {
        qualified: true,
        program: { id: ALLWAIN_APP_TESTER_PROGRAM_ID },
        progress: { item: publicAppTesterActionProgress(existingProgress) },
        deduplicated: true,
      };
    }

    const completedAt = progress.status === "completed" ? new Date() : null;
    const saved = await tx.allwainAppTesterActionProgress.upsert({
      where: {
        userId_programId_stepId_actionId: {
          userId: input.identity.id,
          programId: ALLWAIN_APP_TESTER_PROGRAM_ID,
          stepId,
          actionId,
        },
      },
      create: {
        userId: input.identity.id,
        programId: ALLWAIN_APP_TESTER_PROGRAM_ID,
        stepId,
        actionId,
        status: progress.status,
        platform: progress.platform,
        appVersion: progress.appVersion,
        clientReference: progress.clientReference,
        completedAt,
      },
      update: {
        status: progress.status,
        platform: progress.platform,
        appVersion: progress.appVersion,
        clientReference: progress.clientReference,
        completedAt,
      },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateType,
      aggregateId,
      eventType: "app_tester.action_updated",
      actorUserId: input.identity.id,
      actorRole: input.identity.role,
      source: "app_tester",
      requestId: input.requestId,
      providerEventId: progress.clientReference,
      payload: {
        programId: ALLWAIN_APP_TESTER_PROGRAM_ID,
        stepId,
        actionId,
        status: progress.status,
        platform: progress.platform,
        appVersion: progress.appVersion,
        requestFingerprint: fingerprint,
      },
    });
    return {
      qualified: true,
      program: { id: ALLWAIN_APP_TESTER_PROGRAM_ID },
      progress: { item: publicAppTesterActionProgress(saved) },
      deduplicated: false,
    };
  });
}
