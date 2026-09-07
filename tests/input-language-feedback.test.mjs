import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInputLanguageFeedback } from '../src/input-language-feedback.ts';

const settle = () => new Promise(resolve => setImmediate(resolve));
function setup(timeoutMs) {
  const states = [], spoken = [];
  let stops = 0;
  const controller = createInputLanguageFeedback({ async stop() { stops++; }, speak(text, options) { spoken.push({ text, ...options }); } }, state => states.push(state), timeoutMs);
  return { controller, states, spoken, get stops() { return stops; } };
}
test('input selection speaks the matching device language and holds the microphone lock until feedback ends', async () => {
  const f = setup(); f.controller.speak('ur'); await settle();
  assert.equal(f.states.at(-1)?.busy, true);
  assert.equal(f.spoken[0]?.language, 'ur-PK');
  f.spoken[0].onDone(); assert.equal(f.states.at(-1).busy, false);
  f.controller.speak('en'); await settle(); assert.equal(f.spoken[1].language, 'en-US'); f.controller.dispose();
});
test('changing language replaces feedback; stale speech completion cannot unlock the new announcement', async () => {
  const f = setup(); f.controller.speak('en'); await settle();
  f.controller.speak('ur'); await settle(); f.spoken[0].onDone();
  assert.equal(f.states.at(-1).busy, true);
  f.controller.stop(); assert.equal(f.states.at(-1).busy, true); await settle(); assert.equal(f.states.at(-1).busy, false); f.spoken[1].onDone();
  assert.ok(f.stops >= 3); f.controller.dispose();
});
test('stalled voice feedback is bounded; disposal blocks late speech after an asynchronous stop', async () => {
  const f = setup(10); f.controller.speak('en'); await settle();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.deepEqual(f.states.at(-1), { busy: false, error: true });
  f.controller.dispose();
  let release, speaks = 0;
  const controller = createInputLanguageFeedback({ stop: () => new Promise(resolve => { release = resolve; }), speak() { speaks++; } }, () => {});
  controller.speak('en'); const finishFirstStop = release; controller.dispose(); finishFirstStop(); await settle();
  assert.equal(speaks, 0);
});
