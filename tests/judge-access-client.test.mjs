import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createJudgeAccessClient, judgeAccessMessages, takeJudgeAccessKey } from '../src/judge-access-client.ts';
import { judgeAccessRows } from '../src/judge-access-copy.ts';
import { hasTranslation, translate } from '../src/locale.ts';

const key = 'a'.repeat(43);
const grant = () => ({ token: 't'.repeat(43), expiresAt: Date.now() + 3500000 });
const response = (body, status = 201) => new Response(JSON.stringify(body), { status });
function setup(fetcher, more = {}) {
  const credentials = { current: null }, states = [];
  const client = createJudgeAccessClient({ origin: 'https://demo.example', credentials, fetcher, onState: state => states.push(state), ...more });
  return { client, credentials, states };
}
test('private key is consumed from HTTPS fragment and removed from current history', () => {
  let cleaned;
  assert.equal(takeJudgeAccessKey({ href: `https://demo.example/demo#access=${key}` }, url => { cleaned = url; }), key);
  assert.equal(cleaned, 'https://demo.example/demo');
});
test('invalid, duplicate, query-string or HTTP access never becomes a credential', () => {
  for (const href of [`https://demo.example/demo#access=no`, `https://demo.example/demo#access=${key}&access=${key}`, `http://demo.example/demo#access=${key}`, `https://demo.example/demo?access=${key}`]) {
    assert.equal(takeJudgeAccessKey({ href }, () => {}), null);
  }
});
test('one same-origin POST exchanges private key for existing memory-only grant', async () => {
  let request;
  const expected = grant();
  const { client, credentials, states } = setup(async (url, init) => { request = { url, init }; return response(expected); });
  await client.connect(key);
  assert.equal(request.url, 'https://demo.example/v1/demo/clients');
  assert.deepEqual(JSON.parse(request.init.body), { accessKey: key });
  assert.equal(request.init.redirect, 'error');
  assert.equal(request.init.credentials, 'omit');
  assert.deepEqual(credentials.current, expected);
  assert.equal(states.at(-1).phase, 'connected');
});
test('reopening a private link renews a locally unexpired grant that may be stale after server restart', async () => {
  const original = grant(); let calls = 0;
  const renewed = { token: 'r'.repeat(43), expiresAt: Date.now() + 3500000 };
  const { client, credentials } = setup(async () => { calls++; return response(renewed); });
  credentials.current = original;
  await client.connect(key);
  assert.equal(calls, 1); assert.deepEqual(credentials.current, renewed);
});
test('duplicate starts are single-flight and disposal prevents stale grant publication', async () => {
  let release, calls = 0;
  const { client, credentials } = setup(async () => { calls++; return new Promise(resolve => { release = resolve; }); });
  const first = client.connect(key); const second = client.connect(key);
  assert.equal(calls, 1);
  client.dispose(); release(response(grant()));
  await Promise.all([first, second]);
  assert.equal(credentials.current, null);
});
test('HTTP errors show only safe fixed text and allow explicit retry', async () => {
  for (const [status, word] of [[401, 'expired'], [404, 'not available'], [429, 'busy'], [500, 'reach']]) {
    let calls = 0;
    const { client, states, credentials } = setup(async () => ++calls === 1 ? response({ secret: 'do not display me' }, status) : response(grant()));
    await client.connect(key);
    assert.equal(states.at(-1).phase, 'error');
    assert.match(states.at(-1).message, new RegExp(word));
    assert.doesNotMatch(states.at(-1).message, /do not display/);
    assert.equal(credentials.current, null);
    await client.connect(key); assert.ok(credentials.current);
  }
});
test('malformed or overly long-lived grants and non-HTTPS origins are rejected', async () => {
  for (const bad of [{ token: 'short', expiresAt: Date.now() + 5000 }, { ...grant(), expiresAt: Date.now() + 7200000 }, { ...grant(), expiresAt: 0 }]) {
    const { client, credentials, states } = setup(async () => response(bad));
    await client.connect(key); assert.equal(credentials.current, null); assert.equal(states.at(-1).phase, 'error');
  }
  let calls = 0;
  const { client } = setup(async () => { calls++; return response(grant()); }, { origin: 'http://demo.example' });
  await client.connect(key); assert.equal(calls, 0);
});
test('timeout is visible and retry is possible rather than an endless connecting state', async () => {
  let calls = 0;
  const { client, states, credentials } = setup(async (_url, init) => {
    if (++calls > 1) return response(grant());
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('timed out')), { once: true }));
  }, { timeoutMs: 5 });
  await client.connect(key);
  assert.equal(states.at(-1).phase, 'error');
  assert.equal(states.at(-1).message, judgeAccessMessages.unavailable);
  await client.connect(key); assert.ok(credentials.current);
});
test('a concurrent established grant is not replaced by the older request', async () => {
  let release;
  const { client, credentials } = setup(async () => new Promise(resolve => { release = resolve; }));
  const pending = client.connect(key), newer = { token: 'n'.repeat(43), expiresAt: Date.now() + 3500000 };
  credentials.current = newer;
  release(response(grant())); await pending;
  assert.equal(credentials.current, newer);
});
test('judge access messages and interface copy are translated into Urdu and Roman Urdu', () => {
  for (const copy of [...Object.values(judgeAccessMessages), ...judgeAccessRows.map(row => row[0])]) {
    assert.ok(hasTranslation(copy), copy);
    assert.notEqual(translate('اردو', copy), copy);
    assert.notEqual(translate('Roman Urdu', copy), copy);
    assert.doesNotMatch(translate('Roman Urdu', copy), /\p{Script=Arabic}/u);
  }
});
