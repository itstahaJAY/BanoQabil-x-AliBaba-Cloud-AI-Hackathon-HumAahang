import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { createCaptionClient, captionClientMessages } from '../src/caption-client.ts';
import { createSpeechServer } from '../server/server.mjs';
import { connectOpenAI } from '../server/openai-stt.mjs';
import { createBilingualProcessor } from '../server/providers.mjs';

const { WebSocket, WebSocketServer } = createRequire(new URL('../server/package.json', import.meta.url))('ws');
const origin = 'http://localhost:8081';
const providerSecret = 'isolated-openai-secret-never-for-client';
const operatorToken = 'isolated-operator-token-never-for-client';
const source = 'मुझे पानी चाहिए।';
const transcripts = [source, 'Meet me at 3 PM.', 'Thank you.'];
const outputs = [
  { ur: 'مجھے پانی چاہیے۔', en: 'I need water.' },
  { ur: 'مجھ سے سہ پہر 3 بجے ملو۔', en: 'Meet me at 3 PM.' },
  { ur: 'شکریہ۔', en: 'Thank you.' },
];

for (const [inputLanguage, sampleRate] of [['ur', 16000], ['en', 48000]]) {
  test(`OpenAI captions preserve pairing, ${inputLanguage} input at ${sampleRate} Hz, ordering and bilingual stop drain`, { timeout: 8000 }, async t => {
    let releaseTranslation;
    const translationGate = new Promise(resolve => { releaseTranslation = resolve; });
    t.after(() => releaseTranslation());
    const flow = await createFlow(t, { sampleRate, translate: async input => {
      await translationGate;
      return responseFor(input.text);
    } });
    const { client, capture, server, requests, clientFrames, conversions, peer, providerFrames } = flow;

    const denied = await fetch(flow.baseUrl + '/v1/stt/sessions', { method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: capture.format, mode: 'bilingual', inputLanguage }) });
    assert.equal(denied.status, 401, 'Switching the provider must not bypass client authentication.');
    assert.equal(providerFrames.length, 0);
    await client.connect(server.newPairingCode());
    assert.equal(client.getState().connected, true);
    assert.equal(capture.starts, 0, 'Pairing alone must not open the microphone.');
    assert.equal(client.setInputLanguage(inputLanguage), true);
    await client.start();
    await until(() => flow.sessionUpdates().length === 1, 'OpenAI session configuration');

    const setup = flow.sessionUpdates()[0];
    assert.equal(setup.session.type, 'transcription');
    assert.deepEqual(setup.session.audio.input.format, { type: 'audio/pcm', rate: 24000 });
    assert.equal(setup.session.audio.input.transcription.model, 'gpt-4o-transcribe');
    assert.equal(setup.session.audio.input.transcription.language, inputLanguage);
    assert.equal(setup.session.audio.input.turn_detection.type, 'server_vad');
    assert.equal(client.getState().phase, 'connecting');
    assert.equal(clientFrames.some(frame => frame.type === 'ready'), false);
    assert.equal(flow.audioFrames().length, 0, 'TCP open/session.created is not permission to send microphone PCM.');
    assert.equal(client.setInputLanguage(inputLanguage === 'ur' ? 'en' : 'ur'), false);

    flow.acknowledge(setup);
    await until(() => flow.audioFrames().length > 0, 'queued microphone audio after acknowledgement');
    assert.equal(client.getState().phase, 'listening');
    assert.equal(requests[0].path, '/v1/stt/clients');
    assert.equal(requests[0].headers.Authorization, undefined);
    const sessionRequest = requests.find(request => request.path === '/v1/stt/sessions');
    assert.match(sessionRequest.headers.Authorization, /^Bearer [A-Za-z0-9_-]{20,128}$/);
    assert.notEqual(sessionRequest.headers.Authorization, `Bearer ${operatorToken}`);
    assert.deepEqual(sessionRequest.body, { audio: capture.format, mode: 'bilingual', inputLanguage });

    flow.commit('item-a', null, 100);
    // Allow for the resampler's small lookahead: only already-sent audio can end a VAD turn.
    flow.commit('item-b', 'item-a', 190);
    flow.send({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'item-a', content_index: 0, delta: source });
    flow.complete('item-b', transcripts[1]);
    await peerRoundTrip(peer.socket);
    assert.equal(client.getState().segments.length, 0, 'A later turn cannot overtake an unfinished earlier turn.');
    assert.equal(conversions.length, 0);

    await client.stop();
    await until(() => flow.sessionUpdates().length === 2, 'VAD stop barrier');
    assert.equal(capture.running, false);
    assert.equal(client.getState().phase, 'stopping');
    const stopUpdate = flow.sessionUpdates()[1];
    assert.equal(stopUpdate.session.audio.input.turn_detection, null);
    flow.acknowledge(stopUpdate);
    await until(() => providerFrames.some(frame => frame.type === 'input_audio_buffer.commit'), 'last microphone packet commit');
    flow.commit('item-c', 'item-b');
    flow.complete('item-c', transcripts[2]);
    await until(() => flow.sessionUpdates().length === 3, 'final commit barrier');
    flow.acknowledge(flow.sessionUpdates()[2]);
    flow.complete('item-a', transcripts[0]);
    flow.complete('item-a', transcripts[0]); // Provider retries must not duplicate a caption.
    await until(() => conversions.length === 1, 'bilingual conversion during stop');
    assert.equal(client.getState().phase, 'stopping');
    assert.equal(clientFrames.some(frame => frame.type === 'closed'), false, 'Stop must await bilingual output, not just recognition.');
    releaseTranslation();
    await until(() => client.getState().phase === 'idle', 'completed bilingual drain');

    assert.deepEqual(client.getState().segments.map(segment => segment.outputs), outputs);
    assert.deepEqual(clientFrames.filter(frame => frame.type === 'caption_final').map(frame => frame.sequence), [1, 2, 3]);
    assert.equal(clientFrames.at(-1).type, 'closed');
    assert.deepEqual(conversions.map(input => input.text), transcripts);
    assert.equal(client.getState().pending, 0);
    assert.equal(client.getState().inputLanguageLocked, false);
    assert.equal(capture.signal.aborted, true);
    assert.equal(server.activeCount(), 0);
    assert.equal(flow.states.some(state => state.phase === 'error'), false);
    const pcm = Buffer.concat(flow.audioFrames().map(frame => {
      const decoded = Buffer.from(frame.audio, 'base64');
      assert.equal(decoded.toString('base64'), frame.audio, 'Audio must be canonical base64 PCM.');
      return decoded;
    }));
    assert.equal(pcm.length, 24000 * 2 * 0.3, 'Both capture formats must retain their 300 ms duration at 24 kHz.');
    assert.ok(pcm.some(byte => byte !== 0), 'Synthetic microphone samples must survive conversion.');
    assert.equal(providerFrames.some(frame => frame.binary), false, 'OpenAI takes JSON audio append messages.');
    assertPrivate(flow);
  });
}

