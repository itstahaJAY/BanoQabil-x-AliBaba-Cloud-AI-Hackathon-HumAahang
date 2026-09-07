import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSpeechInput } from '../src/speech-input.ts';

function setup(overrides = {}, options = {}) {
  const listeners = new Map();
  const engine = {
    requestPermissionsAsync: async () => ({ granted: true }),
    isRecognitionAvailable: () => true,
    start() {}, stop() {}, abort() {},
    addListener(event, listener) {
      listeners.set(event, listener);
      return { remove: () => listeners.delete(event) };
    },
    ...overrides,
  };
  const states = [], drafts = [];
  const input = createSpeechInput(engine, { permissionRequired: true, onState: s => states.push(s), onDraft: (...args) => drafts.push(args), ...options });
  return { input, engine, states, drafts, listeners, emit: (event, data) => listeners.get(event)?.(data) };
}

test('real recognition replaces interim hypotheses, preserves draft and original sender, never sends automatically', async () => {
  const h = setup();
  await h.input.start('partner', 'Existing draft', 'en-US');
  h.emit('start');
  h.emit('result', { isFinal: false, results: [{ transcript: 'Please' }] });
  h.emit('result', { isFinal: false, results: [{ transcript: 'Please help' }] });
  assert.equal(h.states.at(-1).preview, 'Please help');
  assert.deepEqual(h.drafts, []);
  await h.input.start('you', 'Wrong owner', 'en-US');
  h.input.stop();
  h.emit('result', { isFinal: true, results: [{ transcript: 'Please help me' }] });
  h.emit('end');
  assert.deepEqual(h.drafts, [['partner', 'Existing draft Please help me']]);
  assert.equal(h.states.at(-1).phase, 'idle');
  h.input.dispose();
});

test('continuous captions commit each final segment; pause stops capture and resume keeps prior text', async () => {
  let stops = 0, config;
  const h = setup({ start: value => { config = value; }, stop: () => { stops++; } }, { continuous: true });
  await h.input.start('you', '', 'en-US');
  assert.equal(config.continuous, true);
  h.emit('start');
  h.emit('result', { isFinal: true, results: [{ transcript: 'First sentence.' }] });
  h.emit('result', { isFinal: false, results: [{ transcript: 'Second sentence.' }] });
  assert.deepEqual(h.drafts, [['you', 'First sentence.']]);
  h.input.stop();
  assert.equal(stops, 1);
  h.emit('result', { isFinal: true, results: [{ transcript: 'Second sentence.' }] });
  h.emit('end');
  assert.deepEqual(h.drafts, [['you', 'First sentence.'], ['you', 'Second sentence.']]);
  await h.input.start('you', '', 'en-US');
  h.emit('result', { isFinal: true, results: [{ transcript: 'After resume.' }] });
  h.emit('end');
  assert.deepEqual(h.drafts.map(x => x[1]), ['First sentence.', 'Second sentence.', 'After resume.']);
  h.input.dispose();
});

test('continuous captions retain committed text after a network error without adding unfinished speech', async () => {
  const h = setup({}, { continuous: true });
  await h.input.start('you', '', 'en-US');
  h.emit('result', { isFinal: true, results: [{ transcript: 'Keep this.' }] });
  h.emit('result', { isFinal: false, results: [{ transcript: 'Unfinished' }] });
  h.emit('error', { error: 'network' });
  h.emit('end');
  assert.deepEqual(h.drafts, [['you', 'Keep this.']]);
  assert.match(h.states.at(-1).message, /connect/);
});

test('permission denial returns actionable feedback without a fabricated draft', async () => {
  const h = setup({ requestPermissionsAsync: async () => ({ granted: false }) });
  await h.input.start('you', '', 'en-US');
  assert.match(h.states.at(-1).message, /permission/i);
  assert.equal(h.states.at(-1).phase, 'idle');
  assert.deepEqual(h.drafts, []);
});

test('cancel during permission request prevents late start', async () => {
  let grant, starts = 0;
  const h = setup({ requestPermissionsAsync: () => new Promise(resolve => { grant = resolve; }), start: () => { starts++; } });
  const pending = h.input.start('you', '', 'en-US');
  h.input.cancel();
  grant({ granted: true });
  await pending;
  assert.equal(starts, 0);
  assert.equal(h.states.at(-1).phase, 'idle');
  assert.deepEqual(h.drafts, []);
});

