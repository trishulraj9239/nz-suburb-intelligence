/** TRI-128 — Unitary Plan overlays at the pin: one row per overlay, decoded
 *  council names on hits, chapter link, descriptive wording only. */
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

const block = page.getByTestId("plan-overlays");
await block.waitFor({ state: "visible", timeout: 30000 });
if (!(await page.getByTestId("epistemic-plan").count())) fail("'Council plan records at this point' header missing");
const rows = page.getByTestId("overlay-row");
const n = await rows.count();
console.log("overlay rows:", n);
if (n !== 10) fail(`expected 10 overlay rows, got ${n}`);
const STATUS = /\b(inside|on or near the boundary|outside|within 30 m|none within 30 m|unavailable)\b/;
// A hit is inside / near / within — "none within 30 m" and "outside" are misses.
const HIT = /(^|\s)(inside|on or near the boundary)\b|(?<!none\s)within 30 m/;
let hits = 0;
let unavailable = 0;
for (let i = 0; i < n; i++) {
  const text = (await rows.nth(i).innerText()).replace(/\s+/g, " ");
  if (/undefined|null|NaN/.test(text)) fail(`row ${i} leaks a raw value: ${text}`);
  if (!STATUS.test(text)) fail(`row ${i} has no status word: ${text}`);
  if (/unavailable/.test(text)) unavailable++;
  if (HIT.test(text)) {
    hits++;
    if (!(await rows.nth(i).locator("a").count())) fail(`hit row ${i} has no chapter link: ${text}`);
    if (/\b\d{1,2}\b\s*$/.test(text)) fail(`hit row ${i} shows an undecoded code: ${text}`);
  }
  console.log(" ·", text.slice(0, 140));
}
if (unavailable) console.log(`note: ${unavailable} council service(s) unavailable this run — reported as not checked`);
const sc = (await rows.filter({ hasText: "Special Character" }).first().innerText()).replace(/\s+/g, " ");
if (/unavailable/.test(sc)) {
  console.log("special character service unavailable — honest 'not checked' shown; hit assertions skipped");
} else {
  if (!/(^|\s)inside\b/.test(sc)) fail(`42 Ponsonby Road should sit inside the Special Character Areas Overlay (Business Ponsonby); got: ${sc}`);
  if (!/Ponsonby/.test(sc.replace(/^.*?inside/, ""))) fail(`the special character hit should carry the council's decoded name, got: ${sc}`);
  if (hits < 1) fail("expected at least one overlay hit at 42 Ponsonby Road");
}
const all = (await block.innerText()).replace(/\s+/g, " ");
if (!/descriptive only/.test(all)) fail("descriptive-only note missing");
if (/\b(limits your|you cannot|not allowed|should)\b/i.test(all)) fail("advice language crept into the overlays block");
const chip = block.locator("[title^='Confidence:']").first();
await chip.waitFor({ state: "attached", timeout: 5000 });
if (!/Exact/.test(await chip.getAttribute("title"))) fail("operative overlays should carry high confidence");
console.log(`${hits} overlay hit(s) at the pin, decoded names, chapter links, high-confidence chip ✓`);
await page.screenshot({ path: "shots/tri128-overlays.png", fullPage: true });

console.log("\nPASS — plan overlays at the address");
await b.close();
