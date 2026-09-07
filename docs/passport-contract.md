# Passport management contract

Implemented 2026-09-05. This is the current compact handoff for Passport; older QA reports describe the previous placeholder.

## Ownership

- **Edit:** Profile → Settings → Passport details (`app/passport-settings.tsx`). Profile's pencil opens Settings too. The editor owns an unsaved draft; Save validates and persists, Back/Cancel discards it. No editing controls live on Passport.
- **State:** `src/profile-data.ts` defines validation, defaults, presentation and storage. `src/store.tsx` exposes the same passport/persona/language to all screens. Persona and language are not duplicated inside passport data.
- **Persistence:** existing AsyncStorage key `humahang`, now `schemaVersion: 1`. Legacy values load without writes; missing passport fields default to empty, not fictional identity/contact. Writes are serialized read/merge/write operations. Passport fields, persona and language are saved together; unrelated preferences/onboarding remain intact. Malformed/future data is not overwritten. Failed passport saves keep the editor draft and do not update the visible card.
- **Display:** `src/passport-card.tsx` projects saved data; Profile/Home also use the entered name. Profile and Home can show the name even when it is hidden on the public-facing card.

## Fields and privacy

- Name (optional, 80 characters); communication profile (four existing choices); preferred language (English, Urdu, Roman Urdu).
- Custom instructions (optional, 600 characters); empty instructions use the current persona's suggestion. Changing persona does not overwrite custom instructions.
- Contact name (optional, 80 characters), phone (7–15 digits with common formatting). A contact name or visible contact requires a phone number. This is formatting validation, not proof a number is reachable.
- Show name defaults ON; Show emergency contact defaults OFF. Both switches affect card and share text through the same projection. Profile, language and instructions remain included.
- Clear optional text and Save to remove it. Clear contact name/phone and switch visibility OFF together to remove the contact.
- Local storage is not encrypted by this app and does not sync. Sharing requires opening a preview and then the device's share options; no automatic send. Shared copies cannot be recalled.
- The decorative QR was removed. A separate real contact-call QR was added on 2026-09-06 (see below). Full-passport QR/hosted-link sharing remains unavailable; the contact QR never includes the full passport.

## Verification and remaining checks

- `npm test`: 33 passing, including eight new profile tests. Seven of the new tests first failed against behavior stubs, then passed against the implementation. Tests cover legacy loading, atomic save/reload, validation, clearing, privacy projection, corrupt data and queued-write recovery using an in-memory storage boundary.
- `npx tsc --noEmit`: passed. Web and Android JS exports passed; neither is physical-device verification.
- Browser: Profile → Settings → editor; keyboard profile/language selection; invalid phone focuses the field; Cancel discards; Save confirms; reload retains changes; Home/Profile/Passport agree. Hidden name/contact and opted-in contact were verified on card and share preview. Card has no visible input fields. Default, 375 px card and 320 px editor layouts inspected; no root horizontal overflow at the two phone widths.
- A direct-editor reload exposed an exit edge case in generic Back navigation. Cancel/header Back now dismiss explicitly to the owning Settings route; the previously failing reload → Cancel path was retested successfully.
- Browser console capture returned no warnings/errors during the checked journey. OS share handoff was invoked with fictional data, but recipient delivery, native share cancellation and unavailable-share fallback were not certified. No messages/calls were sent. Fictional QA fields were cleared and the pre-test persona/language restored.
- Still to test on a physical phone: keyboard/large system fonts, screen reader, app relaunch persistence, OS share/cancel. Storage failure/corruption were tested at the storage boundary, not by damaging the user's browser data.
- Follow-up 2026-09-06: [Emergency actions are now wired](emergency-contract.md); configured-number and physical-phone/audio checks remain. Still separate: global accessibility preference effects, AI Vision/sign engines, caption translation, native microphone validation. Full-app three-language UI is now implemented; see the [current localization contract](localization-contract.md) for device acceptance.

## Quick user retest

1. Open Profile → Settings → Passport details. Enter fictional details, choose profile/language and save.
2. View Passport. Check instructions, name and language; contact stays hidden by default.
3. Return to Settings. Enable contact visibility, save, and inspect Passport/share preview. Do not dial a number for this test.
4. Reload/reopen. Confirm persistence, then make an unsaved change and Cancel; it must not reach the card.
5. Try an invalid phone number, then correct it. Remove test details through Settings when finished.

