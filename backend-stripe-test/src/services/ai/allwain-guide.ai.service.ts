import { randomUUID } from "node:crypto";

import { ENV } from "../../config/env";
import { fetchBoundedJson } from "../../security/external-http";
import type { AllwainScanExtractedFields } from "../../shared/types";
import { getAllwainParticipationSnapshot } from "../allwain-participation.service";
import { applyAllwainProductIntelligence } from "../allwain-product-intelligence";
import { scanProductImage } from "../scan.service";
import { normalizeAllwainPreorderChargeDeadline } from "../allwain-preorders";
import { getAllwainAgentRuntimeControl } from "../allwain-agent-control.service";

export type AllwainGuideActionType = "create_offer" | "create_request";
export type AllwainGuideActionStatus = "draft" | "ready" | "requires_seller";

export type AllwainGuideOfferFields = {
  title: string | null;
  description: string | null;
  price: number | null;
  currency: "EUR";
  unit: string | null;
  availableQuantity: number | null;
  minQuantity: number | null;
  quantityStep: number | null;
  saleMode: "immediate" | "preorder";
  preorderChargeDeadlineAt: string | null;
  deliveryEstimate: string | null;
  productKind: "food" | "goods" | "service" | "other";
  foodCategory: string | null;
  ownProduction: boolean | null;
  originCountry: string | null;
  originRegion: string | null;
  responsibleOperator: string | null;
};

export type AllwainGuideRequestFields = {
  productName: string | null;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  targetPrice: number | null;
  currency: "EUR";
  deliveryWindow: string | null;
  deliveryMethod: "shipping" | "pickup" | "in_person" | null;
  deliveryAddress: string | null;
  deliveryNotes: string | null;
};

export type AllwainGuideAction = {
  id: string;
  type: AllwainGuideActionType;
  status: AllwainGuideActionStatus;
  title: string;
  missingFields: string[];
  missingLabels: string[];
  canExecute: boolean;
  fields: AllwainGuideOfferFields | AllwainGuideRequestFields;
};

type GuideHistoryMessage = {
  role: "user" | "assistant";
  text: string;
};

type GuideModelResult = {
  reply?: string;
  intent?: "answer" | AllwainGuideActionType;
  action?: {
    id?: string;
    type?: AllwainGuideActionType;
    fields?: Record<string, unknown>;
  } | null;
};

type OpenAIChatResponse = {
  choices?: Array<{ message?: { content?: string | null } | null }>;
  error?: { message?: string };
};

const OFFER_MISSING_LABELS: Record<string, string> = {
  title: "qué quieres vender",
  price: "precio por unidad",
  availableQuantity: "cantidad disponible",
  unit: "unidad de venta",
  minQuantity: "pedido mínimo",
  quantityStep: "incremento de compra",
  deliveryEstimate: "cuándo puedes entregarlo",
  preorderChargeDeadlineAt: "fecha límite para realizar el cobro",
  foodCategory: "tipo de alimento",
  ownProduction: "si es producción propia",
  originCountry: "país de origen",
  responsibleOperator: "persona o empresa responsable",
};

const REQUEST_MISSING_LABELS: Record<string, string> = {
  productName: "qué necesitas",
  quantity: "cantidad",
  unit: "unidad",
  deliveryWindow: "cuándo lo necesitas",
  deliveryMethod: "cómo quieres recibirlo",
  deliveryAddress: "zona o dirección de entrega",
};

function cleanText(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return null;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, maxLength) : null;
}

function cleanProductName(value: unknown) {
  const clean = cleanText(value, 160);
  if (!clean) return null;
  const normalized = clean
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (
    ["algo", "producto", "un producto", "una cosa", "cosa"].includes(normalized) ||
    /^(quiero )?(comprar|vender|pedir) (algo|un producto|una cosa)$/.test(normalized)
  ) {
    return null;
  }
  return clean;
}

function cleanNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function cleanPreorderDeadline(value: unknown) {
  const raw = cleanText(value, 40);
  if (!raw) return null;
  try {
    return normalizeAllwainPreorderChargeDeadline(raw).toISOString();
  } catch {
    return null;
  }
}

