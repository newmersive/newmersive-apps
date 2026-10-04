import assert from "node:assert/strict";
import { before, after, describe, it } from "node:test";
import { app } from "../src/server";
import { ENV } from "../src/config/env";
import { getPrisma, closePrisma } from "../src/db/prisma";
import { getDatabase, loadDatabase, persistDatabase } from "../src/services/data.store";
import { deleteAllwainAccount } from "../src/services/allwain-account.service";
import { TestClient } from "./helpers/test-client";

const client = new TestClient(app);
const prefix = `tester-${Date.now()}`;
const headers: Record<string, Record<string, string>> = {};
const ids: Record<string, string> = {};
const base = "/trueqia/tester";
const action = (overrides = {}) => ({ status: "completed", platform: "web", appVersion: "1.3.0", clientReference: `${prefix}-action`, ...overrides });
const incident = (overrides = {}) => ({ category: "functionality", severity: "normal", screenId: "aula/habilidades", stepId: "skills", description: "El texto del botón queda cortado al girar la pantalla.", reproductionSteps: "Abrir el aula y girar la pantalla.", platform: "android", appVersion: "1.3.0", clientReference: `${prefix}-incident`, ...overrides });
async function counts() {
  if (ENV.STORAGE_DRIVER === "postgres") {
    const db = getPrisma();
    return { offers: await db.offer.count(), trades: await db.trade.count(), contracts: await db.contract.count(), support: await db.allwainSupportTicket.count(), tokens: (await db.user.findUnique({ where: { id: ids.alice } }))?.tokens };
  }
  const db = getDatabase();
  return { offers: db.offers.length, trades: db.trades.length, contracts: db.contracts.length, tokens: db.users.find(x => x.id === ids.alice)?.tokens };
}
let beforeCounts: any;

