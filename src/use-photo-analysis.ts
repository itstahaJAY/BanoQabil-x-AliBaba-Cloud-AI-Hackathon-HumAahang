import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Speech from 'expo-speech';
import { createCaptionTransport } from './caption-transport';
import { serviceBaseUrl, serviceCredentials } from './service-connection';
import { createVisionClient, idleVision, type VisionLanguage, type VisionPhoto, type VisionTask } from './vision-client';
import { createPhrasePlayback, idlePlayback } from './quick-speak-model';

export function usePhotoAnalysis() {
  const [state, setState] = useState(idleVision), [playback, setPlayback] = useState(idlePlayback);
  const client = useRef<ReturnType<typeof createVisionClient> | null>(null);
  const player = useRef<ReturnType<typeof createPhrasePlayback> | null>(null);
  const cancel = useCallback(() => { client.current?.cancel(); player.current?.stop(); }, []);
  useEffect(() => {
    const analysis = createVisionClient({ baseUrl: serviceBaseUrl, credentials: serviceCredentials,
      fetcher: createCaptionTransport(Platform.OS !== 'web').fetcher, onState: setState });
    const speech = createPhrasePlayback(Speech, setPlayback);
    client.current = analysis; player.current = speech;
    void Speech.getAvailableVoicesAsync().catch(() => {});
    const subscription = AppState.addEventListener('change', status => { if (status !== 'active') cancel(); });
    const hidden = () => { if (document.visibilityState !== 'visible') cancel(); };
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', hidden);
    return () => {
      subscription.remove(); if (Platform.OS === 'web') document.removeEventListener('visibilitychange', hidden);
      analysis.dispose(); speech.dispose(); client.current = null; player.current = null;
    };
  }, [cancel]);
  useFocusEffect(useCallback(() => () => cancel(), [cancel]));
  return { ...state, playback, cancel,
    analyze: useCallback(async (photo: VisionPhoto, language: VisionLanguage, task: VisionTask, autoSpeak: boolean) => {
      player.current?.stop();
      const result = await client.current?.analyze(photo, language, task);
      if (result && client.current?.getState().result === result && autoSpeak) void player.current?.speak(result.description, result.spokenDescription);
    }, []),
    translate: useCallback(async (language: VisionLanguage, autoSpeak: boolean) => {
      player.current?.stop();
      const result = await client.current?.translate(language);
      if (result && client.current?.getState().result === result && autoSpeak) void player.current?.speak(result.description, result.spokenDescription);
    }, []),
    cancelTranslation: useCallback(() => { client.current?.cancelTranslation(); player.current?.stop(); }, []),
    speak: useCallback(() => {
      const current = client.current?.getState();
      if (current?.phase === 'ready' && current.result) void player.current?.speak(current.result.description, current.result.spokenDescription);
    }, []),
    stopSpeaking: useCallback(() => player.current?.stop(), []),
  };
}
