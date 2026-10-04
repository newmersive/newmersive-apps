const assert = require('node:assert/strict');
const { it } = require('node:test');
const load = require('./helpers/load-typescript.cjs');

it('routes only a reference and keeps captured documents out of navigation parameters', () => {
  const store = load('src/utils/scanCaptureMemory.ts');
  const input = { imageBase64: 'data:image/png;base64,private-image', rawText: 'private receipt', sourceType: 'image' };
  const route = store.rememberScanCapture(input);
  assert.deepEqual(Object.keys(route), ['captureId']);
  assert.ok(!JSON.stringify(route).includes('private'));
  assert.deepEqual(store.readScanCapture(route.captureId), input);
  store.forgetScanCapture(route.captureId);
  assert.equal(store.readScanCapture(route.captureId), undefined);
});

it('does not duplicate or overwrite captures and bounds retained images', () => {
  const store = load('src/utils/scanCaptureMemory.ts');
  const refs = Array.from({ length: 5 }, (_, i) => store.rememberScanCapture({ rawText: String(i) }));
  assert.equal(store.readScanCapture(refs[0].captureId), undefined);
  for (let i = 1; i < 5; i++) assert.equal(store.readScanCapture(refs[i].captureId).rawText, String(i));
  assert.equal(new Set(refs.map(r => r.captureId)).size, 5);
});

it('an expired reference cannot recover the receipt', () => {
  const store = load('src/utils/scanCaptureMemory.ts');
  const now = Date.now;
  try {
    Date.now = () => 1000;
    const ref = store.rememberScanCapture({ rawText: 'private' });
    Date.now = () => 601001;
    assert.equal(store.readScanCapture(ref.captureId), undefined);
  } finally { Date.now = now; }
});
