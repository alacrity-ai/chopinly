import { test } from "node:test";
import assert from "node:assert/strict";
import { createLogbook } from "../js/lib/logbook.js";
import { KINDS, toEnvelope, fromEnvelope } from "../js/lib/merge.js";

function memStore() { const m = new Map(); return { get: (k, f) => (m.has(k) ? JSON.parse(m.get(k)) : f), set: (k, v) => m.set(k, JSON.stringify(v)) }; }
const NOON = new Date(2026, 8, 9, 12).getTime();
function fresh() { let t = NOON; const lb = createLogbook({ store: memStore(), now: () => t }); return { lb, tick: (ms) => { t += ms; } }; }

test("scores: add / list / search / sort / edit / remove", () => {
  const { lb, tick } = fresh();
  const a = lb.addScore({ title: "  Nocturne   Op. 9 No. 2 ", composer: "Chopin", pages: 6, size: 400_000, sha256: "abc" });
  assert.equal(a.title, "Nocturne Op. 9 No. 2", "whitespace folded");
  assert.equal(a.composer, "Chopin");
  assert.deepEqual(a.tags, []);
  assert.equal(a.openedAt, null);
  tick(1000);
  const b = lb.addScore({ title: "Invention 8", composer: "Bach", pages: 2, tags: ["baroque", " two-part ", "baroque", ""] });
  assert.deepEqual(b.tags, ["baroque", "two-part"], "tags trimmed and deduped");
  tick(1000);
  const c = lb.addScore({ title: "Étude", pages: 4 });
  assert.equal(c.composer, undefined, "no composer key when blank");
  assert.throws(() => lb.addScore({ title: " ", pages: 1 }), /needs a title/);
  assert.throws(() => lb.addScore({ title: "x", pages: 0 }), /at least one page/);

  assert.deepEqual(lb.scores().map((s) => s.id), [c.id, b.id, a.id], "recent = last added first");
  tick(1000); lb.touchScore(a.id);
  assert.deepEqual(lb.scores().map((s) => s.id), [a.id, c.id, b.id], "opening moves it to the top");
  assert.deepEqual(lb.scores({ sort: "title" }).map((s) => s.title), ["Étude", "Invention 8", "Nocturne Op. 9 No. 2"]);
  assert.deepEqual(lb.scores({ sort: "composer" }).map((s) => s.title), ["Invention 8", "Nocturne Op. 9 No. 2", "Étude"], "no composer sorts last");
  assert.deepEqual(lb.scores({ q: "chop" }).map((s) => s.id), [a.id], "search by composer");
  assert.deepEqual(lb.scores({ q: "etude" }).map((s) => s.id), [c.id], "accent-insensitive");
  assert.deepEqual(lb.scores({ q: "two-part" }).map((s) => s.id), [b.id], "search by tag");
  assert.equal(lb.scoreByHash("abc"), a);
  assert.equal(lb.scoreByHash("nope"), null);

  lb.updateScore(a.id, { title: "Nocturne in E♭", composer: "", tags: ["romantic"] });
  assert.equal(lb.score(a.id).title, "Nocturne in E♭");
  assert.equal(lb.score(a.id).composer, undefined, "composer cleared");
  assert.deepEqual(lb.score(a.id).tags, ["romantic"]);
  assert.throws(() => lb.updateScore(a.id, { title: "" }), /needs a title/);
  assert.throws(() => lb.updateScore("nope", { title: "x" }), /no score/);

  lb.removeScore(b.id);
  assert.equal(lb.score(b.id), null);
  assert.equal(lb.scores().length, 2);
});

