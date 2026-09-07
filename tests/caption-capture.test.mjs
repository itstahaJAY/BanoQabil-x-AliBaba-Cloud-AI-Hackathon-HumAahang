import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCaptionCapture as createWebCapture } from '../src/caption-capture.web.ts';
import { createCaptionCapture as createNativeCapture } from '../src/caption-capture.ts';

function webHarness(context, getUserMedia) {
  const track = new EventTarget();
  track.stops = 0;
  track.stop = () => { track.stops++; };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const nodes = [], contexts = [];
  class FakeContext {
    sampleRate = 48000;
    state = 'suspended';
    destination = {};
    audioWorklet = { addModule: async () => {} };
    constructor() { contexts.push(this); }
    async resume() { this.state = 'running'; }
    async close() { this.state = 'closed'; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
  }
  class FakeWorklet {
    port = {
      onmessage: null,
      close() {},
      postMessage: () => {
        this.port.onmessage?.({ data: new Float32Array([.5]) });
        this.port.onmessage?.({ data: 'flushed' });
      },
    };
    constructor() { nodes.push(this); }
    connect() {}
    disconnect() {}
  }
  for (const [name, value] of Object.entries({
    window: { isSecureContext: true }, navigator: { mediaDevices: { getUserMedia: getUserMedia ?? (async () => stream) } },
    AudioContext: FakeContext, AudioWorkletNode: FakeWorklet, document: Object.assign(new EventTarget(), { visibilityState: 'visible' }),
  })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    context.after(() => { if (original) Object.defineProperty(globalThis, name, original); else delete globalThis[name]; });
  }
  return { track, stream, nodes, contexts };
}

test('web capture cancellation during permission dialog releases a late-granted microphone', async context => {
  let grant;
  const h = webHarness(context, () => new Promise(resolve => { grant = resolve; }));
  const capture = createWebCapture(), controller = new AbortController();
  const started = capture.start(() => assert.fail('No audio after cancellation'), controller.signal);
  controller.abort();
  await assert.rejects(started, { code: 'capture_cancelled' });
  grant(h.stream);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.track.stops, 1);
  assert.equal(h.contexts[0].state, 'closed');
  assert.equal(h.nodes.length, 0);
});

test('web stop flushes its tail, releases tracks/context and blocks queued late audio', async context => {
  const h = webHarness(context), capture = createWebCapture(), frames = [];
  const format = await capture.start(frame => frames.push(frame), new AbortController().signal);
  assert.deepEqual(format, { encoding: 'linear16', sampleRate: 48000, channels: 1 });
  const queuedMessage = h.nodes[0].port.onmessage;
  await capture.stop();
  queuedMessage({ data: new Float32Array([1]) });
  assert.equal(frames.length, 1);
  assert.equal(new DataView(frames[0]).getInt16(0, true), 16384);
  assert.equal(h.track.stops, 1);
  assert.equal(h.contexts[0].state, 'closed');
});

test('web device interruption stops the hardware and reports one safe error', async context => {
  const h = webHarness(context), capture = createWebCapture(), errors = [];
  await capture.start(() => {}, new AbortController().signal, error => errors.push(error.code));
  h.track.dispatchEvent(new Event('mute'));
  h.track.dispatchEvent(new Event('ended'));
  await capture.stop();
  assert.deepEqual(errors, ['microphone_interrupted']);
  assert.equal(h.track.stops, 1);
});

test('web cleanup still closes its context if the worklet port fails during the final flush', async context => {
  const h = webHarness(context), capture = createWebCapture();
  await capture.start(() => {}, new AbortController().signal);
  h.nodes[0].port.postMessage = () => { throw new Error('Port already closed'); };
  await assert.rejects(capture.stop(), { code: 'capture_failed' });
  assert.equal(h.contexts[0].state, 'closed');
  assert.equal(h.track.stops, 1);
});

test('web insecure context and denied permission do not masquerade as listening', async context => {
  const h = webHarness(context, async () => { throw new DOMException('private', 'NotAllowedError'); });
  const capture = createWebCapture();
  window.isSecureContext = false;
  await assert.rejects(capture.start(() => {}, new AbortController().signal), { code: 'insecure_context' });
  window.isSecureContext = true;
  await assert.rejects(capture.start(() => {}, new AbortController().signal), { code: 'microphone_denied' });
  assert.equal(h.contexts[0].state, 'closed');
});

