// COMET SLASH — event-driven WebAudio engine.
// The game emits semantic events; this module owns synthesis, mixing and transport.

const Sfx = (() => {
  let ctx = null;
  let master = null;
  let bgmBus = null;
  let seBus = null;
  let jingleBus = null;
  let noiseBuf = null;
  let muted = false;
  let intensity = 0;
  let bgmTimer = null;
  let bgmStep = 0;
  let bgmStepDur = 0;
  let bgmTrack = "play";
  let bgmWanted = null;
  let nextBgmTime = 0;
  const voices = new Set();
  const events = [];
  const MAX_VOICES = 24;
  // BGM must never starve control feedback: it gets a reserved slice of the
  // polyphony budget and yields the rest to SE/jingle voices. It plays 4
  // musical channels, but look-ahead scheduling keeps ~2 steps in flight, so
  // the budget has to cover that overlap or the loop sheds notes.
  const BGM_VOICES = 12;
  const BGM_LEVEL = 0.9;
  const PROGRAM_BUDGETS = {
    "slash:swing": { kind: "se", duration: 0.055, steps: 2 },
    "slash:empty": { kind: "se", duration: 0.075, steps: 1 },
    "slash:cut": { kind: "se", duration: 0.215, steps: 5 },
    "slash:long": { kind: "se", duration: 0.27, steps: 3 },
    "slash:multi": { kind: "se", duration: 0.36, steps: 7 },
    "comet:naked": { kind: "se", duration: 0.22, steps: 2 },
    "comet:warn": { kind: "se", duration: 0.175, steps: 2 },
    "comet:spawn": { kind: "se", duration: 0.34, steps: 1 },
    "comet:redline": { kind: "se", duration: 0.16, steps: 2 },
    "slash:redline": { kind: "se", duration: 0.29, steps: 3 },
    "player:miss": { kind: "se", duration: 0.38, steps: 2 },
    "danger:near": { kind: "se", duration: 0.09, steps: 1 },
    "ui:move": { kind: "se", duration: 0.045, steps: 1 },
    "ui:confirm": { kind: "se", duration: 0.08, steps: 1 },
    "jingle:start": { kind: "jingle", duration: 0.275, steps: 3 },
    "jingle:clear": { kind: "jingle", duration: 0.39, steps: 4 },
    "jingle:extend": { kind: "jingle", duration: 0.225, steps: 3 },
    "jingle:over": { kind: "jingle", duration: 1.17, steps: 4 },
    "jingle:allclear": { kind: "jingle", duration: 1.28, steps: 7 },
  };

  try {
    muted = localStorage.getItem("cometSlashMute") === "1";
  } catch (e) {}

  function ensure() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume();
      if (bgmWanted && !bgmTimer) startBgm(bgmWanted);
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    bgmBus = ctx.createGain();
    seBus = ctx.createGain();
    jingleBus = ctx.createGain();
    master.gain.value = muted ? 0 : 0.22;
    bgmBus.gain.value = BGM_LEVEL;
    seBus.gain.value = 1;
    jingleBus.gain.value = 0.88;
    bgmBus.connect(master);
    seBus.connect(master);
    jingleBus.connect(master);
    master.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 0.6);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (bgmWanted) startBgm(bgmWanted);
    return true;
  }

  function keepVoice(node, endTime, bus) {
    const token = { node, endTime, bgm: bus === bgmBus };
    voices.add(token);
    node.addEventListener("ended", () => voices.delete(token), { once: true });
  }

  function canVoice(bus) {
    if (!ctx) return false;
    let bgmUsed = 0;
    for (const v of voices) {
      if (v.endTime < ctx.currentTime) voices.delete(v);
      else if (v.bgm) bgmUsed++;
    }
    if (voices.size >= MAX_VOICES) return false;
    // Music drops its own notes before it can crowd out gameplay SEs.
    return bus === bgmBus ? bgmUsed < BGM_VOICES : true;
  }

  function blip(type, f0, f1, dur, vol, delay = 0, bus = seBus) {
    if (!canVoice(bus || seBus)) return;
    const t0 = ctx.currentTime + max0(delay);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(1, f0), t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(Math.max(0.001, vol), t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g);
    g.connect(bus || seBus);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
    keepVoice(o, t0 + dur + 0.03, bus || seBus);
  }

  function noise(dur, vol, f0, f1, delay = 0, bus = seBus) {
    if (!canVoice(bus || seBus) || !noiseBuf) return;
    const t0 = ctx.currentTime + max0(delay);
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    f.type = "bandpass";
    f.Q.value = 1.3;
    f.frequency.setValueAtTime(Math.max(1, f0), t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(Math.max(0.001, vol), t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    s.connect(f);
    f.connect(g);
    g.connect(bus || seBus);
    s.start(t0);
    s.stop(t0 + dur + 0.02);
    keepVoice(s, t0 + dur + 0.03, bus || seBus);
  }

  // Jingles and the death SE own the foreground; the music steps back for them
  // instead of fighting them in the same register.
  function duckBgm(level, hold) {
    if (!ctx || !bgmBus) return;
    const t = ctx.currentTime;
    bgmBus.gain.cancelScheduledValues(t);
    bgmBus.gain.setTargetAtTime(BGM_LEVEL * level, t, 0.02);
    bgmBus.gain.setTargetAtTime(BGM_LEVEL, t + hold, 0.1);
  }

  const max0 = (n) => Math.max(0, n || 0);

  function logEvent(name, data) {
    events.push({
      name,
      at: ctx ? ctx.currentTime : null,
      demo: !!data.demo,
      muted,
      voices: voices.size,
    });
    if (events.length > 160) events.shift();
  }

  function emit(name, data = {}) {
    logEvent(name, data);
    if (data.demo || !ctx) return;
    const delay = max0(data.delay);
    if (name.startsWith("jingle:")) duckBgm(0.35, delay + 0.5);
    else if (name === "player:miss") duckBgm(0.3, delay + 0.4);
    switch (name) {
      case "slash:swing":
        blip("square", 720, 1500, 0.055, 0.17, delay);
        noise(0.045, 0.07, 3200, 6500, delay);
        break;
      case "slash:empty":
        blip("square", 260, 150, 0.075, 0.08, delay);
        break;
      case "slash:cut": {
        const n = Math.min(5, Math.max(1, data.count || 1));
        for (let i = 0; i < n; i++) {
          const f = 620 * Math.pow(2, [0, 3, 5, 7, 10][i] / 12);
          blip("triangle", f, f * 1.03, 0.075, 0.2, delay + i * 0.035);
        }
        break;
      }
      case "slash:long":
        blip("triangle", 600, 1000, 0.12, 0.22, delay);
        blip("square", 900, 1900, 0.2, 0.12, delay + 0.07);
        noise(0.16, 0.07, 1800, 5200, delay + 0.03);
        break;
      case "slash:multi": {
        // One swing, several comets. The run is one note longer than the comet
        // count, so the ear hears the multiplier itself climb; it is faster and
        // brighter than the redline arpeggio so the two rewards never trade
        // places, and it still resolves inside an SE's length rather than
        // turning into a short jingle.
        const n = Math.min(5, Math.max(2, data.count || 2));
        const from = Math.min(n - 1, Math.max(0, data.from || 0));
        const ratios = [1, 1.25, 1.5, 2, 2.5, 3];
        for (let i = from; i <= n; i++) {
          const f = 784 * ratios[i];
          blip("square", f, f * 1.05, 0.08, 0.16, delay + (i - from) * 0.055);
        }
        noise(0.1, 0.08, 2600, 7200, delay + (n - from) * 0.055);
        break;
      }
      case "comet:naked":
        blip("square", data.red ? 520 : 660, 180, 0.22, 0.19, delay);
        noise(0.12, 0.1, 4200, 900, delay);
        break;
      case "comet:warn":
        blip("square", data.red ? 247 : 196, data.red ? 220 : 196, 0.065, 0.13, delay);
        blip("square", data.red ? 294 : 196, data.red ? 247 : 196, 0.065, 0.13, delay + 0.11);
        break;
      case "comet:spawn":
        noise(0.34, data.red ? 0.15 : 0.1, data.red ? 240 : 150, 620, delay);
        break;
      case "comet:redline":
        blip("triangle", data.tier === "RAZOR" ? 880 : 660, 1100, 0.08, 0.13, delay);
        blip("square", 1320, 1320, 0.05, 0.06, delay + 0.1);
        break;
      case "slash:redline": {
        const root = data.tier === "RAZOR" ? 784 : data.tier === "CLOSE" ? 659 : 587;
        [root, root * 1.25, root * 1.5].forEach((f, i) =>
          blip("square", f, f * 1.04, 0.09, 0.17, delay + i * 0.1)
        );
        break;
      }
      case "player:miss":
        noise(0.38, 0.4, 900, 100, delay);
        blip("square", 150, 42, 0.36, 0.3, delay);
        break;
      case "danger:near":
        blip("square", 174, 138, 0.09, 0.12, delay);
        break;
      case "ui:move":
        blip("square", 420, 500, 0.045, 0.08, delay);
        break;
      case "ui:confirm":
        blip("square", 620, 930, 0.08, 0.12, delay);
        break;
      case "jingle:start":
        [523, 659, 784].forEach((f, i) => blip("square", f, f, 0.085, 0.22, delay + i * 0.095, jingleBus));
        break;
      case "jingle:clear":
        [523, 659, 784, 1047].forEach((f, i) => blip("square", f, f, 0.09, 0.22, delay + i * 0.1, jingleBus));
        break;
      case "jingle:extend":
        [784, 1047, 1319].forEach((f, i) => blip("square", f, f, 0.075, 0.2, delay + i * 0.075, jingleBus));
        break;
      case "jingle:over":
        [392, 330, 262, 220].forEach((f, i) => blip("triangle", f, f * 0.98, 0.19, 0.25, delay + i * 0.2, jingleBus));
        break;
      // The run's win state. It is the only rising figure that resolves an
      // octave above the wave-clear jingle, so a clear cannot be mistaken for
      // one more wave transition.
      case "jingle:allclear":
        [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) =>
          blip("square", f, f, i === 6 ? 0.5 : 0.11, 0.24, delay + i * 0.13, jingleBus)
        );
        break;
    }
  }

  // --- BGM kit ---------------------------------------------------------
  // Era-inspired (1980 board: pulse + pulse + triangle + noise), not an
  // emulation of any specific chip. Everything below is score data for this
  // game only; the synth primitives above stay game-agnostic.
  const N = {
    E2: 82.41, F2: 87.31, G2: 98.0, A2: 110.0, B2: 123.47,
    C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, Gs3: 207.65,
    A3: 220.0, B3: 246.94, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23,
    G4: 392.0, A4: 440.0, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25,
    F5: 698.46, G5: 783.99,
  };

  // "step:NOTE" tokens per bar, so the score stays readable as a score.
  function line(perBar, bars) {
    const out = new Array(perBar * bars.length).fill(null);
    bars.forEach((spec, b) => {
      if (!spec) return;
      spec.split(" ").forEach((tok) => {
        const [i, note] = tok.split(":");
        out[b * perBar + Number(i)] = N[note];
      });
    });
    return out;
  }

  // MAIN THEME — A minor, Am / F / G / E, 16th grid, 4 bars.
  // Driving pulse bass under a sung lead: the comet chase never sits still.
  const PLAY_BASS = line(16, [
    "0:A2 2:A2 4:E3 6:A2 8:A3 10:A2 12:E3 14:A2",
    "0:F2 2:F2 4:C3 6:F2 8:F3 10:F2 12:C3 14:F2",
    "0:G2 2:G2 4:D3 6:G2 8:G3 10:G2 12:D3 14:G2",
    "0:E2 2:E2 4:B2 6:E2 8:E3 10:E2 12:B2 14:Gs3",
  ]);
  const PLAY_LEAD = line(16, [
    "0:A4 3:C5 6:E5 10:D5 12:C5",
    "0:C5 3:A4 6:F4 10:G4 12:A4",
    "0:B4 3:D5 6:G5 10:F5 12:D5",
    "0:E5 4:D5 6:C5 8:B4",
  ]);
  const PLAY_ARP = [
    [N.A3, N.C4, N.E4],
    [N.F3, N.A3, N.C4],
    [N.G3, N.B3, N.D4],
    [N.E3, N.Gs3, N.B3],
  ];

  // HIGH SCORE — C major, C / Am / F / G, 8th grid, 4 bars.
  // Slower, warmer and unhurried: the cabinet congratulating the player.
  const RANK_BASS = line(8, ["0:C3 4:G2", "0:A2 4:E3", "0:F2 4:C3", "0:G2 4:D3"]);
  const RANK_LEAD = line(8, [
    "0:G4 2:C5 4:E5 6:D5",
    "0:C5 3:B4 4:A4 6:C5",
    "0:A4 2:F4 4:G4 6:A4",
    "0:B4 2:D5 4:G4 6:B4",
  ]);
  const RANK_ARP = [
    [N.C4, N.E4, N.G4],
    [N.A3, N.C4, N.E4],
    [N.F3, N.A3, N.C4],
    [N.G3, N.B3, N.D4],
  ];

  const TRACKS = {
    play: {
      steps: PLAY_BASS.length,
      base: 0.107,
      // Space-Invaders-style pressure: a busy screen tightens the tempo.
      stepDur(i) {
        return this.base * (1 - 0.15 * i);
      },
      render(step, delay, i) {
        const bar = (step >> 4) & 3;
        const b = PLAY_BASS[step];
        if (b) blip("square", b, b, 0.1, 0.13, delay, bgmBus);
        const l = PLAY_LEAD[step];
        if (l) blip("square", l, l * 1.004, 0.145, 0.14 + i * 0.03, delay, bgmBus);
        if (step % 8 === 0) blip("triangle", 165, 48, 0.09, 0.12, delay, bgmBus);
        if (step % 16 === 8) noise(0.085, 0.075, 1700, 900, delay, bgmBus);
        if (i > 0.18 && step % 4 === 2) noise(0.028, 0.032, 6500, 4800, delay, bgmBus);
        if (i > 0.45 && step % 2 === 1) {
          const a = PLAY_ARP[bar][((step - 1) >> 1) % 3];
          blip("square", a, a, 0.05, 0.05, delay, bgmBus);
        }
      },
    },
    rank: {
      steps: RANK_BASS.length,
      base: 0.18,
      stepDur() {
        return this.base;
      },
      render(step, delay) {
        const bar = (step >> 3) & 3;
        const b = RANK_BASS[step];
        if (b) blip("triangle", b, b, 0.32, 0.13, delay, bgmBus);
        const l = RANK_LEAD[step];
        if (l) blip("square", l, l * 1.003, 0.22, 0.13, delay, bgmBus);
        if (step % 2 === 1) {
          const a = RANK_ARP[bar][((step - 1) >> 1) % 3];
          blip("triangle", a, a, 0.11, 0.055, delay, bgmBus);
        }
      },
    },
  };

  function pumpBgm() {
    if (!ctx || ctx.state !== "running") return;
    const track = TRACKS[bgmTrack];
    if (!track) return;
    while (nextBgmTime < ctx.currentTime + 0.12) {
      // Tempo is fixed per loop so a fluctuating board cannot make it warble.
      if (bgmStep === 0 || !bgmStepDur) bgmStepDur = track.stepDur(intensity);
      track.render(bgmStep, Math.max(0, nextBgmTime - ctx.currentTime), intensity);
      bgmStep = (bgmStep + 1) % track.steps;
      nextBgmTime += bgmStepDur;
    }
  }

  function startBgm(id = "play") {
    const next = TRACKS[id] ? id : "play";
    if (next !== bgmTrack) {
      stopBgm(true);
      bgmTrack = next;
    }
    // A track asked for while the context is asleep (first frames, tab return)
    // still has to start once the context wakes up.
    bgmWanted = next;
    if (bgmTimer || !ctx) return;
    if (ctx.state !== "running") {
      Promise.resolve(ctx.resume())
        .then(() => {
          if (bgmWanted === next) startBgm(next);
        })
        .catch(() => {});
      return;
    }
    if (nextBgmTime < ctx.currentTime) nextBgmTime = ctx.currentTime + 0.04;
    bgmTimer = setInterval(pumpBgm, 25);
    pumpBgm();
  }

  function stopBgm(reset = true) {
    if (bgmTimer) clearInterval(bgmTimer);
    bgmTimer = null;
    bgmWanted = null;
    if (reset) {
      bgmStep = 0;
      bgmStepDur = 0;
      nextBgmTime = 0;
    }
  }

  function pause() {
    stopBgm(false);
  }

  function resume() {
    if (ctx && ctx.state === "suspended") ctx.resume();
  }

  function suspend() {
    stopBgm(false);
    if (ctx && ctx.state === "running") ctx.suspend();
  }

  function setIntensity(value) {
    intensity = Math.max(0, Math.min(1, value || 0));
  }

  function applyMute() {
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.22, ctx.currentTime, 0.015);
    try {
      localStorage.setItem("cometSlashMute", muted ? "1" : "0");
    } catch (e) {}
  }

  function toggleMute() {
    muted = !muted;
    applyMute();
    return muted;
  }

  return {
    ensure,
    emit,
    startBgm,
    stopBgm,
    pause,
    resume,
    suspend,
    setIntensity,
    toggleMute,
    isMuted: () => muted,
    isReady: () => !!ctx && ctx.state === "running",
    debug: () => ({
      contextState: ctx ? ctx.state : "none",
      bgmRunning: !!bgmTimer,
      bgmTrack,
      bgmStep,
      tracks: Object.fromEntries(
        Object.entries(TRACKS).map(([id, t]) => [
          id,
          { steps: t.steps, stepDur: t.base, loop: +(t.steps * t.base).toFixed(3) },
        ])
      ),
      intensity,
      now: ctx ? +ctx.currentTime.toFixed(3) : 0,
      voices: voices.size,
      bgmVoices: [...voices].filter((v) => v.bgm).length,
      // Remaining life of every held voice, in seconds. A value that never
      // goes negative-and-collected means the pool is leaking and the whole
      // mix will fall silent once it fills.
      voiceLife: ctx ? [...voices].map((v) => +(v.endTime - ctx.currentTime).toFixed(2)) : [],
      muted,
      events: events.slice(),
      programs: { ...PROGRAM_BUDGETS },
    }),
  };
})();

window.addEventListener("keydown", () => Sfx.ensure());
window.addEventListener("pointerdown", () => Sfx.ensure());
