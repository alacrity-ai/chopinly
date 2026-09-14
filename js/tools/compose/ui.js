// Compose: the router. `#/compose` is the list, `#/compose/<id>` the editor —
// a full-screen layer over the list, like the Scores reader.
import { mountList } from "./list.js";
import { openEditor } from "./editor.js";

export function buildUI(root, ctx) {
  let list = null, editor = null;
  const route = () => { const m = /^#\/compose\/([^/?]+)/.exec(location.hash.split("?")[0]); return m ? decodeURIComponent(m[1]) : null; };
  const show = () => {
    const id = route();
    if (!list) list = mountList(root, ctx, { open: (cid) => { location.hash = `#/compose/${encodeURIComponent(cid)}`; } });
    if (id) {
      if (editor?.id === id) return;
      editor?.close({ silent: true });
      editor = openEditor({ id, ctx, onClose: () => { editor = null; if (route()) history.replaceState(null, "", "#/compose"); list?.refresh(); } });
      if (!editor) { history.replaceState(null, "", "#/compose"); list.refresh(); }
    } else if (editor) { editor.close({ silent: true }); editor = null; list.refresh(); }
  };
  const onHash = () => { if (location.hash.startsWith("#/compose")) show(); };
  window.addEventListener("hashchange", onHash);
  show();
  return { destroy() { window.removeEventListener("hashchange", onHash); editor?.close({ silent: true }); editor = null; list?.destroy(); list = null; } };
}
