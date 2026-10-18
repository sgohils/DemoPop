# DemoPop — master prompt to complete the existing MVP

You are the implementation engineer for DemoPop. Complete the existing MVP in this repository. Implement the missing behavior and fixes below, run the application, and verify the result. Continue from the working code; deliver code and evidence, not another plan or a redesigned landing page.

## Establish context and preserve the MVP scope

Read applicable `AGENTS.md` files, `README.md`, `docs/DEMOPOP_MVP_ORIGINAL_PLAN.md`, and `docs/DEMOPOP_MVP_GAP_AUDIT.md`. Inspect the actual current code and git status before changing anything. The audit describes the state reviewed at commit `b9023a3`; verify findings against the current checkout and do not overwrite later user work.

The original planning conversation is https://chatgpt.com/share/6ad2cda5-bb58-83ea-aa69-6f31c295db58. The final MVP-only prompt takes precedence over earlier product expansion ideas. The local plan and this prompt contain enough information to continue if the shared conversation is unavailable.

DemoPop turns two website screenshots into a polished before-and-after marketing video for freelance web designers. Retain the warm off-white/ink/blue interface, existing fictional Forma Studio sample, and simple editor workflow.

Preserve these boundaries:

- One template; vertical 1080 × 1920; 30fps; 450 frames; 15 seconds; silent H.264 MP4.
- PNG/JPEG/WebP inputs, independent before/after positioning and crop/zoom, optional logo.
- Project name, opening caption, two highlight captions, color, closing URL as visual text.
- Next.js App Router, TypeScript, existing styling approach, Remotion/Player, Supabase Auth/Postgres/private Storage, and a separate Node render worker.
- Existing Postgres queue, immutable snapshots, owner isolation, duplicate-job prevention, fencing/leases, bounded retry, honest progress, private signed download, and configurable resource limits.

Do not add billing, credits, subscriptions, extra templates/formats, brand-kit management, teams, AI/audio, scraping, timeline editing, public sharing, analytics, AWS Lambda, or another queue/backend. Password recovery, project deletion/duplication, full export history, and automatic retained-storage cleanup are outside this continuation unless necessary to resolve a specific in-scope defect. Keep fixes small and complete.

Check current official documentation before selecting or changing framework/Remotion/Supabase APIs. Reuse the existing dependencies and pinned Remotion versions unless a demonstrated incompatibility requires a change.

## 1. Make the verification harness reliable

The audited baseline passed typecheck, lint, and five core/SQL tests. The browser suite had one pass and one failure: the desktop assertion `getByRole("alert")` matched both the product error and Next.js's route announcer.

- Fix that assertion by locating the actual editor upload error and checking its meaningful message. Preserve framework accessibility behavior.
- Give Playwright a documented, controlled test-server lifecycle and configurable base URL/port. Do not assume any service on port 3000 is the intended build. Do not terminate an unrelated running server.
- Keep local/no-Supabase browser checks separate from configured integration checks; the existing disabled-cloud assertions must not be run unchanged against a configured authenticated environment.
- Retain existing useful tests and add narrowly targeted regressions for the defects below. Do not make tests pass by deleting assertions, swallowing application errors, adding arbitrary sleeps, or globally selecting the first alert.

## 2. Protect unsaved edits and handle authentication state

The existing editor warns on reload and some internal link clicks, but browser Back can discard a dirty project without warning.

- Cover app navigation, browser Back/Forward, reload/close where the browser permits warnings, and navigation to sign-in when an operation requires authentication.
- An explicit cancel must preserve text, crop values, color, current media, dirty status, and a usable navigation history. Deliberate discard must work without repeated confirmation loops.
- Treat cloud configuration and authenticated identity as different states. Keep the sample/editor usable for visitors; show a clear sign-in action when cloud operations require an account.
- A session-expired/401 response must not discard edits or falsely show saved/exported success. Support a safe retry after sign-in without losing the draft. Use the smallest recovery mechanism that actually preserves uploaded files; an expired blob URL alone is not durable recovery.
- Do not introduce another authentication or full database implementation. Reuse Supabase and preserve server-side identity verification.

