# Takes — design (WSHED-75, 2026-09-05)

Not a generic audio recorder. **Record takes, have them associated with a
goal, listen back, compare over time.** No trim, no effects, no rename.

## The loop

- **Today**, clock running: a `● take` link beside `+ note` in the hero. Tap → a
  red recording strip (dot, elapsed, meter, pause, **keep**). Keep → the take
  appears under **takes today** as *time · goal · length* with a waveform. The
  take is linked to the goal and the day because the clock says what you are
  working on. Idle: `● record a take` under the play button asks *What is this a
  take of?* (the goal picker in `take` mode).
- **Goal page**: a **takes** section above the practice record, grouped by day,
  starred first within a day, ten at a time; days in the practice record that
  have takes carry a small red chip that jumps to the section. **compare** in
  the section header: tap A, tap B → a bar with *A then B* and **flip** (jump to
  the other take at the same relative spot).
- **Recorder** (tool menu, instruments group): the same recorder with room — goal
  chip (the running goal, else the last used, else pick), big red button, meter,
  elapsed, pause / resume / discard; every take grouped by goal, newest first,
  with compare and *save this take to a file*.
- **One star per take** (*keep this one*). **Hold a row to delete.** A take
  shorter than 0.7 s is not kept; a take stops itself at ten minutes and is kept.

## Data

| where | what |
|---|---|
| logbook doc `takes[]` | `{ id, goalId, recordedAt, durationMs, size, mime, starred, peaks[≤64], updatedAt }` |
| sync | kind `take` in `KINDS` (`js/lib/merge.js`, shared with `functions/lib/sync.js`); envelopes, tombstones, `pending` exactly like notes; deleting a goal tombstones its takes |
| device | the audio `Blob` in IndexedDB `chopinly-takes/blobs` keyed by take id (`js/lib/takes/store.js`); `localIds` mirrors it synchronously so rows can render "here" vs "on another device" |

The audio **never leaves the device**. Another device sees the row greyed
(*on another device*) with no play button. `takeStore.attach(logbook)` garbage
collects blobs whose take is gone (deleted here, elsewhere, or with its goal).
*Sign out & clear this device* clears the blob store; *delete account* keeps the
device's local copy, as it does for the rest of the logbook.

## Recording

`js/lib/takes/recorder.js`: `MediaRecorder` on the shared microphone constraints
(no echo cancellation / noise suppression / AGC), in the browser's native
format — `audio/webm;codecs=opus` on Chrome and Android, `audio/mp4` (AAC) on
iPhone — at 96 kb/s (≈ 0.7 MB / minute). It keeps **its own clock** (WebM blobs
from MediaRecorder report `duration = Infinity`), so `durationMs` is
authoritative and the scrubber uses it. A level sample every 50 ms feeds the
meter and, folded into 48 bins (`peaks.js:downsample`), the take's waveform.

## Playback

`js/lib/takes/player.js`: one `<audio>` for the whole app, so one take plays at
a time; object URLs from the blob store; progress events at 10 Hz drive the
waveform fill on whichever rows are on screen. **Compare** holds `{ a, b }`:
`compare(a, b)` plays A then B; `flip()` jumps to the other side at the same
fraction of the way through.

## Storage

`navigator.storage.persist()` is requested on the first put (Safari otherwise
evicts idle sites after a week). The account sheet's **takes on this device**
row shows count + MB and opens a sheet with *remove unstarred older than 30 /
90 days* and *remove all takes from this device* — metadata stays, rows go grey.

## Tests

- `tests/takes.test.mjs`: doc ops, cascade, envelopes, merge with the new kind,
  peaks / durations / bytes.
- `tests/e2e/takes.mjs`: Chromium with a fake microphone
  (`--use-fake-device-for-media-stream`): record from the hero, row + waveform,
  play / star / persist, goal page section + compare bar, Recorder tool, storage
  sheet purge, idle record → picker.
- Not covered by automation and to be checked on a phone: iPhone Safari's MP4
  recording and playback, and persistent-storage behaviour.
