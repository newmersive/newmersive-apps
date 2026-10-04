const assert = require("node:assert/strict");
const { before, after, beforeEach, describe, it } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { PGlite } = require("@electric-sql/pglite");
const { PGLiteSocketServer } = require("@electric-sql/pglite-socket");
const { PrismaClient, Prisma } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

// Fresh database in RAM, bound only to an OS-assigned loopback port. This never
// loads env.ts, an existing runtime, DATABASE_URL, production data or migrations.
const root = path.resolve(__dirname, "..");
function sourceModules(prisma, options = {}) {
  const modules = new Map();
  const real = new Set(["data.store.allwain.pg", "data.store.pg", "allwain-inventory", "allwain-card-images.service", "allwain-publication-policy", "allwain-search.service", "allwain-offer-lifecycle", "allwain-preorders", "allwain-discovery", "allwain-shopping-lists.service", "allwain-payments.service", "allwain-request-work", "allwain-request-recovery", "allwain-purchase-analytics"]);
  const emptyModel = { findMany: async () => [] };
  const facade = new Proxy(prisma, {
    get(target, key) {
      if (["allwainScanRequest", "product", "allwainSellerProfile", "allwainReputation"].includes(key) && !options.realModels?.includes(key)) return emptyModel;
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  function load(name) {
    if (modules.has(name)) return modules.get(name).exports;
    const filename = path.join(root, "src/services", `${name}.ts`);
    const module = { exports: {} }; modules.set(name, module);
    const javascript = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }, fileName: filename,
    }).outputText;
    const isolatedRequire = (id) => {
      if (options.stubs?.[id]) return options.stubs[id];
      if (id === "@prisma/client") return { Prisma };
      if (id === "../config/env") return { ENV: { STORAGE_DRIVER: "postgres", NODE_ENV: "test", ALLWAIN_API_URL: "https://test.invalid", JWT_SECRET: "isolated-pglite-discovery" } };
      if (id === "../db/prisma") return { getPrisma: () => facade };
      if (id === "./allwain-audit") return { appendAllwainAuditEventTx: options.appendAudit || (async () => {}) };
      if (id.startsWith("./") && real.has(id.slice(2))) return load(id.slice(2));
      if (["fs", "path", "crypto"].includes(id)) return require(`node:${id}`);
      if (id.startsWith("node:")) return require(id);
      if (id === "csv-parse/sync") return require(id);
      if (id === "jsonwebtoken") return require(id);
      if (id === "stripe") return require(id);
      if (id.startsWith(".")) return {};
      throw new Error(`Unexpected dependency: ${id}`);
    };
    vm.runInNewContext(javascript, { module, exports: module.exports, require: isolatedRequire, Buffer, Date, URL }, { filename });
    return module.exports;
  }
  return { store: load("data.store.allwain.pg"), contracts: load("data.store.pg"), inventory: load("allwain-inventory"), search: load("allwain-search.service"), discovery: load("allwain-discovery"), load };
}

function offer(id, overrides = {}) {
  return {
    id, title: "Naranjas del catálogo", description: "Naranjas frescas por kilo", owner: "allwain", ownerUserId: "seller", price: 2,
    allwainType: "catalog", allwainStatus: "active", createdAt: new Date("2026-10-04T10:00:00Z"), updatedAt: new Date("2026-10-04T10:00:00Z"),
    meta: { inventoryManaged: true, stockQuantity: 10, availableQuantity: 10, reservedQuantity: 0, soldQuantity: 0, minQuantity: 1, quantityStep: 1, unit: "kg" },
    ...overrides,
  };
}

function scalarModelDdl(name) {
  const model = Prisma.dmmf.datamodel.models.find((item) => item.name === name);
  const sqlType = { String: "text", Int: "integer", Float: "double precision", Decimal: "numeric(18,3)", Boolean: "boolean", DateTime: "timestamp(3)", Json: "jsonb" };
  const columns = model.fields.filter((field) => field.kind === "scalar" || field.kind === "enum").map((field) => {
    const type = field.kind === "enum" ? "text" : sqlType[field.type];
    assert.ok(type, `unsupported isolated fixture type ${field.type}`);
    let defaultSql = "";
    if (field.type === "DateTime" && (field.name === "updatedAt" || field.hasDefaultValue)) defaultSql = "CURRENT_TIMESTAMP";
    else if (field.default && typeof field.default === "object" && field.default.name === "uuid") defaultSql = "gen_random_uuid()::text";
    else if (typeof field.default === "string") defaultSql = `'${field.default.replace(/'/g, "''")}'`;
    else if (typeof field.default === "boolean" || typeof field.default === "number") defaultSql = String(field.default);
    return `"${field.name}" ${type}${field.isList ? "[]" : ""}${field.isRequired ? " NOT NULL" : ""}${field.isId ? " PRIMARY KEY" : ""}${defaultSql ? ` DEFAULT ${defaultSql}` : ""}`;
  });
  return `CREATE TABLE "${name}" (${columns.join(",")});`;
}

