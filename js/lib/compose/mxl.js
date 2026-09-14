// The compressed MusicXML container (docs/COMPOSE_MUSICXML_DESIGN.md §2): an `.mxl` is a zip whose
// `META-INF/container.xml` names the root file. This reads the zip's central directory, finds the
// root (or the first .musicxml / .xml entry when the container is missing), and inflates it with
// DecompressionStream("deflate-raw") — in every current browser and in node. Pure.
import { parseXml, child, children } from "./xml.js";

const LE = (b, o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | ((b[o + 3] << 24) >>> 0);
const LE16 = (b, o) => b[o] | (b[o + 1] << 8);
const utf8 = new TextDecoder("utf-8");

/** The zip's entries: [{ name, method, size, csize, offset }] from the central directory. */
export function zipEntries(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65558); i--) if (LE(b, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("not a zip file");
  const count = LE16(b, eocd + 10), cdOff = LE(b, eocd + 16);
  const out = [];
  let p = cdOff;
  for (let k = 0; k < count; k++) {
    if (LE(b, p) !== 0x02014b50) throw new Error("bad zip directory");
    const method = LE16(b, p + 10), csize = LE(b, p + 20), size = LE(b, p + 24), nLen = LE16(b, p + 28), xLen = LE16(b, p + 30), cLen = LE16(b, p + 32), offset = LE(b, p + 42);
    const name = utf8.decode(b.subarray(p + 46, p + 46 + nLen));
    out.push({ name, method, size, csize, offset });
    p += 46 + nLen + xLen + cLen;
  }
  return out;
}

/** The bytes of one entry (stored or deflated). */
export async function zipRead(bytes, entry) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const h = entry.offset;
  if (LE(b, h) !== 0x04034b50) throw new Error("bad zip entry");
  const nLen = LE16(b, h + 26), xLen = LE16(b, h + 28);
  const data = b.subarray(h + 30 + nLen + xLen, h + 30 + nLen + xLen + entry.csize);
  if (entry.method === 0) return data;
  if (entry.method !== 8) throw new Error(`zip method ${entry.method} not supported`);
  if (typeof DecompressionStream !== "function") throw new Error("this browser cannot inflate a compressed MusicXML file — export it uncompressed");
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The MusicXML text inside an .mxl. */
export async function readMxl(bytes) {
  const entries = zipEntries(bytes);
  let root = null;
  const container = entries.find((e) => e.name === "META-INF/container.xml");
  if (container) {
    try {
      const c = parseXml(utf8.decode(await zipRead(bytes, container)));
      const files = children(child(c, "rootfiles"), "rootfile");
      root = files.find((f) => /musicxml/.test(f.attrs["media-type"] ?? ""))?.attrs["full-path"] ?? files[0]?.attrs["full-path"] ?? null;
    } catch { root = null; }
  }
  const entry = (root && entries.find((e) => e.name === root)) ?? entries.find((e) => /\.(musicxml|xml)$/i.test(e.name) && !e.name.startsWith("META-INF/"));
  if (!entry) throw new Error("no MusicXML inside the .mxl");
  return utf8.decode(await zipRead(bytes, entry));
}
/** Is this a zip (an .mxl) rather than text? */
export const isZip = (bytes) => bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4;
