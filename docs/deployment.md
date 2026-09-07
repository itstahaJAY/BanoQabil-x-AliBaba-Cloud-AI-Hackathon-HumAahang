# Railway hackathon demo

## Live release verification — 2026-09-07

[Open Hum Ahang](https://humahang-production.up.railway.app). Railway deployment `c16fb47e-c53f-46e8-8cf8-d21743963d10` reached `SUCCESS` from GitHub commit `c9e71ce`; the actual Docker build succeeded. The deployed onboarding screen rendered in the browser. Home, health, transcription, vision and speech-setup URLs returned 200; environment-file URLs and unknown API routes returned 404.

With explicit operator approval, the deployed authentication → OpenAI STT → DeepSeek bilingual WebSocket path produced two validated English/Urdu caption pairs from synthetic English speech, with zero errors and a clean stop. OpenAI image analysis returned seven objects from non-sensitive bundled artwork, and Urdu translation retained all seven. The temporary QA grant was revoked. This proves deployed connectivity/flow, not human Urdu accuracy or physical-device microphone/camera quality; complete the short user QA below.

## Architecture and scope

The Dockerfile builds the Expo web app and serves its static export from the same Node service as the existing HTTP/WebSocket backend. HTTPS web clients discover that same origin automatically. Local Expo on port 8081 and native clients retain their existing local backend default; `EXPO_PUBLIC_STT_URL` remains an explicit override. No provider keys are embedded in the web build.

Public deployment is opt-in: `STT_DEPLOYMENT=public`, `STT_PUBLIC_URL=https://humahang-production.up.railway.app`, `WEB_ROOT=/app/dist`, and `PORT=8787`. Railway's public domain may supply the public URL when `STT_PUBLIC_URL` is omitted. Default local startup remains loopback-only. Exact Host/Origin checks, authentication, short-lived pairing, input limits and provider adapters remain in place. Railway's health-check host is accepted only for the health route.

Runtime Railway variables: `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `STT_CLIENT_TOKEN`, `STT_PROVIDER=openai`, `OPENAI_STT_MODEL=gpt-4o-transcribe`, and `OPENAI_VISION_MODEL=gpt-4.1-mini`. Secrets belong in Railway variables or the operator's ignored `server/.env`, never GitHub, Docker ARGs, or `EXPO_PUBLIC_*`. `DEEPGRAM_API_KEY` is needed only if explicitly rolling recognition back to Deepgram.

Only one replica is supported by the in-memory demo pairing/session/rate limits. A server restart invalidates connections; audio/photos are not persisted by this server. Saved profile and caption text stay in the user's browser/device storage. This is a hackathon prototype, not an emergency dispatch service or a validated sign-language translator.

## Operator: connect the public demo

After the deployment is healthy, run these two lines in PowerShell at the repository root (keep your existing `server/.env`):

```powershell
$env:STT_PAIR_URL='https://humahang-production.up.railway.app'
npm run backend:pair
```

No local backend needs to be running for this remote command. On the public website, open **Profile → Settings → Speech setup**, then enter the fresh code. It is one use, expires after five minutes, and is not an API key. The resulting connection lasts up to one hour or until app reload/server restart. Generate another code for another device. Do not publish codes or tokens in the repository/demo video.

To return the pairing command to the local backend:

```powershell
Remove-Item Env:STT_PAIR_URL -ErrorAction SilentlyContinue
```

## Three-minute QA after deployment

1. Open the HTTPS demo URL on the PC, then on your phone's browser (not Expo Go). **Expected:** the app loads without Metro, USB forwarding, or a local server. Refresh `/transcription` and `/vision`: each route still loads.
2. Pair once using the steps above. In Live Captions choose Urdu input, allow microphone access, and speak a short Urdu sentence. Stop; switch the Urdu/English output tabs. **Expected:** readable paired results; switching output does not restart recording. Repeat English with English input. Mixed speech is still a known quality limitation.
3. On the phone open AI Vision, take/review a non-sensitive photo, and tap Analyze. **Expected:** an object description; Urdu/English result controls and device read-aloud work. Denying permission or using an expired code should show a recoverable message, not freeze the app.

The PC has no camera, so use the phone for camera QA. Browser microphone/camera permissions and installed Urdu voices are device-dependent. Expo Go still cannot run the native Live Captions recorder; use this HTTPS web demo or a development build instead.

## Release checks and rollback

Pre-push verification on 2026-09-07: 166 app tests and 139 backend tests passed; TypeScript checking, the Expo web export, and 25 exported route/asset requests passed. Docker is not installed on the development PC, so the Railway build is the first actual container build. Credential and token scans are repeated on staged Git blobs before push.

Dependency audit: backend has zero reported vulnerabilities. The existing frontend dependency tree has 13 moderate findings and no high/critical findings. The reachable `decode-uri-component` malformed-query CPU-denial advisory remains deferred for a tested dependency update (review by 2026-09-08); avoid untrusted demo links. The UUID advisory targets v3/v5/v6 with supplied buffers, not the inspected Xcode v4 usage. Do not use `npm audit fix --force`: its suggested Expo/router downgrades are incompatible with this app. This release is not a claim that the entire dependency tree or app is production-hardened.

Run `npm test`, `npm run backend:test`, `npx tsc --noEmit`, and `npx expo export --platform web --output-dir dist`. Railway uses the committed Dockerfile and `/health` readiness check. A successful `/health` does not prove OpenAI/DeepSeek connectivity: complete the microphone/photo checks above too.

Do not call a queued build deployed: confirm Railway reports `SUCCESS`, then test the public app and its AI path. If a later release breaks startup or critical flows, redeploy the previous successful Railway deployment. There are no database migrations to roll back. On the initial release there is no prior cloud version; stop the failed deployment and keep the working local demo until fixed. Existing local setup is unchanged.

The account had $5 trial credit and 30 trial days remaining at setup on 2026-09-07; no paid upgrade was performed. This is not a promise of permanent free hosting. Monitor Railway usage and the existing AI-provider balances before sharing widely.
