// Favorites (docs/COMPOSE_DESIGN.md §8.5o, WSHED-148): the pure model of the floating palette.
// A favorite is a rail button's identity — its data-act and the rest of its data-* attributes,
// all strings, exactly as the DOM holds them — never its picture. Eight pages of six slots,
// remembered per device; page 1 seeded with the six Leif named. No DOM in here.

export const PAGES = 8, SLOTS = 6;
/** The rails whose buttons are not actions on the score: nothing there can be a favorite. */
export const REFUSED_RAILS = new Set(["header", "control", "transport"]);
/** Actions that need something a favorite cannot carry (the text box's typed words, a rail toggle). */
const REFUSED_ACTS = new Set(["text-set", "rail"]);
/** Page 1 as a fresh device sees it: sharp, flat, natural, dot, tie, the plain tuplet button. */
export const SEED = Object.freeze([{ act: "acc", alter: "1" }, { act: "acc", alter: "-1" }, { act: "acc", alter: "0" }, { act: "dot" }, { act: "tie" }, { act: "tuplet" }]);

/** A button's identity from its dataset: { act, ...every other data-* } with string values (data-pop is not part of it). */
export function keyOf(dataset) {
  const key = {};
  for (const k of Object.keys(dataset ?? {}).sort()) { if (k === "pop") continue; const v = dataset[k]; if (v !== undefined && v !== null) key[k] = String(v); }
  return typeof key.act === "string" && key.act ? key : null;
}
/** Two identities are the same button: the same entries, nothing more on either side. */
export function sameKey(a, b) {
  if (!a || !b) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => b[k] === a[k]);
}
/** May this button be a favorite? Only an action on one of the palette rails; never a menu opener. */
export function allowed({ act, rail, pop = false } = {}) {
  return typeof act === "string" && act.length > 0 && !pop && !REFUSED_ACTS.has(act) && !REFUSED_RAILS.has(rail ?? "");
}

const validKey = (k) => k && typeof k === "object" && !Array.isArray(k) && typeof k.act === "string" && k.act.length > 0 && Object.values(k).every((v) => typeof v === "string");
const seedPages = () => Array.from({ length: PAGES }, (_, p) => (p === 0 ? SEED.map((k) => ({ ...k })) : Array(SLOTS).fill(null)));

/** The stored shape made safe: 8 × 6 keys or nulls, a page in range, a position or null, on as a boolean. Anything broken falls back to the seed. */
export function normalize(stored) {
  const s = stored && typeof stored === "object" ? stored : null;
  const pages = Array.isArray(s?.pages) && s.pages.length === PAGES && s.pages.every((p) => Array.isArray(p) && p.length === SLOTS)
    ? s.pages.map((p) => p.map((k) => (validKey(k) ? { ...k } : null)))
    : seedPages();
  const page = Number.isInteger(s?.page) && s.page >= 0 && s.page < PAGES ? s.page : 0;
  const pos = s?.pos && Number.isFinite(s.pos.x) && Number.isFinite(s.pos.y) ? { x: s.pos.x, y: s.pos.y } : null;
  return { pages, page, pos, on: s?.on === true };
}
const withSlot = (state, page, slot, key) => {
  if (!Number.isInteger(page) || page < 0 || page >= PAGES || !Number.isInteger(slot) || slot < 0 || slot >= SLOTS) return state;
  const pages = state.pages.map((p, i) => (i === page ? p.map((k, j) => (j === slot ? key : k)) : p));
  return { ...state, pages };
};
/** Put a button in a slot (a bad key changes nothing). */
export const assign = (state, page, slot, key) => (validKey(key) ? withSlot(state, page, slot, { ...key }) : state);
/** Empty a slot. */
export const clear = (state, page, slot) => withSlot(state, page, slot, null);
/** Turn a page: -1 back, +1 forward, stopped at the ends (never wrapping). */
export const turn = (state, dir) => ({ ...state, page: Math.max(0, Math.min(PAGES - 1, state.page + (dir < 0 ? -1 : 1))) });
