import { validateCaptionBaseUrl, type CaptionCredential } from './caption-client.ts';

export type VisionLanguage = 'ur' | 'en' | 'roman';
export type VisionTask = 'objects' | 'gesture';
export type VisionPhoto = { base64: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' };
export type VisionResult = { task: VisionTask; description: string; spokenDescription: string; objects: string[]; gesture: string | null; uncertain: boolean };
export type VisionState = { phase: 'idle' | 'analyzing' | 'translating' | 'ready' | 'error'; result: VisionResult | null; language: VisionLanguage | null;
  translatingTo: VisionLanguage | null; message: string; needsConnection: boolean };
export const idleVision: VisionState = { phase: 'idle', result: null, language: null, translatingTo: null, message: '', needsConnection: false };
export const visionMessages = {
  setup_required: 'Connect this device in Speech setup, then return to analyze your photo.',
  unauthorized: 'Your connection expired. Open Speech setup and reconnect.',
  server_unavailable: 'Photo analysis could not connect. Check your internet connection and try again.',
  vision_unavailable: 'Photo analysis is unavailable. Retry shortly or ask the demo operator to check the service.',
  vision_timeout: 'Photo analysis took too long. Try again with a clear photo.',
  vision_invalid: 'The photo result could not be read. Please try again.',
  vision_refused: 'This photo could not be analyzed. Try a different photo.',
  vision_busy: 'Photo analysis is busy. Wait a moment and try again.',
  rate_limited: 'Too many photo requests. Wait a minute before trying again.',
  invalid_image: 'Use a clear JPEG, PNG, or WebP photo under 3 MB.',
  invalid_request: 'The photo could not be sent. Take another photo and retry.',
  body_too_large: 'This photo is too large. Take another photo at a smaller size.',
  translation_failed: 'Translation could not finish. Your original result is unchanged. Please retry.',
} as const;
const safeText = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max &&
  !/[\p{Script=Devanagari}\p{Cc}\p{Cf}]/u.test(value.replace(/[\n\r\t\u200c\u200d]/gu, ''));
const scriptMatches = (value: string, language: VisionLanguage) => /\p{L}/u.test(value) &&
  [...value].every(char => !/\p{L}/u.test(char) || (language === 'ur' ? /\p{Script=Arabic}/u.test(char) : /\p{Script=Latin}/u.test(char)));
export function isVisionResult(value: unknown, task: VisionTask, language: VisionLanguage): value is VisionResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as VisionResult;
  return Object.keys(result).sort().join(',') === 'description,gesture,objects,spokenDescription,task,uncertain' && result.task === task &&
    safeText(result.description, 1800) && scriptMatches(result.description, language) &&
    safeText(result.spokenDescription, 1800) && scriptMatches(result.spokenDescription, language === 'en' ? 'en' : 'ur') &&
    Array.isArray(result.objects) && result.objects.length <= 20 && result.objects.every(item => safeText(item, 100) && scriptMatches(item, language)) &&
    typeof result.uncertain === 'boolean' && (task === 'objects' ? result.gesture === null :
      typeof result.gesture === 'string' && ['open_palm', 'closed_fist', 'thumbs_up', 'thumbs_down', 'victory', 'pointing_up', 'unknown'].includes(result.gesture));
}

