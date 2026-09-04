import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createLogbook, dayKey, dayStart, addDays, SCHEMA_VERSION, TYPES, SORTS,
  BUILTIN_SIGHTSINGING, BUILTIN_FREEPRACTICE, MIN_SEGMENT_MS,
} from "../js/lib/logbook.js";

function memStore() {
  const m = new Map();
  return { get: (k, f) => (m.has(k) ? JSON.parse(m.get(k)) : f), set: (k, v) => m.set(k, JSON.stringify(v)), m };
}
// A fake clock anchored at local noon so day math never straddles midnight.
const NOON = new Date(2026, 8, 4, 12).getTime(); // Fri 4 Sep 2026
function fresh(start = NOON) {
  let t = start;
  const store = memStore();
  const lb = createLogbook({ store, now: () => t });
  return { lb, store, tick: (ms) => { t += ms; }, day: (n) => { t += n * D; }, set: (ms) => { t = ms; }, now: () => t };
}
const M = 60000, H = 3600000, D = 86400000;

// --- 1. migration ------------------------------------------------------------
test("migration: v1 fixture → v2 per design §2.2", () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/logbook-v1.json", import.meta.url), "utf8"));
  const store = memStore();
  store.set("data", fixture);
  const nowMs = 1788000000000 + 5 * M;
  const lb = createLogbook({ store, now: () => nowMs });

  assert.equal(lb.doc.schemaVersion, SCHEMA_VERSION);
  assert.equal(JSON.parse(store.m.get("data")).schemaVersion, SCHEMA_VERSION, "upgrade persisted");
  // goals: title → name, user → piece, builtin → other, + Free practice
  const chopin = lb.goal("g-chopin"), scales = lb.goal("g-scales"), ss = lb.goal(BUILTIN_SIGHTSINGING), free = lb.goal(BUILTIN_FREEPRACTICE);
  assert.equal(chopin.name, "Chopin Op. 10 No. 1");
  assert.equal(chopin.type, "piece");
  assert.equal(scales.status, "finished");
  assert.equal(scales.finishedAt, 1787400000000);
  assert.equal(ss.type, "other");
  assert.equal(free.kind, "builtin");
  assert.equal(lb.goals({ status: "all" }).length, 4);
  assert.ok(!("title" in chopin) && !("spots" in chopin) && !("target" in chopin));
  // notes, newest first
  const bodies = lb.notes("g-chopin").map((n) => n.body);
  assert.equal(bodies.length, 5);
  assert.equal(bodies[0], "next time: mm. 5–8 at 100, then add m. 9");
  assert.equal(bodies[1], "mm. 5–8 consistency · clean 4/5 runs");
  assert.equal(bodies[2], "♩ 96");
  assert.ok(bodies[3].startsWith("spots: mm. 5–8 consistency · arpeggio m. 11 (fixed "));
  assert.equal(bodies[4], "target: 140");
  assert.deepEqual(lb.notes("g-scales").map((n) => n.body), ["♩ 128 · C# minor harmonic ok"]);
  assert.deepEqual(lb.notes(BUILTIN_SIGHTSINGING).map((n) => n.body), ["Book 1 Lesson 2 · ★★ · 81%"]);
  // days → one free-practice segment each; clock → running segment
  assert.equal(lb.doc.segments.length, 4);
  // the fixture's clock started at 1788000000000 and "now" is 5 min later, so
  // whichever local day that falls on carries 5 live minutes on top.
  const liveDay = dayKey(1788000000000);
  const base = { "2026-08-28": 42, "2026-08-29": 15, "2026-08-30": 0, "2026-08-31": 60 };
  for (const [k, m] of Object.entries(base)) assert.equal(lb.minutesOn(k), m + (k === liveDay ? 5 : 0), k);
  assert.equal(lb.dayReport("2026-08-31").goals[0].goal.id, BUILTIN_FREEPRACTICE);
  const r = lb.running();
  assert.equal(r.goal.id, BUILTIN_FREEPRACTICE);
  assert.equal(r.segment.startedAt, 1788000000000);
  assert.equal(r.elapsedMin ?? Math.round(r.elapsedMs / M), 5);
  // tombstones + no v1 keys
  assert.deepEqual(lb.doc.deleted, [{ id: "g-old", kind: "goal", at: 1786900000000 }]);
  assert.ok(!("entries" in lb.doc) && !("days" in lb.doc) && !("clock" in lb.doc));
  // idempotent: loading the v2 doc again changes nothing
  const again = createLogbook({ store, now: () => nowMs });
  assert.deepEqual(again.doc, lb.doc);
});

