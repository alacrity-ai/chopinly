// Undo / redo as snapshots (docs/COMPOSE_DESIGN.md §2): every committed edit
// pushes the whole document; compositions are tens of KB, so this is cheaper
// and safer than inverse commands. Cap 200.
export function createHistory(initial, { cap = 200 } = {}) {
  let past = [], future = [], present = initial;
  return {
    get present() { return present; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    push(doc) { past.push(present); if (past.length > cap) past.shift(); present = doc; future = []; return doc; },
    /** Replace the present without recording (a save-only change like openedAt). */
    replace(doc) { present = doc; return doc; },
    undo() { if (!past.length) return present; future.push(present); present = past.pop(); return present; },
    redo() { if (!future.length) return present; past.push(present); present = future.pop(); return present; },
  };
}
