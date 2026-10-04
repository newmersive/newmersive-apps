const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const express = require("express");
const { setup, proposal } = require("./allwain-pass2-lifecycle.spec.cjs");
const { catalog } = require("./allwain-offer-integrity.spec.cjs");

function source(file, imports) {
  const filename = path.join(__dirname, "..", "src", file);
  const module = { exports: {} };
  const javascript = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }, fileName: filename }).outputText;
  vm.runInNewContext(javascript, { module, exports: module.exports, require: (id) => {
    if (Object.hasOwn(imports, id)) return imports[id];
    if (id === "express") return express;
    if (id.startsWith("node:")) return require(id);
    if (id.startsWith(".")) return {};
    throw new Error(`Unexpected route dependency: ${id}`);
  }, console, Buffer, Date, Error }, { filename });
  return module.exports;
}

async function withApi(input, run) {
  const h = setup({ driver: "json", ...input });
  const auth = source("middleware/auth.middleware.ts", {
    "../services/auth-session.service": { resolveAccessToken: async (token) => {
      if (!["seller", "buyer", "stranger"].includes(token)) throw new Error("INVALID_TOKEN");
      return { id: token, email: `${token}@test.invalid`, role: token === "buyer" ? "user" : "company", sessionId: "isolated", sourceApp: "allwain" };
    } },
  });
  const next = (_req, _res, callback) => callback();
  const router = source("routes/allwain.routes.ts", {
    "../services/allwain.service": h.service,
    "../services/allwain-discovery": h.discovery,
    "../middleware/auth.middleware": auth,
    "../middleware/operation-rate-limit.middleware": { allwainAiRateLimit: next, allwainOcrRateLimit: next },
    "../config/env": { ENV: {} },
  }).default;
  const app = express(); app.use(express.json()); app.use("/allwain", router);
  const server = await new Promise((resolve) => { const listening = app.listen(0, "127.0.0.1", () => resolve(listening)); });
  const base = `http://127.0.0.1:${server.address().port}/allwain`;
  const request = async (route, { actor = "seller", method = "GET", body } = {}) => {
    const response = await fetch(`${base}${route}`, { method, headers: { ...(actor ? { Authorization: `Bearer ${actor}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  try { return await run(request, h); }
  finally { server.closeIdleConnections?.(); await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

describe("Pass 2 actual HTTP routes with isolated storage", () => {
  it("validates discovery at HTTP boundary and exposes authenticated canonical options", async () => {
    await withApi({}, async (request) => {
      assert.equal((await request("/discovery-options", { actor: null })).status, 401);
      const options = await request("/discovery-options", { actor: "buyer" });
      assert.equal(options.status, 200); assert.ok(options.body.categories.some((row) => row.value === "electrodomesticos")); assert.equal(options.body.capabilities.offers.proximity, false);
      for (const [route, expected] of [["/offers?minPrice=oops&unit=kg&currency=EUR", "INVALID_DISCOVERY_PRICE"], ["/offers?minPrice=1", "PRICE_FILTER_REQUIRES_UNIT_CURRENCY"], ["/scan-requests?dateFrom=2026-02-30", "INVALID_DISCOVERY_DATE"], ["/market/requests?latitude=39&radiusKm=10", "INVALID_DISCOVERY_LOCATION"]]) {
        const result = await request(route); assert.equal(result.status, 400); assert.equal(result.body.error, expected);
      }
    });
  });
  it("HTTP pagination cannot reuse a signed cursor after query or account changes", async () => {
    await withApi({ offers: [catalog({ id: "a" }), catalog({ id: "b" })] }, async (request) => {
      const first = await request("/offers?scope=mine&limit=1"); assert.equal(first.status, 200); assert.ok(first.body.pageInfo.nextCursor);
      const cursor = encodeURIComponent(first.body.pageInfo.nextCursor);
      assert.equal((await request(`/offers?scope=mine&limit=1&cursor=${cursor}`)).status, 200);
      for (const [route, actor] of [[`/offers?scope=mine&limit=1&q=naranja&cursor=${cursor}`, "seller"], [`/offers?scope=mine&limit=1&cursor=${cursor}`, "stranger"]]) {
        const result = await request(route, { actor }); assert.equal(result.status, 400); assert.equal(result.body.error, "INVALID_DISCOVERY_CURSOR");
      }
    });
  });
  it("requires valid authentication on withdrawal, editing, histories and agreement lookup", async () => {
    await withApi({}, async (request) => {
      for (const [route, method, body] of [["/offers/proposal-1/withdraw", "POST", {}], ["/offers/proposal-1", "PATCH", { price: 1 }], ["/offers?scope=mine&type=proposal&view=history", "GET"], ["/contracts?scope=buyer&offerId=selected", "GET"]]) {
        const unauthenticated = await request(route, { actor: null, method, body });
        assert.equal(unauthenticated.status, 401); assert.equal(unauthenticated.body.error, "UNAUTHORIZED");
        const invalid = await request(route, { actor: "invalid", method, body });
        assert.equal(invalid.status, 401); assert.equal(invalid.body.error, "INVALID_TOKEN");
      }
    });
  });
  it("returns 404 for another seller and 409 for a proposal selected before withdrawal", async () => {
    await withApi({}, async (request, h) => {
      const foreign = await request("/offers/proposal-1/withdraw", { actor: "stranger", method: "POST", body: {} });
      assert.equal(foreign.status, 404); assert.equal(foreign.body.error, "OFFER_NOT_FOUND");
      h.state.rows.set("proposal-1", { ...h.state.rows.get("proposal-1"), allwainStatus: "selected" });
      const selected = await request("/offers/proposal-1/withdraw", { method: "POST", body: {} });
      assert.equal(selected.status, 409); assert.equal(selected.body.error, "PROPOSAL_LOCKED");
      assert.equal(h.state.writes, 0);
    });
  });
  it("returns withdrawn offer and permits idempotent repeat, rejecting stale version first", async () => {
    await withApi({}, async (request) => {
      const stale = await request("/offers/proposal-1/withdraw", { method: "POST", body: { expectedUpdatedAt: "2026-01-01T00:00:00Z" } });
      assert.equal(stale.status, 409); assert.equal(stale.body.error, "OFFER_VERSION_CONFLICT");
      const invalid = await request("/offers/proposal-1/withdraw", { method: "POST", body: { expectedUpdatedAt: "invalid" } });
      assert.equal(invalid.status, 400); assert.equal(invalid.body.error, "INVALID_OFFER_VERSION");
      const first = await request("/offers/proposal-1/withdraw", { method: "POST", body: { expectedUpdatedAt: "2026-10-04T10:00:00Z" } });
      assert.equal(first.status, 200); assert.equal(first.body.id, "proposal-1"); assert.equal(first.body.allwainStatus, "withdrawn");
      assert.equal((await request("/offers/proposal-1/withdraw", { method: "POST", body: {} })).status, 200);
      const staleAcceptance = await request("/offers/proposal-1/accept", { actor: "buyer", method: "POST", body: { quantity: 1 } });
      assert.equal(staleAcceptance.status, 409); assert.equal(staleAcceptance.body.error, "OFFER_NOT_AVAILABLE");
    });
  });
  it("maps catalog input/version/commitment errors and edits only permitted named fields", async () => {
    await withApi({ offers: [catalog()], contracts: [{ id: "old", app: "allwain", offerId: "catalog-1", requesterUserId: "buyer", providerUserId: "seller", status: "accepted", unitPrice: 2 }] }, async (request, h) => {
      for (const [body, status, error] of [[{ unit: "pack" }, 409, "OFFER_TERMS_LOCKED"], [{ price: 3, expectedUpdatedAt: "2026-01-01T00:00:00Z" }, 409, "OFFER_VERSION_CONFLICT"], [{ price: -1 }, 400, "INVALID_OFFER_PRICE"], [{ price: 3, expectedUpdatedAt: null }, 400, "INVALID_OFFER_VERSION"], [{ status: "" }, 400, "INVALID_OFFER_FIELD"], [{ meta: { archived: false } }, 400, "MISSING_OFFER_FIELDS"]]) {
        const response = await request("/offers/catalog-1", { method: "PATCH", body });
        assert.equal(response.status, status); assert.equal(response.body.error, error);
      }
      const foreign = await request("/offers/catalog-1", { actor: "stranger", method: "PATCH", body: { price: 3 } });
      assert.equal(foreign.status, 404);
      const wrongEndpoint = await request("/offers/catalog-1/withdraw", { method: "POST", body: {} });
      assert.equal(wrongEndpoint.status, 400); assert.equal(wrongEndpoint.body.error, "PROPOSAL_REQUIRED");
      const saved = await request("/offers/catalog-1", { method: "PATCH", body: { price: 3, deliveryEstimate: "Recogida en Foios", expectedUpdatedAt: "2026-10-04T10:00:00Z", meta: { stockQuantity: 1_000 } } });
      assert.equal(saved.status, 200); assert.equal(saved.body.price, 3); assert.equal(saved.body.meta.stockQuantity, 10); assert.equal(saved.body.meta.catalogTermsLocked, true);
      assert.equal(h.state.rows.get("catalog-1").meta.stockQuantity, 10);
    });
  });
  it("filters own catalog/proposal history before pagination and preserves public catalog scope", async () => {
    await withApi({ offers: [catalog(), catalog({ id: "closed", allwainStatus: "closed", meta: { archived: true } }), proposal({ allwainStatus: "withdrawn" }), proposal({ id: "foreign", ownerUserId: "stranger", allwainStatus: "withdrawn" })] }, async (request) => {
      const ownCatalog = await request("/offers?scope=mine&type=catalog&view=history&limit=1");
      assert.equal(ownCatalog.status, 200); assert.deepEqual(ownCatalog.body.items.map((offer) => offer.id), ["closed"]);
      const ownProposal = await request("/offers?scope=mine&type=proposal&view=history&limit=1");
      assert.equal(ownProposal.status, 200); assert.deepEqual(ownProposal.body.items.map((offer) => offer.id), ["proposal-1"]);
      const injectedOwner = await request("/offers?scope=mine&ownerUserId=seller&type=proposal&view=history&limit=1", { actor: "stranger" });
      assert.deepEqual(injectedOwner.body.items.map((offer) => offer.id), ["foreign"]);
      const publicAttempt = await request("/offers?scope=market&type=proposal&view=history&status=withdrawn", { actor: "buyer" });
      assert.equal(publicAttempt.status, 200); assert.deepEqual(publicAttempt.body.items, []);
      const defaultPage = await request("/offers?type=proposal&view=history", { actor: "buyer" });
      assert.deepEqual(defaultPage.body.items.map((offer) => offer.id), ["catalog-1"]);
    });
  });
  it("returns an older selected-offer agreement without exposing another buyer's operation", async () => {
    const base = { app: "allwain", type: "sale", status: "accepted", requesterUserId: "buyer", providerUserId: "seller" };
    const contracts = [{ id: "old", ...base, offerId: "selected", createdAt: "2026-01-01T00:00:00Z" }, ...Array.from({ length: 40 }, (_, index) => ({ id: `new-${index}`, ...base, offerId: `other-${index}`, createdAt: "2026-10-01T00:00:00Z" })), { id: "foreign", ...base, offerId: "selected", requesterUserId: "stranger", createdAt: "2026-10-02T00:00:00Z" }];
    await withApi({ offers: [], contracts }, async (request) => {
      const response = await request("/contracts?scope=buyer&offerId=selected&limit=1", { actor: "buyer" });
      assert.equal(response.status, 200); assert.equal(response.body.items[0].id, "old"); assert.equal(response.body.pageInfo.hasNextPage, false);
    });
  });
});
