/**
 * TRI-110 — does the figure next to a citation marker actually match the row
 * it cites?
 *
 * `citations_ok` only proves a {{cN}} marker RESOLVES to a returned row. It
 * never compares the number written beside it to that row's value, so an
 * answer can invent a figure, cite a real row, and score 22/22. This module
 * adds the missing half.
 *
 * Design bias: FALSE NEGATIVES OVER FALSE POSITIVES. A scorer that cries wolf
 * trains you to ignore it. A first attempt at this used a loose regex and
 * reported 11 mismatches on one question that were all real — it had matched
 * markdown list numbering ("1.", "3.") instead of the cited values. So the
 * extractor here refuses to guess: when it can't confidently bind a number to
 * a marker, it records `unbound` and checks nothing.
 */

/** Numbers the answer legitimately produces that are in no row. */
const DERIVED_HINT =
  /\b(\d+(?:\.\d+)?)\s*%?\s*(cheaper|dearer|more|less|higher|lower|under|over|above|below|difference)\b/i;

/**
 * Pull the figure bound to each marker.
 *
 * Scans backwards from the marker to the nearest number, but stops at a
 * sentence or list boundary so it can't reach into a neighbouring claim, and
 * rejects ordinals ("1." at the start of a list item) which are structure, not
 * data.
 */
export function boundFigures(text) {
  const out = [];
  const re = /\{\{c(\d+)\}\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1]);
    // Look back over a window that cannot cross a sentence end or a newline.
    const before = text.slice(0, m.index);
    const clause = before.split(/(?<=[.!?;:])\s|\n/).pop() ?? "";
    // Strip ALL markers before looking for numbers — "{{c1}}" contains the
    // digit 1, and a run of markers on one shared claim ({{c1}}{{c2}}{{c3}})
    // would otherwise make the scorer read "1" as the cited figure and report
    // a mismatch against every row. Markers are never figures.
    const trailing = clause.replace(/\{\{c\d+\}\}/g, " ");
    const nums = [...trailing.matchAll(/(-?\$?\d[\d,]*(?:\.\d+)?)\s*(%|\/wk|\/week|min|km)?/g)]
      // A bare four-digit year is a vintage ("AUP July 2026", "Census 2023"),
      // never the cited value.
      .filter(
        (x) => !(/^\d{4}$/.test(x[1]) && !x[2] && Number(x[1]) >= 1900 && Number(x[1]) <= 2099),
      )
      // An ordinal at the very start of the clause is list structure.
      .filter((x) => !(/^\s*\d+[.)]\s/.test(trailing) && x.index <= 3))
      // Arithmetic the answer computed rather than quoted.
      .filter((x) => !DERIVED_HINT.test(trailing.slice(Math.max(0, x.index - 40), x.index + 20)));
    if (!nums.length) {
      out.push({ n, candidates: null, reason: "no citable number in clause" });
      continue;
    }
    out.push({
      n,
      candidates: nums.map((x) => ({
        value: Number(x[1].replace(/[$,]/g, "")),
        raw: x[0].trim(),
      })),
    });
  }
  return out;
}

/**
 * The answer prompt explicitly permits "approximately", so rounding is correct
 * behaviour, not a miss. Accept anything that rounds to the stated figure at
 * its own precision, plus a 1% band for larger numbers.
 */
export function matches(claimed, actual) {
  if (!Number.isFinite(claimed) || !Number.isFinite(actual)) return false;
  if (claimed === actual) return true;
  const decimals = (String(claimed).split(".")[1] ?? "").length;
  const step = Math.pow(10, -decimals);
  if (Math.abs(claimed - actual) <= step / 2) return true; // rounded to this precision
  // "approximately $1,200" for 1214, "about 26 min" for 26.4
  const magnitude = Math.pow(10, Math.max(0, String(Math.round(actual)).length - 2));
  if (Math.abs(claimed - actual) <= magnitude / 2) return true;
  return Math.abs(claimed - actual) / Math.abs(actual) <= 0.01;
}

/**
 * Returns { checked, grounded, mismatches[], unbound } for one answer.
 * `values_grounded` is true when nothing checkable disagreed — a question with
 * no bindable figures is not a failure, it's simply unmeasured here.
 */
export function scoreGrounding(text, sources) {
  const byN = new Map(sources.map((s) => [s.n, s]));
  const bound = boundFigures(text);
  const mismatches = [];
  let checked = 0;
  for (const b of bound) {
    const row = byN.get(b.n);
    if (!row || !b.candidates?.length) continue;
    checked++;
    const actual = Number(row.value);
    // Grounded if ANY number in the clause is the row's value. Picking "the"
    // number is guesswork - a clause legitimately carries several ("$710/wk,
    // down 21.1%, 2026 Q1") and only one is the citation's subject.
    const hit = b.candidates.some((c) => matches(c.value, actual) || matches(Math.abs(c.value), Math.abs(actual)));
    if (!hit) {
      mismatches.push({
        marker: b.n,
        claimed: b.candidates[b.candidates.length - 1].value,
        actual,
        raw: b.candidates.map((c) => c.raw).join(" / "),
        row: `${row.suburb} — ${row.label}`,
      });
    }
  }
  return {
    values_checked: checked,
    values_grounded: mismatches.length === 0,
    value_mismatches: mismatches,
    values_unbound: bound.length - checked,
  };
}
