/** TRI-141 — shortlist UI: several pins, address-headed Compare columns,
 *  same-SA2 collapse note, per-address facts side by side. */
import { chromium } from "playwright-core";
import { BASE_URL, launchOptions, viewport } from "./_harness.mjs";
const fail = (m) => { throw new Error("FAIL: " + m); };
const b = await chromium.launch(launchOptions());
const page = await b.newPage({ viewport: viewport() });
await page.goto(BASE_URL, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

async function pinAddress(q) {
  const box = page.getByLabel("Find a suburb or address");
  await box.fill("");
  await box.fill(q);
  const hit = page.getByTestId("address-hit").first();
  await hit.waitFor({ state: "visible", timeout: 15000 });
  await hit.click();
  await page.waitForTimeout(1500);
}
const pinCount = () =>
  page.evaluate(() => {
    const m = window.__nzsiMap;
    const src = m?.getSource("address-pin");
    const d = src?.serialize?.().data;
    return d && typeof d === "object" ? d.features.length : -1;
  });

await pinAddress("42 Ponsonby Rd");
await page.getByTestId("address-banner").waitFor({ state: "visible", timeout: 15000 });
if ((await pinCount()) !== 1) fail(`expected 1 pin, got ${await pinCount()}`);
console.log("pin 1 placed ✓");

await pinAddress("1/22 Cardiff Road Pakuranga");
await page.waitForTimeout(1500);
const n2 = await pinCount();
if (n2 !== 2) fail(`expected 2 pins on the map, got ${n2}`);
const compareTab = page.getByRole("tab", { name: /^Compare \(2\)$/ });
await compareTab.waitFor({ state: "visible", timeout: 15000 });
await compareTab.click();
await page.waitForTimeout(2500);
const heads = page.getByTestId("compare-address-head");
await heads.first().waitFor({ state: "visible", timeout: 20000 });
const headTexts = (await heads.allInnerTexts()).map((t) => t.replace(/\s+/g, " "));
console.log("column heads:", headTexts);
const visibleHeads = headTexts.filter((t) => /Ponsonby Road|Cardiff Road/.test(t));
if (visibleHeads.length < 2) fail(`expected two address-headed columns, got ${JSON.stringify(headTexts)}`);
if (!headTexts.some((t) => /area: Grey Lynn East/.test(t)) || !headTexts.some((t) => /area: Pakuranga Central/.test(t))) fail("columns must be sub-headed by their area");
if (await page.getByTestId("same-area-note").count()) fail("no same-area note expected for two different SA2s");
const factsBlocks = page.getByTestId("compare-address-facts").locator("[data-testid=address-facts]");
await factsBlocks.first().waitFor({ state: "visible", timeout: 20000 });
if ((await factsBlocks.count()) !== 2) fail(`expected two per-address facts panels, got ${await factsBlocks.count()}`);
console.log("two address-headed columns + two facts panels ✓");

await pinAddress("3/22 Cardiff Road Pakuranga");
await page.waitForTimeout(1500);
const n3 = await pinCount();
if (n3 !== 3) fail(`expected 3 pins on the map, got ${n3}`);
await page.getByRole("tab", { name: /^Compare \(2\)$/ }).click();
await page.waitForTimeout(1500);
const note = page.getByTestId("same-area-note");
await note.first().waitFor({ state: "visible", timeout: 15000 });
const pakHead = (await heads.allInnerTexts()).map((t) => t.replace(/\s+/g, " ")).find((t) => /Pakuranga Central/.test(t)) ?? "";
if (!/22 Cardiff Road/.test(pakHead) || !/1\/22 Cardiff Road/.test(pakHead)) fail(`the Pakuranga column should list both addresses: ${pakHead}`);
if ((await page.getByTestId("compare-address-head").count()) > 4) fail("a third column appeared for a same-SA2 address");
console.log("same-SA2 address shares the column with the note ✓");

await page.getByTitle("Home — reset everything").first().click();
await page.waitForTimeout(1200);
if ((await pinCount()) !== 0) fail(`Home should clear the pins, got ${await pinCount()}`);
console.log("Home clears the shortlist ✓");
await page.screenshot({ path: "shots/tri141-shortlist.png", fullPage: true });

console.log("\nPASS — address shortlist UI");
await b.close();
