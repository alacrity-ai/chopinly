# Compose — lyrics

**Epic:** WSHED-173. **Stories:** WSHED-174 (model · engine · MusicXML), WSHED-175 (vertical layout computed, not
constant), WSHED-176 (engraving), WSHED-177 (the Lyrics rail and entry flow), WSHED-178 (help · QA · site).
**Asked for by:** Leif, 2026-10-08 — a singer's melody with words, for the gig fake books (WSHED-172) and for any
song arranged on the grand staff. **Companion:** [`COMPOSE_PARTS_DESIGN.md`](COMPOSE_PARTS_DESIGN.md) (N instruments) —
orthogonal; this document is deliberately independent of it, but §3 (vertical layout) is the one piece of work both need,
and it ships here first.

Every decision below says where it lives in the code (file, and the function or constant it touches) and how it is tested.
The audit this plan rests on was taken 2026-10-08 against `main` at v126.

---

## 0 · What a lyric is, and is not

A lyric is **a syllable under a note** — not an expression on a slot. The difference is the whole design:

| | expression (`text`, WSHED-122) | lyric |
|---|---|---|
| anchored to | a half-beat slot on a staff | a **note event** (one voice) |
| survives | `moveExpressions`, `setTime` re-flow | cut / copy / paste / transpose **with the note** |
| drawn | above the staff, free `dy` | **below** the staff, on **one baseline per system and staff** |
| joins | nothing | the next syllable by a **hyphen**, or a melisma by an **extender line** |
| widens the bar | never | yes — a long syllable under a short note pushes the column |
| voices | one text per staff and slot | one line of lyrics per **verse**; the verse belongs to the staff, not the voice |

So lyrics ride the note, as the design doc reserved in 2026-09 (`COMPOSE_DESIGN.md` §12 "Lyrics | `event.lyric` (MusicXML
shape)"). What they borrow from the expression family is the entry UI pattern (`rails.js` text row + **set**), hit-testing
(`hit.js`), the selection / delete flow, and the MusicXML plumbing.

**Not in this round** (named on the epic): a verse number drawn before the first syllable (v2 — trivial once verses exist),
elision (two syllables under one note, "th'e‿ternal"), lyrics on chord-only voices, lyrics in the preview ghost,
lyric fonts other than Fraunces, right-to-left scripts.

---

## 1 · Model (WSHED-174)

### 1.1 Shape

```js
// on a note event (never a rest, never a grace)
ev.lyrics = [ { n: 1, text: "glo", syl: "begin" }, { n: 2, text: "ho", syl: "middle" } ]
```

| field | meaning | rule |
|---|---|---|
| `n` | the verse, 1-based | `1 ≤ n ≤ LYRIC_VERSES_MAX` (= 4); unique within the array; the array is sorted by `n` |
| `text` | the syllable as sung | 1–`LYRIC_MAX` (= 40) chars, trimmed, no line breaks; `"–"` is not a text (an extender is `syl` + the next note) |
| `syl` | its place in the word — MusicXML's `syllabic` | `"single" \| "begin" \| "middle" \| "end"`; absent = `"single"` |
| `ext` | the syllable is sung through the following notes of the voice until the next lyric of this verse (a melisma) | `true` or absent |

Why an array of verses from day one: fake books have verses; a scalar `lyric` is a migration later. The UI edits verse 1
first (§4), but nothing in the model, the engraver or MusicXML is single-verse.

Why on the note and not on the pitch: a chord sings one syllable.

### 1.2 Validation (`model.js` → `validate`)

In the per-event walk (next to `ev.graces`, `ev.gliss`): `ev.lyrics` is an array with ≥ 1 entry, on a `note`, each
entry well-formed per the table, `n` unique and ascending. No schema bump: a document with no `lyrics` keys is unchanged,
and v3 readers that do not know the key ignore it (every reader in the app spreads unknown keys through `clone`). Keep
`SCHEMA = 3`.

New constants exported from `model.js`: `LYRIC_MAX = 40`, `LYRIC_VERSES_MAX = 4`, `SYLLABICS = ["single", "begin", "middle", "end"]`.

### 1.3 Engine (`engine.js`)

Pure functions, each returning a new document, each throwing `Nudge` with the bar:

