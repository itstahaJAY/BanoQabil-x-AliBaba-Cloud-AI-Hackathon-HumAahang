import type { CaptionCapture, CaptureFormat } from './caption-capture-types.ts';

export type CaptionSegment = { id: string; outputs: { ur: string; en: string } };
export type CaptionInputLanguage = 'en' | 'ur';
export type CaptionState = { phase: 'idle' | 'connecting' | 'listening' | 'stopping' | 'error';
  connected: boolean; segments: CaptionSegment[]; pending: number; message: string;
  inputLanguage: CaptionInputLanguage; inputLanguageLocked: boolean };
export type CaptionCredential = { token: string; expiresAt: number };
type Socket = Pick<WebSocket, 'readyState' | 'bufferedAmount' | 'onmessage' | 'onerror' | 'onclose' | 'send' | 'close'>;

export const captionClientMessages = {
  pairing_failed: 'Connection code expired or incorrect. Get a new code from the backend terminal.',
  unauthorized: 'Your speech connection expired. Connect again with a new code.',
  server_unavailable: 'Cannot reach the speech server. Check that the backend is running.',
  setup_required: 'Connect to the speech server before starting the microphone.',
  invalid_response: 'The speech server returned an unexpected result. Your completed captions are unchanged.',
  segment_failed: 'One speech segment could not be translated. Completed captions are unchanged; please repeat that part.',
  recognition_input: 'Speech recognition returned an unusable segment. Completed captions are unchanged; please repeat that part.',
  translation_request: 'The translation service could not finish one segment. Completed captions are unchanged; please repeat that part.',
  translation_validation: 'One translation failed the language or number safety checks. Completed captions are unchanged; please repeat that part.',
  recording_failed: 'Microphone capture was interrupted. Check permissions and tap the microphone to retry.',
  native_capture_unavailable: 'Live audio needs a new Hum Ahang development build. Expo Go does not include this recorder.',
  insecure_context: 'Open this page on localhost or HTTPS to use the microphone.',
  microphone_denied: 'Microphone permission was denied. Allow it in device or browser settings and retry.',
  microphone_missing: 'No microphone was found. Connect a microphone and retry.',
  audio_format_unsupported: 'This microphone could not provide a supported audio format.',
  provider_unavailable: 'Speech service could not start. Check backend provider configuration and try again.',
  provider_interrupted: 'Speech connection was interrupted. Completed captions are unchanged. Tap the microphone to retry.',
  session_limit: 'The listening session reached its limit. Tap the microphone to continue.',
  rate_limited: 'The speech server is busy. Wait a moment and try again.',
  startup_timeout: 'Microphone or speech connection took too long to start. Please retry.',
  drain_timeout: 'Finishing speech took too long. Completed captions are unchanged.',
} as const;
function messageFor(error: unknown, fallback: keyof typeof captionClientMessages): string {
  const code = typeof error === 'object' && error ? (error as { code?: string }).code : undefined;
  return code && Object.hasOwn(captionClientMessages, code)
    ? captionClientMessages[code as keyof typeof captionClientMessages] : captionClientMessages[fallback];
}
const safeErrorStage = (stage: unknown) => stage === 'recognition_input' || stage === 'translation_request' || stage === 'translation_validation' ? stage : undefined;
const problem = (code: string) => Object.assign(new Error(code), { code });
export function validateCaptionBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw problem('server_unavailable');
  }
  return url.origin;
}
function outputsAreSafe(outputs: unknown): outputs is CaptionSegment['outputs'] {
  if (!outputs || typeof outputs !== 'object' || Object.keys(outputs).sort().join(',') !== 'en,ur') return false;
  return Object.entries(outputs).every(([lang, text]) => typeof text === 'string' && text.trim() && text.length <= 8000 &&
    !/[\p{Script=Devanagari}\u0964\u0965\p{Cc}]/u.test(text) &&
    !/\p{Cf}/u.test(text.replace(/[\u200c\u200d]/gu, '')) &&
    ![...text].some(char => /\p{L}/u.test(char) && !(lang === 'ur' ? /\p{Script=Arabic}/u : /\p{Script=Latin}/u).test(char)));
}

