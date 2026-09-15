// Layout → painter calls (docs/COMPOSE_DESIGN.md §9, §10.1). One description of the ink,
// two painters: the SVG painter in render.js (the screen) and the PDF painter in
// export/pdf.js (paper). Every coordinate is in S (staff spaces); a Bravura glyph's em is
// 4 S and its origin sits on its musical anchor. Paper differences are the painter's:
// hidden rests and halos are skipped, voice tints are ink.
import { G, timeDigit, tupletDigit, restGlyph, headGlyph, flagGlyph, artGlyph, dynGlyph, fingerGlyph } from "../staff/glyphs.js";

const vcls = (vi) => (vi ? ` cp-v${vi + 1}` : ""); // voices 2–4 tint on screen (skin tokens --voice-2..4); voice 1 is ink

/**
 * Paint a layout. The painter:
 *   group(cls, data) / end()                       — a <g> on screen (data → data-* attributes); nothing on paper
 *   line(x1, y1, x2, y2, cls)                      — a stroked line (staff lines, ledgers, gliss)
 *   rect(x, y, w, h, cls)                          — a filled rectangle (stems, barlines)
 *   polygon(points, cls)                           — filled (beams)
 *   polyline(points, cls)                          — stroked (tuplet brackets)
 *   path(segs, cls)                                — [["M", x, y], ["C", x1, y1, x2, y2, x, y], ["L", x, y], ["Z"]]; filled unless cls says stroke
 *   circle(cx, cy, r, cls)                         — the selection halo (screen only)
 *   glyph(x, y, ch, cls, { scale, anchor, rotate, centre, data }) — Bravura text; scale × 4 S em; centre → ink-centred on x
 *   text(x, y, str, cls, { size, anchor, rotate }) — words in the serif face; size in S
 */
