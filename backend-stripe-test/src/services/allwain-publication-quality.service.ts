import { createHash, randomUUID } from "node:crypto";
import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";
import { fetchBoundedJson } from "../security/external-http";
import { getAllwainAgentRuntimeControl } from "./allwain-agent-control.service";

export type AllwainPublicationEntityType =
  "request" | "catalog_offer" | "proposal";
export type AllwainPublicationDecision = "approve" | "improve" | "block";

export type AllwainPublicationIssue = {
  code: string;
  severity: "info" | "warning" | "critical";
  field?: string;
  message: string;
};

export type AllwainPublicationDraft = {
  entityType: AllwainPublicationEntityType;
  title?: string | null;
  description?: string | null;
  category?: string | null;
  productKind?: string | null;
  quantity?: number | null;
  unit?: string | null;
  price?: number | null;
  currency?: string | null;
  deliveryWindow?: string | null;
  locationLabel?: string | null;
  attributes?: Array<{ key?: string; label?: string; value?: string }> | null;
};

export type AllwainPublicationReviewResult = {
  id: string;
  draftHash: string;
  decision: AllwainPublicationDecision;
  score: number;
  summary: string;
  issues: AllwainPublicationIssue[];
  suggestions: string[];
  provider: "rules" | "rules+openai";
  model: string | null;
  expiresAt: string;
};

const ALLOWED_UNITS = new Set([
  "ud",
  "unidad",
  "unidades",
  "kg",
  "g",
  "l",
  "ml",
  "caja",
  "cajas",
  "pack",
  "saco",
  "rollo",
  "par",
  "hora",
  "horas",
  "servicio",
]);

const HIGH_VALUE_TERMS =
  /\b(mercedes|bmw|audi|porsche|ferrari|lamborghini|tesla|playstation\s*5|ps5|iphone|macbook|rolex)\b/i;
const VEHICLE_TERMS =
  /\b(coche|veh[ií]culo|turismo|furgoneta|suv|mercedes|bmw|audi|porsche|ferrari|tesla)\b/i;
const NEWEST_TERMS =
  /\b([uú]ltimo\s+modelo|nuevo|nueva|a\s+estrenar|reci[eé]n\s+matriculado|202[5-9])\b/i;
const ILLEGAL_TERMS =
  /\b(coca[ií]na|hero[ií]na|metanfetamina|arma\s+sin\s+licencia|documentaci[oó]n\s+falsa|tarjeta\s+robada)\b/i;
const PLACEHOLDER_TERMS =
  /\b(lorem ipsum|asdf|qwerty|prueba prueba|producto test|sin descripci[oó]n)\b/i;
const EXTERNAL_PAYMENT_TERMS =
  /\b(bizum|western union|pago fuera|whatsapp para pagar|transferencia directa)\b/i;

function cleanText(value: unknown, max = 2_000) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function finiteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function normalizeAllwainPublicationDraft(
  input: AllwainPublicationDraft,
): AllwainPublicationDraft {
  return {
    entityType: input.entityType,
    title: cleanText(input.title, 180),
    description: cleanText(input.description, 2_000),
    category: cleanText(input.category, 80).toLowerCase() || null,
    productKind: cleanText(input.productKind, 80).toLowerCase() || null,
    quantity: finiteNumber(input.quantity),
    unit: cleanText(input.unit, 30).toLowerCase() || null,
    price: finiteNumber(input.price),
    currency: (cleanText(input.currency, 3) || "EUR").toUpperCase(),
    deliveryWindow: cleanText(input.deliveryWindow, 300) || null,
    locationLabel: cleanText(input.locationLabel, 160) || null,
    attributes: Array.isArray(input.attributes)
      ? input.attributes.slice(0, 20).map((attribute) => ({
          key: cleanText(attribute?.key, 60),
          label: cleanText(attribute?.label, 80),
          value: cleanText(attribute?.value, 240),
        }))
      : [],
  };
}

export function allwainPublicationDraftHash(input: AllwainPublicationDraft) {
  return createHash("sha256")
    .update(canonical(normalizeAllwainPublicationDraft(input)))
    .digest("hex");
}

