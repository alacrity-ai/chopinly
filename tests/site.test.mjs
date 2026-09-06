import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { build, ROOT, SITE } from "../dev/build-site.mjs";

const { files, posts, tools } = build();

test("the committed site equals the generator's output (run `node dev/build-site.mjs`)", () => {
  const stale = [...files].filter(([rel, content]) => !existsSync(join(ROOT, rel)) || readFileSync(join(ROOT, rel), "utf8") !== content).map(([rel]) => rel);
  assert.deepEqual(stale, []);
});

test("every tool page and post carries canonical, one h1, JSON-LD that parses, and enough real copy", () => {
  for (const [rel, html] of files) {
    if (!rel.endsWith(".html") || rel === "index.html") continue;
    const path = rel === "404.html" ? "/404" : "/" + rel.replace(/\.html$/, "");
    assert.ok(!rel.endsWith("/index.html"), `${rel}: directory indexes 308 to a trailing slash on Pages`);
    assert.ok(html.includes(`<link rel="canonical" href="${SITE}${path}">`), `${rel} canonical`);
    assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1, `${rel} has one h1`);
    const ld = /<script type="application\/ld\+json">\n([\s\S]*?)\n  <\/script>/.exec(html);
    assert.ok(ld, `${rel} JSON-LD`);
    JSON.parse(ld[1]);
    assert.ok(html.includes('property="og:image"') && html.includes("<title>"), `${rel} og + title`);
  }
  for (const t of tools) assert.ok(t.words >= 300, `${t.slug}: ${t.words} words`);
  for (const p of posts) assert.ok(p.words >= 900, `${p.slug}: ${p.words} words`);
  assert.ok(tools.length >= 8 && posts.length >= 6);
});

test("sitemap lists every page once with lastmod; rss has one item per post; agent-skills digest matches llms.txt", () => {
  const sm = files.get("sitemap.xml");
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.equal(new Set(locs).size, locs.length, "no duplicate urls");
  for (const t of tools) assert.ok(locs.includes(`${SITE}/${t.slug}`));
  for (const p of posts) assert.ok(locs.includes(`${SITE}/blog/${p.slug}`));
  assert.ok(locs.includes(`${SITE}/`) && locs.includes(`${SITE}/blog`) && locs.includes(`${SITE}/about`));
  assert.equal((sm.match(/<lastmod>/g) ?? []).length, locs.length);
  assert.equal((files.get("rss.xml").match(/<item>/g) ?? []).length, posts.length);
  const skills = JSON.parse(files.get(".well-known/agent-skills/index.json"));
  assert.equal(skills.skills[0].sha256, createHash("sha256").update(files.get("llms.txt")).digest("hex"));
  for (const p of posts) assert.ok(existsSync(join(ROOT, "og/blog", `${p.slug}.png`)), `${p.slug}: og image rendered (node dev/render-og.mjs --posts)`);
});
