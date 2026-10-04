import fs from "fs";
import path from "path";

import { ENV } from "../config/env";
import type { AllwainScanExtractedFields, Offer } from "../shared/types";
import type { ValidatedImageDataUrl } from "../security/image-data-url";

export const ALLWAIN_CARD_IMAGE_KEYS = [
  "oranges",
  "tomatoes",
  "honey",
  "olive-oil",
  "rice",
  "washing-machine",
  "television",
  "laptop",
  "bicycle",
  "car",
  "vehicle-service",
  "plumbing",
  "design",
  "coffee",
  "packaging",
  "cold-brew",
  "ai-service",
  "professional-service",
  "general",
] as const;

export type AllwainCardImageKey = (typeof ALLWAIN_CARD_IMAGE_KEYS)[number];
export type AllwainCardImageSource =
  | "original"
  | "captured"
  | "illustrative"
  | "category";

export type AllwainCardImageMeta = {
  hasImage: boolean;
  bytesApprox?: number | null;
  mimeType?: string | null;
  url: string;
  key?: AllwainCardImageKey | null;
  source: AllwainCardImageSource;
  illustrative: boolean;
  alt: string;
  assignedAt: string;
};

type ImageSubject = {
  title?: unknown;
  description?: unknown;
  category?: unknown;
  subcategory?: unknown;
  productKind?: unknown;
};

const KEY_SET = new Set<string>(ALLWAIN_CARD_IMAGE_KEYS);

function stripJpegPrivateMetadata(buffer: Buffer) {
  const parts: Buffer[] = [buffer.subarray(0, 2)];
  let offset = 2;
  while (offset + 1 < buffer.length) {
    const markerStart = offset;
    if (buffer[offset] !== 0xff) throw new Error("INVALID_JPEG_STRUCTURE");
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xda || marker === 0xd9) {
      parts.push(buffer.subarray(markerStart));
      return Buffer.concat(parts);
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(buffer.subarray(markerStart, offset));
      continue;
    }
    if (offset + 2 > buffer.length) throw new Error("INVALID_JPEG_STRUCTURE");
    const segmentLength = buffer.readUInt16BE(offset);
    const segmentEnd = offset + segmentLength;
    if (segmentLength < 2 || segmentEnd > buffer.length) {
      throw new Error("INVALID_JPEG_STRUCTURE");
    }
    // APP1 may contain EXIF/GPS or XMP; comments can also expose private data.
    if (marker !== 0xe1 && marker !== 0xfe) {
      parts.push(buffer.subarray(markerStart, segmentEnd));
    }
    offset = segmentEnd;
  }
  throw new Error("INVALID_JPEG_STRUCTURE");
}

function stripPngPrivateMetadata(buffer: Buffer) {
  const parts: Buffer[] = [buffer.subarray(0, 8)];
  const privateChunks = new Set(["eXIf", "tEXt", "zTXt", "iTXt"]);
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > buffer.length) throw new Error("INVALID_PNG_STRUCTURE");
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    if (!privateChunks.has(type)) parts.push(buffer.subarray(offset, chunkEnd));
    offset = chunkEnd;
    if (type === "IEND") return Buffer.concat(parts);
  }
  throw new Error("INVALID_PNG_STRUCTURE");
}

export function allwainPrivateImageBuffer(image: ValidatedImageDataUrl) {
  const encoded = image.dataUrl.slice(image.dataUrl.indexOf(",") + 1);
  const sourceBuffer = Buffer.from(encoded, "base64");
  return image.mimeType === "image/png"
    ? stripPngPrivateMetadata(sourceBuffer)
    : stripJpegPrivateMetadata(sourceBuffer);
}

