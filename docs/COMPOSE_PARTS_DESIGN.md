# Compose — parts (N instruments, N staves)

**Epic:** WSHED-179. **Stories:** WSHED-180 (model v4 · staff list · engine guards), WSHED-181 (engraving: brackets,
names, N-staff systems), WSHED-182 (the Instruments sheet), WSHED-183 (N-part MusicXML import and export),
WSHED-184 (playback and the editor's staff-aware controls), WSHED-185 (paper: page fitting and the Layout view),
WSHED-186 (help · QA · site).
**Asked for by:** Leif, 2026-10-08 — "we might as well give the capability to add N additional instruments … throw out the
piano clef entirely and compose a string quartet." **Depends on:** WSHED-175 (vertical metrics computed per document —
shipped under the lyrics epic, [`COMPOSE_LYRICS_DESIGN.md`](COMPOSE_LYRICS_DESIGN.md) §2). Lyrics are otherwise
orthogonal and nothing here assumes them.

Every decision below says where it lives (file, function or constant) and how it is tested. The audit this plan rests on
was taken 2026-10-08 against `main` at v126; the counts quoted are from it.

---

## 0 · What the audit found

The grand-staff assumption is **shallow in the engine and deep in exactly one place**.

- `doc.parts[0].staves` appears 12× in `engine.js`, 6× in `musicxml.js`, 2× each in `layout.js`, `model.js`, `play.js`,
  1× in `editor.js`. Every one is `const nStaves = …` followed by a loop over staves, or a bounds check. None says `2`.
  `measures[].staves[]` is already a flat array; `hit.js` picks the nearest staff from a list; the voice, cross-staff,
  beam, tie and slur code is keyed by staff index. `play.js` walks every staff.
- **The one deep assumption**: the vertical metrics are module constants (`layout.js:14-18`). WSHED-175 turns them
  into `metricsOf(doc)`; this epic gives that function its real job — a staff list with per-staff gaps, part by part.
- Piano-specific behaviour that becomes a *guard*, not a rewrite: pedal and `una corda` lines (`addPedal`, the Piano
  rail), fingering placement (`layout.js:521` — "above the upper staff's notes and below the lower's"), cross-staff
  notes (`crossStaff` — adjacent staves only), the default clefs `{0: treble, 1: bass}` (`model.js:80`), the brace
  (`paint.js:62`), MusicXML's single `<part>` (`musicxml.js:82-83`, import `map` at `:254-255`).
- The layout editor's pins (`pins.js`) are horizontal — break / keep / weight on barlines — and the packer already fits
  "more onsets → wider bars → fewer per system". **Nothing in the pin semantics changes.** What changes is page fitting
  (taller systems → fewer per page), which is `planPages` reading `L.metrics` (WSHED-175) — no new rule.

So: a model change with a migration, one engraving story, one setup sheet, and MusicXML — plus guards.

---

## 1 · Model v4 (WSHED-180)

### 1.1 Shape

```js
doc.v = 4
doc.parts = [
  { id: "p1", name: "Violin I", abbr: "Vln. I", instrument: "violin", staves: 1, clefs: ["treble"] },
  { id: "p2", name: "Violin II", abbr: "Vln. II", instrument: "violin", staves: 1, clefs: ["treble"] },
  { id: "p3", name: "Viola",     abbr: "Vla.",    instrument: "viola",  staves: 1, clefs: ["alto"] },
  { id: "p4", name: "Cello",     abbr: "Vc.",     instrument: "cello",  staves: 1, clefs: ["bass"] },
]
// measures[i].staves stays ONE FLAT ARRAY across parts, in part order: staff k of the document is
// parts[p].staves summed up to p, plus the staff's index inside the part. Nothing else in the measure changes.
```

