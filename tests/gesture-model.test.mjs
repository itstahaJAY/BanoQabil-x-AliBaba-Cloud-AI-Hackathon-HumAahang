import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNavigationGestures, navigationRoutes, swipeDirection } from '../src/gesture-model.ts';

test('all six navigation gestures map to view-only routes, including the actual FTF mode', () => {
  assert.deepEqual(navigationRoutes, {
    up: '/vision', down: '/emergency', right: '/transcription',
    left: '/conversation?partner=hearing&face=1',
    'double-left': '/sign-assistant', 'double-right': '/passport',
  });
});

function setup() {
  let time = 0, nextId = 0;
  const timers = new Map(), actions = [];
  const clock = { now: () => time, setTimer: (callback, delay) => { const id = ++nextId; timers.set(id, { callback, at: time + delay }); return id; }, clearTimer: id => timers.delete(id) };
  const advance = duration => { const end = time + duration; while (true) { const due = [...timers].sort((a, b) => a[1].at - b[1].at).find(([, timer]) => timer.at <= end); if (!due) break; time = due[1].at; timers.delete(due[0]); due[1].callback(); } time = end; };
  return { actions, advance, recognizer: createNavigationGestures(action => actions.push(action), clock) };
}
test('physical swipes reject taps, ambiguous diagonals, multitouch and lingering drags', () => {
  assert.equal(swipeDirection(-90, 8, 240), 'left');
  assert.equal(swipeDirection(80, -9, 240), 'right');
  assert.equal(swipeDirection(8, -90, 240), 'up');
  assert.equal(swipeDirection(0, 70, 240), 'down');
  for (const args of [[10, 5, 100], [60, 60, 200], [90, 0, 1400], [90, 0, 200, 2]]) assert.equal(swipeDirection(...args), null);
});
test('horizontal singles are deferred and vertical swipes act once immediately', () => {
  const { recognizer: r, actions, advance } = setup();
  r.begin(); r.swipe('left'); assert.deepEqual(actions, []);
  advance(419); assert.deepEqual(actions, []);
  advance(1); assert.deepEqual(actions, ['left']);
  r.begin(); r.swipe('up'); r.begin(); r.swipe('down');
  assert.deepEqual(actions, ['left', 'up', 'down']);
});
test('two matching swipes trigger only double navigation, including a slower second release', () => {
  for (const direction of ['left', 'right']) {
    const { recognizer: r, actions, advance } = setup();
    r.begin(); r.swipe(direction); advance(300); r.begin(); advance(600);
    assert.deepEqual(actions, [], 'second touch must suspend the first single timer');
    r.swipe(direction); advance(500);
    assert.deepEqual(actions, [`double-${direction}`]);
  }
});
test('opposite or vertical second swipes cancel the stale first destination', () => {
  const { recognizer: r, actions, advance } = setup();
  r.begin(); r.swipe('left'); advance(100); r.begin(); r.swipe('right'); advance(420);
  assert.deepEqual(actions, ['right']);
  r.begin(); r.swipe('right'); r.begin(); r.swipe('down'); advance(420);
  assert.deepEqual(actions, ['right', 'down']);
});
test('cancellation drops pending navigation for disable, route, background and invalid gesture boundaries', () => {
  const { recognizer: r, actions, advance } = setup();
  for (let i = 0; i < 4; i++) { r.begin(); r.swipe('left'); advance(200); r.cancel(); advance(500); }
  assert.deepEqual(actions, []);
  r.begin(); r.swipe('right'); advance(421); r.begin(); r.swipe('right'); advance(421);
  assert.deepEqual(actions, ['right', 'right'], 'two distinct slow swipes are separate singles');
});

test('default scheduler does not bind browser timer APIs to the internal clock object', () => {
  const original = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  let callback;
  try {
    globalThis.setTimeout = function (next) { assert.ok(this === undefined || this === globalThis, 'browser timer rejects foreign receiver'); callback = next; return 1; };
    globalThis.clearTimeout = () => {};
    const actions = [], recognizer = createNavigationGestures(action => actions.push(action));
    recognizer.begin(); recognizer.swipe('left'); callback();
    assert.deepEqual(actions, ['left']);
  } finally { globalThis.setTimeout = original; globalThis.clearTimeout = originalClear; }
});