export function createVisionClient(options: { baseUrl: string; credentials: { current: CaptionCredential | null }; fetcher?: typeof fetch;
  onState(state: VisionState): void; timeoutMs?: number }) {
  let state: VisionState = idleVision, disposed = false, active: AbortController | null = null;
  let original: { result: VisionResult; language: VisionLanguage } | null = null;
  const translations = new Map<VisionLanguage, VisionResult>();
  const publish = (next: VisionState) => { state = next; if (!disposed) options.onState(state); };
  const cancel = () => { const previous = active; active = null; previous?.abort(); original = null; translations.clear(); publish(idleVision); };
  const cancelTranslation = () => {
    if (state.phase !== 'translating') return;
    const previous = active; active = null; previous?.abort();
    publish({ ...state, phase: 'ready', translatingTo: null, message: '', needsConnection: false });
  };
  return {
    getState: () => state,
    cancel,
    cancelTranslation,
    async analyze(photo: VisionPhoto, language: VisionLanguage, task: VisionTask): Promise<VisionResult | null> {
      if (disposed || active) return null;
      original = null; translations.clear();
      const credential = options.credentials.current;
      if (!credential || credential.expiresAt <= Date.now()) {
        publish({ ...idleVision, phase: 'error', message: visionMessages.setup_required, needsConnection: true }); return null;
      }
      if (!photo.base64 || photo.base64.length > 4 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(photo.mimeType)) {
        publish({ ...idleVision, phase: 'error', message: visionMessages.invalid_image }); return null;
      }
      const controller = new AbortController(); active = controller;
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 30000);
      publish({ ...idleVision, phase: 'analyzing' });
      try {
        const response = await (options.fetcher ?? fetch)(validateCaptionBaseUrl(options.baseUrl) + '/v1/vision/analyze', {
          method: 'POST', redirect: 'error', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credential.token}` },
          body: JSON.stringify({ image: { base64: photo.base64, mimeType: photo.mimeType }, language, task }),
        });
        if (active !== controller || disposed) return null;
        if (response.status === 401) {
          if (options.credentials.current?.token === credential.token) options.credentials.current = null;
          throw { code: 'unauthorized' };
        }
        const raw = await response.text();
        if (active !== controller || disposed) return null;
        if (controller.signal.aborted) throw new Error();
        if (raw.length > 32768) throw { code: 'vision_invalid' };
        let result: unknown;
        try { result = JSON.parse(raw); } catch { throw { code: 'vision_invalid' }; }
        if (!response.ok) {
          const code = result && typeof result === 'object' ? (result as { code?: string }).code : undefined;
          throw { code: code && Object.hasOwn(visionMessages, code) ? code : response.status === 429 ? 'vision_busy' : 'server_unavailable' };
        }
        if (!isVisionResult(result, task, language)) throw { code: 'vision_invalid' };
        original = { result, language }; translations.set(language, result);
        publish({ ...idleVision, phase: 'ready', result, language });
        return result;
      } catch (error) {
        if (active !== controller || disposed) return null;
        const code = timedOut ? 'vision_timeout' : (error as { code?: string })?.code;
        publish({ ...idleVision, phase: 'error', message: code && Object.hasOwn(visionMessages, code) ? visionMessages[code as keyof typeof visionMessages] : visionMessages.server_unavailable,
          needsConnection: code === 'unauthorized' });
        return null;
      } finally { clearTimeout(timer); if (active === controller) active = null; }
    },
    async translate(language: VisionLanguage): Promise<VisionResult | null> {
      if (disposed || active || !state.result || !original || original.result.task !== 'objects') return null;
      const cached = translations.get(language);
      if (cached) {
        publish({ ...idleVision, phase: 'ready', result: cached, language }); return cached;
      }
      const previous = state, source = original;
      const credential = options.credentials.current;
      if (!credential || credential.expiresAt <= Date.now()) {
        publish({ ...previous, phase: 'ready', translatingTo: null, message: visionMessages.setup_required, needsConnection: true }); return null;
      }
      const controller = new AbortController(); active = controller;
      const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30000);
      publish({ ...previous, phase: 'translating', translatingTo: language, message: '', needsConnection: false });
      try {
        const response = await (options.fetcher ?? fetch)(validateCaptionBaseUrl(options.baseUrl) + '/v1/vision/translate', {
          method: 'POST', redirect: 'error', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credential.token}` },
          body: JSON.stringify({ result: source.result, sourceLanguage: source.language, language }),
        });
        if (active !== controller || disposed) return null;
        if (response.status === 401) {
          if (options.credentials.current?.token === credential.token) options.credentials.current = null;
          throw { code: 'unauthorized' };
        }
        const raw = await response.text();
        if (active !== controller || disposed) return null;
        if (controller.signal.aborted || !response.ok || raw.length > 32768) throw new Error();
        const result: unknown = JSON.parse(raw);
        if (!isVisionResult(result, 'objects', language) || result.objects.length !== source.result.objects.length ||
          result.uncertain !== source.result.uncertain || result.gesture !== source.result.gesture) throw new Error();
        translations.set(language, result);
        publish({ ...idleVision, phase: 'ready', result, language });
        return result;
      } catch (error) {
        if (active !== controller || disposed) return null;
        const unauthorized = (error as { code?: string })?.code === 'unauthorized';
        publish({ ...previous, phase: 'ready', translatingTo: null,
          message: unauthorized ? visionMessages.unauthorized : visionMessages.translation_failed, needsConnection: unauthorized });
        return null;
      } finally { clearTimeout(timer); if (active === controller) active = null; }
    },
    dispose() { disposed = true; cancel(); },
  };
}
