// The campaign table: 5 books × 6 lessons × 3 melodies. Melody content lives
// in book1..book5.js; this file is pure structure (validated in tests + at
// corpus load). Stars: 1★ avg ≥ 70 · 2★ ≥ 85 · 3★ ≥ 95.
export const STAR_THRESHOLDS = [70, 85, 95];

export const BOOKS = [
  {
    id: "b1", title: "Book One — First Steps",
    blurb: "Stepwise treble melodies in C, G and F. Do-re-mi becomes home.",
    lessons: [
      { id: "b1l1", title: "Three notes", melodies: ["b1l1a", "b1l1b", "b1l1c"] },
      { id: "b1l2", title: "Five in a row", melodies: ["b1l2a", "b1l2b", "b1l2c"] },
      { id: "b1l3", title: "Round trips", melodies: ["b1l3a", "b1l3b", "b1l3c"] },
      { id: "b1l4", title: "Broken chords", melodies: ["b1l4a", "b1l4b", "b1l4c"] },
      { id: "b1l5", title: "From below", melodies: ["b1l5a", "b1l5b", "b1l5c"] },
      { id: "b1l6", title: "First recital", melodies: ["b1l6a", "b1l6b", "b1l6c"] },
    ],
  },
  {
    id: "b2", title: "Book Two — Leaps & Eighths",
    blurb: "Eighth pairs, the dotted door, and new keys with sharps and flats.",
    lessons: [
      { id: "b2l1", title: "Eighth pairs", melodies: ["b2l1a", "b2l1b", "b2l1c"] },
      { id: "b2l2", title: "The dotted door", melodies: ["b2l2a", "b2l2b", "b2l2c"] },
      { id: "b2l3", title: "The flat side", melodies: ["b2l3a", "b2l3b", "b2l3c"] },
      { id: "b2l4", title: "Bright A", melodies: ["b2l4a", "b2l4b", "b2l4c"] },
      { id: "b2l5", title: "Upbeat feeling", melodies: ["b2l5a", "b2l5b", "b2l5c"] },
      { id: "b2l6", title: "Second recital", melodies: ["b2l6a", "b2l6b", "b2l6c"] },
    ],
  },
  {
    id: "b3", title: "Book Three — The Bass Clef",
    blurb: "Everything you know, an octave and a half lower.",
    lessons: [
      { id: "b3l1", title: "Low steps", melodies: ["b3l1a", "b3l1b", "b3l1c"] },
      { id: "b3l2", title: "Fifth floor", melodies: ["b3l2a", "b3l2b", "b3l2c"] },
      { id: "b3l3", title: "Working songs", melodies: ["b3l3a", "b3l3b", "b3l3c"] },
      { id: "b3l4", title: "Dotted low", melodies: ["b3l4a", "b3l4b", "b3l4c"] },
      { id: "b3l5", title: "Flat harvest", melodies: ["b3l5a", "b3l5b", "b3l5c"] },
      { id: "b3l6", title: "Bass recital", melodies: ["b3l6a", "b3l6b", "b3l6c"] },
    ],
  },
  {
    id: "b4", title: "Book Four — Minor & Ties",
    blurb: "Minor keys, leading tones, and notes held across the barline.",
    lessons: [
      { id: "b4l1", title: "First lament", melodies: ["b4l1a", "b4l1b", "b4l1c"] },
      { id: "b4l2", title: "Ties across", melodies: ["b4l2a", "b4l2b", "b4l2c"] },
      { id: "b4l3", title: "D minor color", melodies: ["b4l3a", "b4l3b", "b4l3c"] },
      { id: "b4l4", title: "Interlude in E-flat", melodies: ["b4l4a", "b4l4b", "b4l4c"] },
      { id: "b4l5", title: "Minor low", melodies: ["b4l5a", "b4l5b", "b4l5c"] },
      { id: "b4l6", title: "Minor recital", melodies: ["b4l6a", "b4l6b", "b4l6c"] },
    ],
  },
  {
    id: "b5", title: "Book Five — C Clefs & Color",
    blurb: "Alto and soprano clefs, chromatic neighbors, wide leaps.",
    lessons: [
      { id: "b5l1", title: "Alto opens", melodies: ["b5l1a", "b5l1b", "b5l1c"] },
      { id: "b5l2", title: "Soprano light", melodies: ["b5l2a", "b5l2b", "b5l2c"] },
      { id: "b5l3", title: "Chromatic neighbors", melodies: ["b5l3a", "b5l3b", "b5l3c"] },
      { id: "b5l4", title: "Minor alto", melodies: ["b5l4a", "b5l4b", "b5l4c"] },
      { id: "b5l5", title: "Wide leaps", melodies: ["b5l5a", "b5l5b", "b5l5c"] },
      { id: "b5l6", title: "Grand recital", melodies: ["b5l6a", "b5l6b", "b5l6c"] },
    ],
  },
];

/** Flat, ordered lesson list — the campaign's linear progression. */
export const LESSONS = BOOKS.flatMap((b) => b.lessons.map((l) => ({ ...l, bookId: b.id })));

/** Stars earned for a set-average score (0–3). */
export function starsFor(avg) {
  return STAR_THRESHOLDS.filter((t) => avg >= t).length;
}
