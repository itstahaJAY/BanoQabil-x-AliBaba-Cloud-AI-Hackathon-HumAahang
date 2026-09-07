import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { createSpeechInput, idleSpeech, type SpeechStartConfig } from './speech-input';
import { permissionRequired, speechEngine, speechUnavailable } from './speech-engine';
import type { Sender } from './conversation-model';

export function useSpeechInput(onDraft: (owner: Sender, text: string) => void, continuous = false) {
  const [state, setState] = useState(idleSpeech);
  const draftCallback = useRef(onDraft);
  draftCallback.current = onDraft;
  const controller = useRef<ReturnType<typeof createSpeechInput> | null>(null);
  useEffect(() => {
    const input = createSpeechInput(speechEngine, {
      permissionRequired, continuous, unavailable: speechUnavailable(), onState: setState,
      onDraft: (owner, text) => draftCallback.current(owner, text),
    });
    controller.current = input;
    const subscription = AppState.addEventListener('change', status => {
      if (status === 'background') input.cancel();
    });
    return () => { subscription.remove(); input.dispose(); controller.current = null; };
  }, [continuous]);
  useFocusEffect(useCallback(() => () => controller.current?.cancel(), []));
  const start = useCallback((owner: Sender, draft: string, locale: string | SpeechStartConfig) => { void controller.current?.start(owner, draft, locale); }, []);
  const stop = useCallback(() => controller.current?.stop(), []);
  const cancel = useCallback(() => controller.current?.cancel(), []);
  const clearFeedback = useCallback(() => controller.current?.clearFeedback(), []);
  return {
    ...state,
    unavailable: speechUnavailable() || (!speechEngine?.isRecognitionAvailable() ? 'Speech recognition is unavailable here. Use a supported browser or type your message.' : undefined),
    busy: state.phase !== 'idle',
    start, stop, cancel, clearFeedback,
  };
}
