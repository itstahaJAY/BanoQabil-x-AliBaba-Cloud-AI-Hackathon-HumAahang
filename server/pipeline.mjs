import { normalizeTranscript } from './normalize.mjs';
import { SpeechError, errorCode, errorStage } from './errors.mjs';
import { validateBilingualInput, validateBilingualOutputs } from './bilingual.mjs';

export class CaptionPipeline {
  constructor({ emit, convert, mode = 'source', processBilingual, maxPending = 12 }) {
    if (!['source', 'bilingual'].includes(mode) || (mode === 'bilingual' && typeof processBilingual !== 'function')) {
      throw new SpeechError('invalid_message');
    }
    this.emit = emit; this.convert = convert; this.maxPending = maxPending;
    this.mode = mode; this.processBilingual = processBilingual;
    this.controller = new AbortController(); this.queue = Promise.resolve();
    this.preview = Promise.resolve(); this.pending = 0; this.sequence = 0;
    this.revision = 0; this.lastFinalStart = -1; this.seen = new Set();
  }

  accept(frame) {
    if (this.controller.signal.aborted || frame.type !== 'Results') return;
    const alternative = frame.channel?.alternatives?.[0];
    if (!alternative || typeof alternative.transcript !== 'string' ||
        alternative.transcript.length > 4000 || typeof frame.is_final !== 'boolean' ||
        !Number.isFinite(frame.start) || frame.start < 0 || !Number.isFinite(frame.duration) || frame.duration < 0 ||
        (frame.channel_index && frame.channel_index[0] !== 0)) throw new SpeechError('invalid_result');
    const text = alternative.transcript;
    if (!text.trim()) return;
    const languages = [...new Set([
      ...(Array.isArray(alternative.languages) ? alternative.languages : []),
      ...(Array.isArray(alternative.words) ? alternative.words.map(word => word.language).filter(Boolean) : []),
    ])];
    const segment = { text, languages };
    const revision = ++this.revision;
    if (!frame.is_final) {
      if (this.mode === 'bilingual') return; // Neither source language belongs in translated output previews.
      if (this.pending || frame.start <= this.lastFinalStart) return;
      // Reuse exactly the final-output gate, but never call a converter on unstable interim text.
      this.preview = normalizeTranscript(segment, () => { throw new SpeechError('conversion_unavailable'); }, this.controller.signal)
        .then(result => {
          if (!this.controller.signal.aborted && revision === this.revision && !this.pending) {
            this.emit({ type: 'preview', sequence: this.sequence + 1, text: result.text });
          }
        }).catch(() => {}); // Uncertain/Hindi interim content is intentionally withheld.
      return;
    }
    const key = `${frame.start}:${frame.duration}`;
    if (this.seen.has(key) || frame.start < this.lastFinalStart) return;
    if (this.pending >= this.maxPending) throw new SpeechError('queue_full');
    if (this.sequence >= 3000) throw new SpeechError('session_limit');
    this.seen.add(key); this.lastFinalStart = frame.start;
    const sequence = ++this.sequence; this.pending++;
    this.emit({ type: 'processing', sequence }); // Clears/replaces the preview; no raw text.
    this.queue = this.queue.then(async () => {
      if (this.controller.signal.aborted) return;
      let stage = this.mode === 'bilingual' ? 'recognition_input' : undefined;
      try {
        if (this.mode === 'bilingual') {
          const input = validateBilingualInput(segment);
          stage = 'translation_request';
          const result = await this.processBilingual(input, this.controller.signal);
          stage = 'translation_validation';
          const outputs = validateBilingualOutputs(text, result);
          if (!this.controller.signal.aborted) this.emit({ type: 'caption_final', sequence, outputs });
        } else {
          const result = await normalizeTranscript(segment, this.convert, this.controller.signal);
          if (!this.controller.signal.aborted) this.emit({ type: 'final', sequence, ...result });
        }
      } catch (error) {
        if (!this.controller.signal.aborted) this.emit({ type: 'segment_error', sequence, code: errorCode(error, 'conversion_unavailable'),
          ...(stage ? { stage: errorStage(error, stage) } : {}) });
      }
    }).finally(() => { this.pending--; });
  }

  async drain() { await Promise.all([this.queue, this.preview]); }
  cancel() { this.controller.abort(); this.revision++; }
}
