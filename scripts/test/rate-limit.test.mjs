/**
 * TRI-142 — the two rate-limit buckets. Run: npm run test:unit
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { allowRequest, BUCKETS, resetRateLimits } from "../../lib/commute/rate-limit.ts";

beforeEach(() => resetRateLimits());

test("the metered bucket keeps its tight burst (10) and refill (0.5/s)", () => {
  const t0 = 1_000_000;
  for (let i = 0; i < BUCKETS.metered.size; i++) assert.equal(allowRequest("1.1.1.1", "metered", t0), true, `call ${i + 1} should pass`);
  assert.equal(allowRequest("1.1.1.1", "metered", t0), false, "11th call in the same instant is refused");
  assert.equal(allowRequest("1.1.1.1", "metered", t0 + 2000), true, "2 s later one token has refilled");
  assert.equal(allowRequest("1.1.1.1", "metered", t0 + 2000), false);
});

test("the point bucket fits three pins back to back (~8 lookups each)", () => {
  const t0 = 2_000_000;
  for (let i = 0; i < 24; i++) assert.equal(allowRequest("2.2.2.2", "point", t0), true, `lookup ${i + 1} should pass`);
  assert.equal(BUCKETS.point.size >= 24, true);
});

test("the point bucket still has a wall", () => {
  const t0 = 3_000_000;
  let passed = 0;
  for (let i = 0; i < 100; i++) if (allowRequest("3.3.3.3", "point", t0)) passed++;
  assert.equal(passed, BUCKETS.point.size);
  assert.equal(allowRequest("3.3.3.3", "point", t0 + 1000), true, "1 s later one token has refilled");
});

test("the two buckets are independent per IP", () => {
  const t0 = 4_000_000;
  for (let i = 0; i < BUCKETS.metered.size; i++) allowRequest("4.4.4.4", "metered", t0);
  assert.equal(allowRequest("4.4.4.4", "metered", t0), false, "metered exhausted");
  assert.equal(allowRequest("4.4.4.4", "point", t0), true, "point bucket untouched");
  assert.equal(allowRequest("5.5.5.5", "metered", t0), true, "another IP has its own bucket");
});

test("the default kind is metered (geocode/commute callers unchanged)", () => {
  const t0 = 5_000_000;
  for (let i = 0; i < BUCKETS.metered.size; i++) allowRequest("6.6.6.6", undefined, t0);
  assert.equal(allowRequest("6.6.6.6", undefined, t0), false);
});
