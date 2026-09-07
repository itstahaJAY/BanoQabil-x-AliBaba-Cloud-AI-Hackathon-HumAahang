import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCaptionClient } from '../src/caption-client.ts';

function fixture(overrides = {}) {
  const states = [], sockets = [], requests = [], capture = { starts: 0, stops: 0,
    async start(frame, signal) { this.starts++; this.frame = frame; this.signal = signal; return { encoding: 'linear16', sampleRate: 16000, channels: 1 }; },
    async stop() { this.stops++; }, ...overrides.capture };
  const client = createCaptionClient({ baseUrl: 'http://127.0.0.1:8787', createCapture: () => capture,
    fetcher: async (url, options) => { requests.push({ url, ...options });
      if (url.endsWith('/clients')) return Response.json({ token: 'runtime-short-lived-grant', expiresAt: Date.now() + 60000 }, { status: 201 });
      return Response.json({ path: '/v1/stt/stream', protocols: ['humahang.stt.v1','ticket.test'], audio: JSON.parse(options.body).audio }, { status: 201 }); },
    createSocket: () => { const ws = { readyState: 1, bufferedAmount: 0, sent: [], send(data) { this.sent.push(data); }, close() { this.readyState = 3; this.onclose?.({}); } }; sockets.push(ws); return ws; },
    onState: state => states.push(state), ...overrides.options });
  const emit = (type, fields = {}) => sockets.at(-1).onmessage({ data: JSON.stringify({ sessionId: 'test-session', type, ...fields }) });
  return { client, states, sockets, requests, capture, emit };
}

test('pairing is separate from recording; explicit input defaults to Urdu independently of output or UI locale', async () => {
  const f = fixture(); await f.client.connect('012345ABCD');
  assert.equal(f.client.getState().connected, true); assert.equal(f.capture.starts, 0);
  assert.equal(f.client.getState().inputLanguage, 'ur');
  await f.client.start();
  assert.deepEqual(JSON.parse(f.requests.at(-1).body), { audio: { encoding: 'linear16', sampleRate: 16000, channels: 1 }, mode: 'bilingual', inputLanguage: 'ur' });
  f.emit('ready'); assert.equal(f.client.getState().phase, 'listening'); f.client.dispose();
});

test('input selection is locked throughout connection, recording and final processing; next session snapshots the new input', async t => {
  const f = fixture(); t.after(() => f.client.dispose()); await f.client.connect('012345ABCD');
  assert.equal(f.client.setInputLanguage('en'), true);
  const starting = f.client.start();
  assert.equal(f.client.getState().phase, 'connecting');
  assert.equal(f.client.getState().inputLanguageLocked, true);
  assert.equal(f.client.setInputLanguage('ur'), false);
  await starting; f.emit('ready');
  assert.equal(JSON.parse(f.requests.at(-1).body).inputLanguage, 'en');
  assert.equal(f.client.setInputLanguage('ur'), false);
  f.emit('processing', { sequence: 1 });
  await f.client.stop();
  assert.equal(f.client.getState().phase, 'stopping');
  assert.equal(f.client.setInputLanguage('ur'), false);
  f.emit('caption_final', { sequence: 1, outputs: { ur: 'پانی', en: 'Water' } });
  f.emit('closed'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.client.setInputLanguage('ur'), true);
  assert.deepEqual(f.client.getState().segments[0].outputs, { ur: 'پانی', en: 'Water' });
  await f.client.start();
  assert.equal(JSON.parse(f.requests.at(-1).body).inputLanguage, 'ur');
  assert.equal(f.client.getState().segments.length, 1);
  f.client.dispose();
});

test('pairing and cancelled microphone teardown keep input selection locked until completed', async t => {
  let releasePairing, releaseCapture;
  const f = fixture({ capture: { stop() { return new Promise(resolve => { releaseCapture = resolve; }); } },
    options: { fetcher: async url => {
      if (url.endsWith('/clients')) return new Promise(resolve => { releasePairing = () => resolve(Response.json({ token: 'test-runtime-grant-token', expiresAt: Date.now() + 60000 })); });
      return Response.json({ path: '/v1/stt/stream', protocols: ['humahang.stt.v1', 'ticket.test'] });
    } } });
  t.after(() => f.client.dispose());
  const pairing = f.client.connect('012345ABCD');
  assert.equal(f.client.getState().inputLanguageLocked, true);
  assert.equal(f.client.setInputLanguage('en'), false);
  releasePairing(); await pairing;
  assert.equal(f.client.setInputLanguage('en'), true);
  await f.client.start(); f.client.cancel();
  assert.equal(f.client.getState().phase, 'idle');
  assert.equal(f.client.getState().inputLanguageLocked, true);
  assert.equal(f.client.setInputLanguage('ur'), false);
  releaseCapture(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.client.getState().inputLanguageLocked, false);
  assert.equal(f.client.setInputLanguage('ur'), true);
  assert.equal(f.client.setInputLanguage('multi'), false);
  f.client.dispose();
});

test('safe error stages distinguish recognition and translation without exposing provider text', async t => {
  const f = fixture(); t.after(() => f.client.dispose()); await f.client.connect('012345ABCD'); await f.client.start(); f.emit('ready');
  for (const [index, stage] of ['recognition_input', 'translation_request', 'translation_validation'].entries()) {
    f.emit('processing', { sequence: index + 1 });
    f.emit('segment_error', { sequence: index + 1, stage, text: 'private provider text पानी' });
    assert.match(f.client.getState().message, new RegExp(stage === 'recognition_input' ? 'recognition' : stage === 'translation_request' ? 'translation service' : 'safety checks', 'i'));
    assert.equal(f.client.getState().phase, 'listening');
  }
  assert.ok(!JSON.stringify(f.states).includes('private provider text'));
  f.emit('processing', { sequence: 4 });
  f.emit('segment_error', { sequence: 4, stage: 'provider secret', text: 'पानी' });
  assert.match(f.client.getState().message, /could not be translated/);
  f.emit('processing', { sequence: 5 });
  f.emit('segment_error', { sequence: 5, stage: 'translation_validation' });
  f.emit('closed'); assert.match(f.client.getState().message, /safety checks/);
  f.client.dispose();
});

