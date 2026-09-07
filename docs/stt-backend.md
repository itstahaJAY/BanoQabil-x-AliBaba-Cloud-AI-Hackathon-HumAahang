# Step 2 — STT backend contract and implementation log

**Current provider update (2026-09-07):** Live Captions defaults to OpenAI `gpt-4o-transcribe`; DeepSeek bilingual processing is unchanged. See [migration, restart and rollback](openai-stt-migration.md). Earlier Deepgram descriptions below are historical or describe the explicit rollback provider. The client protocol remains compatible; unspecified input language means provider auto-detection (Deepgram `multi` only on rollback).

**Latest Live Captions implementation:** [Urdu-first bilingual output](live-captions-bilingual-output.md) is wired to real web/native capture. Explicit `mode: "bilingual"` processes every stable segment into paired Urdu/English output; omitting mode preserves the older source-mode contract documented below. Use the [new microphone setup and QA](live-captions-qa.md), not the legacy source-mode WAV smoke as proof of the new UI.

Status (2026-09-07): backend, real capture adapters and frontend wiring implemented/tested with provider and hardware doubles, including a joined client→HTTP→WebSocket→pipeline test. Live provider credentials/accuracy and native compilation/device acceptance remain unverified. No actual microphone/cloud calls were made during implementation.

## Additive bilingual and local connection contract

- On startup the operator terminal prints a one-use, five-minute connection code. `npm run backend:pair` rotates it without restarting the service. Codes are private local setup material, not API keys.
- `POST /v1/stt/pairing-codes`, operator-token authorization and exact body `{}`: returns `{code, expiresInSeconds:300}`. A scoped client grant cannot call this route.
- `POST /v1/stt/clients`, exact body `{code}`: consumes the code and returns `{token, expiresAt}` with an origin-bound one-hour grant. At most five guesses per code, ten live grants, existing global request limits. Grants live in app/server memory, never app storage or Expo public constants.
- `DELETE /v1/stt/clients`, the scoped grant: revokes future bootstrap and pending tickets. The UI cancels its own active socket first; this endpoint does not remotely terminate other already-open sockets. Server restart clears all grants/tickets and active sessions.
- `POST /v1/stt/sessions`, operator or scoped grant: accepts `{audio:{encoding:"linear16",sampleRate:16000,channels:1},mode:"bilingual",inputLanguage:"ur"}`. Web uses 48000 Hz. `inputLanguage` accepts only `ur` or `en` in bilingual mode; omission retains `multi`. Both mode and input language belong to the authenticated ticket, not a midstream client message.
- Browser origins remain the explicitly configured loopback origins. Native HTTP and WebSocket both explicitly send `Origin: humahang://native`, an exact additional allowed transport origin. This avoids Android's automatic WebSocket-origin mismatch. It is **not authentication**: credentials, matching ticket origin and loopback Host checks are still required. Foreign or missing origins cannot reuse a bound grant.
- Bilingual mode emits `ready`, `processing`, `caption_final` with `{sessionId,sequence,outputs:{ur,en}}`, safe `segment_error`, `stopping`, `closed` or terminal `error`. No source previews/finals leave this mode. Default source mode keeps `preview`/`final` and conditional Hindi conversion.
- Every stable bilingual segment, including plain English, makes one bounded DeepSeek request for both outputs. Validate exact shape, scripts, controls, length and numeric-token integrity before atomic emission. Queue/order/cancellation/limits are unchanged. This does not prove linguistic fidelity.
- Audio is transient; server keys/operator token remain server-only. The client sends no provider model or output-tab selection. Output switching makes zero calls.
- Bilingual failures identify a safe `stage`: `recognition_input`, `translation_request`, or `translation_validation`. No raw transcript/provider error accompanies it. Clock-bound AM/PM is normalized into Urdu script, and equivalent explicit times (`3 PM` / `3:00 PM`) are accepted without permitting changed values, dropped dayperiods, count-to-time mutation or Hindi leakage.

The historical Step 2 sections below describe **source mode** unless explicitly stated otherwise.

## Agreed behavior

