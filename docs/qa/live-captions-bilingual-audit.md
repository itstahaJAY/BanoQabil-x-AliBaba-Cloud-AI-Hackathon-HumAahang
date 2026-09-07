# Bilingual Live Captions: implementation and audit

Date: 2026-09-07. Scope: the revised Live Captions vertical slice and its existing authentication, storage, localization and lifecycle boundaries. This is not a claim that every unrelated app engine is implemented or that the app is production-certified.

**Later revision, same date:** explicit stopped-only Urdu/English input, six bounded navigation gestures and stage-specific errors now supersede the automatic-only input statements below. See [current contract](../live-captions-bilingual-output.md), [navigation contract/QA](../navigation-gestures.md) and [latest gesture/input audit](navigation-input-audit.md). The remaining sections preserve the earlier implementation evidence.

## Implemented and reviewed

- Single mic → browser/native PCM capture → authenticated local service → Deepgram Nova-3 `multi` → conservative DeepSeek paired Urdu/English output. No device-recognition fallback or spoken-language selector in Live Captions.
- Urdu-first local output tabs, selected-language text saving, independent manual drafts, text sizing, ordered results, safe failures and translated UI/error copy.
- Server-only provider/operator keys; one-use local pairing codes; origin-bound runtime grants and WebSocket tickets. Browser origin checks and loopback binding remain. Native transport explicitly uses `humahang://native` consistently on HTTP and WebSocket; this is not a substitute for authentication.
- Capture cancellation on navigation/background; startup, session and drain deadlines; bounded PCM/segment queues; no source/Hindi fallback, audio files, background recording or provider-data logging by the app.
- Legacy source-mode API behavior, device TTS, chat/FTF sender ownership, Passport and existing History data preserved.

## How the requested skills changed the work

`using-agent-skills` routed work into independently testable capture, backend contract and presentation slices, then integration/security/browser verification. Three bounded agents worked on those slices; root integrated the call chain and independently inspected platform-specific seams.

`ponytail` kept the backend on Node primitives and the existing `ws` dependency, reused existing locale/History storage, and kept output selection a pure projection rather than another network workflow. One pinned native recorder dependency was necessary: existing device recognition cannot supply cloud PCM, and Expo's file recorder is not this continuous streaming interface. No provider SDK, database, authentication framework, speculative language router or unrelated screen rewrite was added. Audit did not remove validation or error handling merely to shorten code.

## Defects caught and corrected during review

| Finding | Correction / regression evidence |
| --- | --- |
| Recorder teardown could leave Stop stuck forever | Drain deadline armed before awaiting hardware stop; deferred-stop regression. |
| Old cancelled bootstrap 401 could clear a newer paired identity | Request-token and abort ownership checks; deferred401 regression. |
| Worklet flush failure could leave AudioContext open | Unconditional cleanup; failing-port hardware-double regression. |
| Callback batch could emit audio after cancellation mid-buffer | Check cancellation between frames; native/browser capture regressions. |
| Android default WebSocket Origin differs from native HTTP | Explicit shared native Origin; transport tests plus server handshake/mismatch regression. |
| Native WebSocket does not provide usable bufferedAmount | Independent three-minute client capture deadline, in addition to server limits; silent-transport regression. Browser send-buffer guard remains. |
| Native startup acknowledgement could reveal a lower sample rate | Recheck queued bytes against acknowledged rate before bootstrap. |
| Normal close hid an earlier failed-translation warning | Preserve the message when committed results finish draining. |
| Save could overwrite the other language / imply manual edits were translated | Separate output/manual record IDs and unverified manual metadata. |
| RN Web omitted selected/expanded accessibility state | Explicit web ARIA props; verified selected-tab/disclosure behavior in browser. |
| Pairing administration accepted non-object JSON | Exact object/body validation; route integration regression. |

## Verification actually performed

