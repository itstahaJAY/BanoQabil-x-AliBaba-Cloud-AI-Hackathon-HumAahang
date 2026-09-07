import type { Persona } from './types';
import { translate, languageChoices } from './locale.ts';

export type Prefs = { largeText: boolean; highContrast: boolean; voiceGuidance: boolean; haptics: boolean; autoSpeak: boolean; gestures: boolean };
export type PassportDetails = {
  name: string;
  instructions: string;
  contactName: string;
  contactPhone: string;
  showName: boolean;
  showContact: boolean;
};
export type ProfileData = { onboarded: boolean; language: string; persona: Persona; prefs: Prefs; passport: PassportDetails; emergency: EmergencyNumbers };
export type PassportSettings = Pick<ProfileData, 'passport' | 'persona' | 'language'>;
export type EmergencyNumbers = { area: string; medicalPhone: string; policePhone: string };
export type CallKind = 'family' | 'medical' | 'police';
export type CallTarget = { kind: CallKind; name: string; number: string; area: string };
export const emptyEmergencyNumbers: EmergencyNumbers = { area: '', medicalPhone: '', policePhone: '' };
function phoneDigits(value: string, minimum: number): string | null {
  const raw = value.trim();
  const number = raw.replace(/[ ()-]/g, '');
  if (raw.length > 30 || !/^\+?[\d ()-]+$/.test(raw) || !/^\+?\d{2,15}$/.test(number) || number.replace('+', '').length < minimum) return null;
  return number;
}
export function validateEmergencyNumbers(value: EmergencyNumbers): Partial<Record<keyof EmergencyNumbers, string>> {
  const errors: Partial<Record<keyof EmergencyNumbers, string>> = {};
  if (value.area.trim().length > 80 || ((value.medicalPhone.trim() || value.policePhone.trim()) && !value.area.trim())) errors.area = 'Enter the service area or city (up to 80 characters).';
  for (const key of ['medicalPhone', 'policePhone'] as const) if (value[key].trim() && !phoneDigits(value[key], 2)) errors[key] = 'Enter a phone number with 2–15 digits, without extensions or dial codes.';
  return errors;
}
export function emergencyCallTarget(kind: CallKind, profile: ProfileData): CallTarget | null {
  const number = phoneDigits(kind === 'family' ? profile.passport.contactPhone : kind === 'medical' ? profile.emergency.medicalPhone : profile.emergency.policePhone, kind === 'family' ? 7 : 2);
  if (!number || (kind !== 'family' && !profile.emergency.area.trim())) return null;
  return { kind, number, name: kind === 'family' ? profile.passport.contactName : '', area: kind === 'family' ? '' : profile.emergency.area };
}
export const emptyPassport: PassportDetails = { name: '', instructions: '', contactName: '', contactPhone: '', showName: true, showContact: false };
export const defaultProfile: ProfileData = {
  onboarded: false, language: 'English', persona: 'deaf', passport: emptyPassport, emergency: emptyEmergencyNumbers,
  prefs: { largeText: false, highContrast: false, voiceGuidance: true, haptics: true, autoSpeak: true, gestures: true },
};
export const passportLanguages = languageChoices;
export const communicationInstructions: Record<Persona, string> = {
  deaf: 'I am deaf or hard of hearing. Please face me and use clear written messages.',
  mute: 'I have difficulty speaking. Please read my typed messages and give me time to respond.',
  blind: 'I am blind or have low vision. Please introduce yourself and speak clearly.',
  hearing: 'Please ask how I would like to communicate and give me time to respond.',
};
export type PassportErrors = Partial<Record<keyof PassportDetails | 'persona' | 'language', string>>;

