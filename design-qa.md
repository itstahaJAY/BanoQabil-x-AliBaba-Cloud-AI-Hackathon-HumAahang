# Hum Ahang visual QA

## Target

- Source: supplied Lingua mobile UI reference
- Implementation: Expo/React Native Home screen
- Checked states: settled Home, onboarding, Quick Speak navigation
- Primary target widths: 390–430 px

## Comparison

- Layout and density: matched compact native-mobile rhythm with 20 px gutters, short list cards, restrained section gaps, and a fixed bottom tab bar.
- Visual system: matched warm off-white canvas, white surfaces, purple brand hierarchy, pastel icon wells, subtle shadows, and rounded geometry.
- Hero: matched the reference's purple gradient, integrated character composition, progress treatment, white CTA, and speech bubble.
- Typography: matched the reference's compact hierarchy; no oversized display copy or low-contrast body text.
- Interaction: primary hero, three communication modes, four quick actions, and tab navigation retain their existing routes.
- Accessibility: labeled interactive controls, 44 px minimum primary touch targets, icon-plus-label navigation, and high-contrast text.

## Issues resolved

- P1: Removed the previous dark emerald/bento visual direction.
- P1: Replaced the CSS-style hero ornament with a dedicated transparent illustration asset.
- P2: Reduced card height, corner radius, shadow strength, and spacing to match the source's information density.
- P2: Reworked the tab bar into a light native-style treatment without changing the existing four-tab architecture.
- P2: Unified shared colors and components so existing secondary screens inherit the same purple/pastel design language.

## Remaining polish

- P3: Platform font rendering varies slightly between web, Android, and iOS.
- P3: Additional character poses can be commissioned later for feature-specific screens without changing their layouts.

## Motion refinement

- Replaced the non-functional menu and decorative streak counter with a real brand lockup and Settings action.
- Added a restrained spring entrance and slow character drift tied to the hero's communication state.
- Added a one-time transform-based progress reveal without animating layout dimensions.
- Rebalanced typography away from uniform extra-bold weights and removed unnecessary all-caps copy.
- Added purposeful per-feature icon colors, soft highlights, and tactile surfaces.
- Motion resolves to an equivalent static state when reduced motion is enabled.

final result: passed

## UI/UX Pro Max refinement

- Replaced repeated generic feature-card stacks on Profile, Communicate, and Assist with screen-specific compositions.
- Profile now has identity, language, local-privacy status, meaningful stats, and grouped personal tools.
- Communicate now prioritizes face-to-face mode and separates secondary communication methods by hierarchy.
- Assist now uses a compact, color-coded tool grid and separates emergency/history actions from everyday assistance.
- Verified rendered layouts, scroll behavior, route semantics, bottom navigation, and TypeScript compilation.

## FTF wireframe redesign — September 5, 2026

### Source and evidence

- Visual truth: `C:/Users/Admin/AppData/Local/Temp/codex-clipboard-5f17b8aa-1bf8-439d-bfcf-bc75854c3cf7.png` (897 × 529 pixels).
- The hand-drawn phone region is approximately 290 × 504 pixels. It specifies relative layout and icon meanings, not finished typography, colours, device chrome or literal conversation copy. Comparison excludes the surrounding legend and preserves the app's existing palette/runtime.
- Initial capture: `docs/qa/ftf-initial.png`, default preview with a 430px-wide app region.
- Final portrait: `docs/qa/ftf-final-375.png`, measured 375 × 812 pixels, CSS viewport 375 × 812, devicePixelRatio 1. Browser screenshot bytes are JPEG despite the capture filename extension.
- Landscape: `docs/qa/ftf-landscape.png`, CSS viewport 812 × 375, app width 430, devicePixelRatio 1.
- State: FTF, Partner above, You below, central controls facing You; demo conversation with multiple messages from each sender. Flipped central state and a populated Partner composer were also inspected.
- Full-view comparison: source, final portrait and landscape captures were opened together in the same comparison tool response. Comparison is structural, not a pixel-exact imitation of a hand-drawn wireframe.
- Focused checks: full-size 375px capture makes the 48px icon controls, sender alignment and profile bands readable; DOM measurements confirm equal 374px portrait halves, Partner transform matrix(-1,0,0,-1,0,0), and no transform on You. No additional crop was needed.

### Findings and iteration history

1. P2 — initial composer consumed too much vertical space. Replaced default multiline height with a 48px scrollable input. Removed redundant message-author metadata from visual bubbles while retaining explicit accessible sender labels. Final portrait shows substantially more history.
2. P2 — short outgoing text could wrap one character per line because percentage bubble width was resolved against an intrinsically sized row. Gave message rows a definite full width, with right justification for outgoing messages. Final captures show “No” on one line.
3. P1 — landscape fixed headers/composers consumed the history viewport. Added a height-based compact layout: one-line identity, smaller vertical gutters, no redundant footer hint/success copy, and compact message spacing. Post-fix landscape has independently scrollable histories (58.5px each) and retains 48px controls; long messages require scrolling at this height.
4. P2 — animation cleanup could reset the central bar before reverse rotation. Keep a scoped GSAP context for its lifetime; kill interrupted tweens without reverting the current angle. Verified both final orientations; correctness never depends on animation completion.

### Required fidelity surfaces

