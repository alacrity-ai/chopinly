// Brushes (WSHED-106): the sheet that lists the user's brushes, lets them drag
// one to reorder, tap one to edit (name, colour, width, opacity, highlighter),
// add and delete. Brushes live in the logbook (kind "brush") so they sync to
// the account's other devices; a signed-out device keeps them locally.
import { logbook } from "../../lib/logbook.js";
import { icon } from "../../lib/icons.js";
import { esc, toast, openSheet, finePointer } from "../logbook/util.js";
import { haptic } from "../logbook/motion.js";
import { draw, strokeFor, SWATCHES, MIN_WIDTH, MAX_WIDTH, REF_W } from "../../lib/scores/ink.js";

/** A short line about a brush: "2.4 px · 55 % · highlighter". */
export const brushSub = (b) => `${b.width} px · ${Math.round(b.opacity * 100)} %${b.hi ? " · highlighter" : ""}`;

/** The swatch markup the bar and the list share: a disc of the colour with a dot sized by width. */
export function swatch(b, cls = "") {
  const dot = Math.max(0.2, Math.min(1, (b.width / 24) + 0.15));
  return `<i class="sc-br-sw ${b.hi ? "sc-br-hi" : ""} ${cls}" style="--c:${esc(b.color)};--o:${b.opacity};--d:${dot.toFixed(2)}" aria-hidden="true"></i>`;
}

/** Draw a sample stroke with a brush on a preview canvas (white "page"). */
function preview(canvas, b) {
  const dpr = Math.min(devicePixelRatio || 1, 3);
  const cw = canvas.clientWidth || 280, ch = canvas.clientHeight || 64;
  canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  const cx = canvas.getContext("2d");
  cx.fillStyle = "#fff"; cx.fillRect(0, 0, canvas.width, canvas.height);
  // staff lines so opacity and multiply read against something
  cx.strokeStyle = "#9a9a9a"; cx.lineWidth = dpr; cx.globalAlpha = 1;
  for (let i = 0; i < 5; i++) { const y = Math.round((ch * (0.28 + i * 0.11)) * dpr) + 0.5; cx.beginPath(); cx.moveTo(0, y); cx.lineTo(canvas.width, y); cx.stroke(); }
  const st = strokeFor(b);
  const pageW = REF_W; // the preview is a slice of a 420 px-wide page, so widths read true
  const n = 40, pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push({ x: (0.08 + t * 0.84) * (cw / pageW), y: (0.5 + Math.sin(t * Math.PI * 2) * 0.28) * (ch / pageW), p: 0.35 + 0.5 * Math.sin(t * Math.PI) }); }
  st.pts = pts;
  draw(cx, [st], pageW * dpr, pageW * dpr);
}

/**
 * Open the brushes sheet. Resolves with the id of the brush to draw with next
 * (the one tapped "use", or the current one) when closed.
 */
