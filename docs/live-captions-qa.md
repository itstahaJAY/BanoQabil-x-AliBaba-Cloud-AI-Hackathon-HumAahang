# Live Captions: run it and test it

Updated 2026-09-07. This guide replaces the old device-language fallback/Translate-button tests for Live Captions only. Chat/FTF and device read-aloud are unchanged.

## First test on this PC

Your `server/.env` must contain your OpenAI key, DeepSeek key and `STT_CLIENT_TOKEN`. OpenAI recognition is now the default; see the [short migration/restart/QA checklist](openai-stt-migration.md). Keep keys there—do not paste them into the app or chat. If not configured, follow [server-only setup](stt-backend.md#setup-on-this-pc) once.

1. Open PowerShell in `C:\Users\Admin\Documents\ChatGPT\AliBaba Cloud AI Hackathon 2`. If your old backend is running, stop **that terminal** with Ctrl+C. Run:

   ```powershell
   npm run backend:start
   ```

   Leave it open. It prints a **Local connection code**: ten characters, usable once within five minutes. This is not an API key.

2. Open a second PowerShell in the same folder. Reuse the existing Expo server on 8081 if running; otherwise run:

   ```powershell
   npx expo start --web --localhost --port 8081
   ```

3. Open [Live Captions](http://localhost:8081/transcription) in Chrome/Edge. Refresh if needed. **The demo operator** opens **Profile → Settings → Speech setup** (also reachable from the **Demo setup needed → Set up** banner), enters the code from step 1 and presses **Connect**, then goes Back. The form is no longer on the everyday caption screen. Your app may show translated labels if your interface language is Urdu/Roman Urdu.
4. In **Speaking language**, choose **اردو** (the default). A short voice indication identifies your choice; wait for it to finish or tap **Stop voice**. Press **Start microphone** and allow access when asked. This sends your audio to OpenAI (Deepgram only on explicit operator rollback) and finalized text to DeepSeek and can use API credit. Use your own voice, fictional content, and no bystanders or sensitive information.
5. Say **“مجھے پانی چاہیے”**. Wait for the completed Urdu caption. Click **English** in the **output tabs below the mic** to see the corresponding English version; click **اردو** there to return. These tabs do not change the separate Speaking language selection above the mic.
6. Press **Stop microphone**. It turns the mic off while captured speech finishes processing. Completed captions remain. **Save** appears when text exists; use **More → History** to reopen it. **More** also contains text size, manual entry, setup and privacy details.

If the code expires or you refresh the app, get another code in a separate terminal:

```powershell
npm run backend:pair
```

No restart is needed just to issue a fresh code. The code is one-use, while the app's scoped connection lasts up to one hour in memory. Disconnect removes this app connection; restarting the backend clears all codes/grants. Never post a connection-code screenshot publicly. `/health` reports server health, not successful API credentials or speech accuracy.

## Then test your Android phone

**Expo Go cannot run this new recorder.** It can preview the screen/manual entry, but live audio requires a newly compiled **Hum Ahang development build** containing `react-native-audio-api`. A JavaScript reload does not add native code.

1. Follow [Android native build on this PC](qa-guide.md#android-native-build-on-this-pc). Rebuild even if an older Hum Ahang app is already installed. The first build needs Android Studio/SDK/JDK, Git Bash on Windows, and native dependency downloads. Review any SDK license prompts yourself. Compilation with this exact RN 0.86 setup has not yet been verified.
2. Keep your phone connected to this trusted PC by USB, with USB debugging approved on the phone. Keep the backend running from PC step 1. In PowerShell run:

   ```powershell
   & 'C:\Users\Admin\AppData\Local\Android\Sdk\platform-tools\adb.exe' devices
   & 'C:\Users\Admin\AppData\Local\Android\Sdk\platform-tools\adb.exe' reverse tcp:8787 tcp:8787
   & 'C:\Users\Admin\AppData\Local\Android\Sdk\platform-tools\adb.exe' reverse tcp:8081 tcp:8081
   ```

   `devices` must list your phone as `device`, not `unauthorized`. With more than one connected device, select the correct serial using `adb -s SERIAL ...` rather than guessing.
3. Open the installed **Hum Ahang** app, **not Expo Go**. If the development client needs a server address, use `http://127.0.0.1:8081`. Keep Metro running (`npm run start:device` after the initial build).
4. Run `npm run backend:pair` for a **new** phone code—the PC code cannot be reused. Open Live Transcription on the phone, connect with the new code, tap the mic, and approve microphone permission.
5. Repeat the checks below. Keep the cable attached. The backend remains PC-loopback-only; USB forwarding is what makes the phone's `127.0.0.1:8787` reach it. No router forwarding, public tunnel or disabled firewall is needed. Do not replace the URL with a plain HTTP LAN address: this client rejects it.

If a step fails, send the **in-app error text** (no keys/codes), phone model/Android version, and whether it was a native development build or browser. Native compilation or permission/network failure is `BLOCKED`, not evidence that translation quality failed. iOS native compilation requires macOS/Xcode or a separately arranged build.

[Android's local-server forwarding guidance](https://developer.android.com/develop/ui/views/layout/webapps/access-local-server) explains `adb reverse`; [recorder setup](https://docs.swmansion.com/react-native-audio-api/docs/fundamentals/getting-started/) explains the native dependency.

## Focused acceptance checklist

Record PC and phone results separately as PASS / FAIL / BLOCKED / NOT RUN.

Previous user acceptance: navigation/input checks 1–5 and gesture opt-out/navigation check 7 passed. English with English input and Urdu with Urdu input worked well on Deepgram according to the user; mixed speech remained weak. The user subsequently authorized the [isolated OpenAI migration](openai-stt-migration.md), superseding the earlier engine freeze. Repeat its short language/stop/regression checklist; previous Deepgram acceptance does not establish OpenAI Urdu/mixed recognition quality. The earlier UI simplification below is otherwise unchanged.

Quick retest of this UI revision: open/dismiss the half-height gesture sheet; use its larger pad and Buttons shortcut; open More for secondary caption actions; visit Speech setup and Back without losing an unsaved draft; prepare a real connection yourself and confirm the setup banner disappears. No additional hybrid-quality retesting is required for this UI pass.

| Test | Action | Expected |
| --- | --- | --- |
| C01 Urdu | Select Urdu input while stopped; say “مجھے پانی چاہیے” | Urdu script by default; English output has the same meaning. Never Hindi, even briefly. |
| C02 English | Stop and wait; select English input; say “Please bring water at 3 PM.” | Urdu translation first; English version keeps the original meaning and time. Equivalent `3:00 PM` is valid, not a changed time. |
| C03 Mixed/validation | Select Urdu input; say “Mujhe kal 3 PM par appointment chahiye.” Repeat separately with English input and record the difference | Both versions should preserve complete meaning/time. Mixed recognition is not guaranteed. If a segment fails, report the new **in-app stage message**, selected input, test sentence and any completed text. Do not assume recognition failed. |
| C04 Negation/quality | Say “I do not need help.” Then the reported “mujhe pani chahiye” example | No lost negation. A plausible but incorrect sentence is a FAIL; refinement cannot recover speech STT misheard. |
| C05 Output tabs | Switch Urdu/English five times, including while listening | Instant local view change, no new mic start, no repeated/reordered speech. Future captions appear in the active tab. |
| C06 Stop/restart | Speak, stop, wait for processing, start again | Mic indicator goes off on stop; completed text remains. New session appends once. At three minutes the bounded session ends and offers explicit retry. |
| C07 Leave/background | While listening, go Back/Home or minimize the browser/app | Recording stops. Returning does not automatically restart or append late results. Unsaved screen-local captions may be lost when the page unmounts—save completed text first. |
| C08 Permissions/connection | Deny mic permission; retry after allowing it. Separately stop your own backend during listening | Actionable message, no fake listening/English-device fallback. Existing completed text remains. Restart backend and reconnect with a fresh code. |
| C09 Save | Stop; save Urdu. Switch to English; save again. Open History | Two separate correctly labelled records, neither overwrites the other. Old History records remain readable. Only text is saved. |
| C10 Manual fallback | Type a manual transcript, finish editing, save; return to live captions | Clearly marked not translated; does not rewrite either live output. History says language unverified for manual text. |
| C11 Readability | Use Larger text; test output direction and long paragraphs | Urdu RTL, English LTR independent of menu language; controls reachable and new captions follow the bottom unless you scrolled up. |
| C12 Input control | While stopped, swipe left/right **only in Input language swipe area**, or tap English/Urdu above it | Left selects English, right selects Urdu; voice identifies it. URL stays on Live Captions; output tab and existing captions do not change. Mic stays disabled until the indication stops. |
| C13 Input lock | Try changing Speaking language during startup, listening, stopping and final processing | Selection remains fixed and controls disabled. Once capture releases and processing finishes, a new selection works and applies to the next recording only. Output tabs still work while recording. |
| C14 Voice failure/stop | Choose a language, immediately tap Stop voice, then try mic | Mic waits for confirmed stop; no announcement is recorded. Missing voice reports an honest message; a failed/stalled stop keeps the mic locked with an explicit retry. Native screen readers should announce the selection without duplicate app speech. |

For PC C05 network proof (optional): press F12 → Network, filter `8787`, clear the list after a sentence completes, then switch tabs. No new HTTP connection or provider operation should be caused by a tab click. Do not send screenshots containing Authorization headers or pairing codes. The server/provider-double tests also cover duplicate results, malformed outputs, timeouts and stale callbacks without spending API credit.

Expected limitation: translated segments appear after stable STT and DeepSeek processing, not guaranteed instant word-by-word. Measure the delay you see. Live Captions now uses explicit `ur`/`en` input, not `multi`; neither choice guarantees recognition of every code-switched word. The confirmed validator regressions are tested without audio; the user's previous live failing stage remains unconfirmed until the new message is observed.

Test the six separate navigation gestures, opt-out and safety boundaries using the [short navigation checklist](navigation-gestures.md#qa).

## Automated checks

```powershell
npm test
npm run backend:test
npx tsc --noEmit
```

See the [audit and verification record](qa/live-captions-bilingual-audit.md) for what was actually run and what remains unverified. The earlier WAV smoke command exercises legacy source mode; it does not test this screen's paired-output workflow.
