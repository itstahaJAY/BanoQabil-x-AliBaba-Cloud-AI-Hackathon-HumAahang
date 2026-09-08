import type { CaptionCredential } from './caption-client';

export const judgeAccessMessages = {
  missing: 'Open the private demo link provided by the project team. No terminal or pairing code is needed.',
  invalid: 'This demo link is expired or incorrect. Ask the project team for an updated link.',
  disabled: 'Judge access is not available right now. Please contact the project team.',
  busy: 'The demo is busy or its access limit has been reached. Please retry shortly or contact the project team.',
  unavailable: 'Cannot reach the demo service. Check your internet connection and retry.',
  invalidResponse: 'The demo service could not establish a safe connection. Please retry.',
} as const;
export type JudgeAccessState = { phase: 'idle' | 'connecting' | 'connected' | 'error'; message: string };

/** Only the fragment carries access. Scrub it before any request or navigation. */
export function takeJudgeAccessKey(location: { href: string }, replace: (url: string) => void): string | null {
  const url = new URL(location.href), fragment = url.hash;
  url.hash = '';
  // A mistakenly pasted query is never accepted or preserved in history.
  url.searchParams.delete('access');
  replace(url.href);
  return url.protocol === 'https:' && !url.username && !url.password && /^#access=[A-Za-z0-9_-]{43}$/.test(fragment)
    ? fragment.slice('#access='.length) : null;
}
export function createJudgeAccessClient(options: {
  origin: string; credentials: { current: CaptionCredential | null }; fetcher?: typeof fetch;
  onState(state: JudgeAccessState): void; timeoutMs?: number;
}) {
  let disposed = false, active: AbortController | null = null;
  const publish = (phase: JudgeAccessState['phase'], message = '') => { if (!disposed) options.onState({ phase, message }); };
  const connected = () => !!options.credentials.current && options.credentials.current.expiresAt > Date.now();
  async function connect(accessKey: string) {
    if (disposed || active) return;
    // A locally unexpired grant may be invalid after a backend restart. A supplied
    // private link always reauthorizes instead of trusting its local timestamp.
    const originalCredential = options.credentials.current;
    if (!/^[A-Za-z0-9_-]{43}$/.test(accessKey)) { publish('error', judgeAccessMessages.invalid); return; }
    let origin: string;
    try {
      const url = new URL(options.origin);
      if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error();
      origin = url.origin;
    } catch { publish('error', judgeAccessMessages.unavailable); return; }
    const controller = new AbortController(); active = controller;
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10000);
    publish('connecting');
    try {
      const response = await (options.fetcher ?? fetch)(origin + '/v1/demo/clients', {
        method: 'POST', redirect: 'error', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
        signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessKey }),
      });
      if (disposed || controller.signal.aborted) return;
      if (response.status !== 201) {
        publish('error', response.status === 401 ? judgeAccessMessages.invalid : response.status === 404 ? judgeAccessMessages.disabled : response.status === 429 ? judgeAccessMessages.busy : judgeAccessMessages.unavailable);
        return;
      }
      const raw = await response.text();
      if (disposed || controller.signal.aborted) return;
      if (raw.length > 4096) { publish('error', judgeAccessMessages.invalidResponse); return; }
      const grant = JSON.parse(raw);
      const receivedAt = Date.now();
      // Bounded clock-skew allowance; local retention stays at most one hour.
      if (!grant || typeof grant.token !== 'string' || !/^[A-Za-z0-9_-]{20,128}$/.test(grant.token) ||
          !Number.isFinite(grant.expiresAt) || grant.expiresAt <= receivedAt || grant.expiresAt > receivedAt + 3900000) {
        publish('error', judgeAccessMessages.invalidResponse); return;
      }
      // Preserve a grant established (or cleared) by a different flow meanwhile.
      if (options.credentials.current === originalCredential) options.credentials.current = { token: grant.token, expiresAt: Math.min(grant.expiresAt, receivedAt + 3600000) };
      if (connected()) publish('connected'); else publish('error', judgeAccessMessages.unavailable);
    } catch { if (!disposed) publish('error', judgeAccessMessages.unavailable); }
    finally { clearTimeout(timeout); if (active === controller) active = null; }
  }
  return { connect, dispose() { disposed = true; active?.abort(); active = null; } };
}
