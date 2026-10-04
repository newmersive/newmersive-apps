import { AllwainScanExtractedFields } from "../shared/types";

export type AllwainProductKind = NonNullable<
  AllwainScanExtractedFields["productKind"]
>;

export type AllwainVisionSignal = {
  name: string;
  confidence: number;
};

type IntelligenceContext = {
  rawText?: string | null;
  labels?: AllwainVisionSignal[];
  objects?: AllwainVisionSignal[];
  unitSource?: "user" | "model";
};

const UNIT_ALIASES: Array<[RegExp, string]> = [
  [/^(?:kg|kilo|kilos|kilogramo|kilogramos)$/i, "kg"],
  [/^(?:g|gr|grs|gramo|gramos)$/i, "g"],
  [/^(?:l|litro|litros)$/i, "l"],
  [/^(?:ml|mililitro|mililitros)$/i, "ml"],
  [/^(?:ud|uds|u|unidad|unidades|pieza|piezas)$/i, "ud"],
  [/^(?:caja|cajas)$/i, "caja"],
  [/^(?:pack|paquete|paquetes)$/i, "pack"],
  [/^(?:saco|sacos)$/i, "saco"],
  [/^(?:rollo|rollos)$/i, "rollo"],
  [/^(?:par|pares)$/i, "par"],
  [/^(?:servicio|servicios)$/i, "servicio"],
  [/^(?:hora|horas)$/i, "hora"],
];

const UNIT_COPY: Record<
  string,
  { label: string; quantityLabel: string; step: number }
> = {
  kg: { label: "Kilogramos (kg)", quantityLabel: "Kilos", step: 0.5 },
  g: { label: "Gramos (g)", quantityLabel: "Gramos", step: 1 },
  l: { label: "Litros (l)", quantityLabel: "Litros", step: 0.5 },
  ml: { label: "Mililitros (ml)", quantityLabel: "Mililitros", step: 1 },
  ud: { label: "Unidades", quantityLabel: "Unidades", step: 1 },
  caja: { label: "Cajas", quantityLabel: "Cajas", step: 1 },
  pack: { label: "Paquetes", quantityLabel: "Paquetes", step: 1 },
  saco: { label: "Sacos", quantityLabel: "Sacos", step: 1 },
  rollo: { label: "Rollos", quantityLabel: "Rollos", step: 1 },
  par: { label: "Pares", quantityLabel: "Pares", step: 1 },
  servicio: { label: "Servicios", quantityLabel: "Servicios", step: 1 },
  hora: { label: "Horas", quantityLabel: "Horas", step: 1 },
};

