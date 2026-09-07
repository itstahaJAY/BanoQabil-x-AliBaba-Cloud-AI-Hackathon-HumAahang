import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { connectOpenAI } from '../openai-stt.mjs';

class Socket extends EventEmitter {
  readyState = 0; bufferedAmount = 0; frames = []; pings = 0;
  send(data) { this.frames.push(JSON.parse(String(data))); }
  ping() { this.pings++; }
  open() { this.readyState = 1; this.emit('open'); }
  receive(frame) { this.emit('message', Buffer.from(JSON.stringify(frame)), false); }
  terminate() { this.readyState = 3; this.emit('close'); }
}

function setup(language, sampleRate = 24000) {
  const socket = new Socket(), messages = [], errors = []; let request, opens = 0;
  const adapter = connectOpenAI({ openaiKey: 'private-test-key' }, { encoding: 'linear16', channels: 1, sampleRate }, language,
    { createSocket: (url, options) => { request = { url, options }; return socket; } });
  adapter.on('open', () => opens++);
  adapter.on('message', data => messages.push(JSON.parse(String(data))));
  adapter.on('error', error => errors.push(error));
  const ack = () => socket.receive({ type: 'session.updated', session: socket.frames.findLast(frame => frame.type === 'session.update').session });
  const ready = () => { socket.open(); ack(); };
  return { socket, adapter, messages, errors, request, ack, ready, opens: () => opens };
}

test('session settings are acknowledged before exposing readiness and carry only supported language hints', () => {
  for (const language of [undefined, 'en', 'ur']) {
    const t = setup(language); t.socket.open();
    assert.equal(t.opens(), 0);
    assert.equal(t.socket.frames[0]?.type, 'session.update');
    const input = t.socket.frames[0].session.audio.input;
    assert.deepEqual(input.format, { type: 'audio/pcm', rate: 24000 });
    assert.equal(input.transcription.model, 'gpt-4o-transcribe');
    assert.equal(input.transcription.language, language);
    assert.equal(Object.hasOwn(input.transcription, 'language'), language !== undefined);
    t.ack(); assert.equal(t.opens(), 1); t.ack(); assert.equal(t.opens(), 1);
    assert.equal(t.request.url, 'wss://api.openai.com/v1/realtime?intent=transcription');
    assert.equal(t.request.options.headers.Authorization, 'Bearer private-test-key');
    t.adapter.terminate();
  }
});

const commit = (socket, item_id, previous_item_id = null) => socket.receive({ type: 'input_audio_buffer.committed', item_id, previous_item_id });
const complete = (socket, item_id, transcript) => socket.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id, content_index: 0, transcript });
const stop = adapter => adapter.send(JSON.stringify({ type: 'CloseStream' }));

test('final results follow committed item order even when completion and commit events arrive out of order', () => {
  const t = setup('ur'); t.ready();
  complete(t.socket, 'second', 'پانی چاہیے۔');
  commit(t.socket, 'second', 'first');
  assert.deepEqual(t.messages, []);
  complete(t.socket, 'first', 'مجھے');
  commit(t.socket, 'first');
  complete(t.socket, 'first', 'مجھے'); commit(t.socket, 'second', 'first');
  assert.deepEqual(t.messages.map(frame => [frame.start, frame.channel.alternatives[0].transcript]), [[0, 'مجھے'], [1, 'پانی چاہیے۔']]);
  assert.ok(t.messages.every(frame => frame.type === 'Results' && frame.is_final && frame.duration === 1));
  t.adapter.terminate();
});

test('stop seals the provider buffer before ending and waits for every late committed final', () => {
  const t = setup('en'); t.ready();
  t.adapter.send(Buffer.alloc(9600), { binary: true });
  stop(t.adapter); t.ack();
  assert.equal(t.socket.frames.at(-1).type, 'session.update', 'a second acknowledgement seals the explicit commit');
  // An earlier automatic turn can arrive around stop; it must not satisfy the
  // outstanding manual commit and close the stream before its tail appears.
  commit(t.socket, 'automatic'); complete(t.socket, 'automatic', 'First.');
  assert.equal(t.messages.some(frame => frame.type === 'Metadata'), false);
  commit(t.socket, 'tail', 'automatic'); complete(t.socket, 'tail', 'Last.');
  assert.equal(t.messages.some(frame => frame.type === 'Metadata'), false);
  t.ack();
  assert.deepEqual(t.messages.map(frame => frame.type), ['Results', 'Results', 'Metadata']);
  t.adapter.terminate();
});

test('resampling and minimal final padding retain the last short audio before committing it', () => {
  for (const rate of [16000, 24000, 48000]) {
    const t = setup('en', rate); t.ready();
    t.adapter.send(Buffer.alloc(rate / 100 * 2), { binary: true }); // 10ms capture.
    stop(t.adapter); t.ack();
    const audioFrames = t.socket.frames.filter(frame => frame.type === 'input_audio_buffer.append');
    assert.equal(audioFrames.reduce((bytes, frame) => bytes + Buffer.from(frame.audio, 'base64').length, 0), 4800);
    assert.equal(t.socket.frames.filter(frame => frame.type === 'input_audio_buffer.commit').length, 1);
    commit(t.socket, 'tail'); complete(t.socket, 'tail', 'Hi.'); t.ack();
    assert.equal(t.messages.at(-1).type, 'Metadata');
    t.adapter.terminate();
  }
});

