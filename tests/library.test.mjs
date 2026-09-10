import { test } from "node:test";
import assert from "node:assert/strict";
import { fold, filterScores, sortScores, groupByComposer, suggestComposers, suggestTags, parseTags, SORT_IDS } from "../js/lib/scores/library.js";

const S = [
  { id: "a", title: "Nocturne Op. 9 No. 2", composer: "Chopin", tags: ["romantic", "nocturne"], addedAt: 3, openedAt: 10 },
  { id: "b", title: "Invention 8", composer: "Bach", tags: ["baroque", "two-part"], addedAt: 2, openedAt: null },
  { id: "c", title: "Étude in C", composer: "Czerny", tags: ["étude"], addedAt: 1, openedAt: 5 },
  { id: "d", title: "Untitled scan", tags: [], addedAt: 4, openedAt: null },
];

test("fold: accents and case go away", () => {
  assert.equal(fold("Étude  "), "etude");
  assert.equal(fold("Dvořák"), "dvorak");
});

test("filterScores: query over title / composer / tags, tags must all match", () => {
  assert.deepEqual(filterScores(S, { q: "chop" }).map((s) => s.id), ["a"]);
  assert.deepEqual(filterScores(S, { q: "etude" }).map((s) => s.id), ["c"], "accent-insensitive on the title and tag");
  assert.deepEqual(filterScores(S, { q: "TWO-PART" }).map((s) => s.id), ["b"]);
  assert.deepEqual(filterScores(S, { tags: ["Romantic"] }).map((s) => s.id), ["a"]);
  assert.deepEqual(filterScores(S, { tags: ["romantic", "baroque"] }), [], "every tag must match");
  assert.equal(filterScores(S, {}).length, 4);
  assert.deepEqual(filterScores(S, { q: "  " }).length, 4, "blank query = all");
});

test("sortScores: recent (opened, then added), title, composer with blanks last", () => {
  assert.deepEqual(SORT_IDS, ["recent", "title", "composer"]);
  assert.deepEqual(sortScores(S, "recent").map((s) => s.id), ["a", "c", "d", "b"]);
  assert.deepEqual(sortScores(S, "title").map((s) => s.id), ["c", "b", "a", "d"]);
  assert.deepEqual(sortScores(S, "composer").map((s) => s.id), ["b", "a", "c", "d"]);
  assert.deepEqual(sortScores(S, "nope").map((s) => s.id), sortScores(S, "recent").map((s) => s.id));
  assert.notEqual(sortScores(S, "title"), S, "a new array");
});

test("groupByComposer: alphabetical, no-composer last", () => {
  const g = groupByComposer(sortScores(S, "title"));
  assert.deepEqual(g.map((x) => x.composer), ["Bach", "Chopin", "Czerny", ""]);
  assert.deepEqual(g[3].scores.map((s) => s.id), ["d"]);
});

test("suggestions: composers from goals + scores by use, tags by use; parseTags", () => {
  const goals = [{ composer: "Bach" }, { composer: "Bach" }, { composer: "Debussy" }, { name: "Scales" }];
  assert.deepEqual(suggestComposers(goals, S), ["Bach", "Chopin", "Czerny", "Debussy"]);
  assert.deepEqual(suggestTags([...S, { tags: ["baroque"] }]), ["baroque", "étude", "nocturne", "romantic", "two-part"]);
  assert.deepEqual(parseTags(" baroque, two part ,, Bach;x\n"), ["baroque", "two part", "Bach", "x"]);
  assert.deepEqual(parseTags(""), []);
});
