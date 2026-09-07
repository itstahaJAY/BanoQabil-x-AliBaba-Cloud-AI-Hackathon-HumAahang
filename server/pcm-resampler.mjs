const OUTPUT_SAMPLE_RATE = 24000;
const MAX_CHUNK_BYTES = 256 * 1024;
const FILTER_RADIUS = 32;
const FILTER_SIZE = 2 * FILTER_RADIUS + 1;

function filterKernels(inputSampleRate, phases) {
  // Blackman-windowed sinc: leave a transition band below the output Nyquist
  // frequency when downsampling, and suppress imaging when upsampling.
  const cutoff = Math.min(0.47, 0.45 * OUTPUT_SAMPLE_RATE / inputSampleRate);
  return Array.from({ length: phases }, (_, phase) => {
    const coefficients = new Float64Array(FILTER_SIZE);
    let sum = 0;
    for (let tap = 0; tap < FILTER_SIZE; tap++) {
      const distance = tap - FILTER_RADIUS - phase / phases;
      if (Math.abs(distance) >= FILTER_RADIUS) continue;
      const angle = Math.PI * distance / FILTER_RADIUS;
      const window = 0.42 + 0.5 * Math.cos(angle) + 0.08 * Math.cos(2 * angle);
      const sinc = distance === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * distance) / (Math.PI * distance);
      coefficients[tap] = sinc * window;
      sum += coefficients[tap];
    }
    for (let tap = 0; tap < FILTER_SIZE; tap++) coefficients[tap] /= sum;
    return coefficients;
  });
}

/**
 * Stream mono signed PCM16LE at 16000, 24000 or 48000 Hz into 24000 Hz PCM16LE.
 * Each push accepts at most 256 KiB, with complete two-byte samples. Input
 * buffers are copied or consumed immediately and are never retained.
 *
 * Resampling retains a fixed 65-sample ring and waits for 32 input samples of
 * lookahead (2 ms at 16000 Hz; less than 1 ms at 48000 Hz). Endpoint samples
 * extend the signal at startup/flush. Flush produces a total of exactly
 * floor(inputSampleCount * 24000 / inputSampleRate) output samples; it is
 * idempotent and closes the stream. 24000 Hz is an immediate byte-exact copy.
 */
export function createPcmResampler(inputSampleRate) {
  if (![16000, 24000, 48000].includes(inputSampleRate)) {
    throw new RangeError('PCM input sample rate must be 16000, 24000 or 48000 Hz.');
  }

  const phases = inputSampleRate === 16000 ? 3 : 1;
  const kernels = inputSampleRate === OUTPUT_SAMPLE_RATE ? null : filterKernels(inputSampleRate, phases);
  const history = new Int16Array(FILTER_SIZE);
  let inputCount = 0;
  let outputCount = 0;
  let nextInputIndex = 0;
  let phase = 0;
  let firstSample = 0;
  let lastSample = 0;
  let closed = false;

  function emit(output, byteOffset) {
    const coefficients = kernels[phase];
    let value = 0;
    for (let tap = 0; tap < FILTER_SIZE; tap++) {
      const index = nextInputIndex + tap - FILTER_RADIUS;
      const sample = index < 0 ? firstSample : index >= inputCount ? lastSample : history[index % FILTER_SIZE];
      value += sample * coefficients[tap];
    }
    output.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(value))), byteOffset);
    outputCount++;
    // Both conversions advance by two input samples per complete phase cycle:
    // 16000 -> 24000 has three phases; 48000 -> 24000 has one. Keeping integer
    // phase avoids accumulated floating-point drift and chunk boundary resets.
    phase += 2;
    nextInputIndex += Math.floor(phase / phases);
    phase %= phases;
  }

  return {
    push(chunk) {
      if (closed) throw new Error('Cannot push PCM after the resampler has been flushed.');
      if (!Buffer.isBuffer(chunk)) throw new TypeError('PCM chunk must be a Buffer.');
      if (chunk.length % 2 !== 0) throw new RangeError('PCM chunk must contain complete two-byte samples.');
      if (chunk.length > MAX_CHUNK_BYTES) throw new RangeError('PCM chunk exceeds the 256 KiB limit.');
      if (inputSampleRate === OUTPUT_SAMPLE_RATE) return Buffer.from(chunk);

      const totalAfterPush = inputCount + chunk.length / 2;
      const readyCount = Math.max(0, Math.ceil((totalAfterPush - FILTER_RADIUS) * OUTPUT_SAMPLE_RATE / inputSampleRate));
      const output = Buffer.alloc((readyCount - outputCount) * 2);
      let byteOffset = 0;
      for (let offset = 0; offset < chunk.length; offset += 2) {
        lastSample = chunk.readInt16LE(offset);
        if (inputCount === 0) firstSample = lastSample;
        history[inputCount % FILTER_SIZE] = lastSample;
        inputCount++;
        while (nextInputIndex + FILTER_RADIUS < inputCount) {
          emit(output, byteOffset);
          byteOffset += 2;
        }
      }
      return output;
    },
    flush() {
      if (closed) return Buffer.alloc(0);
      closed = true;
      if (inputSampleRate === OUTPUT_SAMPLE_RATE) return Buffer.alloc(0);
      const totalOutputCount = Math.floor(inputCount * OUTPUT_SAMPLE_RATE / inputSampleRate);
      const output = Buffer.alloc((totalOutputCount - outputCount) * 2);
      for (let byteOffset = 0; byteOffset < output.length; byteOffset += 2) emit(output, byteOffset);
      history.fill(0);
      firstSample = lastSample = 0;
      return output;
    },
  };
}
