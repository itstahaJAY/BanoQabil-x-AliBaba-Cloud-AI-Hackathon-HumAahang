import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVisionClient, idleVision, visionMessages } from '../src/vision-client.ts';

const photo = { base64: 'aW1hZ2U=', mimeType: 'image/jpeg', uri: 'file:///private/camera.jpg' };
const results = {
  en: { task: 'objects', description: 'A cup is on a table.', spokenDescription: 'A cup is on a table.', objects: ['Cup', 'Table'], gesture: null, uncertain: false },
  ur: { task: 'objects', description: 'میز پر ایک کپ ہے۔', spokenDescription: 'میز پر ایک کپ ہے۔', objects: ['کپ', 'میز'], gesture: null, uncertain: false },
  roman: { task: 'objects', description: 'Mez par aik cup hai.', spokenDescription: 'میز پر ایک کپ ہے۔', objects: ['Cup', 'Mez'], gesture: null, uncertain: false },
};
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture(translation = async (_url, init) => Response.json(results[JSON.parse(init.body).language]), overrides = {}) {
  const states = [], requests = [];
  const credentials = { current: { token: 'test-grant', expiresAt: Date.now() + 60000 } };
  const client = createVisionClient({ baseUrl: 'https://demo.example', credentials, timeoutMs: overrides.timeoutMs ?? 1000,
    fetcher: (url, init) => {
      requests.push({ url, ...init });
      return url.endsWith('/analyze') ? Promise.resolve(Response.json(results[JSON.parse(init.body).language])) : translation(url, init);
    }, onState: state => states.push(state),
  });
  return { client, credentials, states, requests };
}

test('Urdu translation sends only original detection text and retains the visible result while pending', async () => {
  const response = deferred(), f = fixture(() => response.promise);
  await f.client.analyze(photo, 'en', 'objects');
  assert.equal(f.client.getState().language, 'en');
  const pending = f.client.translate('ur');
  assert.deepEqual(f.client.getState(), { phase: 'translating', result: results.en, language: 'en', translatingTo: 'ur', message: '', needsConnection: false });
  const request = f.requests[1];
  assert.equal(request.url, 'https://demo.example/v1/vision/translate');
  assert.equal(request.method, 'POST');
  assert.equal(request.redirect, 'error');
  assert.equal(request.headers.Authorization, 'Bearer test-grant');
  assert.deepEqual(JSON.parse(request.body), { result: results.en, sourceLanguage: 'en', language: 'ur' });
  for (const value of ['base64', 'mimeType', 'uri', 'private/camera', 'test-grant']) assert.ok(!request.body.includes(value));
  response.resolve(Response.json(results.ur));
  assert.deepEqual(await pending, results.ur);
  assert.equal(f.client.getState().language, 'ur');
  assert.equal(f.client.getState().translatingTo, null);
  f.client.dispose();
});

test('switching back and forth uses cached translations, even after the connection expires', async () => {
  const f = fixture();
  await f.client.analyze(photo, 'en', 'objects');
  assert.deepEqual(await f.client.translate('en'), results.en);
  await f.client.translate('ur');
  f.credentials.current = null;
  assert.deepEqual(await f.client.translate('en'), results.en);
  assert.deepEqual(await f.client.translate('ur'), results.ur);
  assert.equal(f.requests.length, 2);
  assert.equal(f.client.getState().needsConnection, false);
  f.client.dispose();
});

test('each new language translates the original analysis, never an earlier translation', async () => {
  const f = fixture();
  await f.client.analyze(photo, 'en', 'objects');
  await f.client.translate('ur');
  await f.client.translate('roman');
  assert.deepEqual(JSON.parse(f.requests[2].body), { result: results.en, sourceLanguage: 'en', language: 'roman' });
  assert.deepEqual(f.client.getState().result, results.roman);
  f.client.dispose();
});

test('expired credentials require reconnection without losing the original or making a request', async () => {
  const f = fixture();
  await f.client.analyze(photo, 'en', 'objects');
  f.credentials.current.expiresAt = Date.now() - 1;
  assert.equal(await f.client.translate('ur'), null);
  assert.equal(f.requests.length, 1);
  assert.equal(f.client.getState().needsConnection, true);
  assert.equal(f.client.getState().message, visionMessages.setup_required);
  assert.equal(f.client.getState().phase, 'ready');
  assert.deepEqual(f.client.getState().result, results.en);
  assert.deepEqual(await f.client.translate('en'), results.en);
  f.client.dispose();
});

test('translation failures preserve the last visible language and allow a successful retry', async () => {
  for (const fail of [async () => { throw new Error('provider-private'); }, async () => Response.json({ code: 'vision_unavailable', private: 'provider-private' }, { status: 503 }), async () => new Response('provider-private'), async () => Response.json({ ...results.ur, objects: ['کپ'] }), async () => Response.json({ ...results.ur, uncertain: true }), async () => Response.json(results.en)]) {
    let shouldFail = true;
    const f = fixture((url, init) => shouldFail ? fail() : Promise.resolve(Response.json(results[JSON.parse(init.body).language])));
    await f.client.analyze(photo, 'en', 'objects');
    assert.equal(await f.client.translate('ur'), null);
    assert.deepEqual(f.client.getState().result, results.en);
    assert.equal(f.client.getState().language, 'en');
    assert.equal(f.client.getState().phase, 'ready');
    assert.equal(f.client.getState().message, visionMessages.translation_failed);
    assert.ok(!JSON.stringify(f.states).includes('provider-private'));
    shouldFail = false;
    assert.deepEqual(await f.client.translate('ur'), results.ur);
    f.client.dispose();
  }
});

