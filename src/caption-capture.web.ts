import { captionWorkletSource, encodeMonoPcm } from './caption-pcm.ts';
import { abortable, CaptureError, captureError, type CaptionCapture } from './caption-capture-types.ts';
export type { CaptionCapture, CaptureFormat } from './caption-capture-types.ts';

type Session = {
  controller: AbortController;
  context?: AudioContext;
  stream?: MediaStream;
  source?: MediaStreamAudioSourceNode;
  node?: AudioWorkletNode;
  url?: string;
  started: boolean;
  silent: boolean;
  disposed: boolean;
  stopping?: Promise<void>;
  flushed?: () => void;
  cleanup: (() => void)[];
};

export function createCaptionCapture(): CaptionCapture {
  let session: Session | undefined;

  function finish(current: Session, discard: boolean): Promise<void> {
    if (discard) current.silent = true;
    if (current.stopping) return current.stopping;
    current.controller.abort();
    // Release the physical microphone immediately, before waiting for audio-tail delivery.
    current.stream?.getTracks().forEach(track => track.stop());
    current.cleanup.splice(0).forEach(cleanup => cleanup());
    current.stopping = (async () => {
      try {
        if (current.started && !current.silent && current.node) {
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, 200);
            current.flushed = () => { clearTimeout(timer); resolve(); };
            try { current.node!.port.postMessage('flush'); }
            catch { clearTimeout(timer); reject(new CaptureError('capture_failed')); }
          });
        }
      } finally {
        current.disposed = true;
        current.source?.disconnect();
        if (current.node) {
          current.node.port.onmessage = null;
          current.node.onprocessorerror = null;
          current.node.port.close();
          current.node.disconnect();
        }
        if (current.context) {
          current.context.onstatechange = null;
          if (current.context.state !== 'closed') await current.context.close().catch(() => undefined);
        }
        if (current.url) URL.revokeObjectURL(current.url);
        if (session === current) session = undefined;
      }
    })();
    return current.stopping;
  }

  return {
    async start(onAudio, signal, onError) {
      if (session) throw new CaptureError('capture_busy');
      if (signal.aborted) throw new CaptureError('capture_cancelled');
      if (typeof window === 'undefined' || !window.isSecureContext) throw new CaptureError('insecure_context');
      if (!navigator.mediaDevices?.getUserMedia || !globalThis.AudioContext || !globalThis.AudioWorkletNode) {
        throw new CaptureError('capture_unavailable');
      }
      const current: Session = { controller: new AbortController(), started: false, silent: false, disposed: false, cleanup: [] };
      session = current;
      const abort = () => { void finish(current, true).catch(() => undefined); };
      signal.addEventListener('abort', abort, { once: true });
      current.cleanup.push(() => signal.removeEventListener('abort', abort));
      const fail = (error: CaptureError) => {
        if (current.disposed || current.stopping) return;
        void finish(current, true).catch(() => undefined);
        onError?.(error);
      };
      const check = () => { if (current.controller.signal.aborted) throw new CaptureError('capture_cancelled'); };
      try {
        // Construct/resume before the first await to retain the explicit mic gesture.
        // The browser resamples the microphone to this rate; no guessed device rate.
        const context = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
        current.context = context;
        const resumed = context.resume();
        // Attach a handler immediately, including when the permission dialog stays open.
        void resumed.catch(() => undefined);
        const permission = navigator.mediaDevices.getUserMedia({
          audio: { channelCount: { ideal: 1 }, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        }).then(stream => {
          if (current.controller.signal.aborted) {
            stream.getTracks().forEach(track => track.stop());
            throw new CaptureError('capture_cancelled');
          }
          current.stream = stream;
          return stream;
        });
        const stream = await abortable(permission, current.controller.signal);
        check();
        if (context.sampleRate !== 48000) throw new CaptureError('audio_format_unsupported');
        if (!context.audioWorklet) throw new CaptureError('capture_unavailable');
        for (const track of stream.getAudioTracks()) {
          const ended = () => fail(new CaptureError('microphone_interrupted'));
          track.addEventListener('ended', ended);
          track.addEventListener('mute', ended);
          current.cleanup.push(() => { track.removeEventListener('ended', ended); track.removeEventListener('mute', ended); });
        }
        current.url = URL.createObjectURL(new Blob([captionWorkletSource], { type: 'text/javascript' }));
        await abortable(context.audioWorklet.addModule(current.url), current.controller.signal);
        check();
        URL.revokeObjectURL(current.url); current.url = undefined;
        const node = new AudioWorkletNode(context, 'hum-ahang-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
        current.node = node;
        node.port.onmessage = ({ data }) => {
          if (data === 'flushed') { current.flushed?.(); return; }
          if (current.disposed || current.silent || signal.aborted) return;
          if (!(data instanceof Float32Array)) { fail(new CaptureError('capture_failed')); return; }
          try {
            for (const frame of encodeMonoPcm([data], 4800)) {
              if (current.silent || signal.aborted) break;
              onAudio(frame);
            }
          }
          catch { fail(new CaptureError('capture_failed')); }
        };
        node.onprocessorerror = () => fail(new CaptureError('microphone_interrupted'));
        current.source = context.createMediaStreamSource(stream);
        current.source.connect(node);
        node.connect(context.destination); // Worklet outputs silence; microphone is never played back.
        await abortable(resumed, current.controller.signal);
        check();
        if (context.state !== 'running') throw new CaptureError('capture_failed');
        current.started = true;
        context.onstatechange = () => {
          if (context.state !== 'running') fail(new CaptureError('microphone_interrupted'));
        };
        const hidden = () => { if (document.visibilityState === 'hidden') fail(new CaptureError('microphone_interrupted')); };
        document.addEventListener('visibilitychange', hidden);
        current.cleanup.push(() => document.removeEventListener('visibilitychange', hidden));
        return { encoding: 'linear16', sampleRate: 48000, channels: 1 };
      } catch (error) {
        await finish(current, true);
        throw captureError(error);
      }
    },
    stop() { return session ? finish(session, !session.started) : Promise.resolve(); },
  };
}
