# Keyboard module (WSHED-73)

The piano keyboard is a reusable module in `js/lib/keyboard/`, and the **Piano**
tool (`js/tools/keyboard/`) is only the first thing built on it. Ear training,
interval drills and playback demos should mount the same view.

## Pieces

| file | what | depends on |
|---|---|---|
| `layout.js` | pure math: keys in a MIDI range with positions in white-key units, octaves that fit a width, the DAW key map, velocity from strike position | nothing (node-tested in `tests/keyboard.test.mjs`) |
| `keyboard.js` | the view + input: renders keys into a host, turns fingers / mouse / the computer keyboard into `noteon` / `noteoff` | `layout.js`, the `.kb-*` CSS in `css/app.css` |
| `piano.js` | the voice: polyphonic additive piano-ish tone on the shared `AudioContext`, velocity → loudness + brightness, sustain pedal | `music.js` (`midiToFreq`) |

The view makes no sound and the voice draws nothing; the tool wires them.

## Using the view in an exercise

```js
import { createKeyboard } from "../../lib/keyboard/keyboard.js";
import { createPiano } from "../../lib/keyboard/piano.js";

const kb = createKeyboard(hostEl, { from: 60, to: 72, labels: "none", keymap: false });
const piano = createPiano(getAudio);
kb.on("noteon", ({ midi, velocity, source }) => { piano.noteOn(midi, velocity); judge(midi); });
kb.on("noteoff", ({ midi }) => piano.noteOff(midi));

kb.light(64, "target");        // "target" | "correct" | "wrong" | null
kb.press(67); kb.release(67);  // programmatic — for "listen to this" demos (source: "api")
kb.setRange(48, 72); kb.setLabels("all"); kb.held(); kb.releaseAll(); kb.destroy();
```

`source` on `noteon` is `"pointer"`, `"keyboard"` or `"api"`, so an exercise can
ignore its own demo presses. The view holds a key down while *any* source holds
it, so a finger and the A key on the same note release cleanly.

## Sizing

The host gets `--kb-whites` (count of white keys); the CSS turns `--x`/`--w`
per key into percentages and gives the keyboard a `whites / 4.6` aspect ratio.
`fitOctaves(width)` says how many octaves have touchable (≥ 25 px) white keys:
two on a phone, up to four on a desk.

## Colors

Keys use the skin tokens `--key-white`, `--key-black`, `--key-ink` (one triple
per skin in the skins block) and bloom with `--accent` when down, so every
appearance gets a keyboard that belongs to it. Exercise lights use `--accent`
(target), `--ok` (correct) and `--red` (wrong).
