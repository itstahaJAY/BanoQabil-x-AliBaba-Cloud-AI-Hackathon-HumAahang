import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBilingualProcessor, createConverter, deepgramUrl } from '../providers.mjs';

test('Deepgram contract is multilingual and mono, with no language selector', () => {
  const url = new URL(deepgramUrl({ encoding: 'linear16', sampleRate: 16000, channels: 1 }));
  assert.equal(url.origin, 'wss://api.deepgram.com');
  for (const [key, value] of Object.entries({ model: 'nova-3', language: 'multi', encoding: 'linear16', sample_rate: '16000', channels: '1', interim_results: 'true' })) {
    assert.equal(url.searchParams.get(key), value);
  }
});

test('explicit English and Urdu input configure Nova-3 without permitting arbitrary provider parameters', () => {
  for (const inputLanguage of ['en', 'ur']) {
    const url = new URL(deepgramUrl({ encoding: 'linear16', sampleRate: 16000, channels: 1 }, inputLanguage));
    assert.equal(url.searchParams.get('language'), inputLanguage);
    assert.equal(url.searchParams.get('model'), 'nova-3');
  }
  assert.throws(() => deepgramUrl({ encoding: 'linear16', sampleRate: 16000, channels: 1 }, 'hi'), { code: 'invalid_message' });
});

test('converter uses server credentials, a fixed destination, JSON spans and bounded non-thinking response', async () => {
  let request;
  const convert = createConverter({ deepseekKey: 'private-key', deepseekModel: 'deepseek-v4-flash', conversionTimeoutMs: 1000 }, async (url, options) => {
    request = { url, ...options };
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ translations: ['پانی'] }) } }] });
  });
  assert.deepEqual(await convert({ text: 'पानी', spans: ['पानी'] }), ['پانی']);
  assert.equal(request.url, 'https://api.deepseek.com/chat/completions');
  assert.equal(request.headers.Authorization, 'Bearer private-key');
  const body = JSON.parse(request.body);
  assert.equal(body.response_format.type, 'json_object');
  assert.equal(body.thinking.type, 'disabled');
  assert.ok(body.max_tokens <= 4096);
  assert.deepEqual(JSON.parse(body.messages[1].content), { text: 'पानी', spans: ['पानी'] });
});

test('conversion failure, truncation and malformed JSON produce safe errors only', async () => {
  for (const response of [new Response('SECRET PROVIDER BODY', { status: 401 }), Response.json({ choices: [{ finish_reason: 'length' }] }), Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'invalid json' } }] }), new Response('a'.repeat(100000))]) {
    const convert = createConverter({ deepseekKey: 'key', conversionTimeoutMs: 1000 }, async () => response);
    await assert.rejects(convert({ text: 'पानी', spans: ['पानी'] }), error => error.code?.startsWith('conversion_') && !error.message.includes('SECRET'));
  }
});

test('conversion times out and aborted callers do not make requests', async () => {
  const convert = createConverter({ deepseekKey: 'key', conversionTimeoutMs: 10 }, async (_, { signal }) => {
    await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  });
  await assert.rejects(convert({ text: 'पानी', spans: ['पानी'] }), { code: 'conversion_timeout' });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(createConverter({}, () => { assert.fail('no request'); })({ text: 'पानी', spans: ['पानी'] }, controller.signal));
});

test('bilingual processor sends every stable English segment once and derives both outputs from source', async () => {
  const requests = [];
  const process = createBilingualProcessor({ deepseekKey: 'private-key', deepseekModel: 'deepseek-v4-flash' }, async (url, options) => {
    requests.push({ url, options });
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ ur: 'مجھے پانی چاہیے۔', en: 'I need water.' }) } }] });
  });
  assert.deepEqual(await process({ text: 'I need water.', languages: ['en'] }), { ur: 'مجھے پانی چاہیے۔', en: 'I need water.' });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.deepseek.com/chat/completions');
  assert.equal(requests[0].options.redirect, 'error');
  const request = JSON.parse(requests[0].options.body);
  assert.deepEqual(JSON.parse(request.messages[1].content), { text: 'I need water.', languages: ['en'] });
  assert.equal(request.response_format.type, 'json_object');
  assert.equal(request.thinking.type, 'disabled');
  assert.ok(request.max_tokens <= 4096);
});

test('bilingual provider rejects raw Hindi, dropped numbers and extra metadata atomically', async () => {
  for (const outputs of [{ ur: 'पानी 3', en: 'Water 3' }, { ur: 'پانی', en: 'Water 3' },
    { ur: 'پانی 3', en: 'Water 3', source: 'SECRET' }, { ur: 'پانی 3' }]) {
    const process = createBilingualProcessor({}, async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(outputs) } }] }));
    await assert.rejects(process({ text: 'Water 3', languages: ['en'] }), { code: 'conversion_invalid' });
  }
});

test('bilingual processing validates input before request and sanitizes provider failures', async () => {
  const controller = new AbortController(); controller.abort();
  const noRequest = createBilingualProcessor({}, () => { assert.fail('no request'); });
  await assert.rejects(noRequest({ text: '' }), { code: 'invalid_result' });
  await assert.rejects(noRequest({ text: 'Hello' }, controller.signal));
  const failed = createBilingualProcessor({}, async () => new Response('SECRET provider body', { status: 403 }));
  await assert.rejects(failed({ text: 'Hello', languages: ['en'] }), { code: 'conversion_unavailable', message: 'conversion_unavailable' });
});

test('bilingual requests retain bounded timeout and malformed/truncated response gates', async () => {
  const slow = createBilingualProcessor({ conversionTimeoutMs: 10 }, async (_, { signal }) => {
    await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  });
  await assert.rejects(slow({ text: 'Hello' }), { code: 'conversion_timeout' });
  for (const response of [Response.json({ choices: [{ finish_reason: 'length' }] }),
    Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'not json SECRET' } }] }), new Response('x'.repeat(100000))]) {
    const process = createBilingualProcessor({}, async () => response);
    await assert.rejects(process({ text: 'Hello' }), { code: 'conversion_invalid', message: 'conversion_invalid' });
  }
});
