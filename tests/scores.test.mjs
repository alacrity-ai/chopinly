import { test } from "node:test";
import assert from "node:assert/strict";
import { createLogbook } from "../js/lib/logbook.js";
import { KINDS } from "../js/lib/merge.js";

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

test("scores P0 stay off the sync stream until the kind ships (P1)", () => {
  const { lb } = fresh();
  lb.addScore({ title: "Waltz", pages: 3 });
  assert.ok(!KINDS.includes("score"), "P1 adds the kind; this test flips then");
  assert.equal(lb.pendingEnvelopes().filter((e) => e.kind === "score").length, 0);
  assert.equal(lb.doc.pending.filter((k) => k.startsWith("score:")).length, 0, "nothing pends for an unknown kind");
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
});
