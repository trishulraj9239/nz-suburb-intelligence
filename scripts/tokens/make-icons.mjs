/**
 * Render the app icons (TRI-145, Phase A) from an inline SVG using the same
 * headless browser the verify scripts use — no image dependency.
 *
 *   node scripts/tokens/make-icons.mjs   → public/icons/icon-192.png, icon-512.png, icon-512-maskable.png
 *
 * The mark: a harbour-coloured tile with a white "N" and a pin dot in amber —
 * the map pin the address search draws. Colours come from lib/tokens.ts.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { TOKENS } = await import(pathToFileURL(resolve(root, "lib/tokens.ts")).href);
const c = TOKENS.color.light;

const svg = (size, maskable) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="${maskable ? 0 : 22}" fill="${c.harbour}"/>
  <text x="${maskable ? 50 : 50}" y="${maskable ? 66 : 68}" text-anchor="middle" font-family="Space Grotesk, Arial, sans-serif" font-weight="700" font-size="${maskable ? 46 : 56}" fill="${c.surface}">N</text>
  <circle cx="${maskable ? 68 : 72}" cy="${maskable ? 34 : 30}" r="${maskable ? 6 : 7}" fill="${TOKENS.color.light.amber}" stroke="${c.surface}" stroke-width="2.5"/>
</svg>`;

mkdirSync(resolve(root, "public/icons"), { recursive: true });
const b = await chromium.launch({ channel: process.env.PW_CHANNEL || "msedge", headless: true });
for (const [name, size, maskable] of [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-512-maskable.png", 512, true],
]) {
  const page = await b.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(size, maskable)}</body></html>`);
  await page.screenshot({ path: resolve(root, "public/icons", name), omitBackground: !maskable });
  await page.close();
  console.log("wrote public/icons/" + name);
}
await b.close();
