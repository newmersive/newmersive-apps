import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";
import { getDatabase, persistDatabase } from "./data.store";

const pg = () => ENV.STORAGE_DRIVER === "postgres";
const stamp = () => new Date().toISOString();
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const running = new Map<string, Promise<unknown>>();

// JSON is the single-process development driver; PostgreSQL uses row locks below.
export async function withTrueqiaMemoryLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = running.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(run);
  running.set(key, current);
  try { return await current; } finally { if (running.get(key) === current) running.delete(key); }
}

function text(value: unknown, max: number, required = false) {
  if (value === undefined || value === null) {
    if (required) throw new Error("INVALID_FIELDS");
    return "";
  }
  if (typeof value !== "string") throw new Error("INVALID_FIELDS");
  const result = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  if (result.length > max || (required && !result)) throw new Error("INVALID_FIELDS");
  return result;
}

function https(value: unknown) {
  const result = text(value, 1000);
  if (!result) return "";
  try {
    const url = new URL(result);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error();
    return url.toString();
  } catch { throw new Error("INVALID_HTTPS_URL"); }
}

export function validTokens(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 1000000) {
    throw new Error("INVALID_TOKEN_AMOUNT");
  }
  return value;
}

export function offerFields(input: any) {
  const mode = input.mode || "remote";
  if (!["remote", "in_person"].includes(mode)) throw new Error("INVALID_FIELDS");
  if (input.isUnique !== undefined && typeof input.isUnique !== "boolean") throw new Error("INVALID_FIELDS");
  if (input.publicListing !== undefined && typeof input.publicListing !== "boolean") throw new Error("INVALID_FIELDS");
  const locationLabel = text(input.locationLabel, 160);
  return {
    title: text(input.title, 120, true), description: text(input.description, 3000, true),
    tokens: validTokens(input.tokens), isUnique: input.isUnique === true,
    category: text(input.category, 80), mode, locationLabel,
    availability: text(input.availability, 400), duration: text(input.duration, 160),
    included: text(input.included, 2000), excluded: text(input.excluded, 2000),
    portfolioUrl: https(input.portfolioUrl),
    publicListing: input.publicListing === true,
  };
}

export const offerStatus = (offer: any) => offer?.meta?.trueqia?.status || "active";
export const offerExtra = (offer: any) => offer?.meta?.trueqia || {};

export function safeOffer(offer: any, owner?: any, profile?: any) {
  const extra = offerExtra(offer);
  const publicProfile = profile?.isPublic ? profile : {};
  return {
    id: offer.id, title: offer.title, description: offer.description, tokens: offer.tokens,
    ownerUserId: offer.ownerUserId, isUnique: !!offer.isUnique,
    createdAt: offer.createdAt, updatedAt: offer.updatedAt,
    category: extra.category || offer.category || "", mode: extra.mode || "remote",
    locationLabel: extra.locationLabel || offer.locationLabel || "",
    availability: extra.availability || "", duration: extra.duration || "",
    included: extra.included || "", excluded: extra.excluded || "", portfolioUrl: extra.portfolioUrl || "",
    status: offerStatus(offer),
    publicListing: extra.publicListing === true,
    owner: { id: offer.ownerUserId, name: publicProfile.displayName || owner?.name || "Miembro de Trueqia", avatarUrl: publicProfile.avatarUrl || owner?.avatarUrl || undefined },
  };
}

const userById = async (id: string) => pg() ? getPrisma().user.findUnique({ where: { id } }) : getDatabase().users.find(x => x.id === id);
const offerById = async (id: string) => pg() ? getPrisma().offer.findUnique({ where: { id } }) : getDatabase().offers.find(x => x.id === id);
async function profileData(id: string): Promise<any> {
  return pg() ? ((await (getPrisma() as any).trueqiaProfile.findUnique({ where: { userId: id } }))?.payload || {}) : (getDatabase().trueqiaProfiles?.[id] || {});
}
async function decorate(offer: any) { return safeOffer(offer, await userById(offer.ownerUserId), await profileData(offer.ownerUserId)); }

