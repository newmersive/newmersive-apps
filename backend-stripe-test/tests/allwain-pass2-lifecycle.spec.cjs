const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { harness, catalog } = require("./allwain-offer-integrity.spec.cjs");

function proposal(overrides = {}) {
  return catalog({ id: "proposal-1", allwainType: "proposal", requestId: "request-1", meta: { requestId: "request-1", currency: "EUR", validUntil: "2099-01-01T00:00:00.000Z", inventoryManaged: false }, ...overrides });
}

function setup(input = {}) {
  const h = harness({ offers: [proposal()], requests: [{ id: "request-1", userId: "buyer", status: "submitted", visibility: "public" }], ...input });
  const revisions = [{ id: "revision-1", offerId: "proposal-1", revision: 1, status: "current", snapshotHash: "immutable" }];
  const originalQuery = h.prisma.$queryRaw;
  const originalWrite = h.prisma.offer.update;
  const originalTransaction = h.prisma.$transaction;
  const trace = [];
  h.prisma.offer.findFirst = async ({ where }) => structuredClone([...h.state.rows.values()].find((row) => (!where.id || row.id === where.id) && (!where.ownerUserId || row.ownerUserId === where.ownerUserId) && (!where.owner || row.owner === where.owner)) || null);
  h.prisma.$executeRaw = async (query) => { trace.push(query.strings.join("?")); return 1; };
  h.prisma.$queryRaw = async (query) => {
    const sql = query.strings.join("?"); trace.push(sql);
    if (sql.includes('"AllwainScanRequest"')) return structuredClone((input.requests || [{ id: "request-1", userId: "buyer", status: "submitted" }]).filter((row) => row.id === query.values[0]));
    if (sql.includes('"AllwainShoppingList"')) return structuredClone((input.lists || [{ id: "list-1", buyerUserId: "buyer", status: "published" }]).filter((row) => row.id === query.values[0]));
    return originalQuery(query);
  };
  let writeIndex = 0;
  h.prisma.offer.update = async (query) => originalWrite({ ...query, data: { ...query.data, updatedAt: new Date(Date.UTC(2026, 9, 4, 10, 0, 1 + writeIndex++)).toISOString() } });
  h.prisma.allwainProposalRevision = {
    async updateMany({ where, data }) { for (const revision of revisions) if (revision.offerId === where.offerId && revision.status === where.status) Object.assign(revision, data); return { count: 1 }; },
  };
  h.prisma.$transaction = async (callback) => {
    const previous = structuredClone(revisions);
    try { return await originalTransaction(callback); }
    catch (error) { revisions.splice(0, revisions.length, ...previous); throw error; }
  };
  return { ...h, revisions, trace };
}

module.exports = { setup, proposal };

