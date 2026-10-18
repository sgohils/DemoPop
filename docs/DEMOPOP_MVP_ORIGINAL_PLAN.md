# DemoPop — Codex MVP Build Prompt

You are the implementation engineer for DemoPop. Build a working MVP in the current workspace. Implement the product, run it, and verify the core workflow; do not stop at a plan, a landing page, or a simulated editor.

Inspect the repository and applicable AGENTS.md instructions first. Preserve unrelated work. Reuse compatible existing tooling. Check current official documentation for Remotion, Next.js, and Supabase before choosing APIs. Choose reasonable implementation details and continue autonomously.

## Product and customer

DemoPop helps freelance web designers turn a finished website redesign into a polished before-and-after marketing video.

Product promise: "Turn your website redesign into your next client pitch."

The user uploads screenshots of the old and new website, enters a few captions and brand settings, previews an animated reveal, and downloads a real MP4.

The MVP must demonstrate one excellent end-to-end workflow. Keep the scope narrow enough to finish reliably.

## Hard scope boundary

Include:
- One original, polished 15-second before-and-after animation template.
- Vertical output only: 1080 x 1920, 30 fps, 450 frames.
- PNG, JPEG, and WebP screenshot uploads.
- Simple image positioning and zoom/crop controls.
- Project name, opening caption, two short highlight captions, brand color, optional logo, and closing URL text.
- Immediate browser preview, play/pause, scrubbing, and restart.
- Email/password authentication through Supabase.
- Create, save, reopen, and rename projects.
- Background MP4 export, honest progress, retry on failure, and download.
- One original sample project and a standalone local sample-render command.

Exclude:
- Stripe, payments, plans, credits, pricing tables, and subscriptions.
- AI-generated video, AI copywriting, voiceovers, music, and audio.
- AWS Lambda, Redis, Kubernetes, and additional cloud rendering services.
- Website scraping, URL-to-screenshot capture, and remote media imports.
- Multiple templates, landscape/square output, 4K, and arbitrary durations.
- A general timeline editor, drag-and-drop scene builder, or keyframe editor.
- Teams, agencies/workspaces, public galleries, share pages, analytics, and referral systems.

These exclusions are deliberate. Finish the MVP before adding any expansion features.

## Technical architecture

Use:
- Next.js App Router, TypeScript, and Tailwind for the application.
- Remotion for video composition and MP4 rendering.
- Remotion Player for the interactive browser preview.
- Supabase Auth, Postgres, and private Storage for users, projects, inputs, and completed exports.
- A separate Node.js background worker using @remotion/renderer.
- A small schema validator such as Zod for project and API payloads.
- An image decoder/normalizer such as Sharp for validating uploads.

Keep every Remotion package on the same exact compatible version. Commit the lockfile. Select a Node version supported by the chosen dependencies.

Build a single repository with clear app, video-composition, shared-schema, and worker boundaries. Prefer a simple structure over elaborate abstractions.

Run the web app and render worker as separate processes. Supply documented commands for both. The render worker should be portable to a standard Node/Docker host with the Chromium and system dependencies Remotion requires. The web app must not render videos inside a normal page/API request.

Use a Postgres-backed job table; do not add another queue service. Support one active render per worker for the MVP. Claim jobs atomically and use a lease/heartbeat or equivalent recovery mechanism so restarts do not strand jobs forever.

## The video template

Create an original composition with this fixed structure:

0-2 seconds:
- A clear opening caption and project name establish the redesign.
- Use confident typography and a restrained entrance.

2-5 seconds:
- Show the old website inside a clean browser frame.
- Add a readable "Before" label and subtle movement.

5-7 seconds:
- Reveal the new website using a deliberate animated wipe.
- Compare old and new inside consistent framing so the change is understandable.

7-12 seconds:
- Show the redesigned website with two short captions.
- Use controlled pan/zoom movements within the user-selected crop.
- Keep the website and captions readable.

12-15 seconds:
- Finish with the agency/project identity, optional logo, and user-entered URL as text.
- The exported URL is visual text, not a promised clickable link.

Animate using frame-based Remotion values. Keep timing deterministic across preview and export. Avoid wall-clock timers, uncontrolled randomness, and CSS animations that can render differently frame to frame.

Use the same composition and validated project inputs for preview and export. Ensure images and fonts finish loading before frames are captured.

Prioritize smooth easing, typography, spacing, readable screenshot detail, and clean transitions. Avoid excessive spinning, tiny tilted screens, distracting particles, and decorative effects that obscure the actual redesign.

Support short captions with enforced limits and clear counters. Handle long project names and URLs gracefully. Do not silently crop text or fabricate performance improvements.

## Screenshot handling

Treat screenshots as user-provided assets:
- Set documented upload limits, for example 10 MB per screenshot and a safe decoded-pixel limit.
- Validate actual file signatures and decoded image data on the server.
- Normalize orientation, output format, and dimensions when appropriate.
- Reject corrupt files and unsupported media with useful messages.
- Store assets under an owner-scoped path with unique identifiers.
- Accept asset identifiers in project data; resolve storage locations on the server.
- Do not let the renderer fetch arbitrary user-supplied URLs or local filesystem paths.

Provide simple image positioning controls rather than a complex image editor. Use normalized coordinates so preview and export framing agree. Let users reposition and zoom the before and after images independently. Prevent blank exposed areas and provide a reset control.

Use high enough source resolution to preserve readable website details.

Create original fictional before/after website screenshots as sample assets. They should depict the same fictional business with a plausible redesign. Do not copy a real customer's website or present fictional results as actual customer work. Make the sample reusable by the direct local render command.

