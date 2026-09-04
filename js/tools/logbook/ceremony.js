// The two ceremonies (WSHED-47): the moments the Logbook is allowed to stop
// you. Both are body-level overlays that swallow input, auto-dismiss, and —
// after a minimum hold — dismiss on tap/Esc/Enter. Silent, the metronome
// owns audio. Palette only. Under prefers-reduced-motion they are static and
// short, with no particles.
//
//   engage(): "practice engaged" — the curtain, a brass downbeat ring, the
//             goal name rising, 0:00 — then the name whooshes onto the hero.
//   bow():    "you worked toward a goal for a length of time" — the duration
//             counts up in a huge numeral inside a brass bloom while brass
//             shavings burst upward and settle; then the numeral settles
//             into the goal's row.

import { reduced, haptic, whoosh, settle } from "./motion.js";
import { esc, fmtMin } from "./util.js";

const SHAVINGS = ["#c9a35c", "#c9a35c", "#c9a35c", "#c9a35c", "#e3c284", "#e3c284", "#eee5d3", "#8fae82", "#b0463c"];

function overlay(cls, html) {
  const el = document.createElement("div");
  el.className = `lb-ceremony ${cls}`;
  el.setAttribute("role", "status");
  el.innerHTML = html;
  document.body.append(el);
  // two frames so the opacity transition actually runs
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("in")));
  return el;
}

/** Resolve after `ms`, or on tap / Esc / Enter once `minMs` has passed. */
function hold(el, ms, minMs) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let done = false;
    const finish = () => { if (done) return; done = true; clearTimeout(timer); document.removeEventListener("keydown", onKey); resolve(); };
    const timer = setTimeout(finish, ms);
    const early = () => { if (performance.now() - t0 >= minMs) finish(); };
    const onKey = (e) => { if (e.key === "Escape" || e.key === "Enter" || e.key === " ") { e.preventDefault(); early(); } };
    el.addEventListener("click", early);
    document.addEventListener("keydown", onKey);
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Practice engaged. `landOn()` returns the hero's goal element once the
 * running hero is rendered (null → the curtain just lifts).
 */
export async function engage({ goal, type, landOn = null }) {
  const rm = reduced();
  haptic([18, 60, 36]);
  const el = overlay("engage", `
    <div class="lb-cer-ring" aria-hidden="true"></div><div class="lb-cer-ring two" aria-hidden="true"></div>
    <div class="lb-cer-body">
      <div class="lb-cer-type ${type.cls}"><i class="lb-type ${type.cls}" aria-hidden="true">${type.glyph}</i>${type.label}</div>
      <div class="lb-cer-goal">${esc(goal.name)}</div>
      <div class="lb-cer-clock">0:00</div>
    </div>`);
  await hold(el, rm ? 500 : 1100, 400);
  const from = el.querySelector(".lb-cer-goal"), to = landOn?.() ?? null;
  el.classList.add("out");
  await Promise.all([whoosh(from, to, "lb-ghost-cer"), wait(rm ? 0 : 240)]);
  el.remove();
}

/** Brass shavings: a canvas burst that fans upward from the numeral and settles under gravity. */
function shavings(canvas, count, originY) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const c = canvas.getContext("2d");
  c.scale(dpr, dpr);
  const ps = [];
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = 5 + Math.random() * 8;
    ps.push({ x: w / 2 + (Math.random() - 0.5) * 30, y: originY, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
      col: SHAVINGS[(Math.random() * SHAVINGS.length) | 0], dot: Math.random() < 0.3, len: 5 + Math.random() * 5, born: Math.random() * 80 });
  }
  const t0 = performance.now(); let raf = 0;
  const frame = (now) => {
    const t = now - t0;
    c.clearRect(0, 0, w, h);
    let alive = 0;
    for (const p of ps) {
      if (t < p.born) { alive++; continue; }
      p.vy += 0.16; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      const fade = Math.max(0, Math.min(1, (1700 - t) / 500));
      if (p.y > h + 10 || fade <= 0) continue;
      alive++;
      c.globalAlpha = fade; c.fillStyle = p.col;
      if (p.dot) { c.beginPath(); c.arc(p.x, p.y, 2, 0, Math.PI * 2); c.fill(); }
      else { c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.fillRect(-1.25, -p.len / 2, 2.5, p.len); c.restore(); }
    }
    if (alive && t < 2000) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

const bigNum = (ms) => (ms < 60000 ? `${Math.round(ms / 1000)}<small>s</small>` : ms < 3600000 ? `${Math.round(ms / 60000)}<small>min</small>` : esc(fmtMin(Math.round(ms / 60000))));

/**
 * The bow. `landOn()` returns the goal's row on the (already re-rendered)
 * Today list; the numeral settles into it on exit.
 */
export async function bow({ goal, ms, todayMinutes = 0, streak = 0, landOn = null }) {
  const rm = reduced();
  haptic([30, 50, 30, 50, 90]);
  const sub = [`today on this goal <b>${esc(fmtMin(Math.max(1, todayMinutes)))}</b>`, streak > 1 ? `streak <b>${streak} days</b>` : ""].filter(Boolean).join(" · ");
  const el = overlay("bow", `
    <canvas class="lb-cer-canvas" aria-hidden="true"></canvas>
    <div class="lb-cer-bloom" aria-hidden="true"></div>
    <div class="lb-cer-body">
      <div class="lb-cer-num" aria-label="${esc(fmtMin(Math.max(1, Math.round(ms / 60000))))}">${rm ? bigNum(ms) : bigNum(0)}</div>
      <div class="lb-cer-on">on <em>${esc(goal.name)}</em></div>
      <div class="lb-cer-sub">${sub}</div>
    </div>
    <div class="lb-cer-hint" aria-hidden="true">tap to continue</div>`);
  const num = el.querySelector(".lb-cer-num");
  let stopShavings = () => {};
  if (!rm) {
    // count up over 600 ms with an ease-out so the last digits slow down
    const t0 = performance.now();
    const tick = (now) => { const k = Math.min(1, (now - t0) / 600), e = 1 - Math.pow(1 - k, 3); num.innerHTML = bigNum(ms * e); if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const mins = ms / 60000;
    const count = Math.round(Math.max(24, Math.min(120, 24 + mins * 2)));
    const canvas = el.querySelector(".lb-cer-canvas");
    requestAnimationFrame(() => { stopShavings = shavings(canvas, count, num.getBoundingClientRect().bottom || innerHeight * 0.45); });
  }
  await hold(el, rm ? 1200 : 2200, 600);
  stopShavings();
  const row = landOn?.() ?? null;
  el.classList.add("out");
  await Promise.all([rm ? Promise.resolve() : settle(num, row), wait(rm ? 0 : 260)]);
  el.remove();
}
