import type { CaptionCredential } from './caption-client';

// Shared runtime grant for cloud features. It is never persisted or bundled as a secret.
export const serviceCredentials: { current: CaptionCredential | null } = { current: null };

export function resolveServiceBaseUrl(
  configuredUrl?: string,
  location?: { protocol: string; origin: string; hostname: string },
): string {
  if (configuredUrl) return configuredUrl;
  // Expo development and native clients retain the existing local backend.
  const local = location && (location.hostname === 'localhost' || location.hostname.endsWith('.localhost') ||
    location.hostname === '::1' || location.hostname === '[::1]' || /^127\./.test(location.hostname));
  if (location?.protocol === 'https:' && !local) return location.origin;
  return 'http://127.0.0.1:8787';
}

export const serviceBaseUrl = resolveServiceBaseUrl(
  process.env.EXPO_PUBLIC_STT_URL,
  typeof window !== 'undefined' ? window.location : undefined,
);