describe(`Trueqia tester isolation (${ENV.STORAGE_DRIVER})`, () => {
  before(async () => {
    assert.equal(ENV.NODE_ENV, "test");
    if (ENV.STORAGE_DRIVER === "postgres") assert.ok(["localhost", "127.0.0.1", "[::1]", "::1"].includes(new URL(ENV.DATABASE_URL!).hostname));
    await client.start();
    for (const person of ["alice", "bob", "allwain", "staff"]) {
      const result = await client.post("/auth/register", { name: `Tester ${person}`, email: `${prefix}-${person}@example.test`, password: "OnlyLocalTest_2026!", sourceApp: person === "staff" ? "admin" : person === "allwain" ? "allwain" : "trueqia" });
      assert.equal(result.status, 201, JSON.stringify(result.body));
      headers[person] = { Authorization: `Bearer ${result.body.token}` }; ids[person] = result.body.user.id;
    }
    if (ENV.STORAGE_DRIVER === "postgres") await getPrisma().user.update({ where: { id: ids.staff }, data: { role: "admin" } });
    else { getDatabase().users.find(x => x.id === ids.staff)!.role = "admin"; persistDatabase(); }
    const login = await client.post("/auth/login", { email: `${prefix}-staff@example.test`, password: "OnlyLocalTest_2026!", sourceApp: "trueqia" });
    assert.equal(login.status, 200);
    headers.staffTrueqia = { Authorization: `Bearer ${login.body.token}` };
    beforeCounts = await counts();
  });
  after(async () => { await client.stop(); await closePrisma(); });

  it("requires a Trueqia session and does not expose the tester state publicly or through Allwain", async () => {
    assert.equal((await client.get(`${base}/state`)).status, 401);
    assert.equal((await client.get(`${base}/state`, headers.allwain)).status, 403);
    assert.equal((await client.post(`${base}/incidents`, incident(), headers.allwain)).status, 403);
  });

  it("starts with sixteen pending actions and no shared progress", async () => {
    const response = await client.get(`${base}/state`, headers.alice);
    assert.equal(response.status, 200);
    assert.equal(response.body.programId, "trueqia-app-pilot-v1");
    assert.equal(response.body.progress.length, 8);
    assert.ok(response.body.progress.every((x: any) => x.status === "pending" && x.actions.length === 2 && x.actions.every((a: any) => a.status === "pending")));
    assert.equal(response.body.incidents.length, 0);
  });

  it("merges concurrent action completions idempotently across devices", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => client.patch(`${base}/progress/skills/actions/${i % 2 ? "a1" : "a2"}`, action({ platform: i % 2 ? "web" : "android", clientReference: `${prefix}-device-${i}` }), headers.alice)));
    assert.ok(results.every(x => x.status === 200), JSON.stringify(results.map(x => x.body)));
    const state = (await client.get(`${base}/state`, headers.alice)).body;
    const step = state.progress.find((x: any) => x.stepId === "skills");
    assert.equal(step.status, "completed");
    const times = step.actions.map((x: any) => x.completedAt);
    await client.patch(`${base}/progress/skills/actions/a1`, action(), headers.alice);
    const repeat = (await client.get(`${base}/state`, headers.alice)).body.progress.find((x: any) => x.stepId === "skills");
    assert.deepEqual(repeat.actions.map((x: any) => x.completedAt), times);
    const db: any = ENV.STORAGE_DRIVER === "postgres" ? getPrisma() : null;
    const count = db ? await db.trueqiaTesterAction.count({ where: { userId: ids.alice } }) : getDatabase().trueqiaTesterActions.filter(x => x.userId === ids.alice).length;
    assert.equal(count, 2);
  });

  it("rejects invalid actions, reset requests and unsanitized report data", async () => {
    assert.equal((await client.patch(`${base}/progress/buy/actions/a1`, action(), headers.alice)).status, 400);
    assert.equal((await client.patch(`${base}/progress/skills/actions/a3`, action(), headers.alice)).status, 400);
    assert.equal((await client.patch(`${base}/progress/skills/actions/a1`, action({ status: "pending" }), headers.alice)).status, 400);
    for (const invalid of [{ description: "short" }, { category: "payment" }, { description: "a".repeat(4001) }, { platform: "unsafe" }, { clientReference: "bad" }]) {
      assert.equal((await client.post(`${base}/incidents`, incident(invalid), headers.alice)).status, 400);
    }
    const privateData = await client.post(`${base}/incidents`, incident({ description: "Mi correo privado es alice@example.com y el botón no funciona." }), headers.alice);
    assert.equal(privateData.status, 400); assert.equal(privateData.body.error, "TESTER_SENSITIVE_DATA");
  });

  it("deduplicates concurrent reports while rejecting a changed payload under the same reference", async () => {
    const results = await Promise.all(Array.from({ length: 4 }, () => client.post(`${base}/incidents`, incident(), headers.alice)));
    assert.equal(results.filter(x => x.status === 201).length, 1);
    assert.equal(results.filter(x => x.status === 200 && x.body.deduplicated).length, 3);
    assert.equal(new Set(results.map(x => x.body.incident.id)).size, 1);
    assert.equal((await client.post(`${base}/incidents`, incident({ description: "Otro problema distinto al primer informe enviado." }), headers.alice)).status, 409);
    const result = results[0].body.incident;
    assert.equal(result.userId, undefined); assert.equal(result.email, undefined); assert.equal(result.contentHash, undefined); assert.equal(result.clientReference, undefined);
  });

  it("keeps reports and progress private to each account", async () => {
    const state = (await client.get(`${base}/state`, headers.bob)).body;
    assert.ok(state.progress.every((x: any) => x.status === "pending"));
    assert.equal(state.incidents.length, 0);
    assert.equal((await client.get(`${base}/incidents?userId=${ids.alice}`, headers.bob)).body.items.length, 0);
    assert.equal((await client.post(`${base}/incidents`, incident(), headers.bob)).status, 201);
    const alice = (await client.get(`${base}/incidents`, headers.alice)).body.items;
    const bob = (await client.get(`${base}/incidents`, headers.bob)).body.items;
    assert.equal(alice.length, 1); assert.equal(bob.length, 1); assert.notEqual(alice[0].id, bob[0].id);
  });

  it("persists progress and reports without creating offers, trades, contracts or moving tokens", async () => {
    if (ENV.STORAGE_DRIVER === "json") loadDatabase();
    const state = (await client.get(`${base}/state`, headers.alice)).body;
    assert.equal(state.progress.find((x: any) => x.stepId === "skills").status, "completed");
    assert.equal(state.incidents.length, 1);
    assert.deepEqual(await counts(), beforeCounts);
  });

  it("provides a paginated report review only to an administrator using an admin session", async () => {
    const path = "/admin/trueqia/tester/incidents";
    assert.equal((await client.get(path)).status, 401);
    assert.equal((await client.get(path, headers.alice)).status, 403);
    assert.equal((await client.get(path, headers.staffTrueqia)).status, 403);
    const response = await client.get(`${path}?limit=1&offset=0&status=open`, headers.staff);
    assert.equal(response.status, 200); assert.equal(response.body.items.length, 1); assert.ok(response.body.total >= 2);
    assert.equal(response.body.hasMore, true); assert.equal(response.body.nextOffset, 1);
    assert.ok(response.body.items[0].requesterUserId); assert.equal(response.body.items[0].email, undefined);
    assert.equal(response.headers["cache-control"], "no-store");
    const next = await client.get(`${path}?limit=1&offset=1`, headers.staff);
    assert.notEqual(next.body.items[0].id, response.body.items[0].id);
    assert.equal((await client.get(`${path}?limit=101`, headers.staff)).status, 400);
    assert.equal((await client.get(`${path}?status=unsafe`, headers.staff)).status, 400);
  });

  it("erases voluntary tester data even when a report races shared account deletion", { skip: ENV.STORAGE_DRIVER !== "postgres" }, async () => {
    const [write, erasure] = await Promise.allSettled([
      client.post(`${base}/incidents`, incident({ clientReference: `${prefix}-erasure-race` }), headers.alice),
      deleteAllwainAccount(ids.alice),
    ]);
    assert.equal(erasure.status, "fulfilled");
    assert.equal(write.status, "fulfilled");
    if (write.status === "fulfilled") assert.ok([201, 401, 404].includes(write.value.status), JSON.stringify(write.value));
    const db: any = getPrisma();
    assert.equal(await db.trueqiaTesterAction.count({ where: { userId: ids.alice } }), 0);
    assert.equal(await db.trueqiaTesterIncident.count({ where: { userId: ids.alice } }), 0);
    assert.equal(await db.trueqiaTesterIncident.count({ where: { userId: ids.bob } }), 1);
  });
});
