/**
 * TRI-51 — quota-floor decision unit test.
 * Run: node --test scripts/test/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { belowQuotaFloor, QUOTA_FLOOR } from "../../lib/commute/ors.ts";

test("unknown quota (null) never blocks — a cold instance must be able to probe", () => {
  assert.equal(belowQuotaFloor(null), false);
});

test("above or at the floor does not block", () => {
  assert.equal(belowQuotaFloor(QUOTA_FLOOR), false);
  assert.equal(belowQuotaFloor(QUOTA_FLOOR + 1), false);
  assert.equal(belowQuotaFloor(1999), false);
});

test("below the floor blocks", () => {
  assert.equal(belowQuotaFloor(QUOTA_FLOOR - 1), true);
  assert.equal(belowQuotaFloor(0), true);
});

test("custom floor is respected", () => {
  assert.equal(belowQuotaFloor(5, 3), false);
  assert.equal(belowQuotaFloor(2, 3), true);
});
