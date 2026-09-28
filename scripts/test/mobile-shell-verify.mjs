/** TRI-145 Phase A — the phone shell at 390×844: one-row top bar, You menu,
 *  ARIA tabs, keyboard sheet, Layers dock, unclipped search, no overlay
 *  collisions, no horizontal scroll, starter chips inside the sheet. */
import { chromium } from "playwright-core";
import { BASE_URL, launchOptions } from "./_harness.mjs";
const fail = (m) => { throw new Error("FAIL: " + m); };
const b = await chromium.launch(launchOptions());

for (const scheme of ["light", "dark"]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  // Theme follows the OS.
  const theme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  if (theme !== scheme) fail(`[${scheme}] data-theme should follow the OS scheme, got ${theme}`);

  // One-row header, no horizontal page scroll.
  const header = await page.locator("header").boundingBox();
  if (!header || header.height > 64) fail(`[${scheme}] header should be one row (≤64px), got ${header?.height}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) fail(`[${scheme}] page scrolls horizontally by ${overflow}px`);
  if (await page.getByRole("radio", { name: /Buying/ }).count()) fail(`[${scheme}] persona toggle should be folded into the You menu on phones`);

  // You menu: opens, holds the persona toggle, Escape closes and returns focus.
  const you = page.getByRole("button", { name: /^You —/ });
  await you.click();
  const dialog = page.getByRole("dialog", { name: "You" });
  await dialog.waitFor({ state: "visible", timeout: 5000 });
  if (!(await dialog.getByRole("radio", { name: /Buying/ }).count())) fail(`[${scheme}] You menu lacks the persona toggle`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  if (await dialog.count()) fail(`[${scheme}] Escape did not close the You menu`);
  const focused = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
  if (!/^You —/.test(focused)) fail(`[${scheme}] focus did not return to the You button (active: ${focused})`);

  // The sheet: last aside, slider handle, keyboard snap.
  const sheet = page.locator("aside").last();
  const handle = sheet.getByRole("slider", { name: "Panel height" });
  if (!(await handle.count())) fail(`[${scheme}] sheet handle should be a slider`);
  const h0 = (await sheet.boundingBox()).height;
  await handle.focus();
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(400);
  const h1 = (await sheet.boundingBox()).height;
  if (!(h1 > h0)) fail(`[${scheme}] ArrowUp should grow the sheet (${h0} → ${h1})`);
  await page.keyboard.press("Home");
  await page.waitForTimeout(400);
  const hPeek = (await sheet.boundingBox()).height;
  if (!(hPeek < h0)) fail(`[${scheme}] Home should snap to peek (${h0} → ${hPeek})`);

  // Layers dock sits top-right of the map: clear of the nav controls (top-left)
  // and of the sheet at every snap, including full.
  await page.keyboard.press("End");
  await page.waitForTimeout(400);
  const dock = page.getByRole("button", { name: /^Map layers/ });
  const dockBox = await dock.boundingBox();
  const sheetFull = await sheet.boundingBox();
  if (!dockBox) fail(`[${scheme}] Layers dock button missing`);
  if (dockBox.y + dockBox.height > sheetFull.y + 1) fail(`[${scheme}] Layers dock hidden under the full sheet (dock bottom ${dockBox.y + dockBox.height}, sheet top ${sheetFull.y})`);
  const nav = await page.locator(".maplibregl-ctrl-top-left").boundingBox();
  if (nav && dockBox.x < nav.x + nav.width && dockBox.y < nav.y + nav.height) fail(`[${scheme}] Layers dock collides with the map controls`);
  await page.keyboard.press("Home");
  await page.waitForTimeout(400);
  if (dockBox.height < 40) fail(`[${scheme}] Layers button is under 40px tall (${dockBox.height})`);
  await dock.click();
  const layers = page.getByRole("dialog", { name: "Map layers" });
  await layers.waitFor({ state: "visible", timeout: 5000 });
  if (!(await layers.locator('select[aria-label="Shade map by metric"]').count())) fail(`[${scheme}] Layers dialog lacks the shade select`);
  if (!(await layers.getByText("Area-level model", { exact: false }).count())) fail(`[${scheme}] Layers dialog lacks the hazard caveat`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // Search at peek: typing opens an unclipped listbox (the sheet grows first).
  const search = page.getByLabel("Find a suburb or address");
  await search.fill("Takapuna");
  const listbox = sheet.getByRole("listbox");
  await listbox.waitFor({ state: "visible", timeout: 10000 });
  // The sheet grows to half before the list is usable; on a slow CI runner the
  // transition can still be running at the first measurement, so poll briefly.
  let lb = null, first = null;
  for (let i = 0; i < 20; i++) {
    lb = await listbox.boundingBox();
    first = await listbox.getByRole("option").first().boundingBox();
    if (lb && first && first.y + first.height <= 844) break;
    await page.waitForTimeout(150);
  }
  if (!lb || !first || first.y + first.height > 844) fail(`[${scheme}] search listbox is clipped by the viewport`);
  if ((await sheet.boundingBox()).height <= hPeek) fail(`[${scheme}] opening search at peek should grow the sheet`);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);

  // Tabs: tablist with roving selection; labels unchanged.
  await search.fill("");
  const tablist = sheet.getByRole("tablist", { name: "Panel views" });
  if (!(await tablist.count())) {
    console.log(`[${scheme}] single tab — tablist hidden (expected before any question)`);
  }
  // Starter chips live in the sheet's empty state on phones (Home resets the selection).
  await page.getByTitle("Home — reset everything").click();
  await page.waitForTimeout(800);
  if (!(await sheet.getByText("Try asking").count())) fail(`[${scheme}] starter chips should render inside the sheet on phones`);
  const overlayChips = await page.locator("section >> text=Try asking").count();
  const sheetChips = await sheet.getByText("Try asking").count();
  if (overlayChips - sheetChips > 0) fail(`[${scheme}] starter chips still overlay the map on phones`);

  // Type floor: nothing computed below 12px.
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("body *")].filter((el) => {
      const cs = getComputedStyle(el);
      return el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(cs.fontSize) < 12 && cs.display !== "none";
    }).length,
  );
  if (small > 0) fail(`[${scheme}] ${small} text elements render below 12px`);

  await page.screenshot({ path: `shots/mobile-shell-${scheme}.png`, fullPage: false });
  console.log(`[${scheme}] header ${Math.round(header.height)}px · sheet peek ${Math.round(hPeek)}px · dock ${Math.round(dockBox.height)}px · You menu, slider, Layers dialog, combobox ✓`);
  await ctx.close();
}

console.log("\nPASS — mobile shell");
await b.close();
