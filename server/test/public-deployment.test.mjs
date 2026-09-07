import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import http from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfig } from '../config.mjs';
import { createSpeechServer } from '../server.mjs';

const env = { OPENAI_API_KEY: 'a'.repeat(32), DEEPSEEK_API_KEY: 'b'.repeat(32), STT_CLIENT_TOKEN: 'c'.repeat(32) };
const publicUrl = 'https://speech.demo.test';
const audio = { encoding: 'linear16', sampleRate: 16000, channels: 1 };

test('local mode keeps loopback binding and ignores hosting variables unless explicitly opted in', () => {
  const config = readConfig({ ...env, PORT: '8080', RAILWAY_PUBLIC_DOMAIN: 'speech.up.railway.app', WEB_ROOT: '/app/dist' });
  assert.equal(config.deployment, 'local');
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 8787);
  assert.deepEqual(config.origins, ['http://localhost:8081', 'http://127.0.0.1:8081']);
  assert.equal(config.webRoot, undefined);
});

test('public mode requires an exact HTTPS origin and uses the hosting port and static root', () => {
  const config = readConfig({ ...env, STT_DEPLOYMENT: 'public', STT_PUBLIC_URL: publicUrl, PORT: '8080', STT_PORT: '8787', WEB_ROOT: '/app/dist' });
  assert.equal(config.deployment, 'public');
  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.port, 8080);
  assert.equal(config.publicUrl, publicUrl);
  assert.equal(config.publicHost, 'speech.demo.test');
  assert.deepEqual(config.origins, [publicUrl]);
  assert.equal(config.webRoot, '/app/dist');
  const railway = readConfig({ ...env, STT_DEPLOYMENT: 'public', RAILWAY_PUBLIC_DOMAIN: 'speech.up.railway.app' });
  assert.equal(railway.publicUrl, 'https://speech.up.railway.app');
  assert.equal(railway.port, 8787);
});

test('public mode rejects absent URLs, wildcard hosts, credentials, paths and insecure origins', () => {
  assert.throws(() => readConfig({ ...env, STT_DEPLOYMENT: 'automatic' }), /STT_DEPLOYMENT/);
  for (const value of [undefined, '', '*', 'http://speech.demo.test', 'https://*.demo.test', 'https://user:secret@speech.demo.test', `${publicUrl}/`, `${publicUrl}/path`, `${publicUrl}?query`, `${publicUrl}#fragment`]) {
    assert.throws(() => readConfig({ ...env, STT_DEPLOYMENT: 'public', STT_PUBLIC_URL: value }), /STT_PUBLIC_URL/);
  }
  for (const value of ['*', 'http://speech.demo.test', 'https://*.demo.test', 'https://other.demo.test/path', 'null']) {
    assert.throws(() => readConfig({ ...env, STT_DEPLOYMENT: 'public', STT_PUBLIC_URL: publicUrl, STT_ALLOWED_ORIGINS: value }), /STT_ALLOWED_ORIGINS/);
  }
  assert.throws(() => readConfig({ ...env, STT_DEPLOYMENT: 'public', RAILWAY_PUBLIC_DOMAIN: 'speech.up.railway.app/path' }), /STT_PUBLIC_URL/);
});

async function fixture(t, overrides = {}) {
  const provider = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(provider, 'listening');
  const config = readConfig({ ...env, STT_DEPLOYMENT: 'public', STT_PUBLIC_URL: publicUrl });
  const app = createSpeechServer({ ...config, ...overrides }, {
    connect: () => new WebSocket(`ws://127.0.0.1:${provider.address().port}`), convert: async () => ['پانی'],
  });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  t.after(async () => { await app.close(); for (const ws of provider.clients) ws.terminate(); await new Promise(resolve => provider.close(resolve)); });
  const url = `http://127.0.0.1:${app.server.address().port}`;
  const request = (path, { method = 'GET', host = 'speech.demo.test', origin = publicUrl, authorization, body } = {}) => new Promise((resolve, reject) => {
    const headers = { Host: host, ...(origin == null ? {} : { Origin: origin }), ...(authorization ? { Authorization: authorization } : {}) };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const req = http.request(url + path, { method, headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        resolve({ status: response.statusCode, headers: response.headers,
          body: text && response.headers['content-type']?.includes('application/json') ? JSON.parse(text) : text || undefined });
      });
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  return { app, url, request };
}

test('public HTTP checks exact host and origin; Railway bypass is limited to GET /health', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/health')).status, 200);
  for (const host of ['attacker.test', 'speech.demo.test.attacker.test', '127.0.0.1', 'speech.demo.test:8080']) {
    assert.equal((await f.request('/health', { host })).status, 403);
  }
  for (const origin of ['https://attacker.test', 'http://speech.demo.test', 'http://localhost:8081', `${publicUrl}.attacker.test`]) {
    assert.equal((await f.request('/health', { origin })).status, 403);
  }
  assert.equal((await f.request('/health', { host: 'healthcheck.railway.app' })).status, 200);
  assert.equal((await f.request('/health', { host: 'healthcheck.railway.app', origin: null })).status, 200);
  assert.equal((await f.request('/health', { host: 'healthcheck.railway.app', method: 'POST' })).status, 403);
  assert.equal((await f.request('/v1/stt/sessions', { host: 'healthcheck.railway.app', method: 'POST', authorization: `Bearer ${env.STT_CLIENT_TOKEN}`, body: { audio } })).status, 403);
  assert.equal((await f.request('/health', { host: 'healthcheck.railway.app', origin: 'https://attacker.test' })).status, 403);
  assert.equal((await f.request('/health?probe=1', { host: 'healthcheck.railway.app' })).status, 403);
  const preflight = await f.request('/v1/stt/sessions', { method: 'OPTIONS' });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers['access-control-allow-origin'], publicUrl);
});

