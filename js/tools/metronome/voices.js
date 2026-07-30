// Four synthesized click voices — no samples, fully offline. Each voice's
// play(context, dest, t, kind) schedules one click at AudioContext time t.
// kind: "accent" | "beat" | "sub" (subdivision ticks sit under the beat).

const LEVEL = { accent: 1.0, beat: 0.6, sub: 0.25 };

const noiseBuffers = new WeakMap();
function noise(context) {
  let buf = noiseBuffers.get(context);
  if (!buf) {
    buf = context.createBuffer(1, Math.ceil(context.sampleRate * 0.05), context.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(context, buf);
  }
  return buf;
}

function envelope(context, dest, t, peak, decay) {
  const g = context.createGain();
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + decay);
  g.connect(dest);
  return g;
}

export const VOICES = [
  {
    id: "wood",
    name: "Wood",
    play(context, dest, t, kind) {
      // Woodblock: two detuned triangles through a resonant bandpass.
      const f = kind === "accent" ? 1080 : 820;
      const bp = context.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = f;
      bp.Q.value = 5;
      bp.connect(envelope(context, dest, t, LEVEL[kind] * 1.6, 0.06));
      for (const [freq, gain] of [[f, 1], [f * 1.62, 0.5]]) {
        const osc = context.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = freq;
        const g = context.createGain();
        g.gain.value = gain;
        osc.connect(g).connect(bp);
        osc.start(t);
        osc.stop(t + 0.08);
      }
    },
  },
  {
    id: "clave",
    name: "Clave",
    play(context, dest, t, kind) {
      // High rosewood tick: sine with a fast pitch drop.
      const f = kind === "accent" ? 2350 : 1850;
      const osc = context.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.035);
      osc.connect(envelope(context, dest, t, LEVEL[kind], 0.05));
      osc.start(t);
      osc.stop(t + 0.07);
    },
  },
  {
    id: "beep",
    name: "Beep",
    play(context, dest, t, kind) {
      // Soft sine blip with a real attack, gentlest of the four.
      const osc = context.createOscillator();
      osc.type = "sine";
      osc.frequency.value = kind === "accent" ? 880 : 660;
      const g = context.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(LEVEL[kind] * 0.9, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      g.connect(dest);
      osc.connect(g);
      osc.start(t);
      osc.stop(t + 0.11);
    },
  },
  {
    id: "tick",
    name: "Tick",
    play(context, dest, t, kind) {
      // Mechanical click: a filtered noise burst.
      const src = context.createBufferSource();
      src.buffer = noise(context);
      const filter = context.createBiquadFilter();
      if (kind === "accent") {
        filter.type = "bandpass";
        filter.frequency.value = 3200;
        filter.Q.value = 1.2;
      } else {
        filter.type = "highpass";
        filter.frequency.value = 4200;
      }
      src.connect(filter).connect(envelope(context, dest, t, LEVEL[kind] * 2.2, 0.025));
      src.start(t);
      src.stop(t + 0.04);
    },
  },
];

export function voiceById(id) {
  return VOICES.find((v) => v.id === id) ?? VOICES[0];
}
