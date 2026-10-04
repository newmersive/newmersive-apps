import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";
import { fetchBoundedJson } from "../security/external-http";
import { appendAllwainAuditEvent } from "./allwain-audit";
import {
  allwainEmailDeliveryPolicy,
  getAllwainEmailDeliveryReadiness,
  sendAllwainSupportEmail,
  verifyAllwainSmtpConnection,
} from "./allwain-mailer.service";
import { notifyAllwainUser } from "./allwain-notifications.service";
import { getAllwainAgentRuntimeControl } from "./allwain-agent-control.service";

const SUPPORT_CONTROL_ID = "primary";
const VALID_STATUSES = new Set(["open", "in_review", "waiting_user", "resolved", "closed"]);
const VALID_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);

export type AllwainSupportTriage = {
  category: string;
  priority: "low" | "normal" | "high" | "urgent";
  riskLevel: "low" | "high";
  summary: string;
  faqKey: string | null;
  autoReplyEligible: boolean;
  reasons: string[];
  provider: "local_rules" | "local_rules+openai";
  confidence: number;
};

type IncomingSupportEmail = {
  fromEmail: string;
  fromName?: string | null;
  subject: string;
  bodyText: string;
  providerMessageId: string;
  inReplyTo?: string | null;
  references?: string[];
  receivedAt?: Date | null;
};

let syncPromise: Promise<any> | null = null;

