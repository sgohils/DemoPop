import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";

// Original fictional product UI. No external images, logos, or performance claims.
const W = 1600;
const H = 1100;
const text = (
  x: number,
  y: number,
  value: string,
  size = 20,
  fill = "#f6f7fb",
  weight = 400,
  extra = "",
) =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" ${extra}>${value}</text>`;
const rect = (
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  radius = 0,
  stroke = "none",
) =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}"/>`;
const line = (x1: number, y1: number, x2: number, y2: number, color: string) =>
  `<path d="M${x1} ${y1}H${x2}V${y2}" fill="none" stroke="${color}"/>`;
const orbit = (x: number, y: number, size: number, color: string) =>
  `<g transform="translate(${x} ${y})" fill="none" stroke="${color}" stroke-width="${size * 0.065}"><circle cx="0" cy="0" r="${size * 0.28}"/><ellipse rx="${size * 0.48}" ry="${size * 0.19}" transform="rotate(-38)"/></g>`;
const plus = (x: number, y: number, color: string) =>
  `<path d="M${x - 6} ${y}h12m-6-6v12" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>`;
const arrow = (x: number, y: number, color: string) =>
  `<path d="M${x} ${y + 6}v-12m-5 5 5-5 5 5" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
const checkbox = (x: number, y: number, color: string, checked = false) =>
  `${rect(x, y, 19, 19, "none", 5, color)}${checked ? `<path d="m${x + 4} ${y + 9} 4 4 7-8" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round"/>` : ""}`;
const document = (x: number, y: number, color: string) =>
  `<g transform="translate(${x} ${y})" fill="none" stroke="${color}" stroke-width="1.5"><rect width="15" height="19" rx="3"/><path d="M4 6h7M4 10h7M4 14h4"/></g>`;
const svg = (name: string, content: string, defs = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><title>Orbit ${name} workspace</title><desc>Original interface for a fictional AI product, created for the DemoPop launch demonstration.</desc><defs>${defs}</defs><g font-family="Segoe UI, Arial, sans-serif">${content}</g></svg>`;

