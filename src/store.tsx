import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Persona } from './types';
import { createProfileStorage, defaultProfile, type EmergencyNumbers, type PassportSettings, type Prefs, type ProfileData } from './profile-data';
type State = ProfileData & {
  ready: boolean; storageError: string; reloadProfile(): void;
  setLanguage(v: string): void; saveLanguage(v: string): Promise<void>; setPersona(v: Persona): void; setPrefs(v: Prefs): void;
  savePassport(v: PassportSettings): Promise<void>; saveEmergency(v: EmergencyNumbers): Promise<void>; finish(): void; reset(): void;
};
const Ctx = createContext<State | null>(null);
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState(defaultProfile);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const repository = useMemo(() => createProfileStorage(AsyncStorage), []);
  const mounted = useRef(false);
  const reloadProfile = useCallback(() => {
    setReady(false);
    repository.load().then(value => {
      if (mounted.current) { setData(value); setStorageError(''); }
    }).catch(() => {
      if (mounted.current) setStorageError('Your saved profile could not be loaded. Retry before editing; existing data has not been changed.');
    }).finally(() => { if (mounted.current) setReady(true); });
  }, [repository]);
  useEffect(() => { mounted.current = true; reloadProfile(); return () => { mounted.current = false; }; }, [reloadProfile]);
  const change = useCallback((patch: Partial<ProfileData>) => {
    if (!ready || storageError) return;
    // Existing onboarding/toggle controls retain immediate feedback. Never write on hydration.
    setData(previous => ({ ...previous, ...patch }));
    repository.update(patch).catch(() => {
      if (mounted.current) setStorageError('A profile change could not be saved. Reload saved details and try again.');
    });
  }, [ready, repository, storageError]);
  const savePassport = useCallback(async (value: PassportSettings) => {
    if (!ready || storageError) throw new Error('Reload your saved profile before editing.');
    // Other screens receive the passport only after durable storage succeeds.
    const saved = await repository.update(value);
    if (mounted.current) setData(previous => ({ ...previous, passport: saved.passport, persona: saved.persona, language: saved.language }));
  }, [ready, repository, storageError]);
  const value = useMemo<State>(() => ({
    ...data, ready, storageError, reloadProfile, savePassport,
    saveLanguage: async language => {
      if (!ready || storageError) throw new Error('Reload your saved profile before editing.');
      const saved = await repository.update({ language });
      if (mounted.current) setData(previous => ({ ...previous, language: saved.language }));
    },
    saveEmergency: async emergency => {
      if (!ready || storageError) throw new Error('Reload your saved profile before editing.');
      const saved = await repository.update({ emergency });
      if (mounted.current) setData(previous => ({ ...previous, emergency: saved.emergency }));
    },
    setLanguage: language => change({ language }), setPersona: persona => change({ persona }),
    setPrefs: prefs => change({ prefs }), finish: () => change({ onboarded: true }), reset: () => change({ onboarded: false }),
  }), [data, ready, storageError, reloadProfile, savePassport, change, repository]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useApp = () => { const value = useContext(Ctx); if (!value) throw new Error('AppProvider missing'); return value; };
