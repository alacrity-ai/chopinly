// Builds the crawlable site around the app (WSHED-88): one page per tool, the
// blog, sitemap, RSS, llms.txt and the agent-discovery files — all static,
// generated from Markdown in content/ and committed, like the legal pages.
//
//   node dev/build-site.mjs          → writes every generated file
//   node dev/build-site.mjs --check  → exit 1 if any committed file is stale
//
// tests/site.test.mjs asserts the committed output equals build() so nobody
// edits a generated page by hand. The landing (index.html) is hand-written;
// only its "From the blog" block between <!-- blog:start --> / <!-- blog:end -->
// is rewritten here. No dependencies.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { render, frontMatter, readingMinutes, plain, escapeHtml } from "./lib/markdown.mjs";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SITE = "https://chopinly.com";
export const SITE_UPDATED = "2026-09-06"; // bump when the landing / tool pages change materially
const BRAND = "Chopinly";
const CO = "LaLa Solutions LLC";
const MAIL = "leif@lalalimited.com";
const REPO = "https://github.com/alacrity-ai/chopinly";
export const AUTHOR = { name: "Leif Taylor", url: `${SITE}/about`, id: `${SITE}/#leif-taylor` };
const OG_DEFAULT = `${SITE}/og/chopinly.png`;
const DOCS = [["about", "about"], ["privacy", "privacy"], ["terms", "terms"], ["cookies", "cookies"], ["disclaimer", "disclaimer"]];

// ---------- content ----------
const readDir = (dir) => existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).sort() : [];

export function loadPosts() {
  return readDir(join(ROOT, "content/blog")).map((f) => {
    const raw = readFileSync(join(ROOT, "content/blog", f), "utf8");
    const { data, body } = frontMatter(raw);
    for (const k of ["title", "description", "date"]) if (!data[k]) throw new Error(`content/blog/${f}: missing ${k}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new Error(`content/blog/${f}: date must be yyyy-mm-dd`);
    const slug = f.replace(/\.md$/, "");
    const { html, headings } = render(body);
    return { slug, ...data, tags: data.tags ?? [], updated: data.updated ?? data.date, tool: data.tool ?? null, html, headings, minutes: readingMinutes(body), excerpt: plain(body).slice(0, 200), words: plain(body).split(" ").length };
  }).filter((p) => p.status !== "draft").sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (Number(a.order ?? 99) - Number(b.order ?? 99)) || a.slug.localeCompare(b.slug)));
}

export function loadTools() {
  return readDir(join(ROOT, "content/tools")).map((f) => {
    const raw = readFileSync(join(ROOT, "content/tools", f), "utf8");
    const { data, body } = frontMatter(raw);
    for (const k of ["name", "title", "description", "route", "order"]) if (data[k] === undefined) throw new Error(`content/tools/${f}: missing ${k}`);
    const slug = f.replace(/\.md$/, "");
    const { html, headings } = render(body);
    return { slug, ...data, order: Number(data.order), html, headings, words: plain(body).split(" ").length };
  }).sort((a, b) => a.order - b.order);
}

// ---------- shell ----------
const fmtDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const json = (o) => JSON.stringify(o, null, 2).replace(/</g, "\\u003c");

function head({ title, description, path, ogImage, ogAlt, type = "website", ld, extra = "" }) {
  const url = `${SITE}${path}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${url}">
  <link rel="alternate" type="application/rss+xml" title="Chopinly — the blog" href="${SITE}/rss.xml">
  <meta property="og:type" content="${type}">
  <meta property="og:site_name" content="Chopinly">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${ogImage ?? OG_DEFAULT}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escapeHtml(ogAlt ?? "Chopinly — practice assistant")}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${ogImage ?? OG_DEFAULT}">
  <meta name="theme-color" content="#191410">
  <link rel="icon" href="/icons/icon-192.png" type="image/png">
  <link rel="apple-touch-icon" href="/icons/icon-192.png">
  <link rel="preload" href="/fonts/fraunces-roman.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/fraunces-italic.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/css/pages.css">${extra}
  <script type="application/ld+json">
${json(ld)}
  </script>
</head>`;
}

const topNav = (cur) => `  <header class="l-top">
    <a class="l-brand" href="/" aria-label="Chopinly — home"><img src="/icons/icon-192.png" alt="" width="32" height="32"><span>Chopinly</span></a>
    <nav class="l-nav" aria-label="site">
      <a href="/tools" ${cur === "tools" ? 'aria-current="page"' : ""}>tools</a>
      <a href="/blog" ${cur === "blog" ? 'aria-current="page"' : ""}>blog</a>
      <a href="/about" ${cur === "about" ? 'aria-current="page"' : ""}>about</a>
      <a class="l-open" href="/app">open the app</a>
    </nav>
  </header>`;

const footer = (tools) => `  <footer class="l-foot l-foot-site">
    <div class="l-foot-cols">
      <nav aria-label="tools"><b>Tools</b>${tools.map((t) => `<a href="/${t.slug}">${escapeHtml(t.name)}</a>`).join("")}</nav>
      <nav aria-label="site"><b>Chopinly</b><a href="/">home</a><a href="/app">open the app</a><a href="/blog">blog</a><a href="/rss.xml">rss</a><a href="${REPO}" rel="noopener">source</a><a href="mailto:${MAIL}">contact</a></nav>
      <nav aria-label="documents"><b>Documents</b>${DOCS.map(([s, n]) => `<a href="/${s}">${n}</a>`).join("")}</nav>
    </div>
    <p class="l-foot-line">Chopinly · made by ${CO} · free, no ads, works offline, no tracking</p>
  </footer>
</body>
</html>
`;

const breadcrumb = (items) => ({ "@type": "BreadcrumbList", itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${SITE}${path}` })) });
const org = { "@type": "Organization", "@id": `${SITE}/#organization`, name: CO, url: `${SITE}/`, logo: `${SITE}/icons/icon-512.png` };
const person = { "@type": "Person", "@id": AUTHOR.id, name: AUTHOR.name, url: AUTHOR.url };