test('cancel discards recognition and ignores late results until end', async () => {
  const h = setup();
  await h.input.start('you', 'Keep this', 'en-US');
  h.emit('start');
  h.emit('result', { isFinal: true, results: [{ transcript: 'Do not append' }] });
  h.input.cancel();
  h.emit('result', { isFinal: true, results: [{ transcript: 'Late result' }] });
  h.emit('end');
  assert.deepEqual(h.drafts, []);
  assert.match(h.states.at(-1).message, /cancel/i);
  assert.equal(h.listeners.size, 0);
});

test('network error and no-speech never insert sample text', async () => {
  for (const error of ['network', 'no-speech']) {
    const h = setup();
    await h.input.start('you', '', 'ur-PK');
    h.emit('error', { error });
    h.emit('end');
    assert.equal(h.states.at(-1).phase, 'idle');
    assert.ok(h.states.at(-1).message.length > 10);
    assert.deepEqual(h.drafts, []);
    h.input.dispose();
  }
});

test('no end event cannot leave Stop stuck forever', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const h = setup();
  await h.input.start('you', '', 'en-US');
  h.emit('start');
  h.input.stop();
  context.mock.timers.tick(6000);
  assert.equal(h.states.at(-1).phase, 'idle');
  assert.equal(h.listeners.size, 0);
  assert.deepEqual(h.drafts, []);
  h.input.dispose();
});

test('unmount removes listeners and blocks callbacks already queued by device', async () => {
  const h = setup();
  await h.input.start('partner', '', 'en-US');
  const result = h.listeners.get('result'), end = h.listeners.get('end');
  assert.equal(typeof result, 'function');
  assert.equal(typeof end, 'function');
  h.input.dispose();
  result?.({ isFinal: true, results: [{ transcript: 'Late speech' }] });
  end?.();
  assert.equal(h.listeners.size, 0);
  assert.deepEqual(h.drafts, []);
});

test('missing native module and insecure web origin give guidance without starting recognition', async () => {
  const states = [], drafts = [];
  const input = createSpeechInput(null, { permissionRequired: false, unavailable: 'Microphone needs HTTPS or a native development build.', onState: state => states.push(state), onDraft: (...args) => drafts.push(args) });
  await input.start('you', 'Keep this draft', 'en-US');
  assert.equal(states.at(-1).phase, 'idle');
  assert.match(states.at(-1).message, /HTTPS/);
  assert.deepEqual(drafts, []);
});

test('automatic sentence end commits the latest hypothesis once and releases the session for the next sender', async () => {
  const h = setup();
  await h.input.start('you', '', 'ur-PK');
  h.emit('result', { isFinal: false, results: [{ transcript: 'مجھے پانی چاہیے۔' }] });
  const lateEnd = h.listeners.get('end');
  h.emit('end');
  await h.input.start('partner', '', 'en-US');
  lateEnd();
  h.emit('result', { isFinal: true, results: [{ transcript: 'I can help' }] });
  h.emit('result', { isFinal: true, results: [{ transcript: 'I can help' }] });
  h.emit('end');
  assert.deepEqual(h.drafts, [['you', 'مجھے پانی چاہیے۔'], ['partner', 'I can help']]);
  assert.equal(h.states.at(-1).phase, 'idle');
});

test('synchronous microphone failure releases listeners and keeps the existing draft', async () => {
  const h = setup({ start() { throw new Error('Microphone unavailable'); } });
  await h.input.start('you', 'Keep existing text', 'en-US');
  assert.match(h.states.at(-1).message, /Could not start/);
  assert.equal(h.listeners.size, 0);
  assert.deepEqual(h.drafts, []);
});

test('continuous device sentence end reconnects without losing text or accepting stale callbacks', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let starts = 0;
  const h = setup({ start() { starts++; } }, { continuous: true });
  await h.input.start('you', '', 'ur-PK');
  h.emit('start');
  h.emit('result', { isFinal: true, results: [{ transcript: 'پہلا جملہ' }] });
  const lateResult = h.listeners.get('result'), lateEnd = h.listeners.get('end');
  h.emit('end');
  assert.equal(h.states.at(-1).phase, 'reconnecting');
  context.mock.timers.tick(400);
  assert.equal(starts, 2);
  h.emit('start');
  lateResult({ isFinal: true, results: [{ transcript: 'Stale duplicate' }] });
  lateEnd();
  h.emit('result', { isFinal: true, results: [{ transcript: 'Second sentence' }] });
  h.input.stop();
  h.emit('end');
  context.mock.timers.tick(1000);
  assert.equal(starts, 2);
  assert.deepEqual(h.drafts.map(x => x[1]), ['پہلا جملہ', 'Second sentence']);
  assert.equal(h.states.at(-1).phase, 'idle');
  h.input.dispose();
});

