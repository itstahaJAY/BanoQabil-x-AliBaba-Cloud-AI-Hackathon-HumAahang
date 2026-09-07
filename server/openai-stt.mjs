import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { SpeechError } from './errors.mjs';
import { createPcmResampler } from './pcm-resampler.mjs';

const MAX_ITEMS = 3000, MAX_FRAME = 256 * 1024, MIN_COMMIT_SAMPLES = 2400;
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 256;

// Translate OpenAI's turn lifecycle into the existing caption stream contract.
// Results.start is an ordering key here; it is deliberately not an audio timestamp.
export function connectOpenAI(config, audio, inputLanguage, {
  createSocket = (url, options) => new WebSocket(url, options),
} = {}) {
  if ((inputLanguage !== undefined && !['en', 'ur'].includes(inputLanguage)) ||
      audio?.encoding !== 'linear16' || audio.channels !== 1 || ![16000, 24000, 48000].includes(audio.sampleRate)) {
    throw new SpeechError('invalid_message');
  }
  const adapter = new EventEmitter();
  const transcription = { model: config.openaiSttModel ?? 'gpt-4o-transcribe', ...(inputLanguage ? { language: inputLanguage } : {}) };
  const session = turn_detection => ({ type: 'transcription', audio: { input: {
    format: { type: 'audio/pcm', rate: 24000 }, transcription, turn_detection,
  } } });
  let socket;
  try {
    socket = createSocket('wss://api.openai.com/v1/realtime?intent=transcription', {
      headers: { Authorization: `Bearer ${config.openaiKey}` },
      handshakeTimeout: config.connectTimeoutMs ?? 10000, maxPayload: MAX_FRAME,
      perMessageDeflate: false, followRedirects: false,
    });
  } catch { throw new SpeechError('provider_unavailable'); }
  let resampler = createPcmResampler(audio.sampleRate);
  let phase = 'connecting', terminal = false, ready = false, samplesSent = 0;
  let committedEnd = 0, lastEmitted = null, sequence = 0, stopCommitId;
  let stopCommitSettled = false, stopCommitAcknowledged = false;
  const items = new Map(), nextItem = new Map();
  Object.defineProperties(adapter, {
    readyState: { get: () => terminal ? WebSocket.CLOSED : ready ? socket.readyState : WebSocket.CONNECTING },
    bufferedAmount: { get: () => socket.bufferedAmount },
  });

  function cleanup() {
    items.clear(); nextItem.clear(); resampler = null;
    socket.off('open', onOpen); socket.off('message', onMessage);
    socket.off('error', onError); socket.off('close', onClose);
    // ws can deliver a queued transport error after terminate(). Never expose it.
    socket.on('error', ignoreError);
  }
  function ignoreError() {}
  function fail(code = ready ? 'provider_interrupted' : 'provider_unavailable') {
    if (terminal) return;
    terminal = true; cleanup();
    try { adapter.emit('error', new SpeechError(code)); }
    finally { if (socket.readyState !== WebSocket.CLOSED) socket.terminate(); }
  }
  adapter.terminate = () => {
    if (terminal) return;
    terminal = true; cleanup();
    if (socket.readyState !== WebSocket.CLOSED) socket.terminate();
  };
  function write(frame) {
    if (terminal) return;
    try { socket.send(JSON.stringify(frame), error => { if (error) fail(); }); }
    catch { fail(); }
  }
  function append(pcm) {
    if (!pcm.length || terminal) return;
    samplesSent += pcm.length / 2;
    write({ type: 'input_audio_buffer.append', audio: pcm.toString('base64') });
  }
  function output(frame) { if (!terminal) adapter.emit('message', Buffer.from(JSON.stringify(frame)), false); }
  function finishDrain() {
    if (terminal || phase !== 'draining') return;
    for (const item of items.values()) if (!item.emitted) return;
    phase = 'done'; output({ type: 'Metadata' });
  }
  function flushResults() {
    while (!terminal) {
      const id = nextItem.get(lastEmitted), item = items.get(id);
      if (!item || item.transcript === undefined || item.emitted) break;
      const transcript = item.transcript;
      item.transcript = undefined; item.emitted = true; lastEmitted = id;
      output({ type: 'Results', is_final: true, start: sequence++, duration: 1,
        channel: { alternatives: [{ transcript }] } });
    }
    finishDrain();
  }
  function getItem(id) {
    if (!validId(id)) throw new SpeechError('invalid_result');
    if (!items.has(id)) {
      if (items.size >= MAX_ITEMS) throw new SpeechError('session_limit');
      items.set(id, {});
    }
    return items.get(id);
  }
  function stopAfterBarrier() {
    // The acknowledged VAD disable is a barrier for earlier appends/automatic
    // commits. New commits after this point belong to this explicit final tail.
    const remaining = Math.max(0, samplesSent - committedEnd);
    if (!remaining) { phase = 'draining'; finishDrain(); return; }
    phase = 'committing'; stopCommitId = 'caption-stop-commit';
    if (remaining < MIN_COMMIT_SAMPLES) append(Buffer.alloc((MIN_COMMIT_SAMPLES - remaining) * 2));
    write({ type: 'input_audio_buffer.commit', event_id: stopCommitId });
    // A commit response has no request correlation ID. The following update
    // acknowledgement prevents a late automatic commit from ending stop early.
    write({ type: 'session.update', session: session(null) });
  }
  function settleStopCommit() {
    if (phase === 'committing' && stopCommitSettled && stopCommitAcknowledged) {
      phase = 'draining'; finishDrain();
    }
  }
  adapter.send = (data, options) => {
    if (terminal || phase === 'done') return;
    try {
      if (options?.binary) {
        if (phase !== 'active' || !Buffer.isBuffer(data) || !data.length || data.length > 64 * 1024 || data.length % 2) {
          throw new SpeechError('invalid_message');
        }
        append(resampler.push(data)); return;
      }
      const frame = JSON.parse(String(data));
      if (frame?.type === 'KeepAlive') { if (phase === 'active') socket.ping(); return; }
      if (frame?.type !== 'CloseStream') throw new SpeechError('invalid_message');
      if (phase !== 'active') return;
      append(resampler.flush());
      if (terminal) return;
      if (!samplesSent) { phase = 'draining'; finishDrain(); return; }
      phase = 'barrier';
      write({ type: 'session.update', session: session(null) });
    } catch (error) { fail(error instanceof SpeechError ? error.code : 'invalid_message'); }
  };
  function onOpen() {
    if (terminal) return;
    write({ type: 'session.update', session: session({ type: 'server_vad', threshold: 0.5,
      prefix_padding_ms: 300, silence_duration_ms: 500 }) });
  }
  function onError() { if (phase !== 'done') fail(); }
  function onClose() {
    if (terminal) return;
    // runStream treats close while stopping as successful. Fail first unless
    // every provider result has already reached its draining caption pipeline.
    if (phase !== 'done') { fail(); return; }
    terminal = true; cleanup(); adapter.emit('close');
  }
  function onMessage(data, binary) {
    if (terminal || phase === 'done') return;
    try {
      if (binary || data.length > MAX_FRAME) throw new SpeechError('invalid_result');
      const frame = JSON.parse(data.toString('utf8'));
      if (!frame || typeof frame.type !== 'string') throw new SpeechError('invalid_result');
      if (frame.type === 'session.updated') {
        const input = frame.session?.audio?.input;
        if (!ready && input?.turn_detection?.type === 'server_vad' && input.transcription?.model === transcription.model &&
            input.format?.type === 'audio/pcm' && input.format.rate === 24000) {
          ready = true; phase = 'active'; adapter.emit('open');
        } else if (phase === 'barrier' && input?.turn_detection === null) stopAfterBarrier();
        else if (phase === 'committing' && input?.turn_detection === null) {
          stopCommitAcknowledged = true; settleStopCommit();
        }
      } else if (frame.type === 'input_audio_buffer.speech_stopped') {
        if (!Number.isFinite(frame.audio_end_ms) || frame.audio_end_ms < 0 || frame.audio_end_ms > samplesSent / 24 + 1) {
          throw new SpeechError('invalid_result');
        }
        getItem(frame.item_id).audioEnd = Math.min(samplesSent, Math.round(frame.audio_end_ms * 24));
      } else if (frame.type === 'input_audio_buffer.committed') {
        const item = getItem(frame.item_id), previous = frame.previous_item_id;
        if ((previous !== null && !validId(previous)) || previous === frame.item_id ||
            (item.committed && item.previous !== previous) ||
            (nextItem.has(previous) && nextItem.get(previous) !== frame.item_id)) throw new SpeechError('invalid_result');
        if (!item.committed) {
          item.committed = true; item.previous = previous; nextItem.set(previous, frame.item_id);
          if (item.audioEnd !== undefined) committedEnd = Math.max(committedEnd, item.audioEnd);
          if (phase === 'committing') stopCommitSettled = true;
        }
        flushResults(); settleStopCommit();
      } else if (frame.type === 'conversation.item.input_audio_transcription.completed') {
        if (typeof frame.transcript !== 'string' || frame.transcript.length > 4000 || frame.content_index !== 0) {
          throw new SpeechError('invalid_result');
        }
        const item = getItem(frame.item_id);
        if (item.emitted) return;
        if (item.transcript !== undefined && item.transcript !== frame.transcript) throw new SpeechError('invalid_result');
        item.transcript = frame.transcript; flushResults();
      } else if (frame.type === 'conversation.item.input_audio_transcription.failed') {
        throw new SpeechError('provider_interrupted');
      } else if (frame.type === 'error') {
        // Only the explicitly requested final commit may harmlessly encounter
        // an empty VAD buffer. Never swallow arbitrary provider failures.
        if (phase === 'committing' && frame.error?.code === 'input_audio_buffer_commit_empty' &&
            frame.error.event_id === stopCommitId) {
          stopCommitSettled = true; settleStopCommit();
        } else throw new SpeechError(ready ? 'provider_interrupted' : 'provider_unavailable');
      }
    } catch (error) { fail(error instanceof SpeechError ? error.code : 'invalid_result'); }
  }
  socket.on('open', onOpen); socket.on('message', onMessage);
  socket.on('error', onError); socket.on('close', onClose);
  return adapter;
}
