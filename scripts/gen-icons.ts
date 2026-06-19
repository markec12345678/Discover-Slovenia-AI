// Enkratni generator PWA ikon z uporabo sharp.
// Generira icon-192.png in icon-512.png v /public.
// Po uspešnem zagonu lahko skripto pobrišemo.

import sharp from "sharp";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");

// SVG vir: alpsko zeleno ozadje, stiliziran Triglav in "IFS" monogram.
function iconSvg(size: number): string {
  const fontSize = Math.round(size * 0.22);
  const subFontSize = Math.round(size * 0.08);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#2d6a3e"/>
      <stop offset="100%" stop-color="#1f4f2c"/>
    </linearGradient>
    <linearGradient id="mtn" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#e8f0ea"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  <!-- stiliziran Triglav -->
  <polygon points="${size * 0.5},${size * 0.18} ${size * 0.78},${size * 0.58} ${size * 0.22},${size * 0.58}" fill="url(#mtn)" opacity="0.95"/>
  <polygon points="${size * 0.5},${size * 0.18} ${size * 0.62},${size * 0.36} ${size * 0.38},${size * 0.36}" fill="#ffffff" opacity="0.6"/>
  <!-- valovi / Ljubljanica -->
  <path d="M0 ${size * 0.7} Q ${size * 0.25} ${size * 0.62}, ${size * 0.5} ${size * 0.7} T ${size} ${size * 0.7} L ${size} ${size} L 0 ${size} Z" fill="#1f4f2c" opacity="0.55"/>
  <text x="50%" y="${size * 0.84}" font-family="Georgia, serif" font-size="${fontSize}" font-weight="bold" fill="#ffffff" text-anchor="middle">IFS</text>
  <text x="50%" y="${size * 0.93}" font-family="Arial, sans-serif" font-size="${subFontSize}" fill="#cfe5d3" text-anchor="middle" letter-spacing="2">SLOVENIJA</text>
</svg>`;
}

async function main() {
  mkdirSync(PUBLIC_DIR, { recursive: true });

  for (const size of [192, 512]) {
    const svg = iconSvg(size);
    const svgPath = join(PUBLIC_DIR, `icon-${size}.src.svg`);
    writeFileSync(svgPath, svg, "utf8");
    const pngPath = join(PUBLIC_DIR, `icon-${size}.png`);
    await sharp(Buffer.from(svg)).png().toFile(pngPath);
    console.log(`✓ Generirano ${pngPath} (${size}x${size})`);
  }

  // Apple touch icon (samo 192 je dovolj za večino naprav).
  console.log("✓ Apple touch icon bo uporabil /icon-192.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
