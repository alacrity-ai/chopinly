// Book 1 — First Steps. Treble; C/G/F major; 4/4, 3/4, 2/4; quarters, halves,
// wholes. Stepwise motion, small skips, do-re-mi orientation. Level 1.
import { seq } from "./notation.js";

export const BOOK1 = [
  // Lesson 1 — Three notes
  { id: "b1l1a", title: "First light", difficulty: 1, clef: "treble", key: "C", mode: "major", time: [4, 4], tempo: 66,
    notes: seq("C4:4 D4:4 E4:8 | D4:4 E4:4 D4:8 | E4:4 D4:4 C4:4 D4:4 | C4:16") },
  { id: "b1l1b", title: "Come back down", difficulty: 1, clef: "treble", key: "C", mode: "major", time: [4, 4], tempo: 84,
    notes: seq("E4:4 D4:4 C4:8 | D4:8 E4:8 | C4:4 D4:4 E4:4 D4:4 | C4:8 r:8") },
  { id: "b1l1c", title: "Quick greeting", difficulty: 1, clef: "treble", key: "C", mode: "major", time: [4, 4], tempo: 100,
    notes: seq("C4:8 D4:8 | E4:8 D4:8 | C4:4 E4:4 D4:8 | C4:16") },

  // Lesson 2 — Five in a row
  { id: "b1l2a", title: "Slow climb", difficulty: 1, clef: "treble", key: "C", mode: "major", time: [3, 4], tempo: 72,
    notes: seq("C4:4 D4:4 E4:4 | F4:4 E4:4 D4:4 | E4:4 F4:4 D4:4 | C4:12") },
  { id: "b1l2b", title: "Over the fence", difficulty: 1, clef: "treble", key: "G", mode: "major", time: [4, 4], tempo: 88,
    notes: seq("G4:4 A4:4 B4:4 C5:4 | D5:8 C5:8 | B4:4 A4:4 B4:8 | A4:8 G4:8") },
  { id: "b1l2c", title: "Rolling down", difficulty: 1, clef: "treble", key: "C", mode: "major", time: [4, 4], tempo: 104,
    notes: seq("G4:4 F4:4 E4:4 D4:4 | E4:4 F4:4 G4:8 | E4:4 D4:4 C4:4 D4:4 | C4:16") },

  // Lesson 3 — Round trips
  { id: "b1l3a", title: "There and back", difficulty: 1, clef: "treble", key: "G", mode: "major", time: [2, 4], tempo: 76,
    notes: seq("G4:4 A4:4 | B4:4 A4:4 | G4:4 A4:4 | B4:8 | A4:4 B4:4 | C5:4 A4:4 | B4:4 A4:4 | G4:8") },
  { id: "b1l3b", title: "Down the stairs", difficulty: 1, clef: "treble", key: "G", mode: "major", time: [3, 4], tempo: 92,
    notes: seq("D5:4 C5:4 B4:4 | C5:4 B4:4 A4:4 | B4:4 A4:4 G4:4 | A4:4 G4:8") },
  { id: "b1l3c", title: "Skipping stone", difficulty: 1, clef: "treble", key: "G", mode: "major", time: [4, 4], tempo: 108,
    notes: seq("G4:8 B4:8 | A4:4 B4:4 C5:8 | B4:4 A4:4 G4:4 A4:4 | G4:16") },

  // Lesson 4 — Broken chords
  { id: "b1l4a", title: "Slow arpeggio", difficulty: 1, clef: "treble", key: "C", mode: "major", time: [4, 4], tempo: 63,
    notes: seq("C4:4 E4:4 G4:8 | E4:4 G4:4 E4:8 | F4:4 E4:4 D4:4 E4:4 | D4:4 C4:12") },
  { id: "b1l4b", title: "Meadow song", difficulty: 1, clef: "treble", key: "F", mode: "major", time: [3, 4], tempo: 80,
    notes: seq("F4:4 A4:4 C5:4 | A4:8 G4:4 | F4:4 G4:4 A4:4 | G4:8 F4:4") },
  { id: "b1l4c", title: "Tumbling triad", difficulty: 1, clef: "treble", key: "C", mode: "major", time: [4, 4], tempo: 96,
    notes: seq("E4:4 C4:4 G4:8 | A4:4 G4:4 E4:8 | F4:4 D4:4 E4:4 C4:4 | D4:8 C4:8") },

  // Lesson 5 — From below
  { id: "b1l5a", title: "Under and over", difficulty: 1, clef: "treble", key: "F", mode: "major", time: [4, 4], tempo: 69,
    notes: seq("F4:4 E4:4 D4:4 C4:4 | D4:4 E4:4 F4:8 | G4:4 A4:4 G4:4 E4:4 | F4:16") },
  { id: "b1l5b", title: "Doorstep", difficulty: 1, clef: "treble", key: "G", mode: "major", time: [4, 4], tempo: 86,
    notes: seq("D4:4 G4:4 F#4:4 G4:4 | A4:8 B4:8 | A4:4 G4:4 F#4:4 A4:4 | G4:16") },
  { id: "b1l5c", title: "Hop the gate", difficulty: 1, clef: "treble", key: "F", mode: "major", time: [2, 4], tempo: 100,
    notes: seq("C4:4 F4:4 | G4:4 A4:4 | Bb4:4 A4:4 | G4:8 | A4:4 G4:4 | F4:4 E4:4 | F4:8") },

  // Lesson 6 — First recital
  { id: "b1l6a", title: "Little chorale", difficulty: 1, clef: "treble", key: "C", mode: "major", time: [4, 4], tempo: 76,
    notes: seq("C4:4 D4:4 E4:4 F4:4 | G4:8 E4:4 G4:4 | A4:4 G4:4 F4:4 E4:4 | D4:8 r:4 G4:4 | E4:4 D4:4 C4:4 E4:4 | D4:8 C4:8") },
  { id: "b1l6b", title: "Evening walk", difficulty: 1, clef: "treble", key: "G", mode: "major", time: [3, 4], tempo: 90,
    notes: seq("G4:4 B4:4 D5:4 | C5:4 B4:4 A4:4 | B4:4 G4:4 A4:4 | B4:8 r:4 | C5:4 A4:4 F#4:4 | G4:4 A4:4 B4:4 | A4:4 G4:4 F#4:4 | G4:12") },
  { id: "b1l6c", title: "Festival day", difficulty: 1, clef: "treble", key: "F", mode: "major", time: [4, 4], tempo: 104,
    notes: seq("F4:8 G4:4 A4:4 | Bb4:4 A4:4 G4:8 | A4:4 Bb4:4 C5:8 | A4:4 G4:4 F4:4 r:4 | G4:4 A4:4 G4:4 E4:4 | F4:16") },
];
