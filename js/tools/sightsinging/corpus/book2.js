// Book 2 — Leaps & Eighths. Treble; adds D/B♭/A major; 2/4 enters; eighth
// pairs and dotted quarters; triad leaps to a 5th. Level 1.
import { seq } from "./notation.js";

export const BOOK2 = [
  // Lesson 1 — Eighth pairs
  { id: "b2l1a", title: "Paired steps", difficulty: 1, clef: "treble", key: "C", mode: "major", time: [4, 4], tempo: 72,
    notes: seq("C4:2 D4:2 E4:4 F4:2 G4:2 A4:4 | G4:4 E4:4 F4:2 E4:2 D4:4 | E4:2 D4:2 C4:4 D4:8 | C4:16") },
  { id: "b2l1b", title: "Skipping rope", difficulty: 1, clef: "treble", key: "G", mode: "major", time: [2, 4], tempo: 88,
    notes: seq("G4:2 A4:2 B4:4 | A4:2 B4:2 C5:4 | D5:4 B4:4 | C5:2 B4:2 A4:4 | G4:4 A4:4 | G4:8") },
  { id: "b2l1c", title: "Brisk morning", difficulty: 1, clef: "treble", key: "C", mode: "major", time: [4, 4], tempo: 108,
    notes: seq("E4:4 G4:2 F4:2 E4:4 D4:4 | C4:4 E4:4 G4:8 | A4:2 G4:2 F4:4 E4:2 D4:2 E4:4 | D4:4 C4:12") },

  // Lesson 2 — The dotted door
  { id: "b2l2a", title: "Patient knock", difficulty: 1, clef: "treble", key: "D", mode: "major", time: [4, 4], tempo: 66,
    notes: seq("D4:6 E4:2 F#4:4 G4:4 | A4:6 G4:2 F#4:4 D4:4 | E4:6 F#4:2 G4:4 E4:4 | D4:16") },
  { id: "b2l2b", title: "Waltz lesson", difficulty: 1, clef: "treble", key: "D", mode: "major", time: [3, 4], tempo: 84,
    notes: seq("D4:6 E4:2 F#4:4 | G4:6 F#4:2 E4:4 | F#4:4 A4:4 E4:4 | D4:12") },
  { id: "b2l2c", title: "Through the door", difficulty: 1, clef: "treble", key: "D", mode: "major", time: [4, 4], tempo: 100,
    notes: seq("A4:6 B4:2 A4:4 F#4:4 | G4:4 E4:4 F#4:6 D4:2 | E4:4 F#4:2 G4:2 A4:4 F#4:4 | E4:8 D4:8") },

  // Lesson 3 — The flat side
  { id: "b2l3a", title: "Soft ground", difficulty: 1, clef: "treble", key: "Bb", mode: "major", time: [4, 4], tempo: 63,
    notes: seq("Bb3:4 C4:4 D4:8 | Eb4:4 D4:4 C4:8 | D4:4 Eb4:4 F4:4 D4:4 | C4:8 Bb3:8") },
  { id: "b2l3b", title: "Orchard rows", difficulty: 1, clef: "treble", key: "Bb", mode: "major", time: [2, 4], tempo: 80,
    notes: seq("F4:4 Bb4:4 | A4:2 G4:2 F4:4 | G4:4 Eb4:4 | F4:2 Eb4:2 D4:4 | Eb4:4 C4:4 | Bb3:8") },
  { id: "b2l3c", title: "Harvest spin", difficulty: 1, clef: "treble", key: "Bb", mode: "major", time: [3, 4], tempo: 96,
    notes: seq("D4:4 F4:4 Bb4:4 | A4:4 F4:4 G4:4 | F4:4 D4:4 Eb4:4 | D4:2 C4:2 Bb3:8") },

  // Lesson 4 — Bright A
  { id: "b2l4a", title: "Morning bright", difficulty: 1, clef: "treble", key: "A", mode: "major", time: [4, 4], tempo: 69,
    notes: seq("A4:4 B4:4 C#5:8 | B4:6 A4:2 G#4:4 E4:4 | F#4:4 G#4:4 A4:4 B4:4 | A4:16") },
  { id: "b2l4b", title: "Three bright beats", difficulty: 1, clef: "treble", key: "A", mode: "major", time: [3, 4], tempo: 88,
    notes: seq("E4:4 A4:4 C#5:4 | B4:6 A4:2 G#4:4 | A4:4 F#4:4 G#4:4 | A4:12") },
  { id: "b2l4c", title: "Kite string", difficulty: 1, clef: "treble", key: "A", mode: "major", time: [2, 4], tempo: 112,
    notes: seq("A4:2 B4:2 C#5:4 | B4:2 C#5:2 D5:4 | E5:4 C#5:4 | D5:2 C#5:2 B4:4 | C#5:4 G#4:4 | A4:8") },

  // Lesson 5 — Upbeat feeling
  { id: "b2l5a", title: "Country lane", difficulty: 1, clef: "treble", key: "G", mode: "major", time: [4, 4], tempo: 76,
    notes: seq("D4:4 G4:4 A4:2 B4:2 A4:4 | B4:2 C5:2 D5:4 B4:4 G4:4 | A4:2 B4:2 C5:4 A4:2 G4:2 F#4:4 | G4:16") },
  { id: "b2l5b", title: "Garden gate", difficulty: 1, clef: "treble", key: "F", mode: "major", time: [3, 4], tempo: 92,
    notes: seq("F4:4 G4:2 A4:2 Bb4:4 | A4:4 G4:2 F4:2 E4:4 | F4:4 A4:4 C5:4 | Bb4:2 A4:2 G4:4 F4:4") },
  { id: "b2l5c", title: "Running creek", difficulty: 1, clef: "treble", key: "F", mode: "major", time: [2, 4], tempo: 104,
    notes: seq("C4:2 D4:2 E4:2 F4:2 | G4:4 A4:4 | Bb4:2 A4:2 G4:2 F4:2 | G4:4 C4:4 | F4:2 G4:2 A4:2 F4:2 | G4:4 E4:4 | F4:8") },

  // Lesson 6 — Second recital
  { id: "b2l6a", title: "Courtly air", difficulty: 1, clef: "treble", key: "D", mode: "major", time: [4, 4], tempo: 72,
    notes: seq("D4:4 F#4:4 A4:6 G4:2 | F#4:4 E4:4 D4:4 E4:4 | F#4:2 G4:2 A4:4 B4:8 | A4:6 G4:2 F#4:4 E4:4 | D4:4 E4:2 F#4:2 G4:4 E4:4 | D4:16") },
  { id: "b2l6b", title: "Cider press", difficulty: 1, clef: "treble", key: "Bb", mode: "major", time: [3, 4], tempo: 86,
    notes: seq("Bb3:4 D4:4 F4:4 | Eb4:6 D4:2 C4:4 | D4:4 F4:4 Bb4:4 | A4:8 r:4 | G4:4 A4:2 Bb4:2 A4:4 | G4:4 F4:4 Eb4:4 | D4:4 F4:4 C4:4 | Bb3:12") },
  { id: "b2l6c", title: "Sparrow chase", difficulty: 1, clef: "treble", key: "A", mode: "major", time: [4, 4], tempo: 116,
    notes: seq("E4:4 A4:4 B4:2 C#5:2 A4:4 | B4:4 G#4:4 E4:8 | A4:4 C#5:4 E5:4 D5:4 | C#5:2 B4:2 A4:4 G#4:4 r:4 | F#4:4 A4:4 E4:4 G#4:4 | A4:16") },
];
