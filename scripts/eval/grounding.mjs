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

/**
 * Numbers the answer legitimately produces that are in no row — derived
 * comparisons like "19% cheaper". Anchored AFTER a candidate number, so a
 * comparative word elsewhere in the clause can't disqualify an unrelated
 * figure. "under/over/above/below" only count as comparative when a value
 * follows ("21% over the median rent") — followed by a noun phrase they mean
 * time or context, not arithmetic: "fell 15.1% over the last 12 months",
 * "100% under a +1m sea-level-rise scenario" are quoted figures (both flagged
 * as false positives in full-suite runs 2026-08-09).
 */
const DERIVED_AFTER =
  /^\s*%?\s*(?:cheaper|dearer|more|less|higher|lower|difference|(?:under|over|above|below)(?=\s+(?:approximately\s+|about\s+)?\$?\d))/i;

/**
 * A number immediately preceded by a bound word is a constraint being
 * restated, not a quoted row value: "rents well below $650", "within 30
 * minutes' drive". Full-suite run 2026-08-09 (second pass): an honest answer
 * restating the question's own bounds over an 8-marker run was flagged
 * against every cited row.
 */
const BOUND_BEFORE = /\b(?:under|over|above|below|within|exceeding|least|most|up to|less than|more than|fewer than|per)\s+$/i;

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
  // Pre-pass: group adjacent markers (nothing but whitespace between) into
  // runs. A run of k markers is how the model cites a COLLECTIVE claim ("all
  // eight suburbs ... {{c1}}{{c3}}...{{c15}}"); the clause then carries
  // summary numbers (bounds, range endpoints), not one figure per row, and
  // checking each marker against them flags honest answers.
  const allMarkers = [...text.matchAll(/\{\{c\d+\}\}/g)];
  const runSizes = new Map();
  // A figure that sits BEFORE an earlier marker was claimed by that marker —
  // it can't also bind to a later one ("Milldale at 573 {{c3}}, with Drury
  // West {{c4}} also active" must not check 573 against c4's row). So each
  // marker's window starts after the previous marker outside its own run;
  // markers inside one adjacent run share the window of the run's first
  // marker, which is what lets an equal-count run still check per-row.
  const windowStarts = new Map();
  let runStart = 0;
  for (let i = 1; i <= allMarkers.length; i++) {
    const prev = allMarkers[i - 1];
    const adjacent =
      i < allMarkers.length && /^\s*$/.test(text.slice(prev.index + prev[0].length, allMarkers[i].index));
    if (!adjacent) {
      const beforeRun = runStart > 0 ? allMarkers[runStart - 1] : null;
      for (let j = runStart; j < i; j++) {
        runSizes.set(allMarkers[j].index, i - runStart);
        windowStarts.set(allMarkers[j].index, beforeRun ? beforeRun.index + beforeRun[0].length : 0);
      }
      runStart = i;
    }
  }
  const re = /\{\{c(\d+)\}\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1]);
    const runSize = runSizes.get(m.index) ?? 1;
    // Look back over a window that cannot cross a sentence end, a newline, or
    // the previous citation's claim.
    const before = text.slice(windowStarts.get(m.index) ?? 0, m.index);
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
      // A number leading straight into a Capitalised word is an address or
      // proper noun ("4 Osterley Way"), not a metric value. Cited figures are
      // followed by a unit, punctuation, or lowercase prose. (Full-suite run
      // 2026-08-09: a destination street number was read as the cited figure.)
      .filter((x) => !/^\s*[A-Z][a-z]/.test(trailing.slice(x.index + x[0].length)))
      // A restated constraint ("well below $650", "within 30 minutes").
      .filter((x) => !BOUND_BEFORE.test(trailing.slice(0, x.index)))
      // Arithmetic the answer computed rather than quoted.
      .filter((x) => !DERIVED_AFTER.test(trailing.slice(x.index + x[1].length)));
    if (!nums.length) {
      out.push({ n, runSize, candidates: null, reason: "no citable number in clause" });
      continue;
    }
    out.push({
      n,
      runSize,
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
/**
 * Rows whose value the answer legitimately cites WITHOUT quoting: a cosine
 * similarity score is why a suburb was selected, and the prose never says
 * "0.8351". Checking such markers flags honest answers (full-suite run
 * 2026-08-09, third pass).
 */
const NON_QUOTABLE_UNITS = new Set(["cosine"]);

export function scoreGrounding(text, sources) {
  const byN = new Map(sources.map((s) => [s.n, s]));
  const bound = boundFigures(text);
  const mismatches = [];
  let checked = 0;
  for (const b of bound) {
    const row = byN.get(b.n);
    if (!row || !b.candidates?.length) continue;
    if (NON_QUOTABLE_UNITS.has(row.unit)) continue;
    // A run of k markers carrying fewer than k citable figures is a
    // collective claim (set membership, a range) — its numbers don't map
    // one-per-row, so it's unmeasured here, not mismatched. Equal counts
    // still check: the q23 mis-citation (4 markers, 4 figures, one pointing
    // at the wrong row) stays caught.
    if (b.runSize > b.candidates.length) continue;
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