const locationRadii = [2, 5, 10, 25, 50];
function coordinate(value: unknown, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error("INVALID_FIELDS");
  // A precision of two decimals is intentionally coarse (roughly one kilometre).
  return Math.round(value * 100) / 100;
}
function locationSettings(input: any, previous: any) {
  if (input.clearLocation === true) return { locationLatApprox: undefined, locationLngApprox: undefined, radiusKm: undefined };
  const hasLatitude = input.locationLatitude !== undefined;
  const hasLongitude = input.locationLongitude !== undefined;
  if (hasLatitude !== hasLongitude) throw new Error("INVALID_FIELDS");
  const radius = input.radiusKm === undefined ? previous.radiusKm : Number(input.radiusKm);
  if (radius !== undefined && !locationRadii.includes(radius)) throw new Error("INVALID_FIELDS");
  return hasLatitude
    ? { locationLatApprox: coordinate(input.locationLatitude, -90, 90), locationLngApprox: coordinate(input.locationLongitude, -180, 180), radiusKm: radius || 10 }
    : { locationLatApprox: previous.locationLatApprox, locationLngApprox: previous.locationLngApprox, radiusKm: radius };
}
function hasLocation(profile: any) { return Number.isFinite(profile?.locationLatApprox) && Number.isFinite(profile?.locationLngApprox); }
function distanceKm(a: any, b: any) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(a.locationLatApprox - b.locationLatApprox);
  const dLng = radians(a.locationLngApprox - b.locationLngApprox);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.locationLatApprox)) * Math.cos(radians(b.locationLatApprox)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function paging(input: any) {
  const limit = input.limit === undefined ? 30 : Number(input.limit);
  const offset = input.offset === undefined ? 0 : Number(input.offset);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000) throw new Error("INVALID_FIELDS");
  return { limit, offset };
}

function tokenRange(input: any) {
  const bound = (value: unknown) => {
    if (value === undefined) return undefined;
    if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && !/^\d+$/.test(value.trim()))) throw new Error("INVALID_FIELDS");
    const amount = Number(value);
    if (!Number.isInteger(amount) || amount < 0 || amount > 1000000) throw new Error("INVALID_FIELDS");
    return amount;
  };
  const min = bound(input.minTokens); const max = bound(input.maxTokens);
  if (min !== undefined && max !== undefined && min > max) throw new Error("INVALID_FIELDS");
  return {
    where: min === undefined && max === undefined ? {} : { tokens: { ...(min === undefined ? {} : { gte: min }), ...(max === undefined ? {} : { lte: max }) } },
    matches: (value: unknown) => min === undefined && max === undefined || (typeof value === "number" && Number.isFinite(value) && (min === undefined || value >= min) && (max === undefined || value <= max)),
  };
}

export async function findTrueqiaOffers(userId: string, input: any = {}) {
  const { limit, offset } = paging(input);
  const range = tokenRange(input);
  const mine = input.mine === "true" || input.mine === true;
  const status = mine ? text(input.status, 20) : "";
  if (status && !["active", "paused", "archived"].includes(status)) throw new Error("INVALID_FIELDS");
  const excludeMine = input.excludeMine === "true" || input.excludeMine === "1" || input.excludeMine === true;
  const q = text(input.q, 200).toLowerCase();
  let offers: any[];
  if (pg()) {
    const and: any[] = [];
    if (mine) and.push({ ownerUserId: userId });
    if (status) and.push(status === "active" ? { OR: [{ meta: { path: ["trueqia", "status"], equals: "active" } }, { meta: { path: ["trueqia", "status"], equals: Prisma.AnyNull } }] } : { meta: { path: ["trueqia", "status"], equals: status } });
    if (excludeMine) and.push({ ownerUserId: { not: userId } });
    if (!mine) and.push({ OR: [{ meta: { path: ["trueqia", "status"], equals: "active" } }, { meta: { path: ["trueqia", "status"], equals: Prisma.AnyNull } }, { meta: { equals: Prisma.DbNull } }] });
    if (q) and.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] });
    for (const [param, field] of [["category", "category"], ["mode", "mode"], ["location", "locationLabel"], ["availability", "availability"]]) {
      const value = text(input[param], 200);
      if (value) {
        const filter: any = { meta: { path: ["trueqia", field], [param === "location" || param === "availability" ? "string_contains" : "equals"]: value, ...(param === "location" || param === "availability" ? { mode: "insensitive" } : {}) } };
        and.push(param === "mode" && value === "remote" ? { OR: [filter, { meta: { path: ["trueqia", "mode"], equals: Prisma.AnyNull } }] } : filter);
      }
    }
    const where: any = { owner: "trueqia", ...range.where, AND: and };
    const total = await getPrisma().offer.count({ where });
    offers = await getPrisma().offer.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: offset, take: limit });
    return { items: await Promise.all(offers.map(decorate)), total, hasMore: offset + offers.length < total, nextOffset: offset + offers.length };
  }
  offers = getDatabase().offers.filter(o => o.owner === "trueqia")
    .filter(o => range.matches(o.tokens))
    .filter(o => !mine || o.ownerUserId === userId).filter(o => !excludeMine || o.ownerUserId !== userId)
    .filter(o => !status || offerStatus(o) === status)
    .filter(o => mine || offerStatus(o) === "active")
    .filter(o => !q || `${o.title} ${o.description}`.toLowerCase().includes(q))
    .filter(o => !input.category || offerExtra(o).category === input.category)
    .filter(o => !input.mode || (offerExtra(o).mode || "remote") === input.mode)
    .filter(o => !input.location || String(offerExtra(o).locationLabel || "").toLowerCase().includes(String(input.location).toLowerCase()))
    .filter(o => !input.availability || String(offerExtra(o).availability || "").toLowerCase().includes(String(input.availability).toLowerCase()))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")) || a.id.localeCompare(b.id));
  return { items: await Promise.all(offers.slice(offset, offset + limit).map(decorate)), total: offers.length, hasMore: offset + limit < offers.length, nextOffset: Math.min(offset + limit, offers.length) };
}

