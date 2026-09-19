// The help search (docs/COMPOSE_HELP_DESIGN.md §4, §8): ranking, the AND rule,
// prefixes, damping, and a snippet that cannot put tags in the page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { search, terms, mark, snippet } from "../js/lib/help/search.js";
import { ARTICLES } from "../js/lib/help/content.js";

const A = (over) => ({ slug: "a", title: "A", section: "s", order: 1, summary: "", keywords: [], headings: [], text: "", ...over });

test("terms: lowercased, split on punctuation, one-letter terms dropped unless alone", () => {
  assert.deepEqual(terms("Gesture Mode"), ["gesture", "mode"]);
  assert.deepEqual(terms("  PDF, export!  "), ["pdf", "export"]);
  assert.deepEqual(terms("a"), ["a"]);
  assert.deepEqual(terms("a tie"), ["tie"]);
  assert.deepEqual(terms(""), []);
  assert.deepEqual(terms("♯"), ["♯"]);
});

test("a title hit beats a heading hit beats a body hit", () => {
  const arts = [
    A({ slug: "body", title: "Something", text: "the word tuplet appears here" }),
    A({ slug: "head", title: "Something", headings: [{ level: 2, text: "Tuplet" }] }),
    A({ slug: "title", title: "Tuplet" }),
  ];
  assert.deepEqual(search(arts, "tuplet").map((r) => r.slug), ["title", "head", "body"]);
});

test("every term must match (AND), and a prefix counts for half", () => {
  const arts = [
    A({ slug: "both", title: "Gesture mode", text: "chevron strokes" }),
    A({ slug: "one", title: "Gesture", text: "nothing else" }),
  ];
  assert.deepEqual(search(arts, "gesture chevron").map((r) => r.slug), ["both"]);
  assert.equal(search(arts, "gest").length, 2, "a prefix matches both");
  const whole = search([A({ title: "arm" })], "arm")[0].score;
  const pre = search([A({ title: "armed" })], "arm")[0].score;
  assert.ok(pre < whole, `prefix ${pre} should score under whole ${whole}`);
});

test("repetition is damped: forty mentions do not beat a title", () => {
  const spam = A({ slug: "spam", title: "Other", text: Array(40).fill("pedal").join(" ") });
  const named = A({ slug: "named", title: "Pedal" });
  assert.equal(search([spam, named], "pedal")[0].slug, "named");
});

test("ties break stably on section then slug, and limit is honoured", () => {
  const arts = [A({ slug: "z", section: "b", title: "Tie" }), A({ slug: "a", section: "b", title: "Tie" }), A({ slug: "m", section: "a", title: "Tie" })];
  assert.deepEqual(search(arts, "tie").map((r) => r.slug), ["m", "a", "z"]);
  assert.equal(search(arts, "tie", { limit: 2 }).length, 2);
});

test("an empty or unmatched query returns nothing rather than everything", () => {
  assert.deepEqual(search(ARTICLES, ""), []);
  assert.deepEqual(search(ARTICLES, "   "), []);
  assert.deepEqual(search(ARTICLES, "xyzzyplugh"), []);
});

test("mark escapes first, so a query can never put tags in the page", () => {
  const out = mark('<img onerror="x"> tie', ["tie"]);
  assert.ok(!out.includes("<img"), out);
  assert.ok(out.includes("&lt;img"), out);
  assert.ok(out.includes("<mark>tie</mark>"), out);
  assert.ok(!mark("abc", ["."]).includes("<mark>"), "a dot is a dot, not a wildcard");
  assert.ok(mark("* star", ["*"]).includes("<mark>*</mark>"), "a metacharacter still matches itself");
  assert.doesNotThrow(() => search([A({ title: "x" })], "(["), "an unbalanced query does not compile");
});

test("a snippet centres on the term, keeps its length, and marks every term", () => {
  const a = A({ text: `${"filler ".repeat(60)}the tuplet button is held for a quintuplet${" more".repeat(60)}`, summary: "s" });
  const s = snippet(a, "tuplet", ["tuplet", "quintuplet"]);
  assert.ok(s.includes("<mark>tuplet</mark>"), s);
  assert.ok(s.includes("<mark>quintuplet</mark>"), s);
  assert.ok(s.replace(/<\/?mark>/g, "").length <= 180, s.length);
  assert.ok(s.startsWith("…"), "a snippet from the middle is elided at the front");
});

test("the real corpus answers the questions people actually type", () => {
  const first = (q) => search(ARTICLES, q)[0]?.slug;
  assert.equal(first("chevron"), "gestures");
  assert.equal(first("favorites"), "favorites");
  assert.equal(first("layout"), "layout");
  assert.equal(first("musicxml"), "musicxml");
  assert.equal(first("keyboard shortcuts"), "shortcuts");
  assert.ok(["rail-form", "rail-transport"].includes(first("tempo mark")), first("tempo mark"));
  assert.ok(search(ARTICLES, "pedal").some((r) => r.slug === "rail-piano"));
  assert.ok(search(ARTICLES, "undo").length, "undo finds something");
});