test('stop without audio completes immediately and does not send a spurious empty commit', () => {
  const t = setup(); t.ready(); stop(t.adapter);
  assert.deepEqual(t.messages, [{ type: 'Metadata' }]);
  assert.equal(t.socket.frames.some(frame => frame.type === 'input_audio_buffer.commit'), false);
  t.adapter.terminate();
});

test('only a correlated empty final commit can be ignored and earlier transcription still must finish', () => {
  for (const correlated of [true, false]) {
    const t = setup(); t.ready(); t.adapter.send(Buffer.alloc(9600), { binary: true });
    commit(t.socket, 'earlier'); stop(t.adapter); t.ack();
    const ownCommit = t.socket.frames.find(frame => frame.type === 'input_audio_buffer.commit');
    t.socket.receive({ type: 'error', error: { code: 'input_audio_buffer_commit_empty', event_id: correlated ? ownCommit.event_id : 'different-request', message: 'SECRET' } });
    if (correlated) {
      t.ack(); assert.deepEqual(t.messages, []);
      complete(t.socket, 'earlier', 'Done.');
      assert.deepEqual(t.messages.map(frame => frame.type), ['Results', 'Metadata']);
      assert.deepEqual(t.errors, []);
    } else assert.deepEqual(t.errors.map(error => error.message), ['provider_interrupted']);
    t.adapter.terminate();
  }
});

test('provider error, transcription failure and unexpected close during stop fail safely', () => {
  for (const failure of ['transport', 'provider', 'item', 'close']) {
    const t = setup(); t.ready(); t.adapter.send(Buffer.alloc(9600), { binary: true }); stop(t.adapter);
    if (failure === 'transport') t.socket.emit('error', new Error('SECRET Authorization'));
    if (failure === 'provider') t.socket.receive({ type: 'error', error: { code: 'invalid_api_key', message: 'SECRET' } });
    if (failure === 'item') t.socket.receive({ type: 'conversation.item.input_audio_transcription.failed', item_id: 'failed', error: { message: 'SECRET' } });
    if (failure === 'close') t.socket.terminate();
    assert.deepEqual(t.errors.map(error => [error.code, error.message]), [['provider_interrupted', 'provider_interrupted']]);
    assert.equal(t.messages.some(frame => frame.type === 'Metadata'), false);
    assert.equal(t.adapter.readyState, 3);
  }
});

test('cancellation drops retained text and suppresses late transport callbacks', () => {
  const t = setup(); t.ready(); complete(t.socket, 'late', 'SECRET');
  t.adapter.terminate(); commit(t.socket, 'late');
  t.socket.emit('error', new Error('SECRET')); t.socket.emit('open');
  assert.deepEqual(t.messages, []); assert.deepEqual(t.errors, []); assert.equal(t.opens(), 1);
  assert.equal(t.adapter.readyState, 3);
});

test('backpressure and keepalive reflect the underlying socket', () => {
  const t = setup(); t.ready(); t.socket.bufferedAmount = 300000;
  assert.equal(t.adapter.bufferedAmount, 300000);
  t.adapter.send('{"type":"KeepAlive"}');
  assert.equal(t.socket.pings, 1);
  assert.equal(t.socket.frames.some(frame => frame.type === 'KeepAlive'), false);
  t.adapter.terminate();
});

test('invalid and excessive provider data are rejected without exposing transcripts', () => {
  for (const frame of [Buffer.from('SECRET'), Buffer.alloc(256 * 1024 + 1),
    Buffer.from(JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'too-long', content_index: 0, transcript: 'x'.repeat(4001) }))]) {
    const t = setup(); t.ready(); t.socket.emit('message', frame, false);
    assert.deepEqual(t.errors.map(error => [error.code, error.message]), [['invalid_result', 'invalid_result']]);
    assert.deepEqual(t.messages, []);
  }
});

test('connection failures are sanitized and unsupported capture configuration never connects', () => {
  const t = setup(); t.socket.emit('error', new Error('SECRET'));
  assert.deepEqual(t.errors.map(error => error.message), ['provider_unavailable']);
  assert.equal(t.opens(), 0);
  for (const [language, sampleRate] of [['hi', 24000], ['en', 44100]]) {
    assert.throws(() => setup(language, sampleRate), { code: 'invalid_message' });
  }
  assert.throws(() => connectOpenAI({}, { encoding: 'linear16', channels: 1, sampleRate: 24000 }, 'en', {
    createSocket() { throw new Error('SECRET'); },
  }), { code: 'provider_unavailable', message: 'provider_unavailable' });
});

test('provider teardown after Metadata cannot cancel the downstream caption queue', () => {
  const t = setup(); t.ready();
  t.adapter.send(Buffer.alloc(9600), { binary: true });
  stop(t.adapter); t.ack(); commit(t.socket, 'last'); complete(t.socket, 'last', 'Last caption.'); t.ack();
  assert.equal(t.messages.at(-1).type, 'Metadata');
  t.socket.emit('error', new Error('provider disconnected after completion'));
  t.socket.terminate();
  assert.deepEqual(t.errors, [], 'the caption pipeline may still be finishing translation');
});

test('pending provider item storage is bounded even when earlier commits never arrive', () => {
  const t = setup(); t.ready();
  for (let i = 0; i <= 3000; i++) complete(t.socket, `orphan-${i}`, 'Pending.');
  assert.deepEqual(t.errors.map(error => error.code), ['session_limit']);
  assert.deepEqual(t.messages, []);
  assert.equal(t.socket.readyState, 3);
});
