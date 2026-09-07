# QR compatibility and three-language UI

Implemented, 2026-09-06; physical-device acceptance remains. Scope: the reported QR prefix and the existing three-language UI, without adding AI APIs.

Later captions update: the [live captions contract](live-captions-contract.md) supersedes references below to the captions speech-language selector. Chat/FTF selection is unchanged. Captions now requests best-effort Android 14+ switching or discloses a temporary single-locale fallback; reliable bilingual streaming remains backend work.

1. QR: independently decode current output; prevent a scanner forwarding `tel:` as keypad letters (TEL → 835). Preserve consent, exact saved number, no automatic call, and no private data beyond the number. Actual affected-scanner behavior requires user retest.
2. Locale: one persisted profile language, exactly English / اردو / Roman Urdu. Explicit selection + Save in Settings, Cancel discards, save errors retain draft. No restart and no recreation of chat state on locale change.
3. Text: shared localized UI primitives for application copy and accessibility labels, with explicit verbatim boundaries for names, phone numbers, drafts, messages, saved transcripts and user-authored instructions. English source strings remain stable message keys; typed dictionaries supply Urdu and Roman Urdu. No machine translation, runtime DOM rewriting or provider calls.
4. Layout: Urdu RTL, English/Roman Urdu LTR; QR and numbers always LTR; directional navigation icons follow locale. Preserve FTF participant ownership and 180-degree partner layout.
5. Verification: tests for QR decode, exact three locales, saved language/failure, translation coverage, preserving authored text; browser settings → all screens in three languages, narrow/RTL/FTF, console, web/Android JS export. User has reported the earlier QR QA passed except the dialer-prefix issue; do not count that issue as resolved on the phone without retest.

Roman Urdu means Urdu written in Latin letters, using familiar English technical terms sparingly. User text is never rewritten. OS dialogs, keyboards, installed speech voices and recognition output are device-owned, not translated by this UI setting. Pure Urdu speech quality and arbitrary Roman Urdu transliteration are not implied by UI localization.

## Implementation decisions

- `src/locale.ts` and `src/translations.ts` provide synchronous, bundled translations. Existing Emergency/QR copy has a full Roman Urdu catalog too. No translation SDK, API key or network dependency was added.
- `src/localized-ui.tsx` wraps Text, TextInput, Pressable, Switch, safe-area direction and directional icons. It translates only app-owned strings. `verbatim` is mandatory for authored display text; input values are never translated. Parameterized labels use `t('Hello, {name}!', { name })`, preserving the parameter. Document title, navigation names and native/web accessibility labels are localized.
- Settings has three radio choices, explicit Save and Cancel. `saveLanguage` publishes the locale only after the existing serialized storage write succeeds. Passport settings edits the same field, not a second locale. Old `Urdu` values normalize to `اردو`. Hydration happens before screens mount to prevent an English flash. Saving a locale does not key/remount the application.
- Urdu uses web `dir`/`lang`, native layout direction and readable line height; it does not call global `forceRTL` or require an app restart. English/Roman are LTR. Numbers and QR rendering stay LTR. The FTF partner panel still rotates 180 degrees independently of RTL.
- Built-in chat phrases are localized before sending. Once sent, all messages are verbatim history. Quick Speak displays Roman Urdu but sends the corresponding bundled Urdu phrase to the device voice; custom phrases are not transliterated. Recognition defaults to Urdu for Urdu/Roman UI, with the existing English/Urdu speech-language selector available separately. This is not automatic multilingual recognition.
- Card/share headings and default communication instructions localize; names, contacts and custom instructions do not. Sharing, QR consent and reviewed phone handoffs retain their existing privacy boundaries.

## QR prefix compatibility

The user clarified that the dialer shows **835**, not a time. This matches the keypad digits for **TEL**, suggesting the scanner passes the literal URI scheme to the dialer. This specific device/scanner has not been identified or reproduced here.

The QR now encodes **only the exact canonical international number**, e.g. `+12025550147`, with no `tel:` or other prefix. Independent decoding verifies the plus and every digit. In-app Emergency phone handoffs still correctly use `tel:`; only the cross-scanner QR payload changed. This is a compatibility tradeoff: a scanner may now offer **Call or Copy/plain text**, rather than a guaranteed phone action. The displayed number is the manual fallback. No vCard, name, URL or server is encoded. Old QR screenshots still contain the old payload; generate a fresh QR for retesting.

