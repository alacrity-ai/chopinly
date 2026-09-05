import { test } from "node:test";
import assert from "node:assert/strict";
import { pick, same, stable, toEnvelope, tombEnvelope, fromEnvelope } from "../js/lib/merge.js";
import { createLogbook } from "../js/lib/logbook.js";

const seg = (id, updatedAt, endedAt, extra = {}) => ({ kind: "segment", id, updatedAt, deleted: 0, body: { goalId: "g", startedAt: 1000, endedAt, bpm: null, auto: null, ...extra } });
const goal = (id, updatedAt, name) => ({ kind: "goal", id, updatedAt, deleted: 0, body: { name, type: "piece", status: "active", kind: "user", createdAt: 1, finishedAt: null } });
const tomb = (kind, id, updatedAt) => ({ kind, id, updatedAt, deleted: 1, body: null });

test("pick: only one side → it; newer updatedAt wins; commutative", () => {
  const a = goal("x", 10, "A"), b = goal("x", 20, "B");
  assert.equal(pick(null, a), a);
  assert.equal(pick(a, null), a);
  assert.equal(pick(a, b), b);
  assert.equal(pick(b, a), b);
});

test("pick: tombstone vs edit → newer; tie → tombstone", () => {
  const edit = goal("x", 50, "renamed"), t = tomb("goal", "x", 40);
  assert.equal(pick(edit, t), edit, "a later edit resurrects");
  assert.equal(pick(t, edit), edit);
  const tie = tomb("goal", "x", 50);
  assert.equal(pick(edit, tie), tie);
  assert.equal(pick(tie, edit), tie);
  const later = tomb("goal", "x", 60);
  assert.equal(pick(edit, later), later);
});

test("pick: a closed segment beats an open one regardless of updatedAt", () => {
  const open = seg("s", 999, null, { bpm: 120 }), closed = seg("s", 5, 2000);
  assert.equal(pick(open, closed), closed);
  assert.equal(pick(closed, open), closed);
  const open2 = seg("s", 7, null);
  assert.equal(pick(open, open2), open, "both open → newer");
});

test("pick: equal updatedAt → deterministic by stable body, both orders agree", () => {
  const a = goal("x", 10, "A"), b = goal("x", 10, "B");
  assert.equal(pick(a, b), pick(b, a));
  assert.equal(stable({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}');
  assert.ok(same(a, { ...a, body: { ...a.body } }));
  assert.ok(!same(a, b));
});

test("envelopes: round-trip, pre-sync fallbacks, tombstones", () => {
  const s = { id: "s1", goalId: "g", startedAt: 100, endedAt: 200, bpm: null, auto: null };
  const e = toEnvelope("segment", s);
  assert.equal(e.updatedAt, 200, "no updatedAt → endedAt");
  assert.equal(toEnvelope("segment", { ...s, endedAt: null }).updatedAt, 100, "open → startedAt");
  assert.equal(toEnvelope("note", { id: "n", goalId: "g", body: "x", createdAt: 7 }).updatedAt, 7);
  assert.deepEqual(fromEnvelope(e), { ...s, updatedAt: 200 });
  assert.deepEqual(tombEnvelope({ id: "z", kind: "note", at: 5 }), { kind: "note", id: "z", updatedAt: 5, deleted: 1, body: null });
});

const mem = () => { const m = new Map(); return { get: (k, f) => (m.has(k) ? m.get(k) : f), set: (k, v) => m.set(k, structuredClone(v)) }; };
const clock = (t0) => { let t = t0; const now = () => t; now.tick = (ms) => (t += ms); return now; };

test("logbook pending: every mutation marks its entity; clearPending keeps mid-flight edits", () => {
  const now = clock(1_000_000);
  const lb = createLogbook({ store: mem(), now });
  const g = lb.addGoal({ name: "Scales", type: "technique" });
  assert.deepEqual(lb.doc.pending, [`goal:${g.id}`]);
  now.tick(1000);
  const s = lb.start(g.id);
  now.tick(60_000);
  lb.stampTempo(100);
  const n = lb.addNote(g.id, "hi");
  assert.deepEqual(new Set(lb.doc.pending), new Set([`goal:${g.id}`, `segment:${s.id}`, `note:${n.id}`]));
  const sent = lb.pendingEnvelopes();
  assert.equal(sent.length, 3);
  now.tick(1000);
  lb.renameGoal(g.id, "All scales"); // changed while "in flight"
  lb.clearPending(sent);
  assert.deepEqual(lb.doc.pending, [`goal:${g.id}`], "the mid-flight rename stays pending");
  lb.deleteNote(n.id);
  assert.ok(lb.doc.pending.includes(`note:${n.id}`));
  const tombs = lb.pendingEnvelopes().filter((e) => e.deleted);
  assert.equal(tombs.length, 1);
  assert.equal(tombs[0].updatedAt, now());
  lb.markAllPending();
  assert.equal(lb.pendingCount(), lb.allEnvelopes().length);
});

test("applyRemote: new / newer / older / tombstone / closed-beats-open / normalises two open segments", () => {
  const now = clock(2_000_000);
  const lb = createLogbook({ store: mem(), now });
  const g = lb.addGoal({ name: "Local", type: "piece" });
  lb.clearPending(lb.pendingEnvelopes());
  // new goal from another device
  let r = lb.applyRemote([goal("remote-g", 5, "Remote piece")]);
  assert.equal(r.applied, 1);
  assert.equal(lb.goal("remote-g").name, "Remote piece");
  assert.equal(lb.pendingCount(), 0, "remote changes are not re-pushed");
  // older version of a local goal is ignored, newer wins
  r = lb.applyRemote([goal(g.id, 1, "Stale")]);
  assert.equal(r.applied, 0);
  assert.equal(lb.goal(g.id).name, "Local");
  r = lb.applyRemote([goal(g.id, now() + 5, "Fresher")]);
  assert.equal(lb.goal(g.id).name, "Fresher");
  // tombstone removes and is recorded
  r = lb.applyRemote([tomb("goal", "remote-g", now() + 10)]);
  assert.equal(lb.goal("remote-g"), null);
  assert.ok(lb.doc.deleted.some((t) => t.id === "remote-g"));
  // local running segment; remote says it was stopped (older updatedAt) → closed wins, hero goes idle
  now.tick(1000);
  const s = lb.start(g.id);
  now.tick(30_000);
  r = lb.applyRemote([seg(s.id, s.updatedAt - 1, s.startedAt + 20_000, { goalId: g.id, startedAt: s.startedAt })]);
  assert.equal(r.applied, 1);
  assert.equal(lb.running(), null);
  // two open segments after a merge → the later start stays open
  now.tick(1000);
  const a = lb.start(g.id);
  r = lb.applyRemote([seg("other-open", now() + 5000, null, { goalId: g.id, startedAt: now() + 5000 })]);
  assert.equal(lb.running().segment.id, "other-open");
  const closedA = lb.doc.segments.find((x) => x.id === a.id);
  assert.equal(closedA.endedAt, now() + 5000);
  assert.ok(lb.doc.pending.includes(`segment:${a.id}`), "the normalised close is pushed back");
  // same version twice is a no-op
  const env = lb.allEnvelopes().find((e) => e.id === "other-open");
  assert.equal(lb.applyRemote([env]).applied, 0);
});
