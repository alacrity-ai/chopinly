// The sight-singing corpus + melody utilities.
// Notation: "G4:4" = pitch:duration-in-16ths, "~" = tied to next, "r:4" = rest.
// Durations: 16 whole · 12 dotted half · 8 half · 6 dotted quarter · 4 quarter · 2 eighth.
import { parsePitch } from "../../lib/music.js";
import { toMeasures } from "../../lib/staff/layout.js";

function seq(str) {
  return str.trim().split(/[\s|]+/).filter(Boolean).map((tok) => {
    const tie = tok.endsWith("~");
    const [p, d] = (tie ? tok.slice(0, -1) : tok).split(":");
    return p === "r" ? { r: true, d: Number(d) } : { p, d: Number(d), ...(tie ? { tie: true } : {}) };
  });
}

export const MELODIES = [
  // --- difficulty 1: stepwise, simple rhythm, treble ------------------------
  { id: "d1-c-steps", title: "First steps", difficulty: 1, clef: "treble", key: "C", mode: "major", time: [4, 4], tempo: 84,
    notes: seq("C4:4 D4:4 E4:4 F4:4 | G4:8 E4:8 | F4:4 E4:4 D4:8 | C4:16") },
  { id: "d1-g-hill", title: "Up the hill", difficulty: 1, clef: "treble", key: "G", mode: "major", time: [4, 4], tempo: 84,
    notes: seq("G4:4 A4:4 B4:8 | A4:4 G4:4 A4:8 | B4:4 C5:4 D5:8 | C5:4 B4:4 A4:4 G4:4") },
  { id: "d1-f-sway", title: "Gentle sway", difficulty: 1, clef: "treble", key: "F", mode: "major", time: [3, 4], tempo: 88,
    notes: seq("F4:4 G4:4 A4:4 | Bb4:4 A4:4 G4:4 | A4:4 G4:4 E4:4 | F4:12") },
  { id: "d1-c-skips", title: "Little skips", difficulty: 1, clef: "treble", key: "C", mode: "major", time: [4, 4], tempo: 80,
    notes: seq("E4:8 G4:8 | C5:8 G4:8 | A4:4 G4:4 F4:4 E4:4 | D4:8 C4:8") },
  { id: "d1-g-walk", title: "Short walk", difficulty: 1, clef: "treble", key: "G", mode: "major", time: [2, 4], tempo: 84,
    notes: seq("G4:4 B4:4 | D5:8 | C5:4 A4:4 | B4:4 G4:4 | A4:4 F#4:4 | G4:8") },

  // --- difficulty 2: leaps, minor, bass, eighths, dotted quarters -----------
  { id: "d2-d-dotted", title: "Dotted lilt", difficulty: 2, clef: "treble", key: "D", mode: "major", time: [4, 4], tempo: 80,
    notes: seq("D4:6 E4:2 F#4:4 G4:4 | A4:8 F#4:4 r:4 | G4:6 F#4:2 E4:4 D4:4 | E4:8 D4:8") },
  { id: "d2-bb-turns", title: "Turning by thirds", difficulty: 2, clef: "treble", key: "Bb", mode: "major", time: [4, 4], tempo: 78,
    notes: seq("F4:4 Bb4:4 A4:2 G4:2 F4:4 | G4:4 Eb4:4 F4:8 | Bb4:4 A4:2 G4:2 F4:4 D4:4 | Eb4:4 C4:4 Bb3:8") },
  { id: "d2-am-leading", title: "Leading tone", difficulty: 2, clef: "treble", key: "A", mode: "minor", time: [4, 4], tempo: 76,
    notes: seq("A4:4 B4:4 C5:8 | E5:4 D5:4 C5:4 B4:4 | A4:4 G#4:4 A4:4 B4:4 | A4:16") },
  { id: "d2-em-bass", title: "Low lament", difficulty: 2, clef: "bass", key: "E", mode: "minor", time: [4, 4], tempo: 76,
    notes: seq("E3:4 G3:4 F#3:4 E3:4 | B3:8 r:8 | A3:4 F#3:4 D#3:4 B2:4 | E3:16") },
  { id: "d2-f-bass", title: "Grounded", difficulty: 2, clef: "bass", key: "F", mode: "major", time: [3, 4], tempo: 82,
    notes: seq("F3:4 A3:4 C4:4 | Bb3:6 A3:2 G3:4 | A3:4 F3:4 G3:4 | F3:12") },
  { id: "d2-dm-eighths", title: "Quick brook", difficulty: 2, clef: "treble", key: "D", mode: "minor", time: [2, 4], tempo: 76,
    notes: seq("D4:2 E4:2 F4:2 G4:2 | A4:4 r:4 | Bb4:2 A4:2 G4:2 F4:2 | E4:4 C#4:4 | D4:8") },
  { id: "d2-a-pairs", title: "Bright pairs", difficulty: 2, clef: "treble", key: "A", mode: "major", time: [4, 4], tempo: 80,
    notes: seq("A4:4 C#5:2 B4:2 A4:4 E4:4 | F#4:2 G#4:2 A4:4 B4:4 C#5:4 | D5:4 C#5:2 B4:2 A4:4 E5:4 | A4:16") },

  // --- difficulty 3: ties, C clefs, chromatics, denser ----------------------
  { id: "d3-c-alto", title: "Alto line", difficulty: 3, clef: "alto", key: "C", mode: "major", time: [4, 4], tempo: 76,
    notes: seq("C4:4 D4:4 E4:8~ | E4:4 F4:4 G4:8 | A4:4 G4:4 F#4:4 G4:4 | D4:8 C4:8") },
  { id: "d3-g-soprano", title: "Soprano air", difficulty: 3, clef: "soprano", key: "G", mode: "major", time: [4, 4], tempo: 72,
    notes: seq("G4:4 F#4:2 G4:2 A4:4 B4:4 | C5:12 A4:4 | B4:4 G4:4 E4:4 F#4:4 | G4:16") },
  { id: "d3-eb-tied", title: "Held breath", difficulty: 3, clef: "treble", key: "Eb", mode: "major", time: [4, 4], tempo: 72,
    notes: seq("G4:4 Ab4:4 Bb4:8~ | Bb4:4 C5:4 Bb4:4 Ab4:4 | G4:6 F4:2 Eb4:4 F4:4 | Eb4:16") },
  { id: "d3-bm-lift", title: "Night lift", difficulty: 3, clef: "treble", key: "B", mode: "minor", time: [4, 4], tempo: 72,
    notes: seq("F#4:4 B4:4 A#4:4 B4:4 | C#5:4 D5:8 B4:4 | G4:4 E4:4 F#4:8~ | F#4:4 D4:4 B3:8") },
  { id: "d3-d-bass-tie", title: "Cellar song", difficulty: 3, clef: "bass", key: "D", mode: "major", time: [3, 4], tempo: 76,
    notes: seq("D3:4 F#3:4 A3:4 | B3:6 A3:2 G3:4 | F#3:4 D3:4 E3:4~ | E3:4 F#3:2 E3:2 C#3:4 | D3:12") },
  { id: "d3-fsm-alto", title: "Old mode", difficulty: 3, clef: "alto", key: "F#", mode: "minor", time: [4, 4], tempo: 69,
    notes: seq("F#3:4 A3:4 C#4:8 | B3:4 A3:4 G#3:4 A3:4 | D4:4 C#4:4 B3:2 A3:2 G#3:4 | A3:4 E#3:4 F#3:8") },
];