test('OpenAI startup and runtime errors retain the existing safe messages and completed captions', { timeout: 8000 }, async t => {
  for (const afterReady of [false, true]) {
    await t.test(afterReady ? 'interrupted listening' : 'rejected startup', async t => {
      const flow = await createFlow(t);
      await flow.client.connect(flow.server.newPairingCode());
      await flow.client.start();
      await until(() => flow.sessionUpdates().length === 1, 'provider session update');
      if (afterReady) {
        flow.acknowledge(flow.sessionUpdates()[0]);
        await until(() => flow.audioFrames().length > 0, 'provider audio');
        flow.commit('item-a', null, 190);
        flow.complete('item-a', source);
        await until(() => flow.client.getState().segments.length === 1, 'first bilingual pair');
      }
      const completed = flow.client.getState().segments;
      flow.send({ type: 'error', error: { type: 'invalid_request_error', code: 'invalid_api_key',
        message: `PRIVATE_PROVIDER_DIAGNOSTIC ${providerSecret} ${source}` } });
      await until(() => flow.client.getState().phase === 'error', 'safe provider failure');
      assert.equal(flow.client.getState().message, captionClientMessages[afterReady ? 'provider_interrupted' : 'provider_unavailable']);
      assert.deepEqual(flow.client.getState().segments, completed);
      assert.equal(completed.length, afterReady ? 1 : 0);
      assert.equal(flow.capture.running, false);
      assert.equal(flow.server.activeCount(), 0);
      assertPrivate(flow);
    });
  }
});