test("migration: garbage / missing / unknown version → empty doc", () => {
  for (const raw of [null, "nope", { schemaVersion: 99 }, {}]) {
    const store = memStore();
    if (raw !== null) store.set("data", raw);
    const lb = createLogbook({ store, now: () => NOON });
    assert.equal(lb.doc.schemaVersion, SCHEMA_VERSION);
    assert.deepEqual(lb.goals(), []);
  }
});

// --- 2. goals ----------------------------------------------------------------
test("goals: add / rename / retype / status / delete cascade", () => {
  const { lb } = fresh();
  const a = lb.addGoal({ name: "  Scales ", type: "technique" });
  assert.equal(a.name, "Scales");
  assert.equal(a.type, "technique");
  const b = lb.addGoal({ name: "Pathétique" });
  assert.equal(b.type, "piece", "default type");
  assert.throws(() => lb.addGoal({ name: "  " }));
  assert.throws(() => lb.addGoal({ name: "x", type: "song" }));
  lb.renameGoal(a.id, "All scales");
  assert.equal(lb.goal(a.id).name, "All scales");
  assert.throws(() => lb.renameGoal(a.id, ""));
  lb.retypeGoal(a.id, "other");
  assert.equal(lb.goal(a.id).type, "other");
  lb.finishGoal(a.id);
  assert.ok(lb.goal(a.id).finishedAt);
  assert.equal(lb.goals().length, 1);
  assert.equal(lb.goals({ status: "finished" }).length, 1);
  lb.shelveGoal(b.id);
  assert.equal(lb.goals({ status: "shelved" })[0].id, b.id);
  lb.reactivateGoal(b.id);
  assert.equal(lb.goal(b.id).status, "active");
  assert.equal(lb.goal(b.id).finishedAt, null);
  // cascade
  lb.start(b.id);
  lb.addNote(b.id, "LH jumps");
  const seg = lb.stop();
  assert.equal(seg, null, "under 10 s is dropped");
  lb.addTime({ goalId: b.id, minutes: 20 });
  lb.deleteGoal(b.id);
  assert.equal(lb.goal(b.id), null);
  assert.equal(lb.doc.segments.length, 0);
  assert.equal(lb.doc.notes.length, 0);
  assert.deepEqual(lb.doc.deleted.map((d) => d.kind).sort(), ["goal", "note", "segment"]);
  assert.throws(() => lb.deleteGoal("nope"));
});

