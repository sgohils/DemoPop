# DemoPop bug-fix verification

Implementation follow-up to the October 16, 2026 MVP gap audit. The original audit remains a record of the reviewed baseline.

Subsequent workflow and creative additions are recorded in [the improvements verification report](DEMOPOP_IMPROVEMENTS_VERIFICATION.md). The scope and check counts below refer to the earlier bug-fix release.

## Fixes

| Audit item | Change | Evidence |
| --- | --- | --- |
| G2: browser tests | Specific product-error assertion; controlled production test servers with isolated output directories and configuration restoration | Local browser suite passes playback, uploads, mobile layout, and navigation checks. |
| G3: unsaved navigation | Application-wide history tracking guards Back/Forward and links without adding dummy entries; cancel restores the mounted editor | Browser regressions cover repeated Back cancellation, deliberate discard, internal links, and Forward. A separate development Strict Mode harness checked nested Next history wrappers. |
| G3: authentication interruptions | Inline sign-in preserves the editor and media; session checks distinguish configuration from identity; expired project loads can retry; old requests cannot undo a newer login | Configured browser behavior uses explicit API mocks, separate from real Supabase verification. |
| G4: mobile feedback | One feedback region outside the hidden tabs, with upload status, visible errors, dismissal, and recovery | A 390px Settings upload displays its error without switching to Preview. |
| G5: highlight movements | Two eased movements with settled holds and crop-constrained geometry | Every-frame geometry tests and real Remotion frames at 210, 255, 285, and 335. |
| G6: brand contrast | Deterministic foreground/accent selection preserves the brand background | Contrast tests across 216 RGB-grid colors plus edge cases; inspected white/black outro renders. |
| G7: media recovery | Focus/visibility refresh, explicit retry, lifecycle abort/disposal, and stale-asset rejection | Failure/retry and stale-response core tests; configured UI simulations. |
| G7: worker recovery | Failed bundle promises are discarded and controlled temporary directories cleaned before later retry | Injected first-build failure followed by success, concurrent-request reuse, and cleanup coordination tests. |
| G8: export reuse | Atomic RPC returns `{id, reused}`; editor identifies earlier snapshots while preserving submitted settings | Migration tests cover queued/rendering reuse, saved edits versus immutable snapshot, legacy RPC compatibility, and a fresh terminal-job export. |

The existing single-template/vertical/silent MVP boundaries remain in place. No billing, team, template-library, or sharing features were added.

## Required migration

Apply `supabase/migrations/002_export_reuse_result.sql` before deploying the updated API to an existing Supabase project. New projects must apply both migrations in order. `supabase db push` applies outstanding migrations when the project is linked.

The new service-only `enqueue_render_with_result` operation performs its reuse decision under the existing owner advisory lock. The original UUID-returning `enqueue_render` RPC remains as a compatibility wrapper. Ownership checks, immutable snapshots, private buckets, leases, fencing, daily limits, and bounded retries are preserved.

## Checks

- `npm test`: 12 passing core/SQL/regression tests.
- `npm run typecheck` and `npm run lint`: final checks passed.
- `npm run test:browser`: final updated-production run passed all five tests. The suite starts its own production build/server on port 3107; it does not use the application on port 3000. The mobile error screenshot is `out/qa/editor-mobile-error.png`.
- `npm run test:browser:cloud-ui`: six passing checks, using dummy loopback configuration and intercepted API responses on port 3108. Covers inline sign-in, expired save/project load, late pre-login failures, stale image responses, broken-image decode/retry, and truthful export reuse while further edits remain dirty. These tests cover browser behavior, not hosted-service integration.
- `npm run render:sample`: completed a new `out/demopop-sample.mp4`.
- `npm run render:check`: completed a new `out/qa/variant/edited.mp4` with changed captions/color, long allowed text, unequal images, and a 10,000-pixel-tall screenshot.
- `npm run verify:video` and variant verification: both outputs are 1080 × 1920, 30fps, 15 seconds, H.264, yuv420p, BT.709, and silent.
- Real Remotion still QA: `out/qa/style/white-outro.png`, `black-outro.png`, and `highlight-210/255/285/335.png`; inspected for readable text, expected movements, and no blank edges.

The generated QA images and variant MP4 are in ignored `out/qa/`. Both browser suites use production builds. Avoid running their builds simultaneously because Next writes root generated type files even with separate output directories; the harness restores those files after each build.

Both final test production builds passed. Root `next-env.d.ts` and `tsconfig.json` match their original contents after the suites. Formatting checks and `git diff --check` also pass.

## Remaining external verification

No live Supabase credentials or Docker environment were supplied. The following are still unverified against real hosted services:

1. Signup/email confirmation/login/logout and real cookie expiry/refresh.
2. Private image upload, normalization, saved project create/rename/reopen, and real signed-input expiry.
3. Two-account denial across projects, assets, export requests, job status, retries, and downloads.
4. Concurrent HTTP export requests against hosted Postgres, including truthful reuse feedback and immutable output.
5. A real worker claiming, rendering, uploading, completing, and serving an authorized signed MP4 download.
6. Forced worker crash, lease reclaim, stale-worker fencing, and user-visible bounded retry through the hosted services.
7. Real request/daily limits, signed-output expiry and refresh, and Docker worker build/startup.

Use the README setup and the integration checklist in `DEMOPOP_MVP_COMPLETION_PROMPT.md` after configuration. Local SQL fixtures and mocked browser responses must not be reported as proof of these integrations.
