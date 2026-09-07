export type LanguageFeedbackState = { busy: boolean; error: boolean };
type Voice = { stop(): Promise<void>; speak(text: string, options: { language: string; onDone(): void; onStopped(): void; onError(): void }): void };

export function createInputLanguageFeedback(voice: Voice, onState: (state: LanguageFeedbackState) => void, timeoutMs = 6000) {
  let revision = 0, disposed = false, phase: 'idle' | 'speaking' | 'stopping' = 'idle';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const current = (owner: number) => !disposed && owner === revision;
  const stopVoice = () => { try { return Promise.resolve(voice.stop()); } catch (error) { return Promise.reject(error); } };
  const finish = (owner: number, error: boolean) => {
    if (!current(owner)) return;
    revision++; clearTimeout(timer); phase = 'idle'; onState({ busy: false, error });
  };
  const requestStop = (owner: number, error = false, afterStop?: () => void) => {
    clearTimeout(timer); phase = 'stopping'; onState({ busy: true, error });
    let expired = false;
    timer = setTimeout(() => {
      if (!current(owner)) return;
      expired = true;
      // A timeout cannot prove that device TTS stopped. Keep the mic locked;
      // Stop voice remains available to retry this uncertain hardware boundary.
      onState({ busy: true, error: true });
    }, timeoutMs);
    void stopVoice().then(() => {
      if (!current(owner)) return;
      clearTimeout(timer);
      if (afterStop && !expired) afterStop();
      else finish(owner, error || expired);
    }).catch(() => {
      if (!current(owner)) return;
      clearTimeout(timer); onState({ busy: true, error: true });
    });
  };
  const stop = () => {
    if (disposed) return;
    const owner = ++revision; clearTimeout(timer);
    if (phase === 'idle') { onState({ busy: false, error: false }); return; }
    requestStop(owner);
  };
  return {
    speak(language: 'en' | 'ur') {
      if (disposed) return;
      const owner = ++revision;
      requestStop(owner, false, () => {
        phase = 'speaking';
        timer = setTimeout(() => { if (current(owner)) requestStop(owner, true); }, timeoutMs);
        const completed = () => { if (current(owner) && phase === 'speaking') finish(owner, false); };
        const failed = () => { if (current(owner) && phase === 'speaking') requestStop(owner, true); };
        try {
          voice.speak(language === 'ur' ? 'اردو زبان منتخب ہے۔' : 'English input selected.', {
            language: language === 'ur' ? 'ur-PK' : 'en-US',
            onDone: completed, onStopped: completed, onError: failed,
          });
        } catch { failed(); }
      });
    },
    stop,
    dispose() {
      if (disposed) return;
      disposed = true; revision++; clearTimeout(timer);
      if (phase !== 'idle') void stopVoice().catch(() => {});
      phase = 'idle';
    },
  };
}