// --- 3. practice --------------------------------------------------------------
test("practice: start / switch / stop / drop / reactivate", () => {
  const { lb, tick } = fresh();
  const p = lb.addGoal({ name: "Pathétique" }), s = lb.addGoal({ name: "Scales", type: "technique" });
  assert.equal(lb.running(), null);
  const seg1 = lb.start(p.id);
  assert.equal(seg1.endedAt, null);
  tick(30 * M);
  assert.equal(lb.running().goal.id, p.id);
  assert.equal(Math.round(lb.running().elapsedMs / M), 30);
  // same goal again → no-op
  assert.equal(lb.start(p.id), seg1);
  // second start = switch
  const seg2 = lb.start(s.id);
  assert.notEqual(seg2.id, seg1.id);
  assert.equal(lb.doc.segments[0].endedAt - lb.doc.segments[0].startedAt, 30 * M);
  assert.equal(lb.doc.segments.length, 2);
  tick(H);
  const closed = lb.stop();
  assert.equal(closed.id, seg2.id);
  assert.equal(closed.endedAt - closed.startedAt, H);
  assert.equal(lb.running(), null);
  assert.equal(lb.stop(), null, "stop when idle");
  // accidental tap
  lb.start(p.id); tick(MIN_SEGMENT_MS - 1);
  assert.equal(lb.stop(), null);
  assert.equal(lb.doc.segments.length, 2);
  assert.equal(lb.doc.deleted.length, 0, "dropped segments leave no tombstone");
  // switching within 10 s also drops the first one
  lb.start(p.id); tick(3000); lb.switchTo(s.id); tick(M);
  assert.equal(lb.doc.segments.filter((x) => x.goalId === p.id).length, 1);
  lb.stop();
  // start on a shelved goal reactivates it
  lb.shelveGoal(p.id);
  lb.start(p.id);
  assert.equal(lb.goal(p.id).status, "active");
  tick(M); lb.stop();
  assert.throws(() => lb.start("nope"));
});

test("practice: a segment across midnight credits both days", () => {
  const { lb, set, tick } = fresh();
  const p = lb.addGoal({ name: "Pathétique" });
  const d1 = dayKey(NOON), d2 = addDays(d1, 1);
  set(dayStart(d2) - 10 * M); // 23:50
  lb.start(p.id);
  tick(30 * M); // 00:20
  lb.stop();
  assert.equal(lb.minutesOn(d1), 10);
  assert.equal(lb.minutesOn(d2), 20);
  assert.ok(lb.practicedOn(d1) && lb.practicedOn(d2));
  assert.equal(lb.dayReport(d1).goals[0].minutes, 10);
  assert.equal(lb.dayReport(d2).goals[0].minutes, 20);
  assert.equal(lb.metrics.goalStats(p.id).minutes, 30);
});

// --- 4. dayReport -------------------------------------------------------------
test("dayReport: one row per goal, most time first, live row ticks", () => {
  const { lb, tick } = fresh();
  const p = lb.addGoal({ name: "Pathétique" }), s = lb.addGoal({ name: "Scales", type: "technique" });
  const t = lb.today();
  assert.deepEqual(lb.dayReport(t), { key: t, ms: 0, minutes: 0, goals: [] });
  lb.start(s.id); tick(12 * M);
  lb.switchTo(p.id); tick(30 * M);
  lb.switchTo(s.id); tick(5 * M);
  let rep = lb.dayReport(t);
  assert.deepEqual(rep.goals.map((r) => [r.goal.name, r.minutes, r.live]), [["Pathétique", 30, false], ["Scales", 17, true]]);
  assert.equal(rep.minutes, 47);
  assert.equal(rep.goals[1].segments.length, 2);
  tick(20 * M);
  rep = lb.dayReport(t);
  assert.deepEqual(rep.goals.map((r) => [r.goal.name, r.minutes]), [["Scales", 37], ["Pathétique", 30]]);
  assert.equal(rep.minutes, 67);
  assert.equal(lb.minutesOn(t), 67);
});