test('a failed DeepSeek conversion after OpenAI recognition preserves the completed bilingual pair', { timeout: 5000 }, async t => {
  const flow = await createFlow(t, { translate: input => input.text === source ? responseFor(source)
    : new Response('PRIVATE_TRANSLATION_DIAGNOSTIC', { status: 503 }) });
  await flow.client.connect(flow.server.newPairingCode());
  await flow.client.start();
  await until(() => flow.sessionUpdates().length === 1, 'provider session update');
  flow.acknowledge(flow.sessionUpdates()[0]);
  await until(() => flow.audioFrames().length > 0, 'provider audio');
  flow.commit('item-a', null, 100);
  flow.complete('item-a', source);
  await until(() => flow.client.getState().segments.length === 1, 'first bilingual pair');
  const completed = flow.client.getState().segments;
  flow.commit('item-b', 'item-a', 190);
  flow.complete('item-b', transcripts[1]);
  await until(() => flow.clientFrames.some(frame => frame.type === 'segment_error'), 'failed translation event');
  await until(() => flow.client.getState().pending === 0, 'failed translation settles');
  assert.equal(flow.client.getState().phase, 'listening');
  assert.equal(flow.client.getState().message, captionClientMessages.translation_request);
  assert.deepEqual(flow.client.getState().segments, completed);
  assert.deepEqual(completed[0].outputs, outputs[0]);
  assert.equal(flow.clientFrames.find(frame => frame.type === 'segment_error').stage, 'translation_request');
  assertPrivate(flow);
  flow.client.cancel();
  await until(() => flow.server.activeCount() === 0, 'cancelled local session');
});

