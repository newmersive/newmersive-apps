import type { AllwainScanExtractedFields } from "../config/api";

export type ProductMeasurement = {
  unit: string;
  label: string;
  quantityLabel: string;
  step: number;
  confidence: number;
  source: "explicit" | "vision" | "category" | "model" | "default" | "user";
};

export const MEASUREMENT_OPTIONS: ProductMeasurement[] = [
  {
    unit: "ud",
    label: "Unidades",
    quantityLabel: "Unidades",
    step: 1,
    confidence: 1,
    source: "user",
  },
  {
    unit: "kg",
    label: "Kilogramos (kg)",
    quantityLabel: "Kilos",
    step: 0.5,
    confidence: 1,
    source: "user",
  },
  {
    unit: "l",
    label: "Litros (l)",
    quantityLabel: "Litros",
    step: 0.5,
    confidence: 1,
    source: "user",
  },
];

function normalized(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function optionFor(unit?: string | null) {
  const clean = normalized(unit).trim();
  if (/^(kg|kilo|kilos|kilogramo|kilogramos)$/.test(clean)) return MEASUREMENT_OPTIONS[1];
  if (/^(l|litro|litros)$/.test(clean)) return MEASUREMENT_OPTIONS[2];
  return MEASUREMENT_OPTIONS[0];
}

export function measurementForProduct(
  input: Pick<
    AllwainScanExtractedFields,
    "productName" | "category" | "productKind" | "unit" | "measurement"
  >,
): ProductMeasurement {
  if (input.measurement?.unit) return input.measurement;
  if (input.unit) return { ...optionFor(input.unit), confidence: 0.82, source: "model" };

  const source = normalized(`${input.productName || ""} ${input.category || ""}`);
  const weight =
    input.productKind === "produce_weight" ||
    /naranj|mandarin|limon|fruta|verdura|hortaliza|patata|cebolla|tomate|manzana|pera|carne|pescado|queso|granel/.test(
      source,
    );
  if (weight) return { ...MEASUREMENT_OPTIONS[1], confidence: 0.86, source: "category" };
  if (input.productKind === "liquid_bulk") {
    return { ...MEASUREMENT_OPTIONS[2], confidence: 0.84, source: "category" };
  }
  return { ...MEASUREMENT_OPTIONS[0], confidence: 0.62, source: "default" };
}

export function measurementFromProductName(productName: string) {
  return measurementForProduct({ productName });
}

export function isWholeUnit(unit: string) {
  return ["ud", "caja", "pack"].includes(unit);
}
