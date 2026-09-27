/** TRI-130 — this block (SA1) beside this suburb (SA2): Census 2023 + NZDep2023,
 *  suppression shown as "not published", no verdicts. */
import { chromium } from "playwright-core";
const fail = (m) => { throw new Error("FAIL: " + m); };

// API: the Ponsonby Road block.
const api = await (await fetch("http://localhost:3000/api/block-stats?lng=174.750912&lat=-36.858927")).json();
console.log("block:", JSON.stringify({ sa1: api.sa1_code, sa2: api.sa2_code, pop: api.population, age: api.median_age, rent: api.renting_pct, inc: api.median_household_income, dep: api.nzdep_decile, supp: api.suppressed }));
if (api.unavailable) fail(`block stats unavailable: ${api.unavailable}`);
if (!/^\d{7}$/.test(api.sa1_code ?? "")) fail(`sa1_code should be a 7-digit code, got ${api.sa1_code}`);
if (api.sa2_code !== "133500") fail(`the block should sit in Grey Lynn East (133500), got ${api.sa2_code}`);
if (!(api.population > 0 && api.population % 3 === 0)) fail(`population should be a positive base-3 rounded count, got ${api.population}`);
if (!(api.median_age > 15 && api.median_age < 70)) fail(`median age out of range: ${api.median_age}`);
if (!(api.renting_pct === null || (api.renting_pct >= 0 && api.renting_pct <= 100))) fail(`renting % out of range: ${api.renting_pct}`);
if (!(Number.isInteger(api.nzdep_decile) && api.nzdep_decile >= 1 && api.nzdep_decile <= 10)) fail(`NZDep decile out of range: ${api.nzdep_decile}`);
if (JSON.stringify(api).includes("-999") || JSON.stringify(api).includes("-997")) fail("a Stats NZ sentinel leaked into the response");
console.log(`API: SA1 ${api.sa1_code} in ${api.sa2_code}, ${api.population} people, NZDep ${api.nzdep_decile}, suppressed: ${api.suppressed.length} ✓`);

const b = await chromium.launch({ channel: "msedge", headless: true });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.getByLabel("Find a suburb or address").fill("42 Ponsonby Rd");
const hit = page.getByTestId("address-hit").first();
await hit.waitFor({ state: "visible", timeout: 15000 });
await hit.click();

const block = page.getByTestId("block-stats");
await block.waitFor({ state: "visible", timeout: 30000 });
if (!(await page.getByTestId("epistemic-block").count())) fail("'This block' group header missing");
const head = (await page.getByTestId("epistemic-block").innerText()).replace(/\s+/g, " ");
if (!/\d+ people counted/.test(head)) fail(`header should state the people counted in the block: ${head}`);
const rows = page.getByTestId("block-row");
const n = await rows.count();
console.log("block rows:", n);
if (n < 6) fail(`expected at least 6 block rows, got ${n}`);
let withSuburb = 0;
for (let i = 0; i < n; i++) {
  const text = (await rows.nth(i).innerText()).replace(/\s+/g, " ");
  if (/undefined|null|NaN|-99[789]/.test(text)) fail(`row ${i} leaks a raw value: ${text}`);
  const cells = await rows.nth(i).locator("[data-col]").allInnerTexts();
  if (cells.length !== 2) fail(`row ${i} should have a block cell and a suburb cell: ${text}`);
  if (/not published/.test(cells[0]) && /\d/.test(cells[0])) fail(`row ${i} shows a figure alongside 'not published': ${text}`);
  if (/\d/.test(cells[1]) && !/not held/.test(cells[1])) withSuburb++;
  console.log(" ·", text.slice(0, 120));
}
if (withSuburb < 4) fail(`expected the suburb column to be filled on at least 4 rows, got ${withSuburb}`);
const cols = (await block.innerText()).replace(/\s+/g, " ");
if (!/this block/i.test(cols) || !/this suburb/i.test(cols)) fail("both columns must be labelled 'this block' / 'this suburb'");
if (!/random-rounded/.test(cols)) fail("random-rounding note missing");
if (/\b(better|worse|good|bad|safe|desirable)\b/i.test(cols)) fail("verdict language crept into the block stats");
const chip = block.locator("[title^='Confidence:']").first();
await chip.waitFor({ state: "attached", timeout: 5000 });
console.log("block beside suburb, suppression honest, no verdicts ✓");
await page.screenshot({ path: "shots/tri130-block.png", fullPage: true });

console.log("\nPASS — this block beside this suburb");
await b.close();