- Typography: existing system font retained; 17/24 message text, 16px input, medium-weight navigation and smaller secondary labels. The sketch does not prescribe a production font. No oversized marketing headings or ornamental typography added.
- Spacing/layout: two equal halves, full Partner inversion, identity nearest the centre, fixed outside composers, full independently scrollable histories, and persistent central Back/flip/Chat controls match the sketch's layout contract. Short-height mode preserves this arrangement.
- Colours/tokens: existing white/cream/lavender palette and primary dark-purple navigation. Incoming/outgoing are differentiated by position and explicit accessible sender descriptions, not colour alone.
- Assets/icons: supplied legend maps to existing Ionicons microphone, phrase bubble, volume, back and chat symbols. No missing raster assets, generated avatars, custom illustrations or replacement CSS artwork.
- Copy: user/partner identity, meaningful message text, labelled icon controls, explicit demo microphone limitation. Source legend text remains documentation, not pasted into the app.

### Verification

- Browser: Partner typing/sending; exact-message read-aloud control; phrase selection/sending; centre flip in both directions; Urdu draft survives FTF → Chat → FTF; clearing the draft removes Send; keyboard Tab reaches a visible focus ring. Message history is preserved during layout changes.
- DOM: no page-level horizontal overflow at 375px; visible FTF buttons meet 48 × 48px. Zero-size controls on hidden underlying navigation screens were excluded.
- Console: no warnings/errors returned by the browser log check.
- Automated: six model/demo lifecycle tests pass; TypeScript passes; Expo production exports succeed for web and Android.
- Motion: GSAP isolated to web; native uses installed Reanimated. Both implementations include reduced-motion behavior and cleanup. Actual OS reduced-motion switching was not exercised because the browser's exposed capabilities do not provide media emulation.
- Residual test gaps: physical Android/iOS keyboards (especially inverted Partner input), screen readers, largest Dynamic Type and reduced-motion device settings. This is an existing light-only app; no dark theme is claimed. Native export is a bundle check, not a physical-device QA pass.

### Implementation checklist

- [x] Preserve single message store and separate sender drafts.
- [x] Match mirrored layout and independently rotating central bar.
- [x] Add per-message read-aloud and fixed composers/phrase pickers.
- [x] Retain honest speech-demo lifecycle and cancellation.
- [x] Scope GSAP to web, with native fallback and animation cleanup.
- [x] Fix observed portrait/landscape layout issues and recapture.
- [x] Run model tests, typecheck, web export and Android export.

No remaining actionable P0/P1/P2 findings in the tested browser layout. Physical-device checks remain a separate verification step.

final result: passed

## FTF follow-up fixes and real microphone input — 2026-09-05

This follow-up supersedes the earlier speech-demo description above. The earlier pass did not cover all layout-change or physical-device scenarios.

### Reproduction and fixes

- Phrase picker reproduced as the same near-white surface as chat. It now uses mint/tinted heading surfaces, an explicit sender instruction and existing icon controls. Evidence: [updated picker](docs/qa/ftf-phrases-fixed.jpg).
- Normal append scrolling already worked in the tested browser. A viewport-height change reproduced a missing-latest-content case: receiving history `scrollHeight - clientHeight - scrollTop = 56px` after shrinking 812px to 700px. Layout-aware animation-frame scheduling now returns `0px`, and both sender directions were verified. Phrase-picker return also schedules follow-to-latest. Native keyboard behavior remains untested.
- Both microphones previously produced fixed sample text. The obsolete demo helper/tests were replaced by one shared recognition session and platform adapters using `expo-speech-recognition` 57.0.0. Owner/draft snapshots, interim preview, explicit Send, cancel/blur/background cleanup, permission failures, and bounded stop recovery are covered by tests. No cloud API key or custom backend was added. Device speech may process audio online.

### Verification and limits

- TypeScript passes; 14 tests pass (4 conversation tests, 10 recognition lifecycle tests). The new tests use simulated device events, not real recorded speech. Red was observed before the recognition implementation; the browser layout regression was observed before and checked after the fix.
- Web and Android production JS exports pass. The native recognition module has not been compiled into an installed phone build or tested with physical audio here.
- Browser: five consecutive You messages, Partner reply, follow-to-latest after viewport shrink, separate draft retention in FTF → Chat → FTF, phrase selection, and HTTP-LAN microphone explanation in both layouts verified. No fake transcript or message was inserted on unsupported HTTP; the draft remained usable.
- Compact web FTF at 812 × 375 remains navigable; microphone guidance is dismissible. Dismissal restores the history viewport (50px in this compact test). No native landscape claim: the app is portrait-locked.
- Console returned one React Native Web `shadow*` deprecation warning; no error entries were returned. npm install reported 13 moderate dependency vulnerabilities; no broad audit fix or unrelated upgrades were applied.
- Remaining checks: successful microphone permission grant, actual English/Urdu recognition and accuracy, native module compilation, physical keyboard interaction, screen reader, device reduced motion, and native permission/service errors. Localhost/HTTPS and native-build requirements are documented in [QA guide](docs/qa-guide.md).

Result: phrase-picker and reproduced browser-scroll fixes verified; speech integration is implemented and simulated lifecycle tests pass, but real-device speech sign-off remains open.