export async function getTrueqiaOffer(userId: string, id: string) {
  const offer = await offerById(id);
  if (!offer || offer.owner !== "trueqia" || (offerStatus(offer) !== "active" && offer.ownerUserId !== userId)) throw new Error("OFFER_NOT_FOUND");
  return decorate(offer);
}

async function publicOffer(offer: any) {
  const profile = await profileData(offer.ownerUserId);
  const data = safeOffer(offer, undefined, profile);
  delete (data as any).ownerUserId;
  return data;
}

export async function discoverTrueqiaOffers(input: any = {}) {
  const { limit, offset } = paging(input);
  const range = tokenRange(input);
  const q = text(input.q, 200).toLowerCase();
  if (pg()) {
    const and: any[] = [
      { meta: { path: ["trueqia", "publicListing"], equals: true } },
      { meta: { path: ["trueqia", "status"], equals: "active" } },
    ];
    if (q) and.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] });
    for (const [param, field] of [["category", "category"], ["mode", "mode"], ["location", "locationLabel"], ["availability", "availability"]]) {
      const value = text(input[param], 200);
      if (value) {
        const filter: any = { meta: { path: ["trueqia", field], [param === "location" || param === "availability" ? "string_contains" : "equals"]: value, ...(param === "location" || param === "availability" ? { mode: "insensitive" } : {}) } };
        and.push(param === "mode" && value === "remote" ? { OR: [filter, { meta: { path: ["trueqia", "mode"], equals: Prisma.AnyNull } }] } : filter);
      }
    }
    const where: any = { owner: "trueqia", ...range.where, AND: and };
    const total = await getPrisma().offer.count({ where });
    const rows = await getPrisma().offer.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: limit, skip: offset });
    return { items: await Promise.all(rows.map(publicOffer)), total, hasMore: offset + rows.length < total, nextOffset: offset + rows.length };
  }
  const all = getDatabase().offers.filter(o => o.owner === "trueqia" && offerStatus(o) === "active" && offerExtra(o).publicListing === true)
    .filter(o => range.matches(o.tokens))
    .filter(o => !q || `${o.title} ${o.description}`.toLowerCase().includes(q))
    .filter(o => !input.category || offerExtra(o).category === input.category)
    .filter(o => !input.mode || (offerExtra(o).mode || "remote") === input.mode)
    .filter(o => !input.location || String(offerExtra(o).locationLabel || "").toLowerCase().includes(String(input.location).toLowerCase()))
    .filter(o => !input.availability || String(offerExtra(o).availability || "").toLowerCase().includes(String(input.availability).toLowerCase()))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")) || a.id.localeCompare(b.id));
  const rows = all.slice(offset, offset + limit);
  return { items: await Promise.all(rows.map(publicOffer)), total: all.length, hasMore: offset + rows.length < all.length, nextOffset: offset + rows.length };
}

export async function discoverTrueqiaOffer(id: string) {
  const offer = await offerById(id);
  if (!offer || offer.owner !== "trueqia" || offerStatus(offer) !== "active" || offerExtra(offer).publicListing !== true) throw new Error("OFFER_NOT_FOUND");
  return publicOffer(offer);
}

export async function discoverTrueqiaProfile(id: string) {
  const stored = await profileData(id);
  if (stored.isPublic !== true) throw new Error("PROFILE_NOT_FOUND");
  const profile = await getTrueqiaProfile(id, id);
  return { ...profile, offers: await Promise.all(profile.offers.filter(o => o.publicListing && o.status === "active").map(async o => discoverTrueqiaOffer(o.id))) };
}

