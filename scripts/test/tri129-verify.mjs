/** TRI-129 — extended hazards at the pin: thirteen council layers, record detail
 *  on hits, susceptibility wording, HAIL gap + map links; Mission Bay via API. */
import { chromium } from "playwright-core";
const fail = (m) => { throw new Error("FAIL: " + m); };

// API first: a coastal point with real hits.
const api = await (await fetch("http://localhost:3000/api/point-hazards?lng=174.8318&lat=-36.8489")).json();
const by = Object.fromEntries(api.layers.map((l) => [l.key, l]));
console.log("Mission Bay layers:", api.layers.map((l) => `${l.key}=${l.status}`).join(", "));
if (api.layers.length !== 13) fail(`expected 13 layers, got ${api.layers.length}`);
if (by.flood_prone.status !== "inside" || !/ponding depth \d+\.\d+ m/.test(by.flood_prone.detail ?? "")) fail(`Mission Bay flood prone should be inside with a depth, got ${by.flood_prone.status} / ${by.flood_prone.detail}`);
if (!/^(Yellow|Orange|Red)$/.test(by.tsunami.status)) fail(`Mission Bay tsunami zone should be a colour, got ${by.tsunami.status}`);
// The two landslide services stall now and then; an honest "unavailable" on
// one is acceptable, but at least one must return a class with the wording.
const slides = [by.landslide_shallow, by.landslide_large].filter((l) => l.status !== "unavailable");
if (!slides.length) fail("both landslide services unavailable — rerun");
for (const l of slides) {
  if (!/prone to (shallow|large-scale) landslides/.test(l.detail ?? "")) fail(`${l.key} lacks the susceptibility wording: ${l.detail}`);
  if (!/susceptibility, not occurrence/.test(l.detail ?? "")) fail(`${l.key} wording must say susceptibility, not occurrence`);
}
if (slides.length < 2) console.log("note: one landslide service reported unavailable this run (shown as not checked)");
if (/\brisk\b/i.test(JSON.stringify(api.layers))) fail("the word 'risk' must not appear in hazard rows");
for (const l of api.layers) if (l.status !== "unavailable" && !/^\d{4}$/.test(l.vintage)) fail(`${l.key} vintage should be a year, got ${l.vintage}`);
console.log(`Mission Bay: flood prone ${by.flood_prone.detail}; tsunami ${by.tsunami.status}; edited ${by.flood_prone.edited} ✓`);

const b = await chromium.launch({ channel: "msedge", headless: true });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.getByLabel("Find a suburb or address").fill("42 Ponsonby Rd");
const hit = page.getByTestId("address-hit").first();
await hit.waitFor({ state: "visible", timeout: 15000 });
await hit.click();

const rows = page.getByTestId("point-hazard");
// Fast phase paints first; the shallow-landslide row reads "checking…" until
// the ~20 s slow phase lands. Wait for both.
await rows.first().waitFor({ state: "visible", timeout: 30000 });
const pendingText = (await page.getByTestId("point-hazard").allInnerTexts()).join(" ");
console.log("fast phase painted; shallow row pending:", /checking/.test(pendingText));
await page.waitForFunction(
  () => ![...document.querySelectorAll("[data-testid=point-hazard]")].some((e) => /checking/.test(e.textContent ?? "")),
  null,
  { timeout: 60000 },
);
await page.waitForTimeout(300);
const n = await rows.count();
console.log("hazard rows:", n);
if (n !== 13) fail(`expected 13 hazard rows, got ${n}`);
let sawLandslide = false;
for (let i = 0; i < n; i++) {
  const text = (await rows.nth(i).innerText()).replace(/\s+/g, " ");
  if (/undefined|null|NaN/.test(text)) fail(`row ${i} leaks a raw value: ${text}`);
  if (/landslide/i.test(text) && !/unavailable/.test(text)) {
    sawLandslide = true;
    if (!/(Very Low|Low|Moderate|High|Very High)/.test(text)) fail(`landslide row has no class: ${text}`);
    if (!/prone to/.test(text)) fail(`landslide row lacks the susceptibility wording: ${text}`);
    if (/\brisk\b/i.test(text)) fail(`landslide row says risk: ${text}`);
  }
  if (/Tsunami/.test(text) && !/outside|unavailable/.test(text)) fail(`Ponsonby Road tsunami row should read outside, got: ${text}`);
  console.log(" ·", text.slice(0, 130));
}
if (!sawLandslide) fail("no landslide rows rendered");
const links = page.getByTestId("hazard-map-links");
const lt = (await links.innerText()).replace(/\s+/g, " ");
if (!/HAIL/.test(lt)) fail("HAIL gap statement missing");
if (!(await links.locator("a", { hasText: "Flood Viewer" }).count())) fail("Flood Viewer link missing");
if (!(await links.locator("a", { hasText: "GeoMaps" }).count())) fail("GeoMaps link missing");
const section = (await page.getByTestId("address-facts").innerText()).replace(/\s+/g, " ");
if ((section.match(/Area-level model/g) ?? []).length < 2) fail("verbatim caveat should appear at the top and the foot of the models group");
if (/\b(score|\/10|overall risk)\b/i.test(section)) fail("composite/score language crept in");
console.log("thirteen layers, susceptibility wording, HAIL gap, Flood Viewer + GeoMaps links, caveat twice ✓");
await page.screenshot({ path: "shots/tri129-hazards.png", fullPage: true });

console.log("\nPASS — extended hazards at the address");
await b.close();
