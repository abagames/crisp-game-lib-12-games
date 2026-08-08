/*
 * VOLT KEEPER — audio DSP core.
 *
 * Pure sample generation: no Web Audio, no DOM. The same code renders in the
 * browser (into AudioBuffers) and in Node (for offline measurement), so what
 * the measurement tool asserts is what the game plays.
 *
 * Primitives are fixed by the frozen hardware profile: pulse (variable duty),
 * tri, and a 15-bit LFSR noise generator. Nothing else may be added to rescue
 * a single sound.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === "object" && module.exports) module.exports = mod;
  else root.VKDsp = mod;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const TAU = Math.PI * 2;

  function midi(n) {
    return 440 * Math.pow(2, (n - 69) / 12);
  }

  /* Deterministic per-step noise seed: same program + step index + session seed
   * always produces the same LFSR sequence, which is what replay needs. */
  function hashSeed(text, index, seed) {
    let h = 2166136261 ^ (seed | 0);
    const s = `${text}#${index}`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) % 32767 || 1;
  }

  function envelopeAt(env, t, dur) {
    const attack = Math.min(0.002, dur * 0.25);
    const tailFade = Math.min(0.004, dur * 0.25);
    let a = 1;
    if (t < attack) a = t / attack;
    else if (t > dur - tailFade) a = Math.max(0, (dur - t) / tailFade);
    if (env === "gate") return a;
    if (env === "swell") {
      const half = dur / 2;
      return a * (t < half ? t / half : (dur - t) / half);
    }
    // "perc" (default): exponential decay under the anti-click ramps.
    return a * Math.exp((-5 * t) / dur);
  }

  /**
   * Render one list of steps into a mono Float32Array.
   * Steps are pre-master: per-step gain only. The master chain is applied once
   * at the output (browser) or by applyMaster() (offline mixdown).
   */
  function renderSteps(steps, opts) {
    const sampleRate = opts.sampleRate;
    const id = opts.id || "";
    const seed = opts.seed || 0;
    const voiceFilter = opts.voiceFilter || null;
    let totalSeconds = opts.totalSeconds;
    if (totalSeconds == null) {
      totalSeconds = 0;
      for (const s of steps) totalSeconds = Math.max(totalSeconds, s.offset + s.duration);
    }
    const length = Math.max(1, Math.ceil(totalSeconds * sampleRate));
    const out = new Float32Array(length);

    steps.forEach((step, index) => {
      if (voiceFilter && step.voice !== voiceFilter) return;
      const start = Math.floor(step.offset * sampleRate);
      const count = Math.floor(step.duration * sampleRate);
      if (count <= 0) return;
      const wave = step.wave || "pulse";
      const duty = step.duty == null ? 0.5 : step.duty;
      const gain = step.gain == null ? 0.5 : step.gain;
      const env = step.env || "perc";
      const f0 = step.freq;
      const f1 = step.freqTo == null ? step.freq : step.freqTo;
      const ratio = f1 / f0;

      let phase = 0;
      let lfsr = hashSeed(id, index, seed);
      let noiseOut = 1;

      for (let i = 0; i < count; i++) {
        const n = start + i;
        if (n >= length) break;
        const t = i / sampleRate;
        const frac = count > 1 ? i / (count - 1) : 0;
        const f = ratio === 1 ? f0 : f0 * Math.pow(ratio, frac);
        phase += f / sampleRate;

        let v;
        if (wave === "noise") {
          while (phase >= 1) {
            phase -= 1;
            const bit = (lfsr ^ (lfsr >> 1)) & 1;
            lfsr = (lfsr >> 1) | (bit << 14);
            noiseOut = lfsr & 1 ? 1 : -1;
          }
          v = noiseOut;
        } else {
          phase -= Math.floor(phase);
          if (wave === "tri") v = phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4;
          else if (wave === "sine") v = Math.sin(phase * TAU);
          else v = phase < duty ? 1 : -1;
        }
        out[n] += v * gain * envelopeAt(env, t, step.duration);
      }
    });
    return out;
  }

  function renderProgram(program, opts) {
    return renderSteps(program.steps, {
      sampleRate: opts.sampleRate,
      id: program.id,
      seed: opts.seed || 0,
      totalSeconds: opts.totalSeconds,
    });
  }

  /** One voice of a BGM cue, exactly loopEnd - loopStart seconds long. */
  function renderCueVoice(cue, voice, opts) {
    const loop = cue.loopEndSeconds - cue.loopStartSeconds;
    return renderSteps(cue.steps, {
      sampleRate: opts.sampleRate,
      id: `${cue.id}:${voice}`,
      seed: opts.seed || 0,
      totalSeconds: loop,
      voiceFilter: voice,
    });
  }

  /** Master chain: gain -> tanh soft clip -> one-pole DC block -> clamp. */
  function applyMaster(buffer, master, sampleRate) {
    const gain = master.gain;
    const drive = master.drive;
    const ceiling = master.ceiling;
    const rc = 1 / (TAU * master.dcBlockHz);
    const alpha = rc / (rc + 1 / sampleRate);
    let prevIn = 0;
    let prevOut = 0;
    const out = new Float32Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      const shaped = Math.tanh(buffer[i] * gain * drive) / Math.tanh(drive);
      const blocked = alpha * (prevOut + shaped - prevIn);
      prevIn = shaped;
      prevOut = blocked;
      out[i] = Math.max(-ceiling, Math.min(ceiling, blocked));
    }
    return out;
  }

  /** Transfer curve for the browser WaveShaperNode, matching applyMaster's shaper. */
  function masterCurve(master, points) {
    const n = points || 1024;
    const curve = new Float32Array(n);
    const norm = Math.tanh(master.drive);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * master.drive) / norm;
    }
    return curve;
  }

  function measure(buffer, sampleRate, floorLevel) {
    const floor = floorLevel == null ? 0.004 : floorLevel;
    let peak = 0;
    let sum = 0;
    let onset = -1;
    let last = -1;
    for (let i = 0; i < buffer.length; i++) {
      const a = Math.abs(buffer[i]);
      if (a > peak) peak = a;
      sum += buffer[i] * buffer[i];
      if (a >= floor) {
        if (onset < 0) onset = i;
        last = i;
      }
    }
    return {
      peak,
      rms: Math.sqrt(sum / Math.max(1, buffer.length)),
      onsetSeconds: onset < 0 ? null : onset / sampleRate,
      tailSeconds: last < 0 ? null : (last + 1) / sampleRate,
      lengthSeconds: buffer.length / sampleRate,
    };
  }

  return { midi, renderSteps, renderProgram, renderCueVoice, applyMaster, masterCurve, measure, hashSeed };
});
