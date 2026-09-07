# Navigation, caption input and validation audit

Date: 2026-09-07. Scope: six user-defined gesture routes, separated input-language controls, and reported bilingual validation failures. No existing user data was reset and no live microphone/provider call was made.

## Latest: UI simplification after user acceptance

User passed navigation/input checks 1–5 and gestures/opt-out, confirmed good same-language recognition and weak hybrid recognition. Engine work is frozen for the hackathon. This pass changes presentation and setup placement only, not provider behavior.

- Caption controls: shortened copy, speaking language/mic/read flow, contextual Save and secondary actions under More. Pairing form moved to Settings → Speech setup; runtime credentials remain scoped/in-memory with existing expiry. Focus synchronization preserves the existing captions controller/input/text after setup.
- True overlay sheet: 55% portrait height, 190–220 px portrait pad, taller bounded landscape variant, scrollable button alternatives and a Buttons header shortcut. Main layout does not shrink. Existing six mappings, deferred doubles and opt-out unchanged.
- Browser verified compact/More controls, invalid-code error without audio/network, unsaved manual draft surviving setup/Back, portrait360×800 and landscape800×360 sheet layout, Button jump, Escape/scrim dismissal, focus return and double-left → Sign Assistant. Main height stayed800 before/after opening; portrait pad measured220px. Browser warning/error log query returned none.
- Keyboard audit reproduced hidden backdrop receiving focus at Tab wrap. Fixed with a genuinely nonfocusable responder View; a nine-Tab cycle then returned to the labelled Close control. Background inert state clears after dismissal.
- **123 app tests and TypeScript PASS**, including two new shared-runtime setup regressions. No dependency, key, provider prompt or backend change. Real authenticated setup/audio still requires operator QA; no provider calls or microphone permissions used. Temporary viewport reset; browser left on Live Captions; fictional manual draft was not saved.
- Web and Android JavaScript/Hermes exports PASS (`.qa/simplified-ui`, dotenv disabled). This is not a new native binary or physical-device verification.

Earlier implementation evidence follows.

## Engineering and reproduced defects

- Workflow skills separated pure gesture recognition, authenticated input-language propagation and translation validation into independently tested slices. Existing navigation, preferences, TTS and locale infrastructure were reused; no new dependency was added.
- Deterministic gesture tests cover six mappings, deferred singles, long second swipes, cancellation, invalid gestures and browser timer receiver behavior. Profile tests cover persistent opt-out without losing other saved fields.
- Client/controller tests cover Urdu default, explicit session snapshot, input lock during connection/listening/drain/capture release, stale callbacks and output preservation. Joined local HTTP/WebSocket tests prove `ur` and then `en` reach the provider boundary without extra output-tab calls. Providers/audio hardware are test doubles.
- Voice-indication audits reproduced premature microphone unlock on deferred Stop voice and timeout. Fixed by retaining the busy lock until confirmed stop; failure/stall remains actionable with stop retry. Stale speech callbacks cannot restart or release a newer announcement.
- Backend regressions reproduced Urdu output retaining clock-bound `PM` and explicit `3 PM` → `3:00 PM`. Narrow normalization and clock-equivalence fixes retain strict script/no-Hindi and numeric safety gates. Tests reject altered minutes/hours, lost/changed dayperiods, and counts turning into times. Both provider and publication validation gates are exercised.
- Safe `recognition_input`, `translation_request`, `translation_validation` errors distinguish failing stages without leaking source/provider text. The user's prior live failing stage is still **unconfirmed**; these validator reproductions do not establish its cause.
- Browser integration caught RN Web's unconditional screen-reader API result, invalid web direction styles, zero-height expanded content, and a timer receiver exception. Native detection remains conservative; web keeps accessible controls and explicit opt-out.

## Verification boundary

Automated checks at integration: **121 app tests and 55 backend tests pass**; `npx tsc --noEmit` passes. Tests use fictional text/synthetic audio and no credentials.

- Expo web export PASS (`.qa/navigation-web`); Android JavaScript/Hermes export PASS (`.qa/navigation-android`), with dotenv loading disabled. These are bundle checks, **not** an APK/native build. Existing Node module-type and bundler color-environment warnings remain.
- Browser physical drag checks PASS: left → FTF, right → Live Captions, double left → Sign Assistant, double right → Passport, down → Emergency. Double navigation did not show the corresponding single destination. Emergency/Passport remained idle/view-only; no call, share, QR reveal or capture was initiated.
- Browser Live Captions checks PASS: tappable input selection and left/right local drags change the selected input without leaving the page or changing the output tab. Visible voice-indication/Stop control appears, output tabs switch independently, and ordinary vertical scrolling works. The local surface uses `touch-action: pan-y`. Actual spoken audibility and screen-reader behavior are not established by observing this UI.
- Accessibility integration includes explicit web selected/expanded states, keyboard radios, native screen-reader detection and equivalent named buttons. No real microphone permission, provider connection, sensitive data mutation or paid API call was used for browser verification.
- Browser opt-out PASS: disabling Swipe gestures prevented navigation drags, disabled local language swipes and survived navigation; destination buttons/radios remained usable. Original enabled preference was restored and only the created QA tab was closed. Up → Vision is covered by the six-route regression and code inspection, not a separate browser drag. Native touch/screen readers remain manual QA.

Native compilation, physical touch/screen readers, actual microphone release, real cloud recognition/translation quality and latency remain user/device QA. The pinned native recorder does not run in Expo Go. Mechanical number/script validation does not prove faithful meaning, names or negations. The [concise QA](../navigation-gestures.md#qa) states expected results and how to report the actual failing stage.
