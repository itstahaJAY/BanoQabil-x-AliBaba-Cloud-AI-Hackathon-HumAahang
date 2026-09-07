// The operator smoke tool accepts only short, explicitly supplied PCM WAV files.
export function parseWav(buffer) {
  const invalid = () => { throw new Error('Use a valid mono PCM16 WAV, 16/24/48 kHz, at most 30 seconds.'); };
  if (buffer.length < 44 || buffer.length > 4 * 1024 * 1024 || buffer.toString('ascii', 0, 4) !== 'RIFF' ||
      buffer.toString('ascii', 8, 12) !== 'WAVE' || buffer.readUInt32LE(4) + 8 !== buffer.length) invalid();
  let audio, data;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const tag = buffer.toString('ascii', offset, offset + 4), length = buffer.readUInt32LE(offset + 4);
    const start = offset + 8, end = start + length;
    if (end > buffer.length) invalid();
    if (tag === 'fmt ') {
      if (audio || length < 16 || buffer.readUInt16LE(start) !== 1 || buffer.readUInt16LE(start + 2) !== 1 ||
          buffer.readUInt16LE(start + 14) !== 16 || buffer.readUInt16LE(start + 12) !== 2) invalid();
      const sampleRate = buffer.readUInt32LE(start + 4);
      if (![16000, 24000, 48000].includes(sampleRate) || buffer.readUInt32LE(start + 8) !== sampleRate * 2) invalid();
      audio = { encoding: 'linear16', sampleRate, channels: 1 };
    }
    if (tag === 'data') { if (data) invalid(); data = buffer.subarray(start, end); }
    offset = end + (length % 2);
  }
  if (!audio || !data?.length || data.length % 2 || data.length > audio.sampleRate * 2 * 30) invalid();
  return { audio, data };
}
