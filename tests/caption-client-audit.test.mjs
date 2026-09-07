import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCaptionClient } from '../src/caption-client.ts';

function fixture(t, overrides = {}) {
  const capture = { starts: 0, stops: 0,
    async start(onAudio, signal) { this.starts++; this.onAudio = onAudio; this.signal = signal; return { encoding: 'linear16', sampleRate: 16000, channels: 1 }; },
    async stop() { this.stops++; }, ...overrides.capture };
  const sockets = [], requests = [], states = [];
  const credentials = { current: { token: 'isolated-audit-runtime-token', expiresAt: Date.now() + 60000 } };
  const client = createCaptionClient({ baseUrl: 'http://127.0.0.1:8787', credentials,
    createCapture: () => capture, onState: state => states.push(state), drainMs: 10, startupMs: 100,
    fetcher: async (url, options) => {
      requests.push({ url, ...options });
      return Response.json({ path: '/v1/stt/stream', protocols: ['humahang.stt.v1', 'ticket.audit'] });
    },
    createSocket: () => {
      const socket = { readyState: 1, bufferedAmount: 0, sent: [],
        send(data) { this.sent.push(data); }, close() { this.readyState = 3; this.onclose?.({}); } };
      sockets.push(socket); return socket;
    }, ...overrides.options });
  t.after(() => client.dispose());
  const emit = (type, fields = {}) => sockets.at(-1).onmessage({ data: JSON.stringify({ sessionId: 'audit-session', type, ...fields }) });
  return { client, capture, sockets, credentials, requests, states, emit };
}

test('stop bounds stalled capture teardown and cancels late audio instead of retaining a live session', async t => {
  let release;
  const teardown = new Promise(resolve => { release = resolve; });
  const f = fixture(t, { capture: { stop() { this.stops++; return teardown; } } });
  await f.client.start(); f.emit('ready');
  const stopping = f.client.stop();
  try {
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(f.client.getState().phase, 'error');
    assert.equal(f.sockets[0].readyState, 3);
    assert.equal(f.capture.signal.aborted, true);
    const sent = f.sockets[0].sent.length;
    f.capture.onAudio(new ArrayBuffer(3200));
    assert.equal(f.sockets[0].sent.length, sent);
  } finally { release(); await stopping; }
});

test('an expired grant never starts capture; a rejected grant releases already-started capture', async t => {
  const f = fixture(t);
  f.credentials.current.expiresAt = Date.now() - 1;
  await f.client.start(); assert.equal(f.capture.starts, 0); assert.equal(f.client.getState().connected, false);
  const rejected = fixture(t, { options: { fetcher: async () => new Response('', { status: 401 }) } });
  await rejected.client.start();
  assert.equal(rejected.client.getState().phase, 'error');
  assert.equal(rejected.client.getState().connected, false);
  assert.equal(rejected.capture.signal.aborted, true);
  assert.ok(rejected.capture.stops > 0); assert.equal(rejected.sockets.length, 0);
});

test('startup audio overflow releases capture and cannot flush buffered audio after cancellation', async t => {
  const f = fixture(t); await f.client.start();
  f.capture.onAudio(new ArrayBuffer(64000)); f.capture.onAudio(new ArrayBuffer(3200));
  assert.equal(f.client.getState().phase, 'error');
  assert.equal(f.capture.signal.aborted, true);
  f.emit('ready');
  assert.equal(f.sockets[0].sent.length, 0);
});

test('disconnect closes the current stream, clears credentials and revokes only the scoped grant', async t => {
  const f = fixture(t); await f.client.start(); f.emit('ready');
  f.client.disconnect();
  assert.equal(f.client.getState().connected, false);
  assert.equal(f.capture.signal.aborted, true);
  assert.equal(f.sockets[0].readyState, 3);
  assert.equal(f.requests.at(-1).method, 'DELETE');
  assert.equal(f.requests.at(-1).headers.Authorization, 'Bearer isolated-audit-runtime-token');
  f.emit('processing', { sequence: 1 });
  f.emit('caption_final', { sequence: 1, outputs: { ur: 'پانی', en: 'Water' } });
  assert.equal(f.client.getState().segments.length, 0);
});

test('a late unauthorized response from a cancelled run cannot clear newly paired credentials', async t => {
  let release, bootstrapStarted;
  const bootstrap = new Promise(resolve => { bootstrapStarted = resolve; });
  const oldResponse = new Promise(resolve => { release = resolve; });
  const f = fixture(t, { options: { fetcher: async url => {
    if (url.endsWith('/sessions')) { bootstrapStarted(); return oldResponse; }
    return Response.json({ token: 'new-isolated-runtime-grant', expiresAt: Date.now() + 60000 });
  } } });
  const starting = f.client.start(); await bootstrap;
  f.client.cancel(); await new Promise(resolve => setImmediate(resolve)); await f.client.connect('123456ABCD');
  assert.equal(f.credentials.current.token, 'new-isolated-runtime-grant');
  release(new Response('', { status: 401 })); await starting;
  assert.equal(f.client.getState().connected, true);
  assert.equal(f.credentials.current.token, 'new-isolated-runtime-grant');
});