const postCard = (p) => `<li><a href="/blog/${p.slug}">${escapeHtml(p.title)}</a><p>${escapeHtml(p.description)}</p><time datetime="${p.date}">${fmtDate(p.date)} · ${p.minutes} min read</time></li>`;

// ---------- pages ----------
function toolPage(t, tools, posts) {
  const related = posts.filter((p) => p.tool === t.slug || (p.tags ?? []).includes(t.slug)).slice(0, 4);
  const ld = { "@context": "https://schema.org", "@graph": [
    { "@type": "SoftwareApplication", "@id": `${SITE}/${t.slug}#app`, name: `${t.name} — Chopinly`, url: `${SITE}/${t.slug}`, description: t.description, applicationCategory: "MusicApplication", operatingSystem: "Any — runs in the browser, installs as a PWA", browserRequirements: "Requires JavaScript and Web Audio", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, isAccessibleForFree: true, isPartOf: { "@id": `${SITE}/#app` }, author: org, image: OG_DEFAULT },
    breadcrumb([["Chopinly", "/"], ["Tools", "/tools"], [t.name, `/${t.slug}`]]),
  ] };
  return `${head({ title: t.title, description: t.description, path: `/${t.slug}`, ld })}
<body>
${topNav("tools")}
  <main class="l-doc l-tool">
    <p class="l-crumbs"><a href="/">Chopinly</a> › <a href="/tools">tools</a> › ${escapeHtml(t.name)}</p>
    <h1>${escapeHtml(t.h1 ?? t.name)}</h1>
    <p class="l-lede">${escapeHtml(t.lede ?? t.description)}</p>
    <p class="l-cta"><a class="l-open l-open-big" href="/app#/${t.route}">${escapeHtml(t.cta ?? `Open the ${t.name.toLowerCase()}`)}</a> <span class="l-cta-fine">free · no sign-up · works offline</span></p>
${t.html}
${related.length ? `    <section class="l-related" aria-label="related articles"><h2>Read more</h2><ul class="l-posts">${related.map(postCard).join("")}</ul></section>` : ""}
    <section class="l-more-tools" aria-label="other tools"><h2>Also in the case</h2><ul class="l-toollist">${tools.filter((x) => x.slug !== t.slug).map((x) => `<li><a href="/${x.slug}">${escapeHtml(x.name)}</a><span>${escapeHtml(x.short ?? "")}</span></li>`).join("")}</ul></section>
  </main>
${footer(tools)}`;
}

