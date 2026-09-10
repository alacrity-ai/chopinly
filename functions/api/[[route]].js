// Chopinly API — Cloudflare Pages Functions, one router for /api/* (WSHED-48).
// Static shell and this API share the origin, so the session cookie is
// first-party and nothing here needs CORS.
import { json, HttpError } from "../lib/http.js";
import { routes, dynamicRoutes } from "../lib/routes.js";

export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/api";
  const method = ctx.request.method.toUpperCase();
  try {
    const handler = routes[`${method} ${path}`];
    if (handler) return await handler(ctx);
    for (const r of dynamicRoutes) {
      if (r.method !== method) continue;
      const m = r.re.exec(path);
      if (!m) continue;
      ctx.params = Object.fromEntries(r.params.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      return await r.handler(ctx);
    }
    throw new HttpError(404, "no such endpoint");
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    console.error("api error", path, e?.stack ?? e);
    return json(500, { error: "something went wrong on our side" });
  }
}
