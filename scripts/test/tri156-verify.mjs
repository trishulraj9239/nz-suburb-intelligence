/** TRI-156 — parcel-buffer hazard test: every point-hazard row also reports
 *  the whole LINZ rating unit against the layer ("touches" / "clear of the
 *  rating unit"), with its own chip and the note that says what that does
 *  and does not mean. The point rows stay exactly as before. */
import { chromium } from "playwright-core";
import { viewport } from "./_viewport.mjs";
const BASE = (process.env.NZSI_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const fail = (m) => { throw new Error("FAIL: " + m); };
const b = await chromium.launch({ channel: process.env.PW_CHANNEL === undefined ? "msedge" : process.env.PW_CHANNEL || undefined, headless: true });
const page = await b.newPage({ viewport: viewport() });
const codes = [];
page.on("response", (r) => { if (/\/api\/point-hazards/.test(r.url())) codes.push({ q: r.url().replace(/.*\?/, ""), s: r.status() }); });
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
const box = page.getByLabel("Find a suburb or address");
await box.fill("42 Ponsonby Rd");
const hit = page.getByTestId("address-hit").first();
await hit.waitFor({ state: "visible", timeout: 15000 });
await hit.click();
await page.getByTestId("address-banner").waitFor({ state: "visible", timeout: 15000 });
const facts = page.getByTestId("address-facts");
for (let i = 0; i < 60; i++) {
  const n = await facts.locator("[data-testid=point-hazard-unit]:not([data-status=pending])").count();
  if (n >= 8) break;
  await page.waitForTimeout(1000);
}
const rows = await facts.locator("[data-testid=point-hazard]").count();
const unitLines = await facts.locator("[data-testid=point-hazard-unit]").evaluateAll((els) => els.map((e) => ({ status: e.getAttribute("data-status"), text: e.textContent.trim(), pills: e.querySelectorAll("[data-pill]").length })));
if (rows < 10) fail(`expected the point rows, got ${rows}`);
if (unitLines.length < 8) fail(`expected a rating-unit line on most rows, got ${unitLines.length}`);
for (const u of unitLines) {
  if (u.status === "pending") continue;
  if (u.pills !== 1) fail(`unit line without a pill: ${u.text}`);
  if (/\boutside\b|none within/.test(u.text)) fail(`point wording leaked into the unit line: ${u.text}`);
}
const tested = unitLines.filter((u) => /touches|clear of/.test(u.text)).length;
if (tested < 5) fail(`too few layers actually tested against the unit (${tested})`);
const text = await facts.innerText();
if (!/Rating-unit test: whether the council layer touches any part of the LINZ rating unit/.test(text)) fail("rating-unit note missing");
if (!/rating unit/.test(text) || !(await facts.locator("[title^='Confidence:']").count())) fail("rating-unit chip missing");
// The point rows are untouched: their own status words still appear.
if (!/\b(inside|outside|within 20 m|none within 20 m)\b/.test(text)) fail("point status words missing");
const unitCalls = codes.filter((c) => /geometry=unit/.test(c.q));
if (unitCalls.length !== 1) fail(`expected exactly one unit call, saw ${unitCalls.length}`);
if (codes.some((c) => c.s === 429)) fail("a point-hazards call was rate-limited");
console.log(`point rows ${rows} · unit lines ${unitLines.length} (${tested} tested: ${unitLines.filter((u) => /touches/.test(u.text)).length} touch, ${unitLines.filter((u) => /clear of/.test(u.text)).length} clear) · one unit call, no 429 ✓`);
await page.screenshot({ path: "shots/tri156-parcel-hazards.png", fullPage: true });
console.log("\nPASS — parcel-buffer hazard test");
await b.close();