function cleanActionId(value: unknown) {
  const clean = cleanText(value, 80);
  return clean && /^[a-zA-Z0-9-]+$/.test(clean) ? clean : randomUUID();
}

function cleanUnit(value: unknown) {
  const clean = cleanText(value, 20)?.toLowerCase();
  if (!clean) return null;
  if (["kg", "kilo", "kilos", "kilogramo", "kilogramos"].includes(clean)) return "kg";
  if (["l", "litro", "litros"].includes(clean)) return "l";
  if (["g", "gramo", "gramos"].includes(clean)) return "g";
  if (["ud", "uds", "unidad", "unidades"].includes(clean)) return "ud";
  if (["h", "hora", "horas"].includes(clean)) return "h";
  return clean;
}

function cleanDeliveryMethod(value: unknown) {
  const clean = cleanText(value, 40)?.toLowerCase();
  if (!clean) return null;
  if (["shipping", "envio", "envío", "domicilio"].includes(clean)) return "shipping" as const;
  if (["pickup", "recogida", "recoger"].includes(clean)) return "pickup" as const;
  if (["in_person", "en persona", "personal"].includes(clean)) return "in_person" as const;
  return null;
}

function cleanHistory(history: unknown): GuideHistoryMessage[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter(
      (item): item is GuideHistoryMessage =>
        Boolean(item) &&
        (item.role === "user" || item.role === "assistant") &&
        typeof item.text === "string" &&
        item.text.trim().length > 0,
    )
    .slice(-12)
    .map((item) => ({ role: item.role, text: item.text.trim().slice(0, 1200) }));
}

function parseJsonObject(text: string): GuideModelResult | null {
  try {
    return JSON.parse(text) as GuideModelResult;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1)) as GuideModelResult;
    } catch {
      return null;
    }
  }
}

function actionType(value: unknown): AllwainGuideActionType | null {
  return value === "create_offer" || value === "create_request" ? value : null;
}

function currentActionShape(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const type = actionType(input.type);
  const fields = input.fields;
  if (!type || !fields || typeof fields !== "object") return null;
  return {
    id: cleanActionId(input.id),
    type,
    fields: fields as Record<string, unknown>,
  };
}

function mergeActionFields(
  currentAction: unknown,
  candidate: GuideModelResult["action"],
) {
  const current = currentActionShape(currentAction);
  const candidateType = actionType(candidate?.type);
  const type = candidateType || current?.type || null;
  if (!type) return null;
  const keepCurrent = current?.type === type;
  const candidateFields =
    candidate?.fields && typeof candidate.fields === "object"
      ? Object.fromEntries(
          Object.entries(candidate.fields).filter(
            ([, value]) => value !== undefined && value !== null && value !== "",
          ),
        )
      : {};
  return {
    id: cleanActionId(candidate?.id || (keepCurrent ? current?.id : null)),
    type,
    fields: {
      ...(keepCurrent ? current?.fields : {}),
      ...candidateFields,
    },
  };
}

