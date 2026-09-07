import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { createCaptionClient } from '../src/caption-client.ts';
import { createSpeechServer } from '../server/server.mjs';
import { createBilingualProcessor } from '../server/providers.mjs';

// Resolve the backend's declared ws dependency, not Expo's unrelated transitive version.
const { WebSocket, WebSocketServer } = createRequire(new URL('../server/package.json', import.meta.url))('ws');

test('real caption client pairs, streams synthetic PCM and receives one bilingual pair through the real local server', { timeout: 5000 }, async t => {
  const origin = 'http://localhost:8081', states = [], upstreamFrames = [], requests = [], conversionInputs = [], inputLanguages = [], sessionRequests = [];
  const outputs = { ur: 'مجھے سہ پہر 3 بجے پانی چاہیے۔', en: 'I need water at 3 PM.' };
  const source = 'मुझे पानी चाहिए at 3 PM.';
  const fakeDeepgram = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(fakeDeepgram, 'listening');
  fakeDeepgram.on('connection', socket => {
    let delivered = false;
    socket.on('message', (data, binary) => {
      upstreamFrames.push(binary ? { type: 'audio', bytes: data.length } : JSON.parse(data));
      if (binary && !delivered) {
        delivered = true;
        const frame = { type: 'Results', start: 0, duration: 1, is_final: true,
          channel: { alternatives: [{ transcript: source, languages: ['hi', 'en'] }] } };
        socket.send(JSON.stringify({ ...frame, is_final: false }));
        socket.send(JSON.stringify(frame)); socket.send(JSON.stringify(frame));
      }
      if (!binary && JSON.parse(data).type === 'CloseStream') {
        socket.send(JSON.stringify({ type: 'Metadata' })); socket.close();
      }
    });
  });
  const processBilingual = createBilingualProcessor({ deepseekKey: 'fake-test-key', deepseekModel: 'deepseek-v4-flash' }, async (url, options) => {
    // This is the sole external-provider boundary double: no network request is made.
    assert.equal(url, 'https://api.deepseek.com/chat/completions');
    conversionInputs.push(JSON.parse(JSON.parse(options.body).messages[1].content));
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(outputs) } }] });
  });
  const server = createSpeechServer({ clientToken: 'isolated-e2e-operator-token-32-characters', origins: [origin] }, {
    connect: (audio, inputLanguage) => {
      assert.deepEqual(audio, { encoding: 'linear16', sampleRate: 16000, channels: 1 });
      inputLanguages.push(inputLanguage);
      return new WebSocket(`ws://127.0.0.1:${fakeDeepgram.address().port}`);
    }, processBilingual, convert: () => assert.fail('Must use bilingual processing'),
  });
  server.server.listen(0, '127.0.0.1'); await once(server.server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.server.address().port}`;
  const capture = { running: false, starts: 0,
    async start(onAudio, signal) {
      this.running = true; this.starts++; this.signal = signal; this.onAudio = onAudio;
      onAudio(new ArrayBuffer(3200)); // Exercise audio queued before HTTP/WebSocket readiness.
      return { encoding: 'linear16', sampleRate: 16000, channels: 1 };
    },
    async stop() {
      if (this.running) { this.running = false; this.onAudio(new ArrayBuffer(160)); }
    },
  };
  const client = createCaptionClient({ baseUrl, createCapture: () => capture,
    // Browser Origin is automatic in the app; Node's HTTP client requires it explicitly here.
    fetcher: (url, options) => {
      assert.ok(url.startsWith(baseUrl + '/v1/stt/')); requests.push(options.method);
      if (url.endsWith('/sessions')) sessionRequests.push(JSON.parse(options.body));
      return fetch(url, { ...options, headers: { ...options.headers, Origin: origin } });
    },
    createSocket: (url, protocols) => new WebSocket(url, protocols, { origin }),
    onState: state => states.push(state), startupMs: 1500, drainMs: 1500,
  });
  t.after(async () => {
    client.dispose(); await server.close();
    for (const socket of fakeDeepgram.clients) socket.terminate();
    await new Promise(resolve => fakeDeepgram.close(resolve));
  });
  await client.connect(server.newPairingCode());
  assert.equal(client.getState().connected, true); assert.equal(capture.starts, 0);
  await client.start();
  await until(() => client.getState().segments.length === 1);
  assert.deepEqual(inputLanguages, ['ur']);
  assert.equal(sessionRequests[0].inputLanguage, 'ur');
  const segment = client.getState().segments[0];
  assert.deepEqual(segment.outputs, outputs);
  assert.match(segment.id, /^[a-f0-9-]+:1$/i);
  assert.deepEqual(conversionInputs, [{ text: source, languages: ['hi', 'en'] }]);
  assert.equal(client.getState().pending, 0); assert.equal(client.getState().phase, 'listening');
  // Local output selection reads the same pair; it makes no transport/provider request.
  const requestsBefore = requests.length;
  assert.equal(segment.outputs.en, outputs.en); assert.equal(segment.outputs.ur, outputs.ur);
  assert.equal(requests.length, requestsBefore); assert.equal(conversionInputs.length, 1);
  await client.stop(); await until(() => client.getState().phase === 'idle');
  assert.equal(capture.running, false); assert.equal(capture.signal.aborted, true);
  assert.deepEqual(upstreamFrames.map(item => item.type), ['audio', 'audio', 'CloseStream']);
  assert.equal(upstreamFrames[0].bytes, 3200); assert.equal(upstreamFrames[1].bytes, 160);
  assert.equal(server.activeCount(), 0); assert.equal(client.getState().segments.length, 1);
  assert.equal(client.setInputLanguage('en'), true);
  await client.start();
  await until(() => client.getState().segments.length === 2);
  assert.deepEqual(inputLanguages, ['ur', 'en']);
  assert.deepEqual(sessionRequests.map(request => request.inputLanguage), ['ur', 'en']);
  assert.deepEqual(client.getState().segments[0], segment, 'New input must not rewrite an existing output pair.');
  assert.deepEqual(client.getState().segments[1].outputs, outputs);
  assert.equal(client.setInputLanguage('ur'), false, 'Running session input cannot change.');
  await client.stop(); await until(() => client.getState().phase === 'idle');
  assert.equal(server.activeCount(), 0); assert.equal(conversionInputs.length, 2);
  assert.equal(states.some(state => state.phase === 'error'), false);
  assert.ok(!JSON.stringify(states).includes('मुझे'));
});

async function until(check) {
  const deadline = Date.now() + 2000;
  while (!check()) {
    if (Date.now() > deadline) assert.fail('Expected complete caption flow did not arrive');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}