The earlier URI followed [ZXing's phone-content convention](https://github.com/zxing/zxing/wiki/Barcode-Contents/1052ada88a5b0a0cd40261ee31b997e17db4686c). The workaround responds to the reported scanner handoff; it is not a claim that all scanners mishandle telephone URIs.

## Verification

- **59 automated tests pass**, plus TypeScript. Coverage includes independent QR decoding, three locales, all inventoried English app copy, Roman script consistency, saved locale/retry, unchanged authored details, localized share payloads, phrase pronunciation separation, and existing sender/speech/emergency/storage regressions. The inventory gate is static coverage, not proof of every runtime state or linguistic quality.
- Web and Android JavaScript exports passed in `.expo/localization-web-check` and `.expo/localization-android-check`. These are not APK builds or physical-device tests.
- Browser: Settings draft selection → Cancel → Save → reload; Roman Urdu and Urdu; passport edit/save/default suggestion; read-only card and share preview; private contact QR reveal with exact plus-prefixed test number; Urdu onboarding, Home, tabs, Assist, chat/FTF, captions/History, Vision and Sign copy; Roman Quick Speak Travel filtering and Emergency review/cancel.
- Authored test name **Home**, instruction **Save**, contact name **Settings**, chat messages and a mixed-script saved transcript remained unchanged. Public card/share preview omitted the private contact. Urdu FTF kept sender ownership and both histories reached the bottom after sending (185/352/167 and 189/356/167 scrollTop/scrollHeight/clientHeight at 320px).
- Phone-width visual checks at 320 and 375px caught and fixed a wrapping Assist grid, crowded card actions and an unsupported web direction style. Post-fix browser logs contained no new warnings/errors after the earlier direction warning. Settled Roman Home measured 320px viewport/320px document width and LTR direction. No real calls, device shares, microphone permissions or location requests were made.
- Testing used **127.0.0.1**, not the user's **localhost** profile. Fictional name/instructions/contact fields were cleared through Settings and the isolated locale restored to English; the empty QR state was verified. The isolated origin retains one explicitly labelled Localization QA transcript (no personal data). Physical scanner handoff, audible Urdu, native large fonts/keyboard, TalkBack, and fluent Urdu editorial review still need human/device acceptance.

## User retest — QR and languages

1. Reload the updated frontend. In Profile → Settings → Passport details, confirm a consenting test contact is saved as `+92…` without the initial local `0`. Leave public contact visibility OFF.
2. Open Passport → Emergency contact QR → Reveal. **Use this newly generated QR, not an old screenshot.**
3. Scan from the affected phone. Inspect the scan text: it must exactly match the displayed `+92…`, with **no 835**. If offered Call, inspect the dialer before proceeding. If offered only Copy, copy/paste or enter the displayed number. Do not call real emergency numbers for QA. If the wrong prefix remains, record phone/scanner and a redacted screenshot of both scan text and dialer.
4. Profile → Settings → Language: select **اردو**, then Save. Check Home, all tabs, ordinary chat/FTF, Quick Speak, captions/History, Emergency, Passport/QR and their Settings pages. Labels should be Urdu, layout RTL; the QR/number must not mirror. Icons remain recognizable; directional arrows and accessibility names adapt.
5. Repeat with **Roman Urdu** (Latin-script Urdu, LTR), then **English**. Reload/reopen after each Save. Select a different language and Cancel; the saved language must remain.
6. Type a unique message and custom instruction before switching. Names, numbers, drafted/sent text and saved transcripts must stay unchanged. Built-in phrases should send/speak the selected-language version; assess audible Urdu separately on a supported device voice.
7. In FTF, send consecutive messages from A, then B. Both halves must show the same newest text with correct ownership; top stays inverted. Check the Urdu keyboard and large system text on the actual phone.
8. Report any remaining screen with its language, phone/browser, action and a redacted screenshot. UI translation does not activate the pending cloud translation, AI Vision or sign-recognition engines.
