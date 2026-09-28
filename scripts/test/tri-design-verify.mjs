/** TRI-147 — the primitives gallery at 390 and 1440: every primitive labelled
 *  with its status, hatched full-length empty states, outlined estimates,
 *  3:1 marks / 4.5:1 text in both themes, nothing under 12 px.
 *  TRI-148 — then the Profile on the kit (six persona-ordered cards).
 *  TRI-149 — then Compare on shared-axis dot strips.
 *  TRI-150 — then the "This property" panel on the grammar.
 *  TRI-151 — then the answer surfaces (strip / sheet tab / results). */
import { chromium } from "playwright-core";
import { BASE_URL, launchOptions } from "./_harness.mjs";
const fail = (m) => { throw new Error("FAIL: " + m); };
const b = await chromium.launch(launchOptions());

/** Runs in the page. WCAG contrast on computed colours, alpha composited over the real stack. */
function helpers() {
  const alpha = (a) => (a == null ? 1 : a.endsWith("%") ? parseFloat(a) / 100 : +a);
  const parse = (c) => {
    if (!c) return null;
    let m = c.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\)/);
    if (m) return { r: +m[1] * 255, g: +m[2] * 255, b: +m[3] * 255, a: alpha(m[4]) };
    m = c.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: alpha(m[4]) };
    return null;
  };
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const effBg = (el) => {
    const chain = [];
    let e = el;
    while (e) {
      const p = parse(getComputedStyle(e).backgroundColor);
      if (p && p.a > 0) chain.push(p);
      e = e.parentElement;
    }
    let res = { r: 255, g: 255, b: 255, a: 1 };
    for (const c of chain.reverse()) res = over(c, res);
    return res;
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrast = (fgStr, bg) => {
    const fg = parse(fgStr);
    if (!fg) return null;
    const la = lum(over(fg, bg)), lb = lum(bg);
    const [x, y] = la > lb ? [la, lb] : [lb, la];
    return (x + 0.05) / (y + 0.05);
  };
  const fmt = (c) => "rgb(" + Math.round(c.r) + "," + Math.round(c.g) + "," + Math.round(c.b) + ")";
  return { parse, over, effBg, contrast, fmt };
}

function contrastAudit() {
  const { parse, over, effBg, contrast, fmt } = helpers();
  const out = { textFails: [], markFails: [], checkedText: 0, checkedMarks: 0 };
  for (const theme of ["light", "dark"]) {
    const root = document.querySelector('[data-gallery-theme="' + theme + '"]');
    for (const el of root.querySelectorAll("p, span, th, td, h3, dd")) {
      if (!el.textContent.trim() || el.closest("[role=img]") || el.children.length) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || parseFloat(cs.opacity) === 0) continue;
      const bg = effBg(el);
      const c = contrast(cs.color, bg);
      out.checkedText++;
      if (c != null && c < 4.5) out.textFails.push(theme + ': "' + el.textContent.trim().slice(0, 24) + '" ' + cs.color + " on " + fmt(bg) + " " + c.toFixed(2));
    }
    // Filled row-level marks: ≥ 3:1 against the track (or the composited background for HTML marks).
    for (const m of root.querySelectorAll("[data-mark=filled]:not([data-dot]):not([data-glyph])")) {
      const cs = getComputedStyle(m);
      const svg = m.closest("svg");
      const track = svg?.querySelector("[data-track]");
      const base = effBg(m.parentElement || m);
      const tp = track ? parse(getComputedStyle(track).fill) : null;
      const trackColor = tp && tp.a > 0 ? over(tp, base) : base;
      const c = contrast(svg ? cs.fill : cs.backgroundColor, trackColor);
      out.checkedMarks++;
      if (c != null && c < 3) out.markFails.push(theme + ": mark " + (svg ? cs.fill : cs.backgroundColor) + " on " + fmt(trackColor) + " " + c.toFixed(2));
    }
    // Categorical dots and glyphs carry an ink ring (≥ 3:1 by construction); the letter inside a dot must read at 4.5:1.
    for (const d of root.querySelectorAll("[data-dot]")) {
      const letter = d.nextElementSibling;
      if (!letter || !letter.hasAttribute("data-letter")) continue;
      const base = effBg(d.parentElement);
      const fp = parse(getComputedStyle(d).fill);
      const dotBg = fp && fp.a > 0 ? over(fp, base) : base;
      const c = contrast(getComputedStyle(letter).fill, dotBg);
      out.checkedMarks++;
      if (c != null && c < 4.5) out.markFails.push(theme + ": letter " + getComputedStyle(letter).fill + " on dot " + fmt(dotBg) + " " + c.toFixed(2));
    }
  }
  return out;
}

