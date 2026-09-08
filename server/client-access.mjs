import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest();
export function createClientAccess({ now = Date.now, codeTtlMs = 300000, clientTtlMs = 3600000, judge } = {}) {
  const clients = new Map(); let codeHash, codeExpiry = 0, attempts = 0;
  const judgeHash = judge?.accessKey ? hash(judge.accessKey) : undefined;
  const judgeLimits = { grants: 30, speech: 30, vision: 60, ...judge?.limits };
  const judgeUsage = { grants: 0, speech: 0, vision: 0 };
  const judgeAvailable = origin => !!judgeHash && origin === judge.origin && !!origin && judge.expiresAt > now();
  const prune = () => { for (const [id, client] of clients) if (client.expiresAt <= now()) clients.delete(id); };
  const key = authorization => hash(authorization ?? '').toString('hex');
  const authorize = (authorization, origin) => {
    prune(); const client = clients.get(key(authorization));
    return !!client && client.origin === origin && (client.kind !== 'judge' || judgeAvailable(origin));
  };
  const issue = (origin, kind, expiresAt) => {
    const token = randomBytes(32).toString('base64url');
    clients.set(key(`Bearer ${token}`), { expiresAt, origin, kind });
    return { token, expiresAt };
  };
  return {
    newCode() {
      const code = randomBytes(5).toString('hex').toUpperCase();
      codeHash = hash(code); codeExpiry = now() + codeTtlMs; attempts = 0;
      return code;
    },
    pair(code, origin) {
      prune();
      if (!codeHash || now() >= codeExpiry || attempts >= 5 ||
          [...clients.values()].filter(client => client.kind === 'paired').length >= 10) return null;
      attempts++;
      if (typeof code !== 'string' || code.length > 32 || !timingSafeEqual(hash(code.trim().toUpperCase()), codeHash)) return null;
      codeHash = undefined;
      return issue(origin, 'paired', now() + clientTtlMs);
    },
    judgeAvailable,
    judgeGrant(accessKey, origin) {
      if (!judgeAvailable(origin)) return { code: 'judge_unavailable' };
      if (typeof accessKey !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(accessKey) ||
          !timingSafeEqual(hash(accessKey), judgeHash)) return { code: 'judge_invalid' };
      if (judgeUsage.grants >= judgeLimits.grants) return { code: 'judge_limit' };
      prune(); judgeUsage.grants++;
      return { grant: issue(origin, 'judge', Math.min(now() + clientTtlMs, judge.expiresAt)) };
    },
    // Reservations are shared across every judge grant, not refunded on reconnect
    // or provider failure. Single-process only; a process restart resets budgets.
    reserve(authorization, origin, resource) {
      if (!authorize(authorization, origin)) return false;
      if (clients.get(key(authorization)).kind !== 'judge') return true;
      if (!['speech', 'vision'].includes(resource) || judgeUsage[resource] >= judgeLimits[resource]) return false;
      judgeUsage[resource]++; return true;
    },
    authorize,
    revoke(authorization, origin) { if (authorize(authorization, origin)) clients.delete(key(authorization)); },
    clear() { clients.clear(); codeHash = undefined; },
  };
}
