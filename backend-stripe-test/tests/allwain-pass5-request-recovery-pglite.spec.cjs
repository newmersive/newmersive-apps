const assert = require('node:assert/strict');
const { before, after, beforeEach, describe, it } = require('node:test');
const { PGlite } = require('@electric-sql/pglite');
const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const { scalarModelDdl, offer } = require('./allwain-offer-integrity-pglite.spec.cjs');
const recoverySource = require('./helpers/request-recovery-source.cjs');

describe('Pass 5 request recovery with current service SQL and audit chain', () => {
  let database, server, pool, prisma, source;
  const models = ['User', 'Offer', 'Contract', 'AllwainOrder', 'AllwainPayment', 'AllwainScanRequest', 'AllwainProposalRevision', 'AllwainOrderStatusEvent', 'AllwainAuditEvent'];
  before(async () => {
    database = await PGlite.create();
    for (const model of models) await database.exec(scalarModelDdl(model));
    for (const model of models) {
      const primary = await database.query('SELECT conname FROM pg_constraint WHERE conrelid = $1::regclass AND contype = \'p\'', [`"${model}"`]);
      if (!primary.rows.length) await database.exec(`ALTER TABLE "${model}" ADD PRIMARY KEY ("id");`);
    }
    await database.exec('CREATE UNIQUE INDEX recovery_contract_key ON "Contract" ("purchaseKey"); CREATE UNIQUE INDEX recovery_revision_acceptance ON "Contract" ("acceptedProposalRevisionId"); CREATE UNIQUE INDEX recovery_order_contract ON "AllwainOrder" ("contractId"); CREATE UNIQUE INDEX recovery_audit_sequence ON "AllwainAuditEvent" ("aggregateType","aggregateId","sequence"); CREATE UNIQUE INDEX recovery_audit_hash ON "AllwainAuditEvent" ("eventHash");');
    await database.exec('CREATE UNIQUE INDEX recovery_revision_version ON "AllwainProposalRevision" ("offerId","revision");');
    const constraints = await database.query("SELECT COUNT(*) AS count FROM pg_constraint WHERE contype = 'p' AND connamespace = 'public'::regnamespace;"); assert.equal(Number(constraints.rows[0].count), models.length);
    server = new PGLiteSocketServer({ db: database, host: '127.0.0.1', port: 0, maxConnections: 1 }); await server.start();
    const port = /^127\.0\.0\.1:(\d+)$/.exec(server.getServerConn()); assert.ok(port);
    pool = new Pool({ host: '127.0.0.1', port: Number(port[1]), user: 'postgres', database: 'postgres', max: 1 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) }); source = recoverySource(prisma);
  }, { timeout: 30000 });
  after(async () => { if (prisma) await prisma.$disconnect(); if (pool) await pool.end(); if (server) await server.stop(); if (database) await database.close(); });
  beforeEach(async () => {
    await database.exec(`TRUNCATE ${models.map(name => `"${name}"`).join(',')};`);
    await prisma.user.createMany({ data: [{ id: 'buyer', name: 'Comprador', email: 'buyer@fixture.invalid', role: 'user' }, { id: 'seller', name: 'Vendedor', email: 'seller@fixture.invalid', role: 'company' }, { id: 'alternative', name: 'Alternativa', email: 'alternative@fixture.invalid', role: 'company' }] });
  });
  async function addProposal(id, extra = {}) {
    const row = offer(id, { ownerUserId: id === 'winner' ? 'seller' : 'alternative', allwainType: 'proposal', requestId: 'request', allwainStatus: 'not_selected', proposalRevision: 1, proposalExpiresAt: new Date('2099-01-01T00:00:00Z'), currency: 'EUR', ...extra });
    if (row.allwainStatus === 'not_selected' && extra.meta === undefined) row.meta = source.recovery.allwainSelectionClosureMeta(row, 'winner');
    if (row.meta?.selectionClosure) row.meta.selectionClosure.previousStatus = extra.previousStatus || 'active';
    delete row.previousStatus;
    await prisma.offer.create({ data: row });
    await prisma.allwainProposalRevision.create({ data: { id: `${id}-revision`, offerId: id, revision: 1, sellerUserId: row.ownerUserId, requestId: 'request', totalAmount: 200, currency: 'EUR', description: 'Precio y condiciones', deliveryEstimate: 'Mañana', validUntil: new Date('2099-01-01T00:00:00Z'), payload: { original: id }, snapshotHash: `snapshot-${id}`, status: id === 'winner' ? 'accepted' : 'current', ...(id === 'winner' ? { acceptedAt: new Date('2026-10-01') } : {}) } });
    return row;
  }
  async function seed(extra = {}) {
    await prisma.allwainScanRequest.create({ data: { id: 'request', userId: 'buyer', sourceType: 'manual', title: 'Naranjas', description: 'Pedido realista aislado', status: 'awarded', visibility: 'public', selectedOfferId: 'winner', selectedAt: new Date('2026-10-01'), extracted: { productName: 'Naranjas', quantity: 1 }, offers: [], ai: { original: true } } });
    await addProposal('winner', { allwainStatus: 'selected', meta: { inventoryManaged: true, stockQuantity: 10, availableQuantity: 9, reservedQuantity: 1, soldQuantity: 0, unit: 'kg' } }); await addProposal('valid');
    const contract = await prisma.contract.create({ data: { id: 'contract', app: 'allwain', type: 'sale', status: 'partially_accepted', offerId: 'winner', requestId: 'request', acceptedProposalRevisionId: 'winner-revision', purchaseKey: 'first-intent', requesterUserId: 'buyer', providerUserId: 'seller', requesterAcceptedAt: new Date('2026-10-01'), quantity: 1, unit: 'kg', unitPrice: 2, totalPrice: 2, currency: 'EUR', subtotalAmount: 200, platformFeeBps: 1000, platformFeeAmount: 20, sellerAmount: 180, paymentStatus: 'awaiting_seller', inventoryStatus: 'reserved', ...extra.contract } });
    const order = await prisma.allwainOrder.create({ data: { id: 'order', contractId: contract.id, offerId: 'winner', buyerUserId: 'buyer', sellerUserId: 'seller', status: 'awaiting_seller', paymentStatus: 'awaiting_seller', quantity: 1, unit: 'kg', unitPriceAmount: 200, subtotalAmount: 200, totalAmount: 200, platformFeeBps: 1000, platformFeeAmount: 20, sellerAmount: 180, inventoryStatus: 'reserved', ...extra.order } });
    return { contract, order };
  }
  const request = () => prisma.allwainScanRequest.findUnique({ where: { id: 'request' } });
  const savedOffer = id => prisma.offer.findUnique({ where: { id } });
  const recoveryEvents = () => prisma.allwainAuditEvent.findMany({ where: { eventType: 'market_request.reopened_after_unpaid_attempt' } });

  it('seller rejection reopens atomically, releases stock once and preserves contract/order/accepted revision and audit references', async () => {
    await seed(); const revision = await prisma.allwainProposalRevision.findUnique({ where: { id: 'winner-revision' } });
    const rejected = await source.store.rejectAllwainContractWithInventoryPg('contract', 'seller'); assert.equal(rejected.status, 'rejected');
    const reopened = await request(); assert.equal(reopened.status, 'submitted'); assert.equal(reopened.selectedOfferId, null); assert.equal(reopened.selectedAt, null); assert.equal(reopened.ai.original, true); assert.deepEqual(reopened.ai.recovery.eligibleAlternativeIds, ['valid']);
    assert.equal((await savedOffer('valid')).allwainStatus, 'active'); assert.equal((await savedOffer('winner')).allwainStatus, 'withdrawn'); assert.equal((await savedOffer('winner')).meta.reservedQuantity, 0); assert.equal((await savedOffer('winner')).meta.availableQuantity, 10);
    assert.deepEqual(await prisma.allwainProposalRevision.findUnique({ where: { id: 'winner-revision' } }), revision); assert.equal(await prisma.contract.count(), 1); assert.equal((await prisma.allwainOrder.findUnique({ where: { id: 'order' } })).status, 'canceled');
    const events = await recoveryEvents(); assert.equal(events.length, 1); assert.equal(events[0].payload.contractId, 'contract'); assert.equal(events[0].orderId, 'order'); assert.equal((await source.audit.verifyAllwainAuditChain('market_request', 'request')).valid, true);
    await source.store.rejectAllwainContractWithInventoryPg('contract', 'seller'); assert.equal((await recoveryEvents()).length, 1); assert.equal((await savedOffer('winner')).meta.availableQuantity, 10);
  });
  it('buyer cancellation uses real payment service, preserves attempt and retry key, and does not duplicate recovery on retry', async () => {
    await seed({ contract: { status: 'accepted', paymentStatus: 'awaiting_payment' }, order: { status: 'awaiting_payment', paymentStatus: 'awaiting_payment' } });
    const canceled = await source.payments.cancelAllwainOrder('buyer', 'order', 'trace'); assert.equal(canceled.status, 'canceled'); assert.equal((await request()).status, 'submitted');
    const contract = await prisma.contract.findUnique({ where: { id: 'contract' } }); assert.equal(contract.status, 'accepted'); assert.equal(contract.purchaseKey, 'first-intent'); assert.equal(contract.paymentStatus, 'canceled');
    await source.payments.cancelAllwainOrder('buyer', 'order', 'trace-retry'); assert.equal((await recoveryEvents()).length, 1); assert.equal(await prisma.contract.count(), 1);
    assert.equal((await source.audit.verifyAllwainAuditChain('market_request', 'request')).valid, true);
  });
  it('revalidates immutable current revision, expiry, seller, stock, archival and pause provenance before restoring alternatives', async () => {
    await seed();
    for (const [id, extra] of [['expired', { proposalExpiresAt: new Date('2000-01-01') }], ['paused', { previousStatus: 'paused' }], ['withdrawn', { allwainStatus: 'withdrawn' }], ['unknown-legacy', { meta: { validUntil: '2099-01-01T00:00:00Z' } }], ['no-stock', { meta: { inventoryManaged: true, stockQuantity: 0, availableQuantity: 0, selectionClosure: { selectedOfferId: 'winner', previousStatus: 'active' } } }], ['archived', { meta: { archived: true, selectionClosure: { selectedOfferId: 'winner', previousStatus: 'active' } } }], ['stale-revision', {}], ['deleted-seller', {}]]) await addProposal(id, extra);
    await prisma.allwainProposalRevision.update({ where: { id: 'stale-revision-revision' }, data: { status: 'superseded' } });
    await prisma.user.create({ data: { id: 'deleted', name: 'Retirado', email: 'deleted@fixture.invalid', role: 'company', deletedAt: new Date() } }); await prisma.offer.update({ where: { id: 'deleted-seller' }, data: { ownerUserId: 'deleted' } }); await prisma.allwainProposalRevision.update({ where: { id: 'deleted-seller-revision' }, data: { sellerUserId: 'deleted' } });
    await source.store.rejectAllwainContractWithInventoryPg('contract', 'seller'); assert.deepEqual((await request()).ai.recovery.eligibleAlternativeIds, ['valid']);
    for (const id of ['expired', 'paused', 'unknown-legacy', 'no-stock', 'archived', 'stale-revision', 'deleted-seller']) assert.equal((await savedOffer(id)).allwainStatus, 'not_selected'); assert.equal((await savedOffer('withdrawn')).allwainStatus, 'withdrawn');
  });
  it('closed, canceled or archived request is never reopened by a later reject or cancel callback', async () => {
    for (const status of ['closed', 'canceled', 'archived']) {
      await database.exec(`TRUNCATE ${models.filter(name => name !== 'User').map(name => `"${name}"`).join(',')};`); await seed(); await prisma.allwainScanRequest.update({ where: { id: 'request' }, data: { status, closedAt: new Date() } });
      await source.store.rejectAllwainContractWithInventoryPg('contract', 'seller'); assert.equal((await request()).status, status); assert.equal((await request()).selectedOfferId, 'winner'); assert.equal((await recoveryEvents()).length, 0);
    }
  });
  it('paid, disputed, refunded and recurring evidence blocks release/reopen even if a stale aggregate appears unpaid', async () => {
    for (const evidence of [{ paidAt: new Date() }, { disputeStatus: 'lost' }, { refundedAmount: 20 }, { recurringPlanId: 'recurring' }, { inventoryStatus: 'sold' }, { paymentStatus: 'paid' }]) {
      await database.exec(`TRUNCATE ${models.filter(name => name !== 'User').map(name => `"${name}"`).join(',')};`); await seed({ order: evidence }); const before = await savedOffer('winner');
      await assert.rejects(source.store.rejectAllwainContractWithInventoryPg('contract', 'seller'), /INVALID_CONTRACT_STATUS/); assert.equal((await request()).status, 'awarded'); assert.deepEqual(await savedOffer('winner'), before); assert.equal((await recoveryEvents()).length, 0);
    }
  });
  it('payment records provide an independent financial barrier and rejected foreign owners perform no write', async () => {
    await seed(); await prisma.allwainPayment.create({ data: { id: 'charged', orderId: 'order', status: 'paid', amount: 200, currency: 'EUR', platformFeeAmount: 20, sellerAmount: 180, paidAt: new Date() } });
    await assert.rejects(source.store.rejectAllwainContractWithInventoryPg('contract', 'seller'), /INVALID_CONTRACT_STATUS/); await assert.rejects(source.store.rejectAllwainContractWithInventoryPg('contract', 'stranger'), /CONTRACT_NOT_FOUND/);
    assert.equal((await request()).status, 'awarded'); assert.equal((await savedOffer('winner')).meta.reservedQuantity, 1);
  });
  it('audit failure rolls request, proposals, contract, order and inventory back together', async () => {
    await seed(); const before = { request: await request(), winner: await savedOffer('winner'), alternative: await savedOffer('valid'), contract: await prisma.contract.findUnique({ where: { id: 'contract' } }), order: await prisma.allwainOrder.findUnique({ where: { id: 'order' } }) };
    const failing = recoverySource(prisma, { failRecoveryAudit: true }); await assert.rejects(failing.store.rejectAllwainContractWithInventoryPg('contract', 'seller'), /AUDIT_WRITE_FAILED/);
    assert.deepEqual(await request(), before.request); assert.deepEqual(await savedOffer('winner'), before.winner); assert.deepEqual(await savedOffer('valid'), before.alternative); assert.deepEqual(await prisma.contract.findUnique({ where: { id: 'contract' } }), before.contract); assert.deepEqual(await prisma.allwainOrder.findUnique({ where: { id: 'order' } }), before.order); assert.equal(await prisma.allwainAuditEvent.count(), 0);
  });
  async function selectAlternative(id = 'valid', purchaseKey = 'second-intent') {
    const previous = await prisma.contract.findUnique({ where: { id: 'contract' } }), proposal = await savedOffer(id);
    return source.store.createAllwainAgreementWithStockPg({ offerId: id, userId: 'buyer', quantity: 1, contract: { ...previous, id: `contract-${purchaseKey}`, offerId: id, providerUserId: proposal.ownerUserId, purchaseKey, status: 'partially_accepted', acceptedProposalRevisionId: null, paymentStatus: 'awaiting_seller', inventoryStatus: 'reserved', createdAt: new Date() } });
  }
  it('new winner creates a distinct audited attempt while old purchaseKey retry remains the canceled history', async () => {
    await seed(); await source.store.rejectAllwainContractWithInventoryPg('contract', 'seller');
    await assert.rejects(selectAlternative('winner', 'attempt-again'), /OFFER_NOT_AVAILABLE/);
    const selected = await selectAlternative(); assert.equal(selected.offerId, 'valid'); assert.equal((await request()).selectedOfferId, 'valid'); assert.equal((await request()).status, 'awarded'); assert.equal(await prisma.contract.count(), 2); assert.equal(await prisma.allwainOrder.count(), 2);
    const retry = await source.store.createAllwainAgreementWithStockPg({ offerId: 'winner', userId: 'buyer', quantity: 1, contract: { id: 'ignored-retry', purchaseKey: 'first-intent' } }); assert.equal(retry.id, 'contract'); assert.equal(retry.status, 'rejected');
    await source.store.rejectAllwainContractWithInventoryPg('contract', 'seller'); assert.equal((await request()).selectedOfferId, 'valid'); assert.equal((await recoveryEvents()).length, 1);
    assert.equal((await source.audit.verifyAllwainAuditChain('market_request', 'request')).valid, true);
  });
  it('overlapping reject/cancel workflows release once; a late cancellation of old attempt cannot undo the next winner', async () => {
    await seed();
    const outcomes = await Promise.allSettled([source.payments.cancelAllwainOrder('buyer', 'order'), source.store.rejectAllwainContractWithInventoryPg('contract', 'seller')]); assert.ok(outcomes.every(outcome => outcome.status === 'fulfilled'));
    assert.equal((await recoveryEvents()).length, 1); assert.equal((await savedOffer('winner')).meta.availableQuantity, 10); assert.equal((await savedOffer('winner')).meta.reservedQuantity, 0);
    const [selected, oldCanceled] = await Promise.all([selectAlternative(), source.payments.cancelAllwainOrder('buyer', 'order')]); assert.equal(selected.offerId, 'valid'); assert.equal(oldCanceled.id, 'order'); assert.equal((await request()).selectedOfferId, 'valid'); assert.equal((await request()).status, 'awarded');
    assert.equal((await savedOffer('valid')).meta.reservedQuantity, 1); assert.equal((await recoveryEvents()).length, 1);
  });
  it('selection stores prior active/paused state in SQL and recovery restores only the active one', async () => {
    await seed(); await source.store.rejectAllwainContractWithInventoryPg('contract', 'seller');
    await addProposal('new-active', { allwainStatus: 'active' }); await addProposal('new-paused', { allwainStatus: 'paused' });
    await selectAlternative(); assert.equal((await savedOffer('new-active')).meta.selectionClosure.previousStatus, 'active'); assert.equal((await savedOffer('new-paused')).meta.selectionClosure.previousStatus, 'paused');
    await source.store.rejectAllwainContractWithInventoryPg('contract-second-intent', 'alternative');
    assert.equal((await savedOffer('new-active')).allwainStatus, 'active'); assert.equal((await savedOffer('new-paused')).allwainStatus, 'not_selected');
  });
  it('cancel refuses stale paid evidence before releasing inventory, and recovery audit failure also rolls cancel back', async () => {
    await seed({ contract: { status: 'accepted', paymentStatus: 'awaiting_payment' }, order: { status: 'awaiting_payment', paymentStatus: 'awaiting_payment', paidAt: new Date() } });
    const original = await savedOffer('winner'); await assert.rejects(source.payments.cancelAllwainOrder('buyer', 'order'), /ORDER_NO_LONGER_CANCELABLE/); assert.deepEqual(await savedOffer('winner'), original); assert.equal((await request()).status, 'awarded');
    await prisma.allwainOrder.update({ where: { id: 'order' }, data: { paidAt: null } }); const failing = recoverySource(prisma, { failRecoveryAudit: true });
    await assert.rejects(failing.payments.cancelAllwainOrder('buyer', 'order'), /AUDIT_WRITE_FAILED/); assert.deepEqual(await savedOffer('winner'), original); assert.equal((await request()).status, 'awarded'); assert.equal((await prisma.allwainOrder.findUnique({ where: { id: 'order' } })).status, 'awaiting_payment'); assert.equal((await recoveryEvents()).length, 0);
  });
  it('an explicit retry safely recovers a historic awarded request once without replaying payment or stock writes', async () => {
    for (const action of ['reject', 'cancel']) {
      await database.exec(`TRUNCATE ${models.filter(name => name !== 'User').map(name => `"${name}"`).join(',')};`);
      await seed({ contract: { status: 'rejected', paymentStatus: 'canceled', inventoryStatus: 'released' }, order: { status: 'canceled', paymentStatus: 'canceled', inventoryStatus: 'released', canceledAt: new Date('2026-10-01') } });
      const winner = await savedOffer('winner'); await prisma.offer.update({ where: { id: 'winner' }, data: { meta: { ...winner.meta, reservedQuantity: 0, availableQuantity: 10 } } });
      const alternative = await savedOffer('valid'), { selectionClosure: _removed, ...legacyMeta } = alternative.meta; await prisma.offer.update({ where: { id: 'valid' }, data: { meta: legacyMeta } });
      const preserved = { order: await prisma.allwainOrder.findUnique({ where: { id: 'order' } }), contract: await prisma.contract.findUnique({ where: { id: 'contract' } }) };
      for (let retry = 0; retry < 2; retry++) {
        if (action === 'reject') await source.store.rejectAllwainContractWithInventoryPg('contract', 'seller'); else await source.payments.cancelAllwainOrder('buyer', 'order');
      }
      assert.equal((await request()).status, 'submitted'); assert.deepEqual((await request()).ai.recovery.eligibleAlternativeIds, []); assert.equal((await savedOffer('valid')).allwainStatus, 'not_selected'); assert.equal((await savedOffer('winner')).meta.availableQuantity, 10); assert.equal((await savedOffer('winner')).meta.reservedQuantity, 0);
      assert.deepEqual(await prisma.allwainOrder.findUnique({ where: { id: 'order' } }), preserved.order); assert.deepEqual(await prisma.contract.findUnique({ where: { id: 'contract' } }), preserved.contract); assert.equal((await recoveryEvents()).length, 1); assert.equal(await prisma.allwainOrderStatusEvent.count(), 0);
    }
  });
});