// --- 5. goalStats -------------------------------------------------------------
test("goalStats: minutes, days, avg, week / month windows, last practiced", () => {
  const { lb, tick, day } = fresh(new Date(2026, 8, 1, 12).getTime()); // Tue 1 Sep
  const p = lb.addGoal({ name: "Pathétique" });
  lb.start(p.id); tick(40 * M); lb.stop();     // Sep 1: 40
  day(1); lb.start(p.id); tick(20 * M); lb.stop(); // Sep 2: 20
  day(8);                                          // Sep 10
  lb.start(p.id); tick(30 * M); lb.stop();         // Sep 10: 30
  const st = lb.metrics.goalStats(p.id);
  assert.equal(st.minutes, 90);
  assert.equal(st.days, 3);
  assert.equal(st.avgSessionMin, 30);
  assert.equal(st.weekMin, 30, "last 7 days");
  assert.equal(st.monthMin, 90);
  assert.equal(st.daysSince, 0);
  assert.equal(dayKey(st.lastPracticedAt), lb.today());
  assert.equal(st.segments.length, 3);
  assert.equal(st.segments[0].startedAt > st.segments[2].startedAt, true, "newest first");
  assert.equal(st.bestBpm, null);
  day(3);
  assert.equal(lb.metrics.goalStats(p.id).daysSince, 3);
  const empty = lb.metrics.goalStats(lb.addGoal({ name: "New" }).id);
  assert.deepEqual([empty.minutes, empty.days, empty.avgSessionMin, empty.lastPracticedAt, empty.daysSince], [0, 0, 0, null, null]);
});

// --- 6. streak + gold ---------------------------------------------------------
test("streak: consecutive days, a fresh morning keeps it, a gap breaks it", () => {
  const { lb, tick, day } = fresh();
  const p = lb.addGoal({ name: "Pathétique" });
  assert.equal(lb.metrics.streak(), 0);
  for (let i = 0; i < 3; i++) { lb.start(p.id); tick(10 * M); lb.stop(); day(1); }
  // now the morning after three days, nothing yet today
  assert.equal(lb.metrics.streak(), 3);
  lb.start(p.id); tick(10 * M); lb.stop();
  assert.equal(lb.metrics.streak(), 4);
  day(2);
  assert.equal(lb.metrics.streak(), 0);
  const strip = lb.metrics.weekStrip();
  assert.equal(strip.length, 7);
  assert.equal(strip[6].today, true);
  assert.equal(strip.filter((d) => d.practiced).length, 4);
});

test("gold days: new best daily total, new best tempo; never for a 30-second day", () => {
  const { lb, tick, day } = fresh();
  const p = lb.addGoal({ name: "Pathétique" });
  const k0 = lb.today();
  lb.start(p.id); tick(20 * M); lb.stop(); day(1);          // day0 20 — first day, not gold
  lb.start(p.id); tick(10 * M); lb.stop(); day(1);          // day1 10
  lb.start(p.id); tick(30 * M); lb.stop(); day(1);          // day2 30 → gold (beats 20)
  lb.start(p.id); lb.stampTempo(100); tick(5 * M); lb.stop(); day(1); // day3 5, first tempo — not gold
  lb.start(p.id); lb.stampTempo(112); tick(5 * M); lb.stop(); day(1); // day4 5, tempo 112 > 100 → gold
  lb.start(p.id); tick(20000); lb.stop();                   // day5 20 s → never gold
  const gold = lb.metrics.goldDays();
  assert.deepEqual([...gold].sort(), [addDays(k0, 2), addDays(k0, 4)]);
  const m = lb.metrics.month(new Date(NOON).getFullYear(), new Date(NOON).getMonth());
  assert.equal(m.cells.filter((c) => c?.gold).length, 2);
  assert.equal(m.totals.days, 5, "the 20-second day doesn't count");
});

