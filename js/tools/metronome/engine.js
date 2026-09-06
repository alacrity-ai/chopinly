// The clock (WSHED-85). One bar of clicks is rendered offline with the voice
// synths and looped on an AudioBufferSourceNode, so the audio thread keeps
// time with no JS timer involved — the beat survives a locked screen and a
// throttled tab. Setting changes re-render the bar and swap sources on the
// next beat boundary, sample-accurately. The output runs through a media
// element so the platform treats it as playback (like a music app) and keeps
// the audio alive while locked; Media Session gives lock-screen play/pause.
// pointer() derives dots + pendulum from the audio clock and the loop anchor.
import { voiceById } from "./voices.js";
import { barPlan, fold, signature, nextBeatBoundary, swapOffset, pointerAt, TAIL_S } from "./bar.js";

const SWAP_MARGIN_S = 0.06;   // a swap is scheduled at least this far ahead of the audio clock
const FIRST_CLICK_S = 0.05;   // start latency: the first bar begins this soon after start()
const WATCH_MS = 100;         // settings poll while running (pointer() also checks every frame)

export class MetronomeEngine {
  /** settings is a live object: { bpm, beats, beatStates, subdivision, voice } */
  constructor(getAudio, settings) {
    this.getAudio = getAudio;
    this.settings = settings;
    this.running = false;
    this.out = null;
    this.onchange = null;     // (running) → the UI mirrors lock-screen play/pause
    this._volume = 0.8;
    this._anchors = [];       // loops in force or scheduled: { time, beat, beats, beatDur, elapsed, src }
    this._sig = null;
    this._gen = 0;
    this._rendering = false;
    this._dirty = false;
    this._watch = null;
    this._sink = null;        // MediaStreamAudioDestinationNode
    this._el = null;          // the hidden <audio> the sink plays through
    this._sinkTried = false;
  }

  setVolume(v) {
    this._volume = v;
    if (this.out) this.out.gain.value = v;
  }

  _ensureOut() {
    const { context, master } = this.getAudio();
    this.context = context;
    if (!this.out) {
      this.out = context.createGain();
      this.out.connect(master);
    }
    this.out.gain.cancelScheduledValues(0);
    this.out.gain.value = this._volume;
  }

  start() {
    if (this.running) return;
    this._ensureOut();
    this.running = true;
    this._anchors = [];
    this._sig = null;
    this._keepAlive();
    this._apply();
    clearInterval(this._watch);
    this._watch = setInterval(() => this._check(), WATCH_MS);
    this._session(true);
    this.onchange?.(true);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    clearInterval(this._watch);
    this._watch = null;
    this._gen++; // a render in flight lands on the floor
    // a loop already given a future stop() at a swap can't be re-stopped: mute instead
    if (this.out) this.out.gain.setValueAtTime(0, this.context.currentTime);
    for (const a of this._anchors) { try { a.src.stop(); } catch { /* stop was already scheduled at a swap */ } }
    this._anchors = [];
    this._el?.pause();
    this._session(false);
    this.onchange?.(false);
  }

  /** Play one click now (voice preview) without starting the clock. */
  preview(kind = "accent") {
    this._ensureOut();
    voiceById(this.settings.voice).play(this.context, this.out, this.context.currentTime + 0.01, kind);
  }

  // --- the loop ---------------------------------------------------------------
  _check() {
    if (!this.running) return;
    if (this._rendering) { if (signature(this.settings) !== this._sig) this._dirty = true; return; }
    if (signature(this.settings) !== this._sig) this._apply();
  }

  async _apply() {
    const context = this.context;
    const sig = signature(this.settings);
    this._sig = sig;
    this._rendering = true;
    this._dirty = false;
    const gen = ++this._gen;
    const plan = barPlan(this.settings, context.sampleRate);
    let buffer;
    try { buffer = await renderBar(plan, this.settings.voice, context); }
    catch (e) { this._rendering = false; console.warn("metronome: bar render failed", e); return; }
    this._rendering = false;
    if (!this.running || gen !== this._gen) return;
    this._swap(plan, buffer);
    this._meta();
    if (this._dirty) this._check();
  }