| field | rule |
|---|---|
| `id` | unique in `parts`; `"p<n>"`; never reused within a document (MusicXML `P<n>` maps from it) |
| `name` | 1–`PART_NAME_MAX` (= 40) chars, drawn before the first system |
| `abbr` | 0–`PART_ABBR_MAX` (= 12) chars, drawn before later systems; empty = name on the first system only |
| `instrument` | a key of `INSTRUMENTS` (§1.3) or `"other"`; drives the default clefs, the bracket group, the sound (v1: nothing but piano) and MusicXML's `<instrument-sound>` |
| `staves` | 1–`PART_STAVES_MAX` (= 3: organ) |
| `clefs` | the part's **default** clefs per staff, used when a new document or a new part is made — the clefs in force are still `measures[0].clefs[k]` on the flat index, as today |
| `PARTS_MAX` | 12 parts, 16 staves in all (`STAVES_MAX`) — a wind quintet, a string orchestra, a hymn with organ all fit; a full orchestra is not this app |

Why the flat staff array stays: every engine function, the engraver's column pass, cross-staff, voices, beams and the
hit-test key by staff index today, and they are right to — a bar's columns are shared by *all* staves. The part is a
grouping of staves for brackets, names, clefs and sound. The one new primitive everything uses:

```js
// model.js
export const staffList = (doc) => doc.parts.flatMap((p, pi) => Array.from({ length: p.staves }, (_, k) => ({ part: pi, index: k, first: k === 0, last: k === p.staves - 1 })));
export const nStavesOf = (doc) => doc.parts.reduce((n, p) => n + p.staves, 0);
export const partOfStaff = (doc, k) => staffList(doc)[k].part;
```

