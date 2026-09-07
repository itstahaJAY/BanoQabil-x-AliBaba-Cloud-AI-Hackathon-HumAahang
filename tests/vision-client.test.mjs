import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVisionClient, idleVision, isVisionResult, visionMessages } from '../src/vision-client.ts';

const photo = { base64: 'aW1hZ2U=', mimeType: 'image/jpeg', uri: 'file:///private/cache/photo.jpg' };
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
function fixture(overrides = {}) {
  const states = [], requests = [];
  const credentials = overrides.credentials ?? { current: { token: 'short-lived-test-grant', expiresAt: Date.now() + 60000 } };
  const fetcher = overrides.fetcher ?? (async () => Response.json(results.en));
  const client = createVisionClient({ baseUrl: overrides.baseUrl ?? 'https://demo.example/', credentials,
    timeoutMs: overrides.timeoutMs ?? 1000,
    fetcher: (url, init) => { requests.push({ url, ...init }); return fetcher(url, init); },
    onState: state => states.push(state),
  });
  return { client, states, requests, credentials };
}

test('photo analysis requires a current grant without making any network request', async () => {
  for (const grant of [null, { token: 'expired', expiresAt: Date.now() - 1 }]) {
    const f = fixture({ credentials: { current: grant } });
    assert.equal(await f.client.analyze(photo, 'en', 'objects'), null);
    assert.equal(f.requests.length, 0);
    assert.equal(f.client.getState().needsConnection, true);
    assert.equal(f.client.getState().message, visionMessages.setup_required);
    f.client.dispose();
  }
});

test('photo transport sends the requested language/task and encoded image, with credentials only in the header', async () => {
  const f = fixture();
  assert.deepEqual(await f.client.analyze(photo, 'en', 'objects'), results.en);
  assert.equal(f.requests.length, 1);
  const request = f.requests[0];
  assert.equal(request.url, 'https://demo.example/v1/vision/analyze');
  assert.equal(request.method, 'POST');
  assert.equal(request.redirect, 'error');
  assert.equal(request.headers.Authorization, 'Bearer short-lived-test-grant');
  assert.equal(request.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(request.body), { image: { base64: photo.base64, mimeType: photo.mimeType }, language: 'en', task: 'objects' });
  assert.ok(!request.body.includes('private/cache'));
  assert.ok(!request.body.includes('short-lived-test-grant'));
  assert.deepEqual(f.states.map(state => state.phase), ['analyzing', 'ready']);
  f.client.dispose();
});

test('English, Urdu and Roman Urdu use independently validated display and speech text', async () => {
  for (const language of ['en', 'ur', 'roman']) {
    const f = fixture({ fetcher: async () => Response.json(results[language]) });
    assert.deepEqual(await f.client.analyze(photo, language, 'objects'), results[language]);
    assert.equal(f.client.getState().phase, 'ready');
    assert.equal(f.client.getState().needsConnection, false);
    f.client.dispose();
  }
  assert.equal(isVisionResult({ ...results.roman, spokenDescription: 'Mez par aik cup hai.' }, 'objects', 'roman'), false);
  assert.equal(isVisionResult(results.ur, 'objects', 'en'), false);
  assert.equal(isVisionResult(results.en, 'objects', 'ur'), false);
});

test('static gesture results accept only the requested task and documented gesture set', () => {
  for (const gesture of ['open_palm', 'closed_fist', 'thumbs_up', 'thumbs_down', 'victory', 'pointing_up', 'unknown']) {
    assert.equal(isVisionResult({ ...results.en, task: 'gesture', gesture }, 'gesture', 'en'), true);
  }
  assert.equal(isVisionResult({ ...results.en, task: 'gesture', gesture: 'sign_translation' }, 'gesture', 'en'), false);
  assert.equal(isVisionResult({ ...results.en, task: 'gesture', gesture: 'open_palm' }, 'objects', 'en'), false);
  assert.equal(isVisionResult({ ...results.en, gesture: 'open_palm' }, 'objects', 'en'), false);
});

