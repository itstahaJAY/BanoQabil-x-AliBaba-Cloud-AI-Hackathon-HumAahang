import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest();
export function createClientAccess({ now = Date.now, codeTtlMs = 300000, clientTtlMs = 3600000 } = {}) {
  const clients = new Map(); let codeHash, codeExpiry = 0, attempts = 0;
  const prune = () => { for (const [id, client] of clients) if (client.expiresAt <= now()) clients.delete(id); };
  const key = authorization => hash(authorization ?? '').toString('hex');
  const authorize = (authorization, origin) => {
    prune(); const client = clients.get(key(authorization));
    return !!client && client.origin === origin;
  };
  return {
    newCode() {
      const code = randomBytes(5).toString('hex').toUpperCase();
      codeHash = hash(code); codeExpiry = now() + codeTtlMs; attempts = 0;
      return code;
    },
    pair(code, origin) {
      prune();
      if (!codeHash || now() >= codeExpiry || attempts >= 5 || clients.size >= 10) return null;
      attempts++;
      if (typeof code !== 'string' || code.length > 32 || !timingSafeEqual(hash(code.trim().toUpperCase()), codeHash)) return null;
      codeHash = undefined;
      const token = randomBytes(32).toString('base64url'), expiresAt = now() + clientTtlMs;
      clients.set(key(`Bearer ${token}`), { expiresAt, origin });
      return { token, expiresAt };
    },
    authorize,
    revoke(authorization, origin) { if (authorize(authorization, origin)) clients.delete(key(authorization)); },
    clear() { clients.clear(); codeHash = undefined; },
  };
}