test('public operator pairing without Origin stays usable and invalid WebSocket hosts consume tickets', async t => {
  const f = await fixture(t);
  const issued = await f.request('/v1/stt/pairing-codes', { method: 'POST', origin: null, authorization: `Bearer ${env.STT_CLIENT_TOKEN}`, body: {} });
  assert.equal(issued.status, 201);
  const paired = await f.request('/v1/stt/clients', { method: 'POST', origin: null, body: { code: issued.body.code } });
  assert.equal(paired.status, 201);
  const authorization = `Bearer ${paired.body.token}`;
  assert.equal((await f.request('/v1/stt/sessions', { method: 'POST', authorization, body: { audio } })).status, 401);
  const session = await f.request('/v1/stt/sessions', { method: 'POST', origin: null, authorization, body: { audio } });
  assert.equal(session.status, 201);
  const wsUrl = f.url.replace('http:', 'ws:') + session.body.path;
  assert.equal(await rejectedUpgrade(wsUrl, session.body.protocols, { headers: { Host: 'attacker.test' } }), 403);
  assert.equal(await rejectedUpgrade(wsUrl, session.body.protocols, { headers: { Host: 'speech.demo.test' } }), 401);
});

test('public static hosting shares host checks and never replaces protected or unknown API responses', async t => {
  const webRoot = await mkdtemp(join(tmpdir(), 'hum-ahang-public-web-'));
  t.after(() => rm(webRoot, { recursive: true, force: true }));
  await writeFile(join(webRoot, 'index.html'), '<!doctype html><title>Hum Ahang test</title>');
  const f = await fixture(t, { webRoot });
  const home = await f.request('/');
  assert.equal(home.status, 200);
  assert.match(home.headers['content-type'], /text\/html/);
  assert.match(home.body, /Hum Ahang test/);
  assert.equal((await f.request('/', { host: 'attacker.test' })).status, 403);
  assert.equal((await f.request('/', { host: 'healthcheck.railway.app' })).status, 403);
  assert.equal((await f.request('/v1/stt/sessions', { method: 'POST', body: { audio } })).status, 401);
  assert.equal((await f.request('/v1/stt/unknown')).status, 404);
  assert.equal((await f.request('/v1/vision/unknown')).status, 404);
  assert.equal((await f.request('/server/.env')).status, 404);
  assert.deepEqual((await f.request('/health')).body, { status: 'ok', service: 'humahang-stt', version: 1 });
});

test('public pairing, browser/native grants, ticket origin binding and capacity remain enforced', async t => {
  const f = await fixture(t, { maxSessions: 1 });
  assert.equal((await f.request('/v1/stt/sessions', { method: 'POST', body: { audio } })).status, 401);
  assert.equal((await f.request('/v1/stt/pairing-codes', { method: 'POST', body: {} })).status, 401);
  for (const origin of [publicUrl, 'humahang://native']) {
    const issued = await f.request('/v1/stt/pairing-codes', { method: 'POST', authorization: `Bearer ${env.STT_CLIENT_TOKEN}`, body: {} });
    assert.equal(issued.status, 201);
    const paired = await f.request('/v1/stt/clients', { method: 'POST', origin, body: { code: issued.body.code } });
    assert.equal(paired.status, 201);
    const authorization = `Bearer ${paired.body.token}`;
    assert.equal((await f.request('/v1/stt/clients', { method: 'POST', origin, body: { code: issued.body.code } })).status, 401);
    const session = await f.request('/v1/stt/sessions', { method: 'POST', origin, authorization, body: { audio } });
    assert.equal(session.status, 201);
    assert.equal((await f.request('/v1/stt/sessions', { method: 'POST', origin, authorization, body: { audio } })).status, 429);
    const wrongOrigin = origin === publicUrl ? 'humahang://native' : publicUrl;
    assert.equal((await f.request('/v1/stt/sessions', { method: 'POST', origin: wrongOrigin, authorization, body: { audio } })).status, 401);
    const status = await rejectedUpgrade(f.url.replace('http:', 'ws:') + session.body.path, session.body.protocols, { headers: { Host: 'speech.demo.test', Origin: wrongOrigin } });
    assert.equal(status, 401);
    const next = await f.request('/v1/stt/sessions', { method: 'POST', origin, authorization, body: { audio } });
    const ws = new WebSocket(f.url.replace('http:', 'ws:') + next.body.path, next.body.protocols, { headers: { Host: 'speech.demo.test', Origin: origin } });
    await once(ws, 'open');
    const closed = once(ws, 'close');
    ws.send(JSON.stringify({ type: 'cancel' }));
    await closed;
    await f.request('/v1/stt/clients', { method: 'DELETE', origin, authorization });
    assert.equal((await f.request('/v1/stt/sessions', { method: 'POST', origin, authorization, body: { audio } })).status, 401);
  }
});

async function rejectedUpgrade(url, protocols, options) {
  const ws = new WebSocket(url, protocols, options);
  return new Promise((resolve, reject) => {
    ws.on('open', () => { ws.terminate(); reject(Error('Unexpected upgrade')); });
    ws.on('error', () => {});
    ws.on('unexpected-response', (_, response) => { response.resume(); resolve(response.statusCode); ws.terminate(); });
  });
}