| function | does |
|---|---|
| `setLyric(doc, evId, n, { text, syl, ext })` | sets verse `n` on the note; `text` empty/null **removes** that verse (and the key when the array empties). A rest or a grace → `Nudge("lyrics go on notes")`. |
| `removeLyrics(doc, evIds, n = null)` | drops verse `n`, or every verse when null, from the selection. |
| `nextLyricNote(doc, { bar, staff, voice, ev }, dir = 1)` | the next (or previous) **note** of the voice across bars, skipping rests and tied-in notes (a note whose every pitch has `tie: "stop"` cannot start a syllable — Gould). Returns the locator or null at the end. This is the entry flow's "space advances". |
| `lyricRuns(doc)` | `[{ staff, n, items: [{ bar, voice, ev, at(abs), lyric }] }]` in time order per staff and verse — what the engraver and the exporter walk. Cheap; computed per layout. |

Existing engine paths that must carry the key:
- `clipFrom` / `paste` — `lyrics` is a note attribute like `art`; copy it with the note (check: `clipFrom` strips to an
  allow-list? If so, add `lyrics` to it).
- `retype` (change a note's value) — keeps attributes; confirm `lyrics` survives.
- `tie` — tying two notes: the second note's lyrics are **kept** (the user may have put them there on purpose; the engraver
  simply does not draw a syllable on a tied-in note unless it is the only one — see §3.4). Document this in the help.
- `remove` / a note becoming a rest — lyrics go with the note (they are on it).
- `trimBars`, `insertBar`, `deleteBar` — untouched (bar-level).
- `cleanTies`, `cleanExpressions` — nothing to do; add `cleanLyrics(doc)` that drops `lyrics` found on rests after an
  import or an edit that turned a note into a rest (defensive; called where `cleanTies` is).

### 1.4 MusicXML (`musicxml.js`)

**Out** — inside `<note>`, after `<notations>` (MusicXML order: … notations, lyric):
```xml
<lyric number="1"><syllabic>begin</syllabic><text>glo</text></lyric>
<lyric number="1"><syllabic>single</syllabic><text>ry</text><extend type="start"/></lyric>
```
On the first pitch of a chord only. `ext` → `<extend type="start"/>`; the importer treats `<extend/>` with no type as a start too.