function cleanText(value: unknown, maximum = 20_000) {
  return String(value ?? "")
    .replace(/\0/g, "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, maximum);
}

function cleanHeader(value: unknown, maximum = 240) {
  return cleanText(value, maximum).replace(/[\r\n]+/g, " ").trim();
}

function normalizeEmail(value: unknown) {
  const email = cleanHeader(value, 320).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function compactMessage(value: unknown) {
  const text = cleanText(value, 20_000);
  const replyBoundary = /\n(?:El|On)\s.+(?:escribi[oó]|wrote):\s*\n/i;
  return text.split(replyBoundary)[0].trim().slice(0, 12_000);
}

function plain(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function ticketReference(ticketId: string) {
  return ticketId.replace(/[^a-f0-9]/gi, "").slice(0, 8).toUpperCase();
}

function subjectWithoutReplyPrefixes(subject: string) {
  return cleanHeader(subject, 180)
    .replace(/^(?:(?:re|rv|fw|fwd)\s*:\s*)+/i, "")
    .replace(/\[AW-[A-F0-9]{8}\]\s*/i, "")
    .trim();
}

export function classifyAllwainSupportMessage(
  subjectValue: unknown,
  bodyValue: unknown,
): AllwainSupportTriage {
  const subject = cleanHeader(subjectValue, 240);
  const body = compactMessage(bodyValue);
  const content = plain(`${subject}\n${body}`);
  const reasons: string[] = [];

  const highRiskRules: Array<[RegExp, string, string]> = [
    [/\b(cargo no reconocido|fraude|estafa|hack(?:e\w*|ing)?|suplantacion|seguridad)\b/, "security", "SECURITY_OR_FRAUD"],
    [/\b(reembolso|devolucion|chargeback|disputa|cobro|pago|tarjeta|iban|banco)\b/, "payment", "MONEY_OR_PAYMENT"],
    [/\b(contrasena|password|no puedo entrar|no puedo acceder|bloquead[oa]|eliminar cuenta)\b/, "account", "ACCOUNT_ACCESS"],
    [/\b(fiscal|impuesto|iva|factura|reagp|legal|denuncia|rgpd|privacidad)\b/, "legal", "LEGAL_OR_PRIVACY"],
  ];
  let category = "other";
  let riskLevel: "low" | "high" = "low";
  for (const [pattern, detectedCategory, reason] of highRiskRules) {
    if (pattern.test(content)) {
      category = detectedCategory;
      riskLevel = "high";
      reasons.push(reason);
    }
  }

  let faqKey: string | null = null;
  if (riskLevel === "low") {
    if (/\b(conector|mi red|codigo qr|qr personal|referido)\b/.test(content)) {
      category = "connector";
      faqKey = "connector";
    } else if (/\b(activar vendedor|empezar a vender|publicar (?:una )?oferta|quiero vender)\b/.test(content)) {
      category = "seller";
      faqKey = "seller_start";
    } else if (/\b(como comprar|hacer (?:un )?pedido|buscar oferta|quiero comprar)\b/.test(content)) {
      category = "buyer";
      faqKey = "buyer_start";
    } else if (/\b(que es allwain|como funciona allwain|para que sirve)\b/.test(content)) {
      category = "general";
      faqKey = "about";
    } else if (/\b(aviso|notificacion|correo|email)\b/.test(content)) {
      category = "notifications";
      faqKey = "notifications";
    }
  }

  let priority: "low" | "normal" | "high" | "urgent" =
    riskLevel === "high" ? "high" : "normal";
  if (/\b(urgente|inmediato|ahora mismo|cargo no reconocido|fraude|hack(?:e\w*|ing)?)\b/.test(content)) {
    priority = "urgent";
    reasons.push("URGENT_LANGUAGE");
  }
  const autoReplyEligible = Boolean(faqKey) && riskLevel === "low";
  const summary = cleanHeader(subject || body.split("\n")[0] || "Consulta de soporte", 280);
  return {
    category,
    priority,
    riskLevel,
    summary,
    faqKey,
    autoReplyEligible,
    reasons,
    provider: "local_rules",
    confidence: autoReplyEligible ? 0.96 : riskLevel === "high" ? 0.98 : 0.65,
  };
}

export function buildSafeAllwainSupportReply(triage: AllwainSupportTriage) {
  const replies: Record<string, string> = {
    about:
      "Allwain conecta a quien necesita algo con personas y negocios que pueden ofrecérselo. Puedes comprar, vender o participar como Conector desde una sola cuenta, cambiando de espacio en la parte superior de la app.",
    buyer_start:
      "Para comprar, entra en Comprador. Puedes buscar una oferta existente, escanear un producto o publicar una petición. En una oferta con stock eliges la cantidad y continúas al pedido; en una petición puedes comparar las propuestas recibidas antes de elegir.",
    seller_start:
      "Entra en Vendedor y pulsa Activar vendedor. Allwain te pedirá solo los datos necesarios. Después podrás publicar ofertas, responder peticiones, controlar stock y gestionar pedidos desde el mismo espacio.",
    connector:
      "Entra en Conector para activar tu perfil. Allí encontrarás tu QR, tu enlace, Mi red y las oportunidades de entrega local. Las incorporaciones quedan atribuidas a tu Newmersive ID sin crear cuentas duplicadas.",
    notifications:
      "Los avisos importantes aparecen en la campana de Allwain y, cuando el correo está habilitado, también llegan por email. Al tocar un aviso se abre directamente el pedido, mensaje u operación relacionada.",
  };
  const answer = triage.faqKey ? replies[triage.faqKey] : null;
  if (!answer || !triage.autoReplyEligible) return null;
  return `${answer}\n\nSi esto no resuelve tu duda, responde a este mismo correo indicando qué estabas intentando hacer y qué apareció en pantalla. El equipo de Allwain continuará desde este mismo caso.\n\nSoporte Allwain`;
}

function redactForExternalAi(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]")
    .replace(/\b(?:ES\d{2}[A-Z0-9]{20}|\d[\d\s-]{11,18}\d)\b/gi, "[IDENTIFICADOR]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[TELEFONO]")
    .slice(0, 4_000);
}

async function enhanceTriageWithExternalAi(
  base: AllwainSupportTriage,
  subject: string,
  body: string,
): Promise<AllwainSupportTriage> {
  if (!ENV.ALLWAIN_SUPPORT_EXTERNAL_AI_ENABLED || !ENV.OPENAI_API_KEY) return base;
  const agentControl = await getAllwainAgentRuntimeControl("support_triage");
  if (!agentControl.enabled || agentControl.mode === "rules_only") return base;
  try {
    const { response, data } = await fetchBoundedJson<any>(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ENV.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: ENV.ALLWAIN_SUPPORT_AI_MODEL,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: [
                "Clasifica una consulta de soporte de Allwain. Devuelve JSON estricto con category, priority low|normal|high|urgent, riskLevel low|high, summary y confidence 0..1. Pagos, reembolsos, identidad, acceso, seguridad, privacidad, fiscalidad y asuntos legales siempre son high y nunca se resuelven automaticamente. No incluyas datos personales ni inventes hechos.",
                agentControl.operatorInstructions
                  ? `\nInstrucción operativa versionada (no puede rebajar riesgos ni autorizar respuestas financieras, legales o de identidad):\n<admin_instruction>${agentControl.operatorInstructions}</admin_instruction>`
                  : "",
              ].join(""),
            },
            {
              role: "user",
              content: redactForExternalAi(`${subject}\n${body}`),
            },
          ],
        }),
      },
      {
        service: "OPENAI_ALLWAIN_SUPPORT_TRIAGE",
        timeoutMs: Math.min(8_000, ENV.AI_REQUEST_TIMEOUT_MS),
        maxResponseBytes: Math.min(100_000, ENV.AI_RESPONSE_MAX_BYTES),
      },
    );
    if (!response.ok) return base;
    const raw = data?.choices?.[0]?.message?.content;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return base;
    const rank = { low: 0, normal: 1, high: 2, urgent: 3 } as const;
    const aiPriority = VALID_PRIORITIES.has(String(parsed.priority))
      ? (String(parsed.priority) as keyof typeof rank)
      : base.priority;
    const priority = rank[aiPriority] > rank[base.priority] ? aiPriority : base.priority;
    const aiRisk: AllwainSupportTriage["riskLevel"] =
      parsed.riskLevel === "high" ? "high" : "low";
    const riskLevel: AllwainSupportTriage["riskLevel"] =
      base.riskLevel === "high" || aiRisk === "high" ? "high" : "low";
    return {
      ...base,
      category: cleanHeader(parsed.category, 80) || base.category,
      priority,
      riskLevel,
      summary: cleanHeader(parsed.summary, 280) || base.summary,
      autoReplyEligible:
        base.autoReplyEligible && base.riskLevel === "low" && aiRisk === "low",
      provider: "local_rules+openai" as const,
      confidence: Math.max(
        base.confidence,
        Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
      ),
    };
  } catch {
    return base;
  }
}