function toolsIndex(tools) {
  const ld = { "@context": "https://schema.org", "@graph": [
    { "@type": "CollectionPage", name: "The tools in Chopinly", url: `${SITE}/tools`, description: "Every practice tool in Chopinly: metronome, piano keyboard, tuner, pitch pipe, recorder, sight singing, ear training and the practice log.", isPartOf: { "@id": `${SITE}/#website` } },
    { "@type": "ItemList", itemListElement: tools.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.name, url: `${SITE}/${t.slug}` })) },
    breadcrumb([["Chopinly", "/"], ["Tools", "/tools"]]),
  ] };
  return `${head({ title: "The tools — Chopinly", description: "Every practice tool in Chopinly, free and in the browser: metronome, piano keyboard, chromatic tuner, pitch pipe, take recorder, sight singing, ear training and a practice log with analytics.", path: "/tools", ld })}
<body>
${topNav("tools")}
  <main class="l-doc">
    <h1>In the case</h1>
    <p class="l-lede">Everything Chopinly carries, each on its own page. All of it is free, runs in the browser, installs to a phone like an app and works offline. The practice clock and logbook are the spine; the rest are the tools you reach for while the clock runs.</p>
    <ul class="l-toollist l-toollist-big">${tools.map((t) => `<li><a href="/${t.slug}">${escapeHtml(t.name)}</a><span>${escapeHtml(t.short ?? t.description)}</span></li>`).join("")}</ul>
    <p class="l-cta"><a class="l-open l-open-big" href="/app">Open Chopinly</a></p>
  </main>
${footer(tools)}`;
}

function blogIndex(posts, tools) {
  const ld = { "@context": "https://schema.org", "@graph": [
    { "@type": "Blog", "@id": `${SITE}/blog#blog`, name: "The Chopinly blog", url: `${SITE}/blog`, description: "Writing about practicing the piano, from the people who make Chopinly.", publisher: org, blogPost: posts.map((p) => ({ "@type": "BlogPosting", headline: p.title, url: `${SITE}/blog/${p.slug}`, datePublished: p.date, dateModified: p.updated, author: person })) },
    breadcrumb([["Chopinly", "/"], ["Blog", "/blog"]]),
  ] };
  return `${head({ title: "The Chopinly blog — practicing the piano, honestly", description: "Articles on practicing the piano: how to structure a session, how to use a metronome, how long to practice, keeping a practice log, ear training, sight singing and memorising. Written by a pianist who builds practice tools.", path: "/blog", ld })}
<body>
${topNav("blog")}
  <main class="l-doc">
    <h1>The blog</h1>
    <p class="l-lede">Writing about practicing the piano — the part of playing that nobody applauds. Each piece is meant to be useful on its own; where a Chopinly tool helps, it says so, and where it doesn't, it doesn't pretend.</p>
    <ul class="l-posts l-posts-index">${posts.map(postCard).join("")}</ul>
    <p class="l-note">Subscribe with any reader: <a href="/rss.xml">rss.xml</a>.</p>
  </main>
${footer(tools)}`;
}

