import { Offer } from "../shared/types";

const PRECISION = 1_000_000;
const EPSILON = 0.000001;

export interface AllwainInventory {
  managed: boolean;
  unit: string;
  minQuantity: number;
  quantityStep: number;
  maxQuantityPerOrder: number | null;
  stockQuantity: number | null;
  availableQuantity: number | null;
  reservedQuantity: number;
  soldQuantity: number;
}

function rounded(value: number) {
  return Math.round(value * PRECISION) / PRECISION;
}

function positiveNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? rounded(parsed) : null;
}

function nonNegativeNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? rounded(parsed) : null;
}

function textValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function isAllwainOfferArchived(offer: Pick<Offer, "meta">) {
  const meta = (offer.meta || {}) as Record<string, unknown>;
  return meta.archived === true || meta.status === "archived";
}

export function archiveAllwainOfferMeta(
  inputMeta: Record<string, unknown> | null | undefined,
  archivedAt = new Date(),
): Record<string, unknown> {
  return {
    ...(inputMeta || {}),
    archived: true,
    status: "archived",
    availableQuantity: 0,
    archivedAt: archivedAt.toISOString(),
  };
}

export function readAllwainInventory(offer: Pick<Offer, "meta">): AllwainInventory {
  const meta = (offer.meta || {}) as Record<string, unknown>;
  const availableQuantity = nonNegativeNumber(meta.availableQuantity);
  const declaredStock = nonNegativeNumber(meta.stockQuantity);
  const reservedQuantity = nonNegativeNumber(meta.reservedQuantity) || 0;
  const soldQuantity = nonNegativeNumber(meta.soldQuantity) || 0;
  const managed =
    meta.inventoryManaged === true || availableQuantity !== null || declaredStock !== null;
  const stockQuantity = managed
    ? declaredStock ?? rounded((availableQuantity || 0) + reservedQuantity + soldQuantity)
    : null;
  const requestedQuantity = positiveNumber(meta.requestedQuantity);

  return {
    managed,
    unit: textValue(meta.unit, "unidad"),
    minQuantity: positiveNumber(meta.minQuantity) || requestedQuantity || 1,
    quantityStep: positiveNumber(meta.quantityStep) || 1,
    maxQuantityPerOrder:
      positiveNumber(meta.maxQuantityPerOrder) ||
      (meta.requestId ? requestedQuantity : null),
    stockQuantity,
    availableQuantity: managed
      ? availableQuantity ?? rounded((stockQuantity || 0) - reservedQuantity - soldQuantity)
      : null,
    reservedQuantity,
    soldQuantity,
  };
}

export function normalizeAllwainInventoryMeta(
  inputMeta: Record<string, unknown> | null | undefined,
  options: { requireStock: boolean },
) {
  const meta = { ...(inputMeta || {}) };
  const availableQuantity = positiveNumber(meta.availableQuantity ?? meta.stockQuantity);
  if (options.requireStock && availableQuantity === null) {
    throw new Error("MISSING_STOCK_QUANTITY");
  }
  if (availableQuantity === null) return meta;

  const minQuantity = positiveNumber(meta.minQuantity) || 1;
  const quantityStep = positiveNumber(meta.quantityStep) || 1;
  const maxQuantityPerOrder = positiveNumber(meta.maxQuantityPerOrder);
  if (minQuantity > availableQuantity + EPSILON) throw new Error("INVALID_MIN_QUANTITY");
  if (maxQuantityPerOrder && maxQuantityPerOrder < minQuantity - EPSILON) {
    throw new Error("INVALID_MAX_QUANTITY");
  }

  return {
    ...meta,
    inventoryManaged: true,
    stockQuantity: availableQuantity,
    availableQuantity,
    reservedQuantity: 0,
    soldQuantity: 0,
    minQuantity,
    quantityStep,
    maxQuantityPerOrder: maxQuantityPerOrder || undefined,
  };
}

