// Compose Help (docs/COMPOSE_HELP_DESIGN.md §3): a full-screen page over the tool —
// a table of contents and a search field on the left, the article on the right.
// A place, not a popup: the route owns which article is showing, so a link, a
// reload and the back button all work, and the editor stays mounted behind it.
import { icon } from "../../lib/icons.js";
import { ARTICLES, BY_SLUG, sectionsFor, forTool } from "../../lib/help/content.js";
import { search } from "../../lib/help/search.js";

const TOOL = "compose";
const NARROW = "(max-width: 899px)";
const DEBOUNCE = 120;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const list = () => forTool(TOOL);
const href = (slug) => `#/${TOOL}/help/${slug}`;

/** The reading order across sections — what prev / next walk. */
const order = () => list().map((a) => a.slug);

/**
 * Mount the help page into `root`. `slug` picks the article (none = the contents page);
 * `onNavigate` is called with a slug or null when the reader moves, so the router owns the hash.
 * `onBack` closes it.
 */
export function mountHelp(root, { slug = null, onNavigate, onBack, backLabel = "Compose" } = {}) {
  const arts = list(), sections = sectionsFor(TOOL);
  let current = slug && BY_SLUG[slug] ? slug : null;
  let query = "", results = [], cursor = -1, timer = 0, spy = null;

  root.classList.add("top-anchored");
  root.innerHTML = `
    <section class="hp" aria-label="help">
      <header class="hp-bar">
        <button type="button" class="cp-btn cp-sq hp-back" aria-label="back to ${esc(backLabel.toLowerCase())}">${icon("back")}</button>
        <h2 class="hp-bar-title">Help</h2>
        <button type="button" class="cp-btn hp-contents" aria-expanded="false" aria-controls="hp-side">${icon("log")}<span>Contents</span></button>
      </header>
      <div class="hp-body">
        <div class="hp-scrim" hidden></div>
        <nav class="hp-side" id="hp-side" aria-label="help contents">
          <div class="hp-search">
            <input type="search" id="hp-q" class="hp-q" placeholder="search help…" aria-label="search help" autocomplete="off" spellcheck="false" enterkeyhint="go">
          </div>
          <div class="hp-toc" id="hp-toc"></div>
        </nav>
        <main class="hp-doc" id="hp-doc" tabindex="-1"></main>
      </div>
    </section>`;

  const $ = (s) => root.querySelector(s);
  const side = $(".hp-side"), scrim = $(".hp-scrim"), toc = $("#hp-toc"), doc = $("#hp-doc"), q = $("#hp-q"), contentsBtn = $(".hp-contents");

  // ---------------------------------------------------------------- the list
  function tocHtml() {
    if (query) return resultsHtml();
    return sections.map((s) => `
      <div class="hp-sect">
        <span class="hp-cap">${esc(s.title)}</span>
        <ul class="hp-links">
          ${arts.filter((a) => a.section === s.id).map((a) => `
            <li><a href="${href(a.slug)}" class="hp-link${a.slug === current ? " on" : ""}"${a.slug === current ? ' aria-current="page"' : ""}>${esc(a.title)}</a>
            ${a.slug === current && a.headings.length ? `<ul class="hp-sub">${a.headings.filter((h) => h.level === 2).map((h) => `<li><a href="${href(a.slug)}#${h.id}" class="hp-subl" data-id="${h.id}">${esc(h.text)}</a></li>`).join("")}</ul>` : ""}</li>`).join("")}
        </ul>
      </div>`).join("");
  }

  const resultsHtml = () => results.length
    ? `<div class="hp-sect"><span class="hp-cap">${results.length} result${results.length === 1 ? "" : "s"}</span>
        <ul class="hp-results">${results.map((r, i) => `
          <li><a href="${href(r.slug)}" class="hp-res${i === cursor ? " on" : ""}" data-i="${i}">
            <b>${esc(r.title)}</b><small>${r.snippet}</small></a></li>`).join("")}</ul></div>`
    : `<p class="hp-none">nothing matches <b>${esc(query)}</b>.</p>`;

  const renderToc = () => { toc.innerHTML = tocHtml(); };

  // ------------------------------------------------------------- the article
  function docHtml() {
    if (!current) return indexHtml();
    const a = BY_SLUG[current], o = order(), i = o.indexOf(current);
    const prev = i > 0 ? BY_SLUG[o[i - 1]] : null, next = i < o.length - 1 ? BY_SLUG[o[i + 1]] : null;
    return `
      <article class="hp-article">
        <h1>${esc(a.title)}</h1>
        <p class="hp-lede">${esc(a.summary)}</p>
        ${a.html}
        <nav class="hp-walk" aria-label="more help">
          ${prev ? `<a class="hp-prev" href="${href(prev.slug)}"><small>previous</small><span>${esc(prev.title)}</span></a>` : "<span></span>"}
          ${next ? `<a class="hp-next" href="${href(next.slug)}"><small>next</small><span>${esc(next.title)}</span></a>` : "<span></span>"}
        </nav>
      </article>`;
  }

  const indexHtml = () => `
    <article class="hp-article hp-index">
      <h1>Compose — help</h1>
      <p class="hp-lede">Music notation by tapping. Everything below is also searchable from the field on the left.</p>
      ${sections.map((s) => `
        <h2 id="${s.id}">${esc(s.title)}</h2>
        <ul class="hp-cards">
          ${arts.filter((a) => a.section === s.id).map((a) => `<li><a href="${href(a.slug)}"><b>${esc(a.title)}</b><small>${esc(a.summary)}</small></a></li>`).join("")}
        </ul>`).join("")}
    </article>`;

  function renderDoc({ hash = "" } = {}) {
    doc.innerHTML = docHtml();
    doc.scrollTop = 0;
    if (hash) {
      const target = doc.querySelector(`[id="${CSS.escape(hash)}"]`);
      if (target) target.scrollIntoView({ block: "start" });
    }
    watchHeadings();
  }

  /** The sidebar's nested headings follow the reading position. */
  function watchHeadings() {
    spy?.disconnect();
    spy = null;
    const hs = [...doc.querySelectorAll("h2[id]")];
    if (!current || !hs.length || typeof IntersectionObserver === "undefined") return;
    const seen = new Set();
    spy = new IntersectionObserver((entries) => {
      for (const e of entries) e.isIntersecting ? seen.add(e.target.id) : seen.delete(e.target.id);
      const first = hs.find((h) => seen.has(h.id))?.id;
      for (const a of toc.querySelectorAll(".hp-subl")) a.classList.toggle("on", !!first && a.dataset.id === first);
    }, { root: doc, rootMargin: "0px 0px -70% 0px", threshold: 0 });
    for (const h of hs) spy.observe(h);
  }

  // ------------------------------------------------------------------ search
  function runSearch(text) {
    query = text.trim();
    results = query ? search(arts, query) : [];
    cursor = results.length ? 0 : -1;
    renderToc();
  }

  q.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => runSearch(q.value), DEBOUNCE); });
  q.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); q.value = ""; runSearch(""); q.blur(); return; }
    if (!results.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      cursor = (cursor + (e.key === "ArrowDown" ? 1 : results.length - 1)) % results.length;
      renderToc();
      toc.querySelector(".hp-res.on")?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (e.key === "Enter") { e.preventDefault(); go(results[Math.max(0, cursor)].slug); }
  });

  // ------------------------------------------------------------- moving about
  function go(slug, hash = "") {
    current = slug && BY_SLUG[slug] ? slug : null;
    closeDrawer();
    renderToc();
    renderDoc({ hash });
    doc.focus({ preventScroll: true });
    onNavigate?.(current, hash);
  }

  const openDrawer = () => { side.classList.add("open"); scrim.hidden = false; contentsBtn.setAttribute("aria-expanded", "true"); };
  const closeDrawer = () => { side.classList.remove("open"); scrim.hidden = true; contentsBtn.setAttribute("aria-expanded", "false"); };
  const narrow = () => matchMedia(NARROW).matches;

  contentsBtn.addEventListener("click", () => (side.classList.contains("open") ? closeDrawer() : openDrawer()));
  scrim.addEventListener("click", closeDrawer);
  $(".hp-back").addEventListener("click", () => onBack?.());

  // One click handler for every internal link: the article ones move without a reload.
  root.addEventListener("click", (e) => {
    const a = e.target.closest?.("a[href]");
    if (!a) return;
    const m = /^#\/compose\/help(?:\/([a-z0-9-]+))?(?:#([a-z0-9-]+))?$/.exec(a.getAttribute("href"));
    if (!m) return;
    e.preventDefault();
    go(m[1] ?? null, m[2] ?? "");
  });

  const onKey = (e) => {
    if (e.target === q) return;
    if (e.key === "Escape") { if (narrow() && side.classList.contains("open")) closeDrawer(); else onBack?.(); }
    else if (e.key === "/" || (e.key === "f" && (e.metaKey || e.ctrlKey))) { e.preventDefault(); if (narrow()) openDrawer(); q.focus(); q.select(); }
  };
  document.addEventListener("keydown", onKey);

  renderToc();
  renderDoc({ hash: "" });

  return {
    show(nextSlug, hash = "") { if (nextSlug !== current || hash) { current = nextSlug && BY_SLUG[nextSlug] ? nextSlug : null; renderToc(); renderDoc({ hash }); } },
    get slug() { return current; },
    destroy() {
      clearTimeout(timer);
      spy?.disconnect();
      document.removeEventListener("keydown", onKey);
      root.classList.remove("top-anchored");
      root.replaceChildren();
    },
  };
}

/** Every article, for the tests and for anything that wants to count them. */
export const helpArticles = () => ARTICLES.filter((a) => a.tool === TOOL);
