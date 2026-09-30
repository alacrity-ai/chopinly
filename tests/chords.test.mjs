// Chord diagrams (WSHED-160): the theory, the vendored voicings, search, the box.
import { test } from "node:test";
import assert from "node:assert/strict";
import { KEYS, QUALITIES, qualityById, spellChord, parseSymbol, search, chordSymbol, readQuality } from "../js/lib/chords/theory.js";
import { INSTRUMENTS, decode, encode, checkVoicing, midis, barreSpans } from "../js/lib/chords/voicings.js";
import { chordSVG, stringTones } from "../js/lib/chords/diagram.js";
import guitar from "../js/lib/chords/data/guitar.js";
import ukulele from "../js/lib/chords/data/ukulele.js";

const DATA = { guitar, ukulele };
const listOf = (data) => KEYS.flatMap((k) => Object.entries(data[k.id]).map(([typeKey, codes]) => {
  const [qid, bass] = typeKey.split("/");
  return { key: k.id, q: qualityById(qid), bass: bass ? { pc: parseSymbol(bass).root.pc, name: bass } : null, typeKey, codes };
}));

test("every committed voicing plays its chord (the vendoring check, re-run on the data as committed)", () => {
  for (const [id, data] of Object.entries(DATA)) {
    let n = 0;
    for (const c of listOf(data)) {
      assert.ok(c.q, `${id} ${c.key} ${c.typeKey}: unknown type`);
      for (const code of c.codes) {
        const why = checkVoicing(decode(code), INSTRUMENTS[id], KEYS.find((k) => k.id === c.key).pc, c.q, c.bass?.pc ?? null);
        assert.equal(why, null, `${id} ${c.key}${c.typeKey} ${code}: ${why}`);
        assert.equal(encode(decode(code)), code, "codes round-trip");
        n++;
      }
    }
    assert.ok(n > 1800, `${id}: only ${n} voicings`);
  }
});

test("coverage: the card's chord types exist in all twelve keys on both instruments (+ guitar power chords)", () => {
  const core = ["major", "minor", "dim", "aug", "sus2", "sus4", "6", "m6", "7", "maj7", "m7", "mmaj7", "dim7", "m7b5", "7sus4", "aug7", "add9", "9", "maj9", "m9", "7b9", "7#9", "11", "13"];
  for (const [id, data] of Object.entries(DATA)) {
    for (const q of core) for (const k of KEYS) assert.ok(data[k.id][q]?.length, `${id} ${k.id} ${q} missing`);
  }
  for (const k of KEYS) assert.equal(guitar[k.id]["5"].length, 2, `guitar ${k.id}5`);
  assert.deepEqual(midis(decode(guitar.E["5"][0]), INSTRUMENTS.guitar).filter(Boolean), [40, 47, 52], "E5 open = E B E");
});

test("the classic open shapes are there, first", () => {
  assert.equal(guitar.C.major[0], "x32010:032010@1");
  assert.equal(guitar.G.major[0].split(":")[0], "320003");
  assert.equal(ukulele.C.major[0].split(":")[0], "0003");
  assert.equal(ukulele.A.minor[0].split(":")[0], "2000");
});

test("spelling: every tone gets the right letter", () => {
  const sp = (r, q) => spellChord(r, qualityById(q)).map((n) => n.name).join(" ");
  assert.equal(sp("E♭", "m7"), "E♭ G♭ B♭ D♭");
  assert.equal(sp("C", "dim7"), "C E♭ G♭ B𝄫");
  assert.equal(sp("F♯", "7"), "F♯ A♯ C♯ E");
  assert.equal(sp("D♭", "maj7"), "D♭ F A♭ C");
  assert.equal(sp("B", "aug"), "B D♯ F𝄪");
  assert.equal(sp("A", "7#9"), "A C♯ E G B♯");
  assert.equal(sp("G", "13"), "G B D F A E");
  assert.equal(sp("C", "m7b5"), "C E♭ G♭ B♭");
});

test("reading chord symbols: the spellings people actually type", () => {
  const q = (s) => { const p = parseSymbol(s); return p && `${p.root.name}|${p.quality?.id ?? "?"}${p.bass ? "/" + p.bass.name : ""}`; };
  const cases = {
    Am7: "A|m7", "F#m7b5": "F♯|m7b5", Bbmaj9: "B♭|maj9", "C-7": "C|m7", "CΔ7": "C|maj7", "C°7": "C|dim7", "Cø": "C|m7b5",
    Db: "D♭|major", "C/E": "C|major/E", "Am/G": "A|minor/G", CM7: "C|maj7", Cm7: "C|m7", "C+": "C|aug", "Csus": "C|sus4",
    "C6/9": "C|69", "G7#9": "G|7#9", "Ebm(maj7)": "E♭|mmaj7", "C minor seventh": "C|m7", "a minor": "A|minor", "E♭m": "E♭|minor",
    "Cmaj": "C|major", "C7sus4": "C|7sus4", "C5": "C|5", "F#°": "F♯|dim", "C sharp minor": "C♯|minor",
  };
  for (const [s, want] of Object.entries(cases)) assert.equal(q(s), want, s);
  assert.equal(readQuality("minor seventh").id, "m7");
  assert.equal(readQuality("half diminished").id, "m7b5");
  assert.equal(readQuality("M7").id, "maj7");
  assert.equal(readQuality("m7").id, "m7");
});

