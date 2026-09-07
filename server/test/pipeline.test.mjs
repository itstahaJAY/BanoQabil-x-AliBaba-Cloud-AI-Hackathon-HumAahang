import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CaptionPipeline } from '../pipeline.mjs';
import { createBilingualProcessor } from '../providers.mjs';

export function result(text, start = 0, languages = ['en'], final = true) {
  return { type: 'Results', is_final: final, start, duration: 1, channel_index: [0, 1],
    channel: { alternatives: [{ transcript: text, languages }] } };
}

test('Hindi preview never leaks, ordered finals wait for conversion, exact duplicate is ignored', async () => {
  const events = []; let release;
  const pipeline = new CaptionPipeline({ emit: event => events.push(event), convert: async () => new Promise(resolve => { release = resolve; }) });
  pipeline.accept(result('पानी', 0, ['hi'], false));
  pipeline.accept(result('पानी', 0, ['hi']));
  pipeline.accept(result('Hello', 1));
  pipeline.accept(result('Hello', 1));
  pipeline.accept(result('Later preview', 2, ['en'], false));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(events.filter(e => e.type === 'final').length, 0);
  assert.equal(events.some(e => e.text), false);
  release(['پانی']); await pipeline.drain();
  assert.deepEqual(events.filter(e => e.type === 'final').map(e => [e.sequence, e.text]), [[1, 'پانی'], [2, 'Hello']]);
  assert.ok(!JSON.stringify(events).includes('पानी'));
});

test('English preview does not call converter; repeated speech in different segments is retained', async () => {
  const events = [];
  const pipeline = new CaptionPipeline({ emit: event => events.push(event), convert: () => assert.fail('English bypass') });
  pipeline.accept(result('Hello', 0, ['en'], false)); await pipeline.drain();
  assert.equal(events[0].type, 'preview');
  pipeline.accept(result('Hello', 0)); pipeline.accept(result('Hello', 1));
  await pipeline.drain();
  assert.equal(events.filter(e => e.type === 'final').length, 2);
});

test('cancel discards late conversions; failures never expose raw speech or provider details', async () => {
  const events = []; let release;
  const pipeline = new CaptionPipeline({ emit: event => events.push(event), convert: async () => new Promise(resolve => { release = resolve; }) });
  pipeline.accept(result('पानी', 0, ['hi']));
  await new Promise(resolve => setImmediate(resolve)); pipeline.cancel();
  release(['پانی']); await pipeline.drain();
  assert.equal(events.filter(e => e.type === 'final').length, 0);
  const failed = new CaptionPipeline({ emit: event => events.push(event), convert: async () => { throw Error('secret पानी'); } });
  failed.accept(result('पानी', 0, ['hi'])); failed.accept(result('OK', 1)); await failed.drain();
  assert.equal(events.find(e => e.type === 'segment_error').code, 'conversion_unavailable');
  assert.equal(events.at(-1).text, 'OK');
  assert.ok(!JSON.stringify(events).includes('secret'));
});

test('word metadata drives routing, malformed frames and excess queue are rejected', async () => {
  const events = [];
  const pipeline = new CaptionPipeline({ emit: event => events.push(event), convert: async () => ['پانی'], maxPending: 1 });
  const frame = result('Hello'); delete frame.channel.alternatives[0].languages;
  frame.channel.alternatives[0].words = [{ language: 'en' }];
  pipeline.accept(frame);
  assert.throws(() => pipeline.accept(result('second', 1)), { code: 'queue_full' });
  await pipeline.drain(); assert.equal(events.at(-1).text, 'Hello');
  assert.throws(() => pipeline.accept(result('bad', -1)), { code: 'invalid_result' });
});

