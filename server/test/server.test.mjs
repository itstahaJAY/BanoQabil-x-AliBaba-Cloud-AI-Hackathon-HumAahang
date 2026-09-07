import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import http from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import { createSpeechServer } from '../server.mjs';
import { readConfig, validateAudio } from '../config.mjs';

const audio = { encoding: 'linear16', sampleRate: 16000, channels: 1 };
const token = 'test-private-demo-token-32-characters';

test('configuration rejects missing secrets, public origins and language/model overrides', () => {
  assert.throws(() => readConfig({}), /OPENAI_API_KEY/);
  assert.equal(validateAudio({ audio }), true);
  assert.equal(validateAudio({ audio, language: 'ur' }), false);
  assert.equal(validateAudio({ audio: { ...audio, sampleRate: 44100 } }), false);
  assert.throws(() => readConfig({ OPENAI_API_KEY: 'a'.repeat(32), DEEPSEEK_API_KEY: 'b'.repeat(32), STT_CLIENT_TOKEN: token, STT_ALLOWED_ORIGINS: 'https://evil.example' }), /loopback/);
});

async function fixture(t, overrides = {}) {
  const provider = new WebSocketServer({ host: '127.0.0.1', port: 0 }); await once(provider, 'listening');
  const frames = []; let providerSocket;
  provider.on('connection', ws => {
    providerSocket = ws;
    ws.on('message', (data, binary) => {
      frames.push({ data, binary });
      if (!binary && JSON.parse(data).type === 'CloseStream') {
        ws.send(JSON.stringify({ type: 'Metadata' })); ws.close();
      }
    });
  });
  const app = createSpeechServer({ clientToken: token, origins: ['http://localhost:8081'], ...overrides }, {
    connect: () => new WebSocket(`ws://127.0.0.1:${provider.address().port}`), convert: async () => ['پانی'],
  });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  t.after(async () => { await app.close(); for (const ws of provider.clients) ws.terminate(); await new Promise(resolve => provider.close(resolve)); });
  const url = `http://127.0.0.1:${app.server.address().port}`;
  const issue = (headers = {}, body = { audio }) => fetch(`${url}/v1/stt/sessions`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  async function open() {
    const response = await issue(); assert.equal(response.status, 201); const session = await response.json();
    const ws = new WebSocket(url.replace('http:', 'ws:') + session.path, session.protocols);
    const events = []; ws.on('message', data => events.push(JSON.parse(data)));
    await once(ws, 'open'); await until(() => events.some(event => event.type === 'ready'));
    return { ws, events, session };
  }
  return { app, url, issue, open, frames, get providerSocket() { return providerSocket; } };
}

async function until(check) {
  const end = Date.now() + 1500;
  while (!check()) { if (Date.now() > end) assert.fail('Expected event not received'); await new Promise(resolve => setTimeout(resolve, 5)); }
}

async function rejectedUpgrade(url, protocols, options) {
  const ws = new WebSocket(url, protocols, options);
  return new Promise((resolve, reject) => {
    ws.on('open', () => { ws.terminate(); reject(Error('Unexpected upgrade')); });
    ws.on('error', () => {});
    ws.on('unexpected-response', (_, response) => { response.resume(); resolve(response.statusCode); ws.terminate(); });
  });
}

test('session bootstrap requires auth, exact JSON and an approved browser origin', async t => {
  const f = await fixture(t);
  assert.equal((await fetch(`${f.url}/health`)).status, 200);
  assert.equal((await f.issue({ Authorization: 'Bearer incorrect' })).status, 401);
  assert.equal((await f.issue({ Origin: 'https://evil.example' })).status, 403);
  assert.equal((await f.issue({}, { audio, language: 'ur' })).status, 400);
  const issued = await f.issue({ Origin: 'http://localhost:8081' });
  assert.equal(issued.headers.get('access-control-allow-origin'), 'http://localhost:8081');
  const body = await issued.json();
  assert.equal(body.path, '/v1/stt/stream'); assert.ok(!JSON.stringify(body).includes(token));
});

test('upgrade tickets are single-use, short-lived, origin-bound and never echoed', async t => {
  const f = await fixture(t, { ticketTtlMs: 30 });
  const { ws, session } = await f.open();
  assert.equal(ws.protocol, 'humahang.stt.v1');
  assert.equal(await rejectedUpgrade(f.url.replace('http:', 'ws:') + session.path, session.protocols), 401);
  const expired = await (await f.issue()).json(); await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(await rejectedUpgrade(f.url.replace('http:', 'ws:') + expired.path, expired.protocols), 401);
  const bound = await (await f.issue({ Origin: 'http://localhost:8081' })).json();
  assert.equal(await rejectedUpgrade(f.url.replace('http:', 'ws:') + bound.path, bound.protocols), 401);
});

test('audio relays only after ready; English/Hindi final events normalize; stop drains and closes', async t => {
  const f = await fixture(t); const { ws, events } = await f.open();
  ws.send(Buffer.alloc(3200)); await until(() => f.frames.length > 0);
  assert.equal(f.frames[0].binary, true); assert.equal(f.frames[0].data.length, 3200);
  f.providerSocket.send(JSON.stringify({ type: 'Results', is_final: true, start: 0, duration: 1,
    channel: { alternatives: [{ transcript: 'पानी', languages: ['hi'] }] }, metadata: { secret: 'private' } }));
  await until(() => events.some(e => e.type === 'final'));
  assert.equal(events.find(e => e.type === 'final').text, 'پانی');
  const closed = once(ws, 'close'); ws.send(JSON.stringify({ type: 'stop' })); await closed;
  assert.equal(events.at(-1).type, 'closed');
  assert.ok(!JSON.stringify(events).match(/पानी|private|api_key/));
});

test('bad messages, silent provider disconnects and audio overflow fail safely', async t => {
  const f = await fixture(t);
  for (const action of ['message', 'provider', 'audio']) {
    const { ws, events } = await f.open(); const closed = once(ws, 'close');
    if (action === 'message') ws.send(JSON.stringify({ type: 'change_language', language: 'ur' }));
    if (action === 'provider') f.providerSocket.terminate();
    if (action === 'audio') ws.send(Buffer.alloc(65537));
    await closed;
    assert.equal(events.some(e => e.type === 'error'), true);
    assert.ok(!JSON.stringify(events).includes('Error:'));
  }
});

test('pending tickets and active sessions share a fixed capacity; cancel releases it', async t => {
  const f = await fixture(t, { maxSessions: 1 });
  const { ws } = await f.open(); assert.equal((await f.issue()).status, 429);
  const closed = once(ws, 'close'); ws.send(JSON.stringify({ type: 'cancel' })); await closed;
  await until(() => f.app.activeCount() === 0);
  assert.equal((await f.issue()).status, 201);
});

test('HTTP payload, content-type, Host and bootstrap request limits are enforced', async t => {
  const f = await fixture(t);
  assert.equal((await f.issue({ 'Content-Type': 'text/plain' })).status, 415);
  // fetch rewrites Host; use native HTTP to actually exercise DNS-rebinding protection.
  const badHost = await new Promise((resolve, reject) => {
    http.get(`${f.url}/health`, { headers: { Host: 'attacker.example' } }, response => {
      response.resume(); resolve(response.statusCode);
    }).on('error', reject);
  });
  assert.equal(badHost, 403);
  const large = await f.issue({}, { audio, padding: 'a'.repeat(2000) });
  assert.equal(large.status, 413);
  for (let i = 0; i < 30; i++) await f.issue({ Authorization: 'wrong' });
  assert.equal((await f.issue()).status, 429);
});
