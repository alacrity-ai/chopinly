// One AudioContext for the whole app, created lazily on first user gesture so
// autoplay policies never leave us muted. Tools connect through `master`.
let shared = null;

export function getAudio() {
  if (!shared) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const context = new Ctx({ latencyHint: "interactive" });
    const master = context.createGain();
    master.gain.value = 1;
    master.connect(context.destination);
    shared = { context, master };
  }
  if (shared.context.state === "suspended") shared.context.resume();
  return shared;
}