Every `doc.parts[0].staves` in the codebase becomes `nStavesOf(doc)` (mechanical; the audit's 24 sites). `newMeasure(n, time)`
already takes a count.

### 1.2 Migration — `upgrade(doc)` (`engine.js:1345`)

v3 → v4: `parts[0]` gains `abbr: ""`, `instrument: "piano"`, `clefs: ["treble", "bass"]`; `v = 4`. Nothing in the
measures moves. `validate` accepts `[1, 2, 3, 4]` and runs the v4 shape check only when `v === 4`; the open path
(`editor.js` `upgrade(doc)` on load, as for v3) upgrades once and saves. Sync: an older app receiving a v4 body shows the
piece (it reads `parts[0].staves`, which is still right for a piano piece) — a multi-part piece on an older app would
mis-validate (`m.staves.length !== parts[0].staves`), which is the normal "update the app" situation Chopinly already has
for new kinds; the release notes say so.

### 1.3 Instruments (`js/lib/compose/instruments.js`, new, pure)

```js
export const INSTRUMENTS = {
  piano:  { name: "Piano",  abbr: "Pno.",  staves: 2, clefs: ["treble", "bass"], group: "keyboard", sound: "piano", xml: "keyboard.piano" },
  voice:  { name: "Voice",  abbr: "Voice", staves: 1, clefs: ["treble"], group: "voice", sound: "piano", xml: "voice.vocals" },
  soprano / alto / tenor (treble; tenor = treble, octave clefs are not modelled — note on the card) / bass (bass clef) …
  violin: { … clefs: ["treble"], group: "strings", xml: "strings.violin" }, viola (alto), cello (bass), contrabass (bass),
  flute, oboe, clarinet*, bassoon (bass), horn*, trumpet*, trombone (bass), tuba (bass),
  guitar (treble; sounds an octave lower — not modelled, see §7), organ (3 staves: treble, bass, bass),
  other:  { name: "Instrument", abbr: "", staves: 1, clefs: ["treble"], group: "other", sound: "piano", xml: "" },
};
```

`*` transposing instruments are listed at **concert pitch** — written = sounding — and the sheet says so under the name
(§3). A transposition field is deliberately not modelled this round (§7).

`group` drives brackets (§2.2): consecutive parts of one group (`strings`, `woodwind`, `brass`, `voice`) share a bracket;
`keyboard` parts get the brace they have today; `other` gets a bare bracket when it has 2+ staves, nothing when 1.

### 1.4 Engine guards (`engine.js`)

| today | becomes |
|---|---|
| `crossStaff(doc, ids, dir)` — any adjacent staff | only to a staff **of the same part** (`partOfStaff` equal), else `Nudge("notes cross only within an instrument")` |
| `addPedal` / `addOttava(dir < 0)` / `textline` *una corda* — any staff | pedal and *una corda* only on a staff of a `keyboard`-group part (`Nudge("the pedal belongs to the piano")`); `8va`/`8vb` stay for everyone |
| `finger` — any note | unchanged (strings and winds use fingering too); only its *placement* changes (§2.4) |
| `paste` with a two-staff clipboard | lands only where the target staff and the next are in **one part** (today: `staff ≤ nStaves − clip.staves`); else `Nudge("that phrase needs two staves of one instrument")` |
| `setClef` | unchanged (per staff) |
| `insertBar`, `deleteBar`, `trimBars`, `setTime` | unchanged — they use `nStavesOf` |

New engine functions for the sheet (§3), each pure, each returning a new document:

| function | does |
|---|---|
| `addPart(doc, instrumentKey, { at = parts.length, name?, abbr? })` | appends/inserts the part; every measure gains `staves` new staff entries (`{ voices: [barRests(time)] }`) at the right flat offset; `measures[0].clefs[k]` set from the instrument's defaults (re-indexing every `clefs`, `clefChanges[].staff`, `expressions[].staff`, and `ev.cross` targets at or after the insertion point — one helper `shiftStaffRefs(doc, from, by)` does all of it and is unit-tested on its own) |
| `removePart(doc, partId)` | the inverse; refused when it is the last part (`Nudge("a piece needs one instrument")`); drops that part's staves from every measure, expressions and clef changes on them, and crossed notes pointing into them become uncrossed; **destructive — the sheet confirms** (§3) |
| `movePart(doc, partId, dir)` | swaps with its neighbour; `shiftStaffRefs` twice |
| `renamePart(doc, partId, { name, abbr })` | names only |
| `setPartStaves(doc, partId, n)` | 1 ↔ 2 (↔ 3) for a part: adds a staff with the instrument's next default clef, or removes the **last** staff of the part (refused unless it holds only rests — `Nudge("empty the staff first")`) |

`validate` (v4): `m.staves.length === nStavesOf(doc)`, parts ≥ 1, each part's shape, every `clefs[k]`/`clefChanges`/
`expressions[].staff` < `nStavesOf`, `ev.cross` stays inside the part, `PARTS_MAX`/`STAVES_MAX`.

### 1.5 Tests

`compose-parts.test.mjs` (new): `staffList` for piano / quartet / organ+voice; v3 → v4 upgrade is byte-identical in the
measures; every guard's Nudge; `addPart` in the middle re-indexes an expression, a clef change and a crossed note
correctly; `removePart` of a middle part; `setPartStaves` both ways and its refusal; `validate` on each. The existing
suites run unchanged on the upgraded piano fixture (the proof that nothing moved).

---

## 2 · Engraving (WSHED-181)

### 2.1 Vertical metrics with parts (`metricsOf`, WSHED-175's function)

```
gapBelow(k) = staff k is the last of its part ? PART_GAP : STAFF_GAP     (+ the lyric band if lyrics are present on k)
PART_GAP = 10 S    STAFF_GAP = 8 S (unchanged inside a part)
```

Gould: staves within an instrument sit closer than instruments. The last staff's gap is `SYS_GAP` as before. A quartet's
block is `4·4 + 3·10 = 46 S`; the piano's stays `16 S`. Systems stay uniform (the editor's contract).

### 2.2 Left of the system: barline, brackets, brace, names

Today `paint.js:60-62`: one joining barline from the top staff's top to the bottom staff's bottom, a brace when there are
two staves. Becomes, per `L.metrics.groups` (computed from parts and `INSTRUMENTS[…].group`):

- **The system barline** joins the first staff's top line to the last staff's bottom line — unchanged, always.
- **Brace** (`G.brace`) for each `keyboard` part with 2+ staves, spanning its staves, at `x = 0.85` as today.
- **Bracket** (a thick vertical rule 0.5 S wide at `x = 0.3`, with Bravura `bracketTop`/`bracketBottom` hooks, U+E003/E004)
  for each run of ≥ 2 consecutive parts of one non-keyboard group, spanning their staves; a `voice`-group run of one part
  gets none; an `other` part with 2+ staves gets a bracket alone.
