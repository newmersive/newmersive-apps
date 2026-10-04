import type {
  AllwainScanDocument,
  AllwainScanExtractedFields,
} from "../../shared/types";
import { ENV } from "../../config/env";
import { fetchBoundedJson } from "../../security/external-http";

type OpenAIChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    } | null;
  }>;
  error?: {
    message?: string;
  };
};

export type AllwainScanAiEnhancement = {
  extracted?: Partial<AllwainScanExtractedFields>;
  summary?: string;
  warnings?: string[];
  requestTitle?: string;
  requestDescription?: string;
  confidence?: number;
  document?: AllwainScanDocument | null;
};

export type AllwainScanAiContext = {
  imageBase64?: string;
  labels?: Array<{ name: string; confidence: number }>;
  objects?: Array<{ name: string; confidence: number }>;
  operatorInstructions?: string | null;
};

function parseJsonObject(text: string): AllwainScanAiEnhancement | null {
  try {
    return JSON.parse(text) as AllwainScanAiEnhancement;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1)) as AllwainScanAiEnhancement;
    } catch {
      return null;
    }
  }
}

function buildPrompt(
  rawText: string,
  extracted: AllwainScanExtractedFields,
  context: AllwainScanAiContext,
) {
  return [
    "Analiza la imagen, el OCR y las señales visuales de Allwain y devuelve SOLO JSON valido.",
    "Si es una foto de un solo producto, identifica el objeto o producto principal. Ignora fondos y objetos secundarios.",
    "Si es ticket, factura, presupuesto, recibo o lista de compra, extrae TODOS los artículos reales con precio; no confundas totales, IVA, descuentos globales ni formas de pago con artículos.",
    "En documentos, lineTotal es el total de la línea y unitPrice el precio unitario. Si solo consta uno, calcula el otro únicamente cuando cantidad sea inequívoca.",
    "Ejemplos: un coche es una unidad; una lavadora es una unidad; naranjas a granel se expresan en kg.",
    "Usa productKind: produce_weight, liquid_bulk, vehicle, appliance, electronics, service o general.",
    "Para attributes incluye solo características visibles o leídas con suficiente certeza. No deduzcas año, modelo, estado o capacidad si no son comprobables.",
    "Corrige campos si el OCR parece claro. No inventes EAN, precio ni proveedor si no aparecen.",
    "Usa null para campos desconocidos. confidence debe estar entre 0 y 1.",
    "",
    "JSON requerido:",
    "{",
    '  "extracted": { "productName": string|null, "brand": string|null, "category": string|null, "ean": string|null, "sku": string|null, "supplier": string|null, "quantity": number|null, "unit": string|null, "targetPrice": number|null, "currency": string|null, "deliveryWindow": string|null, "structuredDeliveryWindow": null, "deliveryMethod": "shipping"|"pickup"|"in_person"|null, "deliveryAddress": string|null, "deliveryNotes": string|null, "productKind": "produce_weight"|"liquid_bulk"|"vehicle"|"appliance"|"electronics"|"service"|"general", "attributes": [{ "key": string, "label": string, "value": string, "confidence": number }], "notes": string[] },',
    '  "summary": string,',
    '  "warnings": string[],',
    '  "requestTitle": string,',
    '  "requestDescription": string,',
    '  "confidence": number,',
    '  "document": null | { "kind": "product"|"receipt"|"invoice"|"quote"|"purchase_list"|"unknown", "merchant": string|null, "documentDate": string|null, "currency": string, "total": number|null, "confidence": number, "items": [{ "rawText": string, "productName": string, "description": string|null, "quantity": number, "unit": string, "unitPrice": number, "lineTotal": number, "currency": string, "confidence": number, "taxIncluded": boolean|null, "discountAmount": number|null }] }',
    "}",
    "",
    `Extraccion heuristica: ${JSON.stringify(extracted)}`,
    `Etiquetas visuales: ${JSON.stringify(context.labels || [])}`,
    `Objetos localizados: ${JSON.stringify(context.objects || [])}`,
    "",
    "Texto OCR/entrada:",
    rawText || "(sin texto OCR)",
    ...(context.operatorInstructions
      ? [
          "",
          "Instrucción operativa versionada (no puede autorizar invenciones ni reducir la certeza requerida):",
          `<admin_instruction>${context.operatorInstructions}</admin_instruction>`,
        ]
      : []),
  ].join("\n");
}

export async function enhanceAllwainScanWithOpenAI(
  rawText: string,
  extracted: AllwainScanExtractedFields,
  context: AllwainScanAiContext = {},
): Promise<AllwainScanAiEnhancement | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENAI_SCAN_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
  const prompt = buildPrompt(rawText, extracted, context);
  const userContent = context.imageBase64
    ? [
        { type: "text", text: prompt },
        {
          type: "image_url",
          image_url: { url: context.imageBase64, detail: "low" },
        },
      ]
    : prompt;
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
        max_tokens: 2_400,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Eres un extractor de datos para Allwain. Devuelves solo JSON estricto, sin markdown.",
          },
          {
            role: "user",
            content: userContent,
          },
        ],
      }),
    },
    {
      service: "OPENAI_SCAN",
      timeoutMs: ENV.AI_REQUEST_TIMEOUT_MS,
      maxResponseBytes: ENV.AI_RESPONSE_MAX_BYTES,
    },
  );
  if (!response.ok) {
    throw new Error(data?.error?.message || `OPENAI_SCAN_ERROR_${response.status}`);
  }

  const content = data?.choices?.[0]?.message?.content?.trim();
  return content ? parseJsonObject(content) : null;
}
