import crypto from "crypto";
import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";
import { AuthUser } from "../shared/types";
import { listCourseProgress, listCourseSubmissions } from "./course-campus.service";
import { fetchBoundedJson } from "../security/external-http";

const COURSE_NAME = "Newmersive Robot Lab Professional";
const COURSE_MODULE_COUNT = 14;

const memory = {
  paymentEvents: [] as any[],
  payments: [] as any[],
  certificates: [] as any[],
  tickets: [] as any[],
  analytics: [] as any[],
};

function usePostgres() {
  return ENV.STORAGE_DRIVER === "postgres";
}

function nowIso() {
  return new Date().toISOString();
}

function serialize<T extends Record<string, any>>(row: T | null): T | null {
  if (!row) return null;
  const result: Record<string, any> = { ...row };
  for (const key of ["createdAt", "updatedAt", "processedAt", "issuedAt", "revokedAt", "resolvedAt"]) {
    if (result[key] instanceof Date) result[key] = result[key].toISOString();
  }
  return result as T;
}

export async function claimCoursePaymentEvent(input: {
  providerEventId: string;
  type: string;
  metadata?: Record<string, unknown>;
}) {
  if (!usePostgres()) {
    const existing = memory.paymentEvents.find((item) => item.providerEventId === input.providerEventId);
    if (existing?.status === "failed") {
      Object.assign(existing, { status: "processing", error: null, processedAt: null });
      return { claimed: true, event: existing };
    }
    if (existing) return { claimed: false, event: existing };
    const event = { id: crypto.randomUUID(), ...input, status: "processing", createdAt: nowIso(), processedAt: null, error: null };
    memory.paymentEvents.push(event);
    return { claimed: true, event };
  }

  const prisma = getPrisma() as any;
  const existing = await prisma.coursePaymentEvent.findUnique({ where: { providerEventId: input.providerEventId } });
  if (existing?.status === "failed") {
    const event = await prisma.coursePaymentEvent.update({
      where: { providerEventId: input.providerEventId },
      data: { status: "processing", error: null, processedAt: null },
    });
    return { claimed: true, event: serialize(event) };
  }
  if (existing) return { claimed: false, event: serialize(existing) };
  try {
    const event = await prisma.coursePaymentEvent.create({ data: { ...input, status: "processing" } });
    return { claimed: true, event: serialize(event) };
  } catch (error: any) {
    if (error?.code !== "P2002") throw error;
    const event = await prisma.coursePaymentEvent.findUnique({ where: { providerEventId: input.providerEventId } });
    return { claimed: false, event: serialize(event) };
  }
}

export async function finishCoursePaymentEvent(providerEventId: string, status: "processed" | "ignored" | "failed", error?: string) {
  if (!usePostgres()) {
    const event = memory.paymentEvents.find((item) => item.providerEventId === providerEventId);
    if (event) Object.assign(event, { status, error: error || null, processedAt: nowIso() });
    return event || null;
  }
  return serialize(await (getPrisma() as any).coursePaymentEvent.update({
    where: { providerEventId },
    data: { status, error: error?.slice(0, 500) || null, processedAt: new Date() },
  }));
}