Acceptance: a dirty project survives cancelling browser Back, internal navigation, and an auth interruption. An intentional discard permits navigation. A saved project does not trigger an unnecessary warning.

## 3. Make mobile action feedback visible and accessible

At 390px width, Settings uploads currently set an error inside the hidden Preview panel.

- Put actionable error/status feedback in a region visible from the tab where the action was initiated, or use an equivalent accessible shared region outside the hidden panels.
- Cover invalid/corrupt/oversized upload, upload progress, save failure, auth-required failure, export request failure, and successful operations.
- Keep feedback near enough to the initiating control to understand what happened. Announce messages once and preserve the user's current settings and tab.
- Preserve keyboard focus, labels, mobile overflow behavior, and the existing user-controlled video playback. Keep surrounding UI reduced-motion support.

Acceptance: on a 390 × 844 viewport, a corrupt upload produces visible feedback while Settings remains active, and a valid replacement still updates the preview. Test Preview-initiated actions as well.

## 4. Finish the motion and color readability of the single template

Keep the existing frame-based sequence:

| Frames | Content |
| --- | --- |
| 0–59 | Project identity and opening caption |
| 60–149 | Before screenshot in a browser frame |
| 150–209 | Wipe to the redesign |
| 210–359 | Two highlight captions with two controlled movement beats |
| 360–449 | Project/agency identity, optional logo, URL text |

Short eased overlaps are fine if the structure remains readable.

The existing highlight section changes captions at frame 285 but applies one slow scale tween across the whole section. Give the two captions their own deliberate pan/zoom movement beats. Respect the existing selected crop, preserve screenshot readability, use smooth easing, and prevent blank edges at extreme source aspect ratios/crop values. Do not build a region-selection editor or expose a general timeline. Keep the same composition and geometry for Player and exported MP4.

The existing outro hardcodes white text over the user-selected brand background. Introduce a small deterministic shared contrast helper/treatment so white, black, light, dark, and saturated valid colors all produce readable text. Review color-dependent intro labels and highlight accents too. Preserve the user's color and the original sample's appearance where already readable. Keep optional logos intact and use sensible containment.

Render and inspect the original sample and a variant with changed captions/color, long permitted text, unequal sources, and a very tall screenshot. Include a light-color outro case. Check multiple frames within each movement and at the caption transition; do not prove animation only with one still frame. Keep every output 1080 × 1920, 30fps, 15 seconds, silent H.264/yuv420p.

## 5. Recover from temporary media and worker failures

Private preview inputs currently refresh on an interval and ignore errors. The worker caches its initial bundle promise, including a rejection.

- Refresh expiring private preview access on appropriate lifecycle events such as focus/visibility recovery as well as the normal schedule. Handle refresh failures visibly with a retry that preserves edits.
- Ignore responses for assets that have been replaced or projects that have changed; an older signed-link request must not overwrite the current media. Cancel/guard in-flight requests and clean up listeners/timers.
- Avoid exposing signed URLs or tokens in logs, persistent project settings, or client error reports.
- Reset a rejected bundle cache and safely clean its partial output so a later valid job can succeed without restarting the worker. Keep one active render per worker and preserve normal bundle reuse after success.
- Keep temporary-path cleanup confined to verified application-created directories. Preserve cancellation, lease-token fencing, bounded attempts, and sanitized errors.

Acceptance: simulate a failed link refresh followed by recovery and a stale response after asset replacement. Simulate a first bundle failure followed by a successful later job. Use focused failure injection rather than adding a large mocking framework. Real hosted signed-link expiry remains a separate integration check.

## 6. Tell the truth when an export is reused

The database already returns an existing active job for duplicate requests. Preserve that rule and the immutable snapshot.

- Let the API/UI distinguish a newly queued export from reuse of an existing queued/rendering job. Use the smallest compatible response/schema change and an additive migration if necessary.
- Say clearly when the existing export uses earlier captured settings. Keep later edits saved for the next new export; never mutate the running snapshot.
- Reopen the correct existing status panel and do not imply that another job or progress was created.
- Keep retry tied to the original snapshot; a fresh export after a terminal result captures current settings.

