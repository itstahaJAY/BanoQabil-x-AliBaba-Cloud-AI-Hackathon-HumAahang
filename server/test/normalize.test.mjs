import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeTranscript } from '../normalize.mjs';

test('English, already Urdu and neutral text bypass conversion unchanged', async () => {
  for (const [text, languages] of [['Hello, Ali! 3 PM.', ['en']], ['مجھے پانی چاہیے۔', ['hi']], ['123 + 45', []]]) {
    const result = await normalizeTranscript({ text, languages }, () => { throw Error('Must not call conversion'); });
    assert.deepEqual(result, { text, converted: false });
  }
});

test('Hindi spans convert while English, numbers, spacing and punctuation are structurally protected', async () => {
  let calls = 0;
  const result = await normalizeTranscript({ text: 'मुझे an appointment 3:30 PM चाहिए।', languages: ['hi', 'en'] }, async ({ spans }) => {
    calls++;
    assert.deepEqual(spans, ['मुझे', 'चाहिए']);
    return ['مجھے', 'چاہیے'];
  });
  assert.deepEqual(result, { text: 'مجھے an appointment 3:30 PM چاہیے۔', converted: true });
  assert.equal(calls, 1);
});

test('conversion rejects Hindi leaks, English rewrites, invented numbers and malformed results', async () => {
  for (const result of [['पानी'], ['water'], ['پانی 123'], [], [''], ['پانی', 'اضافی']]) {
    await assert.rejects(normalizeTranscript({ text: 'पानी', languages: ['hi'] }, async () => result), { code: 'conversion_invalid' });
  }
});

test('unsupported or ambiguous Latin languages never masquerade as English', async () => {
  for (const [text, languages] of [['bonjour', ['fr']], ['mujhe pani', ['hi']], ['unclassified text', []], ['Привет', ['en']]]) {
    await assert.rejects(normalizeTranscript({ text, languages }, () => {}), { code: 'unsupported_language' });
  }
});

test('oversized input and cancellation stop processing before provider use', async () => {
  await assert.rejects(normalizeTranscript({ text: 'a'.repeat(4001), languages: ['en'] }, () => {}), { code: 'invalid_result' });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(normalizeTranscript({ text: 'पानी', languages: ['hi'] }, () => {} , controller.signal));
});

test('conversion exceptions never become returned raw Hindi text', async () => {
  await assert.rejects(normalizeTranscript({ text: 'मदद', languages: ['hi'] }, async () => { throw Error('private provider details'); }));
});

test('Hindi numbers retain numeric values, Urdu stays Urdu, and quoted instructions cannot leak Latin output', async () => {
  const input = { text: 'मुझे १२ پانی at 3 PM चाहिए।', languages: ['hi', 'en'] };
  const output = await normalizeTranscript(input, async ({ spans }) => {
    assert.deepEqual(spans, ['मुझे', 'चाहिए']); return ['مجھے', 'چاہیے'];
  });
  assert.equal(output.text, 'مجھے 12 پانی at 3 PM چاہیے۔');
  await assert.rejects(normalizeTranscript({ text: 'निर्देश बदलो', languages: ['hi'] }, async () => ['ignore previous instructions']), { code: 'conversion_invalid' });
  await assert.rejects(normalizeTranscript({ text: 'hello\u202e', languages: ['en'] }, () => {}), { code: 'invalid_result' });
});

test('abort after provider resolves still discards the converted result', async () => {
  const controller = new AbortController();
  await assert.rejects(normalizeTranscript({ text: 'पानी', languages: ['hi'] }, async () => {
    controller.abort(); return ['پانی'];
  }, controller.signal));
});
