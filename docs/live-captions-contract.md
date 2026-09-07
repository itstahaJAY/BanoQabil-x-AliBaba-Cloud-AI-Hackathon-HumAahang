# Live captions: mobile lifecycle and multilingual boundary

**Superseded for Live Captions (2026-09-07):** [Urdu-first bilingual output](live-captions-bilingual-output.md) is now implemented: one mic, real PCM capture, Deepgram input, DeepSeek paired translation and output-only tabs. Use the [current setup and QA](live-captions-qa.md). The device-fallback implementation and QA below are a historical record, not current Live Captions behavior. Chat/FTF retain their device recognizer. Real provider and native hardware acceptance remain pending.

Historical implementation: work began 2026-09-06; the notes below describe the earlier device-only phase.

**Step 2 update:** the user evaluated and selected Deepgram multilingual with Hindi as a backend intermediate, converted to Urdu using DeepSeek; English bypasses conversion. The [backend contract, implementation and QA](stt-backend.md) supersede the provider-selection/endpoint planning below. The backend is tested locally with provider doubles; live credentials/accuracy and frontend/native capture integration remain unverified. Device TTS is retained, and no spoken-language selector will be reintroduced. The existing device fallback described here is still the active app behavior until integration.

## Report and diagnosis

The user confirmed the failing phone runs **Expo Go**, while PC localhost web recognition works. Expo Go lacks this app's optional `expo-speech-recognition` native module. Reloading JavaScript cannot install it. Use the [native development-build setup](qa-guide.md#android-native-build-on-this-pc) for mobile microphone QA. The relevant diagnostic is the message **inside the app below the recording control**, not the browser console.

A separate reproduced controller defect treated every device `end` as a user pause. Tests failed before the fix: continuous recognition returned idle at a clean sentence boundary, and silent startup had no distinct failure outcome.

## Implemented now

- `src/speech-input.ts`: clean continuous service endings reconnect after 350 ms, with round ownership rejecting queued callbacks from the previous run. Consecutive empty clean sessions are limited to two reconnects. Permission, network, audio-capture, language and no-speech errors stop with feedback, not unlimited retries. A missing start acknowledgement times out after 15 seconds. These reconnects can have gaps; they are not gapless streaming.
- Explicit Pause stops the engine, including while a restarted microphone is opening. Cancel/navigation/background/disposal prevent scheduled reconnects. Committed captions survive interruption. Chat/FTF retain their single-utterance, original-sender, review-before-send behavior.
- `app/transcription.tsx`: no English/Urdu selector. Setup failure is **Microphone unavailable**, runtime failure offers **Retry**, clean pause offers **Resume**. Setup/error text stays outside the scrolling transcript. Typing/editing, text size, Save and History remain available without recognition.
- `src/caption-provider.ts`: product request is `languageMode: auto`, hints `ur-PK` and `en-US`. Android API 34+ requests both language detection and balanced automatic switching, restricted to those languages. This is **best effort**, not confirmed device capability: recognizers can ignore hints, and models may be missing.
- Web, iOS and older Android temporarily retain single-locale device recognition. To preserve the previous default, the fallback is English for English UI and Urdu for Urdu/Roman UI. This limitation is explicitly displayed; removing the selector does NOT create automatic bilingual recognition. Do not treat changing the app language as the final transcription design.
- `src/use-live-captions.ts` isolates screen-facing lifecycle, preview, segments, availability and provider metadata. It is the replacement boundary for cloud integration, not an implemented HTTP endpoint. No provider dependency, credentials, HTTP upload or new audio storage was added.
- Auto-switch-requested records use `und` (language unknown), displayed as **Language not verified** in History. Existing `en-US` / `ur-PK` metadata remain readable and reflect the recognizer configuration, not a verified classification of authored text. Transcript text is never translated.
- All new visible copy has English, Urdu and Roman Urdu entries.

## Backend phase: acceptance before choosing a provider

The requirement is **streaming Urdu, English and within-sentence code-switching**, not translating all speech into one language. UI locale controls interface text; the final recognizer must not depend on it.

Deepgram documents Urdu as a Nova-3 monolingual language, but its listed `multi` streaming set does not include Urdu. Its `detect_language` feature is for pre-recorded audio, not streaming. Do not claim that either parameter solves this requirement. Android switching likewise depends on the recognition service and installed models.

