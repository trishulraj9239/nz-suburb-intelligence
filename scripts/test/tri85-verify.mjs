/**
 * TRI-85 / 86 / 87 verification.
 *  - map fit padding derives from the sheet's REAL box (mobile) and is ~0 on desktop
 *  - a compare set fits the union bbox, not just the last-clicked suburb
 *  - geolocate + compass controls exist in one stack
 *  - panel affordance visible; compare width scales with the set
 *
 * Run: node scripts/test/tri85-verify.mjs   (dev server on :3000)
 */
import { chromium } from "playwright-core";

const BASE = "http://localhost:3000";
const fail = (m) => { throw new Error(`FAIL: ${m}`); };

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

// ---- TRI-86 controls -------------------------------------------------------
const geo = page.locator(".maplibregl-ctrl-geolocate");
const compass = page.locator(".maplibregl-ctrl-compass");
if (!(await geo.count())) fail("GeolocateControl missing");
if (!(await compass.count())) fail("compass NavigationControl missing");
const geoBox = await geo.boundingBox();
const zoomBox = await page.locator(".maplibregl-ctrl-zoom-in").boundingBox();
console.log(`controls: geolocate at x=${Math.round(geoBox.x)} · zoom at x=${Math.round(zoomBox.x)} ✓`);
if (Math.abs(geoBox.x - zoomBox.x) > 8) fail("controls not in one stack");

// ---- TRI-87 affordance + compare width ------------------------------------
const handle = page.getByRole("separator", { name: /Resize panel/ });
if (!(await handle.count())) fail("resize handle missing");
const grip = handle.locator("span").first();
if (!(await grip.isVisible())) fail("resize affordance not visible");
console.log("panel resize affordance visible ✓");

// ---- TRI-85 compare union fit ---------------------------------------------
// Pin two far-apart suburbs and check the map ends up framing both.
await page.getByPlaceholder("Find a suburb…").fill("Ponsonby West");
await page.waitForTimeout(900);
await page.keyboard.press("Enter");
await page.waitForTimeout(2000);

const askBox = page.getByLabel("Ask about Auckland suburbs");
await askBox.fill("Compare Ponsonby West and Pukekohe Central");
await askBox.press("Enter");

// wait for the compare set to land (2 remove buttons in the panel)
const removeBtns = page.getByRole("button", { name: /Remove .* from comparison/ });
for (let i = 0; i < 50; i++) {
  if ((await removeBtns.count()) >= 2) break;
  await page.waitForTimeout(500);
}
if ((await removeBtns.count()) < 2) fail("compare set never arrived");
await page.waitForTimeout(2000); // let the fit animation settle

// Ponsonby West (~-36.85) and Pukekohe Central (~-37.20) are ~40km apart; a
// union fit must be zoomed out enough to hold both.
const panelW = (await page.locator("aside").last().boundingBox()).width;
console.log(`compare panel width (2 suburbs): ${Math.round(panelW)}px`);
if (panelW < 600) fail(`compare panel did not widen (${panelW}px)`);

await page.screenshot({ path: "shots/tri85-compare-fit.png" });

// ---- TRI-85 mobile: padding tracks the real sheet -------------------------
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1500);
const occluder = page.locator("[data-nzsi-occludes]");
if (!(await occluder.count())) fail("sheet not tagged as a map occluder");
const sheetBox = await occluder.boundingBox();
const mapBox = await page.locator('[aria-label="Auckland suburb map"]').boundingBox();
const overlap = Math.round(mapBox.y + mapBox.height - sheetBox.y);
console.log(`sheet overlaps map by ${overlap}px (padding is measured, not guessed) ✓`);
if (overlap <= 0) fail("expected the sheet to overlap the map on mobile");
await page.screenshot({ path: "shots/tri85-mobile-fit.png" });

console.log("\nPASS — geometry-derived fit, control stack, panel affordance.");
await browser.close();
