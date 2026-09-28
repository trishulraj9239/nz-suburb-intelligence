/** TRI-127 — built form on the rating unit: count, roof footprint, site coverage,
 *  capture years, aerial thumbnail with an imagery caption. */
import { chromium } from "playwright-core";
const fail = (m) => { throw new Error("FAIL: " + m); };
const b = await chromium.launch({ channel: "msedge", headless: true });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

await page.getByLabel("Find a suburb or address").fill("42 Ponsonby Rd");
const hit = page.getByTestId("address-hit").first();
await hit.waitFor({ state: "visible", timeout: 15000 });
await hit.click();

const block = page.getByTestId("built-form");
await block.waitFor({ state: "visible", timeout: 30000 });
const text = (await block.innerText()).replace(/\s+/g, " ");
console.log("built form:", text.slice(0, 320));
const count = Number(await page.getByTestId("building-count").innerText());
if (!Number.isInteger(count) || count < 1) fail(`building count should be ≥ 1 for a Ponsonby Road section, got ${count}`);
if (!/Roof footprint \d[\d,]* m²/.test(text)) fail("roof footprint missing");
const cov = parseFloat(await page.getByTestId("site-coverage").innerText());
if (!(cov > 0 && cov <= 100)) fail(`site coverage out of range: ${cov}`);
if (!/not floor area, not a consent record/.test(text)) fail("honesty copy missing");
if (!/Outlines captured 20\d\d/.test(text)) fail("outline capture years missing");
if (!/est\./.test(text)) fail("confidence should be medium (est.)");
const thumb = page.getByTestId("aerial-thumb");
if (!(await thumb.count())) fail("aerial thumbnail missing");
const imgs = thumb.locator("img");
if ((await imgs.count()) !== 4) fail(`expected a 2×2 tile mosaic, got ${await imgs.count()} tiles`);
const ok = await imgs.evaluateAll((els) => els.map((e) => e.complete && e.naturalWidth > 0));
console.log("tiles loaded:", ok);
if (!ok.every(Boolean)) {
  await page.waitForTimeout(3000);
  const ok2 = await imgs.evaluateAll((els) => els.map((e) => e.complete && e.naturalWidth > 0));
  if (!ok2.every(Boolean)) fail("aerial tiles did not load");
}
const caption = (await thumb.locator("figcaption").innerText()).replace(/\s+/g, " ");
console.log("caption:", caption);
if (!/LINZ aerial basemap/.test(caption) || !/CC BY 4\.0/.test(caption)) fail("thumbnail caption must attribute the LINZ basemap");
if (!/\(20\d\d(-20\d\d)?\)|imagery date not reported/.test(caption)) fail("thumbnail caption must carry the imagery years (or say they are not reported)");
const geomaps = block.locator("a", { hasText: "GeoMaps" });
if (!(await geomaps.count())) fail("GeoMaps link missing");
console.log(`count ${count}, coverage ${cov}% — roof outlines, capture years, imagery-dated thumbnail ✓`);
await page.screenshot({ path: "shots/tri127-built-form.png", fullPage: true });

console.log("\nPASS — built form at the address");
await b.close();
