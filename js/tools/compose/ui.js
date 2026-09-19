// Compose: the router. `#/compose` is the list, `#/compose/<id>` the editor —
// a full-screen layer over the list, like the Scores reader — and
// `#/compose/help[/<slug>]` the help page (docs/COMPOSE_HELP_DESIGN.md §7).
// Help is a place, not a popup: the editor stays mounted and hidden behind it,
// so coming back is the piece and the mode you left, saved nothing extra.
import { logbook } from "../../lib/logbook.js";
import { mountList } from "./list.js";
import { openEditor } from "./editor.js";

export function buildUI(root, ctx) {
  let list = null, editor = null, help = null, helpFrom = null;
  const path = () => location.hash.split("?")[0];
  const route = () => {
    const h = /^#\/compose\/help(?:\/([a-z0-9-]+))?(?:#([a-z0-9-]+))?$/.exec(path());
    if (h) return { kind: "help", slug: h[1] ?? null, at: h[2] ?? "" };
    const m = /^#\/compose\/([^/?#]+)/.exec(path());
    return m ? { kind: "editor", id: decodeURIComponent(m[1]) } : { kind: "list" };
  };
  /** Where `‹` in the help bar goes back to: the piece it was opened from, or the list. */
  const openHelp = (slug, at) => {
    if (!help) {
      if (editor) { editor.el?.setAttribute("hidden", ""); helpFrom = `#/compose/${encodeURIComponent(editor.id)}`; }
      else helpFrom = "#/compose";
      list?.destroy(); list = null;
      import("./help.js").then(({ mountHelp }) => {
        if (route().kind !== "help") return;
        help = mountHelp(root, {
          slug, backLabel: editor ? "the score" : "compositions",
          onNavigate: (s, hash) => history.replaceState(history.state, "", `#/compose/help${s ? `/${s}` : ""}${hash ? `#${hash}` : ""}`),
          onBack: () => { location.hash = helpFrom ?? "#/compose"; },
        });
      });
    } else help.show(slug, at);
  };
  const closeHelp = () => { help?.destroy(); help = null; };

  const show = () => {
    const r = route();
    if (r.kind === "help") { openHelp(r.slug, r.at); return; }
    closeHelp();
    if (!list) list = mountList(root, ctx, { open: (cid) => { location.hash = `#/compose/${encodeURIComponent(cid)}`; }, help: () => { location.hash = "#/compose/help"; } });
    if (r.kind === "editor") {
      if (editor?.id === r.id) { editor.el?.removeAttribute("hidden"); return; }
      editor?.close({ silent: true });
      editor = openEditor({ id: r.id, ctx, onClose: () => { editor = null; if (route().kind === "editor") history.replaceState(null, "", "#/compose"); list?.refresh(); } });
      if (!editor) { history.replaceState(null, "", "#/compose"); list.refresh(); }
    } else if (editor) { editor.close({ silent: true }); editor = null; list.refresh(); }
  };
  const onHash = () => { if (location.hash.startsWith("#/compose")) show(); };
  window.addEventListener("hashchange", onHash);
  // the list follows the logbook while it is what's on screen: a sync pull from another device
  // shows up without a reload (only when the compositions themselves changed — not on every save)
  const print = () => logbook.compositions().map((c) => `${c.id}:${c.updatedAt}:${c.title}:${c.composer}:${c.tags?.join()}`).join("|");
  let seen = print();
  const offLogbook = logbook.on(() => { const now = print(); if (now === seen) return; seen = now; if (list && !editor && !help && location.hash.startsWith("#/compose")) list.refresh(); });
  show();
  return { destroy() { offLogbook(); window.removeEventListener("hashchange", onHash); closeHelp(); editor?.close({ silent: true }); editor = null; list?.destroy(); list = null; } };
}