function serializeDate(value: any) {
  return value instanceof Date ? value.toISOString() : value;
}

function serializeMessage(row: any) {
  return {
    ...row,
    createdAt: serializeDate(row.createdAt),
    sentAt: serializeDate(row.sentAt),
  };
}

function serializeTicket(row: any) {
  return {
    ...row,
    lastMessageAt: serializeDate(row.lastMessageAt),
    autoResolvedAt: serializeDate(row.autoResolvedAt),
    resolvedAt: serializeDate(row.resolvedAt),
    createdAt: serializeDate(row.createdAt),
    updatedAt: serializeDate(row.updatedAt),
    messages: Array.isArray(row.messages) ? row.messages.map(serializeMessage) : row.messages,
  };
}

async function supportControl() {
  const prisma = getPrisma() as any;
  return prisma.allwainSupportControl.upsert({
    where: { id: SUPPORT_CONTROL_ID },
    update: {},
    create: { id: SUPPORT_CONTROL_ID, automationPaused: true },
  });
}

export function getAllwainSupportReadiness() {
  const inboxConfigured = Boolean(
    ENV.ALLWAIN_SUPPORT_INBOX_ENABLED &&
      ENV.ALLWAIN_SUPPORT_IMAP_HOST &&
      ENV.ALLWAIN_SUPPORT_IMAP_USER &&
      ENV.ALLWAIN_SUPPORT_IMAP_PASS,
  );
  return {
    mailbox: ENV.ALLWAIN_SUPPORT_EMAIL,
    inboxEnabled: ENV.ALLWAIN_SUPPORT_INBOX_ENABLED,
    inboxConfigured,
    imapHost: ENV.ALLWAIN_SUPPORT_IMAP_HOST,
    imapPort: ENV.ALLWAIN_SUPPORT_IMAP_PORT,
    imapSecure: ENV.ALLWAIN_SUPPORT_IMAP_SECURE,
    automationMode: ENV.ALLWAIN_SUPPORT_AUTOMATION_MODE,
    externalAiEnabled:
      ENV.ALLWAIN_SUPPORT_EXTERNAL_AI_ENABLED && Boolean(ENV.OPENAI_API_KEY),
    email: getAllwainEmailDeliveryReadiness(),
  };
}