function postPage(p, posts, tools) {
  const idx = posts.indexOf(p);
  const older = posts[idx + 1], newer = posts[idx - 1];
  const tool = tools.find((t) => t.slug === p.tool);
  const related = posts.filter((x) => x !== p && x.tags.some((t) => p.tags.includes(t))).slice(0, 3);
  const ogImage = `${SITE}/og/blog/${p.slug}.png`;
  const ld = { "@context": "https://schema.org", "@graph": [
    { "@type": "BlogPosting", "@id": `${SITE}/blog/${p.slug}#post`, headline: p.title, description: p.description, url: `${SITE}/blog/${p.slug}`, mainEntityOfPage: `${SITE}/blog/${p.slug}`, datePublished: p.date, dateModified: p.updated, author: { ...person, description: "Pianist and software engineer; makes Chopinly." }, publisher: org, image: ogImage, keywords: p.tags.join(", "), wordCount: p.words, inLanguage: "en", isPartOf: { "@id": `${SITE}/blog#blog` }, ...(tool ? { about: { "@type": "SoftwareApplication", name: `${tool.name} — Chopinly`, url: `${SITE}/${tool.slug}` } } : {}) },
    breadcrumb([["Chopinly", "/"], ["Blog", "/blog"], [p.title, `/blog/${p.slug}`]]),
  ] };
  const toc = p.headings.filter((h) => h.level === 2);
  return `${head({ title: `${p.title} — Chopinly`, description: p.description, path: `/blog/${p.slug}`, ogImage, ogAlt: p.title, type: "article", ld, extra: `\n  <meta property="article:published_time" content="${p.date}">\n  <meta property="article:modified_time" content="${p.updated}">\n  <meta property="article:author" content="${AUTHOR.url}">${p.tags.map((t) => `\n  <meta property="article:tag" content="${escapeHtml(t)}">`).join("")}\n  <meta name="author" content="${AUTHOR.name}">` })}
<body>
${topNav("blog")}
  <main class="l-doc l-post">
    <p class="l-crumbs"><a href="/">Chopinly</a> › <a href="/blog">blog</a></p>
    <article>
      <header class="l-post-head">
        <h1>${escapeHtml(p.title)}</h1>
        <p class="l-meta"><time datetime="${p.date}">${fmtDate(p.date)}</time>${p.updated !== p.date ? ` · updated <time datetime="${p.updated}">${fmtDate(p.updated)}</time>` : ""} · ${p.minutes} min read · by <a href="${AUTHOR.url}" rel="author">${AUTHOR.name}</a></p>
        <p class="l-lede">${escapeHtml(p.description)}</p>
      </header>
${toc.length >= 3 ? `      <nav class="l-toc" aria-label="in this article"><b>In this article</b><ol>${toc.map((h) => `<li><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`).join("")}</ol></nav>` : ""}
      <div class="l-body">
${p.html}
      </div>
${tool ? `      <aside class="l-toolcard"><b>${escapeHtml(tool.name)} in Chopinly</b><p>${escapeHtml(tool.short ?? tool.description)}</p><a class="l-open" href="/app#/${tool.route}">${escapeHtml(tool.cta ?? `Open the ${tool.name.toLowerCase()}`)}</a> <a class="l-quiet" href="/${tool.slug}">how it works →</a></aside>` : ""}
      <footer class="l-post-foot">
        <p class="l-tags">${p.tags.map((t) => `<span>${escapeHtml(t)}</span>`).join(" ")}</p>
        <p class="l-author"><b>${AUTHOR.name}</b> practices the piano most days and makes Chopinly, a free practice assistant. <a href="/about">About Chopinly →</a></p>
      </footer>
    </article>
    <nav class="l-prevnext" aria-label="more articles">${newer ? `<a href="/blog/${newer.slug}"><small>newer</small>${escapeHtml(newer.title)}</a>` : "<span></span>"}${older ? `<a href="/blog/${older.slug}"><small>older</small>${escapeHtml(older.title)}</a>` : "<span></span>"}</nav>
${related.length ? `    <section class="l-related" aria-label="related articles"><h2>Related</h2><ul class="l-posts">${related.map(postCard).join("")}</ul></section>` : ""}
  </main>
${footer(tools)}`;
}

