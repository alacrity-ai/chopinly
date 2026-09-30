// Chord diagrams (WSHED-160; design: docs/ALMANAC_CHORDS_DESIGN.md).
// Pinned in the nav slot: search · Guitar | Ukulele, then the twelve keys.
// The page: one key's chords as a grid of boxes, grouped Triads → Slash chords;
// or, while searching, the matches best first. A box opens the chord's sheet:
// big box, every shape, the notes and the formula, strum / arpeggio.
// Routes: #/chords · #/chords/<instrument>/<key> · #/chords/<instrument>/<key>/<type>[/<shape>][?as=D♭]
import { KEYS, CATEGORIES, QUALITIES, keyById, qualityById, parseNoteName, chordSymbol, chordLongName, spellChord, prettyDegree, search } from "../../lib/chords/theory.js";
import { INSTRUMENTS, decode, midis } from "../../lib/chords/voicings.js";
import { chordSVG } from "../../lib/chords/diagram.js";
import { pluck } from "../../lib/chords/pluck.js";
import { icon } from "../../lib/icons.js";
import { openSheet, esc } from "../logbook/util.js";

const DATA = { guitar: () => import("../../lib/chords/data/guitar.js"), ukulele: () => import("../../lib/chords/data/ukulele.js") };
const LABELS = [["fingers", "fingers"], ["notes", "notes"], ["degrees", "degrees"]];
const MAX_RESULTS = 96;

/** The instrument's chords as a flat list: { key, q, bass, typeKey, codes }, in QUALITIES order per key. */
function catalogue(data) {
  const list = [];
  for (const k of KEYS) {
    for (const [typeKey, codes] of Object.entries(data[k.id] ?? {})) {
      const [qid, bassName] = typeKey.split("/");
      const q = qualityById(qid);
      if (!q) continue;
      list.push({ key: k.id, q, bass: bassName ? { pc: parseNoteName(bassName).pc, name: bassName } : null, typeKey, codes });
    }
  }
  const rank = (c) => KEYS.findIndex((k) => k.id === c.key) * 10000 + QUALITIES.indexOf(c.q) * 20 + (c.bass ? 1000 + c.bass.pc : 0);
  return list.sort((a, b) => rank(a) - rank(b));
}

const nameHTML = (rootName, q, bass) =>
  `<span class="cd-root">${esc(rootName)}</span><span class="cd-suf">${esc(q.sym)}${bass ? `/${esc(bass.name)}` : ""}</span>`;
const shapeWhere = (v) => (v.baseFret > 1 ? `fret ${v.baseFret}` : v.frets.some((f) => f === 0) ? "open" : "fret 1");