const before = svg(
  "early",
  `${rect(0, 0, W, H, "#e6e7eb")}
  ${rect(40, 38, 1520, 1024, "#f8f9fb", 14, "#cacdd5")}
  ${rect(40, 38, 1520, 65, "#fff", 14)}
  ${rect(40, 80, 1520, 23, "#fff")}
  ${orbit(76, 70, 32, "#5b64a3")}
  ${text(102, 78, "Orbit", 25, "#343746", 600)}
  ${text(260, 76, "Workspace", 18, "#626778")}
  ${text(1357, 76, "Settings", 16, "#626778")}
  ${rect(1474, 53, 34, 34, "#e9ebf2", 17)}
  ${text(1486, 76, "A", 16, "#5e6473", 600)}
  ${line(40, 103, 1560, 103, "#d9dce3")}
  ${rect(40, 104, 218, 958, "#f0f1f5")}
  ${rect(60, 128, 178, 43, "#fff", 5, "#d7dbe4")}
  ${plus(81, 149, "#626778")}
  ${text(99, 155, "New chat", 16, "#484e61", 500)}
  ${text(63, 213, "WORKSPACE", 12, "#969bac", 600, 'letter-spacing="1.4"')}
  ${text(64, 251, "All conversations", 16, "#606676")}
  ${text(64, 294, "Saved prompts", 16, "#606676")}
  ${text(64, 337, "My documents", 16, "#606676")}
  ${text(63, 403, "RECENT CHATS", 12, "#969bac", 600, 'letter-spacing="1.4"')}
  ${rect(52, 420, 194, 42, "#e0e3ed", 4)}
  ${text(65, 447, "Product launch ideas", 15, "#50596f", 500)}
  ${text(65, 489, "Rewrite this headline", 15, "#777d8d")}
  ${text(65, 531, "Untitled conversation", 15, "#777d8d")}
  ${text(65, 573, "Website brainstorm", 15, "#777d8d")}
  ${text(65, 614, "Notes summary", 15, "#777d8d")}
  ${line(60, 975, 237, 975, "#d8dbe4")}
  ${text(64, 1011, "Personal workspace", 14, "#8a8fa0")}
  ${text(292, 155, "AI workspace", 27, "#393e50", 600)}
  ${text(292, 186, "Choose a tool or continue your conversation.", 16, "#8b91a0")}
  ${[
    [292, "Write copy", "Draft something new"],
    [589, "Brainstorm", "Explore some ideas"],
    [886, "Summarize", "Make it shorter"],
  ]
    .map(
      ([x, title, description]) =>
        `${rect(Number(x), 212, 277, 83, "#fff", 5, "#dfe2ea")}${text(Number(x) + 18, 245, String(title), 17, "#5b6174", 500)}${text(Number(x) + 18, 271, String(description), 14, "#999fad")}`,
    )
    .join("")}
  ${rect(1183, 212, 343, 83, "#fff", 5, "#dfe2ea")}
  ${text(1201, 245, "Model settings", 16, "#747b8f", 500)}
  ${text(1201, 271, "Balanced · Default tone", 14, "#999fad")}
  ${rect(292, 323, 872, 571, "#fff", 5, "#dfe2ea")}
  ${text(313, 357, "Product launch ideas", 17, "#565d71", 500)}
  ${text(1021, 357, "Export  ···", 14, "#9a9fae")}
  ${line(292, 377, 1164, 377, "#eceef3")}
  ${rect(316, 403, 34, 34, "#e8eaf2", 4)}
  ${text(327, 427, "A", 17, "#737b95", 600)}
  ${text(366, 427, "You", 14, "#9298a9", 600)}
  ${text(366, 460, "Help me plan a product launch.", 19, "#454c60")}
  ${rect(316, 501, 34, 34, "#eef0f8", 4)}
  ${orbit(333, 518, 24, "#7d85a7")}
  ${text(366, 525, "Orbit", 14, "#9298a9", 600)}
  ${text(366, 560, "Here are some ideas for your product launch:", 18, "#5b6276")}
  ${text(366, 608, "1. Define your audience and key messaging.", 18, "#737a8d")}
  ${text(366, 650, "2. Create a landing page for the product.", 18, "#737a8d")}
  ${text(366, 692, "3. Prepare social media content and emails.", 18, "#737a8d")}
  ${text(366, 734, "4. Set a launch date and share your announcement.", 18, "#737a8d")}
  ${text(366, 791, "Would you like me to expand on any of these?", 17, "#8f95a5")}
  ${text(367, 851, "Copy     Regenerate", 14, "#999fad")}
  ${rect(1183, 323, 343, 297, "#f0f2f7", 5, "#dfe2ea")}
  ${text(1206, 360, "Conversation settings", 17, "#747c91", 500)}
  ${text(1206, 405, "Response length", 14, "#969dae")}
  ${rect(1206, 418, 295, 37, "#fff", 3, "#d9dee9")}
  ${text(1217, 443, "Medium", 14, "#8b93a6")}
  ${text(1206, 493, "Tone of voice", 14, "#969dae")}
  ${rect(1206, 506, 295, 37, "#fff", 3, "#d9dee9")}
  ${text(1217, 531, "Default", 14, "#8b93a6")}
  ${text(1206, 590, "Reset to defaults", 14, "#9aa2b4")}
  ${rect(292, 919, 872, 95, "#fff", 5, "#d7dce6")}
  ${text(312, 953, "Type a message...", 17, "#a1a7b6")}
  ${text(313, 990, "Attach file", 14, "#a1a7b6")}
  ${rect(1073, 960, 72, 35, "#747fac", 4)}
  ${text(1091, 983, "Send", 14, "#fff", 500)}
  ${text(292, 1041, "Your conversations are saved in this workspace.", 13, "#a1a7b6")}`,
);

