# Live captions: Urdu-first bilingual output

**Provider update (2026-09-07):** [OpenAI recognition migration](openai-stt-migration.md) replaces Deepgram as the default STT stage, retaining this input/output contract. Deepgram mentions below describe the earlier implementation or explicit rollback. OpenAI receives filtered 24 kHz audio through an isolated server adapter; existing capture and DeepSeek paired-output validation stay intact.

Date: 2026-09-07. Status: **implemented local frontend/backend contract; real microphone/provider accuracy and native-build verification remain pending**. This document supersedes source-language-preserving output and English-conversion-bypass requirements **for Live Captions only**. Existing chat/FTF behavior is not implicitly changed.

## Current implementation and historical diagnosis

`app/transcription.tsx` now calls `src/use-live-captions.ts` → `src/caption-client.ts` → platform-specific PCM microphone capture and the local speech backend. Live Captions no longer invokes the device/browser recognizer. The earlier screenshot showing `English · Device fallback` and “Mary meeting” came from that old recognizer, not Deepgram. Successful `/health` still confirms startup only; it does not validate provider keys or audio accuracy.

Web capture uses `getUserMedia` and `AudioWorklet` with mono PCM16 at 48 kHz in 100 ms frames. `AudioContext` performs browser-side resampling; HTTPS or localhost is required. Native capture uses pinned `react-native-audio-api@0.13.3` with `AudioRecorder.onAudioReady`, requesting mono 16 kHz PCM and validating each returned buffer's sample rate. No file recording is enabled. Both paths release capture on cancellation and reject late callbacks.

The native recorder is **not included in Expo Go**. Its optional native lookup keeps Expo Go/older builds usable but reports an actionable development-build requirement instead of falling back to English recognition. Expo Audio supports file recording in Expo Go, but its documented API does not supply the continuous raw microphone PCM callback used here. Native compilation and physical device behavior have not been verified; the library's published compatibility table does not yet explicitly cover this installed React Native 0.86 version.

## User-defined behavior

1. **Latest input decision:** Urdu is the default speaking language; choose English/Urdu by tappable controls or the labeled local swipe area (left English, right Urdu). Changes are accepted only while stopped, after capture release and pending translation complete. A device voice announcement identifies the choice; native screen readers use their announcement mechanism. The mic waits for voice indication to finish or confirmed Stop voice. This supersedes the earlier automatic-only input requirement.
2. One microphone button starts capture after permission/consent. Stream to the backend, then Deepgram Nova-3 with the session's explicit `language=ur` or `language=en`. The API key stays server-side and is not language-specific. Legacy clients omitting input language retain `multi`; mixed recognition quality is still an acceptance test, not guaranteed by a selector.
3. For each stable speech segment, call DeepSeek to conservatively refine the transcript and produce **both an Urdu version and an English version from the same source**.
4. Show Urdu by default, including when the person spoke English. This is now translated live captioning, not strictly verbatim transcription in the original language.
5. The `اردو / English` tabs choose the displayed output only. Switching does not restart recording, change recognition language, translate a translation, or make another provider call. Switching back restores the already-generated Urdu version.
6. A second tap stops capture. Process already-captured final speech with bounded waiting, preserve completed text, and allow an explicit later restart. Leaving/backgrounding cancels capture and pending callbacks. No background recording.

The interface language setting remains independent: English menus may show Urdu captions; Urdu menus may show English captions. Device text-to-speech remains the MVP playback engine.

## Local pairing, not a language setup step

**UI simplification:** pairing now lives in **Profile → Settings → Speech setup**, intended for the demo operator. The ordinary caption screen shows a small setup-needed link only while disconnected; after connection it shows speaking language, mic, output tabs and captions. Secondary controls live under More; Save appears with text. Setup/Back refreshes the shared runtime connection without replacing the existing caption controller, language or completed text. No credential persistence or authentication bypass was added. A deployed user-facing version needs automatic authenticated session provisioning through its hosted backend; that is not implemented by moving this form.

The local demo requires one connection setup before the mic is enabled. The backend terminal prints a ten-character, single-use pairing code valid for five minutes; `npm run backend:pair` requests a fresh code. Enter that code on **Speech setup** and press **Connect**, never enter a provider API key. Successful pairing issues an origin-bound client credential valid for one hour. The app retains it only in runtime memory, so a full reload, expiry, backend restart, or explicit disconnect requires pairing again.

The long-lived operator token and both provider keys stay in `server/.env`; they are not shipped in Expo public variables. Each recording uses an authenticated bootstrap plus a short-lived, one-use WebSocket ticket. The default backend remains loopback-only at `127.0.0.1:8787`; Android USB testing can use `adb reverse tcp:8787 tcp:8787`. This is not a deployed authentication system or authorization to open the server to a LAN/public network. See [backend setup and QA](stt-backend.md) for maintained commands and deployment boundaries.

Native HTTP and WebSocket use the same explicit `humahang://native` Origin through `src/caption-transport.ts`; browser-origin headers remain browser-owned. The server allows that exact native origin while retaining authentication and loopback Host checks. This avoids Android's implicit WebSocket origin differing from native fetch. Both client and server bound a listening session to three minutes; native WebSocket does not expose usable bufferedAmount, so physical network-stall QA remains necessary.

