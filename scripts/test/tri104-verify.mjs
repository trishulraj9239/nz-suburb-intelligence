/** TRI-104 Results tab + TRI-89 intent-driven map choreography. */
import { chromium } from "playwright-core";
const fail = (m) => { throw new Error(`FAIL: ${m}`); };
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
const askBox = page.getByLabel("Ask about Auckland suburbs");

// ---- rank → Results tab auto-selects ---------------------------------------
await askBox.fill("Which 10 Auckland suburbs have the lowest median weekly rent?");
await askBox.press("Enter");
const table = page.locator("table");
for (let i = 0; i < 60; i++) { if (await table.count()) break; await page.waitForTimeout(500); }
if (!(await table.count())) fail("Results table never appeared for a rank answer");
const rows = await page.locator("tbody tr").count();
const header = await page.locator("aside").last().innerText();
console.log(`Results rows: ${rows}`);
if (rows < 5) fail(`expected a ranked list, got ${rows} rows`);
if (!/ranked by/.test(header)) fail("framing header missing");
console.log(`framing: ${header.split("\n").find(l => /ranked by/.test(l))?.slice(0,90)} ✓`);
if (!/Results/.test(header)) fail("Results tab not present");
await page.screenshot({ path: "shots/tri104-results.png" });

// ---- hover a row highlights that SA2 on the map ----------------------------
await page.locator("tbody tr").nth(2).hover();
await page.waitForTimeout(400);
const hoverFilter = await page.evaluate(() => {
  const m = window.__nzsiMap;
  return m ? JSON.stringify(m.getFilter("sa2-hover-line")) : null;
});
console.log(`hover filter: ${hoverFilter}`);
if (!hoverFilter || /,""\]$/.test(hoverFilter)) fail("row hover did not highlight the map");

// ---- rank must NOT select a suburb (map stays at coverage) -----------------
const profileTabText = await page.locator("aside").last().innerText();
if (/Comparing · /.test(profileTabText)) fail("rank unexpectedly selected a suburb");
console.log("rank left the map unselected ✓");

// ---- lookup → selects its single suburb ------------------------------------
await askBox.fill("What is the median household income in Ponsonby West?");
await askBox.press("Enter");
let sel = null;
for (let i = 0; i < 60; i++) {
  sel = await page.evaluate(() => {
    const m = window.__nzsiMap;
    const f = m && m.getFilter("sa2-selected-fill");
    return f ? f[2] : null;
  });
  if (sel) break;
  await page.waitForTimeout(500);
}
console.log(`lookup selected sa2: ${sel}`);
if (!sel) fail("lookup answer did not select its suburb");
await page.screenshot({ path: "shots/tri104-lookup-select.png" });

console.log("\nPASS — Results tab + intent choreography.");
await browser.close();