export async function saveTrueqiaOffer(userId: string, input: any, id?: string) {
  const run = async (tx?: any) => {
    if (tx && !id) await tx.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE', userId);
    if (tx && id) await tx.$queryRawUnsafe('SELECT "id" FROM "Offer" WHERE "id" = $1 FOR UPDATE', id);
    let existing: any = id ? (tx ? await tx.offer.findUnique({ where: { id } }) : getDatabase().offers.find(x => x.id === id)) : null;
    if (id && (!existing || existing.owner !== "trueqia" || existing.ownerUserId !== userId)) throw new Error("OFFER_NOT_FOUND");
    const prior: any = existing ? safeOffer(existing) : {};
    const fields = offerFields({ ...prior, ...input });
    const status = input.status || prior.status || "active";
    if (!["active", "paused", "archived"].includes(status)) throw new Error("INVALID_FIELDS");
    if (existing && fields.isUnique !== existing.isUnique) {
      const anyTrade = tx ? await tx.trade.findFirst({ where: { offerId: id } }) : getDatabase().trades.find(x => x.offerId === id);
      if (anyTrade) throw new Error("OFFER_UNIQUENESS_LOCKED");
    }
    const { title, description, tokens, isUnique, ...details } = fields;
    const data: any = { title, description, tokens, isUnique, owner: "trueqia", ownerUserId: userId, category: fields.category || null, locationLabel: fields.locationLabel || null, meta: { ...(existing?.meta || {}), trueqia: { ...details, status } }, updatedAt: stamp() };
    if (!id) {
      // Retrying a publication is idempotent even across simultaneous requests.
      const key = text(input.clientRequestId, 120);
      if (key) data.meta.trueqia.clientRequestId = key;
      const candidates = tx ? await tx.offer.findMany({ where: { owner: "trueqia", ownerUserId: userId } }) : getDatabase().offers.filter(x => x.owner === "trueqia" && x.ownerUserId === userId);
      const same = candidates.find((o: any) => key ? offerExtra(o).clientRequestId === key : o.title === title && o.description === description && o.tokens === tokens && !!o.isUnique === isUnique && JSON.stringify({ ...offerExtra(o), clientRequestId: undefined }) === JSON.stringify({ ...data.meta.trueqia, clientRequestId: undefined }));
      if (same) return same;
      data.id = randomUUID(); data.createdAt = stamp();
      if (tx) return tx.offer.create({ data });
      getDatabase().offers.push(data); persistDatabase(); return data;
    }
    // Preserve legacy trade descriptions before the first edit of their publication.
    if (tx) {
      const trades = await tx.trade.findMany({ where: { offerId: id }, orderBy: { id: "asc" } });
      for (const trade of trades) {
        await tx.$queryRawUnsafe('SELECT "id" FROM "Trade" WHERE "id" = $1 FOR UPDATE', trade.id);
        const current = await tx.trade.findUnique({ where: { id: trade.id } });
        if (!current.trueqiaDetails?.offerSnapshot) await tx.trade.update({ where: { id: trade.id }, data: { trueqiaDetails: { ...(current.trueqiaDetails || {}), offerSnapshot: safeOffer(existing) } } });
      }
      return tx.offer.update({ where: { id }, data });
    }
    for (const trade of getDatabase().trades.filter(t => t.offerId === id)) {
      trade.trueqiaDetails = trade.trueqiaDetails || {};
      if (!trade.trueqiaDetails.offerSnapshot) trade.trueqiaDetails.offerSnapshot = safeOffer(existing);
    }
    Object.assign(existing, data); persistDatabase(); return existing;
  };
  const saved = pg() ? await (getPrisma() as any).$transaction(run) : await withTrueqiaMemoryLock(`offer-owner:${userId}`, () => run());
  return decorate(saved);
}

export async function getTrueqiaProfile(viewerId: string, userId: string) {
  const user = await userById(userId);
  if (!user) throw new Error("PROFILE_NOT_FOUND");
  const own = viewerId === userId;
  const stored = await profileData(userId);
  const visible = own || stored.isPublic === true;
  const offers = await findTrueqiaOffers(userId, { mine: "true", limit: 100 });
  const completedTrades = pg() ? await getPrisma().trade.count({ where: { status: "completed", OR: [{ fromUserId: userId }, { toUserId: userId }] } }) : getDatabase().trades.filter(x => x.status === "completed" && [x.fromUserId, x.toUserId].includes(userId)).length;
  return { userId, displayName: stored.isPublic || own ? stored.displayName || user.name : user.name, visible, isPublic: stored.isPublic === true,
    ...(visible ? { bio: stored.bio || "", locationLabel: stored.locationLabel || "", portfolioUrl: stored.portfolioUrl || "", avatarUrl: stored.avatarUrl || user.avatarUrl || "", completedTrades } : {}),
    ...(own ? { locationConfigured: hasLocation(stored), radiusKm: hasLocation(stored) ? stored.radiusKm || 10 : undefined } : {}),
    offers: offers.items.filter(x => own || x.status === "active") };
}