function normalizeOfferAction(
  raw: { id: string; fields: Record<string, unknown> },
  context: { sellerEnabled: boolean; inferred: AllwainScanExtractedFields; userName?: string | null },
): AllwainGuideAction {
  const input = raw.fields;
  const title = cleanProductName(
    input.title || input.productName || context.inferred.productName,
  );
  const product = applyAllwainProductIntelligence(
    {
      productName: title,
      category: cleanText(input.category || context.inferred.category, 100),
      unit: cleanUnit(input.unit || context.inferred.unit),
      rawText: cleanText(input.rawText, 1600),
      confidence: 0.75,
    },
    { rawText: cleanText(input.rawText, 1600) || title || undefined },
  );
  const inferredKind =
    product.productKind === "produce_weight"
      ? "food"
      : product.productKind === "service"
        ? "service"
        : "goods";
  const requestedKind = cleanText(input.productKind, 30)?.toLowerCase();
  const productKind: AllwainGuideOfferFields["productKind"] =
    product.productKind === "produce_weight"
      ? "food"
      : product.productKind === "service"
        ? "service"
        : requestedKind === "food" ||
            requestedKind === "goods" ||
            requestedKind === "service" ||
            requestedKind === "other"
          ? requestedKind
          : inferredKind;
  const availableQuantity = cleanNumber(input.availableQuantity || input.stockQuantity || input.quantity);
  const minQuantity = cleanNumber(input.minQuantity);
  const quantityStep = cleanNumber(input.quantityStep) || 1;
  const ownProduction =
    input.ownProduction === true ? true : input.ownProduction === false ? false : null;
  const responsibleOperator = cleanText(input.responsibleOperator, 250);
  const description = cleanText(input.description, 1000) || title;
  const fields: AllwainGuideOfferFields = {
    title,
    description,
    price: cleanNumber(input.price),
    currency: "EUR",
    unit: title ? cleanUnit(input.unit) || product.unit || null : null,
    availableQuantity,
    minQuantity,
    quantityStep,
    saleMode: input.saleMode === "preorder" ? "preorder" : "immediate",
    preorderChargeDeadlineAt:
      input.saleMode === "preorder"
        ? cleanPreorderDeadline(
            input.preorderChargeDeadlineAt || input.preorderChargeBy,
          )
        : null,
    deliveryEstimate: cleanText(input.deliveryEstimate || input.deliveryWindow, 250),
    productKind,
    foodCategory: productKind === "food" ? cleanText(input.foodCategory, 100) : null,
    ownProduction: productKind === "food" ? ownProduction : null,
    originCountry:
      productKind === "food" ? cleanText(input.originCountry, 2)?.toUpperCase() || null : null,
    originRegion: productKind === "food" ? cleanText(input.originRegion, 150) : null,
    responsibleOperator:
      productKind === "food"
        ? responsibleOperator || cleanText(context.userName, 250)
        : null,
  };
  const missingFields: string[] = [];
  if (!fields.title) missingFields.push("title");
  if (!fields.price) missingFields.push("price");
  if (!fields.availableQuantity) missingFields.push("availableQuantity");
  if (!fields.unit) missingFields.push("unit");
  if (!fields.minQuantity || (fields.availableQuantity && fields.minQuantity > fields.availableQuantity)) {
    missingFields.push("minQuantity");
  }
  if (!fields.quantityStep) missingFields.push("quantityStep");
  if (!fields.deliveryEstimate) missingFields.push("deliveryEstimate");
  if (fields.saleMode === "preorder" && !fields.preorderChargeDeadlineAt) {
    missingFields.push("preorderChargeDeadlineAt");
  }
  if (fields.productKind === "food") {
    if (!fields.foodCategory) missingFields.push("foodCategory");
    if (fields.ownProduction === null) missingFields.push("ownProduction");
    if (!fields.originCountry || !/^[A-Z]{2}$/.test(fields.originCountry)) missingFields.push("originCountry");
    if (!fields.responsibleOperator) missingFields.push("responsibleOperator");
  }
  const status: AllwainGuideActionStatus = missingFields.length
    ? "draft"
    : context.sellerEnabled
      ? "ready"
      : "requires_seller";
  return {
    id: raw.id,
    type: "create_offer",
    status,
    title: fields.title ? `Oferta: ${fields.title}` : "Nueva oferta",
    missingFields,
    missingLabels: missingFields.map((field) => OFFER_MISSING_LABELS[field] || field),
    canExecute: status === "ready",
    fields,
  };
}

