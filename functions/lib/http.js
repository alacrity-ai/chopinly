// Tiny HTTP helpers for the Pages Functions API (WSHED-48).
export const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex", ...headers } });

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Parse a JSON body; any failure is a 400 with a sentence. */
export async function readJson(request) {
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) throw new HttpError(400, "send JSON");
  try { return await request.json(); } catch { throw new HttpError(400, "that JSON didn't parse"); }
}

/** Mutating calls must be same-origin and carry the app header (CSRF belt + braces over SameSite=Lax). */
export function requireSameOrigin(request) {
  if (request.headers.get("x-chopinly") !== "1") throw new HttpError(403, "missing app header");
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) throw new HttpError(403, "wrong origin");
}

export const clientIp = (request) => request.headers.get("cf-connecting-ip") ?? "0.0.0.0";
