import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".js") ? [p.slice(ROOT.length - 1)] : []; });

test("the service worker precaches every module under js/ (offline broke once because analytics.js was missing)", () => {
  const sw = readFileSync(join(ROOT, "sw.js"), "utf8");
  const shell = new Set([...sw.matchAll(/"(\/[^"]+)"/g)].map((m) => m[1]));
  const missing = walk(join(ROOT, "js")).filter((p) => !shell.has(p));
  assert.deepEqual(missing, []);
  for (const p of shell) if (p.startsWith("/js/")) assert.ok(statSync(join(ROOT, p)).isFile(), `${p} precached but gone`);
  assert.ok(shell.has("/app") && !shell.has("/"), "the app shell, not the landing, is the offline fallback");
});
