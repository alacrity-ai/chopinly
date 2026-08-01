// Book 5 — C Clefs & Color. Alto and soprano clefs, chromatic neighbors,
// sixth leaps, the densest rhythm of the set. Level 3.
import { seq } from "./notation.js";

export const BOOK5 = [
  // Lesson 1 — Alto opens
  { id: "b5l1a", title: "Viola voice", difficulty: 3, clef: "alto", key: "C", mode: "major", time: [4, 4], tempo: 68,
    notes: seq("C4:4 B3:4 A3:8 | G3:4 A3:4 B3:8~ | B3:4 C4:4 D4:4 E4:4 | D4:8 C4:8") },
  { id: "b5l1b", title: "Middle ground", difficulty: 3, clef: "alto", key: "G", mode: "major", time: [3, 4], tempo: 86,
    notes: seq("G3:4 A3:4 B3:4 | C4:6 B3:2 A3:4 | B3:4 D4:4 G4:4 | F#4:2 E4:2 D4:4 C4:4 | A3:4 G3:8") },
  { id: "b5l1c", title: "Inner line", difficulty: 3, clef: "alto", key: "C", mode: "major", time: [4, 4], tempo: 104,
    notes: seq("G3:4 C4:4 B3:2 A3:2 G3:4 | A3:4 C4:4 E4:8 | D4:2 C4:2 B3:4 A3:4 F3:4 | G3:8 C4:8") },

  // Lesson 2 — Soprano light
  { id: "b5l2a", title: "High parlor", difficulty: 3, clef: "soprano", key: "C", mode: "major", time: [4, 4], tempo: 66,
    notes: seq("C4:4 D4:4 E4:8~ | E4:4 F4:4 G4:8 | A4:4 G4:2 F4:2 E4:4 D4:4 | C4:16") },
  { id: "b5l2b", title: "Lace curtain", difficulty: 3, clef: "soprano", key: "F", mode: "major", time: [3, 4], tempo: 84,
    notes: seq("F4:4 G4:4 A4:4 | Bb4:6 A4:2 G4:4 | A4:4 F4:4 G4:4~ | G4:4 E4:4 F4:4") },
  { id: "b5l2c", title: "Attic window", difficulty: 3, clef: "soprano", key: "G", mode: "major", time: [2, 4], tempo: 100,
    notes: seq("G4:2 A4:2 B4:4 | A4:2 B4:2 C5:4 | D5:4 B4:4 | C5:2 B4:2 A4:2 G4:2 | A4:4 F#4:4 | G4:8") },

  // Lesson 3 — Chromatic neighbors
  { id: "b5l3a", title: "Borrowed color", difficulty: 3, clef: "treble", key: "C", mode: "major", time: [4, 4], tempo: 62,
    notes: seq("C4:4 D4:4 E4:4 F4:4 | F#4:4 G4:8 E4:4 | F4:4 E4:4 D#4:4 E4:4 | D4:8 C4:8") },
  { id: "b5l3b", title: "Passing shade", difficulty: 3, clef: "treble", key: "G", mode: "major", time: [3, 4], tempo: 82,
    notes: seq("G4:4 A4:4 A#4:4 | B4:8 G4:4 | E4:4 F#4:4 G4:4 | A4:4 D4:4 F#4:4 | G4:12") },
  { id: "b5l3c", title: "Chromatic chase", difficulty: 3, clef: "treble", key: "D", mode: "major", time: [4, 4], tempo: 98,
    notes: seq("D4:4 E4:4 F#4:2 G4:2 G#4:4 | A4:8 F#4:4 D4:4 | B4:4 A#4:4 B4:4 C#5:4 | D5:4 A4:4 E4:4 D4:4") },

  // Lesson 4 — Minor alto
  { id: "b5l4a", title: "Dusk in the middle", difficulty: 3, clef: "alto", key: "A", mode: "minor", time: [4, 4], tempo: 60,
    notes: seq("A3:4 B3:4 C4:8~ | C4:4 D4:4 E4:8 | F4:4 E4:4 D4:4 C4:4 | B3:4 G#3:4 A3:8") },
  { id: "b5l4b", title: "Candle waltz", difficulty: 3, clef: "alto", key: "D", mode: "minor", time: [3, 4], tempo: 76,
    notes: seq("D4:4 C#4:4 D4:4 | E4:4 F4:8 | G4:4 E4:4 C#4:4 | D4:12") },
  { id: "b5l4c", title: "Ember dance", difficulty: 3, clef: "alto", key: "A", mode: "minor", time: [2, 4], tempo: 92,
    notes: seq("A3:2 B3:2 C4:4 | B3:2 C4:2 D4:4 | E4:4 C4:4 | D4:2 C4:2 B3:2 A3:2 | B3:4 G#3:4 | A3:8") },

  // Lesson 5 — Wide leaps
  { id: "b5l5a", title: "Over the rooftop", difficulty: 3, clef: "treble", key: "F", mode: "major", time: [4, 4], tempo: 64,
    notes: seq("F4:4 D5:4 C5:8 | Bb4:4 A4:4 G4:8 | F4:4 D4:4 Bb4:4 A4:4 | G4:8 F4:8") },
  { id: "b5l5b", title: "Swallow flight", difficulty: 3, clef: "soprano", key: "G", mode: "major", time: [3, 4], tempo: 88,
    notes: seq("D4:4 B4:4 A4:4 | G4:4 E4:4 C5:4 | B4:4 A4:4 G4:4 | A4:8 G4:4") },
  { id: "b5l5c", title: "Sixth sense", difficulty: 3, clef: "treble", key: "C", mode: "major", time: [2, 4], tempo: 112,
    notes: seq("C4:4 A4:4 | G4:2 F4:2 E4:4 | G4:4 E5:4 | D5:2 C5:2 B4:4 | A4:4 G4:4 | E4:4 D4:4 | C4:8") },

  // Lesson 6 — Grand recital
  { id: "b5l6a", title: "The inner courtyard", difficulty: 3, clef: "alto", key: "E", mode: "minor", time: [4, 4], tempo: 72,
    notes: seq("E3:4 G3:4 B3:8~ | B3:4 C4:4 B3:4 A3:4 | G3:4 F#3:4 E3:4 G3:4 | A#3:4 B3:8 G3:4 | E3:4 F#3:2 G3:2 A3:4 F#3:4 | E3:16") },
  { id: "b5l6b", title: "Two sharps, two phrases", difficulty: 3, clef: "treble", key: "B", mode: "minor", time: [4, 4], tempo: 84,
    notes: seq("B3:4 C#4:4 D4:8~ | D4:4 E4:4 F#4:8 | G4:4 F#4:4 E4:4 D4:4 | C#4:4 A#3:4 B3:8 | D4:4 F#4:4 B4:4 A#4:4 | B4:16") },
  { id: "b5l6c", title: "Steeplechase", difficulty: 3, clef: "soprano", key: "G", mode: "major", time: [4, 4], tempo: 126,
    notes: seq("G4:4 B4:4 D5:8 | C5:4 A4:4 B4:2 C5:2 D5:4 | E5:4 D5:4 C5:4 B4:4 | A4:4 C5:4 F#4:4 A4:4 | G4:4 B4:4 A4:2 G4:2 F#4:4 | G4:16") },
];