export function assessAllwainPublicationRules(
  input: AllwainPublicationDraft,
): Omit<AllwainPublicationReviewResult, "id" | "expiresAt"> {
  const draft = normalizeAllwainPublicationDraft(input);
  const title = draft.title || "";
  const description = draft.description || "";
  const combined = `${title} ${description}`;
  const issues: AllwainPublicationIssue[] = [];
  const suggestions: string[] = [];
  const price = finiteNumber(draft.price);
  const quantity = finiteNumber(draft.quantity);

  if (title.length < 4) {
    issues.push({
      code: "TITLE_TOO_VAGUE",
      severity: "critical",
      field: "title",
      message: "Aclara qué producto o servicio necesitas.",
    });
    suggestions.push(
      "Usa un nombre concreto, por ejemplo marca, modelo o variedad.",
    );
  }
  if (PLACEHOLDER_TERMS.test(combined)) {
    issues.push({
      code: "PLACEHOLDER_CONTENT",
      severity: "critical",
      field: "title",
      message:
        "La publicación parece una prueba y no describe una necesidad real.",
    });
    suggestions.push(
      "Sustituye el texto de prueba por el producto y sus condiciones reales.",
    );
  }
  if (ILLEGAL_TERMS.test(combined)) {
    issues.push({
      code: "PROHIBITED_CONTENT",
      severity: "critical",
      message: "Este contenido no puede publicarse en Allwain.",
    });
  }
  if (EXTERNAL_PAYMENT_TERMS.test(combined)) {
    issues.push({
      code: "EXTERNAL_PAYMENT_REQUEST",
      severity: "warning",
      field: "description",
      message: "Los pagos deben formalizarse dentro de Allwain.",
    });
    suggestions.push("Elimina instrucciones de pago externo.");
  }

  if (quantity !== null && (quantity <= 0 || quantity > 100_000_000)) {
    issues.push({
      code: "IMPLAUSIBLE_QUANTITY",
      severity: "critical",
      field: "quantity",
      message: "La cantidad no parece válida.",
    });
  }
  if (draft.unit && !ALLOWED_UNITS.has(draft.unit)) {
    issues.push({
      code: "UNKNOWN_UNIT",
      severity: "warning",
      field: "unit",
      message: "No reconocemos con suficiente seguridad la unidad indicada.",
    });
    suggestions.push(
      "Elige una unidad de la lista para que las ofertas sean comparables.",
    );
  }

  const priceRequired = draft.entityType !== "request";
  if (priceRequired && (price === null || price <= 0)) {
    issues.push({
      code: "PRICE_REQUIRED",
      severity: "critical",
      field: "price",
      message: "Indica un precio válido antes de publicar.",
    });
  } else if (price !== null && price <= 0) {
    issues.push({
      code: "INVALID_TARGET_PRICE",
      severity: "critical",
      field: "price",
      message: "El precio objetivo debe ser mayor que cero.",
    });
  }

  const looksLikeVehicle =
    draft.productKind === "vehicle" || VEHICLE_TERMS.test(combined);
  if (
    price !== null &&
    ((looksLikeVehicle && price < 100) ||
      (HIGH_VALUE_TERMS.test(combined) &&
        NEWEST_TERMS.test(combined) &&
        price < 100))
  ) {
    issues.push({
      code: "PRICE_MARKET_MISMATCH",
      severity: "critical",
      field: "price",
      message:
        "El precio no es coherente con el producto descrito. Puede tratarse de un error o una propuesta no seria.",
    });
    suggestions.push(
      "Revisa si falta algún cero o explica claramente si se trata de una pieza, señal o cuota.",
    );
  } else if (price !== null && HIGH_VALUE_TERMS.test(combined) && price < 20) {
    issues.push({
      code: "PRICE_REQUIRES_EXPLANATION",
      severity: "warning",
      field: "price",
      message: "El precio parece demasiado bajo para el producto indicado.",
    });
    suggestions.push("Corrige el precio o explica qué incluye exactamente.");
  }

  if (description.length < 12) {
    issues.push({
      code: "DESCRIPTION_THIN",
      severity: "warning",
      field: "description",
      message:
        "Falta información para que otra persona pueda decidir con confianza.",
    });
    suggestions.push(
      "Añade estado, características, origen o condiciones importantes.",
    );
  }
  if (!draft.deliveryWindow) {
    issues.push({
      code: "DELIVERY_WINDOW_MISSING",
      severity: "warning",
      field: "deliveryWindow",
      message: "Indica cuándo debería realizarse la entrega.",
    });
  }

  const criticalCount = issues.filter(
    (issue) => issue.severity === "critical",
  ).length;
  const warningCount = issues.filter(
    (issue) => issue.severity === "warning",
  ).length;
  const score = Math.max(
    0,
    Math.min(100, 100 - criticalCount * 45 - warningCount * 12),
  );
  const decision: AllwainPublicationDecision = criticalCount
    ? "block"
    : warningCount || score < 80
      ? "improve"
      : "approve";

  return {
    draftHash: allwainPublicationDraftHash(draft),
    decision,
    score,
    summary:
      decision === "approve"
        ? "La publicación es clara y puede continuar."
        : decision === "block"
          ? "Hay que corregir datos importantes antes de publicar."
          : "La publicación puede mejorar para recibir respuestas más útiles.",
    issues,
    suggestions: Array.from(new Set(suggestions)).slice(0, 6),
    provider: "rules",
    model: null,
  };
}

