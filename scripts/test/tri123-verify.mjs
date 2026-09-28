/** TRI-123 — address tier 2: hazard point checks + drive times from the pinned address. */
import { chromium } from "playwright-core";
import { viewport } from "./_viewport.mjs";
const fail = (m) => { throw new Error("FAIL: " + m); };
const b = await chromium.launch({ channel: "msedge", headless: true });
const page = await b.newPage({ viewport: viewport() });
await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

await page.getByLabel("Find a suburb or address").fill("42 Ponsonby Rd");
const hit = page.getByTestId("address-hit").first();
await hit.waitFor({ state: "visible", timeout: 15000 });
await hit.click();

const facts = page.getByTestId("address-facts");
await facts.waitFor({ state: "visible", timeout: 15000 });
// Hazard lines arrive after five live council queries.
for (let i = 0; i < 30; i++) { if ((await page.getByTestId("point-hazard").count()) >= 5) break; await page.waitForTimeout(1000); }
const lines = await page.getByTestId("point-hazard").allInnerTexts();
console.log("point hazards:", lines.map((l) => l.replace(/\s+/g, " ")).join(" | "));
if (lines.length < 5) fail("expected five point-hazard lines");
if (!lines.some((l) => /Flood plain/.test(l) && /inside|outside/.test(l))) fail("flood plain line should say inside or outside");
if (!lines.some((l) => /Overland flow/.test(l) && /within 20 m|none within 20 m/.test(l))) fail("overland flow line should be a 20 m check");
const factsText = await facts.innerText();
if (!/not a property assessment/.test(factsText)) fail("caveat missing from the address facts block");
if (/\b(safe|risky|low risk|high risk)\b/i.test(factsText)) fail("verdict language in the address facts block");
console.log("hazard point checks rendered with caveat, no verdict ✓");

// Drive rows from the pin (CBD + airport at least), resolved to minutes or an honest straight line.
for (let i = 0; i < 40; i++) {
  const t = (await page.getByTestId("address-drive").allInnerTexts()).join(" ");
  if (/Auckland Airport/.test(t) && !/…/.test(t)) break;
  await page.waitForTimeout(1000);
}
const drives = await page.getByTestId("address-drive").allInnerTexts();
console.log("drive rows:", drives.map((d) => d.replace(/\s+/g, " ")).join(" | "));
if (drives.length < 2) fail("expected drive rows to the CBD and the airport");
if (!drives.some((d) => /Auckland Airport/.test(d) && /(\d+ min|straight line)/.test(d))) fail("airport drive row should resolve to minutes or a labelled straight line");
console.log("drive times from the address ✓");
await page.screenshot({ path: "shots/tri123-address-facts.png", fullPage: true });

// Picking a suburb by name removes the block.
await page.getByLabel("Find a suburb or address").fill("Takapuna Central");
await page.locator("li button", { hasText: /^Takapuna Central/ }).first().click();
await page.waitForTimeout(1200);
if (await page.getByTestId("address-facts").count()) fail("address facts should disappear when a suburb is selected by name");
console.log("address facts cleared on suburb selection ✓");

console.log("\nPASS — address tier 2");
await b.close();
