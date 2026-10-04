const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const { Prisma } = require('@prisma/client');
const { sourceModules } = require('../allwain-offer-integrity-pglite.spec.cjs');
module.exports = function recoverySource(prisma, options = {}) {
  const modules = new Map(), root = path.resolve(__dirname, '../..');
  const ENV = { STORAGE_DRIVER: 'postgres', NODE_ENV: 'test', ALLWAIN_AUDIT_HMAC_SECRET: 'isolated-recovery-hmac-fixture', ALLWAIN_CURRENCY: 'eur', ALLWAIN_PLATFORM_FEE_BPS: 1000, ALLWAIN_CONNECTOR_FEE_BPS: 0, ALLWAIN_RESERVATION_MINUTES: 60 };
  function load(name) {
    if (modules.has(name)) return modules.get(name).exports;
    const filename = path.join(root, 'src/services', `${name}.ts`), module = { exports: {} }; modules.set(name, module);
    const javascript = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const request = id => {
      if (id === '@prisma/client') return { Prisma };
      if (id === '../config/env') return { ENV };
      if (id === '../db/prisma') return { getPrisma: () => prisma };
      if (id === './allwain-audit' && (options.failAudit || options.failRecoveryAudit)) return { ...load('allwain-audit'), appendAllwainAuditEventTx: async (tx, input) => { if (options.failAudit || input.eventType === 'market_request.reopened_after_unpaid_attempt') throw Error('AUDIT_WRITE_FAILED'); return load('allwain-audit').appendAllwainAuditEventTx(tx, input); } };
      if (id.startsWith('./')) return load(id.slice(2));
      if (id === 'crypto' || id.startsWith('node:')) return require(id);
      throw Error(`Unexpected isolated recovery import ${id}`);
    };
    vm.runInNewContext(javascript, { module, exports: module.exports, require: request, Buffer, Date, URL }, { filename });
    return module.exports;
  }
  const audit = load('allwain-audit'), recovery = load('allwain-request-recovery');
  const appendAudit = async (tx, input) => { if (options.failAudit || options.failRecoveryAudit && input.eventType === 'market_request.reopened_after_unpaid_attempt') throw Error('AUDIT_WRITE_FAILED'); return audit.appendAllwainAuditEventTx(tx, input); };
  const source = sourceModules(prisma, { realModels: ['allwainScanRequest'], appendAudit, stubs: {
    './allwain-request-recovery': recovery, './allwain-money': load('allwain-money'), './allwain-payment-state': load('allwain-payment-state'),
    './allwain-purchase-analytics': load('allwain-purchase-analytics'),
    './allwain-proposals': load('allwain-proposals'),
    './allwain-compliance.service': { ensureAllwainOrderComplianceTx: async () => {} },
    './allwain-notifications.service': { notifyAllwainOrderParticipants: async () => {}, notifyAllwainUser: async () => {} },
  } });
  return { ...source, recovery, audit, payments: source.load('allwain-payments.service') };
};
