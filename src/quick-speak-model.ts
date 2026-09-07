export const phraseCategories = ['Favorites', 'Emergency', 'Medical', 'Travel', 'Daily Needs'] as const;
export type PhraseCategory = typeof phraseCategories[number];
export const quickPhrases: { text: string; favorite: boolean; categories: PhraseCategory[] }[] = [
  { text: 'Please help me.', favorite: true, categories: ['Emergency'] },
  { text: 'I need water.', favorite: true, categories: ['Daily Needs'] },
  { text: 'Please call my family.', favorite: true, categories: ['Emergency'] },
  { text: 'I cannot speak.', favorite: false, categories: ['Medical', 'Daily Needs'] },
  { text: 'Please type your response.', favorite: false, categories: ['Daily Needs'] },
  { text: 'I need a doctor.', favorite: false, categories: ['Emergency', 'Medical'] },
  { text: 'Where is the washroom?', favorite: false, categories: ['Travel', 'Daily Needs'] },
  { text: 'Thank you.', favorite: false, categories: ['Daily Needs'] },
];
export function phrasesFor(category: PhraseCategory) {
  return quickPhrases.filter(phrase => category === 'Favorites' ? phrase.favorite : phrase.categories.includes(category));
}
type VoiceCallbacks = { onStart(): void; onDone(): void; onStopped(): void; onError(error?: unknown): void };
type PlaybackEngine = { stop(): Promise<void>; speak(text: string, options: VoiceCallbacks & { language: string }): void };
export type PlaybackState = { phase: 'idle' | 'preparing' | 'speaking'; text: string; error: string };
export const idlePlayback: PlaybackState = { phase: 'idle', text: '', error: '' };

// Ignore late callbacks from an utterance that has been replaced or stopped.
export function createPhrasePlayback(engine: PlaybackEngine, onState: (state: PlaybackState) => void) {
  let token = 0, disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    const current = ++token;
    clearTimeout(timer);
    if (!disposed) onState(idlePlayback);
    void engine.stop().catch(() => {
      if (!disposed && current === token) onState({ ...idlePlayback, error: 'Could not stop the device voice. Check your audio controls.' });
    });
  };
  return {
    async speak(value: string, spokenValue = value) {
      const text = value.trim();
      if (!text || disposed) return;
      const current = ++token;
      clearTimeout(timer);
      const finish = (error = '') => {
        if (disposed || current !== token) return;
        clearTimeout(timer);
        token++;
        onState({ ...idlePlayback, error });
      };
      onState({ phase: 'preparing', text, error: '' });
      timer = setTimeout(() => {
        if (current !== token || disposed) return;
        finish('Voice did not start. Check media volume and installed speech voices, then retry.');
        void engine.stop().catch(() => {});
      }, 12000);
      try {
        await engine.stop();
        if (current !== token || disposed) return;
        engine.speak(spokenValue.trim(), {
          language: /[\u0600-\u06ff]/.test(spokenValue) ? 'ur-PK' : 'en-US',
          onStart: () => {
            if (current !== token || disposed) return;
            clearTimeout(timer);
            onState({ phase: 'speaking', text, error: '' });
          },
          onDone: () => finish(), onStopped: () => finish(),
          onError: () => finish('Could not play this phrase. Check media volume and your device speech settings.'),
        });
      } catch { finish('Voice is unavailable. Check your device speech settings and retry.'); }
    },
    stop,
    dispose() { disposed = true; stop(); },
  };
}
