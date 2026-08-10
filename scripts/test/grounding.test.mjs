/** TRI-110 — the grounding scorer must not cry wolf. node --test */
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreGrounding, matches } from "../eval/grounding.mjs";

const rows = [
  { n: 1, value: 675, suburb: "Takapuna Central", label: "Median rent" },
  { n: 2, value: 1214, suburb: "Takapuna Central", label: "Upper-quartile rent" },
  { n: 3, value: 581, suburb: "Takapuna Central", label: "Lower-quartile rent" },
];

test("honest answer is grounded", () => {
  const r = scoreGrounding("Median rent is $675/wk {{c1}}, lower quartile $581/wk {{c3}}.", rows);
  assert.equal(r.values_grounded, true);
  assert.equal(r.values_checked, 2);
});

test("approximately + rounding is accepted", () => {
  const r = scoreGrounding("Roughly $1,200/wk {{c2}} at the top end.", rows);
  assert.equal(r.values_grounded, true, JSON.stringify(r.value_mismatches));
});

test("an invented figure is caught", () => {
  const r = scoreGrounding("Median rent is $9,999/wk {{c1}}.", rows);
  assert.equal(r.values_grounded, false);
  assert.equal(r.value_mismatches[0].actual, 675);
});

test("a swapped row is caught", () => {
  const r = scoreGrounding("The lower quartile is $1,214/wk {{c3}}.", rows);
  assert.equal(r.values_grounded, false);
});

test("markdown list numbering is NOT read as a figure", () => {
  // the real false-positive that broke the first attempt
  const t = "1. Tamaki West {{c2}}\n2. Ferguson {{c3}}";
  const r = scoreGrounding(t, [
    { n: 2, value: 100, suburb: "Tamaki West", label: "Intensification" },
    { n: 3, value: 100, suburb: "Ferguson", label: "Intensification" },
  ]);
  assert.equal(r.values_grounded, true, JSON.stringify(r.value_mismatches));
  assert.equal(r.values_checked, 0);
});

test("a run of markers on one claim binds only the first", () => {
  const src = Array.from({ length: 3 }, (_, i) => ({ n: i + 1, value: 100, suburb: "X", label: "Y" }));
  const r = scoreGrounding("All three sit at 100% {{c1}}{{c2}}{{c3}}.", src);
  assert.equal(r.values_grounded, true, JSON.stringify(r.value_mismatches));
});

test("a derived comparison is not treated as a cited figure", () => {
  const r = scoreGrounding("Takapuna is 19% cheaper than Ponsonby {{c1}}.", rows);
  assert.equal(r.values_grounded, true, JSON.stringify(r.value_mismatches));
});

test("a street address number is NOT read as a figure", () => {
  // Full-suite run 2026-08-09: "resolved to 4 Osterley Way" flagged against
  // a 23.5-min commute row. The first marker still checks; the second binds
  // nothing.
  const t =
    "The drive is approximately 23.5 min {{c1}}. The destination was resolved to 4 Osterley Way, Manukau {{c1}}.";
  const r = scoreGrounding(t, [{ n: 1, value: 23.5, suburb: "Grey Lynn West", label: "Drive time" }]);
  assert.equal(r.values_grounded, true, JSON.stringify(r.value_mismatches));
  assert.equal(r.values_checked, 1);
});

test("temporal 'over the last N months' does not swallow the figure", () => {
  // Full-suite run 2026-08-09: "fell by 15.1% over the last 12 months" had
  // its genuine 15.1 excluded as derived arithmetic, leaving a neighbouring
  // figure to mismatch. Sign lives in prose ("fell"), so |15.1| vs -15.1.
  const t = "Ponsonby West dropped by 21.1% and Takapuna Central by 15.1% over the last 12 months {{c2}}{{c7}}.";
  const r = scoreGrounding(t, [
    { n: 2, value: -21.1, suburb: "Ponsonby West", label: "Rent change (12 months)" },
    { n: 7, value: -15.1, suburb: "Takapuna Central", label: "Rent change (12 months)" },
  ]);
  assert.equal(r.values_grounded, true, JSON.stringify(r.value_mismatches));
  assert.equal(r.values_checked, 2);
});

test("a mis-cited row is still caught (q23 regression)", () => {
  // The one TRUE positive from the same run: median figure cited against the
  // lower-quartile row. The fixes above must not un-catch it.
  const r = scoreGrounding("Belmont has the highest median at $830/week {{c14}}.", [
    { n: 13, value: 830, suburb: "Belmont (Auckland)", label: "Median rent (new tenancies)" },
    { n: 14, value: 580, suburb: "Belmont (Auckland)", label: "Lower-quartile rent" },
  ]);
  assert.equal(r.values_grounded, false);
  assert.equal(r.value_mismatches[0].actual, 580);
});

test("a restated constraint bound is NOT read as a figure", () => {
  // Full-suite run 2026-08-09 (second pass): "below $650 ... within 30
  // minutes" are the QUESTION's bounds, honestly restated over a marker run.
  const t = "These suburbs all have median rents well below $650 per week and are within 30 minutes' drive {{c1}}{{c3}}.";
  const r = scoreGrounding(t, [
    { n: 1, value: 148, suburb: "Point England North", label: "Median weekly rent" },
    { n: 3, value: 178, suburb: "Ōtara West", label: "Median weekly rent" },
  ]);
  assert.equal(r.values_grounded, true, JSON.stringify(r.value_mismatches));
  assert.equal(r.values_checked, 0);
});