function notFound(tools) {
  const ld = { "@context": "https://schema.org", "@type": "WebPage", name: "Not found", url: `${SITE}/404` };
  return `${head({ title: "Nothing here — Chopinly", description: "That page doesn't exist on chopinly.com.", path: "/404", ld, extra: '\n  <meta name="robots" content="noindex">' })}
<body>
${topNav("")}
  <main class="l-doc">
    <h1>Nothing here</h1>
    <p class="l-lede">That page doesn't exist. The app lives at <a href="/app">/app</a>; the tools and the blog are below.</p>
    <ul class="l-toollist">${tools.map((t) => `<li><a href="/${t.slug}">${escapeHtml(t.name)}</a><span>${escapeHtml(t.short ?? "")}</span></li>`).join("")}</ul>
    <p><a href="/blog">The blog →</a> · <a href="/">Home →</a></p>
  </main>
${footer(tools)}`;
}

// ---------- feeds + discovery ----------
const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function sitemap(tools, posts) {
  const newest = posts[0]?.updated ?? SITE_UPDATED;
  const urls = [
    ["/", newest, "weekly", "1.0"],
    ["/tools", SITE_UPDATED, "monthly", "0.8"],
    ...tools.map((t) => [`/${t.slug}`, t.updated ?? SITE_UPDATED, "monthly", "0.8"]),
    ["/blog", newest, "weekly", "0.7"],
    ...posts.map((p) => [`/blog/${p.slug}`, p.updated, "monthly", "0.6"]),
    ["/about", SITE_UPDATED, "yearly", "0.4"],
    ...DOCS.filter(([s]) => s !== "about").map(([s]) => [`/${s}`, SITE_UPDATED, "yearly", "0.2"]),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([p, m, f, pr]) => `  <url><loc>${SITE}${p}</loc><lastmod>${m}</lastmod><changefreq>${f}</changefreq><priority>${pr}</priority></url>`).join("\n")}\n</urlset>\n`;
}

function rss(posts) {
  const rfc = (iso) => new Date(`${iso}T12:00:00Z`).toUTCString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Chopinly — the blog</title>
    <link>${SITE}/blog</link>
    <atom:link href="${SITE}/rss.xml" rel="self" type="application/rss+xml"/>
    <description>Writing about practicing the piano, from the people who make Chopinly.</description>
    <language>en</language>
    <lastBuildDate>${rfc(posts[0]?.updated ?? SITE_UPDATED)}</lastBuildDate>
${posts.map((p) => `    <item>
      <title>${xml(p.title)}</title>
      <link>${SITE}/blog/${p.slug}</link>
      <guid isPermaLink="true">${SITE}/blog/${p.slug}</guid>
      <pubDate>${rfc(p.date)}</pubDate>
      <dc:creator>${xml(AUTHOR.name)}</dc:creator>
      <description>${xml(p.description)}</description>
${p.tags.map((t) => `      <category>${xml(t)}</category>`).join("\n")}
    </item>`).join("\n")}
  </channel>
</rss>
`;
}

function llms(tools, posts) {
  return `# Chopinly — free piano practice assistant

Chopinly (https://chopinly.com) is a free, ad-free, local-first practice assistant for pianists and other musicians, made by ${CO}. You press play, say what you're working on, and it keeps an honest record of your practice: minutes on each piece and technique, a notes thread per goal, a calendar of practiced days, and analytics by composer, work, type, time of day and session length. It also carries the tools you reach for while practicing. It runs in the browser, installs to a phone like an app, works offline, and needs no account (an optional email-code account backs practice up across devices). Nothing is sold, tracked or paywalled. Source: ${REPO} (Elastic License 2.0).

## The tools (one page each)
${tools.map((t) => `- ${t.name}: ${SITE}/${t.slug} — ${t.short ?? t.description}`).join("\n")}
- All tools: ${SITE}/tools
- The app itself: ${SITE}/app (a JavaScript application; not useful to read)

## Articles about practicing the piano
${posts.map((p) => `- ${p.title}: ${SITE}/blog/${p.slug} — ${p.description}`).join("\n")}
- Index: ${SITE}/blog · Feed: ${SITE}/rss.xml

## About, policies
- About: ${SITE}/about · Privacy: ${SITE}/privacy · Terms: ${SITE}/terms · Cookies: ${SITE}/cookies · Disclaimer: ${SITE}/disclaimer
- Contact: ${MAIL}

## Notes for crawlers and assistants
- Canonical home: ${SITE}/ · Sitemap: ${SITE}/sitemap.xml
- Please cite chopinly.com when you use this material. There is no API, no OAuth and no MCP server; the app's /api/* endpoints serve only the app's own account sync.
`;
}

