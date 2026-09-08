import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { createClientAccess } from '../client-access.mjs';
import { createSpeechServer } from '../server.mjs';
import { readConfig } from '../config.mjs';
import { createStaticWebHandler } from '../static-web.mjs';

const origin = 'https://demo.example.test';
const accessKey = 'j'.repeat(43);
const operatorToken = 'operator-test-token-that-is-at-least-32-characters';
const audio = { encoding: 'linear16', sampleRate: 16000, channels: 1 };
const image = { mimeType: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4AAAAABJRU5ErkJggg==' };
const visionResult = { task: 'objects', description: 'A cup is visible.', spokenDescription: 'A cup is visible.', objects: ['cup'], gesture: null, uncertain: false };

test('judge configuration is disabled by default, explicit, separate from provider/operator keys and safely expires', () => {
  const env = { OPENAI_API_KEY: 'a'.repeat(43), DEEPSEEK_API_KEY: 'b'.repeat(43), STT_CLIENT_TOKEN: operatorToken,
    STT_DEPLOYMENT: 'public', STT_PUBLIC_URL: origin };
  assert.equal(readConfig(env).judgeAccessKey, undefined);
  const configured = { ...env, JUDGE_ACCESS_KEY: accessKey, JUDGE_ACCESS_EXPIRES_AT: '2099-01-01T00:00:00.000Z' };
  assert.equal(readConfig(configured).judgeAccessKey, accessKey);
  assert.equal(readConfig(configured).judgeAccessExpiresAt, Date.parse(configured.JUDGE_ACCESS_EXPIRES_AT));
  for (const override of [{ JUDGE_ACCESS_EXPIRES_AT: '' }, { JUDGE_ACCESS_KEY: '' }, { JUDGE_ACCESS_KEY: 'short' },
    { JUDGE_ACCESS_EXPIRES_AT: 'January 1 2099' }, { JUDGE_ACCESS_KEY: env.OPENAI_API_KEY },
    { STT_DEPLOYMENT: 'local', STT_ALLOWED_ORIGINS: 'http://localhost:8081' }]) {
    assert.throws(() => readConfig({ ...configured, ...override }), /JUDGE_ACCESS/);
  }
  // An expired invitation must not take down the existing backend after a restart.
  assert.equal(readConfig({ ...configured, JUDGE_ACCESS_EXPIRES_AT: '2020-01-01T00:00:00.000Z' }).judgeAccessExpiresAt,
    Date.parse('2020-01-01T00:00:00.000Z'));
});

test('judge grants are origin bound, deadline capped and do not consume the independent one-time pairing code', () => {
  let now = 0;
  const access = createClientAccess({ now: () => now, judge: { accessKey, origin, expiresAt: 1000 } });
  const code = access.newCode();
  assert.equal(access.judgeGrant(accessKey, undefined).code, 'judge_unavailable');
  assert.equal(access.judgeGrant(accessKey, 'humahang://native').code, 'judge_unavailable');
  assert.equal(access.judgeGrant('wrong', origin).code, 'judge_invalid');
  const { grant } = access.judgeGrant(accessKey, origin);
  assert.equal(grant.expiresAt, 1000);
  assert.notEqual(grant.token, accessKey);
  assert.ok(access.pair(code, origin));
  assert.equal(access.authorize(`Bearer ${grant.token}`, origin), true);
  assert.equal(access.authorize(`Bearer ${grant.token}`, 'https://other.example'), false);
  now = 1000;
  assert.equal(access.authorize(`Bearer ${grant.token}`, origin), false);
  assert.equal(access.judgeGrant(accessKey, origin).code, 'judge_unavailable');
});

test('all judge grants share non-resetting speech, vision and issuance budgets without affecting paired clients', () => {
  const access = createClientAccess({ now: () => 0, judge: { accessKey, origin, expiresAt: 10000,
    limits: { grants: 2, speech: 1, vision: 1 } } });
  const first = access.judgeGrant(accessKey, origin).grant;
  const second = access.judgeGrant(accessKey, origin).grant;
  assert.equal(access.reserve(`Bearer ${first.token}`, origin, 'speech'), true);
  assert.equal(access.reserve(`Bearer ${second.token}`, origin, 'speech'), false);
  assert.equal(access.reserve(`Bearer ${second.token}`, origin, 'vision'), true);
  assert.equal(access.reserve(`Bearer ${first.token}`, origin, 'vision'), false);
  access.revoke(`Bearer ${first.token}`, origin);
  assert.equal(access.judgeGrant(accessKey, origin).code, 'judge_limit');
  const paired = access.pair(access.newCode(), origin);
  assert.ok(paired);
  assert.equal(access.reserve(`Bearer ${paired.token}`, origin, 'speech'), true);
  assert.equal(access.reserve(`Bearer ${paired.token}`, origin, 'vision'), true);
});

test('default judge allowance is bounded to thirty grants, thirty speech sessions and sixty image operations', () => {
  const access = createClientAccess({ now: () => 0, judge: { accessKey, origin, expiresAt: 7200000 } });
  const first = access.judgeGrant(accessKey, origin).grant;
  assert.equal(first.expiresAt, 3600000);
  for (let i = 1; i < 30; i++) assert.ok(access.judgeGrant(accessKey, origin).grant);
  assert.equal(access.judgeGrant(accessKey, origin).code, 'judge_limit');
  for (const [kind, limit] of [['speech', 30], ['vision', 60]]) {
    for (let i = 0; i < limit; i++) assert.equal(access.reserve(`Bearer ${first.token}`, origin, kind), true);
    assert.equal(access.reserve(`Bearer ${first.token}`, origin, kind), false);
  }
});

async function fixture(t, overrides = {}) {
  let now = Date.now(), providerCalls = 0;
  const app = createSpeechServer({ clientToken: operatorToken, deployment: 'public', publicHost: 'demo.example.test',
    publicUrl: origin, origins: [origin], judgeAccessKey: accessKey, judgeAccessExpiresAt: now + 60000,
    judgeLimits: { speech: 1, vision: 1 }, ...overrides }, {
    now: () => now, convert: async () => [],
    connect: () => { providerCalls++; throw Error('Provider must not be called during setup'); },
    analyzeVision: async () => { providerCalls++; return visionResult; },
    translateVision: async () => { providerCalls++; return visionResult; },
  });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  t.after(() => app.close());
  const request = (route, body, headers = {}) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: app.server.address().port, path: route, method: 'POST',
      headers: { Host: 'demo.example.test', Origin: origin, 'Content-Type': 'application/json', ...headers } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(chunks).toString()) }));
    }); req.on('error', reject); req.end(JSON.stringify(body));
  });
  return { app, request, get providerCalls() { return providerCalls; }, expire: () => { now += 60001; } };
}

