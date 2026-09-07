import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { encodeMonoPcm, captionWorkletSource } from '../src/caption-pcm.ts';

test('PCM is signed little-endian, clips extremes and sanitizes non-finite device samples', () => {
  const [frame] = encodeMonoPcm([new Float32Array([-2, -1, -.5, 0, .5, 1, 2, NaN])]);
  assert.deepEqual([...new Uint8Array(frame)], [0,128,0,128,0,192,0,0,0,64,255,127,255,127,0,0]);
});

test('stereo downmix averages both channels, rather than dropping the quieter speaker', () => {
  const [frame] = encodeMonoPcm([new Float32Array([1, 0, -1]), new Float32Array([-1, 1, 0])]);
  const view = new DataView(frame);
  assert.deepEqual([0, 2, 4].map(offset => view.getInt16(offset, true)), [0, 16384, -16384]);
});

test('long callback buffers split without sample loss into <=100ms frames at the selected rate', () => {
  const frames = encodeMonoPcm([new Float32Array(3500).fill(.5)], 1600);
  assert.deepEqual(frames.map(frame => frame.byteLength), [3200, 3200, 600]);
  assert.equal(encodeMonoPcm([new Float32Array(0)]).length, 0);
});

test('invalid channel shape and unsafe chunk sizes fail without emitting corrupt audio', () => {
  for (const channels of [[], [new Float32Array(2), new Float32Array(1)], [new Float32Array(96001)]]) {
    assert.throws(() => encodeMonoPcm(channels));
  }
  for (const size of [0, -1, 1.5, Infinity, 96001]) {
    assert.throws(() => encodeMonoPcm([new Float32Array(1)], size));
  }
});

test('worklet batches exactly 100ms, downmixes channels and flushes its partial tail once', () => {
  const events = [];
  let Processor;
  vm.runInNewContext(captionWorkletSource, {
    AudioWorkletProcessor: class { port = { postMessage: value => events.push(value), onmessage: null }; },
    registerProcessor: (name, Type) => { assert.equal(name, 'hum-ahang-capture'); Processor = Type; },
    Float32Array,
    sampleRate: 48000,
  });
  const processor = new Processor();
  const left = new Float32Array(128).fill(1), right = new Float32Array(128).fill(0);
  for (let i = 0; i < 40; i++) processor.process([[left, right]], [[new Float32Array(128)]]);
  assert.equal(events.length, 1);
  assert.equal(events[0].length, 4800);
  assert.ok(events[0].every(sample => sample === .5));
  processor.port.onmessage({ data: 'flush' });
  assert.equal(events[1].length, 320);
  assert.equal(events[2], 'flushed');
  processor.process([[left, right]], [[new Float32Array(128)]]);
  assert.equal(events.length, 3);
});