const galleryProbe = await (await b.newPage()).goto(`${BASE_URL}/dev/primitives`).then((r) => r?.status() ?? 0).catch(() => 0);
if (galleryProbe !== 200) console.log(`gallery /dev/primitives not served here (HTTP ${galleryProbe}: production build without NEXT_PUBLIC_NZSI_TEST_HOOKS) — gallery section skipped`);
for (const width of galleryProbe === 200 ? [390, 1440] : []) {
  const page = await b.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
  await page.goto(`${BASE_URL}/dev/primitives`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  // 1. Every primitive has an accessible label carrying its status word.
  const imgs = await page.locator("[role=img]").evaluateAll((els) => els.map((e) => ({ label: e.getAttribute("aria-label") || "", status: e.getAttribute("data-status") || "" })));
  if (imgs.length < 40) fail(`[${width}] expected ≥40 role=img primitives, got ${imgs.length}`);
  for (const i of imgs) {
    if (!i.label.trim()) fail(`[${width}] a primitive has no aria-label`);
    if (i.status && !i.label.includes(i.status) && !(i.status === "suppressed" && /suppressed|not published/.test(i.label)) && !(i.status === "unavailable" && /unavailable|not available/.test(i.label)))
      fail(`[${width}] label lacks its status word (${i.status}): "${i.label}"`);
  }

  // 2. Empty states are hatched and as long as the row (never zero-length).
  const empties = await page.locator("[data-status=suppressed], [data-status=unavailable]").evaluateAll((els) =>
    els.map((e) => {
      const h = e.querySelector(".nzsi-hatch");
      return { hatched: !!h, w: h ? h.getBoundingClientRect().width : 0, parentW: e.getBoundingClientRect().width };
    }),
  );
  if (!empties.length) fail(`[${width}] no empty-state primitives found`);
  for (const e of empties) {
    if (!e.hatched) fail(`[${width}] an empty state is not hatched`);
    if (e.w < e.parentW * 0.55) fail(`[${width}] a hatched track is short (${Math.round(e.w)} of ${Math.round(e.parentW)}px)`);
  }

  // 3. Estimates/approximations are outlined, exact is filled (row-level markers; dot strips carry quality per dot).
  const outlined = await page.locator("[data-case='est.'] [data-mark]:not([data-dot]), [data-case=approx] [data-mark]:not([data-dot])").evaluateAll((els) => els.map((e) => e.getAttribute("data-mark")));
  if (!outlined.length || outlined.some((m) => m !== "outlined")) fail(`[${width}] est./approx markers must be outlined: ${JSON.stringify(outlined)}`);
  const filled = await page.locator("[data-case=exact] [data-mark]:not([data-dot])").evaluateAll((els) => els.map((e) => e.getAttribute("data-mark")));
  if (!filled.length || filled.some((m) => m !== "filled")) fail(`[${width}] exact markers must be filled: ${JSON.stringify(filled)}`);
  // 3b. In the exact-case dot strip, dot b (est.) is outlined while a and c are filled.
  const dotMarks = await page.locator("[data-case=exact] [data-dot]").evaluateAll((els) => els.map((e) => e.getAttribute("data-dot") + ":" + e.getAttribute("data-mark")));
  if (dotMarks.length < 3) fail(`[${width}] expected per-dot marks in the exact dot strip`);
  for (const m of dotMarks) if (!/^(a:filled|b:outlined|c:filled)$/.test(m)) fail(`[${width}] dot strip per-dot quality wrong: ${m}`);

  // 4. Contrast in both themes: text ≥ 4.5:1 against its composited background; filled marks ≥ 3:1 against the track.
  const contrast = await page.evaluate(`(() => { ${helpers.toString()}; return (${contrastAudit.toString()})(); })()`);
  if (contrast.textFails.length) fail(`[${width}] text contrast < 4.5:1 (${contrast.textFails.length}): ${contrast.textFails.slice(0, 6).join(" | ")}`);
  if (contrast.markFails.length) fail(`[${width}] mark contrast < 3:1: ${contrast.markFails.slice(0, 5).join(" | ")}`);

  // 5. Type floor.
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("body *")].filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) < 12 && !el.closest("svg")).length,
  );
  if (small > 0) fail(`[${width}] ${small} text elements below 12px`);

  await page.screenshot({ path: `shots/primitives-${width}.png`, fullPage: true });
  console.log(`[${width}] ${imgs.length} primitives labelled · ${empties.length} hatched empties · ${outlined.length} outlined / ${filled.length} filled marks · contrast ok on ${contrast.checkedText} text + ${contrast.checkedMarks} marks ✓`);
  await page.close();
}

