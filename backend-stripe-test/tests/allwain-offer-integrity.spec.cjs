const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// Execute the current TypeScript sources, while isolating configuration, storage
// and side effects. This harness never imports env.ts, PrismaClient or server.ts.
const root = path.resolve(__dirname, "..");
const copy = (value) => structuredClone(value);
const Prisma = {
  AnyNull: Symbol("AnyNull"),
  DbNull: Symbol("DbNull"),
  sql: (strings, ...values) => ({ strings, values }),
};

function matches(row, where = {}) {
  if (where.AND && ![].concat(where.AND).every((item) => matches(row, item))) return false;
  if (where.OR && !where.OR.some((item) => matches(row, item))) return false;
  if (where.NOT && [].concat(where.NOT).some((item) => matches(row, item))) return false;
  for (const [key, condition] of Object.entries(where)) {
    if (["AND", "OR", "NOT"].includes(key)) continue;
    const value = row[key] ?? null;
    if (condition instanceof Date) { if (+new Date(value) !== +condition) return false; continue; }
    if (condition === null || typeof condition !== "object") {
      if (value !== condition) return false;
      continue;
    }
    const actual = condition.path
      ? condition.path.reduce((current, part) => current?.[part], value)
      : value;
    if ("equals" in condition) {
      if (condition.equals === Prisma.DbNull) {
        if (value !== null) return false;
      } else if (condition.equals === Prisma.AnyNull) {
        if (actual !== undefined && actual !== null) return false;
      } else if (actual !== condition.equals) return false;
    }
    if ("not" in condition && actual === condition.not) return false;
    if (condition.in && !condition.in.includes(actual)) return false;
    if (condition.notIn && condition.notIn.includes(actual)) return false;
    if ("gte" in condition && actual < condition.gte) return false;
    if ("lte" in condition && actual > condition.lte) return false;
    if ("gt" in condition && !(condition.gt instanceof Date ? +new Date(actual) > +condition.gt : actual > condition.gt)) return false;
    if ("lt" in condition && !(condition.lt instanceof Date ? +new Date(actual) < +condition.lt : actual < condition.lt)) return false;
    if (condition.contains && !String(actual).toLowerCase().includes(condition.contains.toLowerCase())) return false;
  }
  return true;
}

function catalog(overrides = {}) {
  return {
    id: "catalog-1", owner: "allwain", ownerUserId: "seller",
    title: "Naranjas", description: "Naranjas frescas por kilo", price: 2,
    allwainType: "catalog", allwainStatus: "active", requestId: null, shoppingListId: null,
    createdAt: "2026-10-04T10:00:00.000Z", updatedAt: "2026-10-04T10:00:00.000Z",
    meta: { inventoryManaged: true, stockQuantity: 10, availableQuantity: 10,
      reservedQuantity: 0, soldQuantity: 0, minQuantity: 1, quantityStep: 1, unit: "kg" },
    ...overrides,
  };
}

