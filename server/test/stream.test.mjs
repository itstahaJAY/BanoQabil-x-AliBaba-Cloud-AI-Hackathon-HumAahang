import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { runStream } from '../stream.mjs';

class Socket extends EventEmitter {
  readyState = 1; bufferedAmount = 0; events = [];
  send(data) { this.events.push(JSON.parse(String(data))); }
  close() { this.readyState = 3; this.emit('close'); }
  terminate() { this.close(); }
}

test('slow client closes safely without recursive errors or retaining the session', () => {
  for (const duringStop of [false, true]) {
    const client = new Socket(), upstream = new Socket(); let closed = 0;
    runStream(client, { sampleRate: 16000 }, { connect: () => upstream, convert: () => [], config: {}, sessionId: 'test', onDone: () => closed++ });
    if (duringStop) upstream.emit('open');
    client.bufferedAmount = 300000;
    assert.doesNotThrow(() => duringStop
      ? client.emit('message', Buffer.from('{"type":"stop"}'), false)
      : upstream.emit('open'));
    assert.equal(closed, 1); assert.equal(client.readyState, 3);
    assert.equal(upstream.events.length, 0, 'never send CloseStream after terminating the provider');
  }
});

test('opening timeout and hard session deadline close provider/client once', async () => {
  for (const opened of [false, true]) {
    const client = new Socket(), upstream = new Socket(); let closed = 0;
    runStream(client, { sampleRate: 16000 }, { connect: () => upstream, convert: () => [], config: { connectTimeoutMs: 10, sessionDurationMs: 25 }, sessionId: 'test', onDone: () => closed++ });
    if (opened) upstream.emit('open');
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(closed, 1); assert.equal(upstream.readyState, 3);
    assert.equal(client.events.find(e => e.type === 'error').code, opened ? 'session_limit' : 'provider_unavailable');
  }
});

test('stop has a bounded drain timeout; cancel prevents a late normalized final', async () => {
  for (const cancel of [false, true]) {
    const client = new Socket(), upstream = new Socket(); let release;
    runStream(client, { sampleRate: 16000 }, { connect: () => upstream,
      convert: () => new Promise(resolve => { release = resolve; }), config: { drainTimeoutMs: 10 }, sessionId: 'test', onDone: () => {} });
    upstream.emit('open');
    upstream.emit('message', Buffer.from(JSON.stringify({ type: 'Results', is_final: true, start: 0, duration: 1,
      channel: { alternatives: [{ transcript: 'पानी', languages: ['hi'] }] } })), false);
    await new Promise(resolve => setImmediate(resolve));
    client.emit('message', Buffer.from(JSON.stringify({ type: cancel ? 'cancel' : 'stop' })), false);
    if (!cancel) await new Promise(resolve => setTimeout(resolve, 20));
    release(['پانی']); await new Promise(resolve => setImmediate(resolve));
    assert.equal(client.events.some(e => e.type === 'final'), false);
    assert.equal(client.readyState, 3);
    if (!cancel) assert.equal(client.events.find(e => e.type === 'error').code, 'drain_timeout');
  }
});

test('malformed recognition frames identify the input stage without leaking provider text', () => {
  const client = new Socket(), upstream = new Socket(); let closed = 0;
  runStream(client, { sampleRate: 16000 }, { connect: () => upstream, convert: () => [], config: {}, sessionId: 'test', onDone: () => closed++ });
  upstream.emit('open');
  upstream.emit('message', Buffer.from('SECRET invalid provider JSON'), false);
  assert.deepEqual(client.events.at(-1), { type: 'error', code: 'invalid_result', stage: 'recognition_input', sessionId: 'test' });
  assert.equal(closed, 1);
  assert.equal(upstream.readyState, 3);
});
