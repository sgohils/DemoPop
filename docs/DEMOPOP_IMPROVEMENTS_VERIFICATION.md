# DemoPop improvements verification

Implemented October 17, 2026, following the user's request for workflow improvements and the broader creative features. The original MVP audit and earlier bug-fix report describe their respective baselines.

The subsequent [product quality pass](DEMOPOP_PRODUCT_QUALITY.md) covers the redesigned homepage/studio/library, editing history, and refined motion. Check counts below describe this earlier feature-delivery stage.

## Delivered features

| Area               | Result                                                                                                                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Motion templates   | Classic Reveal, Slide & Settle, and Split Compare, using the same frame-driven renderer in the Player and worker.                                                                                                          |
| Video formats      | Vertical 1080 × 1920 and landscape 1920 × 1080; both remain 15 seconds, 30 fps, silent H.264.                                                                                                                              |
| Typography         | Bundled Manrope and DM Sans, with capture readiness and local font licenses.                                                                                                                                               |
| Brand kits         | Named color/font/logo/URL presets with save, apply, update, and delete. Applying preserves the project story, screenshots, crops, and motion settings.                                                                     |
| Browser drafts     | Debounced IndexedDB persistence, explicit restore/discard after reload, incomplete-text recovery, and selected local image blobs. Account drafts use verified user/project keys; signed URLs and credentials are excluded. |
| Project management | Search, duplicate, move to Trash, and restore. Active exports block trashing; duplicates share registered assets and have their own histories.                                                                             |
| Export history     | Paginated earlier jobs, original format/template, authorized download, bounded failed-job retry, and expired-output feedback in both history and the latest-export dialog.                                                 |
| Password recovery  | Email request form, recovery callback, password confirmation, verified-session password update, and failure feedback.                                                                                                      |
| Storage retention  | Service-only dry-run/apply CLI, trash purge, completed-output expiry, orphan-input cleanup, reference protection, and a durable physical-deletion retry queue.                                                             |

Old project settings and snapshots without the creative fields default to vertical Classic Reveal with Manrope. The updated worker accepts both `reveal-1` and `studio-2` jobs. Queued snapshots remain immutable.

## Required deployment steps

Apply every pending migration in numeric order, including **`supabase/migrations/003_studio_workflows.sql`**, before using this version against Supabase. Stop the old web and worker, migrate, then deploy/restart both updated processes together. Migration 003 adds brand kits, soft deletion, output expiry, service-only management/cleanup functions, and asset-reference locks. The old worker does not support new `studio-2` jobs.

Configure the recovery email template and callback redirects as shown in the README. SMTP and hosted Auth configuration are required for actual email delivery.

`npm run cleanup` is read-only planning. `npm run cleanup -- --apply` permanently applies eligible metadata cleanup and drains private Storage deletions. The default retention threshold is 30 days, configurable with `RETENTION_DAYS` (minimum 1). No automatic schedule is installed. Assets referenced by projects, brand kits, or immutable job snapshots are protected, with references rechecked after obtaining the deletion lock. Failed physical deletions remain queued. No live cleanup was run.

## Verification

- `npm run typecheck` and `npm run lint`: passed with no errors or warnings. Formatting checks and `git diff --check` passed.
- `npm test`: **14/14 passed**, including all three actual SQL migrations in PGlite with minimal Auth/Storage fixture schemas. New checks cover backward-compatible settings, valid creative choices, brand owner isolation, denied direct brand mutations and foreign-asset references, service-only actions, project duplicate/trash/restore, active-export protection, dry-run/apply cleanup, output expiry, and retained project/kit/snapshot assets.
- `npm run test:browser`: **7/7 passed** against its isolated local production build on port 3107. Includes all template/format previews, bundled-font switching, browser draft recovery with incomplete captions and image blobs, existing playback/upload/mobile checks, and Back/Forward/link navigation guards.
- `npm run test:browser:cloud-ui`: **10/10 passed** against its isolated production build on port 3108. New checks cover brand-kit CRUD/apply, project search/duplicate/trash/restore and active-export rejection, history download/retry/expiry including the latest-export dialog, and recovery/password confirmation. Existing session/image/reuse regressions still pass. Every API response in this suite is mocked; it does not verify hosted services.
- Both browser suites completed production builds successfully and restore root generated TypeScript configuration after building. Run the suites sequentially.
- `npm run render:studio`: **24 Remotion stills and two full MP4s completed**. Stills cover all three templates, both formats, and frames 90, 180, 335, and 405 using DM Sans. Full videos cover landscape Slide & Settle and vertical Split Compare. Metadata checks confirm expected dimensions, 30 fps, 15 seconds, H.264, yuv420p, BT.709, and no audio.
- Inspected both template contact sheets and the landscape editor screenshot for readable captions, usable controls, and correctly proportioned previews.

Render evidence is in ignored `out/qa/studio/`: `landscape-contact.png`, `vertical-contact.png`, individual stills, `landscape-slide.mp4`, `vertical-split.mp4`, and their metadata JSON. The editor screenshot is `out/qa/studio-landscape-editor.png`. The earlier classic portrait sample remains `out/demopop-sample.mp4`.

## Remaining external checks

No live Supabase credentials or Docker environment were supplied. Migration execution on hosted Supabase, real email delivery/token exchange/password update, multi-account access denial, project/kit persistence, private Storage signing, queued worker rendering/upload/download, and physical cleanup/retry remain unverified against hosted services. PGlite fixtures and intercepted browser APIs are evidence for local logic and UI behavior only. Follow the README setup and earlier integration checklist before deployment.
