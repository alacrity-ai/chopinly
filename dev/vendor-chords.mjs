// Vendors the guitar + ukulele chord voicings (@tombatossals/chords-db, MIT) into
// js/lib/chords/data/{guitar,ukulele}.js for the Almanac's chord diagrams (WSHED-160).
//   node dev/vendor-chords.mjs            # re-vendor the pinned version
//   node dev/vendor-chords.mjs --dry      # report only, write nothing
// Every voicing is checked against the chord's theory (voicings.js checkVoicing):
// a voicing that sounds a wrong note, misses a required tone or puts the wrong note
// in a slash chord's bass is dropped and reported. Guitar power chords (not in the
// source) are generated here. Output is committed; there is no build step.
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { KEYS, QUALITIES, qualityById, parseNoteName, noteName } from "../js/lib/chords/theory.js";
import { INSTRUMENTS, encode, decode, checkVoicing, absFrets } from "../js/lib/chords/voicings.js";

export const PINNED = "0.5.1";
const DRY = process.argv.includes("--dry");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "js", "lib", "chords", "data");
const tmp = join(tmpdir(), `chords-db-${PINNED}`);
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const url = `https://registry.npmjs.org/@tombatossals/chords-db/-/chords-db-${PINNED}.tgz`;
writeFileSync(join(tmp, "db.tgz"), Buffer.from(await (await fetch(url)).arrayBuffer()));
execFileSync("tar", ["xzf", "db.tgz"], { cwd: tmp });
const LICENSE = readFileSync(join(tmp, "package", "LICENSE"), "utf8").trim();

// the source's suffix → our chord type (+ a slash bass relative to the key); null = skipped on purpose
// "alt" is not one chord; "7sg" is a source oddity; ukulele 13♭5♭9 needs six tones on four strings, so
// every source voicing drops the third — it can't be played as labelled.
const SKIP = new Set(["alt", "7sg", "13b5b9"]);
// Chords whose every source voicing failed the check (mislabelled shapes), written by hand — checked like the rest.
const OVERRIDES = {
  guitar: {
    "E madd9": [{ frets: [0, 2, 4, 0, 0, 0], fingers: [0, 1, 3, 0, 0, 0], baseFret: 1 }, { frets: [-1, 4, 2, 1, 4, -1], fingers: [0, 3, 2, 1, 4, 0], baseFret: 4 }],
    "C# 11": [{ frets: [-1, 1, 1, 1, 1, 1], fingers: [0, 1, 1, 1, 1, 1], baseFret: 4, barres: [1] }],
  },
  ukulele: {
    "B madd9": [{ frets: [4, 2, 2, 4], fingers: [3, 1, 2, 4], baseFret: 1 }],
    "F 11": [{ frets: [2, 3, 1, 1], fingers: [2, 3, 1, 1], baseFret: 1, barres: [1] }],
  },
};
function readSuffix(suffix) {
  const slash = /^(m?)\/(.+)$/.exec(suffix);
  if (slash) return { q: qualityById(slash[1] ? "minor" : "major"), bass: slash[2] };
  if (SKIP.has(suffix)) return null;
  const q = qualityById(suffix);
  if (!q) throw new Error(`unknown suffix ${suffix} — add it to QUALITIES or SKIP`);
  return { q, bass: null };
}
const keyOfSource = (k) => KEYS.find((x) => x.pc === parseNoteName(k.replace("sharp", "#")).pc);
// slash basses as the source spells them (F#, G#, Bb, C#, D#) → our spelling in that key
const bassName = (b) => { const n = parseNoteName(b); return { pc: n.pc, name: noteName(n.letter, n.acc) }; };

function powerChords(inst) {
  const out = {};
  for (const k of KEYS) {
    const shapes = [];
    for (const [string, open] of [[0, 40], [1, 45]]) {
      const f = ((k.pc - open) % 12 + 12) % 12;
      const abs = [-1, -1, -1, -1, -1, -1];
      const fingers = [0, 0, 0, 0, 0, 0];
      abs[string] = f; abs[string + 1] = f + 2; abs[string + 2] = f + 2;
      if (f === 0) { fingers[string + 1] = 1; fingers[string + 2] = 2; }
      else { fingers[string] = 1; fingers[string + 1] = 3; fingers[string + 2] = 4; }
      const baseFret = f + 2 <= 4 ? 1 : f;
      const frets = abs.map((a) => (a <= 0 ? a : a - baseFret + 1));
      shapes.push({ frets, fingers, baseFret, barres: [] });
    }
    shapes.sort((a, b) => Math.max(...absFrets(a)) - Math.max(...absFrets(b)));
    out[k.id] = shapes.map(encode);
  }
  return out;
}