export async function saveTrueqiaProfile(userId: string, input: any) {
  const old = await profileData(userId);
  const merged = { ...old, ...input };
  if (merged.isPublic !== undefined && typeof merged.isPublic !== "boolean") throw new Error("INVALID_FIELDS");
  if (input.clearLocation !== undefined && input.clearLocation !== true) throw new Error("INVALID_FIELDS");
  const location = locationSettings(input, old);
  const payload = { displayName: text(merged.displayName, 100), bio: text(merged.bio, 2000), locationLabel: input.clearLocation === true ? "" : text(merged.locationLabel, 160), portfolioUrl: https(merged.portfolioUrl), avatarUrl: https(merged.avatarUrl), isPublic: merged.isPublic === true, ...location };
  if (pg()) await (getPrisma() as any).trueqiaProfile.upsert({ where: { userId }, create: { userId, payload }, update: { payload } });
  else { getDatabase().trueqiaProfiles[userId] = payload; persistDatabase(); }
  return getTrueqiaProfile(userId, userId);
}

export async function findTrueqiaLocalMatches(userId: string, input: any = {}) {
  const { limit } = paging({ ...input, offset: 0 });
  const viewer = await profileData(userId);
  if (!hasLocation(viewer)) return { status: "location_needed", items: [], message: "Activa tu zona aproximada para ver coincidencias cercanas." };
  const candidates = pg()
    ? await getPrisma().offer.findMany({ where: { owner: "trueqia", ownerUserId: { not: userId }, OR: [{ meta: { path: ["trueqia", "status"], equals: "active" } }, { meta: { path: ["trueqia", "status"], equals: Prisma.AnyNull } }, { meta: { equals: Prisma.DbNull } }] }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 250 })
    : getDatabase().offers.filter(o => o.owner === "trueqia" && o.ownerUserId !== userId && offerStatus(o) === "active");
  const matches = await Promise.all(candidates.map(async offer => {
    const ownerProfile = await profileData(offer.ownerUserId);
    if (!hasLocation(ownerProfile)) return null;
    const distance = distanceKm(viewer, ownerProfile);
    const sharedRadius = Math.min(viewer.radiusKm || 10, ownerProfile.radiusKm || 10);
    if (distance > sharedRadius) return null;
    const roundedDistance = Math.max(1, Math.round(distance));
    return { offer: await decorate(offer), match: { distanceKm: roundedDistance, radiusKm: sharedRadius, score: Math.max(1, Math.round(100 - distance * 2)), reason: `A unos ${roundedDistance} km, dentro de vuestro radio de ${sharedRadius} km.` } };
  }));
  const items = matches.filter(Boolean).sort((a: any, b: any) => a.match.distanceKm - b.match.distanceKm || b.match.score - a.match.score).slice(0, limit);
  return { status: "ok", items, total: items.length, message: items.length ? "Coincidencias cercanas basadas en una zona aproximada." : "Aún no hay habilidades dentro del radio que habéis elegido." };
}

export async function trueqiaMovements(userId: string, input: any) {
  const { limit, offset } = paging(input);
  let rows: any[]; let total: number;
  if (pg()) {
    const where = { tokensTransferredAt: { not: null }, OR: [{ fromUserId: userId }, { toUserId: userId }] };
    total = await getPrisma().trade.count({ where });
    rows = await getPrisma().trade.findMany({ where, orderBy: [{ tokensTransferredAt: "desc" }, { id: "asc" }], take: limit, skip: offset });
  } else {
    const all = getDatabase().trades.filter(t => t.tokensTransferredAt && [t.fromUserId, t.toUserId].includes(userId)).sort((a, b) => String(b.tokensTransferredAt).localeCompare(String(a.tokensTransferredAt)));
    total = all.length; rows = all.slice(offset, offset + limit);
  }
  const items = await Promise.all(rows.map(async trade => {
    const otherId = trade.fromUserId === userId ? trade.toUserId : trade.fromUserId;
    return { id: trade.id, tradeId: trade.id, title: trade.trueqiaDetails?.offerSnapshot?.title || (await offerById(trade.offerId))?.title || "Trueque", direction: trade.fromUserId === userId ? "out" : "in", amount: trade.tokens, createdAt: trade.tokensTransferredAt, counterparty: { id: otherId, name: (await userById(otherId))?.name || "Miembro de Trueqia" } };
  }));
  return { items, total, hasMore: offset + items.length < total, nextOffset: offset + items.length, balance: (await userById(userId))?.tokens ?? 0 };
}

