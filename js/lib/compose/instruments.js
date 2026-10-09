// The instruments a part can be (docs/COMPOSE_PARTS_DESIGN.md §1.3, WSHED-180). Pure — node-testable.
// Concert pitch only: a clarinet or a horn is written as it sounds (the sheet says so under the name); every
// instrument plays with the piano's sound until a second voice exists. `group` draws the brackets (§2.2) and
// decides what the pedal may touch; `xml` is MusicXML's <instrument-sound>.

export const GROUPS = ["keyboard", "voice", "strings", "woodwind", "brass", "other"];

export const INSTRUMENTS = {
  piano:      { name: "Piano",       abbr: "Pno.",   staves: 2, clefs: ["treble", "bass"],         group: "keyboard", sound: "piano", xml: "keyboard.piano" },
  organ:      { name: "Organ",       abbr: "Org.",   staves: 3, clefs: ["treble", "bass", "bass"], group: "keyboard", sound: "piano", xml: "keyboard.organ" },
  voice:      { name: "Voice",       abbr: "Voice",  staves: 1, clefs: ["treble"], group: "voice", sound: "piano", xml: "voice.vocals" },
  soprano:    { name: "Soprano",     abbr: "S.",     staves: 1, clefs: ["treble"], group: "voice", sound: "piano", xml: "voice.soprano" },
  alto:       { name: "Alto",        abbr: "A.",     staves: 1, clefs: ["treble"], group: "voice", sound: "piano", xml: "voice.alto" },
  tenor:      { name: "Tenor",       abbr: "T.",     staves: 1, clefs: ["treble"], group: "voice", sound: "piano", xml: "voice.tenor", note: "written as it sounds — no octave clef" },
  bass:       { name: "Bass",        abbr: "B.",     staves: 1, clefs: ["bass"],   group: "voice", sound: "piano", xml: "voice.bass" },
  violin:     { name: "Violin",      abbr: "Vln.",   staves: 1, clefs: ["treble"], group: "strings", sound: "piano", xml: "strings.violin" },
  viola:      { name: "Viola",       abbr: "Vla.",   staves: 1, clefs: ["alto"],   group: "strings", sound: "piano", xml: "strings.viola" },
  cello:      { name: "Cello",       abbr: "Vc.",    staves: 1, clefs: ["bass"],   group: "strings", sound: "piano", xml: "strings.cello" },
  contrabass: { name: "Contrabass",  abbr: "Cb.",    staves: 1, clefs: ["bass"],   group: "strings", sound: "piano", xml: "strings.contrabass", note: "written as it sounds — no octave clef" },
  guitar:     { name: "Guitar",      abbr: "Gtr.",   staves: 1, clefs: ["treble"], group: "strings", sound: "piano", xml: "pluck.guitar", note: "written as it sounds — no octave clef" },
  flute:      { name: "Flute",       abbr: "Fl.",    staves: 1, clefs: ["treble"], group: "woodwind", sound: "piano", xml: "wind.flutes.flute" },
  oboe:       { name: "Oboe",        abbr: "Ob.",    staves: 1, clefs: ["treble"], group: "woodwind", sound: "piano", xml: "wind.reed.oboe" },
  clarinet:   { name: "Clarinet",    abbr: "Cl.",    staves: 1, clefs: ["treble"], group: "woodwind", sound: "piano", xml: "wind.reed.clarinet", note: "concert pitch — written as it sounds" },
  bassoon:    { name: "Bassoon",     abbr: "Bsn.",   staves: 1, clefs: ["bass"],   group: "woodwind", sound: "piano", xml: "wind.reed.bassoon" },
  horn:       { name: "Horn",        abbr: "Hn.",    staves: 1, clefs: ["treble"], group: "brass", sound: "piano", xml: "brass.french-horn", note: "concert pitch — written as it sounds" },
  trumpet:    { name: "Trumpet",     abbr: "Tpt.",   staves: 1, clefs: ["treble"], group: "brass", sound: "piano", xml: "brass.trumpet", note: "concert pitch — written as it sounds" },
  trombone:   { name: "Trombone",    abbr: "Tbn.",   staves: 1, clefs: ["bass"],   group: "brass", sound: "piano", xml: "brass.trombone" },
  tuba:       { name: "Tuba",        abbr: "Tba.",   staves: 1, clefs: ["bass"],   group: "brass", sound: "piano", xml: "brass.tuba" },
  other:      { name: "Instrument",  abbr: "",       staves: 1, clefs: ["treble"], group: "other", sound: "piano", xml: "" },
};
export const INSTRUMENT_KEYS = Object.keys(INSTRUMENTS);

