import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTranscriptStorage } from '../src/transcript-storage.ts';

test('save survives reopening, updates one session without duplicates and preserves other sessions', async () => {
  const data = new Map();
  const disk = { getItem: async key => data.get(key) ?? null, setItem: async (key, value) => { data.set(key, value); } };
  const storage = createTranscriptStorage(disk);
  await storage.save({ id: 'a', text: 'First', language: 'en-US', savedAt: '2026-09-05' });
  await storage.save({ id: 'b', text: 'دوسرا', language: 'ur-PK', savedAt: '2026-09-05' });
  await storage.save({ id: 'a', text: 'First updated', language: 'en-US', savedAt: '2026-09-05' });
  assert.deepEqual((await createTranscriptStorage(disk).list()).map(x => x.text), ['First updated', 'دوسرا']);
});

test('empty content, unreadable data, and write failures cannot report a successful save', async () => {
  let writes = 0;
  const record = { id: 'a', text: 'Keep', language: 'en-US', savedAt: '2026-09-05' };
  const storage = createTranscriptStorage({ getItem: async () => '[{"broken":true}]', setItem: async () => { writes++; } });
  await assert.rejects(storage.save({ ...record, text: ' ' }), /no transcript/);
  await assert.rejects(storage.save(record), /Existing data has not been changed/);
  assert.equal(writes, 0);
  const full = createTranscriptStorage({ getItem: async () => null, setItem: async () => { throw new Error('Storage full'); } });
  await assert.rejects(full.save(record), /Storage full/);
});
