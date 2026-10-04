import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, afterEach, describe, it, mock } from "node:test";
import { Prisma } from "@prisma/client";

// This suite never loads project .env or data/database.json and never opens a DB.
const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "allwain-publication-policy-"));
const scratchFile = path.join(scratchDir, "fixture.json");
const originalProcessEnv = {
  NODE_ENV: process.env.NODE_ENV,
  STORAGE_DRIVER: process.env.STORAGE_DRIVER,
  DATA_FILE: process.env.DATA_FILE,
};
process.env.NODE_ENV = "test";
process.env.STORAGE_DRIVER = "json";
process.env.DATA_FILE = scratchFile;
fs.writeFileSync(scratchFile, "{}");
const dotenvConfig = mock.method(require("dotenv"), "config", () => ({ parsed: {} }));
const { ENV } = require("../src/config/env") as typeof import("../src/config/env");
const db = require("../src/db/prisma") as typeof import("../src/db/prisma");
const store = require("../src/services/data.store") as typeof import("../src/services/data.store");
const audit = require("../src/services/allwain-audit") as typeof import("../src/services/allwain-audit");
const { searchAllwain } = require("../src/services/allwain-search.service") as typeof import("../src/services/allwain-search.service");
const { deleteAllwainAccount } = require("../src/services/allwain-account.service") as typeof import("../src/services/allwain-account.service");
const { allwainPublicCatalogWhere, isPublicCatalogOffer } = require("../src/services/allwain-publication-policy") as typeof import("../src/services/allwain-publication-policy");
dotenvConfig.mock.restore();
const originalDriver = ENV.STORAGE_DRIVER;