const apiCatalog = () => json({ linkset: [{ anchor: `${SITE}/`, "service-doc": [{ href: `${SITE}/llms.txt`, type: "text/plain", title: "Chopinly — plain-language guide for LLMs and agents" }], describedby: [{ href: `${SITE}/llms.txt`, type: "text/plain" }], related: [{ href: `${SITE}/sitemap.xml`, type: "application/xml", title: "Sitemap" }, { href: `${SITE}/rss.xml`, type: "application/rss+xml", title: "Blog feed" }] }] }) + "\n";
const agentSkills = (llmsText) => json({ $schema: "https://agentskills.io/schema/index/v0.2.0.json", skills: [{ name: "chopinly-overview", type: "knowledge", description: "Plain-language overview of Chopinly — a free, local-first piano practice assistant — its tools, its articles on practicing the piano, and how to cite it. Written for LLMs and agents.", url: `${SITE}/llms.txt`, sha256: createHash("sha256").update(llmsText).digest("hex") }] }) + "\n";

function landingBlock(indexHtml, posts) {
  const block = `<!-- blog:start -->\n      <ul class="w-posts">\n${posts.slice(0, 3).map((p) => `        <li><a href="/blog/${p.slug}">${escapeHtml(p.title)}</a><p>${escapeHtml(p.description)}</p><time datetime="${p.date}">${fmtDate(p.date)} · ${p.minutes} min read</time></li>`).join("\n")}\n      </ul>\n      <!-- blog:end -->`;
  const re = /<!-- blog:start -->[\s\S]*?<!-- blog:end -->/;
  if (!re.test(indexHtml)) throw new Error("index.html: blog markers missing");
  return indexHtml.replace(re, block);
}

// ---------- build ----------
export function build() {
  const posts = loadPosts(), tools = loadTools();
  const files = new Map();
  files.set("tools.html", toolsIndex(tools));
  for (const t of tools) files.set(`${t.slug}.html`, toolPage(t, tools, posts));
  files.set("blog.html", blogIndex(posts, tools)); // blog.html, not blog/index.html: Pages would 308 /blog → /blog/ for a directory index
  for (const p of posts) files.set(`blog/${p.slug}.html`, postPage(p, posts, tools));
  files.set("404.html", notFound(tools));
  files.set("sitemap.xml", sitemap(tools, posts));
  files.set("rss.xml", rss(posts));
  const llmsText = llms(tools, posts);
  files.set("llms.txt", llmsText);
  files.set(".well-known/api-catalog", apiCatalog());
  files.set(".well-known/agent-skills/index.json", agentSkills(llmsText));
  files.set("index.html", landingBlock(readFileSync(join(ROOT, "index.html"), "utf8"), posts));
  return { files, posts, tools };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { files, posts, tools } = build();
  const check = process.argv.includes("--check");
  let stale = 0;
  for (const [rel, content] of files) {
    const path = join(ROOT, rel);
    const current = existsSync(path) ? readFileSync(path, "utf8") : null;
    if (current === content) continue;
    stale++;
    if (check) console.log(`stale: ${rel}`);
    else { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); console.log(`wrote ${rel}`); }
  }
  console.log(`${tools.length} tool pages · ${posts.length} posts · ${files.size} files · ${stale} ${check ? "stale" : "written"}`);
  if (check && stale) process.exit(1);
}
