// Melody notation: "G4:4" = pitch:duration-in-16ths, "~" = tied to next,
// "r:4" = rest, "|" = cosmetic barline (ignored).
// Durations: 16 whole · 12 dotted half · 8 half · 6 dotted quarter · 4 quarter · 2 eighth.
export function seq(str) {
  return str.trim().split(/[\s|]+/).filter(Boolean).map((tok) => {
    const tie = tok.endsWith("~");
    const [p, d] = (tie ? tok.slice(0, -1) : tok).split(":");
    return p === "r" ? { r: true, d: Number(d) } : { p, d: Number(d), ...(tie ? { tie: true } : {}) };
  });
}