test('raw Hindi, unsafe text, malformed shapes and extra result keys never reach the visible state', async () => {
  const invalid = [
    { ...results.en, description: 'पानी' },
    { ...results.en, spokenDescription: 'पानी' },
    { ...results.en, objects: ['पानी'] },
    { ...results.en, description: 'A cup\u202Eprivate' },
    { ...results.en, description: 'Cup\u0000' },
    { ...results.en, description: '   ' },
    { ...results.en, description: 'x'.repeat(1801) },
    { ...results.en, objects: 'Cup' },
    { ...results.en, objects: ['x'.repeat(101)] },
    { ...results.en, objects: Array(21).fill('Cup') },
    { ...results.en, uncertain: 'false' },
    { ...results.en, providerSecret: 'untrusted-value' },
    { description: 'A cup' }, null, [],
  ];
  for (const result of invalid) {
    const f = fixture({ fetcher: async () => Response.json(result) });
    assert.equal(await f.client.analyze(photo, 'en', 'objects'), null);
    assert.equal(f.client.getState().message, visionMessages.vision_invalid);
    assert.equal(f.client.getState().result, null);
    assert.ok(!JSON.stringify(f.states).includes('पानी'));
    assert.ok(!JSON.stringify(f.states).includes('untrusted-value'));
    f.client.dispose();
  }
});

test('English/Roman output and Urdu output reject unrelated alphabet scripts', () => {
  assert.equal(isVisionResult({ ...results.en, description: 'Стол' }, 'objects', 'en'), false);
  assert.equal(isVisionResult({ ...results.roman, objects: ['桌子'] }, 'objects', 'roman'), false);
  assert.equal(isVisionResult({ ...results.ur, description: 'میز 桌子' }, 'objects', 'ur'), false);
});

test('empty/oversized images and unsupported MIME types are rejected before fetch', async () => {
  for (const image of [{ ...photo, base64: '' }, { ...photo, base64: 'A'.repeat(4 * 1024 * 1024 + 1) }, { ...photo, mimeType: 'image/svg+xml' }]) {
    const f = fixture();
    assert.equal(await f.client.analyze(image, 'en', 'objects'), null);
    assert.equal(f.requests.length, 0);
    assert.equal(f.client.getState().message, visionMessages.invalid_image);
    f.client.dispose();
  }
});

test('invalid backend URLs cannot receive the bearer grant', async () => {
  for (const baseUrl of ['http://public.example', 'https://user:pass@demo.example', 'https://demo.example/private', 'https://demo.example/?key=test']) {
    const f = fixture({ baseUrl });
    assert.equal(await f.client.analyze(photo, 'en', 'objects'), null);
    assert.equal(f.requests.length, 0);
    assert.equal(f.client.getState().message, visionMessages.server_unavailable);
    f.client.dispose();
  }
});

test('401 clears only the rejected grant and asks the user to reconnect', async () => {
  const f = fixture({ fetcher: async () => Response.json({ code: 'unauthorized' }, { status: 401 }) });
  await f.client.analyze(photo, 'en', 'objects');
  assert.equal(f.credentials.current, null);
  assert.equal(f.client.getState().needsConnection, true);
  assert.equal(f.client.getState().message, visionMessages.unauthorized);
  f.client.dispose();
});

test('an old request receiving 401 preserves a newer successful pairing grant', async () => {
  const reply = deferred();
  const f = fixture({ fetcher: () => reply.promise });
  const analyzing = f.client.analyze(photo, 'en', 'objects');
  const fresh = { token: 'new-runtime-grant', expiresAt: Date.now() + 60000 };
  f.credentials.current = fresh;
  reply.resolve(Response.json({ code: 'unauthorized' }, { status: 401 }));
  await analyzing;
  assert.equal(f.credentials.current, fresh);
  assert.equal(f.client.getState().message, visionMessages.unauthorized);
  f.client.dispose();
});

test('401 remains an authentication failure even when its body is empty or non-JSON', async () => {
  for (const raw of ['', '<html>Unauthorized</html>']) {
    const f = fixture({ fetcher: async () => new Response(raw, { status: 401 }) });
    await f.client.analyze(photo, 'en', 'objects');
    assert.equal(f.credentials.current, null);
    assert.equal(f.client.getState().needsConnection, true);
    assert.equal(f.client.getState().message, visionMessages.unauthorized);
    f.client.dispose();
  }
});

test('known server failures map to local messages without leaking provider bodies', async () => {
  for (const [code, status] of [['vision_unavailable', 503], ['vision_timeout', 504], ['vision_refused', 422], ['vision_busy', 429], ['rate_limited', 429], ['invalid_image', 400], ['invalid_request', 400], ['body_too_large', 413]]) {
    const f = fixture({ fetcher: async () => Response.json({ code, providerMessage: 'private-key-should-not-appear' }, { status }) });
    await f.client.analyze(photo, 'en', 'objects');
    assert.equal(f.client.getState().message, visionMessages[code]);
    assert.ok(!JSON.stringify(f.states).includes('private-key'));
    f.client.dispose();
  }
});

