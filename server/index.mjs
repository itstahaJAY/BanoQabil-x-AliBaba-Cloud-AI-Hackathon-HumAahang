import { readConfig } from './config.mjs';
import { createSpeechServer } from './server.mjs';

try {
  const config = readConfig();
  const app = createSpeechServer(config);
  app.server.on('error', () => { console.error('Backend could not listen. Check PORT/STT_PORT and whether it is already in use.'); process.exitCode = 1; });
  // Public mode runs behind the hosting platform's HTTPS/WSS terminator.
  app.server.listen(config.port, config.host, () => {
    console.log(`Hum Ahang STT backend: ${config.publicUrl ?? `http://127.0.0.1:${config.port}`}`);
    console.log(`Caption recognition: ${config.sttProvider}${config.sttProvider === 'openai' ? ` (${config.openaiSttModel})` : ' (nova-3)'}. Translation and photo models are unchanged.`);
    if (config.deployment === 'public') {
      console.log('Public demo: generate a connection code from an operator terminal using STT_PAIR_URL and npm run backend:pair.');
    } else {
      console.log(`Local connection code: ${app.newPairingCode()} (one use, valid 5 minutes; enter in Live Transcription).`);
      console.log('For another code run npm run backend:pair in a second terminal. Do not share connection codes.');
    }
    console.log('/health does not check providers. Audio is forwarded in memory, not stored by this server.');
  });
  let exiting = false;
  const shutdown = async () => { if (!exiting) { exiting = true; await app.close(); } };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
} catch (error) {
  // Config validation messages name fields, never values or provider responses.
  console.error(error.message); process.exitCode = 1;
}
