// Route table: "METHOD /api/path" → handler(ctx). Phase 0 ships health only;
// auth (P1) and sync (P3) register here.
import { json } from "./http.js";
import { authRoutes } from "./auth.js";

export const routes = {
  ...authRoutes,
  "GET /api/health": async ({ env }) => {
    let db = false;
    try { db = (await env.DB.prepare("SELECT 1 AS one").first("one")) === 1; } catch { db = false; }
    return json(db ? 200 : 503, { ok: db, db, at: Date.now() });
  },
};
