import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCaptionClient } from '../src/caption-client.ts';

test('operator pairing shares runtime access with an existing caption screen without starting either microphone', async t => {
  const credentials = { current: null }, requests = [];
  let microphoneStarts = 0;
  const options = {
    baseUrl: 'http://127.0.0.1:8787', credentials, onState() {},
    createCapture: () => ({ async start() { microphoneStarts++; return { encoding: 'linear16', sampleRate: 16000, channels: 1 }; }, async stop() {} }),
    createSocket: () => assert.fail('Setup must not open an audio stream.'),
    fetcher: async (url, request) => {
      requests.push({ url, ...request });
      return Response.json({ token: 'scoped-runtime-test-grant', expiresAt: Date.now() + 60000 }, { status: 201 });
    },
  };
  const caption = createCaptionClient(options), setup = createCaptionClient(options);
  t.after(() => { caption.dispose(); setup.dispose(); });
  caption.setInputLanguage('en');
  assert.equal(caption.getState().connected, false);
  await setup.connect('012345ABCD');
  // The route's focus handler reads this same controller rather than recreating it.
  const focused = caption.getState();
  assert.equal(focused.connected, true); assert.equal(focused.inputLanguage, 'en');
  assert.equal(focused.phase, 'idle'); assert.equal(microphoneStarts, 0);
  assert.deepEqual(JSON.parse(requests[0].body), { code: '012345ABCD' });
  assert.equal(requests.length, 1);
  setup.disconnect();
  assert.equal(caption.getState().connected, false);
  assert.equal(caption.getState().inputLanguage, 'en');
  assert.equal(requests[1].method, 'DELETE'); assert.equal(microphoneStarts, 0);
});

test('returning from setup preserves completed caption pairs and observes connection expiry', async t => {
  const credentials = { current: { token: 'initial-runtime-test-grant', expiresAt: Date.now() + 60000 } };
  let socket;
  const caption = createCaptionClient({ baseUrl: 'http://127.0.0.1:8787', credentials, onState() {},
    createCapture: () => ({ async start() { return { encoding: 'linear16', sampleRate: 16000, channels: 1 }; }, async stop() {} }),
    fetcher: async () => Response.json({ path: '/v1/stt/stream', protocols: ['humahang.stt.v1', 'ticket.setup-audit'] }),
    createSocket: () => (socket = { readyState: 1, bufferedAmount: 0, send() {}, close() { this.readyState = 3; } }),
  });
  t.after(() => caption.dispose());
  caption.setInputLanguage('en'); await caption.start();
  const emit = (type, fields = {}) => socket.onmessage({ data: JSON.stringify({ sessionId: 'existing-caption', type, ...fields }) });
  emit('ready'); emit('processing', { sequence: 1 });
  emit('caption_final', { sequence: 1, outputs: { ur: 'پانی', en: 'Water' } });
  caption.cancel(); await new Promise(resolve => setImmediate(resolve));
  const previous = caption.getState().segments;
  credentials.current = { token: 'new-runtime-test-grant', expiresAt: Date.now() + 60000 };
  assert.equal(caption.getState().connected, true);
  assert.deepEqual(caption.getState().segments, previous);
  assert.equal(caption.getState().inputLanguage, 'en');
  credentials.current.expiresAt = Date.now() - 1;
  assert.equal(caption.getState().connected, false);
  assert.deepEqual(caption.getState().segments, previous);
});
