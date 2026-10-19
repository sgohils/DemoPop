import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { ensureBrowser } from "@remotion/renderer";

const directory = resolve("out/brand/logo-drafts");
await mkdir(directory, { recursive: true });
const font = (await readFile("public/fonts/dm-sans.ttf")).toString("base64");
const fontFace = `@font-face{font-family:DraftSans;src:url(data:font/ttf;base64,${font}) format('truetype');font-weight:100 1000;font-style:normal;}`;
const directions = [
  {
    id: "01",
    slug: "lift",
    name: "Lift",
    idea: "The current bars, with a stronger sense of launch.",
    rationale:
      "Three rising slabs. The closest evolution of the existing identity.",
    shape: `<g fill="currentColor"><path d="M10 43 24 35v33l-14 8Z"/><path d="m32 28 14-8v36l-14 8Z"/><path d="m54 13 14-8v39l-14 8Z"/></g>`,
  },
  {
    id: "02",
    slug: "reveal",
    name: "Reveal",
    idea: "A bold D, opened by a single cinematic cut.",
    rationale:
      "A diagonal split makes the product reveal part of the silhouette.",
    shape: `<defs><path id="reveal-d" fill-rule="evenodd" d="M12 12h25c22 0 36 12 36 30S59 72 37 72H12Zm16 16v28h9c13 0 20-5 20-14S50 28 37 28Z"/><clipPath id="reveal-back"><path d="M0 0h66L0 66Z"/></clipPath><clipPath id="reveal-front"><path d="M0 80 80 0v80Z"/></clipPath></defs><g fill="currentColor"><g transform="translate(-2 -2)" clip-path="url(#reveal-back)"><use href="#reveal-d"/></g><g transform="translate(2 2)" clip-path="url(#reveal-front)"><use href="#reveal-d"/></g></g>`,
  },
  {
    id: "03",
    slug: "linked",
    name: "Linked",
    idea: "Two letters. One continuous, compact mark.",
    rationale:
      "A lowercase d and p share a stem, connecting the two halves of DemoPop.",
    shape: `<path fill="currentColor" fill-rule="evenodd" d="M34 8h12v5c3-2 6-2 10-2 12 0 21 9 21 21s-9 21-21 21c-4 0-7-1-10-3v22H34v-5c-3 2-6 2-10 2C12 69 3 60 3 48s9-21 21-21c4 0 7 1 10 3Zm-10 30a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm32-16a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z"/>`,
  },
  {
    id: "04",
    slug: "breakout",
    name: "Breakout",
    idea: "A frame that refuses to stay in its frame.",
    rationale: "One displaced corner gives a simple frame an outward motion.",
    shape: `<g fill="none" stroke="currentColor" stroke-width="12" stroke-linejoin="round"><path d="M34 17H25c-10 0-15 5-15 15v21c0 11 5 16 16 16h21c11 0 16-5 16-16V42"/><path d="M47 7h15c9 0 13 4 13 13v13"/></g>`,
  },
];

// Each inline occurrence gets independent definition IDs, including clip paths.
function mark(direction, instance, className = "") {
  const geometry = direction.shape.replaceAll("reveal-", `${instance}-`);
  return `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 84 84" aria-hidden="true">${geometry}</svg>`;
}

