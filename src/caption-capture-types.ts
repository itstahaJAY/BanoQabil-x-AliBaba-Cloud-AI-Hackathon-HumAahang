export type CaptureFormat = { encoding: 'linear16'; sampleRate: number; channels: 1 };
export type CaptureErrorCode = 'capture_busy' | 'capture_cancelled' | 'capture_unavailable'
  | 'native_capture_unavailable' | 'insecure_context' | 'microphone_denied'
  | 'microphone_missing' | 'microphone_interrupted' | 'audio_format_unsupported' | 'capture_failed';

export class CaptureError extends Error {
  code: CaptureErrorCode;
  constructor(code: CaptureErrorCode) { super(code); this.name = 'CaptureError'; this.code = code; }
}

export type CaptionCapture = {
  // Start only on an explicit mic gesture. Frames may arrive before this promise
  // resolves; the consumer owns a bounded startup queue until its socket is ready.
  start(onAudio: (frame: ArrayBuffer) => void, signal: AbortSignal, onError?: (error: CaptureError) => void): Promise<CaptureFormat>;
  // Stops actual microphone capture, flushes its last partial frame, then resolves.
  // Aborting the signal discards the tail instead and ignores every late callback.
  stop(): Promise<void>;
};

export function captureError(error: unknown): CaptureError {
  if (error instanceof CaptureError) return error;
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return new CaptureError('microphone_denied');
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return new CaptureError('microphone_missing');
  if (name === 'AbortError') return new CaptureError('capture_cancelled');
  return new CaptureError('capture_failed');
}

export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cancel = () => reject(new CaptureError('capture_cancelled'));
    if (signal.aborted) cancel();
    else signal.addEventListener('abort', cancel, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
  });
}
