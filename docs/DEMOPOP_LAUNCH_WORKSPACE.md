# Launch workspace

DemoPop now includes the five launch-product improvements: campaign packages, flexible product stories, website capture, reusable recipes, and client delivery. These extend the existing editor; old projects retain their original 15-second reveal behavior.

## Create and update a product story

In **Story**, choose **Product story**. Start with three scenes, add up to six, and choose 15, 30, or 60 seconds. Each scene has its own caption, position, zoom, and hold weight. Reorder scenes using their arrow controls. Clicking a scene or focusing its controls seeks the actual preview to that scene. Timing is allocated to fit the selected duration, with a minimum 1.5-second feature hold. A short-copy hint identifies captions that may read too quickly.

Replace a scene with PNG, JPEG, WebP, or H.264 MP4. Replacement keeps the caption, framing and timing, so updating a product screen does not require a new edit. MP4 clips must be yuv420p, 0.1–30 seconds, 64–4096 pixels, up to 60 fps and 10 MB. Server validation decodes every frame and removes audio/metadata while keeping the H.264 picture stream. Clips loop inside longer scenes; the clip-start control sets their first moment. The film's optional original soundtrack controls audio.

Product Story uses an adaptive composition in landscape (1920 × 1080), vertical (1080 × 1920), and square (1080 × 1080). Existing reveal templates retain their previous landscape/vertical layouts. Square reveal projects use the adaptive layout. All outputs are 30 fps H.264 MP4, yuv420p and BT.709.

Undo/redo groups scene typing and crop drags while keeping reorders, media replacements, and recipe application as separate actions. Browser drafts retain incomplete captions and local image/video blobs. Private scene access refreshes alongside the main screenshots.

## Import a website

Under **Screenshots → Start from a website**, provide a public HTTP/HTTPS page. DemoPop captures desktop, a feature section, and mobile, then proposes the name, opening, feature captions, brand color, supported font, CTA, and a logo when available. Suggested copy comes from the actual page, with no generative-model dependency. Edit the draft and select **Use this draft** to apply it. Capturing alone leaves the current project untouched; Undo restores the previous project after applying.

Authenticated installations allow six captures per user per hour and one active capture per web process. Unconfigured website capture is restricted to development and the explicitly enabled local production preview. Public deployments require authentication. Chromium and its system dependencies must be available on the web server. Capture requires the Chromium sandbox; deploy it as a suitable unprivileged process. Blocked pages and authenticated apps can use uploaded screenshots or MP4 clips instead.

Requests to private/reserved addresses, credentialed URLs, non-web protocols and nonstandard ports are rejected. Every browser resource is fetched through public-address DNS validation and a pinned connection, including redirects and third-party requests. Native browser networking uses a closed proxy, service workers and WebSockets are blocked, and the browser process receives no application credentials. Capture is bounded by time, resource size, total bytes and request count. Public-page compatibility still varies; users review actual captures before applying them.

## Reuse a launch recipe

Use **Recipes → Save launch recipe** to capture the current edit, including story, timing, copy, branding and framing. Local recipes retain selected image/video blobs in IndexedDB on that browser/device. Account recipes reference private registered media and can be applied across that user's projects. Applying a recipe is undoable. Updating an existing recipe replaces its content; deleting it removes the recipe but does not delete media still referenced elsewhere.

Local recipes are scoped to the browser and limited to 50. Account recipes are isolated by owner and listed with a limit of 100. Recipes protect their media from retention cleanup. Browser storage remains dependent on available device space.

## Export a launch package

Open **Launch kit**. Review the three editable opening hooks and select **Export launch package**. The worker produces nine MP4s: each hook in landscape, vertical, and square. The ZIP also includes a landscape `thumbnail.png` and `manifest.json` containing the captured project and export descriptions. Files have predictable names such as `vertical-product.mp4` and `square-benefit.mp4`.

A package is one immutable queue job, using nine units of the daily render allowance. The default allowance is ten units. Progress covers the actual nine renders and final packaging; no completed package is reported before upload succeeds. Reusing an active job preserves its original snapshot and output type. Retries preserve that same snapshot. Packages over 100 MB fail with a shorter-story recommendation rather than uploading an incomplete archive.

Private input clips are served only during rendering through an ephemeral loopback server with an unguessable per-render path and byte-range support. This avoids long data URLs in the video renderer while keeping inputs out of public assets. The server closes in success and failure cleanup.