| Check | Result |
| --- | --- |
| `npm test` | **101/101 pass**. Includes controller, fake-hardware PCM/cancellation, localization, save rules, native transport and legacy regressions. |
| `npm run backend:test` | **47/47 pass**. Includes source compatibility, bilingual validation, auth/origin/ticket/revoke, limits and streaming. |
| Joined end-to-end wiring (`tests/caption-e2e.test.mjs`, included above) | Actual client→loopback HTTP→WebSockets→server pipeline→bilingual processor; synthetic PCM and fake Deepgram/DeepSeek boundaries. Startup queue, paired result, duplicate suppression, no raw source and tail-before-stop/cleanup pass. |
| `npx tsc --noEmit` | Pass. |
| `npx expo config --type public` | Resolves the registered recorder plugin/permissions. This is not a native build. |
| Expo web + Android export | Pass with `EXPO_NO_DOTENV=1`; JavaScript/Hermes bundle output in ignored `.qa/captions-export`. **Not an APK compilation.** |
| Browser, localhost:8081 | Roman Urdu UI renders; Urdu output initially selected; keyboard arrow navigation changes tab/focus; fixed ARIA selection/disclosure verified; malformed code gives safe localized feedback; manual draft → Save → History reopens exact text with language-unverified metadata. |
| Responsive browser check | 390×844 viewport: document/root width 390, no horizontal document overflow. Temporary viewport reset afterward. This is not physical native UI QA. |
| Browser console | No warning/error logs during the checked screen/manual-save journey. A later intermediate edit briefly referenced the not-yet-created transport module; resolved after the file was added. Final reload rendered normally; older console entries remain historical. No recording/provider journey was attempted. |
| Secret boundary inspection | Provider/operator names absent from exported web bundle; keys only referenced by server code. No `.env` values read/printed during inspection. This is a scoped code check, not a guarantee against unrelated secret history. |

Browser QA added one deliberately fictional local History entry beginning **“QA only — fictional manual caption”**. Existing History/preferences were retained. No real microphone permission was accepted, no real speech captured and no paid provider call made.

## Dependency audit and remaining risks

- `npm audit --prefix server --omit=dev`: **0 reported vulnerabilities**.
- `npm audit --omit=dev`: **13 moderate, 0 high/critical**, in the existing Expo/router dependency chains (`decode-uri-component/query-string` and `uuid/xcode` plus affected parents). The new recorder is not listed. npm's proposed fixes include incompatible Expo/router downgrades; no forced upgrade/downgrade was applied. Track these before public release, with compatibility-aware updates. [Decoder advisory](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr), [UUID advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq).
- Native compilation and actual permission/codec/device-interruption behavior remain **NOT RUN**. The recorder's published compatibility table does not yet explicitly list RN0.86. Expo Go cannot run this module. A physical development build is a required gate, not optional proof replaced by Hermes export.
- Deepgram Urdu/English/mixed recognition, meaning/negation/name preservation, translation latency and provider configuration remain **NOT RUN**. Structural script/numeric validation cannot prove meaning. Text refinement cannot reconstruct speech that STT misheard.
- Native RN does not expose a functional send-buffer counter. Frames and duration are bounded, and the server validates rate/buffers, but native network-stall/backpressure behavior requires physical QA. This is not a fully instrumented production transport.
- Grants are local-demo credentials, not multi-user identity. Revocation prevents new sessions/pending tickets, not remote termination of every already-open socket; the app disconnect closes its own socket. Server restart clears everything. Public hosting requires reviewed identity, quotas, TLS/WSS and privacy/retention settings.
- Client HTTP JSON response length is checked after reading the body, not as a streaming memory cap; this local backend returns small bounded responses. Do not generalize the client to arbitrary untrusted services without a streaming response bound.
- Transcripts and grants are screen/runtime memory unless selected text is explicitly saved. Leaving an unmounted screen loses unsaved text. Saved text remains unencrypted local app storage; no encrypted cloud backup is implied.
- Node tests report the pre-existing package-type warning; Expo export reports a color-environment warning. Neither was suppressed by changing unrelated module configuration.

Next acceptance: follow [the short PC setup, Android build/USB steps and C01–C11 tests](../live-captions-qa.md). Keep native and browser results separate, and mark blocked/not-run checks honestly.