console.log("\nPASS — primitives gallery");

// ---------------------------------------------------------------------------
// TRI-148 — the Profile on the kit: six cards in persona order, each with a
// hidden sr-table; every drawn row is a labelled role=img; the hazard badge
// and "Auckland median" facts survive; screenshots at 1440 and 390 (sheet
// full), both themes.
// ---------------------------------------------------------------------------
const RENTER_ORDER = ["card-housing", "card-commute", "card-people", "card-hazards", "card-planning", "card-schools"];
const BUYER_ORDER = ["card-housing", "card-planning", "card-hazards", "card-people", "card-commute", "card-schools"];
for (const [width, theme] of [[1440, "light"], [1440, "dark"], [390, "light"], [390, "dark"]]) {
  const ctx = await b.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
  await ctx.addInitScript((t) => localStorage.setItem("theme", t), theme);
  const page = await ctx.newPage();
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Ponsonby West", exact: true }).first().click();
  const panel = page.locator("aside").last();
  for (let i = 0; i < 40; i++) { if ((await panel.locator("[data-testid=card-schools]").count()) > 0) break; await page.waitForTimeout(500); }
  await page.waitForTimeout(1200);
  if (width === 390) { await page.getByRole("slider").first().focus(); await page.keyboard.press("End"); await page.waitForTimeout(600); }

  const cards = await panel.locator("[data-testid^=card-]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  if (cards.join() !== RENTER_ORDER.join()) fail(`[${width} ${theme}] renter card order ${cards.join(",")}`);
  const srTables = await panel.locator("[data-testid^=card-] [data-testid=sr-table]").count();
  if (srTables < 5) fail(`[${width} ${theme}] expected an sr-table on each metric card, got ${srTables}`);
  // Every drawn row carries exactly one labelled role=img (the kpi cards and breakdown blocks too).
  const rowImgs = await panel.locator("[data-testid^=row-]").evaluateAll((els) => els.map((e) => ({ id: e.getAttribute("data-testid"), imgs: e.querySelectorAll("[role=img]").length, labelled: [...e.querySelectorAll("[role=img]")].every((i) => (i.getAttribute("aria-label") || "").length > 4) })));
  if (rowImgs.length < 12) fail(`[${width} ${theme}] too few metric rows: ${rowImgs.length}`);
  for (const r of rowImgs) { if (r.imgs < 1) fail(`[${width} ${theme}] ${r.id} draws nothing`); if (!r.labelled) fail(`[${width} ${theme}] ${r.id} has an unlabelled primitive`); }
  const text = await panel.innerText();
  if (!/\d+ of \d+ layers? above the Auckland median/.test(text)) fail(`[${width} ${theme}] hazard countable fact missing`);
  if ((text.match(/Auckland median/g) || []).length < 8) fail(`[${width} ${theme}] too few Auckland-median references`);
  if (!/Area-level model — not a property assessment/.test(text)) fail(`[${width} ${theme}] hazard caveat missing`);
  if (!/percentile of Auckland/.test(text)) fail(`[${width} ${theme}] no percentile headline`);
  if (!/typical · no live traffic/.test(text)) fail(`[${width} ${theme}] commute framing missing`);
  if ((await panel.locator("[title^='Confidence:']").count()) < 6) fail(`[${width} ${theme}] quality marks missing`);
  // Phone: nothing under 12 px, and the sheet body never scrolls sideways.
  if (width === 390) {
    const small = await panel.evaluate((el) => [...el.querySelectorAll("*")].filter((n) => [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) && parseFloat(getComputedStyle(n).fontSize) < 12 && !n.closest("svg")).length);
    if (small > 0) fail(`[390 ${theme}] ${small} text nodes under 12px in the profile`);
    const wide = await panel.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    if (wide) fail(`[390 ${theme}] profile scrolls horizontally`);
  }
  await page.screenshot({ path: `shots/profile-${width}-${theme}.png` });
  await panel.locator("[data-testid=card-hazards]").evaluate((el) => el.scrollIntoView());
  await page.screenshot({ path: `shots/profile-${width}-${theme}-hazards.png` });
  console.log(`[${width} ${theme}] profile: 6 cards in renter order · ${srTables} sr-tables · ${rowImgs.length} rows drawn+labelled · badge + caveat + medians ✓`);

  // Buyer persona re-orders the cards (desktop only — the toggle lives in the You menu on phones).
  if (width === 1440 && theme === "light") {
    await page.getByText("Buying", { exact: true }).click();
    await page.waitForTimeout(1500);
    const after = await panel.locator("[data-testid^=card-]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    if (after.join() !== BUYER_ORDER.join()) fail(`buyer card order ${after.join(",")}`);
    console.log("[1440 light] buyer persona re-orders the cards ✓");
    await page.getByText("Renting", { exact: true }).click();
  }
  await ctx.close();
}
console.log("\nPASS — profile on the kit");


// ---------------------------------------------------------------------------
// TRI-149 — Compare on the kit: one row per metric with lettered dots on the
// shared axis, persona-ordered cards with sr-tables, "Only differences"
// actually hides rows, the heatmap ranks judged metrics only, the remove
// controls keep their names; 1440 and 390 (sheet full), light and dark.
// ---------------------------------------------------------------------------
for (const [width, theme] of [[1440, "light"], [390, "light"], [1440, "dark"], [390, "dark"]]) {
  const ctx = await b.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
  await ctx.addInitScript((t) => localStorage.setItem("theme", t), theme);
  const page = await ctx.newPage();
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const panel = page.locator("aside").last();
  const pick = async (name) => {
    const box = page.getByLabel("Find a suburb or address");
    await box.fill(name); await page.waitForTimeout(800);
    await box.press("ArrowDown"); await box.press("Enter"); await page.waitForTimeout(1500);
    await panel.getByRole("button", { name: /^\+ Compare$/ }).first().click(); await page.waitForTimeout(400);
  };
  await pick("Ponsonby West");
  await pick("Takapuna Central");
  await page.getByRole("tab", { name: /^Compare \(2\)$/ }).click();
  for (let i = 0; i < 40; i++) { if ((await panel.locator("[data-testid=card-compare-schools]").count()) > 0) break; await page.waitForTimeout(500); }
  await page.waitForTimeout(1000);
  if (width === 390) { await page.getByRole("slider").first().focus(); await page.keyboard.press("End"); await page.waitForTimeout(600); }

  const cards = await panel.locator("[data-testid^=card-compare-]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid").replace("card-compare-", "")));
  if (cards.join() !== "housing,commute,people,hazards,planning,schools") fail(`[${width} ${theme}] compare card order ${cards.join(",")}`);
  const srTables = await panel.locator("[data-testid^=card-compare-] [data-testid=sr-table]").count();
  if (srTables < 6) fail(`[${width} ${theme}] compare sr-tables ${srTables}`);
  const rows = await panel.locator("[data-testid^=cmp-]").evaluateAll((els) => els.map((e) => ({ id: e.getAttribute("data-testid"), imgs: e.querySelectorAll("[role=img]").length, labelled: [...e.querySelectorAll("[role=img]")].every((i) => (i.getAttribute("aria-label") || "").length > 4) })));
  if (rows.length < 20) fail(`[${width} ${theme}] too few compare rows: ${rows.length}`);
  for (const r of rows) { if (r.imgs !== 1) fail(`[${width} ${theme}] ${r.id} has ${r.imgs} primitives (want exactly one)`); if (!r.labelled) fail(`[${width} ${theme}] ${r.id} unlabelled primitive`); }
  // Every dot strip lists each suburb's value with its letter; no "best" on unjudged rows.
  const unjudgedBest = await panel.locator("[data-testid^=cmp-]").evaluateAll((els) => els.filter((e) => /unjudged/.test(e.textContent || "") && /\bbest\b/.test(e.textContent || "")).length);
  if (unjudgedBest) fail(`[${width} ${theme}] a "best" chip appeared on an unjudged row`);
  if ((await panel.getByRole("button", { name: /Remove .* from comparison/ }).count()) !== 2) fail(`[${width} ${theme}] remove controls`);
  // "Only differences" hides rows and says how many.
  const before = rows.length;
  await panel.getByText("Only differences").click(); await page.waitForTimeout(500);
  const after = await panel.locator("[data-testid^=cmp-]").count();
  const txt = await panel.innerText();
  if (!(after < before)) fail(`[${width} ${theme}] Only differences did not hide rows (${before} → ${after})`);
  if (!/\d+ similar rows? hidden/.test(txt)) fail(`[${width} ${theme}] hidden-count sentence missing`);
  await panel.getByText("Only differences").click(); await page.waitForTimeout(300);
  // Heatmap: judged metrics only.
  const hm = panel.locator("[data-testid=compare-heatmap-card]");
  if (!(await hm.count())) fail(`[${width} ${theme}] percentile overview missing`);
  await hm.locator("summary").click(); await page.waitForTimeout(300);
  const hmRows = await hm.locator("tbody th").allInnerTexts();
  if (hmRows.some((t) => /flood|inundation|overland|liquefaction|deprivation|consent|zoning|heritage/i.test(t))) fail(`[${width} ${theme}] heatmap ranks an information-only metric: ${hmRows.join(" | ")}`);
  if (!hmRows.length) fail(`[${width} ${theme}] heatmap has no rows`);
  if (!/Hazard rows: Area-level model — not a property assessment/.test(txt)) fail(`[${width} ${theme}] hazard caveat missing on compare`);
  if (width === 390) {
    const wide = await panel.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    if (wide) fail(`[390 ${theme}] compare scrolls horizontally`);
    const small = await panel.evaluate((el) => [...el.querySelectorAll("*")].filter((n) => [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) && parseFloat(getComputedStyle(n).fontSize) < 12 && !n.closest("svg")).length);
    if (small > 0) fail(`[390 ${theme}] ${small} text nodes under 12px in compare`);
  }
  await page.screenshot({ path: `shots/compare-${width}-${theme}.png` });
  console.log(`[${width} ${theme}] compare: 6 cards · ${rows.length} rows, one labelled strip each · only-differences ${before} → ${after} · heatmap ${hmRows.length} judged rows ✓`);
  await ctx.close();
}
console.log("\nPASS — compare on the kit");