Without cloud configuration, try the same package renderer locally with the controlled Orbit sample:

```sh
npm run render:kit
npm run render:kit -- --duration=30
```

The sample package and individual MP4s are written to `out/demopop-launch-kit/`. This command renders the original sample, not unsaved browser media.

## Client folders, review and approval

Give a saved project a **Client folder** name in Launch kit. The Projects workspace groups/filter projects using that name, and search matches both project and client names.

Expand **Client review & approval**, choose a completed available export, supply the review brand name and choose whether to show a download link. The generated private bearer link opens a branded review page without requiring a client account. It shows the exact exported video; a package uses its landscape/original-hook video as the review preview and offers the whole ZIP when downloads are enabled.

Reviewers can add named timestamped comments, seek directly to comments, and approve the displayed version. New feedback changes the status to `changes_requested` and clears an earlier approval. Approvals record the submitted name and server timestamp. The editor shows status and comments alongside each link. Links expire after 14 days and can be revoked by their owner. Already-issued playback/download URLs expire within five minutes. Download settings control the provided download link; they are not DRM.

Feedback writes lock and recheck the review record, reject revoked/expired links and out-of-range timestamps, and enforce a per-review request limit. Owners alone can list/manage links; public responses omit owner IDs, tokens, project source settings and input assets. Active review links protect their output files from normal output expiry until the links expire or are revoked. Trashing and later deleting a project removes its associated review history.

## Rollout

Apply all migrations through **`007_launch_workspace.sql`**, then deploy the updated web process and worker together. This migration adds clip metadata, recipes, review links/comments, output kind and package preview paths, extended scene-asset reference checks and retention protection. New jobs use `studio-6`; old workers reject this version. The updated worker accepts all earlier versions.

`playwright-core` is now an explicitly pinned production dependency, using Remotion's installed Chromium executable for capture. The web server needs Chromium/system dependencies for website capture and FFmpeg subprocess access for validating clip uploads. The queue worker retains its existing separate-process requirements.

No billing provider, subscription charging, or paid plan enforcement is introduced by these changes. Export quotas remain resource controls. Hosted Supabase credentials are still required for account persistence, private uploads, queued packages and review links. No live hosted migration or deployment is implied by local verification.

## Verification — October 18, 2026

- **44 unit/integration tests passed.** These include real migrations 001–007 in embedded Postgres, owner isolation, scene and recipe asset protection, immutable output kind/settings, package quota and retry units, approvals/revocation, retention of review previews, gap-free scene timing, ZIP records/checksums, gated private-clip HTTP range serving, and same-origin checks for loopback addresses normalized by Next.js.
- **25 local Chromium browser tests passed**, including six new checks for scene editing/reorder/duration, incomplete story drafts, saved recipes with media, staged website import/Undo, square mobile layout, MP4 draft recovery, and timestamped client feedback/approval. Existing reveal, landing, navigation, and image-framing checks passed.
- **13 configured-account UI checks passed** with intercepted APIs, including new package/review/folder/recipe flows. These establish UI request behavior, not live Supabase completion.
- TypeScript, ESLint, dependency consistency and whitespace checks passed; isolated production builds succeeded in both browser suites.
- Real public website capture succeeded against `https://example.com`, producing desktop, feature, and mobile PNGs with Chromium sandboxing and the pinned public-request path enabled. The actual API accepts its `127.0.0.1` browser origin and rejects unrelated origins. A real Chromium session captured the page through the production preview, edited the staged opening, and applied the three-scene, 30-second story with no browser errors.
- A real MP4 input clip passed full server validation and rendered through the private clip server. Fifteen story stills across all three formats, plus 30/60-second closing stills, were inspected. All **nine complete 15-second package MP4s** reported correct format, 30 fps, H.264, yuv420p, BT.709 and AAC audio and decoded fully without errors. Windows extracted the **21.34 MB ZIP** into nine MP4s, `thumbnail.png`, and `manifest.json`.
- QA artifacts are in `out/qa/launch-workspace/`, including the package, per-format contact sheets, metadata, real website captures and mobile editor/review screenshots.

No hosted Supabase migration, live account/storage/worker integration, email sending, billing, or public deployment was performed. The local editor, capture service, renderer, embedded migration tests, and intercepted account UI were verified separately.