## Emergency contact QR — 2026-09-06

- **Entry:** Passport → Emergency contact QR, or the same action on Emergency. `/contact-qr` is a separate display-only route; contact management stays in Profile → Settings → Passport details.
- **Payload:** only the canonical international saved trusted-contact number, including its leading `+` and **without `tel:`**, from `emergencyCallTarget('family', app)`. No name, medical/profile details, service numbers or hosted URL are encoded. QR requires an international-format number beginning with `+`; local-only values receive Settings guidance, never a guessed country code. Validation is syntax-only, not proof of service/reachability.
- **Consent:** the name, number and QR are absent from the screen until **Reveal contact & QR**. This is explicit temporary disclosure, even when the contact is hidden on the public Passport; it does not change the saved visibility switch. Hide, web Escape, route exit and backgrounding reset disclosure. Changing the saved name/number requires new consent; nothing is persisted about QR visibility.
- **Architecture:** `src/contact-qr.ts` validates the telephone payload and builds black-module runs using pinned `qrcode-generator@2.0.4`. The page renders simple native Views with a four-module white quiet zone and integer module sizes. The QR itself is forced LTR, never decorated, animated or mirrored. `src/contact-qr-copy.ts` contains English/Urdu/Roman Urdu copy. No custom encoder, global store, schema migration, server, API, native module or camera permission was added. This follows using-agent-skills' test-first workflow and Ponytail's reuse-first approach.
- **Recipient behavior:** scanners may offer Call, Copy or plain text for the number-only payload; the recipient's scanner/OS decides whether to open a prefilled dialer, confirm or select a calling app. The sender app cannot guarantee the dialer UI or confirm a call. Creating/showing the QR does not invoke any phone API. A readable number is the fallback. Photos/copies retain the number and cannot expire or be revoked.
- **Original URI implementation evidence (before the 835 report):** 49 unit tests passed, including six QR tests. Three initial QR behavior tests failed against stubs before implementation. An independent `zxing-wasm` decoder verifies the generated bars contain the exact fictional `tel:` value and no extra data. The decoder is explicitly declared for tests, reusing the version already installed by expo-camera; its WASM loads locally, not from a CDN. TypeScript and web/Android JS exports pass. Browser checks covered empty/local-only recovery, consent, private-contact visibility, Hide/Escape, return navigation, English at 320px and Urdu at 375px without horizontal overflow. Actual rendered Urdu DOM modules were independently decoded to the same expected URI. Console checks returned no warnings/errors. Testing used the separate `127.0.0.1` origin so the main `localhost` profile was untouched.
- **Not certified:** Android/iPhone camera-app recognition and calling-app handoff, native large fonts/TalkBack/background snapshots, or offline installed-build launch. No real calls, scans by a physical device, or notifications were made during implementation. Native exports are not APK/physical-device tests.
- **QA cleanup:** the fictional contact was removed and the isolated test profile's language restored to English through Settings after verification. Main `localhost` profile data was not changed.

The user reported all previous QR checks passed **except a dialer prefix of 835**. That affected-scanner result is not yet verified after the fix. The current number-only payload and fresh-QR retest supersede the previous telephone URI: see [QR compatibility](localization-contract.md#qr-prefix-compatibility). Current automated suite: 59 passing tests.

### Contact QR phone retest

1. Save an explicitly consenting test contact in international format through Passport details. Keep **Show emergency contact OFF** to test the privacy boundary.
2. Open Passport → Emergency contact QR. Nothing identifies the contact before Reveal. Reveal should show the correct name, number and QR; Hide removes all three. Return to Passport: the contact must remain hidden there.
3. Generate a **fresh QR** and scan from a second phone. Verify the recognized `+92…` number exactly, with no **835**, before accepting any phone action. If the scanner offers only Copy/plain text, use that or enter the readable number manually. Use only the consenting non-emergency contact; never call real emergency services for QA. Record phone/scanner and whether it offers a dialer, confirmation or another calling app.
4. Repeat in Urdu. Confirm the QR is not mirrored and the number remains LTR. Test Back, leaving/returning, background/resume and large system text. Fresh disclosure must be required after leaving/backgrounding.
5. Change the saved contact, reopen and Reveal again: only the new number should appear. Missing/local-only numbers must point to Settings without generating a misleading QR. Clear fictional test details when finished.