test('public judge entry grants no operator privileges or provider calls and existing pairing still works', async t => {
  const f = await fixture(t);
  const wrong = await f.request('/v1/demo/clients', { accessKey: 'x'.repeat(43) });
  assert.equal(wrong.status, 401); assert.deepEqual(wrong.body, { code: 'judge_invalid' });
  for (const bad of [{}, { accessKey, extra: true }]) assert.equal((await f.request('/v1/demo/clients', bad)).status, 401);
  const response = await f.request('/v1/demo/clients', { accessKey });
  assert.equal(response.status, 201); assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(Object.keys(response.body).sort(), ['expiresAt', 'token']);
  assert.equal(f.providerCalls, 0);
  const headers = { Authorization: `Bearer ${response.body.token}` };
  assert.equal((await f.request('/v1/stt/pairing-codes', {}, headers)).status, 401);
  const pairing = await f.request('/v1/stt/clients', { code: f.app.newPairingCode() });
  assert.equal(pairing.status, 201);
  assert.equal((await f.request('/v1/stt/sessions', { audio }, headers)).status, 201);
  assert.equal(f.providerCalls, 0);
});

test('missing, local, native, alternate-origin and expired judge entry fail closed', async t => {
  const disabled = await fixture(t, { judgeAccessKey: undefined });
  assert.equal((await disabled.request('/v1/demo/clients', { accessKey })).status, 404);
  const f = await fixture(t, { origins: [origin, 'https://other.example'] });
  for (const badOrigin of ['', 'humahang://native', 'https://other.example']) {
    const rejected = await f.request('/v1/demo/clients', { accessKey }, { Origin: badOrigin });
    assert.equal(rejected.status, 404); assert.deepEqual(rejected.body, { code: 'judge_unavailable' });
  }
  f.expire(); assert.equal((await f.request('/v1/demo/clients', { accessKey })).status, 404);
  assert.equal(f.providerCalls, 0);
});

