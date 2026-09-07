import type { SpeechStartConfig } from './speech-input';

// Product intent, not a claim that every device can satisfy it. No UI language selector.
export const captionRequest = { languageMode: 'auto', languageHints: ['ur-PK', 'en-US'] } as const;

export function deviceCaptionPlan(platform: string, version: string | number, fallbackLocale: 'en-US' | 'ur-PK') {
  const canRequestSwitching = platform === 'android' && Number(version) >= 34;
  const startConfig: SpeechStartConfig = { lang: fallbackLocale };
  if (canRequestSwitching) {
    startConfig.androidIntentOptions = {
      EXTRA_ENABLE_LANGUAGE_DETECTION: true,
      EXTRA_ENABLE_LANGUAGE_SWITCH: 'balanced',
      EXTRA_LANGUAGE_DETECTION_ALLOWED_LANGUAGES: [...captionRequest.languageHints],
      EXTRA_LANGUAGE_SWITCH_ALLOWED_LANGUAGES: [...captionRequest.languageHints],
    };
  }
  return {
    startConfig,
    // 'und' means unknown, NOT a detected language or certified multilingual output.
    savedLanguage: canRequestSwitching ? 'und' : fallbackLocale,
    detail: canRequestSwitching ? 'Urdu + English · Device auto-switch requested' : fallbackLocale === 'ur-PK' ? 'Urdu · Device fallback' : 'English · Device fallback',
    limitation: canRequestSwitching
      ? 'Language switching depends on your speech service and installed Urdu/English models. Mixed-language accuracy is not guaranteed.'
      : 'Automatic Urdu/English recognition needs a multilingual provider on this platform. This temporary device fallback uses the app language; mixed speech may be missed.',
  };
}

export function transcriptLanguageLabel(language: string) {
  return language === 'ur-PK' ? 'Urdu' : language === 'en-US' ? 'English' : 'Language not verified';
}
