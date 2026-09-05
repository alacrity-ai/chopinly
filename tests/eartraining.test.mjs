import { test } from "node:test";
import assert from "node:assert/strict";
import { OPTIONS, LEVELS, DEFAULT_SETUP, levelOf, cleanSetup, rangeMidi, describe, shortDescribe, rng, generate, judgePress, scoreRun, starsFor, missLine, intervalName, noteName, pc, answerOctave, onAnswerKeyboard } from "../js/lib/eartraining/pitch.js";
import { createRuns } from "../js/lib/eartraining/runs.js";
import { createLogbook, BUILTIN_EARTRAINING } from "../js/lib/logbook.js";

function memStore() { const m = new Map(); return { get: (k, f) => (m.has(k) ? JSON.parse(m.get(k)) : f), set: (k, v) => m.set(k, JSON.stringify(v)) }; }

test("setup: presets, custom detection, cleaning, ranges, sentences", () => {
  assert.equal(levelOf(DEFAULT_SETUP), "beginner");
  assert.equal(levelOf(LEVELS.advanced), "advanced");
  assert.equal(levelOf({ ...LEVELS.beginner, questions: 20 }), "custom");
  assert.deepEqual(cleanSetup({ notes: "nope", range: 4, count: 1, mode: "harmonic", reference: "never", questions: 35 }), { notes: "key", range: 4, count: 1, mode: "melodic", reference: "never", questions: 35 }, "unknown → default; one note is always melodic");
  assert.deepEqual(cleanSetup(null), DEFAULT_SETUP);
  assert.deepEqual(rangeMidi(1), { from: 60, to: 72 });
  assert.deepEqual(rangeMidi(2), { from: 48, to: 72 });
  assert.deepEqual(rangeMidi(4), { from: 36, to: 84 });
  assert.deepEqual(rangeMidi(8), { from: 21, to: 108 });
  assert.equal(describe(DEFAULT_SETUP, 60), "C major, one octave around middle C, single notes, a reference before each question, 10 questions.");
  assert.equal(describe({ notes: "all", range: 8, count: 3, mode: "harmonic", reference: "never", questions: 35 }), "all twelve notes, whole piano, 3 notes together, no reference — absolute pitch, 35 questions.");
  assert.equal(shortDescribe(LEVELS.advanced), "all twelve · 2 oct · 3 in a row");
  assert.equal(shortDescribe({ ...LEVELS.beginner, reference: "never" }), "in the key · 1 oct · single · no ref");
  for (const k of Object.keys(OPTIONS)) assert.ok(OPTIONS[k].length >= 2);
});

test("generate: seeded and repeatable; beginners get C; in-key notes stay in the key; harmonic ascending + distinct", () => {
  const a = generate(DEFAULT_SETUP, 7), b = generate(DEFAULT_SETUP, 7), c = generate(DEFAULT_SETUP, 8);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.questions, c.questions);
  assert.equal(a.tonic, 60);
  assert.equal(a.key, "C major");
  assert.equal(a.questions.length, 10);
  for (const q of a.questions) { assert.equal(q.notes.length, 1); assert.ok(q.notes[0] >= 60 && q.notes[0] <= 72); assert.ok([0, 2, 4, 5, 7, 9, 11].includes(q.notes[0] % 12)); }
  const h = generate({ notes: "all", range: 2, count: 4, mode: "harmonic", reference: "each", questions: 20 }, 3);
  assert.equal(h.key, null);
  for (const q of h.questions) { assert.equal(q.notes.length, 4); assert.equal(new Set(q.notes).size, 4); assert.deepEqual([...q.notes].sort((x, y) => x - y), q.notes); }
  const adv = generate(LEVELS.advanced, 11);
  assert.ok(adv.tonic >= 48 && adv.tonic <= 72 && [0, 2, 4, 5, 7, 9, 11].includes(adv.tonic % 12), "a white-key tonic in the middle octave");
  const r = rng(5); const x = r(); assert.ok(x >= 0 && x < 1 && rng(5)() === x);
  assert.equal(noteName(61), "C♯4");
});

