// The help figures (docs/COMPOSE_HELP_DESIGN.md §5.1, §8): every name draws a
// well-formed SVG, nothing carries a literal colour (so every skin is right), and
// every gesture the editor knows has a picture.
import { test } from "node:test";
import assert from "node:assert/strict";
import { figure, FIGURES, W, H } from "../js/lib/help/figures.js";

test("every figure is a well-formed, titled, sized SVG", () => {
  assert.ok(FIGURES.length >= 14, `${FIGURES.length} figures`);
  for (const name of FIGURES) {
    const svg = figure(name);
    assert.ok(svg.startsWith("<svg "), name);
    assert.ok(svg.endsWith("</svg>"), name);
    assert.ok(svg.includes(`viewBox="0 0 ${W} ${H}"`), `${name}: viewBox`);
    assert.match(svg, /<title id="fg-[a-z0-9-]+">[^<]+<\/title>/, `${name}: a title for a screen reader`);
    assert.ok(svg.includes('role="img"'), `${name}: role`);
    assert.ok(!/<script|onload=|onclick=/i.test(svg), `${name}: no script`);
    // balanced tags, roughly: every element opened is closed or self-closing
    const opens = (svg.match(/<(?!\/)[a-z]+/g) ?? []).length;
    const closes = (svg.match(/<\/[a-z]+>/g) ?? []).length + (svg.match(/\/>/g) ?? []).length;
    assert.equal(opens, closes, `${name}: ${opens} opened, ${closes} closed`);
    assert.ok(!/NaN|undefined/.test(svg), `${name}: a coordinate did not compute`);
  }
});

test("no figure carries a literal colour — ink comes from the skin", () => {
  for (const name of FIGURES) {
    const svg = figure(name);
    const literal = svg.match(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/gi) ?? [];
    assert.deepEqual(literal, [], `${name}: ${literal.join(", ")} — use a class and a token`);
    assert.ok(!/\bfill="(?!none)[a-z]/i.test(svg.replace(/fill="none"/g, "")), `${name}: a named colour`);
  }
});

test("a caption can be given, and an unknown name is a build failure", () => {
  assert.ok(figure("gesture-lasso", "My own words").includes(">My own words</title>"));
  assert.throws(() => figure("no-such-figure"), /no such figure/);
});

test("every gesture the editor knows has a picture", () => {
  for (const n of ["gesture-lasso", "gesture-strike", "gesture-chevron-up", "gesture-chevron-down", "gesture-chevron-left", "gesture-chevron-right", "gesture-hold", "gesture-aim"]) {
    assert.ok(FIGURES.includes(n), `missing ${n}`);
  }
});
