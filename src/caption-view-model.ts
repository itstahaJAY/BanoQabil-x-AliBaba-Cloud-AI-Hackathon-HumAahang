import type { SavedTranscript } from './transcript-storage.ts';

export type CaptionLanguage = 'ur' | 'en';
export type CaptionPair = { id: string; outputs: Record<CaptionLanguage, string> };
export type ManualCaption = { text: string; language: CaptionLanguage };

/** Output selection is presentation-only; this module has no transport or capture dependency. */
export function selectedCaptionText(segments: readonly CaptionPair[], language: CaptionLanguage): string {
  return segments.map(segment => segment.outputs[language]).join('\n');
}

export function captionSaveRecord(id: string, text: string, language: CaptionLanguage, manual: boolean, savedAt: string): SavedTranscript {
  // Typed text may use any language; do not certify it as the language of the copied caption.
  return { id: `${id}-${manual ? 'manual' : 'captions'}-${language}`, text: text.trim(), language: manual ? 'manual' : language === 'ur' ? 'ur-PK' : 'en-US', savedAt };
}