Acceptance: simultaneous requests from two tabs reuse one active job, both see truthful feedback, and editing while rendering does not change its result. Do not add an export-history screen.

## 7. Verify the real cloud workflow when configured

Inspect whether the existing environment provides valid Supabase configuration without printing secrets. Never assume the implementation is broken merely because credentials are missing.

Supply a concise integration runbook and executable, explicitly gated integration checks where practical. Use a dedicated configured test environment and two test accounts. Verify:

1. Signup, email confirmation, login, logout, and expired-session behavior with real cookies.
2. Create a project; upload before/after screenshots and an optional logo; edit captions/color/crops; save; rename; reopen; confirm values and images persist.
3. Deny unauthenticated and cross-account access to project reads/writes, asset resolution, export requests, job status, retry, and downloads, including direct endpoint requests.
4. Validate actual private Storage access, normalized images, signed-input refresh, expired input links, signed output expiry, and obtaining a fresh authorized download link.
5. Start simultaneous exports through separate real HTTP clients/tabs; prove one active job and an immutable snapshot. Confirm a later edit belongs to the next export.
6. Run the real worker through claim, render, upload, completion, and download. Inspect the downloaded file and compare its captions, color, crops, and logo with the captured preview settings.
7. Force a controlled worker interruption, wait for lease recovery, and verify bounded attempts and stale-worker fencing. Exercise a user-visible render failure and retry from the same snapshot.
8. Check configured upload, request, and daily export limits using test fixtures/configuration that do not waste a large number of full renders.
9. Verify the Docker worker build/startup if Docker is available; otherwise identify that exact check as unverified and preserve the documented standard Node worker path.

Keep completed outputs private. Never expose the service-role key to the client or accept browser-supplied ownership, completion state, arbitrary URLs, filesystem paths, or storage paths. Preserve RLS and server ownership checks through every change.

If credentials or external tools are unavailable, complete all independent code, tests, local renders, and documentation. Report exact outstanding integration checks and the minimum configuration required. Do not fake signup/save/export success, silently skip cloud tests as passes, or replace the backend with a demo database. Do not create paid infrastructure or publish a deployment as part of this continuation.

## 8. Completion evidence and deliverables

Run appropriate checks after implementation, using a controlled server:

```text
npm run typecheck
npm run lint
npm test
npm run build
npm run test:browser
npm run render:sample
npm run verify:video
npm run render:check
```

If verification scripts require environment variables to inspect the variant, document the precise commands and inspect that output too. Use representative video frames, desktop/mobile screenshots, and focused regression tests. Confirm no unhandled browser errors. Repeat checks only when a later change or unresolved failure justifies it.

Required regression coverage includes dirty Back/Forward behavior, visible mobile error feedback, authenticated/unauthenticated UI distinctions, contrast selection, highlight movement boundaries/crop safety, signed-link failure/stale-response recovery, bundler failure recovery, and truthful export reuse. Preserve the existing schema/access/queue tests. Do not label embedded SQL fixtures as live Supabase verification.

Leave:

- Working application and worker changes with necessary additive migrations; never rewrite an already applied migration as the only upgrade path.
- Updated, concise setup/test instructions and `.env.example` if configuration changes.
- The regenerated sample MP4, readable variant evidence, and inspected QA artifacts in the repository's existing output locations.
- An updated gap audit/verification record showing each item completed, still blocked, or deliberately deferred, with exact evidence and remaining setup.

Do not claim a fresh build/render passed merely because an older artifact exists. If a check cannot run, state its concrete blocker and finish independent work. Preserve unrelated work and do not commit secrets or raw downloaded conversation data.

Finish with a concise report of the changes, successful checks, any failed/unrun checks, the MP4/QA locations, and the exact remaining external setup. A working local editor is not proof that accounts/private storage/cloud export work. Begin implementing now and carry this MVP completion through verification.