/** The parts a new piece can start with (the details sheet's *for ▾*, docs/COMPOSE_PARTS_DESIGN.md §3). */
export const TEMPLATES = [
  { key: "piano",   name: "Piano",           parts: ["piano"] },
  { key: "voice",   name: "Voice and piano", parts: ["voice", "piano"] },
  { key: "quartet", name: "String quartet",  parts: [["violin", "Violin I", "Vln. I"], ["violin", "Violin II", "Vln. II"], "viola", "cello"] },
  { key: "satb",    name: "Choir (SATB)",    parts: ["soprano", "alto", "tenor", "bass"] },
  { key: "guitar",  name: "Guitar",          parts: ["guitar"] },
];

/** A part record for an instrument: `id` is "p<n>", the name and abbreviation the catalogue's unless given. */
export function partFor(key, n, { name, abbr, staves } = {}) {
  const ins = INSTRUMENTS[key] ?? INSTRUMENTS.other;
  const k = INSTRUMENTS[key] ? key : "other";
  const count = Math.max(1, Math.min(ins.clefs.length, staves ?? ins.staves));
  return { id: `p${n}`, name: name ?? ins.name, abbr: abbr ?? ins.abbr, instrument: k, staves: count, clefs: ins.clefs.slice(0, count) };
}
/** The parts of a template (or any list of instrument keys / `[key, name, abbr]` triples), numbered from 1. */
export const partsFrom = (list) => list.map((item, i) => (Array.isArray(item) ? partFor(item[0], i + 1, { name: item[1], abbr: item[2] }) : partFor(item, i + 1)));
export const templateParts = (key) => partsFrom((TEMPLATES.find((t) => t.key === key) ?? TEMPLATES[0]).parts);

/** The instrument key for a MusicXML <instrument-sound> or, failing that, a part's name ("Violoncello" → cello). */
export function instrumentOf(sound = "", name = "") {
  const s = String(sound).toLowerCase();
  if (s) for (const [k, ins] of Object.entries(INSTRUMENTS)) if (ins.xml && (s === ins.xml || s.startsWith(ins.xml + "."))) return k;
  const n = String(name).toLowerCase();
  const byName = [["piano", /piano|klavier|pianoforte/], ["organ", /organ|orgel/], ["violin", /violin|geige|fiddle/], ["viola", /viola\b|bratsche/], ["cello", /cello|violoncell/], ["contrabass", /contrabass|double bass|kontrabass|bass viol/], ["guitar", /guitar|gitarre/], ["flute", /flute|flöte|flauto/], ["oboe", /oboe/], ["clarinet", /clarinet|klarinette/], ["bassoon", /bassoon|fagott/], ["horn", /\bhorn/], ["trumpet", /trumpet|trompete/], ["trombone", /trombone|posaune/], ["tuba", /tuba/], ["soprano", /soprano|sopran/], ["alto", /\balto\b|\balt\b/], ["tenor", /tenor/], ["bass", /^bass\b|\bbass voice|\bbasso\b/], ["voice", /voice|vocal|singer|stimme|lead/]];
  for (const [k, re] of byName) if (re.test(n)) return k;
  return "other";
}
