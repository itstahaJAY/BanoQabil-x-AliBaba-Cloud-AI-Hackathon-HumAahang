import http from 'node:http';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { validateAudio } from './config.mjs';
import { createConverter, createBilingualProcessor, connectDeepgram } from './providers.mjs';
import { connectOpenAI } from './openai-stt.mjs';
import { runStream } from './stream.mjs';
import { createClientAccess } from './client-access.mjs';
import { createStaticWebHandler } from './static-web.mjs';
import { createVisionAnalyzer, createVisionTranslator, validateVisionInput, validateVisionResult,
  validateVisionTranslationInput, validateVisionTranslationResult, VisionError,
  MAX_VISION_BODY_BYTES, MAX_VISION_TRANSLATION_BODY_BYTES } from './vision.mjs';

const protocol = 'humahang.stt.v1';
const digest = value => createHash('sha256').update(value).digest();

export function createSpeechServer(config, dependencies = {}) {
  // ponytail: single-process demo token + in-memory tickets and pairing grants.
  // Keep this deployment to one instance; never ship the operator token to clients.
  const tickets = new Map(), sessions = new Map();
  const authDigest = digest(`Bearer ${config.clientToken}`);
  const maxSessions = config.maxSessions ?? 3, ticketTtlMs = config.ticketTtlMs ?? 30000;
  const convert = dependencies.convert ?? createConverter(config);
  const connect = dependencies.connect ?? ((audio, inputLanguage) => config.sttProvider === 'deepgram'
    ? connectDeepgram(config, audio, inputLanguage) : connectOpenAI(config, audio, inputLanguage));
  const processBilingual = dependencies.processBilingual ?? createBilingualProcessor(config);
  const analyzeVision = dependencies.analyzeVision ?? createVisionAnalyzer(config, dependencies.visionFetch);
  const translateVision = dependencies.translateVision ?? createVisionTranslator(config, dependencies.visionFetch);
  const visionRequests = new Set();
  const access = createClientAccess({ now: dependencies.now ?? Date.now,
    judge: config.deployment === 'public' && config.judgeAccessKey ? {
      accessKey: config.judgeAccessKey, expiresAt: config.judgeAccessExpiresAt,
      origin: config.publicUrl, limits: config.judgeLimits,
    } : undefined });
  const serveStaticWeb = config.deployment === 'public' && config.webRoot ? createStaticWebHandler(config.webRoot) : undefined;
  let closing = false, requests = 0, visionCount = 0, rateWindow = Date.now();
  const prune = () => { for (const [key, value] of tickets) if (value.expiresAt <= Date.now()) tickets.delete(key); };
  const approved = req => {
    const port = server.address()?.port;
    const allowedHost = config.deployment === 'public'
      ? req.headers.host === config.publicHost ||
        (req.headers.host === 'healthcheck.railway.app' && req.method === 'GET' && req.url === '/health')
      : [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(req.headers.host);
    return allowedHost &&
      // Native fetch/WebSocket must use one explicit Origin. This is only an exact
      // transport allowlist entry, never identity: pairing/grant/ticket checks still apply.
      (!req.headers.origin || req.headers.origin === 'humahang://native' || config.origins.includes(req.headers.origin));
  };
  const reply = (res, status, body) => {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(body));
  };

  const server = http.createServer({ requestTimeout: 10000, headersTimeout: 5000, connectionsCheckingInterval: 1000 }, async (req, res) => {
    if (!approved(req)) { reply(res, 403, { code: 'forbidden_origin' }); return; }
    if (req.headers.origin) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin); res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'GET' && req.url === '/health') { reply(res, 200, { status: 'ok', service: 'humahang-stt', version: 1 }); return; }
    if (serveStaticWeb && await serveStaticWeb(req, res)) return;
    if (!['/v1/demo/clients', '/v1/stt/sessions', '/v1/stt/clients', '/v1/stt/pairing-codes', '/v1/vision/analyze', '/v1/vision/translate'].includes(req.url)) { reply(res, 404, { code: 'not_found' }); return; }
    if (req.url === '/v1/demo/clients' && !access.judgeAvailable(req.headers.origin)) {
      reply(res, 404, { code: 'judge_unavailable' }); return;
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE'); res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      reply(res, 204); return;
    }
    if (req.method === 'DELETE' && req.url === '/v1/stt/clients') {
      access.revoke(req.headers.authorization, req.headers.origin); reply(res, 204); return;
    }
    if (req.method !== 'POST') { reply(res, 405, { code: 'method_not_allowed' }); return; }
    if (Date.now() - rateWindow >= 60000) { rateWindow = Date.now(); requests = 0; visionCount = 0; }
    if (++requests > 30 || closing) { reply(res, 429, { code: 'rate_limited' }); return; }
    const operator = timingSafeEqual(digest(req.headers.authorization ?? ''), authDigest);
    if (req.url === '/v1/stt/pairing-codes' && !operator) { reply(res, 401, { code: 'unauthorized' }); return; }
    const isTranslation = req.url === '/v1/vision/translate';
    const isVision = req.url === '/v1/vision/analyze' || isTranslation;
    if ((req.url === '/v1/stt/sessions' || isVision) && !operator && !access.authorize(req.headers.authorization, req.headers.origin)) {
      reply(res, 401, { code: 'unauthorized' }); return;
    }
    if (isVision && ++visionCount > (config.visionRequestsPerMinute ?? 12)) { reply(res, 429, { code: 'rate_limited' }); return; }
    if (isVision && visionRequests.size >= (config.maxVisionRequests ?? 2)) { reply(res, 429, { code: 'vision_busy' }); return; }
    if (!/^application\/json(?:\s*;.*)?$/i.test(req.headers['content-type'] ?? '')) { reply(res, 415, { code: 'json_required' }); return; }
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        const limit = isTranslation ? MAX_VISION_TRANSLATION_BODY_BYTES : isVision ? MAX_VISION_BODY_BYTES : 1024;
        if (size > limit) { reply(res, 413, { code: 'body_too_large' }); return; }
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!body || typeof body !== 'object' || Array.isArray(body)) { reply(res, 400, { code: 'invalid_request' }); return; }
      if (isVision) {
        const input = isTranslation ? validateVisionTranslationInput(body) : validateVisionInput(body);
        if (res.destroyed) return;
        if (closing) { reply(res, 503, { code: 'vision_unavailable' }); return; }
        if (!operator && !access.authorize(req.headers.authorization, req.headers.origin)) { reply(res, 401, { code: 'unauthorized' }); return; }
        // Recheck after upload; another request may have filled the provider capacity.
        if (visionRequests.size >= (config.maxVisionRequests ?? 2)) { reply(res, 429, { code: 'vision_busy' }); return; }
        if (!operator && !access.reserve(req.headers.authorization, req.headers.origin, 'vision')) {
          reply(res, 429, { code: 'judge_limit' }); return;
        }
        const controller = new AbortController();
        const abort = () => { if (!res.writableEnded) controller.abort(); };
        visionRequests.add(controller); res.once('close', abort);
        try {
          const result = await (isTranslation ? translateVision : analyzeVision)(input, controller.signal);
          controller.signal.throwIfAborted();
          reply(res, 200, isTranslation ? validateVisionTranslationResult(result, input) : validateVisionResult(result, input));
        } finally { res.removeListener('close', abort); visionRequests.delete(controller); }
        return;
      }
      if (req.url === '/v1/demo/clients') {
        const result = Object.keys(body).length === 1 ? access.judgeGrant(body.accessKey, req.headers.origin) : { code: 'judge_invalid' };
        reply(res, result.grant ? 201 : result.code === 'judge_unavailable' ? 404 : result.code === 'judge_limit' ? 429 : 401,
          result.grant ?? { code: result.code }); return;
      }
      if (req.url === '/v1/stt/clients') {
        const grant = body && Object.keys(body).length === 1 ? access.pair(body.code, req.headers.origin) : null;
        reply(res, grant ? 201 : 401, grant ?? { code: 'pairing_failed' }); return;
      }
      if (req.url === '/v1/stt/pairing-codes') {
        if (!body || Object.keys(body).length) { reply(res, 400, { code: 'invalid_request' }); return; }
        reply(res, 201, { code: access.newCode(), expiresInSeconds: 300 }); return;
      }
      if (!validateAudio(body)) { reply(res, 400, { code: 'invalid_audio_config' }); return; }
      prune();
      if (sessions.size + tickets.size >= maxSessions) { reply(res, 429, { code: 'capacity_reached' }); return; }
      if (!operator && !access.authorize(req.headers.authorization, req.headers.origin)) { reply(res, 401, { code: 'unauthorized' }); return; }
      if (!operator && !access.reserve(req.headers.authorization, req.headers.origin, 'speech')) {
        reply(res, 429, { code: 'judge_limit' }); return;
      }
      const ticket = randomBytes(32).toString('base64url'), expiresAt = Date.now() + ticketTtlMs;
      tickets.set(ticket, { audio: body.audio, mode: body.mode, inputLanguage: body.inputLanguage, origin: req.headers.origin, expiresAt,
        authorization: operator ? undefined : req.headers.authorization });
      reply(res, 201, { path: '/v1/stt/stream', protocols: [protocol, `ticket.${ticket}`], expiresAt,
        audio: body.audio, maxSessionMs: config.sessionDurationMs ?? 180000 });
    } catch (error) {
      if (error instanceof VisionError) { reply(res, error.status, { code: error.code }); return; }
      reply(res, 400, { code: 'invalid_request' });
    }
  });
  server.maxConnections = 30;
  server.keepAliveTimeout = 5000;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024, perMessageDeflate: false,
    handleProtocols: protocols => protocols.has(protocol) ? protocol : false });
  const rejectUpgrade = (socket, status) => socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  server.on('upgrade', (req, socket, head) => {
    // Always consume a presented ticket, including a rejected origin, to prevent replay probing.
    prune();
    const protocols = (req.headers['sec-websocket-protocol'] ?? '').split(',').map(value => value.trim());
    const key = protocols.find(value => value.startsWith('ticket.'))?.slice(7);
    const ticket = tickets.get(key); tickets.delete(key);
    if (closing || !approved(req) || req.url !== '/v1/stt/stream') { rejectUpgrade(socket, 403); return; }
    if (!ticket || ticket.origin !== req.headers.origin || protocols.length !== 2 || !protocols.includes(protocol) ||
        (ticket.authorization && !access.authorize(ticket.authorization, req.headers.origin))) { rejectUpgrade(socket, 401); return; }
    if (sessions.size >= maxSessions) { rejectUpgrade(socket, 429); return; }
    try {
      wss.handleUpgrade(req, socket, head, client => {
        const sessionId = randomUUID();
        sessions.set(sessionId, () => {});
        const stop = runStream(client, ticket.audio, { connect, convert, processBilingual, mode: ticket.mode, inputLanguage: ticket.inputLanguage,
          config, sessionId, onDone: () => sessions.delete(sessionId) });
        if (sessions.has(sessionId)) sessions.set(sessionId, stop);
      });
    } catch { socket.destroy(); }
  });

  return { server, newPairingCode: () => access.newCode(), activeCount: () => sessions.size, close: async () => {
    closing = true; tickets.clear(); access.clear();
    for (const controller of visionRequests) controller.abort();
    for (const stop of sessions.values()) stop();
    for (const client of wss.clients) client.terminate();
    await new Promise(resolve => wss.close(resolve));
    await new Promise(resolve => server.close(resolve));
  } };
}
