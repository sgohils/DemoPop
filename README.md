# DemoPop

Turn your product launch or website redesign into a video worth showing. A Next.js editor with four deterministic Remotion motion templates, vertical (1080 × 1920) and landscape (1920 × 1080) formats, and 15-second H.264 MP4 exports at 30 fps. The new Launch Film includes optional original sound design.

## Run locally

Use **Node 24 LTS** and npm. The lockfile pins the dependency tree; every Remotion package is 4.0.536.

```sh
npm ci
npm run dev
# Open http://localhost:3000
# Or build an isolated production preview on http://127.0.0.1:3001:
npm run preview
```

Original fictional Forma Studio and Orbit screenshots, the original launch score, and local Manrope and DM Sans fonts are checked in. `npm run assets` regenerates Forma and Manrope; `npm run assets:launch` and `npm run audio:launch` regenerate the Orbit screenshots and synth score. No remote media, fonts, AI generation, or screenshot service is used at playback/render time.

```sh
npm run render:sample     # out/demopop-sample.mp4
npm run render:launch     # out/demopop-launch.mp4 + both-format QA in out/qa/launch/
npm run render:quality    # maximum-copy, logo, and screenshot-aspect stress stills
npm run verify:launch     # decode both MP4s; inspect pacing, every edit, and AAC audio
npm run assets:launch     # regenerate original fictional Orbit screenshot assets
npm run assets:home-film  # real DemoPop editor captures + scroll-friendly landing film
npm run audio:launch      # regenerate the original deterministic stereo synth score
npm run fonts:measure     # regenerate bundled-font metrics used for balanced headlines
npm run verify:video      # metadata + representative frames in out/qa/
npm run render:studio     # all template/format stills + two verified MP4s in out/qa/studio/
npm run worker           # separate process; requires Supabase
npm run cleanup          # retention dry run; requires Supabase service access
npm run typecheck
npm run lint
npm test
npm run build
npm start                # production web server
npm run test:browser     # builds/starts its own isolated local server on :3107
npm run test:browser:cloud-ui # mocked authenticated UI; not live Supabase verification
```

The first render downloads Remotion's Chrome Headless Shell. Internet access and permission to launch Chromium/FFmpeg subprocesses are required. FFmpeg ships with Remotion. Without Supabase, the real Player, all templates/formats/fonts, text/color controls, independent image positioning, and local file previews work. Browser drafts use IndexedDB to retain settings and selected local image blobs across reloads; recovery requires an explicit Restore or Discard. Drafts depend on available browser storage and stay on that browser/device. Save, accounts, brand kits, private uploads, and queued exports require Supabase. No sign-in or cloud save is simulated. Local files are decoded by the browser for preview; authenticated cloud uploads are revalidated and normalized on the server.

For a local caption/color variation, set `SAMPLE_OVERRIDE` to a JSON file matching `src/shared/project.ts`, and optionally `SAMPLE_OUTPUT` to an MP4 path. This command uses the original sample images. `npx tsx scripts/render-variant.ts` exercises long allowed text, changed color, unequal images, and a 10,000-pixel-tall screenshot through the same renderer.

## Supabase setup

1. Create a Supabase project. Apply all files in `supabase/migrations/` in numeric order through the SQL editor, or link the Supabase CLI and run `supabase db push`. The migrations create projects, the asset registry, jobs, request limits, brand kits, retention queues, functions, RLS policies, and two **private** storage buckets. Existing installations need every outstanding migration through **`005_launch_quality.sql`**. Migration 004 registers the controlled Orbit sample IDs; migration 005 identifies new exports as `launch-4`. Stop the old web/worker processes, apply pending migrations, then deploy/restart both updated processes together. The updated worker accepts `reveal-1`, `studio-2`, `launch-3`, and `launch-4` jobs.
2. Enable email/password authentication. Set the Auth Site URL to your web origin and allow the confirmation callback and `/auth/confirm?next=/auth/reset` on that origin as redirects. For development use `http://localhost:3000`.
3. Use `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` in the confirmation email template. Use `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/reset` in the password recovery email template. The callback also supports PKCE `code` exchange. Configure SMTP and Supabase Auth rate limits for your deployment.
4. Copy `.env.example` to `.env.local` for Next.js and to `.env` for the worker/CLI, and supply the values below. Restart/rebuild the web app after changing its configuration.
5. Run the web server and `npm run worker` in separate terminals, from the repository root. Sign up, confirm email, sign in, create a project, upload screenshots, save, and export.

