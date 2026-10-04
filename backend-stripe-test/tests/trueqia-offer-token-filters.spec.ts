import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, describe, it } from "node:test";
import { app } from "../src/server";
import { ENV } from "../src/config/env";
import { getPrisma, closePrisma } from "../src/db/prisma";
import { getDatabase, persistDatabase } from "../src/services/data.store";
import { findTrueqiaOffers, discoverTrueqiaOffers, saveTrueqiaOffer } from "../src/services/trueqia.workspace.service";
import { TestClient } from "./helpers/test-client";

const ownerId = randomUUID();
const prefix = `token-range-${randomUUID()}`;
const client = new TestClient(app);
const amounts = (result: any) => result.items.map((offer: any) => offer.tokens).sort((a: number, b: number) => a - b);

describe(`Trueqia token filters (${ENV.STORAGE_DRIVER})`, () => {
  before(async () => {
    assert.equal(ENV.NODE_ENV, "test");
    if (ENV.STORAGE_DRIVER === "postgres") assert.ok(["127.0.0.1", "localhost", "[::1]", "::1"].includes(new URL(ENV.DATABASE_URL!).hostname));
    const user = { id: ownerId, name: "Synthetic range owner", email: `${ownerId}@example.test`, role: "user" as const, tokens: 0, createdAt: new Date().toISOString() };
    if (ENV.STORAGE_DRIVER === "postgres") await getPrisma().user.create({ data: user });
    else { getDatabase().users.push(user); persistDatabase(); }
    for (const tokens of [5, 20, 80]) await saveTrueqiaOffer(ownerId, { title: `${prefix} ${tokens}`, description: "Synthetic skill for token filtering", tokens, publicListing: true });
    await saveTrueqiaOffer(ownerId, { title: `${prefix} private`, description: "Private listing remains private", tokens: 20, publicListing: false });
    await client.start();
  });
  after(async () => { await client.stop(); await closePrisma(); });

  it("applies inclusive ranges before catalog pagination and totals", async () => {
    const page = await findTrueqiaOffers(ownerId, { q: prefix, minTokens: "20", maxTokens: "80", limit: "1" });
    assert.equal(page.items.length, 1); assert.equal(page.total, 3); assert.equal(page.hasMore, true);
    assert.ok(page.items[0].tokens! >= 20 && page.items[0].tokens! <= 80);
    const rest = await findTrueqiaOffers(ownerId, { q: prefix, minTokens: 20, maxTokens: 80, offset: 1, limit: 2 });
    assert.equal(rest.items.length, 2); assert.equal(rest.hasMore, false);
    assert.deepEqual(amounts({ items: [...page.items, ...rest.items] }), [20, 20, 80]);
    assert.deepEqual(amounts(await findTrueqiaOffers(ownerId, { q: prefix, minTokens: 20, maxTokens: 20 })), [20, 20]);
  });

  it("accepts zero and one-sided bounds without treating zero as absent", async () => {
    assert.equal((await findTrueqiaOffers(ownerId, { q: prefix, maxTokens: 0 })).total, 0);
    assert.deepEqual(amounts(await findTrueqiaOffers(ownerId, { q: prefix, minTokens: 0, maxTokens: 1000000 })), [5, 20, 20, 80]);
    assert.deepEqual(amounts(await findTrueqiaOffers(ownerId, { q: prefix, minTokens: 21 })), [80]);
    assert.deepEqual(amounts(await findTrueqiaOffers(ownerId, { q: prefix, maxTokens: 19 })), [5]);
  });

  it("uses the same range semantics in public discovery and keeps opt-in protection", async () => {
    const page = await discoverTrueqiaOffers({ q: prefix, minTokens: "20", maxTokens: "80", limit: 1 });
    assert.equal(page.total, 2); assert.equal(page.items.length, 1); assert.equal(page.hasMore, true);
    const next = await discoverTrueqiaOffers({ q: prefix, minTokens: 20, maxTokens: 80, limit: 1, offset: 1 });
    assert.deepEqual(amounts({ items: [...page.items, ...next.items] }), [20, 80]);
    assert.equal((await discoverTrueqiaOffers({ q: prefix, minTokens: 0, maxTokens: 0 })).total, 0);
    assert.equal((await discoverTrueqiaOffers({ q: prefix, minTokens: 0, maxTokens: 1000000 })).total, 3);
  });

  it("rejects negative, fractional, oversized, malformed and reversed ranges in both catalogs", async () => {
    for (const range of [{ minTokens: -1 }, { maxTokens: 1.5 }, { maxTokens: 1000001 }, { minTokens: "" }, { minTokens: true }, { minTokens: ["2"] }, { maxTokens: null }, { minTokens: "abc" }, { minTokens: 21, maxTokens: 20 }]) {
      await assert.rejects(() => findTrueqiaOffers(ownerId, range), /INVALID_FIELDS/);
      await assert.rejects(() => discoverTrueqiaOffers(range), /INVALID_FIELDS/);
    }
  });

  it("returns HTTP 400 for invalid public bounds and the filtered public result otherwise", async () => {
    const invalid = await client.get("/trueqia/discover?minTokens=50&maxTokens=10");
    assert.equal(invalid.status, 400); assert.equal(invalid.body.error, "INVALID_FIELDS");
    const valid = await client.get(`/trueqia/discover?q=${encodeURIComponent(prefix)}&minTokens=20&maxTokens=20`);
    assert.equal(valid.status, 200); assert.deepEqual(amounts(valid.body), [20]);
  });
});