module.exports = { sourceModules, scalarModelDdl, offer };

if (require.main === module) {

describe("Allwain current-source SQL verification on isolated PGlite", () => {
  let database, server, pool, prisma, source;
  before(async () => {
    database = await PGlite.create();
    // Derive scalar columns from the installed generated Prisma model. Relations
    // and project migrations are unnecessary for these isolated Offer operations.
    const model = Prisma.dmmf.datamodel.models.find((item) => item.name === "Offer");
    const sqlType = { String: "text", Int: "integer", Float: "double precision", Boolean: "boolean", DateTime: "timestamp(3)", Json: "jsonb" };
    const defaults = { createdAt: "CURRENT_TIMESTAMP", updatedAt: "CURRENT_TIMESTAMP", isUnique: "false", commercialModel: "'marketplace'", proposalRevision: "0" };
    const columns = model.fields.filter((field) => field.kind === "scalar").map((field) => {
      assert.ok(sqlType[field.type], `unsupported isolated fixture type ${field.type}`);
      return `"${field.name}" ${sqlType[field.type]}${field.isRequired ? " NOT NULL" : ""}${field.isId ? " PRIMARY KEY" : ""}${defaults[field.name] ? ` DEFAULT ${defaults[field.name]}` : ""}`;
    });
    await database.exec(`CREATE TABLE "Offer" (${columns.join(",")}); CREATE TABLE "User" ("id" text PRIMARY KEY, "name" text NOT NULL, "deletedAt" timestamp(3));${scalarModelDdl("Contract")}${scalarModelDdl("AllwainOrder")}`);
    await database.query(`INSERT INTO "User" VALUES ('seller','Vendedor',NULL),('buyer','Comprador',NULL),('deleted','Eliminado','2026-10-03');`);
    server = new PGLiteSocketServer({ db: database, host: "127.0.0.1", port: 0, maxConnections: 1 });
    await server.start();
    const connection = /^127\.0\.0\.1:(\d+)$/.exec(server.getServerConn());
    assert.ok(connection, "isolated loopback endpoint required");
    pool = new Pool({ host: "127.0.0.1", port: Number(connection[1]), user: "postgres", database: "postgres", max: 1, connectionTimeoutMillis: 5000 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    source = sourceModules(prisma);
  }, { timeout: 30000 });
  after(async () => {
    if (prisma) await prisma.$disconnect();
    if (pool) await pool.end();
    if (server) await server.stop();
    if (database) await database.close();
  });
  beforeEach(async () => { await prisma.offer.deleteMany(); });

  it("preserves the current reserved/sold stock and limits when passed stale metadata", async () => {
    const created = await prisma.offer.create({ data: offer("edit") });
    const reservation = source.inventory.reserveAllwainStock(created, 3);
    const sold = source.inventory.commitAllwainStock({ ...created, meta: reservation.meta }, 2);
    const currentMeta = source.inventory.updateAllwainInventoryLimits({ ...created, meta: sold }, { stockQuantity: 12, minQuantity: 2, quantityStep: 2 });
    await prisma.offer.update({ where: { id: created.id }, data: { meta: currentMeta } });
    const edited = await source.store.updateAllwainOfferDetailsPg({ offerId: created.id, userId: "seller", allowAnyOwner: false, title: "Tomates", meta: created.meta });
    assert.deepEqual(source.inventory.readAllwainInventory(edited), source.inventory.readAllwainInventory({ meta: currentMeta }));
    assert.equal(edited.meta.availableQuantity, 9);
    assert.equal(edited.meta.reservedQuantity, 1);
    assert.equal(edited.meta.soldQuantity, 2);
    assert.equal(edited.meta.imageAlt, "Tomates");
  });

  it("keeps close irreversible and idempotent under the actual transaction", async () => {
    const created = await prisma.offer.create({ data: offer("close") });
    await prisma.offer.update({ where: { id: created.id }, data: { meta: source.inventory.reserveAllwainStock(created, 3).meta } });
    await source.store.updateAllwainOfferDetailsPg({ offerId: created.id, userId: "seller", allowAnyOwner: false, status: "closed" });
    const closed = await prisma.offer.findUnique({ where: { id: created.id } });
    await assert.rejects(source.store.updateAllwainOfferDetailsPg({ offerId: created.id, userId: "seller", allowAnyOwner: false, status: "paused" }), /INVALID_OFFER_TRANSITION/);
    await source.store.updateAllwainOfferDetailsPg({ offerId: created.id, userId: "seller", allowAnyOwner: false, status: "closed" });
    assert.deepEqual(await prisma.offer.findUnique({ where: { id: created.id } }), closed);
    assert.equal(closed.meta.reservedQuantity, 3);
    assert.equal(closed.meta.availableQuantity, 0);
    const corrected = await source.store.updateAllwainOfferDetailsPg({ offerId: created.id, userId: "seller", allowAnyOwner: false, title: "Título corregido", price: 3 });
    assert.equal(corrected.allwainStatus, "closed");
    assert.equal(corrected.meta.archived, true);
    assert.equal(corrected.meta.archivedAt, closed.meta.archivedAt);
    assert.equal(corrected.meta.reservedQuantity, 3);
    assert.equal(corrected.meta.availableQuantity, 0);
  });

  it("rejects wrong owners, spent stock and list proposals using locked SQL rows", async () => {
    await prisma.offer.create({ data: offer("wrong-owner", { ownerUserId: "other" }) });
    await prisma.offer.create({ data: offer("spent", { allwainStatus: "sold_out", meta: { inventoryManaged: true, stockQuantity: 3, availableQuantity: 0, reservedQuantity: 3 } }) });
    await prisma.offer.create({ data: offer("proposal", { allwainType: "proposal", shoppingListId: "private-list" }) });
    for (const [id, input, error] of [
      ["wrong-owner", { price: 5 }, /OFFER_NOT_FOUND/], ["spent", { status: "active" }, /INSUFFICIENT_STOCK/], ["proposal", { price: 5 }, /OFFER_EDIT_NOT_ALLOWED/],
    ]) {
      const original = await prisma.offer.findUnique({ where: { id } });
      await assert.rejects(source.store.updateAllwainOfferDetailsPg({ offerId: id, userId: "seller", allowAnyOwner: false, ...input }), error);
      assert.deepEqual(await prisma.offer.findUnique({ where: { id } }), original);
    }
  });

  it("filters private/retired/deleted rows before limits in the actual list and search", async () => {
    const privateRows = [
      offer("z-proposal", { shoppingListId: "list", allwainType: "proposal" }),
      offer("y-legacy-proposal", { allwainType: null, meta: { shoppingListId: "list" } }),
      offer("x-archived", { meta: { archived: true } }),
      offer("w-closed", { allwainStatus: "closed" }), offer("v-paused", { allwainStatus: "paused" }),
      offer("u-deleted", { ownerUserId: "deleted" }),
      offer("t-meta-archived", { meta: { status: "archived" } }),
    ];
    const publicRows = [offer("b-public"), offer("a-legacy", { allwainType: null, allwainStatus: null, meta: Prisma.DbNull })];
    for (const row of [...privateRows, ...publicRows]) await prisma.offer.create({ data: row });
    const first = await source.store.getAllwainOfferPagePg({ limit: 1 });
    const second = await source.store.getAllwainOfferPagePg({ limit: 1, cursor: first.pageInfo.nextCursor });
    assert.equal(first.items[0].id, "b-public"); assert.equal(second.items[0].id, "a-legacy");
    assert.equal(first.pageInfo.hasNextPage, true); assert.equal(second.pageInfo.hasNextPage, false);
    for (const status of ["closed", "paused"]) {
      assert.equal((await source.store.getAllwainOfferPagePg({ limit: 1, status })).items.length, 0);
      assert.equal((await source.store.getAllwainOfferPagePg({ limit: 1, status, ownerUserId: "seller" })).items[0].allwainStatus, status);
    }
    const search = await source.search.searchAllwain({ userId: "buyer", query: "Naranjas", limit: 1 });
    assert.equal(search.offers.length, 1); assert.equal(search.offers[0].id, "b-public");
  });
});
}
