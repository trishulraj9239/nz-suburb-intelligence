/** TRI-133 — property panel composition: epistemic headers, panel-above-banner
 *  order, no verdict language, same component in both frames (1440 + 390). */
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

async function checkFrame(name) {
  const panel = page.getByTestId("address-facts");
  await panel.waitFor({ state: "visible", timeout: 20000 });
  for (const id of ["epistemic-records", "epistemic-models", "epistemic-notheld"]) {
    if (!(await page.getByTestId(id).count())) fail(`${name}: ${id} header missing`);
  }
  const heads = [];
  for (const id of ["epistemic-records", "epistemic-models", "epistemic-notheld"]) heads.push((await page.getByTestId(id).innerText()).trim());
  console.log(`${name} headers:`, heads.join(" | "));
  const text = (await panel.innerText()).replace(/\s+/g, " ");
  if (!/This property/i.test(text)) fail(`${name}: 'This property' title missing`);
  if (/\b(score|\/10|good buy|recommend)/i.test(text) || /(?<!not a )\bverdict/i.test(text)) fail(`${name}: verdict language crept into the panel: ${text.slice(0, 200)}`);
  if (/\$\s?\d/.test(text)) fail(`${name}: a dollar figure crept into the panel`);
  const caveats = (text.match(/area-level model/gi) ?? []).length;
  if (caveats < 2) fail(`${name}: hazard caveat should appear at the top and the foot of the models group (found ${caveats})`);
  const pBox = await panel.boundingBox();
  const banner = page.getByTestId("address-banner");
  await banner.waitFor({ state: "visible", timeout: 10000 });
  const bBox = await banner.boundingBox();
  const h2 = page.locator("h2.font-display").first();
  const hBox = await h2.boundingBox();
  if (!pBox || !bBox || !hBox) fail(`${name}: could not measure panel/banner/heading`);
  if (!(pBox.y < bBox.y && bBox.y < hBox.y)) fail(`${name}: order wrong — panel ${pBox.y}, banner ${bBox.y}, area heading ${hBox.y}`);
  console.log(`${name}: panel (${Math.round(pBox.y)}) above banner (${Math.round(bBox.y)}) above area heading (${Math.round(hBox.y)}) ✓`);
  // Chips arrive with the live lookups (LINZ / council), so wait for one.
  const chip = panel.locator("[title^='Confidence:']").first();
  await chip.waitFor({ state: "attached", timeout: 20000 }).catch(() => fail(`${name}: no confidence chip with an explanation in the panel`));
  console.log(`${name}: confidence chip explains itself: "${await chip.getAttribute("title")}" ✓`);
}

await checkFrame("desktop");
await page.screenshot({ path: "shots/tri133-desktop.png", fullPage: true });

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(800);
if (await page.locator('section[aria-label="Answer"]').count()) fail("desktop answer strip still mounted below lg");
const profileTab = page.getByRole("tab", { name: "Profile", exact: true });
if (await profileTab.count()) await profileTab.first().click();
await page.waitForTimeout(500);
await checkFrame("mobile");
await page.screenshot({ path: "shots/tri133-mobile.png", fullPage: true });

console.log("\nPASS — property panel composition");
await b.close();