export function validatePassportSettings(value: PassportSettings): PassportErrors {
  const errors: PassportErrors = {};
  const p = value.passport;
  if (p.name.trim().length > 80) errors.name = 'Use 80 characters or fewer for your name.';
  if (p.instructions.trim().length > 600) errors.instructions = 'Use 600 characters or fewer for your instructions.';
  if (p.contactName.trim().length > 80) errors.contactName = 'Use 80 characters or fewer for the contact name.';
  const phone = p.contactPhone.trim();
  const digits = phone.replace(/\D/g, '');
  if (phone && (!/^\+?[\d ()-]+$/.test(phone) || digits.length < 7 || digits.length > 15 || phone.length > 30)) {
    errors.contactPhone = 'Enter a phone number with 7–15 digits; spaces, +, brackets and hyphens are allowed.';
  } else if (!phone && (p.contactName.trim() || p.showContact)) {
    errors.contactPhone = 'Add a phone number, or clear the contact name and turn off Show emergency contact.';
  }
  if (!Object.hasOwn(communicationInstructions, value.persona)) errors.persona = 'Choose a communication profile.';
  if (!passportLanguages.some(language => language === value.language)) errors.language = 'Choose a preferred language.';
  return errors;
}
export function normalizePassportSettings(value: PassportSettings): PassportSettings {
  return { ...value, passport: { ...value.passport, name: value.passport.name.trim(), instructions: value.passport.instructions.trim(), contactName: value.passport.contactName.trim(), contactPhone: value.passport.contactPhone.trim() } };
}
export function passportPresentation(value: PassportSettings, personaTitle: string) {
  const p = value.passport;
  return {
    name: p.showName ? p.name : '',
    instructions: p.instructions || translate(value.language, communicationInstructions[value.persona]),
    contact: p.showContact && p.contactPhone ? [p.contactName, p.contactPhone].filter(Boolean).join(' · ') : '',
    personaTitle: translate(value.language, personaTitle), language: translate(value.language, value.language),
  };
}
export function passportShareText(value: PassportSettings, personaTitle: string) {
  const card = passportPresentation(value, personaTitle);
  const t = (text: string) => translate(value.language, text);
  return [t('Hum Ahang · Communication passport'), card.name, card.personaTitle, card.instructions, `${t('Preferred language')}: ${card.language}`, card.contact && `${t('Emergency contact')}: ${card.contact}`].filter(Boolean).join('\n\n');
}
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown> };
const unreadable = 'Your saved profile could not be read. Existing data has not been changed.';
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(unreadable);
  return value as Record<string, unknown>;
}
function decodeProfile(raw: string | null): ProfileData {
  const x = raw === null ? {} : record(JSON.parse(raw));
  if (x.schemaVersion !== undefined && x.schemaVersion !== 1) throw new Error(unreadable);
  const prefs = { ...defaultProfile.prefs, ...(x.prefs === undefined ? {} : record(x.prefs)) };
  const passport = { ...emptyPassport, ...(x.passport === undefined ? {} : record(x.passport)) };
  const emergency = { ...emptyEmergencyNumbers, ...(x.emergency === undefined ? {} : record(x.emergency)) };
  for (const key of Object.keys(defaultProfile.prefs) as (keyof Prefs)[]) if (typeof prefs[key] !== 'boolean') throw new Error(unreadable);
  for (const key of ['name', 'instructions', 'contactName', 'contactPhone'] as const) if (typeof passport[key] !== 'string') throw new Error(unreadable);
  for (const key of ['showName', 'showContact'] as const) if (typeof passport[key] !== 'boolean') throw new Error(unreadable);
  for (const key of ['area', 'medicalPhone', 'policePhone'] as const) if (typeof emergency[key] !== 'string') throw new Error(unreadable);
  if (Object.keys(validateEmergencyNumbers(emergency)).length) throw new Error(unreadable);
  const result = { ...defaultProfile, ...x, prefs, passport, emergency } as ProfileData;
  if (typeof result.onboarded !== 'boolean' || typeof result.language !== 'string' || typeof result.persona !== 'string') throw new Error(unreadable);
  if (result.language === 'Urdu') result.language = 'اردو';
  if (Object.keys(validatePassportSettings(result)).length) throw new Error(unreadable);
  return result;
}

export function createProfileStorage(storage: Storage) {
  const load = async () => {
    const raw = await storage.getItem('humahang');
    try { return decodeProfile(raw); } catch { throw new Error(unreadable); }
  };
  let pending = Promise.resolve();
  return {
    load,
    update(patch: Partial<ProfileData>): Promise<ProfileData> {
      // Serialize read/merge/write so adjacent preference changes cannot overwrite a saved passport.
      const write = pending.then(async () => {
        const next = { ...await load(), ...patch };
        const errors = { ...validatePassportSettings(next), ...validateEmergencyNumbers(next.emergency) };
        if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
        const normalized = { ...next, ...normalizePassportSettings({ passport: next.passport, language: next.language, persona: next.persona }), emergency: { area: next.emergency.area.trim(), medicalPhone: next.emergency.medicalPhone.trim(), policePhone: next.emergency.policePhone.trim() } };
        await storage.setItem('humahang', JSON.stringify({ ...normalized, schemaVersion: 1 }));
        return normalized;
      });
      pending = write.then(() => undefined, () => undefined);
      return write;
    },
  };
}