test('judge issuance limit survives invalid attempts and leaves ordinary operator pairing available', async t => {
  const f = await fixture(t, { judgeLimits: { grants: 1 } });
  assert.equal((await f.request('/v1/demo/clients', { accessKey: 'x'.repeat(43) })).status, 401);
  assert.equal((await f.request('/v1/demo/clients', { accessKey })).status, 201);
  const limited = await f.request('/v1/demo/clients', { accessKey });
  assert.equal(limited.status, 429); assert.deepEqual(limited.body, { code: 'judge_limit' });
  assert.equal((await f.request('/v1/stt/clients', { code: f.app.newPairingCode() })).status, 201);
});

test('shared limits apply after validation and before session tickets or image provider calls', async t => {
  const f = await fixture(t);
  const grant = (await f.request('/v1/demo/clients', { accessKey })).body;
  const headers = { Authorization: `Bearer ${grant.token}` };
  assert.equal((await f.request('/v1/stt/sessions', { audio: {} }, headers)).status, 400);
  assert.equal((await f.request('/v1/stt/sessions', { audio }, headers)).status, 201);
  const next = (await f.request('/v1/demo/clients', { accessKey })).body;
  const nextHeaders = { Authorization: `Bearer ${next.token}` };
  const limited = await f.request('/v1/stt/sessions', { audio }, nextHeaders);
  assert.equal(limited.status, 429); assert.deepEqual(limited.body, { code: 'judge_limit' });
  assert.equal((await f.request('/v1/vision/analyze', { image: {} }, headers)).status, 400);
  assert.equal((await f.request('/v1/vision/analyze', { image, task: 'objects', language: 'en' }, headers)).status, 200);
  const blocked = await f.request('/v1/vision/translate', { result: visionResult, sourceLanguage: 'en', language: 'ur' }, nextHeaders);
  assert.equal(blocked.status, 429); assert.deepEqual(blocked.body, { code: 'judge_limit' });
  assert.equal(f.providerCalls, 1);
});

test('deadline invalidates both issued HTTP grants and previously reserved WebSocket tickets', async t => {
  const f = await fixture(t);
  const grant = (await f.request('/v1/demo/clients', { accessKey })).body;
  const headers = { Authorization: `Bearer ${grant.token}` };
  const ticket = (await f.request('/v1/stt/sessions', { audio }, headers)).body;
  f.expire();
  assert.equal((await f.request('/v1/stt/sessions', { audio }, headers)).status, 401);
  const status = await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${f.app.server.address().port}${ticket.path}`, ticket.protocols,
      { headers: { Host: 'demo.example.test', Origin: origin } });
    ws.on('open', () => { ws.terminate(); reject(Error('Expired ticket upgraded')); });
    ws.on('error', () => {});
    ws.on('unexpected-response', (_, res) => { res.resume(); resolve(res.statusCode); ws.terminate(); });
  });
  assert.equal(status, 401); assert.equal(f.providerCalls, 0);
});

test('private judge route serves only the normal exported SPA, without exposing an invitation or opening APIs', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'humahang-judge-static-'));
  await writeFile(join(directory, 'index.html'), '<!doctype html><title>Hum Ahang</title>');
  const handler = createStaticWebHandler(directory);
  const server = http.createServer(async (req, res) => {
    if (await handler(req, res)) return;
    res.writeHead(404); res.end();
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(`${url}/demo`);
  assert.equal(page.status, 200); assert.match(page.headers.get('content-type'), /text\/html/);
  assert.equal(await page.text(), '<!doctype html><title>Hum Ahang</title>');
  assert.equal((await fetch(`${url}/v1/demo/clients`)).status, 404);
});