test('terminal malformed recognition failures identify the stage and release capture without raw provider details', async t => {
  const f = fixture(); t.after(() => f.client.dispose());
  await f.client.connect('012345ABCD'); await f.client.start(); f.emit('ready');
  f.emit('error', { code: 'invalid_result', stage: 'recognition_input', message: 'private details पानी' });
  assert.equal(f.client.getState().phase, 'error');
  assert.match(f.client.getState().message, /recognition/);
  assert.equal(f.capture.signal.aborted, true);
  assert.ok(!JSON.stringify(f.states).includes('private details'));
});

test('startup audio waits for ready; paired results commit once and failed segments are not raw fallbacks', async () => {
  const f = fixture(); await f.client.connect('012345ABCD'); await f.client.start();
  f.capture.frame(new ArrayBuffer(3200)); assert.equal(f.sockets[0].sent.length, 0);
  f.emit('ready'); assert.equal(f.sockets[0].sent.length, 1);
  f.emit('processing', { sequence: 1 }); assert.equal(f.client.getState().pending, 1);
  f.emit('caption_final', { sequence: 1, outputs: { ur: 'مجھے پانی چاہیے۔', en: 'I need water.' } });
  f.emit('caption_final', { sequence: 1, outputs: { ur: 'مجھے پانی چاہیے۔', en: 'I need water.' } });
  assert.equal(f.client.getState().segments.length, 1); assert.equal(f.client.getState().pending, 0);
  f.emit('processing', { sequence: 2 }); f.emit('segment_error', { sequence: 2, code: 'conversion_invalid', text: 'पानी' });
  assert.equal(f.client.getState().segments.length, 1); assert.ok(!JSON.stringify(f.states).includes('पानी'));
  f.client.dispose();
});

test('stop releases capture before sending stop; resume preserves committed text', async () => {
  const f = fixture(); await f.client.connect('012345ABCD'); await f.client.start(); f.emit('ready');
  f.emit('processing', { sequence: 1 }); f.emit('caption_final', { sequence: 1, outputs: { ur: 'پانی', en: 'Water' } });
  await f.client.stop(); assert.ok(f.capture.stops > 0);
  assert.equal(f.sockets[0].sent.at(-1), '{"type":"stop"}');
  assert.equal(f.client.getState().phase, 'stopping'); f.emit('closed', { reason: 'stopped' });
  assert.equal(f.client.getState().phase, 'idle'); await f.client.start();
  assert.equal(f.client.getState().segments.length, 1); f.client.dispose();
});

test('cancel during permission/start ignores late completion and never opens a socket', async () => {
  let release;
  const f = fixture({ capture: { start(frame, signal) { this.signal = signal; return new Promise(resolve => { release = resolve; }); } } });
  await f.client.connect('012345ABCD'); const starting = f.client.start();
  f.client.cancel(); release({ encoding: 'linear16', sampleRate: 16000, channels: 1 }); await starting;
  assert.equal(f.sockets.length, 0); assert.equal(f.capture.signal.aborted, true); f.client.dispose();
});

test('stale sockets, raw Hindi and provider errors cannot appear in app state', async () => {
  const f = fixture(); await f.client.connect('012345ABCD'); await f.client.start(); f.emit('ready');
  const stale = f.sockets[0].onmessage; f.client.cancel();
  stale({ data: JSON.stringify({ type: 'caption_final', sessionId: 'test-session', sequence: 1, outputs: { ur: 'पानी', en: 'Water' } }) });
  assert.equal(f.client.getState().segments.length, 0);
  await new Promise(resolve => setImmediate(resolve));
  await f.client.start(); f.emit('ready'); f.emit('processing', { sequence: 1 });
  f.emit('caption_final', { sequence: 1, outputs: { ur: 'पानी', en: 'Water' } });
  assert.equal(f.client.getState().phase, 'error'); assert.ok(!JSON.stringify(f.states).includes('पानी')); f.client.dispose();
});

test('native startup queue is rechecked against the acknowledged sample rate before authentication', async () => {
  const f = fixture({ capture: { async start(frame, signal) {
    this.signal = signal;
    frame(new ArrayBuffer(64000)); frame(new ArrayBuffer(3200));
    return { encoding: 'linear16', sampleRate: 16000, channels: 1 };
  } } });
  await f.client.connect('012345ABCD'); await f.client.start();
  assert.equal(f.client.getState().phase, 'error');
  assert.equal(f.requests.length, 1); assert.equal(f.sockets.length, 0);
  assert.equal(f.capture.signal.aborted, true); f.client.dispose();
});

test('a silent transport has a local session deadline even without native bufferedAmount', async () => {
  const f = fixture({ options: { sessionMs: 10 } });
  await f.client.connect('012345ABCD'); await f.client.start();
  delete f.sockets[0].bufferedAmount; f.emit('ready');
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(f.client.getState().phase, 'error');
  assert.equal(f.capture.signal.aborted, true); assert.ok(f.capture.stops > 0);
  assert.equal(f.sockets[0].readyState, 3); f.client.dispose();
});