## Refinement is not re-recognition

- Permit punctuation, spacing and cautious grammatical cleanup that preserve what was said. Translate meaning faithfully into each output language.
- Do not invent missing speech, infer a different sentence from vague context, add facts, reverse negations, alter names/numeric values/times, or turn uncertain text into confident claims.
- If STT produces “Mary meeting” for “مجھے پانی چاہیے”, a text-only model cannot reliably reconstruct the correct utterance. Fix/evaluate the recognition/audio layer; do not hide the failure behind plausible model output.
- Source text and detected-language metadata are transient processing inputs; source timings drive ordering/deduplication. Provider confidence is not currently calibrated or presented as a needs-review score. Adding such a score would require real evaluation, not LLM-invented confidence.
- No raw Hindi/Devanagari in visible previews, final captions, errors, read-aloud or saved text. Reject invalid provider output; do not use raw Hindi as a failure fallback.
- Interim hypotheses are withheld in bilingual mode and never sent to DeepSeek. Repeated revisions would increase cost, flicker and semantic drift. The implementation shows listening/processing feedback while stable translated results are pending; source-English captions do not flash in the default Urdu view.
- This produces near-real-time translated segments, not guaranteed instantaneous word-by-word translation. Measure end-of-speech-to-display delay for Urdu and English rather than promise zero delay.

## Implemented responsibility boundaries

| Area | Responsibility | Existing code / boundary |
| --- | --- | --- |
| Capture | Permission, microphone ownership, correct audio bytes, immediate stop/release | `src/caption-capture.web.ts`, `src/caption-capture.ts`, shared PCM encoder; chat/FTF input unchanged |
| Secure transport | Pairing, bootstrap, authenticated audio, session ownership, expiry, cancellation | `src/caption-client.ts`, `server/client-access.mjs`, `server/server.mjs`, `server/stream.mjs`; loopback-only |
| Recognition | Session-selected Urdu/English source segments, timestamps, stable boundaries | Deepgram adapter in `server/providers.mjs`; legacy clients retain multilingual configuration |
| Bilingual processing | One bounded DeepSeek request per accepted stable segment, validated paired outputs | `server/providers.mjs`, `server/bilingual.mjs`, `server/pipeline.mjs`; old converter remains separate for source mode |
| Presentation/storage | Urdu-first view, local tab switching, ordered segments, text size, explicit Save | `app/transcription.tsx`, `src/caption-view-model.ts`, locale catalogs and existing transcript storage |

The vertical slice is wired: microphone → authenticated backend → validated bilingual segment → Urdu display and English tab. Next verify it with consented real PC audio, then a native development build plus secure phone connectivity. Automated tests do not establish recognition quality or that an OS released a physical microphone. Authentication/origin checks remain active; no token is exposed in the Expo bundle to bypass setup.

## Negotiated processing contract

`POST /v1/stt/sessions` accepts the existing audio object plus `mode: "bilingual", inputLanguage: "ur" | "en"` for this screen. Input language is bound to its authenticated ticket and cannot be changed by a midstream control. Omitting input language retains `multi`; omitting mode retains source-preserving v1 output for existing consumers and the smoke tool. Bilingual mode emits `processing`, then a validated `caption_final` pair or safe `segment_error`. Session lifecycle events remain shared.

Failures can include the safe stage `recognition_input`, `translation_request`, or `translation_validation`; the UI maps only these known values to localized messages, never raw provider text. Reported `PM`/`3:00` validation failures were reproduced with provider doubles: clock-bound AM/PM is converted into Urdu script before the strict output gate, and equivalent explicit times compare equally. Changed hours, minutes, dayperiods, dropped dayperiods and numeric counts becoming times remain rejected. This identifies and fixes those validator cases; it does **not** establish the stage of the user's previous live failure.

The server owns session ID, sequence and source timing. DeepSeek receives source text and language metadata, not microphone audio or trusted event IDs. Both returned language versions are derived from that source, not by translating Urdu → English → Urdu on each tab click.

Paired WebSocket final event:

```json
{
  "type": "caption_final",
  "sessionId": "opaque-session-id",
  "sequence": 1,
  "outputs": { "ur": "مجھے پانی چاہیے۔", "en": "I need water." }
}
```

- The model returns only the language content, not trusted IDs. The server validates exact schema, length, Urdu/English scripts and numeric tokens, including equivalent Arabic/Urdu digits. The client independently rejects unsafe output shapes/scripts. These are mechanical safeguards; names, negations, meaning and recognition accuracy still require real speech/fluent-speaker evaluation.
- Emit the pair atomically after validation so tabs cannot show different utterances. Missing/invalid versions produce a safe segment error. Store completed pairs in session memory and select a field locally.
- One ordered queue bounds pending segments, deduplicates provider final frames by timing without removing legitimate repeated utterances, rejects stale session callbacks and aborts work on cancel. Capture startup has a byte-bounded queue targeting two seconds at the negotiated sample rate; overflow fails visibly rather than growing indefinitely. There are no unlimited retries or calls caused by output-tab switching.
- English-only speech now intentionally requires DeepSeek too, because the default displayed output must be Urdu. This supersedes the prior zero-conversion-cost English path for this feature. Provider disclosure must now state that **all finalized caption segments**, not only Hindi segments, are sent to DeepSeek.
- Explicit Save keeps finalized, selected-language text with `ur-PK` or `en-US` metadata after capture/processing stops, not pending placeholders or provider source. Output-language records have separate IDs, so saving English does not overwrite Urdu. Existing History records remain readable. Manual editing is a separate, clearly marked draft saved with `manual` metadata; it does not modify the live pair or pretend to translate the other tab. Both translations remain session-memory data unless individually saved; no bilingual History migration was introduced.

