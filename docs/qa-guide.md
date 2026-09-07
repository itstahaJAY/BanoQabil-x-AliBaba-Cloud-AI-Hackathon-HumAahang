# Hum Ahang: step-by-step Phase 1 QA

Prepared 2026-09-05; updated 2026-09-07. This is a test procedure, not a claim that all tests pass. Most Phase 1 controls remain local; the revised Live Captions feature requires the speech backend.

Latest captions update: use the [Urdu-first Live Captions setup and QA](live-captions-qa.md). It supersedes old S09/LC device-fallback, unavailable-Translate and input-language-selector instructions. Chat/FTF voice selection is unchanged. Native Live Captions needs a rebuilt app with `react-native-audio-api`; Expo Go is UI-only for this feature.

Goal: prove that a person can complete the intended frontend journey, understand who is communicating, recover from mistakes, and use the interface on a real phone. A good-looking screenshot alone is not a pass.

## 1. Prepare a test session

1. Use fictional messages and profile data. Never call emergency services as a test or rely on this prototype for real assistance.
2. Record the date, phone model, OS, browser/app version, and whether you are testing web or native. Record the Git commit if available; otherwise use a dated build/session label and avoid code changes during the run.
3. Use these result labels for every case: `PASS`, `FAIL`, `BLOCKED` (cannot run), `DEFERRED` (explicitly outside this phase), or `NOT RUN`. A placeholder is not a pass.
4. Start with the short smoke pass in section 4. Then do the detailed cases one section at a time. Allow roughly 15 minutes for smoke testing and 60–90 minutes for a first detailed pass, excluding fixes.
5. Record defects using section 11. Keep browser and native results separate.

## 2. Start the app on this PC

Open PowerShell in the project:

```powershell
Set-Location 'C:\Users\Admin\Documents\ChatGPT\AliBaba Cloud AI Hackathon 2'
```

If dependencies are missing, run `npm ci` once. It recreates `node_modules` from the lockfile; it is not needed every time you test.

If the existing server already serves this app on port 8081, reuse it. Otherwise run:

```powershell
npx expo start --web --lan --port 8081
```

