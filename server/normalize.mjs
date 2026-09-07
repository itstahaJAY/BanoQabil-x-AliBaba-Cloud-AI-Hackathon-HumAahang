import { SpeechError } from './errors.mjs';

const hindi = /\p{Script=Devanagari}/u;
const arabic = /\p{Script=Arabic}/u;
const latin = /\p{Script=Latin}/u;
const letter = /\p{L}/u;
const forbidden = /[\p{Cc}\p{Cf}]/u;
// ZWNJ/ZWJ are legitimate in Urdu; bidi overrides and control characters are not.
const withoutJoiners = text => text.replace(/[\u200c\u200d]/gu, '');

export async function normalizeTranscript({ text, languages = [] }, convert, signal) {
  signal?.throwIfAborted();
  if (typeof text !== 'string' || !text.trim() || text.length > 4000 ||
      forbidden.test(withoutJoiners(text)) || !Array.isArray(languages) ||
      languages.some(value => typeof value !== 'string')) throw new SpeechError('invalid_result');

  const labels = languages.map(value => value.toLowerCase().split('-')[0]);
  if (labels.some(value => !['en', 'hi', 'ur'].includes(value))) throw new SpeechError('unsupported_language');
  for (const char of text) {
    if (letter.test(char) && !hindi.test(char) && !arabic.test(char) && !latin.test(char)) {
      throw new SpeechError('unsupported_language');
    }
  }

  const hasHindi = hindi.test(text) || /[\u0964\u0965]/u.test(text);
  if (!hasHindi) {
    // Latin without affirmative English metadata may be Roman Hindi/Urdu: do not guess.
    if (latin.test(text) && !labels.includes('en')) throw new SpeechError('unsupported_language');
    return { text, converted: false };
  }
  if (latin.test(text) && !labels.includes('en')) throw new SpeechError('unsupported_language');

  const spans = [];
  for (const match of text.matchAll(/\p{L}[\p{L}\p{M}\u200c\u200d]*/gu)) {
    if (!hindi.test(match[0])) continue;
    if ([...match[0]].some(char => letter.test(char) && !hindi.test(char))) {
      throw new SpeechError('unsupported_language');
    }
    const previous = spans.at(-1);
    if (previous && /^ +$/u.test(text.slice(previous.end, match.index))) {
      previous.end = match.index + match[0].length;
      previous.text = text.slice(previous.start, previous.end);
    } else {
      spans.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
    }
  }
  if (spans.length > 64) throw new SpeechError('invalid_result');
  let translations = [];
  if (spans.length) translations = await convert({ text, spans: spans.map(span => span.text) }, signal);
  signal?.throwIfAborted();
  if (!Array.isArray(translations) || translations.length !== spans.length || translations.some(value =>
    typeof value !== 'string' || !arabic.test(value) || value.length > 4000 ||
    forbidden.test(withoutJoiners(value)) || /[\p{N}]/u.test(value) ||
    [...value].some(char => letter.test(char) && !arabic.test(char)) || hindi.test(value)
  )) throw new SpeechError('conversion_invalid');

  let result = '', cursor = 0;
  spans.forEach((span, index) => {
    result += text.slice(cursor, span.start) + translations[index].trim();
    cursor = span.end;
  });
  result += text.slice(cursor);
  // Preserve numeric values, but never leak Devanagari digits/punctuation either.
  result = result.replace(/[\u0966-\u096f]/gu, char => String(char.charCodeAt(0) - 0x0966))
    .replace(/[\u0964\u0965]/gu, '۔');
  if (hindi.test(result) || result.length > 8000) throw new SpeechError('conversion_invalid');
  return { text: result, converted: true };
}
