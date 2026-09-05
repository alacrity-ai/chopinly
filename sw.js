// Network-first, cache-fallback. Installable + fully offline, but never serves
// a stale shell when the network is up (see docs/DESIGN.md §5).
const CACHE = "chopinly-v37";
const SHELL = [
  "/",
  "/css/app.css",
  "/js/app.js",
  "/js/registry.js",
  "/js/lib/audio.js",
  "/js/lib/store.js",
  "/js/lib/logbook.js",
  "/js/lib/merge.js",
  "/js/lib/account.js",
  "/js/lib/sync.js",
  "/js/ui/account.js",
  "/js/ui/appearance.js",
  "/js/lib/skins.js",
  "/js/lib/icons.js",
  "/js/lib/music.js",
  "/js/lib/melody-player.js",
  "/js/lib/pitch/detect.js",
  "/js/lib/pitch/mic.js",
  "/js/lib/staff/layout.js",
  "/js/lib/staff/render.js",
  "/js/tools/metronome/index.js",
  "/js/tools/metronome/engine.js",
  "/js/tools/metronome/voices.js",
  "/js/tools/metronome/ui.js",
  "/js/lib/eartraining/pitch.js",
  "/js/lib/eartraining/runs.js",
  "/js/tools/eartraining/index.js",
  "/js/tools/eartraining/ui.js",
  "/js/tools/eartraining/pitchrun.js",
  "/js/lib/takes/peaks.js",
  "/js/lib/takes/store.js",
  "/js/lib/takes/recorder.js",
  "/js/lib/takes/player.js",
  "/js/tools/logbook/takes.js",
  "/js/tools/recorder/index.js",
  "/js/tools/recorder/ui.js",
  "/js/lib/keyboard/layout.js",
  "/js/lib/keyboard/keyboard.js",
  "/js/lib/keyboard/piano.js",
  "/js/tools/keyboard/index.js",
  "/js/tools/keyboard/ui.js",
  "/js/tools/pitchpipe/index.js",
  "/js/tools/pitchpipe/ui.js",
  "/js/tools/tuner/index.js",
  "/js/tools/tuner/ui.js",
  "/js/tools/logbook/index.js",
  "/js/tools/logbook/ui.js",
  "/js/tools/logbook/library.js",
  "/js/tools/logbook/goalpage.js",
  "/js/tools/logbook/picker.js",
  "/js/tools/logbook/create.js",
  "/js/tools/logbook/notes.js",
  "/js/tools/logbook/history.js",
  "/js/tools/logbook/motion.js",
  "/js/tools/logbook/ceremony.js",
  "/js/tools/logbook/sparkline.js",
  "/js/tools/logbook/util.js",
  "/js/tools/sightsinging/index.js",
  "/js/tools/sightsinging/ui.js",
  "/js/tools/sightsinging/runner.js",
  "/js/tools/sightsinging/judge.js",
  "/js/tools/sightsinging/melodies.js",
  "/js/tools/sightsinging/corpus/index.js",
  "/js/tools/sightsinging/corpus/notation.js",
  "/js/tools/sightsinging/corpus/campaign.js",
  "/js/tools/sightsinging/corpus/classic.js",
  "/js/tools/sightsinging/corpus/book1.js",
  "/js/tools/sightsinging/corpus/book2.js",
  "/js/tools/sightsinging/corpus/book3.js",
  "/js/tools/sightsinging/corpus/book4.js",
  "/js/tools/sightsinging/corpus/book5.js",
  "/fonts/Bravura.woff2",
  "/fonts/fraunces-roman.woff2",
  "/fonts/fraunces-italic.woff2",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

// Every shell fetch carries ?v=<CACHE> and bypasses the HTTP cache, so a new
// worker version can never precache a stale module from the browser or edge
// cache (WSHED-58). Responses are stored under the clean URL.
const BUSTABLE = (path) => path === "/" || path === "/manifest.webmanifest" || /^\/(js|css)\//.test(path);
function netRequest(url) {
  const u = new URL(url, self.location.origin);
  if (BUSTABLE(u.pathname)) u.searchParams.set("v", CACHE);
  return fetch(u.href, { cache: "no-cache", credentials: "same-origin" });
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(SHELL.map(async (p) => { const r = await netRequest(p); if (!r.ok) throw new Error(`precache ${p} ${r.status}`); await c.put(p, r); })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window" }))
      .then((clients) => { for (const c of clients) c.postMessage({ type: "sw-updated", cache: CACHE }); }),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // the API is never cached (WSHED-48)
  e.respondWith(
    // cache:"no-cache" forces ETag revalidation — without it, fetch() serves the
    // browser HTTP cache (Pages sends max-age=14400 on assets) and "network-first"
    // can hand out files from before the latest deploy.
    netRequest(req.url)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        if (req.mode === "navigate") return caches.match("/");
        return Response.error();
      })
  );
});