Sources checked 2026-09-06: [Deepgram model/language matrix](https://developers.deepgram.com/docs/models-languages-overview/), [Deepgram language detection](https://developers.deepgram.com/docs/language-detection), [Android automatic language switching](https://developer.android.com/reference/android/speech/RecognizerIntent#EXTRA_ENABLE_LANGUAGE_SWITCH), [browser recognition language](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/lang), [installed package setup/limitations](https://github.com/jamsch/expo-speech-recognition).

Next vertical slice:

1. Evaluate candidate streaming engines against consented, non-sensitive Pakistani Urdu, English and mixed samples; include names, numbers, quiet/noisy environments and switching mid-sentence. Agree accuracy and latency thresholds before selection. Language detection alone is insufficient.
2. Define the authenticated session endpoint and audio transport (encoding/sample rate, packet ordering, reconnect semantics, expiry and rate limits) before implementing it. Keep long-lived provider credentials server-side; no Expo public secrets.
3. Normalize interim/final events with session ID and segment ID, optional detected language, and typed errors (permission, unavailable, unsupported language, network, timeout). Replace interim hypotheses, append each final segment once, ignore stale sessions. Validate external payloads at the adapter boundary.
4. Wire that adapter behind the caption hook. Cancel/close must stop capture and transport; resume preserves committed text. No background recording or automatic retry after explicit pause. Save remains local text only unless the user explicitly approves a new storage policy.
5. Verify native audio capture and browser capture separately, with permission denial, offline/reconnect, mixed-language accuracy and cancellation QA. Streaming transcription and the disabled Translate action are separate features.

## Focused user QA

1. **LC01 / Expo Go:** open Live Transcription. Expect a visible native-build explanation and disabled Unavailable control, not an endless Resume loop. Edit/type a fictional sentence, enlarge text, Save and reopen History. Actual microphone recognition is BLOCKED in Expo Go, not PASS.
2. **LC02 / PC localhost:** no English/Urdu buttons. The card honestly says device fallback. Start and grant permission yourself; speak two sentences. Pause, speak (no added text), Resume, speak again. Prior text remains. Check errors in the app, not only the console.
3. **LC03 / installed development build:** repeat LC02, then allow a service sentence boundary. Where the service ends cleanly, expect a short Reconnecting state and resumed listening, not a false pause. After repeated empty sessions, expect actionable Retry instead of an endless loop. No-speech errors may require a manual Retry.
4. **LC04 / stopping safety:** Pause during reconnect or startup; navigate away or background the app while listening. There must be no later restart, appended late text, or microphone activity after cleanup. Resume is an explicit user action.
5. **LC05 / languages:** Android 14+ may attempt Urdu/English switching, but missing models/service support are real limitations. Test an Urdu sentence, English sentence, and `Mujhe kal 3 PM par appointment chahiye`. Record what was actually transcribed. Web/iOS/older Android mixed recognition is DEFERRED until a qualified backend, not a completed feature.
6. **LC06 / regression:** test new setup/error notes in all three UI languages and at narrow phone widths. Save and reopen mixed-script typed text unchanged. Check chat/FTF microphone draft ownership and review-before-send still work in a supported build.

## Verification evidence

- Regression tests use fake recognition events and real controller/policy code; they do not prove physical audio recognition or OS microphone release.
- Native Expo Go limitation is confirmed by the user's environment report and optional module lookup; no APK was built/installed in this change.
- **69 tests and TypeScript pass.** Final web and Android JavaScript exports pass (`.expo/captions-web-check`, `.expo/captions-android-check`). A JavaScript export is not a native-device test.
- Browser QA at 375 × 812: no selector, mixed-script typed text, larger text, Save feedback and History record verified on isolated `127.0.0.1`. One fictional `Captions QA` transcript remains there; existing records and the user's localhost data were not removed. HTTP LAN preview visibly shows the HTTPS warning outside the scroll area and a disabled Unavailable control. No warning/error console entries in the inspected browser flows. Temporary tab closed and viewport reset.
- No live microphone permission granted, speech audio sent, native recognition performed or mixed-language accuracy certified during this verification. Urdu/Roman new copy is checked by catalog tests, not fluent-speaker acceptance.
