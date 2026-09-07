# Live Captions: OpenAI recognition migration — 2026-09-07

This replaces the Deepgram-default implementation, not the app's caption workflow. It supersedes older provider descriptions in the historical QA records. Scope: **Live Captions recognition only**.

## Architecture and isolation

- Existing microphone capture → authenticated local backend → OpenAI `gpt-4o-transcribe` → existing DeepSeek paired `{ur,en}` processing → existing caption UI.
- `server/openai-stt.mjs` adapts OpenAI's session, audio-buffer and transcript events to the existing stream interface. The client protocol, grants, session quotas and translation pipeline are unchanged.
- OpenAI receives real mono PCM16 at 24 kHz. A bounded, filtered streaming resampler converts existing phone 16 kHz and browser 48 kHz capture; it does not relabel audio or change native recorder dependencies.
- Ready means the transcription settings were acknowledged, not merely a connected socket. Server VAD creates sentence/turn boundaries. Stop flushes capture, disables VAD with an acknowledged barrier, commits remaining audio, and waits for ordered final results before the existing translation drain closes the session.
- Item IDs/previous-item IDs preserve ordering and suppress duplicates. Synthetic `Results.start` values are internal ordering keys, **not acoustic timestamps**. Raw deltas and source Hindi never bypass the existing bilingual validation.
- Explicit Urdu/English **input** controls still apply while stopped. Urdu/English **output** tabs still switch already-generated results locally. This change does not promise perfect mixed-language recognition or instant translated word-by-word captions.
- DeepSeek's provider/model, paired-output contract and validator remain intact. A narrowly scoped prompt clarification now explicitly preserves clock AM/PM after a real test caught a dropped dayperiod. Caption storage, manual drafts, navigation, chat/FTF device recognition, device TTS, AI Vision and Sign Assistant are unchanged. Image analysis still uses `OPENAI_VISION_MODEL`, not the transcription model.
- Audio is forwarded in bounded memory; no app-owned audio storage or logging is added. OpenAI/DeepSeek processing and account retention policies still apply. Sharing a key also shares account quota/billing; it is not capacity isolation.

## Activate on this PC

The existing `OPENAI_API_KEY` in **server/.env** is reused. No new key belongs in Expo or the app. Defaults are:

```dotenv
STT_PROVIDER=openai
OPENAI_STT_MODEL=gpt-4o-transcribe
OPENAI_VISION_MODEL=gpt-4.1-mini
```

Keep `DEEPSEEK_API_KEY` and `STT_CLIENT_TOKEN` unchanged. No reinstall is required. Stop the **backend terminal** with Ctrl+C, then run `npm run backend:start` in the project root. The startup line must say `Caption recognition: openai (gpt-4o-transcribe)`.

Refresh the app. Reconnect once in **Profile → Settings → Speech setup** with the fresh startup connection code, then return to Live Captions. Restarting the backend invalidates old grants for photo features too; a fresh shared connection restores them. The Expo terminal can stay running.

## Deliberate rollback

Set `STT_PROVIDER=deepgram` in server/.env, keep its valid `DEEPGRAM_API_KEY`, restart the backend and reconnect. This is an operator decision, not a user language control. There is **no automatic fallback, retry or replay of audio to another provider**. OpenAI remains available for photos when its key is configured.

## Quick acceptance: PC, then supported phone build

1. Select Urdu input while stopped. Say **“مجھے پانی چاہیے”**. Expect readable Urdu and the same meaning in the English output tab; never Hindi text.
2. Stop, wait for processing, select English. Say **“Please bring water at 3 PM. I do not need help.”** Both versions must preserve the time and **not**. Tabs must not restart the mic or duplicate text.
3. Speak a sentence and press Stop immediately after the last word. The microphone must release, the final sentence must finish processing, and the screen must leave the stopping state. Start again: previous text stays, new text appends once.
4. Save Urdu and English separately; open History. Both labelled records and older saved transcripts must remain readable.
5. Leave Live Captions while recording. Recording must stop; returning must not restart it automatically. Separately stopping your backend should produce a safe retryable error, not endless listening.
6. Regression check: analyze a photo, switch its result to Urdu and use read-aloud; try Quick Speak; send from both chat/FTF participants. These flows should behave as before. Do not capture bystanders or sensitive documents for QA.

Test mixed speech separately and report the sentence, selected input and visible error stage. A translation-validation error is not automatically an OpenAI recognition failure. Human Urdu/mixed-speech quality still needs your acceptance.

**Phone limitation unchanged:** Expo Go cannot load the native Live Captions recorder. Use the existing compatible development build or the [native/USB setup guide](live-captions-qa.md#then-test-your-android-phone). This server-only migration does not add native modules to Expo Go.

## Verification record

- Real account preflight accepted `gpt-4o-transcribe` with Urdu input, 24 kHz PCM, server VAD, and the acknowledged VAD-disable stop barrier.
- A generated, fictional Windows-voice English sample passed actual OpenAI recognition: “Please bring water at 3 PM.” and “I do not need help.” Both final turns arrived and stop drained. No user recording or photo was uploaded for this check.
- Initial real DeepSeek processing dropped PM from the Urdu version of the fictional time sentence. The validator correctly rejected it. Added a regression and an explicit clock-dayperiod instruction; the validator was **not relaxed**. Three text-only retests passed, followed by the complete actual OpenAI → DeepSeek run returning both valid Urdu/English pairs and clean drain.
- `npm test`: **163/163 pass**, including six new full client→HTTP/WebSocket→OpenAI-adapter→bilingual-pipeline cases (provider boundaries mocked).
- `npm run backend:test`: **123/123 pass**, including 28 audio-conversion tests, 13 adapter lifecycle tests, configuration/rollback checks and the clock prompt regression. Existing photo/translation/auth and older Deepgram contract tests remain green.
- `npx tsc --noEmit`: **pass**. Web and Android JavaScript exports: **pass** (not an APK/native build). All 96 generated export files were checked against the configured server/root secret values: no matches. Tests run against the final implementation, not the old running backend process.
- Read-only adapter audit found no additional critical defect. Real human Urdu/mixed accuracy, physical microphone/device acceptance and production deployment remain unverified by this migration. Synthetic/provider-double checks are not proof of Urdu accuracy.

Official references: [Realtime transcription](https://developers.openai.com/api/docs/guides/realtime-transcription), [server-side WebSockets](https://developers.openai.com/api/docs/guides/realtime-websocket), [gpt-4o-transcribe](https://developers.openai.com/api/docs/models/gpt-4o-transcribe). This adapter intentionally uses the verified server-VAD-compatible model/configuration, not the different `gpt-live-transcribe` session contract.
