// content/help/<tool>/*.md → js/lib/help/content.js (docs/COMPOSE_HELP_DESIGN.md §6).
// The browser gets HTML, headings and plain text; it ships no Markdown parser. The
// output is committed and tests/help.test.mjs fails when it is stale — the contract
// the crawlable site already lives under.
//
//   node dev/build-help.mjs        write it
//   node dev/build-help.mjs --check  exit 1 if the committed file is stale
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { render, frontMatter, plain } from "./lib/markdown.mjs";
import { FIGURES, figure } from "../js/lib/help/figures.js";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "js/lib/help/content.js";

/** The tools that have a help section, and the sections each one's articles may claim. */
export const TOOLS = {
  compose: {
    route: "compose",
    sections: [
      { id: "start", title: "Start here" },
      { id: "editor", title: "The editor" },
      { id: "rails", title: "The rails" },
      { id: "keeping", title: "Keeping and sharing" },
    ],
  },
};

const IMG_LINE = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/;
const REQUIRED = ["slug", "title", "section", "order", "summary"];

/** width/height out of a PNG's IHDR, so a figure reserves its room and nothing reflows. */
function pngSize(file) {
  const b = readFileSync(file);
  if (b.length < 24 || b.readUInt32BE(12) !== 0x49484452) throw new Error(`${file}: not a PNG`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/** One article's Markdown → its compiled record. Throws with the file name on anything wrong. */
export function compile(tool, file, raw) {
  const { data, body } = frontMatter(raw);
  for (const k of REQUIRED) if (!data[k]) throw new Error(`${file}: front matter needs ${k}`);
  const slug = String(data.slug);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new Error(`${file}: slug "${slug}" is not kebab-case`);
  if (!TOOLS[tool].sections.some((s) => s.id === data.section)) throw new Error(`${file}: unknown section "${data.section}"`);

  // Standalone image lines become sentinels, so the body renders once and heading ids stay unique.
  const figures = [];
  const staged = body.split("\n").map((line) => {
    const m = IMG_LINE.exec(line);
    if (!m) {
      if (/!\[[^\]]*\]\(/.test(line)) throw new Error(`${file}: an image must be alone on its line`);
      return line;
    }
    figures.push({ alt: m[1], src: m[2] });
    return `@@FIG${figures.length - 1}@@`;
  }).join("\n");

  const { html: rendered, headings } = render(staged);
  const html = rendered.replace(/<p>@@FIG(\d+)@@<\/p>/g, (_, i) => figureHtml(tool, file, figures[+i]));
  if (/@@FIG\d+@@/.test(html)) throw new Error(`${file}: an image line did not become a figure`);

  return {
    slug,
    title: String(data.title),
    section: String(data.section),
    order: Number(data.order),
    summary: String(data.summary),
    keywords: (data.keywords ?? []).map(String),
    headings: headings.filter((h) => h.level === 2 || h.level === 3),
    html: links(html, tool),
    text: plain(body.replace(IMG_LINE, " ")),
  };
}

/** `help:<slug>` → the help route; `app:<route>` → the tool. Everything else is left alone. */
const links = (html, tool) => html
  .replace(/href="help:([a-z0-9-]+)(#[a-z0-9-]+)?"/g, (_, s, h) => `href="#/${TOOLS[tool].route}/help/${s}${h ?? ""}"`)
  .replace(/href="app:([a-z0-9/-]+)"/g, (_, r) => `href="#/${r}"`);

function figureHtml(tool, file, { alt, src }) {
  const caption = alt ? `<figcaption>${escAttr(alt)}</figcaption>` : "";
  if (src.startsWith("figure:")) {
    const name = src.slice(7);
    if (!FIGURES.includes(name)) throw new Error(`${file}: no such figure "${name}" (have: ${FIGURES.join(", ")})`);
    return `<figure class="hp-figure">${figure(name, alt || undefined)}${caption}</figure>`;
  }
  if (!src.startsWith("/img/help/")) throw new Error(`${file}: an image is either figure:<name> or a path under /img/help/ (got ${src})`);
  const abs = join(ROOT, src.slice(1));
  if (!existsSync(abs)) throw new Error(`${file}: ${src} is not on disk — run node dev/shoot-help.mjs`);
  const { w, h } = pngSize(abs);
  return `<figure class="hp-figure hp-shot"><img src="${escAttr(src)}" alt="${escAttr(alt)}" width="${w}" height="${h}" loading="lazy" decoding="async">${caption}</figure>`;
}

export function build() {
  const articles = [];
  const sections = [];
  for (const [tool, cfg] of Object.entries(TOOLS)) {
    const dir = join(ROOT, "content", "help", tool);
    if (!existsSync(dir)) continue;
    for (const s of cfg.sections) sections.push({ ...s, tool });
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".md")).sort()) {
      articles.push({ tool, ...compile(tool, `content/help/${tool}/${f}`, readFileSync(join(dir, f), "utf8")) });
    }
  }
  const rank = (a) => sections.findIndex((s) => s.tool === a.tool && s.id === a.section);
  articles.sort((a, b) => rank(a) - rank(b) || a.order - b.order || a.slug.localeCompare(b.slug));

  const dup = articles.map((a) => a.slug).filter((s, i, all) => all.indexOf(s) !== i);
  if (dup.length) throw new Error(`duplicate slugs: ${[...new Set(dup)].join(", ")}`);
  for (const a of articles) {
    for (const [, slug] of a.html.matchAll(/href="#\/[a-z-]+\/help\/([a-z0-9-]+)/g)) {
      if (!articles.some((x) => x.slug === slug)) throw new Error(`${a.slug}: links to help:${slug}, which does not exist`);
    }
  }

  const j = (v) => JSON.stringify(v);
  const body = `// GENERATED by dev/build-help.mjs from content/help/ — do not edit.
// The help corpus: one HTML string, heading list and plain text per article
// (docs/COMPOSE_HELP_DESIGN.md §6). tests/help.test.mjs fails when this is stale.

export const SECTIONS = ${j(sections)};

export const ARTICLES = [
${articles.map((a) => `  { tool: ${j(a.tool)}, slug: ${j(a.slug)}, title: ${j(a.title)}, section: ${j(a.section)}, order: ${a.order},\n    summary: ${j(a.summary)},\n    keywords: ${j(a.keywords)},\n    headings: ${j(a.headings)},\n    html: ${j(a.html)},\n    text: ${j(a.text)} },`).join("\n")}
];

export const BY_SLUG = Object.fromEntries(ARTICLES.map((a) => [a.slug, a]));

/** The articles of one tool, in reading order. */
export const forTool = (tool) => ARTICLES.filter((a) => a.tool === tool);
/** The sections of one tool that actually have articles, in order. */
export const sectionsFor = (tool) => SECTIONS.filter((s) => s.tool === tool && ARTICLES.some((a) => a.tool === tool && a.section === s.id));
`;
  return { files: new Map([[OUT, body]]), articles, sections };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { files, articles } = build();
  const check = process.argv.includes("--check");
  let stale = 0;
  for (const [rel, content] of files) {
    const path = join(ROOT, rel);
    const same = existsSync(path) && readFileSync(path, "utf8") === content;
    if (same) continue;
    stale++;
    if (check) console.error(`stale: ${rel}`);
    else { writeFileSync(path, content); console.log(`wrote ${rel} (${articles.length} articles, ${(content.length / 1024).toFixed(1)} KB)`); }
  }
  if (check && stale) process.exit(1);
  if (!check && !stale) console.log(`up to date (${articles.length} articles)`);
}
