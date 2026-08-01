// Shared microphone → pitch-sample stream. Owns the getUserMedia lifecycle;
// emits only voiced samples ({ t, freq, midi }) at a steady cadence, where
// t is AudioContext time and midi is a float (A4 = 440 reference).
import { autoCorrelate } from "./detect.js";

export function createMicPitch(getAudio, { fftSize = 4096, intervalMs = 85 } = {}) {
  let stream = null, source = null, analyser = null, buf = null, timer = null, context = null;
  return {
    /** Throws on permission denial — callers surface guidance. */
    async start(onSample) {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      ({ context } = getAudio());
      source = context.createMediaStreamSource(stream);
      analyser = context.createAnalyser();
      analyser.fftSize = fftSize;
      source.connect(analyser); // analysis only — never routed to output
      buf = new Float32Array(fftSize);
      timer = setInterval(() => {
        analyser.getFloatTimeDomainData(buf);
        const freq = autoCorrelate(buf, context.sampleRate);
        if (freq > 0 && freq < 5000) {
          onSample({ t: context.currentTime, freq, midi: 69 + 12 * Math.log2(freq / 440) });
        }
      }, intervalMs);
    },
    stop() {
      clearInterval(timer);
      timer = null;
      if (stream) for (const t of stream.getTracks()) t.stop();
      if (source) source.disconnect();
      stream = source = analyser = null;
    },
    get active() { return timer !== null; },
  };
}