test("search: symbol → that chord first; a type alone → twelve keys; a root → its chords spelled as typed", () => {
  const list = listOf(guitar);
  const top = (s) => { const h = search(list, s)[0]; return h && chordSymbol(h.rootName, h.chord.q, h.chord.bass?.name); };
  for (const [s, want] of Object.entries({ Am7: "Am7", "F#m7b5": "F♯m7♭5", Bbmaj9: "B♭maj9", "C-7": "Cm7", "CΔ7": "Cmaj7", "C°7": "Cdim7", "Cø": "Cm7♭5", Db: "D♭", "C/E": "C/E", "minor seventh": "Cm7", "D sharp minor": "D♯m", "Gb7": "G♭7" })) assert.equal(top(s), want, s);
  const m7 = search(list, "m7").filter((h) => h.chord.q.id === "m7");
  assert.equal(m7.length, 12);
  assert.deepEqual(m7.map((h) => h.rootName), KEYS.map((k) => k.name));
  const db = search(list, "Db");
  assert.ok(db.length > 30 && db.every((h) => h.rootName === "D♭"), "Db lists every D♭ chord, spelled D♭");
  assert.ok(search(list, "dim").slice(0, 12).every((h) => h.chord.q.id === "dim"), "dim: the triads first");
  assert.ok(search(list, "diminished").some((h) => h.chord.q.id === "dim7"), "the word finds the family");
  assert.deepEqual(search(list, ""), []);
  assert.deepEqual(search(list, "zzz"), []);
});

test("the box: nut, ×/○, dots, root tones in the accent; barres; left-handed mirrors", () => {
  const g = INSTRUMENTS.guitar;
  const c = decode(guitar.C.major[0]); // x32010
  const svg = chordSVG(c, g, "C", qualityById("major"));
  assert.equal((svg.match(/class="cd-nut"/g) ?? []).length, 1);
  assert.equal((svg.match(/class="cd-mute"/g) ?? []).length, 1);
  assert.equal((svg.match(/class="cd-open/g) ?? []).length, 2);
  assert.equal((svg.match(/class="cd-dot/g) ?? []).length, 3);
  assert.equal((svg.match(/class="cd-dot root"/g) ?? []).length, 2, "C on the A string and the B string");
  const tones = stringTones(c, g, "C", qualityById("major"));
  assert.deepEqual(tones.map((t) => t && t.name), [null, "C", "E", "G", "C", "E"]);
  assert.deepEqual(tones.map((t) => t && t.degree), [null, "1", "3", "5", "1", "3"]);
  const f = decode(guitar.F.major.find((x) => x.startsWith("133211")) ?? guitar.F.major[0]);
  const fsvg = chordSVG(f, g, "F", qualityById("major"));
  assert.ok(barreSpans(f).length >= 1 && fsvg.includes('class="cd-barre"'), "F has its barre");
  const xs = (s) => [...s.matchAll(/class="cd-string" x1="([\d.]+)"/g)].map((m) => Number(m[1]));
  const mute = (s) => Number(/class="cd-mute" d="M([\d.]+)/.exec(s)[1]);
  const lefty = chordSVG(c, g, "C", qualityById("major"), null, { lefty: true });
  assert.ok(mute(lefty) > mute(svg), "the muted low E moves to the right");
  assert.deepEqual(xs(lefty).sort(), xs(svg).sort(), "the same six string lines, drawn in mirror order");
  const late = chordSVG(decode(guitar.C.minor[1]), g, "C", qualityById("minor"));
  assert.ok(!late.includes("cd-nut") && late.includes(">3fr</text>"), "a box up the neck says which fret it starts at");
  const notes = chordSVG(c, g, "C", qualityById("major"), null, { labels: "notes" });
  assert.ok(notes.includes(">E</text>") && notes.includes('class="cd-open-label'), "notes label the open strings too");
});

test("every type name reads as a chord symbol and back", () => {
  for (const q of QUALITIES) {
    const p = parseSymbol("C" + q.sym.replace(/♭/g, "b").replace(/♯/g, "#"));
    assert.equal(p.quality?.id, q.id, `C${q.sym}`);
  }
});
