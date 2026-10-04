import { ENV } from "../config/env";
import {
  AllwainScanDocument,
  AllwainScanDocumentItem,
  AllwainScanExtractedFields,
  AllwainScanSourceType,
  Offer,
  Product,
} from "../shared/types";
import { buildAllwainScanDemo } from "./allwain-demo.service";
import { interpretAllwainDeliveryWindow } from "./allwain-delivery-intelligence";
import {
  applyAllwainProductIntelligence,
  inferAllwainVisualIdentity,
} from "./allwain-product-intelligence";
import { validateImageDataUrl } from "../security/image-data-url";
import { fetchBoundedJson } from "../security/external-http";
import {
  getAllwainAgentRuntimeControl,
  type AllwainAgentRuntimeControl,
} from "./allwain-agent-control.service";

export type ScanProvider = "google" | "mock";

export interface ScanInput {
  imageBase64?: string;
  barcode?: string;
  rawText?: string;
  sourceType?: AllwainScanSourceType;
  provider?: ScanProvider;
  preview?: boolean;
}

export interface ScanResult {
  product?: Product | null;
  offers: Offer[];
  extracted: AllwainScanExtractedFields;
  provider: ScanProvider;
  confidence: number;
  summary: string;
  warnings: string[];
  rawData: Record<string, unknown>;
  document: AllwainScanDocument | null;
}

interface GoogleVisionAnnotation {
  description?: string;
  score?: number;
}

interface GoogleVisionObjectAnnotation {
  name?: string;
  score?: number;
}

interface GoogleVisionAnnotateResponse {
  responses?: Array<{
    textAnnotations?: GoogleVisionAnnotation[];
    labelAnnotations?: GoogleVisionAnnotation[];
    localizedObjectAnnotations?: GoogleVisionObjectAnnotation[];
    fullTextAnnotation?: {
      text?: string;
    };
    error?: {
      code?: number;
      message?: string;
      status?: string;
    };
  }>;
}

function resolveProvider(override?: ScanProvider): ScanProvider {
  if (ENV.NODE_ENV !== "production" && override) return override;
  if (ENV.SCAN_PROVIDER === "google") return "google";
  return "mock";
}

function cleanInputText(rawText?: string) {
  return (rawText || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function mergeInputText(...parts: Array<string | null | undefined>) {
  return cleanInputText(parts.filter(Boolean).join("\n"));
}

function normalizeImageContent(imageBase64?: string) {
  const value = (imageBase64 || "").trim();
  const match = value.match(/^data:[^;,]+;base64,(.+)$/);
  return (match?.[1] || value).replace(/\s/g, "");
}

function googleVisionUrl() {
  const key = ENV.GOOGLE_CLOUD_VISION_API_KEY || "";
  const separator = ENV.GOOGLE_CLOUD_VISION_ENDPOINT.includes("?") ? "&" : "?";
  return `${ENV.GOOGLE_CLOUD_VISION_ENDPOINT}${separator}key=${encodeURIComponent(key)}`;
}

function readErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Error desconocido";
}

function normalizeVisionSignals<T extends { score?: number }>(
  items: T[] | undefined,
  readName: (item: T) => string | undefined
) {
  return (items || [])
    .map((item) => ({
      name: (readName(item) || "").trim(),
      confidence:
        typeof item.score === "number" && Number.isFinite(item.score)
          ? Math.max(0, Math.min(1, item.score))
          : 0,
    }))
    .filter((item) => item.name)
    .slice(0, 8);
}

async function requestGoogleVisionAnalysis(imageBase64: string, includeVisualSignals: boolean) {
  if (!ENV.GOOGLE_CLOUD_VISION_API_KEY) {
    throw new Error("GOOGLE_VISION_API_KEY_MISSING");
  }

  const content = normalizeImageContent(imageBase64);
  if (!content) {
    throw new Error("GOOGLE_VISION_EMPTY_IMAGE");
  }

  const { response, data } = await fetchBoundedJson<GoogleVisionAnnotateResponse>(
    googleVisionUrl(),
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        requests: [
          {
            image: { content },
            features: [
              { type: "TEXT_DETECTION" },
              ...(includeVisualSignals
                ? [
                    { type: "LABEL_DETECTION", maxResults: 8 },
                    { type: "OBJECT_LOCALIZATION", maxResults: 6 },
                  ]
                : []),
            ],
          },
        ],
      }),
    },
    {
      service: "GOOGLE_VISION",
      timeoutMs: ENV.GOOGLE_VISION_REQUEST_TIMEOUT_MS,
      maxResponseBytes: ENV.GOOGLE_VISION_RESPONSE_MAX_BYTES,
    },
  );

  if (!response.ok) {
    throw new Error(`GOOGLE_VISION_HTTP_${response.status}`);
  }

  const result = data?.responses?.[0];
  if (result?.error) {
    throw new Error(result.error.message || result.error.status || "GOOGLE_VISION_API_ERROR");
  }

  const text =
    result?.textAnnotations?.[0]?.description ||
    result?.fullTextAnnotation?.text ||
    "";

  return {
    text: cleanInputText(text),
    annotationCount: result?.textAnnotations?.length || 0,
    labels: normalizeVisionSignals(result?.labelAnnotations, (item) => item.description),
    objects: normalizeVisionSignals(result?.localizedObjectAnnotations, (item) => item.name),
  };
}