const after = svg(
  "launch",
  `${rect(0, 0, W, H, "#08090d")}
  ${rect(40, 38, 1520, 1024, "#101116", 22, "#30313b")}
  ${rect(41, 39, 245, 1022, "#13141a", 21)}
  ${rect(266, 39, 20, 1022, "#13141a")}
  ${line(286, 39, 286, 1061, "#272831")}
  ${orbit(83, 88, 41, "#abb6ff")}
  ${text(114, 98, "orbit", 34, "#f6f7fb", 600, 'letter-spacing="-1.3"')}
  ${rect(61, 146, 204, 49, "#242631", 12, "#353744")}
  ${plus(84, 170, "#d7dcff")}
  ${text(105, 177, "New space", 17, "#e7e9f5", 500)}
  ${text(65, 243, "YOUR WORK", 11, "#737787", 600, 'letter-spacing="1.8"')}
  ${rect(55, 260, 216, 45, "#232632", 10)}
  <path d="M75 279l7-6 7 6v13h-14Z" fill="none" stroke="#a4b1ff" stroke-width="1.6"/>
  ${text(105, 289, "Home", 16, "#d9e0ff", 500)}
  <path d="M75 327h15v15H75Zm0 5h15m-10-5v15" fill="none" stroke="#787c8e" stroke-width="1.5"/>
  ${text(105, 341, "Projects", 16, "#9499ab")}
  ${document(76, 378, "#787c8e")}
  ${text(105, 393, "Library", 16, "#9499ab")}
  ${text(65, 465, "SPACES", 11, "#737787", 600, 'letter-spacing="1.8"')}
  ${plus(247, 460, "#737787")}
  ${rect(74, 489, 14, 14, "#8c9eff", 4)}
  ${text(105, 502, "Product launch", 15, "#b8bdce")}
  ${rect(74, 537, 14, 14, "#637b72", 4)}
  ${text(105, 550, "Website refresh", 15, "#8b91a3")}
  ${line(63, 964, 263, 964, "#292b34")}
  ${rect(70, 989, 34, 34, "#2d3041", 17)}
  ${text(81, 1013, "A", 15, "#cad1f1", 600)}
  ${text(117, 1007, "Alex", 15, "#cdd1df", 500)}
  ${text(117, 1027, "Personal workspace", 11, "#7b8194")}
  ${text(322, 91, "Home", 15, "#b3b7c7", 500)}
  ${text(1362, 91, "All changes saved", 12, "#7f8598")}
  <circle cx="1344" cy="87" r="3" fill="#83b9a0"/>
  ${text(902, 185, "A LITTLE CLARITY. A LOT OF POSSIBILITY.", 11, "#8e94aa", 500, 'text-anchor="middle" letter-spacing="2.5"')}
  ${text(902, 253, "Make the next move.", 58, "#f8f9ff", 500, 'text-anchor="middle" letter-spacing="-2.8"')}
  ${text(902, 292, "A clear path from what if to what’s next.", 19, "#8e94a8", 400, 'text-anchor="middle"')}
  ${rect(458, 330, 888, 157, "url(#composer)", 24, "#3d435b")}
  ${text(485, 375, "Plan a thoughtful product launch.", 24, "#e7eaff", 400, 'letter-spacing="-.4"')}
  ${rect(483, 419, 180, 37, "#282b3a", 9, "#3c4053")}
  ${document(496, 428, "#afb9ec")}
  ${text(521, 444, "Product brief.pdf", 14, "#b9c2e8")}
  ${rect(1167, 414, 156, 45, "#a5b2ff", 13)}
  ${text(1184, 443, "Create a plan", 15, "#171c36", 600)}
  ${arrow(1305, 437, "#171c36")}
  ${text(482, 528, "YOUR LAUNCH, TAKING SHAPE", 11, "#757d94", 500, 'letter-spacing="1.8"')}
  ${rect(458, 548, 888, 383, "#191b23", 22, "#363946")}
  ${rect(481, 573, 40, 40, "#2d3352", 12)}
  <path d="m491 596 8-13 11 13-11-4Z" fill="none" stroke="#a4b3ff" stroke-width="1.5" stroke-linejoin="round"/>
  ${text(536, 591, "Product launch", 22, "#ecedf5", 500, 'letter-spacing="-.6"')}
  ${text(537, 615, "A plan you can put in motion.", 13, "#939aaf")}
  ${rect(1218, 580, 102, 29, "#262d36", 14)}
  <circle cx="1234" cy="594" r="3" fill="#a0ccbc"/>
  ${text(1245, 599, "Draft ready", 11, "#bdd6cc", 500)}
  ${line(482, 637, 1322, 637, "#30333f")}
  ${text(483, 674, "NEXT STEPS", 10, "#727b93", 500, 'letter-spacing="1.6"')}
  ${checkbox(485, 694, "#9caeff", true)}
  ${text(518, 711, "Shape the story", 17, "#dfe3f4", 500)}
  ${text(518, 737, "Positioning, audience, and the big idea", 13, "#828ba3")}
  ${line(484, 755, 915, 755, "#2c303b")}
  ${checkbox(485, 777, "#626c87")}
  ${text(518, 794, "Build the launch page", 17, "#bfc7dd", 500)}
  ${text(518, 820, "One clear message. One next step.", 13, "#828ba3")}
  ${line(484, 837, 915, 837, "#2c303b")}
  ${checkbox(485, 858, "#626c87")}
  ${text(518, 875, "Ship the announcement", 17, "#bfc7dd", 500)}
  ${text(518, 901, "Launch copy, email, and social drafts", 13, "#828ba3")}
  ${rect(949, 661, 373, 244, "#f2f3fb", 15)}
  ${orbit(970, 683, 16, "#393e62")}
  ${text(984, 687, "orbit", 10, "#383c58", 600, 'letter-spacing="-.3"')}
  ${text(1286, 687, "↗", 12, "#848ba7")}
  <circle cx="1238" cy="769" r="66" fill="url(#orbGlow)"/>
  <ellipse cx="1238" cy="769" rx="75" ry="29" fill="none" stroke="#899bff" stroke-width="1" transform="rotate(-32 1238 769)" opacity=".6"/>
  ${text(971, 745, "From idea.", 31, "#2a304c", 500, 'letter-spacing="-1.5"')}
  ${text(971, 780, "To done.", 31, "#2a304c", 500, 'letter-spacing="-1.5"')}
  ${text(972, 810, "Your next big thing starts here.", 9, "#7882a3")}
  ${rect(971, 828, 100, 25, "#222944", 12)}
  ${text(985, 844, "Start creating", 8, "#f2f3fb", 500)}
  ${rect(960, 873, 84, 21, "#fff", 8)}
  ${text(970, 887, "Landing page", 9, "#727c9b", 500)}
  ${text(1131, 887, "Open preview  ↗", 10, "#667194")}
  ${rect(724, 966, 356, 42, "#15171f", 21, "#2c303d")}
  ${text(754, 993, "Explore your space", 13, "#9da7c0")}
  ${text(1012, 994, "→", 21, "#9da7c0")}`,
  `<linearGradient id="composer" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#252838"/><stop offset="1" stop-color="#1c1f2b"/></linearGradient><radialGradient id="orbGlow" cx=".38" cy=".3" r=".8"><stop stop-color="#e7eaff"/><stop offset=".4" stop-color="#c5ceff"/><stop offset=".7" stop-color="#8c9eff"/><stop offset="1" stop-color="#5367ca"/></radialGradient>`,
);

await mkdir("public/sample", { recursive: true });
for (const [name, source] of [
  ["launch-before", before],
  ["launch-after", after],
]) {
  await writeFile(`public/sample/${name}.svg`, source);
  await sharp(Buffer.from(source), { density: 144 })
    .resize(2560, 1760)
    .png()
    .toFile(`public/sample/${name}.png`);
}
console.log("Created original Orbit launch screenshots (2560 × 1760).");
