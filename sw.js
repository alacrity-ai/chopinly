// Network-first, cache-fallback. Installable + fully offline, but never serves
// a stale shell when the network is up (see docs/DESIGN.md §5).
const CACHE = "woodshed-v4";
const SHELL = [
  "/",
  "/css/app.css",
  "/js/app.js",
  "/js/registry.js",
  "/js/lib/audio.js",
  "/js/lib/store.js",
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
  "/js/tools/pitchpipe/index.js",
  "/js/tools/pitchpipe/ui.js",
  "/js/tools/tuner/index.js",
  "/js/tools/tuner/ui.js",
  "/js/tools/sightsinging/index.js",
  "/js/tools/sightsinging/ui.js",
  "/js/tools/sightsinging/judge.js",
  "/js/tools/sightsinging/melodies.js",
  "/fonts/Bravura.woff2",
  "/fonts/fraunces-roman.woff2",
  "/fonts/fraunces-italic.woff2",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
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
