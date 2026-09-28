/** TRI-132 — "Also check" link-out block: what the app does not hold, why, where. */
import { chromium } from "playwright-core";
import { BASE_URL, launchOptions, viewport } from "./_harness.mjs";
const fail = (m) => { throw new Error("FAIL: " + m); };
const b = await chromium.launch(launchOptions());
const page = await b.newPage({ viewport: viewport() });
await page.goto(BASE_URL, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

await page.getByLabel("Find a suburb or address").fill("42 Ponsonby Rd");
const hit = page.getByTestId("address-hit").first();
await hit.waitFor({ state: "visible", timeout: 15000 });
await hit.click();

const block = page.getByTestId("link-outs");
await block.waitFor({ state: "visible", timeout: 20000 });
const items = page.getByTestId("link-out");
const n = await items.count();
console.log("link-out rows:", n);
if (n !== 7) fail(`expected 7 link-out rows, got ${n}`);
for (let i = 0; i < n; i++) {
  const li = items.nth(i);
  const href = await li.locator("a").getAttribute("href");
  const target = await li.locator("a").getAttribute("target");
  const text = (await li.innerText()).replace(/\s+/g, " ");
  if (!href || !/^https:\/\//.test(href)) fail(`row ${i} has no https link: ${href}`);
  if (target !== "_blank") fail(`row ${i} link does not open in a new tab`);
  if (text.length < 60) fail(`row ${i} has no reason line: ${text}`);
  if (/\$\s?\d/.test(text)) fail(`row ${i} carries a figure: ${text}`);
  console.log(" ·", text.slice(0, 110));
}
const hdr = (await page.getByTestId("address-facts").innerText()).replace(/\s+/g, " ");
if (!/Also check/i.test(hdr) || !/not held by this app/i.test(hdr)) fail("'Also check · not held by this app' header missing");
const copy = page.getByTestId("copy-address");
if (!(await copy.isVisible())) fail("copy-address button missing");
await copy.click();
await page.waitForTimeout(300);
console.log("copy button after click:", await copy.innerText());
console.log("link-out block rendered with seven external sources, reasons, and a copy-address fallback ✓");
await page.screenshot({ path: "shots/tri132-link-outs.png", fullPage: true });

console.log("\nPASS — address link-outs");
await b.close();