for (const id of ["guitar", "ukulele"]) {
  const inst = INSTRUMENTS[id];
  const db = JSON.parse(readFileSync(join(tmp, "package", "lib", `${id}.json`), "utf8"));
  if (db.tunings.standard.length !== inst.tuning.length) throw new Error(`${id}: tuning mismatch`);
  const chords = {}; // key id → { typeKey → [codes] } ; typeKey = q.id or "<q.id>/<bass>"
  let kept = 0, dropped = 0;
  const drops = [];
  for (const [srcKey, list] of Object.entries(db.chords)) {
    const key = keyOfSource(srcKey);
    chords[key.id] ??= {};
    for (const ch of list) {
      const read = readSuffix(ch.suffix);
      if (!read) continue;
      const bass = read.bass ? bassName(read.bass) : null;
      const typeKey = bass ? `${read.q.id}/${bass.name}` : read.q.id;
      const codes = [];
      for (const p of ch.positions) {
        const v = { frets: p.frets, fingers: p.fingers.map((f) => (f === 5 ? "T" : f)), baseFret: p.baseFret, barres: (p.barres ?? []).filter((b) => b > 0) };
        const why = checkVoicing(decode(encode(v)), inst, key.pc, read.q, bass?.pc ?? null);
        if (why) { dropped++; drops.push(`${key.name}${read.q.sym}${bass ? "/" + bass.name : ""} ${encode(v)} — ${why}`); continue; }
        const code = encode(v);
        if (!codes.includes(code)) { codes.push(code); kept++; }
      }
      if (codes.length) chords[key.id][typeKey] = codes;
    }
  }
  for (const [name, list] of Object.entries(OVERRIDES[id])) {
    const [k, qid] = name.split(" ");
    const key = KEYS.find((x) => x.id === k), q = qualityById(qid);
    if (chords[key.id][qid]) throw new Error(`override ${name}: the source has passing voicings now — drop the override`);
    const codes = list.map((v) => encode({ barres: [], ...v }));
    for (const c of codes) { const why = checkVoicing(decode(c), inst, key.pc, q); if (why) throw new Error(`override ${name} ${c}: ${why}`); }
    chords[key.id][qid] = codes; kept += codes.length;
  }
  if (id === "guitar") for (const [k, codes] of Object.entries(powerChords(inst))) { chords[k]["5"] = codes; kept += codes.length; }
  // order each key's types as QUALITIES lists them, slash chords last
  const order = (t) => { const [q, b] = t.split("/"); return QUALITIES.findIndex((x) => x.id === q) + (b ? 1000 + KEYS.findIndex((k) => k.pc === parseNoteName(b).pc) : 0); };
  const sorted = Object.fromEntries(KEYS.map((k) => [k.id, Object.fromEntries(Object.entries(chords[k.id]).sort((a, b) => order(a[0]) - order(b[0])))]));
  console.log(`${id}: kept ${kept} voicings, dropped ${dropped}`);
  for (const d of drops) console.log("   drop", d);
  const missing = [];
  const offered = new Set(Object.values(db.chords).flat().map((c) => readSuffix(c.suffix)).filter((r) => r && !r.bass).map((r) => r.q.id));
  for (const q of QUALITIES) { const n = KEYS.filter((k) => sorted[k.id][q.id]).length; if (offered.has(q.id) && n < 12) missing.push(`${q.id} (${n}/12)`); }
  if (missing.length) console.log(`   partial types: ${missing.join(", ")}`);
  if (DRY) continue;
  mkdirSync(OUT, { recursive: true });
  const body = `// GENERATED by dev/vendor-chords.mjs from @tombatossals/chords-db ${PINNED} — do not edit by hand.
// Voicing codes are documented in js/lib/chords/voicings.js; every one passed checkVoicing.
/*
${LICENSE}
*/
export default ${JSON.stringify(sorted, null, 0).replace(/\],"/g, '],\n"').replace(/\},"/g, '},\n"')};
`;
  writeFileSync(join(OUT, `${id}.js`), body);
}