test('unauthorized translation preserves results and never clears a newer pairing grant', async () => {
  const response = deferred(), f = fixture(() => response.promise);
  await f.client.analyze(photo, 'en', 'objects');
  const pending = f.client.translate('ur');
  const newer = { token: 'newer-grant', expiresAt: Date.now() + 60000 };
  f.credentials.current = newer;
  response.resolve(new Response('', { status: 401 }));
  await pending;
  assert.equal(f.credentials.current, newer);
  assert.equal(f.client.getState().message, visionMessages.unauthorized);
  assert.equal(f.client.getState().needsConnection, true);
  assert.deepEqual(f.client.getState().result, results.en);
  f.client.dispose();
});

test('cancel translation aborts only translation, suppresses late results and retains existing cache', async () => {
  const response = deferred();
  const f = fixture((_url, init) => JSON.parse(init.body).language === 'roman' ? response.promise : Promise.resolve(Response.json(results.ur)));
  await f.client.analyze(photo, 'en', 'objects');
  await f.client.translate('ur');
  const pending = f.client.translate('roman');
  f.client.cancelTranslation();
  assert.equal(f.requests[2].signal.aborted, true);
  assert.equal(f.client.getState().phase, 'ready');
  assert.equal(f.client.getState().language, 'ur');
  const count = f.states.length;
  response.resolve(Response.json(results.roman));
  assert.equal(await pending, null);
  assert.equal(f.states.length, count);
  assert.deepEqual(await f.client.translate('en'), results.en);
  assert.deepEqual(await f.client.translate('ur'), results.ur);
  assert.equal(f.requests.length, 3);
  f.client.dispose();
});

test('reanalyzing a new photo invalidates every translation from the previous photo', async () => {
  const f = fixture();
  await f.client.analyze(photo, 'en', 'objects');
  await f.client.translate('ur');
  await f.client.analyze({ ...photo, base64: 'bmV3LWltYWdl' }, 'en', 'objects');
  await f.client.translate('ur');
  assert.equal(f.requests.length, 4);
  assert.equal(f.requests[3].url.endsWith('/translate'), true);
  f.client.cancel();
  assert.deepEqual(f.client.getState(), idleVision);
  assert.equal(await f.client.translate('en'), null);
  f.client.dispose();
});

test('without an object result, while busy, or after disposal, translation never submits', async () => {
  const response = deferred(), f = fixture(() => response.promise);
  assert.equal(await f.client.translate('ur'), null);
  await f.client.analyze(photo, 'en', 'objects');
  const pending = f.client.translate('ur');
  assert.equal(await f.client.translate('ur'), null);
  assert.equal(await f.client.translate('roman'), null);
  assert.equal(f.requests.length, 2);
  f.client.dispose();
  response.resolve(Response.json(results.ur));
  assert.equal(await pending, null);
  assert.equal(await f.client.translate('ur'), null);
  assert.deepEqual(f.client.getState(), idleVision);
});

test('translation deadline retains the original instead of clearing or showing provider data', async () => {
  const f = fixture((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })), { timeoutMs: 5 });
  await f.client.analyze(photo, 'en', 'objects');
  assert.equal(await f.client.translate('ur'), null);
  assert.equal(f.requests[1].signal.aborted, true);
  assert.deepEqual(f.client.getState().result, results.en);
  assert.equal(f.client.getState().message, visionMessages.translation_failed);
  assert.equal(f.client.getState().phase, 'ready');
  f.client.dispose();
});

test('translation failures retain the translated result already on screen, not just the original', async () => {
  const f = fixture((_url, init) => JSON.parse(init.body).language === 'ur' ? Promise.resolve(Response.json(results.ur)) : Promise.reject(new Error('Offline')));
  await f.client.analyze(photo, 'en', 'objects');
  await f.client.translate('ur');
  await f.client.translate('roman');
  assert.deepEqual(f.client.getState().result, results.ur);
  assert.equal(f.client.getState().language, 'ur');
  assert.equal(f.client.getState().message, visionMessages.translation_failed);
  f.client.dispose();
});

test('translation body arriving after Clear cannot replace a newly analyzed photo', async () => {
  const body = deferred(), started = deferred();
  const f = fixture(async () => ({ ok: true, status: 200, text: () => { started.resolve(); return body.promise; } }));
  await f.client.analyze(photo, 'en', 'objects');
  const pending = f.client.translate('ur');
  await started.promise;
  f.client.cancel();
  await f.client.analyze({ ...photo, base64: 'bmV3' }, 'roman', 'objects');
  const count = f.states.length;
  body.resolve(JSON.stringify(results.ur));
  assert.equal(await pending, null);
  assert.equal(f.states.length, count);
  assert.deepEqual(f.client.getState().result, results.roman);
  assert.equal(f.client.getState().language, 'roman');
  f.client.dispose();
});

test('translation 401 clears its own rejected credential but cached results remain available', async () => {
  const f = fixture(async () => new Response('', { status: 401 }));
  await f.client.analyze(photo, 'en', 'objects');
  await f.client.translate('ur');
  assert.equal(f.credentials.current, null);
  assert.equal(f.client.getState().needsConnection, true);
  assert.deepEqual(await f.client.translate('en'), results.en);
  assert.equal(f.requests.length, 2);
  f.client.dispose();
});

test('Sign Assistant does not submit object-translation requests', async () => {
  let requests = 0;
  const client = createVisionClient({ baseUrl: 'https://demo.example',
    credentials: { current: { token: 'test-grant', expiresAt: Date.now() + 60000 } }, onState() {},
    fetcher: async () => { requests++; return Response.json({ ...results.en, task: 'gesture', gesture: 'open_palm' }); },
  });
  await client.analyze(photo, 'en', 'gesture');
  assert.equal(await client.translate('ur'), null);
  assert.equal(requests, 1);
  client.dispose();
});
