import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateBilingualInput, validateBilingualOutputs } from '../bilingual.mjs';
import { createBilingualProcessor } from '../providers.mjs';

test('bilingual provider explicitly preserves clock dayperiods and still rejects a dropped PM', async () => {
  let instruction;
  const process = createBilingualProcessor({}, async (_url, options) => {
    instruction = JSON.parse(options.body).messages[0].content;
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
      ur: 'براہ کرم 3 بجے پانی لائیں۔', en: 'Please bring water at 3 PM.',
    }) } }] }));
  });
  await assert.rejects(process({ text: 'Please bring water at 3 PM.' }), { code: 'conversion_invalid', stage: 'translation_validation' });
  assert.match(instruction, /Never drop AM\/PM/);
  assert.match(instruction, /قبل دوپہر/);
  assert.match(instruction, /بعد دوپہر/);
});

test('paired captions retain numeric tokens across Latin, Urdu and Hindi digit shapes', () => {
  assert.deepEqual(validateBilingualOutputs('Meet at 3:30 PM, room ۱۲.', {
    ur: 'کمرہ ۱۲ میں شام ۳:۳۰ بجے ملیں۔', en: 'Meet at 3:30 PM in room 12.',
  }), { ur: 'کمرہ ۱۲ میں شام ۳:۳۰ بجے ملیں۔', en: 'Meet at 3:30 PM in room 12.' });
  assert.deepEqual(validateBilingualOutputs('१२', { ur: '۱۲', en: '12' }), { ur: '۱۲', en: '12' });
});

test('paired caption gate rejects incomplete, extra, wrong-script, control and numeric mutations', () => {
  for (const outputs of [
    { ur: 'پانی', en: '' }, { ur: 'पानी', en: 'Water' }, { ur: 'Water', en: 'Water' },
    { ur: 'پانی', en: 'پانی' }, { ur: 'پانی', en: 'Water', raw: 'पानी' },
    { ur: 'پانی\u202e', en: 'Water' }, { ur: 'پانی 2', en: 'Water 2' },
    { ur: 'پانی', en: 'Water 1' }, { ur: 'پانی', en: 'A'.repeat(8001) }, null,
  ]) assert.throws(() => validateBilingualOutputs('Water', outputs), { code: 'conversion_invalid' });
  assert.throws(() => validateBilingualOutputs('Room 12', { ur: 'کمرہ ۱ ۲', en: 'Room 1 2' }), { code: 'conversion_invalid' });
  assert.throws(() => validateBilingualOutputs('Water 1', { ur: 'پانی', en: 'Water' }), { code: 'conversion_invalid' });
  assert.throws(() => validateBilingualOutputs('Minus -5', { ur: 'منفی 5', en: 'Minus 5' }), { code: 'conversion_invalid' });
  assert.throws(() => validateBilingualOutputs('Rate 3%', { ur: 'شرح 3', en: 'Rate 3' }), { code: 'conversion_invalid' });
});

test('input validation bounds speech and language metadata without imposing an input selector', () => {
  for (const text of ['Hello', 'مجھے پانی چاہیے', 'मुझे पानी चाहिए', 'mujhe pani chahiye']) {
    assert.equal(validateBilingualInput({ text, languages: [] }).text, text);
  }
  for (const input of [{ text: '' }, { text: 'x'.repeat(4001) }, { text: 'Hello\u0000' },
    { text: 'Hi', languages: [42] }, { text: 'Hi', languages: ['en'.repeat(40)] }]) {
    assert.throws(() => validateBilingualInput(input), { code: 'invalid_result' });
  }
});

test('clock-bound PM in Urdu is normalized before the strict script gate', () => {
  assert.deepEqual(validateBilingualOutputs('Meet at 3 PM.', {
    ur: 'کل ۳ PM ملیں۔', en: 'Meet at 3 PM.',
  }), { ur: 'کل ۳ بعد دوپہر ملیں۔', en: 'Meet at 3 PM.' });
  assert.throws(() => validateBilingualOutputs('PM approval', { ur: 'PM کی منظوری', en: 'PM approval' }), { code: 'conversion_invalid' });
  assert.throws(() => validateBilingualOutputs('3 PM', { ur: '۳\nPM', en: '3 PM' }), { code: 'conversion_invalid' });
  assert.throws(() => validateBilingualOutputs('3 PM', { ur: `۳${' '.repeat(8000)}PM`, en: '3 PM' }), { code: 'conversion_invalid' });
});

test('equivalent clock formatting is accepted only in explicit time context', () => {
  for (const ur of ['دوپہر ۳:۰۰ بجے ملیں۔', '۳ بجے دوپہر ملیں۔', '۳:۰۰ PM ملیں۔']) {
    assert.equal(validateBilingualOutputs('Meet at 3 PM.', { ur, en: 'Meet at 3:00 PM.' }).en, 'Meet at 3:00 PM.');
  }
  assert.deepEqual(validateBilingualOutputs('सुबह ३ बजे', { ur: 'صبح ۳:۰۰ بجے', en: '3:00 AM' }), { ur: 'صبح ۳:۰۰ بجے', en: '3:00 AM' });
  for (const [source, ur, en] of [
    ['Bring 3 cups.', '۳:۰۰ کپ لائیں۔', 'Bring 3:00 cups.'],
    ['Meet at 3 PM.', 'صبح ۳ بجے ملیں۔', 'Meet at 3 AM.'],
    ['Meet at 3 PM.', 'دوپہر ۴ بجے ملیں۔', 'Meet at 4 PM.'],
    ['Meet at 3 PM.', 'دوپہر ۳:۳۰ بجے ملیں۔', 'Meet at 3:30 PM.'],
    ['Meet at 3 PM.', '۳ بجے ملیں۔', 'Meet at 3.'],
    ['Meet at 3 PM with 4 cups.', 'دوپہر ۳:۰۰ بجے ۴ کپ کے ساتھ ملیں۔', 'Meet at 3:00 PM with 4:00 cups.'],
    ['Score 3:00', '۳ بجے', '3 o\'clock'],
  ]) assert.throws(() => validateBilingualOutputs(source, { ur, en }), { code: 'conversion_invalid' });
});

test('a clock marker does not attach to the next numeric count', () => {
  assert.deepEqual(validateBilingualOutputs('3 PM 4 cups', { ur: 'دوپہر ۳ بجے ۴ کپ', en: '3:00 PM 4 cups' }), {
    ur: 'دوپہر ۳ بجے ۴ کپ', en: '3:00 PM 4 cups',
  });
});
