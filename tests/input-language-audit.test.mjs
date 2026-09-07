import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInputLanguageFeedback } from '../src/input-language-feedback.ts';

const settle = () => new Promise(resolve => setImmediate(resolve));

test('explicitly stopping a voice indication keeps the microphone locked until native speech actually stops', async t => {
  const states = [];
  let stopCount = 0, releaseStop, indication;
  const feedback = createInputLanguageFeedback({
    stop() {
      if (++stopCount === 1) return Promise.resolve();
      return new Promise(resolve => { releaseStop = resolve; });
    },
    speak(text, options) { indication = options; },
  }, state => states.push(state), 1000);
  t.after(() => { releaseStop?.(); feedback.dispose(); });
  feedback.speak('ur'); await settle();
  assert.equal(indication.language, 'ur-PK');
  feedback.stop();
  assert.equal(states.at(-1).busy, true, 'Native speech may still be audible until stop resolves.');
  releaseStop(); await settle();
  assert.equal(states.at(-1).busy, false);
  indication.onDone();
  assert.equal(states.at(-1).busy, false, 'Stale completion must not restart voice feedback.');
});

test('a voice timeout must not unlock recording before its asynchronous stop completes', async t => {
  const states = [];
  let stopCount = 0, releaseStop;
  const feedback = createInputLanguageFeedback({
    stop() {
      if (++stopCount === 1) return Promise.resolve();
      return new Promise(resolve => { releaseStop = resolve; });
    }, speak() {},
  }, state => states.push(state), 10);
  t.after(() => { releaseStop?.(); feedback.dispose(); });
  feedback.speak('en'); await settle();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(states.at(-1).busy, true, 'A timer expiry cannot prove that TTS has stopped.');
  releaseStop(); await settle();
  assert.deepEqual(states.at(-1), { busy: false, error: true });
});

test('rejected stop remains visibly locked and an explicit stop retry recovers', async t => {
  const states = [];
  let stopCount = 0;
  const feedback = createInputLanguageFeedback({
    stop() { return ++stopCount === 2 ? Promise.reject(new Error('device failure')) : Promise.resolve(); }, speak() {},
  }, state => states.push(state));
  t.after(() => feedback.dispose());
  feedback.speak('en'); await settle(); feedback.stop(); await settle();
  assert.deepEqual(states.at(-1), { busy: true, error: true });
  feedback.stop(); await settle();
  assert.deepEqual(states.at(-1), { busy: false, error: false });
});

test('late preparation-stop completion cannot unexpectedly speak after its deadline', async t => {
  const states = [];
  let release, spoken = 0;
  const feedback = createInputLanguageFeedback({
    stop: () => new Promise(resolve => { release = resolve; }), speak() { spoken++; },
  }, state => states.push(state), 10);
  t.after(() => { release?.(); feedback.dispose(); });
  feedback.speak('ur'); await new Promise(resolve => setTimeout(resolve, 30));
  assert.deepEqual(states.at(-1), { busy: true, error: true });
  release(); await settle();
  assert.equal(spoken, 0);
  assert.deepEqual(states.at(-1), { busy: false, error: true });
});

test('voice errors wait for confirmed stop; stale completion cannot bypass that safety barrier', async t => {
  const states = [];
  let stopCount = 0, indication, release;
  const feedback = createInputLanguageFeedback({
    stop() { return ++stopCount === 1 ? Promise.resolve() : new Promise(resolve => { release = resolve; }); },
    speak(text, callbacks) { indication = callbacks; },
  }, state => states.push(state));
  t.after(() => { release?.(); feedback.dispose(); });
  feedback.speak('en'); await settle(); indication.onError(); indication.onDone();
  assert.deepEqual(states.at(-1), { busy: true, error: true });
  release(); await settle();
  assert.deepEqual(states.at(-1), { busy: false, error: true });
});
