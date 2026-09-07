export function encodeMonoPcm(channels: readonly Float32Array[], maxSamples = 4800): ArrayBuffer[] {
  const length = channels[0]?.length;
  if (!Number.isInteger(maxSamples) || maxSamples < 1 || maxSamples > 96000
    || !channels.length || channels.length > 8 || length > 96000
    || channels.some(channel => !(channel instanceof Float32Array) || channel.length !== length)) {
    throw new Error('audio_format_unsupported');
  }
  const frames: ArrayBuffer[] = [];
  for (let offset = 0; offset < length; offset += maxSamples) {
    const count = Math.min(maxSamples, length - offset);
    const buffer = new ArrayBuffer(count * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < count; i++) {
      let sample = 0;
      for (const channel of channels) sample += Number.isFinite(channel[offset + i]) ? channel[offset + i] : 0;
      sample = Math.max(-1, Math.min(1, sample / channels.length));
      view.setInt16(i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
    }
    frames.push(buffer);
  }
  return frames;
}

// Browser resampling belongs to AudioContext, not an ad-hoc JS interpolator. This
// processor runs at context.sampleRate and leaves its output silent (no mic echo).
export const captionWorkletSource = `
class CaptionCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Float32Array(Math.round(sampleRate / 10));
    this.offset = 0;
    this.closed = false;
    this.port.onmessage = ({ data }) => {
      if (data !== 'flush' || this.closed) return;
      this.closed = true;
      if (this.offset) this.port.postMessage(this.samples.slice(0, this.offset));
      this.port.postMessage('flushed');
    };
  }
  process(inputs) {
    if (this.closed) return false;
    const channels = inputs[0];
    if (!channels || !channels.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      let value = 0;
      for (const channel of channels) value += Number.isFinite(channel[i]) ? channel[i] : 0;
      this.samples[this.offset++] = value / channels.length;
      if (this.offset === this.samples.length) {
        this.port.postMessage(this.samples, [this.samples.buffer]);
        this.samples = new Float32Array(Math.round(sampleRate / 10));
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('hum-ahang-capture', CaptionCaptureProcessor);
`;
