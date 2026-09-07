import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { createCaptionClient, type CaptionInputLanguage, type CaptionState } from './caption-client';
import { createCaptionCapture } from './caption-capture';
import { createCaptionTransport } from './caption-transport';
import { serviceCredentials as credentials, serviceBaseUrl as baseUrl } from './service-connection';

export function useLiveCaptions() {
  const mounted = useRef(false);
  const client = useRef<ReturnType<typeof createCaptionClient> | null>(null);
  const [state, setState] = useState<CaptionState>({ phase: 'idle', connected: false, segments: [], pending: 0, message: '', inputLanguage: 'ur', inputLanguageLocked: false });
  const getClient = useCallback(() => {
    if (!client.current) client.current = createCaptionClient({ baseUrl, credentials,
      createCapture: createCaptionCapture, ...createCaptionTransport(Platform.OS !== 'web'),
      onState: next => { if (mounted.current) setState(next); } });
    return client.current;
  }, []);
  useEffect(() => {
    mounted.current = true;
    const active = getClient(); setState(active.getState());
    const subscription = AppState.addEventListener('change', value => { if (value !== 'active') active.cancel(); });
    const hidden = () => { if (document.visibilityState !== 'visible') active.cancel(); };
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', hidden);
    return () => {
      mounted.current = false; subscription.remove();
      if (Platform.OS === 'web') document.removeEventListener('visibilitychange', hidden);
      active.dispose(); if (client.current === active) client.current = null;
    };
  }, [getClient]);
  useFocusEffect(useCallback(() => {
    // Settings may pair another controller against the shared runtime grant.
    // Refresh access on return without replacing this screen's caption session.
    if (mounted.current) setState(getClient().getState());
    return () => { client.current?.cancel(); };
  }, [getClient]));
  return { ...state, busy: ['connecting', 'listening', 'stopping'].includes(state.phase),
    setInputLanguage: useCallback((language: CaptionInputLanguage) => getClient().setInputLanguage(language), [getClient]),
    start: useCallback(() => getClient().start(), [getClient]),
    stop: useCallback(() => getClient().stop(), [getClient]),
    cancel: useCallback(() => getClient().cancel(), [getClient]),
    connect: useCallback((code: string) => getClient().connect(code), [getClient]),
    disconnect: useCallback(() => getClient().disconnect(), [getClient]),
  };
}
