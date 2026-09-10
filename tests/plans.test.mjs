import { test } from "node:test";
import assert from "node:assert/strict";
import { PLANS, MB, MAX_FILE_BYTES, quotaBytes, normPlan, planLabel, fmtQuota, fits } from "../js/lib/scores/plans.js";

test("plans: free is the promotional 100 MB, premium 5 GB, unknown plans read as free", () => {
  assert.equal(quotaBytes("free"), 100 * MB);
  assert.equal(quotaBytes("premium"), 5 * 1024 * MB);
  assert.equal(quotaBytes("gold"), 100 * MB);
  assert.equal(quotaBytes(undefined), 100 * MB);
  assert.equal(normPlan("premium"), "premium"); assert.equal(normPlan(null), "free");
  assert.equal(planLabel("free"), "promotional"); assert.equal(planLabel("premium"), "premium");
  assert.equal(Object.keys(PLANS).length, 2);
  assert.ok(MAX_FILE_BYTES < 100 * MB, "per-file cap stays under Cloudflare's request body limit");
});

test("quota arithmetic: fits / over; the quota is spoken in MB and GB", () => {
  assert.deepEqual(fits("free", 0, 30 * MB), { ok: true, used: 0, quota: 100 * MB, over: 0 });
  assert.equal(fits("free", 80 * MB, 30 * MB).ok, false);
  assert.equal(fits("free", 80 * MB, 30 * MB).over, 10 * MB);
  assert.equal(fits("premium", 4 * 1024 * MB, 60 * MB).ok, true);
  assert.equal(fits("free", -5, -5).ok, true, "negative inputs are clamped");
  assert.equal(fmtQuota(100 * MB), "100 MB");
  assert.equal(fmtQuota(5 * 1024 * MB), "5 GB");
  assert.equal(fmtQuota(1.5 * 1024 * MB), "1.5 GB");
  assert.equal(fmtQuota(60 * MB), "60 MB");
  assert.equal(fmtQuota(512 * 1024), "512 KB");
});
