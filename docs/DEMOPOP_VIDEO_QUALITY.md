# Video creation quality

Launch Film can now show the actual feature behind each benefit caption. Open **Story**, choose **Custom** below either highlight, and adjust its position and zoom. Each shot selects from the entire after screenshot independently of the reveal crop. **Auto** restores the existing cinematic framing.

The framing thumbnail uses the feature shot's screen aspect ratio. The live preview seeks to that highlight when its controls are used. An enlargement hint identifies crops that magnify source pixels; reducing zoom or supplying a larger screenshot improves detail. Custom focus is held during each settled benefit shot, with smooth transitions over frames 171–193 and 255–275. Blending complete image geometries keeps the screenshot covering its frame throughout each transition, including tall and panoramic inputs.

Both choices participate in undo/redo, local draft recovery, project saves, and immutable export snapshots. Replacing the after screenshot or swapping screenshots clears the focus settings, because those positions refer to the previous after image. Old projects and null/missing focus settings retain their automatic camera behavior. Other templates ignore Launch Film focus settings.

New uploads use lossless WebP normalization, preserving colored one-pixel UI details and transparency after orientation/size normalization. If the lossless file exceeds the existing 15 MB input bucket limit, a bounded high-quality WebP fallback keeps it within that limit. This improves new uploads; previously compressed stored images must be uploaded again to benefit. MP4 delivery remains H.264, CRF 18, yuv420p, BT.709, 30 fps with PNG frame intermediates.

Apply migrations through `006_highlight_framing.sql` and deploy the updated web process and worker together. New queued exports use `launch-5`; older workers reject this version instead of ignoring focus settings. The updated worker continues to accept earlier job versions. Existing immutable jobs and completed files keep their original versions.

Verified locally on October 18, 2026:

- All 34 unit/integration tests passed, including legacy geometry compatibility, independent focus outside the reveal crop, continuous covering transforms in both formats, field validation, history, queue snapshot preservation, exact decoded screenshot/alpha pixels, orientation, and the dense-photo storage fallback. Queue tests execute migrations 001–006 in embedded Postgres.
- Four Chromium browser checks passed after an isolated production build: desktop custom framing/history/draft recovery/media resets, mobile keyboard controls and overflow, launch settings, and glyph clearance during camera transitions.
- TypeScript, ESLint, formatting, and whitespace checks passed.
- Rendered and visually inspected 16 actual stills across both formats, plus a 15-second 1080 × 1920 MP4 with custom highlight shots and AAC audio. Delivery metadata reports H.264, yuv420p, BT.709, and 30 fps. The complete MP4 audio/video decoded without errors, and representative encoded frames were visually inspected. Artifacts are in `out/qa/highlight-framing/`; mobile UI capture is `out/qa/highlight-focus-mobile.png`.

Live Supabase integration still requires configured credentials and has not been established by local checks. No hosted migration or deployment was performed.
