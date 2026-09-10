// The score files bucket (R2 binding SCORES), one prefix per user:
// u/<uid>/<scoreId>.pdf. No imports so auth.js, sync.js and scores.js can all
// use it without a cycle.
export const fileKey = (userId, scoreId) => `u/${userId}/${scoreId}.pdf`;
export const userPrefix = (userId) => `u/${userId}/`;
export const isScoreId = (id) => typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id);

/** Every object under the user's prefix: [{ id, size, sha256, uploaded }]. */
export async function listUserFiles(env, userId) {
  const out = [];
  let cursor = undefined;
  do {
    const page = await env.SCORES.list({ prefix: userPrefix(userId), limit: 1000, cursor, include: ["customMetadata"] });
    for (const o of page.objects) {
      const id = o.key.slice(userPrefix(userId).length).replace(/\.pdf$/, "");
      out.push({ id, size: o.size, sha256: o.customMetadata?.sha256 ?? "", uploaded: o.uploaded?.getTime?.() ?? null });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return out;
}

/** Remove one score's file and credit the quota. Resolves to the bytes freed. */
export async function deleteScoreFile(env, userId, scoreId) {
  if (!env.SCORES || !isScoreId(scoreId)) return 0;
  const key = fileKey(userId, scoreId);
  const head = await env.SCORES.head(key);
  if (!head) return 0;
  await env.SCORES.delete(key);
  await env.DB.prepare("UPDATE users SET storage_bytes = MAX(0, storage_bytes - ?) WHERE id = ?").bind(head.size, userId).run();
  return head.size;
}

/** Delete everything under the user's prefix (account deletion). */
export async function wipeUserFiles(env, userId) {
  if (!env.SCORES) return 0;
  const files = await listUserFiles(env, userId);
  for (let i = 0; i < files.length; i += 100) await env.SCORES.delete(files.slice(i, i + 100).map((f) => fileKey(userId, f.id)));
  return files.length;
}
