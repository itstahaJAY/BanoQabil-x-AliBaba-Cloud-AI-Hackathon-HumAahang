# Emergency mode — implementation slices

Scope: local communication help and user-confirmed phone handoffs. No AI backend, dispatch, location collection, automatic notification or emergency-call testing. Service area/numbers must be configured by the user; no guessed regional defaults.

## Small implementation chunks

- [x] **1. Saved numbers:** service area, Medical and Police numbers under Profile → Settings → Emergency numbers. Reuses the profile store and preserves Passport/preferences. Validation, legacy loading, Save/Cancel and reload checked.
- [x] **2. Confirmed handoff:** derives trusted contact from Passport and services from saved configuration. Selection never opens a phone app. Exact-target review precedes explicit confirmation. Cancellation, duplicate taps, missing/invalid targets, rejection and late callbacks verified with a fake phone adapter. No connection/dispatch claim.
- [x] **3. Useful screen:** actual communication/help message playback with Stop and exit/background cleanup. Lost mode offers a readable help message, trusted-contact handoff, FTF and Passport without GPS. Reuses existing playback/controller UI. English/Urdu copy and platform-appropriate RTL added.
- [x] **4. Local verification:** unit tests, TypeScript and web/Android JS exports pass. Browser empty/configured/review/cancel/Settings return and narrow Urdu layouts checked. Actual phone handoffs were not invoked.
- [ ] **Physical-device acceptance:** native keyboard, Urdu voice quality, TalkBack, app relaunch and consented non-emergency phone handoff. Local checks are not proof of emergency-service readiness.

## Architecture boundaries

- `src/profile-data.ts`: additive emergency configuration, validation and safe phone target projection; existing `humahang` storage and schema version remain compatible.
- `src/store.tsx`: publish saved configuration after persistence succeeds.
- `src/emergency-call.ts`: small testable confirmation/handoff controller; platform `Linking.openURL` is the only phone side-effect boundary. No contacts plugin or call permission needed for app-directed URL handoff.
- `app/emergency-settings.tsx`: unsaved form draft, errors, explicit Save/Cancel, management through Settings.
- `app/emergency.tsx`: local screen selection, speech lifecycle and current configuration; no duplicate saved contact and no call history.
- `src/emergency-copy.ts`: paired English/Urdu copy; existing saved language is the only locale source. Web uses supported `dir`/`lang` attributes; native uses layout direction. Phone text is always left-to-right.

The `using-agent-skills` workflow was applied through planning, incremental implementation and regression tests: reuse the existing storage/speech boundaries, isolate the only phone side effect, then connect the screens. No backend, extra service layer or new dependency was necessary. Phone promises time out after 10 seconds with an uncertain-result warning, never an automatic retry. A review snapshots its target so it cannot silently switch numbers before confirmation. Cancelling the app review cannot cancel a call already handed to the OS.

## Pakistan and Urdu requirement

User requirement, 2026-09-06: Pakistan-first national hackathon app, with the **entire final application in Urdu**. English today is transitional. No city/service area was supplied, so Medical/Police numbers start blank; users must verify and enter the appropriate service details. Format validation is not jurisdiction/reachability verification.

Update 2026-09-06: full-app English / اردو / Roman Urdu UI is implemented. Choose Profile → Settings → Language, then Save; Passport details uses the same preference. Emergency has complete Roman Urdu copy, including confirmation and failure states. Saved custom text is preserved, not machine-translated. Lost mode remains a no-location help card. See the [localization contract and acceptance steps](localization-contract.md).

Localization follow-up acceptance gates:

- Centralized copy, prompts, validation/error/status messages, navigation and accessibility names are implemented and statically checked. Obtain fluent-speaker editorial review and check runtime edge states on the phone.
- Check RTL ordering and focus throughout onboarding, FTF, ordinary chat, captions, Passport, Settings and tools. Keep numbers/phone identifiers correctly ordered; do not rotate the system keyboard with the FTF top panel.
- Validate readable Urdu type at large system text sizes and narrow screens, Urdu keyboard input, TalkBack announcements and installed Urdu speech voices on the target phone. No silent English fallback or guaranteed offline-speech claim.
- Require future engine contracts/evaluation to cover Urdu input/output explicitly. Text localization alone does not prove Urdu transcription/translation or Pakistani sign-language recognition.

## Verification log

Verified 2026-09-06:

- `npm test`: **43 passing**, including 10 Emergency regressions. The initial seven behavior tests first failed against unimplemented stubs, then passed after implementation. Tests cover no guessed defaults, preservation of Passport, validation, corrupt/failed storage, Urdu copy, private-contact projection, review snapshots, duplicate confirms, cancellation, invalid/disposed targets, rejection, timeout and late callbacks. Phone/storage boundaries are fakes.
- `npx tsc --noEmit`: passed. `npx expo export --platform web --output-dir .expo/emergency-web-check` and Android equivalent `.expo/emergency-android-check`: passed. These are JS exports, not APK/native-build tests. Existing Node module-type and terminal color warnings remain; they are not test failures.
- Browser: empty Medical/trusted contact leads to Settings; invalid phone and absent area report errors/focus the area; saved Medical/Police show distinct normalized fictional numbers; review/cancel performs no phone handoff. Configured private contact is available despite public-card visibility OFF. Reload retains configuration; direct-editor Cancel discards an unsaved area change.
- Lost → FTF opens the actual two-panel route and returns to the same help state; communication-card navigation works. Speak exposes the compact startup/Stop control, explicit Stop returns to idle, and navigation leaves no stale playback UI. Audible Urdu quality/background behavior remain physical-device checks.
- Urdu confirmation and settings inspected at 320/375 px respectively, without root horizontal overflow; phone display remained LTR. Initial browser testing caught an unsupported `direction` style warning; web `dir`/`lang` fixed it. Subsequent console capture returned no warnings/errors in the checked journey.
- No actual phone-app confirmation/calls, notifications or location requests were made. Fictional QA contact/service details were cleared through Settings; prior persona/language restored. No broad browser-storage reset.

## Quick user retest

1. Profile → Settings → Emergency numbers: check blank state; try an invalid value, then enter clearly labelled fictional test data. Save, reload and check persistence. Cancel an unsaved edit; it must not overwrite saved values.
2. Emergency → Medical / Police: inspect the corresponding displayed number and area. Review, then Cancel. **Do not confirm a real emergency number as a test.**
3. Through Passport details, configure someone who explicitly agreed to be your test contact. Keep Show emergency contact OFF. Emergency should still let you review this private contact, without showing it on the public card.
4. Only with that person's agreement, test the final phone handoff on a physical phone. The OS may start or offer a call; this app does not confirm connection. Check cancellation/return and unsupported-phone behavior without repeated blind retries.
5. Test message playback, Stop, navigating away and background/resume. Select اردو, Save, and repeat. Record installed voice/OS, audible language and pronunciation; a changing status indicator alone is not a pass.
6. Lost mode: read/show the help message, open FTF, return, open Passport. No location permission or notification should occur. Test hardware Back and TalkBack separately.
7. Clear fictional service/contact data through their Settings forms and restore prior preferences. Record native results separately from browser results.