export async function getAllwainSupportAdminOverview() {
  if (ENV.STORAGE_DRIVER !== "postgres") {
    return {
      readiness: getAllwainSupportReadiness(),
      control: { automationPaused: true },
      tickets: {},
      deliveries: {},
      latestSync: null,
      recentFailures: [],
    };
  }
  const prisma = getPrisma() as any;
  const [control, ticketGroups, deliveryGroups, latestSync, recentFailures] =
    await Promise.all([
      supportControl(),
      prisma.allwainSupportTicket.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.allwainEmailDelivery.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.allwainSupportSyncRun.findFirst({
        orderBy: { completedAt: "desc" },
      }),
      prisma.allwainEmailDelivery.findMany({
        where: { status: "failed" },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          email: true,
          subject: true,
          attempts: true,
          error: true,
          createdAt: true,
          lastAttemptAt: true,
        },
      }),
    ]);
  return {
    readiness: getAllwainSupportReadiness(),
    control: {
      automationPaused: control.automationPaused,
      updatedAt: serializeDate(control.updatedAt),
    },
    tickets: Object.fromEntries(
      ticketGroups.map((group: any) => [group.status, group._count?._all || 0]),
    ),
    deliveries: Object.fromEntries(
      deliveryGroups.map((group: any) => [group.status, group._count?._all || 0]),
    ),
    latestSync: latestSync
      ? {
          ...latestSync,
          startedAt: serializeDate(latestSync.startedAt),
          completedAt: serializeDate(latestSync.completedAt),
          createdAt: serializeDate(latestSync.createdAt),
        }
      : null,
    recentFailures: recentFailures.map((item: any) => ({
      ...item,
      createdAt: serializeDate(item.createdAt),
      lastAttemptAt: serializeDate(item.lastAttemptAt),
    })),
  };
}