| Variable                               | Where                    | Purpose                                                                                   |
| -------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | web + worker             | Your Supabase project URL                                                                 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | web                      | Public publishable key; RLS still applies                                                 |
| `SUPABASE_SERVICE_ROLE_KEY`            | **server + worker only** | Private storage and restricted job operations; never expose or prefix with `NEXT_PUBLIC_` |
| `DAILY_EXPORT_CAP`                     | server                   | New exports per user per UTC day; default 10                                              |
| `RENDER_CONCURRENCY`                   | worker/CLI               | Chromium frame processes inside the single active job; default 2                          |
| `RETENTION_DAYS`                       | cleanup CLI              | Age threshold for eligible storage cleanup; default 30, minimum 1                         |

The server verifies identity with Supabase `getUser()` on every authenticated API operation, refreshes cookies there, and derives the owner from that identity. Project writes use the user's RLS-protected client. Jobs/assets permit owner reads and restrict mutations to the server/worker; clients cannot forge completion, snapshots, output paths, or lease values. Queue functions are executable only by `service_role`. See [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs) and [private storage policies](https://supabase.com/docs/guides/storage/security/access-control).

## Editor and project workflows

- The homepage has a working template/format demo; **Use this style** opens the editor with those choices. The studio uses visual template cards, format controls, a larger preview canvas, and a six-scene timeline. Select a caption to preview its scene, or click a timeline beat to inspect it. First playback starts at the beginning; manual scene/scrub choices are respected.
- The landing page opens with a scroll-scrubbed film for DemoPop itself, rendered from genuine editor captures. Deliberate playback includes sound, and reduced motion uses a normal-flow layout. An interactive workflow and lazily loaded live gallery demonstrate the actual product. See the [landing-page implementation](docs/DEMOPOP_LANDING_PAGE.md) for media regeneration and visual QA.
- Undo/redo covers captions, styling, crop changes, screenshot replacement/swapping, and logo edits. Use the toolbar or Ctrl/⌘ Z and Ctrl/⌘ Shift Z outside text fields; text fields retain native editing shortcuts. History is kept in the current tab (up to 80 snapshots), with typing and crop changes grouped. Space plays/pauses when the preview has keyboard focus. Image cards support drag/drop and show dimensions; brand color accepts a hex value or palette choice.
- New projects start with Launch Film: a visible opening hook, brief before contrast, cinematic reveal, two feature beats, and a custom call to action. Product/Benefit/Curiosity buttons change the opener for quick creative variations. The optional original Launch pulse score is synchronized to the edit and encoded into exports; the preview mute button affects monitoring only. Silent mode remains available.
- Choose Launch Film, Classic Reveal, Slide & Settle, or Split Compare, either output format, and Manrope or DM Sans. Existing projects keep their original renderer and default to silent audio when older settings lack the sound field. Launch Film defaults to DM Sans and the original synth score.
- Save a named brand kit containing color, font, optional logo, and closing URL. Applying a kit preserves screenshots, captions, crop positions, and motion settings. Kits can be updated and deleted.
- Browser drafts keep incomplete captions and local image blobs. Configured account drafts are scoped to the verified user and project; private image access is resolved again during recovery. Signed media URLs and credentials are never stored in drafts. Account drafts become available after identity is verified.
- Search saved projects, duplicate a project, move it to Trash, or restore it. Duplicates share registered images and copy settings, with separate export histories. Projects with queued/rendering exports cannot be trashed. Permanent cleanup depends on the operator's retention schedule below.
- Export history lists earlier snapshots with format/template, authorized download, bounded retry, and expired-output feedback. Retrying a failed export renders its original snapshot.
- Forgot password sends a recovery link; the reset page validates matching passwords and requires a verified session before updating the account.

## Export behavior and limits

Export saves current settings and atomically creates or reuses an active job in a single Postgres transaction. Per-owner advisory locking plus a partial unique index prevents duplicate active jobs. Later edits cannot modify a running snapshot. Reusing an active job keeps its original snapshot. Retry uses that same immutable snapshot; a fresh export after completion/failure captures current edits.

The editor identifies when an export was reused and explains that its earlier snapshot is still being rendered. Sign-in can happen inside the editor so authentication interruptions preserve current edits. Upload and action feedback remains visible in both mobile tabs. Unsaved navigation warnings cover Back/Forward and application links as well as browser unload. Private preview access refreshes after returning to the tab and exposes retry feedback; replaced assets ignore older responses. Failed render bundles are discarded so the next job can rebuild.

