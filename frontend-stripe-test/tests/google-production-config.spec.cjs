const assert = require('node:assert/strict');
const { it } = require('node:test');
const load = require('./helpers/load-typescript.cjs');

it('keeps Google available in isolated builds without environment files, allowing explicit overrides', () => {
  const names = ['WEB', 'ANDROID', 'IOS'].map(platform => `EXPO_PUBLIC_GOOGLE_${platform}_CLIENT_ID`);
  const saved = names.map(name => process.env[name]);
  try {
    names.forEach(name => delete process.env[name]);
    const config = load('src/config/env.ts').googleAuthClientIds;
    for (const platform of ['web', 'android', 'ios']) assert.match(config[platform], /^20121163354-[a-z0-9]+\.apps\.googleusercontent\.com$/);
    process.env[names[0]] = 'test-client.apps.googleusercontent.com';
    assert.equal(load('src/config/env.ts').googleAuthClientIds.web, 'test-client.apps.googleusercontent.com');
  } finally {
    names.forEach((name, index) => saved[index] === undefined ? delete process.env[name] : process.env[name] = saved[index]);
  }
});