// --- 7. library query ---------------------------------------------------------
test("goals(): search is accent-insensitive, type filters, every sort orders", () => {
  const { lb, tick, day } = fresh();
  const path = lb.addGoal({ name: "Pathétique Sonata" });
  tick(1000);
  const bach = lb.addGoal({ name: "Bach Invention No. 8" });
  tick(1000);
  const scales = lb.addGoal({ name: "Scales", type: "technique" });
  tick(1000);
  const sight = lb.addGoal({ name: "Sight reading", type: "other" });
  assert.deepEqual(lb.goals({ q: "pathe" }).map((g) => g.id), [path.id]);
  assert.deepEqual(lb.goals({ q: "PATHÉ" }).map((g) => g.id), [path.id]);
  assert.deepEqual(lb.goals({ type: "technique" }).map((g) => g.id), [scales.id]);
  assert.deepEqual(lb.goals({ sort: "name" }).map((g) => g.name), ["Bach Invention No. 8", "Pathétique Sonata", "Scales", "Sight reading"]);
  assert.deepEqual(lb.goals({ sort: "created" }).map((g) => g.id), [sight.id, scales.id, bach.id, path.id]);
  // never practiced: recent falls back to created desc
  assert.deepEqual(lb.goals({ sort: "recent" }).map((g) => g.id), [sight.id, scales.id, bach.id, path.id]);
  // practice: bach 60 (last month), path 30 (8 days ago), scales 10 (today)
  const { lb: lb2, tick: t2, day: d2 } = fresh(new Date(2026, 7, 20, 12).getTime()); // 20 Aug
  const A = lb2.addGoal({ name: "A" }), B = lb2.addGoal({ name: "B" }), C = lb2.addGoal({ name: "C" }), Z = lb2.addGoal({ name: "Z" });
  lb2.start(B.id); t2(60 * M); lb2.stop();
  d2(7);                                  // 27 Aug
  lb2.start(A.id); t2(30 * M); lb2.stop();
  d2(8);                                  // 4 Sep
  lb2.start(C.id); t2(10 * M); lb2.stop();
  assert.deepEqual(lb2.goals({ sort: "recent" }).map((g) => g.id), [C.id, A.id, B.id, Z.id]);
  assert.deepEqual(lb2.goals({ sort: "time" }).map((g) => g.id), [B.id, A.id, C.id, Z.id]);
  assert.deepEqual(lb2.goals({ sort: "week" }).map((g) => g.id).slice(0, 1), [C.id]);
  assert.deepEqual(lb2.goals({ sort: "month" }).map((g) => g.id).slice(0, 1), [C.id]);
  assert.ok(SORTS.every((s) => Array.isArray(lb2.goals({ sort: s }))));
  assert.equal(lb2.goals("active").length, 4, "string shorthand = status");
  void day;
});

// --- 8. notes -----------------------------------------------------------------
test("notes: add / newest first / delete / empty rejected", () => {
  const { lb, tick } = fresh();
  const p = lb.addGoal({ name: "Pathétique" });
  const n1 = lb.addNote(p.id, "  mm. 51–66 unstable ");
  tick(1000);
  const n2 = lb.addNote(p.id, "fixed fingering 54–57");
  assert.deepEqual(lb.notes(p.id).map((n) => n.id), [n2.id, n1.id]);
  assert.equal(n1.body, "mm. 51–66 unstable");
  assert.throws(() => lb.addNote(p.id, " "));
  assert.throws(() => lb.addNote("nope", "x"));
  lb.deleteNote(n1.id);
  assert.deepEqual(lb.notes(p.id).map((n) => n.id), [n2.id]);
  assert.equal(lb.doc.deleted[0].kind, "note");
  lb.deleteNote("nope");
  assert.equal(lb.doc.deleted.length, 1);
});

// --- 9. addAuto ---------------------------------------------------------------
test("addAuto: note on the running goal, else an auto segment on Sight singing", () => {
  const { lb, tick, now } = fresh();
  const p = lb.addGoal({ name: "Sight reading", type: "other" });
  lb.start(p.id); tick(5 * M);
  const r1 = lb.addAuto({ source: "sightsinging", label: "Book 1 Lesson 2 · ★★ · 81%", startedAt: now() - 3 * M });
  assert.equal(r1.kind, "note");
  assert.equal(lb.notes(p.id)[0].body, "Book 1 Lesson 2 · ★★ · 81%");
  assert.equal(lb.doc.segments.length, 1, "no new segment while running");
  assert.equal(lb.goal(BUILTIN_SIGHTSINGING), null);
  lb.stop();
  tick(M);
  const r2 = lb.addAuto({ source: "sightsinging", label: "Challenge · 5 melodies · 90%", startedAt: now() - 4 * M });
  assert.equal(r2.kind, "segment");
  const ss = lb.goal(BUILTIN_SIGHTSINGING);
  assert.equal(ss.kind, "builtin");
  assert.equal(ss.type, "other");
  const row = lb.dayReport(lb.today()).goals.find((r) => r.goal.id === ss.id);
  assert.equal(row.minutes, 4);
  assert.equal(row.segments[0].auto.label, "Challenge · 5 melodies · 90%");
  assert.throws(() => lb.addAuto({ source: "x", label: "y" }), /startedAt/);
  lb.shelveGoal(ss.id);
  lb.addAuto({ source: "sightsinging", label: "again", startedAt: now() - M });
  assert.equal(lb.goal(ss.id).status, "active", "builtin reactivated");
  assert.throws(() => lb.deleteGoal(ss.id));
});

