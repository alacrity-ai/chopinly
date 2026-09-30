# The Almanac + Chord diagrams — design & implementation (WSHED-160)

*2026-09-30 · shipped as v123*

Leif asked for a "musicopedia": a menu entry that opens a side flyout (so the main
dropdown doesn't grow) holding educational reference tools. The first one is
**chord diagrams for guitar and ukulele**: every common chord, laid out so it's easy
to browse, and searchable.

## 1. Naming: *the Almanac*

A reference shelf needs a short, warm name that fits the app's voice. The app already
talks about "the case" and "the bow", and uses serif type. Candidates:

- *Musicopedia*: clear, but a coinage, and it reads like a web app.
- *Reference*: accurate, but flat.
- *Compendium*: right idea, but a long word.
- *Almanac*: a handy book of facts you keep nearby. Short, and fits what's planned for it
  later: scales, circle of fifths, intervals, Italian terms, key signatures.

→ **Almanac**, with an open-book glyph. Renaming it is a one-string change
(`GROUPS.almanac.name` in `js/registry.js`).

## 2. The menu: a group with a flyout

- A tool can declare `group: "almanac"`. The picker then draws **one** line for the
  group (glyph · *Almanac* · chevron) instead of one line per tool. The group's tools
  live in a flyout panel. Routing is unchanged: a grouped tool is an ordinary tool at
  `#/<id>`, so deep links, the last-used tool and syncing the hash all work as before.
- **Beside or over.** When there's room to the left of the menu, the flyout opens
  beside it, lined up with the group's row. That's an iPad or desktop, and a phone of
  430 px or wider. On a narrower phone it covers the menu instead: the menu steps behind
  (`visibility: hidden`) and the flyout grows a "‹ ALMANAC" back row.
- **Input.** A tap or click toggles the flyout. A mouse hovering the row opens it, but
  only when it fits beside the menu. Opening the covering version under a moving mouse
  would pull the row away from the click (an E2E test caught exactly that). Hovering
  any other row puts the flyout away. Escape closes the flyout first, then the menu.
  Opening from the keyboard focuses the first item.
- The picker button shows the tool's optional `short` name. "Chord diagrams" becomes
  "Chords", because the long name pushed the account button off a phone. When a
  grouped tool is open, the group's row is drawn in the accent colour.

## 3. Chord diagrams: the layout flow

The job is **look a chord up fast, or wander the chords of a key**. Both should be one
tap from anywhere on the page, so the controls are pinned in the navbar's slot.

```
┌──────────────────────────────────────────┐
│ Chopinly                    [▦ Chords ▾] │  ← shell navbar
│ [🔍 Am7, F♯m7♭5, B♭maj9…  ✕] [Guitar|Uke]│  ← pinned: search + instrument
│ [C][C♯][D][E♭][E][F][F♯][G][A♭][A][B♭][B]│  ← pinned: the key rail (hidden while searching)
├──────────────────────────────────────────┤
│ Triads 7                                 │
│ ┌────┐ ┌────┐ ┌────┐                     │
│ │ C  │ │ Cm │ │Cdim│   ← chord boxes, 3 across on a phone,
│ │box │ │box │ │box │     as many as fit on an iPad
│ │4 sh│ │4 sh│ │4 sh│                     │
│ └────┘ └────┘ └────┘                     │
│ Sixths · Sevenths · Ninths · Elevenths & thirteenths · Altered · Slash chords
│                                          │
│ DOTS [fingers|notes|degrees]  HAND [right|left]
└──────────────────────────────────────────┘
```

- **The instrument is a switch, not a gate.** Guitar | Ukulele sits in the pinned bar
  and is remembered, so opening the tool lands you straight on chords. Asking for the
  instrument first would cost every visit a tap to save one on the first visit.
- **Browse by key, grouped by family.** The twelve-key rail picks the key. The page
  then shows that key's chords in musical families, simplest first: Triads (major,
  minor, dim, aug, sus2, sus4, power chord) → Sixths → Sevenths → Ninths → Elevenths &
  thirteenths → Altered (ukulele only) → Slash chords (guitar only). Each heading
  carries its count. Every box shows the most common shape, plus how many shapes exist.
- **Search is the fast path** (§5). While a query is live, the key rail steps aside and
  results come best-first in one grid. The exact hit gets an accent ring, and on a
  keyboard Enter opens the first result. Searching a type alone (`m7`) gives that type
  in all twelve keys: the "see how the shape moves" lens, without a second mode.
