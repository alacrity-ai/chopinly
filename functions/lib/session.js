// Session cookie + lookup. Token: 256-bit random, stored as sha256. Cookie is
// HttpOnly/Secure/SameSite=Lax, 180 days, re-issued when older than 30 days.
import { sha256Hex, randomToken, newId } from "./crypto.js";
import { HttpError } from "./http.js";

export const COOKIE = "chopinly_session";
const TTL_MS = 180 * 86400000;
const RENEW_MS = 30 * 86400000;

const cookieAttrs = (maxAge, secure) => `HttpOnly; ${secure ? "Secure; " : ""}SameSite=Lax; Path=/; Max-Age=${maxAge}`;
const isSecure = (request) => new URL(request.url).protocol === "https:";
export const setCookie = (request, token) => `${COOKIE}=${token}; ${cookieAttrs(Math.floor(TTL_MS / 1000), isSecure(request))}`;
export const clearCookie = (request) => `${COOKIE}=; ${cookieAttrs(0, isSecure(request))}`;

export function readToken(request) {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return v.join("=") || null;
  }
  return null;
}

export async function createSession(env, request, userId) {
  const token = randomToken(32);
  const now = Date.now();
  await env.DB.prepare("INSERT INTO sessions (id, user_id, created_at, renewed_at, expires_at, ua) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(await sha256Hex(token), userId, now, now, now + TTL_MS, (request.headers.get("user-agent") ?? "").slice(0, 200)).run();
  return token;
}

/** The signed-in user or a 401. Returns `{ user, sessionId, cookie }` — `cookie` is set when the session was renewed. */
export async function requireUser(ctx) {
  const token = readToken(ctx.request);
  if (!token) throw new HttpError(401, "sign in first");
  const id = await sha256Hex(token);
  const now = Date.now();
  const row = await ctx.env.DB.prepare(
    "SELECT s.id AS sid, s.renewed_at, s.expires_at, u.id, u.email, u.created_at, u.last_seen_at, u.rev FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?",
  ).bind(id).first();
  if (!row || row.expires_at < now) {
    if (row) await ctx.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
    throw new HttpError(401, "sign in again");
  }
  let cookie = null;
  const writes = [];
  if (now - row.renewed_at > RENEW_MS) {
    writes.push(ctx.env.DB.prepare("UPDATE sessions SET renewed_at = ?, expires_at = ? WHERE id = ?").bind(now, now + TTL_MS, id));
    cookie = setCookie(ctx.request, token);
  }
  if (now - row.last_seen_at > 86400000) writes.push(ctx.env.DB.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?").bind(now, row.id));
  if (writes.length) await ctx.env.DB.batch(writes);
  return { user: { id: row.id, email: row.email, createdAt: row.created_at, rev: row.rev }, sessionId: id, cookie };
}

export async function findOrCreateUser(env, email) {
  const now = Date.now();
  const existing = await env.DB.prepare("SELECT id, email, created_at, rev FROM users WHERE email = ?").bind(email).first();
  if (existing) return { id: existing.id, email: existing.email, createdAt: existing.created_at, rev: existing.rev, created: false };
  const id = newId("u");
  await env.DB.prepare("INSERT INTO users (id, email, created_at, last_seen_at, rev) VALUES (?, ?, ?, ?, 0)").bind(id, email, now, now).run();
  return { id, email, createdAt: now, rev: 0, created: true };
}

export const publicUser = (u) => ({ id: u.id, email: u.email, createdAt: u.createdAt });
