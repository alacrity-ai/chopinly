// Waveform helpers (WSHED-75). Pure.

/** Fold a long run of level samples (0..1) into n bins: the loudest sample per bin, normalized so the loudest bin is 1. */
export function downsample(samples, n = 48) {
  const out = new Array(n).fill(0);
  if (!samples.length) return out;
  const per = samples.length / n;
  for (let i = 0; i < n; i++) {
    const from = Math.floor(i * per), to = Math.max(from + 1, Math.floor((i + 1) * per));
    let m = 0;
    for (let j = from; j < to && j < samples.length; j++) m = Math.max(m, samples[j]);
    out[i] = m;
  }
  const peak = Math.max(...out);
  return out.map((v) => Math.round((peak ? v / peak : 0) * 100) / 100);
}

/** RMS of a time-domain buffer → 0..1 (a loud room sits around 0.3). */
export function rms(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.min(1, Math.sqrt(s / buf.length) * 3);
}

/** "0:42", "1:05:09". */
export function fmtDur(ms) {
  const s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

/** Bytes → "12 MB" / "840 KB". */
export const fmtBytes = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(b >= 10485760 ? 0 : 1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`);
