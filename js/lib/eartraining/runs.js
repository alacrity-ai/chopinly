// Ear-training run history (WSHED-81): a device-local list in the tool's store.
const MAX = 300;
export function createRuns(store) {
  const list = () => { const l = store.get("runs", []); return Array.isArray(l) ? l : []; };
  return {
    list,
    add(run) { const l = [{ ...run, at: run.at ?? Date.now() }, ...list()].slice(0, MAX); store.set("runs", l); return l[0]; },
    lastFor(exercise) { return list().find((r) => r.exercise === exercise) ?? null; },
  };
}
