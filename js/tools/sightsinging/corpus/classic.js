// The original 18 (v1 corpus), retempoed for variety — challenge-pool depth
// alongside the campaign books.
import { seq } from "./notation.js";

export const CLASSIC = [
  // --- difficulty 1: stepwise, simple rhythm, treble ------------------------
  { id: "d1-c-steps", title: "First steps", difficulty: 1, clef: "treble", key: "C", mode: "major", time: [4, 4], tempo: 92,
    notes: seq("C4:4 D4:4 E4:4 F4:4 | G4:8 E4:8 | F4:4 E4:4 D4:8 | C4:16") },
  { id: "d1-g-hill", title: "Up the hill", difficulty: 1, clef: "treble", key: "G", mode: "major", time: [4, 4], tempo: 72,
    notes: seq("G4:4 A4:4 B4:8 | A4:4 G4:4 A4:8 | B4:4 C5:4 D5:8 | C5:4 B4:4 A4:4 G4:4") },
  { id: "d1-f-sway", title: "Gentle sway", difficulty: 1, clef: "treble", key: "F", mode: "major", time: [3, 4], tempo: 104,
    notes: seq("F4:4 G4:4 A4:4 | Bb4:4 A4:4 G4:4 | A4:4 G4:4 E4:4 | F4:12") },
  { id: "d1-c-skips", title: "Little skips", difficulty: 1, clef: "treble", key: "C", mode: "major", time: [4, 4], tempo: 60,
    notes: seq("E4:8 G4:8 | C5:8 G4:8 | A4:4 G4:4 F4:4 E4:4 | D4:8 C4:8") },
  { id: "d1-g-walk", title: "Short walk", difficulty: 1, clef: "treble", key: "G", mode: "major", time: [2, 4], tempo: 116,
    notes: seq("G4:4 B4:4 | D5:8 | C5:4 A4:4 | B4:4 G4:4 | A4:4 F#4:4 | G4:8") },

  // --- difficulty 2: leaps, minor, bass, eighths, dotted quarters -----------
  { id: "d2-d-dotted", title: "Dotted lilt", difficulty: 2, clef: "treble", key: "D", mode: "major", time: [4, 4], tempo: 68,
    notes: seq("D4:6 E4:2 F#4:4 G4:4 | A4:8 F#4:4 r:4 | G4:6 F#4:2 E4:4 D4:4 | E4:8 D4:8") },
  { id: "d2-bb-turns", title: "Turning by thirds", difficulty: 2, clef: "treble", key: "Bb", mode: "major", time: [4, 4], tempo: 88,
    notes: seq("F4:4 Bb4:4 A4:2 G4:2 F4:4 | G4:4 Eb4:4 F4:8 | Bb4:4 A4:2 G4:2 F4:4 D4:4 | Eb4:4 C4:4 Bb3:8") },
  { id: "d2-am-leading", title: "Leading tone", difficulty: 2, clef: "treble", key: "A", mode: "minor", time: [4, 4], tempo: 60,
    notes: seq("A4:4 B4:4 C5:8 | E5:4 D5:4 C5:4 B4:4 | A4:4 G#4:4 A4:4 B4:4 | A4:16") },
  { id: "d2-em-bass", title: "Low lament", difficulty: 2, clef: "bass", key: "E", mode: "minor", time: [4, 4], tempo: 54,
    notes: seq("E3:4 G3:4 F#3:4 E3:4 | B3:8 r:8 | A3:4 F#3:4 D#3:4 B2:4 | E3:16") },
  { id: "d2-f-bass", title: "Grounded", difficulty: 2, clef: "bass", key: "F", mode: "major", time: [3, 4], tempo: 100,
    notes: seq("F3:4 A3:4 C4:4 | Bb3:6 A3:2 G3:4 | A3:4 F3:4 G3:4 | F3:12") },
  { id: "d2-dm-eighths", title: "Quick brook", difficulty: 2, clef: "treble", key: "D", mode: "minor", time: [2, 4], tempo: 84,
    notes: seq("D4:2 E4:2 F4:2 G4:2 | A4:4 r:4 | Bb4:2 A4:2 G4:2 F4:2 | E4:4 C#4:4 | D4:8") },
  { id: "d2-a-pairs", title: "Bright pairs", difficulty: 2, clef: "treble", key: "A", mode: "major", time: [4, 4], tempo: 108,
    notes: seq("A4:4 C#5:2 B4:2 A4:4 E4:4 | F#4:2 G#4:2 A4:4 B4:4 C#5:4 | D5:4 C#5:2 B4:2 A4:4 E5:4 | A4:16") },

  // --- difficulty 3: ties, C clefs, chromatics, denser ----------------------
  { id: "d3-c-alto", title: "Alto line", difficulty: 3, clef: "alto", key: "C", mode: "major", time: [4, 4], tempo: 80,
    notes: seq("C4:4 D4:4 E4:8~ | E4:4 F4:4 G4:8 | A4:4 G4:4 F#4:4 G4:4 | D4:8 C4:8") },
  { id: "d3-g-soprano", title: "Soprano air", difficulty: 3, clef: "soprano", key: "G", mode: "major", time: [4, 4], tempo: 64,
    notes: seq("G4:4 F#4:2 G4:2 A4:4 B4:4 | C5:12 A4:4 | B4:4 G4:4 E4:4 F#4:4 | G4:16") },
  { id: "d3-eb-tied", title: "Held breath", difficulty: 3, clef: "treble", key: "Eb", mode: "major", time: [4, 4], tempo: 92,
    notes: seq("G4:4 Ab4:4 Bb4:8~ | Bb4:4 C5:4 Bb4:4 Ab4:4 | G4:6 F4:2 Eb4:4 F4:4 | Eb4:16") },
  { id: "d3-bm-lift", title: "Night lift", difficulty: 3, clef: "treble", key: "B", mode: "minor", time: [4, 4], tempo: 58,
    notes: seq("F#4:4 B4:4 A#4:4 B4:4 | C#5:4 D5:8 B4:4 | G4:4 E4:4 F#4:8~ | F#4:4 D4:4 B3:8") },
  { id: "d3-d-bass-tie", title: "Cellar song", difficulty: 3, clef: "bass", key: "D", mode: "major", time: [3, 4], tempo: 100,
    notes: seq("D3:4 F#3:4 A3:4 | B3:6 A3:2 G3:4 | F#3:4 D3:4 E3:4~ | E3:4 F#3:2 E3:2 C#3:4 | D3:12") },
  { id: "d3-fsm-alto", title: "Old mode", difficulty: 3, clef: "alto", key: "F#", mode: "minor", time: [4, 4], tempo: 70,
    notes: seq("F#3:4 A3:4 C#4:8 | B3:4 A3:4 G#3:4 A3:4 | D4:4 C#4:4 B3:2 A3:2 G#3:4 | A3:4 E#3:4 F#3:8") },
];
