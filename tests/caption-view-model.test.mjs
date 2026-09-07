import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captionSaveRecord, selectedCaptionText } from '../src/caption-view-model.ts';
import { createTranscriptStorage } from '../src/transcript-storage.ts';
import { captionClientMessages } from '../src/caption-client.ts';
import { hasTranslation, translate } from '../src/locale.ts';

test('output switching selects the same ordered pairs without changing transcripts', () => {
  const segments = Object.freeze([
    Object.freeze({ id: 'a', outputs: Object.freeze({ ur: 'مجھے پانی چاہیے۔', en: 'I need water.' }) }),
    Object.freeze({ id: 'b', outputs: Object.freeze({ ur: '3 بجے۔', en: 'At 3.' }) }),
  ]);
  for (let count = 0; count < 10; count++) {
    assert.equal(selectedCaptionText(segments, 'ur'), 'مجھے پانی چاہیے۔\n3 بجے۔');
    assert.equal(selectedCaptionText(segments, 'en'), 'I need water.\nAt 3.');
  }
  assert.equal(selectedCaptionText([], 'ur'), '');
});

test('saving each output and a manual draft preserves all records and old History', async () => {
  const old = { id: 'old', text: 'Existing history', language: 'device-auto', savedAt: '2026-09-01' };
  let raw = JSON.stringify([old]);
  const storage = createTranscriptStorage({ getItem: async () => raw, setItem: async (_, value) => { raw = value; } });
  const ur = captionSaveRecord('session', ' پانی ', 'ur', false, '2026-09-07');
  const en = captionSaveRecord('session', 'Water', 'en', false, '2026-09-07');
  const manual = captionSaveRecord('session', 'Manual notes', 'en', true, '2026-09-07');
  for (const record of [ur, en, manual]) await storage.save(record);
  const records = await storage.list();
  assert.equal(records.length, 4);
  assert.equal(ur.language, 'ur-PK');
  assert.equal(en.language, 'en-US');
  assert.equal(manual.language, 'manual');
  assert.equal(ur.text, 'پانی');
  assert.notEqual(en.id, manual.id);
  assert.deepEqual(records.find(item => item.id === 'old'), old);
});

test('every safe caption client error has Urdu and Roman Urdu interface copy', () => {
  for (const message of Object.values(captionClientMessages)) {
    assert.ok(hasTranslation(message), message);
    assert.match(translate('اردو', message), /[\u0600-\u06ff]/u, message);
    assert.doesNotMatch(translate('Roman Urdu', message), /[\u0600-\u06ff]/u, message);
  }
});
