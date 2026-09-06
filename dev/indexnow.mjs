// IndexNow (WSHED-92): tell Bing/Yandex/Naver/Seznam which URLs changed. The key
// is the public <key>.txt file in the repo root (IndexNow keys are not secrets —
// the protocol proves ownership by the file being served from the host).
//   node dev/indexnow.mjs            → submits every URL in sitemap.xml
//   node dev/indexnow.mjs /blog/x …  → submits just those paths
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOST = "chopinly.com";
const keyFile = readdirSync(ROOT).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) throw new Error("no IndexNow key file (<32 hex>.txt) in the repo root");
const key = keyFile.replace(/\.txt$/, "");
const args = process.argv.slice(2);
const urlList = args.length ? args.map((p) => `https://${HOST}${p}`) : [...readFileSync(join(ROOT, "sitemap.xml"), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const res = await fetch("https://api.indexnow.org/indexnow", { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${keyFile}`, urlList }) });
console.log(`IndexNow: ${res.status} ${res.statusText} for ${urlList.length} urls`);
if (res.status >= 300) { console.log(await res.text()); process.exit(1); }
