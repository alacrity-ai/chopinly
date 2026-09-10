// Route table: "METHOD /api/path" → handler(ctx); `dynamicRoutes` carry an :id
// segment and are tried after the exact table (scores, WSHED-102).
import { json } from "./http.js";
import { authRoutes } from "./auth.js";
import { syncRoutes } from "./sync.js";
import { scoreRoutes, scoreDynamicRoutes } from "./scores.js";

export const routes = {
  ...authRoutes,
  ...syncRoutes,
  ...scoreRoutes,
  "GET /api/health": async ({ env }) => {
    let db = false;
    try { db = (await env.DB.prepare("SELECT 1 AS one").first("one")) === 1; } catch { db = false; }
    return json(db ? 200 : 503, { ok: db, db, at: Date.now() });
  },
};

export const dynamicRoutes = [...scoreDynamicRoutes];