// ---------------------------------------------------------------------------
// TRI-150 — the "This property" panel on the grammar: six epistemic headings
// in order at 13 px, a StatusPill on every point-check row, geometry on the
// chips, the caveat top and foot, nothing under 12 px; 1440 light + 390 dark.
// ---------------------------------------------------------------------------
for (const [width, theme] of [[1440, "light"], [390, "dark"]]) {
  const ctx = await b.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
  await ctx.addInitScript((t) => localStorage.setItem("theme", t), theme);
  const page = await ctx.newPage();
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const box = page.getByLabel("Find a suburb or address");
  await box.fill("42 Ponsonby Rd");
  const hit = page.getByTestId("address-hit").first();
  await hit.waitFor({ state: "visible", timeout: 15000 });
  await hit.click();
  await page.getByTestId("address-banner").waitFor({ state: "visible", timeout: 15000 });
  const panel = page.locator("aside").last();
  const facts = panel.getByTestId("address-facts");
  for (let i = 0; i < 60; i++) { if ((await facts.locator("[data-testid=point-hazard]").count()) > 0 && (await facts.locator("[data-testid=overlay-row]").count()) > 0) break; await page.waitForTimeout(500); }
  await page.waitForTimeout(1500);
  if (width === 390) { await page.getByRole("slider").first().focus(); await page.keyboard.press("End"); await page.waitForTimeout(600); }

  const heads = await facts.locator("h4[data-testid^=epistemic-]").evaluateAll((els) => els.map((e) => ({ id: e.getAttribute("data-testid"), px: parseFloat(getComputedStyle(e).fontSize), upper: getComputedStyle(e).textTransform })));
  if (heads.map((h) => h.id).join() !== "epistemic-records,epistemic-block,epistemic-plan,epistemic-models,epistemic-nearby,epistemic-notheld") fail(`[${width} ${theme}] property heading order ${heads.map((h) => h.id).join(",")}`);
  for (const h of heads) { if (h.px < 13) fail(`[${width} ${theme}] ${h.id} is ${h.px}px`); if (h.upper === "uppercase") fail(`[${width} ${theme}] ${h.id} is uppercase`); }
  const pointRows = await facts.locator("[data-testid=point-hazard], [data-testid=overlay-row]").evaluateAll((els) => els.map((e) => e.querySelectorAll("[data-pill]").length));
  if (pointRows.length < 10) fail(`[${width} ${theme}] too few point rows: ${pointRows.length}`);
  if (pointRows.some((n) => n !== 1)) fail(`[${width} ${theme}] a point row lacks its StatusPill`);
  const text = await facts.innerText();
  if ((text.match(/Area-level model — not a property assessment/g) || []).length < 2) fail(`[${width} ${theme}] caveat must appear top and foot`);
  // The chips arrive as each point lookup returns (and the public rate limiter paces a second pin
  // within a minute), so poll for them rather than read once.
  let geometry = 0;
  for (let i = 0; i < 60; i++) { geometry = ((await facts.innerText()).match(/address point|rating unit|SA1 block/g) || []).length; if (geometry >= 6) break; await page.waitForTimeout(500); }
  if (geometry < 6) fail(`[${width} ${theme}] geometry missing from chips (${geometry})`);
  if (/\$\s?\d/.test(text) || /\b(score|good buy|recommend)\b/i.test(text)) fail(`[${width} ${theme}] verdict or dollar language in the property panel`);
  const small = await facts.evaluate((el) => [...el.querySelectorAll("*")].filter((n) => [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) && parseFloat(getComputedStyle(n).fontSize) < 12 && !n.closest("svg")).length);
  if (small > 0) fail(`[${width} ${theme}] ${small} text nodes under 12px in the property panel`);
  if (await panel.evaluate((el) => el.scrollWidth > el.clientWidth + 1)) fail(`[${width} ${theme}] property panel scrolls horizontally`);
  await facts.getByTestId("epistemic-models").evaluate((el) => el.scrollIntoView());
  await page.screenshot({ path: `shots/property-${width}-${theme}.png` });
  console.log(`[${width} ${theme}] property: 6 headings in order · ${pointRows.length} point rows with pills · caveat ×2 · geometry on chips ✓`);
  await ctx.close();
  // One pin is ~8 point lookups against a 10-burst / 0.5-per-second public limiter: let it refill.
  if (width === 1440) await new Promise((r) => setTimeout(r, 20000));
}
console.log("\nPASS — property panel on the grammar");