function normalized(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeAllwainUnit(value: unknown) {
  const clean = String(value || "").trim();
  if (!clean) return null;
  for (const [pattern, unit] of UNIT_ALIASES) {
    if (pattern.test(clean)) return unit;
  }
  return null;
}

function explicitUnitFromText(value: unknown) {
  const text = normalized(value);
  const match = text.match(
    /(?:^|\s)\d+(?:[.,]\d+)?\s*(kg|kilo(?:s)?|kilogramo(?:s)?|g|gr|gramo(?:s)?|l|litro(?:s)?|ml|mililitro(?:s)?|ud(?:s)?|unidad(?:es)?|pieza(?:s)?|caja(?:s)?|pack|paquete(?:s)?|saco(?:s)?|rollo(?:s)?|par(?:es)?|servicio(?:s)?|hora(?:s)?)(?:\s|$)/i,
  );
  return normalizeAllwainUnit(match?.[1]);
}

export function inferAllwainProductKind(input: {
  productName?: string | null;
  category?: string | null;
  rawText?: string | null;
  labels?: AllwainVisionSignal[];
  objects?: AllwainVisionSignal[];
}): AllwainProductKind {
  const visual = [...(input.objects || []), ...(input.labels || [])]
    .filter((item) => item.confidence >= 0.45)
    .map((item) => item.name)
    .join(" ");
  const source = normalized(
    [input.productName, input.category, input.rawText, visual]
      .filter(Boolean)
      .join(" "),
  );

  if (
    /\b(naranj\w*|mandarin\w*|limon\w*|citric\w*|frut\w*|verdur\w*|hortaliz\w*|patat\w*|ceboll\w*|tomat\w*|manzan\w*|pera\w*|platan\w*|banana\w*|carne\w*|pescad\w*|queso\w*|granel|agricultur\w*|orange\w*|citrus|fruit\w*|vegetable\w*|produce)\b/.test(
      source,
    )
  ) {
    return "produce_weight";
  }
  if (/\b(aceite|vino|leche|zumo|liquido|oil|wine|milk|juice|bulk liquid)\b/.test(source)) {
    return "liquid_bulk";
  }
  if (/\b(coche\w*|automovil\w*|vehiculo\w*|furgoneta\w*|camion\w*|moto\w*|cars?|vehicles?|vans?|trucks?|motorcycles?)\b/.test(source)) {
    return "vehicle";
  }
  if (
    /\b(lavadora\w*|secadora\w*|frigorifico\w*|nevera\w*|lavavajillas|horno\w*|microondas|electrodomestico\w*|washing machines?|dryers?|refrigerators?|dishwashers?|ovens?|microwaves?|appliances?)\b/.test(
      source,
    )
  ) {
    return "appliance";
  }
  if (
    /\b(television\w*|televisor\w*|tv|ps5|playstation|consola\w*|movil\w*|telefono\w*|ordenador\w*|portatil\w*|tablets?|cameras?|electronics|computers?|laptops?|smartphones?)\b/.test(
      source,
    )
  ) {
    return "electronics";
  }
  if (/\b(servicio|reparacion|instalacion|asesoria|clase|service|repair|installation)\b/.test(source)) {
    return "service";
  }
  return "general";
}

function visualIdentity(
  labels: AllwainVisionSignal[] = [],
  objects: AllwainVisionSignal[] = [],
) {
  const candidates = [...objects, ...labels]
    .filter((item) => item.confidence >= 0.52)
    .sort((a, b) => b.confidence - a.confidence);
  const joined = normalized(candidates.map((item) => item.name).join(" "));
  const mappings: Array<[RegExp, string, string]> = [
    [/\b(orange|citrus|naranja)\b/, "Naranjas", "alimentacion"],
    [/\b(washing machine|washer|lavadora)\b/, "Lavadora", "electrodomesticos"],
    [/\b(refrigerator|fridge|frigorifico|nevera)\b/, "Frigorífico", "electrodomesticos"],
    [/\b(car|vehicle|automobile|coche|vehiculo)\b/, "Coche", "vehiculos"],
    [/\b(television|tv|televisor)\b/, "Televisor", "electronica"],
    [/\b(game console|playstation|console|consola)\b/, "Consola", "electronica"],
    [/\b(laptop|notebook|portatil)\b/, "Ordenador portátil", "electronica"],
    [/\b(bicycle|bike|bicicleta)\b/, "Bicicleta", "movilidad"],
    [/\b(sofa|couch)\b/, "Sofá", "hogar"],
  ];
  for (const [pattern, productName, category] of mappings) {
    if (pattern.test(joined)) {
      const confidence = Math.max(
        ...candidates
          .filter((item) => pattern.test(normalized(item.name)))
          .map((item) => item.confidence),
        0.55,
      );
      return { productName, category, confidence };
    }
  }
  return null;
}

function shouldUseCanonicalVisualName(value: string | null | undefined) {
  return new Set([
    "orange",
    "oranges",
    "citrus",
    "washing machine",
    "washer",
    "refrigerator",
    "fridge",
    "car",
    "vehicle",
    "automobile",
    "television",
    "tv",
    "game console",
    "console",
    "laptop",
    "notebook",
    "bicycle",
    "bike",
    "sofa",
    "couch",
  ]).has(normalized(value));
}

function hasMeaningfulProductName(value: string | null | undefined) {
  return /[a-záéíóúüñ]{2}/i.test(String(value || ""));
}

function hasExplicitOrderQuantity(value: string | null | undefined) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return (
    /\b(?:cantidad|qty|unidades|uds)\s*[:\-]\s*\d/i.test(text) ||
    /^(?:necesito|quiero|busco|solicito|me hacen falta)\s+(?:(?:unas?|unos?)\s+)?\d/i.test(
      text,
    )
  );
}

