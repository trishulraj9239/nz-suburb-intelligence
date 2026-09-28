/** TRI-97 — URL state: the suburb, compare set and question live in the URL
 *  (replaceState during interaction), a pasted link restores them with exactly
 *  ONE /api/ask, preferences never leak into the URL, Share copies the link,
 *  Home clears it. */
import { chromium } from "playwright-core";
const BASE = (process.env.NZSI_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const fail = (m) => { throw new Error("FAIL: " + m); };
const b = await chromium.launch({ channel: process.env.PW_CHANNEL === undefined ? "msedge" : process.env.PW_CHANNEL || undefined, headless: true });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
// A reader with preferences set — none of these may ever reach the URL.
await ctx.addInitScript(() => {
  localStorage.setItem("nzsi:persona", JSON.stringify("buyer"));
  localStorage.setItem("nzsi:budget", JSON.stringify(650));
});
const page = await ctx.newPage();
const asks = [];
page.on("request", (r) => { if (/\/api\/ask$/.test(r.url())) asks.push(r.url()); });

// 1. Interaction writes the URL (replaceState, no navigation).
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.getByRole("button", { name: "Ponsonby West", exact: true }).first().click();
await page.waitForTimeout(1500);
let search = await page.evaluate(() => location.search);
if (!/sa2=130400/.test(search)) fail(`selecting a suburb did not write sa2 (${search})`);
await page.getByRole("button", { name: /^\+ Compare$/ }).first().click();
const box = page.getByLabel("Find a suburb or address");
await box.fill("Takapuna Central"); await page.waitForTimeout(800); await box.press("ArrowDown"); await box.press("Enter"); await page.waitForTimeout(1500);
await page.locator("aside").last().getByRole("button", { name: /^\+ Compare$/ }).first().click(); await page.waitForTimeout(600);
search = await page.evaluate(() => location.search);
if (!/compare=130400,126801/.test(search)) fail(`compare set not in URL (${search})`);
if (/persona|budget|anchor|workplace|places/i.test(search)) fail(`a preference leaked into the URL: ${search}`);
console.log(`interaction writes the URL: ${search} ✓`);

// 2. Share copies the current link.
await page.getByTestId("share-link").first().click();
await page.waitForTimeout(300);
const copied = await page.evaluate(() => navigator.clipboard.readText());
if (copied !== (await page.evaluate(() => location.href))) fail(`Share copied "${copied}"`);
if (!/Link copied/.test(await page.getByTestId("share-link").first().innerText())) fail("Share did not confirm");
console.log("Share copies the link ✓");

// 3. Home clears it.
await page.getByTitle("Home — reset everything").first().click();
await page.waitForTimeout(800);
search = await page.evaluate(() => location.search);
if (search !== "") fail(`Home left state in the URL (${search})`);
console.log("Home clears the URL ✓");

// 4. A pasted link restores suburb + compare (no ask).
asks.length = 0;
await page.goto(`${BASE}/?sa2=126801&compare=130400,126801`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
const h2 = await page.locator("h2.font-display").first().innerText();
if (!/Takapuna Central/.test(h2)) fail(`restored profile is "${h2}"`);
const compareTab = page.getByRole("tab", { name: /^Compare \(2\)$/ });
if (!(await compareTab.count())) fail("compare set was not restored");
if (asks.length) fail("a link without q must not ask");
console.log("link restores suburb + compare without asking ✓");

// 5. A link with q asks exactly once and the URL keeps q.
asks.length = 0;
const q = "Which suburbs have the lowest median weekly rent?";
await page.goto(`${BASE}/?q=${encodeURIComponent(q)}`, { waitUntil: "networkidle" });
const strip = page.locator('section[aria-label="Answer"]');
await strip.waitFor({ state: "visible", timeout: 30000 });
for (let i = 0; i < 120; i++) { if (/Sources:/.test(await strip.innerText()) && (await strip.locator(".animate-pulse").count()) === 0) break; await page.waitForTimeout(1000); }
if (asks.length !== 1) fail(`restore made ${asks.length} /api/ask calls (want exactly 1)`);
const askVal = await page.evaluate(() => new URLSearchParams(location.search).get("q"));
if (askVal !== q) fail(`q not preserved in the URL: ${askVal}`);
if (!/Sources:/.test(await strip.innerText())) fail("restored question did not answer");
const finalSearch = await page.evaluate(() => location.search);
if (/persona|budget|anchor/i.test(finalSearch)) fail(`preference leaked after ask: ${finalSearch}`);
console.log(`link with q re-runs the question once (${asks.length} ask) ✓`);

// 6. Garbage is ignored, never crashes.
await page.goto(`${BASE}/?sa2=abc&compare=1,2,3,4,5&q=${"x".repeat(2000)}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
if (await page.locator("h2.font-display").count()) fail("an invalid sa2 selected something");
console.log("invalid params ignored ✓");

await page.screenshot({ path: "shots/tri97-url-state.png" });
console.log("\nPASS — URL state + share link");
await b.close();