**In** — in the `note` branch, read every `<lyric>` of a non-grace, non-rest note: `number` (default 1; a non-numeric
`number` such as "verse1" maps to the next free verse on that staff — Sibelius does this), `<syllabic>`, `<text>`
(several `<text>` in one lyric = an elision → joined with the elision character the file used, else a space; no
elision model this round), `<extend>`. Clamp verses past `LYRIC_VERSES_MAX` with one warning ("verses past 4 were
dropped"). Replace the design doc's "Ignored on purpose: … lyrics" line in `COMPOSE_MUSICXML_DESIGN.md` §2 and the help
("Lyrics and parts are not in Compose yet") accordingly — parts stay listed as not travelling until WSHED-179.

Golden round-trip: a new fixture `tests/fixtures/musicxml/lyrics.musicxml` (two verses, a hyphenated word, a melisma
with extend, a chord with one syllable) → `fromMusicXml` → `toMusicXml` → equal syllables, syllabics, verses, extends.

### 1.5 Sync

Compositions sync as kind `composition` with the 1 MiB body cap (`merge.js` `BODY_CAPS`). Lyrics add ~40 bytes a note;
a 100-bar song with two verses adds ~30 KB. No cap change.

---

## 2 · Vertical layout computed, not constant (WSHED-175) — the shared refactor

### 2.1 Today

`layout.js:14-18` fixes the whole vertical picture at module load:

```js
export const STAFF_GAP = 8, SYS_GAP = 10, TOP_PAD = 6, BOTTOM_PAD = 4;
export const BLOCK_H = 4 + STAFF_GAP + 4;   // one grand-staff block
export const SYS_H = BLOCK_H + SYS_GAP;
export const systemAt = (y, n) => …SYS_H…
```

and `layoutComposition` places `staffTop(st) = sysTop + st * (4 + STAFF_GAP)`, `sysTop = TOP_PAD + si * SYS_H`,
`height = TOP_PAD + n * SYS_H − SYS_GAP + BOTTOM_PAD`. Consumers of the constants outside the file (audit 2026-10-08):
`export/pdf.js` (`inkExtents`, `planPages`), `tests/compose-export.test.mjs`, `tests/compose-layout.test.mjs`. Nothing in
`tools/` reads them — the editor, the export sheet and the layout view read `L.systems[].top/bottom/staffTop`,
`L.height`, `plan.*`. Good: the surface is three files plus tests.

Paper already parts systems by their measured ink (`planPages` → `dyOf(system)`, WSHED-170). The screen does not —
`COMPOSE_CHORDS_DESIGN.md` §8 records why: "the editor's hit-testing assumes the fixed `SYS_H`". This story removes
that assumption **for the per-document case** (the layout's vertical metrics become a function of the document), and
leaves per-system variable heights on screen out of scope (paper keeps doing it its own way).

### 2.2 The change

`layout.js` gains a pure **vertical metrics** function, called once per layout and exported:

```js
/** The vertical shape of every system of this document, in S. The same for every system — the engraver's systems
 *  stay uniform (hit-testing, the ghost and the playhead rely on it); paper parts them further by their ink. */
export function metricsOf(doc) {
  const staves = staffList(doc);                       // §PARTS: today [{ part: 0, index: 0 }, { part: 0, index: 1 }]
  const gaps = staves.map((s, i) => i === staves.length - 1 ? 0 : gapBelow(doc, i));   // S between this staff's bottom line and the next staff's top line
  const staffTop = []; let y = 0;
  staves.forEach((s, i) => { staffTop.push(y); y += 4 + gaps[i]; });
  const blockH = y;                                    // first staff's top line → last staff's bottom line
  return { staffTop, gaps, blockH, sysH: blockH + SYS_GAP, topPad: TOP_PAD, bottomPad: BOTTOM_PAD, sysGap: SYS_GAP, systemAt: (y, n) => … };
}
```

with, for this story, `gapBelow(doc, i) = STAFF_GAP + lyricBand(doc, i)` where `lyricBand` is `0` when no note on staff
`i` anywhere in the piece carries lyrics, else `LYRIC_BAND = 1.4 + 1.6 × verses(i)` (verses = the highest `n` used on the
staff): the baseline sits `LYRIC_Y` (= 2.6 S, under the dynamics line's air) below the bottom line, each further verse
`LYRIC_STEP` (= 1.6 S) lower, and 1.4 S of air before the next staff. The last staff's band hangs into `SYS_GAP`, which at
10 S holds two verses as it holds a pedal line today; three or four verses on the **last** staff add to `sysGap`
(`sysGap = max(SYS_GAP, lyricBand(last) + 4)`).

Everything in `layoutComposition` that said `BLOCK_H`, `SYS_H`, `TOP_PAD + si * SYS_H`, `st * (4 + STAFF_GAP)` reads
`M = metricsOf(doc)` instead: `sysTop = M.topPad + si * M.sysH`, `staffTop(st) = sysTop + M.staffTop[st]`,
`hsys.bottom = sysTop + M.blockH + 3`, `height = (M.topPad + n * M.sysH − M.sysGap + M.bottomPad) * S`. The result carries
`L.metrics = M` (and `L.nStaves` as before).

`systemAt(y, n)` becomes `M.systemAt(y, n)`; the module-level export stays for one release as a wrapper over
default metrics so nothing imports break mid-series, then goes.

### 2.3 Consumers

- `export/pdf.js` — `inkExtents(L)` uses `L.metrics.topPad + i * L.metrics.sysH` and `L.metrics.blockH`; `planPages` the
  same, plus `M.sysGap`. `systemAt(y, n)` → `L.metrics.systemAt`. Behaviour is identical for a document without lyrics
  (the metrics equal the old constants) — the existing export tests prove it unchanged.
- `tests/compose-export.test.mjs` and `compose-layout.test.mjs` import the metrics from the layout under test instead
  of the constants.
- The editor: no change — it reads `L.systems[si].top/bottom`, `sys.staves[].topY`. **Verify** `editor.js` has no
  arithmetic of its own on `SYS_H`/`BLOCK_H` (the audit found none; `stepY` uses `sys.staves[staff].topY`).

### 2.4 Tests

`compose-layout.test.mjs`: a piece with no lyrics has `metrics.blockH === 16`, `sysH === 26` (the old constants); a
piece with one verse on the upper staff has `gaps[0] === 8 + 3.0` and every system's lower staff moved down by exactly
that; two verses on the lower staff leave `blockH` alone and grow `sysGap`; `L.height` follows. `compose-export.test`:
the plan's pages still never overlap systems with lyrics present (the ink meter sees the lyric text).

---

## 3 · Engraving (WSHED-176)

### 3.1 The lyric line

One baseline per system and staff and verse, like the chord line is one baseline above (`layout.js` `chordLine`):

```
lyricLine(si, staff, n) = max( staffTop(si, staff) + 4 + LYRIC_Y,
                               lowest ink of the staff in the system (belowOf over drawn, hairpins, dynamics) + 1.0 )
                          + (n − 1) × LYRIC_STEP
```

Gould: lyrics read as a line; they never dodge individual notes. The baseline is the lower of "the standard place" and
"under everything the staff's notes reach in this system", so a low ledger note pushes the whole line down for that
system, not one syllable. Within the band the layout reserved (§2.2) this almost always lands at the standard place.

### 3.2 Dynamics on a staff with lyrics

Vocal convention (Gould, *Behind Bars* ch. "Vocal music"): dynamics and hairpins go **above** the staff when lyrics are
below. Rule: on a staff where **this system** draws a lyric, `exprLine(si, staff, items)` returns the **above** line —
`min(staffTop − 2.6, aboveOf(items) − 1.6)` — for `dyn`, `hairpin` and `textline`. Pedal and `8vb` lines, which have no
"above", go **under the lyric band** (`pedalLine` adds `lyricBand` when lyrics are drawn on that staff in the system).
Text expressions were above already. A system of the same staff with no lyric keeps the old placement, so a song's
interlude bars look as before.

### 3.3 Horizontal room

A syllable is upright Fraunces at `LYRIC_SIZE` = 1.15 S (the same size words use). Its advance is measured by the
painter (`measure(str, size, cls)` — the chord-symbol mechanism; `render.js` and `pdf.js` already implement it; the pure
layout uses the `0.58 × size × length` estimate the chord code uses, which is what sizes columns). The column of a note
with a lyric needs `w_syl + LYRIC_AIR` (0.5 S) from the syllable's start to the next column's syllable start. Implement
as a new pad in the per-bar column pass (`layout.js` ~line 84-100, next to `accPad`/`dotPad`): for each column, for each
verse, the syllable's left edge is the head's centre − `w/2` (centred on the head, Gould), its right edge the same +
`w`; `c.lyricPad = max(0, rightEdge − (x of next column) + LYRIC_AIR)` **as a stretch width**, not a fixed one — lyric
room participates in justification like duration room (`c.w += lyricNeed`), so a crowded vocal bar spreads evenly. A
hyphen between syllables needs `HYPHEN_MIN` = 0.9 S of clear space; when two syllables are closer than that, the hyphen
is dropped (Gould allows it when syllables touch).

The first syllable of a system may hang left of the first note; `LEFT` already leaves 1.6 S and the clef/key room
covers the rest. A syllable centred on the **last** note of a system may overhang the right margin by up to `w/2` — the
ink meter sees it and paper keeps room (`ink[i].right`), the screen scrolls.

### 3.4 Which notes get a syllable, hyphens, extenders

From `lyricRuns`: every note with `lyrics[n]` draws `text` centred on the head (`x + headW/2`; a chord: the column's x).
A note whose every pitch is tied-in draws nothing even if it carries a lyric (the previous syllable is still sounding) —
unless it is the only note of the word. Between a `begin`/`middle` syllable and the next syllable of the same verse on
the staff: a **hyphen** centred in the gap (one hyphen; Gould uses several only across very long gaps — one is enough
here); across a system break the hyphen goes at the start of the next system. A syllable with `ext` or a `syl: "end"` /
`"single"` whose next note of the voice has no lyric for this verse draws an **extender**: a line at baseline from the
syllable's right edge + 0.3 S to the last note of the melisma (the note before the next syllable, or the last note of
the voice before a rest) + `headW`; across a break, in two pieces like a hairpin.

Layout output: `L.lyrics = [{ id: "<evId>:<n>", ev, bar, staff, n, x, y, text, w, system }]`,
`L.lyricLines = [{ kind: "hyphen" | "extend", x1, x2, y, system, half? }]`.

### 3.5 Painting (`paint.js`, both painters)

```js
for (const ly of L.lyrics ?? []) { on(ly); p.group("cp-lyric", { ev: ly.ev, n: ly.n }); p.text(ly.x, ly.y, ly.text, "cp-lyric", { size: LYRIC_SIZE, anchor: "middle" }); p.end(); }
for (const l of L.lyricLines ?? []) { on(l); l.kind === "hyphen" ? p.text(...,"-", "cp-lyric") : p.line(l.x1, l.y, l.x2, l.y, "cp-lyric-ext"); }
```

Upright, not italic: `render.js` `SvgPainter.measure` and `pdf.js` `PdfPainter.font` treat `cp-lyric` like `cp-chord`
(`/\bcp-(chord|lyric)\b/`). CSS: `.cp-lyric { font-family: Fraunces; font-style: normal; }`, `.cp-lyric-ext` stroke
0.1 S (add to `W` in `pdf.js`). The selection halo: `.cp-lyric.sel` as `.cp-expr.sel`.

### 3.6 Hit-testing and selection (`hit.js`, `editor.js`)

`thingAt`: after chords, `for (const ly of L.lyrics) if (|x − ly.x| ≤ ly.w/2 + tol && y ∈ [ly.y − 1.1, ly.y + 0.3])
return { type: "lyric", ev: ly.ev, n: ly.n, bar, staff }`. `things()` adds lyrics for the lasso. Selecting a lyric
selects the **syllable** (id `evId:n`), not the note: delete removes the verse's syllable; tapping it in the Lyrics rail
retypes it (§4). The rail's selection summary (`editor.js` ~line 129 `sel`) gains `lyrics: xs.every(type==="lyric")`.

### 3.7 Tests

`compose-lyrics.test.mjs` (new): one baseline per system/staff/verse; the line drops under a low note for that system
only; dynamics flip above on a lyric system and stay below on a plain one; a long syllable widens its column and the
bar still justifies; hyphen present/dropped by gap; extender to the melisma's last note, split across a break; nothing
drawn on a tied-in note; two verses stack `LYRIC_STEP` apart; paint reaches both painters (the PDF test renders a page
with lyrics and the ink meter's `below` grows). Golden layout numbers are asserted with tolerance 1e-6 as elsewhere.

---

## 4 · The Lyrics rail and entry flow (WSHED-177)

### 4.1 A new rail — `lyrics`

Decision: a new rail (`RAILS` in `rails.js`), off by default like every rail but the first three, listed in Options ▾ →
Rails as *Lyrics*. Not a hold menu on Expression: lyric entry is a **mode with a keyboard**, and it has state (the verse,
the note it is on).

Left to right, one line that scrolls (a rail never wraps):

| control | does |
|---|---|
| **verse ▾** `1` | the verse being written / shown lit; rows 1–4, used verses in full ink (the voice picker's pattern, `cp-voice-pick`) |
| **the field** | a text input, `maxlength=40`, `autocapitalize=off`, `autocorrect=off`, `spellcheck=false`, placeholder *tap a note, then type* |
| **−** (hyphen) | commits the field as a `begin`/`middle` syllable and moves to the next note |
| **␣** (space) | commits as `single`/`end` and moves to the next note |
| **—** (melisma) | commits with `ext: true` and moves to the next note **after the melisma** (the next note that is not a candidate — practically: the next note; the user keeps pressing — until the melisma's end, then types) — simpler rule: **—** = commit + `ext` + advance one note; pressing **—** on an empty field on a note with no lyric just advances. |
| **←  →** | move to the previous / next note of the voice without committing (the field shows that note's syllable if any) |
| **clear** | removes this verse's syllable from the note under the cursor |

On a hardware keyboard the same keys work inside the field: `-` and `Space` commit-and-advance (a space inside a
syllable is therefore impossible — Gould: syllables never contain spaces; an underscore `_` in the field inserts a
literal space for the rare "a-" case… **no**: keep it strict, no spaces in syllables, say so in the help), `Enter` =
space, `Shift+Space` = melisma, `ArrowLeft/Right` = move, `Backspace` on an empty field = move back and edit,
`Escape` = leave lyric entry.

### 4.2 The flow

1. The rail is shown. Tapping a **note** (Place or Select mode) while the Lyrics rail is **armed** (its field focused,
   or the verse picker tapped) puts the **lyric cursor** on that note: the note gets the selection halo in the lyric
   colour (`.cp-lyric-cursor`), the field is focused, showing its existing syllable for the verse if any.
2. Type; **−** / **␣** / **—** commit (via `setLyric`) and advance (`nextLyricNote`). The engraver re-runs on each commit
   (`commit(next)`, one undo step per syllable — matches how a note placement is one step).
3. At the end of the voice the cursor stays on the last note; a toast "last note of the voice" once.
4. Leaving: tap elsewhere / Escape / switch rail. The field blurs; an uncommitted syllable is **committed as `single`**
   (never lost — Leif's rule against half-measures).

`syl` is set by the key: **−** after a syllable whose previous syllable (same verse, the previous lyric note) was
`begin`/`middle` → `middle`, else `begin`; **␣** after a `begin`/`middle` → `end`, else `single`. The engine helper
`sylFor(prev, key)` is pure and unit-tested.

**Pen | Touch** (WSHED-129/150): the flow is the same; on an iPad the on-screen keyboard appears when the field focuses —
the score pane shrinks as sheets already do (`min-height: 0` rule, WSHED-113), and the cursor's note is scrolled into
view (`scrollIntoView` on the halo's bounding box after layout). Verified in E2E at phone width.

**Voice:** the lyric cursor follows the **active voice** (`voice` in the editor state): tapping a note of another voice
moves the active voice (as it does today) and the cursor to it.

### 4.3 Retype on selection

With one or more lyric syllables selected (§3.6) the field shows the first one's text and **set** (Enter) retypes every
selected syllable's `text` (`syl` kept) — the palette-on-selection pattern (`setExpressionValue`). The verse picker on a
selection moves the syllables to the chosen verse (`setLyric` with the new `n`, removing the old — refused with a Nudge
when the target verse already has a syllable on that note).

### 4.4 Tests

E2E (`tests/e2e/compose.mjs`, new step *lyrics*): turn the rail on in Options; tap the first note; type `Glo`, press
**−**, type `ry`, press **␣**, type `be`, press **—**; assert three `.cp-lyric` texts, one hyphen, one extender; undo
once removes the last syllable; select a syllable by tapping it and delete; verse 2 adds a second line below; export
MusicXML and re-import keeps the three syllables. Unit: `sylFor`, `nextLyricNote` across a bar and over rests / tied
notes.

---

## 5 · Help, QA, site (WSHED-178)

- New article `content/help/compose/26-rail-lyrics.md` (*The Lyrics rail*) with a screenshot per `COMPOSE_HELP_DESIGN.md`;
  update Overview ("What is not here yet" loses lyrics), Rails, MusicXML ("Lyrics … travel both ways"), Export PDF
  (lyrics print upright), Shortcuts (the keys of §4.1).
- `COMPOSE_QA.md`: a Lyrics section (entry on iPad with the on-screen keyboard; hyphen/extender over a system break;
  a chord with a syllable; dynamics flipped above; print; MusicXML round trip through MuseScore).
- `content/tools/compose.md`: one paragraph; regenerate with `node dev/build-site.mjs`.
- `COMPOSE_DESIGN.md` §12 row "Lyrics" → points here; `COMPOSE_MUSICXML_DESIGN.md` §2 ignored-list updated.

---

## 6 · Order of work, and what each story leaves working

| story | lands | the app after it |
|---|---|---|
| WSHED-175 vertical metrics | `metricsOf`, consumers, tests | identical pixels for every existing piece (asserted); the layout is ready for a band below any staff |
| WSHED-174 model · engine · MusicXML | `validate`, `setLyric`…, `lyricRuns`, import/export + golden | a MuseScore file with lyrics imports and exports them intact; nothing is drawn yet |
| WSHED-176 engraving | lyric line, pads, hyphens, extenders, dynamics flip, both painters, hit-test | imported lyrics appear on screen and on paper; selectable, deletable |
| WSHED-177 the rail | rail, cursor, keys, retype, E2E | lyrics can be written |
| WSHED-178 help · QA · site | docs | shippable |

175 → 174 can run in either order (independent files); 176 needs both; 177 needs 176; 178 last. Each story is one
release (`sw.js` CACHE + `version.js` VERSION), tested on 8789 then on prod per `chopinly-ops.md`; the epic closes when
Leif has written a verse on the iPad.
