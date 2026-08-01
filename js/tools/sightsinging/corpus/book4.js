// Book 4 — Minor & Ties. Treble and bass mixed; A/E/D minor with leading-tone
// color, plus E♭ major; ties across barlines; denser dotted rhythm. Level 2.
import { seq } from "./notation.js";

export const BOOK4 = [
  // Lesson 1 — First lament
  { id: "b4l1a", title: "Grey morning", difficulty: 2, clef: "treble", key: "A", mode: "minor", time: [4, 4], tempo: 58,
    notes: seq("A4:4 B4:4 C5:8 | B4:4 A4:4 G#4:8 | A4:4 C5:4 B4:4 G#4:4 | C5:4 B4:4 A4:8") },
  { id: "b4l1b", title: "Willow", difficulty: 2, clef: "treble", key: "A", mode: "minor", time: [3, 4], tempo: 72,
    notes: seq("E4:4 A4:4 B4:4 | C5:8 B4:4 | A4:4 G4:4 F4:4 | E4:4 G#4:4 A4:4") },
  { id: "b4l1c", title: "Restless", difficulty: 2, clef: "treble", key: "A", mode: "minor", time: [4, 4], tempo: 92,
    notes: seq("A4:4 E5:4 C5:4 B4:4 | A4:2 B4:2 C5:4 D5:4 B4:4 | C5:4 A4:4 G#4:4 E4:4 | A4:16") },

  // Lesson 2 — Ties across
  { id: "b4l2a", title: "Held lantern", difficulty: 2, clef: "treble", key: "E", mode: "minor", time: [4, 4], tempo: 62,
    notes: seq("E4:4 F#4:4 G4:8~ | G4:4 A4:4 B4:8 | A4:4 G4:4 F#4:8~ | F#4:4 D#4:4 E4:8") },
  { id: "b4l2b", title: "Across the bar", difficulty: 2, clef: "treble", key: "E", mode: "minor", time: [3, 4], tempo: 78,
    notes: seq("B4:4 A4:4 G4:4~ | G4:8 F#4:4 | E4:4 G4:4 B4:4~ | B4:4 A4:4 F#4:4 | E4:12") },
  { id: "b4l2c", title: "Current and eddy", difficulty: 2, clef: "treble", key: "E", mode: "minor", time: [4, 4], tempo: 96,
    notes: seq("E4:2 F#4:2 G4:4 A4:4 B4:4~ | B4:4 C5:4 B4:4 A4:4 | G4:4 E4:4 F#4:8~ | F#4:8 E4:8") },

  // Lesson 3 — D minor color
  { id: "b4l3a", title: "Stone bridge", difficulty: 2, clef: "treble", key: "D", mode: "minor", time: [4, 4], tempo: 60,
    notes: seq("D4:4 E4:4 F4:8 | G4:6 F4:2 E4:4 A4:4 | Bb4:4 A4:4 G4:4 E4:4 | C#4:4 D4:12") },
  { id: "b4l3b", title: "Low vespers", difficulty: 2, clef: "bass", key: "D", mode: "minor", time: [3, 4], tempo: 76,
    notes: seq("D3:4 F3:4 A3:4 | G3:6 F3:2 E3:4 | F3:4 D3:4 C#3:4 | D3:12") },
  { id: "b4l3c", title: "Rain chain", difficulty: 2, clef: "treble", key: "D", mode: "minor", time: [2, 4], tempo: 94,
    notes: seq("D4:2 E4:2 F4:4 | E4:2 F4:2 G4:4 | A4:4 F4:4 | Bb4:2 A4:2 G4:2 F4:2 | E4:4 C#4:4 | D4:8") },

  // Lesson 4 — Interlude in E-flat
  { id: "b4l4a", title: "Warm window", difficulty: 2, clef: "treble", key: "Eb", mode: "major", time: [4, 4], tempo: 64,
    notes: seq("Eb4:4 F4:4 G4:8~ | G4:4 Ab4:4 Bb4:8 | C5:4 Bb4:4 Ab4:4 G4:4 | F4:8 Eb4:8") },
  { id: "b4l4b", title: "Three flats waltz", difficulty: 2, clef: "treble", key: "Eb", mode: "major", time: [3, 4], tempo: 82,
    notes: seq("Bb4:4 G4:4 Eb4:4 | F4:6 G4:2 Ab4:4 | G4:4 Eb4:4 F4:4~ | F4:8 Eb4:4") },
  { id: "b4l4c", title: "Open shutters", difficulty: 2, clef: "treble", key: "Eb", mode: "major", time: [4, 4], tempo: 106,
    notes: seq("Eb4:4 G4:2 F4:2 Eb4:4 Bb4:4 | Ab4:4 G4:4 F4:2 Eb4:2 D4:4 | Eb4:4 F4:4 G4:4 Ab4:4 | F4:8 Eb4:8") },

  // Lesson 5 — Minor low
  { id: "b4l5a", title: "Undertow", difficulty: 2, clef: "bass", key: "A", mode: "minor", time: [4, 4], tempo: 66,
    notes: seq("A2:4 B2:4 C3:8 | D3:4 E3:4 F3:8~ | F3:4 E3:4 D3:4 B2:4 | A2:16") },
  { id: "b4l5b", title: "Peat smoke", difficulty: 2, clef: "bass", key: "E", mode: "minor", time: [3, 4], tempo: 84,
    notes: seq("E3:4 G3:4 B3:4 | A3:6 G3:2 F#3:4 | G3:4 E3:4 D#3:4 | E3:12") },
  { id: "b4l5c", title: "Mill race", difficulty: 2, clef: "bass", key: "A", mode: "minor", time: [2, 4], tempo: 104,
    notes: seq("A2:4 C3:4 | E3:2 D3:2 C3:4 | D3:4 E3:4 | C3:2 D3:2 E3:4 | D3:4 B2:4 | C3:2 B2:2 A2:2 G#2:2 | A2:8") },

  // Lesson 6 — Minor recital
  { id: "b4l6a", title: "Ballad of the eaves", difficulty: 2, clef: "treble", key: "A", mode: "minor", time: [4, 4], tempo: 70,
    notes: seq("A4:4 C5:4 B4:8~ | B4:4 A4:4 G4:4 F4:4 | E4:4 A4:4 C5:4 E5:4 | D5:4 C5:4 B4:4 r:4 | A4:2 B4:2 C5:4 B4:4 G#4:4 | A4:16") },
  { id: "b4l6b", title: "Lavender lament", difficulty: 2, clef: "treble", key: "D", mode: "minor", time: [3, 4], tempo: 90,
    notes: seq("D4:4 F4:4 A4:4 | G4:6 A4:2 Bb4:4 | A4:4 F4:4 G4:4~ | G4:4 E4:4 F4:4 | G4:4 A4:4 F4:4 | E4:8 C#4:4 | D4:12") },
  { id: "b4l6c", title: "Reel in E minor", difficulty: 2, clef: "bass", key: "E", mode: "minor", time: [4, 4], tempo: 120,
    notes: seq("E3:4 G3:4 B3:4 A3:4 | G3:2 A3:2 B3:4 E3:8 | F#3:4 G3:4 A3:4 F#3:4 | G3:4 E3:4 B2:8~ | B2:4 C3:4 D#3:4 F#3:4 | E3:16") },
];