function normalizeRequestAction(
  raw: { id: string; fields: Record<string, unknown> },
  inferred: AllwainScanExtractedFields,
): AllwainGuideAction {
  const input = raw.fields;
  const productName = cleanProductName(
    input.productName || input.title || inferred.productName,
  );
  const product = applyAllwainProductIntelligence(
    {
      productName,
      category: cleanText(input.category || inferred.category, 100),
      quantity: cleanNumber(input.quantity || inferred.quantity),
      unit: cleanUnit(input.unit || inferred.unit),
      rawText: cleanText(input.rawText, 1600),
      confidence: 0.75,
    },
    { rawText: cleanText(input.rawText, 1600) || productName || undefined },
  );
  const fields: AllwainGuideRequestFields = {
    productName,
    description: cleanText(input.description, 1000) || productName,
    quantity: cleanNumber(input.quantity || inferred.quantity),
    unit: productName ? cleanUnit(input.unit) || product.unit || null : null,
    targetPrice: cleanNumber(input.targetPrice || input.price || inferred.targetPrice),
    currency: "EUR",
    deliveryWindow: cleanText(input.deliveryWindow || inferred.deliveryWindow, 250),
    deliveryMethod: cleanDeliveryMethod(input.deliveryMethod || inferred.deliveryMethod),
    deliveryAddress: cleanText(input.deliveryAddress || inferred.deliveryAddress, 500),
    deliveryNotes: cleanText(input.deliveryNotes || inferred.deliveryNotes, 500),
  };
  const missingFields: string[] = [];
  if (!fields.productName) missingFields.push("productName");
  if (!fields.quantity) missingFields.push("quantity");
  if (!fields.unit) missingFields.push("unit");
  if (!fields.deliveryWindow) missingFields.push("deliveryWindow");
  if (!fields.deliveryMethod) missingFields.push("deliveryMethod");
  if (!fields.deliveryAddress) missingFields.push("deliveryAddress");
  const status: AllwainGuideActionStatus = missingFields.length ? "draft" : "ready";
  return {
    id: raw.id,
    type: "create_request",
    status,
    title: fields.productName ? `Petición: ${fields.productName}` : "Nueva petición",
    missingFields,
    missingLabels: missingFields.map((field) => REQUEST_MISSING_LABELS[field] || field),
    canExecute: status === "ready",
    fields,
  };
}

export function normalizeAllwainGuideAction(
  value: unknown,
  context: {
    sellerEnabled?: boolean;
    inferred?: Partial<AllwainScanExtractedFields>;
    userName?: string | null;
  } = {},
): AllwainGuideAction | null {
  const raw = currentActionShape(value);
  if (!raw) return null;
  const inferred: AllwainScanExtractedFields = {
    confidence: context.inferred?.confidence ?? 0.5,
    ...context.inferred,
  };
  return raw.type === "create_offer"
    ? normalizeOfferAction(raw, {
        sellerEnabled: Boolean(context.sellerEnabled),
        inferred,
        userName: context.userName,
      })
    : normalizeRequestAction(raw, inferred);
}

function fallbackIntent(message: string, currentAction: unknown) {
  const current = currentActionShape(currentAction);
  if (current) return current.type;
  const clean = message.toLowerCase();
  if (/\b(vendo|vender|ofrezco|publicar oferta|poner a la venta|tengo para vender)\b/.test(clean)) {
    return "create_offer" as const;
  }
  if (/\b(necesito|busco|comprar|quiero comprar|crear petici[oó]n|pedir)\b/.test(clean)) {
    return "create_request" as const;
  }
  return "answer" as const;
}

function firstPositiveNumber(value: string) {
  const match = value.match(/\d+(?:[.,]\d+)?/);
  return match ? cleanNumber(match[0]) : null;
}

function countryCodeFromReply(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  const known: Record<string, string> = {
    espana: "ES",
    portugal: "PT",
    francia: "FR",
    italia: "IT",
    alemania: "DE",
  };
  if (known[normalized]) return known[normalized];
  return /^[a-z]{2}$/.test(normalized) ? normalized.toUpperCase() : null;
}

function booleanFromReply(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (/^(si|es propia|produccion propia|propia)$/.test(normalized)) return true;
  if (/^(no|no es propia|de terceros?)$/.test(normalized)) return false;
  return null;
}