The worker claims one job with `FOR UPDATE SKIP LOCKED`, increments its attempt count, and gets a unique fencing token and 90-second lease. It heartbeats every 20 seconds. Expired leases can be reclaimed; three attempts is the maximum, including crash recovery. Stale workers cannot publish completion. Actual Remotion progress is capped below 100% until private upload finishes. A queued job reports waiting rather than invented progress. Without a running worker it stays queued. Downloads require verified ownership and get a 60-second signed link. Preview input links last one hour and are refreshed while the editor remains open; the worker downloads private inputs and embeds controlled data URLs before rendering.

Inputs: PNG/JPEG/WebP, 10 MB each, at least 64 × 64, maximum 40 megapixels, still images only. Signature checks and Sharp decoding reject corrupt/unsupported images. Orientation is normalized, images are bounded to 2560 × 12000 without enlargement, and encoded as high-quality WebP. Crop coordinates are normalized and cover math prevents exposed empty areas, including at extreme crop values. Inputs and outputs use owner/UUID paths; the worker accepts registered asset IDs and fixed sample IDs, never browser-supplied URLs or filesystem paths.

Server-enforced hourly limits per user: 30 uploads, 20 project creations, 180 saves, 30 export requests, and 10 retry requests. New exports default to 10 per UTC day; retries also have a rolling daily cap of that value. Supabase enforces Auth rate limits. These are beta resource controls, with no billing system.

## Storage retention

After applying migration 003, run `npm run cleanup` with the server-only Supabase configuration in `.env` to inspect eligible counts without deleting anything. Review the result, then use `npm run cleanup -- --apply` to apply cleanup. `RETENTION_DAYS` defaults to 30. Nothing is scheduled automatically; an operator can schedule the apply command daily from this repository directory once the policy is suitable for the deployment.

Apply permanently removes projects that have been in Trash longer than the threshold, including their job histories and output files, while excluding active exports. It expires old completed output files on retained projects, preserving their history/settings, and removes old unreferenced input assets. Inputs referenced by any project, brand kit, or immutable job snapshot remain protected. Cleanup uses row locks and rechecks asset references before deletion. Files enter a durable deletion queue before Storage removal; failed removals stay queued for retry on a later apply run. The CLI validates bucket and owner paths and processes at most 10,000 pending files per invocation. No live cleanup has been performed during local verification.

## Structure and deployment

- `src/app`, `src/components`: App Router pages, API routes, editor, and Player.
- `src/shared`: strict input schema, sample settings, template/format/font choices, shared crop math.
- `src/video`: frame-driven templates with metadata derived from the saved format; image/font loading participates in capture readiness.
- `src/client`: browser-only draft persistence, without signed URLs or credentials.
- `src/server`: private Supabase setup, image normalization, access helpers.
- `worker`: queue consumer and shared `@remotion/renderer` implementation.
- `supabase/migrations`, `tests`: actual migration, validation/access tests, SQL queue tests, and browser checks.

Deploy the web process with `npm ci && npm run build`, then `npm start`, behind HTTPS. Set a request-body limit of about 11 MB at the reverse proxy and forward the actual origin/host consistently for the same-origin mutation check. Never cache authenticated API responses. Run the worker as a separate persistent Node process with outbound Supabase access, writable temporary space, Chromium system libraries, and a supervisor that restarts failures. Start with 2 CPU cores and 4 GB RAM, then measure your screenshots and throughput. Each worker handles one active job; two Chromium frame processes are used by default.

