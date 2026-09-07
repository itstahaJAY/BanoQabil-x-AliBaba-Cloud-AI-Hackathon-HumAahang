import type { Sender } from './conversation-model';
import type { ExpoSpeechRecognitionModuleType, ExpoSpeechRecognitionOptions } from 'expo-speech-recognition/build/ExpoSpeechRecognitionModule.types';

export type RecognitionEngine = Pick<ExpoSpeechRecognitionModuleType, 'requestPermissionsAsync' | 'isRecognitionAvailable' | 'start' | 'stop' | 'abort' | 'addListener'>;
export type SpeechStartConfig = Pick<ExpoSpeechRecognitionOptions, 'lang' | 'androidIntentOptions'>;
export type SpeechInputState = { owner: Sender | null; phase: 'idle' | 'permission' | 'listening' | 'stopping' | 'reconnecting'; preview: string; message: string; failure: boolean };
export const idleSpeech: SpeechInputState = { owner: null, phase: 'idle', preview: '', message: '', failure: false };

export function createSpeechInput(engine: RecognitionEngine | null, options: {
  unavailable?: string;
  permissionRequired: boolean;
  continuous?: boolean;
  onState(state: SpeechInputState): void;
  onDraft(owner: Sender, text: string): void;
}) {
  type Session = { owner: Sender; draft: string; preview: string; final: string; started: boolean; cancelled: boolean; error: string; round: number; acknowledged: boolean; heard: boolean; emptyEnds: number };
  let session: Session | null = null;
  let disposed = false;
  let phase: SpeechInputState['phase'] = 'idle';
  let subscriptions: { remove(): void }[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    clearTimeout(timer);
    subscriptions.forEach(subscription => subscription.remove());
    subscriptions = [];
  };
  const publish = (current: Session, next: SpeechInputState['phase'], message: string) => {
    phase = next;
    if (!disposed) options.onState({ owner: current.owner, phase, preview: current.preview, message, failure: !!current.error });
  };
  const finish = (current: Session) => {
    if (session !== current) return;
    clear();
    session = null;
    const text = (current.final || current.preview).trim();
    if (!disposed && !current.cancelled && !current.error && text) {
      options.onDraft(current.owner, [current.draft.trimEnd(), text].filter(Boolean).join(' '));
    }
    current.preview = '';
    publish(current, 'idle', current.error || (options.continuous ? 'Captions paused. Tap Resume to continue.' : current.cancelled ? 'Voice input cancelled. Your draft is unchanged.' : text ? 'Speech added to your draft. Review it, then Send.' : 'No speech heard. Try again or type your message.'));
  };
  const abort = () => { try { engine?.abort(); } catch { /* Cleanup must still release our session. */ } };
  const stop = () => {
    const current = session;
    if (!current || phase === 'stopping') return;
    if (phase === 'reconnecting' && !current.started) { finish(current); return; }
    if (!current.started) { cancel(); return; }
    publish(current, 'stopping', 'Finishing speech…');
    clearTimeout(timer);
    timer = setTimeout(() => {
      finish(current);
      abort();
    }, 5000);
    try { engine?.stop(); } catch { finish(current); abort(); }
  };
  const cancel = () => {
    const current = session;
    if (!current) return;
    current.cancelled = true;
    if (!current.started) { finish(current); return; }
    // Keep ownership until the device's end event, so a late result cannot reach a new person.
    publish(current, 'stopping', 'Cancelling voice input…');
    clearTimeout(timer);
    timer = setTimeout(() => finish(current), 2000);
    abort();
  };
  return {
    async start(owner: Sender, draft: string, language: string | SpeechStartConfig) {
      if (session || disposed) return;
      const current: Session = { owner, draft, preview: '', final: '', started: false, cancelled: false, error: '', round: 0, acknowledged: false, heard: false, emptyEnds: 0 };
      session = current;
      publish(current, 'permission', 'Allow microphone access to start speaking.');
      try {
        if (options.unavailable || !engine?.isRecognitionAvailable()) {
          current.error = options.unavailable || 'Speech recognition is unavailable here. Use a supported browser or type your message.';
          finish(current);
          return;
        }
        if (options.permissionRequired) {
          const permission = await engine.requestPermissionsAsync();
          if (session !== current || disposed) return;
          if (!permission.granted) {
            current.error = speechError('not-allowed');
            finish(current);
            return;
          }
        }
        const begin = () => {
          if (session !== current || disposed || current.cancelled) return;
          const round = ++current.round;
          const isCurrent = () => session === current && current.round === round;
          current.acknowledged = false;
          current.heard = false;
          subscriptions = [
            engine.addListener('start', () => {
              if (!isCurrent() || current.cancelled || current.error || phase === 'stopping') return;
              current.acknowledged = true;
              if (options.continuous) clearTimeout(timer);
              publish(current, 'listening', 'Listening. Speak a sentence, then pause or tap Stop.');
            }),
            engine.addListener('result', event => {
              if (!isCurrent() || current.cancelled || current.error) return;
              const text = event.results[0]?.transcript.trim() || '';
              if (text) { current.heard = true; current.emptyEnds = 0; }
              if (options.continuous && event.isFinal) {
                if (text) options.onDraft(current.owner, text);
                current.preview = '';
                current.final = '';
                publish(current, phase, 'Listening for the next sentence…');
                return;
              }
              if (event.isFinal) current.final = text;
              current.preview = text;
              publish(current, phase, phase === 'stopping' ? 'Finishing speech…' : 'Listening. Speak a sentence, then pause or tap Stop.');
            }),
            engine.addListener('error', event => {
              if (!isCurrent()) return;
              if (!current.cancelled) current.error = speechError(event.error);
              publish(current, 'stopping', current.error || 'Cancelling voice input…');
              clearTimeout(timer);
              timer = setTimeout(() => { finish(current); abort(); }, 2000);
            }),
            engine.addListener('end', () => {
              if (!isCurrent()) return;
              current.started = false;
              // A device sentence/session boundary is not a user-requested pause.
              if (options.continuous && phase !== 'stopping' && !current.cancelled && !current.error) {
                if (!current.acknowledged) {
                  current.error = 'The microphone did not start. Check microphone permission and your device speech service, then retry.';
                } else if (!current.heard && ++current.emptyEnds > 2) {
                  current.error = 'No speech heard after several attempts. Check your microphone, then tap Retry.';
                } else {
                  const text = (current.final || current.preview).trim();
                  if (text) options.onDraft(current.owner, text);
                  current.preview = '';
                  current.final = '';
                  ++current.round; // Ignore callbacks queued by the previous device session.
                  clear();
                  publish(current, 'reconnecting', 'Reconnecting to device speech…');
                  timer = setTimeout(begin, 350);
                  return;
                }
              }
              finish(current);
            }),
          ];
          current.started = true;
          timer = options.continuous ? setTimeout(() => {
            if (!isCurrent()) return;
            current.error = 'The microphone did not start. Check microphone permission and your device speech service, then retry.';
            finish(current);
            abort();
          }, 15000) : setTimeout(stop, 30000);
          try {
            const config = typeof language === 'string' ? { lang: language } : language;
            engine.start({ ...config, interimResults: true, continuous: !!options.continuous, maxAlternatives: 1 });
          } catch {
            current.error = 'Could not start speech input. Check microphone access and your device speech service, or type instead.';
            finish(current);
            abort();
          }
        };
        begin();
      } catch {
        current.error = 'Could not start speech input. Check microphone access and your device speech service, or type instead.';
        finish(current);
        if (current.started) abort();
      }
    },
    stop,
    cancel,
    clearFeedback() {
      if (!session && !disposed) options.onState(idleSpeech);
    },
    dispose() {
      disposed = true;
      const started = session?.started;
      session = null;
      clear();
      if (started) abort();
    },
  };
}

function speechError(code: string): string {
  switch (code) {
    case 'not-allowed': return 'Microphone or speech permission was denied. Allow it in browser/app settings, then try again. You can still type.';
    case 'network': return 'The device speech service could not connect. Check your connection or type your message.';
    case 'audio-capture': return 'Microphone unavailable. Check your microphone and close other recording apps, then retry.';
    case 'language-not-supported': return 'This speech language is unavailable on your device. Install the speech language in device settings or use keyboard dictation.';
    case 'no-speech': case 'speech-timeout': return 'No speech heard. Try again or type your message.';
    case 'aborted': case 'interrupted': return 'Voice input was interrupted. Your existing draft is unchanged. Tap Mic to retry.';
    default: return 'Speech recognition is unavailable or busy. Try again, or type your message.';
  }
}
