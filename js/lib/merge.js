// The sync merge rule (docs/ACCOUNTS_DESIGN.md §4.2). Imported by BOTH the
// browser (js/lib/logbook.js) and the API (functions/lib/sync.js) so the two
// sides can never disagree. Pure, dependency-free.
//
// An envelope: { kind: "goal"|"segment"|"note"|"take", id, updatedAt, deleted: 0|1, body|null }
// A take (WSHED-75) is metadata only — the audio never leaves the device.

export const KINDS = ["goal", "segment", "note", "take"];
export const key = (e) => `${e.kind}:${e.id}`;

/** JSON with sorted keys, so equal bodies stringify equally on every side. */
export function stable(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
}

/**
 * Which of two versions of the same entity wins. Commutative.
 * 1. only one exists → it
 * 2. one is a tombstone → the newer; tie → the tombstone
 * 3. segments: exactly one open (endedAt null) → the closed one
 * 4. the newer updatedAt; tie → the lexically larger stable body
 */
export function pick(a, b) {
  if (!a) return b;
  if (!b) return a;
  const ad = !!a.deleted, bd = !!b.deleted;
  if (ad !== bd) {
    if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
    return ad ? a : b;
  }
  if (!ad && a.kind === "segment") {
    const ao = a.body?.endedAt == null, bo = b.body?.endedAt == null;
    if (ao !== bo) return ao ? b : a;
  }
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  return stable(a.body ?? null) >= stable(b.body ?? null) ? a : b;
}

/** True when two envelopes describe the same version (nothing to apply). */
export const same = (a, b) => !!a && !!b && !!a.deleted === !!b.deleted && a.updatedAt === b.updatedAt && stable(a.body ?? null) === stable(b.body ?? null);

const fallbackUpdatedAt = (kind, o) => o.updatedAt ?? (kind === "segment" ? (o.endedAt ?? o.startedAt) : kind === "take" ? o.recordedAt : o.createdAt) ?? 0;

/** Entity object → envelope. `updatedAt` falls back to the entity's own clock for pre-sync data. */
export function toEnvelope(kind, obj) {
  const { id, updatedAt, ...body } = obj;
  return { kind, id, updatedAt: fallbackUpdatedAt(kind, obj), deleted: 0, body };
}
/** Tombstone record { id, kind, at, updatedAt? } → envelope. */
export const tombEnvelope = (t) => ({ kind: t.kind, id: t.id, updatedAt: t.updatedAt ?? t.at ?? 0, deleted: 1, body: null });
/** Envelope → entity object (the shape the Logbook stores). */
export const fromEnvelope = (e) => ({ id: e.id, ...(e.body ?? {}), updatedAt: e.updatedAt });
