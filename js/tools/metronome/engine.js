// The clock. A coarse 25ms timer schedules every click that falls in the next
// 120ms at exact AudioContext times (the canonical lookahead scheduler), so
// timing is sample-accurate even when the main thread stutters. Scheduled
// beats also feed a queue the UI consumes to stay locked to the *audio* clock.
import { voiceById } from "./voices.js";

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12; // seconds

export class MetronomeEngine {
  /** settings is a live object: { bpm, beats, beatStates, subdivision, voice } */
  constructor(getAudio, settings) {
    this.getAudio = getAudio;
    this.settings = settings;
    this.running = false;
    this.out = null;
    this._timer = null;
    this._queue = [];   // scheduled beats: { time, beat, dur }
    this._current = null;
    this._beatsElapsed = -1;
    this._volume = 0.8;
  }

  setVolume(v) {
    this._volume = v;
    if (this.out) this.out.gain.value = v;
  }

  start() {
    if (this.running) return;
    const { context, master } = this.getAudio();
    this.context = context;
    if (!this.out) {
      this.out = context.createGain();
      this.out.connect(master);
    }
    this.out.gain.value = this._volume;
    this.running = true;
    this._queue = [];
    this._current = null;
    this._beatsElapsed = -1;
    this._beat = 0;
    this._tick = 0;
    this._nextTime = context.currentTime + 0.08;
    this._timer = setInterval(() => this._schedule(), LOOKAHEAD_MS);
    this._schedule();
  }

  stop() {
    this.running = false;
    clearInterval(this._timer);
    this._timer = null;
    this._queue = [];
    this._current = null;
  }

  /** Play one click now (voice preview) without starting the clock. */
  preview(kind = "accent") {
    const { context } = this.getAudio();
    if (!this.out) {
      this.out = context.createGain();
      this.out.connect(this.getAudio().master);
    }
    this.out.gain.value = this._volume;
    voiceById(this.settings.voice).play(context, this.out, context.currentTime + 0.01, kind);
  }

  _schedule() {
    const s = this.settings;
    while (this._nextTime < this.context.currentTime + SCHEDULE_AHEAD) {
      const beats = Math.max(1, s.beats);
      if (this._beat >= beats) this._beat = 0;
      const beatDur = 60 / s.bpm;
      const state = s.beatStates[this._beat] ?? 1; // 2 accent · 1 normal · 0 muted

      if (this._tick === 0) {
        this._queue.push({ time: this._nextTime, beat: this._beat, dur: beatDur });
        if (state === 2) this._play(this._nextTime, "accent");
        else if (state === 1) this._play(this._nextTime, "beat");
      } else if (state !== 0) {
        this._play(this._nextTime, "sub");
      }

      this._nextTime += beatDur / s.subdivision;
      this._tick += 1;
      if (this._tick >= s.subdivision) {
        this._tick = 0;
        this._beat = (this._beat + 1) % beats;
      }
    }
  }

  _play(t, kind) {
    voiceById(this.settings.voice).play(this.context, this.out, t, kind);
  }

  /** Where is the beat right now (audio-clock time)? Drives dots + pendulum. */
  pointer() {
    if (!this.running || !this.context) return { running: false, beat: 0, phase: 0, beatsElapsed: 0 };
    const now = this.context.currentTime;
    while (this._queue.length && this._queue[0].time <= now) {
      this._current = this._queue.shift();
      this._beatsElapsed += 1;
    }
    if (!this._current) return { running: true, beat: 0, phase: 0, beatsElapsed: 0 };
    const phase = Math.min((now - this._current.time) / this._current.dur, 1);
    return {
      running: true,
      beat: this._current.beat,
      phase,
      beatsElapsed: Math.max(this._beatsElapsed, 0) + phase,
    };
  }
}
