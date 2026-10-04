const assert = require('node:assert/strict');
const { it } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function load(relative, replacements = {}) {
  const file = path.resolve(__dirname, relative);
  const compiled = new Module(file, module);
  compiled.filename = file; compiled.paths = Module._nodeModulePaths(path.dirname(file));
  const original = compiled.require.bind(compiled);
  compiled.require = name => Object.hasOwn(replacements, name) ? replacements[name] : original(name);
  compiled._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, file);
  return compiled.exports;
}
const helper = load('../src/utils/publicationImageSource.ts');
const apiBaseUrl = 'https://api.allwain.example/api';
const token = 'TEST_ONLY_IMAGE_TOKEN';
const filename = '12345678-1234-4abc-9def-123456789abc.png';
const uploadPath = `/api/allwain/media/uploads/${filename}`;
const legitimate = `https://api.allwain.example${uploadPath}`;
const resolve = (imageUrl, extra = {}) => helper.resolvePublicationImageSource({ apiBaseUrl, token, imageUrl, ...extra });
function noCredentials(source) {
  for (const item of Array.isArray(source) ? source : [source]) {
    assert.ok(!Object.keys(item?.headers || {}).some(name => /^(authorization|proxy-authorization|cookie|cookie2)$/i.test(name)));
    assert.ok(!JSON.stringify(item).includes(token));
  }
}

it('attaches the app token only to the exact private image route and reloads protected images', () => {
  assert.deepEqual(resolve(legitimate), { uri: legitimate, cache: 'reload', headers: { Authorization: `Bearer ${token}` } });
  assert.equal(resolve(legitimate.replace('.png', '.jpg')).headers.Authorization, `Bearer ${token}`);
  assert.equal(resolve(legitimate + '?v=1#preview').headers.Authorization, `Bearer ${token}`);
});

it('preserves public external images without sending application credentials', () => {
  for (const url of [`https://images.example${uploadPath}`, `https://api.allwain.example.attacker.example${uploadPath}`,
    `//images.example${uploadPath}`, `https://images.example/photo.jpg?next=${uploadPath}`]) {
    const value = resolve(url); assert.ok(value.uri.startsWith('https://')); noCredentials(value);
  }
});

it('rejects userinfo, protocol downgrades and different ports as credential destinations', () => {
  for (const url of [`https://account@api.allwain.example${uploadPath}`, `https://name:secret@api.allwain.example${uploadPath}`,
    `http://api.allwain.example${uploadPath}`, `https://api.allwain.example:444${uploadPath}`,
    `https://api.allwain.example@images.example${uploadPath}`]) noCredentials(resolve(url));
  assert.equal(resolve(`https://API.ALLWAIN.EXAMPLE:443${uploadPath}`).headers.Authorization, `Bearer ${token}`);
});

it('does not authorize a matching substring in another path, query, fragment or filename', () => {
  for (const suffix of [`/public${uploadPath}`, `/anything?url=${uploadPath}`, `/anything#${uploadPath}`,
    `${uploadPath}/extra`, `${uploadPath}.html`, uploadPath.replace(filename, 'not-an-id.png'),
    `/allwain/media/uploads/${filename}`]) noCredentials(resolve(`https://api.allwain.example${suffix}`));
});

it('fails closed for ambiguous encoded paths, backslashes, dot segments and whitespace', () => {
  for (const url of [legitimate.replace('/uploads/', '/uploads/%2e/'), legitimate.replace('/uploads/', '/uploads/./'),
    legitimate.replace('/uploads/', '/uploads/../uploads/'), legitimate.replace('/uploads/', '/uploads%2f'),
    legitimate.replace('/uploads/', '/uploads\\'), ` ${legitimate}`, legitimate + '\n']) noCredentials(resolve(url));
});

it('resolves relative URLs explicitly against the configured API prefix', () => {
  for (const uri of [uploadPath, `allwain/media/uploads/${filename}`, legitimate]) {
    assert.equal(resolve(uri).uri, legitimate);
    assert.equal(resolve(uri).headers.Authorization, `Bearer ${token}`);
  }
  const custom = resolve(`allwain/media/uploads/${filename}`, { apiBaseUrl: 'http://127.0.0.1:30476/backend/api/' });
  assert.equal(custom.uri, `http://127.0.0.1:30476/backend/api/allwain/media/uploads/${filename}`);
  assert.equal(custom.headers.Authorization, `Bearer ${token}`);
  noCredentials(resolve(`/api/allwain/media/uploads/${filename}`, { apiBaseUrl: 'https://api.allwain.example/backend/api' }));
});

