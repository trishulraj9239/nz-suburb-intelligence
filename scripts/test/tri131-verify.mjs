/** TRI-131 — nearby from the pin: nearest park, rapid-transit stop and schools
 *  by level, straight-line, labelled as such; schools "not necessarily zoned". */
import { chromium } from "playwright-core";
const fail = (m) => { throw new Error("FAIL: " + m); };

const api = await (await fetch("http://localhost:3000/api/nearby?lng=174.750912&lat=-36.858927")).json();
console.log("nearby:", JSON.stringify({ park: api.park, station: api.station, schools: Object.fromEntries(Object.entries(api.schools ?? {}).map(([k, v]) => [k, v && { name: v.name, m: v.distance_m }])) }));
if (!api.park || !(api.park.distance_m >= 0 && api.park.distance_m < 1500)) fail(`nearest park should be within 1.5 km of Ponsonby Road, got ${JSON.stringify(api.park)}`);
if (!api.station || !(api.station.distance_m > 0 && api.station.distance_m < 5000)) fail(`nearest station should be within 5 km, got ${JSON.stringify(api.station)}`);
for (const lvl of ["primary", "intermediate", "secondary"]) {
  const s = api.schools?.[lvl];
  if (!s || !(s.distance_m > 0 && s.distance_m < 6000)) fail(`nearest ${lvl} school missing or too far: ${JSON.stringify(s)}`);
}
if (!/straight-line|crow flies/i.test(api.note ?? "")) fail("note must say the distances are straight-line");
if (!/not necessarily zoned/i.test(api.note ?? "")) fail("note must say nearest schools are not necessarily zoned");
console.log(`API: park ${api.park.name} ${api.park.distance_m} m · station ${api.station.name} ${api.station.distance_m} m · primary ${api.schools.primary.name} ${api.schools.primary.distance_m} m ✓`);

const b = await chromium.launch({ channel: "msedge", headless: true });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.getByLabel("Find a suburb or address").fill("42 Ponsonby Rd");
const hit = page.getByTestId("address-hit").first();
await hit.waitFor({ state: "visible", timeout: 15000 });
await hit.click();

const block = page.getByTestId("nearby");
await block.waitFor({ state: "visible", timeout: 30000 });
if (!(await page.getByTestId("epistemic-nearby").count())) fail("'Nearby' group header missing");
const rows = page.getByTestId("nearby-row");
const n = await rows.count();
console.log("nearby rows:", n);
if (n < 5) fail(`expected at least 5 nearby rows, got ${n}`);
for (let i = 0; i < n; i++) {
  const text = (await rows.nth(i).innerText()).replace(/\s+/g, " ");
  if (/undefined|null|NaN/.test(text)) fail(`row ${i} leaks a raw value: ${text}`);
  if (!/\d+ m\b|\d+(\.\d+)? km\b|none within/.test(text)) fail(`row ${i} has no distance: ${text}`);
  console.log(" ·", text.slice(0, 120));
}
const all = (await block.innerText()).replace(/\s+/g, " ");
if (!/crow flies/i.test(all)) fail("'as the crow flies' label missing");
if (!/not necessarily zoned/i.test(all)) fail("school zoning caveat missing");
if (/\b(walk|drive) time|min\b/.test(all)) fail("travel times must not appear unless asked");
const chip = block.locator("[title^='Confidence:']").first();
await chip.waitFor({ state: "attached", timeout: 5000 });
if (!/Computed/.test(await chip.getAttribute("title"))) fail("nearby distances should carry the 'derived/computed' confidence");
console.log("nearest park, station, schools by level — straight-line, caveated, derived ✓");
await page.screenshot({ path: "shots/tri131-nearby.png", fullPage: true });

console.log("\nPASS — nearby from the address");
await b.close();
