const assert = require("node:assert/strict");
const { before, after, beforeEach, describe, it } = require("node:test");
const { PGlite } = require("@electric-sql/pglite");
const { PGLiteSocketServer } = require("@electric-sql/pglite-socket");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const { sourceModules, scalarModelDdl, offer } = require("./allwain-offer-integrity-pglite.spec.cjs");

// This suite runs the current store's Prisma queries and FOR UPDATE statements
// against a new in-memory PostgreSQL engine. It does not load .env or migrations.
describe("Pass 2 lifecycle on isolated PostgreSQL engine", () => {
  let database, server, pool, prisma, store, contracts;
  const proposal = (id, extra = {}) => offer(id, { allwainType: "proposal", requestId: "request-1", proposalRevision: 1, proposalExpiresAt: new Date("2099-01-01T00:00:00Z"), ...extra });
  before(async () => {
    database = await PGlite.create();
    for (const model of ["Offer", "Contract", "AllwainOrder", "AllwainScanRequest", "AllwainShoppingList", "AllwainProposalRevision"]) await database.exec(scalarModelDdl(model));
    await database.exec('CREATE TABLE "User" ("id" text PRIMARY KEY, "name" text NOT NULL, "deletedAt" timestamp(3));');
    await database.query(`INSERT INTO "User" VALUES ('seller','Vendedor',NULL),('buyer','Comprador',NULL);`);
    server = new PGLiteSocketServer({ db: database, host: "127.0.0.1", port: 0, maxConnections: 1 });
    await server.start();
    const port = /^127\.0\.0\.1:(\d+)$/.exec(server.getServerConn());
    assert.ok(port);
    pool = new Pool({ host: "127.0.0.1", port: Number(port[1]), user: "postgres", database: "postgres", max: 1 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    const source = sourceModules(prisma);
    store = source.store; contracts = source.contracts;
  }, { timeout: 30_000 });
  after(async () => { if (prisma) await prisma.$disconnect(); if (pool) await pool.end(); if (server) await server.stop(); if (database) await database.close(); });
  beforeEach(async () => {
    await database.exec('TRUNCATE "Offer", "Contract", "AllwainOrder", "AllwainScanRequest", "AllwainShoppingList", "AllwainProposalRevision";');
    await prisma.allwainScanRequest.create({ data: { id: "request-1", userId: "buyer", sourceType: "manual", title: "Naranjas", description: "Naranjas", status: "submitted", visibility: "public", extracted: {}, offers: [], ai: {} } });
  });
  it("withdraws individual/list proposals atomically, preserves immutable revision, and is idempotent", async () => {
    await prisma.allwainShoppingList.create({ data: { id: "list-1", buyerUserId: "buyer", title: "Mi lista", status: "published" } });
    for (const row of [proposal("request-offer"), proposal("list-offer", { requestId: null, shoppingListId: "list-1" })]) {
      const created = await prisma.offer.create({ data: row });
      const revision = await prisma.allwainProposalRevision.create({ data: { id: `${row.id}-revision`, offerId: row.id, revision: 1, sellerUserId: "seller", requestId: row.requestId, shoppingListId: row.shoppingListId, totalAmount: 200, currency: "EUR", validUntil: new Date("2099-01-01T00:00:00Z"), description: "Precio acordado", deliveryEstimate: "Mañana", payload: { original: true }, snapshotHash: "immutable", status: "current" } });
      const result = await store.withdrawAllwainProposalPg({ offerId: row.id, userId: "seller", expectedUpdatedAt: created.updatedAt.toISOString() });
      assert.equal(result.allwainStatus, "withdrawn");
      const saved = await prisma.allwainProposalRevision.findUnique({ where: { id: revision.id } });
      assert.equal(saved.status, "withdrawn"); assert.equal(saved.snapshotHash, "immutable"); assert.deepEqual(saved.payload, { original: true });
      const snapshot = await prisma.offer.findUnique({ where: { id: row.id } });
      await store.withdrawAllwainProposalPg({ offerId: row.id, userId: "seller", expectedUpdatedAt: created.updatedAt.toISOString() });
      assert.deepEqual(await prisma.offer.findUnique({ where: { id: row.id } }), snapshot);
    }
  });
  it("rejects own stale version, foreign ownership, selected and already contracted proposals without writes", async () => {
    for (const [id, state] of [["active", "active"], ["selected", "selected"], ["contracted", "active"], ["ordered", "active"]]) await prisma.offer.create({ data: proposal(id, { allwainStatus: state }) });
    await prisma.contract.create({ data: { id: "old-contract", app: "allwain", type: "sale", status: "accepted", offerId: "contracted", requesterUserId: "buyer", providerUserId: "seller" } });
    await prisma.allwainOrder.create({ data: { id: "old-order", contractId: "preserved-order-history", offerId: "ordered", buyerUserId: "buyer", sellerUserId: "seller", quantity: 1, unit: "ud", unitPriceAmount: 200, subtotalAmount: 200, platformFeeBps: 1_000, platformFeeAmount: 20, sellerAmount: 180 } });
    for (const [id, input, expected] of [["active", { userId: "other" }, /OFFER_NOT_FOUND/], ["active", { userId: "seller", expectedUpdatedAt: "2026-10-03T10:00:00Z" }, /OFFER_VERSION_CONFLICT/], ["selected", { userId: "seller" }, /PROPOSAL_LOCKED/], ["contracted", { userId: "seller" }, /PROPOSAL_LOCKED/], ["ordered", { userId: "seller" }, /PROPOSAL_LOCKED/]]) {
      const before = await prisma.offer.findUnique({ where: { id } });
      await assert.rejects(store.withdrawAllwainProposalPg({ offerId: id, ...input }), expected);
      assert.deepEqual(await prisma.offer.findUnique({ where: { id } }), before);
    }
  });
  it("rechecks withdrawn status in acceptance transaction and cannot implicitly revise it", async () => {
    const created = await prisma.offer.create({ data: proposal("stale") });
    await store.withdrawAllwainProposalPg({ offerId: created.id, userId: "seller" });
    await assert.rejects(store.createAllwainAgreementWithStockPg({ offerId: created.id, userId: "buyer", quantity: 1, contract: { requestId: "request-1" } }), /OFFER_NOT_AVAILABLE/);
    await assert.rejects(store.upsertAllwainRequestProposalPg({ offer: { ...proposal("replacement"), price: 1 }, requestId: "request-1", sellerUserId: "seller", totalAmount: 100, referenceAmount: null, validUntil: new Date("2099-01-01T00:00:00Z"), deliveryEstimate: "Mañana", snapshotPayload: {} }), /PROPOSAL_NOT_EDITABLE/);
    assert.equal(await prisma.contract.count(), 0);
    assert.equal((await prisma.offer.findUnique({ where: { id: created.id } })).allwainStatus, "withdrawn");
  });
  it("rolls offer and revision back together when audit persistence fails", async () => {
    const created = await prisma.offer.create({ data: proposal("rollback") });
    const revision = await prisma.allwainProposalRevision.create({ data: { id: "rollback-revision", offerId: created.id, revision: 1, sellerUserId: "seller", requestId: "request-1", totalAmount: 200, currency: "EUR", validUntil: new Date("2099-01-01T00:00:00Z"), description: "Precio acordado", deliveryEstimate: "Mañana", payload: {}, snapshotHash: "immutable", status: "current" } });
    const failedStore = sourceModules(prisma, { appendAudit: async () => { throw new Error("AUDIT_WRITE_FAILED"); } }).store;
    await assert.rejects(failedStore.withdrawAllwainProposalPg({ offerId: created.id, userId: "seller" }), /AUDIT_WRITE_FAILED/);
    assert.deepEqual(await prisma.offer.findUnique({ where: { id: created.id } }), created);
    assert.deepEqual(await prisma.allwainProposalRevision.findUnique({ where: { id: revision.id } }), revision);
  });
  it("edits current catalog commercial fields and leaves existing contract price snapshot unchanged", async () => {
    const created = await prisma.offer.create({ data: offer("catalog") });
    const contract = await prisma.contract.create({ data: { id: "old-contract", app: "allwain", type: "sale", status: "accepted", offerId: "catalog", unitPrice: 2, subtotalAmount: 2_000 } });
    await assert.rejects(store.updateAllwainOfferDetailsPg({ offerId: "catalog", userId: "seller", allowAnyOwner: false, unit: "pack" }), /OFFER_TERMS_LOCKED/);
    await store.updateAllwainOfferDetailsPg({ offerId: "catalog", userId: "seller", allowAnyOwner: false, price: 3, deliveryEstimate: "Recogida en Foios", shippingWeightKgPerUnit: 2, expectedUpdatedAt: created.updatedAt.toISOString() });
    assert.deepEqual(await prisma.contract.findUnique({ where: { id: contract.id } }), contract);
    await assert.rejects(store.updateAllwainOfferDetailsPg({ offerId: "catalog", userId: "seller", allowAnyOwner: false, price: 4, expectedUpdatedAt: created.updatedAt.toISOString() }), /OFFER_VERSION_CONFLICT/);
  });
  it("filters own proposal/catalog history with SQL before page limit; market cannot enumerate proposals", async () => {
    for (const row of [offer("a-active"), offer("b-closed", { allwainStatus: "closed", meta: { archived: true } }), proposal("c-withdrawn", { allwainStatus: "withdrawn" }), proposal("z-foreign", { ownerUserId: "other", allwainStatus: "withdrawn" })]) await prisma.offer.create({ data: row });
    assert.equal((await store.getAllwainOfferPagePg({ ownerUserId: "seller", type: "proposal", view: "history", limit: 1 })).items[0].id, "c-withdrawn");
    assert.equal((await store.getAllwainOfferPagePg({ ownerUserId: "seller", type: "catalog", view: "history", limit: 1 })).items[0].id, "b-closed");
    assert.equal((await store.getAllwainOfferPagePg({ type: "proposal", view: "history", limit: 30 })).items.length, 1);
    assert.equal((await store.getAllwainOfferPagePg({ ownerUserId: "seller", type: "proposal", view: "active", limit: 1 })).items.length, 0);
  });
  it("finds an older existing agreement by offer before limiting and cannot read another buyer's agreement", async () => {
    const base = { app: "allwain", type: "sale", status: "accepted", requesterUserId: "buyer", providerUserId: "seller" };
    await prisma.contract.createMany({ data: [
      { id: "old", ...base, offerId: "selected-offer", createdAt: new Date("2026-01-01T00:00:00Z") },
      ...Array.from({ length: 40 }, (_, index) => ({ id: `new-${index}`, ...base, offerId: `other-${index}`, createdAt: new Date("2026-10-01T00:00:00Z") })),
      { id: "foreign", ...base, offerId: "selected-offer", requesterUserId: "other", createdAt: new Date("2026-10-02T00:00:00Z") },
    ] });
    const page = await contracts.getAllwainContractPagePg("buyer", { offerId: "selected-offer", scope: "buyer", limit: 1 });
    assert.equal(page.items[0].id, "old"); assert.equal(page.pageInfo.hasNextPage, false);
    assert.equal((await contracts.getAllwainContractPagePg("stranger", { offerId: "selected-offer", scope: "buyer", limit: 1 })).items.length, 0);
  });
});
