const assert = require('node:assert/strict');
const { it } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function load(relative, replacements = {}) {
  const file = path.resolve(__dirname, relative); const compiled = new Module(file, module);
  compiled.filename = file; compiled.paths = Module._nodeModulePaths(path.dirname(file));
  const original = compiled.require.bind(compiled);
  compiled.require = name => Object.hasOwn(replacements, name) ? replacements[name] : original(name);
  compiled._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, file);
  return compiled.exports;
}
const { resolveSellerIncome } = load('../src/utils/sellerIncome.ts');
const summary = rows => ({ scope: 'seller', pendingIncome: [{ currency: 'EUR', amount: 999999 }], incomeSummary: {
  version: 1, basis: 'reconciled_recorded_ledger', reviewCount: rows.reduce((sum, row) => sum + row.reviewCount, 0), byCurrency: rows,
} });
const row = (currency = 'EUR', pendingAmount = 720) => ({ currency, pendingAmount, recoveryAmount: 0, reviewCount: 0 });

it('does not use legacy or paginated original amounts when the verified summary is unavailable', () => {
  for (const value of [null, {}, { pendingIncome: [{ currency: 'EUR', amount: 999999 }] }])
    assert.equal(resolveSellerIncome(value).state, 'unavailable');
});
it('uses the canonical net amount and keeps currencies separate', () => {
  assert.deepEqual(resolveSellerIncome(summary([row(), row('USD', 450)])).items,
    [{ currency: 'EUR', amount: 720 }, { currency: 'USD', amount: 450 }]);
});
it('does not use a buyer response as seller income during a role switch', () => {
  assert.equal(resolveSellerIncome({ ...summary([row()]), scope: 'buyer' }).state, 'unavailable');
});
it('distinguishes verified zero from unavailable income', () => {
  assert.deepEqual(resolveSellerIncome(summary([row('EUR', 0)])), { state: 'ready', items: [] });
});
it('does not present partially verified earnings or recovery amounts as receivable', () => {
  assert.equal(resolveSellerIncome(summary([row(), { ...row('USD'), reviewCount: 1 }])).state, 'review');
  assert.equal(resolveSellerIncome(summary([{ ...row(), recoveryAmount: 180 }])).state, 'review');
});
it('rejects invalid versions, duplicated currencies and malformed amounts', () => {
  for (const value of [summary([row(), row()]), summary([row('EUR', -1)]), summary([row('EUR', 0.5)]),
    { scope: 'seller', incomeSummary: { ...summary([]).incomeSummary, version: 2 } },
    { scope: 'seller', incomeSummary: { ...summary([]).incomeSummary, byCurrency: [null] } }]) assert.equal(resolveSellerIncome(value).state, 'unavailable');
});
it('provides all new income messages in the six supported languages', () => {
  const features = load('../src/i18n/featureResources.ts');
  const { translate } = load('../src/i18n/index.ts', { './featureResources': features });
  for (const locale of ['es', 'en', 'fr', 'it', 'zh', 'ar']) for (const suffix of ['reviewIncome', 'reviewIncomeTitle', 'reviewIncomeHelp', 'incomeUnavailable']) {
    const key = 'home.seller.' + suffix; assert.notEqual(translate(locale, key), key);
    if (!['es', 'en'].includes(locale)) assert.ok(features.featureResources[locale][key]);
  }
});
