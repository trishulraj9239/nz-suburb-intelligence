/** TRI-93 — starter chips in browse mode, follow-ups after an answer. */
import { chromium } from "playwright-core";
const fail=(m)=>{throw new Error("FAIL: "+m)};
const b=await chromium.launch({channel:"msedge",headless:true});
const page=await b.newPage({viewport:{width:1440,height:900}});
await page.goto("http://localhost:3000",{waitUntil:"networkidle"});
await page.waitForTimeout(2500);

const starters=page.locator("button", {hasText:/^“.*”$/});
const n=await starters.count();
console.log("starter chips in browse mode:",n);
if(n<3) fail("expected starter chips over the map");
await page.screenshot({path:"shots/tri93-starters.png"});

// clicking a chip asks it
const label=await starters.first().innerText();
await starters.first().click();
const strip=page.locator('section[aria-label="Answer"]');
await strip.waitFor({state:"visible",timeout:20000});
console.log("chip asked:",label.slice(0,60),"✓");

// starters disappear once a question exists
if(await page.locator("button",{hasText:/^“.*”$/}).count()) fail("starter chips still shown after asking");
console.log("starters hide once a question exists ✓");

// follow-ups appear when the answer completes
for(let i=0;i<60;i++){ if(/next/i.test(await strip.innerText())) break; await page.waitForTimeout(1000); }
const txt=await strip.innerText();
if(!/next/i.test(txt)) fail("no follow-up chips after the answer completed");
console.log("follow-up chips rendered ✓");
await page.screenshot({path:"shots/tri93-followups.png"});

// persona switch changes the starter set
await page.getByRole("button",{name:"Home"}).click();
await page.waitForTimeout(800);
await page.getByRole("radio",{name:/Buying/i}).click().catch(async()=>{await page.getByText("Buying",{exact:true}).click()});
await page.waitForTimeout(800);
const buyerFirst=await page.locator("button",{hasText:/^“.*”$/}).first().innerText();
console.log("buyer starter:",buyerFirst.slice(0,60));
if(buyerFirst===label) fail("persona did not change the starter chips");
console.log("persona changes the chip set ✓");
console.log("\nPASS — question chips");
await b.close();
