# Launch Film

DemoPop now generates a bold tech announcement as its default new-project style. Existing projects retain their selected renderer; older settings without audio or CTA fields parse as silent with a default closing action.

## Creative direction

The revised film follows one chrome-framed product screen through a continuous camera move. The before/after reveal happens through a matte inside that screen, rather than dissolving entire slides and doubling the captions. Two different screenshot details follow: a prompt/composer view, then an output view on a light mineral stage. The final screen exits into a larger brand, custom action, and URL. The opening is visible at frame zero.

The structure is informed by TikTok's guidance on [early hooks, body/close structure, stimulation, and sound](https://ads.tiktok.com/business/en/blog/creative-best-practices-top-performing-ads) and [vertical framing and UI-safe content](https://ads-useast2a.tiktok.com/resources/help/article/creative-best-practices?lang=en). The requested keynote aesthetic is a creative choice, not evidence of guaranteed view performance. The Product, Benefit, and Curiosity controls let the user try different openers with the same product footage; audience retention and completion need to be measured on published variants.

| Time      | Purpose                                      |
| --------- | -------------------------------------------- |
| 0–1.8s    | Immediate hook with a partial product teaser |
| 1.8–3.5s  | Earlier product in the same physical frame   |
| 3.5–5.7s  | Matched wipe and product hero                |
| 5.7–8.5s  | First benefit and composer detail            |
| 8.5–11.8s | Output detail on a light editorial stage     |
| 11.8–15s  | Custom call to action, brand, and URL        |

Both 1080 × 1920 and 1920 × 1080 use 450 deterministic frames at 30fps. Headline wrapping uses measured glyph advances from the bundled fonts, balanced whole-word lines, preserved hard returns, and complete short sentences where practical. Grapheme segmentation preserves emoji sequences. Product-name and CTA regions are bounded, including maximum-length input and optional logos.

Camera framing adapts to the screenshot aspect ratio. Desktop screenshots receive detail pushes; tall screenshots keep their selected width; extreme panoramas receive a smaller added zoom. User crop settings remain authoritative, and camera movement stays inside the selected viewport. Images already enlarged by the user can still have limited detail. Image failures retain the sanitized error path. Orbit is an original fictional AI workspace, with vector artwork rasterized at 2560 × 1760 for sharper detail shots and no fabricated customer results.

## Sound and generator controls

Launch Film defaults to DM Sans and **Launch pulse**, an original locally synthesized stereo score. The revised score has a recurring D–F#–E–A motif, warm rhythmic bass and brushed percussion through the proof shots, timed rises, and a resolving brand cadence. No commercial samples or remote generation are used. The 15-second source WAV is 48kHz/16bit stereo, with a −6.10dBFS peak and −18.00dBFS sample RMS. These are signal measurements, not LUFS or a listening evaluation. See `public/audio/README.md` for deterministic regeneration and mono checks.

The editor exposes a Soundtrack setting and a custom closing action of up to 36 characters. The preview mute control changes monitoring only; exported audio follows the saved soundtrack setting. Silent mode is available. Hook-angle buttons change only the opening caption and seek to its scene. The story timeline, caption focus, browser drafts, and export snapshots include the new style and settings.

## Deployment

Apply all outstanding migrations through **`supabase/migrations/007_launch_workspace.sql`** before using the current release against hosted Supabase. Migration 004 allows the controlled Orbit sample IDs; 005 labels the earlier camera revision `launch-4`; 006 introduced `launch-5` highlight framing; 007 adds the launch workspace and labels new jobs `studio-6`. Deploy the updated web process and worker together. The worker accepts every earlier version. Existing snapshots and completed files remain immutable. See [highlight framing and screenshot quality](DEMOPOP_VIDEO_QUALITY.md) and [Launch workspace](DEMOPOP_LAUNCH_WORKSPACE.md) for subsequent changes.

## Reproducing the sample

```sh
npm run assets:launch
npm run audio:launch
npm run render:launch
npm run render:quality
npm run verify:launch
```

Use `-- --stills-only` or `-- --videos-only` with `render:launch` to run one kind of render. The vertical output is `out/demopop-launch.mp4`; landscape is `out/qa/launch/demopop-launch-landscape.mp4`. The quality matrix renders 20 stress stills across both formats into `out/qa/launch-quality/`. `verify:launch` fully decodes each deliverable, extracts half-second pacing frames and five frames around every cut, and measures decoded AAC audio. Its output is in `out/qa/launch/encoded/`. `npm run fonts:measure` regenerates glyph metrics after changing the bundled fonts.

## Verification

- **25 core tests passed**, covering scene motion, crop containment, contrast, actual-font phrase fitting, accented/CJK/emoji preservation, maximum text, settings compatibility, and earlier regressions. PGlite executed migrations 001–005, including controlled sample references, rejection of forged IDs, and `launch-4` snapshots with soundtrack and CTA.
- **10 local browser checks passed** against an isolated production build. New coverage checks the default Launch Film, soundtrack choice, monitoring mute, hook angles, correct scene seek positions, custom CTA display, and recovery of launch settings from a browser draft. Existing editor, mobile, navigation, and earlier-template checks still pass.
- A separate browser regression passed **42 glyph-clearance checks** across incoming/outgoing transition frames, both formats, and maximum-length names. It clips actual text ranges through their animation masks before comparing them with the transformed product frame. This caught premature camera moves and faint pre-entrance text; both were corrected before the final exports.
- The preceding release's **11 configured-UI checks** used intercepted APIs, including a launch export snapshot with soundtrack and CTA. These were not rerun for this visual revision; cloud request contracts are unchanged.
- TypeScript, ESLint, formatting, and whitespace checks passed.
- Rendered and inspected the 16 scene stills, then a separate 20-still stress matrix. Findings corrected during review included cut prompt letters, a stray button sliver, landscape product-name overlap, awkward sentence breaks, and over-enlarged portrait screenshots.
- Both full MP4s rendered with H.264, yuv420p, BT.709, 30fps, expected dimensions, approximately 15 seconds, and AAC stereo. The delivery verification script decodes the full files and samples every edit boundary; generated WAV checks establish silent endpoints, near-zero DC, balanced channels, mono compatibility, and deterministic regeneration.

Live Supabase save/render/download remains an external integration check; fixture SQL and intercepted UI APIs do not establish live service completion. No audience performance data is claimed by these local checks.