// --- 10. tempo + add time -----------------------------------------------------
test("stampTempo: only the running segment; tempoSeries + bestBpm follow", () => {
  const { lb, tick } = fresh();
  const p = lb.addGoal({ name: "Pathétique" });
  assert.throws(() => lb.stampTempo(100), /nothing is running/);
  lb.start(p.id);
  lb.stampTempo(96); lb.stampTempo(104); // last stamp wins
  assert.throws(() => lb.stampTempo(500));
  tick(5 * M); lb.stop();
  lb.start(p.id); lb.stampTempo(100); tick(5 * M); lb.stop();
  assert.deepEqual(lb.metrics.tempoSeries(p.id).map((x) => x.bpm), [104, 100]);
  const st = lb.metrics.goalStats(p.id);
  assert.equal(st.bestBpm, 104);
  assert.equal(st.lastBpm, 100);
});

test("addTime: a closed segment ending now; deleteSegment tombstones", () => {
  const { lb, now } = fresh();
  const p = lb.addGoal({ name: "Scales", type: "technique" });
  const s = lb.addTime({ goalId: p.id, minutes: 45 });
  assert.equal(s.endedAt, now());
  assert.equal(s.endedAt - s.startedAt, 45 * M);
  assert.equal(lb.dayReport(lb.today()).goals[0].minutes, 45);
  assert.throws(() => lb.addTime({ goalId: p.id, minutes: 0 }));
  lb.start(p.id);
  assert.throws(() => lb.deleteSegment(lb.running().segment.id), /stop it first/);
  lb.deleteSegment(s.id);
  assert.equal(lb.doc.segments.length, 1);
  assert.equal(lb.doc.deleted[0].kind, "segment");
});

// --- 11. month roll-ups -------------------------------------------------------
test("monthByGoal sums to the month total; minutesBetween clips", () => {
  const { lb, tick, day } = fresh(new Date(2026, 8, 2, 12).getTime());
  const p = lb.addGoal({ name: "Pathétique" }), s = lb.addGoal({ name: "Scales", type: "technique" });
  lb.start(p.id); tick(50 * M); lb.switchTo(s.id); tick(10 * M); lb.stop();
  day(1);
  lb.start(p.id); tick(20 * M); lb.stop();
  const by = lb.metrics.monthByGoal(2026, 8);
  assert.deepEqual(by.map((r) => [r.goal.name, r.minutes]), [["Pathétique", 70], ["Scales", 10]]);
  const m = lb.metrics.month(2026, 8);
  assert.equal(m.totals.minutes, by.reduce((a, r) => a + r.minutes, 0));
  assert.equal(m.totals.days, 2);
  assert.equal(lb.metrics.minutesBetween("2026-09-03", "2026-09-03"), 20);
  assert.deepEqual(lb.metrics.monthByGoal(2026, 7), []);
});

test("TYPES: three types with glyph + examples", () => {
  assert.deepEqual(Object.keys(TYPES), ["piece", "technique", "other"]);
  for (const t of Object.values(TYPES)) assert.ok(t.glyph && t.examples && t.cls);
});
