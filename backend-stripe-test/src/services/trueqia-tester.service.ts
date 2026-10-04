import { createHash, randomUUID } from "crypto";
import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";
import { getDatabase, persistDatabase } from "./data.store";
import { withTrueqiaMemoryLock } from "./trueqia.workspace.service";
import { containsLikelyPrivateData } from "./ai/allwain-public-guide.ai.service";

export const TRUEQIA_TESTER_PROGRAM = "trueqia-app-pilot-v1";
export const TRUEQIA_TESTER_STEPS = ["access", "profile", "skills", "needs", "chat", "agreement", "tokens", "accessibility"] as const;
const actions = ["a1", "a2"];
const platforms = ["web", "android", "ios", "unknown"];
const categories = ["functionality", "accessibility", "content", "translation", "performance", "account", "other"];
const severities = ["low", "normal", "high", "blocking"];
const referencePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,99}$/;
const pg = () => ENV.STORAGE_DRIVER === "postgres";
const prisma = () => getPrisma() as any;

export type TrueqiaTesterActionRecord = {
  id: string; userId: string; programId: string; stepId: string; actionId: string;
  platform: string; appVersion: string | null; completedAt: string | Date;
};
export type TrueqiaTesterIncidentRecord = {
  id: string; userId: string; programId: string; clientReference: string;
  contentHash: string; payload: Record<string, unknown>; status: string; createdAt: string | Date;
};

function text(value: unknown, max: number, required = false): string {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string") throw new Error("INVALID_TESTER_FIELDS");
  const clean = value.replace(/\0/g, "").replace(/\r\n/g, "\n").trim();
  if (clean.length > max || (required && !clean)) throw new Error("INVALID_TESTER_FIELDS");
  return clean;
}
function choice(value: unknown, choices: readonly string[], fallback?: string) {
  if (value === undefined || value === null || value === "") value = fallback;
  if (typeof value !== "string" || !choices.includes(value)) throw new Error("INVALID_TESTER_FIELDS");
  return value;
}
function reference(value: unknown) {
  const result = text(value, 100, true);
  if (!referencePattern.test(result)) throw new Error("INVALID_TESTER_REFERENCE");
  return result;
}
function version(value: unknown) {
  const result = text(value, 80);
  if (result && !/^[A-Za-z0-9][A-Za-z0-9._+() -]{0,79}$/.test(result)) throw new Error("INVALID_TESTER_FIELDS");
  return result || null;
}
function date(value: string | Date) { return new Date(value).toISOString(); }
function incidentDto(row: TrueqiaTesterIncidentRecord) {
  return { id: row.id, ...row.payload, status: row.status, createdAt: date(row.createdAt) };
}
async function activeUser(userId: string, tx?: any) {
  const user = pg() ? await (tx || prisma()).user.findUnique({ where: { id: userId } }) : getDatabase().users.find(x => x.id === userId);
  if (!user || user.deletedAt || user.status === "disabled") throw new Error("USER_NOT_FOUND");
}
async function locked<T>(userId: string, run: (tx?: any) => Promise<T>): Promise<T> {
  if (!pg()) return withTrueqiaMemoryLock(`tester:${userId}`, async () => { await activeUser(userId); return run(); });
  return prisma().$transaction(async (tx: any) => {
    // Serializes deduplication and account erasure against this user's row.
    await tx.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE', userId);
    await activeUser(userId, tx);
    return run(tx);
  });
}

export async function listTrueqiaTesterIncidents(userId: string) {
  await activeUser(userId);
  const rows: TrueqiaTesterIncidentRecord[] = pg()
    ? await prisma().trueqiaTesterIncident.findMany({ where: { userId, programId: TRUEQIA_TESTER_PROGRAM }, orderBy: { createdAt: "desc" }, take: 50 })
    : getDatabase().trueqiaTesterIncidents.filter(x => x.userId === userId && x.programId === TRUEQIA_TESTER_PROGRAM).sort((a, b) => date(b.createdAt).localeCompare(date(a.createdAt))).slice(0, 50);
  return { items: rows.map(incidentDto) };
}

export async function listTrueqiaTesterIncidentsForAdmin(input: any) {
  const limit = input?.limit === undefined ? 30 : Number(input.limit);
  const offset = input?.offset === undefined ? 0 : Number(input.offset);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000) throw new Error("INVALID_TESTER_FIELDS");
  const status = input?.status ? choice(input.status, ["open", "reviewed", "closed"]) : undefined;
  let rows: TrueqiaTesterIncidentRecord[]; let total: number;
  if (pg()) {
    const where = { programId: TRUEQIA_TESTER_PROGRAM, ...(status ? { status } : {}) };
    const db = prisma();
    total = await db.trueqiaTesterIncident.count({ where });
    rows = await db.trueqiaTesterIncident.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit, skip: offset });
  } else {
    const all = getDatabase().trueqiaTesterIncidents.filter(x => x.programId === TRUEQIA_TESTER_PROGRAM && (!status || x.status === status))
      .sort((a, b) => date(b.createdAt).localeCompare(date(a.createdAt)) || b.id.localeCompare(a.id));
    total = all.length; rows = all.slice(offset, offset + limit);
  }
  return { programId: TRUEQIA_TESTER_PROGRAM, items: rows.map(row => ({ ...incidentDto(row), requesterUserId: row.userId })), total, hasMore: offset + rows.length < total, nextOffset: offset + rows.length };
}

