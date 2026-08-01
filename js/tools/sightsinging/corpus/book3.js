// Book 3 — The Bass Clef. All 18 in bass; C/G/F/D/B♭ major; the skills of
// books 1–2 relearned in the low register. Level 2.
import { seq } from "./notation.js";

export const BOOK3 = [
  // Lesson 1 — Low steps
  { id: "b3l1a", title: "Cellar stairs", difficulty: 2, clef: "bass", key: "C", mode: "major", time: [4, 4], tempo: 63,
    notes: seq("C3:4 D3:4 E3:4 F3:4 | G3:8 E3:8 | F3:4 E3:4 D3:8 | C3:16") },
  { id: "b3l1b", title: "Low lantern", difficulty: 2, clef: "bass", key: "C", mode: "major", time: [3, 4], tempo: 80,
    notes: seq("G3:4 F3:4 E3:4 | F3:4 D3:4 E3:4 | C3:4 D3:4 E3:4 | D3:8 C3:4") },
  { id: "b3l1c", title: "Footfalls", difficulty: 2, clef: "bass", key: "C", mode: "major", time: [4, 4], tempo: 96,
    notes: seq("C3:8 E3:8 | D3:4 E3:4 F3:8 | E3:4 D3:4 C3:4 D3:4 | C3:16") },

  // Lesson 2 — Fifth floor
  { id: "b3l2a", title: "Deep well", difficulty: 2, clef: "bass", key: "G", mode: "major", time: [4, 4], tempo: 58,
    notes: seq("G2:4 A2:4 B2:8 | C3:4 D3:4 E3:8 | D3:4 C3:4 B2:4 A2:4 | G2:16") },
  { id: "b3l2b", title: "Rope and pulley", difficulty: 2, clef: "bass", key: "G", mode: "major", time: [2, 4], tempo: 76,
    notes: seq("G3:4 F#3:4 | E3:4 D3:4 | E3:4 F#3:4 | G3:4 B3:4 | A3:4 F#3:4 | G3:8") },
  { id: "b3l2c", title: "Down to earth", difficulty: 2, clef: "bass", key: "G", mode: "major", time: [3, 4], tempo: 94,
    notes: seq("D3:4 G3:4 B3:4 | A3:6 G3:2 F#3:4 | E3:4 C3:4 D3:4 | G2:12") },

  // Lesson 3 — Working songs
  { id: "b3l3a", title: "Timber song", difficulty: 2, clef: "bass", key: "F", mode: "major", time: [4, 4], tempo: 66,
    notes: seq("F3:4 G3:4 A3:8 | Bb3:6 A3:2 G3:4 F3:4 | E3:4 G3:4 C3:8 | F3:4 G3:4 F3:8") },
  { id: "b3l3b", title: "Wheelbarrow", difficulty: 2, clef: "bass", key: "F", mode: "major", time: [3, 4], tempo: 84,
    notes: seq("C3:4 F3:4 A3:4 | G3:4 Bb3:4 A3:4 | G3:4 F3:4 E3:4 | F3:12") },
  { id: "b3l3c", title: "Hauling line", difficulty: 2, clef: "bass", key: "F", mode: "major", time: [2, 4], tempo: 102,
    notes: seq("F3:2 G3:2 A3:4 | Bb3:2 A3:2 G3:4 | A3:4 C4:4 | Bb3:2 A3:2 G3:2 F3:2 | G3:4 C3:4 | F3:8") },

  // Lesson 4 — Dotted low
  { id: "b3l4a", title: "Old clock", difficulty: 2, clef: "bass", key: "D", mode: "major", time: [4, 4], tempo: 60,
    notes: seq("D3:6 E3:2 F#3:4 A3:4 | G3:6 F#3:2 E3:4 A2:4 | B2:4 D3:4 C#3:4 E3:4 | D3:16") },
  { id: "b3l4b", title: "Long shadows", difficulty: 2, clef: "bass", key: "D", mode: "major", time: [3, 4], tempo: 78,
    notes: seq("A3:6 G3:2 F#3:4 | G3:6 E3:2 C#3:4 | D3:4 F#3:4 E3:4 | D3:12") },
  { id: "b3l4c", title: "Cart wheels", difficulty: 2, clef: "bass", key: "D", mode: "major", time: [2, 4], tempo: 98,
    notes: seq("D3:4 F#3:4 | A3:2 G3:2 F#3:4 | G3:4 B3:4 | A3:2 G3:2 F#3:2 E3:2 | F#3:4 C#3:4 | D3:8") },

  // Lesson 5 — Flat harvest
  { id: "b3l5a", title: "Millstone", difficulty: 2, clef: "bass", key: "Bb", mode: "major", time: [4, 4], tempo: 70,
    notes: seq("Bb2:4 C3:4 D3:8 | Eb3:6 D3:2 C3:4 Bb2:4 | D3:4 F3:4 Eb3:4 C3:4 | Bb2:16") },
  { id: "b3l5b", title: "Granary", difficulty: 2, clef: "bass", key: "Bb", mode: "major", time: [3, 4], tempo: 90,
    notes: seq("F3:4 D3:4 Bb2:4 | C3:4 Eb3:4 D3:4 | C3:6 D3:2 Eb3:4 | D3:4 C3:4 Bb2:4") },
  { id: "b3l5c", title: "Threshing floor", difficulty: 2, clef: "bass", key: "Bb", mode: "major", time: [4, 4], tempo: 110,
    notes: seq("Bb2:4 D3:4 F3:2 Eb3:2 D3:4 | Eb3:4 C3:4 D3:8 | G3:4 F3:4 Eb3:4 D3:4 | C3:8 Bb2:8") },

  // Lesson 6 — Bass recital
  { id: "b3l6a", title: "Stone chapel", difficulty: 2, clef: "bass", key: "C", mode: "major", time: [4, 4], tempo: 74,
    notes: seq("C3:4 E3:4 G3:8 | F3:4 E3:4 D3:4 E3:4 | F3:2 E3:2 D3:4 C3:4 B2:4 | C3:4 D3:4 E3:8 | D3:4 G3:4 F3:4 D3:4 | C3:16") },
  { id: "b3l6b", title: "Night watchman", difficulty: 2, clef: "bass", key: "G", mode: "major", time: [3, 4], tempo: 88,
    notes: seq("G2:4 B2:4 D3:4 | C3:6 B2:2 A2:4 | B2:4 D3:4 G3:4 | F#3:8 r:4 | E3:4 D3:4 C3:4 | B2:4 D3:4 A2:4 | G2:12") },
  { id: "b3l6c", title: "Ferryman's reel", difficulty: 2, clef: "bass", key: "F", mode: "major", time: [4, 4], tempo: 116,
    notes: seq("F3:4 A3:4 C4:8 | Bb3:4 A3:4 G3:2 F3:2 E3:4 | F3:4 G3:4 A3:4 Bb3:4 | A3:4 G3:4 F3:4 r:4 | G3:2 A3:2 Bb3:4 G3:4 C3:4 | F3:16") },
];
