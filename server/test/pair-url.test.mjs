import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';

const token = 'c'.repeat(32);
const env = { OPENAI_API_KEY: 'a'.repeat(32), DEEPSEEK_API_KEY: 'b'.repeat(32), STT_CLIENT_TOKEN: token };
const pairModule = new URL('../pair.mjs', import.meta.url).href;
function runPair(extraEnv, expectedUrl) {
  return spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import assert from 'node:assert/strict';
    globalThis.fetch = async (url, options) => {
      if (${JSON.stringify(expectedUrl)} !== undefined) assert.equal(url, ${JSON.stringify(expectedUrl)});
      assert.equal(options.headers.Authorization, ${JSON.stringify(`Bearer ${token}`)});
      assert.equal(options.redirect, 'error');
      assert.equal(options.method, 'POST');
      assert.equal(options.body, '{}');
      assert.ok(options.signal);
      return { ok: true, json: async () => ({ code: 'A1B2C3D4E5', private: 'must-not-print' }) };
    };
    await import(${JSON.stringify(pairModule)});
  `], { encoding: 'utf8', env: { SystemRoot: process.env.SystemRoot, ...env, ...extraEnv } });
}

test('pair command keeps the local default and sends operator credentials only to an explicit HTTPS target', () => {
  const local = runPair({}, 'http://127.0.0.1:8787/v1/stt/pairing-codes');
  assert.equal(local.status, 0, local.stderr);
  assert.match(local.stdout, /Local connection code: A1B2C3D4E5/);
  const remote = runPair({ STT_PAIR_URL: 'https://speech.demo.test' }, 'https://speech.demo.test/v1/stt/pairing-codes');
  assert.equal(remote.status, 0, remote.stderr);
  assert.match(remote.stdout, /Connection code: A1B2C3D4E5/);
  assert.doesNotMatch(remote.stdout + remote.stderr, new RegExp(`${token}|must-not-print`));
});

test('pair command rejects unsafe targets before sending credentials and hides target credentials', () => {
  for (const url of ['http://speech.demo.test', 'https://*.demo.test', 'https://user:private-password@speech.demo.test', 'https://speech.demo.test/path', 'https://speech.demo.test?secret=private']) {
    // A called fetch would succeed, so rejection proves URL validation happened first.
    const result = runPair({ STT_PAIR_URL: url });
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout + result.stderr, /A1B2C3D4E5|private-password|secret=private/);
  }
});