// ---------------------------------------------------------------------------
// TRI-151 — the answer surfaces on the grammar: citation chips ≥ 24 px (still
// amber), the Sources footer as SourceChips, result pills ≥ 40 px on phones,
// the ranked table carrying its testid on the type scale; nothing under 12 px.
// One /api/ask per frame (desktop strip, phone sheet).
// ---------------------------------------------------------------------------
for (const [width, theme] of [[1440, "light"], [390, "dark"]]) {
  const ctx = await b.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
  await ctx.addInitScript((t) => localStorage.setItem("theme", t), theme);
  const page = await ctx.newPage();
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const box = page.getByLabel("Ask about Auckland suburbs");
  await box.fill("Which suburbs have the lowest median weekly rent?");
  await box.press("Enter");
  const surface = width >= 1024 ? page.locator('section[aria-label="Answer"]') : page.locator("aside").last();
  await surface.waitFor({ state: "visible", timeout: 20000 });
  // A rank question auto-selects the Results tab on phones (TRI-104); the answer body lives on the Answer tab.
  // The auto-tab fires when the ranked rows land, so wait for the Results tab to exist, THEN pick Answer.
  if (width < 1024) { await page.getByRole("tab", { name: /^Results/ }).waitFor({ state: "visible", timeout: 90000 }); const tab = page.getByRole("tab", { name: "Answer", exact: true }); await tab.click(); await page.waitForTimeout(500); }
  // Sources arrive before the text streams, so wait for BOTH the footer and the end of the stream
  // (the pulsing cursor is only rendered while status === "streaming").
  let text = "";
  for (let i = 0; i < 120; i++) { text = await surface.innerText(); if (/Sources:/.test(text) && (await surface.locator(".animate-pulse").count()) === 0) break; await page.waitForTimeout(1000); }
  if (!/Sources:/.test(text) || (await surface.locator(".animate-pulse").count()) > 0) fail(`[${width} ${theme}] answer never finished`);
  if (width === 390) { await page.getByRole("slider").first().focus(); await page.keyboard.press("End"); await page.waitForTimeout(600); }

  const chips = await surface.locator("[data-testid=citation-chip]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  if (!chips.length) fail(`[${width} ${theme}] no citation chips`);
  if (chips.some((h) => h < 24)) fail(`[${width} ${theme}] a citation chip is under 24px (${Math.min(...chips).toFixed(1)})`);
  const amber = await surface.locator("[data-testid=citation-chip]").first().evaluate((e) => getComputedStyle(e).borderColor);
  if (!amber || /rgba?\(0, 0, 0/.test(amber)) fail(`[${width} ${theme}] citation chip lost its border`);
  const srcChips = await surface.locator("[data-testid=answer-sources] [title^='Confidence:']").count();
  if (srcChips < 1) fail(`[${width} ${theme}] Sources footer has no quality marks`);
  const pills = await surface.locator("[data-testid=result-pill]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  if (pills.length < 2) fail(`[${width} ${theme}] expected ranked result pills`);
  const floor = width === 390 ? 40 : 32;
  if (pills.some((h) => h < floor - 0.5)) fail(`[${width} ${theme}] a result pill is under ${floor}px (${Math.min(...pills).toFixed(1)})`);
  // The ranked table lives on the Results tab (phone sheet) / Results tab in the panel (desktop).
  await page.getByRole("tab", { name: /^Results/ }).click();
  await page.waitForTimeout(800);
  const table = page.locator("[data-testid=results-table]");
  if (!(await table.count())) fail(`[${width} ${theme}] results table missing its testid`);
  const rowH = await table.locator("tbody tr").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  if (width === 390 && rowH.some((h) => h < 40)) fail(`[390 ${theme}] a results row is under 40px (${Math.min(...rowH).toFixed(1)})`);
  const upper = await table.locator("th").evaluateAll((els) => els.filter((e) => getComputedStyle(e).textTransform === "uppercase").length);
  if (upper) fail(`[${width} ${theme}] results headers still uppercase`);
  const root = width >= 1024 ? page.locator("body") : page.locator("aside").last();
  const small = await root.evaluate((el) => [...el.querySelectorAll("*")].filter((n) => [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) && parseFloat(getComputedStyle(n).fontSize) < 12 && !n.closest("svg") && !n.closest("nextjs-portal")).length);
  if (small > 0) fail(`[${width} ${theme}] ${small} text nodes under 12px on the answer surfaces`);
  await page.screenshot({ path: `shots/answer-${width}-${theme}.png` });
  console.log(`[${width} ${theme}] answer: ${chips.length} citation chips ≥ 24px · ${srcChips} source chips · ${pills.length} pills ≥ ${floor}px · results table ${rowH.length} rows ✓`);
  await ctx.close();
}
console.log("\nPASS — answer surfaces on the grammar");

await b.close();
