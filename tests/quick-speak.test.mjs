import assert from 'node:assert/strict';
import { test } from 'node:test';
import { phrasesFor, createPhrasePlayback } from '../src/quick-speak-model.ts';
import { translate } from '../src/locale.ts';

test('Roman Urdu built-in phrases display Roman but use Urdu pronunciation; custom input remains exact', async () => {
  const spoken = [], states = [];
  const player = createPhrasePlayback({ stop: async () => {}, speak: (text, options) => { spoken.push({ text, language: options.language }); options.onStart(); } }, state => states.push(state));
  await player.speak(translate('Roman Urdu', 'Thank you.'), translate('اردو', 'Thank you.'));
  assert.equal(states.at(-1).text, 'Shukriya.');
  assert.deepEqual(spoken.at(-1), { text: 'شکریہ۔', language: 'ur-PK' });
  await player.speak('My exact custom words');
  assert.equal(spoken.at(-1).text, 'My exact custom words');
  player.dispose();
});

test('category selection returns the matching phrases, not the complete grid', () => {
  assert.deepEqual(phrasesFor('Favorites').map(x => x.text), ['Please help me.', 'I need water.', 'Please call my family.']);
  assert.deepEqual(phrasesFor('Travel').map(x => x.text), ['Where is the washroom?']);
  assert.deepEqual(phrasesFor('Medical').map(x => x.text), ['I cannot speak.', 'I need a doctor.']);
  assert.ok(!phrasesFor('Emergency').some(x => x.text === 'Thank you.'));
  assert.ok(phrasesFor('Daily Needs').some(x => x.text === 'Thank you.'));
});

test('playback waits for onStart; switching phrases ignores stale completion; Stop clears immediately', async () => {
  const states = [], utterances = [];
  const player = createPhrasePlayback({ stop: async () => {}, speak: (text, options) => utterances.push({ text, options }) }, x => states.push(x));
  await player.speak('Please help me.');
  assert.equal(states.at(-1).phase, 'preparing');
  utterances[0].options.onStart();
  assert.equal(states.at(-1).phase, 'speaking');
  await player.speak('Thank you.');
  utterances[0].options.onDone();
  assert.equal(states.at(-1).text, 'Thank you.');
  player.stop();
  utterances[1].options.onStart();
  assert.equal(states.at(-1).phase, 'idle');
  player.dispose();
});

test('stopping while engine startup is pending prevents a late utterance', async () => {
  let release, speaks = 0;
  const player = createPhrasePlayback({ stop: () => new Promise(resolve => { release = resolve; }), speak: () => { speaks++; } }, () => {});
  const pending = player.speak('Do not speak after stop');
  const initial = release;
  player.stop();
  initial();
  await pending;
  assert.equal(speaks, 0);
  player.dispose();
});

test('startup timeout and playback errors do not leave a stuck player', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const states = []; let callbacks;
  const player = createPhrasePlayback({ stop: async () => {}, speak: (_, options) => { callbacks = options; } }, x => states.push(x));
  await player.speak('Hello');
  context.mock.timers.tick(12001);
  assert.equal(states.at(-1).phase, 'idle');
  assert.match(states.at(-1).error, /did not start/);
  await player.speak('Retry');
  callbacks.onError();
  assert.equal(states.at(-1).phase, 'idle');
  assert.match(states.at(-1).error, /Could not play/);
  player.dispose();
});
