# Face-to-face: shared phone layout

Visual source: user's hand-drawn FTF reference supplied September 5, 2026.

## Layout contract

- Two equal independent chat viewports, with a persistent central navigation bar.
- Each viewport has identity nearest the centre, a full message history, and a fixed composer at the outside edge.
- The entire Partner viewport, including text, message actions, phrases and composer, is rotated 180 degrees. You stays upright.
- Both viewports read the same ordered messages. A message is outgoing only in its author's viewport; incoming messages have a read-aloud action.
- Centre bar contains Back, Face-to-face/flip, and Chat. Tapping its flip control changes only this bar's orientation. Focusing or using a person's composer also makes the bar face that person. This does not change sender identity or rotate the two histories.
- Wireframe legend symbols map to semantic Ionicons microphone, chat-bubble and volume controls; no extra imagery or decorative assets are needed.
- Phrase selection uses a mint surface with a contrasting heading and explicit sender label, not the appearance of chat history.
- Both histories follow the newest message after content changes, viewport changes, and returning from phrase selection. Scrolling is scheduled after layout, with reduced-motion support.

## Ownership and architecture

- `Conversation` retains the single message list and separate You/Partner drafts. Layout switches do not duplicate or reset them.
- `FaceToFace` owns transient phrase selection, playback and central-bar orientation. The same panel template renders both participants. `Conversation` owns one speech-input session shared by FTF and ordinary chat.
- Speech playback is associated with both the requesting participant and the exact message ID; switching messages cancels previous playback.
- Microphones use device/browser speech recognition via `expo-speech-recognition` 57.0.0, not fixed samples. Owner and pre-existing draft are captured when input starts. Interim text is preview-only; completion appends recognition to that person's draft for explicit Send. Cancel discards the recognition, not the original draft. Layout changes, route blur, backgrounding and unmount cancel input. Watchdogs prevent a missing end event leaving Stop stuck.
- English/Urdu selection is shared across the two views. Device/browser services may process audio online. Web requires a supported browser and secure context; native requires a build containing the module. Expo Go and unsupported contexts retain typing and show actionable feedback.
- GSAP lives in `ftf-motion.web.tsx` only; native uses the already-installed Reanimated implementation. Both use transform/opacity, cleanup, and reduced-motion equivalents. No global animation selectors or new state framework.

## Acceptance checks

- Compare layout to sketch, including full top-panel inversion and composer order.
- Type/send, phrases, speech completion/stop/cancel, permission-denied and unsupported-context feedback, exact-message read/stop, flip, Back, and Chat round trip.
- Separate drafts survive phrase selection and Chat round trips; empty Send is disabled.
- Scroll histories independently; latest messages remain reachable; fixed controls do not overlap chat content.
- Check compact portrait, landscape, long English/Urdu text, keyboard focus and reduced motion. Report physical-device checks separately from browser checks.

Ponytail choice: reuse the existing store, Expo Speech playback, icons, palette and mobile runtime. GSAP handles web motion; one speech-recognition dependency bridges the platform recognizers. No custom backend, API key, audio-file persistence, or new global state framework is introduced. The obsolete fixed-sample helper and its tests were replaced with session lifecycle tests.
