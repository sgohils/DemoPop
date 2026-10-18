# DemoPop product quality pass

October 17, 2026. Follow-up to the workflow/creative additions, focused on making the product easier to understand, edit, and present.

## Product changes

- Rebuilt the homepage around one working product demonstration. Visitors can compare motion templates, switch formats, and open the editor with the demonstrated style. Real sample screenshots, an illustrated workflow, and clear account requirements replace the sparse single-screen pitch.
- Reworked the editor into a studio with a readable inspector, visual motion cards, format choices, a graphite preview canvas, and a six-scene story timeline. Caption focus jumps to its actual video moment. The preview starts on a settled poster frame; first playback starts at zero, while explicit scrubbing and scene choices are respected.
- Added undo/redo for project changes, including uploaded images, logo removal, screenshot swaps, and crops. Typing and crop adjustments are grouped, history is bounded to 80 snapshots, redo branches are discarded after new edits, and loading another project resets its history. Native text-field undo remains available; toolbar shortcuts work elsewhere. Mobile users have their own accessible undo/redo controls.
- Screenshot cards accept dropped files, show dimensions, and offer a before/after swap. Brand color supports direct hex entry and a small palette. Browser-only mode explains the available capabilities without exposing backend setup details in the editing flow.
- Refined the returning-user project library with format/template/date metadata, clearer search and empty states, responsive actions, and retryable load failures. Sign-in is offered for authentication errors; an active-export rejection stays on the current project with useful feedback.
- Improved the Studio templates with restrained browser framing, stronger caption hierarchy, smooth caption handoffs and slide parallax, continuous split-to-full expansion, and text fitted to explicit safe regions. Existing classic vertical projects retain their renderer.

Undo history lives in the current tab; recovered browser drafts restore settings/assets rather than an old undo stack. Browser drafts and private media access retain the ownership and storage boundaries described in the earlier verification report.

## Verification

- **18 core tests passed**, including history grouping/branching/limits, continuous comparison geometry, long-text fitting, and all prior SQL/access/crop/media/worker regressions.
- **9 local browser checks passed** against an isolated production build. New coverage includes template handoff, untouched-sample navigation, initial playback from zero, caption/scene seeking, toolbar and keyboard undo/redo, uploaded-image restoration, screenshot swapping, keyboard playback, and mobile controls. Draft recovery and navigation regressions still pass.
- **10 configured-UI browser checks passed** using intercepted API responses. The project-library check includes a failed load followed by retry, real format/template metadata, search/duplicate/trash/restore, active-export rejection without an irrelevant sign-in link, and mobile overflow checks. Existing session, image, brand-kit, password, and export-history checks still pass. This verifies UI behavior rather than live Supabase integration.
- TypeScript, ESLint, formatting, and `git diff --check` passed.
- Rendered and inspected **24 actual stills** across every template and format. Checked both bundled fonts against maximum-length copy in Chromium.
- Regenerated **two actual MP4s**: landscape Slide & Settle and vertical Split Compare. Both verify as 15 seconds, 30 fps, H.264/yuv420p, BT.709, silent, with the expected dimensions. Decoded transition frames at 145, 180, 209, and 210 confirm smooth compressed output.

QA artifacts live under ignored `out/qa/`: homepage/editor desktop and mobile screenshots, project-library screenshots, Studio contact sheets, final MP4s and metadata, and `*-motion-strip.png` decoded-frame comparisons. Project-library/account/export browser responses are mocked for UI verification; these screenshots do not imply live cloud records.

## Reviewing locally

`npm run preview` builds into `.next-preview` and starts a production preview at `http://127.0.0.1:3001`. It uses normal local environment configuration, leaves another running `.next` app alone, and restores generated root TypeScript files after building. Use `DEMOPOP_PREVIEW_PORT` to choose another available port. Run production preview and browser-test builds sequentially because Next temporarily updates those root files during compilation.

No additional database migration is needed beyond the previously delivered migration 003. Real cloud save/export, hosted account recovery and Storage operations still require Supabase configuration and live integration checks, as documented in the README.