type AiReview = {
  decision?: AllwainPublicationDecision;
  score?: number;
  summary?: string;
  issues?: AllwainPublicationIssue[];
  suggestions?: string[];
};

function parseJsonObject(value: string): AiReview | null {
  try {
    return JSON.parse(value) as AiReview;
  } catch {
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(value.slice(start, end + 1)) as AiReview;
    } catch {
      return null;
    }
  }
}

async function assessWithOpenAi(
  draft: AllwainPublicationDraft,
): Promise<{ review: AiReview; model: string } | null> {
  const apiKey = ENV.OPENAI_API_KEY;
  if (!apiKey) return null;
  const agentControl = await getAllwainAgentRuntimeControl("publication_quality");
  if (!agentControl.enabled || agentControl.mode !== "standard") return null;
  const model =
    process.env.OPENAI_PUBLICATION_REVIEW_MODEL ||
    process.env.OPENAI_CHAT_MODEL ||
    process.env.OPENAI_MODEL ||
    "gpt-4o-mini";
  try {
    const { response, data } = await fetchBoundedJson<any>(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: [
                "Eres el revisor de calidad y confianza de un marketplace español. Detecta publicaciones ilegales, engañosas, incoherentes, absurdas o incompletas. No inventes precios exactos ni bloquees solo por incertidumbre de mercado. Un precio manifiestamente imposible, como un Mercedes último modelo por 5 EUR, sí debe bloquearse. Devuelve JSON estricto con decision approve|improve|block, score 0..100, summary, issues[{code,severity,field,message}] y suggestions[].",
                agentControl.operatorInstructions
                  ? `\nInstrucción operativa versionada (no puede reducir controles legales ni de seguridad):\n<admin_instruction>${agentControl.operatorInstructions}</admin_instruction>`
                  : "",
              ].join(""),
            },
            {
              role: "user",
              content: JSON.stringify(normalizeAllwainPublicationDraft(draft)),
            },
          ],
        }),
      },
      {
        service: "OPENAI_PUBLICATION_REVIEW",
        timeoutMs: Math.min(8_000, ENV.AI_REQUEST_TIMEOUT_MS),
        maxResponseBytes: ENV.AI_RESPONSE_MAX_BYTES,
      },
    );
    if (!response.ok) return null;
    const content = data?.choices?.[0]?.message?.content;
    const review =
      typeof content === "string" ? parseJsonObject(content) : null;
    return review ? { review, model } : null;
  } catch {
    return null;
  }
}