export function paintScore(L, p) {
  for (const sys of L.systems) {
    const lastBar = sys.endX ?? sys.barlines[sys.barlines.length - 1].x;
    p.group("cp-sys");
    // staff lines
    for (const topY of sys.staffTop) for (let i = 0; i < 5; i++) p.line(1.0, topY + i, lastBar, topY + i, "sline");
    // brace + the system's left barline joining the staves
    const t0 = sys.staffTop[0], t1 = sys.staffTop[sys.staffTop.length - 1] + 4;
    p.rect(1.0 - 0.065, t0, 0.13, t1 - t0, "sline-bar");
    if (sys.staffTop.length > 1) p.glyph(0.85, t1, G.brace, "glyph cp-brace", { scale: (t1 - t0) / 4, anchor: "end" });
    // leading symbols per bar
    for (const lead of sys.leading) {
      lead.staves.forEach((st) => {
        const topY = st.topY;
        if (lead.clef) { const clefStep = (st.clef.line - 1) * 2; p.glyph(lead.x + 0.2, topY + (8 - clefStep) / 2, G[st.clef.glyph], "glyph", lead.small ? { scale: 0.8 } : {}); }
        if (lead.key) st.keysig.forEach((k, i) => p.glyph(lead.keyX + i * 1.15, topY + (8 - k.step) / 2, G[k.acc], "glyph"));
        if (lead.time) { const b = sys.bars[sys.leading.indexOf(lead)]; p.glyph(lead.timeX, topY + 1, timeDigit(b.time.beats), "glyph"); p.glyph(lead.timeX, topY + 3, timeDigit(b.time.unit), "glyph"); }
      });
    }
    // courtesy key / time at the system's end when the next system opens with a change
    if (sys.courtesyLead) {
      const c = sys.courtesyLead;
      c.staves.forEach((st) => {
        if (st.clef) p.glyph(c.x + 0.15, st.clef.y, G[st.clef.glyph], "glyph cp-courtesy", { scale: 0.8 });
        st.keysig.forEach((k, i) => p.glyph(c.keyX + i * 1.15, st.topY + (8 - k.step) / 2, G[k.acc], "glyph cp-courtesy"));
        if (c.time) { p.glyph(c.timeX, st.topY + 1, timeDigit(c.beats), "glyph cp-courtesy"); p.glyph(c.timeX, st.topY + 3, timeDigit(c.unit), "glyph cp-courtesy"); }
      });
    }
    // barlines spanning both staves (docs/COMPOSE_FORM_DESIGN.md §5): thin; double = two thin; final = thin + thick; repeat = dots + thin + thick (mirrored to open a bar)
    const dots = (x) => { for (const topY of sys.staffTop) p.glyph(x, topY + 4, G.repeatDots, "glyph cp-repeat-dots"); };
    for (const bl of sys.barlines) {
      const kind = bl.kind ?? (bl.final ? "final" : "single");
      if (kind === "single") p.rect(bl.x - 0.065, t0, 0.13, t1 - t0, "sline-bar");
      else if (kind === "double") { p.rect(bl.x - 0.065, t0, 0.13, t1 - t0, "sline-bar"); p.rect(bl.x - 0.565, t0, 0.13, t1 - t0, "sline-bar"); }
      else { p.rect(bl.x - 0.9, t0, 0.13, t1 - t0, "sline-bar"); p.rect(bl.x - 0.45, t0, 0.5, t1 - t0, "sline-bar"); if (kind === "repeat") dots(bl.x - 1.85); }
      if (bl.startX !== undefined) { p.rect(bl.startX + 0.05, t0, 0.5, t1 - t0, "sline-bar"); p.rect(bl.startX + 0.85, t0, 0.13, t1 - t0, "sline-bar"); dots(bl.startX + 1.25); }
    }
    p.end();
  }
  // clef changes inside a bar (small, before the beat they take effect on)
  for (const c of L.clefs) p.glyph(c.x, c.y, G[c.glyph], "glyph cp-clef-change", { scale: 0.8, data: { bar: c.bar, staff: c.staff } });
  // beams (under the notes); a cross-staff beam runs between the staves
  for (const b of L.beams) {
    const t = b.dir === "up" ? b.t : -b.t;
    p.polygon([[b.x1, b.y1], [b.x2, b.y2], [b.x2, b.y2 + t], [b.x1, b.y1 + t]], `beam${vcls(b.voice)}`);
  }
  // notes + rests
  for (const d of L.drawn) {
    if (!d.rest) for (const l of d.ledgers) p.line(l.x - 0.35, l.y, l.x + d.headW + 0.35, l.y, "sline");
    p.group(`cp-ev note${vcls(d.voice)}${d.hidden ? " cp-hidden" : ""}`, { ev: d.id, bar: d.bar, staff: d.staff, voice: d.voice });
    if (d.rest) { // a hidden rest is drawn faint on screen so it can still be picked and shown again; paper leaves it out
      p.glyph(d.x, d.y, restGlyph(d.base), "glyph rest");
      for (let i = 0; i < (d.dots ?? 0); i++) p.glyph(d.x + 1.5 + i * 0.7, d.y - 0.5, G.dot, "glyph head-part");
    } else {
      if (d.stem) {
        p.rect(d.stemX - 0.065, Math.min(d.stemFromY, d.stemTipY), 0.13, Math.abs(d.stemFromY - d.stemTipY), "stem");
        if (d.beams >= 1 && !d.beamed) p.glyph(d.stemX - 0.065, d.stemTipY, flagGlyph(d.base, d.stem === "up"), "glyph head-part");
      }
      for (const h of d.heads) {
        p.group("cp-head-g", { pi: h.pi });
        p.circle(h.x + d.headW / 2, h.y, 1.4, "halo");
        if (h.acc !== null && h.acc !== undefined) p.glyph(h.accX ?? (Math.min(h.x, d.x) - 1.35 - h.accCol * 1.15), h.y, G[h.acc], "glyph head-part");
        if (!h.shared) p.glyph(h.x, h.y, headGlyph(d.base), "glyph head cp-head"); // a unison shared with the other voice: one head, two stems
        for (let i = 0; i < (d.dots ?? 0); i++) p.glyph(Math.max(h.x, d.x) + d.headW + 0.4 + i * 0.7, h.step % 2 === 0 ? h.y - 0.5 : h.y, G.dot, "glyph head-part");
        p.end();
      }
    }
    p.end();
  }
  // ties (a tapered filled curve) and slurs (the same shape, arched by the layout's h)
  for (const t of L.ties) {
    const sgn = t.dir === "up" ? -1 : 1, len = Math.max(0.6, t.x2 - t.x1);
    const x1 = t.x1 + 0.12, x2 = t.x2 - 0.12, y1 = t.y1 + 0.62 * sgn, y2 = t.y2 + 0.62 * sgn;
    const b = Math.max(0.55, Math.min(1.35, len / 4)) * sgn, b2 = b - 0.26 * sgn, cx = Math.min(len * 0.3, 2.5);
    p.path([["M", x1, y1], ["C", x1 + cx, y1 + b, x2 - cx, y2 + b, x2, y2], ["C", x2 - cx, y2 + b2, x1 + cx, y1 + b2, x1, y1], ["Z"]], `cp-tie${vcls(t.voice)}`);
  }
  for (const t of L.slurs) {
    const sgn = t.dir === "up" ? -1 : 1, len = Math.max(1, t.x2 - t.x1);
    const x1 = t.x1, x2 = t.x2, y1 = t.y1, y2 = t.y2;
    const b = t.h * sgn, b2 = b - 0.3 * sgn, cx = Math.min(len * 0.32, 4);
    p.path([["M", x1, y1], ["C", x1 + cx, y1 + b, x2 - cx, y2 + b, x2, y2], ["C", x2 - cx, y2 + b2, x1 + cx, y1 + b2, x1, y1], ["Z"]], `cp-slur${vcls(t.voice)}`);
  }
  for (const m of L.marks) p.glyph(m.x, m.y, artGlyph(m.mark, m.above), "glyph cp-art", { centre: true }); // m.x is the head's centre; the glyph's ink is centred on it
  // a roll: wiggle segments (each 1.02 S long, ink 0.48 S wide beside the baseline) rotated to run along the chord, an arrowhead segment (2.06 S) for up / down.
  // rotate(−90) runs the text upward from the bottom point with its ink to the left of the anchor; rotate(+90) runs it downward with the ink to the right.
  for (const a of L.arps) {
    const arrow = a.kind !== "plain", span = a.y1 - a.y2;
    const n = Math.max(2, Math.ceil((span - (arrow ? 2.06 : 0)) / 1.02));
    const down = a.kind === "down";
    const text = (down ? G.wiggleArpDown : G.wiggleArpUp).repeat(n) + (a.kind === "up" ? G.wiggleArpUpArrow : down ? G.wiggleArpDownArrow : "");
    const ax = a.x + (down ? -0.24 : 0.24), ay = down ? a.y2 : a.y1;
    p.glyph(ax, ay, text, "glyph cp-arp", { rotate: [down ? 90 : -90, ax, ay] });
  }
  // expressions: each in its own selectable group (`data-ev` is the selection key, like an event's; `data-kind` says which)
  for (const dy of L.dynamics) { p.group("cp-expr", { ev: dy.id, kind: "dyn" }); p.glyph(dy.x, dy.y, dynGlyph(dy.dyn), "glyph cp-dyn", { centre: true }); p.end(); } // ink-centred on the slot like a mark
  for (const hp of L.hairpins) { // two lines meeting at the closed end; a hairpin over a system break stays open at the break
    const o = 0.55, cresc = hp.kind === "cresc";
    let a1 = cresc ? 0 : o, a2 = cresc ? o : 0; // half-opening at x1 / x2
    if (hp.half === "out" || hp.half === "both") a2 = o * (cresc ? 0.55 : 0.45);
    if (hp.half === "in" || hp.half === "both") a1 = o * (cresc ? 0.55 : 0.45);
    p.group("cp-expr", { ev: hp.id, kind: "hairpin" });
    p.path([["M", hp.x1, hp.y - a1], ["L", hp.x2, hp.y - a2], ["M", hp.x1, hp.y + a1], ["L", hp.x2, hp.y + a2]], "cp-hairpin");
    p.end();
  }
  for (const tx of L.texts) { p.group("cp-expr", { ev: tx.id, kind: "text" }); p.text(tx.x, tx.y, tx.text, "cp-expr-text", { size: 1.15 }); p.end(); }
  // the Piano rail's lines (docs/COMPOSE_PIANO_DESIGN.md §5): Ped. + a line with an up-hook at the lift (a notch at a retake, no sign after one);
  // 8va / 8vb + a dashed line with a hook toward the staff; a piece open at a system break has no sign after it / no hook before it
  for (const pd of L.pedals ?? []) {
    p.group("cp-expr", { ev: pd.id, kind: "pedal" });
    const signW = 2.3, x1 = pd.retake || pd.half === "in" || pd.half === "both" ? pd.x1 : pd.x1 + signW;
    if (!pd.retake && pd.half !== "in" && pd.half !== "both") p.glyph(pd.x1, pd.y, G.pedal, "glyph cp-pedal-sign", { scale: 0.85 });
    const pts = [[x1, pd.y], [pd.x2, pd.y]];
    if (pd.notch) pts.splice(1, 1, [pd.x2 - 0.5, pd.y], [pd.x2, pd.y + 0.9], [pd.x2 + 0.5, pd.y]);
    else if (pd.half !== "out" && pd.half !== "both") pts.push([pd.x2, pd.y - 1.0]);
    if (x1 < pd.x2 - 0.2) p.polyline(pts, "cp-pedal-line");
    p.end();
  }
  for (const ot of L.ottavas ?? []) {
    p.group("cp-expr", { ev: ot.id, kind: "ottava" });
    const up = ot.dir > 0, signW = 2.2, x1 = ot.half === "in" || ot.half === "both" ? ot.x1 : ot.x1 + signW;
    if (ot.half !== "in" && ot.half !== "both") p.glyph(ot.x1, ot.y, up ? G.ottavaAlta : G.ottavaBassa, "glyph cp-ottava-sign", { scale: 0.8 });
    const ly = up ? ot.y - 0.55 : ot.y - 0.4;
    const pts = [[x1, ly], [ot.x2, ly]];
    if (ot.half !== "out" && ot.half !== "both") pts.push([ot.x2, ly + (up ? 1.0 : -1.0)]);
    if (x1 < ot.x2 - 0.2) p.polyline(pts, "cp-ottava-line");
    p.end();
  }
  for (const f of L.fingers ?? []) p.glyph(f.x, f.y, fingerGlyph(f.n), "glyph cp-finger", { centre: true, scale: 0.9, data: { ev: f.ev, pi: f.pi } });
  // form: signs, the boxed rehearsal letter, a tempo mark (word, then ♩ = n) at a bar's start; Fine / To Coda / jumps right-aligned at its end; ending brackets with their number
  for (const f of L.form) {
    p.group("cp-form", { bar: f.bar, kind: f.kind });
    if (f.kind === "sign") p.glyph(f.x, f.y, f.sign === "segno" ? G.segno : G.coda, "glyph cp-sign", { scale: 0.75 });
    else if (f.kind === "rehearsal") { p.polyline([[f.x, f.y + 0.45], [f.x + f.w, f.y + 0.45], [f.x + f.w, f.y - 1.35], [f.x, f.y - 1.35], [f.x, f.y + 0.45]], "cp-rehearsal-box"); p.text(f.x + f.w / 2, f.y, f.text, "cp-rehearsal", { size: 1.25, anchor: "middle" }); }
    else if (f.kind === "tempo") { if (f.text) p.text(f.x, f.y, f.text, "cp-tempo-word", { size: 1.15 }); p.glyph(f.noteX, f.y, G.metQuarter, "glyph cp-tempo-note", { scale: 0.55 }); p.text(f.noteX + 1.3, f.y, `= ${f.bpm}`, "cp-tempo-num", { size: 1.05 }); }
    else p.text(f.x, f.y, f.text, "cp-form-words", { size: 1.15, anchor: "end" });
    p.end();
  }
  for (const e of L.endings) {
    p.group("cp-ending", { bar: e.bar });
    const pts = [];
    if (e.hookStart) pts.push([e.x1, e.y + 1.4]);
    pts.push([e.x1, e.y], [e.x2, e.y]);
    if (e.hookEnd) pts.push([e.x2, e.y + 1.4]);
    p.polyline(pts, "cp-ending-line");
    if (e.hookStart) p.text(e.x1 + 0.4, e.y + 1.15, `${e.n}.`, "cp-ending-num", { size: 1.0 });
    p.end();
  }
  for (const gl of L.glisses) {
    p.group("cp-gliss");
    p.line(gl.x1, gl.y1, gl.x2, gl.y2, "cp-gliss-line");
    const ang = (Math.atan2(gl.y2 - gl.y1, gl.x2 - gl.x1) * 180) / Math.PI, mx = (gl.x1 + gl.x2) / 2, my = (gl.y1 + gl.y2) / 2;
    p.text(mx, my - 0.35, "gliss.", "cp-gliss-text", { size: 1.05, anchor: "middle", rotate: [Number(ang.toFixed(1)), mx, my] });
    p.end();
  }
  for (const t of L.tuplets) {
    p.group("cp-tuplet");
    const mid = (t.x1 + t.x2) / 2, hook = t.above ? 0.8 : -0.8;
    if (t.bracket) {
      p.polyline([[t.x1, t.y + hook], [t.x1, t.y], [mid - 1.0, t.y]], "cp-tuplet-line");
      p.polyline([[mid + 1.0, t.y], [t.x2, t.y], [t.x2, t.y + hook]], "cp-tuplet-line");
    }
    p.glyph(mid, t.y + 0.55, tupletDigit(t.n), "glyph cp-tuplet-digit", { anchor: "middle", scale: 0.62 });
    p.end();
  }
}