- Deepgram Nova-3 `language=multi`, with no spoken-language selector. The user tested Urdu utterances returning Hindi script and accepts that intermediate result for the MVP. This is not a claim of documented Urdu multilingual support.
- English stays byte-for-byte unchanged and makes no conversion request. Hindi/Devanagari spans are converted into Urdu; English and numbers in mixed sentences are protected. Already Urdu text passes unchanged. Ambiguous/unsupported language is an error, not silently English.
- Raw Hindi, provider errors, credentials and provider metadata never enter frontend events. Conversion failures produce a safe segment error, not raw-text fallback. Source text is transient backend memory, not logged/stored by this app.
- Ordered final segments; deduplication; bounded pending work; cancelled sessions discard late results. English interim previews may be emitted only after routing checks and when they cannot overtake an earlier pending conversion. Hindi interim previews are withheld.
- Device TTS is unchanged. No microphone capture, native rebuild, deployment or frontend wiring in Step 2.

## Implementation slices / acceptance

1. Pure routing + conversion: English/Urdu bypass, mixed-language protected spans, reject malformed/Hindi output, cancellation. Red/green tests before integration.
2. Provider adapters: fixed Deepgram/DeepSeek destinations, bounded input/output, timeouts, sanitized errors, no silent provider retries; fake-provider tests.
3. Session processing: ordered final results, duplicate/stale events, pause/drain vs cancel, limits and cleanup; fake streaming tests.
4. HTTP/WebSocket service: local-demo authentication, single-use short-lived upgrade tickets, origin restrictions, bounded audio/queues/session duration, health and diagnostics; loopback integration tests.
5. Configuration, operator smoke test, setup/QA and Ponytail audit. Live-provider verification depends on credentials and consented test audio.

## Deployment boundary

This is a single-process, loopback-bound hackathon backend, not public production identity management. A privately provisioned demo client token authorizes ticket issuance; it must never be shipped as a public mobile/browser build constant. Replacing it with user identity and adding TLS/WSS at a reviewed ingress are required before public/mobile-network exposure. No database, distributed queue or multi-tenant account system is needed for this local step.

## Provider sources

