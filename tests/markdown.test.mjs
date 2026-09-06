import { test } from "node:test";
import assert from "node:assert/strict";
import { render, inline, frontMatter, slugify, readingMinutes, plain } from "../dev/lib/markdown.mjs";

test("inline: code is literal, bold/italic/links render, text is escaped", () => {
  assert.equal(inline("a `<b>` & *it* **bold** [x](/y) [z](https://e.com/q)"), 'a <code>&lt;b&gt;</code> &amp; <em>it</em> <strong>bold</strong> <a href="/y">x</a> <a href="https://e.com/q" rel="noopener">z</a>');
  assert.equal(inline("snake_case_word and 2*3*4"), "snake_case_word and 2*3*4", "underscores inside words and bare asterisks are not emphasis");
  assert.equal(inline("_whole_ and *x*"), "<em>whole</em> and <em>x</em>");
});

test("blocks: headings get ids, lists, quotes, code, tables, rules, paragraphs join soft breaks", () => {
  const md = `## How long?\n\nOne line\ntwo lines.\n\n- a\n- b **c**\n  continued\n\n1. x\n2. y\n\n> quoted *text*\n> more\n\n\`\`\`js\nlet a = 1 < 2;\n\`\`\`\n\n| Day | Minutes |\n|---|---:|\n| Mon | 30 |\n\n---\n\n## How long?\n`;
  const { html, headings } = render(md);
  assert.deepEqual(headings.map((h) => [h.level, h.id]), [[2, "how-long"], [2, "how-long-2"]], "duplicate headings get distinct ids");
  assert.ok(html.includes('<h2 id="how-long">How long?</h2>'));
  assert.ok(html.includes("<p>One line two lines.</p>"));
  assert.ok(html.includes("<ul><li>a</li><li>b <strong>c</strong> continued</li></ul>"));
  assert.ok(html.includes("<ol><li>x</li><li>y</li></ol>"));
  assert.ok(html.includes("<blockquote><p>quoted <em>text</em> more</p></blockquote>"));
  assert.ok(html.includes('<pre><code class="language-js">let a = 1 &lt; 2;</code></pre>'));
  assert.ok(html.includes('<th>Day</th><th style="text-align:right">Minutes</th>') && html.includes("<td>Mon</td>"));
  assert.ok(html.includes("<hr>"));
});

test("front matter: strings, quoted strings, inline and block arrays; body follows", () => {
  const { data, body } = frontMatter(`---\ntitle: "A: title"\ndate: 2026-09-06\ntags: [piano, practice]\nrelated:\n  - one\n  - two\n---\n# Body\n`);
  assert.deepEqual(data, { title: "A: title", date: "2026-09-06", tags: ["piano", "practice"], related: ["one", "two"] });
  assert.equal(body, "# Body\n");
  assert.deepEqual(frontMatter("no front matter").data, {});
});

test("helpers: slugify, reading time, plain excerpt", () => {
  assert.equal(slugify("Scales & Arpeggios: a routine that sticks!"), "scales-and-arpeggios-a-routine-that-sticks");
  assert.equal(readingMinutes("word ".repeat(450)), 2);
  assert.equal(readingMinutes("short"), 1);
  assert.equal(plain("## Head\n\nSome **bold** [link](/x) `code`\n\n- item"), "Head Some bold link code - item");
});
