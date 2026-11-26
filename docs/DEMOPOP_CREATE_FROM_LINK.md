# Create from link

Open `/create`, paste a public website URL, and choose **Preview your video** on configured account installations. DemoPop captures desktop, a feature detail, and mobile, derives captions and branding from the page, and saves an editable three-scene launch story. Review the actual motion, edit the words, and choose **Export MP4** when ready. Previewing requires an account but no purchased package; exporting uses the existing paid project allowance. The default is a 30-second landscape video; optional controls support 15/30/60 seconds and landscape, vertical, or square. A bare domain is normalized to HTTPS. Unconfigured local development retains the one-step **Generate video** flow.

The result includes native video playback and **Download MP4**. Account projects also include **Edit your video**, opening the generated scenes, captions, and private media in the existing studio. The staged website-import control in the studio remains available for people who want to review captures before building a story.

The landing page introduces **Create from link** in **How it works**, alongside screenshots and clips, and the studio and Projects workspace also link to this flow. The hero offers **Create from a website**. The traditional editor remains directly accessible through **Try the studio**. The empty creation page shows a real, clearly labeled fictional sample export. See [the competitor comparison](DEMOPOP_COMPETITIVE_IMPROVEMENTS.md) for the preview, creative direction, and mobile editing improvements.

## Accounts and local preview

With Supabase configured, authentication happens before website capture. Sign-in and email confirmation can return to `/create`; the browser preserves the entered URL and options for that return. Preview requests save private inputs and the project without queuing any render. Inline edits persist in per-tab session storage, and media URLs are refreshed through the owned project endpoint. Export saves the edited project, then submits it through `/api/exports` and the existing paid/free queue policy. The existing worker renders its immutable snapshot. A payment prompt keeps the saved draft, and subsequent export uses the same captured media. Opening the full studio or starting a different website saves the current valid edits first.

Without cloud configuration, development and the explicitly enabled local production preview render the complete MP4 in the web process. These local jobs are temporary: output is retained for 45 minutes, up to four jobs, with one active render at a time and a short submission cooldown. A process restart loses the local job list. Download the finished video to keep it. Public unconfigured production servers do not enable local rendering.

The URL and current job ID are stored in session storage so reloading can resume status checks. A pending sign-in also keeps only the form fields for up to one hour in local storage, allowing a confirmation tab to restore them without sharing a job token. That handoff is cleared after successful submission. A disconnected status request can be retried without submitting a second video. Completed local files support HTTP ranges and HEAD for native playback. Account playback uses a same-origin endpoint that issues fresh short-lived storage URLs. Playback never starts automatically; refreshing a failed player reloads the media even when its stable URL is unchanged, and expired results remove stale playback/download controls.

## Capture and rendering

Website content supplies the name, headline, feature text, description, brand color, and closing action. This flow uses the actual page and the existing motion renderer; it does not require a text-generation or video-generation provider. The generated story includes opening and closing scenes around its three product scenes. Captions are bounded at word/grapheme boundaries and the displayed URL omits query parameters.

Capture retains public-address validation, DNS-pinned requests, standard HTTP/HTTPS ports, stripped browser credentials, blocked native browser transports, and Chromium sandboxing. It has bounded capture time, request count, resource size, total bytes, and concurrent requests. Private pages, authentication walls, unsupported URLs, and sites that block capture return an error. Uploaded screenshots and the manual studio remain alternatives.

The local renderer uses the same Remotion composition and original soundtrack as account exports. Source media are normalized before rendering. The tall mobile capture is framed as a complete phone-sized screen on a neutral canvas before registration, preserving its full content in all three formats and matching the editor thumbnail. Local work has a cancellation deadline, bounded output size, and checked temporary-directory cleanup. Status only reports completion after a nonempty final MP4 exists.

## Deployment

Apply the existing migrations through `008_commercial.sql` for paid installations. The preview improvement introduces no further migration. Deploy the web application and existing queue worker together. The web server needs Chromium and its system dependencies; local preview rendering also needs the repository's renderer source, assets, Node subprocess support, and FFmpeg. `@remotion/bundler` and `@remotion/renderer` remain external Node packages in Next.js.

See [commercial implementation](DEMOPOP_COMMERCIAL_IMPLEMENTATION.md) for billing configuration. No external generation provider is needed. No email sending or hosting deployment was performed. Account/storage completion requires a configured Supabase service; final MP4 export also requires a running worker.

## Verification

Automated coverage includes URL/options validation, complete branded story construction, source-copy extraction, temporary job serialization/expiry, HTTP range handling, and browser flows for success, reconnecting, reload recovery, errors, sign-in return, and mobile layout. Real website capture and full MP4 rendering are verified separately from intercepted account UI checks. QA artifacts are stored under `out/qa/link-video/`.

- **54 unit/integration checks passed**, including real database migrations, queue/ownership behavior, generated story validation, lifecycle/ranges, source copy, and full mobile-screen framing across the three story viewports.
- **38 local browser checks passed across the full and targeted regression runs.** The new flow has ten checks, including direct access to both creation paths, native media retry after an actual decode failure, expired-result recovery, and sign-in handoff across tabs. Existing editor, landing, mobile, and navigation behavior was checked.
- **15 configured-account browser checks passed** using intercepted APIs, including login return with preserved options and recovery of a project saved before a queue error. These are UI checks, not live hosted Supabase integration.
- Real public captures succeeded for Example Domain and Linear. The actual API produced a fully decoded 15-second 1080p H.264/AAC MP4; native range, HEAD, full download, origin rejection, input validation, and one-active-job limits were verified.
- A real browser session submitted Linear with the default 30-second landscape options, waited for the generated video, played and sought it, and downloaded the MP4. The 1920×1080, 30 fps, 30.016-second H.264/AAC file decoded fully with no browser errors. Visual review prompted the additional mobile-screen framing correction, which is independently covered by pixel/geometry checks and final rendered frames.
- The final production preview also accepted a real link and completed the background render, including the bundled renderer import, native range/HEAD handling, MP4 download, and full audio/video decode. The corrected phone framing was rendered in all three formats and a complete additional 15-second Linear video.

No hosted migration, live Supabase/storage/worker completion, billing, email sending, or public deployment was performed.
