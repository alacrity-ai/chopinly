---
slug: rail-lyrics
title: "The Lyrics rail"
section: rails
order: 11
summary: "Words under the notes — tap a note, type its syllable, and let − space and — carry you along the melody."
keywords: [lyrics, lyric, words, syllable, syllables, verse, verses, hyphen, melisma, extender, singer, vocal, song, text under the staff]
---

![The Lyrics rail.](/img/help/rail-lyrics.png)

## Writing a verse

Show the rail (Options ▾ → Rails → *Lyrics*), tap the **field**, then tap the first **note** of the melody. The note turns the accent colour: it holds the **lyric cursor**, and whatever you type goes under it. Three keys commit the syllable and move the cursor to the next note of the voice — over any rests, and over a note that is only tied in:

| key | commits the syllable as | and then |
|---|---|---|
| **−** (hyphen) | part of a word that goes on — a hyphen is drawn to the next syllable | the next note |
| **␣** (space) | the end of a word, or a whole one | the next note |
| **—** (melisma) | a syllable sung on through the notes that follow — an **extender** line runs to the last of them | the next note |

So *Glory be* on four notes is: `Glo` **−** `ry` **␣** `be` **—**. On a hardware keyboard the keys are the same: `-`, `Space`, and `Shift+Space` (or `_`) for the melisma; `Enter` is a space. A syllable never holds a space — the space is the key that ends it.

**←** and **→** move the cursor along the voice without committing anything; the field shows the syllable already under the note, if there is one, selected so that typing replaces it. **clear** takes this verse's syllable off the note. `Backspace` on an empty field steps back to the previous note to fix it. At the last note of the voice the cursor stays put.

Leaving — a tap anywhere else on the score, `Escape`, or hiding the rail — never loses what you typed: an unfinished syllable is kept on its note as a whole word. Every syllable is one undo step.

## Verses

The **verse ▾** picker says which verse you are writing; a piece can carry four. Verse 2 sits one line under verse 1, each verse on its own baseline across the whole system. Verses the piece already uses show in full ink in the menu.

## Where the words sit

Lyrics are set upright, under the staff, every syllable of a system on **one line** — they read as a line of words and never dodge a single low note; a ledger note in the system moves the whole line down for that system only. A syllable is centred on its note's head (on a chord, under the chord), and a long syllable under a short note widens the bar so the words never collide. The staff keeps a band below it for the words, so the staff beneath moves down; verses on the bottom staff hang into the room between systems.

Dynamics and hairpins on a staff that has words in that system go **above** the staff, as vocal music does, so the words stay clear; pedal and 8vb lines go under the words. Chord symbols and tempo marks move up over them.

A tied-in note shows no syllable of its own — the previous one is still sounding — unless the syllable on it is a whole word.

## Changing them

Tap a syllable to **select** it (Place or Select mode); **Delete** removes it, and a lasso picks up several. With syllables selected, type in the field and press `Enter` to **retype** every one of them (a hyphenated syllable stays hyphenated), or pick a verse to **move** them to it. Copy and paste carry the words with their notes; a note that becomes a rest loses its words.

## Printing and files

The words print upright in the serif face, on paper and in the PDF. A MusicXML file carries them both ways — verses, hyphenation and extenders — so a song from MuseScore, Sibelius, Finale or Dorico arrives with its words, and yours leave with theirs.