`Dockerfile.worker` targets Debian/Node 24 with the [official Remotion Chromium dependencies](https://www.remotion.dev/docs/docker). Build with `docker build -f Dockerfile.worker -t demopop-worker .`, then run `docker run --init --env-file .env --shm-size=1g demopop-worker`. Secrets enter at runtime and are excluded from the build context. Docker is not installed in the build environment, so this image has not been built/tested here. Graceful stops clean the current temporary workspace; hard process kills can leave `.render-*` directories, which an operator may remove while workers are stopped after verifying their paths.

## Verification and remaining integration checks

The browser suites own their production servers and use isolated build directories, leaving an app already running on port 3000 alone. Run them sequentially. `npm run test:browser` forces cloud features off and defaults to port 3107; `npm run test:browser:cloud-ui` uses dummy configuration and intercepted API responses to exercise account, project, brand-kit, and export-history UI on port 3108. Set `DEMOPOP_TEST_PORT` to another unused port if needed. The suites refuse to reuse an existing server and restore root TypeScript configuration after building. Mocked configured-UI checks do not prove real Auth, RLS, Storage, or worker integration.

See [the improvements verification record](docs/DEMOPOP_IMPROVEMENTS_VERIFICATION.md) for the new features and deployment requirements, and [the bug-fix verification record](docs/DEMOPOP_BUGFIX_VERIFICATION.md) for the earlier regression work.

The [product quality pass](docs/DEMOPOP_PRODUCT_QUALITY.md) records the revised homepage, studio and project library, editing history, motion improvements, and latest validation. `npm run preview` serves an isolated production build on port 3001 without replacing a running app's build; run its build sequentially with the browser suites.

The [Launch Film implementation](docs/DEMOPOP_LAUNCH_FILM.md) covers the announcement video, original score, continuous camera, crop-aware detail cuts, actual-font headline layout, quality checks, and migration 005. This is the default for new projects; earlier projects retain their styles and silent defaults.

Verified locally on Windows / Node 24.18:

- Production build, TypeScript, lint, schema/crop/decoder/access tests.
- Actual SQL migrations executed in embedded Postgres (PGlite): RLS owner isolation, service-only functions, duplicate-job reuse, immutable settings, expired lease reclaim, stale-token fencing, daily cap, bounded retries, brand access, project duplicate/trash/restore, and retention planning/application with protected references. This is a test fixture with minimal Auth/Storage schema stubs; it is not a replacement application backend or proof of Supabase integration.
- Real MP4 metadata and inspected intro, wipe, highlight, and outro frames: 1080 × 1920, 30 fps, 15 seconds, H.264, yuv420p, BT.709, no audio. Sample: `out/demopop-sample.mp4`.
- Studio render checks: 24 actual stills covering three templates, both formats, and four timeline beats with DM Sans; full landscape Slide & Settle and vertical Split Compare MP4s with verified dimensions, 30 fps, 15 seconds, H.264, yuv420p, and no audio. Contact sheets and videos are in `out/qa/studio/`.
- Local browser tests using headless Chromium: homepage sample playback, editor caption/color changes, scrubbing/restart, independent zoom, image replacement, corrupt upload feedback, disabled cloud actions, draft recovery, all template/format previews, unsaved navigation, and 390px mobile Preview/Settings with no horizontal overflow. Desktop/mobile screenshots are in `out/qa/`.

**Not verified against a live Supabase project because credentials were not supplied:** signup/confirmation/sign-in/out, recovery email delivery and password change, project and brand-kit persistence with real cookies/RLS, two real accounts denying each other's data/downloads, private Storage normalization and signed-link expiry, atomic export clicks across concurrent web requests, worker polling/render/upload/progress/download, forced worker crashes, and retention queue/file deletion through hosted Storage. The implementation is present; run those checks after setup. No cloud completion or successful save is claimed.

Current `npm audit` reports five high-severity **development-only** advisories through Next's lint dependency chain (`braces`/`micromatch`/`fast-glob`). The available suggested change downgrades Next lint rules across a major version, so it has not been applied. Production dependencies have no reported advisories after updating Sharp to 0.35.5. Recheck advisories before deployment.

## Licenses

Checked October 16, 2026: [Remotion's license/pricing](https://www.remotion.dev/docs/license/pricing) permits qualifying individuals and companies with up to three people to create and automate commercial videos under its Free License, subject to its terms. Companies/collaborations at four or more people require a Company License; relevant personnel may aggregate across collaborators. DemoPop is an automated video product: the listed Automators license is currently $0.01 per render with a $100/month minimum. Confirm eligibility, collaboration rules, reporting, and current [terms](https://www.remotion.dev/docs/license) before operating the service. The Player acknowledgement flag suppresses a development notice; it does not purchase or establish a license. Hosting, compute, storage, and email have their own costs.

Manrope and DM Sans are bundled under the SIL Open Font License (see `public/fonts/OFL.txt` and `public/fonts/DM-Sans-OFL.txt`). DM Sans comes from the [official Google Fonts repository](https://github.com/google/fonts/tree/main/ofl/dmsans). Forma Studio and Orbit are fictional demonstration projects with original screenshots and no claimed client results. The launch score is original deterministic synthesis with no sampled commercial recordings. The exported URL is visual text only.