## Product interface and visual direction

The product should feel like a focused creative tool.

Use a warm off-white application canvas, dark ink typography, a restrained blue accent, subtle borders, and consistent spacing. Use one well-chosen readable font family. The video preview should dominate visually.

Desktop editor:
- Compact header with project name, save status, and export action.
- Left panel with screenshot uploads and a short list of settings.
- Large preview to the right with playback controls.
- Export status and download appear in a clear panel or dialog.

Mobile:
- Use a usable stacked layout or a simple Preview / Settings switch.
- Keep upload, save, preview, and export controls accessible.

Include only these surfaces:
1. A compact home page with the product promise, the actual sample preview, and "Create a video".
2. Sign up / sign in / sign out.
3. A minimal projects page with project names, updated dates, and create/open actions.
4. The editor.

Use the real composition for the sample preview. No placeholder videos, fake customer logos, invented testimonials, fabricated metrics, elaborate marketing sections, or inactive buttons.

Handle loading, empty, unsaved, saving, saved, exporting, completed, and failed states. Preserve edits on transient failures and warn before navigation would discard unsaved work.

Use accessible labels, visible keyboard focus, good contrast, and reduced-motion behavior for the surrounding interface. Video playback should be user-controlled.

## Persistence, ownership, and exports

Create migrations for:
- projects: owner, name, settings JSON, asset references, created/updated timestamps.
- render_jobs: owner, project reference, immutable settings/asset snapshot, template version, status, progress, attempt count, lease data, output reference, sanitized error, and timestamps.

Use owner-based Row Level Security for project and job reads and writes. Configure private storage access correctly. The Supabase service-role key must exist only in server/worker environments and must never enter a client bundle.

Verify authenticated identity on every project, asset, export, retry, and download operation. Do not trust an owner ID supplied by the browser.

When Export is clicked:
1. Validate ownership and inputs on the server.
2. Persist the current project.
3. Create an immutable export snapshot.
4. Atomically create or reuse the active job for that project.
5. Return the job ID immediately.
6. Let the worker render an H.264 MP4 using a broadly compatible pixel format.
7. Upload the output privately and mark the job completed.
8. Provide an authorized, time-limited download link.

Edits made after export starts must not alter that running export. Signed input links must remain valid for the render or the worker should download assets into its controlled temporary workspace first.

Model job status as queued, rendering, completed, or failed. Derive progress from actual render activity; distinguish waiting from rendering. Prevent duplicate jobs from repeated clicks. Bound retries, clean temporary files, recover abandoned leases, and expose a clear retry action.

Use conservative upload/render request limits and a configurable per-user daily export cap for the free beta. This is abuse/cost control, not a billing system.

## Development without cloud credentials

Missing Supabase credentials must not prevent progress on the core product.

Implement the composition, editor preview, original sample assets, and a direct local MP4 render command first. This local command must exercise the same composition and rendering code as the worker.

If Supabase is unavailable:
- Keep the sample preview and direct render workflow runnable.
- Clearly identify unavailable cloud account/persistence/export features.
- Supply migrations, environment variable examples, and setup instructions.
- Do not fake sign-ins, successful saves, worker completion, or download links.
- Complete all independent work and list exactly which integration checks remain blocked.

Do not create a second full authentication or database implementation just to support demo mode.

## Implementation order

1. Inspect the workspace, establish the minimal structure, and confirm dependency compatibility.
2. Create the original sample assets, shared input schema, and Remotion composition.
3. Export a real sample MP4 locally. Inspect representative frames and refine the motion.
4. Build the live editor around that proven composition.
5. Add Supabase authentication, private uploads, project persistence, and ownership policies.
6. Add the job table, background worker, progress, retry, and download flow.
7. Finish the compact home/projects pages and responsive behavior.
8. Run verification and document setup.

Do not spend the first implementation phase polishing a landing page while the renderer is unfinished.

## Verification and completion criteria

Use meaningful checks focused on failure-prone behavior:
- Production build, type checks, and repository lint rules pass.
- The original sample actually renders to a playable MP4.
- Inspect video metadata: 1080 x 1920, 30 fps, approximately 15 seconds, H.264.
- Inspect representative frames around the intro, wipe, zooms, and outro for clipping, missing images, blank frames, and unreadable text.
- Change a caption/color and verify it reaches the exported video.
- Check very tall screenshots, unequal image sizes, long allowed text, and corrupt uploads.
- Verify save/reopen and cross-account isolation with configured Supabase.
- Verify repeated Export clicks reuse an active job.
- Verify failures are visible and retries work without stale snapshots or stuck jobs.
- Exercise the happy path in the browser and inspect desktop/mobile layouts.

Write targeted automated tests for input validation, duplicate-job handling, and access boundaries where practical. Avoid a large test suite that simply mirrors implementation details.

If external credentials or environment limitations prevent a check, state exactly what was and was not verified. Do not claim success based only on mocked results.

## Deliverables

Leave working source code, a lockfile, migrations/policies, .env.example, sample assets, the generated sample MP4, and a concise README.

Document:
- Installation and the supported runtime.
- Commands for app development, worker startup, sample rendering, build, and tests.
- Required environment variables and which are server-only.
- Supabase setup and migration steps.
- Basic deployment of web and worker processes on a compatible host.
- Beta limits and known limitations.

Check the current Remotion license and document the applicable conditions without describing cloud infrastructure as free.

Finish with a concise report of what works, the sample MP4 location, checks performed, required setup, and any remaining blocker. Do not describe unfinished integrations as completed.

Start implementing now and carry the authorized MVP work through verification.