test("judging: melodic in order, harmonic any order; scoring, stars, misses", () => {
  const q = { notes: [60, 64, 67] };
  assert.deepEqual(judgePress(q, [], 60, "melodic"), { correct: true, expected: 60 });
  assert.deepEqual(judgePress(q, [], 72, "melodic"), { correct: true, expected: 60 }, "any octave counts");
  assert.deepEqual(judgePress(q, [60], 76, "melodic"), { correct: true, expected: 64 });
  assert.deepEqual(judgePress(q, [], 55, "harmonic"), { correct: true, expected: 67 }, "harmonic: a G in any octave hits the G");
  assert.deepEqual(answerOctave(67), { from: 60, to: 72 });
  assert.deepEqual(answerOctave(48), { from: 48, to: 60 });
  assert.equal(onAnswerKeyboard(79, 60), 67);
  assert.equal(onAnswerKeyboard(48, 60), 60);
  assert.equal(pc(-1), 11);
  assert.deepEqual(judgePress(q, [60], 67, "melodic"), { correct: false, expected: 64 });
  assert.deepEqual(judgePress(q, [], 67, "harmonic"), { correct: true, expected: 67 });
  assert.deepEqual(judgePress(q, [67], 67, "harmonic"), { correct: false, expected: 64 }, "a repeat is not a hit; nearest unhit note is the expected");
  assert.deepEqual(judgePress(q, [67, 64], 61, "harmonic"), { correct: false, expected: 60 });
  const s = scoreRun([{ notes: [60], hits: 1 }, { notes: [60, 64], hits: 1 }, { notes: [67], hits: 0 }]);
  assert.deepEqual(s, { points: 2, max: 4, pct: 50, right: 1 });
  assert.deepEqual([100, 90, 89, 70, 50, 49].map(starsFor), [3, 3, 2, 2, 1, 0]);
  assert.equal(intervalName(7), "fifth");
  assert.equal(intervalName(9), "major sixth");
  assert.equal(intervalName(12), "octave");
  assert.equal(missLine([], 60), "");
  assert.equal(missLine([{ expected: 67, heard: 65 }], 60), "one slip: you heard the fifth as a fourth");
  assert.equal(missLine([{ expected: 69, heard: 67 }, { expected: 69, heard: 67 }, { expected: 69, heard: 67 }, { expected: 64, heard: 65 }], 60), "you heard the major sixth as a fifth 3 times");
  assert.equal(missLine([{ expected: 67, heard: 79 }], 60), "one slip: the right interval in the wrong octave");
});

test("runs store + logbook attribution on the Ear training built-in", () => {
  const runs = createRuns(memStore());
  runs.add({ exercise: "pitch", setup: DEFAULT_SETUP, pct: 90, points: 9, max: 10, stars: 3 });
  runs.add({ exercise: "pitch", setup: DEFAULT_SETUP, pct: 60, points: 6, max: 10, stars: 1 });
  assert.equal(runs.list().length, 2);
  assert.equal(runs.lastFor("pitch").pct, 60, "newest first");
  assert.equal(runs.lastFor("intervals"), null);
  let t = new Date(2026, 8, 4, 12).getTime();
  const lb = createLogbook({ store: memStore(), now: () => t });
  const r = lb.addAuto({ source: "eartraining", label: "Ear training · pitch · 90%", startedAt: t - 60000, builtin: { id: BUILTIN_EARTRAINING, name: "Ear training" } });
  assert.equal(r.kind, "segment");
  assert.equal(lb.goal(BUILTIN_EARTRAINING).name, "Ear training");
  assert.equal(lb.goal(BUILTIN_EARTRAINING).kind, "builtin");
  assert.equal(lb.addAuto({ source: "sightsinging", label: "x", startedAt: t - 1000 }).segment.goalId, "sightsinging", "the default is still Sight singing");
  const g = lb.addGoal({ name: "Waltz" }); lb.start(g.id); t += 1000;
  assert.equal(lb.addAuto({ source: "eartraining", label: "note instead", startedAt: t - 500, builtin: { id: BUILTIN_EARTRAINING, name: "Ear training" } }).kind, "note", "a running goal takes the note");
});