function normalized(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function subjectText(subject: ImageSubject) {
  return normalized(
    [
      subject.title,
      subject.description,
      subject.category,
      subject.subcategory,
      subject.productKind,
    ].join(" "),
  );
}

export function selectAllwainCardImageKey(
  subject: ImageSubject,
): AllwainCardImageKey {
  const text = subjectText(subject);
  const has = (pattern: RegExp) => pattern.test(text);

  if (has(/(?:\b(?:naranja|naranjas|navel|navelina|navelate|mandarina|clementina|citric|orange|oranges|arancia|arance)\b|橙子?|橘子|برتقال)/u)) return "oranges";
  if (has(/(?:\b(?:tomate|tomates|verdura|hortaliza|tomato|tomatoes|pomodoro|pomodori)\b|番茄|西红柿|طماطم)/u)) return "tomatoes";
  if (has(/(?:\b(?:miel|apicultura|apicola|honey|miele)\b|蜂蜜|عسل)/u)) return "honey";
  if (has(/(?:\b(?:aceite|oliva|aove|olive oil|huile d olive|olio d oliva)\b|橄榄油|زيت الزيتون)/u)) return "olive-oil";
  if (has(/(?:\b(?:arroz|paella|rice|riz|riso)\b|大米|米饭|أرز)/u)) return "rice";
  if (has(/(?:\b(?:lavadora|secadora|lavavajillas|electrodomestico|washing machine|dryer|dishwasher|lave linge|lavatrice)\b|洗衣机|غسالة)/u)) return "washing-machine";
  if (has(/(?:\b(?:televisor|television|smart tv|tv 4k|pantalla|tv|televiseur|televisore)\b|电视|تلفاز|تلفزيون)/u)) return "television";
  if (has(/(?:\b(?:portatil|ordenador|computador|laptop|computer|notebook|informatica|ordinateur portable)\b|笔记本电脑|电脑|حاسوب|لابتوب)/u)) return "laptop";
  if (has(/(?:\b(?:bicicleta|bici|ciclismo|bicycle|bike|velo|bicicletta)\b|自行车|دراجة)/u)) return "bicycle";
  if (has(/(?:\b(?:revision de vehiculo|taller|mecanica|mecanico|mantenimiento de coche|vehicle service|car service|garage|mecanique|officina)\b|汽车维修|صيانة سيارات)/u)) return "vehicle-service";
  if (
    has(
      /(?:\b(?:coche|vehiculo|automovil|furgoneta|moto|movilidad|car|vehicle|van|motorcycle|voiture|automobile|auto|macchina|mercedes|audi|bmw|seat|cupra|renault|peugeot|citroen|ford|toyota|volkswagen|volvo|tesla|hyundai|kia|nissan|fiat|skoda|dacia|mazda|honda|lexus|porsche)\b|汽车|车辆|摩托车|سيارة|مركبة)/u,
    )
  ) return "car";
  if (has(/(?:\b(?:fontaneria|fontanero|tuberia|grifo|desatasco|plumbing|plumber|plomberie|idraulico)\b|水管|水暖|سباكة)/u)) return "plumbing";
  if (has(/(?:\b(?:diseno|design|identidad|branding|logotipo|logo|creativ|landing|fotografia|photography|conception)\b|设计|摄影|تصميم|تصوير)/u)) return "design";
  if (has(/(?:\b(?:cold brew|cafe frio|bebida de cafe|caffe freddo)\b|冷萃咖啡|قهوة باردة)/u)) return "cold-brew";
  if (has(/(?:\b(?:cafe|coffee|cafeteria|caffe)\b|咖啡|قهوة)/u)) return "coffee";
  if (has(/(?:\b(?:caja|cajas|embalaje|packaging|etiqueta|paquete|box|label|package|boite|scatola)\b|包装|盒子|عبوة|صندوق)/u)) return "packaging";
  if (
    has(
      /(?:\b(?:ia|ai|inteligencia artificial|artificial intelligence|intelligence artificielle|intelligenza artificiale|machine learning|aprendizaje automatico|apprentissage automatique|apprendimento automatico|modelo generativo|generative ai|ia generative|ai generativa|agente de ia|agente inteligente|ai agent|intelligent agent|agent ia|agente ia|asistente virtual|virtual assistant|assistant virtuel|assistente virtuale|chatbot|chatgpt|gemini|automatizacion inteligente|intelligent automation|vision artificial|computer vision|reconocimiento de imagenes|image recognition|procesamiento de lenguaje|natural language processing|ocr)\b|人工智能|机器学习|智能自动化|智能代理|虚拟助手|计算机视觉|الذكاء الاصطناعي|تعلم الآلة|أتمتة ذكية|وكيل ذكي|مساعد افتراضي|رؤية حاسوبية)/u,
    )
  ) return "ai-service";
  if (
    has(
      /(?:\b(?:servicio|servicios|profesional|consultoria|consultor|asesoria|asesoramiento|reparacion|instalacion|mantenimiento|formacion|service|services|professional service|consulting|consultant|advice|repair|installation|maintenance|training|prestation|prestations|service professionnel|conseil|reparation|entretien|formation|servizio|servizi|servizio professionale|consulenza|riparazione|installazione|manutenzione|formazione)\b|专业服务|服务|咨询|维修|安装|培训|خدمة مهنية|خدمات|استشارة|إصلاح|تركيب|تدريب)/u,
    )
  ) return "professional-service";
  return "general";
}

function publicMediaUrl(relativePath: string) {
  return `${ENV.ALLWAIN_API_URL.replace(/\/+$/, "")}/api/allwain/media/${relativePath}`;
}

export function allwainCuratedCardImageUrl(key: AllwainCardImageKey) {
  const version = key === "general" ? 2 : 1;
  return publicMediaUrl(`card-images/${key}.jpg?v=${version}`);
}

export function allwainIllustrativeCardImageMeta(
  subject: ImageSubject,
  assignedAt?: Date | string | null,
): AllwainCardImageMeta {
  const key = selectAllwainCardImageKey(subject);
  return {
    hasImage: false,
    url: allwainCuratedCardImageUrl(key),
    key,
    source: key === "general" ? "category" : "illustrative",
    illustrative: true,
    alt: String(subject.title || "Publicación Allwain").trim(),
    assignedAt:
      assignedAt instanceof Date
        ? assignedAt.toISOString()
        : String(assignedAt || new Date().toISOString()),
  };
}

function validPublicImageUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ||
      (ENV.NODE_ENV !== "production" && parsed.protocol === "http:")
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function validSource(value: unknown): AllwainCardImageSource | null {
  return new Set(["original", "captured", "illustrative", "category"]).has(
    String(value),
  )
    ? (value as AllwainCardImageSource)
    : null;
}

function validKey(value: unknown): AllwainCardImageKey | null {
  return KEY_SET.has(String(value)) ? (value as AllwainCardImageKey) : null;
}

function curatedKeyFromUrl(value: string | null) {
  if (!value) return null;
  const match = value.match(/\/card-images\/([a-z-]+)\.jpg(?:\?|$)/);
  return validKey(match?.[1]);
}

export function ensureAllwainImageMeta(
  current: Record<string, unknown> | null | undefined,
  subject: ImageSubject,
  options: { preferredUrl?: unknown; preferredSource?: AllwainCardImageSource } = {},
): Record<string, unknown> {
  const meta = { ...(current || {}) };
  const existingUrl =
    validPublicImageUrl(options.preferredUrl) || validPublicImageUrl(meta.imageUrl);
  const detectedKey = selectAllwainCardImageKey(subject);
  const existingKey = validKey(meta.imageKey) || curatedKeyFromUrl(existingUrl);
  const existingSource =
    options.preferredSource ||
    validSource(meta.imageSource) ||
    (existingKey ? (existingKey === "general" ? "category" : "illustrative") : "original");
  const title = String(subject.title || "Publicación Allwain").trim();
  const refreshManagedImage =
    Boolean(existingUrl) &&
    Boolean(existingKey) &&
    (existingSource === "illustrative" || existingSource === "category") &&
    (existingKey !== detectedKey ||
      existingUrl !== allwainCuratedCardImageUrl(existingKey!));

  if (existingUrl && !refreshManagedImage) {
    return {
      ...meta,
      imageUrl: existingUrl,
      imageKey: existingKey,
      imageSource: existingSource,
      imageIllustrative:
        existingSource === "illustrative" || existingSource === "category",
      imageAlt: String(meta.imageAlt || title),
      imageAssignedAt: String(meta.imageAssignedAt || new Date().toISOString()),
    };
  }

  const key = refreshManagedImage ? detectedKey : existingKey || detectedKey;
  return {
    ...meta,
    imageUrl: allwainCuratedCardImageUrl(key),
    imageKey: key,
    imageSource: key === "general" ? "category" : "illustrative",
    imageIllustrative: true,
    imageAlt: title,
    imageAssignedAt: String(meta.imageAssignedAt || new Date().toISOString()),
  };
}

export function refreshAllwainIllustrativeImageMeta(
  current: Record<string, unknown> | null | undefined,
  subject: ImageSubject,
) {
  const source = validSource(current?.imageSource);
  if (source === "original" || source === "captured") {
    return ensureAllwainImageMeta(current, subject);
  }
  const reset = { ...(current || {}) };
  for (const key of [
    "imageUrl",
    "imageKey",
    "imageSource",
    "imageIllustrative",
    "imageAlt",
    "imageAssignedAt",
  ]) {
    delete reset[key];
  }
  return ensureAllwainImageMeta(reset, subject);
}

export function ensureAllwainOfferImage(offer: Offer): Offer {
  return {
    ...offer,
    meta: ensureAllwainImageMeta(offer.meta, {
      title: offer.title,
      description: offer.description,
      category: offer.category || offer.meta?.category,
      subcategory: offer.subcategory || offer.meta?.subcategory,
      productKind: offer.productKind || offer.meta?.productKind,
    }),
  };
}

export function allwainOfferCardImageMeta(offer: Offer): AllwainCardImageMeta {
  const withImage = ensureAllwainOfferImage(offer);
  const meta = (withImage.meta || {}) as Record<string, unknown>;
  const source = validSource(meta.imageSource) || "category";
  const key = validKey(meta.imageKey);
  return {
    hasImage: source === "original" || source === "captured",
    bytesApprox:
      typeof meta.imageBytesApprox === "number" ? meta.imageBytesApprox : null,
    mimeType:
      typeof meta.imageMimeType === "string" ? meta.imageMimeType : null,
    url: String(meta.imageUrl),
    key,
    source,
    illustrative: source === "illustrative" || source === "category",
    alt: String(meta.imageAlt || offer.title || "Publicación Allwain"),
    assignedAt: String(meta.imageAssignedAt || new Date().toISOString()),
  };
}

export function ensureAllwainRequestImageMeta(
  imageMeta: Record<string, unknown> | null | undefined,
  extracted: AllwainScanExtractedFields,
  title?: string | null,
) {
  const existingUrl = validPublicImageUrl(imageMeta?.url);
  const source = validSource(imageMeta?.source);
  const detectedKey = selectAllwainCardImageKey({
    title: extracted.productName || title,
    description: extracted.rawText,
    category: extracted.category,
    subcategory: extracted.subcategory,
    productKind: extracted.productKind,
  });
  const existingKey = validKey(imageMeta?.key) || curatedKeyFromUrl(existingUrl);
  const managedImage =
    source === "illustrative" || source === "category";
  const refreshManagedImage =
    Boolean(existingUrl) &&
    managedImage &&
    Boolean(existingKey) &&
    (existingKey !== detectedKey ||
      existingUrl !== allwainCuratedCardImageUrl(existingKey!));

  if (existingUrl && source && !refreshManagedImage) {
    return {
      ...(imageMeta || {}),
      url: existingUrl,
      key: existingKey,
      source,
      illustrative: source === "illustrative" || source === "category",
      alt: String(imageMeta?.alt || title || extracted.productName || "Petición Allwain"),
      assignedAt: String(imageMeta?.assignedAt || new Date().toISOString()),
    } as AllwainCardImageMeta;
  }

  const generated = allwainIllustrativeCardImageMeta({
    title: extracted.productName || title,
    description: extracted.rawText,
    category: extracted.category,
    subcategory: extracted.subcategory,
    productKind: extracted.productKind,
  });
  return {
    ...(imageMeta || {}),
    hasImage: refreshManagedImage ? false : Boolean(imageMeta?.hasImage),
    url: generated.url,
    key: generated.key,
    source: generated.source,
    illustrative: true,
    alt: generated.alt,
    assignedAt: String(imageMeta?.assignedAt || generated.assignedAt),
  } as AllwainCardImageMeta;
}

export async function storeAllwainCapturedCardImage(
  requestId: string,
  image: ValidatedImageDataUrl,
  alt: string,
): Promise<AllwainCardImageMeta> {
  const uploadRoot = path.resolve(ENV.ALLWAIN_PUBLICATION_IMAGE_DIR);
  await fs.promises.mkdir(uploadRoot, { recursive: true, mode: 0o750 });
  const extension = image.mimeType === "image/png" ? "png" : "jpg";
  const finalName = `${requestId}.${extension}`;
  const finalPath = path.resolve(uploadRoot, finalName);
  const expectedPrefix = `${uploadRoot}${path.sep}`;
  if (!finalPath.startsWith(expectedPrefix)) throw new Error("INVALID_IMAGE_PATH");

  const temporaryPath = `${finalPath}.${process.pid}.tmp`;
  try {
    const outputBuffer = allwainPrivateImageBuffer(image);
    await fs.promises.writeFile(temporaryPath, outputBuffer, {
      flag: "wx",
      mode: 0o640,
    });
    await fs.promises.rename(temporaryPath, finalPath);
    return {
      hasImage: true,
      bytesApprox: outputBuffer.length,
      mimeType: image.mimeType,
      url: publicMediaUrl(`uploads/${finalName}`),
      key: null,
      source: "captured",
      illustrative: false,
      alt: alt.trim() || "Fotografía aportada por el usuario",
      assignedAt: new Date().toISOString(),
    };
  } catch (error) {
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