test('unknown server codes and network failures use a safe message; unknown 429 uses busy', async () => {
  for (const status of [400, 429, 500]) {
    const f = fixture({ fetcher: async () => Response.json({ code: 'secret-private-error' }, { status }) });
    await f.client.analyze(photo, 'en', 'objects');
    assert.equal(f.client.getState().message, status === 429 ? visionMessages.vision_busy : visionMessages.server_unavailable);
    f.client.dispose();
  }
  const f = fixture({ fetcher: async () => { throw new Error('Private network details'); } });
  await f.client.analyze(photo, 'en', 'objects');
  assert.equal(f.client.getState().message, visionMessages.server_unavailable);
  assert.ok(!JSON.stringify(f.states).includes('Private network details'));
  f.client.dispose();
});

test('invalid JSON and oversized responses are rejected without exposing response text', async () => {
  for (const body of ['not JSON private-body', 'x'.repeat(32769)]) {
    const f = fixture({ fetcher: async () => new Response(body) });
    await f.client.analyze(photo, 'en', 'objects');
    assert.equal(f.client.getState().message, visionMessages.vision_invalid);
    assert.equal(f.client.getState().result, null);
    f.client.dispose();
  }
});

test('the request deadline aborts transport and gives a retryable timeout state', async () => {
  const f = fixture({ timeoutMs: 5, fetcher: (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }) });
  assert.equal(await f.client.analyze(photo, 'en', 'objects'), null);
  assert.equal(f.requests[0].signal.aborted, true);
  assert.equal(f.client.getState().message, visionMessages.vision_timeout);
  assert.equal(f.client.getState().phase, 'error');
  f.client.dispose();
});

test('repeated analyze taps create only one active request', async () => {
  const reply = deferred();
  const f = fixture({ fetcher: () => reply.promise });
  const first = f.client.analyze(photo, 'en', 'objects');
  assert.equal(await f.client.analyze(photo, 'en', 'objects'), null);
  assert.equal(f.requests.length, 1);
  reply.resolve(Response.json(results.en));
  await first;
  assert.equal(f.client.getState().phase, 'ready');
  f.client.dispose();
});

test('cancel aborts transport, resets state and suppresses a late successful response', async () => {
  const reply = deferred();
  const f = fixture({ fetcher: () => reply.promise });
  const pending = f.client.analyze(photo, 'en', 'objects');
  f.client.cancel();
  assert.equal(f.requests[0].signal.aborted, true);
  assert.deepEqual(f.client.getState(), idleVision);
  const count = f.states.length;
  reply.resolve(Response.json(results.en));
  assert.equal(await pending, null);
  assert.equal(f.states.length, count);
  assert.equal(f.client.getState().result, null);
  f.client.dispose();
});

test('cancel while reading a response body cannot restore its old photo result', async () => {
  const body = deferred(), bodyStarted = deferred();
  const f = fixture({ fetcher: async () => ({ ok: true, status: 200, text: () => { bodyStarted.resolve(); return body.promise; } }) });
  const pending = f.client.analyze(photo, 'en', 'objects');
  await bodyStarted.promise;
  f.client.cancel();
  body.resolve(JSON.stringify(results.en));
  assert.equal(await pending, null);
  assert.deepEqual(f.client.getState(), idleVision);
  f.client.dispose();
});

test('a late cancelled request cannot overwrite a newer request result', async () => {
  const oldReply = deferred();
  let call = 0;
  const f = fixture({ fetcher: () => ++call === 1 ? oldReply.promise : Promise.resolve(Response.json(results.ur)) });
  const old = f.client.analyze(photo, 'en', 'objects');
  f.client.cancel();
  assert.deepEqual(await f.client.analyze(photo, 'ur', 'objects'), results.ur);
  oldReply.resolve(Response.json(results.en));
  assert.equal(await old, null);
  assert.deepEqual(f.client.getState().result, results.ur);
  f.client.dispose();
});

test('dispose cancels capture analysis, publishes no late updates and prohibits future requests', async () => {
  const reply = deferred();
  const f = fixture({ fetcher: () => reply.promise });
  const pending = f.client.analyze(photo, 'en', 'objects');
  const count = f.states.length;
  f.client.dispose();
  assert.equal(f.requests[0].signal.aborted, true);
  reply.resolve(Response.json(results.en));
  assert.equal(await pending, null);
  assert.equal(await f.client.analyze(photo, 'en', 'objects'), null);
  assert.equal(f.requests.length, 1);
  assert.equal(f.states.length, count);
  assert.equal(f.client.getState().result, null);
});