export function createCaptionClient(options: {
  baseUrl: string; createCapture(): CaptionCapture; createSocket(url: string, protocols: string[]): Socket;
  fetcher?: typeof fetch; onState(state: CaptionState): void;
  credentials?: { current: CaptionCredential | null }; startupMs?: number; drainMs?: number; sessionMs?: number;
}) {
  const fetcher = options.fetcher ?? fetch;
  const credentials = options.credentials ?? { current: null };
  let disposed = false, pairing: AbortController | null = null, releasing = 0;
  let state: CaptionState = { phase: 'idle', connected: false, segments: [], pending: 0, message: '', inputLanguage: 'ur', inputLanguageLocked: false };
  const connected = () => !!credentials.current && credentials.current.expiresAt > Date.now();
  const inputLanguageLocked = () => !!run || !!pairing || releasing > 0 || state.pending > 0 || !['idle', 'error'].includes(state.phase);
  const publish = (patch: Partial<CaptionState> = {}) => {
    state = { ...state, ...patch, connected: connected() };
    state.inputLanguageLocked = inputLanguageLocked();
    if (!disposed) options.onState(state);
  };
  type Run = { capture: CaptionCapture; abort: AbortController; socket?: Socket; timer?: ReturnType<typeof setTimeout>;
    queue: ArrayBuffer[]; bytes: number; format?: CaptureFormat; sessionId?: string; pending: Set<number>;
    last: number; stopping: boolean; inputLanguage: CaptionInputLanguage; release?: Promise<void> };
  let run: Run | null = null;
  // Ending a socket is not proof that native microphone teardown has finished.
  // Keep input selection/start locked and share one teardown across stop/cancel.
  const releaseCapture = (active: Run) => {
    if (!active.release) {
      releasing++;
      let stopped: Promise<void>;
      try { stopped = active.capture.stop(); } catch (error) { stopped = Promise.reject(error); }
      active.release = stopped.finally(() => { releasing--; publish(); });
    }
    return active.release;
  };
  const end = (phase: CaptionState['phase'], message = '') => {
    const previous = run; run = null;
    if (previous) {
      clearTimeout(previous.timer); previous.abort.abort(); previous.queue = [];
      void releaseCapture(previous).catch(() => {}); previous.socket?.close();
    }
    publish({ phase, pending: 0, message });
  };
  const fail = (error: unknown, fallback: keyof typeof captionClientMessages = 'server_unavailable') => end('error', messageFor(error, fallback));
  async function post(path: string, body: unknown, signal: AbortSignal, authenticated: boolean) {
    const base = validateCaptionBaseUrl(options.baseUrl);
    const requestToken = authenticated ? credentials.current?.token : undefined;
    const response = await fetcher(base + path, { method: 'POST', redirect: 'error', signal,
      headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${requestToken}` } : {}) },
      body: JSON.stringify(body) });
    if (signal.aborted) throw problem('capture_cancelled');
    if (!response.ok) {
      if (authenticated && response.status === 401 && credentials.current?.token === requestToken) credentials.current = null;
      throw problem(response.status === 429 ? 'rate_limited' : response.status === 401 ? (authenticated ? 'unauthorized' : 'pairing_failed') : 'server_unavailable');
    }
    const raw = await response.text();
    if (signal.aborted) throw problem('capture_cancelled');
    if (raw.length > 4096) throw problem('invalid_response');
    return JSON.parse(raw);
  }

  async function connect(code: string) {
    if (disposed || pairing || run || releasing) return;
    if (!/^[a-f0-9]{10}$/i.test(code.trim())) { publish({ message: captionClientMessages.pairing_failed }); return; }
    const controller = new AbortController(); pairing = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    publish({ message: '' });
    try {
      const grant = await post('/v1/stt/clients', { code: code.trim() }, controller.signal, false);
      if (disposed || controller.signal.aborted || pairing !== controller) return;
      const receivedAt = Date.now();
      // Allow five minutes of clock skew, without extending the local session or
      // the server-enforced grant lifetime. Some phones/PCs run behind Railway.
      if (typeof grant.token !== 'string' || !/^[a-zA-Z0-9_-]{20,128}$/.test(grant.token) ||
          !Number.isFinite(grant.expiresAt) || grant.expiresAt <= receivedAt || grant.expiresAt > receivedAt + 3900000) throw problem('invalid_response');
      credentials.current = { token: grant.token, expiresAt: Math.min(grant.expiresAt, receivedAt + 3600000) }; publish({ message: '', phase: 'idle' });
    } catch (error) { if (!disposed && pairing === controller) publish({ message: messageFor(error, 'server_unavailable') }); }
    finally { clearTimeout(timeout); if (pairing === controller) { pairing = null; publish(); } }
  }

  function setInputLanguage(language: CaptionInputLanguage) {
    if (disposed || inputLanguageLocked() || (language !== 'en' && language !== 'ur')) return false;
    publish({ inputLanguage: language });
    return true;
  }

  async function start() {
    if (disposed || run || pairing || releasing) return;
    if (!connected()) { credentials.current = null; publish({ phase: 'error', message: captionClientMessages.setup_required }); return; }
    const active: Run = { capture: options.createCapture(), abort: new AbortController(), queue: [], bytes: 0, pending: new Set(), last: 0, stopping: false, inputLanguage: state.inputLanguage };
    run = active; publish({ phase: 'connecting', message: '', pending: 0 });
    active.timer = setTimeout(() => { if (run === active) fail(problem('startup_timeout')); }, options.startupMs ?? 15000);
    const sendAudio = (frame: ArrayBuffer) => {
      if (run !== active || active.abort.signal.aborted) return;
      if (!(frame instanceof ArrayBuffer) || !frame.byteLength || frame.byteLength > 65536 || frame.byteLength % 2) { fail(problem('audio_format_unsupported')); return; }
      if (!active.sessionId) {
        active.bytes += frame.byteLength;
        if (active.bytes > (active.format?.sampleRate ?? 48000) * 4) { fail(problem('startup_timeout')); return; }
        active.queue.push(frame); return;
      }
      if (active.socket?.readyState !== 1 || active.socket.bufferedAmount > 256 * 1024) { fail(problem('provider_interrupted')); return; }
      active.socket.send(frame);
    };
    try {
      // Capture starts on the user's gesture (required by browser audio activation).
      active.format = await active.capture.start(sendAudio, active.abort.signal, error => { if (run === active) fail(error, 'recording_failed'); });
      if (run !== active) return;
      if (active.bytes > active.format.sampleRate * 4) throw problem('startup_timeout');
      const session = await post('/v1/stt/sessions', { audio: active.format, mode: 'bilingual', inputLanguage: active.inputLanguage }, active.abort.signal, true);
      if (run !== active) return;
      if (session.path !== '/v1/stt/stream' || !Array.isArray(session.protocols) || session.protocols.length !== 2 ||
          session.protocols[0] !== 'humahang.stt.v1' || !/^ticket\.[a-zA-Z0-9_-]{1,100}$/.test(session.protocols[1])) throw problem('invalid_response');
      const ws = options.createSocket(validateCaptionBaseUrl(options.baseUrl).replace(/^http/, 'ws') + session.path, session.protocols);
      active.socket = ws;
      ws.onerror = () => { if (run === active) fail(problem('provider_interrupted')); };
      ws.onclose = () => { if (run === active) fail(problem('provider_interrupted')); };
      ws.onmessage = event => {
        if (run !== active) return;
        try {
          if (typeof event.data !== 'string' || event.data.length > 64 * 1024) throw problem('invalid_response');
          const item = JSON.parse(event.data);
          if (!item || typeof item.sessionId !== 'string' || item.sessionId.length > 80) throw problem('invalid_response');
          if (active.sessionId && item.sessionId !== active.sessionId) return;
          if (item.type === 'error') {
            const stage = safeErrorStage(item.stage);
            fail(stage ? { code: stage } : item, 'provider_interrupted'); return;
          }
          if (item.type === 'ready') {
            if (active.sessionId) return;
            active.sessionId = item.sessionId; clearTimeout(active.timer); publish({ phase: 'listening' });
            // RN does not expose a working bufferedAmount. Bound capture locally
            // too, including a transport that stalls without sending close/error.
            active.timer = setTimeout(() => { if (run === active) fail(problem('session_limit')); }, options.sessionMs ?? 180000);
            for (const frame of active.queue) sendAudio(frame);
            active.queue = []; active.bytes = 0; return;
          }
          if (!active.sessionId) throw problem('invalid_response');
          if (item.type === 'closed') { end('idle', state.message); return; }
          if (item.type === 'stopping') return;
          const sequence = item.sequence;
          if (!Number.isInteger(sequence) || sequence < 1 || sequence > 3000) throw problem('invalid_response');
          if (sequence <= active.last) return;
          if (item.type === 'processing') {
            active.pending.add(sequence);
            if (active.pending.size > 12) throw problem('invalid_response');
            publish({ pending: active.pending.size }); return;
          }
          if (!active.pending.has(sequence) || sequence !== Math.min(...active.pending)) throw problem('invalid_response');
          if (item.type === 'caption_final') {
            if (!outputsAreSafe(item.outputs) || state.segments.length >= 3000) throw problem('invalid_response');
            state = { ...state, segments: [...state.segments, { id: `${active.sessionId}:${sequence}`, outputs: { ur: item.outputs.ur, en: item.outputs.en } }] };
          } else if (item.type === 'segment_error') {
            state = { ...state, message: captionClientMessages[safeErrorStage(item.stage) ?? 'segment_failed'] };
          }
          else throw problem('invalid_response');
          active.last = sequence; active.pending.delete(sequence); publish({ pending: active.pending.size });
        } catch (error) { fail(error, 'invalid_response'); }
      };
    } catch (error) { if (run === active) fail(error, 'recording_failed'); }
  }

  async function stop() {
    const active = run; if (!active || active.stopping) return;
    if (!active.sessionId) { end('idle'); return; }
    active.stopping = true; publish({ phase: 'stopping' });
    clearTimeout(active.timer);
    active.timer = setTimeout(() => { if (run === active) fail(problem('drain_timeout')); }, options.drainMs ?? 25000);
    try {
      // Adapter flushes its final small PCM packet before the ordered stop control.
      await releaseCapture(active);
      if (run !== active) return;
      if (active.socket?.readyState !== 1) throw problem('provider_interrupted');
      active.socket.send('{"type":"stop"}');
    } catch (error) { if (run === active) fail(error, 'recording_failed'); }
  }
  function cancel() { pairing?.abort(); pairing = null; end('idle'); }
  function disconnect() {
    cancel(); const credential = credentials.current; credentials.current = null; publish();
    if (credential) void fetcher(validateCaptionBaseUrl(options.baseUrl) + '/v1/stt/clients', { method: 'DELETE',
      headers: { Authorization: `Bearer ${credential.token}` }, signal: AbortSignal.timeout(5000), redirect: 'error' }).catch(() => {});
  }
  return { getState: () => ({ ...state, connected: connected(), inputLanguageLocked: inputLanguageLocked() }), setInputLanguage, connect, start, stop, cancel, disconnect,
    dispose() { disposed = true; cancel(); } };
}
