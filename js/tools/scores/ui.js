// Scores: the router. `#/scores` is the library, `#/scores/<id>` (with an
// optional `?p=<n>`) is the reader over it. The reader is a full-screen layer
// on top of the library so leaving it is instant and the list is where you
// left it.
import { mountLibrary } from "./library.js";
import { openReader } from "./reader.js";

export function buildUI(root, ctx) {
  let library = null, reader = null;

  const route = () => {
    const [path, query] = location.hash.split("?");
    const m = /^#\/scores\/([^/?]+)/.exec(path);
    return { id: m ? decodeURIComponent(m[1]) : null, page: Number(new URLSearchParams(query ?? "").get("p")) || null };
  };
  const show = async () => {
    const r = route();
    if (!library) library = mountLibrary(root, ctx, { open: (id) => { location.hash = `#/scores/${encodeURIComponent(id)}`; } });
    if (r.id) {
      if (reader?.id === r.id) { if (r.page) reader.goTo(r.page); return; }
      reader?.close({ silent: true });
      reader = await openReader({ id: r.id, page: r.page, ctx, onClose: () => { reader = null; if (route().id) history.replaceState(null, "", "#/scores"); library?.refresh(); } });
    } else if (reader) { reader.close({ silent: true }); reader = null; library.refresh(); }
  };
  const onHash = () => { if (location.hash.startsWith("#/scores")) show(); };
  window.addEventListener("hashchange", onHash);
  show();

  return {
    destroy() {
      window.removeEventListener("hashchange", onHash);
      reader?.close({ silent: true }); reader = null;
      library?.destroy(); library = null;
    },
  };
}