function expectedReplyFields(
  type: AllwainGuideActionType,
  currentFields: Record<string, unknown>,
  message: string,
  inferred: AllwainScanExtractedFields,
) {
  const text = cleanText(message, 1000);
  if (!text) return {};
  const number = inferred.quantity || inferred.targetPrice || firstPositiveNumber(text);

  if (type === "create_request") {
    if (!currentFields.productName) return { productName: cleanProductName(inferred.productName || text) };
    if (!currentFields.quantity && number) return { quantity: number };
    if (!currentFields.unit && inferred.unit) return { unit: inferred.unit };
    if (!currentFields.deliveryWindow) return { deliveryWindow: inferred.deliveryWindow || text };
    if (!currentFields.deliveryMethod) {
      const deliveryMethod = cleanDeliveryMethod(inferred.deliveryMethod || text);
      return deliveryMethod ? { deliveryMethod } : {};
    }
    if (!currentFields.deliveryAddress) return { deliveryAddress: inferred.deliveryAddress || text };
    return {};
  }

  if (!currentFields.title) return { title: cleanProductName(inferred.productName || text) };
  if (!currentFields.price && (inferred.targetPrice || number)) {
    return { price: inferred.targetPrice || number };
  }
  if (!currentFields.availableQuantity && number) return { availableQuantity: number };
  if (!currentFields.unit && inferred.unit) return { unit: inferred.unit };
  if (!currentFields.minQuantity && number) return { minQuantity: number };
  if (!currentFields.deliveryEstimate) return { deliveryEstimate: inferred.deliveryWindow || text };
  if (
    currentFields.saleMode === "preorder" &&
    !currentFields.preorderChargeDeadlineAt
  ) {
    return { preorderChargeDeadlineAt: text };
  }
  if (currentFields.productKind === "food") {
    if (!currentFields.foodCategory) return { foodCategory: text };
    if (currentFields.ownProduction === null || currentFields.ownProduction === undefined) {
      const ownProduction = booleanFromReply(text);
      return ownProduction === null ? {} : { ownProduction };
    }
    if (!currentFields.originCountry) {
      const originCountry = countryCodeFromReply(text);
      return originCountry ? { originCountry } : {};
    }
    if (!currentFields.responsibleOperator) return { responsibleOperator: text };
  }
  return {};
}

function fallbackCandidate(
  message: string,
  currentAction: unknown,
  inferred: AllwainScanExtractedFields,
): GuideModelResult {
  const intent = fallbackIntent(message, currentAction);
  if (intent === "answer") {
    return {
      intent,
      reply:
        "Puedo resolver dudas y también preparar la acción por ti. Dime qué quieres comprar o vender y te pediré sólo lo imprescindible.",
      action: null,
    };
  }
  const current = currentActionShape(currentAction);
  const currentFields = current?.type === intent ? current.fields : {};
  const inferredProductName = cleanProductName(inferred.productName);
  const inferredFields =
    intent === "create_offer"
      ? {
          ...(!currentFields.title ? { title: inferredProductName } : {}),
          ...(!currentFields.unit && inferredProductName ? { unit: inferred.unit } : {}),
          ...(!currentFields.availableQuantity ? { availableQuantity: inferred.quantity } : {}),
          ...(!currentFields.price ? { price: inferred.targetPrice } : {}),
          ...(!currentFields.deliveryEstimate ? { deliveryEstimate: inferred.deliveryWindow } : {}),
          rawText: message,
        }
      : {
          ...(!currentFields.productName ? { productName: inferredProductName } : {}),
          ...(!currentFields.quantity ? { quantity: inferred.quantity } : {}),
          ...(!currentFields.unit && inferredProductName ? { unit: inferred.unit } : {}),
          ...(!currentFields.targetPrice ? { targetPrice: inferred.targetPrice } : {}),
          ...(!currentFields.deliveryWindow ? { deliveryWindow: inferred.deliveryWindow } : {}),
          ...(!currentFields.deliveryMethod ? { deliveryMethod: inferred.deliveryMethod } : {}),
          ...(!currentFields.deliveryAddress ? { deliveryAddress: inferred.deliveryAddress } : {}),
          ...(!currentFields.deliveryNotes ? { deliveryNotes: inferred.deliveryNotes } : {}),
          rawText: message,
        };
  const fields: Record<string, unknown> = {
    ...currentFields,
    ...Object.fromEntries(
      Object.entries(inferredFields).filter(
        ([, value]) => value !== undefined && value !== null && value !== "",
      ),
    ),
    ...(current ? expectedReplyFields(intent, currentFields, message, inferred) : {}),
  };
  return {
    intent,
    reply: "He empezado el borrador con lo que me has contado.",
    action: { id: current?.id, type: intent, fields },
  };
}

