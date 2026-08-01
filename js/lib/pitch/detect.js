// Pure pitch math — no DOM, no audio nodes, so it's unit-testable in node.

/**
 * Autocorrelation pitch detector (ACF2+ style) with parabolic interpolation.
 * buf: Float32Array of time-domain samples. Returns frequency in Hz, or -1
 * when the signal is too quiet or unpitched.
 */
export function autoCorrelate(buf, sampleRate) {
  let size = buf.length;

  let rms = 0;
  for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / size);
  if (rms < 0.01) return -1; // silence gate

  // Trim leading/trailing low-energy edges — sharpens the correlation peak.
  const thres = 0.2;
  let r1 = 0, r2 = size - 1;
  for (let i = 0; i < size / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
  for (let i = 1; i < size / 2; i++) if (Math.abs(buf[size - i]) < thres) { r2 = size - i; break; }
  buf = buf.slice(r1, r2);
  size = buf.length;

  const c = new Float32Array(size);
  for (let lag = 0; lag < size; lag++) {
    let sum = 0;
    for (let i = 0; i < size - lag; i++) sum += buf[i] * buf[i + lag];
    c[lag] = sum;
  }

  // Walk past the zero-lag peak, then take the global max after it.
  let d = 0;
  while (d + 1 < size && c[d] > c[d + 1]) d++;
  let maxval = -1, maxpos = -1;
  for (let i = d; i < size; i++) {
    if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
  }
  if (maxpos <= 0) return -1;

  // Parabolic interpolation around the peak for sub-sample precision.
  let T0 = maxpos;
  const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
  if (x1 !== undefined && x3 !== undefined) {
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);
  }
  return sampleRate / T0;
}

/** Nearest equal-tempered note for a frequency: midi number + cents offset. */
export function noteFromFreq(freq, a4 = 440) {
  const midi = Math.round(12 * Math.log2(freq / a4)) + 69;
  const ideal = a4 * Math.pow(2, (midi - 69) / 12);
  const cents = Math.max(-50, Math.min(50, 1200 * Math.log2(freq / ideal)));
  return { midi, cents };
}
