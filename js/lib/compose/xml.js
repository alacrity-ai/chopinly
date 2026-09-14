// A small XML reader for MusicXML (docs/COMPOSE_MUSICXML_DESIGN.md): elements, attributes, text,
// the five built-in entities plus numeric references, CDATA, and it skips the prolog, comments,
// processing instructions and the DOCTYPE. The same reader runs in the browser and in node, so
// the tests prove exactly what the app does. Pure.

const ENT = { lt: "<", gt: ">", amp: "&", apos: "'", quot: '"' };
/** Decode character and entity references in text or an attribute value. */
export const decode = (s) => (s.includes("&") ? s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, r) => (r[0] === "#" ? String.fromCodePoint(parseInt(r[1] === "x" || r[1] === "X" ? r.slice(2) : r.slice(1), r[1] === "x" || r[1] === "X" ? 16 : 10)) : (ENT[r] ?? m))) : s);
const ESC = { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" };
/** Escape text for an element or a double-quoted attribute. */
export const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ESC[c]);

/** A node: { name, attrs: {}, children: [], text } — `text` is the element's own character data, trimmed. */
const node = (name, attrs) => ({ name, attrs, children: [], text: "" });

/**
 * Parse a document → its root element. Throws with a position on malformed input. Namespaces are
 * not resolved (MusicXML uses none on its elements); a prefix stays in the name.
 */
export function parseXml(src) {
  let i = 0;
  const n = src.length;
  if (src.charCodeAt(0) === 0xfeff) i = 1;
  const fail = (what) => { throw new Error(`XML: ${what} at ${i}`); };
  const stack = [];
  let root = null;
  const push = (el) => { if (stack.length) stack[stack.length - 1].children.push(el); else if (root) fail("more than one root"); else root = el; };
  while (i < n) {
    const lt = src.indexOf("<", i);
    if (lt < 0) { if (stack.length) fail("unclosed element"); break; }
    if (lt > i && stack.length) { const t = src.slice(i, lt); if (t.trim()) stack[stack.length - 1].text += decode(t); }
    i = lt;
    if (src.startsWith("<!--", i)) { const e = src.indexOf("-->", i + 4); if (e < 0) fail("unclosed comment"); i = e + 3; continue; }
    if (src.startsWith("<![CDATA[", i)) { const e = src.indexOf("]]>", i + 9); if (e < 0) fail("unclosed CDATA"); if (stack.length) stack[stack.length - 1].text += src.slice(i + 9, e); i = e + 3; continue; }
    if (src.startsWith("<?", i)) { const e = src.indexOf("?>", i + 2); if (e < 0) fail("unclosed processing instruction"); i = e + 2; continue; }
    if (src.startsWith("<!", i)) { // DOCTYPE, possibly with an internal subset
      let depth = 0, j = i + 2;
      for (; j < n; j++) { const c = src[j]; if (c === "[") depth++; else if (c === "]") depth--; else if (c === ">" && depth <= 0) break; }
      if (j >= n) fail("unclosed declaration");
      i = j + 1; continue;
    }
    if (src[i + 1] === "/") {
      const e = src.indexOf(">", i);
      if (e < 0) fail("unclosed end tag");
      const name = src.slice(i + 2, e).trim();
      const open = stack.pop();
      if (!open || open.name !== name) fail(`</${name}> closes ${open ? `<${open.name}>` : "nothing"}`);
      open.text = open.text.trim();
      i = e + 1; continue;
    }
    // a start tag
    let j = i + 1;
    while (j < n && !/[\s/>]/.test(src[j])) j++;
    const name = src.slice(i + 1, j);
    if (!name) fail("empty tag name");
    const attrs = {};
    for (;;) {
      while (j < n && /\s/.test(src[j])) j++;
      if (j >= n) fail("unclosed start tag");
      if (src[j] === ">") { j++; push(node(name, attrs)); stack.push(stack.length ? stack[stack.length - 1].children[stack[stack.length - 1].children.length - 1] : root); break; }
      if (src[j] === "/") { if (src[j + 1] !== ">") fail("bad empty tag"); j += 2; push(node(name, attrs)); break; }
      let k = j;
      while (k < n && !/[\s=/>]/.test(src[k])) k++;
      const an = src.slice(j, k);
      while (k < n && /\s/.test(src[k])) k++;
      if (src[k] !== "=") fail(`attribute ${an} without a value`);
      k++;
      while (k < n && /\s/.test(src[k])) k++;
      const q = src[k];
      if (q !== '"' && q !== "'") fail(`attribute ${an} not quoted`);
      const e = src.indexOf(q, k + 1);
      if (e < 0) fail(`attribute ${an} unclosed`);
      attrs[an] = decode(src.slice(k + 1, e));
      j = e + 1;
    }
    i = j;
  }
  if (stack.length) fail("unclosed element");
  if (!root) fail("no root element");
  return root;
}

/** The first child element with this name, or null. */
export const child = (el, name) => el?.children.find((c) => c.name === name) ?? null;
/** Every child element with this name. */
export const children = (el, name) => (el ? el.children.filter((c) => c.name === name) : []);
/** The text of the first child with this name (trimmed), or the fallback. */
export const textOf = (el, name, fallback = "") => child(el, name)?.text ?? fallback;
/** The number in the first child with this name, or the fallback. */
export const numOf = (el, name, fallback = null) => { const t = child(el, name)?.text; if (t === undefined || t === "") return fallback; const v = Number(t); return Number.isFinite(v) ? v : fallback; };
