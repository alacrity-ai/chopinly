// The recorder (WSHED-75): MediaRecorder on the microphone, in whatever
// format the browser records natively (WebM/Opus on Chrome, MP4/AAC on
// iPhone). Keeps its own clock (the blob's duration metadata is unreliable),
// samples the level for a meter and for the take's waveform, and stops
// itself at the cap.
import { rms, downsample } from "./peaks.js";

const MIMES = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus", ""];
export const recordingSupported = () => typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

export function createRecorder(getAudio, { maxMs = 10 * 60 * 1000, onAutoStop = null } = {}) {
  let stream = null, rec = null, source = null, analyser = null, buf = null, meter = 0, capTimer = 0;
  let chunks = [], levels = [], state = "idle", startedAt = 0, pausedAt = 0, pausedTotal = 0, mime = "";
  let stopResolve = null;

  const elapsedMs = () => state === "idle" ? 0 : (state === "paused" ? pausedAt : Date.now()) - startedAt - pausedTotal;

  function sample() {
    if (!analyser) return;
    analyser.getFloatTimeDomainData(buf);
    const v = rms(buf);
    // a quick rise, a slower fall — reads as a meter should
    meter = v > meter ? v : meter * 0.75 + v * 0.25;
    if (state === "recording") levels.push(v);
    if (state !== "idle") { if (elapsedMs() >= maxMs) { stop().then((r) => onAutoStop?.(r)); return; } capTimer = setTimeout(sample, 50); }
  }

  async function start() {
    if (state !== "idle") return;
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const { context } = getAudio();
    source = context.createMediaStreamSource(stream);
    analyser = context.createAnalyser(); analyser.fftSize = 1024; buf = new Float32Array(1024);
    source.connect(analyser); // analysis only — never to the speakers
    mime = MIMES.find((m) => !m || MediaRecorder.isTypeSupported(m)) ?? "";
    rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 96000 } : { audioBitsPerSecond: 96000 });
    chunks = []; levels = []; pausedTotal = 0; meter = 0;
    rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    rec.onstop = () => {
      const type = rec.mimeType || mime || chunks[0]?.type || "audio/webm";
      const blob = new Blob(chunks, { type });
      const result = { blob, mime: type, durationMs: Math.max(1, elapsedMs()), peaks: downsample(levels, 48) };
      teardown();
      stopResolve?.(result); stopResolve = null;
    };
    rec.start(1000);
    startedAt = Date.now(); state = "recording";
    sample();
  }
  function pause() { if (state !== "recording") return; rec.pause(); pausedAt = Date.now(); state = "paused"; }
  function resume() { if (state !== "paused") return; pausedTotal += Date.now() - pausedAt; rec.resume(); state = "recording"; }
  /** → { blob, mime, durationMs, peaks } */
  function stop() {
    if (state === "idle" || !rec) return Promise.resolve(null);
    if (state === "paused") resume();
    const p = new Promise((r) => { stopResolve = r; });
    state = "stopping";
    rec.stop();
    return p;
  }
  function cancel() { if (rec && rec.state !== "inactive") { rec.onstop = null; rec.stop(); } teardown(); }
  function teardown() {
    clearTimeout(capTimer);
    if (stream) for (const t of stream.getTracks()) t.stop();
    source?.disconnect();
    stream = rec = source = analyser = null; state = "idle"; meter = 0;
  }

  return { start, pause, resume, stop, cancel, elapsedMs, get state() { return state; }, get level() { return meter; }, get mime() { return mime; } };
}