Verified 2026-09-07: [Deepgram streaming](https://developers.deepgram.com/reference/speech-to-text/listen-streaming), [multilingual responses](https://developers.deepgram.com/docs/multilingual-code-switching), [CloseStream](https://developers.deepgram.com/docs/close-stream), [DeepSeek text API](https://api-docs.deepseek.com/api/create-chat-completion/), [DeepSeek JSON](https://api-docs.deepseek.com/guides/json_mode/), [ws](https://github.com/websockets/ws).

These providers receive audio/text respectively. Provider retention policies and account settings must be reviewed before sending personal or sensitive recordings. Tests use fictional content. Raw provider payloads are not forwarded to clients or logged.

## Decisions and code ownership

- `server/normalize.mjs`: one output gate for safe previews/finals. Hindi word spans are translated in context, then inserted into original string slices. English words, ASCII numbers, Urdu words and surrounding spacing/punctuation cannot be rewritten by the model. Devanagari digits become equivalent ASCII digits; danda punctuation becomes Urdu `۔`. Translation output must contain Arabic-script letters, no Latin/Hindi letters, invented numbers or bidi controls. This validates structure, **not translation accuracy**. Unsupported languages and ambiguous Latin text are rejected rather than silently assumed English.
- `server/providers.mjs`: fixed Deepgram WebSocket and DeepSeek HTTPS destinations, server credentials, timeouts and bounded responses. The user's `Hindi-Urdu-Translator/server.js` supplied the precise, natural-Urdu translation approach. The original folder is preserved, not imported or served. Its browser-provided key and raw provider-error behavior were deliberately not reused. DeepSeek returns JSON span translations; current default model is `deepseek-v4-flash`, configurable server-side. The prototype's `deepseek-chat` model is not hardwired into the new service. There is no translation-provider framework or unrelated provider fallback.
- `server/pipeline.mjs`: ordered final queue, timestamps-based duplicate/stale-frame protection, session-local sequences, cancellation and safe errors. Repeated text at different timestamps remains separate speech. Interim Hindi never calls conversion or leaves the server. Unsupported interim text is withheld; unsupported final text returns a segment error.
- `server/stream.mjs`: audio forwarding and bounded start/stop/drain/close lifecycle. No automatic upstream retries or audio replay; a new session is required after interruption.
- `server/server.mjs` / `config.mjs`: local HTTP/bootstrap authentication, one-use upgrade tickets, origin/Host checks and resource limits.
- `server/smoke.mjs` / `wav.mjs`: explicit, consented, short WAV operator test. No microphone capture, raw transcript storage or fabricated output.

Why these choices: the existing Expo app stays stable, while plain Node HTTP/fetch/crypto cover almost everything. One pinned `ws` dependency is needed for the server-side WebSocket upgrade/proxy. A provider SDK, Express, database and distributed queue would not add required behavior here. PCM16 is an explicit first transport contract, not a claim that Expo Go or browser MediaRecorder already produces compatible audio.

## Setup on this PC

Use Node 22.17+ (tested here with Node 25.9). Start from the project root in PowerShell:

```powershell
Set-Location 'C:\Users\Admin\Documents\ChatGPT\AliBaba Cloud AI Hackathon 2'
npm ci --prefix server --ignore-scripts
if (!(Test-Path -LiteralPath 'server\.env')) {
  Copy-Item -LiteralPath 'server\.env.example' -Destination 'server\.env'
}
```

Open `server/.env` in your editor. Set `OPENAI_API_KEY` and `DEEPSEEK_API_KEY` there, not in chat or the frontend. Keep `STT_PROVIDER=openai` and `OPENAI_STT_MODEL=gpt-4o-transcribe`. `DEEPGRAM_API_KEY` is only required for explicit Deepgram rollback. Generate a separate demo token locally and paste it into `STT_CLIENT_TOKEN`:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Keep the remaining defaults. `.env` is ignored by Git. Protect it with your normal OS account access; it is not encrypted by this app. Do not commit/share it, expose it through Expo public variables, or place keys in command-line arguments. Provider keys are not language-specific: Live Captions requests its selected `ur`/`en` input; legacy requests without input language use `multi`.

Terminal 1:

```powershell
npm run backend:start
```

Open `http://127.0.0.1:8787/health`. Expected JSON is `{"status":"ok","service":"humahang-stt","version":1}`. This proves only that the local process is running, **not** that provider credentials, quota or transcription work. The bare `/` URL returns 404 because this is an API, not another frontend. Ctrl+C stops the backend.

Terminal 2, same root:

```powershell
npm run backend:test
```

Both test commands use provider doubles without keys or provider calls. The [current audit record](qa/live-captions-bilingual-audit.md) records counts. `npx tsc --noEmit` checks Expo TypeScript; backend JavaScript is covered by executable tests, not that TypeScript command.

### Live-provider smoke / accuracy QA

Only do this with your own consented, fictional speech; providers receive audio/text and API usage can consume credit. No personal contacts, medical details or bystanders. The script requires `--consent` and never starts the microphone.

1. Make three separate 5–15 second recordings: English (`Please bring water at 3 PM.`), Urdu (`مجھے پانی چاہیے۔`), and mixed (`Mujhe kal 3 PM par appointment chahiye.`). These examples are spoken prompts, not exact expected ASR strings. Add a fictional name and a number once the basics work.
2. Export each as a **mono, signed 16-bit little-endian PCM WAV**, 16000 Hz recommended (24000/48000 also accepted), at most 30 seconds. Do not rename an M4A/MP3 to `.wav`; that does not convert audio. The parser rejects incompatible files.
3. With the backend running, use the full path to one recording:

   ```powershell
   npm run backend:smoke -- --wav 'C:\path\english.wav' --consent
   ```

4. Repeat with the Urdu and mixed files. The tool sends 100 ms chunks in real time and prints **only normalized final text** plus counts/timing. English should report `converted:false`; Urdu recognized as Hindi should report `converted:true`. Existing Arabic-script Urdu can correctly report `false`. A nonzero exit means the smoke failed, not a partial pass.
5. Check yourself: no Devanagari appears; English words and numeric values survive in mixed sentences; Urdu meaning is natural and faithful; no invented names/numbers. English must make no conversion call (the automated tests verify this code path; use provider usage records to corroborate live behavior if available). Do not require exact punctuation/casing from ASR.
6. Note delays separately: English preview/final, Urdu conversion, mixed conversion. `firstFinalMs` includes the time spent speaking and is **not** pure provider latency. Hindi conversion adds a network round trip and waits for a stable final segment; instant Urdu is not a measured promise. Record the delay after you finish speaking and judge whether the MVP feels usable.
7. Repeat an utterance twice and ensure both remain; speak English after Urdu and ensure final order is correct. Use a few quiet/noisy recordings and switching mid-sentence. Report actual failures before declaring live QA complete.
8. To test an upstream rejection, temporarily use a nonworking, syntactically valid Deepgram key in **server/.env**, restart, and run a fictional sample. Expect a safe `provider_unavailable`, no raw provider text, and no hang. Restore the real value afterward. Similarly a nonworking DeepSeek key should affect Hindi conversion, while English bypass still works. Automated tests already cover these boundaries without using paid calls.

Record each run: date, sample language, final text (fictional only), conversion count, observed post-speech delay, pass/fail. Share safe error codes and results, **not `.env`, tokens or authorization/network headers**.

Phone/Expo Go QA is **not enabled by Step 2**. The backend intentionally listens on this PC's loopback only. Do not change it to `0.0.0.0`, use an unauthenticated tunnel, or bundle the demo token to make mobile testing work. Step 3 must add appropriate audio capture and a reviewed secure device connection; Step 4 connects the app lifecycle and display.

## API v1 contract

### Bootstrap

`POST /v1/stt/sessions` with `Authorization: Bearer <private-demo-token>` and `Content-Type: application/json`:

```json
{"audio":{"encoding":"linear16","sampleRate":16000,"channels":1}}
```

Only these fields are accepted. `language`, `model`, provider URLs, API keys, UI locale and extra fields are rejected. Mono PCM16 at 16000/24000/48000 Hz only; no WAV header or compressed MediaRecorder container belongs in the audio stream.

201 response shape:

```json
{
  "path":"/v1/stt/stream",
  "protocols":["humahang.stt.v1","ticket.<opaque-one-use-ticket>"],
  "expiresAt":1234567890000,
  "audio":{"encoding":"linear16","sampleRate":16000,"channels":1},
  "maxSessionMs":180000
}
```

Use the same approved browser Origin for bootstrap and upgrade. Native/operator clients with no Origin must omit it in both requests. Authorization is checked even without Origin. Tickets are consumed on an upgrade attempt, expire after 30 seconds, and are never valid twice. No credentials are placed in URL query parameters; do not log WebSocket protocol headers either. Only `humahang.stt.v1`, not the ticket, is echoed in the negotiated protocol.

HTTP errors use `{ "code": "..." }`: 400 invalid request/audio, 401 unauthorized, 403 disallowed Origin/Host, 404 unknown path, 405 method, 413 oversized body, 415 non-JSON, 429 request/capacity limit. Responses use `no-store`; CORS allows only configured loopback origins. An unauthenticated health response contains no provider/configuration details.

### Audio and lifecycle

Connect WebSocket to the returned path, using the returned protocols. Wait for `ready` before sending binary **raw PCM16 little-endian** frames. Prefer 100 ms chunks at actual microphone rate. WebSocket ordering supplies packet order within the session; there is no cross-session audio replay.

Client text controls are exactly `{"type":"stop"}` or `{"type":"cancel"}`:

- `stop`: caller stops capture immediately, sends no more audio, backend sends Deepgram `CloseStream`, drains provider finals then pending conversions, and closes. A stop during initial connection simply closes. A duplicate stop is idempotent.
- `cancel`: abort all pending work and close immediately; late callbacks cannot append final text.
- Pause uses stop; resume requests a **new** session. Keep committed text in the app; never reuse tickets, old session callbacks or replay old audio. Navigation/background/disposal uses cancel and must independently release the device microphone. The server cannot prove microphone release.
- Unexpected provider/client disconnect or deadline ends the session with a safe error/close, not endless retries. The future UI must preserve committed text and offer explicit retry. An abruptly failed socket may close without a final JSON error; handle that too.

All server WebSocket events contain `sessionId`:

| Event | Other fields | Consumer rule |
| --- | --- | --- |
| `ready` | — | Start forwarding current-session audio. |
| `preview` | `sequence`, `text` | Replace that sequence's temporary text; never append as final. Only safe English/already-Urdu previews pass. |
| `processing` | `sequence` | Clear matching preview; show a non-text processing state. No raw Hindi. |
| `final` | `sequence`, `text`, `converted` | Commit once using `(sessionId, sequence)`; finals are emitted in accepted order. |
| `segment_error` | `sequence`, `code` | Mark that segment failed; do not fill the gap with raw text. Later segments can proceed. |
| `stopping` | — | Capture must already be off; wait for pending finals/close. |
| `closed` | `reason`: `stopped` or `cancelled` | Release transport; retain only already committed text. |
| `error` | `code` | Terminal session error followed by socket close; offer deliberate retry. |

Routing/segment codes: `invalid_result`, `unsupported_language`, `conversion_invalid`, `conversion_timeout`, `conversion_unavailable`. Session codes include `provider_unavailable`, `provider_interrupted`, `queue_full`, `invalid_message`, `audio_limit`, `session_limit`, `drain_timeout`, `slow_client`. Only allowlisted codes cross the boundary; raw errors/payloads do not. Future frontend copy must map codes into English/Urdu/Roman UI labels, independently of transcript language.

### Resource limits and privacy

- 3 active sessions plus unexpired tickets combined; 30 bootstrap attempts/minute (single-process fixed window); 30 TCP connections. Shared demo limits, not per-user quotas or billing guarantees.
- 3-minute hard session duration; 10-second provider startup deadline; 12-second conversion deadline; 20-second stop/drain deadline. Deadline failure can leave the current uncommitted segment unavailable; never mark that text saved.
- JSON bootstrap body 1 KiB; control payload 128 bytes; audio frame 64 KiB and even byte length; WebSocket hard payload cap 128 KiB. Audio rate bounded to real time plus a 2-second burst; at most 120 messages/second and 30000/session. Transport errors over the hard limit can close without JSON.
- Upstream/client buffering capped at 256 KiB; provider result frame 256 KiB; conversion response 64 KiB; input transcript 4000 characters; 64 Hindi spans; normalized final 8000 characters; queue 12 pending finals; at most 3000 final IDs/session.
- App-owned backend storage: transient bounded memory only, no files/database or transcript/audio logging. This is **not** a guarantee about provider retention or memory zeroization. Deepgram receives audio; DeepSeek receives Hindi spans plus full segment context (which can include English/numbers). No conversion request for an English-only segment. Model-improvement/account retention controls need a separate informed review; no paid opt-out flag is silently selected.

## Historical Step 2 verification and Ponytail audit

Earlier source-mode pass on 2026-09-07. These counts/scope predate frontend wiring; see the [current bilingual audit](qa/live-captions-bilingual-audit.md) for latest results:

- Observed meaningful failing tests before implementing normalization, provider adapters, pipeline, HTTP/WebSocket service and WAV validation; each was then made green.
- **27 backend tests PASS**, including actual loopback HTTP/WebSocket connections to fake providers. No provider keys, live audio or paid requests used by tests.
- **69 existing frontend tests PASS; `npx tsc --noEmit` PASS.** Existing Node module-type warnings remain in the frontend test runner; this change does not switch the Expo package module mode.
- `npm audit --omit=dev` in `server/`: **0 reported vulnerabilities** for the pinned dependency as checked today. This is scoped to the new backend, not a whole-repository security certification.
- Startup with missing configuration fails safely naming the required field. Smoke without an explicit file/consent exits with usage instructions. `.env` is ignored; no real key was copied from the prototype or introduced into app source.
- Audit scope: new backend plus existing caption/TTS integration seams, not a rewrite or complete security audit of every legacy screen. No unrelated UI, locale, Passport, QR or native capture changes.
- Ponytail kept one small standalone service, one dependency, one output-normalization function and one bounded ordering queue. Reused the supplied translation approach and existing device TTS contract; omitted database, framework, redundant speech SDK and speculative deployment. The local-demo identity ceiling has an explicit `ponytail:` upgrade-trigger comment.
- Audit found/fixed recursive cleanup under client backpressure; a regression test now verifies close happens once without leaked timers. Other covered risks: ticket replay/origin mismatch, invalid audio/configuration, cancellation after conversion, raw-Hindi/model-output leakage, duplicates, capacity and timeouts.
- **NOT verified:** provider keys/account model access, real Urdu/mixed accuracy, actual latency, public deployment, browser microphone capture, Expo/native capture, or end-to-end app playback/history with cloud results. These remain acceptance work, not implied by unit tests.

## Next handoff

1. Restart the updated backend, pair the running app, and follow the [PC live microphone QA](live-captions-qa.md#first-test-on-this-pc). Review recognition, meaning and measured delay using consented fictional speech.
2. Compile a new native development build and follow the Android USB steps in that guide. Expo Go cannot run this recorder. Native compatibility/device acceptance are still pending.
3. Capture and caption-hook wiring are implemented; do not redo them or revert to the device fallback. Chat/FTF stay on their existing recognizer until a separate scoped integration preserves sender/draft behavior.
4. Device TTS remains unchanged. Cloud TTS, Vision and Sign engines are outside this feature.
