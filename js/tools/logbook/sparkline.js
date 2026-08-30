// Tempo-over-time sparkline: brass line + soft fill, the target as a dashed
// hairline to cross, the latest point emphasized. Returns an SVG string.
export function sparkline(points, { target = null, width = 300, height = 64 } = {}) {
  if (!points.length) return "";
  const t = Number(target);
  const hasTarget = Number.isFinite(t) && t > 0;
  const bpms = points.map((p) => p.bpm);
  let lo = Math.min(...bpms, hasTarget ? t : Infinity);
  let hi = Math.max(...bpms, hasTarget ? t : -Infinity);
  if (hi - lo < 10) { lo -= 5; hi += 5; }
  const padT = 10, padB = 6;
  const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (height - padT - padB);
  const x = (i) => (points.length === 1 ? width / 2 : (i / (points.length - 1)) * (width - 8) + 4);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.bpm).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const lx = x(points.length - 1).toFixed(1), ly = y(last.bpm).toFixed(1);
  return `<svg class="lb-spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"
      role="img" aria-label="tempo over ${points.length} entries, latest ${last.bpm}${hasTarget ? `, target ${t}` : ""}">
    ${hasTarget ? `<line class="lb-spark-target" x1="0" x2="${width}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>` : ""}
    <path class="lb-spark-fill" d="${path} L${lx} ${height} L${x(0).toFixed(1)} ${height} Z"/>
    <path class="lb-spark-line" d="${path}"/>
    <circle class="lb-spark-last" cx="${lx}" cy="${ly}" r="3.5"/>
  </svg>`;
}