## UI states and regression boundaries

- Initial: explicit Speaking language selector (Urdu default), prominent microphone action, empty caption area and independent Urdu/English output tabs (Urdu default). The mic is disabled until local pairing completes. Input selection does not change existing output pairs or UI locale.
- Starting/listening: real permission/connection state, clear recording indication and a stop action. No fictional transcript or automatic microphone permission acceptance.
- Processing: existing text remains; show pending feedback without raw provider text. Stop releases capture immediately even while translation is pending.
- Result: Urdu RTL, English LTR, switchable from the same stored segment list. Tab switching must preserve scroll context/recording state and make zero network calls.
- Interrupted/error: retain committed text, give explicit retry, do not claim successful captions or silently use device-English recognition.
- Preserve larger text, explicit text-only saving and a clearly identified manual-entry fallback. Local UI strings must exist in English, Urdu and Roman Urdu. The output tabs are Urdu/English, not a third Roman Urdu translation mode.
- Do not replace device TTS, change conversation speaker ownership, rewrite Passport/QR data or redesign unrelated screens.

## Acceptance and verification

1. English-only input: Urdu translation shown initially; English tab restores faithful English; all numeric values retained.
2. Urdu-only input: Urdu script, never Devanagari; English tab has the corresponding meaning.
3. Mixed input: both complete language versions refer to the same utterance; no dropped English words/meaning, times or negations.
4. Toggle repeatedly: zero extra recording starts or API calls; no transcript mutation/translation drift; future segments appear in whichever output tab is active.
5. Invalid/empty/timed-out DeepSeek response: safe error/processing state, existing final text intact, no raw fallback. Duplicate/failing/out-of-order work cannot corrupt segment order.
6. Low-quality recognition: test the reported “mujhe pani chahiye” example on real Deepgram audio. Do not count a plausible DeepSeek guess as proof that STT is fixed.
7. Mobile: separate capture permission/codec/network tests from recognition accuracy. Expo Go intentionally reports that this recorder needs a development build. Verify installed development-build behavior physically, including disconnecting USB/headphones and backgrounding.
8. Stop/navigation/background: hardware capture off, transport cancelled as appropriate, no later appended results, no automatic restart. Provider failures are visible in all UI locales.
9. Save: completed selected-language text reopens unchanged; old History stays readable. No automatic audio/source logging or storage.

Use `npm run backend:test`, `npm test`, and `npx tsc --noEmit`. New regression suites cover paired-output processing, source-mode compatibility, pairing, client lifecycle, output selection/save rules and fake-hardware capture cleanup. These checks are not real provider or microphone verification. No native compilation, real audio capture or live provider calls are claimed by this document; consented audio tests use API credit. The [backend guide](stt-backend.md) and implementation audit record hold current verification results and remaining QA.

## Verified external constraints

- [Deepgram Nova-3 Urdu support](https://developers.deepgram.com/changelog/2026/8/17) and the [language matrix](https://developers.deepgram.com/docs/models-languages-overview/) support explicit `ur` and `en`. [Multilingual configuration](https://developers.deepgram.com/docs/multilingual-code-switching) remains available to legacy clients; neither mode proves mixed-language accuracy.
- [Expo Audio](https://docs.expo.dev/versions/latest/sdk/audio/) supports file recording in Expo Go, but is not the raw streaming adapter selected here.
- [React Native Audio API setup](https://docs.swmansion.com/react-native-audio-api/docs/fundamentals/getting-started/) documents development-build and Windows Bash requirements. Its [AudioRecorder callback](https://docs.swmansion.com/react-native-audio-api/docs/inputs/audio-recorder/) supplies audio buffers; the [Expo plugin](https://docs.swmansion.com/react-native-audio-api/docs/other/audio-api-plugin/) configures microphone permissions. Background recording is not enabled. The [compatibility table](https://docs.swmansion.com/react-native-audio-api/docs/other/compatibility/) does not yet explicitly list RN 0.86; installed source inspection is not a successful native build.
- [AudioWorkletNode](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletNode) and [AudioContext sample rate](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/AudioContext) document the native browser capture-processing primitives.
- [Existing speech-recognition library](https://github.com/jamsch/expo-speech-recognition) remains available to chat/FTF code; it is no longer the Live Captions engine.

Sources checked 2026-09-07. The implemented bilingual mode supersedes only Live Captions output behavior; source-mode v1 and unrelated feature engines remain separate.
