import { SpeechError } from './errors.mjs';

const hasControls = text => /[\p{Cc}\p{Cf}]/u.test(text.replace(/[\u200c\u200d]/gu, ''));
const hasHindi = text => /[\p{Script=Devanagari}\u0964\u0965]/u.test(text);

export function validateBilingualInput(input) {
  const { text, languages = [] } = input ?? {};
  if (typeof text !== 'string' || !text.trim() || text.length > 4000 || hasControls(text) ||
      !Array.isArray(languages) || languages.length > 16 ||
      languages.some(value => typeof value !== 'string' || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/iu.test(value))) {
    throw new SpeechError('invalid_result');
  }
  return { text, languages };
}

// Compare complete numeric tokens, not just concatenated digits (12 must not become 1 2).
// Sentence translation can reorder tokens. This is a mechanical gate, not semantic proof.
function normalizeDigits(text) {
  return text.replace(/[\u0660-\u0669\u06f0-\u06f9\u0966-\u096f]/gu, char => {
    const point = char.codePointAt(0);
    return String(point - (point >= 0x0966 ? 0x0966 : point >= 0x06f0 ? 0x06f0 : 0x0660));
  }).replace(/\u066b/gu, '.').replace(/\u066c/gu, ',').replace(/\u066a/gu, '%').replace(/\u2212/gu, '-');
}

const scriptPeriods = 'قبل دوپہر|بعد دوپہر|سہ پہر|صبح|دوپہر|شام|सुबह|दोपहर|शाम|पूर्वाह्न|अपराह्न';
const periodText = `${scriptPeriods}|a\\.?m\\.?|p\\.?m\\.?`;
const beforePeriod = new RegExp(`(?:^|[^\\p{L}])(${scriptPeriods})\\s*$`, 'iu');
const afterPeriod = new RegExp(`^\\s*(?:(?:بجے|बजे)\\s*)?(${periodText})(?!\\p{L})`, 'iu');
const periodOf = value => /^(?:a|قبل|صبح|सुबह|पूर्वाह्न)/iu.test(value) ? 'am' : 'pm';

function numericTokens(text) {
  const normalized = normalizeDigits(text);
  if (/\p{N}/u.test(normalized.replace(/[0-9]/gu, ''))) throw new SpeechError('conversion_invalid');
  const tokens = [...normalized.matchAll(/[+-]?[0-9]+(?:[.,:/-][0-9]+)*%?/gu)].map(match => {
    const clock = /^(\d{1,2})(?::(\d{2}))?$/u.exec(match[0]);
    if (!clock) return `number:${match[0]}`;
    const before = normalized.slice(0, match.index), after = normalized.slice(match.index + match[0].length);
    const prefix = beforePeriod.exec(before)?.[1], suffix = afterPeriod.exec(after)?.[1];
    if (prefix && suffix && periodOf(prefix) !== periodOf(suffix)) throw new SpeechError('conversion_invalid');
    const period = prefix || suffix;
    const explicitClock = period || /^\s*(?:بجے|बजे|o['’]clock)(?!\p{L})/iu.test(after);
    if (!explicitClock) return `number:${match[0]}`;
    let hour = Number(clock[1]); const minute = Number(clock[2] ?? 0);
    if (minute > 59 || hour > 23 || (period && (hour < 1 || hour > 12))) throw new SpeechError('conversion_invalid');
    if (period) hour = hour % 12 + (periodOf(period) === 'pm' ? 12 : 0);
    return `clock:${period ? 'qualified' : 'unqualified'}:${hour}:${minute}`;
  });
  return JSON.stringify(tokens.sort());
}

// Only Latin clock suffixes are normalized. Names/acronyms remain subject to the
// strict script gate; a free-standing "PM" is not assumed to mean a time.
function normalizeUrduClockSuffixes(text) {
  return text.replace(/(?<![\p{L}\p{N}])([0-9\u0660-\u0669\u06f0-\u06f9]{1,2}(?::[0-9\u0660-\u0669\u06f0-\u06f9]{2})?)\s*(a\.?m\.?|p\.?m\.?)(?!\p{L})/giu,
    (_, clock, period) => `${clock} ${periodOf(period) === 'am' ? 'قبل دوپہر' : 'بعد دوپہر'}`);
}

export function validateBilingualOutputs(source, outputs) {
  if (!outputs || typeof outputs !== 'object' || Array.isArray(outputs) ||
      Object.keys(outputs).sort().join(',') !== 'en,ur') throw new SpeechError('conversion_invalid');
  // Normalization must not erase controls or shrink an originally oversized response.
  if (typeof outputs.ur !== 'string' || outputs.ur.length > 8000 || hasControls(outputs.ur)) throw new SpeechError('conversion_invalid');
  const digits = numericTokens(source);
  const normalized = { ...outputs, ur: typeof outputs.ur === 'string' ? normalizeUrduClockSuffixes(outputs.ur) : outputs.ur };
  for (const [language, text] of Object.entries(normalized)) {
    const expectedScript = language === 'ur' ? /\p{Script=Arabic}/u : /\p{Script=Latin}/u;
    if (typeof text !== 'string' || !text.trim() || text.length > 8000 || hasControls(text) || hasHindi(text) ||
        (/\p{L}/u.test(source) && !/\p{L}/u.test(text)) ||
        [...text].some(char => /\p{L}/u.test(char) && !expectedScript.test(char)) ||
        numericTokens(text) !== digits) throw new SpeechError('conversion_invalid');
  }
  // Fresh, exact shape ensures additional provider metadata never escapes this boundary.
  return { ur: normalized.ur.trim(), en: normalized.en.trim() };
}
