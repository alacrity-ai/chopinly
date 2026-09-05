// Hand-drawn SVG/HTML charts for the analytics page (WSHED-63). No library:
// the app palette, sparse labels, <title> tooltips — kbRelay's Analytics.tsx
// is the reference. Every helper returns a string.
import { esc, fmtMin } from "./util.js";

const H = 120, PAD = 4, AXIS = 14;

/**
 * Column chart. points: [{ label, ms, minutes, band?, future? }].
 * `labelEvery` thins the x labels; `labels` overrides them (e.g. hours).
 */
export function columns(points, { cls = "", width = 320, labelEvery = null, labels = null, value = (p) => p.minutes, maxLabel = (v) => fmtMin(v), titleOf = (p) => `${p.label} — ${fmtMin(p.minutes)}` } = {}) {
  const n = points.length;
  if (!n) return "";
  const W = Math.max(240, Math.round(width)); // drawn at ~1:1 css px so labels keep their size on any screen
  const max = Math.max(1, ...points.map(value));
  const group = (W - PAD * 2) / n;
  const bar = Math.max(1.5, Math.min(18, group * 0.72));
  const y = (v) => H - AXIS - (v / max) * (H - AXIS - PAD - 10);
  const every = labelEvery ?? Math.max(1, Math.ceil(n / Math.max(4, Math.floor(W / 44))));
  const items = points.map((p, i) => {
    const x = PAD + i * group + group / 2, v = value(p), top = y(v);
    const show = labels ? labels[i] != null : (i % every === 0 || i === n - 1);
    return `<g class="lb-anx-col" data-i="${i}"><title>${esc(titleOf(p))}</title>
      <rect class="lb-anx-hit" x="${(x - group / 2).toFixed(1)}" y="0" width="${group.toFixed(1)}" height="${H}"/>
      <rect class="lb-anx-bar ${p.band ? `b-${p.band}` : ""} ${p.future ? "future" : ""}" x="${(x - bar / 2).toFixed(1)}" y="${v ? top.toFixed(1) : H - AXIS - 1}" width="${bar.toFixed(1)}" height="${v ? (H - AXIS - top).toFixed(1) : 1}" rx="${Math.min(2, bar / 3).toFixed(1)}"/>
      ${show ? `<text class="lb-anx-label" x="${x.toFixed(1)}" y="${H - 3}" text-anchor="middle">${esc(labels ? labels[i] : p.label)}</text>` : ""}
    </g>`;
  }).join("");
  return `<svg class="lb-anx-chart ${cls}" viewBox="0 0 ${W} ${H}" style="aspect-ratio:${W} / ${H}" role="img" aria-label="${esc(points.length + " bars, highest " + maxLabel(max))}">
    <line class="lb-anx-axis" x1="${PAD}" x2="${W - PAD}" y1="${H - AXIS}" y2="${H - AXIS}"/>
    <text class="lb-anx-label lb-anx-max" x="${PAD + 1}" y="9">${esc(maxLabel(max))}</text>
    ${items}
  </svg>`;
}

/** Donut. slices: [{ label, ms, share, cls }]. Centre shows the total. */
export function donut(slices, total, { size = 120, thickness = 16 } = {}) {
  const r = (size - thickness) / 2, c = size / 2, circ = 2 * Math.PI * r;
  let offset = 0;
  const arcs = slices.map((s) => {
    const len = Math.max(0, s.share * circ);
    const el = `<circle class="lb-anx-slice ${s.cls}" cx="${c}" cy="${c}" r="${r}" stroke-dasharray="${len.toFixed(2)} ${(circ - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" style="stroke-width:${thickness}"><title>${esc(`${s.label} — ${fmtMin(s.minutes)} · ${pct(s.share)}`)}</title></circle>`;
    offset += len;
    return el;
  }).join("");
  return `<svg class="lb-anx-donut" viewBox="0 0 ${size} ${size}" role="img" aria-label="share by type">
    <circle class="lb-anx-ring" cx="${c}" cy="${c}" r="${r}" style="stroke-width:${thickness}"/>
    <g transform="rotate(-90 ${c} ${c})">${arcs}</g>
    <text class="lb-anx-donut-total" x="${c}" y="${c + 5}">${esc(fmtMin(Math.round(total / 60000)))}</text>
  </svg>`;
}

/** Legend rows for a donut/grouping; clicking focuses. rows: [{ key, label, minutes, share, cls?, color? }]. */
export function legend(rows, kind) {
  return `<ul class="lb-anx-legend">${rows.map((r) => `<li><button type="button" data-focus-kind="${kind}" data-focus="${esc(r.key)}" title="focus on ${esc(r.label)}">
    <i class="${r.cls ?? ""}" ${r.color ? `style="--c:${r.color}"` : ""}></i><span>${esc(r.label)}</span><em>${fmtMin(r.minutes)} · ${pct(r.share)}</em></button></li>`).join("")}</ul>`;
}

/** Horizontal bars, scaled to the first (largest) row. rows: [{ key, label, minutes, share, cls?, color?, sub? }]. */
export function hbars(rows, kind, { max = null } = {}) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.minutes));
  return `<ul class="lb-bars lb-anx-hbars">${rows.map((r) => `<li class="lb-bar">
    <button type="button" class="lb-bar-name" data-focus-kind="${kind}" data-focus="${esc(r.key)}" title="focus on ${esc(r.label)}">${r.cls ? `<i class="lb-type ${r.cls}" aria-hidden="true"></i>` : ""}<span>${esc(r.label)}</span></button>
    <span class="lb-bar-track"><span class="lb-bar-fill ${r.cls ?? ""}" style="width:${Math.max(1.5, 100 * r.minutes / top).toFixed(1)}%${r.color ? `;background:${r.color}` : ""}"></span></span>
    <span class="lb-bar-min">${fmtMin(r.minutes)}<small>${pct(r.share)}</small></span>
  </li>`).join("")}</ul>`;
}

/** One stacked bar of day bands + a compact legend. bands: [{ key, label, count }]. */
export function stack(bands, totalDays) {
  const on = bands.filter((b) => b.count);
  return `<div class="lb-anx-stack" role="img" aria-label="days by band">${on.map((b) => `<i class="b-${b.key}" style="flex:${b.count}" title="${esc(`${b.label}: ${b.count} day${b.count === 1 ? "" : "s"}`)}"></i>`).join("")}</div>
  <ul class="lb-anx-bandkey">${bands.map((b) => `<li class="${b.count ? "" : "off"}"><i class="b-${b.key}"></i><span>${esc(b.label)}</span><em>${b.count}</em></li>`).join("")}</ul>`;
}

export const pct = (share) => `${Math.round(share * 100)}%`;
/** Palette for composer bars — brass first, then the rest of the room. */
export const PALETTE = ["var(--brass)", "var(--gold)", "#b08968", "#9c8fbf", "#7fa3a8", "var(--brass-bright)", "#c07a5a", "#8f9a7a"];