const CLEF_RANGE = { treble: [-4, 12], soprano: [-4, 12], alto: [-4, 12], bass: [-4, 12] };

/** Throws if any melody is malformed. Returns the corpus. */
export function validateCorpus(list = MELODIES) {
  const ids = new Set();
  for (const m of list) {
    if (ids.has(m.id)) throw new Error(`duplicate id ${m.id}`);
    ids.add(m.id);
    toMeasures(m); // exact measure fill + duration vocabulary
    m.notes.forEach((n, i) => {
      if (n.r) { if (n.tie) throw new Error(`${m.id}: rest ${i} cannot tie`); return; }
      const p = parsePitch(n.p);
      const bottom = { treble: "E4", soprano: "C4", alto: "F3", bass: "G2" }[m.clef];
      const step = p.diatonic - parsePitch(bottom).diatonic;
      const [lo, hi] = CLEF_RANGE[m.clef];
      if (step < lo || step > hi) throw new Error(`${m.id}: note ${i} (${n.p}) outside staff range`);
      if (n.tie) {
        const next = m.notes[i + 1];
        if (!next || next.r || next.p !== n.p) throw new Error(`${m.id}: tie at ${i} must join the same pitch`);
      }
    });
    const last = [...m.notes].reverse().find((n) => !n.r);
    if (!last.p.startsWith(m.key[0])) throw new Error(`${m.id}: should end on the tonic`);
  }
  return list;
}

/**
 * Sung units: ties merged, rests dropped. Times in seconds at the given tempo
 * (quarter = beat). Each unit lists the drawn-note indices it grades.
 */
export function toTimeline(melody, tempo = melody.tempo) {
  const secPerUnit = 60 / tempo / 4;
  const units = [];
  let t = 0;
  for (let i = 0; i < melody.notes.length; i++) {
    const n = melody.notes[i];
    const dur = n.d * secPerUnit;
    if (n.r) { t += dur; continue; }
    const prev = melody.notes[i - 1];
    if (prev && prev.tie && !prev.r && prev.p === n.p && units.length) {
      const u = units[units.length - 1];
      u.t1 += dur;
      u.drawn.push(i);
    } else {
      units.push({ t0: t, t1: t + dur, midi: parsePitch(n.p).midi, drawn: [i] });
    }
    t += dur;
  }
  return { units, total: t, secPerBeat: 60 / tempo };
}

/** Deal a random melody at a difficulty (0 = any), never repeating `lastId`. */
export function deal(difficulty = 0, lastId = null) {
  const pool = MELODIES.filter((m) => (!difficulty || m.difficulty === difficulty) && m.id !== lastId);
  return pool[Math.floor(Math.random() * pool.length)] ?? MELODIES[0];
}
