import { readConfig, requireHttpsOrigin } from './config.mjs';
try {
  const config = readConfig();
  const remote = process.env.STT_PAIR_URL;
  const baseUrl = remote === undefined ? `http://127.0.0.1:${config.port}` : requireHttpsOrigin(remote, 'STT_PAIR_URL').origin;
  const response = await fetch(`${baseUrl}/v1/stt/pairing-codes`, {
    method: 'POST', headers: { Authorization: `Bearer ${config.clientToken}`, 'Content-Type': 'application/json' },
    body: '{}', signal: AbortSignal.timeout(5000), redirect: 'error',
  });
  if (!response.ok) throw new Error('Cannot get a code. Restart the backend with the same server/.env and retry.');
  const data = await response.json();
  if (!/^[A-F0-9]{10}$/.test(data.code)) throw new Error('Unexpected server response.');
  console.log(`${remote === undefined ? 'Local connection code' : 'Connection code'}: ${data.code} (one use, 5 minutes). Enter it in Live Transcription, not in chat.`);
} catch { console.error('Could not get a connection code. Check the running backend, STT_PAIR_URL, and server/.env; never share keys.'); process.exitCode = 1; }
