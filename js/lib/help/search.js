// Keyword search over the help corpus (docs/COMPOSE_HELP_DESIGN.md §4). Pure and
// DOM-free, node-tested. The whole corpus is tens of kilobytes, so a scan per
// keystroke is instant and there is no index to build, fetch or keep in step.
//
// An article must match every term (AND). Per term, each field scores a whole-word
// hit or, at half, a prefix hit; repeated hits are damped by 1 + ln n so a long
// article cannot win on repetition alone.

const WEIGHTS = { title: 8, keywords: 6, headings: 4, summary: 3, text: 1 };
const PREFIX = 0.5;

export const terms = (q) => {
  const all = String(q).toLowerCase().split(/[^\p{L}\p{N}#♯♭&]+/u).filter(Boolean);
  const long = all.filter((t) => t.length >= 2);
  return long.length ? long : all.slice(0, 1);
};

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const damp = (n) => (n ? 1 + Math.log(n) : 0);

/** The searchable text of each field of an article, lowercased once per call. */
const fieldsOf = (a) => ({
  title: a.title.toLowerCase(),
  keywords: (a.keywords ?? []).join(" ").toLowerCase(),
  headings: (a.headings ?? []).map((h) => h.text).join(" ").toLowerCase(),
  summary: (a.summary ?? "").toLowerCase(),
  text: (a.text ?? "").toLowerCase(),
});

/** Whole-word and prefix counts of `term` in `hay`. A whole-word hit is not also counted as a prefix. */
function count(hay, term) {
  const t = escRe(term);
  const whole = (hay.match(new RegExp(`(?<![\\p{L}\\p{N}])${t}(?![\\p{L}\\p{N}])`, "gu")) ?? []).length;
  const starts = (hay.match(new RegExp(`(?<![\\p{L}\\p{N}])${t}`, "gu")) ?? []).length;
  return { whole, prefix: Math.max(0, starts - whole) };
}

/**
 * `search(articles, query)` → the matches, best first.
 * Each result carries the article's slug, title, section and a snippet with the
 * matched terms wrapped in <mark>. Ties break on section then order, so the list
 * never shuffles under the cursor.
 */
export function search(articles, query, { limit = 12 } = {}) {
  const ts = terms(query);
  if (!ts.length) return [];
  const out = [];
  for (const a of articles) {
    const f = fieldsOf(a);
    let total = 0, best = ts[0], bestScore = -1;
    let matchedAll = true;
    for (const term of ts) {
      let score = 0;
      for (const [field, w] of Object.entries(WEIGHTS)) {
        const { whole, prefix } = count(f[field], term);
        score += w * damp(whole) + w * PREFIX * damp(prefix);
      }
      if (!score) { matchedAll = false; break; }
      total += score;
      if (score > bestScore) { bestScore = score; best = term; }
    }
    if (!matchedAll) continue;
    out.push({ slug: a.slug, title: a.title, section: a.section, summary: a.summary, score: total, snippet: snippet(a, best, ts) });
  }
  out.sort((x, y) => y.score - x.score || String(x.section).localeCompare(String(y.section)) || String(x.slug).localeCompare(String(y.slug)));
  return out.slice(0, limit);
}

const MAX = 170;

/**
 * The sentence of the article that best shows `term`, trimmed to ~170 characters on word
 * boundaries, with every term of the query marked. Built from the article's plain text and
 * escaped before the marks go in, so nothing a reader types can put tags in the page.
 */
export function snippet(article, term, all = [term]) {
  const text = article.text ?? article.summary ?? "";
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escRe(term)}`, "iu");
  const hit = re.exec(text);
  let cut = article.summary ?? "";
  if (hit) {
    // widen to sentence-ish bounds around the hit, then to MAX characters
    const from = Math.max(0, hit.index - Math.floor((MAX - term.length) / 2));
    const to = Math.min(text.length, from + MAX);
    cut = text.slice(from, to);
    if (from > 0) cut = cut.replace(/^\S*\s/, "…");
    if (to < text.length) cut = cut.replace(/\s\S*$/, " …");
  }
  return mark(cut, all);
}

/** Escape, then wrap every whole-or-prefix occurrence of each term in <mark>. */
export function mark(text, list) {
  const escaped = String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const parts = [...new Set(list)].filter(Boolean).map(escRe).sort((a, b) => b.length - a.length);
  if (!parts.length) return escaped;
  return escaped.replace(new RegExp(`(?<![\\p{L}\\p{N}])(${parts.join("|")})`, "giu"), "<mark>$1</mark>");
}