for (const direction of directions) {
  const symbol = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 84 84" color="#090a0d" role="img" aria-labelledby="title"><title id="title">DemoPop ${direction.name} logo draft</title>${direction.shape}</svg>`;
  const lockup = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="144" viewBox="0 0 640 144" color="#090a0d" role="img" aria-labelledby="title"><title id="title">DemoPop ${direction.name} logo draft with wordmark</title><defs><style>${fontFace}</style></defs><svg x="12" y="22" width="100" height="100" viewBox="0 0 84 84">${direction.shape}</svg><text x="137" y="100" fill="currentColor" font-family="DraftSans, sans-serif" font-weight="700" font-size="80" letter-spacing="-4">DemoPop</text></svg>`;
  await writeFile(
    `${directory}/${direction.id}-${direction.slug}-symbol.svg`,
    symbol,
  );
  await writeFile(
    `${directory}/${direction.id}-${direction.slug}-lockup.svg`,
    lockup,
  );
}

const cards = directions
  .map(
    (
      direction,
    ) => `<article class="card" aria-labelledby="title-${direction.id}">
  <div class="card-heading"><span class="number">${direction.id}</span><h2 id="title-${direction.id}">${direction.name}</h2><span class="direction-label">LOGO DRAFT</span></div>
  <p class="idea">${direction.idea}</p>
  <div class="lockup">${mark(direction, `primary-${direction.id}`, "main-mark")}<span>DemoPop</span></div>
  <div class="samples"><div class="reverse">${mark(direction, `reverse-${direction.id}`)}<span>DemoPop</span></div><div class="scale"><span class="scale-label">SMALL BY DESIGN</span><div class="sizes">${[40, 24, 16].map((size) => `<span style="width:${size}px;height:${size}px">${mark(direction, `size-${direction.id}-${size}`)}</span>`).join("")}</div></div></div>
  <div class="card-footer"><p>${direction.rationale}</p><a download href="${direction.id}-${direction.slug}-symbol.svg">Symbol SVG ↗</a><a download href="${direction.id}-${direction.slug}-lockup.svg">Wordmark SVG ↗</a></div>
</article>`,
  )
  .join("");

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DemoPop — Logo drafts</title><style>
${fontFace}
*{box-sizing:border-box}body{margin:0;background:#edede7;color:#090a0d;font-family:DraftSans,Arial,sans-serif;-webkit-font-smoothing:antialiased}.board{max-width:1600px;padding:56px 64px 30px;margin:auto}.topline{display:flex;align-items:center;justify-content:space-between;font-size:11px;letter-spacing:.1em;font-weight:650}.topline strong{font-size:22px;letter-spacing:-1px;font-weight:750}.status{display:flex;align-items:center;gap:9px}.status i{width:7px;height:7px;border-radius:50%;background:#536bff}.heading{display:flex;align-items:flex-end;justify-content:space-between;gap:32px;margin:48px 0 34px}.heading h1{font-size:62px;line-height:1.03;letter-spacing:-3.5px;font-weight:600;margin:0}.heading h1 span{color:#8b8e85}.heading p{font-size:14px;line-height:1.6;max-width:280px;margin:0 0 5px;color:#696d65}.toolbar{display:flex;align-items:center;gap:8px;padding:0 0 24px}.toolbar>span{font-size:10px;letter-spacing:.1em;margin-right:10px;color:#696d65}.toolbar button{font:600 11px DraftSans,sans-serif;padding:8px 14px;background:transparent;color:#090a0d;border:1px solid #c5c8bd;border-radius:100px;cursor:pointer}.toolbar button[aria-pressed="true"]{background:#090a0d;color:#fff;border-color:#090a0d}.toolbar button:focus-visible,a:focus-visible{outline:3px solid #536bff;outline-offset:4px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}.card{--paper:#f9f9f5;--ink:#090a0d;--sub:#777d72;--line:#dfe2d7;--reverse:#090a0d;--accent:#dfff86;background:var(--paper);color:var(--ink);border:1px solid #d5d8cd;border-radius:14px;padding:26px 28px 22px;overflow:hidden}.card-heading{display:flex;align-items:center;gap:12px}.number{display:grid;place-items:center;width:30px;height:30px;border:1px solid var(--line);border-radius:50%;font-size:10px}.card h2{margin:0;font-size:22px;font-weight:600;letter-spacing:-.8px}.direction-label{margin-left:auto;font-size:8px;letter-spacing:.12em;color:var(--sub)}.idea{font-size:12px;color:var(--sub);margin:12px 0 0}.lockup{display:flex;align-items:center;justify-content:center;gap:23px;height:166px}.main-mark{width:86px;height:86px;flex:none}.lockup>span{font-size:66px;letter-spacing:-3.8px;font-weight:700;line-height:1}.samples{border-top:1px solid var(--line);padding-top:20px;display:flex;justify-content:space-between;gap:20px;align-items:center}.reverse{display:flex;align-items:center;justify-content:center;gap:10px;color:var(--accent);background:var(--reverse);border-radius:8px;width:235px;height:72px;flex:none}.reverse svg{width:39px;height:39px;flex:none}.reverse>span{font-size:28px;font-weight:700;letter-spacing:-1.5px}.scale{text-align:right;padding-right:8px}.scale-label{font-size:8px;letter-spacing:.1em;color:var(--sub);display:block;margin-bottom:11px}.sizes{display:flex;align-items:center;justify-content:flex-end;gap:18px;height:40px}.sizes>span{display:block}.sizes svg{width:100%;height:100%;display:block}.card-footer{display:flex;align-items:center;gap:12px;margin-top:20px}.card-footer p{font-size:10px;line-height:1.6;color:var(--sub);margin:0;flex:1;max-width:320px}.card-footer a{font-size:9px;font-weight:600;color:var(--ink);text-decoration:none;white-space:nowrap}.card-footer a:hover{text-decoration:underline}.footer{display:flex;justify-content:space-between;gap:24px;padding-top:25px;font-size:10px;color:#72776c;line-height:1.6}.footer strong{font-weight:600;color:#33372d}.board[data-theme="ink"] .card{--paper:#090a0d;--ink:#f3f4ef;--sub:#8f968c;--line:#30342f;--reverse:#dfff86;--accent:#090a0d;border-color:#30342f}.board[data-theme="cobalt"] .card{--paper:#536bff;--ink:#fff;--sub:#dbe0ff;--line:#8293ff;--reverse:#090a0d;--accent:#dfff86;border-color:#536bff}@media(max-width:1100px){.board{padding:36px}.lockup{gap:15px}.main-mark{width:68px;height:68px}.lockup>span{font-size:48px;letter-spacing:-2.8px}.samples{gap:12px}.reverse{width:185px}.scale{padding:0}.sizes{gap:12px}.card-footer{flex-wrap:wrap}.card-footer p{flex-basis:100%;max-width:none}.heading h1{font-size:52px}}@media(max-width:760px){.board{padding:24px 18px}.topline{font-size:8px}.heading{display:block;margin-top:32px}.heading h1{font-size:48px;letter-spacing:-2.5px}.heading p{margin-top:20px;max-width:360px}.grid{grid-template-columns:1fr}.card{padding:22px}.lockup{height:148px}.lockup>span{font-size:48px}.samples{padding-top:17px}.reverse{width:180px;height:64px}.reverse>span{font-size:25px}.reverse svg{width:32px;height:32px}.sizes{gap:10px}.scale-label{font-size:6px}.footer{display:block}.footer>span{display:block;margin-bottom:10px}.card-footer{gap:18px}}@media(max-width:370px){.card{padding:17px}.main-mark{width:54px;height:54px}.lockup>span{font-size:42px}.reverse{width:145px}.reverse>span{font-size:22px}.reverse svg{width:27px;height:27px}.sizes{gap:6px}}
</style></head><body><main class="board" data-theme="paper"><div class="topline"><strong>DemoPop</strong><span class="status"><i></i> IDENTITY EXPLORATIONS / 01—04</span></div><div class="heading"><h1>An identity<br><span>built to move.</span></h1><p>Four directions for DemoPop.<br>Same name. Same palette.<br>A different way to make an entrance.</p></div><div class="toolbar" aria-label="Compare logo colors"><span>TRY A BACKGROUND</span><button type="button" data-theme="paper" aria-pressed="true">Paper</button><button type="button" data-theme="ink" aria-pressed="false">Ink</button><button type="button" data-theme="cobalt" aria-pressed="false">Cobalt</button></div><div class="grid">${cards}</div><div class="footer"><span><strong>CONCEPT DRAFTS</strong> · No direction has been applied to the product.</span><span>Editable SVG symbols + wordmarks · DM Sans embedded · Ink / Lime / Cobalt</span></div></main><script>document.querySelectorAll('.toolbar button').forEach(button=>button.addEventListener('click',()=>{document.querySelector('.board').dataset.theme=button.dataset.theme;document.querySelectorAll('.toolbar button').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));}));</script></body></html>`;
await writeFile(`${directory}/index.html`, html);
await copyFile("public/fonts/DM-Sans-OFL.txt", `${directory}/DM-Sans-OFL.txt`);
await writeFile(
  `${directory}/README.md`,
  `# DemoPop logo drafts\n\nFour exploratory directions: 01 Lift, 02 Reveal, 03 Linked, 04 Breakout.\n\nOpen index.html to compare Paper, Ink, and Cobalt treatments. Each direction includes a transparent SVG symbol and an editable SVG wordmark. The wordmarks embed the existing DM Sans font; its OFL license is included. Colors: ink #090a0d, lime #dfff86, cobalt #536bff.\n\nThese are design drafts, not an adopted identity. The live product logo is unchanged.\n`,
);

const executable = await ensureBrowser();
if (!("path" in executable)) throw new Error("Chromium unavailable.");
const browser = await chromium.launch({
  executablePath: executable.path,
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1200 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { pathToFileURL } = await import("node:url");
  await page.goto(pathToFileURL(`${directory}/index.html`).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `${directory}/demopop-logo-drafts.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Ink", exact: true }).click();
  await page.screenshot({
    path: `${directory}/demopop-logo-drafts-ink.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Cobalt", exact: true }).click();
  await page.screenshot({
    path: `${directory}/demopop-logo-drafts-cobalt.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Paper", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw new Error("Draft review overflows mobile width.");
  await page.screenshot({
    path: `${directory}/mobile-review.png`,
    fullPage: true,
  });
  for (const direction of directions) {
    await page.goto(
      pathToFileURL(`${directory}/${direction.id}-${direction.slug}-lockup.svg`)
        .href,
    );
    await page.evaluate(() => document.fonts.ready);
    await page
      .locator("svg")
      .first()
      .screenshot({
        path: `${directory}/${direction.id}-${direction.slug}-lockup.png`,
        omitBackground: true,
      });
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(`Four DemoPop logo drafts written to ${directory}`);
} finally {
  await browser.close();
}