export async function listAllwainSupportTicketsForAdmin(options: {
  status?: string | null;
  query?: string | null;
  limit?: number;
}) {
  const prisma = getPrisma() as any;
  const limit = Math.min(100, Math.max(1, Math.floor(options.limit || 50)));
  const status = cleanHeader(options.status, 30);
  const query = cleanHeader(options.query, 160);
  const rows = await prisma.allwainSupportTicket.findMany({
    where: {
      ...(status && status !== "all" ? { status } : {}),
      ...(query
        ? {
            OR: [
              { subject: { contains: query, mode: "insensitive" } },
              { requesterEmail: { contains: query, mode: "insensitive" } },
              { requesterName: { contains: query, mode: "insensitive" } },
              { aiSummary: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
    take: limit,
    include: {
      _count: { select: { messages: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  return { items: rows.map(serializeTicket) };
}

export async function getAllwainSupportTicketForAdmin(id: string) {
  const prisma = getPrisma() as any;
  const row = await prisma.allwainSupportTicket.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!row) throw new Error("SUPPORT_TICKET_NOT_FOUND");
  return serializeTicket(row);
}

async function findTicketForIncoming(
  subject: string,
  inReplyTo: string | null | undefined,
  references: string[],
) {
  const prisma = getPrisma() as any;
  const messageIds = Array.from(
    new Set([inReplyTo, ...references].map((item) => cleanHeader(item, 500)).filter(Boolean)),
  );
  if (messageIds.length) {
    const matched = await prisma.allwainSupportMessage.findFirst({
      where: { providerMessageId: { in: messageIds } },
      select: { ticketId: true },
    });
    if (matched) return matched.ticketId;
  }
  const reference = subject.match(/\[AW-([A-F0-9]{8})\]/i)?.[1]?.toLowerCase();
  if (!reference) return null;
  const ticket = await prisma.allwainSupportTicket.findFirst({
    where: { id: { startsWith: reference, mode: "insensitive" } },
    select: { id: true },
  });
  return ticket?.id || null;
}

async function sendSupportReplyInternal(input: {
  ticketId: string;
  actorUserId?: string | null;
  body: string;
  aiGenerated?: boolean;
  resolve?: boolean;
  requestId?: string | null;
}) {
  const prisma = getPrisma() as any;
  const body = cleanText(input.body, 12_000);
  if (body.length < 3) throw new Error("SUPPORT_MESSAGE_REQUIRED");
  const ticket = await prisma.allwainSupportTicket.findUnique({
    where: { id: input.ticketId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!ticket) throw new Error("SUPPORT_TICKET_NOT_FOUND");
  const references = ticket.messages
    .map((message: any) => cleanHeader(message.providerMessageId, 500))
    .filter(Boolean)
    .slice(-20);
  const inReplyTo = references.at(-1) || null;
  const subject = `Re: [AW-${ticketReference(ticket.id)}] ${subjectWithoutReplyPrefixes(ticket.subject) || "Soporte Allwain"}`;
  let sent: Awaited<ReturnType<typeof sendAllwainSupportEmail>>;
  try {
    sent = await sendAllwainSupportEmail({
      to: ticket.requesterEmail,
      subject,
      text: body,
      inReplyTo,
      references,
    });
  } catch (error) {
    await prisma.allwainSupportMessage.create({
      data: {
        ticketId: ticket.id,
        direction: "outbound",
        channel: "email",
        authorUserId: input.actorUserId || null,
        fromEmail: ENV.ALLWAIN_SUPPORT_EMAIL,
        toEmail: ticket.requesterEmail,
        subject,
        bodyText: body,
        inReplyTo,
        references,
        status: "failed",
        aiGenerated: input.aiGenerated === true,
        requiresApproval: false,
      },
    });
    throw error;
  }
  const now = new Date();
  const [message] = await prisma.$transaction([
    prisma.allwainSupportMessage.create({
      data: {
        ticketId: ticket.id,
        direction: "outbound",
        channel: "email",
        authorUserId: input.actorUserId || null,
        fromEmail: ENV.ALLWAIN_SUPPORT_EMAIL,
        toEmail: ticket.requesterEmail,
        subject: sent.subject,
        bodyText: body,
        providerMessageId: sent.messageId,
        inReplyTo,
        references,
        status: "sent",
        aiGenerated: input.aiGenerated === true,
        requiresApproval: false,
        sentAt: now,
      },
    }),
    prisma.allwainSupportTicket.update({
      where: { id: ticket.id },
      data: {
        status: input.resolve ? "resolved" : "waiting_user",
        automationDisposition: input.aiGenerated ? "auto_replied" : "admin_replied",
        lastMessageAt: now,
        resolvedAt: input.resolve ? now : null,
        autoResolvedAt: input.resolve && input.aiGenerated ? now : null,
        ...(input.actorUserId ? { assignedAdminUserId: input.actorUserId } : {}),
      },
    }),
  ]);
  await appendAllwainAuditEvent({
    aggregateType: "support_ticket",
    aggregateId: ticket.id,
    eventType: input.aiGenerated
      ? "support.auto_reply_sent"
      : "support.admin_reply_sent",
    actorUserId: input.actorUserId || null,
    actorRole: input.actorUserId ? "admin" : "system",
    source: input.aiGenerated ? "allwain_support_agent" : "allwain_admin",
    requestId: input.requestId,
    providerEventId: sent.messageId,
    payload: {
      channel: "email",
      messageId: message.id,
      resolved: input.resolve === true,
      aiGenerated: input.aiGenerated === true,
    },
  });
  if (ticket.requesterUserId) {
    await notifyAllwainUser({
      userId: ticket.requesterUserId,
      type: "support.reply",
      title: "Soporte ha respondido",
      body: "Tienes una nueva respuesta en tu caso de ayuda.",
      route: "profile",
      dedupeKey: `support.reply:${message.id}:${ticket.requesterUserId}`,
      emailDelivery: false,
    });
  }
  return serializeMessage(message);
}

async function maybeAutoReply(ticketId: string, triage: AllwainSupportTriage) {
  const agentControl = await getAllwainAgentRuntimeControl("support_triage");
  const automationMode = agentControl.mode === "standard"
    ? ENV.ALLWAIN_SUPPORT_AUTOMATION_MODE
    : agentControl.mode === "rules_only"
      ? "disabled"
      : agentControl.mode;
  if (!agentControl.enabled || !triage.autoReplyEligible || automationMode !== "safe_auto") {
    return false;
  }
  const control = await supportControl();
  if (control.automationPaused) return false;
  const reply = buildSafeAllwainSupportReply(triage);
  if (!reply) return false;
  const ticket = await (getPrisma() as any).allwainSupportTicket.findUnique({
    where: { id: ticketId },
    select: { requesterEmail: true },
  });
  if (!ticket) return false;
  const policy = allwainEmailDeliveryPolicy(ticket.requesterEmail, new Date());
  if (!policy.allowed) return false;
  await sendSupportReplyInternal({
    ticketId,
    body: reply,
    aiGenerated: true,
    resolve: true,
  });
  return true;
}

async function importIncomingSupportEmail(input: IncomingSupportEmail) {
  const prisma = getPrisma() as any;
  const existing = await prisma.allwainSupportMessage.findUnique({
    where: { providerMessageId: input.providerMessageId },
    select: { ticketId: true },
  });
  if (existing) return { imported: false, autoReplied: false, ticketId: existing.ticketId };
  const references = Array.from(
    new Set((input.references || []).map((item) => cleanHeader(item, 500)).filter(Boolean)),
  );
  let ticketId = await findTicketForIncoming(
    input.subject,
    input.inReplyTo,
    references,
  );
  const baseTriage = classifyAllwainSupportMessage(input.subject, input.bodyText);
  const triage = await enhanceTriageWithExternalAi(
    baseTriage,
    input.subject,
    input.bodyText,
  );
  const user = await prisma.user.findFirst({
    where: { email: { equals: input.fromEmail, mode: "insensitive" }, deletedAt: null },
    select: { id: true, name: true },
  });
  const now = input.receivedAt || new Date();
  const supportAgentControl = await getAllwainAgentRuntimeControl("support_triage");
  const supportAutomationMode = supportAgentControl.mode === "standard"
    ? ENV.ALLWAIN_SUPPORT_AUTOMATION_MODE
    : supportAgentControl.mode === "rules_only"
      ? "disabled"
      : supportAgentControl.mode;
  const disposition = triage.autoReplyEligible
    ? supportAgentControl.enabled && supportAutomationMode === "safe_auto"
      ? "auto_reply_candidate"
      : "suggested_reply"
    : "human_review";

  if (!ticketId) {
    const ticket = await prisma.allwainSupportTicket.create({
      data: {
        requesterUserId: user?.id || null,
        requesterEmail: input.fromEmail,
        requesterName: cleanHeader(input.fromName || user?.name, 160) || null,
        subject: subjectWithoutReplyPrefixes(input.subject) || "Consulta de soporte",
        category: triage.category,
        priority: triage.priority,
        riskLevel: triage.riskLevel,
        status: "open",
        source: "email",
        aiSummary: triage.summary,
        aiTriage: triage,
        automationDisposition: disposition,
        lastMessageAt: now,
      },
    });
    ticketId = ticket.id;
  } else {
    await prisma.allwainSupportTicket.update({
      where: { id: ticketId },
      data: {
        status: "open",
        resolvedAt: null,
        autoResolvedAt: null,
        category: triage.category,
        priority: triage.priority,
        riskLevel: triage.riskLevel,
        aiSummary: triage.summary,
        aiTriage: triage,
        automationDisposition: disposition,
        lastMessageAt: now,
      },
    });
  }
  const message = await prisma.allwainSupportMessage.create({
    data: {
      ticketId,
      direction: "inbound",
      channel: "email",
      authorUserId: user?.id || null,
      fromEmail: input.fromEmail,
      toEmail: ENV.ALLWAIN_SUPPORT_EMAIL,
      subject: input.subject,
      bodyText: input.bodyText,
      providerMessageId: input.providerMessageId,
      inReplyTo: input.inReplyTo || null,
      references,
      status: "received",
      aiGenerated: false,
      requiresApproval: false,
      createdAt: now,
    },
  });
  await appendAllwainAuditEvent({
    aggregateType: "support_ticket",
    aggregateId: ticketId,
    eventType: "support.message_received",
    actorUserId: user?.id || null,
    actorRole: user ? "user" : "external",
    source: "allwain_support_inbox",
    providerEventId: input.providerMessageId,
    occurredAt: now,
    payload: {
      channel: "email",
      messageId: message.id,
      category: triage.category,
      priority: triage.priority,
      riskLevel: triage.riskLevel,
      automationDisposition: disposition,
    },
  });
  let autoReplied = false;
  try {
    autoReplied = await maybeAutoReply(ticketId, triage);
  } catch (error) {
    await prisma.allwainSupportTicket.update({
      where: { id: ticketId },
      data: { automationDisposition: "auto_reply_failed" },
    });
    console.error("ALLWAIN_SUPPORT_AUTO_REPLY_FAILED", error);
  }
  return { imported: true, autoReplied, ticketId };
}

async function runInboxSync(limit: number) {
  const startedAt = new Date();
  const readiness = getAllwainSupportReadiness();
  if (ENV.STORAGE_DRIVER !== "postgres" || !readiness.inboxConfigured) {
    return {
      status: "disabled",
      discovered: 0,
      imported: 0,
      autoReplied: 0,
      ignored: 0,
      error: readiness.inboxConfigured ? "POSTGRES_REQUIRED" : "IMAP_NOT_CONFIGURED",
    };
  }
  const prisma = getPrisma() as any;
  const client = new ImapFlow({
    host: ENV.ALLWAIN_SUPPORT_IMAP_HOST,
    port: ENV.ALLWAIN_SUPPORT_IMAP_PORT,
    secure: ENV.ALLWAIN_SUPPORT_IMAP_SECURE,
    auth: {
      user: ENV.ALLWAIN_SUPPORT_IMAP_USER!,
      pass: ENV.ALLWAIN_SUPPORT_IMAP_PASS!,
    },
    logger: false,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
  let discovered = 0;
  let imported = 0;
  let autoReplied = 0;
  let ignored = 0;
  let errorText: string | null = null;
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const searchResult = await client.search({ seen: false }, { uid: true });
      const uids = Array.isArray(searchResult) ? searchResult.slice(-limit) : [];
      discovered = uids.length;
      if (uids.length) {
        const messages = await client.fetchAll(
          uids,
          { source: true, envelope: true },
          { uid: true },
        );
        for (const message of messages) {
          const uid = Number(message.uid);
          try {
            const source = message.source;
            if (!source || source.length > ENV.ALLWAIN_SUPPORT_MAX_MESSAGE_BYTES) {
              ignored += 1;
              await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
              continue;
            }
            const parsed: any = await simpleParser(source, {
              skipHtmlToText: false,
              skipTextToHtml: true,
              skipImageLinks: true,
              maxHtmlLengthToParse: 100_000,
            });
            const fromEmail = normalizeEmail(parsed.from?.value?.[0]?.address);
            const ownEmail = normalizeEmail(ENV.ALLWAIN_SUPPORT_EMAIL);
            const autoSubmitted = cleanHeader(parsed.headers?.get?.("auto-submitted"), 100).toLowerCase();
            if (
              !fromEmail ||
              fromEmail === ownEmail ||
              (autoSubmitted && autoSubmitted !== "no")
            ) {
              ignored += 1;
              await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
              continue;
            }
            const mailboxValidity = client.mailbox && client.mailbox.uidValidity
              ? String(client.mailbox.uidValidity)
              : "unknown";
            const providerMessageId =
              cleanHeader(parsed.messageId, 500) ||
              `imap:${mailboxValidity}:${uid}`;
            const references = Array.isArray(parsed.references)
              ? parsed.references.map(String)
              : parsed.references
                ? [String(parsed.references)]
                : [];
            const result = await importIncomingSupportEmail({
              fromEmail,
              fromName: cleanHeader(parsed.from?.value?.[0]?.name, 160),
              subject: cleanHeader(parsed.subject || message.envelope?.subject, 240) || "Consulta de soporte",
              bodyText: compactMessage(parsed.text || parsed.textAsHtml || ""),
              providerMessageId,
              inReplyTo: cleanHeader(parsed.inReplyTo, 500) || null,
              references,
              receivedAt: parsed.date instanceof Date ? parsed.date : new Date(),
            });
            if (result.imported) imported += 1;
            else ignored += 1;
            if (result.autoReplied) autoReplied += 1;
            await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
          } catch (messageError) {
            console.error("ALLWAIN_SUPPORT_MESSAGE_IMPORT_FAILED", messageError);
          }
        }
      }
    } finally {
      lock.release();
    }
  } catch (error) {
    errorText =
      error instanceof Error
        ? cleanHeader(error.message, 400)
        : "IMAP_SYNC_FAILED";
  } finally {
    try {
      if (client.usable) await client.logout();
      else client.close();
    } catch {
      client.close();
    }
  }
  const completedAt = new Date();
  const status = errorText ? "failed" : "completed";
  await prisma.allwainSupportSyncRun.create({
    data: {
      status,
      discovered,
      imported,
      autoReplied,
      ignored,
      error: errorText,
      startedAt,
      completedAt,
    },
  });
  return {
    status,
    discovered,
    imported,
    autoReplied,
    ignored,
    error: errorText,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
  };
}

export async function syncAllwainSupportInbox(limit = 25) {
  if (syncPromise) return syncPromise;
  syncPromise = runInboxSync(Math.min(100, Math.max(1, Math.floor(limit) || 25)))
    .finally(() => {
      syncPromise = null;
    });
  return syncPromise;
}

export async function verifyAllwainSupportConnections() {
  const smtp = await verifyAllwainSmtpConnection();
  if (!getAllwainSupportReadiness().inboxConfigured) {
    return { smtp, imap: { ok: false, error: "IMAP_NOT_CONFIGURED" } };
  }
  const client = new ImapFlow({
    host: ENV.ALLWAIN_SUPPORT_IMAP_HOST,
    port: ENV.ALLWAIN_SUPPORT_IMAP_PORT,
    secure: ENV.ALLWAIN_SUPPORT_IMAP_SECURE,
    auth: {
      user: ENV.ALLWAIN_SUPPORT_IMAP_USER!,
      pass: ENV.ALLWAIN_SUPPORT_IMAP_PASS!,
    },
    logger: false,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
  });
  try {
    await client.connect();
    await client.status("INBOX", { messages: true, unseen: true });
    await client.logout();
    return { smtp, imap: { ok: true, error: null } };
  } catch (error) {
    client.close();
    return {
      smtp,
      imap: {
        ok: false,
        error: error instanceof Error ? cleanHeader(error.message, 200) : "IMAP_VERIFY_FAILED",
      },
    };
  }
}

export async function sendAllwainSupportAdminReply(input: {
  ticketId: string;
  adminUserId: string;
  body: string;
  resolve?: boolean;
  requestId?: string | null;
}) {
  return sendSupportReplyInternal({
    ticketId: input.ticketId,
    actorUserId: input.adminUserId,
    body: input.body,
    resolve: input.resolve === true,
    requestId: input.requestId,
  });
}

export async function updateAllwainSupportTicket(input: {
  ticketId: string;
  adminUserId: string;
  status?: string;
  priority?: string;
  assignToMe?: boolean;
  requestId?: string | null;
}) {
  const status = input.status ? cleanHeader(input.status, 30) : undefined;
  const priority = input.priority ? cleanHeader(input.priority, 30) : undefined;
  if (status && !VALID_STATUSES.has(status)) throw new Error("INVALID_SUPPORT_STATUS");
  if (priority && !VALID_PRIORITIES.has(priority)) throw new Error("INVALID_SUPPORT_PRIORITY");
  const prisma = getPrisma() as any;
  const existing = await prisma.allwainSupportTicket.findUnique({
    where: { id: input.ticketId },
  });
  if (!existing) throw new Error("SUPPORT_TICKET_NOT_FOUND");
  const now = new Date();
  const updated = await prisma.allwainSupportTicket.update({
    where: { id: input.ticketId },
    data: {
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(input.assignToMe ? { assignedAdminUserId: input.adminUserId } : {}),
      ...(status === "resolved" || status === "closed"
        ? { resolvedAt: existing.resolvedAt || now }
        : status
          ? { resolvedAt: null, autoResolvedAt: null }
          : {}),
    },
  });
  await appendAllwainAuditEvent({
    aggregateType: "support_ticket",
    aggregateId: input.ticketId,
    eventType: "support.ticket_updated",
    actorUserId: input.adminUserId,
    actorRole: "admin",
    source: "allwain_admin",
    requestId: input.requestId,
    payload: {
      fromStatus: existing.status,
      toStatus: updated.status,
      fromPriority: existing.priority,
      toPriority: updated.priority,
      assignedToSelf: input.assignToMe === true,
    },
  });
  return serializeTicket(updated);
}

export async function setAllwainSupportAutomationPaused(input: {
  adminUserId: string;
  paused: boolean;
  requestId?: string | null;
}) {
  const prisma = getPrisma() as any;
  const updated = await prisma.allwainSupportControl.upsert({
    where: { id: SUPPORT_CONTROL_ID },
    update: {
      automationPaused: input.paused,
      updatedByUserId: input.adminUserId,
    },
    create: {
      id: SUPPORT_CONTROL_ID,
      automationPaused: input.paused,
      updatedByUserId: input.adminUserId,
    },
  });
  await appendAllwainAuditEvent({
    aggregateType: "support_control",
    aggregateId: SUPPORT_CONTROL_ID,
    eventType: input.paused
      ? "support.automation_paused"
      : "support.automation_resumed",
    actorUserId: input.adminUserId,
    actorRole: "admin",
    source: "allwain_admin",
    requestId: input.requestId,
    payload: { automationPaused: input.paused },
  });
  return {
    automationPaused: updated.automationPaused,
    updatedAt: serializeDate(updated.updatedAt),
  };
}