function readLabeledValue(text: string, labels: string[]) {
  for (const label of labels) {
    const expression = new RegExp(`${label}\\s*[:\\-]\\s*([^\\n]+)`, "i");
    const match = text.match(expression);
    if (match?.[1]) return match[1].trim();
  }

  return null;
}

function parseNumber(value?: string | null) {
  if (!value) return null;
  const match = value.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  return Number(match[0].replace(",", "."));
}

function parseQuantity(text: string) {
  const labeled = readLabeledValue(text, ["cantidad", "qty", "unidades", "uds"]);
  const labeledNumber = parseNumber(labeled);
  if (labeledNumber !== null) return labeledNumber;

  const match = text.match(
    /(\d+(?:[.,]\d+)?)\s*(uds|unidades|kg|g|l|ml|cajas?)(?=\s|[.,;:!?]|$)/i,
  );
  if (match) return Number(match[1].replace(",", "."));

  const naturalRequest = text.replace(/\s+/g, " ").trim().match(
    /^(?:necesito|quiero|busco|solicito|me hacen falta)\s+(?:(?:unas?|unos?)\s+)?(\d+(?:[.,]\d+)?)\s+(?=[a-záéíóúüñ])/i,
  );
  return naturalRequest ? Number(naturalRequest[1].replace(",", ".")) : null;
}

function parseUnit(text: string) {
  const labeled = readLabeledValue(text, ["unidad", "unit", "formato"]);
  if (labeled) return labeled;

  const quantityLine = readLabeledValue(text, ["cantidad", "qty", "unidades", "uds"]);
  const quantityUnit = quantityLine?.match(
    /\d+(?:[.,]\d+)?\s*(uds|unidades|kg|g|l|ml|cajas?)(?=\s|[.,;:!?]|$)/i,
  );
  if (quantityUnit?.[1]) return quantityUnit[1];

  const match = text.match(
    /\d+(?:[.,]\d+)?\s*(uds|unidades|kg|g|l|ml|cajas?)(?=\s|[.,;:!?]|$)/i,
  );
  return match?.[1] || null;
}

function parseTargetPrice(text: string) {
  const labeled = readLabeledValue(text, ["precio", "importe", "total", "presupuesto"]);
  const labeledNumber = parseNumber(labeled);
  if (labeledNumber !== null) return labeledNumber;

  const euroMatch = text.match(/(?:€\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:€|eur)/i);
  return euroMatch ? Number(euroMatch[1].replace(",", ".")) : null;
}

function parseCurrency(text: string) {
  if (/€|eur/i.test(text)) return "EUR";
  if (/\$|usd/i.test(text)) return "USD";
  return null;
}

