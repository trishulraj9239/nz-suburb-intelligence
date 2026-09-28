import { chromium } from "playwright-core";
import { BASE_URL, launchOptions } from "./_harness.mjs";
const fail=(m)=>{throw new Error("FAIL: "+m)};
const b=await chromium.launch(launchOptions());
const page=await b.newPage({viewport:{width:1440,height:900}});
await page.goto(BASE_URL,{waitUntil:"networkidle"});
await page.waitForTimeout(2500);
await page.getByRole("button",{name:"Ponsonby West",exact:true}).first().click();
const panel=page.locator("aside").last();
for(let i=0;i<40;i++){ if(/Auckland median/i.test(await panel.innerText())) break; await page.waitForTimeout(500); }
const renter=await panel.innerText();
if(!/Auckland median/i.test(renter)) fail("no Auckland-median reference on tiles");
console.log("renter tiles + Akl median reference ✓");
console.log(renter.split("\n").slice(0,18).join(" | ").slice(0,260));
await page.screenshot({path:"shots/tri106-renter.png"});
// buyer persona swaps the tile set
await page.getByText("Buying",{exact:true}).click();
await page.waitForTimeout(2500);
const buyer=await panel.innerText();
if(renter.slice(0,400)===buyer.slice(0,400)) fail("persona did not change the tiles");
const buyerHasConsents=/Consenting rate|New dwellings consented/i.test(buyer);
if(!buyerHasConsents) fail("buyer tiles missing consents");
console.log("buyer tiles differ and include consents ✓");
await page.screenshot({path:"shots/tri106-buyer.png"});
console.log("\nPASS — KPI tiles");
await b.close();