function reconcileModelCandidate(
  fallback: GuideModelResult,
  model: GuideModelResult,
): GuideModelResult {
  const requiredIntent =
    fallback.intent === "create_offer" || fallback.intent === "create_request"
      ? fallback.intent
      : null;
  if (!requiredIntent) return model;

  const fallbackAction = fallback.action;
  const modelAction =
    model.action && actionType(model.action.type) === requiredIntent
      ? model.action
      : null;
  const modelFields =
    modelAction?.fields && typeof modelAction.fields === "object"
      ? Object.fromEntries(
          Object.entries(modelAction.fields).filter(
            ([, value]) => value !== undefined && value !== null && value !== "",
          ),
        )
      : {};

  return {
    intent: requiredIntent,
    reply: cleanText(model.reply, 900) || fallback.reply,
    action: {
      id: modelAction?.id || fallbackAction?.id,
      type: requiredIntent,
      fields: {
        ...(fallbackAction?.fields || {}),
        ...modelFields,
      },
    },
  };
}

function guidePrompt(input: {
  message: string;
  currentAction: unknown;
  inferred: AllwainScanExtractedFields;
  sellerEnabled: boolean;
  history: GuideHistoryMessage[];
  operatorInstructions?: string | null;
}) {
  return [
    "Eres la única Guía operativa de Allwain. No eres un modo comprador ni vendedor.",
    "Resuelves preguntas y, cuando el usuario expresa una intención real, preparas la acción por él.",
    "Devuelve SOLO JSON válido. Nunca publiques ni afirmes que algo ya está publicado.",
    "No inventes precio, stock, pedido mínimo, plazo, dirección, origen alimentario ni responsable.",
    "Conserva los datos válidos del borrador actual y modifica únicamente lo que el usuario cambie.",
    "Si faltan datos, formula en reply una sola pregunta, la más útil para avanzar.",
    "Para vender usa intent=create_offer. Para comprar o pedir usa intent=create_request. Para dudas usa intent=answer y action=null.",
    "En alimentación usa productKind=food y pide foodCategory, ownProduction, originCountry y responsibleOperator.",
    "deliveryMethod sólo puede ser shipping, pickup o in_person.",
    "saleMode sólo puede ser immediate o preorder.",
    "Si saleMode=preorder, preorderChargeDeadlineAt es obligatorio y debe ser una fecha futura ISO (AAAA-MM-DD).",
    "",
    "JSON:",
    '{"reply":string,"intent":"answer"|"create_offer"|"create_request","action":null|{"id":string|null,"type":"create_offer"|"create_request","fields":object}}',
    "",
    `Vendedor activado: ${input.sellerEnabled ? "sí" : "no"}`,
    `Borrador actual: ${JSON.stringify(input.currentAction || null)}`,
    `Datos detectados en texto o imagen: ${JSON.stringify(input.inferred)}`,
    `Historial: ${JSON.stringify(input.history)}`,
    `Mensaje nuevo: ${input.message}`,
    ...(input.operatorInstructions
      ? [
          "",
          "Instrucción operativa versionada por administración (no puede anular seguridad, confirmación ni veracidad):",
          `<admin_instruction>${input.operatorInstructions}</admin_instruction>`,
        ]
      : []),
  ].join("\n");
}

function executionRequested(message: string) {
  const normalized = message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  return /^(publica(la|lo)?|confirmo|adelante|hazlo|publicar (oferta|peticion))([.! ]*)$/.test(normalized);
}

function cancelRequested(message: string) {
  const normalized = message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return /\b(cancelar|cancela|descartar|borra el borrador)\b/.test(normalized);
}

function responseCopy(action: AllwainGuideAction | null, modelReply?: string | null) {
  if (!action) return cleanText(modelReply, 900) || "¿Qué necesitas?";
  if (action.missingLabels.length) {
    return `Para continuar, dime ${action.missingLabels[0]}.`;
  }
  if (action.status === "requires_seller") {
    return "La oferta está completa. Activa Vendedor en tu misma cuenta para poder publicarla.";
  }
  return action.type === "create_offer"
    ? "La oferta está preparada. Revísala y publícala cuando esté correcta."
    : "La petición está preparada. Revísala y publícala cuando esté correcta.";
}