export async function createTrueqiaTradeSafe(fromUserId: string, toUserId: string, offerId: string, tokens?: number) {
  const run = async (tx?: any) => {
    if (tx) await tx.$queryRawUnsafe('SELECT "id" FROM "Offer" WHERE "id" = $1 FOR UPDATE', offerId);
    const offer: any = tx ? await tx.offer.findUnique({ where: { id: offerId } }) : getDatabase().offers.find(o => o.id === offerId);
    if (!offer || offer.owner !== "trueqia" || offerStatus(offer) !== "active") throw new Error("OFFER_NOT_FOUND");
    if (fromUserId === toUserId || offer.ownerUserId === fromUserId) throw new Error("CANNOT_TRADE_OWN_OFFER");
    if (offer.ownerUserId !== toUserId) throw new Error("INVALID_OFFER_OWNER");
    const trades = tx ? await tx.trade.findMany({ where: { offerId } }) : getDatabase().trades.filter(t => t.offerId === offerId);
    const previous = trades.find((t: any) => t.fromUserId === fromUserId && t.toUserId === toUserId && ["pending", "accepted", "active"].includes(t.status));
    if (previous) return previous;
    if (offer.isUnique && trades.some((t: any) => ["accepted", "active", "completed"].includes(t.status))) throw new Error("OFFER_ALREADY_CLAIMED");
    const amount = validTokens(tokens === undefined ? offer.tokens : tokens);
    const trade: any = { id: randomUUID(), offerId, fromUserId, toUserId, tokens: amount, status: "pending", createdAt: stamp(), trueqiaDetails: { offerSnapshot: safeOffer(offer), negotiationHistory: [], issues: [] } };
    if (tx) return tx.trade.create({ data: trade });
    getDatabase().trades.push(trade); persistDatabase(); return trade;
  };
  return pg() ? (getPrisma() as any).$transaction(run) : withTrueqiaMemoryLock(`offer:${offerId}`, () => run());
}

export async function acceptTrueqiaTradeSafe(tradeId: string, userId: string) {
  const run = async (tx?: any) => {
    let trade: any = tx ? await tx.trade.findUnique({ where: { id: tradeId } }) : getDatabase().trades.find(t => t.id === tradeId);
    if (!trade) throw new Error("TRADE_NOT_FOUND");
    if (tx) {
      await tx.$queryRawUnsafe('SELECT "id" FROM "Offer" WHERE "id" = $1 FOR UPDATE', trade.offerId);
      await tx.$queryRawUnsafe('SELECT "id" FROM "Trade" WHERE "id" = $1 FOR UPDATE', tradeId);
      trade = await tx.trade.findUnique({ where: { id: tradeId } });
    }
    if (trade.toUserId !== userId) throw new Error("TRADE_ACTION_FORBIDDEN");
    if (["accepted", "active", "completed"].includes(trade.status)) return trade;
    if (trade.status !== "pending") throw new Error("INVALID_TRADE_STATUS");
    const offer: any = tx ? await tx.offer.findUnique({ where: { id: trade.offerId } }) : getDatabase().offers.find(o => o.id === trade.offerId);
    if (!offer || offer.owner !== "trueqia") throw new Error("OFFER_NOT_FOUND");
    const all = tx ? await tx.trade.findMany({ where: { offerId: trade.offerId } }) : getDatabase().trades.filter(t => t.offerId === trade.offerId);
    if (offer.isUnique && all.some((t: any) => t.id !== tradeId && ["accepted", "active", "completed"].includes(t.status))) throw new Error("OFFER_ALREADY_CLAIMED");
    if (tx) {
      const updated = await tx.trade.update({ where: { id: tradeId }, data: { status: "accepted", resolvedAt: new Date() } });
      if (offer.isUnique) await tx.trade.updateMany({ where: { offerId: trade.offerId, id: { not: tradeId }, status: "pending" }, data: { status: "rejected", resolvedAt: new Date() } });
      return updated;
    }
    trade.status = "accepted"; trade.resolvedAt = stamp();
    if (offer.isUnique) for (const other of all) if (other.id !== tradeId && other.status === "pending") { other.status = "rejected"; other.resolvedAt = stamp(); }
    persistDatabase(); return trade;
  };
  const offerId = pg() ? "" : getDatabase().trades.find(t => t.id === tradeId)?.offerId;
  return pg() ? (getPrisma() as any).$transaction(run) : withTrueqiaMemoryLock(`offer:${offerId}`, () => run());
}

export function assertTrueqiaSigningAllowed(trade: any) {
  if (trade?.trueqiaDetails?.negotiation?.status === "proposed") throw new Error("NEGOTIATION_PENDING");
  if (trade?.trueqiaDetails?.cancellation?.status === "proposed") throw new Error("CANCELLATION_PENDING");
  if (trade && !["accepted", "active", "completed"].includes(trade.status)) throw new Error("INVALID_TRADE_STATUS");
}

export function trueqiaTradeDetails(trade: any) {
  const { trueqiaDetails, ...base } = trade;
  const details = trueqiaDetails || {};
  return { ...base, negotiation: details.negotiation || null, negotiationHistory: details.negotiationHistory || [], issues: details.issues || [], cancellation: details.cancellation || null, cancellationHistory: details.cancellationHistory || [], offerSnapshot: details.offerSnapshot || null };
}

