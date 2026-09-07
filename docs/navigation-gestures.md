# Navigation and caption-input gestures

Updated 2026-09-07. Implemented user decision; supersedes automatic-only caption input. Existing feature engines are not expanded by adding navigation routes.

## Areas and routing

Open the bottom **Navigation shortcuts** strip. It opens a modal overlay covering 55% of the portrait viewport (a taller bounded sheet in short landscape), with a 190–220 px portrait swipe pad. The app beneath does not shrink. Only the labeled **Navigation swipe area** changes screens; normal content retains scrolling. The sheet has a dimmed backdrop, Close button, Escape/Android Back dismissal, focus trapping/return and reduced-motion support. Its contents scroll; **Buttons** in the header jumps to all six alternatives. It closes on background, route change or native keyboard opening.

| Gesture in navigation pad | Destination |
| --- | --- |
| Up | AI Vision (`/vision`, existing camera/analysis UI; engine still mocked) |
| Down | Emergency (`/emergency`) |
| Right | Live Captions (`/transcription`) |
| Left | FTF (`/conversation?partner=hearing&face=1`) |
| Double left | Sign Assistant (`/sign-assistant`) |
| Double right | Passport (`/passport`) |

Horizontal singles wait 420 ms after release. Begin the second swipe within that window and lift between swipes: the first action is suspended at second touch-down, so a recognized double never also opens the single destination. Minimum displacement is 48 px, one finger, dominant axis, maximum gesture duration 1200 ms. Physical directions stay the same in Urdu RTL. Ambiguous, cancelled and multi-touch gestures do not navigate. Pending actions cancel when leaving, collapsing, disabling gestures or backgrounding.

All six routes also have visible/tappable buttons. Navigation **does not** invoke a dialer, share sheet, QR reveal, permission request or camera capture; those remain explicit actions owned by the destination page. No new camera or sign recognition engine is implied.

**Profile → Settings → Swipe gestures** disables both navigation and caption-language swipe pads and persists after Save/reopen. Buttons remain available. Native screen-reader detection suppresses raw swipes; native users keep ordinary screen-reader gestures and named controls. Browser screen readers cannot reliably be detected, so accessible buttons and the explicit opt-out remain available. Keyboard controls include the expandable strip and English/Urdu radios (left/right arrows, Home/End).

## Separate caption-input area

Live Captions has a **Speaking language** group above the mic, with a separate labeled horizontal swipe strip: left → English, right → Urdu. Vertical movement there remains scrolling, not navigation. It does not wrap output tabs or transcript content. Input is Urdu by default and is session-local; it is not inferred from menu language or changed by the output tabs.

Only stopped, fully drained/released sessions may change input. Selecting a language produces device voice feedback; microphone startup waits for confirmed announcement completion/stop. No automatic microphone start follows a selection. The selected `en`/`ur` is bound to the next authenticated backend session and Deepgram request. The lower output tabs project the existing `{ur,en}` pair with no new provider call. See the maintained [caption contract](live-captions-bilingual-output.md).

## QA

Reload the frontend. Keep the backend running and prepare **Profile → Settings → Speech setup** with a fresh local code before audio QA. This UI revision does not change the backend or require restarting it. Do not put provider keys in the app. After setup, return to Captions; the setup banner disappears while the runtime connection is valid.

1. From Home, open **Navigation shortcuts**. Expect a half-height overlay, larger swipe pad and unchanged Home layout beneath. Try Close, outside tap and Escape/Android Back; focus returns to the strip. Try each direction in the pad; expect exactly the destination above. Horizontal singles have a brief deliberate delay.
2. From Home, do two quick separate left swipes; repeat with right. Expect **Sign Assistant only** / **Passport only**, with no FTF/Live Captions flash or extra back-stack entry.
3. Open Emergency/Passport by gesture and by button. Expect navigation only: no automatic call, share sheet or contact QR reveal. AI Vision must not request camera access merely from navigation.
4. Scroll Home, a long transcript and the expanded shortcut list. Expect normal scrolling, no accidental navigation. In the local caption pad, vertical swipes scroll; horizontal swipes change language without leaving Live Captions.
5. Choose English input, then Urdu input, using taps and local swipes while stopped. Expect selected-state/voice feedback, unchanged output tab and unchanged completed text. While recording/draining, input cannot change; output tabs still can.
6. Disable **Swipe gestures** in Settings and save/reopen. Both swipe pads are inactive; all six destination buttons and language buttons still work. Restore your preferred setting afterward.
7. Use keyboard or TalkBack/VoiceOver. Expect named controls, selected input state, no blocked reader navigation, and selection announcements. On a phone, test both portrait and landscape; do not count desktop mouse drags as native-touch proof.
8. Perform [caption C01–C03](live-captions-qa.md#focused-acceptance-checklist), especially the mixed `3 PM` sentence. Equivalent time formatting must not cause validation failure; changed time or meaning is FAIL. If rejected, report the **in-app stage message**, not keys, codes or raw network headers.

Record PC and mobile separately as PASS / FAIL / BLOCKED. Expo Go can preview these controls, but actual Live Captions audio still needs a compatible native development build. Real microphone, provider quality and assistive-technology behavior require physical/user acceptance.