export function inferAllwainVisualIdentity(
  labels?: AllwainVisionSignal[],
  objects?: AllwainVisionSignal[],
) {
  return visualIdentity(labels, objects);
}

function sanitizeAttributes(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const key = normalized((item as any).key).replace(/\s+/g, "_").slice(0, 50);
      const label = String((item as any).label || "").trim().slice(0, 80);
      const attributeValue = String((item as any).value || "").trim().slice(0, 160);
      const confidence = Number((item as any).confidence);
      if (!key || !label || !attributeValue) return null;
      return {
        key,
        label,
        value: attributeValue,
        ...(Number.isFinite(confidence)
          ? { confidence: Math.max(0, Math.min(1, confidence)) }
          : {}),
      };
    })
    .filter(Boolean)
    .slice(0, 8) as NonNullable<AllwainScanExtractedFields["attributes"]>;
}

export function applyAllwainProductIntelligence(
  extracted: AllwainScanExtractedFields,
  context: IntelligenceContext = {},
): AllwainScanExtractedFields {
  const vision = visualIdentity(context.labels, context.objects);
  const productName =
    vision &&
    (!hasMeaningfulProductName(extracted.productName) ||
      shouldUseCanonicalVisualName(extracted.productName))
      ? vision.productName
      : extracted.productName || vision?.productName || null;
  const category = extracted.category || vision?.category || null;
  const productKind = inferAllwainProductKind({
    productName,
    category,
    rawText: context.rawText || extracted.rawText,
    labels: context.labels,
    objects: context.objects,
  });
  const explicitUnit = explicitUnitFromText(context.rawText || extracted.rawText);
  const existingUnit = normalizeAllwainUnit(extracted.unit);
  const inferredUnit =
    productKind === "produce_weight"
      ? "kg"
      : productKind === "liquid_bulk"
        ? "l"
        : "ud";
  const countableProduct = ["vehicle", "appliance", "electronics"].includes(
    productKind,
  );
  // The parser already prioritizes a labelled order quantity (for example,
  // "Cantidad: 24 unidades") over a package size such as "250 g".
  // For countable objects, dimensions and capacities read from the product
  // (for example 10 kg, 65 inches or 9 l) are attributes, not order units.
  const unit =
    context.unitSource === "user" && existingUnit
      ? existingUnit
      : countableProduct
        ? "ud"
        : existingUnit || explicitUnit || inferredUnit;
  const source: NonNullable<AllwainScanExtractedFields["measurement"]>["source"] =
    context.unitSource === "user"
      ? "user"
      : countableProduct && existingUnit !== "ud"
        ? vision
          ? "vision"
          : "category"
      : existingUnit
        ? context.unitSource === "model"
          ? "model"
          : "explicit"
        : explicitUnit
          ? "explicit"
          : vision
            ? "vision"
            : productKind === "general"
              ? "default"
              : "category";
  const confidence =
    source === "user" || source === "explicit"
      ? 1
      : source === "vision"
        ? Math.max(0.72, vision?.confidence || 0)
        : source === "category"
          ? 0.86
          : source === "model"
            ? 0.78
            : 0.58;
  const copy = UNIT_COPY[unit] || UNIT_COPY.ud;
  const quantity =
    vision &&
    countableProduct &&
    context.unitSource !== "user" &&
    !hasExplicitOrderQuantity(context.rawText || extracted.rawText)
      ? 1
      : extracted.quantity ?? (vision && countableProduct ? 1 : extracted.quantity);

  return {
    ...extracted,
    productName,
    category,
    quantity,
    unit,
    productKind,
    measurement: {
      unit,
      label: copy.label,
      quantityLabel: copy.quantityLabel,
      step: copy.step,
      confidence,
      source,
    },
    attributes: sanitizeAttributes(extracted.attributes),
    confidence: Math.max(
      extracted.confidence,
      vision && productName === vision.productName
        ? Math.min(0.95, vision.confidence)
        : extracted.confidence,
    ),
  };
}