async function mutateTrade(userId: string, id: string, change: (trade: any, contracts: any[]) => void) {
  const run = async (tx?: any) => {
    if (tx) await tx.$queryRawUnsafe('SELECT "id" FROM "Trade" WHERE "id" = $1 FOR UPDATE', id);
    const original: any = tx ? await tx.trade.findUnique({ where: { id } }) : getDatabase().trades.find(t => t.id === id);
    if (!original || ![original.fromUserId, original.toUserId].includes(userId)) throw new Error("TRADE_NOT_FOUND");
    const trade = clone(original);
    const contracts: any[] = tx ? await tx.contract.findMany({ where: { app: "trueqia", tradeId: id } }) : clone(getDatabase().contracts.filter(c => c.app === "trueqia" && c.tradeId === id));
    const contractStatuses = new Map(contracts.map(c => [c.id, c.status]));
    trade.trueqiaDetails = trade.trueqiaDetails || { negotiationHistory: [], issues: [] };
    change(trade, contracts);
    if (tx) {
      await tx.trade.update({ where: { id }, data: { tokens: trade.tokens, status: trade.status, trueqiaDetails: trade.trueqiaDetails, resolvedAt: trade.resolvedAt || null } });
      for (const c of contracts) if (c.status !== contractStatuses.get(c.id)) await tx.contract.update({ where: { id: c.id }, data: { status: c.status } });
    } else {
      Object.assign(original, trade);
      for (const c of contracts) if (c.status !== contractStatuses.get(c.id)) Object.assign(getDatabase().contracts.find(x => x.id === c.id)!, c);
      persistDatabase();
    }
    return trueqiaTradeDetails(trade);
  };
  return pg() ? (getPrisma() as any).$transaction(run) : withTrueqiaMemoryLock(`trade:${id}`, () => run());
}

function editableTrade(trade: any, contracts: any[]) {
  if (!["pending", "accepted"].includes(trade.status) || trade.tokensTransferredAt || contracts.some(c => c.requesterAcceptedAt || c.providerAcceptedAt || c.status === "accepted")) throw new Error("AGREEMENT_LOCKED");
  if (trade.trueqiaDetails.cancellation?.status === "proposed") throw new Error("CANCELLATION_PENDING");
}

export async function rejectTrueqiaTradeSafe(userId: string, id: string) {
  return mutateTrade(userId, id, trade => {
    if (trade.status === "rejected") return;
    if (trade.status !== "pending") throw new Error("INVALID_TRADE_STATUS");
    trade.status = "rejected"; trade.resolvedAt = stamp();
  });
}

function terms(input: any) {
  const value = input || {};
  const count = (x: any, max: number) => { if (x === undefined || x === null || x === "") return null; if (!Number.isInteger(x) || x < 0 || x > max) throw new Error("INVALID_FIELDS"); return x; };
  const dueDate = text(value.dueDate, 10);
  if (dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(Date.parse(dueDate)) || new Date(dueDate).toISOString().slice(0, 10) !== dueDate)) throw new Error("INVALID_FIELDS");
  return { sessions: count(value.sessions, 1000), deliverable: text(value.deliverable, 2000, true), dueDate, revisions: count(value.revisions, 100), excluded: text(value.excluded, 2000) };
}

export async function proposeTrueqiaNegotiation(userId: string, id: string, input: any) {
  const amount = validTokens(input.tokens); const value = terms(input.terms);
  return mutateTrade(userId, id, (trade, contracts) => {
    editableTrade(trade, contracts);
    const details = trade.trueqiaDetails;
    const current = details.negotiation?.version || 0;
    if (Number(input.expectedVersion ?? 0) !== current) throw new Error("NEGOTIATION_VERSION_CONFLICT");
    const negotiation = { version: current + 1, status: "proposed", terms: value, tokens: amount, proposedBy: userId, acceptedBy: [userId], createdAt: stamp() };
    details.negotiationHistory = [...(details.negotiationHistory || []), negotiation];
    details.negotiation = negotiation;
    for (const c of contracts) if (c.status === "draft") c.status = "superseded";
  });
}

export async function acceptTrueqiaNegotiation(userId: string, id: string, input: any) {
  return mutateTrade(userId, id, (trade, contracts) => {
    editableTrade(trade, contracts);
    const negotiation = trade.trueqiaDetails.negotiation;
    if (!negotiation || negotiation.version !== Number(input.version)) throw new Error("NEGOTIATION_VERSION_CONFLICT");
    if (!negotiation.acceptedBy.includes(userId)) negotiation.acceptedBy.push(userId);
    if ([trade.fromUserId, trade.toUserId].every(id => negotiation.acceptedBy.includes(id))) {
      negotiation.status = "accepted"; trade.tokens = negotiation.tokens;
    }
    trade.trueqiaDetails.negotiationHistory = (trade.trueqiaDetails.negotiationHistory || []).map((item: any) => item.version === negotiation.version ? clone(negotiation) : item);
  });
}