function parseDocumentMoney(value: string) {
  let normalized = value.replace(/[^\d,.-]/g, "");
  if (!normalized) return null;
  const comma = normalized.lastIndexOf(",");
  const dot = normalized.lastIndexOf(".");
  const decimalIndex = Math.max(comma, dot);
  if (decimalIndex >= 0 && normalized.length - decimalIndex - 1 === 2) {
    const integer = normalized.slice(0, decimalIndex).replace(/[.,]/g, "");
    const decimals = normalized.slice(decimalIndex + 1);
    normalized = `${integer}.${decimals}`;
  } else {
    normalized = normalized.replace(/[.,]/g, "");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 10_000_000
    ? parsed
    : null;
}

const DOCUMENT_LINE_TOTAL =
  /(?:€\s*)?(\d+(?:[.\s]\d{3})*(?:,\d{2})|\d+(?:,\d{2}|\.\d{2}))\s*(?:€|EUR|USD|\$)?\s*$/i;
const DOCUMENT_NON_ITEM =
  /^(?:total|subtotal|base\s+imponible|iva|impuesto|tax|descuento|ahorro|pago|pagado|tarjeta|efectivo|cambio|redondeo|nif|cif|fecha|hora|ticket|factura|presupuesto|recibo|importe\s+total)\b/i;

function documentKind(text: string, itemCount: number): AllwainScanDocument["kind"] {
  if (/\bfactura\b/i.test(text)) return "invoice";
  if (/\bpresupuesto\b|\bcotizaci[oó]n\b/i.test(text)) return "quote";
  if (/\brecibo\b/i.test(text)) return "receipt";
  if (/\bticket\b|\bcompra\b|\bcaja\b/i.test(text) && itemCount) {
    return "receipt";
  }
  if (/\blista\s+de\s+(?:la\s+)?compra\b/i.test(text)) return "purchase_list";
  return itemCount > 1 ? "unknown" : "product";
}

function documentMerchant(text: string) {
  return (
    readLabeledValue(text, ["comercio", "empresa", "proveedor", "tienda"]) ||
    text
      .split("\n")
      .map((line) => line.trim())
      .find(
        (line) =>
          line.length >= 2 &&
          line.length <= 80 &&
          !DOCUMENT_LINE_TOTAL.test(line) &&
          !/^(?:ticket|factura|recibo|presupuesto|fecha|nif|cif)\b/i.test(line),
      ) ||
    null
  );
}

function normalizeDocumentUnit(value: string | null | undefined) {
  const source = String(value || "").toLowerCase();
  if (/^(?:kg|kilo|kilos|kilogramo|kilogramos)$/.test(source)) return "kg";
  if (/^(?:g|gr|gramo|gramos)$/.test(source)) return "g";
  if (/^(?:l|litro|litros)$/.test(source)) return "l";
  if (/^(?:ml|mililitro|mililitros)$/.test(source)) return "ml";
  if (/^(?:caja|cajas)$/.test(source)) return "caja";
  if (/^(?:paquete|paquetes|pack|packs)$/.test(source)) return "pack";
  return "ud";
}

export function extractAllwainDocumentFromText(
  rawValue: string,
): AllwainScanDocument | null {
  const text = cleanInputText(rawValue);
  if (!text) return null;
  const currency = parseCurrency(text) || "EUR";
  const items: AllwainScanDocumentItem[] = [];
  for (const originalLine of text.split("\n")) {
    const rawLine = originalLine.replace(/\s+/g, " ").trim();
    if (!rawLine || DOCUMENT_NON_ITEM.test(rawLine)) continue;
    const totalMatch = rawLine.match(DOCUMENT_LINE_TOTAL);
    if (!totalMatch || totalMatch.index === undefined) continue;
    const lineTotal = parseDocumentMoney(totalMatch[1]);
    if (lineTotal === null) continue;
    let productPart = rawLine.slice(0, totalMatch.index).trim();
    if (productPart.length < 2 || /^\d+$/.test(productPart)) continue;

    let quantity = 1;
    let unit = "ud";
    // Printed tables commonly put quantity and unit price after the name.
    // Only split this layout when its arithmetic agrees with the line total.
    const columns = productPart.match(
      /^(.+?)\s+(\d+(?:[.,]\d+)?)\s+(kg|g|l|ml|cajas?|uds?|unidades?|paquetes?|packs?)\s+(\d+(?:[.,]\d{2}))\s*(?:€|EUR|USD|\$)?$/i,
    );
    if (columns) {
      const count = Number(columns[2].replace(",", "."));
      const price = parseDocumentMoney(columns[4]);
      if (price !== null && Math.abs(count * price - lineTotal) <= 0.02) {
        quantity = count;
        unit = normalizeDocumentUnit(columns[3]);
        productPart = columns[1].trim();
      }
    }
    const leadingQuantity = productPart.match(
      /^(\d+(?:[.,]\d+)?)\s*(?:x|×)\s+(.+)$/i,
    );
    if (leadingQuantity) {
      quantity = Number(leadingQuantity[1].replace(",", "."));
      productPart = leadingQuantity[2].trim();
    } else {
      const leadingMeasurement = productPart.match(
        /^(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|cajas?|uds?|unidades?)\s+(?:de\s+)?(.+)$/i,
      );
      if (leadingMeasurement) {
        quantity = Number(leadingMeasurement[1].replace(",", "."));
        unit = normalizeDocumentUnit(leadingMeasurement[2]);
        productPart = leadingMeasurement[3].trim();
      }
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) {
      continue;
    }

    const embeddedUnitPrice = productPart.match(
      /(.+?)\s+(?:x|×|@)\s*(\d+(?:[.,]\d{2}))\s*(?:€|EUR|USD|\$)?$/i,
    );
    let unitPrice = lineTotal / quantity;
    if (embeddedUnitPrice) {
      const parsedUnitPrice = parseDocumentMoney(embeddedUnitPrice[2]);
      if (parsedUnitPrice !== null) unitPrice = parsedUnitPrice;
      productPart = embeddedUnitPrice[1].trim();
    }
    const productName = productPart
      .replace(/^(?:\d{5,14}\s+)+/, "")
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, 160);
    if (productName.length < 2 || !/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(productName)) {
      continue;
    }
    items.push({
      rawText: rawLine.slice(0, 500),
      productName,
      description: null,
      quantity,
      unit,
      unitPrice: Number(unitPrice.toFixed(2)),
      lineTotal: Number(lineTotal.toFixed(2)),
      currency,
      confidence: 0.72,
      taxIncluded: null,
      discountAmount: null,
    });
    if (items.length >= 100) break;
  }
  const kind = documentKind(text, items.length);
  if (!items.length || (items.length === 1 && kind === "product")) return null;
  const totalLabel = readLabeledValue(text, ["importe total", "total"]);
  return {
    kind,
    merchant: documentMerchant(text),
    documentDate:
      text.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/)?.[1] || null,
    currency,
    total: parseDocumentMoney(totalLabel || ""),
    confidence: Number(
      (items.reduce((sum, item) => sum + item.confidence, 0) / items.length).toFixed(2),
    ),
    items,
  };
}

