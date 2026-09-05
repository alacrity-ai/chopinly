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

const kb = createKeyboard(hostEl, { from: "C4", to: "E4", labels: "all", keymap: false, whiteWidth: "2.4rem" });
const piano = createPiano(getAudio);
kb.on("noteon", ({ midi, velocity, source }) => { piano.noteOn(midi, velocity); judge(midi); });
kb.on("noteoff", ({ midi }) => piano.noteOff(midi));

kb.light(64, "target");        // "target" | "correct" | "wrong" | null
kb.press(67); kb.release(67);  // programmatic — for "listen to this" demos (source: "api")
kb.setRange("C3", "C5"); kb.setLabels("all"); kb.setSize({ ratio: 3.5 }); kb.held(); kb.releaseAll(); kb.destroy();
```

`source` on `noteon` is `"pointer"`, `"keyboard"` or `"api"`, so an exercise can
ignore its own demo presses. The view holds a key down while *any* source holds
it, so a finger and the A key on the same note release cleanly.

## Ranges

`from` / `to` take MIDI numbers or names (`"C4"`, `"F#3"`, `"Bb2"`) and may be
any sub-range: `C4–E4` (three whites, two blacks), one octave (`60–72`, top C
included), four octaves (`"C2"–"C6"`), the whole piano (`"A0"–"C8"`). Bounds on
a black key snap outward to the white key beside it.

## Sizing

Three ways, from loosest to tightest:

| you want | do |
|---|---|
| fill the host's width | nothing — the default; the height follows from the aspect ratio |
| a fixed key size | `whiteWidth: "2.4rem"` (any CSS length per white key); the keyboard's width becomes `whites × whiteWidth` |
| stubbier or taller keys | `ratio: 3.5` (white-key height ÷ width; default 5.2) |

`setSize({ whiteWidth, ratio })` changes either after mount. Labels scale with
the key (container-query units), so a 1.4rem key still reads.

The host gets `--kb-whites` (count of white keys); the CSS turns `--x`/`--w`
per key into percentages and gives the keyboard a `whites / ratio` aspect ratio.
`fitOctaves(width)` says how many octaves have touchable (≥ 25 px) white keys:
two on a phone, up to four on a desk.

## Colors

Keys use the skin tokens `--key-white`, `--key-black`, `--key-ink` (one triple
per skin in the skins block) and bloom with `--accent` when down, so every
appearance gets a keyboard that belongs to it. Exercise lights use `--accent`
(target), `--ok` (correct) and `--red` (wrong).