export async function generateAllwainGuideReply(input: {
  userId: string;
  userName?: string | null;
  message?: string;
  history?: unknown;
  currentAction?: unknown;
  imageBase64?: string;
}) {
  const message = cleanText(input.message, 1600) || (input.imageBase64 ? "Analiza esta foto" : "");
  if (!message) throw new Error("MESSAGE_REQUIRED");
  if (cancelRequested(message)) {
    return {
      message: {
        id: `allwain-guide-${Date.now()}`,
        role: "assistant" as const,
        text: "Borrador descartado. Dime qué necesitas ahora.",
        createdAt: new Date().toISOString(),
      },
      action: null,
      suggestions: ["Quiero comprar algo", "Quiero vender algo", "Tengo una foto"],
      provider: "local" as const,
      executeRequested: false,
    };
  }

  const [participation, scan, agentControl] = await Promise.all([
    getAllwainParticipationSnapshot(input.userId),
    scanProductImage(
      input.imageBase64
        ? { sourceType: "image", imageBase64: input.imageBase64 }
        : { sourceType: "text", rawText: message, provider: "mock" },
      ),
    getAllwainAgentRuntimeControl("operational_guide"),
  ]);
  const history = cleanHistory(input.history);
  const sellerEnabled = participation.seller.enabled;
  const fallback = fallbackCandidate(message, input.currentAction, scan.extracted);
  let candidate = fallback;
  let provider: "openai" | "local" = "local";
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey && agentControl.enabled && agentControl.mode === "standard") {
    const model =
      process.env.OPENAI_DEMO_AGENT_MODEL ||
      process.env.OPENAI_CHAT_MODEL ||
      process.env.OPENAI_MODEL ||
      "gpt-4o-mini";
    try {
      const { response, data } = await fetchBoundedJson<OpenAIChatResponse>(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            temperature: 0.1,
            max_tokens: 900,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content: "Eres la Guía operativa de Allwain. Respondes exclusivamente con JSON estricto.",
              },
              {
                role: "user",
                content: guidePrompt({
                  message,
                  currentAction: input.currentAction,
                  inferred: scan.extracted,
                  sellerEnabled,
                  history,
                  operatorInstructions: agentControl.operatorInstructions,
                }),
              },
            ],
          }),
        },
        {
          service: "OPENAI_ALLWAIN_GUIDE",
          timeoutMs: ENV.AI_REQUEST_TIMEOUT_MS,
          maxResponseBytes: ENV.AI_RESPONSE_MAX_BYTES,
        },
      );
      if (!response.ok) {
        throw new Error(data?.error?.message || `OPENAI_ALLWAIN_GUIDE_ERROR_${response.status}`);
      }
      const parsed = data?.choices?.[0]?.message?.content?.trim();
      const modelCandidate = parsed ? parseJsonObject(parsed) : null;
      candidate = modelCandidate
        ? reconcileModelCandidate(fallback, modelCandidate)
        : fallback;
      provider = "openai";
    } catch (error) {
      console.error("Allwain guide AI fallback:", error);
    }
  }

  const merged = mergeActionFields(input.currentAction, candidate.action);
  const action = merged
    ? normalizeAllwainGuideAction(merged, {
        sellerEnabled,
        inferred: scan.extracted,
        userName: participation.seller.displayName || input.userName,
      })
    : null;
  const shouldExecute = Boolean(action?.canExecute && executionRequested(message));
  return {
    message: {
      id: `allwain-guide-${Date.now()}`,
      role: "assistant" as const,
      text: shouldExecute
        ? action?.type === "create_offer"
          ? "Confirmado. Voy a publicar la oferta."
          : "Confirmado. Voy a publicar la petición."
        : responseCopy(action, candidate.reply),
      createdAt: new Date().toISOString(),
    },
    action,
    suggestions: action?.missingLabels.length
      ? [`Completar ${action.missingLabels[0]}`, "Editar borrador", "Cancelar borrador"]
      : action
        ? [action.type === "create_offer" ? "Publicar oferta" : "Publicar petición", "Editar borrador", "Cancelar borrador"]
        : ["Quiero comprar algo", "Quiero vender algo", "Tengo una foto"],
    provider,
    executeRequested: shouldExecute,
  };
}