function harness({ offers = [catalog()], users, driver = "postgres", contracts = [], orders = [], lists = [], requests = [], products = [] } = {}) {
  const rows = new Map(offers.map((offer) => [offer.id, copy(offer)]));
  const people = users || [
    { id: "seller", name: "Vendedor", role: "company", deletedAt: null },
    { id: "buyer", name: "Comprador", role: "user", deletedAt: null },
    { id: "stranger", name: "Tercero", role: "company", deletedAt: null },
    { id: "deleted-seller", name: "Cuenta eliminada", role: "company", deletedAt: "2026-10-03" },
  ];
  const state = { rows, people, requests, contracts, orders, audit: [], writes: 0, onRead: null, onJsonRead: null };
  let transactionTail = Promise.resolve();
  function finder(items) {
    return {
      findFirst: async ({ where }) => copy(items.find((item) => matches(item, where)) || null),
      findUnique: async ({ where }) => copy(items.find((item) => matches(item, where)) || null),
      findMany: async ({ where = {} } = {}) => copy(items.filter((item) => matches(item, where))),
    };
  }
  const prisma = {
    user: finder(people), contract: finder(contracts), allwainOrder: finder(orders),
    allwainShoppingList: finder(lists), allwainReputation: finder([]),
    offer: {
      async findMany({ where = {}, orderBy = [], take, cursor, skip = 0 }) {
        let result = [...rows.values()].filter((row) => matches(row, where));
        for (const order of [...orderBy].reverse()) {
          const [key, direction] = Object.entries(order)[0];
          result.sort((left, right) => String(left[key]).localeCompare(String(right[key])) * (direction === "desc" ? -1 : 1));
        }
        if (cursor) result = result.slice(Math.max(0, result.findIndex((item) => item.id === cursor.id)) + skip);
        return copy(take === undefined ? result : result.slice(0, take));
      },
      async update({ where, data }) {
        state.writes += 1;
        const updated = { ...rows.get(where.id), ...copy(data) };
        rows.set(where.id, updated);
        return copy(updated);
      },
    },
    async $queryRaw(query) {
      const row = rows.get(query.values[0]);
      return row?.owner === "allwain" ? [copy(row)] : [];
    },
    async $transaction(callback) {
      const preceding = transactionTail;
      let release;
      transactionTail = new Promise((resolve) => { release = resolve; });
      await preceding;
      const snapshot = copy([...rows]);
      const auditCount = state.audit.length;
      try { return await callback(prisma); }
      catch (error) { rows.clear(); for (const [id, row] of snapshot) rows.set(id, row); state.audit.length = auditCount; throw error; }
      finally { release(); }
    },
  };
  const getUser = (id) => copy(people.find((user) => user.id === id) || null);
  const readOffer = async (id) => {
    const snapshot = copy(rows.get(id) || null);
    if (state.onRead) await state.onRead(snapshot);
    return snapshot;
  };
  const modules = new Map();
  const config = { ENV: { STORAGE_DRIVER: driver, NODE_ENV: "test", ALLWAIN_API_URL: "https://test.invalid" } };
  const stubs = {
    "../config/env": config,
    "../db/prisma": { getPrisma: () => prisma },
    "./allwain-audit": { appendAllwainAuditEventTx: async (_tx, input) => state.audit.push(copy(input)) },
    "./data.store.pg": { getOfferByIdPg: readOffer, getUserByIdPg: getUser },
    "./data.store": {
      getOfferById: (id) => { const result = copy(rows.get(id) || null); state.onJsonRead?.(); return result; }, getUserById: getUser,
      getOffersByOwner: (owner) => copy([...rows.values()].filter((row) => row.owner === owner)),
      getContracts: () => copy(contracts),
      getAllwainScanRequests: (userId) => copy(requests.filter((row) => !userId || row.userId === userId)),
      updateAllwainScanRequest: (request) => { const index = requests.findIndex((row) => row.id === request.id); if (index < 0) return null; requests[index] = copy(request); return copy(request); },
      getProducts: () => copy(products),
      getProductByEAN: (ean) => copy(products.find((product) => product.ean === ean) || null),
      updateOffer: (offer) => { state.writes += 1; rows.set(offer.id, copy(offer)); return copy(offer); },
    },
    "./allwain-participation.service": { isAllwainSellerEnabled: async () => true },
    "./allwain-money": { getAllwainDeliveryPricingConfig: () => ({}) },
    "./allwain-reputation.service": { getAllwainReputationSummary: async () => null },
  };
  const real = new Set(["allwain.service", "data.store.allwain.pg", "allwain-inventory", "allwain-card-images.service", "allwain-publication-policy", "allwain-offer-lifecycle", "allwain-preorders", "allwain-discovery", "allwain-request-work", "allwain-request-recovery", "allwain-purchase-analytics"]);
  function load(name) {
    if (modules.has(name)) return modules.get(name).exports;
    const filename = path.join(root, "src", "services", `${name}.ts`);
    const module = { exports: {} };
    modules.set(name, module);
    const javascript = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
      fileName: filename,
    }).outputText;
    const isolatedRequire = (id) => {
      if (id === "@prisma/client") return { Prisma };
      if (stubs[id]) return stubs[id];
      if (id.startsWith("./") && real.has(id.slice(2))) return load(id.slice(2));
      if (["fs", "path", "crypto"].includes(id)) return require(`node:${id}`);
      if (id.startsWith("node:")) return require(id);
      if (id.startsWith(".")) return {};
      throw new Error(`Unexpected dependency: ${id}`);
    };
    // Expose the source's private matching function only in this isolated VM;
    // its body and collaborators are the same ones used by the scan workflow.
    const testExports = name === "allwain.service" ? "\nmodule.exports.matchAllwainRequestForTest = matchAllwainRequest;" : "";
    vm.runInNewContext(javascript + testExports, { module, exports: module.exports, require: isolatedRequire, Buffer, Date, URL, Error }, { filename });
    return module.exports;
  }
  const store = load("data.store.allwain.pg");
  // Request detail looks up the aggregate through the storage module.
  store.getAllwainScanRequestByIdPg = async (id) => copy(requests.find((request) => request.id === id) || null);
  return { state, prisma, store, service: load("allwain.service"), inventory: load("allwain-inventory"), discovery: load("allwain-discovery") };
}

