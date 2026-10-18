# DemoPop MVP: implementation compared with the plan

Reviewed October 16, 2026 against repository commit `b9023a3`.

Implementation follow-up: the bug fixes described below have now been addressed in source. See [DEMOPOP_BUGFIX_VERIFICATION.md](DEMOPOP_BUGFIX_VERIFICATION.md) for the changes, current checks, required migration, and remaining live integration verification. The findings below describe the original reviewed baseline.

DemoPop already has most of the planned MVP implementation. Its largest unfinished milestone is proving the complete authenticated cloud workflow. There are also reproduced navigation and mobile feedback bugs, a failing browser assertion, and several smaller reliability and video-quality gaps.

## Source and scope

The supplied [planning conversation](https://chatgpt.com/share/6ad2cda5-bb58-83ea-aa69-6f31c295db58) starts with a broader SaaS idea, then explicitly narrows the request to an MVP. Its final response links an MVP-only implementation prompt. That original file was available locally and is preserved as [DEMOPOP_MVP_ORIGINAL_PLAN.md](DEMOPOP_MVP_ORIGINAL_PLAN.md).

The final MVP prompt is the comparison baseline. Earlier suggestions about billing, multiple templates, landscape exports, saved brand kits, and agency workspaces do not override that prompt's explicit exclusions.

This review inspected application code, schema/migrations, renderer/worker, tests, setup documentation, existing video artifacts, and desktop/mobile browser behavior. Application source was not changed.

## What is already implemented

| Planned capability | Current evidence | Assessment |
| --- | --- | --- |
| Original 15-second vertical composition | `src/video/Reveal.tsx`, `src/video/Root.tsx`, `src/shared/project.ts` | Present. The existing MP4 passes fresh metadata verification. |
| Original fictional screenshots and local sample-render command | `public/sample/`, `scripts/create-assets.ts`, `scripts/render-sample.ts` | Present. A sample MP4 is checked in at `out/demopop-sample.mp4`. A new render was not run during this review. |
| PNG/JPEG/WebP uploads, positioning, independent crop/zoom, reset | `src/components/Editor.tsx`, `src/server/images.ts`, shared crop geometry | Present. Local replacement and corrupt-image feedback were exercised in the browser; server decoder tests pass. Private cloud uploads are unverified. |
| Name, opening caption, two highlights, color, optional logo, closing URL text | Shared Zod schema and editor controls | Present. Captions have limits and counters. Color-dependent readability needs attention. |
| Real interactive preview, play/pause, scrub, restart, fullscreen | `src/components/Preview.tsx` | Present. Uses the same `Reveal` component as export. |
| Email/password auth and confirmation | `src/components/Auth.tsx`, API auth handlers, `/auth/confirm` | Implemented; not verified with live Supabase. |
| Create, save, reopen, rename projects | Projects UI, editor name field, API project handlers | Implemented; rename occurs by editing the project name and saving. Live persistence is unverified. |
| Private owner-scoped assets, RLS, protected downloads | Migration, `src/server/access.ts`, API and worker | Implemented. Local access-helper tests and embedded Postgres tests pass; real two-account isolation is unverified. |
| Background export with immutable snapshots and duplicate-job reuse | `enqueue_render`, worker, export API | Implemented. Embedded SQL tests pass. Concurrent real HTTP requests are unverified. |
| Job claiming, leases, fencing, bounded retry, actual render progress | Migration and `worker/index.ts` | Implemented. Local SQL semantics are tested; real worker crash/restart and Storage integration are unverified. |
| Downloadable H.264 MP4 | `worker/render.ts`, private download endpoint | Local sample is real and valid. Authenticated browser-to-worker-to-download workflow is unverified. |
| Compact home, auth, projects, desktop/mobile editor | `src/app/`, `src/components/`, CSS | Present. Mobile layout passes the existing overflow test. Mobile error visibility has a reproduced bug. |
| Limits, schema validation, setup/deployment documentation | API, migration, `.env.example`, `README.md`, `Dockerfile.worker` | Present. No cloud credentials exist in checkout `.env` or `.env.local`. Docker build is documented as unverified. |

Do not recreate these systems from scratch. Extend and verify the existing implementation.

## Remaining work, ordered by priority

### G1 — Prove the cloud workflow (P0; implemented but unverified)

There is no configured Supabase environment in this checkout. The README correctly lists auth, private storage, real save/reopen, cross-account denial, worker polling/render/upload, signed download, concurrent requests, and failure recovery as unverified. Local PGlite tests use minimal Auth/Storage stubs and do not establish that the hosted services work.

Needed: a real integration checklist and executable checks where practical; configured verification when credentials become available. Use two test accounts. Exercise signup/confirmation/login/logout; create/upload/save/rename/reopen; export/progress/download; owner isolation across all resource types; duplicate export requests; edits during export; worker interruption/reclaim; retry; expired links; and configured limits.

This is a verification/setup gap, not evidence that those features are absent or broken. Do not invent successful cloud results or replace Supabase with a mock backend.

### G2 — Repair and make browser verification reproducible (P1; reproduced)

`npm run test:browser` currently returns one pass and one failure against the existing local server. The desktop test reaches corrupt-upload feedback, then fails at `tests/browser/editor.spec.ts:78`: `getByRole("alert")` matches both the editor error and Next.js's route announcer. The image rejection itself works.

The Playwright config also depends on an already running server at a fixed `http://localhost:3000`, without starting or verifying its own server. Add a deterministic, documented test-server setup, a specific assertion for the actual product error, and targeted coverage for the reproduced issues below. Do not remove the framework's accessibility announcer to satisfy the selector.

### G3 — Protect unsaved work during browser history navigation (P1; reproduced)

The plan requires a warning before navigation discards unsaved work. `Editor.tsx` guards `beforeunload` and clicks on root-relative links but does not cover client-side browser history navigation.

Reproduction: open the home page, select Create a video, edit the project name, then use browser Back. The home page appears with no confirmation dialog and the edit is lost.

Needed: a tested navigation strategy that preserves edits when the user cancels, handles Back/Forward as well as application links/reload, and does not leave broken history entries. Protect the existing draft if a session expires and sign-in is needed during a cloud action. Persistent draft storage is an implementation option, not a separate required product feature.

### G4 — Show upload/save/export feedback in the active mobile view (P1; reproduced)

At 390px width, select Settings and upload a corrupt PNG. The editor sets the correct error, but it is rendered inside the hidden Preview panel. The error becomes visible only after switching to Preview.

Needed: one accessible feedback region outside the tab-specific hidden panels, or equivalent feedback adjacent to the relevant control. Include loading and failure/success states for actions initiated on either tab without duplicate announcements.

### G5 — Finish the two highlight movements (P1; partial plan implementation)

The planned sequence calls for two controlled improvement highlights between seconds 7 and 12. `Reveal.tsx:47` applies one continuous scale change from 1 to 1.045 over frames 210–360. The two captions change at frame 285, but there are no distinct movement beats associated with them.

Needed: two deliberate frame-driven pan/zoom beats, coordinated with the existing captions and constrained to the selected crop. Keep a single template and the existing simple positioning controls. Separate user-selectable highlight regions were mentioned in the broad product idea, but are not a requirement of the final MVP prompt.

### G6 — Keep text readable for allowed brand colors (P1; code-inspected)

The input schema permits any six-digit hex color. The outro uses that color as its background and hardcodes white foreground text. A white or sufficiently light brand color therefore makes the project identity/URL unreadable. Color-dependent accent text elsewhere also needs review.

Needed: a small shared contrast decision for colored surfaces and readable treatment of accents. Check light, dark, white, black, and saturated colors in both preview and rendered frames. Do not restrict the product to the sample blue or introduce a branding system.

### G7 — Close transient-failure recovery holes (P1; code-inspected, not reproduced)

Two existing code paths merit targeted repair and testing against the plan's recovery requirements:

- Private preview links refresh on a 50-minute interval; refresh errors are silently ignored. There is no focus/visibility recovery, and a response for an older asset can update media after that asset has been replaced. Recover access without asking the user to abandon unsaved edits; reject stale responses.
- `worker/render.ts` caches the bundle promise. A rejected initial bundle remains cached, so following jobs in that process can fail with the same rejection until restart. Reset failed bundle state and clean only controlled temporary paths. Keep a useful error and allow a later valid job to succeed.

These are bounded fixes to existing behavior. The review did not simulate an expired real signed link or force a bundler failure.

### G8 — Describe reused exports accurately (P2; code-inspected)

The database correctly reuses an active job and retains its immutable snapshot. The export API returns only an ID; the editor always reports that an export started. A concurrent export from another tab can therefore return an older active snapshot without clearly telling the user it was reused.

Needed: truthful newly queued versus existing-job feedback. Keep the server-side deduplication and snapshot rules. Later edits must remain saved and apply only to a subsequent export. A full export-history product is not required.

## Verification performed during this review

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed. |
| `npm run lint` | Passed. |
| `npm test` | Passed: five tests, including the real migration in PGlite. The first sandboxed attempt was blocked by subprocess permissions; the permitted rerun passed. |
| `npm run test:browser` | One passed, one failed due to the ambiguous alert selector described above. |
| Focused browser Back check | Reproduced silent loss of the unsaved project edit. |
| Focused 390px corrupt-upload check | Reproduced error hidden on Settings and visible on Preview. |
| `npm run verify:video` | Passed for the existing sample: 1080 × 1920, 30fps, 15 seconds, H.264, yuv420p, BT.709, no audio. |
| Visual inspection | Inspected desktop home/editor images and sample/long-text-variant contact sheets. Sample intro, wipe, captions, and outro are present. |
| Fresh production build/new MP4 render | Not run during this review. Existing build and rendered artifacts were inspected; earlier README claims were not treated as a new verification result. |
| Live Supabase and worker/Docker hosting | Not verified. |

The browser checks used the already running service on port 3000. This review did not stop or replace that service. Future verification should start and identify a controlled test server.

## Deliberately deferred

These are absent, but are not missing requirements of the final MVP plan:

- Payments, plans, credits, subscriptions, pricing tables, and paid export allowances.
- Multiple motion templates, landscape/square formats, 4K, arbitrary duration.
- Saved brand kits, font selectors, agency/team workspaces.
- AI-generated video/copy, audio, voiceover, URL screenshots, scraping.
- Lambda and additional queue/cloud-render infrastructure.
- Share pages, public galleries, analytics, referrals.

Additional usability/operations ideas such as password recovery, project duplication/deletion, autosave/draft recovery, full export history, and automatic retained-storage cleanup were not requested in the final plan. Evaluate them separately after completing and validating the workflow above.

The implementation-ready continuation is [DEMOPOP_MVP_COMPLETION_PROMPT.md](DEMOPOP_MVP_COMPLETION_PROMPT.md).