test("scores + marks sync: kinds, envelopes, pending, tombstones, cascade, and a second device converging", () => {
  assert.ok(KINDS.includes("score") && KINDS.includes("mark"));
  const { lb, tick } = fresh();
  const g = lb.addGoal({ name: "Waltz", composer: "Chopin" });
  const a = lb.addScore({ title: "Waltz", composer: "Chopin", pages: 3, sha256: "h1", goalId: g.id });
  assert.equal(a.goalId, g.id);
  assert.equal(lb.scoreForGoal(g.id), a);
  const m1 = lb.addMark({ scoreId: a.id, page: 2, label: "  coda  " });
  assert.equal(m1.label, "coda");
  const m2 = lb.addMark({ scoreId: a.id, page: 1 });
  assert.equal(m2.label, "page 1", "label defaults to the page");
  assert.throws(() => lb.addMark({ scoreId: a.id, page: 9 }), /isn't in this score/);
  assert.throws(() => lb.addMark({ scoreId: "nope", page: 1 }), /no score/);
  assert.deepEqual(lb.marks(a.id).map((m) => m.page), [1, 2], "by page");
  assert.equal(lb.markAt(a.id, 2), m1);
  assert.equal(lb.markAt(a.id, 3), null);
  assert.ok(lb.doc.pending.includes(`score:${a.id}`) && lb.doc.pending.includes(`mark:${m1.id}`));
  const envs = lb.pendingEnvelopes();
  const se = envs.find((e) => e.kind === "score");
  assert.deepEqual(Object.keys(se.body).sort(), ["addedAt", "composer", "goalId", "openedAt", "pages", "sha256", "size", "tags", "title"]);
  assert.ok(JSON.stringify(se.body).length < 8192, "well under the sync body cap");
  assert.deepEqual(fromEnvelope(toEnvelope("score", a)), a);
  assert.deepEqual(fromEnvelope(toEnvelope("mark", m1)), m1);

  // a second device receives everything, edits the title and removes a mark; we apply its changes
  const other = createLogbook({ store: memStore(), now: () => NOON + 5000 });
  other.applyRemote(lb.allEnvelopes());
  assert.equal(other.scores().length, 1, "arrived");
  assert.equal(other.marks(a.id).length, 2);
  assert.equal(other.score(a.id).goalId, g.id);
  other.updateScore(a.id, { title: "Waltz in A minor" });
  other.removeMark(m2.id);
  tick(1);
  lb.applyRemote(other.pendingEnvelopes());
  assert.equal(lb.score(a.id).title, "Waltz in A minor", "the title came back");
  assert.deepEqual(lb.marks(a.id).map((m) => m.id), [m1.id], "the removed mark is gone here too");

  // deleting the goal keeps the score, unlinked
  lb.deleteGoal(g.id);
  assert.equal(lb.score(a.id).goalId, undefined);
  assert.equal(lb.scoreForGoal(g.id), null);
  // removing the score tombstones it and its marks (later than the other device's edit, so the tombstone wins)
  tick(10_000);
  lb.removeScore(a.id);
  assert.equal(lb.score(a.id), null);
  assert.equal(lb.marks(a.id).length, 0);
  assert.ok(lb.doc.deleted.some((t) => t.kind === "score" && t.id === a.id));
  assert.ok(lb.doc.deleted.some((t) => t.kind === "mark" && t.id === m1.id));
  tick(1);
  other.applyRemote(lb.pendingEnvelopes());
  assert.equal(other.score(a.id), null, "gone on the other device");
  assert.equal(other.marks(a.id).length, 0);
});

test("touchScore syncs openedAt (recent on every device); updateScore validates the goal", () => {
  const { lb, tick } = fresh();
  const a = lb.addScore({ title: "A", pages: 1 });
  lb.clearPending(lb.pendingEnvelopes());
  tick(1000); lb.touchScore(a.id);
  assert.ok(lb.doc.pending.includes(`score:${a.id}`));
  assert.throws(() => lb.updateScore(a.id, { goalId: "nope" }), /no goal/);
  const g = lb.addGoal({ name: "G" });
  lb.updateScore(a.id, { goalId: g.id });
  assert.equal(lb.score(a.id).goalId, g.id);
  lb.updateScore(a.id, { goalId: null });
  assert.equal(lb.score(a.id).goalId, undefined);
});

test("scores survive a reload of the doc and a v2 doc without the array", () => {
  const store = memStore();
  const lb = createLogbook({ store, now: () => NOON });
  lb.addScore({ title: "Waltz", pages: 3 });
  const again = createLogbook({ store, now: () => NOON });
  assert.equal(again.scores().length, 1);
  const legacy = memStore();
  legacy.set("data", { schemaVersion: 2, goals: [], segments: [], notes: [], deleted: [], pending: [] });
  const lb2 = createLogbook({ store: legacy, now: () => NOON });
  assert.deepEqual(lb2.scores(), [], "migrate fills scores: []");
  assert.deepEqual(lb2.marks("x"), [], "and marks: []");
});