export function openBrushes({ current = null } = {}) {
  let pick = current;
  const sheet = openSheet({ title: "brushes", cls: "lb-acct-wrap sc-brushes-wrap", html: "" });
  const { body, close, closed } = sheet;

  function list() {
    const bs = logbook.brushes();
    body.innerHTML = `
      <ul class="lb-acct-list sc-br-list" id="sc-br-list">${bs.map((b) => `
        <li class="sc-br-row ${b.id === pick ? "sc-br-cur" : ""}" data-id="${esc(b.id)}">
          <button type="button" class="sc-br-grip" aria-label="drag to reorder ${esc(b.name)}">${icon("grip")}</button>
          <button type="button" class="lb-acct-row sc-br-open" aria-label="edit ${esc(b.name)}">${swatch(b)}<span><b>${esc(b.name)}</b><small>${brushSub(b)}${b.id === pick ? " · in hand" : ""}</small></span></button>
          <button type="button" class="sc-br-use ${b.id === pick ? "on" : ""}" aria-label="draw with ${esc(b.name)}" aria-pressed="${b.id === pick}">${icon("check")}</button>
        </li>`).join("")}
      </ul>
      <div class="sc-br-acts">
        <button type="button" class="lb-modal-save" id="sc-br-add">${icon("plus")} new brush</button>
        <button type="button" class="lb-chip" id="sc-br-reset">reset to the defaults</button>
      </div>
      <p class="lb-acct-fine">tap a brush to edit it · drag the handle to reorder · the tick picks the one in hand</p>`;
    for (const li of body.querySelectorAll(".sc-br-row")) {
      const id = li.dataset.id;
      li.querySelector(".sc-br-open").addEventListener("click", () => edit(id));
      li.querySelector(".sc-br-use").addEventListener("click", () => { pick = id; haptic(); close(); });
    }
    body.querySelector("#sc-br-add").addEventListener("click", () => edit(null));
    body.querySelector("#sc-br-reset").addEventListener("click", () => { if (!confirm("Replace every brush with the starter set?")) return; logbook.resetBrushes(); pick = logbook.brushes()[0]?.id ?? null; haptic(20); toast("brushes reset"); list(); });
    wireDrag(body.querySelector("#sc-br-list"));
  }

  /** Pointer drag on the grip: the row follows the finger through its siblings; the new order is written on release. */
  function wireDrag(ul) {
    for (const grip of ul.querySelectorAll(".sc-br-grip")) {
      grip.addEventListener("pointerdown", (e) => {
        if (e.button && e.button !== 0) return;
        e.preventDefault();
        const li = grip.closest("li");
        const pid = e.pointerId;
        try { grip.setPointerCapture(pid); } catch { /* fine */ }
        li.classList.add("sc-br-drag");
        ul.classList.add("dragging");
        haptic(6);
        const move = (ev) => {
          if (ev.pointerId !== pid) return;
          const rows = [...ul.children].filter((x) => x !== li);
          for (const r of rows) {
            const rc = r.getBoundingClientRect();
            if (ev.clientY < rc.top + rc.height / 2 && li.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_PRECEDING) { r.before(li); haptic(3); break; }
            if (ev.clientY > rc.top + rc.height / 2 && li.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING) { r.after(li); haptic(3); break; }
          }
        };
        const up = (ev) => {
          if (ev.pointerId !== pid) return;
          grip.removeEventListener("pointermove", move); grip.removeEventListener("pointerup", up); grip.removeEventListener("pointercancel", up);
          li.classList.remove("sc-br-drag"); ul.classList.remove("dragging");
          try { grip.releasePointerCapture(pid); } catch { /* fine */ }
          logbook.reorderBrushes([...ul.children].map((x) => x.dataset.id));
        };
        grip.addEventListener("pointermove", move); grip.addEventListener("pointerup", up); grip.addEventListener("pointercancel", up);
      });
    }
  }

  function edit(id) {
    const cur = id ? logbook.brush(id) : null;
    const b = cur ? { ...cur } : { name: "", color: SWATCHES[0], width: 2.4, opacity: 1, hi: false };
    body.innerHTML = `
      <form class="lb-acct-form sc-br-form" id="sc-br-form" novalidate>
        <canvas class="sc-br-preview" id="sc-br-preview" aria-hidden="true"></canvas>
        <label class="lb-acct-label" for="sc-br-name">name</label>
        <input class="lb-input" id="sc-br-name" value="${esc(b.name)}" placeholder="fingering pen, red circles…" maxlength="24" autocomplete="off" autocapitalize="off" required>
        <label class="lb-acct-label">colour</label>
        <div class="sc-br-colors" id="sc-br-colors">
          ${SWATCHES.map((c) => `<button type="button" class="sc-br-color ${c === b.color ? "on" : ""}" data-color="${c}" style="--c:${c}" aria-label="${c}" aria-pressed="${c === b.color}"></button>`).join("")}
          <label class="sc-br-color sc-br-custom ${SWATCHES.includes(b.color) ? "" : "on"}" style="--c:${esc(b.color)}" aria-label="any colour"><input type="color" id="sc-br-hex" value="${esc(b.color)}">${icon("palette")}</label>
        </div>
        <label class="lb-acct-label" for="sc-br-width">thickness <output id="sc-br-width-out">${b.width} px</output></label>
        <input type="range" id="sc-br-width" min="${MIN_WIDTH}" max="${MAX_WIDTH}" step="0.1" value="${b.width}" aria-label="thickness in pixels">
        <label class="lb-acct-label" for="sc-br-alpha">opacity <output id="sc-br-alpha-out">${Math.round(b.opacity * 100)} %</output></label>
        <input type="range" id="sc-br-alpha" min="5" max="100" step="1" value="${Math.round(b.opacity * 100)}" aria-label="opacity in percent">
        <label class="sc-br-check"><input type="checkbox" id="sc-br-hi" ${b.hi ? "checked" : ""}> <span><b>highlighter</b><small>flat width, blends into the page instead of covering it</small></span></label>
        <p class="lb-err" id="sc-br-err" role="alert"></p>
        <div class="lb-modal-acts sc-br-formacts">
          <button type="button" class="lb-chip" id="sc-br-back">back</button>
          ${cur ? `<button type="button" class="lb-chip lb-danger" id="sc-br-del">delete</button>` : ""}
          <button type="submit" class="lb-modal-save" id="sc-br-save">${cur ? "save" : "add"}</button>
        </div>
      </form>`;
    const name = body.querySelector("#sc-br-name"), width = body.querySelector("#sc-br-width"), alpha = body.querySelector("#sc-br-alpha"), hi = body.querySelector("#sc-br-hi"), hex = body.querySelector("#sc-br-hex"), err = body.querySelector("#sc-br-err"), pv = body.querySelector("#sc-br-preview");
    const read = () => ({ name: name.value, color: b.color, width: Number(width.value), opacity: Number(alpha.value) / 100, hi: hi.checked });
    const paint = () => {
      body.querySelector("#sc-br-width-out").textContent = `${Number(width.value)} px`;
      body.querySelector("#sc-br-alpha-out").textContent = `${alpha.value} %`;
      for (const c of body.querySelectorAll("[data-color]")) { const on = c.dataset.color === b.color; c.classList.toggle("on", on); c.setAttribute("aria-pressed", String(on)); }
      const custom = body.querySelector(".sc-br-custom"); custom.classList.toggle("on", !SWATCHES.includes(b.color)); custom.style.setProperty("--c", b.color);
      preview(pv, { ...read(), name: "x" });
    };
    for (const c of body.querySelectorAll("[data-color]")) c.addEventListener("click", () => { b.color = c.dataset.color; hex.value = b.color; paint(); });
    hex.addEventListener("input", () => { b.color = hex.value.toLowerCase(); paint(); });
    width.addEventListener("input", paint); alpha.addEventListener("input", paint);
    hi.addEventListener("change", () => { if (hi.checked && Number(width.value) < 8) width.value = 18; if (hi.checked && Number(alpha.value) > 60) alpha.value = 35; paint(); });
    body.querySelector("#sc-br-back").addEventListener("click", list);
    body.querySelector("#sc-br-del")?.addEventListener("click", () => {
      if (!confirm(`Delete the brush “${cur.name}”? Ink drawn with it stays.`)) return;
      logbook.removeBrush(cur.id);
      if (pick === cur.id) pick = logbook.brushes()[0]?.id ?? null;
      haptic(20); toast("deleted"); list();
    });
    body.querySelector("#sc-br-form").addEventListener("submit", (e) => {
      e.preventDefault();
      try {
        const saved = cur ? logbook.updateBrush(cur.id, read()) : logbook.addBrush(read());
        if (!cur) pick = saved.id;
        haptic(); toast(cur ? "saved" : "added"); list();
      } catch (ex) { err.textContent = ex.message; }
    });
    requestAnimationFrame(paint);
    if (finePointer()) name.focus();
  }

  list();
  return closed.then(() => pick);
}
