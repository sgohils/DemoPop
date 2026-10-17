# DemoPop

Turn your website redesign into your next client pitch. A working Next.js editor around one deterministic Remotion composition: 1080 × 1920, 30 fps, 450 frames, silent H.264 MP4.

## Run locally

Use **Node 24 LTS** and npm. The lockfile pins the dependency tree; every Remotion package is 4.0.536.

```sh
npm ci
npm run dev
# Open http://localhost:3000
```

Original fictional Forma Studio screenshots and the local Manrope font are checked in. `npm run assets` regenerates them from the original SVG artwork. No remote media, fonts, AI generation, or screenshot service is used.

```sh
npm run render:sample     # out/demopop-sample.mp4
npm run verify:video      # metadata + representative frames in out/qa/
npm run worker           # separate process; requires Supabase
npm run typecheck
npm run lint
npm test
npm run build
npm start                # production web server
npm run test:browser     # production server must already be running on :3000
```

The first render downloads Remotion's Chrome Headless Shell. Internet access and permission to launch Chromium/FFmpeg subprocesses are required. FFmpeg ships with Remotion. Without Supabase, the real sample Player, text/color controls, independent image positioning, and local file previews work. Local edits stay in memory; save, accounts, private uploads, and queued exports explicitly remain unavailable. No sign-in or save is simulated. Local files are decoded by the browser for preview; authenticated cloud uploads are revalidated and normalized on the server.

For a local caption/color variation, set `SAMPLE_OVERRIDE` to a JSON file matching `src/shared/project.ts`, and optionally `SAMPLE_OUTPUT` to an MP4 path. This command uses the original sample images. `npx tsx scripts/render-variant.ts` exercises long allowed text, changed color, unequal images, and a 10,000-pixel-tall screenshot through the same renderer.

## Supabase setup

1. Create a Supabase project. Apply `supabase/migrations/001_demopop.sql` through the SQL editor, or link the Supabase CLI and run `supabase db push`. The migration creates projects, the asset registry, jobs, request limits, functions, RLS policies, and two **private** storage buckets.
2. Enable email/password authentication. Set the Auth Site URL to your web origin and allow `/auth/confirm` on that origin as a redirect. For development use `http://localhost:3000`.
3. Use an email confirmation link of `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` in Supabase's confirmation email template. The callback also supports PKCE `code` exchange. Configure SMTP and Supabase Auth rate limits for your deployment.
4. Copy `.env.example` to `.env.local` for Next.js and to `.env` for the worker/CLI, and supply the values below. Restart/rebuild the web app after changing its configuration.
5. Run the web server and `npm run worker` in separate terminals, from the repository root. Sign up, confirm email, sign in, create a project, upload screenshots, save, and export.

| Variable                               | Where                    | Purpose                                                                                   |
| -------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | web + worker             | Your Supabase project URL                                                                 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | web                      | Public publishable key; RLS still applies                                                 |
| `SUPABASE_SERVICE_ROLE_KEY`            | **server + worker only** | Private storage and restricted job operations; never expose or prefix with `NEXT_PUBLIC_` |
| `DAILY_EXPORT_CAP`                     | server                   | New exports per user per UTC day; default 10                                              |
| `RENDER_CONCURRENCY`                   | worker/CLI               | Chromium frame processes inside the single active job; default 2                          |

The server verifies identity with Supabase `getUser()` on every authenticated API operation, refreshes cookies there, and derives the owner from that identity. Project writes use the user's RLS-protected client. Jobs/assets permit owner reads and restrict mutations to the server/worker; clients cannot forge completion, snapshots, output paths, or lease values. Queue functions are executable only by `service_role`. See [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs) and [private storage policies](https://supabase.com/docs/guides/storage/security/access-control).

## Export behavior and limits

Export saves current settings and atomically creates or reuses an active job in a single Postgres transaction. Per-owner advisory locking plus a partial unique index prevents duplicate active jobs. Later edits cannot modify a running snapshot. Reusing an active job returns its original snapshot. Retry uses that same immutable snapshot; a fresh export after completion/failure captures current edits.

The worker claims one job with `FOR UPDATE SKIP LOCKED`, increments its attempt count, and gets a unique fencing token and 90-second lease. It heartbeats every 20 seconds. Expired leases can be reclaimed; three attempts is the maximum, including crash recovery. Stale workers cannot publish completion. Actual Remotion progress is capped below 100% until private upload finishes. A queued job reports waiting rather than invented progress. Without a running worker it stays queued. Downloads require verified ownership and get a 60-second signed link. Preview input links last one hour and are refreshed while the editor remains open; the worker downloads private inputs and embeds controlled data URLs before rendering.

