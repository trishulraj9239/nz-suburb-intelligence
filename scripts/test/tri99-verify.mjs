/** TRI-99 — saved-suburbs shortlist: star on the profile header, strip in the
 *  panel's empty state, "Compare these" feeds the compare set, survives a
 *  reload, never touches the URL. */
import { chromium } from "playwright-core";
const BASE = (process.env.NZSI_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const fail = (m) => { throw new Error("FAIL: " + m); };
const b = await chromium.launch({ channel: process.env.PW_CHANNEL === undefined ? "msedge" : process.env.PW_CHANNEL || undefined, headless: true });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
if (await page.getByTestId("shortlist-strip").count()) fail("strip must not render with nothing saved");

const pick = async (name) => {
  const box = page.getByLabel("Find a suburb or address");
  await box.fill(name); await page.waitForTimeout(800); await box.press("ArrowDown"); await box.press("Enter"); await page.waitForTimeout(1500);
};
// 1. Star two suburbs.
await page.getByRole("button", { name: "Ponsonby West", exact: true }).first().click();
await page.waitForTimeout(1500);
const star = page.getByTestId("shortlist-star");
if ((await star.getAttribute("aria-pressed")) !== "false") fail("star should start unpressed");
await star.click();
if ((await star.getAttribute("aria-pressed")) !== "true") fail("star did not press");
if (!/Remove Ponsonby West/.test(await star.getAttribute("aria-label"))) fail("star label did not flip");
await pick("Takapuna Central");
await page.getByTestId("shortlist-star").click();
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("nzsi:shortlist") || "[]"));
if (stored.length !== 2 || stored[0].sa2 !== "130400" || stored[1].sa2 !== "126801") fail(`stored ${JSON.stringify(stored)}`);
console.log("two suburbs starred ✓");

// 2. Home → the empty state shows the strip; the URL carries nothing of it.
await page.getByTitle("Home — reset everything").first().click();
await page.waitForTimeout(800);
const strip = page.getByTestId("shortlist-strip");
await strip.waitFor({ state: "visible", timeout: 5000 });
if ((await strip.getByTestId("shortlist-chip").count()) !== 2) fail("strip should list two chips");
if (/shortlist|130400/.test(await page.evaluate(() => location.search))) fail("shortlist leaked into the URL");
console.log("strip in the empty state, URL clean ✓");

// 3. Compare these → Compare (2).
await strip.getByTestId("shortlist-compare").click();
await page.getByRole("tab", { name: /^Compare \(2\)$/ }).waitFor({ state: "visible", timeout: 5000 });
console.log("Compare these feeds the compare set ✓");

// 4. Survives a reload; a chip opens the suburb; ✕ removes it.
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.getByTestId("shortlist-strip").waitFor({ state: "visible", timeout: 5000 });
await page.getByTestId("shortlist-chip").first().getByRole("button", { name: "Ponsonby West", exact: true }).click();
await page.waitForTimeout(1200);
if (!/Ponsonby West/.test(await page.locator("h2.font-display").first().innerText())) fail("chip did not open the suburb");
if ((await page.getByTestId("shortlist-star").getAttribute("aria-pressed")) !== "true") fail("star should be pressed for a saved suburb");
await page.getByTestId("shortlist-star").click();
const after = await page.evaluate(() => JSON.parse(localStorage.getItem("nzsi:shortlist") || "[]"));
if (after.length !== 1 || after[0].sa2 !== "126801") fail(`unstar left ${JSON.stringify(after)}`);
console.log("persists across reload, chip opens, unstar removes ✓");

// 5. Phone: the strip is reachable from the You menu.
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(800);
await page.getByRole("button", { name: /^You/ }).click();
await page.waitForTimeout(400);
if (!(await page.getByRole("dialog").getByTestId("shortlist-strip").count())) fail("shortlist strip missing from the You menu on phones");
console.log("strip inside the You menu on phones ✓");
await page.screenshot({ path: "shots/tri99-shortlist.png" });
console.log("\nPASS — saved-suburbs shortlist");
await b.close();
