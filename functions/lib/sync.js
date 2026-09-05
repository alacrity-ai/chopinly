// POST /api/sync — push + pull in one call (docs/ACCOUNTS_DESIGN.md §4.3).
// The merge rule is the browser's own `js/lib/merge.js`, bundled in here so
// both sides agree by construction.
import { json, HttpError, readJson, requireSameOrigin } from "./http.js";
import { requireUser } from "./session.js";
import { KINDS, key, pick, same } from "../../js/lib/merge.js";

const MAX_CHANGES = 5000;
const MAX_BODY_BYTES = 8192;
const READ_CHUNK = 90;   // D1 caps binds at 100 per statement
const WRITE_CHUNK = 40;  // statements per batch (one rev bump + upserts)
const PULL_LIMIT = 2000;

function validate(raw) {
  if (!Array.isArray(raw)) throw new HttpError(400, "changes must be a list");
  if (raw.length > MAX_CHANGES) throw new HttpError(413, `send at most ${MAX_CHANGES} changes per call`);
  const byKey = new Map();
  for (const c of raw) {
    if (!c || !KINDS.includes(c.kind) || typeof c.id !== "string" || !c.id || c.id.length > 64) throw new HttpError(400, "a change has a bad kind or id");
    if (!Number.isFinite(c.updatedAt)) throw new HttpError(400, "a change has no updatedAt");
    const deleted = c.deleted ? 1 : 0;
    const body = deleted ? null : c.body;
    if (!deleted && (!body || typeof body !== "object" || Array.isArray(body))) throw new HttpError(400, "a change has no body");
    const bodyJson = deleted ? null : JSON.stringify(body);
    if (bodyJson && bodyJson.length > MAX_BODY_BYTES) throw new HttpError(413, "a change is too large");
    const env = { kind: c.kind, id: c.id, updatedAt: Math.round(c.updatedAt), deleted, body, bodyJson };
    const k = key(env);
    byKey.set(k, pick(byKey.get(k) ?? null, env));
  }
  return [...byKey.values()];
}

const rowToEnv = (r) => ({ kind: r.kind, id: r.id, updatedAt: r.updated_at, deleted: r.deleted ? 1 : 0, body: r.deleted ? null : JSON.parse(r.body) });

async function readExisting(db, userId, incoming) {
  const out = new Map();
  for (const kind of KINDS) {
    const ids = incoming.filter((e) => e.kind === kind).map((e) => e.id);
    for (let i = 0; i < ids.length; i += READ_CHUNK) {
      const chunk = ids.slice(i, i + READ_CHUNK);
      const { results } = await db.prepare(`SELECT kind, id, body, updated_at, deleted FROM entities WHERE user_id = ? AND kind = ? AND id IN (${chunk.map(() => "?").join(",")})`)
        .bind(userId, kind, ...chunk).all();
      for (const r of results) out.set(`${r.kind}:${r.id}`, rowToEnv(r));
    }
  }
  return out;
}

async function writeWinners(db, userId, winners) {
  for (let i = 0; i < winners.length; i += WRITE_CHUNK) {
    const chunk = winners.slice(i, i + WRITE_CHUNK), n = chunk.length;
    const stmts = [db.prepare("UPDATE users SET rev = rev + ? WHERE id = ?").bind(n, userId)];
    chunk.forEach((e, k) => stmts.push(
      db.prepare(`INSERT INTO entities (user_id, kind, id, body, updated_at, deleted, rev)
                  VALUES (?, ?, ?, ?, ?, ?, (SELECT rev FROM users WHERE id = ?) - ? + ?)
                  ON CONFLICT(user_id, kind, id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at, deleted = excluded.deleted, rev = excluded.rev`)
        .bind(userId, e.kind, e.id, e.bodyJson, e.updatedAt, e.deleted, userId, n, k + 1),
    ));
    await db.batch(stmts); // one transaction per chunk: revs are contiguous and never interleave
  }
}

async function sync(ctx) {
  requireSameOrigin(ctx.request);
  const { user } = await requireUser(ctx);
  const body = await readJson(ctx.request);
  const cursor = Number.isFinite(body.cursor) && body.cursor >= 0 ? Math.floor(body.cursor) : 0;
  const incoming = validate(body.changes ?? []);
  const db = ctx.env.DB;

  const existing = await readExisting(db, user.id, incoming);
  const winners = incoming.filter((e) => { const cur = existing.get(key(e)) ?? null; return !(cur && same(cur, e)) && pick(cur, e) === e; });
  await writeWinners(db, user.id, winners);

  const { results } = await db.prepare("SELECT kind, id, body, updated_at, deleted, rev FROM entities WHERE user_id = ? AND rev > ? ORDER BY rev LIMIT ?")
    .bind(user.id, cursor, PULL_LIMIT + 1).all();
  const more = results.length > PULL_LIMIT;
  const rows = more ? results.slice(0, PULL_LIMIT) : results;
  const newCursor = rows.length ? rows[rows.length - 1].rev : Math.max(cursor, (await db.prepare("SELECT rev FROM users WHERE id = ?").bind(user.id).first("rev")) ?? cursor);
  return json(200, { cursor: newCursor, changes: rows.map(rowToEnv), more, pushed: winners.length });
}

export const syncRoutes = { "POST /api/sync": sync };
