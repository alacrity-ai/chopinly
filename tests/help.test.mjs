// The help corpus (docs/COMPOSE_HELP_DESIGN.md §8): the committed module matches the
// generator, every article validates, and every link, figure name and screenshot path
// resolves. The last test is the one that matters most — it fails when a rail grows a
// button nobody documented.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { build, ROOT, TOOLS } from "../dev/build-help.mjs";
import { FIGURES } from "../js/lib/help/figures.js";

const { files, articles, sections } = build();

test("the committed help content equals the generator's output (run `node dev/build-help.mjs`)", () => {
  const stale = [...files].filter(([rel, content]) => !existsSync(join(ROOT, rel)) || readFileSync(join(ROOT, rel), "utf8") !== content).map(([rel]) => rel);
  assert.deepEqual(stale, []);
});

test("every article has a summary, a real body, a known section and a unique place in it", () => {
  assert.ok(articles.length >= 24, `only ${articles.length} articles`);
  const seen = new Set();
  for (const a of articles) {
    assert.ok(a.summary.length > 10 && a.summary.length < 200, `${a.slug}: summary ${a.summary.length} chars`);
    const words = a.text.split(/\s+/).filter(Boolean).length;
    assert.ok(words >= 120, `${a.slug}: ${words} words — a stub`);
    assert.ok(sections.some((s) => s.tool === a.tool && s.id === a.section), `${a.slug}: section ${a.section}`);
    const key = `${a.tool}/${a.section}/${a.order}`;
    assert.ok(!seen.has(key), `${a.slug}: two articles claim ${key}`);
    seen.add(key);
    assert.ok(a.headings.length >= 2, `${a.slug}: no headings to navigate by`);
  }
  assert.equal(new Set(articles.map((a) => a.slug)).size, articles.length, "slugs are unique");
});