test('pause, navigation cancellation and disposal all prevent pending reconnects', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  for (const action of ['stop', 'cancel', 'dispose']) {
    let starts = 0;
    const h = setup({ start() { starts++; } }, { continuous: true });
    await h.input.start('you', '', 'ur-PK');
    h.emit('start');
    h.emit('end');
    h.input[action]();
    context.mock.timers.tick(1000);
    assert.equal(starts, 1, action);
    assert.equal(h.listeners.size, 0);
    h.input.dispose();
  }
});

test('missing start acknowledgement reports a startup problem instead of a normal pause', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  for (const ends of [true, false]) {
    const h = setup({}, { continuous: true });
    await h.input.start('you', '', 'ur-PK');
    if (ends) h.emit('end');
    else context.mock.timers.tick(16000);
    assert.equal(h.states.at(-1).phase, 'idle');
    assert.equal(h.states.at(-1).failure, true);
    assert.match(h.states.at(-1).message, /did not start/);
    assert.deepEqual(h.drafts, []);
    h.input.dispose();
  }
});

test('repeated empty device sessions have a bounded retry budget', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let starts = 0;
  const h = setup({ start() { starts++; } }, { continuous: true });
  await h.input.start('you', '', 'ur-PK');
  for (let i = 0; i < 3; i++) {
    h.emit('start');
    h.emit('end');
    context.mock.timers.tick(400);
  }
  assert.equal(starts, 3);
  assert.equal(h.states.at(-1).phase, 'idle');
  assert.match(h.states.at(-1).message, /No speech/);
  h.input.dispose();
});

test('fatal recognition errors never reconnect and preserve committed text', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  for (const code of ['network', 'not-allowed', 'audio-capture', 'language-not-supported']) {
    let starts = 0;
    const h = setup({ start() { starts++; } }, { continuous: true });
    await h.input.start('you', '', 'ur-PK');
    h.emit('start');
    h.emit('result', { isFinal: true, results: [{ transcript: 'Keep me' }] });
    h.emit('error', { error: code });
    h.emit('end');
    context.mock.timers.tick(3000);
    assert.equal(starts, 1);
    assert.equal(h.states.at(-1).failure, true);
    assert.deepEqual(h.drafts, [['you', 'Keep me']]);
    h.input.dispose();
  }
});

test('pause while a restarted microphone is opening still stops the underlying engine', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let stops = 0;
  const h = setup({ stop() { stops++; } }, { continuous: true });
  await h.input.start('you', '', 'ur-PK');
  h.emit('start');
  h.emit('end');
  context.mock.timers.tick(400);
  h.input.stop();
  assert.equal(stops, 1);
  h.emit('start'); // A late acknowledgement must not undo the user's pause.
  assert.equal(h.states.at(-1).phase, 'stopping');
  h.emit('end');
  assert.equal(h.states.at(-1).phase, 'idle');
  h.input.dispose();
});

test('caption provider switching hints reach the engine and survive a service restart', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const configs = [];
  const request = { lang: 'ur-PK', androidIntentOptions: { EXTRA_ENABLE_LANGUAGE_SWITCH: 'balanced', EXTRA_LANGUAGE_SWITCH_ALLOWED_LANGUAGES: ['ur-PK', 'en-US'] } };
  const h = setup({ start(config) { configs.push(config); } }, { continuous: true });
  await h.input.start('you', '', request);
  h.emit('start');
  h.emit('end');
  context.mock.timers.tick(400);
  assert.equal(configs.length, 2);
  for (const config of configs) {
    assert.deepEqual(config.androidIntentOptions, request.androidIntentOptions);
    assert.equal(config.lang, 'ur-PK');
    assert.equal(config.continuous, true);
  }
  h.input.dispose();
});