export async function getTrueqiaTesterState(userId: string) {
  await activeUser(userId);
  const rows: TrueqiaTesterActionRecord[] = pg()
    ? await prisma().trueqiaTesterAction.findMany({ where: { userId, programId: TRUEQIA_TESTER_PROGRAM } })
    : getDatabase().trueqiaTesterActions.filter(x => x.userId === userId && x.programId === TRUEQIA_TESTER_PROGRAM);
  return {
    programId: TRUEQIA_TESTER_PROGRAM, storage: "server",
    progress: TRUEQIA_TESTER_STEPS.map(stepId => {
      const completed = rows.filter(x => x.stepId === stepId);
      return {
        stepId, status: completed.length === actions.length ? "completed" : "pending",
        updatedAt: completed.length ? completed.map(x => date(x.completedAt)).sort().at(-1) : null,
        actions: actions.map(actionId => {
          const row = completed.find(x => x.actionId === actionId);
          return { actionId, status: row ? "completed" : "pending", completedAt: row ? date(row.completedAt) : null, platform: row?.platform || null, appVersion: row?.appVersion || null };
        }),
      };
    }),
    incidents: (await listTrueqiaTesterIncidents(userId)).items,
  };
}

export async function completeTrueqiaTesterAction(userId: string, stepValue: unknown, actionValue: unknown, input: any) {
  const stepId = choice(stepValue, TRUEQIA_TESTER_STEPS);
  const actionId = choice(actionValue, actions);
  if (input?.status !== "completed") throw new Error("INVALID_TESTER_FIELDS");
  reference(input.clientReference);
  const platform = choice(input.platform, platforms, "unknown");
  const appVersion = version(input.appVersion);
  await locked(userId, async tx => {
    const where = { userId, programId: TRUEQIA_TESTER_PROGRAM, stepId, actionId };
    const old = tx ? await tx.trueqiaTesterAction.findUnique({ where: { userId_programId_stepId_actionId: where } })
      : getDatabase().trueqiaTesterActions.find(x => x.userId === userId && x.programId === TRUEQIA_TESTER_PROGRAM && x.stepId === stepId && x.actionId === actionId);
    if (old) return;
    const row: TrueqiaTesterActionRecord = { id: randomUUID(), ...where, platform, appVersion, completedAt: new Date().toISOString() };
    if (tx) await tx.trueqiaTesterAction.create({ data: row });
    else { getDatabase().trueqiaTesterActions.push(row); persistDatabase(); }
  });
  return getTrueqiaTesterState(userId);
}

export async function createTrueqiaTesterIncident(userId: string, input: any) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("INVALID_TESTER_FIELDS");
  const clientReference = reference(input.clientReference);
  const payload = {
    category: choice(input.category, categories), severity: choice(input.severity, severities, "normal"),
    screenId: text(input.screenId, 160, true),
    stepId: input.stepId ? choice(input.stepId, TRUEQIA_TESTER_STEPS) : null,
    description: text(input.description, 4000, true), reproductionSteps: text(input.reproductionSteps, 4000) || null,
    platform: choice(input.platform, platforms, "unknown"), appVersion: version(input.appVersion),
  };
  if (payload.description.length < 10) throw new Error("INVALID_TESTER_FIELDS");
  if (containsLikelyPrivateData([payload.screenId, payload.description, payload.reproductionSteps, payload.appVersion].filter(Boolean).join("\n"))) throw new Error("TESTER_SENSITIVE_DATA");
  const contentHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return locked(userId, async tx => {
    const where = { userId, programId: TRUEQIA_TESTER_PROGRAM, clientReference };
    const existing = tx ? await tx.trueqiaTesterIncident.findUnique({ where: { userId_programId_clientReference: where } })
      : getDatabase().trueqiaTesterIncidents.find(x => x.userId === userId && x.programId === TRUEQIA_TESTER_PROGRAM && x.clientReference === clientReference);
    if (existing) {
      if (existing.contentHash !== contentHash) throw new Error("TESTER_REFERENCE_CONFLICT");
      return { incident: incidentDto(existing), deduplicated: true };
    }
    const row: TrueqiaTesterIncidentRecord = { id: randomUUID(), ...where, contentHash, payload, status: "open", createdAt: new Date().toISOString() };
    if (tx) await tx.trueqiaTesterIncident.create({ data: row });
    else { getDatabase().trueqiaTesterIncidents.push(row); persistDatabase(); }
    return { incident: incidentDto(row), deduplicated: false };
  });
}