if (require.main === module) {
describe("Pass 2 seller proposal lifecycle", () => {
  for (const driver of ["json", "postgres"]) {
    it(`withdraws only own proposal and is idempotent (${driver})`, async () => {
      const h = setup({ driver });
      await assert.rejects(h.service.withdrawAllwainProposal("stranger", "proposal-1"), /OFFER_NOT_FOUND/);
      const withdrawn = await h.service.withdrawAllwainProposal("seller", "proposal-1", { expectedUpdatedAt: "2026-10-04T10:00:00.000Z" });
      assert.equal(withdrawn.allwainStatus, "withdrawn");
      const writes = h.state.writes;
      const again = await h.service.withdrawAllwainProposal("seller", "proposal-1", { expectedUpdatedAt: "2026-10-04T10:00:00.000Z" });
      assert.equal(again.allwainStatus, "withdrawn");
      assert.equal(h.state.writes, writes);
      if (driver === "postgres") {
        assert.equal(h.revisions[0].status, "withdrawn");
        assert.equal(h.revisions[0].snapshotHash, "immutable");
        assert.equal(h.state.audit.length, 1);
        assert.match(h.trace[0], /AllwainScanRequest.*FOR UPDATE/);
        assert.match(h.trace[1], /Offer.*FOR UPDATE/);
      }
    });
    it(`cannot withdraw selected or contracted proposal (${driver})`, async () => {
      const selected = setup({ driver, offers: [proposal({ allwainStatus: "selected" })] });
      await assert.rejects(selected.service.withdrawAllwainProposal("seller", "proposal-1"), /PROPOSAL_LOCKED/);
      const committed = setup({ driver, contracts: [{ id: "contract-1", app: "allwain", offerId: "proposal-1", status: "draft" }] });
      await assert.rejects(committed.service.withdrawAllwainProposal("seller", "proposal-1"), /PROPOSAL_LOCKED/);
      assert.equal(committed.state.writes, 0);
    });
    it(`rejects stale withdrawal and stale acceptance (${driver})`, async () => {
      const h = setup({ driver });
      await assert.rejects(h.service.withdrawAllwainProposal("seller", "proposal-1", { expectedUpdatedAt: "2026-10-03T00:00:00Z" }), /OFFER_VERSION_CONFLICT/);
      await h.service.withdrawAllwainProposal("seller", "proposal-1");
      await assert.rejects(h.service.createAllwainAgreement("buyer", "proposal-1"), /OFFER_NOT_AVAILABLE/);
    });
  }
  it("locks list aggregate before offer and preserves proposal lines", async () => {
    const h = setup({ offers: [proposal({ requestId: null, shoppingListId: "list-1", meta: { shoppingListId: "list-1", items: ["immutable line"] } })] });
    const withdrawn = await h.service.withdrawAllwainProposal("seller", "proposal-1");
    assert.match(h.trace[0], /pg_advisory_xact_lock/);
    assert.match(h.trace[1], /AllwainShoppingList.*FOR UPDATE/);
    assert.match(h.trace[2], /Offer.*FOR UPDATE/);
    assert.deepEqual(withdrawn.meta.items, ["immutable line"]);
  });
  it("rejects catalog withdrawal endpoint; catalog uses close", async () => {
    const h = setup({ offers: [catalog()] });
    await assert.rejects(h.service.withdrawAllwainProposal("seller", "catalog-1"), /PROPOSAL_REQUIRED/);
  });
  it("stale PostgreSQL acceptance rechecks withdrawn offer inside transaction", async () => {
    const h = setup({ offers: [proposal({ allwainStatus: "withdrawn" })] });
    h.prisma.offer.findUnique = async ({ where }) => structuredClone(h.state.rows.get(where.id));
    await assert.rejects(h.store.createAllwainAgreementWithStockPg({ offerId: "proposal-1", userId: "buyer", quantity: 1, contract: { requestId: "request-1" } }), /OFFER_NOT_AVAILABLE/);
    assert.equal(h.state.writes, 0);
  });
  it("closing an awarded JSON publication preserves chosen offer, order and terminal history", async () => {
    const chosen = proposal({ id: "chosen", allwainStatus: "selected" });
    const terminals = ["not_selected", "withdrawn", "closed"].map((status) => proposal({ id: status, allwainStatus: status }));
    const competing = [proposal({ id: "active" }), proposal({ id: "paused", allwainStatus: "paused" }), proposal({ id: "legacy", allwainStatus: null })];
    const contract = { id: "agreement", app: "allwain", offerId: "chosen", requesterUserId: "buyer", providerUserId: "seller", status: "accepted", subtotalAmount: 200 };
    const order = { id: "order", contractId: "agreement", offerId: "chosen", buyerUserId: "buyer", sellerUserId: "seller", status: "paid", subtotalAmount: 200 };
    const request = { id: "request-1", userId: "buyer", status: "awarded", selectedOfferId: "chosen", selectedAt: "2026-10-04T10:00:00Z", visibility: "public", extracted: { productName: "Naranjas" }, title: "Naranjas", description: "Pido naranjas", offers: [], ai: {}, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-04T10:00:00Z" };
    const h = setup({ driver: "json", offers: [chosen, ...terminals, ...competing], requests: [request], contracts: [contract], orders: [order] });
    const saved = await h.service.updateAllwainScanRequest("buyer", "request-1", { status: "closed" });
    assert.equal(saved.status, "closed"); assert.equal(saved.selectedOfferId, "chosen");
    assert.deepEqual(h.state.rows.get("chosen"), chosen);
    for (const offer of terminals) assert.deepEqual(h.state.rows.get(offer.id), offer);
    for (const offer of competing) assert.equal(h.state.rows.get(offer.id).allwainStatus, "withdrawn");
    assert.deepEqual(h.state.contracts, [contract]); assert.deepEqual(h.state.orders, [order]);
    assert.equal(h.state.writes, 3);
  });
});

describe("Pass 2 catalogue editing and history", () => {
  for (const driver of ["json", "postgres"]) {
    it(`edits commercial fields from current metadata and rejects lost update (${driver})`, async () => {
      const h = setup({ driver, offers: [catalog({ meta: { ...catalog().meta, complianceEvidence: "keep", saleMode: "immediate" } })] });
      const saved = await h.service.updateAllwainOffer("seller", "catalog-1", { price: 3, deliveryEstimate: "Recogida mañana", shippingWeightKgPerUnit: 2, locationLabel: "Foios", expectedUpdatedAt: "2026-10-04T10:00:00.000Z" });
      assert.equal(saved.price, 3);
      assert.equal(saved.meta.complianceEvidence, "keep");
      assert.equal(saved.meta.stockQuantity, 10);
      assert.equal(saved.meta.deliveryEstimate, "Recogida mañana");
      await assert.rejects(h.service.updateAllwainOffer("seller", "catalog-1", { price: 4, expectedUpdatedAt: "2026-10-04T10:00:00.000Z" }), /OFFER_VERSION_CONFLICT/);
    });
    it(`locks identity/unit/preorder terms with operations and leaves price snapshots unchanged (${driver})`, async () => {
      const contract = { id: "old", app: "allwain", offerId: "catalog-1", price: 2, subtotalAmount: 2_000, status: "accepted" };
      const h = setup({ driver, offers: [catalog()], contracts: [contract] });
      await assert.rejects(h.service.updateAllwainOffer("seller", "catalog-1", { unit: "pack" }), /OFFER_TERMS_LOCKED/);
      await assert.rejects(h.service.updateAllwainOffer("seller", "catalog-1", { saleMode: "preorder", preorderChargeDeadlineAt: new Date(Date.now() + 86_400_000).toISOString() }), /OFFER_TERMS_LOCKED/);
      const saved = await h.service.updateAllwainOffer("seller", "catalog-1", { price: 4 });
      assert.equal(saved.price, 4);
      assert.equal(contract.subtotalAmount, 2_000);
      await assert.rejects(h.service.updateAllwainOffer("seller", "catalog-1", { productKind: "service" }), /OFFER_TERMS_LOCKED/);
    });
    it(`shows own catalog/proposal history before pagination, never other sellers (${driver})`, async () => {
      const offers = [catalog(), catalog({ id: "closed", allwainStatus: "closed", meta: { archived: true } }), proposal({ allwainStatus: "withdrawn" }), proposal({ id: "foreign", ownerUserId: "stranger", allwainStatus: "withdrawn" })];
      const h = setup({ driver, offers });
      const catalogPage = await h.service.listAllwainOfferPage("seller", { limit: 1, ownerUserId: "seller", type: "catalog", view: "history" });
      assert.deepEqual(Array.from(catalogPage.items, (item) => item.id), ["closed"]);
      const proposalPage = await h.service.listAllwainOfferPage("seller", { limit: 1, ownerUserId: "seller", type: "proposal", view: "history" });
      assert.deepEqual(Array.from(proposalPage.items, (item) => item.id), ["proposal-1"]);
      assert.equal((await h.service.listAllwainOfferPage("buyer", { limit: 30, type: "proposal", view: "history" })).items.some((item) => item.id === "proposal-1"), false);
    });
  }
  it("requires complete new publication to change product compliance identity", async () => {
    const h = setup({ offers: [catalog()] });
    await assert.rejects(h.service.updateAllwainOffer("seller", "catalog-1", { productKind: "appliance" }), /PRODUCT_IDENTITY_CHANGE_REQUIRES_NEW_OFFER/);
    assert.equal(h.state.writes, 0);
  });
});
}