test("every cross-link, figure and screenshot an article names actually exists", () => {
  const slugs = new Set(articles.map((a) => a.slug));
  for (const a of articles) {
    for (const [, slug] of a.html.matchAll(/href="#\/compose\/help\/([a-z0-9-]+)/g)) assert.ok(slugs.has(slug), `${a.slug} → help:${slug}`);
    for (const [, name] of a.html.matchAll(/aria-labelledby="fg-([a-z0-9-]+)"/g)) assert.ok(FIGURES.includes(name), `${a.slug} → figure:${name}`);
    for (const [, src] of a.html.matchAll(/<img src="(\/img\/help\/[^"]+)"/g)) assert.ok(existsSync(join(ROOT, src.slice(1))), `${a.slug} → ${src}`);
    assert.ok(!/@@FIG/.test(a.html), `${a.slug}: an image line survived`);
  }
});

test("every screenshot on disk is used by an article, and every figure is drawn somewhere", () => {
  const html = articles.map((a) => a.html).join("");
  const unused = readdirSync(join(ROOT, "img", "help")).filter((f) => f.endsWith(".png") && !html.includes(`/img/help/${f}`));
  assert.deepEqual(unused, [], "shots nothing references — delete them or use them");
  const undrawn = FIGURES.filter((n) => !html.includes(`fg-${n}`));
  assert.deepEqual(undrawn, [], "figures no article shows");
});

test("the help is reachable and the route is what the app uses", () => {
  const ui = readFileSync(join(ROOT, "js/tools/compose/ui.js"), "utf8");
  assert.match(ui, /#\\\/compose\\\/help|compose\/help/, "ui.js routes #/compose/help");
  const rails = readFileSync(join(ROOT, "js/tools/compose/rails.js"), "utf8");
  assert.match(rails, /data-act="help"/, "the Options panel has a Help row");
  const list = readFileSync(join(ROOT, "js/tools/compose/list.js"), "utf8");
  assert.match(list, /id="cp-help"/, "the compositions list has a help button");
  const editor = readFileSync(join(ROOT, "js/tools/compose/editor.js"), "utf8");
  assert.match(editor, /case "help"/, "the editor acts on help");
  assert.match(editor, /e\.key === "\?" \|\| \(e\.shiftKey && e\.key === "\/"\)/, "? opens help from the editor, on either key report");
});

// ---------------------------------------------------------------------------
// Coverage: a button that ships undocumented is a documentation bug, and this is
// where it is caught. Every rail needs an article; every data-act on a rail needs
// an entry here, and the word must appear in that rail's article. A new button
// fails this test until somebody writes the sentence.
const RAIL_ARTICLE = {
  control: "rail-controls", transport: "rail-transport", palette: "rail-notes", utility: "rail-keys",
  expression: "rail-dynamics", form: "rail-form", piano: "rail-piano", notes2: "rail-marks",
  header: "options", // the header's own controls are documented with the Options panel
};
/** Buttons documented somewhere other than their rail's own article. */
const ACT_ARTICLE = { "header/details": "editor", "header/back": "editor" };
/** `rail/act` (or just `act`) → a word that must appear in the article (case-insensitive). */
const ACT_WORDS = {
  "notes2/art": "portato",   // the utility rail owns the word "articulations"; this lane owns the rarer marks
  // header
  back: "compositions", details: "details", input: "Pen", gesture: "Gesture", favorites: "Favorites", rail: "rail", help: "help",
  // control
  undo: "undo", redo: "redo", select: "Select", pan: "Pan", delete: "Delete", copy: "Copy", cut: "cut", paste: "paste", "zoom-out": "Zoom", "zoom-in": "Zoom",
  // transport
  stop: "Stop", rew: "bar back", play: "Play", ff: "bar forward", tempo: "tempo", "tempo-down": "tempo", "tempo-up": "tempo",
  // palette
  dur: "values", dot: "Dot", tie: "Tie", tuplet: "Tuplet", acc: "Accidentals", voice: "Voice",
  // utility
  key: "Key", time: "Time", clef: "Clef", art: "Articulations", slur: "Slur", gliss: "Glissando", arp: "Rolled chords",
  // expression
  dyn: "Dynamics", hairpin: "Hairpins", text: "Text", "text-set": "set",
  // form
  barline: "Barlines", ending: "Endings", sign: "segno", jump: "jump", rehearsal: "Rehearsal", "tempo-mark": "tempo-mark",
  "tempo-unit": "tempo-unit", "bar-insert": "bar-insert", "bar-delete": "bar-delete", pickup: "pickup", simile: "simile",
  // piano
  pedal: "Pedal", textline: "textline", ottava: "ottava", finger: "Fingering", hands: "Hand marks",
  // notes2
  grace: "Grace", "grace-chord": "grace-chord", trem: "Tremolo", stem: "stem", beam: "beam",
};

test("every rail has an article, and every button on a rail is named in it", () => {
  const rails = readFileSync(join(ROOT, "js/tools/compose/rails.js"), "utf8");
  const bySlug = Object.fromEntries(articles.map((a) => [a.slug, a]));
  const railNames = /export const RAILS = \[(.*?)\];/s.exec(rails)[1].match(/\["([a-z0-9]+)"/g).map((m) => m.slice(2, -1));
  for (const r of railNames) {
    assert.ok(RAIL_ARTICLE[r], `rail "${r}" has no article — add it to RAIL_ARTICLE`);
    assert.ok(bySlug[RAIL_ARTICLE[r]], `rail "${r}" points at a missing article ${RAIL_ARTICLE[r]}`);
  }
  // which rail each data-act belongs to
  const parts = rails.split(/<div class="cp-rail ([a-z0-9-]+)[^"]*"/).slice(1);
  const missing = [], silent = [];
  for (let i = 0; i < parts.length; i += 2) {
    const rail = parts[i].replace(/^cp-/, ""), body = parts[i + 1];
    const acts = new Set([...body.matchAll(/data-act="([a-z0-9-]+)"/g)].map((m) => m[1]));
    if (rail === "utility") acts.add("clef"); // built by clefBtn()
    if (rail === "expression") acts.add("dyn"); // built by dynBtn()
    if (rail === "palette") acts.add("voice"); // the voice picker's rows
    for (const act of acts) {
      const word = ACT_WORDS[`${rail}/${act}`] ?? ACT_WORDS[act];
      if (!word) { missing.push(`${rail}/${act}`); continue; }
      const article = bySlug[ACT_ARTICLE[`${rail}/${act}`] ?? RAIL_ARTICLE[rail]];
      const hay = `${article.title} ${article.text}`.toLowerCase();
      if (!hay.includes(word.toLowerCase())) silent.push(`${rail}/${act} → "${word}" not in ${article.slug}`);
    }
  }
  assert.deepEqual(missing, [], "buttons with no ACT_WORDS entry — document them, then add the word here");
  assert.deepEqual(silent, [], "buttons whose article never mentions them");
});

test("the tools map declares a route and sections for every help tool", () => {
  for (const [tool, cfg] of Object.entries(TOOLS)) {
    assert.ok(cfg.route && cfg.sections.length, `${tool}: route + sections`);
    for (const s of cfg.sections) assert.ok(articles.some((a) => a.tool === tool && a.section === s.id), `${tool}/${s.id}: an empty section`);
  }
});