export function buildUI(root, { store, getAudio }) {
  const state = {
    inst: INSTRUMENTS[store.get("inst", "guitar")] ? store.get("inst", "guitar") : "guitar",
    key: keyById(store.get("key", "C")) ? store.get("key", "C") : "C",
    labels: store.get("labels", "fingers"),
    lefty: store.get("lefty", false),
    query: "",
  };
  const chordsFor = {}; // instrument → catalogue, loaded on first use
  let destroyed = false;
  let sheet = null; // { chord, rootName, idx, s (the openSheet handle), pushed }
  let sound = null;

  root.classList.add("top-anchored");
  root.innerHTML = `
    <section class="chords" aria-label="chord diagrams">
      <div class="cd-body" id="cd-body" aria-live="polite"></div>
      <div class="params cd-params">
        <div class="param">dots<div class="segmented" id="cd-labels">${LABELS.map(([id, t]) => `<button data-l="${id}">${t}</button>`).join("")}</div></div>
        <div class="param">hand<div class="segmented" id="cd-hand"><button data-h="right">right</button><button data-h="left">left</button></div></div>
      </div>
      <p class="cd-credit">Shapes from <a href="https://github.com/tombatossals/chords-db" target="_blank" rel="noopener">chords-db</a> (MIT), each checked note by note.</p>
    </section>`;
  const body = root.querySelector("#cd-body");

  // --- the pinned bar ---------------------------------------------------------
  const slot = document.getElementById("nav-slot");
  const bar = document.createElement("div");
  bar.className = "cd-bar";
  bar.innerHTML = `
    <div class="cd-bar-row">
      <label class="cd-search">
        <span class="cd-search-ic" aria-hidden="true">${icon("search")}</span>
        <input id="cd-q" type="search" inputmode="search" autocomplete="off" autocapitalize="off" spellcheck="false"
               placeholder="Am7, F♯m7♭5, B♭maj9…" aria-label="search chords">
        <button class="cd-clear" id="cd-clear" type="button" aria-label="clear the search" hidden>${icon("close")}</button>
      </label>
      <div class="segmented cd-inst" id="cd-inst" role="group" aria-label="instrument">
        ${Object.values(INSTRUMENTS).map((i) => `<button data-inst="${i.id}">${i.name}</button>`).join("")}
      </div>
    </div>
    <nav class="cd-keys" id="cd-keys" aria-label="key">
      ${KEYS.map((k) => `<button data-key="${k.id}" aria-label="${k.name}${k.alt ? ` / ${k.alt}` : ""}">${k.name}</button>`).join("")}
    </nav>`;
  slot?.replaceChildren(bar);
  const input = bar.querySelector("#cd-q");
  const clearBtn = bar.querySelector("#cd-clear");

  // --- routing ----------------------------------------------------------------
  const browseHash = () => `#/chords/${state.inst}/${encodeURIComponent(state.key)}`;
  const chordHash = (c, rootName, idx) => {
    const k = keyById(c.key);
    const as = rootName !== k.name ? `?as=${encodeURIComponent(rootName)}` : "";
    return `#/chords/${state.inst}/${encodeURIComponent(c.key)}/${encodeURIComponent(c.typeKey)}${idx ? `/${idx + 1}` : ""}${as}`;
  };
  function route() {
    const [path, qs] = location.hash.replace(/^#\/chords\/?/, "").split("?");
    const parts = path.split("/").filter(Boolean);
    const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
    // "#/chords/guitar/C/major/E" (a slash chord typed by hand) reads the same as major%2FE
    const type = parts.length >= 4 && !/^\d+$/.test(parts[3]) ? `${dec(parts[2])}/${dec(parts[3])}` : parts[2] ? dec(parts[2]) : null;
    const shape = Number(parts.at(-1));
    const as = new URLSearchParams(qs ?? "").get("as");
    return { inst: parts[0] ? dec(parts[0]) : null, key: parts[1] ? dec(parts[1]) : null, type, idx: parts.length >= 4 && shape > 0 ? shape - 1 : 0, as };
  }
  const readKey = (s) => { if (!s) return null; if (keyById(s)) return s; const n = parseNoteName(s); return n ? KEYS[n.pc].id : null; };

  async function load(inst) {
    if (!chordsFor[inst]) chordsFor[inst] = catalogue((await DATA[inst]()).default);
    return chordsFor[inst];
  }

  async function applyRoute() {
    const r = route();
    let changed = false;
    if (r.inst && INSTRUMENTS[r.inst] && r.inst !== state.inst) { state.inst = r.inst; store.set("inst", r.inst); changed = true; }
    const k = readKey(r.key);
    if (k && k !== state.key) { state.key = k; store.set("key", k); changed = true; }
    const list = await load(state.inst);
    if (destroyed) return;
    if (changed || body.querySelector(".cd-loading")) render();
    if (r.type) {
      const c = list.find((x) => x.key === (k ?? state.key) && x.typeKey === r.type);
      if (!c) { if (sheet) sheet.s.close(); history.replaceState(null, "", browseHash()); return; }
      // a key typed as its other name (#/chords/guitar/Db/7) or ?as= keeps that spelling
      const as = prettyRoot(r.as ?? (r.key && !keyById(r.key) ? r.key : ""));
      const rootName = as && parseNoteName(as).pc === keyById(c.key).pc ? as : keyById(c.key).name;
      if (sheet && sheet.chord === c) { if (sheet.idx !== r.idx) showShape(Math.min(r.idx, c.codes.length - 1)); }
      else { sheet?.s.close(); openDetail(c, rootName, Math.min(r.idx, c.codes.length - 1)); }
    } else if (sheet) sheet.s.close();
  }
  const prettyRoot = (s) => { const n = s ? parseNoteName(s) : null; return n && Math.abs(n.acc) < 2 ? n.letter + ({ "-1": "♭", 1: "♯", 0: "" })[n.acc] : null; };

  // --- the page ---------------------------------------------------------------
  const inst = () => INSTRUMENTS[state.inst];
  const box = (c, v, rootName, opts = {}) => chordSVG(v, inst(), rootName, c.q, c.bass, { labels: state.labels, lefty: state.lefty, ...opts });
  const card = (c, rootName, best = false) => `
    <button class="cd-card${best ? " best" : ""}" data-key="${c.key}" data-type="${esc(c.typeKey)}" data-root="${esc(rootName)}"
            aria-label="${esc(chordLongName(rootName, c.q, c.bass?.name))}">
      <span class="cd-name">${nameHTML(rootName, c.q, c.bass)}</span>
      ${box(c, decode(c.codes[0]), rootName)}
      <span class="cd-more">${c.codes.length > 1 ? `${c.codes.length} shapes` : "1 shape"}</span>
    </button>`;

  function render() {
    const list = chordsFor[state.inst];
    for (const b of bar.querySelectorAll("#cd-inst button")) b.setAttribute("aria-pressed", String(b.dataset.inst === state.inst));
    for (const b of bar.querySelectorAll("#cd-keys button")) b.setAttribute("aria-pressed", String(b.dataset.key === state.key));
    for (const b of root.querySelectorAll("#cd-labels button")) b.setAttribute("aria-pressed", String(b.dataset.l === state.labels));
    for (const b of root.querySelectorAll("#cd-hand button")) b.setAttribute("aria-pressed", String((b.dataset.h === "left") === state.lefty));
    bar.classList.toggle("searching", !!state.query);
    clearBtn.hidden = !state.query;
    if (!list) { body.innerHTML = `<p class="cd-empty cd-loading">loading…</p>`; return; }
    if (state.query) return renderResults(list);
    const k = keyById(state.key);
    const mine = list.filter((c) => c.key === state.key);
    body.innerHTML = CATEGORIES.map((cat) => {
      const cs = mine.filter((c) => (c.bass ? "slash" : c.q.cat) === cat.id);
      if (!cs.length) return "";
      return `<section class="cd-section" data-cat="${cat.id}">
        <h3 class="cd-h"><span>${cat.name}</span><small>${cs.length}</small></h3>
        <div class="cd-grid">${cs.map((c) => card(c, k.name)).join("")}</div>
      </section>`;
    }).join("");
  }

  function renderResults(list) {
    const hits = search(list, state.query);
    if (!hits.length) {
      body.innerHTML = `<p class="cd-empty">No chord matches “${esc(state.query)}”.<br><span>Try <button class="cd-try">Am7</button> <button class="cd-try">F♯m7♭5</button> <button class="cd-try">B♭maj9</button> <button class="cd-try">dim7</button></span></p>`;
      return;
    }
    const shown = hits.slice(0, MAX_RESULTS);
    body.innerHTML = `<p class="cd-count">${hits.length === 1 ? "1 chord" : `${hits.length} chords`}${hits.length > shown.length ? ` · showing the first ${shown.length}` : ""}<span class="cd-enter"> · <kbd>enter</kbd> opens the first</span></p>
      <div class="cd-grid">${shown.map((h, i) => card(h.chord, h.rootName, i === 0 && h.score >= 80)).join("")}</div>`;
  }

  // --- the chord's sheet --------------------------------------------------------
  function openDetail(c, rootName, idx = 0) {
    const s = openSheet({ title: chordSymbol(rootName, c.q, c.bass?.name), cls: "cd-sheet-wrap", html: `
      <p class="cd-long">${esc(chordLongName(rootName, c.q, c.bass?.name))}</p>
      <div class="cd-big" id="cd-big"></div>
      <div class="cd-shape-nav">
        <button class="icon-btn" id="cd-prev" aria-label="previous shape">${icon("back")}</button>
        <span class="cd-shape" id="cd-shape"></span>
        <button class="icon-btn" id="cd-next" aria-label="next shape">${icon("next")}</button>
      </div>
      <div class="cd-actions">
        <button class="cd-play" id="cd-strum">${icon("play")}<span>strum</span></button>
        <button class="cd-play ghost" id="cd-arp">${icon("hear")}<span>one string at a time</span></button>
      </div>
      <div class="cd-tones" id="cd-tones"></div>
      <div class="param cd-sheet-labels">dots<div class="segmented" id="cd-slabels">${LABELS.map(([id, t]) => `<button data-l="${id}">${t}</button>`).join("")}</div></div>` });
    sheet = { chord: c, rootName, idx, s, pushed: false };
    const mine = sheet;
    s.panel.querySelector("#cd-prev").addEventListener("click", () => stepShape(-1));
    s.panel.querySelector("#cd-next").addEventListener("click", () => stepShape(1));
    s.panel.querySelector("#cd-strum").addEventListener("click", () => play("strum"));
    s.panel.querySelector("#cd-arp").addEventListener("click", () => play("arpeggio"));
    s.panel.querySelector("#cd-slabels").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setLabels(b.dataset.l); });
    // swipe the big box for the next / previous shape
    const big = s.panel.querySelector("#cd-big");
    let x0 = null;
    big.addEventListener("pointerdown", (e) => { x0 = e.clientX; });
    big.addEventListener("pointerup", (e) => { if (x0 === null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 40) stepShape(dx < 0 ? 1 : -1); else play("strum"); });
    big.addEventListener("pointercancel", () => { x0 = null; });
    const onKey = (e) => { if (e.key === "ArrowRight") stepShape(1); else if (e.key === "ArrowLeft") stepShape(-1); };
    document.addEventListener("keydown", onKey);
    showShape(idx);
    s.closed.then(() => {
      document.removeEventListener("keydown", onKey);
      sound?.stop(); sound = null;
      if (sheet !== mine) return;
      sheet = null;
      if (destroyed || !route().type) return;
      if (mine.pushed) history.back();
      else history.replaceState(null, "", browseHash());
    });
  }

  function showShape(i) {
    const { chord: c, rootName, s } = sheet;
    sheet.idx = (i + c.codes.length) % c.codes.length;
    const v = decode(c.codes[sheet.idx]);
    s.panel.querySelector("#cd-big").innerHTML = box(c, v, rootName, { strings: true });
    s.panel.querySelector("#cd-shape").textContent = `shape ${sheet.idx + 1} of ${c.codes.length} · ${shapeWhere(v)}`;
    for (const b of s.panel.querySelectorAll("#cd-prev, #cd-next")) b.disabled = c.codes.length < 2;
    const spelled = spellChord(rootName, c.q);
    const heard = new Set(midis(v, inst()).filter((m) => m !== null).map((m) => m % 12));
    s.panel.querySelector("#cd-tones").innerHTML = spelled.map((n, j) =>
      `<span class="cd-tone${j === 0 ? " root" : ""}${heard.has(n.pc) ? "" : " left-out"}" title="${heard.has(n.pc) ? "" : "left out of this shape"}"><b>${esc(n.name)}</b><i>${prettyDegree(n.degree)}</i></span>`).join("")
      + (c.bass ? `<span class="cd-tone bass"><b>${esc(c.bass.name)}</b><i>bass</i></span>` : "");
    for (const b of s.panel.querySelectorAll("#cd-slabels button")) b.setAttribute("aria-pressed", String(b.dataset.l === state.labels));
    const want = chordHash(c, rootName, sheet.idx);
    if (location.hash !== want && route().type) history.replaceState(null, "", want);
  }
  function stepShape(d) { if (sheet) showShape(sheet.idx + d); }

  function play(mode) {
    if (!sheet) return;
    sound?.stop();
    const notes = midis(decode(sheet.chord.codes[sheet.idx]), inst()).filter((m) => m !== null);
    sound = pluck(getAudio, notes, { mode, instrument: state.inst });
  }

  // --- wiring -------------------------------------------------------------------
  function setLabels(l) {
    if (!LABELS.some(([id]) => id === l)) return;
    state.labels = l; store.set("labels", l);
    render();
    if (sheet) showShape(sheet.idx);
  }
  bar.querySelector("#cd-inst").addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b || b.dataset.inst === state.inst) return;
    state.inst = b.dataset.inst; store.set("inst", state.inst);
    history.replaceState(null, "", browseHash());
    render();
    await load(state.inst);
    if (!destroyed) render();
  });
  bar.querySelector("#cd-keys").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state.key = b.dataset.key; store.set("key", state.key);
    history.replaceState(null, "", browseHash());
    render();
    window.scrollTo({ top: 0 });
  });
  input.addEventListener("input", () => { state.query = input.value.trim(); render(); window.scrollTo({ top: 0 }); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); body.querySelector(".cd-card")?.click(); }
    else if (e.key === "Escape" && input.value) { e.stopPropagation(); clear(); }
  });
  const clear = () => { input.value = ""; state.query = ""; render(); input.focus(); };
  clearBtn.addEventListener("click", clear);
  body.addEventListener("click", (e) => {
    const t = e.target.closest(".cd-try");
    if (t) { input.value = t.textContent; state.query = t.textContent; render(); return; }
    const b = e.target.closest(".cd-card");
    if (!b) return;
    const c = chordsFor[state.inst].find((x) => x.key === b.dataset.key && x.typeKey === b.dataset.type);
    input.blur(); // the phone keyboard gets out of the sheet's way
    const h = chordHash(c, b.dataset.root, 0);
    openDetail(c, b.dataset.root, 0);
    sheet.pushed = true;
    history.pushState(null, "", h);
  });
  root.querySelector("#cd-labels").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setLabels(b.dataset.l); });
  root.querySelector("#cd-hand").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state.lefty = b.dataset.h === "left"; store.set("lefty", state.lefty);
    render();
    if (sheet) showShape(sheet.idx);
  });
  // back / forward and typed hashes: popstate fires for every fragment navigation (hashchange would double it)
  const onPop = () => { if (location.hash.startsWith("#/chords")) applyRoute(); };
  window.addEventListener("popstate", onPop);

  render();
  if (!route().inst) history.replaceState(null, "", browseHash());
  applyRoute();

  return {
    destroy() {
      destroyed = true;
      window.removeEventListener("popstate", onPop);
      sound?.stop();
      sheet?.s.close();
      slot?.replaceChildren();
      root.classList.remove("top-anchored");
    },
  };
}