Inputs: PNG/JPEG/WebP, 10 MB each, at least 64 × 64, maximum 40 megapixels, still images only. Signature checks and Sharp decoding reject corrupt/unsupported images. Orientation is normalized, images are bounded to 2560 × 12000 without enlargement, and encoded as high-quality WebP. Crop coordinates are normalized and cover math prevents exposed empty areas, including at extreme crop values. Inputs and outputs use owner/UUID paths; the worker accepts registered asset IDs and fixed sample IDs, never browser-supplied URLs or filesystem paths.

Server-enforced hourly limits per user: 30 uploads, 20 project creations, 180 saves, 30 export requests, and 10 retry requests. New exports default to 10 per UTC day; retries also have a rolling daily cap of that value. Supabase enforces Auth rate limits. These are beta resource controls, with no billing system. Retained inputs, jobs, and exports currently have no automatic retention policy; plan storage capacity and operational cleanup before a larger beta.

## Structure and deployment

- `src/app`, `src/components`: App Router pages, API routes, editor, and Player.
- `src/shared`: strict input schema, sample settings, fixed video dimensions, shared crop math.
- `src/video`: the sole frame-driven composition; image/font loading participates in capture readiness.
- `src/server`: private Supabase setup, image normalization, access helpers.
- `worker`: queue consumer and shared `@remotion/renderer` implementation.
- `supabase/migrations`, `tests`: actual migration, validation/access tests, SQL queue tests, and browser checks.

Deploy the web process with `npm ci && npm run build`, then `npm start`, behind HTTPS. Set a request-body limit of about 11 MB at the reverse proxy and forward the actual origin/host consistently for the same-origin mutation check. Never cache authenticated API responses. Run the worker as a separate persistent Node process with outbound Supabase access, writable temporary space, Chromium system libraries, and a supervisor that restarts failures. Start with 2 CPU cores and 4 GB RAM, then measure your screenshots and throughput. Each worker handles one active job; two Chromium frame processes are used by default.

`Dockerfile.worker` targets Debian/Node 24 with the [official Remotion Chromium dependencies](https://www.remotion.dev/docs/docker). Build with `docker build -f Dockerfile.worker -t demopop-worker .`, then run `docker run --init --env-file .env --shm-size=1g demopop-worker`. Secrets enter at runtime and are excluded from the build context. Docker is not installed in the build environment, so this image has not been built/tested here. Graceful stops clean the current temporary workspace; hard process kills can leave `.render-*` directories, which an operator may remove while workers are stopped after verifying their paths.

## Verification and remaining integration checks

Verified locally on Windows / Node 24.18:

- Production build, TypeScript, lint, schema/crop/decoder/access tests.
- Actual SQL migration executed in embedded Postgres (PGlite): RLS owner isolation, service-only functions, duplicate-job reuse, immutable settings, expired lease reclaim, stale-token fencing, daily cap, and bounded retries. This is a test fixture with minimal Auth/Storage schema stubs; it is not a replacement application backend or proof of Supabase integration.
- Real MP4 metadata and inspected intro, wipe, highlight, and outro frames: 1080 × 1920, 30 fps, 15 seconds, H.264, yuv420p, BT.709, no audio. Sample: `out/demopop-sample.mp4`.
- Local browser tests using headless Chromium: homepage sample playback, editor caption/color changes, scrubbing/restart, independent zoom, image replacement, corrupt upload feedback, disabled cloud actions, and 390px mobile Preview/Settings with no horizontal overflow. Desktop/mobile screenshots are in `out/qa/`.

**Not verified against a live Supabase project because credentials were not supplied:** signup/confirmation/sign-in/out, save/reopen/rename with real cookies and RLS, two real accounts denying each other's projects/assets/jobs/downloads, private Storage normalization and signed-link expiry, atomic export clicks across concurrent web requests, worker polling/render/upload/progress/download, forced worker crashes, and user-visible failure/retry through the hosted services. The implementation is present; run those checks after setup. No cloud completion or successful save is claimed.

Current `npm audit` reports five high-severity **development-only** advisories through Next's lint dependency chain (`braces`/`micromatch`/`fast-glob`). The available suggested change downgrades Next lint rules across a major version, so it has not been applied. Production dependencies have no reported advisories after updating Sharp to 0.35.5. Recheck advisories before deployment.

## Licenses

Checked October 16, 2026: [Remotion's license/pricing](https://www.remotion.dev/docs/license/pricing) permits qualifying individuals and companies with up to three people to create and automate commercial videos under its Free License, subject to its terms. Companies/collaborations at four or more people require a Company License; relevant personnel may aggregate across collaborators. DemoPop is an automated video product: the listed Automators license is currently $0.01 per render with a $100/month minimum. Confirm eligibility, collaboration rules, reporting, and current [terms](https://www.remotion.dev/docs/license) before operating the service. The Player acknowledgement flag suppresses a development notice; it does not purchase or establish a license. Hosting, compute, storage, and email have their own costs.

Manrope is bundled under the SIL Open Font License (see `public/fonts/OFL.txt`). Forma Studio, its screenshots, and the architectural illustration are original fictional demonstration assets, with no claimed client results. The exported URL is visual text only.