afterEach(() => { mock.restoreAll(); ENV.STORAGE_DRIVER = originalDriver; });
after(() => {
  for (const [key, value] of Object.entries(originalProcessEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.unlinkSync(scratchFile);
  fs.rmdirSync(scratchDir);
});

function fixtures() {
  const users: any[] = ["buyer", "seller", "stranger"].map((id) => ({
    id, name: `${id} Manzana`, email: `${id}@example.test`, role: "user", deletedAt: null,
    createdAt: "2026-10-01T00:00:00.000Z", passwordHash: "private-password",
  }));
  const base = {
    owner: "allwain", ownerUserId: "seller", title: "Manzana pública", description: "Fruta local",
    allwainType: "catalog", allwainStatus: "active", requestId: null, shoppingListId: null,
    price: 2, currency: "EUR", unit: "kg", category: "alimentacion", subcategory: "fruta",
    productKind: "goods", locationLabel: "Valencia", commercialModel: "marketplace",
    createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
  };
  const secretMeta = {
    unit: "kg", inventoryManaged: true, stockQuantity: 10, availableQuantity: 7,
    reservedQuantity: 1, soldQuantity: 2, minQuantity: 1, quantityStep: 1,
    imageUrl: "https://cdn.example.test/apple.jpg", imageSource: "original", imageAlt: "Manzana",
    privateNotes: "Condición privada", shoppingListItems: [{ notes: "Nota del comprador" }],
    internalReconciliation: { amount: 1234 },
    deliveryPricing: {
      currency: "EUR", privateAddress: "Calle privada",
      localConnector: { available: true, amount: 200, privatePhone: "private" },
      pickup: { available: true, amount: 0, privateContact: "private" },
      seller: { available: true }, carrier: { available: false, privateCredential: "private" },
    },
  };
  const offers: any[] = [
    { ...base, id: "scan-proposal", requestId: "request-buyer", allwainType: "proposal", meta: { requestId: "request-buyer", privateNotes: "private" } },
    { ...base, id: "list-proposal", shoppingListId: "list-buyer", allwainType: "proposal", meta: { shoppingListItems: [{ notes: "private" }] } },
    { ...base, id: "legacy-scan", allwainType: null, meta: { requestId: "request-buyer" } },
    { ...base, id: "legacy-list", allwainType: null, meta: { shoppingListId: "list-buyer", shoppingListItems: [{ notes: "private" }] } },
    { ...base, id: "detached-proposal", allwainType: "proposal", meta: {} },
    { ...base, id: "legacy-type-proposal", allwainType: null, meta: { allwainType: "proposal" } },
    { ...base, id: "legacy-kind-proposal", allwainType: null, meta: { proposalKind: "shopping_list" } },
    ...["paused", "closed", "sold_out", "withdrawn", "archived"].map((status) => ({ ...base, id: status, allwainStatus: status, meta: {} })),
    { ...base, id: "meta-archived", meta: { archived: true } },
    { ...base, id: "meta-status-archived", meta: { status: "archived" } },
    { ...base, id: "legacy-paused", allwainStatus: null, meta: { status: "paused" } },
    { ...base, id: "seller-public", meta: secretMeta, tokens: 999, futurePrivateColumn: "private" },
    { ...base, id: "buyer-public", ownerUserId: "buyer", meta: {} },
    { ...base, id: "legacy-public", allwainType: null, allwainStatus: null, meta: null },
    { ...base, id: "empty-meta-public", allwainType: null, allwainStatus: null, meta: {} },
    { ...base, id: "trueqia-public", owner: "trueqia", meta: {} },
  ];
  const requests: any[] = [{
    id: "request-buyer", userId: "buyer", title: "Manzana solicitada", description: "Quiero fruta",
    status: "submitted", visibility: "public", category: "alimentacion", unit: "kg", currency: "EUR",
    extracted: { productName: "Manzana", quantity: 2, targetPrice: 3, rawText: "DNI privado", attributes: [{ privateNotes: "private" }], deliveryWindow: { privateAddress: "private" } },
    imageMeta: { url: "https://cdn.example.test/request.jpg", source: "original", hasImage: true, privateOriginalPath: "private" },
    createdAt: base.createdAt,
  }, { id: "request-seller", userId: "seller", title: "Manzana solicitada", description: "Fruta", status: "submitted", visibility: "public", extracted: {}, imageMeta: { url: "https://cdn.example.test/receipt.jpg", source: "captured", hasImage: true }, createdAt: base.createdAt },
  { id: "private-request", userId: "buyer", title: "Manzana privada", description: "private", status: "submitted", visibility: "private", extracted: {} }];
  const products: any[] = [{ id: "product", name: "Manzana", visibility: "public", description: "Fruta", futurePrivateColumn: "private", ean: "internal-barcode" }, { id: "private-product", name: "Manzana", visibility: "internal_test" }];
  return { users, offers, requests, products };
}

// A small independent evaluator applies the actual Prisma query emitted by the
// source service; no hardcoded catalog policy lives in this database mock.
function matchesValue(value: any, condition: any): boolean {
  if (condition === Prisma.DbNull || condition === Prisma.AnyNull || condition === Prisma.JsonNull) return value == null;
  if (condition === null || typeof condition !== "object") return (value ?? null) === condition;
  if (condition.path) {
    const nested = condition.path.reduce((entry: any, key: string) => entry?.[key], value);
    return matchesValue(nested, Object.fromEntries(Object.entries(condition).filter(([key]) => key !== "path")));
  }
  if ("equals" in condition && !matchesValue(value, condition.equals)) return false;
  if ("not" in condition && matchesValue(value, condition.not)) return false;
  if (condition.in && !condition.in.includes(value ?? null)) return false;
  if (condition.notIn && condition.notIn.includes(value ?? null)) return false;
  if (condition.contains !== undefined && !String(value ?? "").toLowerCase().includes(String(condition.contains).toLowerCase())) return false;
  return true;
}

function matches(row: any, where: any): boolean {
  return !where || Object.entries(where).every(([key, condition]: [string, any]) => {
    if (key === "AND") return (Array.isArray(condition) ? condition : [condition]).every((part) => matches(row, part));
    if (key === "OR") return condition.some((part: any) => matches(row, part));
    if (key === "NOT") return (Array.isArray(condition) ? condition : [condition]).every((part) => !matches(row, part));
    return matchesValue(row[key], condition);
  });
}

function findMany(rows: any[], input: any = {}) {
  return rows.filter((row) => matches(row, input.where)).slice(0, input.take ?? rows.length)
    .map((row) => input.select
      ? Object.fromEntries(Object.entries(input.select).filter(([, selected]) => selected).map(([key]) => [key, row[key]]))
      : { ...row });
}

function fakePrisma(state: ReturnType<typeof fixtures>) {
  return {
    offer: { findMany: async (input: any) => findMany(state.offers, input) },
    user: { findMany: async (input: any) => findMany(state.users, input) },
    allwainScanRequest: { findMany: async (input: any) => findMany(state.requests, input) },
    product: { findMany: async (input: any) => findMany(state.products, input) },
    allwainSellerProfile: { findMany: async () => [] },
    allwainReputation: { findMany: async () => [{ userId: "seller", averageRating: 4.7, reviewCount: 3, completedOrders: 4 }] },
  };
}

function prepare(driver: "json" | "postgres", state = fixtures()) {
  ENV.STORAGE_DRIVER = driver;
  const prisma = fakePrisma(state);
  mock.method(db, "getPrisma", () => {
    assert.equal(driver, "postgres", "JSON search must not connect to PostgreSQL");
    return prisma as any;
  });
  if (driver === "json") {
    fs.writeFileSync(scratchFile, JSON.stringify({ users: state.users, offers: state.offers, products: state.products, allwainScanRequests: state.requests }));
    store.loadDatabase();
  }
  return state;
}

describe("Allwain public publication visibility", () => {
  for (const driver of ["json", "postgres"] as const) {
    it(`${driver}: buyer, seller and stranger never discover private proposals or withdrawn publications`, async () => {
      prepare(driver);
      for (const userId of ["buyer", "seller", "stranger"]) {
        const result = await searchAllwain({ userId, query: "Manzana", limit: 20 });
        const expected = userId === "seller" ? ["buyer-public"]
          : userId === "buyer" ? ["seller-public", "legacy-public", "empty-meta-public"]
          : ["seller-public", "buyer-public", "legacy-public", "empty-meta-public"];
        assert.deepEqual(result.offers.map((row) => row.id).sort(), expected.sort());
        assert.deepEqual(result.requests.map((row) => row.id).sort(), ["request-buyer", "request-seller"]);
        assert.deepEqual(result.products.map((row) => row.id), ["product"]);
      }
      const page = await searchAllwain({ userId: "stranger", query: "Manzana", limit: 1 });
      assert.equal(page.offers.length, 1, "private rows must be excluded before take");
      assert.equal(page.offers[0].id, "seller-public");
    });

    it(`${driver}: positive DTO strips current and future private fields while preserving purchase/card data`, async () => {
      prepare(driver);
      const result = await searchAllwain({ userId: "stranger", query: "Manzana", limit: 20 });
      const offer = result.offers.find((row) => row.id === "seller-public")!;
      assert.equal(offer.price, 2);
      assert.equal(offer.unit, "kg");
      assert.equal(offer.meta.availableQuantity, 7);
      assert.equal(offer.meta.minQuantity, 1);
      assert.equal(offer.meta.imageUrl, "https://cdn.example.test/apple.jpg");
      assert.equal(offer.meta.deliveryPricing?.localConnector.amount, 200);
      for (const key of ["tokens", "futurePrivateColumn", "requestId", "shoppingListId", "proposalRevision"]) assert.equal(key in offer, false, key);
      for (const key of ["shoppingListItems", "privateNotes", "internalReconciliation", "reservedQuantity", "soldQuantity", "stockQuantity"]) assert.equal(key in offer.meta, false, key);
      assert.equal("passwordHash" in offer.provider, false);
      assert.equal("privateAddress" in offer.meta.deliveryPricing!, false);
      assert.equal("privatePhone" in offer.meta.deliveryPricing!.localConnector, false);
      const request = result.requests.find((row) => row.id === "request-buyer")!;
      assert.equal(request.extracted.quantity, 2);
      assert.equal(request.extracted.targetPrice, 3);
      for (const key of ["rawText", "attributes", "deliveryWindow"]) assert.equal(key in request.extracted, false, key);
      assert.equal("privateOriginalPath" in request.imageMeta, false);
      assert.notEqual(request.imageMeta.url, "https://cdn.example.test/request.jpg");
      assert.equal(request.imageMeta.hasImage, false);
      assert.equal(request.imageMeta.illustrative, true);
      const capturedRequest = result.requests.find((row) => row.id === "request-seller")!;
      assert.notEqual(capturedRequest.imageMeta.url, "https://cdn.example.test/receipt.jpg");
      assert.equal(capturedRequest.imageMeta.illustrative, true);
      assert.equal(capturedRequest.imageMeta.hasImage, false);
      assert.equal("futurePrivateColumn" in result.products[0], false);
      assert.equal("ean" in result.products[0], false);
    });

    it(`${driver}: deleted sellers disappear even when their old offers remain active`, async () => {
      const state = fixtures();
      state.users.find((user) => user.id === "seller").deletedAt = new Date("2026-10-04T00:00:00.000Z");
      prepare(driver, state);
      const result = await searchAllwain({ userId: "stranger", query: "Manzana", limit: 20 });
      assert.deepEqual(result.offers.map((row) => row.id), ["buyer-public"]);
      assert.deepEqual(result.requests.map((row) => row.id), ["request-buyer"]);
    });
  }

  it("shared JSON and Prisma policy agree on the same structured and legacy fixtures", () => {
    const state = fixtures();
    const where = allwainPublicCatalogWhere(["buyer"]);
    for (const offer of state.offers) {
      const owner = state.users.find((user) => user.id === offer.ownerUserId);
      const publicOwner = owner?.id === "buyer" ? { deletedAt: "2026-10-04" } : owner;
      assert.equal(matches(offer, where), isPublicCatalogOffer(offer, publicOwner || null), offer.id);
    }
    assert.equal(isPublicCatalogOffer(state.offers.find((row) => row.id === "seller-public"), null), false);
  });
});

describe("Allwain account deletion archives locked publications", () => {
  function accountFixture(openOrders = 0, beforeOfferLock?: (state: ReturnType<typeof fixtures>) => void) {
    const state = fixtures();
    ENV.STORAGE_DRIVER = "postgres";
    let locked = false;
    let writes = 0;
    const histories = [{ id: "contract-history", acceptedRevision: 2 }, { id: "order-history", status: "completed", amount: 400 }];
    const originalHistories = structuredClone(histories);
    const adminMfaRows = [{ userId: "seller", enrolled: true }, { userId: "buyer", pending: true }];
    const originalAdminMfaRows = structuredClone(adminMfaRows);
    const adminMfaDeleteCalls: Array<{ userId: string }> = [];
    const cleanup = { deleteMany: async () => ({ count: 0 }), updateMany: async () => ({ count: 0 }) };
    const tx: any = {
      $executeRaw: async () => 1,
      $queryRaw: async () => { beforeOfferLock?.(state); locked = true; return state.offers.filter((row) => row.owner === "allwain" && row.ownerUserId === "seller").map(({ id, meta }) => ({ id, meta })); },
      user: {
        findUnique: async () => state.users.find((user) => user.id === "seller"),
        update: async ({ data }: any) => { writes++; Object.assign(state.users.find((user) => user.id === "seller"), data); return {}; },
      },
      allwainOrder: { count: async () => { assert.equal(locked, true, "check open orders after locking offers"); return openOrders; } },
      trade: { count: async () => 0 },
      offer: { update: async ({ where, data }: any) => { assert.equal(locked, true); writes++; Object.assign(state.offers.find((row) => row.id === where.id), data); return {}; } },
      allwainSupportTicket: { findMany: async () => [] },
      adminMfa: { deleteMany: async ({ where }: { where: { userId: string } }) => {
        assert.equal(locked, true, "erase MFA only after locking account publications");
        adminMfaDeleteCalls.push(structuredClone(where));
        let count = 0;
        for (let index = adminMfaRows.length - 1; index >= 0; index--) {
          if (adminMfaRows[index].userId !== where.userId) continue;
          adminMfaRows.splice(index, 1);
          count++;
        }
        return { count };
      } },
      allwainScanRequest: { updateMany: async ({ where, data }: any) => { writes++; for (const request of state.requests.filter((row) => row.userId === where.userId)) Object.assign(request, data); return {}; } },
    };
    for (const key of ["authIdentity", "authSession", "allwainBuyerProfile", "allwainSellerProfile", "allwainConnectorProfile", "allwainAppTesterProgress", "allwainAppTesterActionProgress", "trueqiaTesterAction", "trueqiaTesterIncident", "allwainBuyerPaymentProfile", "allwainNotification", "chatParticipant", "chatBlock", "trueqiaChatMessage", "passwordResetToken", "allwainAuditEvent", "allwainSellerPaymentAccount"]) tx[key] = cleanup;
    const prisma = { ...fakePrisma(state), $transaction: async (run: any) => run(tx) };
    mock.method(db, "getPrisma", () => prisma as any);
    mock.method(audit, "appendAllwainAuditEventTx", async () => undefined as any);
    return { state, histories, originalHistories, adminMfaRows, originalAdminMfaRows, adminMfaDeleteCalls, writes: () => writes };
  }

  it("closes every allwain publication using current stock, retaining history and leaving Trueqia intact", async () => {
    const context = accountFixture();
    const before = structuredClone(context.state.offers.find((row) => row.id === "seller-public"));
    const trueqia = structuredClone(context.state.offers.find((row) => row.id === "trueqia-public"));
    const result = await deleteAllwainAccount("seller");
    assert.equal(result.deleted, true);
    assert.deepEqual(context.adminMfaDeleteCalls, [{ userId: "seller" }]);
    assert.deepEqual(context.adminMfaRows, [{ userId: "buyer", pending: true }], "erase only the deleted actor's enrolled or pending MFA");
    for (const row of context.state.offers.filter((offer) => offer.owner === "allwain" && offer.ownerUserId === "seller")) {
      assert.equal(row.allwainStatus, "closed", row.id);
      assert.equal(row.meta.archived, true, row.id);
      assert.equal(row.meta.status, "archived", row.id);
      assert.equal(row.meta.availableQuantity, 0, row.id);
      assert.equal(row.meta.archivedAt, result.deletedAt, row.id);
    }
    const archived = context.state.offers.find((row) => row.id === "seller-public");
    for (const key of ["stockQuantity", "reservedQuantity", "soldQuantity", "privateNotes", "shoppingListItems", "internalReconciliation"]) assert.deepEqual(archived.meta[key], before.meta[key], key);
    assert.deepEqual(context.histories, context.originalHistories);
    assert.deepEqual(context.state.offers.find((row) => row.id === "trueqia-public"), trueqia);
    assert.equal(context.state.requests.find((row) => row.id === "request-seller").status, "archived");
    assert.equal(context.state.requests.find((row) => row.id === "request-buyer").status, "submitted");
    const search = await searchAllwain({ userId: "stranger", query: "Manzana", limit: 20 });
    assert.deepEqual(search.offers.map((row) => row.id), ["buyer-public"]);
    assert.deepEqual(search.requests.map((row) => row.id), ["request-buyer"]);
  });

  it("refuses deletion with an open order before changing offers or account state", async () => {
    const context = accountFixture(1);
    const before = structuredClone(context.state);
    await assert.rejects(deleteAllwainAccount("seller"), /ACCOUNT_HAS_OPEN_ORDERS/);
    assert.equal(context.writes(), 0);
    assert.deepEqual(context.adminMfaDeleteCalls, [], "an open order must prevent MFA erasure too");
    assert.deepEqual(context.adminMfaRows, context.originalAdminMfaRows);
    assert.deepEqual(context.state, before);
  });

  it("preserves inventory committed while account deletion waited for its offer lock", async () => {
    const context = accountFixture(0, (state) => {
      const meta = state.offers.find((row) => row.id === "seller-public").meta;
      Object.assign(meta, { availableQuantity: 6, reservedQuantity: 2, soldQuantity: 2, inventoryRevision: 9 });
    });
    await deleteAllwainAccount("seller");
    const archived = context.state.offers.find((row) => row.id === "seller-public");
    assert.equal(archived.meta.stockQuantity, 10);
    assert.equal(archived.meta.reservedQuantity, 2);
    assert.equal(archived.meta.soldQuantity, 2);
    assert.equal(archived.meta.inventoryRevision, 9);
    assert.equal(archived.meta.availableQuantity, 0);
    assert.equal(archived.allwainStatus, "closed");
    assert.deepEqual(context.adminMfaDeleteCalls, [{ userId: "seller" }]);
    assert.deepEqual(context.adminMfaRows, [{ userId: "buyer", pending: true }]);
  });
});
