/**
 * TRI-83 / TRI-84 verification — one brain, one body, two frames.
 *
 *  1. Desktop: the answer renders in the full-width strip under the top bar
 *     (NOT in the right panel), with ranked pills and the "How this was
 *     matched" disclosure.
 *  2. Pills toggle compare.
 *  3. Crossing the lg breakpoint mid-stream hands the SAME in-flight answer to
 *     the mobile sheet tab — one /api/ask call, nothing aborted.
 *  4. A compare-intent answer auto-selects the Compare tab (the pinned-but-
 *     never-shown bug).
 *
 * Run: node scripts/test/tri83-verify.mjs   (dev server on :3000)
 */
import { chromium } from "playwright-core";

const BASE = "http://localhost:3000";
const fail = (m) => { throw new Error(`FAIL: ${m}`); };

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const askCalls = [];
page.on("request", (r) => { if (r.url().includes("/api/ask")) askCalls.push(r.method()); });

await page.goto(BASE, { waitUntil: "networkidle" });

const strip = page.locator('section[aria-label="Answer"]');
if (await strip.count()) fail("strip visible before any question (browse mode should be full-bleed)");
console.log("browse mode: no strip ✓");

// ---- 1. desktop rank question ---------------------------------------------
const box = page.getByLabel("Ask about Auckland suburbs");
await box.fill("Cheapest rent near Takapuna?");
await box.press("Enter");
await strip.waitFor({ state: "visible", timeout: 20000 });

for (let i = 0; i < 60; i++) {
  const t = await strip.innerText();
  if (!t.includes("Thinking…") && t.length > 250) break;
  await page.waitForTimeout(1000);
}
const stripText = await strip.innerText();
console.log(`strip text: ${stripText.length} chars`);
if (stripText.includes("Thinking…")) fail("stream never started");

// strip must sit ABOVE the map/panel row, full width
const stripBox = await strip.boundingBox();
const mapBox = await page.locator("main").boundingBox();
if (stripBox.y > mapBox.y) fail("strip is not above the map row");
if (stripBox.width < 1400) fail(`strip not full width (${stripBox.width})`);
console.log(`strip geometry: y=${Math.round(stripBox.y)} w=${Math.round(stripBox.width)} ✓`);

// the right panel must NOT contain an answer any more
const panelText = await page.locator("aside").last().innerText();
if (/Sources:/.test(panelText)) fail("answer still rendering inside the right panel");
console.log("right panel no longer holds the answer ✓");

// ---- 2. pills + disclosure -------------------------------------------------
const pills = strip.locator("button", { hasText: /^\+ Compare$|^✓ Comparing$/ });
const pillCount = await pills.count();
console.log(`result pills: ${pillCount}`);
if (pillCount < 2) fail("expected ranked result pills");

await page.screenshot({ path: "shots/tri83-desktop-strip.png" });

const howBtn = strip.getByRole("button", { name: /How this was matched/ });
await howBtn.click();
await page.waitForTimeout(500);
const disclosure = await strip.innerText();
console.log(`--- disclosure ---\n${disclosure.slice(-400)}\n---`);
if (!/Read as/i.test(disclosure)) fail('"How this was matched" did not expand');
console.log('"How this was matched" expands ✓');
await page.screenshot({ path: "shots/tri83-how-matched.png" });
await howBtn.click();

// pill toggles compare
const before = await page.locator("button", { hasText: /^✓ Comparing$/ }).count();
await pills.first().click();
await page.waitForTimeout(400);
const after = await page.locator("button", { hasText: /^✓ Comparing$/ }).count();
if (after === before) fail("pill did not toggle compare");
console.log(`pill compare toggle: ${before} → ${after} ✓`);

// ---- 3. breakpoint crossing mid-stream ------------------------------------
askCalls.length = 0;
await box.fill("Compare Ponsonby West and Takapuna Central");
await box.press("Enter");
await page.waitForTimeout(1500); // let the stream start

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(500);

if (await page.locator('section[aria-label="Answer"]').count())
  fail("desktop strip still mounted below lg — both frames co-mounted");
console.log("strip unmounted below lg ✓");

const answerTab = page.getByRole("button", { name: "Answer", exact: true });
if (!(await answerTab.count())) fail("mobile Answer tab missing");

// A compare question lands on the Compare tab by design (intent auto-tab), so
// select Answer explicitly to prove the in-flight stream survived the crossing.
await page.waitForTimeout(6000);
await answerTab.click();
await page.waitForTimeout(400);
const sheetText = await page.locator("aside").last().innerText();
if (!sheetText.includes("Sources:")) fail("answer did not continue in the mobile sheet");
console.log(`mobile sheet answer: ${sheetText.length} chars ✓`);
console.log(`/api/ask calls across the crossing: ${askCalls.length}`);
if (askCalls.length !== 1) fail(`expected 1 /api/ask call, saw ${askCalls.length}`);

await page.screenshot({ path: "shots/tri83-mobile-tab.png" });

// ---- 4. compare intent auto-selects the Compare tab ------------------------
if (!/Compare \(2\)/.test(sheetText)) fail("compare tab not offered after a compare answer");
console.log("compare tab offered on mobile ✓");
// Back to desktop and ask a FRESH compare question — the tab must select
// itself with no clicking (this is the pinned-but-never-shown bug fix).
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(600);
await box.fill("Compare Herne Bay and Ponsonby East");
await box.press("Enter");
// ComparePanel is the only view with per-column "Remove X from comparison".
const removeBtns = page.getByRole("button", { name: /Remove .* from comparison/ });
for (let i = 0; i < 40; i++) {
  if ((await removeBtns.count()) >= 2) break;
  await page.waitForTimeout(500);
}
const cols = await removeBtns.count();
console.log(`compare columns rendered without any click: ${cols}`);
if (cols < 2) fail("compare intent did not auto-select the Compare tab on desktop");
console.log("compare intent auto-selects the Compare tab ✓");
await page.screenshot({ path: "shots/tri83-compare-autotab.png" });

console.log("\nPASS — strip + mobile tab share one stream and one body.");
await browser.close();