- **A box opens the chord's sheet** (the app's standard bottom sheet on a phone,
  centred card on an iPad). It shows:
  - the symbol as the title, and the long name ("F♯ half-diminished");
  - a large box with the string names under it;
  - *shape 2 of 4 · fret 5* with ‹ ›, swipe or arrow keys to move between shapes;
  - **strum** and **one string at a time**, played through a plucked-string synth;
  - the chord's tones spelled correctly with their degrees (E♭ G♭ B♭ D♭ = 1 ♭3 5 ♭7).
    A tone this particular shape leaves out is drawn dashed. A slash chord adds a
    "bass" chip;
  - the dot-label switch, so you can flip to note names without closing the sheet.
  Tapping the big box strums it.
- **The box teaches.** Root tones are filled with the accent colour, including open
  roots (an accent ○). Everything else is ivory. So every shape also shows where the
  root lives, which is the idea behind moveable shapes. Dots can show **fingers**
  (the default), **notes**, or **degrees**. In notes/degrees mode, open strings show
  their label in place of the ○. A barre is a rounded bar with its finger written once.
  Boxes up the neck start with "5fr".
- **Left-handed** mirrors the strings: the low string moves to the right.
- **Routes.** The URL tracks what you're looking at, so any chord can be linked:
  - `#/chords` — the page, with your last instrument and key
  - `#/chords/guitar/A` — a key (replaces history, doesn't add to it)
  - `#/chords/guitar/F%23/m7b5/2` — a chord's sheet, shape 2 (pushed, so Back closes it)
  - `#/chords/guitar/Db/7` — the key typed by its other name keeps that spelling (D♭7,
    spelled D♭ F A♭ C♭); `?as=D♭` does the same
  - slash chords: `…/C/major%2FE` or, typed by hand, `…/C/major/E`
- **Remembered:** instrument, key, dot labels, hand (`ws.chords.*`). The search query
  isn't remembered: coming back should show the key's page, not an old search.

## 4. The data: vendored, then checked note by note

- **Source:** [`@tombatossals/chords-db`](https://github.com/tombatossals/chords-db)
  0.5.1 (MIT). It has multiple positions per chord, with fingers and barres, for guitar
  (standard tuning) and ukulele (standard re-entrant GCEA). The licence text is copied
  into each data file.
- **`dev/vendor-chords.mjs`** downloads the pinned tarball and writes
  `js/lib/chords/data/{guitar,ukulele}.js` (~45 KB + 37 KB, ~12 KB gzipped each).
  There's no build step and no dependency; the output is committed like `vendor/pdfjs`.
  Each voicing becomes a compact code, `x32010:032010@1` (frets low→high : fingers
  @ first fret of the box, `b` + barred frets). The format is documented in
  `js/lib/chords/voicings.js`.
- **Every voicing is checked** (`checkVoicing`):
  - every note it sounds is a chord tone;
  - every tone the type doesn't mark optional is present (the 5th is usually optional;
    the root is optional on 5+-note chords; the 3rd on 11ths; a full 13th may add the 11);
  - a slash chord's bass is its lowest note.

  Failures are dropped and listed. **34 of the source's 4,113 shapes failed** and are
  gone. They were mostly mislabelled shapes: every source Em(add9) sounds an F, and the
  C♯11s sound a G. The same check runs again over the committed data in `npm test`.
- **Filled by hand:** four chords whose every source shape was wrong. Guitar Em(add9)
  and C♯11, ukulele Bm(add9) and F11 now come from `OVERRIDES`, which go through the
  same check. The script refuses an override once the source ships a passing shape.
- **Skipped on purpose:** `alt` (not one chord), `7sg` (a source oddity), and ukulele
  13♭5♭9 (six tones on four strings, so every shape drops the 3rd; it can't be played
  as labelled).
- **Generated:** guitar power chords (not in the source): E-string and A-string roots
  for all twelve keys.
- **Result:** 2,015 guitar and 2,030 ukulele shapes. **Every chord type the tool offers
  exists in all twelve keys** on each instrument. That covers major, minor, dim, aug,
  sus2, sus4, 5 (guitar), 6, m6, 6/9, m6/9, 7, maj7, m7, m(maj7), dim7, m7♭5, 7sus4,
  7♯5, 7♭5, maj7♭5, maj7♯5, m(maj7)♭5, add9, m(add9), 9, maj9, m9, m(maj9), 7♭9, 7♯9,
  9♭5, 9♯5, 11, m11, maj11, m(maj11), 9♯11, 13, maj13, plus altered dominants on
  ukulele and slash chords on guitar.

## 5. Theory and search (`js/lib/chords/theory.js`, pure)

- **Chord types** are one table: id, symbol, spoken name, family, formula (degrees),
  optional degrees, extra allowed tones, and the spellings people type (aliases).
- **Spelling** follows letter names: C°7 = C E♭ G♭ B𝄫, B+ = B D♯ F𝄪, A7♯9 has a B♯.
  The keys use guitar-reading spellings (C♯, E♭, F♯, A♭, B♭). A root typed another way
  (D♭, G♭, D♯…) keeps its spelling through the grid, the sheet and the URL.
- **`parseSymbol`** reads real chord symbols. `M7` is maj7 while `m7` is minor
  (case-sensitive only where it matters). It handles `-7`, `Δ7`, `°`, `ø`, `+`, `sus`,
  `6/9`, `m(maj7)`, slash basses, and written-out words ("C minor seventh", "C sharp
  minor").
- **`search`** ranks results:
  - a full symbol → that chord first, then the key's other chords whose symbol starts
    the same way;
  - a root alone → that key's chords, spelled as typed;
  - a type alone → that type in all twelve keys;
  - a word ("diminished") → the exact type, then every type whose name holds it
    (dim7, half-diminished).

## 6. Sound (`js/lib/chords/pluck.js`)

Karplus–Strong: a burst of filtered noise fed round a delay line one period long, with
a fractional delay so the pitch is exact (measured within ±0.2 cents from E2 to E5).
Low strings ring longer. Each note is rendered once into an AudioBuffer and cached.
A strum staggers the strings by 28 ms from low to high; *one string at a time* spaces
them 220 ms. Each play gets its own gain bus, so a new strum cuts off the old one
cleanly. It uses the shared `getAudio()` context like every other tool.

## 7. Files

| file | what |
|---|---|
| `js/registry.js` | `GROUPS` (the Almanac); the chords tool registered with `group`, `short` |
| `js/app.js` | the picker draws groups + flyouts (beside / over), Escape peels the flyout first |
| `js/lib/chords/theory.js` | keys, chord types, spelling, symbol parsing, search |
| `js/lib/chords/voicings.js` | instruments + tunings, the voicing code, `checkVoicing`, barres |
| `js/lib/chords/diagram.js` | the chord box as an SVG string (skin-token classes) |
| `js/lib/chords/pluck.js` | the plucked-string synth |
| `js/lib/chords/data/*.js` | GENERATED voicings (do not edit; re-run the vendor script) |
| `js/tools/chords/{index,ui}.js` | the tool: pinned bar, grid, search, sheet, routes |
| `dev/vendor-chords.mjs` | vendor + check + overrides + power chords |
| `css/app.css` | "the Almanac flyout" + "chord diagrams" blocks at the end |
| `tests/chords.test.mjs` | data check, coverage, spelling, parsing, search, the box |
| `tests/e2e/chords.mjs` | menu → flyout (phone over / iPad beside), grid, keys, instruments, search, sheet, routes, labels, hand, skins |

## 8. Found and fixed along the way

- **Navbar overflow on 390 px phones** (iPhone 12–15). This was live in production:
  with "Metronome" (or Sight singing, Ear training, Pitch pipe…) on the picker button,
  the account button sat 4 px past the screen edge. Up to 392 px the navbar spacing now
  tightens and the account button shrinks slightly. A name that still doesn't fit gets
  an ellipsis instead of widening the page; the menu always shows the full name.
- **The stamp animation widened phone pages.** A new row scales in at 2.4× for half a
  second, and the page briefly scrolled sideways. It was live in production and
  `tests/e2e/takes.mjs` was red. Fixed with `overflow-x: clip` on the tool root for the
  Logbook, Recorder and Scores (clip, not hidden, so sticky positioning still works).
- **`tests/e2e/seo.mjs`** expected a hard-coded 8 tool pages; there are 10 since Scores
  and Compose got pages. It now compares against its own tool map.
- **`tests/e2e/anonymous.mjs`**' menu-order test knows about the Almanac line.

## 9. Next on the shelf (not in this card)

- **SEO chord pages.** "C minor 7 guitar chord" is a large search surface. A generated
  crawlable page per chord (or per key) through `dev/build-site.mjs`, with the same SVG
  boxes rendered server-side, would fit the existing tool-page pipeline. This needs its
  own card because it changes the URL set: sitemap, IndexNow, GSC.
- More instruments and tunings: baritone ukulele (DGBE = the guitar's top four), low-G
  ukulele, drop-D and open tunings, mandolin, bass. `INSTRUMENTS` + a data source per
  instrument; `checkVoicing` is instrument-agnostic.
- A capo control (transpose the names, keep the shapes).
- "Show on the piano": the chord's tones on the shared keyboard module
  (`js/lib/keyboard/`), a natural fit for a piano-first app.
- More Almanac books: scales and modes, circle of fifths, intervals, key signatures,
  tempo and expression terms.
