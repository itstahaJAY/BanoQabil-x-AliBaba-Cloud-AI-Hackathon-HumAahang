import WebSocket from 'ws';
import { CaptionPipeline } from './pipeline.mjs';
import { errorCode, SpeechError } from './errors.mjs';

export function runStream(client, audio, { connect, convert, processBilingual, mode, inputLanguage, config, sessionId, onDone }) {
  let upstream, finished = false, stopping = false, providerEnded = false, ready = false;
  let audioBytes = 0, messages = 0, windowStart = Date.now(), windowCount = 0;
  let startedAt = Date.now(), drainTimer, connectTimer, keepAlive, deadline;
  const send = event => {
    if (finished || client.readyState !== WebSocket.OPEN) return;
    if (client.bufferedAmount > 256 * 1024) { finish('slow_client'); return; }
    client.send(JSON.stringify({ ...event, sessionId }));
  };
  const pipeline = new CaptionPipeline({ emit: send, convert, mode, processBilingual });

  function finish(code, reason = 'stopped', stage) {
    if (finished) return;
    finished = true; pipeline.cancel();
    // Mark terminal before writing/closing: socket callbacks can be synchronous.
    // A backed-up socket must not recursively call finish through send().
    if (client.readyState === WebSocket.OPEN && client.bufferedAmount <= 256 * 1024) {
      client.send(JSON.stringify({ ...(code ? { type: 'error', code, ...(stage ? { stage } : {}) } : { type: 'closed', reason }), sessionId }));
    }
    for (const timer of [drainTimer, connectTimer, keepAlive, deadline]) clearTimeout(timer);
    if (upstream && upstream.readyState !== WebSocket.CLOSED) upstream.terminate();
    if (client.readyState === WebSocket.OPEN) client.close(code ? 1011 : 1000, code ? 'speech_error' : reason);
    // Do not let an unresponsive peer retain a TCP socket indefinitely.
    if (client.readyState !== WebSocket.CLOSED) {
      const closeTimer = setTimeout(() => client.terminate(), 1000); closeTimer.unref();
      client.once('close', () => clearTimeout(closeTimer));
    }
    onDone();
  }

  async function completeDrain() {
    if (finished || providerEnded) return;
    providerEnded = true;
    await pipeline.drain();
    if (!finished) finish(null, 'stopped');
  }

  function stop() {
    if (stopping || finished) return;
    stopping = true; send({ type: 'stopping' }); clearTimeout(keepAlive);
    if (finished) return;
    drainTimer = setTimeout(() => finish('drain_timeout'), config.drainTimeoutMs ?? 20000);
    if (!ready) { finish(null, 'stopped'); return; }
    upstream.send(JSON.stringify({ type: 'CloseStream' }));
  }

  client.on('close', () => finish(null, 'cancelled'));
  client.on('error', () => finish('invalid_message'));
  client.on('message', (data, binary) => {
    if (finished) return;
    if (Date.now() - windowStart > 1000) { windowStart = Date.now(); windowCount = 0; }
    if (++windowCount > 120 || ++messages > 30000) { finish('audio_limit'); return; }
    if (!binary) {
      try {
        if (data.length > 128) throw new SpeechError('invalid_message');
        const message = JSON.parse(data.toString('utf8'));
        if (!message || Object.keys(message).length !== 1) throw new SpeechError('invalid_message');
        if (message.type === 'stop') stop();
        else if (message.type === 'cancel') finish(null, 'cancelled');
        else throw new SpeechError('invalid_message');
      } catch { finish('invalid_message'); }
      return;
    }
    if (!ready || stopping) { finish('invalid_message'); return; }
    audioBytes += data.length;
    const bytesPerSecond = audio.sampleRate * 2;
    if (!data.length || data.length > 64 * 1024 || data.length % 2 ||
        audioBytes > bytesPerSecond * ((Date.now() - startedAt) / 1000 + 2) ||
        upstream.bufferedAmount > 256 * 1024) { finish('audio_limit'); return; }
    upstream.send(data, { binary: true });
  });

  try { upstream = connect(audio, inputLanguage); } catch { finish('provider_unavailable'); return () => finish(null, 'cancelled'); }
  upstream.on('open', () => {
    if (finished) { upstream.terminate(); return; }
    ready = true; startedAt = Date.now(); clearTimeout(connectTimer);
    send({ type: 'ready' });
    if (finished) return;
    keepAlive = setInterval(() => {
      if (!finished && !stopping && upstream.readyState === WebSocket.OPEN) upstream.send(JSON.stringify({ type: 'KeepAlive' }));
    }, 4000);
  });
  upstream.on('message', (data, binary) => {
    if (finished || providerEnded) return;
    try {
      if (binary || data.length > 256 * 1024) throw new SpeechError('invalid_result');
      const frame = JSON.parse(data.toString('utf8'));
      if (!frame || typeof frame.type !== 'string') throw new SpeechError('invalid_result');
      if (frame.type === 'Error') throw new SpeechError('provider_interrupted');
      if (frame.type === 'Results') pipeline.accept(frame);
      // CloseStream completes after final Results followed by Metadata/close.
      if (frame.type === 'Metadata' && stopping) void completeDrain();
    } catch (error) { finish(errorCode(error, 'invalid_result'), 'stopped', 'recognition_input'); }
  });
  upstream.on('error', () => finish(ready ? 'provider_interrupted' : 'provider_unavailable'));
  upstream.on('close', () => {
    if (finished) return;
    if (stopping) void completeDrain();
    else finish(ready ? 'provider_interrupted' : 'provider_unavailable');
  });
  connectTimer = setTimeout(() => finish('provider_unavailable'), config.connectTimeoutMs ?? 10000);
  deadline = setTimeout(() => finish('session_limit'), config.sessionDurationMs ?? 180000);
  return () => finish(null, 'cancelled');
}