export function validateAllwainOrderQuantity(offer: Offer, requestedQuantity: number) {
  const inventory = readAllwainInventory(offer);
  const quantity = positiveNumber(requestedQuantity);
  if (quantity === null) throw new Error("INVALID_ORDER_QUANTITY");
  if (quantity < inventory.minQuantity - EPSILON) throw new Error("MINIMUM_ORDER_NOT_MET");
  if (
    inventory.maxQuantityPerOrder !== null &&
    quantity > inventory.maxQuantityPerOrder + EPSILON
  ) {
    throw new Error("MAXIMUM_ORDER_EXCEEDED");
  }

  const stepsFromMinimum = (quantity - inventory.minQuantity) / inventory.quantityStep;
  if (Math.abs(stepsFromMinimum - Math.round(stepsFromMinimum)) > EPSILON) {
    throw new Error("INVALID_QUANTITY_STEP");
  }
  if (
    inventory.managed &&
    (inventory.availableQuantity === null || quantity > inventory.availableQuantity + EPSILON)
  ) {
    throw new Error("INSUFFICIENT_STOCK");
  }
  return { inventory, quantity };
}

export function reserveAllwainStock(offer: Offer, requestedQuantity: number) {
  const { inventory, quantity } = validateAllwainOrderQuantity(offer, requestedQuantity);
  if (!inventory.managed) return { meta: { ...(offer.meta || {}) }, inventory, quantity };

  const meta = {
    ...(offer.meta || {}),
    inventoryManaged: true,
    stockQuantity: inventory.stockQuantity,
    availableQuantity: rounded((inventory.availableQuantity || 0) - quantity),
    reservedQuantity: rounded(inventory.reservedQuantity + quantity),
    soldQuantity: inventory.soldQuantity,
    minQuantity: inventory.minQuantity,
    quantityStep: inventory.quantityStep,
  };
  return { meta, inventory: readAllwainInventory({ meta }), quantity };
}

export function releaseAllwainStock(offer: Offer, quantityInput: number) {
  const inventory = readAllwainInventory(offer);
  const quantity = positiveNumber(quantityInput) || 0;
  if (!inventory.managed || quantity <= 0) return { ...(offer.meta || {}) };
  const released = Math.min(quantity, inventory.reservedQuantity);
  const maximumAvailable = Math.max(
    0,
    (inventory.stockQuantity || 0) - inventory.soldQuantity,
  );
  return {
    ...(offer.meta || {}),
    availableQuantity: rounded(
      Math.min(maximumAvailable, (inventory.availableQuantity || 0) + released),
    ),
    reservedQuantity: rounded(Math.max(0, inventory.reservedQuantity - released)),
    soldQuantity: inventory.soldQuantity,
  };
}

export function releaseAllwainOfferStock(
  offer: Offer,
  quantityInput: number,
) {
  const meta = releaseAllwainStock(offer, quantityInput);
  const inventory = readAllwainInventory({ meta });
  return {
    meta,
    allwainStatus:
      offer.allwainStatus === "sold_out" &&
      (inventory.availableQuantity || 0) > 0
        ? ("active" as const)
        : offer.allwainStatus,
  };
}

export function commitAllwainStock(offer: Offer, quantityInput: number) {
  const inventory = readAllwainInventory(offer);
  const quantity = positiveNumber(quantityInput) || 0;
  if (!inventory.managed || quantity <= 0) return { ...(offer.meta || {}) };
  const committed = Math.min(quantity, inventory.reservedQuantity);
  return {
    ...(offer.meta || {}),
    availableQuantity: inventory.availableQuantity,
    reservedQuantity: rounded(Math.max(0, inventory.reservedQuantity - committed)),
    soldQuantity: rounded(inventory.soldQuantity + committed),
  };
}

export function updateAllwainInventoryLimits(
  offer: Offer,
  input: { stockQuantity: number; minQuantity: number; quantityStep: number },
) {
  const current = readAllwainInventory(offer);
  const stockQuantity = positiveNumber(input.stockQuantity);
  const minQuantity = positiveNumber(input.minQuantity);
  const quantityStep = positiveNumber(input.quantityStep);
  if (stockQuantity === null) throw new Error("MISSING_STOCK_QUANTITY");
  if (minQuantity === null || minQuantity > stockQuantity + EPSILON) {
    throw new Error("INVALID_MIN_QUANTITY");
  }
  if (quantityStep === null) throw new Error("INVALID_QUANTITY_STEP");
  if (stockQuantity < current.reservedQuantity + current.soldQuantity - EPSILON) {
    throw new Error("STOCK_BELOW_COMMITTED");
  }

  return {
    ...(offer.meta || {}),
    inventoryManaged: true,
    stockQuantity,
    availableQuantity: rounded(
      stockQuantity - current.reservedQuantity - current.soldQuantity,
    ),
    reservedQuantity: current.reservedQuantity,
    soldQuantity: current.soldQuantity,
    minQuantity,
    quantityStep,
  };
}