function normalizeAiDocument(value: unknown): AllwainScanDocument | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as any;
  const allowedKinds = new Set([
    "product",
    "receipt",
    "invoice",
    "quote",
    "purchase_list",
    "unknown",
  ]);
  if (!allowedKinds.has(raw.kind) || !Array.isArray(raw.items)) return null;
  const currency = String(raw.currency || "EUR").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return null;
  const items = raw.items
    .slice(0, 100)
    .map((item: any) => {
      const productName = nullableString(item?.productName);
      const quantity = nullableNumber(item?.quantity);
      const unitPrice = nullableNumber(item?.unitPrice);
      const lineTotal = nullableNumber(item?.lineTotal);
      const itemCurrency = String(item?.currency || currency).toUpperCase();
      if (
        !productName ||
        !quantity ||
        !unitPrice ||
        !lineTotal ||
        !/^[A-Z]{3}$/.test(itemCurrency)
      ) {
        return null;
      }
      return {
        rawText: nullableString(item.rawText) || productName,
        productName,
        description: nullableString(item.description) || null,
        quantity,
        unit: normalizeDocumentUnit(nullableString(item.unit)),
        unitPrice,
        lineTotal,
        currency: itemCurrency,
        confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0.5)),
        taxIncluded:
          typeof item.taxIncluded === "boolean" ? item.taxIncluded : null,
        discountAmount:
          nullableNumber(item.discountAmount) === undefined
            ? null
            : nullableNumber(item.discountAmount) || null,
      } as AllwainScanDocumentItem;
    })
    .filter((item: AllwainScanDocumentItem | null): item is AllwainScanDocumentItem => Boolean(item));
  if (!items.length) return null;
  return {
    kind: raw.kind,
    merchant: nullableString(raw.merchant) || null,
    documentDate: nullableString(raw.documentDate) || null,
    currency,
    total: nullableNumber(raw.total) ?? null,
    confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0.5)),
    items,
  };
}

function parseDeliveryWindow(text: string) {
  const labeled = readLabeledValue(text, [
    "fecha de entrega",
    "plazo de entrega",
    "cuando lo necesito",
    "cuándo lo necesito",
    "necesario para",
    "plazo",
  ]);
  if (labeled) return labeled;

  const source = text.replace(/\s+/g, " ").trim();
  const natural = source.match(
    /\b(?:para\s+(?:(?:el|la)\s+)?|antes\s+de(?:l)?\s+|durante\s+(?:la\s+)?)(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|pr[oó]xima semana|semana que viene|fin de semana|ma[ñn]ana|pasado ma[ñn]ana|\d{1,2}(?:\s+de\s+[a-záéíóúñ]+)?)/i,
  );
  if (natural?.[1]) {
    return /^para\s+/i.test(natural[0])
      ? natural[0].replace(/^para\s+/i, "").trim()
      : natural[1].trim();
  }

  const relative = source.match(
    /\b(?:en|dentro de)\s+\d+(?:[.,]\d+)?\s+(?:horas?|d[ií]as?|semanas?)\b/i,
  );
  return relative?.[0]?.trim() || null;
}

function parseDeliveryMethod(text: string): AllwainScanExtractedFields["deliveryMethod"] {
  const labeled = readLabeledValue(text, ["modalidad de entrega", "tipo de entrega"]);
  const source = labeled || text;
  if (/recogida|recoger/i.test(source)) return "pickup";
  if (/en persona|entrega personal|mano/i.test(source)) return "in_person";
  if (/env[ií]o|mensajer[ií]a|domicilio/i.test(source)) return "shipping";
  return null;
}

