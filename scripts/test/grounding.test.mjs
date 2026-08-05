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

test("rounding band", () => {
  assert.equal(matches(1200, 1214), true);
  assert.equal(matches(675, 675), true);
  assert.equal(matches(9999, 675), false);
});
