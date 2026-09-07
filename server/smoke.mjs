import { readFile, stat } from 'node:fs/promises';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';
import { readConfig } from './config.mjs';
import { parseWav } from './wav.mjs';

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 3 || args[0] !== '--wav' || args[2] !== '--consent') {
    throw new Error('Usage: npm run backend:smoke -- --wav "C:\\path\\fictional-speech.wav" --consent. This sends that file to the configured STT provider (OpenAI by default) and Hindi transcript text to DeepSeek. This tests legacy source mode, not bilingual captions.');
  }
  const config = readConfig();
  if ((await stat(args[1])).size > 4 * 1024 * 1024) throw new Error('WAV must be under 4 MiB.');
  const { audio, data } = parseWav(await readFile(args[1]));
  const base = `http://127.0.0.1:${config.port}`;
  const response = await fetch(`${base}/v1/stt/sessions`, { method: 'POST', signal: AbortSignal.timeout(5000),
    headers: { Authorization: `Bearer ${config.clientToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ audio }) });
  if (!response.ok) throw new Error(`Session bootstrap failed (${response.status}). Check local server configuration.`);
  const session = await response.json();
  const ws = new WebSocket(base.replace('http:', 'ws:') + session.path, session.protocols, { maxPayload: 64 * 1024, handshakeTimeout: 5000 });
  const started = Date.now(); let firstFinalMs, finals = 0, converted = 0, failed = false, sent = false, completed = false;
  const deadline = setTimeout(() => { failed = true; ws.terminate(); }, 65000);
  ws.on('error', () => { failed = true; });
  ws.on('message', raw => {
    const event = JSON.parse(raw);
    if (event.type === 'ready' && !sent) {
      sent = true;
      void (async () => {
        const chunkBytes = audio.sampleRate * 2 / 10; // 100 ms, real-time pace, not a file-size burst.
        for (let offset = 0; offset < data.length && ws.readyState === WebSocket.OPEN; offset += chunkBytes) {
          ws.send(data.subarray(offset, Math.min(offset + chunkBytes, data.length)));
          await delay(100);
        }
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stop' }));
      })().catch(() => { failed = true; ws.terminate(); });
    }
    if (event.type === 'final') {
      if (typeof event.text !== 'string' || /[\p{Script=Devanagari}\u0964\u0965]/u.test(event.text)) {
        failed = true; ws.terminate(); return;
      }
      firstFinalMs ??= Date.now() - started; finals++; if (event.converted) converted++;
      console.log(JSON.stringify({ sequence: event.sequence, text: event.text, converted: event.converted }));
    }
    if (event.type === 'error' || event.type === 'segment_error') { failed = true; console.error(`Speech error: ${event.code}`); }
    if (event.type === 'closed') completed = event.reason === 'stopped';
  });
  try { await once(ws, 'close'); } finally { clearTimeout(deadline); ws.terminate(); }
  console.log(JSON.stringify({ finals, converted, firstFinalMs, elapsedMs: Date.now() - started }));
  if (failed || !finals || !completed) throw new Error('Smoke failed or produced no final text. Inspect safe error codes; do not treat this as an accuracy pass.');
}

main().catch(error => {
  // No upstream bodies are exposed. Generic network errors may include a local URL only.
  console.error(error.message); process.exitCode = 1;
});
