import type { Offer } from "../shared/types";
import { readAllwainInventory } from "./allwain-inventory";
import { normalizeAllwainPreorderChargeDeadline } from "./allwain-preorders";

export interface AllwainOfferEditInput {
  title?: string;
  description?: string;
  price?: number;
  status?: "active" | "paused" | "closed";
  expectedUpdatedAt?: unknown;
  unit?: unknown;
  category?: unknown;
  subcategory?: unknown;
  productKind?: unknown;
  locationLabel?: unknown;
  deliveryEstimate?: unknown;
  shippingWeightKgPerUnit?: unknown;
  saleMode?: unknown;
  preorderChargeDeadlineAt?: unknown;
}

export const ALLWAIN_CATALOG_EDIT_FIELDS = [
  "title", "description", "price", "status", "unit", "category", "subcategory",
  "productKind", "locationLabel", "deliveryEstimate", "shippingWeightKgPerUnit",
  "saleMode", "preorderChargeDeadlineAt",
] as const;

export function assertAllwainOfferVersion(offer: Offer, expected: unknown) {
  if (expected === undefined) return;
  if (typeof expected !== "string" || !expected.trim() || !Number.isFinite(Date.parse(expected))) {
    throw new Error("INVALID_OFFER_VERSION");
  }
  const current = offer.updatedAt || offer.createdAt;
  if (!current || Date.parse(current) !== Date.parse(expected)) {
    throw new Error("OFFER_VERSION_CONFLICT");
  }
}

export function allwainProposalAggregate(offer: Offer) {
  const value = (column: unknown, legacy: unknown) =>
    typeof column === "string" && column ? column : typeof legacy === "string" && legacy ? legacy : null;
  return {
    requestId: value(offer.requestId, offer.meta?.requestId),
    shoppingListId: value(offer.shoppingListId, offer.meta?.shoppingListId),
  };
}

// Only named commercial fields enter the patch. Inventory, OCR evidence,
// compliance, ownership and existing order snapshots can never be supplied here.
export function allwainCatalogEditPatch(offer: Offer, input: AllwainOfferEditInput, hasCommitments: boolean) {
  assertAllwainOfferVersion(offer, input.expectedUpdatedAt);
  if (input.status !== undefined && !["active", "paused", "closed"].includes(input.status)) throw new Error("INVALID_OFFER_FIELD");
  if (!ALLWAIN_CATALOG_EDIT_FIELDS.some((field) => input[field] !== undefined)) {
    throw new Error("MISSING_OFFER_FIELDS");
  }
  const columns: Record<string, unknown> = {};
  const meta: Record<string, unknown> = { ...(offer.meta || {}) };
  let metaChanged = false;
  const text = (value: unknown, maximum: number, optional = false) => {
    if (typeof value !== "string" || value.length > maximum || (!optional && !value.trim())) {
      throw new Error("INVALID_OFFER_FIELD");
    }
    return value.trim();
  };
  for (const field of ["title", "description"] as const) {
    if (input[field] !== undefined) columns[field] = text(input[field], field === "title" ? 240 : 10_000);
  }
  if (input.price !== undefined) {
    if (!Number.isFinite(input.price) || input.price <= 0) throw new Error("INVALID_OFFER_PRICE");
    columns.price = input.price;
  }
  const inventory = readAllwainInventory(offer);
  const committed = hasCommitments || inventory.reservedQuantity > 0 || inventory.soldQuantity > 0;
  for (const field of ["unit", "category", "subcategory", "productKind", "locationLabel"] as const) {
    if (input[field] === undefined) continue;
    const next = text(input[field], field === "locationLabel" ? 240 : 80, field === "subcategory");
    const previous = String(offer[field] || meta[field] || "");
    if (next !== previous && field !== "locationLabel") {
      if (committed) throw new Error("OFFER_TERMS_LOCKED");
      // Product kind drives food/fiscal compliance; changing it needs a new
      // publication with its complete product compliance sheet.
      if (field === "productKind") throw new Error("PRODUCT_IDENTITY_CHANGE_REQUIRES_NEW_OFFER");
    }
    columns[field] = next || null;
    meta[field] = next || null;
    metaChanged = true;
  }
  if (input.deliveryEstimate !== undefined) {
    meta.deliveryEstimate = text(input.deliveryEstimate, 600);
    metaChanged = true;
  }
  if (input.shippingWeightKgPerUnit !== undefined) {
    const value = input.shippingWeightKgPerUnit;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1_000) {
      throw new Error("INVALID_OFFER_FIELD");
    }
    meta.shippingWeightKgPerUnit = value;
    metaChanged = true;
  }
  if (input.saleMode !== undefined || input.preorderChargeDeadlineAt !== undefined) {
    const mode = input.saleMode === undefined ? (meta.saleMode === "preorder" ? "preorder" : "immediate") : input.saleMode;
    if (mode !== "preorder" && mode !== "immediate") throw new Error("INVALID_OFFER_FIELD");
    const deadline = mode === "preorder"
      ? normalizeAllwainPreorderChargeDeadline(input.preorderChargeDeadlineAt ?? meta.preorderChargeDeadlineAt).toISOString()
      : null;
    if (mode === "immediate" && input.preorderChargeDeadlineAt != null) throw new Error("INVALID_OFFER_FIELD");
    if (committed && (mode !== (meta.saleMode || "immediate") || deadline !== (meta.preorderChargeDeadlineAt || null))) {
      throw new Error("OFFER_TERMS_LOCKED");
    }
    meta.saleMode = mode;
    meta.preorderChargeDeadlineAt = deadline;
    metaChanged = true;
  }
  return { columns, meta, metaChanged };
}
