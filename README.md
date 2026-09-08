# Hum Ahang

HumAhang is an Urdu-first accessibility companion for the Bano Qabil × Alibaba Cloud AI Hackathon, bringing speech, text, and visual assistance together to help people communicate and understand their surroundings with greater independence.

## Hackathon web demo

**[Open the live demo](https://humahang-production.up.railway.app)** — one Railway service hosts the web app and its authenticated AI backend. Evaluators can use the separate **private judge link** supplied in the submission: it connects cloud speech/photo features without a terminal or one-time code. The ordinary homepage remains browsable without credentials; operator pairing is still available as a fallback. See [private judge access and QA](docs/judge-access.md) for expiry, shared usage limits, reconnection and rollback, or the [deployment guide](docs/deployment.md) for operator setup. Never publish the private invitation, API keys or operator token in this repository.

Cloud verification passed on 2026-09-07: public app/health routes, authenticated pairing, two synthetic English/Urdu caption pairs, photo analysis, and Urdu image-result translation. Historical local-only setup notes below describe development; the deployment guide supersedes those hosting restrictions. The current caption provider is OpenAI, with Deepgram retained only as an explicit operator rollback.

An accessibility and communication assistant prototype for Pakistan, built with Expo/React Native. Live Captions streams microphone audio through the local OpenAI/DeepSeek backend for Urdu-first bilingual output. AI Vision and the experimental Sign Assistant send explicitly captured photos through the backend to OpenAI and can read the results with the device's voice. AI Vision has independent English/Urdu/Roman Urdu result controls with text-only translation and per-photo caching. The Sign Assistant recognizes a small set of static hand poses; it does not translate sign language. The user confirmed phone object detection works; translation controls and broader physical-device acceptance still need the focused QA.

**OpenAI caption migration:** recognition now defaults to `gpt-4o-transcribe` using the existing server-only OpenAI key. Image analysis keeps its separate `gpt-4.1-mini` model. DeepSeek paired translation, device TTS and chat/FTF are retained. Follow the [restart, rollback and six-step QA](docs/openai-stt-migration.md). This supersedes historical Deepgram-default references below; `STT_PROVIDER=deepgram` remains an explicit operator rollback, never an automatic replay.

## Workflow

[![Hum Ahang — complete app workflow](docs/assets/hum-ahang-workflow.svg)](docs/assets/hum-ahang-workflow.svg)

**[Explore the complete workflow](docs/workflow.md)** — six feature journeys, private judge access, cloud/device boundaries, gesture mappings and honest MVP limitations. The diagram is an editable SVG; the detailed guide includes a text equivalent and Mermaid architecture diagram.

## Run

```bash
npm ci --ignore-scripts
npm start
```

Expo Go can preview the UI, but native microphone features require a development build: `react-native-audio-api` for Live Captions and `expo-speech-recognition` for chat/FTF. For browser microphones use localhost or HTTPS, not a plain HTTP LAN-IP link. Start the revised captions feature with the [short PC/phone setup and QA](docs/live-captions-qa.md).

For a phone-sized preview on this PC, run `npm run web`. The web shell intentionally constrains the app to a mobile viewport.

## Architecture

For repeatable PC and physical-phone testing, use the [Phase 1 QA guide](docs/qa-guide.md). It includes exact test steps, expected results, mock boundaries, and a bug-report template.

- `app/` — Expo Router screens and tab navigation
- `src/components.tsx` — reusable Orb, buttons, headers, and feature cards
- `src/router.ts` — deterministic adaptive communication routing
- `src/store.tsx` — locally persisted profile and accessibility preferences
- `src/profile-data.ts` — shared passport schema, validation, privacy projection and serialized profile storage
- `app/passport-settings.tsx` — passport editor reached through Profile → Settings; see the [Passport contract](docs/passport-contract.md)
- `app/emergency-settings.tsx` / `src/emergency-call.ts` — Settings-owned service configuration and isolated, testable phone handoff; see the [Emergency contract](docs/emergency-contract.md)
- `src/locale.ts` / `src/localized-ui.tsx` — bundled three-language UI, verbatim user-content boundaries and RTL; see the [language/QR retest](docs/localization-contract.md#user-retest--qr-and-languages)
- `src/use-live-captions.ts` / `src/caption-client.ts` / `src/caption-capture.*` — real PCM capture, short-lived connection credentials and bounded streaming lifecycle; see the [bilingual captions contract](docs/live-captions-bilingual-output.md)
- `src/photo-assist-screen.tsx` / `src/photo-capture.tsx` / `src/use-photo-analysis.ts` / `src/vision-client.ts` — shared photo preview, explicit upload, result and device-voice flow for AI Vision and Sign Assistant; [setup and focused QA](docs/vision-qa.md)
- `src/service-connection.ts` / `server/vision.mjs` — shared runtime connection grant and server-only OpenAI image analysis; the same key serves both photo features
- `server/` — OpenAI STT with explicit Urdu/English input for Live Captions and DeepSeek paired outputs, preserving the source-mode client contract; [server setup and API](docs/stt-backend.md). `openai-stt.mjs` isolates recognition and `pcm-resampler.mjs` converts existing web/native audio to 24 kHz. Deepgram is an explicit rollback option. Human Urdu/mixed-speech acceptance remains.
- `src/gesture-model.ts` / `src/gesture-surface.tsx` / `src/navigation-gestures.tsx` — bounded navigation pad, deferred single/double recognition and persisted opt-out; [gesture contract and QA](docs/navigation-gestures.md).
- `src/theme.ts` — semantic design tokens
- `src/types.ts` — shared persona and routing contracts
- Local design references are excluded from the public repository; runtime artwork is included in `assets/`.

## Implemented behavior and remaining boundaries

FTF and ordinary conversation use device/browser speech recognition, with English/Urdu selection and review-before-send. Live Captions instead uses cloud streaming through the local backend, with Urdu/English output tabs and a separate manual draft. Starting it sends audio to Deepgram and every finalized segment to DeepSeek; it needs connectivity and provider configuration. Device speech may process audio online; offline recognition is not guaranteed. Quick Speak, FTF and photo-result read-aloud use Expo Speech. Saved caption text persists locally under History (not audio, not encrypted by this app, and not synced across devices). Ordinary conversation history, smart replies and other AI actions remain mocked or unfinished. AI Vision photo analysis is wired; the Sign Assistant is limited to six static hand poses and an unknown result, with no PSL/ASL or moving-sign translation. Emergency provides read-aloud/Stop, a no-location lost-person help flow, and reviewed phone-app handoffs using saved trusted-contact/service numbers. Service numbers start empty and must be verified for the user's area. There is no dispatch, automatic notification or confirmed-call status. Passport displays details saved through Profile → Settings, with visibility controls and text sharing. A separate Emergency contact QR encodes only the exact `+country-code` number after explicit reveal consent. Full-passport QR/hosted-link sharing remains unavailable. See the [QR contract and phone retest](docs/passport-contract.md#emergency-contact-qr--2026-09-06).

The [remaining-feature backlog](docs/qa-guide.md#user-reports-and-feature-backlog-t03t06-2026-09-05) records the user's original Emergency, Passport, Vision and Sign Assistant reports. The [Passport contract](docs/passport-contract.md), [Emergency contract](docs/emergency-contract.md) and [photo-feature contract and QA](docs/vision-qa.md) supersede their original placeholder status. Missing accessibility-setting effects remain frontend/device work, not inherently blocked on AI integration.

## AI Vision and Sign Assistant setup

Use the [single photo-feature setup and QA guide](docs/vision-qa.md). The operator adds `OPENAI_API_KEY` only to `server/.env`, restarts the existing backend, and connects this app once through **Profile → Settings → Speech setup**. The same connection serves captions and both photo features; it expires after one hour or app reload. `OPENAI_VISION_MODEL` defaults to `gpt-4.1-mini`.

The user takes a photo, reviews it, then taps **Analyze photo** to upload it. Enable **Read results aloud** for automatic playback; its initial value follows the saved Auto speak preference. Initial analysis follows the app language. AI Vision's **English / اردو / Roman Urdu** controls translate the same description and object names independently of menus. Only result text is sent for a first language change, not the photo again; later switches reuse translations while that result is open. Urdu returns Arabic-script text and Urdu voice; Roman Urdu returns Latin-script text with Urdu-script speech input. Read-aloud uses the device, without a Deepgram TTS fallback. The Hum Ahang server does not store uploaded photos; camera captures may remain in temporary device cache. AI can miss objects or misclassify poses and is not a safety/navigation tool. Phone object detection was confirmed by the user; translation controls/read-aloud still need the [quick retest](docs/vision-qa.md#quick-retest-urdu-result-toggle). Restart the backend and reconnect once after adding this endpoint. The backend still requires the separate public-deployment pass before a Render demo can work.

## Pakistan and Urdu requirement

The interface now supports **English / اردو / Roman Urdu** throughout app-owned copy, navigation, controls, accessibility names and errors. Choose **Profile → Settings → Language → Save**. Urdu uses RTL; English/Roman Urdu use LTR. Phone numbers and QR codes remain LTR. Saved names, messages, transcripts and custom instructions are preserved, not translated. A saved language takes effect immediately and persists after reopening. OS dialogs/keyboards and installed speech voices remain device-owned. Physical-device and fluent-speaker acceptance are still required; see the [implementation contract and retest](docs/localization-contract.md).

## Live Captions implementation and next acceptance

The OpenAI migration passed 163 app tests, 123 backend tests, TypeScript checking and web export. A synthetic English sample passed the actual OpenAI → DeepSeek path with two bilingual final captions and a clean stop. One pre-existing dropped-PM translation was caught by the unchanged validator; the translation prompt now explicitly requires preserving clock dayperiods. See the [verification record](docs/openai-stt-migration.md#verification-record), including phone limitations and remaining human-language QA.

**Implemented:** [Urdu-first bilingual Live Captions](docs/live-captions-bilingual-output.md): choose speaking language (Urdu default; English available by button or local swipe) while stopped, then start the mic. DeepSeek derives both output languages from each stable segment; independent output tabs switch locally. This explicitly supersedes automatic-only input and the earlier English-bypass requirement for Live Captions. Chat/FTF and their device TTS are unchanged.

The new **Navigation shortcuts** strip exposes six gesture routes and equivalent buttons. Only its expanded pad navigates; the separate caption pad changes input language. Profile → Settings → Swipe gestures disables both pads without removing buttons. Navigation never initiates emergency calls, passport sharing or camera permission.

**Deadline UI simplification:** the strip now opens a half-height modal with a larger pad. Captions keeps the main language/mic/read flow visible, secondary actions under **More**, and connection preparation under **Profile → Settings → Speech setup** for the demo operator. Runtime pairing still expires after one hour or app reload/restart. Mixed-language recognition remains a known limitation; the hackathon demo should use English speech with English input or Urdu speech with Urdu input. No further engine changes were made in this pass.

The app uses a one-time local connection code rather than embedding provider keys or the backend operator token. Audio stays in memory; raw Hindi source and unfinished provider output never reach captions. Stop releases capture and drains bounded pending work; navigation/backgrounding cancels it. No automatic cloud replay or device-English fallback is used.

Chat/FTF retain `src/speech-input.ts` and `src/speech-engine.*`. Live Captions has its own controller/capture hook; tab switching cannot restart it. `src/transcript-storage.ts` preserves selected-language text and old History records. Keep provider keys and the operator token only in `server/.env`. Keep `src/router.ts` deterministic. Read the [verification/audit record](docs/qa/live-captions-bilingual-audit.md) before treating this prototype as ready for sensitive use.

Backend commands (after [server-only setup](docs/stt-backend.md#setup-on-this-pc)): `npm run backend:start`, `npm run backend:pair`, `npm run backend:test`. Follow the [new live microphone QA](docs/live-captions-qa.md); the older WAV smoke command still verifies source mode, not the new bilingual screen. The server stays loopback-bound; Android USB forwarding provides private access during local QA.

## Native microphone setup

`expo-dev-client` is installed and the Android application ID is `com.humahang.mobile`. A new native build must still be compiled and installed; JavaScript bundling is not an APK build. Follow the [PC-specific Android steps](docs/qa-guide.md#android-native-build-on-this-pc). Once installed, use `npm run start:device`, not Expo Go. Tests: `npm test`; type check: `npx tsc --noEmit`.