- **Sub-brackets** are not drawn (Gould uses them for divisi; out of scope).
- **Barlines between parts**: through-barlines join the staves of one part and the parts of one bracket group; between
  groups (and between a bracketed group and a lone part) barlines **break** — each group draws its own barline run.
  `sys.barlines[].x` is shared; `paint.js` draws the rect per group span (`metrics.barlineSpans = [{ top, bottom }]`).
  Repeat dots go on every staff as now.

`LEFT` (`layout.js:40`, 1.6 S) becomes **per layout**: `LEFT = 1.6 + bracketW + nameW` where `bracketW` is 0 (piano only,
as today), else 1.1; `nameW` is 0 when every part's name is empty (today's piano piece prints no name and must not
move), else the widest measured name on the first system / abbreviation on later systems + 1.0 S. `leadingW` and the
packer read `widthS − LEFT_first/LEFT_rest` per system. **A one-part piano piece lays out byte-identically** — the golden
layout tests prove it.

**Names**: `L.partNames = [{ text, x, y, system, anchor: "end" }]`, right-aligned to `x = LEFT − bracketW − 0.6`, vertically
centred on the part's staves (`(topOfFirst + bottomOfLast) / 2 + 0.4`), size 1.3 S upright on system 0 (full name),
1.15 S on the others (abbr; nothing when abbr is empty). Painted by `p.text(…, "cp-part-name", …)` — upright in both
painters (the `cp-chord|cp-lyric` rule gains `cp-part-name`). A one-part piece with the default name "Piano" **does not
print its name** (`parts.length === 1` → no names; Gould: a solo part is not labelled). The ink meter's `left` extent
covers an over-long name.

### 2.3 Everything keyed by staff — verified, not changed

The column pass (union of onsets across `m.staves` — all of them), accidentals' per-drawn-staff memory, collision pads,
beams (`system:staff:bar:voice`), cross-beams (within a part now, by the guard), ties, slurs, marks, tuplets, expressions
(`exprLine(si, staff, …)`), chord lines (per staff), `similes` (per staff), courtesy signatures (per staff), clef changes
(per staff), hit-testing (`sys.staves[]`). Each is exercised by the quartet fixture in the tests below; this story's
job is to run them and fix what the fixture finds, not to redesign them.

Key signatures are **the same on every staff** (one `key` per bar) — correct at concert pitch (§7).

### 2.4 Piano-specific placement becomes part-aware

- **Fingering** (`layout.js:521` `above = d.drawStaff === 0`): above for the **first staff of its part**, below for the
  others; a one-staff part: above. (Strings: above. Unchanged for the piano.)
- **Rests in a two-voice staff**, **stem rules**, **articulation side**: already per staff.
- **The form lane** (tempo, rehearsal, signs, endings: `layout.js:646-685`) draws above the **top staff of the system**
  as today. Gould puts tempo above the top staff and, in large scores, again above the strings; one lane is right for ≤ 16 staves.
- **Dynamics for a one-staff vocal part** sit above by the lyrics rule (WSHED-176 §3.2); for other one-staff parts, below as today.

### 2.5 Tests

