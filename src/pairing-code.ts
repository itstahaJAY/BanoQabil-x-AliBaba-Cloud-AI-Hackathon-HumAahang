/** Presentation separators only; never extract a substring from a URL or secret. */
export function normalizePairingCode(value: string): string | null {
  if (value.length > 128 || !/^[a-f0-9\s-]+$/i.test(value)) return null;
  const normalized = value.replace(/[\s-]/g, '').toUpperCase();
  return /^[A-F0-9]{10}$/.test(normalized) ? normalized : null;
}