export async function upsertCoursePayment(input: {
  checkoutSessionId: string;
  paymentIntentId?: string | null;
  userId?: string | null;
  email: string;
  plan: string;
  entitlement: string;
  status: string;
  amountTotal?: number | null;
  currency?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (!usePostgres()) {
    const existing = memory.payments.find((item) => item.checkoutSessionId === input.checkoutSessionId);
    if (existing) {
      Object.assign(existing, input, { updatedAt: nowIso() });
      return existing;
    }
    const payment = { id: crypto.randomUUID(), provider: "stripe", ...input, createdAt: nowIso(), updatedAt: nowIso() };
    memory.payments.push(payment);
    return payment;
  }
  return serialize(await (getPrisma() as any).coursePayment.upsert({
    where: { checkoutSessionId: input.checkoutSessionId },
    create: { provider: "stripe", ...input },
    update: input,
  }));
}

export async function getCoursePaymentBySession(checkoutSessionId: string) {
  if (!usePostgres()) return memory.payments.find((item) => item.checkoutSessionId === checkoutSessionId) || null;
  return serialize(await (getPrisma() as any).coursePayment.findUnique({ where: { checkoutSessionId } }));
}

export async function getCoursePaymentByIntent(paymentIntentId: string) {
  if (!usePostgres()) return memory.payments.find((item) => item.paymentIntentId === paymentIntentId) || null;
  return serialize(await (getPrisma() as any).coursePayment.findFirst({ where: { paymentIntentId } }));
}

export async function updateCoursePaymentStatus(checkoutSessionId: string, status: string, metadata?: Record<string, unknown>) {
  if (!usePostgres()) {
    const payment = memory.payments.find((item) => item.checkoutSessionId === checkoutSessionId);
    if (payment) Object.assign(payment, { status, metadata: { ...(payment.metadata || {}), ...(metadata || {}) }, updatedAt: nowIso() });
    return payment || null;
  }
  return serialize(await (getPrisma() as any).coursePayment.update({
    where: { checkoutSessionId },
    data: { status, metadata },
  }));
}

export async function getCourseCertificateEligibility(user: AuthUser) {
  const [progress, submissions] = await Promise.all([
    listCourseProgress(user.id),
    listCourseSubmissions(user.id, 200),
  ]);
  const completedModules = new Set(
    progress.filter((item: any) => item.status === "completed" && Number(item.percent) >= 100).map((item: any) => item.moduleId)
  );
  const approvedSubmissions = submissions.filter((item: any) => item.status === "approved").length;
  const hasProfessionalAccess = user.role === "admin" || (user.entitlements || []).some((item) =>
    ["course_professional", "mentoring_premium", "admin_course"].includes(item)
  );
  const missingModules = Array.from({ length: COURSE_MODULE_COUNT }, (_value, index) => index)
    .filter((moduleId) => !completedModules.has(moduleId));

  return {
    eligible: hasProfessionalAccess && missingModules.length === 0 && approvedSubmissions > 0,
    hasProfessionalAccess,
    completedModules: completedModules.size,
    requiredModules: COURSE_MODULE_COUNT,
    approvedSubmissions,
    missingModules,
  };
}

export async function getCourseCertificateByUser(userId: string) {
  if (!usePostgres()) return memory.certificates.find((item) => item.userId === userId) || null;
  return serialize(await (getPrisma() as any).courseCertificate.findUnique({ where: { userId } }));
}

export async function getCourseCertificateByCode(verificationCode: string) {
  if (!usePostgres()) return memory.certificates.find((item) => item.verificationCode === verificationCode) || null;
  return serialize(await (getPrisma() as any).courseCertificate.findUnique({ where: { verificationCode } }));
}

export async function issueCourseCertificate(input: { userId: string; studentName: string; metadata?: Record<string, unknown> }) {
  const existing = await getCourseCertificateByUser(input.userId);
  if (existing && !existing.revokedAt) return existing;
  const verificationCode = `NRL-${new Date().getUTCFullYear()}-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
  if (!usePostgres()) {
    const certificate = {
      id: existing?.id || crypto.randomUUID(),
      userId: input.userId,
      verificationCode,
      studentName: input.studentName,
      courseName: COURSE_NAME,
      metadata: input.metadata || null,
      issuedAt: nowIso(),
      revokedAt: null,
    };
    if (existing) Object.assign(existing, certificate); else memory.certificates.push(certificate);
    return certificate;
  }
  return serialize(await (getPrisma() as any).courseCertificate.upsert({
    where: { userId: input.userId },
    create: { ...input, verificationCode, courseName: COURSE_NAME },
    update: { studentName: input.studentName, verificationCode, metadata: input.metadata, issuedAt: new Date(), revokedAt: null },
  }));
}

export async function createCourseSupportTicket(input: {
  userId: string;
  category: string;
  subject: string;
  message: string;
  priority: string;
  aiTriage: Record<string, unknown>;
}) {
  if (!usePostgres()) {
    const ticket = { id: crypto.randomUUID(), ...input, status: "open", adminNotes: null, assignedTo: null, resolvedAt: null, createdAt: nowIso(), updatedAt: nowIso() };
    memory.tickets.unshift(ticket);
    return ticket;
  }
  return serialize(await (getPrisma() as any).courseSupportTicket.create({ data: { ...input, status: "open" } }));
}

export async function listCourseSupportTickets(userId?: string) {
  if (!usePostgres()) return memory.tickets.filter((item) => !userId || item.userId === userId);
  return (await (getPrisma() as any).courseSupportTicket.findMany({
    where: userId ? { userId } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
  })).map(serialize);
}

export async function updateCourseSupportTicket(id: string, input: { status?: string; adminNotes?: string; assignedTo?: string }) {
  const data = {
    status: input.status,
    adminNotes: input.adminNotes?.slice(0, 4_000),
    assignedTo: input.assignedTo?.slice(0, 120),
    resolvedAt: input.status === "resolved" || input.status === "closed" ? new Date() : null,
  };
  if (!usePostgres()) {
    const ticket = memory.tickets.find((item) => item.id === id);
    if (!ticket) return null;
    Object.assign(ticket, data, { updatedAt: nowIso(), resolvedAt: data.resolvedAt?.toISOString() || null });
    return ticket;
  }
  const existing = await (getPrisma() as any).courseSupportTicket.findUnique({ where: { id } });
  if (!existing) return null;
  return serialize(await (getPrisma() as any).courseSupportTicket.update({ where: { id }, data }));
}

const ANALYTICS_NAMES = new Set([
  "campus.view",
  "lesson.completed",
  "submission.created",
  "certificate.issued",
  "support.created",
  "checkout.started",
  "client.error",
]);

export async function recordCourseAnalytics(input: { userId?: string | null; name: string; metadata?: Record<string, unknown> }) {
  if (!ANALYTICS_NAMES.has(input.name)) throw new Error("INVALID_ANALYTICS_EVENT");
  const data = { userId: input.userId || null, name: input.name, metadata: input.metadata || null };
  if (!usePostgres()) {
    const event = { id: crypto.randomUUID(), ...data, createdAt: nowIso() };
    memory.analytics.push(event);
    return event;
  }
  return serialize(await (getPrisma() as any).courseAnalyticsEvent.create({ data }));
}

export async function triageCourseSupport(input: { category: string; subject: string; message: string }) {
  const fallback = fallbackSupportTriage(input);
  if (!ENV.OPENAI_API_KEY) return { ...fallback, fallback: true };
  try {
    const { response, data } = await fetchBoundedJson<any>(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${ENV.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
        model: ENV.COURSE_OPENAI_MODEL,
        temperature: 0.15,
        max_tokens: 350,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Clasifica soporte de un campus tecnico. Devuelve JSON con priority (low|normal|high|urgent), summary, first_response y escalate. No prometas rentabilidad ni des asesoramiento financiero." },
          { role: "user", content: JSON.stringify(input) },
        ],
        }),
      },
      {
        service: "OPENAI_COURSE_SUPPORT",
        timeoutMs: ENV.AI_REQUEST_TIMEOUT_MS,
        maxResponseBytes: ENV.AI_RESPONSE_MAX_BYTES,
      },
    );
    if (!response.ok) throw new Error(data?.error?.message || `OPENAI_${response.status}`);
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content || "{}");
    const priority = ["low", "normal", "high", "urgent"].includes(parsed.priority) ? parsed.priority : fallback.priority;
    return {
      priority,
      summary: String(parsed.summary || fallback.summary).slice(0, 500),
      first_response: String(parsed.first_response || fallback.first_response).slice(0, 1_500),
      escalate: Boolean(parsed.escalate),
      fallback: false,
    };
  } catch {
    return { ...fallback, fallback: true };
  }
}

function fallbackSupportTriage(input: { category: string; subject: string; message: string }) {
  const text = `${input.subject} ${input.message}`.toLowerCase();
  const urgent = /pago duplicado|fraude|cuenta bloqueada|seguridad|credencial|no puedo entrar/.test(text);
  const high = urgent || /stripe|pago|acceso|error|entrega perdida/.test(text);
  return {
    priority: urgent ? "urgent" : high ? "high" : "normal",
    summary: `${input.category}: ${input.subject}`,
    first_response: "He registrado el caso y he separado el problema de acceso, contenido o evaluacion. Revisa primero el estado mostrado en el campus; el expediente queda disponible para seguimiento humano si la reparacion automatica no basta.",
    escalate: high,
  };
}

export async function getCourseOperationsDashboard() {
  if (!usePostgres()) {
    return {
      configuration: configurationStatus(),
      payments: { total: memory.payments.length, paid: memory.payments.filter((item) => item.status === "paid").length, refunded: memory.payments.filter((item) => item.status === "refunded").length },
      support: { open: memory.tickets.filter((item) => item.status === "open").length, total: memory.tickets.length },
      certificates: memory.certificates.filter((item) => !item.revokedAt).length,
      analytics: summarizeAnalytics(memory.analytics),
    };
  }

  const prisma = getPrisma() as any;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000);
  const [payments, paid, refunded, openTickets, ticketTotal, certificateCount, emailSent, emailFailed, emailQueued, events] = await Promise.all([
    prisma.coursePayment.count(),
    prisma.coursePayment.count({ where: { status: "paid" } }),
    prisma.coursePayment.count({ where: { status: "refunded" } }),
    prisma.courseSupportTicket.count({ where: { status: { in: ["open", "in_progress"] } } }),
    prisma.courseSupportTicket.count(),
    prisma.courseCertificate.count({ where: { revokedAt: null } }),
    prisma.courseEmailDelivery.count({ where: { status: "sent", createdAt: { gte: since } } }),
    prisma.courseEmailDelivery.count({ where: { status: "failed", createdAt: { gte: since } } }),
    prisma.courseEmailDelivery.count({ where: { status: "queued", createdAt: { gte: since } } }),
    prisma.courseAnalyticsEvent.findMany({ where: { createdAt: { gte: since } }, select: { name: true } }),
  ]);

  return {
    configuration: configurationStatus(),
    payments: { total: payments, paid, refunded },
    support: { open: openTickets, total: ticketTotal },
    certificates: certificateCount,
    email: { sent: emailSent, failed: emailFailed, queued: emailQueued },
    analytics: summarizeAnalytics(events),
  };
}

function summarizeAnalytics(events: Array<{ name: string }>) {
  const byName: Record<string, number> = {};
  for (const event of events) byName[event.name] = (byName[event.name] || 0) + 1;
  return { last30Days: events.length, byName };
}

function configurationStatus() {
  return {
    stripe: Boolean(ENV.STRIPE_SECRET_KEY && ENV.STRIPE_WEBHOOK_SECRET && ENV.STRIPE_PRICE_STARTER && ENV.STRIPE_PRICE_PROFESSIONAL),
    smtp: Boolean(ENV.SMTP_HOST && ENV.SMTP_USER && ENV.SMTP_PASS),
    openai: Boolean(ENV.OPENAI_API_KEY),
    legalIdentity: Boolean(ENV.COURSE_LEGAL_NAME && ENV.COURSE_LEGAL_TAX_ID && ENV.COURSE_LEGAL_ADDRESS),
    offsiteBackup: Boolean(ENV.COURSE_BACKUP_REMOTE),
  };
}
