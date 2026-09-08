export function requireHttpsOrigin(value, name) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.origin === value && !value.includes('*')) return url;
  } catch { /* Report the field name, never an untrusted URL or credentials. */ }
  throw new Error(`${name} must be an explicit HTTPS origin without a path, credentials, or wildcard.`);
}

export function readConfig(env = process.env) {
  const sttProvider = env.STT_PROVIDER ?? 'openai';
  if (!['openai', 'deepgram'].includes(sttProvider)) throw new Error('STT_PROVIDER must be openai or deepgram.');
  for (const name of [sttProvider === 'openai' ? 'OPENAI_API_KEY' : 'DEEPGRAM_API_KEY', 'DEEPSEEK_API_KEY', 'STT_CLIENT_TOKEN']) {
    const value = env[name];
    if (!value || value.length < 20 || value.length > 512 || /\s/u.test(value) || /replace|your[_-]|example/i.test(value)) {
      throw new Error(`Set ${name} in server/.env (never in EXPO_PUBLIC_*).`);
    }
  }
  if (env.STT_CLIENT_TOKEN.length < 32) throw new Error('STT_CLIENT_TOKEN must contain at least 32 characters.');
  const deployment = env.STT_DEPLOYMENT ?? 'local';
  if (!['local', 'public'].includes(deployment)) throw new Error('STT_DEPLOYMENT must be local or public.');
  const isPublic = deployment === 'public';
  const publicEndpoint = isPublic ? requireHttpsOrigin(env.STT_PUBLIC_URL ??
    (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : undefined), 'STT_PUBLIC_URL') : undefined;
  const port = Number((isPublic ? env.PORT : undefined) ?? env.STT_PORT ?? 8787);
  if (!Number.isInteger(port) || port < (isPublic ? 1 : 1024) || port > 65535) {
    throw new Error(isPublic ? 'PORT/STT_PORT must be 1–65535.' : 'STT_PORT must be 1024–65535.');
  }
  const origins = (env.STT_ALLOWED_ORIGINS ?? publicEndpoint?.origin ?? 'http://localhost:8081,http://127.0.0.1:8081').split(',').map(value => value.trim());
  for (const value of origins) {
    if (isPublic) { requireHttpsOrigin(value, 'STT_ALLOWED_ORIGINS'); continue; }
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.origin !== value) {
      throw new Error('Step 2 allows explicit loopback browser origins only.');
    }
  }
  const deepseekModel = env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash';
  if (!/^[a-z0-9-]{1,80}$/u.test(deepseekModel)) throw new Error('Invalid DEEPSEEK_MODEL.');
  const openaiKey = env.OPENAI_API_KEY || undefined;
  if (openaiKey && (openaiKey.length < 20 || openaiKey.length > 512 || /\s/u.test(openaiKey) || /replace|your[_-]|example/i.test(openaiKey))) {
    throw new Error('Set a valid OPENAI_API_KEY in server/.env (never in EXPO_PUBLIC_*), or leave it unset.');
  }
  const openaiVisionModel = env.OPENAI_VISION_MODEL ?? 'gpt-4.1-mini';
  if (!/^[a-z0-9.-]{1,80}$/u.test(openaiVisionModel)) throw new Error('Invalid OPENAI_VISION_MODEL.');
  // This adapter uses server VAD and the singular language field. Models with
  // different session contracts must not be selected by an unchecked env value.
  const openaiSttModel = env.OPENAI_STT_MODEL ?? 'gpt-4o-transcribe';
  if (!['gpt-4o-transcribe', 'gpt-4o-mini-transcribe'].includes(openaiSttModel)) throw new Error('Invalid OPENAI_STT_MODEL.');
  const judgeAccessKey = env.JUDGE_ACCESS_KEY || undefined;
  const judgeDeadline = env.JUDGE_ACCESS_EXPIRES_AT || undefined;
  let judgeAccessExpiresAt;
  if (judgeAccessKey || judgeDeadline) {
    if (!isPublic || !judgeAccessKey || !/^[A-Za-z0-9_-]{43}$/u.test(judgeAccessKey) ||
        [env.STT_CLIENT_TOKEN, env.OPENAI_API_KEY, env.DEEPGRAM_API_KEY, env.DEEPSEEK_API_KEY].includes(judgeAccessKey)) {
      throw new Error('JUDGE_ACCESS_KEY requires public deployment and a separate random 32-byte base64url key.');
    }
    judgeAccessExpiresAt = Date.parse(judgeDeadline);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(judgeDeadline ?? '') || !Number.isFinite(judgeAccessExpiresAt) ||
        new Date(judgeAccessExpiresAt).toISOString().replace('.000Z', 'Z') !== judgeDeadline.replace('.000Z', 'Z')) {
      throw new Error('JUDGE_ACCESS_EXPIRES_AT must be an explicit UTC ISO date and time.');
    }
    // Keep the normal service healthy if an invitation expires before a restart.
    // Issuance and authorization enforce this deadline for every judge request.
  }
  return { port, origins, deployment, host: isPublic ? '0.0.0.0' : '127.0.0.1',
    publicUrl: publicEndpoint?.origin, publicHost: publicEndpoint?.host, webRoot: isPublic ? env.WEB_ROOT || undefined : undefined,
    clientToken: env.STT_CLIENT_TOKEN, sttProvider, openaiSttModel, deepgramKey: env.DEEPGRAM_API_KEY,
    deepseekKey: env.DEEPSEEK_API_KEY, deepseekModel, conversionTimeoutMs: 12000,
    openaiKey, openaiVisionModel, visionTimeoutMs: 25000, judgeAccessKey, judgeAccessExpiresAt };
}

export function validateAudio(body) {
  if (!body || !body.audio || typeof body.audio !== 'object' ||
      Object.keys(body).some(key => !['audio', 'mode', 'inputLanguage'].includes(key)) ||
      (body.mode !== undefined && body.mode !== 'bilingual') ||
      (body.inputLanguage !== undefined && (body.mode !== 'bilingual' || !['en', 'ur'].includes(body.inputLanguage)))) return false;
  const audio = body.audio;
  return Object.keys(audio).sort().join(',') === 'channels,encoding,sampleRate' &&
    audio.encoding === 'linear16' && audio.channels === 1 && [16000, 24000, 48000].includes(audio.sampleRate);
}
