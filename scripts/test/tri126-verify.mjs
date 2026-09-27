/** TRI-126 — title & land from LINZ public records at the pinned address. */
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

const facts = page.getByTestId("property-facts");
await facts.waitFor({ state: "visible", timeout: 20000 });
const text = (await facts.innerText()).replace(/\s+/g, " ");
console.log("property facts:", text.slice(0, 300));
const titleType = await page.getByTestId("title-type").first().innerText();
if (!/Freehold|Cross lease|Unit Title|Leasehold/.test(titleType)) fail("title type missing, got " + titleType);
if (!/m²/.test(text)) fail("rating unit land area missing");
if (!/Legal description/.test(text)) fail("legal description missing");
if (!/Title \d+/.test(text)) fail("title number missing");
if (!/Ownership is not public data/.test(text)) fail("ownership disclaimer missing");
if (/\$|valu(e|ation)\s*\d|worth/i.test(text)) fail("a price or valuation crept into the land-record block");
console.log("title & land rendered from LINZ, with the non-valuation / no-ownership copy ✓");
await page.screenshot({ path: "shots/tri126-title-land.png", fullPage: true });

console.log("\nPASS — address title & land");
await b.close();
