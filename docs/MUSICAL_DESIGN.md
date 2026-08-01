# Musical design — the campaign corpus

The pedagogy behind the 100+ melody corpus: what each book teaches, how
lessons ramp, and the composition rules that keep machine-written melodies
singable. Companion to CAMPAIGN_DESIGN.md (screens) and
CAMPAIGN_IMPLEMENTATION.md (build order).

## 1. Corpus shape

- **108 melodies total**: 90 campaign (5 books × 6 lessons × 3) + the
  original 18 (retempoed) as the extra challenge-pool depth.
- Campaign melodies are **fixed to their lesson** (replayable, masterable);
  the challenge pool draws from everything, filtered by level + clef.
- Campaign difficulty tags: books 1–2 → level 1, books 3–4 → level 2,
  book 5 → level 3 (so challenge filtering stays coherent).

## 2. The five books

Each book teaches one cluster of skills; within a book, lessons 1–5 ramp and
lesson 6 is a longer "recital" lesson that mixes the whole book.

| Book | Title | Clefs | Keys | Meter/rhythm | New skills |
|---|---|---|---|---|---|
| 1 | First Steps | treble | C, G, F major | 4/4, 3/4 · quarters, halves, wholes | stepwise motion, 3rd skips, do-re-mi orientation |
| 2 | Leaps & Eighths | treble | + D, B♭, A major | + 2/4 · eighth pairs, dotted quarters | triad leaps (3rd–5th), upbeat-feel rhythms |
| 3 | The Bass Clef | bass (all 18) | C, G, F, D, B♭ major | book-1+2 rhythms | reading bass; same skills, low register |
| 4 | Minor & Ties | treble + bass mixed | A, E, D minor (natural/harmonic color), + E♭ major | ties across barlines, dotted rhythms denser | minor tonality, held notes across the bar |
| 5 | C Clefs & Color | alto + soprano (+ treble) | to 3 accidentals, majors & minors | densest of the set | C-clef reading, chromatic neighbors, 6th leaps |

Lesson titles are musical, not numeric ("Walking up", "The dotted door",
"Lavender lament"…) — they appear on medallions and in the lesson panel.

## 3. Tempo — no more one-speed corpus

v1's melodies clustered in the 70s bpm and the whole tool felt like one song.
Rules now:

- Global span **♩ = 54–132**. Each book spans at least 40 bpm; each lesson's
  3 melodies differ from each other by ≥ 10 bpm; consecutive melodies in a
  lesson never share a tempo.
- Tempo follows character: lament ≈ 54–66, hymn/chorale ≈ 66–84, walking
  song ≈ 84–104, dance/play ≈ 104–132. Slow melodies carry the long note
  values; fast melodies keep rhythms simpler (an eighth at 132 is hard —
  fast lessons lean on quarters).
- A node test asserts the variety (≥ 8 distinct tempos per book, full-span
  coverage) so the corpus can't silently drift monotone again.

## 4. Composition rules (what keeps generated melodies singable)

1. **Range** — treble C4–E5, bass G2–C4, alto F3–A4, soprano C4–E5
  (written); a melody spans ≤ a 9th.
2. **Tonal frame** — start on a tonic-triad tone, end on the tonic
  (campaign melodies always; `endsOnTonic: true` is validator-enforced).
  Penultimate note is a step or dominant tone away from the tonic.
3. **Contour** — mostly steps; leaps ≤ 5th (book 5: ≤ 6th), every leap > 3rd
  resolves by step in the opposite direction; no two consecutive leaps the
  same direction; a single climax note per melody, not on beat 1 of bar 1.
4. **Rhythm** — bars fill exactly (validator); eighths come in pairs on the
  beat; dotted quarter always pairs with an eighth; a melody uses at most
  3 distinct duration values below book 4, 4 from book 4 on.
5. **Length** — lessons 1–5: 4 measures; lesson 6 recitals: 6–8 measures.
6. **Chromatics (book 5 only)** — single chromatic neighbor or passing tone
  per phrase, approached and left by step (♯4 → 5, ♯5 → 6, ♭7 → 6 shapes).
7. **Breathing** — any melody ≥ 6 measures contains at least one rest.

## 5. Validation (extends the v1 validator)

- Measure fill + known durations (existing).
- Range per clef (existing) tightened to the §4 table.
- `endsOnTonic` for all campaign melodies.
- Campaign table: 90 distinct ids, each in exactly one lesson, every id
  resolves, per-book difficulty tags match §1.
- Tempo variety per §3.

All of it runs in node tests AND at dev-time corpus load (throws loudly,
ships nothing unvalidated).
