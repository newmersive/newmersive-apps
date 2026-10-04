import type { AllwainShoppingList, AllwainShoppingListProposal } from "../config/api";
import { clearJourneyDraftChecked, readJourneyDraftChecked, writeJourneyDraft } from "./journeyDrafts";

export type SellerProposalForm = {
  selectedItems: Record<string, boolean>; prices: Record<string, string>;
  substitutions: Record<string, boolean>; substitutionNames: Record<string, string>;
  description: string; deliveryEstimate: string; shippingWeightKg: string; validForMinutes: number;
};
type BasisLine = { id: string; productName: string; quantity: number; unit: string; targetUnitPriceAmount: number | null; availability: string; previousPrice: number | null };
type Basis = { currency: string; allowSubstitutions: boolean; deliveryChannel: string; lines: BasisLine[] };
export type SellerProposalDraft = {
  schema: 1; accountId: string; listId: string; buyerUserId: string; listVersion: number;
  fingerprint: string; proposalStamp: string; basis: Basis; form: SellerProposalForm; requiresReview: boolean;
};
const durations = [60, 360, 720, 1_440, 4_320, 10_080, 20_160, 43_200];
const clean = (value: unknown, max: number) => typeof value === "string" ? value.slice(0, max) : "";
const normalizedText = (value: unknown, max: number) => clean(value, max).replace(/\s+/g, " ").trim();
const euro = (value: unknown) => typeof value === "number" ? String(value / 100).replace(".", ",") : "";
const number = (value: string) => { const n = Number(value.trim().replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : null; };
function basis(list: AllwainShoppingList): Basis {
  const previous = new Map((list.myProposal?.items || []).map(item => [item.shoppingListItemId, item.unitPriceAmount]));
  return { currency: list.currency, allowSubstitutions: list.allowSubstitutions, deliveryChannel: list.preferredDeliveryChannel || "",
    lines: list.items.map(item => ({ id: item.id, productName: item.productName, quantity: item.quantity, unit: item.unit,
      targetUnitPriceAmount: item.targetUnitPriceAmount ?? null, availability: item.availabilityStatus || (item.reviewStatus === "discarded" ? "discarded" : "open"), previousPrice: previous.get(item.id) ?? null })) };
}
export function sellerProposalFingerprint(list: AllwainShoppingList) {
  return JSON.stringify({ id: list.id, buyer: list.buyerUserId, version: list.version, status: list.status, deadline: list.proposalDeadlineAt || "", selected: list.selectedOfferId || "", basis: basis(list) });
}
export function sellerProposalStamp(proposal?: AllwainShoppingListProposal | null) {
  return proposal ? JSON.stringify([proposal.id, proposal.ownerUserId || proposal.provider?.id, proposal.updatedAt, proposal.proposalRevision || 0, proposal.status, proposal.isSelected === true]) : "";
}
export function initialSellerProposalForm(list: AllwainShoppingList): SellerProposalForm {
  const existing = new Map((list.myProposal?.items || []).map(item => [item.shoppingListItemId, item]));
  const remaining = list.myProposal?.validUntil ? Math.max(60, Math.ceil((Date.parse(list.myProposal.validUntil) - Date.now()) / 60_000)) : 10_080;
  return {
    selectedItems: Object.fromEntries(list.items.map(item => [item.id, item.availabilityStatus !== "awarded" && item.availabilityStatus !== "discarded" && item.reviewStatus !== "discarded" && (existing.size ? existing.has(item.id) : true)])),
    prices: Object.fromEntries(list.items.map(item => [item.id, euro(existing.get(item.id)?.unitPriceAmount)])),
    substitutions: Object.fromEntries(list.items.map(item => [item.id, existing.get(item.id)?.isSubstitution === true])),
    substitutionNames: Object.fromEntries(list.items.map(item => [item.id, existing.get(item.id)?.productName || item.productName])),
    description: list.myProposal?.description || "", deliveryEstimate: list.myProposal?.deliveryEstimate || "",
    shippingWeightKg: typeof list.myProposal?.meta?.shippingWeightKg === "number" ? String(list.myProposal.meta.shippingWeightKg).replace(".", ",") : "",
    validForMinutes: durations.reduce((nearest, candidate) => Math.abs(candidate - remaining) < Math.abs(nearest - remaining) ? candidate : nearest, 10_080),
  };
}
export function makeSellerProposalDraft(accountId: string, list: AllwainShoppingList, form: SellerProposalForm, requiresReview = false): SellerProposalDraft {
  return { schema: 1, accountId, listId: list.id, buyerUserId: list.buyerUserId, listVersion: list.version, fingerprint: sellerProposalFingerprint(list), proposalStamp: sellerProposalStamp(list.myProposal), basis: basis(list), form: sanitizeSellerProposalForm(form, list), requiresReview };
}
export function sanitizeSellerProposalForm(form: SellerProposalForm, list: AllwainShoppingList): SellerProposalForm {
  return {
    selectedItems: Object.fromEntries(list.items.map(item => [item.id, form.selectedItems?.[item.id] === true])),
    prices: Object.fromEntries(list.items.map(item => [item.id, clean(form.prices?.[item.id], 64)])),
    substitutions: Object.fromEntries(list.items.map(item => [item.id, list.allowSubstitutions && form.substitutions?.[item.id] === true])),
    substitutionNames: Object.fromEntries(list.items.map(item => [item.id, clean(form.substitutionNames?.[item.id], 160)])),
    description: clean(form.description, 1_500), deliveryEstimate: clean(form.deliveryEstimate, 240), shippingWeightKg: clean(form.shippingWeightKg, 32),
    validForMinutes: durations.includes(form.validForMinutes) ? form.validForMinutes : 10_080,
  };
}
export function validSellerProposalDraft(value: unknown, accountId: string, listId: string): value is SellerProposalDraft {
  const draft = value as SellerProposalDraft;
  return Boolean(draft && draft.schema === 1 && draft.accountId === accountId && draft.listId === listId &&
    typeof draft.buyerUserId === "string" && Number.isInteger(draft.listVersion) && draft.listVersion >= 0 &&
    typeof draft.fingerprint === "string" && typeof draft.proposalStamp === "string" && draft.basis && Array.isArray(draft.basis.lines) &&
    draft.basis.lines.every(line => line && typeof line.id === "string" && typeof line.productName === "string" && typeof line.unit === "string" && Number.isFinite(line.quantity)) &&
    draft.form && [draft.form.selectedItems, draft.form.prices, draft.form.substitutions, draft.form.substitutionNames].every(map => map && typeof map === "object" && !Array.isArray(map)) &&
    typeof draft.form.description === "string" && typeof draft.form.deliveryEstimate === "string" && typeof draft.form.shippingWeightKg === "string");
}
/** Identity/quantity/unit changes reset that line. Availability, currency and price bounds never carry an invalid price into a new proposal. */
export function reconcileSellerProposalDraft(draft: SellerProposalDraft, accountId: string, list: AllwainShoppingList) {
  if (!validSellerProposalDraft(draft, accountId, list.id) || draft.buyerUserId !== list.buyerUserId) return null;
  const changed = draft.fingerprint !== sellerProposalFingerprint(list) || draft.proposalStamp !== sellerProposalStamp(list.myProposal);
  const form = sanitizeSellerProposalForm(draft.form, list);
  const old = new Map(draft.basis.lines.map(line => [line.id, line]));
  let resetCount = 0;
  for (const line of basis(list).lines) {
    const prior = old.get(line.id);
    const same = prior && prior.productName === line.productName && prior.quantity === line.quantity && prior.unit === line.unit;
    if (!same || line.availability !== "open" || draft.basis.currency !== list.currency) {
      if (form.selectedItems[line.id] || form.prices[line.id]) resetCount += 1;
      form.selectedItems[line.id] = false; form.prices[line.id] = ""; form.substitutions[line.id] = false; form.substitutionNames[line.id] = line.productName;
      continue;
    }
    const amount = number(form.prices[line.id]);
    if (changed && amount !== null && ((line.targetUnitPriceAmount != null && Math.round(amount * 100) > line.targetUnitPriceAmount) || (line.previousPrice != null && Math.round(amount * 100) > line.previousPrice))) {
      form.prices[line.id] = ""; resetCount += 1;
    }
    if (!list.allowSubstitutions) { form.substitutions[line.id] = false; form.substitutionNames[line.id] = line.productName; }
  }
  return { draft: makeSellerProposalDraft(accountId, list, form, changed || draft.requiresReview), changed, resetCount };
}
export type SellerSubmission = { listVersion: number; description: string; deliveryEstimate: string; shippingWeightKg: number | null; validForMinutes: number; items: { shoppingListItemId: string; productName: string; quantity: number; unit: string; unitPrice: number | null; isSubstitution: boolean }[] };
export function sellerProposalSubmissionConfirmed(original: AllwainShoppingList, updated: AllwainShoppingList, accountId: string, submission: SellerSubmission) {
  const proposal = updated?.myProposal;
  const expiry = Date.parse(proposal?.validUntil || "");
  const deadline = Date.parse(original.proposalDeadlineAt || "");
  if (!proposal || typeof proposal.id !== "string" || !proposal.id || !Number.isFinite(Date.parse(proposal.updatedAt || "")) ||
    updated.id !== original.id || updated.buyerUserId !== original.buyerUserId || proposal.shoppingListId !== original.id ||
    (proposal.ownerUserId || proposal.provider?.id) !== accountId || (original.myProposal && proposal.id !== original.myProposal.id) ||
    !["active", "selected"].includes(proposal.status) || typeof proposal.currency !== "string" || proposal.currency.toLowerCase() !== original.currency.toLowerCase() ||
    proposal.meta?.shoppingListVersion !== submission.listVersion || proposal.description !== normalizedText(submission.description, 1_500) ||
    proposal.deliveryEstimate !== normalizedText(submission.deliveryEstimate, 240) || Number(proposal.meta?.shippingWeightKg || 0) !== Number(submission.shippingWeightKg || 0) ||
    !Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now() + submission.validForMinutes * 60_000 + 90_000 || (Number.isFinite(deadline) && expiry > deadline) || !Array.isArray(proposal.items) || proposal.items.length !== submission.items.length || proposal.items.some(item => !item || typeof item.shoppingListItemId !== "string" || typeof item.currency !== "string")) return false;
  if (original.myProposal?.proposalRevision != null && Number(proposal.proposalRevision) <= original.myProposal.proposalRevision) return false;
  const byId = new Map(proposal.items.map(item => [item.shoppingListItemId, item]));
  const total = submission.items.reduce((sum, item) => sum + Math.round(item.quantity * Math.round(Number(item.unitPrice) * 100)), 0);
  return Math.abs(proposal.price * 100 - total) < 0.001 && byId.size === submission.items.length && submission.items.every(item => {
    const saved = byId.get(item.shoppingListItemId);
    return Boolean(saved && saved.currency.toLowerCase() === original.currency.toLowerCase() &&
      saved.productName === normalizedText(item.productName, 160) && Math.abs(saved.quantity - item.quantity) < 0.0001 && saved.unit === item.unit &&
      saved.isSubstitution === item.isSubstitution && saved.unitPriceAmount === Math.round(Number(item.unitPrice) * 100) && saved.subtotalAmount === Math.round(item.quantity * saved.unitPriceAmount));
  });
}

const indexKey = (listId: string) => `seller-proposal:${listId}:index`;
const versionKey = (listId: string, version: number) => `seller-proposal:${listId}:v${version}`;
type Index = { version: number; versions?: number[]; discarded?: boolean };
const versions = (index: Index | null, version: number) => [...new Set([version, index?.version, ...(index?.versions || [])].filter((value): value is number => Number.isInteger(value) && Number(value) >= 0))];
const tails = new Map<string, Promise<unknown>>();
function enqueue<T>(accountId: string, listId: string, work: () => Promise<T>): Promise<T> {
  const key = `${accountId}:${listId}`;
  const task = (tails.get(key) || Promise.resolve()).catch(() => undefined).then(work);
  tails.set(key, task); void task.finally(() => { if (tails.get(key) === task) tails.delete(key); }).catch(() => undefined);
  return task;
}
export function readSellerProposalDraft(accountId: string, listId: string, version: number, current: () => boolean) {
  return enqueue(accountId, listId, async () => {
    if (!current()) return { draft: null, storageError: false };
    const indexed = await readJourneyDraftChecked<Index>(accountId, indexKey(listId));
    if (indexed.status === "failed" || indexed.status === "blocked") return { draft: null, storageError: true };
    const index = indexed.value;
    const oldVersion = index && Number.isInteger(index.version) && index.version >= 0 ? index.version : version;
    const saved = index?.discarded ? null : await readJourneyDraftChecked<SellerProposalDraft>(accountId, versionKey(listId, oldVersion));
    const draft = saved?.value || null;
    if (!current()) return { draft: null, storageError: false };
    return { draft: validSellerProposalDraft(draft, accountId, listId) ? draft : null, storageError: saved?.status === "failed" || saved?.status === "blocked" || Boolean(draft && !validSellerProposalDraft(draft, accountId, listId)) };
  });
}
export function writeSellerProposalDraft(draft: SellerProposalDraft, current: () => boolean) {
  return enqueue(draft.accountId, draft.listId, async () => {
    if (!current()) return false;
    const indexed = await readJourneyDraftChecked<Index>(draft.accountId, indexKey(draft.listId));
    if (!current() || indexed.status === "failed" || indexed.status === "blocked") return false;
    if (!await writeJourneyDraft(draft.accountId, versionKey(draft.listId, draft.listVersion), draft) || !current()) return false;
    return await writeJourneyDraft(draft.accountId, indexKey(draft.listId), { version: draft.listVersion, versions: versions(indexed.value, draft.listVersion), discarded: false }) && current();
  });
}
/** A confirmed tombstone prevents a late or failed physical removal from reviving a discarded form. */
export function clearSellerProposalDraft(accountId: string, listId: string, version: number, current: () => boolean) {
  return enqueue(accountId, listId, async () => {
    if (!current()) return false;
    const indexed = await readJourneyDraftChecked<Index>(accountId, indexKey(listId));
    if (!current() || indexed.status === "failed" || indexed.status === "blocked") return false;
    const retainedVersions = versions(indexed.value, version);
    if (!await writeJourneyDraft(accountId, indexKey(listId), { version, versions: retainedVersions, discarded: true })) return false;
    let cleared = true;
    for (const previous of retainedVersions) if (!await clearJourneyDraftChecked(accountId, versionKey(listId, previous))) cleared = false;
    return cleared && current();
  });
}
