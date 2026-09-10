// Cloud score files (docs/SCORES_DESIGN.md §10.1, WSHED-102). The PDF itself,
// private to the account, under a per-plan quota. Session cookie auth like the
// rest of /api; the app header on every mutating call.
//
//   PUT    /api/scores/:id/file   body = the PDF, x-chopinly-sha256 = its hash
//   GET    /api/scores/:id/file   streams it back (private, no-store)
//   DELETE /api/scores/:id/file   removes it and credits the quota
//   GET    /api/scores/files      { files, used, quota, plan } — the truth to reconcile against
import { json, HttpError, requireSameOrigin } from "./http.js";
import { requireUser } from "./session.js";
import { limit } from "./auth.js";
import { safeEqual } from "./crypto.js";
import { fileKey, isScoreId, listUserFiles, deleteScoreFile } from "./r2.js";
import { MAX_FILE_BYTES, quotaBytes, planLabel, fmtQuota, fits } from "../../js/lib/scores/plans.js";

const E2E_DOMAIN = "@e2e.chopinly.com";

/** Read and discard the body: a refusal that closes the socket mid-upload reaches the browser as a network error, not our sentence. */
async function drain(request) { try { await request.body?.pipeTo(new WritableStream()); } catch { /* already consumed or gone */ } }

function needBucket(env) { if (!env.SCORES) throw new HttpError(503, "cloud scores aren't set up on this server"); }
const idOf = (ctx) => { const id = ctx.params?.id; if (!isScoreId(id)) throw new HttpError(400, "that isn't a score id"); return id; };

/** The account's quota; an E2E account may shrink it with a header so the refusal path is testable. */
function quotaFor(ctx, user) {
  const q = quotaBytes(user.plan);
  const want = ctx.request.headers.get("x-chopinly-e2e-quota");
  if (want == null) return q;
  const secret = ctx.request.headers.get("x-chopinly-e2e-secret") ?? "";
  if (!ctx.env.E2E_SECRET || !safeEqual(secret, ctx.env.E2E_SECRET) || !user.email.endsWith(E2E_DOMAIN)) return q;
  return Math.max(0, Math.min(q, Number(want) || 0));
}

const usage = (user, quota) => ({ used: user.storageBytes, quota, plan: user.plan, label: planLabel(user.plan) });

async function putFile(ctx) {
  requireSameOrigin(ctx.request);
  needBucket(ctx.env);
  const { user } = await requireUser(ctx);
  await limit(ctx.env, `scores:${user.id}`, 60, 60_000);
  const id = idOf(ctx);
  const sha256 = (ctx.request.headers.get("x-chopinly-sha256") ?? "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new HttpError(400, "send the file's sha256");
  const size = Number(ctx.request.headers.get("content-length"));
  if (!Number.isFinite(size) || size <= 0) throw new HttpError(411, "the upload needs a content-length");
  if (size > MAX_FILE_BYTES) throw new HttpError(413, `that file is over ${fmtQuota(MAX_FILE_BYTES)} — Chopinly keeps scores under that`);
  const ct = ctx.request.headers.get("content-type") ?? "";
  if (!ct.includes("application/pdf")) throw new HttpError(415, "only PDF files can be uploaded");
  const key = fileKey(user.id, id);
  const prev = await ctx.env.SCORES.head(key);
  const quota = quotaFor(ctx, user);
  if (prev && prev.customMetadata?.sha256 === sha256) { await drain(ctx.request); return json(200, { ok: true, existing: true, size: prev.size, ...usage(user, quota) }); }
  const room = fits(user.plan, user.storageBytes - (prev?.size ?? 0), size);
  if (room.over > 0 || size + user.storageBytes - (prev?.size ?? 0) > quota) {
    await drain(ctx.request);
    throw new HttpError(413, `not enough cloud space — ${fmtQuota(user.storageBytes)} of ${fmtQuota(quota)} used (${planLabel(user.plan)} limit); this score needs ${fmtQuota(size)}`);
  }
  const obj = await ctx.env.SCORES.put(key, ctx.request.body, { httpMetadata: { contentType: "application/pdf" }, customMetadata: { sha256, size: String(size) } });
  const delta = obj.size - (prev?.size ?? 0);
  await ctx.env.DB.prepare("UPDATE users SET storage_bytes = MAX(0, storage_bytes + ?) WHERE id = ?").bind(delta, user.id).run();
  return json(200, { ok: true, existing: false, size: obj.size, ...usage({ ...user, storageBytes: user.storageBytes + delta }, quota) });
}

async function getFile(ctx) {
  needBucket(ctx.env);
  const { user } = await requireUser(ctx);
  await limit(ctx.env, `scores:${user.id}`, 60, 60_000);
  const id = idOf(ctx);
  const obj = await ctx.env.SCORES.get(fileKey(user.id, id));
  if (!obj) throw new HttpError(404, "that score isn't in your account's cloud space");
  const etag = `"${obj.customMetadata?.sha256 ?? obj.etag}"`;
  const headers = { "content-type": "application/pdf", "content-length": String(obj.size), etag, "cache-control": "private, no-store", "x-robots-tag": "noindex", "x-chopinly-sha256": obj.customMetadata?.sha256 ?? "" };
  if (ctx.request.headers.get("if-none-match") === etag) { await obj.body?.cancel?.(); return new Response(null, { status: 304, headers }); }
  return new Response(obj.body, { status: 200, headers });
}

async function deleteFile(ctx) {
  requireSameOrigin(ctx.request);
  needBucket(ctx.env);
  const { user } = await requireUser(ctx);
  await limit(ctx.env, `scores:${user.id}`, 60, 60_000);
  const freed = await deleteScoreFile(ctx.env, user.id, idOf(ctx));
  return json(200, { ok: true, freed, ...usage({ ...user, storageBytes: Math.max(0, user.storageBytes - freed) }, quotaFor(ctx, user)) });
}

/** What the bucket holds for this user. Repairs `storage_bytes` when the prefix disagrees (failed uploads, crashes). */
async function listFiles(ctx) {
  needBucket(ctx.env);
  const { user } = await requireUser(ctx);
  await limit(ctx.env, `scores:${user.id}`, 60, 60_000);
  const files = await listUserFiles(ctx.env, user.id);
  const used = files.reduce((n, f) => n + f.size, 0);
  if (used !== user.storageBytes) await ctx.env.DB.prepare("UPDATE users SET storage_bytes = ? WHERE id = ?").bind(used, user.id).run();
  return json(200, { files, ...usage({ ...user, storageBytes: used }, quotaFor(ctx, user)) });
}

export const scoreRoutes = { "GET /api/scores/files": listFiles };
/** Routes with an :id segment — matched by the router after the exact table. */
export const scoreDynamicRoutes = [
  { method: "PUT", re: /^\/api\/scores\/([^/]+)\/file$/, params: ["id"], handler: putFile },
  { method: "GET", re: /^\/api\/scores\/([^/]+)\/file$/, params: ["id"], handler: getFile },
  { method: "DELETE", re: /^\/api\/scores\/([^/]+)\/file$/, params: ["id"], handler: deleteFile },
];