test('bilingual mode withholds all source previews and processes English once into ordered paired captions', async () => {
  const events = [], calls = []; let release;
  const pipeline = new CaptionPipeline({ mode: 'bilingual', emit: event => events.push(event),
    processBilingual: async ({ text }) => {
      calls.push(text);
      if (text === 'Hello') return new Promise(resolve => { release = resolve; });
      return { ur: 'پانی', en: 'Water' };
    } });
  pipeline.accept(result('Hello', 0, ['en'], false)); await pipeline.drain();
  assert.deepEqual(events, []);
  pipeline.accept(result('Hello', 0)); pipeline.accept(result('पानी', 1, ['hi']));
  pipeline.accept(result('पानी', 1, ['hi']));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['Hello']);
  assert.equal(events.every(event => event.type === 'processing'), true);
  release({ ur: 'سلام', en: 'Hello' }); await pipeline.drain();
  assert.deepEqual(events.filter(event => event.type === 'caption_final'), [
    { type: 'caption_final', sequence: 1, outputs: { ur: 'سلام', en: 'Hello' } },
    { type: 'caption_final', sequence: 2, outputs: { ur: 'پانی', en: 'Water' } },
  ]);
  assert.deepEqual(calls, ['Hello', 'पानी']);
});

test('bilingual invalid output fails closed and later pairs survive; cancellation discards pending pair', async () => {
  const events = []; let release;
  const pipeline = new CaptionPipeline({ mode: 'bilingual', emit: event => events.push(event),
    processBilingual: async ({ text }) => text === 'Hello' ? { ur: 'पानी', en: 'Hello' } : { ur: 'سلام', en: 'Hello' } });
  pipeline.accept(result('Hello', 0)); pipeline.accept(result('Hi', 1)); await pipeline.drain();
  assert.equal(events.find(event => event.type === 'segment_error').code, 'conversion_invalid');
  assert.equal(events.at(-1).type, 'caption_final');
  assert.ok(!JSON.stringify(events).includes('पानी'));
  const cancelled = new CaptionPipeline({ mode: 'bilingual', emit: event => events.push(event),
    processBilingual: () => new Promise(resolve => { release = resolve; }) });
  cancelled.accept(result('Hello', 0)); await new Promise(resolve => setImmediate(resolve));
  cancelled.cancel(); release({ ur: 'سلام', en: 'Hello' }); await cancelled.drain();
  assert.equal(events.filter(event => event.type === 'caption_final').length, 1);
});

test('segment errors distinguish recognition input, translation request and translation validation without source leakage', async () => {
  const events = [];
  const processBilingual = createBilingualProcessor({}, async (_, options) => {
    const input = JSON.parse(JSON.parse(options.body).messages[1].content);
    if (input.text === 'Network') throw Error('SECRET request failed');
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ ur: 'پانی 8', en: 'Water 8' }) } }] });
  });
  const pipeline = new CaptionPipeline({ mode: 'bilingual', emit: event => events.push(event), processBilingual });
  pipeline.accept(result('Bad\u0000input', 0));
  pipeline.accept(result('Network', 1));
  pipeline.accept(result('Water 3', 2));
  await pipeline.drain();
  assert.deepEqual(events.filter(event => event.type === 'segment_error').map(({ sequence, stage }) => ({ sequence, stage })), [
    { sequence: 1, stage: 'recognition_input' }, { sequence: 2, stage: 'translation_request' }, { sequence: 3, stage: 'translation_validation' },
  ]);
  assert.ok(!JSON.stringify(events).match(/SECRET|Bad|Water|Network/));
});

test('both provider and publication gates accept normalized PM and equivalent clock formatting', async () => {
  const events = [];
  const processBilingual = createBilingualProcessor({}, async () => Response.json({ choices: [{ finish_reason: 'stop',
    message: { content: JSON.stringify({ ur: 'کل ۳:۰۰ PM ملیں۔', en: 'Meet at 3:00 PM tomorrow.' }) } }] }));
  const pipeline = new CaptionPipeline({ mode: 'bilingual', emit: event => events.push(event), processBilingual });
  pipeline.accept(result('Meet at 3 PM tomorrow.', 0));
  await pipeline.drain();
  assert.deepEqual(events.at(-1), { type: 'caption_final', sequence: 1,
    outputs: { ur: 'کل ۳:۰۰ بعد دوپہر ملیں۔', en: 'Meet at 3:00 PM tomorrow.' } });
  assert.equal(events.some(event => event.type === 'segment_error'), false);
});