async function createFlow(t, { sampleRate = 16000, translate = input => responseFor(input.text) } = {}) {
  const states = [], requests = [], clientFrames = [], conversions = [], providerFrames = [];
  const peer = { socket: undefined };
  const fakeOpenAI = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(fakeOpenAI, 'listening');
  fakeOpenAI.on('connection', socket => {
    peer.socket = socket;
    socket.on('message', (data, binary) => providerFrames.push(binary ? { binary: true } : JSON.parse(data.toString())));
    socket.send(JSON.stringify({ type: 'session.created', session: { type: 'transcription' } }));
  });
  const config = { clientToken: operatorToken, origins: [origin], sttProvider: 'openai',
    openaiKey: providerSecret, openaiSttModel: 'gpt-4o-transcribe',
    deepseekKey: 'isolated-deepseek-secret-never-for-client', deepseekModel: 'deepseek-v4-flash',
    connectTimeoutMs: 2000, drainTimeoutMs: 3000 };
  const processBilingual = createBilingualProcessor(config, async (url, options) => {
    assert.equal(url, 'https://api.deepseek.com/chat/completions');
    const body = JSON.parse(options.body);
    assert.equal(body.model, config.deepseekModel);
    const input = JSON.parse(body.messages[1].content);
    conversions.push(input);
    return translate(input);
  });
  const server = createSpeechServer(config, { processBilingual,
    convert: () => assert.fail('Live Captions must use the bilingual processor.'),
    connect: (audio, inputLanguage) => connectOpenAI(config, audio, inputLanguage, { createSocket: (url, options) => {
      assert.equal(url, 'wss://api.openai.com/v1/realtime?intent=transcription');
      assert.equal(options.headers.Authorization, `Bearer ${providerSecret}`);
      return new WebSocket(`ws://127.0.0.1:${fakeOpenAI.address().port}`, options);
    } }),
  });
  server.server.listen(0, '127.0.0.1');
  await once(server.server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.server.address().port}`;
  const capture = { running: false, starts: 0, format: { encoding: 'linear16', sampleRate, channels: 1 },
    async start(onAudio, signal) {
      this.running = true; this.starts++; this.onAudio = onAudio; this.signal = signal;
      onAudio(new Int16Array(sampleRate / 5).fill(1000).buffer);
      return this.format;
    },
    async stop() {
      if (this.running) {
        this.running = false;
        this.onAudio(new Int16Array(sampleRate / 10).fill(1000).buffer);
      }
    },
  };
  const client = createCaptionClient({ baseUrl, createCapture: () => capture,
    fetcher: (url, options) => {
      assert.ok(url.startsWith(baseUrl + '/v1/stt/'));
      requests.push({ path: new URL(url).pathname, headers: options.headers, body: options.body ? JSON.parse(options.body) : undefined });
      return fetch(url, { ...options, headers: { ...options.headers, Origin: origin } });
    },
    createSocket: (url, protocols) => {
      assert.equal(url, baseUrl.replace(/^http/, 'ws') + '/v1/stt/stream');
      assert.equal(protocols[0], 'humahang.stt.v1');
      assert.match(protocols[1], /^ticket\.[a-zA-Z0-9_-]+$/);
      const socket = new WebSocket(url, protocols, { origin });
      socket.on('message', data => clientFrames.push(JSON.parse(data.toString())));
      return socket;
    },
    onState: state => states.push(state), startupMs: 2500, drainMs: 3500,
  });
  t.after(async () => {
    client.dispose();
    await server.close();
    for (const socket of fakeOpenAI.clients) socket.terminate();
    await new Promise(resolve => fakeOpenAI.close(resolve));
  });
  const send = frame => peer.socket.send(JSON.stringify(frame));
  return { client, capture, server, baseUrl, states, requests, clientFrames, conversions, providerFrames, peer,
    send, sessionUpdates: () => providerFrames.filter(frame => frame.type === 'session.update'),
    audioFrames: () => providerFrames.filter(frame => frame.type === 'input_audio_buffer.append'),
    acknowledge: update => send({ type: 'session.updated', session: update.session }),
    commit: (itemId, previousItemId, endMs) => {
      if (endMs !== undefined) send({ type: 'input_audio_buffer.speech_stopped', item_id: itemId, audio_end_ms: endMs });
      send({ type: 'input_audio_buffer.committed', item_id: itemId, previous_item_id: previousItemId });
    },
    complete: (itemId, transcript) => send({ type: 'conversation.item.input_audio_transcription.completed', item_id: itemId,
      content_index: 0, transcript }),
  };
}

function responseFor(text) {
  const index = transcripts.indexOf(text);
  assert.notEqual(index, -1, 'Unexpected source sent to the translation boundary.');
  return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(outputs[index]) } }] });
}

function assertPrivate(flow) {
  const visible = JSON.stringify({ states: flow.states, frames: flow.clientFrames });
  assert.doesNotMatch(visible, /\p{Script=Devanagari}/u);
  for (const privateText of [providerSecret, operatorToken, 'PRIVATE_PROVIDER_DIAGNOSTIC', 'PRIVATE_TRANSLATION_DIAGNOSTIC']) {
    assert.equal(visible.includes(privateText), false, 'Provider details and raw transcripts must not cross the client boundary.');
  }
}

async function peerRoundTrip(socket) {
  const pong = once(socket, 'pong', { signal: AbortSignal.timeout(1500) });
  socket.ping();
  await pong;
}

async function until(check, expected) {
  const deadline = Date.now() + 2500;
  while (!check()) {
    if (Date.now() > deadline) assert.fail(`Expected ${expected} did not arrive.`);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}
