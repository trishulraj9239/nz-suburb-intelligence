/** TRI-100 — polish: "/" focuses the ask box (not from inside a field), the
 *  legend lists the quintile breaks and a hatch swatch, no-data suburbs carry
 *  the hatch layer, Compare exports a CSV with provenance columns, and map
 *  animations run at zero duration under prefers-reduced-motion. */
import { chromium } from "playwright-core";
import { viewport } from "./_viewport.mjs";
const BASE = (process.env.NZSI_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const fail = (m) => { throw new Error("FAIL: " + m); };
const b = await chromium.launch({ channel: process.env.PW_CHANNEL === undefined ? "msedge" : process.env.PW_CHANNEL || undefined, headless: true });
const ctx = await b.newContext({ viewport: viewport(), acceptDownloads: true });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

// 1. "/" focuses the ask box; inside a field it types normally.
await page.locator("body").click({ position: { x: 5, y: 400 } });
await page.keyboard.press("/");
await page.waitForTimeout(150);
if (!(await page.getByLabel("Ask about Auckland suburbs").evaluate((el) => el === document.activeElement))) fail("'/' did not focus the ask box");
const search = page.getByLabel("Find a suburb or address");
await search.fill("Po"); await search.press("/");
if ((await search.inputValue()) !== "Po/") fail("'/' inside a field must type a slash");
await search.fill("");
console.log("'/' shortcut ✓");

// 2. Legend breaks + hatch swatch + no-data layer (shading is on by default for the renter persona).
const breaks = page.getByTestId("legend-breaks").first();
await breaks.waitFor({ state: "visible", timeout: 15000 });
const parts = (await breaks.innerText()).split(" · ");
if (parts.length !== 4) fail(`expected 4 quintile breaks, got "${await breaks.innerText()}"`);
const hasLayer = await page.evaluate(() => { const m = window.__nzsiMap; return !!m && !!m.getLayer("sa2-nodata") && m.getLayoutProperty("sa2-nodata", "visibility") === "visible" && m.hasImage("nzsi-hatch"); });
if (!hasLayer) fail("no-data hatch layer missing or hidden while shading is on");
console.log(`legend breaks ${parts.join(" · ")} · hatch layer ✓`);

// 3. Compare export carries provenance.
await page.getByRole("button", { name: "Ponsonby West", exact: true }).first().click();
await page.waitForTimeout(1200);
await page.getByRole("button", { name: /^\+ Compare$/ }).first().click();
await search.fill("Takapuna Central"); await page.waitForTimeout(800); await search.press("ArrowDown"); await search.press("Enter"); await page.waitForTimeout(1500);
await page.locator("aside").last().getByRole("button", { name: /^\+ Compare$/ }).first().click();
await page.getByRole("tab", { name: /^Compare \(2\)$/ }).click();
await page.getByTestId("compare-export").waitFor({ state: "visible", timeout: 20000 });
const [download] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.getByTestId("compare-export").click()]);
const path = await download.path();
const csv = (await import("node:fs")).readFileSync(path, "utf8");
const header = csv.split(/\r?\n/)[0];
if (!/"metric","unit","Ponsonby West","Takapuna Central","Ponsonby West source","Ponsonby West as_of","Ponsonby West confidence"/.test(header)) fail(`csv header: ${header}`);
if (!/Median rent \(new tenancies\)/.test(csv) || !/Tenancy bond data|MBIE/.test(csv)) fail("csv lacks the rent row or its source");
if (!/Area-level model — not a property assessment/.test(csv)) fail("csv lacks the hazard caveat row");
if (/persona|budget/i.test(csv)) fail("csv must not carry preferences");
console.log(`compare CSV ${download.suggestedFilename()} with provenance columns ✓`);

// 4. Reduced motion → zero-duration map moves (probe the helper through the page).
const rm = await b.newContext({ viewport: viewport(), reducedMotion: "reduce" });
const p2 = await rm.newPage();
await p2.goto(BASE, { waitUntil: "networkidle" });
await p2.waitForTimeout(2000);
const zeroed = await p2.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
if (!zeroed) fail("reduced-motion emulation not active");
const t0 = Date.now();
await p2.getByRole("button", { name: "Ponsonby West", exact: true }).first().click();
// With duration 0 the map is idle again almost immediately; with 900 ms it is still moving.
await p2.waitForTimeout(120);
const moving = await p2.evaluate(() => { const m = window.__nzsiMap; return m ? m.isMoving() : null; });
if (moving === null) fail("map handle missing");
if (moving) fail(`map still animating ${Date.now() - t0}ms after select under reduced motion`);
console.log("reduced motion: select does not animate the map ✓");
await rm.close();
await page.screenshot({ path: "shots/tri100-polish.png" });
console.log("\nPASS — polish");
await b.close();