`compose-parts-layout.test.mjs`: the quartet fixture lays out with 4 `staffTop`s at `0, 14, 28, 42` (+ sysTop), one
bracket spanning all four, no brace, through-barlines across the group, names on system 0 and abbreviations after; a
voice + piano fixture: a brace on the piano, no bracket on the voice, barlines broken between them, `PART_GAP` between
the voice and the piano's treble staff; the solo-piano golden layout is unchanged to 1e-6 (every existing layout test
passes without edits — that *is* the assertion); fingering above on a cello; `crossStaff` across the voice/piano boundary
refused; a PDF renders a quartet page with the bracket and names (byte-level test like the existing export tests, and
the ink meter's `left` includes the name).

---

## 3 · The Instruments sheet (WSHED-182)

**Decision: a sheet, not a rail.** Instruments are the piece's identity, edited rarely, like title and composer — they
belong with the details sheet, not on the editing surface. Opened from **File ▾ → Instruments…** (`FILE_ITEMS` in
`rails.js`) and from a new row at the bottom of the details sheet (`details.js`: *Instruments · Violin I, Violin II,
Viola, Cello* → opens it). Also offered when **creating** a piece: the details sheet's *start composing* gains a
**for ▾** picker beside the title — *Piano* (default) · *Voice and piano* · *String quartet* · *Choir (SATB)* ·
*Guitar* · *Choose…* (opens the sheet after creation). Templates live in `instruments.js` as `TEMPLATES`.

The sheet (`js/tools/compose/instruments.js`, new; `openSheet` like `details.js`):

```
Instruments                                          done
┌─────────────────────────────────────────────────────────┐
│ ≡  Violin I        Vln. I      violin · 1 staff   ▲ ▼ ✕ │
│ ≡  Violin II       Vln. II     violin · 1 staff   ▲ ▼ ✕ │
│ ≡  Viola           Vla.        viola  · 1 staff   ▲ ▼ ✕ │
│ ≡  Cello           Vc.         cello  · 1 staff   ▲ ▼ ✕ │
└─────────────────────────────────────────────────────────┘
+ add an instrument ▾   (the INSTRUMENTS list, grouped; "Other…" asks for a name)
```

- Name and abbreviation are inline text inputs (`renamePart` on blur, one undo step).
- ▲ ▼ call `movePart`; ✕ calls `removePart` after `confirm("remove Viola and its 24 bars of notes?")` when the part has
  notes, straight away when it holds only rests. The last part's ✕ is disabled.
- Tapping the *instrument · staves* text opens a small menu: the instrument list (changes `instrument`, and offers to reset
  the clefs to the instrument's defaults when the part is empty) and *1 staff / 2 staves* (`setPartStaves`; 3 for organ).
- Every change goes through `commit()` (undo/redo work across the sheet as they do for the details sheet's tempo).
- Keyboard: the sheet is a form; Tab order follows the rows.
- Pen and finger: no pointer-type branch (the Layout view's rule).

E2E (`tests/e2e/compose.mjs`, step *instruments*): new piece *for* String quartet → four staves, a bracket, names; add
a Piano → brace appears below; remove Violin II with a confirm; rename Cello → "Violoncello" shows on system 0; undo
twice. Phone width: the sheet scrolls, nothing widens the page (the mobile rule).

---

## 4 · MusicXML (WSHED-183) — the headline deliverable

### 4.1 Out (`toMusicXml`)

`<part-list>` lists every part: `<score-part id="P<n>"><part-name>…</part-name><part-abbreviation>…</part-abbreviation>
<score-instrument id="P<n>-I1"><instrument-name>…</instrument-name><instrument-sound>strings.violin</instrument-sound>
</score-instrument></score-part>`, wrapped in `<part-group type="start" number="1"><group-symbol>bracket</group-symbol>
<group-barline>yes</group-barline></part-group>` … `<part-group type="stop"/>` per bracket group of §2.2 (a brace part
needs no group: its `<staves>` does it).

Then one `<part id="P<n>">` per part. The measure writer (`musicxml.js:107-220`) runs **per part** over that part's
staff slice: `<staves>` = the part's count; `<staff>` numbers are **1-based within the part** (`k − partFirstStaff + 1`);
voice numbers `vi + 1 + 4·(k − partFirstStaff)`; clefs `number=` within the part; expressions filtered to the part's
staves; the form marks (tempo, rehearsal, signs, jumps, barlines, endings, measure-repeats) written **on the first part
only**, as MusicXML convention has it (readers apply them score-wide); `<backup>`/`<forward>` are per part as now. A
`cross` never leaves the part (guard), so `<staff>` of a crossed note stays valid.

### 4.2 In (`fromMusicXml`)

Today (`:254-258`) the importer keeps the first multi-staff part, else the first two single-staff parts, as staves 0–1,
and silently drops the rest. Becomes: **every part becomes a part**, in `<part-list>` order:

- `parts[n] = { id: "p<n>", name: <part-name> || "Instrument <n>", abbr: <part-abbreviation> || "", instrument:
  instrumentOf(<instrument-sound>, <part-name>) (a lookup on `xml` then a name match, else "other"), staves: stavesOf(part),
  clefs: the first bar's clefs per staff }`.
- `ourStaff(part, xs)` → the flat index `partFirstStaff[part] + xs − 1`. The rest of pass 1 is already written against
  `si`; the `[0, 1]` literals in passes 2–3 (`:416-418`, `:436-437`, `:459-467`) become loops over `nStaves`.
- `<part-group>` with `group-symbol` bracket/brace is read **only** to validate grouping expectations in tests — our
  brackets come from `INSTRUMENTS[].group`, so a file's grouping is not stored (§7 lists "custom bracket groups").
- A part with more than `PART_STAVES_MAX` staves or a score past `STAVES_MAX` refuses with the count. Percussion / TAB
  parts refuse as they do today (clef check), with the part named.
- The voice-count refusal (`:418`) runs per staff as now.
- A one-part, two-staff file yields a document identical to today's import (golden test unchanged).

### 4.3 Tests

`compose-musicxml.test.mjs` gains: `tests/fixtures/musicxml/quartet.musicxml` (MuseScore export of 8 bars, four parts,
one bracket) → 4 parts with the right instruments and clefs → `toMusicXml` → re-import equal; `voice-piano.musicxml`
(a vocal line with lyrics once WSHED-174 is in, over a piano part) → 2 parts, 3 staves, brace on the piano; a
`<part-group>`'d wind quintet → groups by instrument; the existing piano golden file unchanged byte for byte. The
transcription pipeline's `roundtrip.mjs` is run on the fixtures too.

---

## 5 · Playback and the editor's staff-aware controls (WSHED-184)

- **Sound**: every part plays on the piano voice (`createPiano`). Honest and said in the help: *"Every instrument plays
  with the piano's sound for now."* `INSTRUMENTS[].sound` is `"piano"` everywhere; a second voice (a sustained
  string-like tone from `js/lib/keyboard/`) is a later card on the epic, not this one. The timeline (`play.js
  timeline`) already carries `staff` on every note; the player ignores it today. **Per-part mute/solo** is not built
  (§7).
- **Velocities** (`velocities(doc)`) are per staff already.
- **The editor**:
  - the clef cursor's toast (`editor.js:344` "upper / lower staff") says the **part name and staff** (`Violin I`,
    `Piano, lower staff`);
  - the voice menu's *cross to the upper/lower staff* rows (`rails.js:86`) are enabled only when the neighbour is in
    the same part (`sel.up/down` computed with `partOfStaff`);
  - the Piano rail's pedal / una corda buttons are **disabled with a hint** when the active staff's part is not a
    keyboard (the active staff = the last tapped slot's staff, already tracked for the voice);
  - the ghost and the paste cursor use `L.nStaves` as today;
  - the playhead spans the whole system (`sys.top … sys.bottom`) — unchanged.
- **Scores export** (*Save to Scores as PDF*) and the export sheet: unchanged except through the plan (§6).

Tests: the voice-menu enablement on the quartet fixture (E2E), the Piano rail disabled on a violin staff (E2E), a quartet
plays all four staves (unit: `timeline` note count equals the fixture's).

---

## 6 · Paper: page fitting and the Layout view (WSHED-185)

With WSHED-175 in, `planPages` reads `L.metrics.blockH/sysH/sysGap`; nothing else in `pdf.js` is grand-staff-specific.
This story is **verification and the two real consequences**:

1. **A system that does not fit a page.** A 16-staff system at 1.8 mm is `(16·4 + 15·10) · 1.8 = 385 mm` — taller than
   Letter. Today `planPages` would make a page per system and let the ink run off. New rule: when `blockH + AIR·2 >
   availS` at the chosen staff size, the export sheet **refuses the size** with the smallest size that fits named
   (*"a 6-staff system needs 1.4 mm or smaller on Letter"*), the same way it refuses a pinned row that is `tight`. The
   plan returns `plan.tooTall = true` and the sheet disables *save*/*export* until the size or page changes. Pure
   function `minStaffMm(doc, page, margins)` in `pdf.js`, unit-tested.
2. **The Layout view** (`layoutview.js`) draws barline handles "the height of the system" from `hsys.top/bottom` — already
   from the layout, so they grow with the block. Verify the drag/weight/lock gestures on a quartet page in E2E; nothing
   in `pins.js` changes.

The default staff size for a **new multi-part piece** is scaled down once at export: `DEFAULTS.staffMm` stays 1.8 for
piano; the export sheet's first open for a piece with ≥ 3 staves proposes 1.6, ≥ 6 staves 1.4 (a one-line rule in
`exportsheet.js`, remembered per piece as today's options are).

Tests: `compose-export.test.mjs` — a quartet plans to full pages with no overlap (the existing invariants), `tooTall`
on a 12-staff fixture at 2.5 mm and not at 1.4 mm, `minStaffMm` monotone in the staff count.

---

## 7 · Decided here (say the word to change) and not in this round

**Decided:**
- **Concert pitch only.** Clarinet, horn, trumpet, guitar and tenor voice are written as they sound. A `transpose`
  field on the part (MusicXML `<transpose>`) is the obvious later addition and nothing here blocks it; it needs
  per-staff key signatures and the pitch spelling pass, which is its own design.
- **Brackets come from the instrument's group**, not from the file or the user. A custom grouping (two pianos bracketed;
  a sub-bracket for divisi) is listed below.
- **One tempo, one form lane, one key** for the score — as MusicXML and every ensemble score of this size.
- **Every part sounds like a piano** until a second voice exists.
- **The flat staff array** stays the model; parts are a grouping. No `measures[].parts[]` nesting.
- **`PARTS_MAX = 12`, `STAVES_MAX = 16`, `PART_STAVES_MAX = 3`.**

**Not in this round** (named on the epic for later cards): transposing instruments; custom bracket groups and
sub-brackets; per-part mute / solo / volume; a non-piano sound; part extraction (printing one part alone — the
Layout view would need a part filter; MuseScore does this via the MusicXML we now export, which is the honest answer
for now); hiding empty staves on a system (Gould's "French score" convention — valuable for choral + piano, a layout
rule later); octave clefs (tenor voice's treble-8); percussion / TAB; MIDI export (still "not yet", unchanged).

---

## 8 · Order of work, and what each story leaves working

| story | lands | the app after it |
|---|---|---|
| WSHED-180 model v4 | `staffList`, `nStavesOf`, `instruments.js`, upgrade, guards, `addPart`… | every existing piece upgrades silently; nothing visible changes; the engine can hold a quartet |
| WSHED-181 engraving | `metricsOf` with parts, brackets, names, `LEFT`, fingering rule | a quartet document (from a test fixture) draws correctly on screen and paper; piano pieces are byte-identical |
| WSHED-183 MusicXML | N-part import/export + fixtures | **any MuseScore / Sibelius / Dorico ensemble score opens in Chopinly** and goes back out; this is the first user-visible win and can ship before the sheet |
| WSHED-182 the sheet | Instruments sheet, *for ▾* templates | a quartet can be started and its parts managed in the app |
| WSHED-184 playback · controls | staff-aware rail states, part names in toasts | the editing surface says the right things on a violin staff |
| WSHED-185 paper | `tooTall`, default size proposal, Layout view verified | a quartet prints |
| WSHED-186 help · QA · site | docs | shippable |

180 → 181 → 183 → 182 → 184 → 185 → 186. 183 before 182 on purpose: importing real ensemble scores is the test bed for
the sheet. Each story is one release (`sw.js` CACHE + `version.js` VERSION), tested on 8789 then on prod per
`chopinly-ops.md`; the epic closes when Leif has opened a quartet from MuseScore and started one from scratch on the iPad.
