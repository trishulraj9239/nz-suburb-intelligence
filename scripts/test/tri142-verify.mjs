/** TRI-142 — two pins inside ten seconds must not starve the point lookups:
 *  no "not checked" row in either "This property" panel, and zero 429s on
 *  the point routes (the metered geocode/commute bucket is unchanged). */
import { chromium } from "playwright-core";
import { viewport } from "./_viewport.mjs";
const fail = (m) => { throw new Error("FAIL: " + m); };
const b = await chromium.launch({ channel: process.env.PW_CHANNEL || "msedge", headless: true });
const page = await b.newPage({ viewport: viewport() });
const statuses = [];
page.on("response", (r) => { if (/\/api\/(point-hazards|property-facts|built-form|point-overlays|block-stats|nearby|geocode|commute)/.test(r.url())) statuses.push({ url: r.url().replace(/\?.*/, "").replace(/.*\/api\//, ""), status: r.status() }); });
await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

async function pinAddress(q) {
  const box = page.getByLabel("Find a suburb or address");
  await box.fill("");
  await box.fill(q);
  const hit = page.getByTestId("address-hit").first();
  await hit.waitFor({ state: "visible", timeout: 15000 });
  await hit.click();
}

const t0 = Date.now();
await pinAddress("42 Ponsonby Rd");
await page.getByTestId("address-banner").waitFor({ state: "visible", timeout: 15000 });
await pinAddress("1/22 Cardiff Road Pakuranga");
await page.getByTestId("address-banner").waitFor({ state: "visible", timeout: 15000 });
const gap = Math.round((Date.now() - t0) / 1000);
if (gap > 10) fail(`the two pins took ${gap}s — the test must place them within 10 s`);
console.log(`two pins placed ${gap}s apart ✓`);

// Both panels side by side on Compare, every lookup given time to land.
await page.getByRole("tab", { name: /^Compare \(2\)$/ }).click();
const facts = page.getByTestId("compare-address-facts").locator("[data-testid=address-facts]");
await facts.first().waitFor({ state: "visible", timeout: 20000 });
for (let i = 0; i < 60; i++) {
  const t = (await facts.allInnerTexts()).join("\n");
  if (!/Reading|Checking|Measuring/.test(t.replace(/checking… \(slow council layer\)/g, ""))) break;
  await page.waitForTimeout(1000);
}
await page.waitForTimeout(25000); // the slow landslide layer
const texts = await facts.allInnerTexts();
if (texts.length !== 2) fail(`expected two property panels, got ${texts.length}`);
for (const [i, t] of texts.entries()) {
  const notChecked = (t.match(/not checked/g) || []).length;
  if (notChecked) fail(`panel ${i + 1} has ${notChecked} "not checked" row(s) — lookups were starved:\n${t.split("\n").filter((l) => /not checked/.test(l)).join("\n")}`);
}
console.log("no 'not checked' rows in either panel ✓");

const point429 = statuses.filter((s) => s.status === 429 && !/geocode|commute/.test(s.url));
const any429 = statuses.filter((s) => s.status === 429);
console.log(`point-route responses: ${statuses.filter((s) => !/geocode|commute/.test(s.url)).length}, 429s on point routes: ${point429.length}, 429s overall: ${any429.length}`);
if (point429.length) fail(`point routes returned 429: ${JSON.stringify(point429)}`);
await page.screenshot({ path: "shots/tri142-two-pins.png", fullPage: true });
console.log("\nPASS — two pins, two buckets, no starvation");
await b.close();
