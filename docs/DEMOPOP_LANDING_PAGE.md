# DemoPop landing page

The landing page leads with an actual DemoPop announcement film, then demonstrates a complete launch package, the editing workflow, live styles, and repeat/client work. The main promise is **one product, a whole launch**: website/screenshots/clips become 15–60 second stories and three-hook, three-format packages. Product claims describe implemented features; there are no invented customer counts, testimonials, pricing tiers, or performance results.

## Launch campaign update — October 18, 2026

- The hero explains the campaign outcome and offers an immediate editor link with an account-free preview message. The header CTA has stronger contrast. The moving marquee and “Make a little noise” closing section are retained, and desktop film travel is shortened to reach the product sooner.
- **Make it once. Launch it nine ways.** includes nine real rendered Orbit sample videos. Three keyboard-accessible hook tabs update the landscape, vertical, and square previews together. A delivery list shows exactly which nine MP4s are included, plus the thumbnail/ZIP explanation and a direct studio CTA.
- The sample product is explicitly identified. The web encodes are compressed versions of the previously verified full-resolution launch package. Each video uses `preload="none"`; playback is deliberate, pauses other campaign previews, and stops offscreen or when the document is hidden.
- The website import, reusable recipe, and timestamped review illustrations explain the workflow for repeat launches and client work. Review feedback is labeled as an example. FAQ answers cover durations, packages, accounts, reuse, reviews, and the provenance/quality of the real exports. Page metadata reflects these capabilities.
- Existing cinematic film scrubbing, sound dialog, keyboard workflow tabs, live template previews, selected Breakout branding, and reduced-motion behavior are retained.
- Mobile film placement measures the actual opening/chapter text and transport controls, then fits the film in the space between them. This fixes chapter headlines being covered by the film on wider or shorter mobile viewports. The latest **nine landing browser tests passed**, including overlap checks at 676×768, 676×568, 390×844, and 320×568 across opening, middle, and closing scroll positions.

The nine web previews and posters are in `public/films/campaign/`, with dimensions, durations, source directory, and file sizes in `metadata.json`. Generate a sample package with `npm run render:kit`, then run `npm run assets:campaign`. To compress an existing package directory, use `npm run assets:campaign -- --input=path/to/package`. This process uses local FFmpeg and the real renderer; it does not call a generation service.

The landing/navigation production browser pass has **11 passing tests**, including decoding/playback of all nine campaign videos, deferred video requests, exclusive playback, keyboard hook changes, offscreen pause, the package FAQ and editor CTA, mobile width, reduced motion, film-dialog focus/scroll restoration, and navigation guards. TypeScript and scoped ESLint passed. No conversion-rate result is implied by these checks.

## The motion story

- The opening uses a sticky native-video stage. Scrolling expands the film and seeks its playhead through hook, reveal, proof, and close. Requests are coalesced so the decoder finishes one seek before beginning the next. It stays muted; **Watch the film** opens deliberate playback with sound.
- Hero motion uses time-based easing so wheel jumps and touch reversals settle smoothly across display refresh rates. Geometry is cached and refreshed on resize, font loading, or chapter changes. Mobile film fitting uses transforms rather than resizing the video during each frame. The animation loop stops when settled, hidden, or outside the hero; reduced motion remains immediate.
- The film avoids a perspective container and broad blurred shadows, and the header uses a near-opaque background instead of live backdrop blur. The stage contains its painting and the film/ambient layers are composited separately. These changes retain the scroll reveal while reducing the desktop painting cost; the original full-resolution video is preserved.
- The film dialog uses native modal focus containment, Escape dismissal, focus return, and background scroll locking/restoration.
- Desktop has a 270svh scroll stage; mobile uses 220svh with chapter headlines that replace the opening copy as the film takes over. The longer travel and 90 ms easing give each scene more breathing room and soften direction changes. Reduced-motion preferences replace the long pin with a normal-flow poster and watch control.
- Lower sections reveal on intersection. Screenshot cards, the waveform, playhead, and closing brand graphic animate while visible. Reduced motion disables these animations.
- The workflow is a keyboard-accessible three-tab interaction. The style gallery uses the real renderer, four styles, and both formats. Its Remotion bundle loads near the section; its player pauses when it leaves view or the browser tab is hidden.

The scroll update passed all 10 landing browser checks; six motion, playback, and mobile checks were repeated after the final effects adjustment. A local Chromium measurement at 1440×1000 and 390×844 recorded approximately 16.7 ms median frame intervals, no video-box resizes during scrolling, and no stage updates after settling. Results and screenshots are in `out/qa/landing/scroll-motion.json` and `scroll-smooth-*.png`. These local timings are not a guarantee for other devices.

## The actual film

`public/films/demopop-launch.mp4` is a 15-second, 1920×1080 film rendered by the same Launch Film composition available in the editor, using real DemoPop editor captures and its original score. The source screenshots and project settings are recorded in `public/films/demopop-launch-metadata.json`.

The web encode uses H.264/yuv420p/BT.709 with AAC, a faststart index, and keyframes no more than 15 frames apart for responsive seeking. The poster is a real rendered frame. The editor capture is placed on a graphite matte for cinematic detail framing; the untouched screenshot is retained separately.

Regenerate from the repository root with the local preview running:

```sh
npm run assets:home-film
# Capture only or reuse the captured inputs:
npm run assets:home-film -- --capture-only
npm run assets:home-film -- --render-only
```

The command captures the actual editor using the local browser and then renders locally. It does not call a paid generation API or change the shared worker's encoding settings.

## Review and validation

`npm run test:browser` includes the actual film's source/duration/muted scrubbing, campaign demos, sound dialog and keyboard behavior, reduced motion, mobile width, live gallery selection, and existing editor/navigation regressions. `scripts/inspect-landing.ts` captures desktop/mobile hero, midpoint, campaign, client workflow, product tabs, gallery, and footer for visual review in `out/qa/landing/`. Set `DEMOPOP_QA_URL` to inspect a server other than the default `http://127.0.0.1:3001`.

The original film pass had 17 passing browser checks; see the launch update above for the current targeted pass. Visual review covers 1440×1000, 390×844, 390×667, 390×568, and 320×568. The compact phone layout keeps the film, watch button, and progress bar inside the viewport. Phone dialog checks confirm scroll locking, Escape dismissal, focus return, and exact scroll restoration; no page errors were recorded.

Run `npx tsx scripts/inspect-landing.ts --phones-only` against the local preview to repeat just the compact-phone visual checks.

Full-page screenshots flatten a sticky section at its current scroll position; inspect the separate hero and midpoint images to judge the opening. Production preview and browser-test builds use separate output folders and must run sequentially. No hosting deployment or paid conversion/audience result is implied by local checks.
