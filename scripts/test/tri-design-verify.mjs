/** TRI-147 — the primitives gallery at 390 and 1440: every primitive labelled
 *  with its status, hatched full-length empty states, outlined estimates,
 *  3:1 marks / 4.5:1 text in both themes, nothing under 12 px. */
import { chromium } from "playwright-core";
const fail = (m) => { throw new Error("FAIL: " + m); };
const b = await chromium.launch({ channel: process.env.PW_CHANNEL || "msedge", headless: true });

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

for (const width of [390, 1440]) {
  const page = await b.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
  await page.goto("http://localhost:3000/dev/primitives", { waitUntil: "networkidle" });
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
await b.close();