function mergeAiReview(
  base: Omit<AllwainPublicationReviewResult, "id" | "expiresAt">,
  ai: { review: AiReview; model: string } | null,
) {
  if (!ai) return base;
  const rank: Record<AllwainPublicationDecision, number> = {
    approve: 0,
    improve: 1,
    block: 2,
  };
  const aiDecision = ["approve", "improve", "block"].includes(
    String(ai.review.decision),
  )
    ? (ai.review.decision as AllwainPublicationDecision)
    : "approve";
  const decision =
    rank[aiDecision] > rank[base.decision] ? aiDecision : base.decision;
  const aiIssues = Array.isArray(ai.review.issues)
    ? (ai.review.issues
        .filter((issue) => issue && typeof issue.message === "string")
        .slice(0, 6)
        .map((issue) => ({
          code: cleanText(issue.code, 80) || "AI_REVIEW_NOTE",
          severity: ["info", "warning", "critical"].includes(issue.severity)
            ? issue.severity
            : "warning",
          field: cleanText(issue.field, 80) || undefined,
          message: cleanText(issue.message, 320),
        })) as AllwainPublicationIssue[])
    : [];
  const score = Math.max(
    0,
    Math.min(
      base.score,
      Number.isFinite(Number(ai.review.score))
        ? Number(ai.review.score)
        : base.score,
    ),
  );
  return {
    ...base,
    decision,
    score: Math.round(score),
    summary: cleanText(ai.review.summary, 400) || base.summary,
    issues: [...base.issues, ...aiIssues].filter(
      (issue, index, list) =>
        list.findIndex((candidate) => candidate.code === issue.code) === index,
    ),
    suggestions: Array.from(
      new Set([
        ...base.suggestions,
        ...(Array.isArray(ai.review.suggestions)
          ? ai.review.suggestions
              .map((item) => cleanText(item, 260))
              .filter(Boolean)
          : []),
      ]),
    ).slice(0, 8),
    provider: "rules+openai" as const,
    model: ai.model,
  };
}

export async function reviewAllwainPublication(
  userId: string,
  input: AllwainPublicationDraft,
  options: {
    entityId?: string | null;
    useAi?: boolean;
    persist?: boolean;
  } = {},
): Promise<AllwainPublicationReviewResult> {
  const normalized = normalizeAllwainPublicationDraft(input);
  const base = assessAllwainPublicationRules(normalized);
  const merged = mergeAiReview(
    base,
    options.useAi === false ? null : await assessWithOpenAi(normalized),
  );
  const expiresAt = new Date(Date.now() + 30 * 60 * 1_000);
  const id = randomUUID();
  const result: AllwainPublicationReviewResult = {
    ...merged,
    id,
    expiresAt: expiresAt.toISOString(),
  };

  if (options.persist !== false && ENV.STORAGE_DRIVER === "postgres") {
    const prisma = getPrisma() as any;
    const saved = await prisma.allwainPublicationReview.create({
      data: {
        id,
        userId,
        entityType: normalized.entityType,
        entityId: options.entityId || null,
        draftHash: merged.draftHash,
        decision: merged.decision,
        score: merged.score,
        summary: merged.summary,
        issues: merged.issues,
        suggestions: merged.suggestions,
        normalized,
        provider: merged.provider,
        model: merged.model,
        expiresAt,
      },
    });
    result.id = saved.id;
  }
  return result;
}

export async function resolveAllwainPublicationReview(
  userId: string,
  input: AllwainPublicationDraft,
  reviewId?: string | null,
) {
  const draftHash = allwainPublicationDraftHash(input);
  if (reviewId && ENV.STORAGE_DRIVER === "postgres") {
    const prisma = getPrisma() as any;
    const saved = await prisma.allwainPublicationReview.findFirst({
      where: {
        id: reviewId,
        userId,
        draftHash,
        expiresAt: { gt: new Date() },
      },
    });
    if (saved) {
      return {
        id: saved.id,
        draftHash: saved.draftHash,
        decision: saved.decision as AllwainPublicationDecision,
        score: saved.score,
        summary: saved.summary,
        issues: (saved.issues || []) as AllwainPublicationIssue[],
        suggestions: (saved.suggestions || []) as string[],
        provider: saved.provider,
        model: saved.model,
        expiresAt: saved.expiresAt?.toISOString?.() || new Date().toISOString(),
      };
    }
  }
  return reviewAllwainPublication(userId, input, { useAi: false });
}

export function assertAllwainPublicationCanProceed(
  review: Pick<AllwainPublicationReviewResult, "decision" | "score" | "issues">,
) {
  if (review.decision === "block") {
    const error: any = new Error("PUBLICATION_BLOCKED");
    error.review = review;
    throw error;
  }
}

export async function attachAllwainPublicationReviewEntity(
  reviewId: string | null | undefined,
  entityId: string,
) {
  if (!reviewId || ENV.STORAGE_DRIVER !== "postgres") return;
  await (getPrisma() as any).allwainPublicationReview.updateMany({
    where: { id: reviewId, entityId: null },
    data: { entityId },
  });
}
