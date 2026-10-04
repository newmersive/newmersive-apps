import type { AllwainOffer } from "../config/api";

export type CatalogEditDraft = {
  title: string; description: string; price: string; unit: string;
  category: string; subcategory: string; locationLabel: string;
  deliveryEstimate: string; shippingWeightKgPerUnit: string;
  saleMode: "immediate" | "preorder"; preorderChargeDeadlineAt: string;
};
export type CatalogEditPatch = Partial<Omit<CatalogEditDraft, "price" | "shippingWeightKgPerUnit" | "preorderChargeDeadlineAt">> & {
  price?: number; shippingWeightKgPerUnit?: number; preorderChargeDeadlineAt?: string | null;
  expectedUpdatedAt: string;
};
export type OfferManagementError = "version" | "invalid" | "deadline" | "locked" | "confirmation";

export function isProposalPublication(offer: AllwainOffer) {
  return offer.allwainType === "proposal" || Boolean(offer.requestId || offer.shoppingListId || offer.meta?.requestId || offer.meta?.shoppingListId || offer.meta?.proposalKind);
}
export function isTerminalPublication(offer: AllwainOffer) {
  return ["selected", "not_selected", "withdrawn", "closed"].includes(offer.allwainStatus || "");
}
export function catalogTermsLocked(offer: AllwainOffer) {
  return offer.meta?.catalogTermsLocked === true || Number(offer.meta?.reservedQuantity || 0) > 0 || Number(offer.meta?.soldQuantity || 0) > 0;
}
export function offerManagementQuery(seller: boolean, view: "active" | "history", type: "catalog" | "proposal" = "catalog", cursor?: string) {
  return `/allwain/offers?scope=${seller ? "mine" : "market"}&limit=30${seller ? `&type=${type}&view=${view}` : ""}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
}
export function catalogEditDraft(offer: AllwainOffer): CatalogEditDraft {
  const text = (key: string) => typeof offer.meta?.[key] === "string" ? String(offer.meta[key]) : "";
  return {
    title: offer.title, description: offer.description || "", price: String(offer.price ?? ""),
    unit: offer.unit || text("unit") || "ud", category: offer.category || text("category"),
    subcategory: offer.subcategory || text("subcategory"), locationLabel: offer.locationLabel || text("locationLabel"),
    deliveryEstimate: text("deliveryEstimate"), shippingWeightKgPerUnit: String(offer.meta?.shippingWeightKgPerUnit ?? ""),
    saleMode: offer.meta?.saleMode === "preorder" ? "preorder" : "immediate",
    preorderChargeDeadlineAt: localCollectionDate(text("preorderChargeDeadlineAt")),
  };
}
export function localCollectionDate(value: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return value;
  const date=new Date(value), pad=(n:number)=>String(n).padStart(2,"0");
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function collectionDateFromDraft(value: string) {
  const match=value.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
  if(!match) return NaN;
  const [,year,month,day,hour,minute]=match.map(Number);
  const date=new Date(year,month-1,day,hour,minute);
  if(date.getFullYear()!==year || date.getMonth()!==month-1 || date.getDate()!==day || date.getHours()!==hour || date.getMinutes()!==minute) return NaN;
  return date.getTime();
}
export function buildCatalogEditPatch(offer: AllwainOffer, draft: CatalogEditDraft, now = Date.now()): CatalogEditPatch | OfferManagementError {
  const version = offer.updatedAt || offer.createdAt;
  if (!version || !Number.isFinite(Date.parse(version))) return "version";
  const original = catalogEditDraft(offer);
  const patch: CatalogEditPatch = { expectedUpdatedAt: version };
  const limits = { title: 240, description: 10000, unit: 80, category: 80, subcategory: 80, locationLabel: 240, deliveryEstimate: 600 };
  for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
    const value = draft[key].trim();
    if (value === original[key]) continue;
    if (value.length > limits[key] || (!value && key !== "subcategory")) return "invalid";
    if (catalogTermsLocked(offer) && ["unit", "category", "subcategory"].includes(key)) return "locked";
    patch[key] = value;
  }
  const price = Number(draft.price.replace(",", "."));
  if (!Number.isFinite(price) || price <= 0) return "invalid";
  if (price !== offer.price) patch.price = price;
  if (draft.shippingWeightKgPerUnit !== original.shippingWeightKgPerUnit) {
    const weight = Number(draft.shippingWeightKgPerUnit.replace(",", "."));
    if (!Number.isFinite(weight) || weight <= 0 || weight > 1000) return "invalid";
    patch.shippingWeightKgPerUnit = weight;
  }
  if (draft.saleMode !== original.saleMode || draft.preorderChargeDeadlineAt !== original.preorderChargeDeadlineAt) {
    if (catalogTermsLocked(offer)) return "locked";
    if (draft.saleMode === "preorder") {
      const deadline = collectionDateFromDraft(draft.preorderChargeDeadlineAt);
      if (!Number.isFinite(deadline) || deadline <= now) return "deadline";
      patch.preorderChargeDeadlineAt = new Date(deadline).toISOString();
    } else patch.preorderChargeDeadlineAt = null;
    patch.saleMode = draft.saleMode;
  }
  return patch;
}
export function catalogPatchConfirmed(offer: AllwainOffer, updated: AllwainOffer, patch: CatalogEditPatch) {
  if (updated.id !== offer.id || (updated.ownerUserId || updated.provider?.id) !== (offer.ownerUserId || offer.provider?.id) || isProposalPublication(updated) || isTerminalPublication(updated)) return false;
  return Object.entries(patch).every(([key, value]) => {
    if (key === "expectedUpdatedAt") return Boolean(updated.updatedAt);
    if (["deliveryEstimate", "shippingWeightKgPerUnit", "saleMode", "preorderChargeDeadlineAt"].includes(key)) return (updated.meta?.[key] ?? null) === value;
    return ((updated as unknown as Record<string, unknown>)[key] ?? "") === (value ?? "");
  });
}

// A response started before or during a publication write cannot commit later.
// This covers refresh, pagination and notification hydration with one barrier.
export function createOfferReadBarrier() {
  let epoch = 0;
  let writes = 0;
  return {
    read() { const revision = epoch; const writable = writes === 0; return { isCurrent: () => writable && writes === 0 && revision === epoch }; },
    beginWrite() { epoch++; writes++; let finished = false; return () => { if (!finished) { finished = true; writes--; epoch++; } }; },
    reset() { epoch++; },
  };
}
