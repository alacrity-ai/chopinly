# Scores — the iPad and phone checklist (WSHED-98)

The automated suites (`tests/e2e/scores.mjs`, `scores-cloud.mjs`, the score step in
`accounts-sync.mjs`) prove the mechanics in headless Chromium. These are the things
only a real device tells you. Run on the iPad (Safari, installed to the home screen)
and on the phone; tick, or file the finding on the phase's card.

## Import and library
- [ ] Files → share → Chopinly (or the **score** button): an engraved PDF appears with its title and composer read from the document.
- [ ] A 30 MB scan imports in under ~10 s; the thumbnail appears; the row says the right page count.
- [ ] Search by composer, by a word in the title, by a tag; *by composer* grouping; sort by recent / title / composer.
- [ ] Hold a row → details: edit title, composer, tags (chips), link a goal.

## Reader
- [ ] Tap right third → next page; left third → previous; middle → bar shows / hides. No accidental turns when tapping the bar.
- [ ] A 30 MB scan: cold open shows the first page within ~1 s and later pages without a visible wait after the first pass (the persistent page tier is working). Warm open is instant.
- [ ] Rotate: portrait fits the width, landscape fits the page. Pinch does nothing surprising.
- [ ] A Bluetooth page-turner pedal (arrow / Page keys) turns pages.
- [ ] The screen stays awake while the reader is open; sleeps again after leaving.
- [ ] Airplane mode: the score still opens and turns.
- [ ] Reopening a score lands on the page you left, on this device.

## Bookmarks and ink
- [ ] Add a bookmark with a label; the button fills; jump from the list.
- [ ] Pencil: a fingering (short strokes) lands where the tip was, with no visible lag; pressure changes the width.
- [ ] Highlighter over a bar is translucent; the eraser sweeps a stroke; undo / redo.
- [ ] The palm on the glass does not draw; a finger still turns pages while the Pencil is up; the finger toggle lets a finger draw.
- [ ] Ink survives closing and reopening the score; *save this score to a file* gives back a clean PDF (no ink).

## Practice link
- [ ] Details → *practice this*: the clock starts; the bar shows *● practicing*; Today's hero shows a score link.
- [ ] Play on a goal with a score → the *open the score?* sheet; *stay here* keeps the clock.

## Account and cloud (P3)
- [ ] Sign in: the library grows an **upload** button. Tap it → checkboxes on every row, *select all*, the used / allowance line reads *0 of 100 MB used (promotional)* (or *premium*).
- [ ] Select all, upload: rows go up one at a time with a progress bar; the screen stays awake; *stop* halts after the file in flight. On finish: *N scores backed up*, a cloud glyph on each row.
- [ ] Switch away mid-upload (Home button) and come back: Safari may have paused the upload — the row that was in flight is still selected; tapping upload again resumes from it, files already up are skipped.
- [ ] Phone, same account: rows read *in the cloud — tap to download*; tapping downloads with a progress toast and opens the score; bookmarks and ink from the iPad are there; ink drawn on the phone appears on the iPad after a sync.
- [ ] Account sheet → scores on this device: *X of 100 MB of cloud space used (promotional) · N scores in the cloud*; *remove downloaded scores not opened in 90 days* leaves scores that are not in the cloud alone.
- [ ] Details → *remove from the cloud* frees the space; *upload to the cloud* puts it back.
- [ ] Delete a score on the iPad → it leaves the phone's list and the cloud; delete account → the device keeps its copies, a fresh sign-in has no files.
- [ ] Sign out & clear this device removes the PDFs from the device; sign in again on the same device → *tap to download* rows.

## Install and wait
- [ ] Installed PWA, a week later, still holds the library (storage persisted; Safari did not evict).
