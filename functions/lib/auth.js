// Passwordless auth (docs/ACCOUNTS_DESIGN.md §5): email → 6-digit code → session.
import { json, HttpError, readJson, requireSameOrigin, clientIp } from "./http.js";
import { sha256Hex, randomToken, randomCode, safeEqual, newId } from "./crypto.js";
import { sendMail, codeMail } from "./mail.js";
import { createSession, requireUser, findOrCreateUser, publicUser, setCookie, clearCookie, readToken } from "./session.js";

const CODE_TTL_MS = 10 * 60000;
const MAX_ATTEMPTS = 5;
const HOUR = 3600000;
const E2E_DOMAIN = "@e2e.chopinly.com";

export function normEmail(raw) {
  const e = String(raw ?? "").trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw new HttpError(400, "that doesn't look like an email address");
  return e;
}

/** Fixed hourly window per key in D1. Throws 429 when over. */
export async function limit(env, key, max, windowMs = HOUR) {
  const now = Date.now();
  const row = await env.DB.prepare("SELECT window_start, count FROM rate_limits WHERE key = ?").bind(key).first();
  const fresh = !row || now - row.window_start >= windowMs;
  const count = fresh ? 1 : row.count + 1;
  if (count > max) throw new HttpError(429, "too many tries — wait a bit and try again");
  await env.DB.prepare("INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start, count = excluded.count")
    .bind(key, fresh ? now : row.window_start, count).run();
}

async function requestCode(ctx) {
  requireSameOrigin(ctx.request);
  const { email: raw } = await readJson(ctx.request);
  const email = normEmail(raw);
  await limit(ctx.env, `ip:${clientIp(ctx.request)}`, 30);
  await limit(ctx.env, `email:${email}`, 5);
  const code = randomCode(), salt = randomToken(8), now = Date.now();
  await ctx.env.DB.prepare("INSERT INTO login_codes (id, email, code_hash, salt, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(newId("c"), email, await sha256Hex(salt + code), salt, now, now + CODE_TTL_MS).run();
  const mail = await sendMail(ctx.env, { to: email, ...codeMail(code) });
  if (!mail.ok) { console.error("mail failed", mail.error); throw new HttpError(502, "we couldn't send the email just now — try again in a minute"); }
  const body = { ok: true };
  if (ctx.env.DEV_ECHO_CODE === "1") body.devCode = code; // local dev only (.dev.vars)
  return json(200, body);
}

async function verifyCode(ctx) {
  requireSameOrigin(ctx.request);
  const { email: raw, code, e2eSecret } = await readJson(ctx.request);
  const email = normEmail(raw);
  await limit(ctx.env, `verify:${clientIp(ctx.request)}`, 60);
  const now = Date.now();
  const allowlisted = ctx.env.E2E_SECRET && typeof e2eSecret === "string" && safeEqual(e2eSecret, ctx.env.E2E_SECRET) && email.endsWith(E2E_DOMAIN);
  if (!allowlisted) {
    const row = await ctx.env.DB.prepare("SELECT id, code_hash, salt, attempts, expires_at FROM login_codes WHERE email = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1").bind(email).first();
    if (!row || row.expires_at < now) throw new HttpError(400, "that code has expired — send a new one");
    if (row.attempts >= MAX_ATTEMPTS) throw new HttpError(429, "too many tries — send a new code");
    await ctx.env.DB.prepare("UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?").bind(row.id).run();
    const given = String(code ?? "").replace(/\D/g, "");
    if (!safeEqual(await sha256Hex(row.salt + given), row.code_hash)) throw new HttpError(400, "that code didn't match");
    await ctx.env.DB.prepare("UPDATE login_codes SET used_at = ? WHERE id = ?").bind(now, row.id).run();
  }
  const user = await findOrCreateUser(ctx.env, email);
  const token = await createSession(ctx.env, ctx.request, user.id);
  return json(200, { user: publicUser(user), created: user.created }, { "set-cookie": setCookie(ctx.request, token) });
}

async function me(ctx) {
  const { user, cookie } = await requireUser(ctx);
  return json(200, { user: publicUser(user) }, cookie ? { "set-cookie": cookie } : {});
}

async function signOut(ctx) {
  requireSameOrigin(ctx.request);
  const token = readToken(ctx.request);
  if (token) await ctx.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256Hex(token)).run();
  return json(200, { ok: true }, { "set-cookie": clearCookie(ctx.request) });
}

async function deleteMe(ctx) {
  requireSameOrigin(ctx.request);
  const { user } = await requireUser(ctx);
  await ctx.env.DB.batch([
    ctx.env.DB.prepare("DELETE FROM entities WHERE user_id = ?").bind(user.id),
    ctx.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
    ctx.env.DB.prepare("DELETE FROM login_codes WHERE email = ?").bind(user.email),
    ctx.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id),
  ]);
  return json(200, { ok: true }, { "set-cookie": clearCookie(ctx.request) });
}

/** The account's merged document in the Logbook's on-disk shape. */
async function exportMe(ctx) {
  const { user } = await requireUser(ctx);
  const { results } = await ctx.env.DB.prepare("SELECT kind, id, body, updated_at, deleted FROM entities WHERE user_id = ? ORDER BY updated_at").bind(user.id).all();
  const doc = { schemaVersion: 2, goals: [], segments: [], notes: [], deleted: [], exportedAt: Date.now(), email: user.email };
  for (const r of results) {
    if (r.deleted) { doc.deleted.push({ id: r.id, kind: r.kind, at: r.updated_at, updatedAt: r.updated_at }); continue; }
    const obj = { id: r.id, ...JSON.parse(r.body), updatedAt: r.updated_at };
    if (r.kind === "goal") doc.goals.push(obj); else if (r.kind === "segment") doc.segments.push(obj); else if (r.kind === "note") doc.notes.push(obj);
  }
  return json(200, doc, { "content-disposition": `attachment; filename="chopinly-${new Date().toISOString().slice(0, 10)}.json"` });
}

export const authRoutes = {
  "POST /api/auth/code": requestCode,
  "POST /api/auth/verify": verifyCode,
  "POST /api/auth/signout": signOut,
  "GET /api/me": me,
  "DELETE /api/me": deleteMe,
  "GET /api/me/export": exportMe,
};
