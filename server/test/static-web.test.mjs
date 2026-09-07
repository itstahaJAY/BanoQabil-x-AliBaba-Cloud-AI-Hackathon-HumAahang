import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createStaticWebHandler } from '../static-web.mjs';

const bundle = '/_expo/static/js/web/entry-0123456789abcdef0123456789abcdef.js';
const picture = '/assets/character.0123456789abcdef.png';

async function fixture(t) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'humahang-static-test-'));
  const root = path.join(temporary, 'web');
  await mkdir(path.join(root, '_expo/static/js/web'), { recursive: true });
  await mkdir(path.join(root, 'assets'), { recursive: true });
  for (const [name, body] of [
    ['index.html', '<!doctype html><title>Hum Ahang</title>'],
    [bundle, 'console.log("public bundle")'], [picture, 'public picture'],
    ['favicon.ico', 'icon'], ['metadata.json', '{"private":"export metadata"}'],
    ['.env', 'PRIVATE_VALUE=never-serve'], ['assets/.env.png', 'never-serve'],
    ['_expo/static/js/web/private.js.map', 'never-serve'],
    ['_expo/static/js/web/private.ts', 'never-serve'],
  ]) await writeFile(path.join(root, name), body);
  const handler = createStaticWebHandler(root);
  const server = http.createServer(async (req, res) => {
    if (await handler(req, res)) return;
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end('{"code":"not_found"}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(temporary, { recursive: true, force: true });
  });
  const request = (target, method = 'GET') => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: target, method }, res => {
      const chunks = [];
      res.on('data', data => chunks.push(data));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject); req.end();
  });
  return { root, temporary, request };
}

test('real app routes refresh to the SPA and queries do not affect lookup', async t => {
  const { request } = await fixture(t);
  for (const url of ['/', '/index.html', '/transcription', '/speech-setup/', '/conversation?partner=hearing',
    '/profile', '/(tabs)/communicate', '/%28tabs%29/assist', '/contact-qr', '/vision']) {
    const result = await request(url);
    assert.equal(result.status, 200, url);
    assert.match(result.headers['content-type'], /^text\/html/);
    assert.equal(result.headers['cache-control'], 'no-cache');
    assert.equal(result.headers['content-security-policy'], "frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
    assert.match(result.body, /Hum Ahang/);
  }
});

test('bundled assets have MIME, immutable cache and protective headers', async t => {
  const { request } = await fixture(t);
  const result = await request(bundle + '?v=1');
  assert.equal(result.status, 200);
  assert.equal(result.headers['content-type'], 'text/javascript; charset=utf-8');
  assert.equal(result.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.equal(result.headers['x-content-type-options'], 'nosniff');
  assert.equal(result.headers['x-frame-options'], 'DENY');
  assert.equal(result.headers['content-security-policy'], "frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
  assert.equal(result.headers['permissions-policy'], 'camera=(self), microphone=(self)');
  assert.equal(Number(result.headers['content-length']), Buffer.byteLength(result.body));
  assert.equal((await request(picture)).headers['content-type'], 'image/png');
  assert.equal((await request('/favicon.ico')).headers['cache-control'], 'no-cache');
});

test('HEAD returns the GET headers with no response body', async t => {
  const { request } = await fixture(t);
  for (const url of ['/', '/transcription', bundle, picture]) {
    const get = await request(url), head = await request(url, 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.body, '');
    assert.equal(head.headers['content-length'], get.headers['content-length']);
    assert.equal(head.headers['content-type'], get.headers['content-type']);
  }
});

test('API, unknown routes, source files, maps, secrets and traversal keep JSON 404', async t => {
  const { request } = await fixture(t);
  for (const url of ['/v1', '/v1/missing', '/health', '/health?x=1', '/api/missing', '/unknown-route',
    '/assets/missing.png', '/assets', '/_expo/static', '/metadata.json', '/package.json', '/server/server.mjs',
    '/src/service-connection.ts', '/.env', '/%2eenv', '/assets/.env.png', '/_expo/static/js/web/private.ts',
    '/_expo/static/js/web/private.js.map', '/assets/../index.html', '/assets/%2e%2e/index.html',
    '/assets/%252e%252e/index.html', '/assets%5c..%5cindex.html', '//index.html', '/%00index.html', '/%ZZ']) {
    const result = await request(url);
    assert.equal(result.status, 404, url);
    assert.equal(result.headers['content-type'], 'application/json', url);
    assert.equal(result.body, '{"code":"not_found"}', url);
  }
});

test('methods other than GET and HEAD are left to the API router', async t => {
  const { request } = await fixture(t);
  for (const method of ['POST', 'DELETE', 'OPTIONS', 'PUT']) assert.equal((await request('/', method)).status, 404);
});

test('symlinked assets cannot escape the root or expose private files within it', async t => {
  const { root, temporary, request } = await fixture(t);
  await mkdir(path.join(temporary, 'outside'));
  await writeFile(path.join(temporary, 'outside/secret.png'), 'never-serve');
  // Directory junctions work on Windows without administrator symlink privileges.
  await symlink(path.join(temporary, 'outside'), path.join(root, 'assets/escape'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal((await request('/assets/escape/secret.png')).status, 404);
  await mkdir(path.join(root, '.private'));
  await writeFile(path.join(root, '.private/secret.png'), 'never-serve');
  await symlink(path.join(root, '.private'), path.join(root, 'assets/inside'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal((await request('/assets/inside/secret.png')).status, 404);
});

test('the handler fails startup for a missing export', () => {
  assert.throws(() => createStaticWebHandler(path.join(os.tmpdir(), 'missing-humahang-web-export')), /WEB_ROOT/);
});
