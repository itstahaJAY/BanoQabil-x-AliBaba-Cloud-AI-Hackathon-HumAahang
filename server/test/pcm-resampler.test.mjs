import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPcmResampler } from '../pcm-resampler.mjs';

function pcm(samples) {
  const buffer = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, index) => buffer.writeInt16LE(sample, index * 2));
  return buffer;
}

function samples(buffer) {
  return Array.from({ length: buffer.length / 2 }, (_, index) => buffer.readInt16LE(index * 2));
}

function resample(inputSampleRate, input, chunkSizes = [input.length / 2 || 1]) {
  const resampler = createPcmResampler(inputSampleRate);
  const output = [];
  let offset = 0;
  let chunkIndex = 0;
  while (offset < input.length) {
    const end = Math.min(input.length, offset + chunkSizes[chunkIndex++ % chunkSizes.length] * 2);
    output.push(resampler.push(input.subarray(offset, end)));
    output.push(resampler.push(Buffer.alloc(0)));
    offset = end;
  }
  output.push(resampler.flush());
  return Buffer.concat(output);
}

for (const rate of [16000, 24000, 48000]) {
  test(`${rate} Hz produces floor(input samples * 24000 / input rate) samples including the tail`, () => {
    for (const length of [0, 1, 2, 3, 7, 31, 32, 33, 64, 65, 1001, 4097]) {
      const input = pcm(Array.from({ length }, (_, index) => index * 3));
      const output = resample(rate, input, [1, 7, 32, 131]);
      assert.equal(output.length / 2, Math.floor(length * 24000 / rate), `input length ${length}`);
    }
  });

  test(`${rate} Hz output is identical across arbitrary chunk boundaries`, () => {
    const input = pcm(Array.from({ length: 6137 }, (_, index) => ((index * 15427 + 739) % 65536) - 32768));
    assert.deepEqual(resample(rate, input, [1, 7, 63, 64, 65, 127, 1000]), resample(rate, input));
  });

  test(`${rate} Hz preserves full scale DC without wrapping`, () => {
    for (const value of [-32768, -1, 0, 1, 32767]) {
      const output = samples(resample(rate, pcm(Array(257).fill(value)), [13, 1, 64]));
      assert.ok(output.length > 0);
      assert.ok(output.every(sample => sample === value), `DC value ${value}`);
    }
  });

  test(`${rate} Hz flush is idempotent and closes the stream`, () => {
    const resampler = createPcmResampler(rate);
    resampler.push(pcm([100, 200, 300]));
    resampler.flush();
    assert.deepEqual(resampler.flush(), Buffer.alloc(0));
    assert.throws(() => resampler.push(pcm([400])), /flush|closed/i);
    assert.throws(() => resampler.push(Buffer.alloc(0)), /flush|closed/i);
  });

  test(`${rate} Hz emits during streaming with a bounded pending tail`, () => {
    const resampler = createPcmResampler(rate);
    const chunk = pcm(Array(257).fill(1000));
    let emitted = 0;
    for (let count = 1; count <= 100; count++) {
      const output = resampler.push(chunk);
      assert.ok(output.length > 0, 'a full chunk must not wait for flush');
      emitted += output.length / 2;
      const expected = Math.floor(count * 257 * 24000 / rate);
      assert.ok(expected - emitted >= 0 && expected - emitted <= 64);
    }
    emitted += resampler.flush().length / 2;
    assert.equal(emitted, Math.floor(100 * 257 * 24000 / rate));
  });

  test(`${rate} Hz rejects malformed and oversized chunks without consuming valid audio`, () => {
    const resampler = createPcmResampler(rate);
    const first = pcm([100, 200, 300]);
    const last = pcm([400, 500, 600]);
    const output = [resampler.push(first)];
    for (const invalid of [null, 'pcm', new Uint8Array(2), Buffer.alloc(3), Buffer.alloc(256 * 1024 + 2)]) {
      assert.throws(() => resampler.push(invalid), /buffer|sample|bytes|chunk|large/i);
    }
    output.push(resampler.push(last), resampler.flush());
    assert.deepEqual(Buffer.concat(output), resample(rate, Buffer.concat([first, last])));
  });

  test(`${rate} Hz does not retain mutable caller buffers`, () => {
    const input = pcm(Array(73).fill(17000));
    const original = Buffer.from(input);
    const resampler = createPcmResampler(rate);
    const firstOutput = resampler.push(input);
    input.fill(0);
    assert.deepEqual(Buffer.concat([firstOutput, resampler.flush()]), resample(rate, original));
  });
}

test('rejects unsupported input sample rates', () => {
  for (const rate of [undefined, null, '16000', NaN, Infinity, 0, -16000, 8000, 44100, 96000]) {
    assert.throws(() => createPcmResampler(rate), /sample rate/i);
  }
});

test('24000 Hz is an immediate byte-exact PCM passthrough', () => {
  const resampler = createPcmResampler(24000);
  const input = pcm([-32768, -12345, -1, 0, 1, 12345, 32767]);
  assert.deepEqual(resampler.push(input), input);
  assert.deepEqual(resampler.flush(), Buffer.alloc(0));
});

function tone(rate, frequency) {
  return pcm(Array.from({ length: rate / 4 }, (_, index) => Math.round(16000 * Math.sin(2 * Math.PI * frequency * index / rate))));
}

function rms(values) {
  return Math.sqrt(values.reduce((sum, sample) => sum + sample * sample, 0) / values.length);
}

for (const rate of [16000, 48000]) {
  test(`${rate} Hz preserves speech passband amplitude and frequency at 24000 Hz`, () => {
    for (const frequency of [1000, 6000]) {
      const output = samples(resample(rate, tone(rate, frequency), [1, 127, 509]));
      assert.equal(output.length, 6000);
      const interior = output.slice(128, -128);
      const expected = interior.map((_, index) => 16000 * Math.sin(2 * Math.PI * frequency * (index + 128) / 24000));
      const error = interior.map((sample, index) => sample - expected[index]);
      assert.ok(rms(error) / rms(expected) < 0.015, `${frequency} Hz relative signal error`);
    }
  });

  test(`${rate} Hz saturates filter overshoot at signed 16-bit limits`, () => {
    const input = pcm([...Array(128).fill(-32768), ...Array(128).fill(32767), ...Array(128).fill(-32768)]);
    const output = samples(resample(rate, input));
    const rise = Math.ceil(130 * 24000 / rate);
    const fall = Math.ceil(258 * 24000 / rate);
    assert.ok(output.slice(rise, rise + 8).every(sample => sample > 28000), 'positive overshoot cannot wrap negative');
    assert.ok(output.slice(fall, fall + 8).every(sample => sample < -28000), 'negative overshoot cannot wrap positive');
    assert.ok(output.slice(rise, rise + 8).includes(32767), 'positive overshoot is clipped');
    assert.ok(output.slice(fall, fall + 8).includes(-32768), 'negative overshoot is clipped');
  });
}

test('48000 Hz downsampling suppresses frequencies above the output Nyquist limit', () => {
  for (const frequency of [14000, 16000, 20000]) {
    const output = samples(resample(48000, tone(48000, frequency), [73, 1, 513])).slice(128, -128);
    assert.ok(rms(output) / (16000 / Math.sqrt(2)) < 0.005, `${frequency} Hz alias attenuation must exceed 46 dB`);
  }
});
