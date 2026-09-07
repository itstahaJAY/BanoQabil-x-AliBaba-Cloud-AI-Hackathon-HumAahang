import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCaptionTransport, nativeCaptionOrigin } from '../src/caption-transport.ts';

test('native HTTP and WebSocket carry the same explicit origin without losing authorization or abort', async () => {
  const calls = [];
  const transport = createCaptionTransport(true, async (url, init) => { calls.push(init); return Response.json({}); },
    class { constructor(...args) { calls.push(args); } });
  const controller = new AbortController();
  await transport.fetcher('http://127.0.0.1:8787/v1/stt/sessions', {
    method: 'POST', headers: { Authorization: 'Bearer test-only', 'Content-Type': 'application/json' }, signal: controller.signal,
  });
  transport.createSocket('ws://127.0.0.1:8787/v1/stt/stream', ['humahang.stt.v1', 'ticket.test']);
  assert.equal(calls[0].headers.get('Origin'), nativeCaptionOrigin);
  assert.equal(calls[0].headers.get('Authorization'), 'Bearer test-only');
  assert.equal(calls[0].signal, controller.signal);
  assert.deepEqual(calls[1][2], { headers: { Origin: nativeCaptionOrigin } });
});

test('web leaves browser-owned Origin and WebSocket headers untouched', () => {
  const calls = [], request = async () => Response.json({});
  const transport = createCaptionTransport(false, request, class { constructor(...args) { calls.push(args); } });
  assert.equal(transport.fetcher, request);
  transport.createSocket('ws://127.0.0.1:8787/v1/stt/stream', ['humahang.stt.v1', 'ticket.test']);
  assert.equal(calls[0].length, 2);
});
