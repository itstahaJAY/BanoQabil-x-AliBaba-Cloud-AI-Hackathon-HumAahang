import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import WebSocket, { WebSocketServer } from 'ws';
import { createSpeechServer } from '../server.mjs';

const audio = { encoding: 'linear16', sampleRate: 16000, channels: 1 };
const operatorToken = 'local-operator-test-token-32-characters';
const origin = 'http://localhost:8081', otherOrigin = 'http://127.0.0.1:8081';
const pairedOutputs = { ur: 'مجھے پانی چاہیے۔', en: 'I need water.' };

async function fixture(t, processBilingual = async () => pairedOutputs) {
  const provider = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(provider, 'listening');
  let providerSocket; const connections = [];
  provider.on('connection', socket => {
    providerSocket = socket;
    socket.on('message', (data, binary) => {
      if (!binary && JSON.parse(data).type === 'CloseStream') {
        socket.send(JSON.stringify({ type: 'Metadata' })); socket.close();
      }
    });
  });
  const app = createSpeechServer({ clientToken: operatorToken, origins: [origin, otherOrigin] }, {
    connect: (audioConfig, inputLanguage) => {
      connections.push({ audio: audioConfig, inputLanguage });
      return new WebSocket(`ws://127.0.0.1:${provider.address().port}`);
    },
    convert: () => assert.fail('Bilingual mode must not call the source-only converter'), processBilingual,
  });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  t.after(async () => {
    await app.close();
    for (const socket of provider.clients) socket.terminate();
    await new Promise(resolve => provider.close(resolve));
  });
  const url = `http://127.0.0.1:${app.server.address().port}`;
  const request = (path, body, { token, sourceOrigin, method = 'POST' } = {}) => fetch(url + path, {
    method, headers: { 'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(sourceOrigin ? { Origin: sourceOrigin } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const pair = (code = app.newPairingCode(), sourceOrigin = origin) => request('/v1/stt/clients', { code }, { sourceOrigin });
  const issue = (token, sourceOrigin = origin) => request('/v1/stt/sessions', { audio, mode: 'bilingual' }, { token, sourceOrigin });
  const upgrade = (session, sourceOrigin = origin) => new WebSocket(url.replace('http:', 'ws:') + session.path,
    session.protocols, sourceOrigin ? { origin: sourceOrigin } : {});
  async function open(token, sourceOrigin = origin) {
    const response = await issue(token, sourceOrigin); assert.equal(response.status, 201);
    const session = await response.json(), ws = upgrade(session, sourceOrigin), events = [];
    ws.on('message', data => events.push(JSON.parse(data)));
    await once(ws, 'open'); await until(() => events.some(event => event.type === 'ready'));
    return { ws, events, session };
  }
  return { app, request, pair, issue, upgrade, open, connections, get providerSocket() { return providerSocket; } };
}

async function until(check) {
  const deadline = Date.now() + 1500;
  while (!check()) {
    if (Date.now() > deadline) assert.fail('Expected event not received');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

const frame = (text, start, final = true, languages = ['en']) => JSON.stringify({
  type: 'Results', start, duration: 1, is_final: final,
  channel: { alternatives: [{ transcript: text, languages }] }, metadata: { private: 'never-forward-this' },
});

function rejectedUpgrade(socket) {
  return new Promise((resolve, reject) => {
    socket.on('open', () => { socket.terminate(); reject(Error('Unexpected successful upgrade')); });
    socket.on('error', () => {});
    socket.on('unexpected-response', (_, response) => { response.resume(); resolve(response.statusCode); socket.terminate(); });
  });
}

test('pairing codes are operator-only; origin-bound grants are limited and one-use codes cannot replay', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/v1/stt/pairing-codes', {})).status, 401);
  const codeResponse = await f.request('/v1/stt/pairing-codes', {}, { token: operatorToken });
  assert.equal(codeResponse.status, 201);
  const { code } = await codeResponse.json();
  assert.equal((await f.pair(code, 'https://untrusted.example')).status, 403);
  const grantResponse = await f.pair(code); assert.equal(grantResponse.status, 201);
  const grant = await grantResponse.json(); assert.ok(grant.token && grant.token !== operatorToken);
  assert.equal(grantResponse.headers.get('access-control-allow-origin'), origin);
  assert.equal((await f.pair(code)).status, 401);
  assert.equal((await f.request('/v1/stt/pairing-codes', {}, { token: grant.token, sourceOrigin: origin })).status, 401);
  assert.equal((await f.issue(grant.token, otherOrigin)).status, 401);
  assert.equal((await f.issue(grant.token, null)).status, 401);
  assert.equal((await f.issue(grant.token)).status, 201);
});

test('pairing-code administration accepts only an empty JSON object', async t => {
  const f = await fixture(t);
  for (const body of [[], null, '', 42, true, { unexpected: true }]) {
    assert.equal((await f.request('/v1/stt/pairing-codes', body, { token: operatorToken })).status, 400);
  }
});

test('no-Origin pairing is bound to no-Origin rather than an approved browser origin', async t => {
  const f = await fixture(t);
  const response = await f.pair(f.app.newPairingCode(), null); assert.equal(response.status, 201);
  const { token } = await response.json();
  assert.equal((await f.issue(token)).status, 401);
  const { ws, events } = await f.open(token, null);
  const closed = once(ws, 'close'); ws.send(JSON.stringify({ type: 'cancel' })); await closed;
  assert.equal(events.at(-1).reason, 'cancelled');
});

test('native transport uses the same exact explicit Origin for pairing, bootstrap and WebSocket upgrade', async t => {
  const f = await fixture(t), nativeOrigin = 'humahang://native';
  const response = await f.pair(f.app.newPairingCode(), nativeOrigin);
  assert.equal(response.status, 201);
  const { token } = await response.json();
  assert.equal((await f.issue(token, null)).status, 401);
  assert.equal((await f.issue(token, origin)).status, 401);
  assert.equal((await f.issue(token, 'humahang://other')).status, 403);
  const mismatch = await (await f.issue(token, nativeOrigin)).json();
  assert.equal(await rejectedUpgrade(f.upgrade(mismatch, origin)), 401);
  const { ws, events } = await f.open(token, nativeOrigin);
  assert.equal(events[0].type, 'ready');
  const closed = once(ws, 'close'); ws.send(JSON.stringify({ type: 'cancel' })); await closed;
  assert.equal(events.at(-1).reason, 'cancelled');
});

test('bilingual negotiation allows only explicit en/ur input and cannot select per-tab provider calls', async t => {
  const f = await fixture(t), { token } = await (await f.pair()).json();
  for (const body of [{ audio, mode: 'ur' }, { audio, mode: 'bilingual', language: 'ur' },
    { audio, mode: 'bilingual', output: 'en' }, { audio, mode: 'bilingual', model: 'other' },
    ...[null, '', 'multi', 'hi', ['ur'], { language: 'ur' }].map(inputLanguage => ({ audio, mode: 'bilingual', inputLanguage })),
    { audio, inputLanguage: 'ur' }]) {
    assert.equal((await f.request('/v1/stt/sessions', body, { token, sourceOrigin: origin })).status, 400);
  }
  assert.equal((await f.issue(token)).status, 201);
});

test('input language is bound to the authenticated session and reaches recognition unchanged', async t => {
  const f = await fixture(t), { token } = await (await f.pair()).json();
  for (const inputLanguage of ['ur', 'en', undefined]) {
    const response = await f.request('/v1/stt/sessions', { audio, mode: 'bilingual', ...(inputLanguage ? { inputLanguage } : {}) }, { token, sourceOrigin: origin });
    assert.equal(response.status, 201);
    const ws = f.upgrade(await response.json()), events = [];
    ws.on('message', data => events.push(JSON.parse(data)));
    await once(ws, 'open'); await until(() => events.some(event => event.type === 'ready'));
    assert.deepEqual(f.connections.at(-1), { audio, inputLanguage });
    const closed = once(ws, 'close'); ws.send(JSON.stringify({ type: 'cancel' })); await closed;
  }
});

test('bad/expired pairing codes fail and repeated failures exhaust a code', async t => {
  let now = Date.now(); t.mock.method(Date, 'now', () => now);
  const f = await fixture(t), expiring = f.app.newPairingCode();
  now += 300001;
  assert.equal((await f.pair(expiring)).status, 401);
  const valid = f.app.newPairingCode();
  for (let index = 0; index < 5; index++) assert.equal((await f.pair('invalid')).status, 401);
  assert.equal((await f.pair(valid)).status, 401);
});

test('revocation blocks new bootstraps and already-issued upgrade tickets; foreign-origin revoke cannot revoke', async t => {
  const f = await fixture(t), { token } = await (await f.pair()).json();
  assert.equal((await f.request('/v1/stt/clients', undefined, { token, sourceOrigin: otherOrigin, method: 'DELETE' })).status, 204);
  const issued = await f.issue(token); assert.equal(issued.status, 201); const session = await issued.json();
  assert.equal((await f.request('/v1/stt/clients', undefined, { token, sourceOrigin: origin, method: 'DELETE' })).status, 204);
  assert.equal((await f.issue(token)).status, 401);
  assert.equal(await rejectedUpgrade(f.upgrade(session)), 401);
});

test('authenticated bilingual WebSocket suppresses source previews and emits ordered complete pairs once', async t => {
  const calls = []; let release;
  const f = await fixture(t, async segment => {
    calls.push(segment.text);
    if (segment.text === 'Hello') return new Promise(resolve => { release = resolve; });
    return pairedOutputs;
  });
  const { token } = await (await f.pair()).json(), { ws, events } = await f.open(token);
  assert.equal(ws.protocol, 'humahang.stt.v1');
  f.providerSocket.send(frame('Hello', 0, false));
  f.providerSocket.send(frame('पानी', 0, false, ['hi']));
  // Use a protocol ping/pong barrier, not a timing guess, to allow preceding frames through.
  const pong = once(f.providerSocket, 'pong'); f.providerSocket.ping(); await pong;
  assert.equal(events.some(event => ['preview', 'final', 'caption_final'].includes(event.type)), false);
  f.providerSocket.send(frame('Hello', 0));
  f.providerSocket.send(frame('पानी', 1, true, ['hi']));
  f.providerSocket.send(frame('पानी', 1, true, ['hi']));
  await until(() => events.filter(event => event.type === 'processing').length === 2);
  assert.deepEqual(calls, ['Hello']);
  assert.equal(events.some(event => event.type === 'caption_final'), false);
  release({ ur: 'سلام', en: 'Hello' });
  await until(() => events.filter(event => event.type === 'caption_final').length === 2);
  assert.deepEqual(calls, ['Hello', 'पानी']);
  const finals = events.filter(event => event.type === 'caption_final');
  assert.deepEqual(finals.map(event => [event.sequence, event.outputs]), [[1, { ur: 'سلام', en: 'Hello' }], [2, pairedOutputs]]);
  assert.ok(finals.every(event => typeof event.sessionId === 'string' && !('text' in event)));
  assert.ok(!JSON.stringify(events).match(/पानी|never-forward-this/));
  assert.equal(events.some(event => event.type === 'preview' || event.type === 'final'), false);
  const closed = once(ws, 'close'); ws.send(JSON.stringify({ type: 'stop' })); await closed;
  assert.equal(events.at(-1).type, 'closed');
});

test('malformed bilingual output emits a safe segment error while subsequent valid pairs survive', async t => {
  const f = await fixture(t, async ({ text }) => text === 'First' ? { ur: 'पानी', en: 'First', raw: 'SECRET' } : pairedOutputs);
  const { token } = await (await f.pair()).json(), { events } = await f.open(token);
  f.providerSocket.send(frame('First', 0)); f.providerSocket.send(frame('Next', 1));
  await until(() => events.some(event => event.type === 'caption_final'));
  const error = events.find(event => event.type === 'segment_error');
  assert.equal(error.sequence, 1); assert.equal(error.code, 'conversion_invalid');
  assert.equal(error.stage, 'translation_validation');
  assert.equal(events.find(event => event.type === 'caption_final').sequence, 2);
  assert.ok(!JSON.stringify(events).match(/पानी|SECRET|First|never-forward-this/));
});
