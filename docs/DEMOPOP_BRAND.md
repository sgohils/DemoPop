# DemoPop identity

The selected logo is **Breakout**, direction 04 from the logo drafts. Preserve its two paths, 84×84 view box, 12-unit stroke, and round joins. The displaced corner is part of the approved shape.

- `src/components/BrandMark.tsx` renders the mark in the app. `Brand.tsx` pairs it with the DM Sans wordmark and keeps the accessible home link.
- The landing header and footer use lime on ink. Light app pages use the existing blue accent. The browser icon uses lime on an ink tile.
- `public/brand/demopop-breakout.svg`, `demopop-breakout-lime.svg`, and `demopop-breakout-white.svg` are transparent vector exports of the same geometry.
- `public/brand/breakout-ink.png` and `breakout-lime.png` are transparent 512px raster exports. The DemoPop announcement film uses the ink logo because the renderer presents it on a white tile.

`npm run assets:home-film` captures the current editor with the selected logo, renders the actual DemoPop film and poster, and records the brand asset in the film metadata. Run it with the local preview available on port 3001.
