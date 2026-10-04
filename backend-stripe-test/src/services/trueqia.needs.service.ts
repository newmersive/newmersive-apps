import { randomUUID, createHash } from "crypto";
import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";
import { getDatabase, persistDatabase } from "./data.store";
import { offerStatus, safeOffer, withTrueqiaMemoryLock } from "./trueqia.workspace.service";

const pg = () => ENV.STORAGE_DRIVER === "postgres";
const prisma = () => getPrisma() as any;
function clean(value: any, max: number, required = false) {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string") throw new Error("INVALID_FIELDS");
  const result = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (result.length > max || (required && !result)) throw new Error("INVALID_FIELDS");
  return result;
}
async function owner(id: string) {
  const user = pg() ? await getPrisma().user.findUnique({ where: { id } }) : getDatabase().users.find(x => x.id === id);
  const profile = pg() ? (await prisma().trueqiaProfile.findUnique({ where: { userId: id } }))?.payload : getDatabase().trueqiaProfiles[id];
  return { id, name: profile?.isPublic && profile.displayName || user?.name || "Miembro de Trueqia", avatarUrl: profile?.isPublic && profile.avatarUrl || user?.avatarUrl || undefined };
}
async function responseDto(response: any) {
  const offer = pg() ? await getPrisma().offer.findUnique({ where: { id: response.offerId } }) : getDatabase().offers.find(x => x.id === response.offerId);
  const person = await owner(response.responderUserId);
  return { ...response, owner: person, offer: offer ? { ...safeOffer(offer), owner: person } : null };
}
async function needDto(need: any, viewer: string) {
  const rows = pg() ? await prisma().trueqiaNeedResponse.findMany({ where: { needId: need.id, ...(viewer === need.userId ? {} : { responderUserId: viewer }) }, orderBy: { createdAt: "asc" } }) : getDatabase().trueqiaNeedResponses.filter(x => x.needId === need.id && (viewer === need.userId || x.responderUserId === viewer));
  return { ...need, owner: await owner(need.userId), responses: await Promise.all(rows.map(responseDto)) };
}
export async function getTrueqiaNeed(userId: string, id: string) {
  const need = pg() ? await prisma().trueqiaNeed.findUnique({ where: { id } }) : getDatabase().trueqiaNeeds.find(x => x.id === id);
  if (!need) throw new Error("NEED_NOT_FOUND");
  return needDto(need, userId);
}
export async function listTrueqiaNeeds(userId: string, input: any) {
  const limit = input.limit === undefined ? 30 : Number(input.limit);
  const offset = input.offset === undefined ? 0 : Number(input.offset);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000) throw new Error("INVALID_FIELDS");
  const mine = input.mine === "true";
  const q = clean(input.q, 200); const category = clean(input.category, 80); const mode = clean(input.mode, 20);
  let rows: any[]; let total: number;
  if (pg()) {
    const where: any = { ...(mine ? { userId } : { status: "open" }), ...(category ? { category } : {}), ...(mode ? { mode } : {}), ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}) };
    total = await prisma().trueqiaNeed.count({ where });
    rows = await prisma().trueqiaNeed.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: limit, skip: offset });
  } else {
    const all = getDatabase().trueqiaNeeds.filter(n => mine ? n.userId === userId : n.status === "open")
      .filter(n => !category || n.category === category).filter(n => !mode || n.mode === mode)
      .filter(n => !q || `${n.title} ${n.description}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
    rows = all.slice(offset, offset + limit); total = all.length;
  }
  return { items: await Promise.all(rows.map(n => needDto(n, userId))), total, hasMore: offset + rows.length < total, nextOffset: offset + rows.length };
}
export async function saveTrueqiaNeed(userId: string, input: any, id?: string) {
  const key = clean(input.clientRequestId, 120);
  const createId = key ? `need-${createHash("sha256").update(`${userId}:${key}`).digest("hex")}` : randomUUID();
  const run = async (tx?: any) => {
    if (tx && !id) await tx.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE', userId);
    if (tx && id) await tx.$queryRawUnsafe('SELECT "id" FROM "TrueqiaNeed" WHERE "id" = $1 FOR UPDATE', id);
    const old = id ? (tx ? await tx.trueqiaNeed.findUnique({ where: { id } }) : getDatabase().trueqiaNeeds.find(x => x.id === id)) : null;
    if (id && (!old || old.userId !== userId)) throw new Error("NEED_NOT_FOUND");
    const body = { ...old, ...input };
    const mode = body.mode || "remote"; const status = body.status || "open";
    if (!["remote", "in_person"].includes(mode) || !["open", "closed"].includes(status)) throw new Error("INVALID_FIELDS");
    const data = { title: clean(body.title, 120, true), description: clean(body.description, 3000, true), category: clean(body.category, 80), mode, status, locationLabel: clean(body.locationLabel, 160), availability: clean(body.availability, 400), updatedAt: new Date().toISOString() };
    if (tx) return id ? tx.trueqiaNeed.update({ where: { id }, data }) : tx.trueqiaNeed.upsert({ where: { id: createId }, create: { ...data, id: createId, userId }, update: {} });
    if (old) Object.assign(old, data);
    else { const duplicate = getDatabase().trueqiaNeeds.find(x => x.id === createId); if (duplicate) return duplicate; const created = { ...data, id: createId, userId, createdAt: data.updatedAt }; getDatabase().trueqiaNeeds.push(created); persistDatabase(); return created; }
    persistDatabase(); return old;
  };
  const row = pg() ? await prisma().$transaction(run) : await withTrueqiaMemoryLock(`need:${id || userId}`, () => run());
  return needDto(row, userId);
}
export async function respondTrueqiaNeed(userId: string, id: string, input: any) {
  const offerId = clean(input.offerId, 120, true); const message = clean(input.message, 2000, true);
  const run = async (tx?: any) => {
    if (tx) {
      await tx.$queryRawUnsafe('SELECT "id" FROM "TrueqiaNeed" WHERE "id" = $1 FOR UPDATE', id);
      await tx.$queryRawUnsafe('SELECT "id" FROM "Offer" WHERE "id" = $1 FOR UPDATE', offerId);
    }
    const need = tx ? await tx.trueqiaNeed.findUnique({ where: { id } }) : getDatabase().trueqiaNeeds.find(x => x.id === id);
    if (!need) throw new Error("NEED_NOT_FOUND");
    if (need.status !== "open") throw new Error("NEED_CLOSED");
    if (need.userId === userId) throw new Error("CANNOT_RESPOND_OWN_NEED");
    const offer = tx ? await tx.offer.findUnique({ where: { id: offerId } }) : getDatabase().offers.find(x => x.id === offerId);
    if (!offer || offer.owner !== "trueqia" || offer.ownerUserId !== userId || offerStatus(offer) !== "active") throw new Error("OFFER_NOT_FOUND");
    const previous = tx ? await tx.trueqiaNeedResponse.findUnique({ where: { needId_responderUserId_offerId: { needId: id, responderUserId: userId, offerId } } }) : getDatabase().trueqiaNeedResponses.find(x => x.needId === id && x.responderUserId === userId && x.offerId === offerId);
    if (previous) return previous;
    const data = { id: randomUUID(), needId: id, responderUserId: userId, offerId, message, createdAt: new Date().toISOString() };
    if (tx) return tx.trueqiaNeedResponse.create({ data });
    getDatabase().trueqiaNeedResponses.push(data); persistDatabase(); return data;
  };
  return responseDto(pg() ? await prisma().$transaction(run) : await withTrueqiaMemoryLock(`need:${id}`, () => run()));
}