test("a collective marker run with summary figures is unmeasured, not mismatched", () => {
  // Same run: range endpoints cited individually check; the trailing 4-marker
  // run re-citing every row against those two endpoints must not flag.
  const t =
    "Drive times range from 11 minutes for Panmure West {{c14}} to 16.9 minutes for Wiri North {{c10}}, all routed without live traffic {{c2}}{{c4}}{{c10}}{{c14}}.";
  const r = scoreGrounding(t, [
    { n: 2, value: 16, suburb: "Point England North", label: "Drive time" },
    { n: 4, value: 13.3, suburb: "Ōtara West", label: "Drive time" },
    { n: 10, value: 16.9, suburb: "Wiri North", label: "Drive time" },
    { n: 14, value: 11, suburb: "Panmure West", label: "Drive time" },
  ]);
  assert.equal(r.values_grounded, true, JSON.stringify(r.value_mismatches));
  // The two individually-cited endpoints still check.
  assert.equal(r.values_checked, 2);
});

test("a rate denominator ('per 1,000') is NOT read as a figure", () => {
  // Full-suite run 2026-08-09 (third pass): the 1,000s inflated the candidate
  // count past the marker-run size, defeating the collective-claim guard on
  // an honest "range from 0 to 13.4 per 1,000" claim.
  const t = "Homai East leads at 79.6 per 1,000 dwellings, the others range from 0 to 13.4 per 1,000 {{c3}}{{c7}}{{c11}}{{c15}}.";
  const r = scoreGrounding(t, [
    { n: 3, value: 79.6, suburb: "Homai East", label: "Consenting rate", unit: "/1k dwellings" },
    { n: 7, value: 2.8, suburb: "Randwick Park East", label: "Consenting rate", unit: "/1k dwellings" },
    { n: 11, value: 0, suburb: "Cheltenham", label: "Consenting rate", unit: "/1k dwellings" },
    { n: 15, value: 13.4, suburb: "Randwick Park West", label: "Consenting rate", unit: "/1k dwellings" },
  ]);
  assert.equal(r.values_grounded, true, JSON.stringify(r.value_mismatches));
});

test("a non-quotable row (cosine similarity) is cited, never checked", () => {
  // Same run: {{c12}} cites the Profile-similarity row as selection evidence;
  // the prose never says "0.8134", and the clause's rent figures must not be
  // compared against it.
  const t = "Whangaparāoa Central shows a median of approximately $710/wk {{c11}} (low confidence) {{c12}}.";
  const r = scoreGrounding(t, [
    { n: 11, value: 710, suburb: "Whangaparāoa Central", label: "Median rent (new tenancies)", unit: "$/week" },
    { n: 12, value: 0.8134, suburb: "Whangaparāoa Central", label: "Profile similarity", unit: "cosine" },
  ]);
  assert.equal(r.values_grounded, true, JSON.stringify(r.value_mismatches));
  assert.equal(r.values_checked, 1);
});

test("a no-figure citation does not inherit an earlier marker's figure", () => {
  // Full-suite run 2026-08-09 (fourth pass): "Milldale at approximately 573
  // {{c3}}, with Drury West {{c4}} and Orewa West {{c5}} also notably active"
  // — c4/c5 cite rows without quoting them; 573 belongs to c3 alone.
  const t =
    "The strongest are Ara Hill at approximately 1,282 {{c1}}, and Milldale at approximately 573 {{c3}}, with Drury West {{c4}} and Orewa West {{c5}} also notably active.";
  const r = scoreGrounding(t, [
    { n: 1, value: 1282.1, suburb: "Ara Hill", label: "Consenting rate", unit: "/1k dwellings" },
    { n: 3, value: 573, suburb: "Milldale", label: "Consenting rate", unit: "/1k dwellings" },
    { n: 4, value: 554.5, suburb: "Drury West", label: "Consenting rate", unit: "/1k dwellings" },
    { n: 5, value: 543.2, suburb: "Orewa West", label: "Consenting rate", unit: "/1k dwellings" },
  ]);
  assert.equal(r.values_grounded, true, JSON.stringify(r.value_mismatches));
  assert.equal(r.values_checked, 2);
});

test("'under a <scenario>' does not swallow the figure", () => {
  // q16 phrasing: "under" followed by a noun phrase is context, not a
  // comparison — the 100% is the cited figure. (The stray "1" from "+1m" is
  // harmless under any-match.)
  const t = "That figure rises to approximately 100% under a +1m sea-level-rise scenario {{c4}}.";
  const r = scoreGrounding(t, [
    { n: 4, value: 99.97, suburb: "Parakai", label: "Coastal inundation (+1m)", unit: "%" },
  ]);
  assert.equal(r.values_grounded, true, JSON.stringify(r.value_mismatches));
  assert.equal(r.values_checked, 1);
});

test("rounding band", () => {
  assert.equal(matches(1200, 1214), true); // nearest-100
  assert.equal(matches(1210, 1214), true); // nearest-10
  assert.equal(matches(16, 16.9), true); // truncated at own precision
  assert.equal(matches(675, 675), true);
  assert.equal(matches(9999, 675), false);
  // q9 2026-08-10 — "$145" against a row of 148 is a misquote, not a
  // rounding (nearest-5 of 148 is 150). The old half-magnitude band
  // accepted it; the judge caught it.
  assert.equal(matches(145, 148), false);
});