it('fails closed when the configured API cannot establish a trusted absolute origin', () => {
  for (const base of ['/api', 'invalid', 'file:///api', 'https://name@api.allwain.example/api',
    'https://api.allwain.example/api?next=1', 'https://api.allwain.example/api#fragment']) noCredentials(resolve(legitimate, { apiBaseUrl: base }));
  noCredentials(resolve(legitimate, { token: null }));
});

it('sanitizes existing source credentials case-insensitively while preserving asset dimensions and noncredential headers', () => {
  const source = { uri: `https://images.example${uploadPath}`, width: 200, height: 100,
    headers: { aUtHoRiZaTiOn: `Bearer ${token}`, Cookie: 'TEST_COOKIE', 'Proxy-Authorization': 'TEST_PROXY', Accept: 'image/png' } };
  const output = resolve(null, { source });
  noCredentials(output); assert.deepEqual(output.headers, { Accept: 'image/png' });
  assert.equal(output.width, 200); assert.equal(output.height, 100);
  assert.equal(source.headers.aUtHoRiZaTiOn, `Bearer ${token}`, 'input is not mutated');
  assert.equal(resolve(null, { source: { uri: legitimate } }).headers.Authorization, `Bearer ${token}`);
});

it('never lets Android reuse a protected candidate token for an external image candidate', () => {
  const mixed = resolve(null, { source: [{ uri: legitimate, headers: { Authorization: `Bearer ${token}` } },
    { uri: `https://images.example${uploadPath}`, width: 800 }] });
  noCredentials(mixed); assert.equal(mixed[1].width, 800);
  const sameOrigin = resolve(null, { source: [{ uri: legitimate }, { uri: legitimate.replace('.png', '.jpg') }] });
  assert.ok(sameOrigin.every(item => item.headers.Authorization === `Bearer ${token}`));
});

it('preserves bundled/local images and never authenticates a non-GET source', () => {
  const bundled = { uri: '/assets/assets/card-images/oranges.a75d1890c6e556999c5dc0b942fe9ee0.jpg', width: 1280, height: 720 };
  assert.deepEqual(resolve(null, { source: bundled }), bundled);
  noCredentials(resolve(null, { source: { ...bundled, headers: { Authorization: `Bearer ${token}` } } }));
  assert.equal(resolve(null, { source: 42 }), 42);
  assert.equal(resolve(null), null);
  for (const uri of ['data:image/png;base64,TEST', 'file:///tmp/test.png', 'blob:https://api.allwain.example/TEST'])
    noCredentials(resolve(null, { source: { uri, headers: { Authorization: `Bearer ${token}` } } }));
  noCredentials(resolve(null, { source: { uri: legitimate, method: 'POST', headers: { Authorization: `Bearer ${token}` } } }));
});

it('wires both imageUrl and source through the resolver before rendering a mocked native Image', () => {
  const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useEffect: () => {}, useState: () => [false, () => {}] };
  const component = load('../src/components/design-system/PublicationImage.tsx', {
    react, 'react-native': { Image: 'Image', View: 'View', Text: 'Text', StyleSheet: { create: value => value } },
    'lucide-react-native': { ImageIcon: 'ImageIcon' }, '../../i18n/useAppTranslation': { useAppTranslation: () => ({ t: value => value }) },
    '../../store/auth.store': { useAuthStore: select => select({ token }) }, '../../theme/colors': { colors: {} },
    './foundations': { radii: {} }, '../../config/api': { API_BASE_URL: apiBaseUrl }, '../../utils/publicationImageSource': helper,
    '../../data/cardImages': {
      bundledAllwainCardImageSource: () => null,
      inferredAllwainCardImageSource: () => null,
    },
  });
  const image = props => component.PublicationImage(props).props.children.find(child => child?.type === 'Image').props.source;
  noCredentials(image({ imageUrl: `https://images.example${uploadPath}` }));
  assert.equal(image({ imageUrl: legitimate }).headers.Authorization, `Bearer ${token}`);
  noCredentials(image({ source: { uri: `https://images.example${uploadPath}`, headers: { Authorization: `Bearer ${token}` } } }));
  assert.equal(image({ source: 42 }), 42);
});
