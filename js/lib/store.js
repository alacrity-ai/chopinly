// Namespaced localStorage settings: ws.<tool>.<key>. Safe when storage is
// unavailable (private mode) — everything just falls back to defaults.
export function makeStore(ns) {
  const prefix = `ws.${ns}.`;
  return {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(prefix + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(prefix + key, JSON.stringify(value));
      } catch {
        /* storage unavailable — run on defaults */
      }
    },
  };
}