  /** Start looping `buffer` at the next beat boundary (now + margin on a cold start), stopping the loop before it there. */
  _swap(plan, buffer) {
    const context = this.context;
    const now = context.currentTime;
    const last = this._anchors[this._anchors.length - 1] ?? null;
    let at;
    if (!last) at = { time: now + FIRST_CLICK_S, beat: 0, elapsed: 0 };
    else at = nextBeatBoundary(last, Math.max(now + SWAP_MARGIN_S, last.time));
    const beat = at.beat % plan.beats;
    const src = context.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(this.out);
    src.start(at.time, swapOffset(plan, at.beat));
    if (last) { try { last.src.stop(at.time); } catch { /* fine */ } }
    this._anchors.push({ time: at.time, beat, beats: plan.beats, beatDur: plan.beatDur, elapsed: at.elapsed, src });
  }

  /** The anchor in force at audio time `now` (drops the ones already superseded). */
  _current(now) {
    let i = 0;
    while (i + 1 < this._anchors.length && this._anchors[i + 1].time <= now) i++;
    if (i > 0) this._anchors.splice(0, i);
    return this._anchors[0] ?? null;
  }

  /** Where is the beat right now (audio-clock time)? Drives dots + pendulum. */
  pointer() {
    if (!this.running || !this.context) return { running: false, beat: 0, phase: 0, beatsElapsed: 0 };
    this._check();
    const now = this.context.currentTime;
    const a = this._current(now);
    if (!a || now < a.time) return { running: true, beat: a?.beat ?? 0, phase: 0, beatsElapsed: a?.elapsed ?? 0 };
    return { running: true, ...pointerAt(a, now) };
  }

  // --- staying alive behind a locked screen ---------------------------------------
  /**
   * Route the clicks through a MediaStream into a hidden playing <audio>: the
   * platform then treats the page as playing media and keeps the audio going
   * while the screen is locked. Falls back to the direct path if it can't.
   */
  _keepAlive() {
    const context = this.context;
    if (this._el) { this._el.play().catch(() => {}); return; }
    if (this._sinkTried || typeof context.createMediaStreamDestination !== "function" || typeof document === "undefined") return;
    this._sinkTried = true;
    try {
      const sink = context.createMediaStreamDestination();
      const el = document.createElement("audio");
      el.setAttribute("playsinline", "");
      el.playsInline = true;
      el.autoplay = true;
      el.hidden = true;
      el.dataset.role = "metronome-sink";
      el.srcObject = sink.stream;
      document.body.appendChild(el);
      const p = el.play();
      const reroute = () => { if (!this._el) { this._sink = sink; this._el = el; this.out.disconnect(); this.out.connect(sink); } };
      if (p && typeof p.then === "function") p.then(reroute).catch(() => { el.remove(); });
      else reroute();
    } catch { /* direct path */ }
  }

  /** Lock-screen metadata + play/pause; the page's audio session as playback (Safari). */
  _session(on) {
    try { if (navigator.audioSession) navigator.audioSession.type = on ? "playback" : "auto"; } catch { /* optional */ }
    const ms = navigator.mediaSession;
    if (!ms) return;
    try {
      ms.playbackState = on ? "playing" : "paused";
      if (on) {
        ms.setActionHandler("play", () => this.start());
        ms.setActionHandler("pause", () => this.stop());
        ms.setActionHandler("stop", () => this.stop());
        this._meta();
      }
    } catch { /* optional */ }
  }

  _meta() {
    const ms = navigator.mediaSession;
    if (!ms || typeof MediaMetadata === "undefined" || !this.running) return;
    try {
      ms.metadata = new MediaMetadata({
        title: `Metronome · ${this.settings.bpm} bpm`,
        artist: "Chopinly",
        artwork: [{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }],
      });
    } catch { /* optional */ }
  }
}

/** One bar of clicks as an AudioBuffer of exactly plan.barSamples, tail folded onto the start. */
export async function renderBar(plan, voiceId, context) {
  const sr = context.sampleRate;
  const Off = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const off = new Off(1, plan.barSamples + Math.ceil(TAIL_S * sr), sr);
  const voice = voiceById(voiceId);
  for (const c of plan.clicks) voice.play(off, off.destination, c.t, c.kind);
  const rendered = await new Promise((res, rej) => {
    off.oncomplete = (e) => res(e.renderedBuffer); // old WebKit signals completion this way
    const p = off.startRendering();
    if (p && typeof p.then === "function") p.then(res, rej);
  });
  const data = fold(rendered.getChannelData(0), plan.barSamples);
  const buf = context.createBuffer(1, plan.barSamples, sr);
  buf.copyToChannel(data, 0);
  return buf;
}