function parseDeliveryAddress(text: string) {
  const labeled = readLabeledValue(text, [
    "direccion de entrega",
    "dirección de entrega",
    "direccion de envio",
    "dirección de envío",
    "punto de recogida",
    "lugar de entrega",
  ]);
  if (labeled) return labeled;

  const source = text.replace(/\s+/g, " ").trim();
  const natural = source.match(
    /\ben\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ\- ]{0,60}?)(?=\s+(?:antes\s+de(?:l)?|para\s+(?:el|la|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|ma[ñn]ana|\d)|durante\s+(?:la\s+)?pr[oó]xima)\b|[.!?]|$)/i,
  );
  const candidate = natural?.[1]?.trim() || null;
  if (!candidate || /^(?:persona|casa|domicilio|\d+\s+(?:horas?|d[ií]as?|semanas?))$/i.test(candidate)) {
    return null;
  }
  return candidate;
}

function parseCategory(text: string) {
  const lower = text.toLowerCase();
  if (/cafe|café|coffee/.test(lower)) return "cafe";
  if (/cold brew|bebida|botella/.test(lower)) return "bebidas";
  if (/etiqueta|qr|nfc|packaging|caja/.test(lower)) return "packaging";
  if (/acero|cable|industrial|energia|transporte/.test(lower)) return "industrial";
  if (/software|saas|licencia|servicio/.test(lower)) return "servicios";
  return readLabeledValue(text, ["categoria", "category"]);
}

function parseEan(text: string, barcode?: string) {
  if (barcode) return barcode.trim();
  const labeled = readLabeledValue(text, ["ean", "codigo", "barcode"]);
  const labeledCode = labeled?.match(/\d{8,14}/)?.[0];
  if (labeledCode) return labeledCode;
  return text.match(/\b\d{8,14}\b/)?.[0] || null;
}

function firstContentLine(text: string) {
  const labelsToSkip = /^(producto|item|articulo|artículo|proveedor|supplier|cantidad|qty|precio|importe|total|ean|sku|categoria|category)\s*[:\-]/i;
  return (
    text
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line && !labelsToSkip.test(line)) || null
  );
}

function naturalRequestProduct(text: string) {
  const sentence = text.replace(/\s+/g, " ").trim();
  const match = sentence.match(
    /^(?:quiero\s+(?:comprar|vender|pedir|ofrecer)|quiero|necesito|busco|solicito|me hacen falta|vendo|ofrezco)\s+(?:(?:unas?|unos?)\s+)?(?:\d+(?:[.,]\d+)?(?:\s*(?:uds|unidades|kg|g|l|ml|cajas?))?\s+(?:de\s+)?)?(.+?)(?=\s+(?:a|por)\s+\d+(?:[.,]\d+)?\s*(?:€|euros?|eur)(?:\s|$)|\s+(?:para|antes de|con entrega|a entregar|para recoger)\b|\s+en\s+(?=[A-ZÁÉÍÓÚÜÑ])|[.;]|$)/i,
  );
  return match?.[1]?.trim() || null;
}

function inferProductName(text: string, fallback?: Product | null) {
  return (
    readLabeledValue(text, ["producto", "item", "articulo", "artículo", "nombre"]) ||
    naturalRequestProduct(text) ||
    firstContentLine(text) ||
    fallback?.name ||
    null
  );
}

function confidenceFor(extracted: Omit<AllwainScanExtractedFields, "confidence">, hasImage: boolean) {
  const checks = [
    Boolean(extracted.productName),
    Boolean(extracted.ean),
    Boolean(extracted.supplier),
    Boolean(extracted.quantity),
    Boolean(extracted.targetPrice),
    Boolean(extracted.category),
    hasImage,
  ];
  const score = checks.filter(Boolean).length / checks.length;
  return Math.max(0.35, Math.min(0.95, Number(score.toFixed(2))));
}

function buildWarnings(extracted: AllwainScanExtractedFields) {
  const warnings: string[] = [];
  if (!extracted.rawText && !extracted.ean) warnings.push("Sin texto OCR ni código de barras.");
  if (!extracted.quantity) warnings.push("Cantidad no detectada; revisar antes de enviar.");
  if (!extracted.targetPrice) warnings.push("Precio objetivo no detectado.");
  if (extracted.confidence < 0.6) warnings.push("Confianza baja: requiere revisión manual.");
  return warnings;
}

function nullableString(value: unknown) {
  if (typeof value !== "string") return value === null ? null : undefined;
  const clean = value.trim();
  return clean ? clean.slice(0, 300) : null;
}

