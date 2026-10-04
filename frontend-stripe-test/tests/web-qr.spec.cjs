const assert = require('node:assert/strict');
const { it } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const QRCode = require('qrcode');
const source = path.resolve(__dirname, '../src/camera/useLocalWebQRScanner.ts');
const compiled = new Module(source, module);
compiled.filename = source;
compiled.paths = Module._nodeModulePaths(path.dirname(source));
compiled._compile(ts.transpileModule(fs.readFileSync(source, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, source);
const { decodeAllwainQrFrame } = compiled.exports;

function qrFrame(text, inverted = false) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const margin = 4; const scale = 6; const size = (qr.modules.size + margin * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const mx = Math.floor(x / scale) - margin; const my = Math.floor(y / scale) - margin;
    const dark = mx >= 0 && my >= 0 && mx < qr.modules.size && my < qr.modules.size && qr.modules.get(my, mx);
    const value = Boolean(dark) !== inverted ? 0 : 255;
    const offset = (y * size + x) * 4;
    data[offset] = value; data[offset + 1] = value; data[offset + 2] = value; data[offset + 3] = 255;
  }
  return { data, width: size, height: size };
}

it('decodes local referral and delivery payloads without accessing a camera or network', () => {
  for (const payload of ['https://allwain.es/invitacion?ref=TEST123', 'allwain:delivery:TEST-pickup-token']) {
    const decoded = decodeAllwainQrFrame(qrFrame(payload));
    assert.equal(decoded.type, 'qr'); assert.equal(decoded.data, payload);
    assert.equal(decoded.cornerPoints.length, 4); assert.ok(decoded.bounds.size.width > 0);
  }
});
it('reads inverted QR images', () => {
  assert.equal(decodeAllwainQrFrame(qrFrame('TEST-INVERTED', true)).data, 'TEST-INVERTED');
});
it('does not manufacture data from a blank frame', () => {
  assert.equal(decodeAllwainQrFrame({ data: new Uint8ClampedArray(64 * 64 * 4).fill(255), width: 64, height: 64 }), null);
});