export async function trueqiaIssueAction(userId: string, id: string, issueId: string | undefined, action: string, input: any) {
  return mutateTrade(userId, id, trade => {
    if (!["accepted", "active", "completed"].includes(trade.status)) throw new Error("INVALID_TRADE_STATUS");
    const details = trade.trueqiaDetails;
    details.issues = details.issues || [];
    if (action === "create") {
      if (!["delay", "incomplete", "change", "other"].includes(input.kind)) throw new Error("INVALID_FIELDS");
      if (details.issues.filter((x: any) => x.status !== "resolved").length >= 5) throw new Error("TOO_MANY_OPEN_ISSUES");
      details.issues.push({ id: randomUUID(), kind: input.kind, description: text(input.description, 2000, true), evidenceUrl: https(input.evidenceUrl), status: "open", createdBy: userId, createdAt: stamp(), messages: [] });
      return;
    }
    const issue = details.issues.find((x: any) => x.id === issueId);
    if (!issue) throw new Error("ISSUE_NOT_FOUND");
    if (issue.status === "resolved") throw new Error("ISSUE_RESOLVED");
    if (action === "message") {
      if (issue.messages.length >= 200) throw new Error("ISSUE_MESSAGE_LIMIT");
      issue.messages.push({ id: randomUUID(), userId, text: text(input.text, 2000, true), createdAt: stamp() });
    } else if (action === "resolution") {
      const resolution = { text: text(input.text, 2000, true), proposedBy: userId, acceptedBy: [userId], createdAt: stamp() };
      issue.resolutionHistory = [...(issue.resolutionHistory || []), resolution];
      issue.resolution = resolution; issue.status = "resolution_proposed";
    } else {
      if (!issue.resolution) throw new Error("RESOLUTION_REQUIRED");
      if (input.expectedText !== issue.resolution.text) throw new Error("RESOLUTION_VERSION_CONFLICT");
      if (!issue.resolution.acceptedBy.includes(userId)) issue.resolution.acceptedBy.push(userId);
      if ([trade.fromUserId, trade.toUserId].every(id => issue.resolution.acceptedBy.includes(id))) { issue.status = "resolved"; issue.resolvedAt = stamp(); }
      issue.resolutionHistory = (issue.resolutionHistory || []).map((entry: any) => entry.createdAt === issue.resolution.createdAt && entry.text === issue.resolution.text ? clone(issue.resolution) : entry);
    }
  });
}

export async function trueqiaCancellation(userId: string, id: string, accept: boolean | "decline", input: any) {
  return mutateTrade(userId, id, (trade, contracts) => {
    if (!["pending", "accepted"].includes(trade.status) || trade.tokensTransferredAt) throw new Error("CANCELLATION_UNAVAILABLE");
    const details = trade.trueqiaDetails;
    if (accept === "decline") {
      if (details.cancellation?.status !== "proposed") throw new Error("CANCELLATION_NOT_FOUND");
      if (input.expectedCreatedAt !== details.cancellation.createdAt) throw new Error("CANCELLATION_VERSION_CONFLICT");
      details.cancellation = { ...details.cancellation, status: "declined", declinedBy: userId, declinedAt: stamp() };
      details.cancellationHistory = [...(details.cancellationHistory || []), clone(details.cancellation)];
      return;
    }
    if (!accept) {
      if (details.cancellation?.status === "proposed") throw new Error("CANCELLATION_PENDING");
      const createdAt = new Date(Math.max(Date.now(), (Date.parse(details.cancellation?.createdAt || "") || 0) + 1)).toISOString();
      details.cancellation = { reason: text(input.reason, 2000, true), requestedBy: userId, acceptedBy: [userId], status: "proposed", createdAt };
    } else {
      if (details.cancellation?.status !== "proposed") throw new Error("CANCELLATION_NOT_FOUND");
      if (input.expectedCreatedAt !== details.cancellation.createdAt) throw new Error("CANCELLATION_VERSION_CONFLICT");
      if (!details.cancellation.acceptedBy.includes(userId)) details.cancellation.acceptedBy.push(userId);
      if ([trade.fromUserId, trade.toUserId].every(id => details.cancellation.acceptedBy.includes(id))) {
        details.cancellation.status = "cancelled"; trade.status = "cancelled"; trade.resolvedAt = stamp();
        details.cancellationHistory = [...(details.cancellationHistory || []), clone(details.cancellation)];
        for (const c of contracts) if (["draft", "partially_accepted"].includes(c.status)) c.status = "cancelled";
      }
    }
  });
}