function nullableNumber(value: unknown) {
  if (value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function mergeAiExtracted(
  base: AllwainScanExtractedFields,
  patch?: Partial<AllwainScanExtractedFields>
): AllwainScanExtractedFields {
  if (!patch) return base;

  const confidence =
    typeof patch.confidence === "number" && Number.isFinite(patch.confidence)
      ? Math.max(0.35, Math.min(0.98, patch.confidence))
      : base.confidence;

  return {
    ...base,
    productName: nullableString(patch.productName) ?? base.productName ?? null,
    brand: nullableString(patch.brand) ?? base.brand ?? null,
    category: nullableString(patch.category) ?? base.category ?? null,
    ean: nullableString(patch.ean) ?? base.ean ?? null,
    sku: nullableString(patch.sku) ?? base.sku ?? null,
    supplier: nullableString(patch.supplier) ?? base.supplier ?? null,
    quantity: patch.quantity !== undefined ? nullableNumber(patch.quantity) ?? null : base.quantity ?? null,
    unit: nullableString(patch.unit) ?? base.unit ?? null,
    targetPrice:
      patch.targetPrice !== undefined ? nullableNumber(patch.targetPrice) ?? null : base.targetPrice ?? null,
    currency: nullableString(patch.currency) ?? base.currency ?? "EUR",
    deliveryWindow: nullableString(patch.deliveryWindow) ?? base.deliveryWindow ?? null,
    structuredDeliveryWindow:
      patch.structuredDeliveryWindow ??
      interpretAllwainDeliveryWindow(
        nullableString(patch.deliveryWindow) ?? base.deliveryWindow ?? null,
      ) ??
      base.structuredDeliveryWindow ??
      null,
    deliveryMethod:
      patch.deliveryMethod === "shipping" ||
      patch.deliveryMethod === "pickup" ||
      patch.deliveryMethod === "in_person"
        ? patch.deliveryMethod
        : base.deliveryMethod ?? null,
    deliveryAddress: nullableString(patch.deliveryAddress) ?? base.deliveryAddress ?? null,
    deliveryNotes: nullableString(patch.deliveryNotes) ?? base.deliveryNotes ?? null,
    productKind:
      patch.productKind === "produce_weight" ||
      patch.productKind === "liquid_bulk" ||
      patch.productKind === "vehicle" ||
      patch.productKind === "appliance" ||
      patch.productKind === "electronics" ||
      patch.productKind === "service" ||
      patch.productKind === "general"
        ? patch.productKind
        : base.productKind ?? null,
    attributes: Array.isArray(patch.attributes)
      ? patch.attributes
      : base.attributes || [],
    rawText: base.rawText ?? null,
    confidence,
    notes: Array.isArray(patch.notes)
      ? patch.notes.filter((note) => typeof note === "string").slice(0, 6)
      : base.notes,
  };
}

async function enhanceScanWithAi(
  rawText: string,
  extracted: AllwainScanExtractedFields,
  rawData: Record<string, unknown>,
  context: {
    imageBase64?: string;
    labels?: Array<{ name: string; confidence: number }>;
    objects?: Array<{ name: string; confidence: number }>;
    operatorInstructions?: string | null;
  } = {},
) {
  const heuristicDocument = extractAllwainDocumentFromText(rawText);
  try {
    const { enhanceAllwainScanWithOpenAI } = await import("./ai/allwain.scan.ai.service");
    const enhancement = await enhanceAllwainScanWithOpenAI(rawText, extracted, context);
    if (!enhancement) {
      const intelligentExtracted = applyAllwainProductIntelligence(extracted, {
        rawText,
        labels: context.labels,
        objects: context.objects,
      });
      return {
        extracted: intelligentExtracted,
        document: heuristicDocument,
        summary: `Petición preparada para ${intelligentExtracted.productName || "el producto escaneado"}.`,
        warnings: buildWarnings(intelligentExtracted),
        rawData: { ...rawData, aiProvider: "none" },
      };
    }

    const aiExtracted = applyAllwainProductIntelligence(
      mergeAiExtracted(extracted, enhancement.extracted),
      {
        rawText,
        labels: context.labels,
        objects: context.objects,
        unitSource: "model",
      },
    );
    const aiConfidence =
      typeof enhancement.confidence === "number" && Number.isFinite(enhancement.confidence)
        ? Math.max(0.35, Math.min(0.98, enhancement.confidence))
        : aiExtracted.confidence;
    aiExtracted.confidence = Math.max(aiExtracted.confidence, aiConfidence);
    const document =
      normalizeAiDocument(enhancement.document) || heuristicDocument;

    return {
      extracted: aiExtracted,
      document,
      summary:
        nullableString(enhancement.summary) ||
        `Petición preparada para ${aiExtracted.productName || "el producto escaneado"}.`,
      warnings: [
        ...buildWarnings(aiExtracted),
        ...(Array.isArray(enhancement.warnings)
          ? enhancement.warnings.filter((warning) => typeof warning === "string").slice(0, 6)
          : []),
      ],
      rawData: {
        ...rawData,
        aiProvider: "openai",
        aiModel: process.env.OPENAI_SCAN_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
        aiRequestTitle: nullableString(enhancement.requestTitle),
        aiRequestDescription: nullableString(enhancement.requestDescription),
      },
    };
  } catch (err) {
    const intelligentExtracted = applyAllwainProductIntelligence(extracted, {
      rawText,
      labels: context.labels,
      objects: context.objects,
    });
    return {
      extracted: intelligentExtracted,
      document: heuristicDocument,
      summary: `Petición preparada para ${intelligentExtracted.productName || "el producto escaneado"}.`,
      warnings: [...buildWarnings(intelligentExtracted), "No pudimos completar el reconocimiento avanzado; revisa la ficha."],
      rawData: {
        ...rawData,
        aiProvider: "openai",
        aiStatus: "error",
        aiError: readErrorMessage(err),
      },
    };
  }
}

function extractWithHeuristics(input: ScanInput, fallbackProduct?: Product | null): AllwainScanExtractedFields {
  const text = cleanInputText(input.rawText);
  const base: Omit<AllwainScanExtractedFields, "confidence"> = {
    productName: inferProductName(text, fallbackProduct),
    brand: readLabeledValue(text, ["marca", "brand"]),
    category: parseCategory(text) || fallbackProduct?.category || null,
    ean: parseEan(text, input.barcode),
    sku: readLabeledValue(text, ["sku", "ref", "referencia"]),
    supplier: readLabeledValue(text, ["proveedor", "supplier", "empresa", "tienda"]),
    quantity: parseQuantity(text),
    unit: parseUnit(text),
    targetPrice: parseTargetPrice(text),
    currency: parseCurrency(text) || "EUR",
    deliveryWindow: parseDeliveryWindow(text),
    structuredDeliveryWindow: interpretAllwainDeliveryWindow(parseDeliveryWindow(text)),
    deliveryMethod: parseDeliveryMethod(text),
    deliveryAddress: parseDeliveryAddress(text),
    deliveryNotes: null,
    rawText: text || null,
    notes: [],
  };

  return applyAllwainProductIntelligence({
    ...base,
    confidence: confidenceFor(base, Boolean(input.imageBase64)),
  }, { rawText: text });
}

async function scanWithGoogleVision(
  input: ScanInput,
  control: AllwainAgentRuntimeControl,
): Promise<ScanResult> {
  const providerWarnings: string[] = [];
  let visionText = "";
  let visionLabels: Array<{ name: string; confidence: number }> = [];
  let visionObjects: Array<{ name: string; confidence: number }> = [];
  let rawData: Record<string, unknown> = {
    provider: "google",
    model: input.preview
      ? "google-vision-live-analysis"
      : "google-vision-multimodal-analysis",
    sourceType: input.sourceType || "image",
    status: input.imageBase64 ? "pending" : "no-image",
    preview: Boolean(input.preview),
  };

  if (input.imageBase64) {
    try {
      const vision = await requestGoogleVisionAnalysis(input.imageBase64, true);
      visionText = vision.text;
      visionLabels = vision.labels;
      visionObjects = vision.objects;
      rawData = {
        ...rawData,
        status: "ok",
        detectedTextLength: visionText.length,
        annotationCount: vision.annotationCount,
        visualLabels: visionLabels,
        detectedObjects: visionObjects,
      };

      if (!visionText && !visionLabels.length && !visionObjects.length) {
        providerWarnings.push("Google Vision no devolvio texto OCR.");
      }
    } catch (err: unknown) {
      const message = readErrorMessage(err);
      const missingKey = message === "GOOGLE_VISION_API_KEY_MISSING";
      providerWarnings.push(
        missingKey
          ? "Google Vision no configurado; se aplico extraccion local."
          : "Google Vision no pudo procesar la imagen; se aplico extraccion local."
      );
      rawData = {
        ...rawData,
        status: missingKey ? "missing-api-key" : "vision-error",
        error: message,
      };
    }
  } else {
    providerWarnings.push("Sin imagen para OCR Google; se aplico extraccion local.");
  }

  const mergedRawText = mergeInputText(input.rawText, visionText);
  let heuristicExtracted = extractWithHeuristics({ ...input, rawText: mergedRawText });
  const visualIdentity = inferAllwainVisualIdentity(visionLabels, visionObjects);
  if (!heuristicExtracted.productName && visualIdentity) {
    heuristicExtracted = {
      ...heuristicExtracted,
      productName: visualIdentity.productName,
      category: heuristicExtracted.category || visualIdentity.category,
      confidence: Math.max(heuristicExtracted.confidence, visualIdentity.confidence),
    };
  }
  const visualCategory = parseCategory(
    [...visionLabels, ...visionObjects].map((item) => item.name).join("\n")
  );
  if (!heuristicExtracted.category && visualCategory) {
    heuristicExtracted.category = visualCategory;
  }
  heuristicExtracted = applyAllwainProductIntelligence(heuristicExtracted, {
    rawText: mergedRawText,
    labels: visionLabels,
    objects: visionObjects,
  });

  const enhanced = input.preview
      ? {
        extracted: heuristicExtracted,
        document: extractAllwainDocumentFromText(mergedRawText),
        summary: heuristicExtracted.productName
          ? `Lectura en curso: ${heuristicExtracted.productName}.`
          : "Lectura en curso: mantén el producto dentro del encuadre.",
        warnings: buildWarnings(heuristicExtracted),
        rawData: { ...rawData, aiProvider: "preview-heuristic" },
      }
    : control.mode === "ocr_only"
      ? {
          extracted: heuristicExtracted,
          document: extractAllwainDocumentFromText(mergedRawText),
          summary: `Petición preparada para ${heuristicExtracted.productName || "el producto escaneado"}.`,
          warnings: buildWarnings(heuristicExtracted),
          rawData: { ...rawData, aiProvider: "disabled_by_operator" },
        }
      : await enhanceScanWithAi(mergedRawText, heuristicExtracted, rawData, {
        imageBase64: input.imageBase64,
        labels: visionLabels,
        objects: visionObjects,
        operatorInstructions: control.operatorInstructions,
      });
  const warnings = [...providerWarnings, ...enhanced.warnings];

  return {
    product: null,
    offers: [],
    extracted: enhanced.extracted,
    provider: "google",
    confidence: enhanced.extracted.confidence,
    summary: enhanced.summary,
    warnings,
    rawData: enhanced.rawData,
    document: enhanced.document || null,
  };
}

async function scanWithMockProvider(input: ScanInput): Promise<ScanResult> {
  const demo = buildAllwainScanDemo();
  const hasUserSignal = Boolean(
    cleanInputText(input.rawText) || input.barcode?.trim() || input.imageBase64?.trim(),
  );
  const useDemoFallback = !input.preview && !hasUserSignal;
  const extracted = extractWithHeuristics(input, useDemoFallback ? demo.product : null);
  const warnings = buildWarnings(extracted);
  const document = extractAllwainDocumentFromText(
    cleanInputText(input.rawText),
  );

  return {
    product: useDemoFallback ? demo.product : null,
    offers: useDemoFallback ? demo.offers : [],
    extracted,
    provider: "mock",
    confidence: extracted.confidence,
    summary: input.preview
      ? extracted.productName
        ? `Lectura en curso: ${extracted.productName}.`
        : "Lectura en curso."
      : extracted.productName
        ? `Allwain detectó ${extracted.productName} y preparó una petición editable.`
        : "Allwain preparó una petición editable.",
    warnings,
    rawData: {
      provider: "mock",
      sourceType: input.sourceType || "text",
      preview: Boolean(input.preview),
      ...(useDemoFallback ? { demoMessage: demo.message } : {}),
    },
    document,
  };
}

export async function scanProductImage(input: ScanInput): Promise<ScanResult> {
  if (
    input.sourceType &&
    !["camera", "image", "barcode", "text", "demo"].includes(input.sourceType)
  ) {
    throw new Error("INVALID_SCAN_SOURCE");
  }
  if ((input.rawText || "").length > ENV.ALLWAIN_SCAN_MAX_TEXT_CHARS) {
    throw new Error("SCAN_TEXT_TOO_LONG");
  }
  if ((input.barcode || "").length > 128 || /[^\x20-\x7e]/.test(input.barcode || "")) {
    throw new Error("INVALID_BARCODE");
  }
  const safeImage = input.imageBase64
    ? validateImageDataUrl(input.imageBase64).dataUrl
    : undefined;
  const safeInput = { ...input, imageBase64: safeImage };
  const control = await getAllwainAgentRuntimeControl("product_recognition");
  const provider = !control.enabled || control.mode === "local_only"
    ? "mock"
    : resolveProvider(safeInput.provider);

  if (provider === "google") {
    return scanWithGoogleVision(safeInput, control);
  }

  return scanWithMockProvider(safeInput);
}

export async function evaluateObjectState(
  input: ScanInput
): Promise<{ status: string; rawData: Record<string, unknown> }> {
  const provider = resolveProvider(input.provider);

  if (provider === "google") {
    return {
      status: "pending-assessment",
      rawData: {
        provider: "google",
        message: "Quality assessment pending integration",
      },
    };
  }

  return {
    status: input.rawText || input.imageBase64 || input.barcode ? "ok" : "needs-input",
    rawData: {
      provider: "mock",
      message: "Estado evaluado con proveedor mock",
    },
  };
}
