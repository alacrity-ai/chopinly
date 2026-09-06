import { test } from "node:test";
import assert from "node:assert/strict";
import { createNoteTracker, freqToMidi, midiToFreq } from "../js/lib/eartraining/listen.js";

const hz = (m, cents = 0, a4 = 440) => midiToFreq(m, a4) * 2 ** (cents / 1200);
const presses = (tr, samples) => samples.map((s) => tr.feed(s).press).filter((p) => p !== null);
const voiced = (m, n, rms = 0.05, cents = 0) => Array.from({ length: n }, () => ({ freq: hz(m, cents), rms }));
const quiet = (n) => Array.from({ length: n }, () => ({ freq: -1, rms: 0 }));

test("a note presses once it is stable for two frames; a single frame is noise", () => {
  const tr = createNoteTracker();
  assert.deepEqual(presses(tr, [{ freq: hz(64), rms: 0.05 }]), []);
  assert.deepEqual(presses(tr, voiced(64, 1)), [64], "second frame presses");
  assert.deepEqual(presses(tr, voiced(64, 10)), [], "sustain never presses again");
  assert.deepEqual(presses(tr, [{ freq: hz(60), rms: 0.05 }, { freq: hz(64), rms: 0.05 }, { freq: hz(64), rms: 0.05 }]), [], "a one-frame blip to another note is ignored");
});

test("a different note presses as soon as it is stable; the same note needs silence or a re-strike", () => {
  const tr = createNoteTracker();
  assert.deepEqual(presses(tr, [...voiced(60, 3), ...voiced(64, 3)]), [60, 64]);
  // decaying sustain with a short unpitched dip: no second press
  assert.deepEqual(presses(tr, [...quiet(2), ...voiced(64, 4, 0.02)]), [], "a short dip in the sustain is not a new note");
  // real silence, then the same note again
  assert.deepEqual(presses(tr, [...quiet(4), ...voiced(64, 2)]), [64]);
  // re-strike while still sounding: rms jumps after the attack settled
  const tail = [...voiced(64, 4, 0.03), { freq: hz(64), rms: 0.03 * 3 }, { freq: hz(64), rms: 0.08 }];
  assert.deepEqual(presses(tr, tail), [64], "an RMS jump on the same note is a re-strike");
  // right after a press the attack is still rising: not a re-strike
  const tr2 = createNoteTracker();
  assert.deepEqual(presses(tr2, [{ freq: hz(67), rms: 0.01 }, { freq: hz(67), rms: 0.02 }, { freq: hz(67), rms: 0.06 }, { freq: hz(67), rms: 0.09 }]), [67], "the rising attack is one press");
});

test("wiggle room: ±49 cents rounds to the note; the tuner's A4 is honored", () => {
  const tr = createNoteTracker();
  const r = tr.feed({ freq: hz(60, 40), rms: 0.05 });
  assert.equal(r.midi, 60); assert.equal(r.cents, 40);
  assert.equal(tr.feed({ freq: hz(60, -49), rms: 0.05 }).midi, 60);
  assert.equal(tr.feed({ freq: hz(60, 51), rms: 0.05 }).midi, 61, "past the half-way point it is the next note");
  const flat = createNoteTracker({ a4: 435 });
  assert.equal(flat.feed({ freq: hz(69, 0, 435), rms: 0.05 }).midi, 69, "A on a flat piano is still A");
  assert.equal(Math.round(freqToMidi(440)), 69);
  assert.ok(Math.abs(midiToFreq(60) - 261.63) < 0.01);
});

test("reset forgets the held note so the next question can start on the same pitch", () => {
  const tr = createNoteTracker();
  assert.deepEqual(presses(tr, voiced(62, 2)), [62]);
  assert.deepEqual(presses(tr, voiced(62, 2)), []);
  tr.reset();
  assert.deepEqual(presses(tr, voiced(62, 2)), [62]);
});
