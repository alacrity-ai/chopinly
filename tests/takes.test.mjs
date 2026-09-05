import { test } from "node:test";
import assert from "node:assert/strict";
import { createLogbook } from "../js/lib/logbook.js";
import { KINDS, pick, toEnvelope, fromEnvelope, tombEnvelope } from "../js/lib/merge.js";
import { downsample, rms, fmtDur, fmtBytes } from "../js/lib/takes/peaks.js";

function memStore() { const m = new Map(); return { get: (k, f) => (m.has(k) ? JSON.parse(m.get(k)) : f), set: (k, v) => m.set(k, JSON.stringify(v)) }; }
const NOON = new Date(2026, 8, 4, 12).getTime();
function fresh() { let t = NOON; const lb = createLogbook({ store: memStore(), now: () => t }); return { lb, tick: (ms) => { t += ms; } }; }

test("takes: add / list / star / delete, tombstones + pending like notes", () => {
  const { lb, tick } = fresh();
  const g = lb.addGoal({ name: "Waltz", composer: "Chopin" });
  const h = lb.addGoal({ name: "Scales", type: "technique" });
  const a = lb.addTake({ goalId: g.id, durationMs: 42000, size: 512000, mime: "audio/webm;codecs=opus", peaks: [0.1, 0.5, 1.2, -1, "0.333"] });
  assert.deepEqual(a.peaks, [0.1, 0.5, 1, 0, 0.33], "peaks clamped to 0..1 and rounded");
  assert.equal(a.starred, false);
  tick(60000);
  const b = lb.addTake({ goalId: g.id, durationMs: 30000 });
  const c = lb.addTake({ goalId: h.id, durationMs: 5000 });
  assert.deepEqual(lb.takes().map((t) => t.id), [c.id, b.id, a.id], "newest first");
  assert.deepEqual(lb.takes({ goalId: g.id }).map((t) => t.id), [b.id, a.id]);
  assert.equal(lb.takes({ day: lb.today() }).length, 3);
  assert.equal(lb.takes({ day: "2020-01-01" }).length, 0);
  assert.ok(lb.takeDays(g.id).has(lb.today()));
  lb.starTake(a.id);
  assert.equal(lb.take(a.id).starred, true);
  lb.starTake(a.id, false);
  assert.equal(lb.take(a.id).starred, false);
  assert.throws(() => lb.addTake({ goalId: g.id, durationMs: 0 }), /between a moment/);
  assert.throws(() => lb.addTake({ goalId: g.id, durationMs: 11 * 60000 }), /ten minutes/);
  assert.throws(() => lb.addTake({ goalId: "nope", durationMs: 1000 }), /no goal/);
  lb.deleteTake(b.id);
  assert.equal(lb.takes({ goalId: g.id }).length, 1);
  assert.ok(lb.doc.deleted.some((t) => t.kind === "take" && t.id === b.id), "tombstoned");
  assert.ok(lb.doc.pending.includes(`take:${a.id}`) && lb.doc.pending.includes(`take:${b.id}`));
  lb.deleteGoal(h.id);
  assert.equal(lb.take(c.id), null, "goal delete cascades to its takes");
  assert.ok(lb.doc.deleted.some((t) => t.kind === "take" && t.id === c.id));
});

test("takes sync: envelopes round-trip and remote takes apply in order", () => {
  assert.ok(KINDS.includes("take"));
  const { lb } = fresh();
  const g = lb.addGoal({ name: "Waltz" });
  const a = lb.addTake({ goalId: g.id, durationMs: 42000, peaks: [0.2, 1] });
  const envs = lb.pendingEnvelopes();
  const te = envs.find((e) => e.kind === "take");
  assert.equal(te.id, a.id);
  assert.deepEqual(Object.keys(te.body).sort(), ["durationMs", "goalId", "mime", "peaks", "recordedAt", "size", "starred"]);
  assert.ok(JSON.stringify(te.body).length < 8192, "well under the sync size cap");
  assert.deepEqual(fromEnvelope(toEnvelope("take", a)), a);
  // a second device: same goal, a new take, and a star on ours
  const other = createLogbook({ store: memStore(), now: () => NOON + 5000 });
  other.applyRemote(lb.allEnvelopes());
  assert.equal(other.takes().length, 1, "arrived");
  other.starTake(a.id, true);
  const remoteTake = { ...toEnvelope("take", { id: "t2", goalId: g.id, recordedAt: NOON + 1000, durationMs: 9000, size: 1, mime: "audio/mp4", starred: false, peaks: [], updatedAt: NOON + 1000 }) };
  lb.applyRemote([...other.pendingEnvelopes(), remoteTake]);
  assert.equal(lb.take(a.id).starred, true, "the star came back");
  assert.equal(lb.takes().length, 2);
  lb.applyRemote([tombEnvelope({ id: "t2", kind: "take", at: NOON + 9000 })]);
  assert.equal(lb.take("t2"), null, "a remote delete removes the row");
  const tomb = tombEnvelope({ id: a.id, kind: "take", at: NOON + 1 }), cur = toEnvelope("take", lb.take(a.id));
  assert.equal(pick(cur, tomb), cur, "an older tombstone loses to the newer star");
});

test("peaks: downsample keeps the loudest of each bin and normalizes; rms, durations, bytes", () => {
  const s = Array.from({ length: 480 }, (_, i) => (i % 10 === 0 ? 0.5 : 0.1));
  const p = downsample(s, 48);
  assert.equal(p.length, 48);
  assert.ok(p.every((v) => v === 1), "every bin holds a 0.5 spike → normalized to 1");
  assert.deepEqual(downsample([], 4), [0, 0, 0, 0]);
  assert.deepEqual(downsample([0, 0.25, 0, 0.5], 2), [0.5, 1]);
  assert.equal(rms(new Float32Array(1024)), 0);
  assert.ok(rms(new Float32Array(1024).fill(0.3)) > 0.5);
  assert.equal(fmtDur(42000), "0:42");
  assert.equal(fmtDur(3905000), "1:05:05");
  assert.equal(fmtBytes(512), "512 B");
  assert.equal(fmtBytes(840 * 1024), "840 KB");
  assert.equal(fmtBytes(12.4 * 1048576), "12 MB");
  assert.equal(fmtBytes(1.5 * 1048576), "1.5 MB");
});