function gate() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

module.exports = { harness, catalog, gate };

if (require.main === module) {
describe("Allwain scan recommendations and private source media", () => {
  const product = { id: "fruit", ean: "123", name: "Naranjas", category: "alimentacion" };
  const recommendations = [
    catalog({ id: "public", productId: "fruit" }),
    catalog({ id: "paused", productId: "fruit", allwainStatus: "paused" }),
    catalog({ id: "archived", productId: "fruit", meta: { archived: true } }),
    catalog({ id: "private-list", productId: "fruit", shoppingListId: "list", allwainType: "proposal" }),
    catalog({ id: "private-scan", productId: "fruit", requestId: "another-request", allwainType: "proposal" }),
    catalog({ id: "deleted-owner", productId: "fruit", ownerUserId: "deleted-seller" }),
    catalog({ id: "orphan-owner", productId: "fruit", ownerUserId: "missing" }),
  ];
  it("uses only public active catalog rows in the demo scan", async () => {
    const h=harness({driver:"json",products:[product],offers:recommendations});
    const result=await h.service.scanDemoProduct("123");
    assert.deepEqual(copy(result.offers.map(offer=>offer.id)),["public"]);
  });
  it("uses the same public policy for initial product/category matches", async () => {
    const h=harness({driver:"json",products:[product],offers:recommendations});
    const result=await h.service.matchAllwainRequestForTest("buyer",{productName:"Naranjas",category:"alimentacion"});
    assert.deepEqual(copy(result.offers.map(offer=>offer.id)),["public"]);
  });
  it("only the active owner can read source media, including after publication or closing", async () => {
    const request={id:"request",userId:"buyer",visibility:"public",status:"submitted"};
    const users=[
      {id:"buyer",role:"user",deletedAt:null},
      {id:"seller",role:"company",deletedAt:null},
      {id:"stranger",role:"user",deletedAt:null},
      {id:"admin",role:"admin",deletedAt:null},
    ];
    const h=harness({driver:"json",requests:[request],users});
    assert.equal(await h.service.canReadAllwainRequestImage("buyer","request"),true);
    for(const id of ["seller","stranger","admin","missing"])assert.equal(await h.service.canReadAllwainRequestImage(id,"request"),false);
    assert.equal(await h.service.canReadAllwainRequestImage("buyer","missing"),false);
    for(const status of ["awarded","closed","canceled"]){
      const closed=harness({driver:"json",requests:[{...request,status}],users});
      assert.equal(await closed.service.canReadAllwainRequestImage("buyer","request"),true);
      assert.equal(await closed.service.canReadAllwainRequestImage("seller","request"),false);
    }
    for(const state of [{deletedAt:"2026-10-04"},{status:"disabled"},{status:"locked"}]){
      const revoked=harness({driver:"json",requests:[request],users:[{id:"buyer",role:"user",...state}]});
      assert.equal(await revoked.service.canReadAllwainRequestImage("buyer","request"),false);
    }
  });
  it("the seller market uses an illustration while the owner's source capture remains intact", async () => {
    const request={id:"request",userId:"buyer",visibility:"public",status:"submitted",title:"Naranjas",description:"Necesito 2kg",createdAt:"2026-10-04",updatedAt:"2026-10-04",extracted:{productName:"Naranjas",category:"alimentacion"},imageMeta:{source:"captured",hasImage:true,url:"https://test.invalid/api/allwain/media/uploads/receipt.jpg",alt:"Private receipt",privateRawText:"private"}};
    const h=harness({driver:"json",requests:[request],offers:[]});
    const items=await h.service.listAllwainMarketRequests("seller");
    assert.equal(items.length,1);
    assert.equal(items[0].imageMeta.illustrative,true);
    assert.equal(items[0].imageMeta.hasImage,false);
    assert.equal(JSON.stringify(items[0]).includes("receipt.jpg"),false);
    assert.equal(JSON.stringify(items[0]).includes("Private receipt"),false);
    assert.equal(JSON.stringify(items[0]).includes("privateRawText"),false);
    assert.equal(request.imageMeta.url,"https://test.invalid/api/allwain/media/uploads/receipt.jpg");
  });
});

describe("Allwain catalog edits against the locked current offer", () => {
  for (const change of ["reservation", "sale", "release", "limits"]) {
    it(`preserves a concurrent ${change} while refreshing the title image`, async () => {
      const h = harness();
      const read = gate(); const resume = gate();
      h.state.onRead = async () => { read.resolve(); await resume.promise; };
      const edit = h.service.updateAllwainOffer("seller", "catalog-1", { title: "  Tomates  " });
      await read.promise;
      await h.prisma.$transaction(async (tx) => {
        let current = h.state.rows.get("catalog-1");
        let meta = h.inventory.reserveAllwainStock(current, 3).meta;
        current = { ...current, meta };
        if (change === "sale") meta = h.inventory.commitAllwainStock(current, 2);
        if (change === "release") meta = h.inventory.releaseAllwainStock(current, 2);
        if (change === "limits") meta = h.inventory.updateAllwainInventoryLimits(current, { stockQuantity: 12, minQuantity: 2, quantityStep: 2 });
        await tx.offer.update({ where: { id: current.id }, data: { meta } });
      });
      const beforeEdit = h.inventory.readAllwainInventory(h.state.rows.get("catalog-1"));
      resume.resolve();
      const result = await edit;
      assert.deepEqual(h.inventory.readAllwainInventory(result), beforeEdit);
      assert.equal(result.title, "Tomates");
      assert.equal(result.meta.imageAlt, "Tomates");
      assert.equal(h.state.audit.length, 1);
    });
  }

  it("rejects an older pause after a close acquired the lock first", async () => {
    const h = harness(); const read = gate(); const resume = gate();
    h.state.onRead = async () => { read.resolve(); await resume.promise; };
    const pendingPause = h.service.updateAllwainOffer("seller", "catalog-1", { status: "paused" });
    await read.promise;
    await h.store.updateAllwainOfferDetailsPg({ offerId: "catalog-1", userId: "seller", allowAnyOwner: false, status: "closed" });
    const closed = copy(h.state.rows.get("catalog-1"));
    resume.resolve();
    await assert.rejects(pendingPause, /INVALID_OFFER_TRANSITION/);
    assert.deepEqual(h.state.rows.get("catalog-1"), closed);
    assert.equal(closed.meta.archived, true);
    assert.equal(h.state.audit.length, 1);
  });

  it("rechecks stock before a stale activation and owner before a stale edit", async () => {
    for (const mode of ["stock", "owner"]) {
      const h = harness(); const read = gate(); const resume = gate();
      h.state.onRead = async () => { read.resolve(); await resume.promise; };
      const edit = h.service.updateAllwainOffer("seller", "catalog-1", mode === "stock" ? { status: "active" } : { price: 9 });
      await read.promise;
      const current = h.state.rows.get("catalog-1");
      h.state.rows.set(current.id, mode === "stock"
        ? { ...current, allwainStatus: "sold_out", meta: h.inventory.reserveAllwainStock(current, 10).meta }
        : { ...current, ownerUserId: "stranger" });
      resume.resolve();
      await assert.rejects(edit, mode === "stock" ? /INSUFFICIENT_STOCK/ : /OFFER_NOT_FOUND/);
      assert.equal(h.state.writes, 0);
    }
  });

  it("allows normal pause, resume and idempotent close, preserving commitments", async () => {
    const h = harness();
    const original = h.state.rows.get("catalog-1");
    h.state.rows.set(original.id, { ...original, meta: h.inventory.reserveAllwainStock(original, 3).meta });
    await h.service.updateAllwainOffer("seller", original.id, { status: "paused", description: "Nueva descripción" });
    await h.service.updateAllwainOffer("seller", original.id, { status: "active" });
    await h.service.updateAllwainOffer("seller", original.id, { status: "closed" });
    const firstClose = copy(h.state.rows.get(original.id));
    await h.service.updateAllwainOffer("seller", original.id, { status: "closed" });
    assert.deepEqual(h.state.rows.get(original.id), firstClose);
    assert.equal(h.state.rows.get(original.id).meta.reservedQuantity, 3);
    assert.equal(h.state.rows.get(original.id).meta.soldQuantity, 0);
    assert.equal(h.state.rows.get(original.id).meta.availableQuantity, 0);
    assert.equal(h.state.rows.get(original.id).description, "Nueva descripción");
    assert.equal(h.state.rows.get(original.id).allwainStatus, firstClose.allwainStatus);
    await assert.rejects(h.service.updateAllwainOffer("seller", original.id, { status: "active" }), /INVALID_OFFER_TRANSITION/);
  });

  for (const proposal of [
    { requestId: "request-1" }, { shoppingListId: "list-1" }, { allwainType: "proposal" },
    { meta: { requestId: "request-1" } }, { meta: { shoppingListId: "list-1" } },
    { meta: { allwainType: "proposal" } }, { meta: { proposalKind: "shopping_list" } },
  ]) {
    it(`rejects proposal edit in the service and transaction: ${JSON.stringify(proposal)}`, async () => {
      const offer = catalog(proposal); const h = harness({ offers: [offer] });
      await assert.rejects(h.service.updateAllwainOffer("seller", offer.id, { price: 7 }), /OFFER_EDIT_NOT_ALLOWED/);
      await assert.rejects(h.store.updateAllwainOfferDetailsPg({ offerId: offer.id, userId: "seller", allowAnyOwner: false, price: 7 }), /OFFER_EDIT_NOT_ALLOWED/);
      assert.deepEqual(h.state.rows.get(offer.id), offer);
      assert.equal(h.state.writes, 0);
      assert.equal(h.state.audit.length, 0);
    });
  }

  it("rejects a proposal linked after the service read", async () => {
    const h = harness(); const read = gate(); const resume = gate();
    h.state.onRead = async () => { read.resolve(); await resume.promise; };
    const edit = h.service.updateAllwainOffer("seller", "catalog-1", { price: 5 });
    await read.promise;
    h.state.rows.get("catalog-1").shoppingListId = "list-1";
    resume.resolve();
    await assert.rejects(edit, /OFFER_EDIT_NOT_ALLOWED/);
    assert.equal(h.state.writes, 0);
  });

  it("reads current JSON storage after an awaited preview before editing or pausing", async () => {
    for (const mode of ["reservation", "close"]) {
      const h = harness({ driver: "json" });
      h.state.onJsonRead = () => {
        h.state.onJsonRead = null;
        const offer = h.state.rows.get("catalog-1");
        h.state.rows.set(offer.id, mode === "reservation"
          ? { ...offer, meta: h.inventory.reserveAllwainStock(offer, 3).meta }
          : { ...offer, allwainStatus: "closed", meta: h.inventory.archiveAllwainOfferMeta(offer.meta) });
      };
      if (mode === "reservation") {
        const edited = await h.service.updateAllwainOffer("seller", "catalog-1", { title: "Tomates" });
        assert.equal(edited.meta.reservedQuantity, 3);
        assert.equal(edited.meta.availableQuantity, 7);
      } else {
        await assert.rejects(h.service.updateAllwainOffer("seller", "catalog-1", { status: "paused" }), /INVALID_OFFER_TRANSITION/);
        assert.equal(h.state.rows.get("catalog-1").meta.archived, true);
        assert.equal(h.state.writes, 0);
        const closed = copy(h.state.rows.get("catalog-1"));
        await h.service.updateAllwainOffer("seller", "catalog-1", { status: "closed" });
        assert.deepEqual(copy(h.state.rows.get("catalog-1")), closed);
      }
    }
  });
});

describe("Allwain public catalog and authorized historical detail", () => {
  const offers = [
    catalog({ id: "public" }), catalog({ id: "legacy", allwainType: null, allwainStatus: null, meta: null }),
    catalog({ id: "paused", allwainStatus: "paused" }), catalog({ id: "closed", allwainStatus: "closed", meta: { archived: true } }),
    catalog({ id: "archived", meta: { archived: true } }), catalog({ id: "deleted", ownerUserId: "deleted-seller" }),
    catalog({ id: "list-proposal", shoppingListId: "list-1", allwainType: "proposal" }),
    catalog({ id: "legacy-proposal", meta: { shoppingListId: "list-1", proposalKind: "shopping_list" } }),
  ];

  it("applies privacy before pagination and cannot enumerate a market closed status", async () => {
    const h = harness({ offers });
    const first = await h.store.getAllwainOfferPagePg({ limit: 1 });
    const second = await h.store.getAllwainOfferPagePg({ limit: 1, cursor: first.pageInfo.nextCursor });
    assert.deepEqual([first.items[0].id, second.items[0].id].sort(), ["legacy", "public"]);
    assert.equal(first.pageInfo.hasNextPage, true);
    assert.equal(second.pageInfo.hasNextPage, false);
    for (const status of ["closed", "paused"]) {
      const market = await h.store.getAllwainOfferPagePg({ limit: 30, status });
      assert.equal(market.items.length, 0);
      const mine = await h.service.listAllwainOfferPage("seller", { limit: 30, status, ownerUserId: "seller" });
      assert.deepEqual(mine.items.map((item) => item.id), [status]);
    }
    await assert.rejects(h.service.listAllwainOfferPage("stranger", { limit: 30, status: "closed", ownerUserId: "seller" }), /OFFER_NOT_FOUND/);
  });

  for (const driver of ["postgres", "json"]) {
    it(`blocks withdrawn/deleted detail and preserves owner, buyer and participant history (${driver})`, async () => {
      const h = harness({ offers, driver,
        contracts: [{ id: "agreement", app: "allwain", offerId: "closed", requesterUserId: "buyer", providerUserId: "seller", status: "rejected" }],
        orders: [{ id: "order", offerId: "deleted", buyerUserId: "buyer", sellerUserId: "deleted-seller", connectorUserId: "connector" }],
      });
      for (const id of ["paused", "closed", "archived", "deleted", "list-proposal", "legacy-proposal"]) {
        await assert.rejects(h.service.getAllwainOfferForUser("stranger", id), /OFFER_NOT_FOUND/);
      }
      assert.equal((await h.service.getAllwainOfferForUser("stranger", "public")).id, "public");
      assert.equal((await h.service.getAllwainOfferForUser("seller", "closed")).id, "closed");
      assert.equal((await h.service.getAllwainOfferForUser("buyer", "closed")).id, "closed");
      if (driver === "postgres") {
        assert.equal((await h.service.getAllwainOfferForUser("buyer", "deleted")).id, "deleted");
        assert.equal((await h.service.getAllwainOfferForUser("connector", "deleted")).id, "deleted");
      }
      const market = await h.service.listAllwainOfferPage("stranger", { limit: 30 });
      assert.deepEqual(copy(market.items.map((item) => item.id).sort()), ["legacy", "public"]);
      const mine = await h.service.listAllwainOfferPage("seller", { limit: 30, status: "closed", ownerUserId: "seller" });
      assert.equal(mine.items[0].id, "closed");
      assert.ok(mine.items[0].meta.imageUrl);
    });
  }

  it("preserves aggregate buyer access to private request/list proposals", async () => {
    const h = harness({
      offers: [catalog({ id: "request-proposal", requestId: "request-1", allwainType: "proposal" }), catalog({ id: "list-proposal", shoppingListId: "list-1", allwainType: "proposal" })],
      requests: [{ id: "request-1", userId: "buyer" }], lists: [{ id: "list-1", buyerUserId: "buyer", deliveryAddress: { city: "Madrid" } }],
    });
    for (const id of ["request-proposal", "list-proposal"]) {
      assert.equal((await h.service.getAllwainOfferForUser("buyer", id)).id, id);
      assert.equal((await h.service.getAllwainOfferForUser("seller", id)).id, id);
      await assert.rejects(h.service.getAllwainOfferForUser("stranger", id), /OFFER_NOT_FOUND/);
    }
    assert.equal((await h.service.getAllwainOfferForUser("buyer", "list-proposal")).meta.shoppingListDefaults.deliveryAddress.city, "Madrid");
  });

  it("keeps a closed list's address with its buyer and excludes current defaults from other participants", async () => {
    const h = harness({
      offers: [catalog({ id: "closed-list", shoppingListId: "list-1", allwainType: "proposal", allwainStatus: "closed", meta: { archived: true } })],
      lists: [{ id: "list-1", buyerUserId: "buyer", deliveryAddress: { street: "Dirección privada" } }],
      orders: [{ id: "history", offerId: "closed-list", buyerUserId: "buyer", sellerUserId: "seller", connectorUserId: "connector" }],
    });
    const buyer = await h.service.getAllwainOfferForUser("buyer", "closed-list");
    assert.equal(buyer.meta.shoppingListDefaults.deliveryAddress.street, "Dirección privada");
    assert.equal((await h.service.getAllwainOfferForUser("seller", "closed-list")).meta.shoppingListDefaults, undefined);
    assert.equal((await h.service.getAllwainOfferForUser("connector", "closed-list")).meta.shoppingListDefaults, undefined);
    await assert.rejects(h.service.getAllwainOfferForUser("stranger", "closed-list"), /OFFER_NOT_FOUND/);
  });
});
}
