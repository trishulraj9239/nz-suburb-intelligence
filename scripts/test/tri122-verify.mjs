/** TRI-122 — address search tier 1: an address resolves to its SA2 profile with
 *  a pin and an honesty banner; an out-of-region address gets an honest no-match. */
import { chromium } from "playwright-core";
const fail = (m) => { throw new Error("FAIL: " + m); };
const b = await chromium.launch({ channel: "msedge", headless: true });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

const box = page.getByLabel("Find a suburb or address");
await box.fill("42 Ponsonby Rd");
const hit = page.getByTestId("address-hit").first();
await hit.waitFor({ state: "visible", timeout: 15000 });
const hitText = await hit.innerText();
console.log("address hit:", hitText.replace(/\s+/g, " ").slice(0, 80));
if (!/Ponsonby Road/i.test(hitText)) fail("expected a Ponsonby Road hit");
if (!/→/.test(hitText)) fail("hit should name the SA2 it resolves to");
await hit.click();

const banner = page.getByTestId("address-banner");
await banner.waitFor({ state: "visible", timeout: 15000 });
const bannerText = await banner.innerText();
console.log("banner:", bannerText.replace(/\s+/g, " "));
if (!/sits in/.test(bannerText) || !/describes the area, not the property/.test(bannerText)) fail("banner copy missing");
// The profile must be the SA2 the hit named (42 Ponsonby Road is in Grey Lynn East per LINZ —
// the street name is not the suburb, which is exactly why the arrow is shown).
const expectedSa2 = hitText.split("→")[1]?.trim();
const heading = await page.locator("h2").first().innerText();
if (!expectedSa2 || !heading.includes(expectedSa2)) fail(`profile heading should be "${expectedSa2}", got "${heading}"`);
if (!bannerText.includes(expectedSa2)) fail("banner should name the same SA2 as the hit");
console.log("profile opened for", heading, "✓");

// The pin is on the map (dev-only handle exposed by map-container). serialize()
// returns the live GeoJSON; give the 900 ms fly-to time to land first.
await page.waitForTimeout(1500);
const pinFeatures = () => page.evaluate(() => window.__nzsiMap?.getSource("address-pin")?.serialize?.()?.data?.features?.length ?? -1);
const pinCount = await pinFeatures();
console.log("pin features:", pinCount);
if (pinCount !== 1) fail("expected exactly one pin feature on the map");
const zoom = await page.evaluate(() => window.__nzsiMap?.getZoom());
console.log("zoom after fly-to:", zoom?.toFixed(1));
if (!(zoom >= 14)) fail("expected a street-level zoom after picking an address");
await page.screenshot({ path: "shots/tri122-pin.png" });

// Selecting a suburb by name drops the pin.
await box.fill("Takapuna Central");
await page.locator("li button", { hasText: /^Takapuna Central/ }).first().click();
await page.waitForTimeout(1200);
if (await page.getByTestId("address-banner").count()) fail("banner should disappear when a different suburb is selected");
const pinAfter = await pinFeatures();
if (pinAfter !== 0) fail("pin should be cleared when a suburb is selected by name");
console.log("pin + banner cleared on suburb selection ✓");

// Honest no-match for an out-of-region address.
await box.fill("1 Lambton Quay Wellington");
const nomatch = page.getByTestId("address-nomatch");
await nomatch.waitFor({ state: "visible", timeout: 15000 });
console.log("no-match copy:", (await nomatch.innerText()).replace(/\s+/g, " ").slice(0, 100));
if (await page.getByTestId("address-hit").count()) fail("a Wellington address should not produce Auckland hits");
console.log("honest no-match for a non-Auckland address ✓");

console.log("\nPASS — address search tier 1");
await b.close();
