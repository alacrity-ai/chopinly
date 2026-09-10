// Library helpers (docs/SCORES_DESIGN.md §8). Pure and DOM-free: search,
// sort, group, and the suggestion lists the metadata sheet offers. The
// logbook's `scores()` query delegates to filter + sort so the two never drift.

/** Accent- and case-insensitive text (a copy of logbook.norm to keep this module dependency-free). */
export const fold = (s) => String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

/** Text a search matches against: title, composer, tags. */
export const haystack = (s) => fold(`${s.title ?? ""} ${s.composer ?? ""} ${(s.tags ?? []).join(" ")}`);

/** Scores matching a query and carrying every tag in `tags` (case-folded). */
export function filterScores(scores, { q = "", tags = [] } = {}) {
  const needle = fold(q);
  const need = (tags ?? []).map(fold).filter(Boolean);
  return scores.filter((s) => {
    if (needle && !haystack(s).includes(needle)) return false;
    if (need.length) { const have = new Set((s.tags ?? []).map(fold)); for (const t of need) if (!have.has(t)) return false; }
    return true;
  });
}

const byName = (a, b) => String(a ?? "").localeCompare(String(b ?? ""), undefined, { sensitivity: "base" });
const lastSeen = (s) => s.openedAt ?? s.addedAt ?? 0;
export const SORTS = {
  recent: (a, b) => lastSeen(b) - lastSeen(a) || (b.addedAt ?? 0) - (a.addedAt ?? 0) || byName(a.title, b.title),
  title: (a, b) => byName(a.title, b.title) || byName(a.composer, b.composer),
  composer: (a, b) => byName(a.composer || "￿", b.composer || "￿") || byName(a.title, b.title),
};
export const SORT_IDS = Object.keys(SORTS);
/** A new sorted array; unknown sorts fall back to recent. */
export const sortScores = (scores, sort = "recent") => [...scores].sort(SORTS[sort] ?? SORTS.recent);

/** [{ composer, scores }] in the order given; scores without a composer land last under "". */
export function groupByComposer(scores) {
  const groups = new Map();
  for (const s of scores) { const k = s.composer ?? ""; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); }
  const out = [...groups].map(([composer, list]) => ({ composer, scores: list }));
  return out.sort((a, b) => (a.composer === "" ? 1 : b.composer === "" ? -1 : byName(a.composer, b.composer)));
}

/** Distinct composers from goals and scores, most used first, then by name. */
export function suggestComposers(goals = [], scores = []) {
  const count = new Map();
  for (const x of [...goals, ...scores]) { const c = String(x.composer ?? "").trim(); if (c) count.set(c, (count.get(c) ?? 0) + 1); }
  return [...count].sort((a, b) => b[1] - a[1] || byName(a[0], b[0])).map(([c]) => c);
}

/** Distinct tags across scores, most used first, then by name. */
export function suggestTags(scores = []) {
  const count = new Map();
  for (const s of scores) for (const t of s.tags ?? []) count.set(t, (count.get(t) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1] || byName(a[0], b[0])).map(([t]) => t);
}

/** "baroque, two part ,, Bach" → ["baroque", "two part", "Bach"] (deduped, trimmed). */
export const parseTags = (text) => [...new Set(String(text ?? "").split(/[,;\n]/).map((t) => t.trim()).filter(Boolean))];
