import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseWav } from '../wav.mjs';

function wav() {
  const value = Buffer.alloc(364); value.write('RIFF'); value.writeUInt32LE(356, 4); value.write('WAVE', 8);
  value.write('fmt ', 12); value.writeUInt32LE(16, 16); value.writeUInt16LE(1, 20); value.writeUInt16LE(1, 22);
  value.writeUInt32LE(16000, 24); value.writeUInt32LE(32000, 28); value.writeUInt16LE(2, 32); value.writeUInt16LE(16, 34);
  value.write('data', 36); value.writeUInt32LE(320, 40); return value;
}
test('smoke WAV parser validates actual mono PCM16 bytes, not only the filename', () => {
  const parsed = parseWav(wav());
  assert.deepEqual(parsed.audio, { encoding: 'linear16', sampleRate: 16000, channels: 1 });
  assert.equal(parsed.data.length, 320);
  for (const mutate of [value => value.write('OggS'), value => value.writeUInt16LE(2, 22), value => value.writeUInt16LE(32, 34), value => value.writeUInt32LE(9999, 40)]) {
    const value = wav(); mutate(value); assert.throws(() => parseWav(value));
  }
});
