# DemoPop landing page

The landing page leads with an actual DemoPop announcement film, then shows the product through a hands-on workflow, live renderer, studio features, questions, and a clear route into the editor. Product claims describe implemented features; there are no invented customer counts, testimonials, pricing tiers, or performance results.

## The motion story

- The opening uses a sticky native-video stage. Scrolling expands the film and seeks its playhead through hook, reveal, proof, and close. Requests are coalesced so the decoder finishes one seek before beginning the next. It stays muted; **Watch the film** opens deliberate playback with sound.
- The film dialog uses native modal focus containment, Escape dismissal, focus return, and background scroll locking/restoration.
- Desktop has a 270svh scroll stage; mobile uses 185svh with chapter headlines that replace the opening copy as the film takes over. Reduced-motion preferences replace the long pin with a normal-flow poster and watch control.
- Lower sections reveal on intersection. Screenshot cards, the waveform, playhead, and closing brand graphic animate while visible. Reduced motion disables these animations.
- The workflow is a keyboard-accessible three-tab interaction. The style gallery uses the real renderer, four styles, and both formats. Its Remotion bundle loads near the section; its player pauses when it leaves view or the browser tab is hidden.

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

`npm run test:browser` includes the actual film's source/duration/muted scrubbing, sound dialog and keyboard behavior, reduced motion, mobile width, live gallery selection, and existing editor/navigation regressions. `scripts/inspect-landing.ts` captures desktop/mobile hero, midpoint, product tabs, gallery, and footer for visual review in `out/qa/landing/`.

Full-page screenshots flatten a sticky section at its current scroll position; inspect the separate hero and midpoint images to judge the opening. Production preview and browser-test builds use separate output folders and must run sequentially. No hosting deployment or paid conversion/audience result is implied by local checks.
