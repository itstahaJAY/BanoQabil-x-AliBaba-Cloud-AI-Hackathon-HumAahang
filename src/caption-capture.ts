import { encodeMonoPcm } from './caption-pcm.ts';
import { abortable, CaptureError, captureError, type CaptionCapture } from './caption-capture-types.ts';
export type { CaptionCapture, CaptureFormat } from './caption-capture-types.ts';

type NativeAudio = Pick<typeof import('react-native-audio-api'), 'AudioRecorder' | 'AudioManager'>;
type Recorder = InstanceType<NativeAudio['AudioRecorder']>;
type Session = {
  controller: AbortController;
  recorder?: Recorder;
  manager?: NativeAudio['AudioManager'];
  nativeStart?: ReturnType<Recorder['start']>;
  stopping?: Promise<void>;
  silent: boolean;
  disposed: boolean;
  lastAudio: number;
  cleanup: (() => void)[];
};

function loadNativeAudio(): NativeAudio {
  // Never eagerly import native code: Expo Go and older builds must still open
  // the app. This module captures PCM; it does not use speech recognition.
  const { TurboModuleRegistry } = require('react-native') as typeof import('react-native');
  if (!TurboModuleRegistry.get('AudioAPIModule')) throw new CaptureError('native_capture_unavailable');
  try { return require('react-native-audio-api') as NativeAudio; }
  catch { throw new CaptureError('native_capture_unavailable'); }
}

export function createCaptionCapture(loadAudio: () => NativeAudio = loadNativeAudio): CaptionCapture {
  let session: Session | undefined;

  function finish(current: Session, discard: boolean): Promise<void> {
    if (discard) current.silent = true;
    if (current.stopping) return current.stopping;
    current.controller.abort();
    current.cleanup.splice(0).forEach(cleanup => cleanup());
    current.stopping = (async () => {
      try {
        if (current.recorder) {
          // Stop now; if native start was pending, stop once again after it settles.
          const stoppingNow = current.recorder.stop();
          void stoppingNow.catch(() => undefined);
          if (current.nativeStart) await current.nativeStart.catch(() => undefined);
          const result = await stoppingNow;
          if (current.recorder.isRecording()) {
            const lateResult = await current.recorder.stop();
            if (lateResult.status !== 'success') throw new CaptureError('capture_failed');
          } else if (result.status !== 'success' && !discard) throw new CaptureError('capture_failed');
        }
      } finally {
        current.disposed = true;
        current.recorder?.clearOnAudioReady();
        current.recorder?.clearOnError();
        current.manager?.observeAudioInterruptions(false);
        await current.manager?.setAudioSessionActivity(false).catch(() => undefined);
        if (session === current) session = undefined;
      }
    })();
    return current.stopping;
  }

  return {
    async start(onAudio, signal, onError) {
      if (session) throw new CaptureError('capture_busy');
      if (signal.aborted) throw new CaptureError('capture_cancelled');
      const current: Session = { controller: new AbortController(), silent: false, disposed: false, lastAudio: Date.now(), cleanup: [] };
      session = current;
      const abort = () => { void finish(current, true).catch(() => undefined); };
      signal.addEventListener('abort', abort, { once: true });
      current.cleanup.push(() => signal.removeEventListener('abort', abort));
      const check = () => { if (current.controller.signal.aborted) throw new CaptureError('capture_cancelled'); };
      const fail = (error: CaptureError) => {
        if (current.stopping || current.disposed) return;
        void finish(current, true).catch(() => undefined);
        onError?.(error);
      };
      try {
        const { AudioManager, AudioRecorder } = loadAudio();
        const permission = await abortable(AudioManager.requestRecordingPermissions(), current.controller.signal);
        check();
        if (permission !== 'Granted') throw new CaptureError('microphone_denied');
        current.manager = AudioManager;
        AudioManager.setAudioSessionOptions({ iosCategory: 'playAndRecord', iosMode: 'default', iosOptions: ['defaultToSpeaker', 'allowBluetoothHFP'] });
        const recorder = new AudioRecorder();
        current.recorder = recorder;
        // File output is never enabled: microphone samples remain memory-only.
        const configured = recorder.onAudioReady({ sampleRate: 16000, bufferLength: 1600, channelCount: 1 }, ({ buffer, numFrames }) => {
          if (current.disposed || current.silent || signal.aborted) return;
          current.lastAudio = Date.now();
          if (buffer.sampleRate !== 16000 || numFrames !== buffer.length || buffer.numberOfChannels < 1 || buffer.numberOfChannels > 8) {
            fail(new CaptureError('audio_format_unsupported')); return;
          }
          try {
            const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
            for (const frame of encodeMonoPcm(channels, 1600)) {
              if (current.silent || signal.aborted) break;
              onAudio(frame);
            }
          } catch { fail(new CaptureError('capture_failed')); }
        });
        if (configured.status !== 'success') throw new CaptureError('audio_format_unsupported');
        recorder.onError(() => fail(new CaptureError('microphone_interrupted')));
        AudioManager.observeAudioInterruptions(true);
        const interruption = AudioManager.addSystemEventListener('interruption', event => {
          if (event.type === 'began') fail(new CaptureError('microphone_interrupted'));
        });
        const route = AudioManager.addSystemEventListener('routeChange', event => {
          if (['OldDeviceUnavailable', 'NewDeviceAvailable', 'ConfigurationChange', 'NoSuitableRouteForCategory'].includes(event.reason)) {
            fail(new CaptureError('microphone_interrupted'));
          }
        });
        current.cleanup.push(() => { interruption.remove(); route.remove(); });
        check();
        current.nativeStart = recorder.start();
        const result = await abortable(current.nativeStart, current.controller.signal);
        check();
        if (result.status !== 'success') throw new CaptureError('capture_failed');
        current.lastAudio = Date.now();
        const watchdog = setInterval(() => {
          if (!recorder.isRecording() || Date.now() - current.lastAudio > 5000) fail(new CaptureError('microphone_interrupted'));
        }, 1000);
        current.cleanup.push(() => clearInterval(watchdog));
        return { encoding: 'linear16', sampleRate: 16000, channels: 1 };
      } catch (error) {
        await finish(current, true).catch(() => undefined);
        throw captureError(error);
      }
    },
    stop() { return session ? finish(session, false) : Promise.resolve(); },
  };
}