function nativeHarness(overrides = {}) {
  const recorders = [], events = new Map();
  let clears = 0;
  class AudioRecorder {
    recording = false; stops = 0;
    constructor() { recorders.push(this); }
    onAudioReady(config, callback) { this.config = config; this.callback = callback; return { status: 'success' }; }
    onError(callback) { this.error = callback; }
    clearOnAudioReady() { this.callback = undefined; clears++; }
    clearOnError() { this.error = undefined; }
    async start() { this.recording = true; return { status: 'success' }; }
    async stop() { this.stops++; this.recording = false; return { status: 'success' }; }
    isRecording() { return this.recording; }
  }
  const AudioManager = {
    requestRecordingPermissions: async () => 'Granted',
    setAudioSessionOptions() {}, setAudioSessionActivity: async () => {}, observeAudioInterruptions() {},
    addSystemEventListener(name, callback) { events.set(name, callback); return { remove: () => events.delete(name) }; },
    ...overrides,
  };
  return { module: { AudioRecorder, AudioManager }, recorders, events, get clears() { return clears; } };
}

test('native permission cancellation cannot start recording when the grant arrives late', async () => {
  let grant;
  const h = nativeHarness({ requestRecordingPermissions: () => new Promise(resolve => { grant = resolve; }) });
  const capture = createNativeCapture(() => h.module), controller = new AbortController();
  const started = capture.start(() => assert.fail('No audio after cancel'), controller.signal);
  controller.abort();
  await assert.rejects(started, { code: 'capture_cancelled' });
  grant('Granted');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.recorders.length, 0);
});

test('native PCM configuration is verified and interrupted formats never emit pitch-corrupted audio', async () => {
  const h = nativeHarness(), frames = [], errors = [];
  const capture = createNativeCapture(() => h.module);
  assert.deepEqual(await capture.start(frame => frames.push(frame), new AbortController().signal, error => errors.push(error.code)),
    { encoding: 'linear16', sampleRate: 16000, channels: 1 });
  const recorder = h.recorders[0], callback = recorder.callback;
  assert.deepEqual(recorder.config, { sampleRate: 16000, bufferLength: 1600, channelCount: 1 });
  const buffer = { sampleRate: 16000, length: 1600, numberOfChannels: 1, getChannelData: () => new Float32Array(1600) };
  callback({ buffer, numFrames: 1600 });
  callback({ buffer: { ...buffer, sampleRate: 48000 }, numFrames: 1600 });
  await capture.stop();
  callback({ buffer, numFrames: 1600 });
  assert.equal(frames.length, 1);
  assert.deepEqual(errors, ['audio_format_unsupported']);
  assert.equal(recorder.recording, false);
  assert.equal(h.events.size, 0);
  assert.equal(h.clears, 1);
});

test('native start cancelled in flight is stopped again if its acknowledgement arrives after stop', async () => {
  const h = nativeHarness();
  let acknowledge;
  h.module.AudioRecorder.prototype.start = function () {
    return new Promise(resolve => { acknowledge = () => { this.recording = true; resolve({ status: 'success' }); }; });
  };
  const capture = createNativeCapture(() => h.module), controller = new AbortController();
  const started = capture.start(() => assert.fail('No frames after cancellation'), controller.signal);
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  acknowledge();
  await assert.rejects(started, { code: 'capture_cancelled' });
  assert.equal(h.recorders[0].stops, 2);
  assert.equal(h.recorders[0].recording, false);
});

test('native cancellation inside an audio callback suppresses the rest of that buffer', async () => {
  const h = nativeHarness(), controller = new AbortController();
  const capture = createNativeCapture(() => h.module);
  let frames = 0;
  await capture.start(() => { frames++; controller.abort(); }, controller.signal);
  h.recorders[0].callback({ numFrames: 4000, buffer: {
    sampleRate: 16000, length: 4000, numberOfChannels: 1, getChannelData: () => new Float32Array(4000),
  } });
  await capture.stop();
  assert.equal(frames, 1);
});