Keep this terminal open. Use the actual web URL printed by Expo; normally it is [localhost:8081](http://localhost:8081). If the port is occupied, identify/reuse the correct server rather than stopping an unrelated process.

For PC inspection, open the URL in Chrome or Edge. Open Developer Tools with F12, open Console, and enable Preserve log. Use device emulation to test 375 × 812, 390 × 844, and 812 × 375, then return to a normal desktop window. Emulation checks layout, not native behavior.

## 3. Open it on your phone

### A. Mobile browser: quickest UI check

1. Connect phone and PC to the same trusted local network. PC Ethernet is fine if it connects to the same router as phone Wi-Fi.
2. In a second PowerShell terminal, run:

```powershell
ipconfig
```

3. Find the IPv4 address of the active Wi-Fi/Ethernet adapter, not a VPN or virtual adapter.
4. Open `http://YOUR-PC-IP:8081` in the phone browser, replacing the address and using the port printed by Expo. Do not use `localhost` on the phone: that means the phone itself.
5. Keep the PC awake and the server running. If unreachable, check the address, network isolation/VPN, and Windows Firewall. If necessary, allow the development server only on your trusted Private network; do not disable the firewall globally or forward router ports.

Expo documents same-network access and a tunnel alternative for restrictive networks. If LAN access remains blocked, report the setup problem; do not mark the app flow as failed. [Expo connection guide](https://docs.expo.dev/get-started/start-developing/).

Plain HTTP over a LAN IP is suitable for layout/typing checks, but microphone dictation now requires a supported browser in a secure context. Use localhost on the PC or a trusted HTTPS preview on the phone. The HTTP phone link should explain this restriction without recording or inserting fake text. Do not disable browser security or bypass certificate warnings to test it. [MDN capture requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

### B. Native mobile: required before claiming mobile readiness

1. Use an Expo SDK 57-compatible native development build containing `expo-speech-recognition`. Expo Go can still preview other controls but cannot run the new native microphone module. A missing module must show an explanation, not crash. Do not downgrade the repository to fit an installed client.
2. For Expo Go, run `npx expo start --go --lan --port 8081` after stopping your own existing Expo server with Ctrl+C, or use the existing server's launch-target controls. Scan its QR code with the phone.
3. If the client reports unsupported SDK/native modules, save the exact error and ask for a compatible development build. Native release verification should ultimately use that build, not just the web preview. [Expo environment options](https://docs.expo.dev/get-started/set-up-your-environment/).
4. Repeat sections 4–9 on the physical device. Check touch, software keyboard, hardware Back on Android, speech output, and screen reader behavior.
5. Native orientation is currently locked to portrait in `app.json`. Do not report the lack of native landscape rotation as a regression. Web landscape remains a responsive-layout check.

For native microphone testing, the config plugin is already registered. If Android Studio/SDK, JDK, and a connected test device/emulator are configured, `npx expo run:android --device` generates/builds the native project and installs a debug app on the selected device. It can download build dependencies; it was not executed during these fixes. A JavaScript reload or Expo Go QR scan cannot add this native module. A local iOS build requires macOS/Xcode. [Recognition package setup](https://github.com/jamsch/expo-speech-recognition#installation).

### Android native build on this PC

S08's missing-module warning means Expo Go or an old native binary cannot load the recognizer. `expo-dev-client` is now installed; Android package ID is `com.humahang.mobile` for local testing. No APK has been compiled or installed during this fix.

1. On Android, enable Developer options and USB debugging. Connect a data-capable USB cable. Unlock the phone and approve the debugging prompt for this trusted PC.
2. Open PowerShell in this repository. Android Studio's Java and SDK were found at the following paths (2026-09-05); these environment changes affect this terminal only:

```powershell
Set-Location 'C:\Users\Admin\Documents\ChatGPT\AliBaba Cloud AI Hackathon 2'
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = 'C:\Users\Admin\AppData\Local\Android\Sdk'
& "$env:ANDROID_HOME\platform-tools\adb.exe" devices
```

3. The list must show your phone with status `device`. Empty means the PC cannot see the phone; `unauthorized` means approve the phone prompt. During this fix, the list was empty. Do not continue assuming a device is connected.
4. Stop only your own existing Expo terminal with Ctrl+C so port 8081 is available. In the configured terminal run:

```powershell
npm run android:build
```

5. Select your phone if prompted. First build downloads Gradle/native dependencies and can take several minutes. Handle any SDK license prompts yourself after reviewing them. Open the installed **Hum Ahang** app, not Expo Go, and allow microphone/speech permissions when you choose to start dictation. `android:build` builds/installs and starts Metro.
6. For later JavaScript/UI changes, no rebuild is needed; use the already-installed Hum Ahang app with:

```powershell
npm run start:device
```

7. Phone and PC should share a trusted network. For USB testing instead, with the cable connected, run `& "$env:ANDROID_HOME\platform-tools\adb.exe" reverse tcp:8081 tcp:8081` and connect the development client to `http://127.0.0.1:8081`. Rebuild after native dependency/plugin changes. This is a development build, not a distributable production release.

Local iOS compilation is not possible on this Windows PC; it requires macOS/Xcode or a separately configured cloud build. [Expo native device setup](https://docs.expo.dev/get-started/set-up-your-environment/), [development client](https://docs.expo.dev/versions/latest/sdk/dev-client/).

The top FTF app panel is rotated; the system keyboard is not a child of that panel. Physically pass/turn the phone when typing as the other participant and record whether this interaction is usable.

## 4. First run: 15-minute smoke pass

Perform in order. Each item must complete without crash, frozen controls, or an unexpected screen.

- [ ] S01: Finish onboarding and reach Home. On an existing profile, use Profile → Replay onboarding if needed. This reopens the wizard; it does not wipe every stored preference.
- [ ] S02: Visit Home, Communicate, Assist, and Profile; return to Home.
- [ ] S03: Home → Face-to-face opens the split, inverted-top FTF layout, not ordinary chat. Repeat through Communicate → Face-to-face.
- [ ] S04: Send `A-one` and `A-two` from the bottom panel. Both belong to You; both appear in both views.
- [ ] S05: Send `B-one` from the top panel. It belongs to Partner and appears incoming in the bottom view.
- [ ] S06: Open bottom Phrases, select Yes, then No. Both remain authored by You. Repeat from Partner.
- [ ] S07: Use the central Chat button and return through the chat header's FTF button. The conversation is unchanged.
- [ ] S08: In a supported microphone setup, dictate a sentence and review its draft; repeat with Cancel. Nothing is sent automatically. On HTTP LAN/Expo Go, check the setup explanation and mark real dictation BLOCKED.
- [ ] S09: In a supported native build/browser, tap Start and speak two sentences. Pause, wait for finishing, speak while paused (no added text), then Resume and speak again. Previous text remains. Toggle text size; Save while paused; open History and reload/reopen to read the saved text. Translation is BLOCKED pending a backend, not a pass. On Expo Go, test Edit / type transcript and Save but mark actual recognition BLOCKED.
- [ ] S10: Quick Speak → Travel shows one washroom phrase; Medical shows two phrases; Favorites shows three. Speak, switch rapidly, then Stop. Preparing voice must change to Speaking only when audio starts; leaving stops playback. Compare first-tap latency on a cold native launch with later taps; browser timing does not prove native performance.
- [ ] S11a: Open Settings, change one preference, reload/reopen, and verify the switch value persists. This checks storage only.
- [ ] S11b: Test the effect separately: Large text should increase app text; High contrast should change contrast; Voice guidance should announce navigation/status; Auto speak should read applicable messages. These four preferences are currently not connected to runtime behavior. Haptics is connected to sending a non-empty message in conversation/FTF; compare ON/OFF on a supported physical phone.
- [ ] S12a: Return to the app's Home screen using in-app navigation, without a dead end. The phone's system Home button only backgrounds the app and does not prove app navigation works.
- [ ] S12b: Check developer error logs separately. In a PC browser, open F12 → Console, reload the updated app, clear old entries, then repeat Profile → Settings → change a switch → Back → Home. Capture new warnings/errors (yellow or red), not the ordinary startup messages. Repeat with keyboard navigation and browser Back/Forward. Focus must stay on a visible screen/control. On mobile, report any error overlay, crash or freeze; console inspection can remain NOT RUN when logs are unavailable. Redact private text and credentials from screenshots/logs.

If S04–S08 fail, prioritize those before broader cosmetic checks.

### User reports and follow-up: S11 / S12 (2026-09-05)

- **S11a — PASS (user reported):** switch values persist. **S11b — incomplete:** source inspection confirms Large text, High contrast, Voice guidance and Auto speak have no behavioral consumers. Haptics has a real send-message handler, but physical ON/OFF verification was not reported. The captions page's text-size toggle is independent of the global Large text preference. These are frontend/device integration gaps, not prerequisites waiting on a cloud AI engine.
- **S12a — PASS (user reported):** the follow-up screenshot confirms the app returned Home. **S12b — fixed, awaiting user-browser retest:** the user supplied three warnings: deprecated web shadows, aria-hidden retaining focus, and Reanimated transform/layout-animation overlap. The fix preserves native shadows, separates the Home character's entry and floating transforms, and transfers web navigation focus outside outgoing screens before dispatch. No console warnings are suppressed. See [S12 evidence](qa/s12-console-2026-09-05.md).
- S11 setting effects are still incomplete; the S12 fix does not wire those preferences to their advertised behavior.

## 5. Onboarding, navigation, and persistence

| ID | Steps | Expected result / what to record |
| --- | --- | --- |
| N01 | Profile → Replay onboarding. Go through all four steps; use Previous step, then Continue. | Navigation works, selected values survive moving between steps, completion opens Home. |
| N02 | Choose Urdu and a different communication profile; complete onboarding. Open Profile and Passport. | Selected language/profile agree across screens. App-owned copy/navigation should be Urdu and RTL. Follow the [three-language retest](localization-contract.md#user-retest--qr-and-languages); preserve names and authored text. |
| N03 | Toggle Settings options, leave, reopen, and reload the app. | Values persist. Then independently verify their actual effects; a saved switch is not proof of large text, contrast, guidance, or auto-speech working. |
| N04 | Open every Home shortcut and each tool under Communicate/Assist/Profile. Use Back. | Correct destination and a usable route back. Record any wrong route, no-op, or misleading label. |
| N05 | Web only: open `/conversation?partner=hearing&face=1` directly, then Back; also try `/conversation?partner=unknown`. | No crash; FTF has a fallback exit, invalid partner falls back to a valid profile. |
| N06 | Enter a temporary conversation message, reload, then inspect History. Separately save a caption transcript and reopen History. | Chat messages remain in memory only; demo chat shortcuts are labelled. Saved caption text persists independently. Do not claim ordinary chat history or cross-device sync works. |

For a genuinely fresh browser run, use a separate private window and complete onboarding there. Do not erase your normal browser storage. Web, private-window web, and native storage are independent; cross-device sync is not implemented.

## 6. Ordinary conversation: ownership before appearance

Start from Home's adaptive-conversation card, choose a partner, and use unique test text so seeded demo messages cannot be mistaken for your results.

| ID | Steps | Expected result |
| --- | --- | --- |
| C00 | Open the screen on a typical portrait phone with quick messages and details closed. | The message history owns about two-thirds of the viewport; A/B, voice language, Mic, quick messages, input, Send, FTF and navigation remain directly reachable. No root horizontal scrolling. |
| C01 | Select You. Open the speech-bubble quick-message tray. Tap Yes, No, Thank you, and Please call my family, then close the tray. | The contrasting tray opens above the composer, stays open for consecutive sends and returns to the full-height history when closed. All four are You messages, in that order. No index-based sender alternation. The family phrase sends text only; it does not place a call. |
| C02 | Select Partner. Send two phrases and type `Partner typed 123`. Switch back to You and send again. | Authorship follows explicit selection; previous messages never switch sides. |
| C03 | Type `A unsent`, switch to Partner, type `B unsent`, switch back and forth. | Two independent drafts. Sending one clears only that draft. |
| C04 | Try empty input, spaces, a multiline paragraph, emoji, and `مجھے پانی چاہیے۔`. | Empty/whitespace cannot send; valid text appears once, legibly, without clipping. Urdu is readable with sensible direction. |
| C05 | Select EN/Urdu voice language. Start voice input as You, try switching sender, speak a sentence, then Stop. Repeat as Partner. | Sender switching stays disabled until input finishes. Actual recognized words are appended only to the initiating person's draft; review and Send explicitly. Existing draft stays intact; no fixed sample is inserted. |
| C06 | Start voice input, then switch to FTF. | Input is cancelled; no hidden/late recognition is added or sent. The original draft survives. |
| C07 | Repeat with Deaf, Mute, Blind, and Hearing partner choices. Open the information button each time. | Partner identity and direction labels agree with selection; no crash. The optional route detail is a proposed conversion, not proof an audio/translation engine ran. |

For deeper router QA, repeat C07 for each of the four user profiles too (16 combinations). Check both sending directions. Record controls that contradict a person's selected input/output needs; do not assume a routing label makes the interface accessible.

## 7. Face-to-face: detailed regression pass

Start with `You = A`, `Partner = B`. Follow the [FTF design contract](ftf-design-contract.md).

| ID | Steps | Expected result |
| --- | --- | --- |
| F01 | Inspect both halves before typing. | Entire Partner panel is inverted, including text/icons/composer; You is upright. Identity bands meet the central bar; composers sit at outside edges. |
| F02 | Send `A-one`, `A-two` from bottom, then `B-one`, `B-two` from top. | Each view shows the same four new messages in order. Authored messages are outgoing relative to that viewer; received messages have read-aloud controls. |
| F03 | Type a draft in each half. Open/close Phrases and send a phrase. | The mint picker is clearly different from history and names its sender. Phrases act on that participant, picker closes after sending, and neither typed draft is discarded. |
| F04 | With both drafts present, central Chat → header FTF. | Both drafts and all messages survive; neither is auto-sent or duplicated. Exiting the entire conversation is a different action and does not promise persistence. |
| F05 | Tap the center flip control twice. Then focus each participant's input. | Only the central bar changes orientation; participant panels/authorship stay fixed. Composer interaction makes the bar face its participant. |
| F06 | Select EN/Urdu voice language, tap Mic, grant permission yourself, speak a unique sentence, then pause or Stop. | Recognized words appear as a preview then in that participant's draft. Explicit Send is required. Repeat with a pre-existing draft: speech appends without replacing it. Recognition may use the platform's online service. |
| F07 | Start speech input, then use Cancel; wait five seconds. Repeat by leaving FTF or backgrounding during input. | No late result or automatic message; original draft survives. Controls recover. Also deny permission and test silence/service failure: actionable feedback, no fake transcript, no endless Stop state. |
| F08 | On the receiving side, read an older message, then another message before it finishes. Test Stop and natural completion. | Audio matches the exact chosen message. Playback switches without overlapping; Stop/completion clears the active state. If device speech is unavailable, show feedback and keep text usable. |
| F09 | Send an Urdu message and read it aloud from the other side. | Text remains readable; record voice availability/pronunciation separately. An unavailable Urdu voice is not proof transcription failed. |
| F10 | Send enough messages to overflow both histories. Scroll each half separately, send again, then reduce the browser height from 812 to 700. Open/close Phrases as well. | Both histories follow the newest message on send and layout changes without manual scrolling. Fixed controls do not cover it. Long messages remain scrollable; no root horizontal scrolling. |
| F11 | On the phone, type in both halves, use Urdu keyboard, edit multiline text, dismiss/reopen keyboard, pass the phone. | Active input and Send remain usable with the keyboard; no lost drafts, trapped focus, or accidental sender change. |
| F12 | Use central Back. Re-enter FTF and repeat Chat round trip rapidly several times. | Exit works, no blank screen, stuck rotation, lingering recognition or audio. |

## 8. Other tools: verify behavior, identify unfinished work

These boundaries were found by reading current source, not by executing every screen. Recheck after fixes. Mock output can pass a mock-flow test; dead or misleading controls still need fixing, disabling with explanation, or explicit deferral.

| ID / tool | Test steps and expected Phase 1 behavior | Current limitation to record |
| --- | --- | --- |
| T01 Live captions / transcription | Follow [LC01–LC06](live-captions-contract.md#focused-user-qa). No manual language selector. In a supported build/browser, speak, pause/resume and test clean service endings. Edit, Save, reopen History and reload. | Expo Go shows Unavailable/build guidance, with typing/Save still usable. Clean service endings reconnect with bounded empty retries; startup/error states offer clear guidance. Android switching is best effort; other platforms disclose single-locale fallback. Reliable mixed-language streaming and Translate remain deferred. |
| T02 Quick Speak | Exercise all five filters; hear matching audio; Stop; rapidly select another phrase; leave while speaking; type and speak a custom phrase. | Filters affect the grid. First tap shows Preparing voice until the engine starts. One active phrase, no intentional queue. The device engine is initialized on screen entry; measure physical-device cold start separately. Custom text is for immediate speech, not a saved favorite. |
| T03 AI Vision | Tap each of the four actions; observe processing then a result; repeat and navigate away during processing. | Static image and same mock scene result, not camera/OCR/object recognition. Speak again and Save have empty handlers. Never use the scene description to judge real-world safety. |
| T04 Sign Assistant | Open the screen, inspect vocabulary, tap Start camera preview, then Back. | Camera control currently has no handler; recognition is not implemented despite recognition-oriented copy. Log as unfinished/misleading, not successful detection. |
| T05 Passport | Profile → Settings → Passport details: edit fictional details, choose profile/language, Save → View passport. Check visibility, preview sharing, Cancel, invalid phone and reload. | Implemented settings-owned editing, validation, local persistence and shared-data display. Text share handoff requires device support and user choice; Contact-call QR is implemented with explicit reveal consent; full-passport QR/link sharing remains unavailable. See the [contact QR phone retest](passport-contract.md#contact-qr-phone-retest). Physical-phone share/keyboard QA remains. See [Passport contract and retest](passport-contract.md). |
| T06 Emergency | Follow the [Emergency retest](emergency-contract.md#quick-user-retest): configure fictional numbers through Settings, review/cancel each service, test missing/private contact, Lost → FTF/Card, speech and Urdu. | Implemented local read-aloud/Stop, saved targets and explicit phone handoff. No GPS, dispatch or automatic send. Unit tests use fake dialers; browser QA stops before confirmation. Only an explicitly consented non-emergency contact may be used for a physical handoff test. |
| T07 History / Profile | Expand a saved caption transcript; reload and repeat. Open labelled demo chat shortcuts and profile rows; compare counters with actual actions. | Saved caption text is real local data; chat shortcuts/counters are still samples. Profile's pencil now opens Settings and its name reads saved passport details. Do not confuse saved captions with conversation history. |
| T08 Conversation message AI | Confirm the chat bubbles do not expose Simplify, Translate or Explain controls. | The former dead controls were removed from the MVP interface. Message AI remains engine-phase scope and must not be claimed in the demo. |

### User reports and feature backlog: T03–T06 (2026-09-05)

At the time of the report, all four journeys below were **OPEN — not implemented end to end**. The subsequent Settings-owned Passport implementation supersedes T05's original placeholder status; see [current contract and evidence](passport-contract.md). The 2026-09-06 [Emergency implementation](emergency-contract.md) also supersedes its placeholder status; physical phone/audio QA remains. Vision and Sign Assistant remain open. Navigation or mock animation is not a functional pass; physical-device QA is not implied by source changes.

| Case | Verified current behavior / source | Work boundary |
| --- | --- | --- |
| T06 Emergency | **Implemented, device retest pending:** actual message playback/Stop; Settings-owned Medical/Police numbers with area; Passport trusted contact; exact-target review/confirm/cancel; Lost help links to FTF and Passport. English/Urdu copy and RTL are available. | No hardcoded service defaults, GPS, dispatch, automatic notifications or confirmed-call claims. Configure verified numbers for the user's area in Pakistan. Physical Urdu audio, dialer behavior and screen-reader checks remain; three-language UI is implemented; physical Urdu and fluent-speaker acceptance remain. |
| T05 Passport | **Implemented, phone retest pending:** `app/passport-settings.tsx` owns editing through Settings; `app/passport.tsx` is display/share only. Home and Emergency still open the same saved card. | Shared data model, local Save/Cancel, validation, visibility and text share preview/handoff are wired. Contact visibility defaults OFF. Decorative QR replaced by a separate opt-in contact-call QR; full-passport QR/hosted links remain deferred. See the Passport contract for limitations. |
| T03 AI Vision | In `app/vision.tsx`, all four actions run the same 900 ms timer against a static image and show the same result labelled MOCK. Speak again and Save have empty handlers. No camera capture or analysis runs. | Frontend/device work: capture or image selection, permission denial/retry, cancellation, result controls and clearly labelled unavailable/demo states. Engine work: action-specific analysis behind a secure service contract. Generated scene text must not assert that a route is safe to walk. |
| T04 Sign Assistant | In `app/sign-assistant.tsx`, Start camera preview has no handler. Eight vocabulary labels are static; there is no detection pipeline. The copy now explicitly says recognition is not connected. | Frontend/device work: camera lifecycle, permission recovery and honest capability copy. Recognition engine work: first select the target sign language and a bounded vocabulary, then validate the model/data and unsupported-sign behavior. Camera preview alone is not recognition. |

#### Slice status and next work

1. **Make unfinished capabilities explicit.** In the four screens and their Home/Assist/Communicate entry points, make actions work, clearly disable them with a reason, or label a deliberate demo before interaction. Remove unsupported recognition, scan and safety claims. Verify each visible action and exit on PC and phone; no dead tap should look like a completed emergency or AI action.
2. **Local Passport journey implemented through Settings.** Browser and storage tests cover the shared data model, Save/Cancel, validation, reload and visibility. Complete the physical-device checks in the Passport contract before calling native sharing verified. The contact QR now uses the exact plus-prefixed number with no telephone URI prefix; scanners may offer Call or Copy. See the [835 retest](localization-contract.md#qr-prefix-compatibility); full-passport QR/hosted-link format remains undecided.
3. **Emergency local/device slice implemented.** The user specified Pakistan and final full-app Urdu support. Medical/Police service numbers remain user-configured because a city/service area was not specified. Lost mode conservatively offers communication help without GPS. See the [Emergency contract](emergency-contract.md) for browser/unit evidence and physical-device retest steps. Never dial real emergency services for QA.
4. **Build one real engine journey at a time after its frontend contract is ready.** Caption translation is an existing disabled integration seam; AI Vision and sign recognition are separate scopes, not a single generic API button. For Vision, choose one action first and test image input → request → distinct result → read/save, including denial, timeout, cancellation, offline/error and retry. For signs, establish target language/vocabulary and evaluation examples before claiming detection. Keep provider credentials server-side; no provider integration is authorized by this report alone.

The earlier **S08 physical-device speech verification**, **S09 translation connection**, **S10 native cold-start playback check**, and **S11 preference effects** remain open as documented above. S12's console fix does not close these items. Resolve blockers in the selected journey before connecting its engine; unrelated deferred tools need not prevent all backend work, but the whole frontend is not yet functionally complete.

## 9. Accessibility, layout, and recovery

1. **Text and layout:** repeat Home, FTF, Conversation, Captions, and Settings at the PC sizes in section 2. On phone, increase system text size and repeat. Pass only if essential controls and full messages remain reachable without overlapping/clipping.
2. **Keyboard-only web:** use Tab/Shift+Tab, Enter/Space, and ordinary input editing. Check visible focus and meaningful control names. Never require a mouse to exit a panel.
3. **Screen reader:** enable TalkBack on Android or VoiceOver on iPhone using your device's accessibility settings. Learn the exit gesture/shortcut first. Find each FTF participant, input, Send, Read, flip, Back, and Chat. Names must distinguish participants; rotation must not make focus unusable. Record missing labels or confusing reading order.
4. **Motion:** enable the OS's reduce-motion/remove-animation preference; reload, then send messages and flip the FTF center. Check reduced transitions still end in the correct orientation. Disable the preference after testing if desired. Do not infer this from watching normal animations.
5. **Settings effects:** test each accessibility switch's visible/audible effect separately from storage. Missing effects are frontend gaps, not automatically deferred AI work. Haptics must be checked on a supported physical device.
6. **Background/resume:** with an unsent FTF draft, briefly background the app and return without killing it. Confirm draft and ownership remain. During recognition, backgrounding must cancel capture without a late draft. Check playback separately. Force-close/reload currently loses conversation state; log separately from same-session loss.
7. **Interrupted use:** double-tap Send, quickly open/close phrases, tap Back during recognition/vision processing, and switch views while audio is playing. Record duplicates, stale output, crash, or lingering audio.
8. **Offline boundary:** do not use airplane mode against a LAN development server as proof of offline support—it disconnects the server. Full offline launch/relaunch and installed-voice testing require an installed build with bundled assets. Mark BLOCKED until available; no offline-readiness claim yet.
9. **Permission boundaries:** microphone permission denial/retry and unavailable speech-service tests now apply to both conversation layouts. The tester grants permissions, using fictional speech only. Camera capture remains mocked and its real permission tests are DEFERRED. Language selection is not automatic mixed-language recognition or Roman Urdu transliteration.

## 10. Automated checks (second terminal)

```powershell
Set-Location 'C:\Users\Admin\Documents\ChatGPT\AliBaba Cloud AI Hackathon 2'
npx tsc --noEmit
node --test tests/*.test.mjs
```

Expected: TypeScript exits without errors; all current 69 tests pass. These cover message ownership, continuous caption segments/pause/resume, recognition cancellation/errors, phrase filtering, playback startup/stale callbacks, transcript persistence/error handling, web navigation focus, and Passport validation/privacy/storage migration and recovery, and Emergency configuration, Urdu copy, confirmation/cancellation, duplicate-tap prevention, timeout and storage failure recovery. Contact QR tests cover consent, exact number-only payloads, private-contact isolation and independent decoding. Localization tests cover three languages, catalog coverage, persisted Save/failure recovery, verbatim authored text, shared passport copy and Roman phrase pronunciation. Recognition/playback/DOM/storage tests use boundary fakes; these tests do not prove real audio accuracy or screen-reader usability. `npm test` runs the suite; no lint script is configured. Captions follow-up also covers clean-end reconnects, startup failures, bounded retries, pause-during-reconnect safety, provider hints and unknown-language metadata.

Verified 2026-09-06 for Emergency: 43 tests and TypeScript passed; web and Android JS exports passed in `.expo/emergency-web-check` and `.expo/emergency-android-check`. Browser empty/configured/cancel/Urdu journeys passed; actual phone handoffs were not invoked and audible/native Urdu quality was not certified. See the [current evidence](emergency-contract.md#verification-log).

Historical verification after the microphone changes: both commands passed on 2026-09-05; 14 tests passed. The initial guide had six tests; obsolete speech-demo tests were replaced. Node emitted `MODULE_TYPELESS_PACKAGE_JSON` warnings, not test failures. Record your own result; do not change module configuration just to hide warnings. If another Node version cannot load `.ts` test imports, record it as a runtime setup mismatch.

For a milestone or dependency change, also check bundling:

```powershell
npx expo export --platform web --output-dir .expo/qa-web
npx expo export --platform android --output-dir .expo/qa-android
```

These generate/replace artifacts in the named QA output directories. Use those paths only for generated output. A successful export is not an installed Android test, an APK, or a release-readiness guarantee. Web and Android exports passed after the microphone changes in `.expo/ftf-speech-web-check` and `.expo/ftf-speech-android-check`; the new native module has not been compiled/installed on a test phone here.

## 11. Record bugs so they can be fixed quickly

Copy this block for each distinct defect into your QA notes, or send it in chat with a screenshot/short recording:

```text
Bug: QA-001
Title: [screen + specific failure]
Case: F04
Build/date:
Environment: [phone + OS + browser/native client + version]
Start state: [user/partner profile, language, relevant preferences]
Steps:
1.
2.
3.
Expected:
Actual:
Reproduces: [e.g. 3/3 attempts]
Severity: P0 / P1 / P2 / P3
Evidence: [screenshot/video name, first relevant error + stack]
Status: Open / Fixed awaiting retest / Verified / Deferred
Retest: [date, same steps, actual result, related case checked]
```

- **P0:** sensitive-data exposure or unsafe action/claim that can cause serious harm. Stop the affected test.
- **P1:** cannot complete a core journey, wrong sender, lost same-session draft/message, crash, or inaccessible essential control. Fix before the dependent engine work.
- **P2:** secondary broken action, incorrect persistence/copy, missing setting effect, or significant layout problem. Raise severity if it blocks a target user.
- **P3:** cosmetic polish that does not block understanding or completion.

For web errors: clear Console, reproduce once, and capture the first new relevant error plus stack. A network failure should include request URL/status, but redact tokens, cookies, private messages, and query secrets. Do not attach `.env` or full credential-bearing logs. Phone video plus exact steps is enough when developer logs are unavailable.

Suggested results sheet (one row per case/environment; duplicate rows for native):

| Case | Environment | Result | Bug / evidence | Retest result |
| --- | --- | --- | --- | --- |
| F04 | Android browser, model/version | NOT RUN | — | — |
| F04 | Android native, model/version | NOT RUN | — | — |

## 12. Retest and decide whether to start the engine

1. After a fix, repeat the exact failing steps on the same environment.
2. Test a neighboring case: for a You ownership fix, also test Partner, phrases, typed messages, and FTF ↔ Chat switching.
3. Rerun automated checks and the short smoke pass. Change bug status to Verified only after a successful retest, not merely after code changes.
4. Before the first engine slice, resolve P0/P1 bugs in that journey, complete the phone keyboard/audio/ownership checks, and explicitly list remaining blockers/deferred tools. Nondependent work can proceed in parallel, but the entire frontend must not be called complete while advertised controls silently do nothing.
5. Require every visible action to work, give an honest mock/unsupported explanation, or be clearly disabled. Resolve persistence and emergency/vision capability claims before presenting them as real.
6. Real platform speech input is now wired in both conversation layouts, but requires physical-device validation. Once approved, extend this same contract to any backend speech engine and live captions; verify permissions, cancellation, timeout, no speech, accuracy, service failure and offline fallback again. Simulated-event QA cannot certify device or cloud behavior.

Responsibilities: the assistant can run automated/browser checks, investigate defects, implement authorized fixes, and maintain regression tests. The user provides physical-phone observations and product acceptance. Neither browser screenshots nor unit tests replace real-device QA; neither requires the user to debug the code alone.

## QR 835 and three-language acceptance — 2026-09-06

Use the [focused eight-step retest](localization-contract.md#user-retest--qr-and-languages). The user reported prior QR QA passed except 835 appearing in the recipient dialer. Do not reuse old QR screenshots. Current generation encodes the exact `+country-code` number without `tel:`; scanner Call/Copy behavior needs retesting on the affected phone. Settings now saves English, اردو or Roman Urdu for the entire interface. User-authored content and device-owned speech/keyboard behavior are separate acceptance boundaries.
