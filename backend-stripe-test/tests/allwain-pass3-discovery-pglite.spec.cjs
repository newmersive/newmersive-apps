const assert = require("node:assert/strict");
const { before, after, beforeEach, describe, it } = require("node:test");
const { PGlite } = require("@electric-sql/pglite");
const { PGLiteSocketServer } = require("@electric-sql/pglite-socket");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const { sourceModules, scalarModelDdl, offer } = require("./allwain-offer-integrity-pglite.spec.cjs");

// Actual current Prisma queries, no env, no external database, no migrations.
describe("Pass 3 discovery on fresh in-memory PostgreSQL", () => {
  let db, server, pool, prisma, source, lists, payments;
  before(async () => {
    db = await PGlite.create();
    for (const model of ["Offer", "Contract", "AllwainOrder", "AllwainPayment", "AllwainScanRequest", "AllwainShoppingList", "AllwainShoppingListItem"]) await db.exec(scalarModelDdl(model));
    await db.exec('CREATE TABLE "User" ("id" text PRIMARY KEY,"name" text NOT NULL,"deletedAt" timestamp(3));');
    await db.query(`INSERT INTO "User" VALUES ('buyer','Comprador',NULL),('seller','Vendedor',NULL),('other','Otro',NULL);`);
    server = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 0, maxConnections: 1 }); await server.start();
    const port = /^127\.0\.0\.1:(\d+)$/.exec(server.getServerConn()); assert.ok(port);
    pool = new Pool({ host: "127.0.0.1", port: Number(port[1]), user: "postgres", database: "postgres", max: 1 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    source = sourceModules(prisma, { realModels: ["allwainScanRequest"], stubs: { "./allwain-shopping-list-awards": { ALLWAIN_OPEN_SHOPPING_LIST_STATUSES: ["published", "partially_awarded"], listActiveAllwainShoppingListAwardLines: async () => [] } } });
    lists = source.load("allwain-shopping-lists.service"); payments = source.load("allwain-payments.service");
  }, { timeout: 30_000 });
  after(async () => { if (prisma) await prisma.$disconnect(); if (pool) await pool.end(); if (server) await server.stop(); if (db) await db.close(); });
  beforeEach(async () => { await db.exec('TRUNCATE "Offer","Contract","AllwainOrder","AllwainPayment","AllwainScanRequest","AllwainShoppingList","AllwainShoppingListItem";'); });
  const request = (id, extra = {}) => ({ id, userId: "buyer", title: "Lavadora", description: "", sourceType: "manual", status: "submitted", visibility: "public", extracted: { targetPrice: 450 }, offers: [], ai: {}, category: "Hogar", productKind: "appliance", unit: "ud", currency: "EUR", createdAt: new Date("2026-01-01T10:00:00Z"), ...extra });
  const order = (id, extra = {}) => ({ id, contractId: `contract-${id}`, offerId: "product", buyerUserId: "buyer", sellerUserId: "seller", quantity: 1, unit: "ud", unitPriceAmount: 45000, subtotalAmount: 45000, platformFeeBps: 1000, platformFeeAmount: 4500, sellerAmount: 40500, status: "paid", paymentStatus: "paid", fulfillmentStatus: "ready", deliveryChannel: "pickup", createdAt: new Date("2026-01-01T10:00:00Z"), ...extra });
  it("finds catalog after 1,000 irrelevant rows using SQL filters and legacy taxonomy before limit", async () => {
    await prisma.offer.createMany({ data: [...Array.from({ length: 1_000 }, (_, index) => offer(`orange-${index}`, { category: "alimentacion", unit: "kg", currency: "EUR", price: 2 })), offer("washer", { title: "Lavadora", description: "", category: "Hogar", subcategory: "lavadora", unit: "unidad", currency: "EUR", productKind: "appliance", price: 450, createdAt: new Date("2026-01-01T10:00:00Z") })] });
    const page = await source.store.getAllwainOfferPagePg({ limit: 1, category: "electrodomesticos", subcategory: "lavadoras", unit: "ud", currency: "EUR", minPrice: 400, maxPrice: 500 });
    assert.deepEqual(Array.from(page.items, (row) => row.id), ["washer"]); assert.equal(page.pageInfo.hasNextPage, false);
  });
  it("pages equal timestamps and equal prices with unique ids, rejecting wrong filters and actor", async () => {
    await prisma.offer.createMany({ data: ["a", "b", "c"].map((id) => offer(id, { unit: "kg", currency: "EUR", price: 2 })) });
    for (const sort of ["newest", "price_asc", "price_desc"]) {
      const input = { limit: 1, unit: "kg", currency: "EUR", sort }, all = [];
      let page = await source.store.getAllwainOfferPagePg(input);
      while (true) { all.push(page.items[0].id); if (!page.pageInfo.nextCursor) break; page = await source.store.getAllwainOfferPagePg({ ...input, cursor: page.pageInfo.nextCursor }); }
      assert.equal(new Set(all).size, 3); assert.equal(all.length, 3);
      const first = await source.store.getAllwainOfferPagePg(input);
      await assert.rejects(source.store.getAllwainOfferPagePg({ ...input, cursor: first.pageInfo.nextCursor, query: "naranja" }), /INVALID_DISCOVERY_CURSOR/);
      await assert.rejects(source.store.getAllwainOfferPagePg({ ...input, cursor: first.pageInfo.nextCursor, ownerUserId: "seller" }), /INVALID_DISCOVERY_CURSOR/);
    }
  });
  it("intersects own active/history view with exact status and never exposes another owner's proposals", async () => {
    await prisma.offer.createMany({ data: [offer("active"), offer("legacy-active", { allwainStatus: null }), offer("closed", { allwainStatus: "closed" }), offer("private", { allwainType: "proposal", ownerUserId: "other", requestId: "private-request" })] });
    assert.equal((await source.store.getAllwainOfferPagePg({ limit: 1, ownerUserId: "seller", view: "history", status: "active" })).items.length, 0);
    assert.equal((await source.store.getAllwainOfferPagePg({ limit: 1, ownerUserId: "seller", view: "active", status: "closed" })).items.length, 0);
    assert.equal((await source.store.getAllwainOfferPagePg({ limit: 30 })).items.some((row) => row.id === "private"), false);
    assert.deepEqual(Array.from((await source.store.getAllwainOfferPagePg({ limit: 30, status: "active" })).items, (row) => row.id).sort(), ["active", "legacy-active"]);
  });
  it("scan SQL price/reference, aliases, exact date range and zone find an older request", async () => {
    await prisma.allwainScanRequest.createMany({ data: [...Array.from({ length: 1_000 }, (_, i) => request(`orange-${i}`, { title: "Naranjas", category: "alimentacion", productKind: "produce_weight", unit: "kg", createdAt: new Date("2026-10-04") })), request("wanted", { locationLabel: "Foios", locationLatApprox: 39.538, locationLngApprox: -0.357 })] });
    const page = await source.store.getAllwainScanRequestPagePg({ userId: "buyer", limit: 1, category: "electrodomesticos", unit: "ud", currency: "EUR", minPrice: 400, maxPrice: 500, dateFrom: "2026-01-01", dateTo: "2026-01-01", locationLabel: "Foios", latitude: 39.538, longitude: -0.357, radiusKm: 1 });
    assert.equal(page.items[0].id, "wanted"); assert.equal(page.pageInfo.hasNextPage, false);
    assert.equal((await source.store.getAllwainScanRequestPagePg({ userId: "other", limit: 1 })).items.length, 0);
  });
  it("market response state is seller-specific and evaluated before limiting requests", async () => {
    await prisma.allwainScanRequest.createMany({ data: ["none", "active", "expired", "withdrawn", "foreign"].map((id) => request(id)) });
    await prisma.offer.createMany({ data: [offer("p-active", { allwainType: "proposal", requestId: "active", proposalExpiresAt: new Date("2099-01-01") }), offer("p-expired", { allwainType: "proposal", requestId: "expired", proposalExpiresAt: new Date("2020-01-01") }), offer("p-withdrawn", { allwainType: "proposal", requestId: "withdrawn", allwainStatus: "withdrawn" }), offer("p-foreign", { allwainType: "proposal", requestId: "foreign", ownerUserId: "other" })] });
    for (const [responseStatus, expected] of [["active", "active"], ["expired", "expired"], ["withdrawn", "withdrawn"]]) {
      const page = await source.store.getAllwainScanRequestPagePg({ limit: 1, excludeUserId: "seller", sellerResponseUserId: "seller", responseStatus });
      assert.equal(page.items[0].id, expected); assert.equal(page.pageInfo.hasNextPage, false);
    }
    const noResponse = await source.store.getAllwainScanRequestPagePg({ limit: 20, excludeUserId: "seller", sellerResponseUserId: "seller", responseStatus: "none" });
    assert.deepEqual(Array.from(noResponse.items, (row) => row.id).sort(), ["foreign", "none"]);
    const anyResponse = await source.store.getAllwainScanRequestPagePg({ limit: 20, excludeUserId: "seller", sellerResponseUserId: "seller", responseStatus: "any" });
    assert.deepEqual(Array.from(anyResponse.items, (row) => row.id).sort(), ["active", "expired", "withdrawn"]);
  });
  it("contracts intersect participant/payment/fulfillment/channel/date before pagination, including order-id search", async () => {
    await prisma.contract.createMany({ data: [{ id: "contract-wanted", app: "allwain", type: "sale", status: "accepted", offerTitle: "Lavadora", requesterName: "Comprador", providerName: "Vendedor", requesterUserId: "buyer", providerUserId: "seller", paymentStatus: "paid", deliveryChannel: "pickup", createdAt: new Date("2026-01-01T10:00:00Z") }, ...Array.from({ length: 1_000 }, (_, index) => ({ id: `newer-${index}`, app: "allwain", type: "sale", status: "accepted", requesterUserId: "buyer", providerUserId: "seller", paymentStatus: "paid", createdAt: new Date("2026-10-04") })), { id: "foreign", app: "allwain", type: "sale", status: "accepted", requesterUserId: "other", providerUserId: "other", paymentStatus: "paid" }] });
    await prisma.allwainOrder.createMany({ data: [order("wanted"), order("foreign", { contractId: "foreign", buyerUserId: "other", sellerUserId: "other" })] });
    const input = { limit: 1, scope: "buyer", paymentStatuses: ["paid"], fulfillmentStatuses: ["ready"], deliveryChannel: "pickup", dateFrom: "2026-01-01", dateTo: "2026-01-01", query: "wanted" };
    const result = await source.contracts.getAllwainContractPagePg("buyer", input);
    assert.equal(result.items[0].id, "contract-wanted"); assert.equal(result.pageInfo.hasNextPage, false);
    assert.equal((await source.contracts.getAllwainContractPagePg("other", { ...input, offerId: "no-offer" })).items.length, 0);
  });
  it("orders search frozen contract title/names and intersect payment/fulfillment before page limit", async () => {
    await prisma.contract.create({ data: { id: "contract-wanted", app: "allwain", type: "sale", status: "accepted", requesterUserId: "buyer", providerUserId: "seller", offerTitle: "Lavadora acordada", requesterName: "Paco Rausell" } });
    await prisma.allwainOrder.createMany({ data: [order("wanted"), ...Array.from({ length: 1_000 }, (_, index) => order(`newer-${index}`, { fulfillmentStatus: "pending", createdAt: new Date("2026-10-04") }))] });
    const result = await payments.listAllwainOrderPageForUser("buyer", { limit: 1, scope: "buyer", query: "Rausell", paymentStatuses: ["paid"], fulfillmentStatuses: ["ready"], dateFrom: "2026-01-01", dateTo: "2026-01-01" });
    assert.equal(result.items[0].id, "wanted"); assert.equal(result.pageInfo.hasNextPage, false);
    assert.equal((await payments.listAllwainOrderPageForUser("other", { limit: 1, query: "Rausell" })).items.length, 0);
  });
  it("lists filter item taxonomy, price, zone, deadlines, channel and response before limit", async () => {
    await prisma.allwainShoppingList.createMany({ data: [{ id: "wanted", buyerUserId: "buyer", title: "Compra de hogar", status: "published", visibility: "public", currency: "EUR", locationLabel: "Foios", locationLatApprox: 39.538, locationLngApprox: -0.357, preferredDeliveryChannel: "pickup", proposalDeadlineAt: new Date("2099-01-02T16:00:00Z"), createdAt: new Date("2026-01-01") }, ...Array.from({ length: 1_000 }, (_, index) => ({ id: `unrelated-${index}`, buyerUserId: "buyer", title: "Otra lista", status: "published", visibility: "public", createdAt: new Date("2026-10-04") }))] });
    await prisma.allwainShoppingListItem.create({ data: { id: "item", shoppingListId: "wanted", position: 1, productName: "Lavadora", category: "Hogar", subcategory: "lavadora", quantity: 1, unit: "unidad", targetUnitPriceAmount: 45000 } });
    const filters = { limit: 1, category: "electrodomesticos", subcategory: "lavadoras", unit: "ud", currency: "EUR", minPrice: 400, maxPrice: 500, locationLabel: "Foios", deliveryChannel: "pickup", latitude: 39.538, longitude: -0.357, radiusKm: 1, proposalDeadlineBefore: "2099-01-02", proposalDeadlineAfter: "2099-01-01", responseStatus: "none" };
    const page = await lists.listAllwainShoppingListMarket("seller", filters);
    assert.equal(page.items[0].id, "wanted"); assert.equal(page.pageInfo.hasNextPage, false);
    assert.equal((await lists.listMyAllwainShoppingLists("other", { limit: 1, category: "electrodomesticos" })).items.length, 0);
  });
  it("agreement state keeps its associated order even when their state vocabularies differ", async () => {
    await prisma.contract.createMany({ data: ["accepted", "draft", "partially_accepted", "rejected"].map((status) => ({ id: `contract-${status}`, app: "allwain", type: "sale", status, requesterUserId: "buyer", providerUserId: "seller" })) });
    await prisma.allwainOrder.createMany({ data: ["accepted", "draft", "partially_accepted", "rejected"].map((id) => order(id, { status: "awaiting_seller", paymentStatus: "not_started", fulfillmentStatus: "pending" })) });
    const accepted = await payments.listAllwainOrderPageForUser("buyer", { limit: 1, contractStatuses: ["accepted"] });
    assert.equal(accepted.items[0].id, "accepted"); assert.equal(accepted.items[0].status, "awaiting_seller");
    const pending = await payments.listAllwainOrderPageForUser("buyer", { limit: 30, contractStatuses: ["new"] });
    assert.deepEqual(Array.from(pending.items, (row) => row.id).sort(), ["draft", "partially_accepted"]);
    assert.deepEqual(Array.from((await source.contracts.getAllwainContractPagePg("buyer", { limit: 30, contractStatuses: ["new"] })).items, (row) => row.id).sort(), ["contract-draft", "contract-partially_accepted"]);
    assert.equal((await payments.listAllwainOrderPageForUser("buyer", { limit: 1, contractStatuses: ["accepted"], statuses: ["paid"] })).items.length, 0);
    assert.equal((await payments.listAllwainOrderPageForUser("other", { limit: 1, contractStatuses: ["accepted"] })).items.length, 0);
  });
  it("agreement dates retain a later-created order and preserve legacy order-date filtering", async () => {
    await prisma.contract.createMany({ data: [{ id: "contract-wanted", app: "allwain", type: "sale", status: "accepted", requesterUserId: "buyer", providerUserId: "seller", createdAt: new Date("2026-09-20T12:00:00Z") }, { id: "contract-october", app: "allwain", type: "sale", status: "accepted", requesterUserId: "buyer", providerUserId: "seller", createdAt: new Date("2026-10-01T12:00:00Z") }] });
    await prisma.allwainOrder.createMany({ data: [order("wanted", { createdAt: new Date("2026-10-02T12:00:00Z") }), order("october", { createdAt: new Date("2026-10-03T12:00:00Z") })] });
    const contracts = await source.contracts.getAllwainContractPagePg("buyer", { limit: 1, dateFrom: "2026-09-01", dateTo: "2026-09-30" });
    assert.equal(contracts.items[0].id, "contract-wanted");
    const orders = await payments.listAllwainOrderPageForUser("buyer", { limit: 1, contractDateFrom: "2026-09-01", contractDateTo: "2026-09-30" });
    assert.equal(orders.items[0].id, "wanted"); assert.equal(orders.pageInfo.hasNextPage, false);
    assert.equal((await payments.listAllwainOrderPageForUser("buyer", { limit: 1, dateFrom: "2026-09-01", dateTo: "2026-09-30" })).items.length, 0);
    assert.equal((await payments.listAllwainOrderPageForUser("buyer", { limit: 1, dateFrom: "2026-10-01", dateTo: "2026-10-31", contractDateFrom: "2026-09-01", contractDateTo: "2026-09-30" })).items[0].id, "wanted");
    assert.equal((await payments.listAllwainOrderPageForUser("other", { limit: 1, contractDateFrom: "2026-09-01", contractDateTo: "2026-09-30" })).items.length, 0);
    await assert.rejects(payments.listAllwainOrderPageForUser("buyer", { limit: 1, contractDateFrom: "2026-10-01", contractDateTo: "2026-09-30" }), /INVALID_DISCOVERY_DATE/);
  });
});
