import sharp from "sharp";
import { mkdir, copyFile, writeFile } from "node:fs/promises";
const building = (x: number, y: number, w: number, h: number, color: string) =>
  `<g transform="translate(${x} ${y})"><rect width="${w}" height="${h}" fill="${color}"/><rect x="${w * 0.1}" y="${h * 0.1}" width="${w * 0.8}" height="${h * 0.75}" fill="#647875"/>${Array.from({ length: 4 }, (_, i) => `<rect x="${w * (0.12 + i * 0.2)}" y="${h * 0.1}" width="5" height="${h * 0.75}" fill="#d2c8b7"/>`).join("")}<rect x="${w * 0.1}" y="${h * 0.48}" width="${w * 0.8}" height="8" fill="#e3d7c5"/></g>`;
const architecture = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#b5ccc9"/><stop offset="1" stop-color="#e1ded0"/></linearGradient></defs><rect width="1200" height="900" fill="url(#sky)"/><circle cx="940" cy="175" r="100" fill="#ece4cf"/><path d="M0 650 Q300 590 600 680 T1200 620 V900 H0" fill="#9eab8c"/>${building(110, 260, 480, 450, "#dbd2bf")}${building(590, 430, 470, 280, "#c5b99f")}<rect x="80" y="708" width="1020" height="30" fill="#eddfc5"/><path d="M0 900 L390 738 H650 L900 900" fill="#d6cbb4"/><path d="M0 760 Q180 650 250 820 L210 900 H0 M1200 710 Q1050 650 1000 820 L1030 900 H1200" fill="#526a51"/><g fill="#718267"><circle cx="53" cy="650" r="87"/><circle cx="1120" cy="620" r="100"/></g></svg>`;
const art = Buffer.from(architecture).toString("base64");
const before = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="2000"><rect width="1440" height="2000" fill="#efede7"/><rect width="1440" height="50" fill="#646d61"/><g font-family="Arial" fill="#41473e"><text x="80" y="135" font-size="42" font-weight="bold">FORMA STUDIO</text><text x="800" y="130" font-size="22">HOME　 ABOUT　 PROJECTS　 CONTACT</text><path d="M80 175 H1360" stroke="#b7baaf"/><text x="80" y="285" font-size="55">Architecture for everyday life</text><text x="80" y="343" font-size="25">Thoughtful buildings. Personal spaces. Established 2016.</text><image href="data:image/svg+xml;base64,${art}" x="80" y="410" width="1280" height="800" preserveAspectRatio="xMidYMid slice"/><rect x="80" y="1250" width="290" height="72" fill="#67745f"/><text x="114" y="1298" fill="white" font-size="24">VIEW OUR PROJECTS</text><text x="80" y="1440" font-size="37">Welcome to Forma Studio</text><text x="80" y="1510" font-size="26">We are an independent architecture practice designing</text><text x="80" y="1555" font-size="26">homes and spaces for the way people really live.</text><path d="M80 1640 H1360" stroke="#b7baaf"/><text x="80" y="1730" font-size="30">Residential</text><text x="560" y="1730" font-size="30">Interiors</text><text x="1050" y="1730" font-size="30">Our process</text><text x="80" y="1900" font-size="23">FORMA STUDIO　 /　 INDEPENDENT ARCHITECTURE</text></g></svg>`;
const after = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="2000"><rect width="1440" height="2000" fill="#f8f6ef"/><g font-family="Arial" fill="#23372e"><text x="80" y="105" font-size="47" font-weight="bold" letter-spacing="-2">forma<tspan fill="#9b5b39">.</tspan></text><text x="800" y="99" font-size="21">Our work　　 Our studio　　 Get in touch ↗</text><path d="M80 145 H1360" stroke="#d7d8cb"/><text x="80" y="226" font-size="19" letter-spacing="4">SPACES TO LIVE A LITTLE MORE.</text><text x="75" y="358" font-size="119" letter-spacing="-7">Good spaces.</text><text x="75" y="483" font-size="119" letter-spacing="-7">Better everyday.</text><text x="84" y="562" font-size="25">Considered architecture for the things that matter.</text><rect x="1040" y="500" width="310" height="72" rx="36" fill="#23372e"/><text x="1080" y="546" font-size="22" fill="#f8f6ef">Explore our work　↗</text><image href="data:image/svg+xml;base64,${art}" x="80" y="630" width="1280" height="830" preserveAspectRatio="xMidYMid slice"/><text x="80" y="1512" font-size="22">01 — THE COURTYARD HOUSE</text><text x="1135" y="1512" font-size="20">RESIDENTIAL</text><path d="M80 1570 H1360" stroke="#c7cbbd"/><text x="80" y="1650" font-size="19" letter-spacing="3">SMALL STUDIO. CLOSE COLLABORATION.</text><text x="80" y="1750" font-size="65" letter-spacing="-2">Your everyday,</text><text x="80" y="1820" font-size="65" letter-spacing="-2">beautifully considered.</text><text x="950" y="1760" font-size="23">Have a space in mind?</text><text x="950" y="1810" font-size="26" text-decoration="underline">Let's talk about it ↗</text><text x="80" y="1940" font-size="17">FORMA STUDIO　 /　 FICTIONAL DEMONSTRATION PROJECT</text></g></svg>`;
await mkdir("public/sample", { recursive: true });
await mkdir("public/fonts", { recursive: true });
for (const [name, svg] of [
  ["before", before],
  ["after", after],
]) {
  await writeFile(`public/sample/${name}.svg`, svg);
  await sharp(Buffer.from(svg)).png().toFile(`public/sample/${name}.png`);
}
await copyFile(
  "node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2",
  "public/fonts/manrope.woff2",
);
await copyFile(
  "node_modules/@fontsource-variable/manrope/LICENSE",
  "public/fonts/OFL.txt",
);
console.log(
  "Created original fictional Forma Studio screenshots and local font.",
);
