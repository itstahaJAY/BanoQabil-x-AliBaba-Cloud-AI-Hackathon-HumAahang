# Private judge access

The deployed web app supports an optional evaluation link at `/demo#access=<private-key>`.
Send the complete link privately to evaluators, never commit it or place it in a public README.
The fragment is removed from browser history on page mount and exchanged at the same HTTPS
origin for an in-memory, origin-bound client grant. Opening the link never starts the
microphone, camera, transcription, image analysis, calls or sharing.

## Operator configuration

Set both server-only Railway variables before deploying:

- `JUDGE_ACCESS_KEY`: a separate cryptographically random 32-byte base64url value (43 characters).
- `JUDGE_ACCESS_EXPIRES_AT`: an explicit UTC ISO timestamp such as `2026-09-11T07:00:00Z`.

Never reuse a provider key or `STT_CLIENT_TOKEN`. Provider credentials stay on the server.
An absent pair disables the feature. Malformed/partial configuration fails validation.
An expired, otherwise-valid pair disables judge access without breaking normal pairing.

The API is `POST /v1/demo/clients` with JSON `{ "accessKey": "<private-key>" }`.
It requires the exact configured public web Origin, returns 201 with `{token, expiresAt}`,
and uses fixed errors: 401 `judge_invalid`, 404 `judge_unavailable`, 429 `judge_limit`.
Native and missing-Origin requests cannot obtain judge grants.

## Limits and recovery

- Each session grant lasts at most one hour and cannot outlive the invitation deadline.
- The entire running server shares 30 judge grants, 30 speech-session reservations and
  60 combined photo-analysis/translation requests. Reopening the link does not reset quotas.
- Existing concurrency, request-rate, audio-duration and payload limits also apply.
- These are single-process in-memory limits, **not a durable spending cap**. A server restart
  clears grants and resets counters. Keep one replica; persistent quotas are follow-up work.
- Reloads clear the browser grant. Reopen the original private link to reconnect without
  a terminal or one-time code. Reopening also renews a stale grant after a server restart.
- Revocation: remove both judge variables (or rotate the judge key) and redeploy. This also
  clears existing process grants. Deadline expiry automatically blocks subsequent requests.
- Ordinary operator pairing remains available. Codes are single-use, expire after five
  minutes, and a new code replaces the old code. Code lifetime is not a network failure.

## Release safety

Pre-change release: `31447ecbb528375c4da11d3b814c445a5af1042e` on GitHub and Railway.
Implementation was isolated on `codex/judge-demo-access`; existing main-worktree edits and
submission/video files were not overwritten. No database/schema migrations are required.
Before release, preserve the base on a remote backup branch. Deploy only a reviewed,
tested fast-forward commit; never force-push or reset existing history.

Rollback if health, original pairing, or the new judge flow fails: redeploy the preserved
release in Railway, or revert the additive release commit and push. The app keeps the same
public URL; this is rollback, not a second independently running fallback deployment.
Existing in-memory connections must reconnect after a deployment or rollback.

## QA

1. Open the full private link in a fresh HTTPS browser. Expect a ready message, then
   **Enter demo**, with no pairing-code entry or media permission request.
2. Complete onboarding if this is a first visit. Open Live Captions. Choose input language,
   tap Mic, allow permission and say one short sentence. Expect Urdu/English output tabs.
3. Open AI Vision, explicitly capture a harmless object and analyze. Expect description;
   change its output language and use device speech. No capture starts on the judge page.
4. Reload, then reopen the original private link. Expect a new connection without terminal work.
5. On an already-connected tab, reopen the full link after a backend restart. Expect a fresh grant.
6. A missing/incorrect/expired link must show a safe error with no provider call. Never paste
   the real key into console logs, screenshots, issue reports or recorded demos.

The public homepage remains explorable without judge credentials. The private link is
evaluation access, not permanent public anonymous access or general production authentication.

## Verification record (8 September 2026)

180 frontend tests and 149 backend tests passed, including new access, expiry, quotas,
stale-grant renewal and pairing-paste regressions; TypeScript and Expo web export passed.
No new dependencies were added. npm audit reports zero backend vulnerabilities and no
high/critical frontend findings. Thirteen existing moderate frontend/build dependency
advisory entries remain (URI decoding and uuid dependency chains). Reachability has not
been fully audited; a forced Expo/router downgrade is not included in this narrow release.
Review the upgrade path by 15 September 2026. Cloud/browser verification is recorded
separately during release; automated unit success is not evidence of real device media QA.
