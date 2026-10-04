const assert = require('node:assert/strict');
const { it } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const script = fs.readFileSync(path.join(__dirname, '../public/oauth/normalize-google-return.js'), 'utf8');

it('restores the registered callback path without losing state or the OAuth fragment', () => {
  let replaced;
  const state = { navigation: 1 };
  vm.runInNewContext(script, { window: {
    location: { pathname: '/oauth/google/', search: '?scope=openid', hash: '#state=TEST_STATE&id_token=TEST_ONLY' },
    history: { state, replaceState: (...args) => { replaced = args; } },
  } });
  assert.equal(replaced[0], state);
  assert.equal(replaced[2], '/oauth/google?scope=openid#state=TEST_STATE&id_token=TEST_ONLY');
});

it('does not rewrite the original callback or unrelated routes', () => {
  for (const pathname of ['/oauth/google', '/app/', '/', '/oauth/other/']) {
    vm.runInNewContext(script, { window: { location: { pathname }, history: { replaceState: () => assert.fail('Unexpected rewrite') } } });
  }
});
