/*
 * VOLT KEEPER — audio kit (frozen contract + program/cue data + event table).
 *
 * This file is the single source of truth. The validation manifest is derived
 * from it by tools/export-manifest.mjs; it is never hand-maintained beside it.
 */
(function (root, factory) {
  const mod = factory(
    typeof module === "object" && module.exports ? require("./vk-dsp.js") : root.VKDsp
  );
  if (typeof module === "object" && module.exports) module.exports = mod;
  else root.VKKit = mod;
})(typeof globalThis !== "undefined" ? globalThis : this, function (VKDsp) {
  const m = VKDsp.midi;

  /* ---------------------------------------------------------------- profile */

  const PROFILE = {
    id: "vk-4voice-psg",
    fidelity: "era-inspired", // NOT an emulation of any named board.
    voiceLimit: 4,
    primitives: ["pulse", "tri", "noise"],
    voices: ["pulse1", "pulse2", "bass", "noise"],
    // Ownership: BGM holds pulse1 + bass + noise; SE holds pulse2 and may claim
    // noise (ducking the BGM noise voice). Jingles claim everything and pause BGM.
    voiceOwnership: {
      pulse1: "bgm+jingle",
      pulse2: "se",
      bass: "bgm+jingle",
      noise: "shared(bgm ducks for se)",
    },
    noiseOwnership: "single LFSR generator shared by BGM percussion and SE",
    parameterUpdateHz: 60,
    sameTickPolicy: "drop",
    // The ground click and the absorb it produces are one gesture, and several
    // absorbs in one ground are a count the player needs to hear. Colliding
    // members of this family merge into the highest-ranked one instead of
    // silencing each other.
    sameTickPolicyOverrides: { ground: "coalesce" },
    master: { gain: 0.28, drive: 1.6, dcBlockHz: 12, ceiling: 0.9 },
    bgmMode: "layered-adaptive",
    intentAxes: ["danger"], // one exposed axis, clamped to 0..1 at the bus
    // Where an adaptive change is allowed to land. The axis moves at 60 Hz;
    // the arrangement does not follow it at 60 Hz.
    bgmLayerBoundary: "bar", // 1.6 s
    bgmCueBoundary: "half-loop", // 6.4 s = 4 bars, phase-preserving
  };

  const BUDGETS = {
    sfxMaxDurationSeconds: 0.6,
    jingleMaxDurationSeconds: 1.6,
    maxStepsPerProgram: 24,
    bgmLoopMaxDurationSeconds: 32,
    bgmLoopMaxTailSeconds: 0,
    // Level ordering margin inside a co-occurrence group (linear amplitude).
    coOccurrenceMargin: 1.15,
  };

  /* --------------------------------------------------------------- programs */

  // Step helpers. `P` = SE lead voice, `N` = noise, `L` = BGM/jingle lead, `B` = bass.
  const P = (offset, duration, freq, gain, extra) =>
    Object.assign({ offset, duration, voice: "pulse2", wave: "pulse", duty: 0.5, freq, gain, env: "perc" }, extra);
  const N = (offset, duration, freq, gain, extra) =>
    Object.assign({ offset, duration, voice: "noise", wave: "noise", freq, gain, env: "perc" }, extra);
  const L = (offset, duration, freq, gain, extra) =>
    Object.assign({ offset, duration, voice: "pulse1", wave: "pulse", duty: 0.25, freq, gain, env: "perc" }, extra);
  const B = (offset, duration, freq, gain, extra) =>
    Object.assign({ offset, duration, voice: "bass", wave: "tri", freq, gain, env: "gate" }, extra);

  // Absorb chain: identical contour, rising register. The chain index is
  // information (2nd/3rd absorb in one ground are worth more), so it is carried
  // in pitch rather than in loudness alone.
  const absorb = (id, base, gain) => ({
    id,
    kind: "sfx",
    steps: [
      N(0, 0.035, 8000, 0.42, { freqTo: 3000 }),
      P(0.008, 0.075, base, gain, { freqTo: base * 1.5, duty: 0.25 }),
    ],
  });

  const PROGRAM_LIST = [
    // --- control feedback -------------------------------------------------
    {
      id: "ground",
      kind: "sfx",
      steps: [
        P(0, 0.06, 196, 0.5, { freqTo: 392, env: "gate" }),
        N(0, 0.02, 6000, 0.22, { freqTo: 3000 }),
      ],
    },
    {
      id: "groundEmpty",
      kind: "sfx",
      steps: [
        P(0, 0.09, 165, 0.28, { freqTo: 123, env: "gate" }),
        N(0, 0.09, 900, 0.3, { freqTo: 260 }),
      ],
    },
    // --- consequence ------------------------------------------------------
    absorb("absorb1", 880, 0.52),
    absorb("absorb2", 1046, 0.56),
    absorb("absorb3", 1318, 0.6),
    {
      id: "absorbHeavy",
      kind: "sfx",
      steps: [
        P(0, 0.13, 330, 0.58, { freqTo: 98 }),
        N(0.1, 0.1, 2400, 0.38, { freqTo: 700 }),
      ],
    },
    {
      id: "absorbCharger",
      kind: "sfx",
      steps: [
        P(0, 0.045, 659, 0.42, { duty: 0.25, env: "gate" }),
        P(0.05, 0.045, 988, 0.47, { duty: 0.25, env: "gate" }),
        P(0.1, 0.09, 1319, 0.52, { duty: 0.25 }),
      ],
    },
    {
      id: "absorbDrone",
      kind: "sfx",
      steps: [P(0, 0.07, 392, 0.3, { freqTo: 523, duty: 0.125 })],
    },

    // --- ambient / terrain -------------------------------------------------
    // Fires whenever an arrow actually turns a spark, so it is deliberately the
    // quietest thing in the kit -- but it must still clear the bed enough to
    // read as terrain.
    { id: "deflect", kind: "sfx", steps: [P(0, 0.022, 1568, 0.24, { duty: 0.125 })] },
    {
      id: "bumper",
      kind: "sfx",
      steps: [
        P(0, 0.05, 587, 0.26, { freqTo: 880, duty: 0.25 }),
        N(0, 0.028, 5000, 0.16),
      ],
    },
    { id: "launch", kind: "sfx", steps: [P(0, 0.06, 147, 0.26, { freqTo: 110, env: "gate" })] },

    // --- loss / warning ----------------------------------------------------
    { id: "scavenge", kind: "sfx", steps: [N(0, 0.18, 1400, 0.34, { freqTo: 380 })] },
    {
      id: "warning",
      kind: "sfx",
      steps: [
        P(0, 0.045, 110, 0.46, { env: "gate" }),
        P(0.085, 0.055, 98, 0.42, { env: "gate" }),
      ],
    },
    {
      // Surplus energy converting to score: a bright doubled blip that sits
      // above the absorb chain it grows out of.
      id: "overcharge",
      kind: "sfx",
      steps: [
        P(0, 0.05, 1568, 0.5, { freqTo: 2093, duty: 0.25 }),
        P(0.055, 0.09, 2349, 0.52, { freqTo: 3136, duty: 0.125 }),
        N(0, 0.04, 9000, 0.3, { freqTo: 5000 }),
      ],
    },
    {
      // The wave's quota being met: a rising three-note confirmation that ends
      // higher than it starts, so it reads as an arrival rather than as another
      // absorb. It shares a tick with the absorb that completed it and outranks
      // it in the ground family -- the quota is the news at that moment.
      id: "quotaMet",
      kind: "sfx",
      steps: [
        P(0, 0.055, 523, 0.46, { duty: 0.25, env: "gate" }),
        P(0.065, 0.055, 784, 0.5, { duty: 0.25, env: "gate" }),
        P(0.13, 0.16, 1047, 0.56, { duty: 0.25 }),
        N(0, 0.05, 7000, 0.28, { freqTo: 4000 }),
      ],
    },
    {
      id: "multMax",
      kind: "sfx",
      steps: [
        P(0, 0.04, 1319, 0.34, { duty: 0.25, env: "gate" }),
        P(0.045, 0.04, 1760, 0.38, { duty: 0.25, env: "gate" }),
        P(0.09, 0.1, 2093, 0.44, { duty: 0.25 }),
      ],
    },

    // --- jingles (BGM pauses for their duration) ---------------------------
    {
      id: "jingle:miss",
      kind: "jingle",
      steps: [
        N(0, 0.12, 3000, 0.46, { freqTo: 400 }),
        L(0, 0.14, m(69), 0.4),
        L(0.16, 0.14, m(65), 0.4),
        L(0.32, 0.14, m(60), 0.4),
        L(0.48, 0.34, m(55), 0.42, { freqTo: m(52) }),
        B(0, 0.8, m(43), 0.32),
      ],
    },
    {
      id: "jingle:surge",
      kind: "jingle",
      steps: [
        L(0, 0.42, 1200, 0.38, { freqTo: 300 }),
        B(0, 0.42, m(36), 0.32),
        N(0, 0.42, 6000, 0.22, { freqTo: 800 }),
      ],
    },
    {
      id: "jingle:start",
      kind: "jingle",
      steps: [
        L(0, 0.1, m(72), 0.38, { env: "gate" }),
        L(0.12, 0.1, m(76), 0.4, { env: "gate" }),
        L(0.24, 0.28, m(81), 0.44),
        B(0, 0.1, m(48), 0.3),
        B(0.12, 0.1, m(52), 0.3),
        B(0.24, 0.28, m(57), 0.32),
      ],
    },
    {
      id: "jingle:gameover",
      kind: "jingle",
      steps: [
        L(0, 0.18, m(67), 0.4),
        L(0.2, 0.18, m(64), 0.4),
        L(0.4, 0.18, m(60), 0.4),
        L(0.6, 0.55, m(55), 0.42, { freqTo: m(53) }),
        B(0, 0.18, m(43), 0.32),
        B(0.2, 0.18, m(40), 0.32),
        B(0.4, 0.18, m(36), 0.32),
        B(0.6, 0.55, m(31), 0.34),
        N(0, 0.1, 1200, 0.18, { freqTo: 300 }),
      ],
    },
  ];

  const PROGRAMS = {};
  for (const p of PROGRAM_LIST) {
    p.voices = Array.from(new Set(p.steps.map((s) => s.voice)));
    p.durationSeconds = p.steps.reduce((a, s) => Math.max(a, s.offset + s.duration), 0);
    PROGRAMS[p.id] = p;
  }

  /* ------------------------------------------------------------- BGM cues */

  const BPM = 150;
  const SIXTEENTH = 60 / BPM / 4; // 0.1 s
  const BAR = 16 * SIXTEENTH; // 1.6 s
  const BARS = 8;
  const LOOP = BARS * BAR; // 12.8 s
  // A cue swap lands on a four-bar boundary, not at the end of the loop. The
  // two halves of every cue are a phrase and its answer, so the halfway point
  // is a musical seam; waiting for the full 12.8 s would mean a danger spike
  // was over before the critical cue arrived. Both cues share this grid and
  // the incoming source starts at the matching offset, so the swap keeps its
  // place in the form instead of restarting the phrase.
  const SWAP_GRID = LOOP / 2; // 6.4 s

  const R = 0; // rest marker in pattern arrays

  /* Form for both cues: 8 bars of 16 sixteenths, A (bars 1-4) + B (bars 5-8).
   * The A half of `main` is the original hook -- the rising cell A-C-E that
   * opens bars 1 and 2, answered a third down in bar 3. The B half is the
   * contrast that the single 4-bar loop never had: an octave up, a 3-3-2
   * rhythm against A's syncopation, and a descending turnaround in bar 8 that
   * hands back to the top. */
  const LEAD_MAIN = [
    69, R, 72, 76, R, 72, R, 69, R, R, 72, R, 76, R, R, R,
    69, R, 72, 76, R, 79, R, 76, R, R, 72, R, 69, R, R, R,
    65, R, 69, 72, R, 69, R, 65, R, R, 67, R, 71, R, R, R,
    64, R, 67, 71, R, 72, R, 74, 76, R, R, R, R, R, R, R,
    81, R, R, 79, R, R, 76, R, 79, R, R, 81, R, R, 76, R,
    81, R, R, 84, R, R, 81, R, 79, R, R, 76, R, R, R, R,
    77, R, R, 76, R, R, 74, R, 72, R, R, 74, R, R, 76, R,
    79, R, R, 76, R, R, 72, R, 74, R, 71, R, 69, R, R, R,
  ];

  /* `critical` is its own phrase, not `main` transposed. A is a stab cell that
   * grinds the tonic against its b2 neighbour (A-Bb); B drops the syncopation
   * for relentless eighths and ends on a run back down to the tonic. */
  const LEAD_CRITICAL = [
    81, R, 81, 82, R, 81, R, 79, R, R, 81, R, 82, R, R, R,
    81, R, 81, 82, R, 84, R, 82, R, R, 81, R, 79, R, R, R,
    76, R, 76, 77, R, 76, R, 74, R, R, 76, R, 77, R, R, R,
    79, R, 79, 80, R, 79, R, 77, R, R, 76, R, 74, R, R, R,
    81, R, 82, R, 81, R, 79, R, 81, R, 82, R, 84, R, 82, R,
    81, R, 82, R, 84, R, 82, R, 81, R, 79, R, 77, R, 79, R,
    76, R, 77, R, 76, R, 74, R, 76, R, 77, R, 79, R, 77, R,
    81, R, 82, R, 81, R, 79, R, 77, R, 76, R, 74, R, 72, R,
  ];

  // Bass, one entry per eighth. `main` pedals under A and walks under B;
  // `critical` grinds the same b2 the lead does and is played at sixteenths.
  const BASS_MAIN = [
    45, 45, 45, 45, 45, 45, 43, 45,
    45, 45, 45, 45, 45, 45, 40, 43,
    41, 41, 41, 41, 41, 41, 43, 43,
    40, 40, 40, 40, 43, 43, 45, 45,
    45, 45, 45, 45, 48, 48, 47, 47,
    45, 45, 45, 45, 43, 43, 41, 41,
    43, 43, 43, 43, 40, 40, 43, 43,
    41, 41, 40, 40, 44, 44, 45, 45,
  ];
  const BASS_CRITICAL = [
    45, 45, 45, 45, 45, 45, 46, 46,
    45, 45, 45, 45, 45, 45, 43, 43,
    45, 45, 45, 45, 46, 46, 45, 45,
    43, 43, 43, 43, 41, 41, 40, 40,
    45, 45, 45, 45, 45, 45, 46, 46,
    45, 45, 45, 45, 43, 43, 45, 45,
    41, 41, 41, 41, 40, 40, 41, 41,
    40, 40, 40, 40, 44, 44, 45, 45,
  ];

  /* Percussion, one entry per sixteenth: 0 rest, 1 hit, 2 accent. `main` is an
   * eighth-note groove with a sixteenth pickup and a fill closing each 4-bar
   * half, which is what the old constant sixteenth tick could not do -- it had
   * one density and therefore no phrase. `critical` keeps the constant tick on
   * purpose: that is the cue where a machine-gun hat is the point. */
  const HAT_BAR = [2, 0, 1, 0, 1, 0, 1, 0, 2, 0, 1, 0, 1, 0, 1, 1];
  const HAT_FILL = [2, 0, 1, 0, 1, 0, 1, 0, 2, 0, 1, 1, 1, 1, 1, 1];
  const HATS_MAIN = [].concat(
    HAT_BAR, HAT_BAR, HAT_BAR, HAT_FILL,
    HAT_BAR, HAT_BAR, HAT_BAR, HAT_FILL
  );
  const HATS_CRITICAL = Array.from({ length: BARS * 16 }, (_, i) => (i % 4 === 0 ? 2 : 1));

  function leadSteps(pattern, gain, duty) {
    const steps = [];
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i] === R) continue;
      let hold = 1;
      while (i + hold < pattern.length && pattern[i + hold] === R) hold++;
      const duration = Math.min(0.4, hold * SIXTEENTH - 0.01);
      steps.push(L(i * SIXTEENTH, duration, m(pattern[i]), gain, { duty, layer: 1 }));
    }
    return steps;
  }

  function bassStepsEighth(pattern, gain) {
    return pattern.map((n, i) => B(i * SIXTEENTH * 2, 0.13, m(n), gain, { layer: 0 }));
  }

  function bassStepsSixteenth(pattern, gain) {
    const steps = [];
    for (let i = 0; i < pattern.length * 2; i++) {
      steps.push(B(i * SIXTEENTH, 0.07, m(pattern[i >> 1]), gain, { layer: 0 }));
    }
    return steps;
  }

  function hatSteps(pattern, gain, accentGain) {
    const steps = [];
    for (let i = 0; i < pattern.length; i++) {
      if (!pattern[i]) continue;
      const accent = pattern[i] === 2;
      steps.push(
        N(i * SIXTEENTH, 0.03, accent ? 9000 : 6000, accent ? accentGain : gain, { layer: 2 })
      );
    }
    return steps;
  }

  function cue(id, steps) {
    const c = {
      id,
      durationSeconds: LOOP,
      loopStartSeconds: 0,
      loopEndSeconds: LOOP,
      tempoBpm: BPM,
      steps: steps.slice().sort((a, b) => a.offset - b.offset),
    };
    c.voices = Array.from(new Set(c.steps.map((s) => s.voice)));
    return c;
  }

  const BGM_CUES = {
    main: cue("main", [
      ...bassStepsEighth(BASS_MAIN, 0.3),
      ...leadSteps(LEAD_MAIN, 0.26, 0.25),
      ...hatSteps(HATS_MAIN, 0.08, 0.14),
    ]),
    critical: cue("critical", [
      ...bassStepsSixteenth(BASS_CRITICAL, 0.3),
      ...leadSteps(LEAD_CRITICAL, 0.24, 0.125),
      ...hatSteps(HATS_CRITICAL, 0.1, 0.17),
    ]),
  };

  /* Layer gating: which BGM voice is audible at a given danger level.
   *
   * The thresholds are set from the measured distribution of the danger axis,
   * not from where the intensity ladder looks tidy on paper. They have been
   * re-derived twice, because the axis is `1 - capacitor/100` and the capacitor
   * has since become a resource that actually moves:
   *
   *   - when drain was 40% of income the axis sat below 0.04 for 62% of frames
   *     and never passed 0.58, so a ladder of 0.25/0.60/0.85 was dead data;
   *   - with drain tracking income and a wave clear that cashes the capacitor
   *     out for a fresh 70, the same measurement over waves 1-12 gives p50
   *     0.33, p90 0.62, p95 0.69, p99 0.84, and the axis reaches 1.0 when a
   *     capacitor actually runs out.
   *
   * The bed is bass + lead unconditionally -- playing well must not mean
   * listening to a pedal tone -- and the percussion layer is the one that
   * answers the axis: 0.45 is crossed for 37% of play, which is a state, not a
   * decoration. (At 0.35 against this axis it was 54%, which is a bed.) `dangerOff` gives each layer its own hysteresis; without it the
   * raw axis crosses a threshold about 40 times a minute and the arrangement
   * flickers instead of arranging. */
  const BGM_LAYERS = [
    { voice: "bass", layer: 0, dangerOn: 0, dangerOff: 0 },
    { voice: "pulse1", layer: 1, dangerOn: 0, dangerOff: 0 },
    { voice: "noise", layer: 2, dangerOn: 0.45, dangerOff: 0.35 },
  ];
  // Cue swap is applied only at a swap-grid boundary (hysteresis avoids
  // flapping). `critical` is the sound of a capacitor under 35 -- a state the
  // player can see on the bar and act on, not a level the axis brushes on its
  // way to nowhere. The width of the hysteresis is set by how long a visit
  // lasts, not by symmetry: replaying 4083 s of the axis, 0.60/0.45 arrived
  // 2.4 times a minute and left after 4.0 s, which is shorter than the 6.4 s
  // half-loop it swaps into, so the cue never got to finish a phrase. At
  // 0.65/0.35 it arrives 1.5 times a minute and stays 7.0 s. Raising it further
  // would be quieter still, but 0.70 sits past the axis's p95: past there the
  // cue is only reachable as a run ends.
  const CUE_SWITCH = { toCritical: 0.65, toMain: 0.35 };

  /* ---------------------------------------------------------------- events */

  // `family` and `minIntervalFrames` are game-side fields; the manifest
  // validator ignores them.
  const EVENTS = [
    { name: "capacitor:warning", classification: "sfx", priority: 120, alias: "warning" },
    { name: "game:over", classification: "jingle", priority: 115, alias: "jingle:gameover" },
    { name: "keeper:miss", classification: "jingle", priority: 110, alias: "jingle:miss" },
    { name: "keeper:ground", classification: "sfx", priority: 100, alias: "ground", family: "ground", rank: 0 },
    { name: "keeper:groundEmpty", classification: "sfx", priority: 95, alias: "groundEmpty" },
    { name: "heavy:absorb", classification: "sfx", priority: 93, alias: "absorbHeavy", family: "ground", rank: 5 },
    { name: "charger:absorb", classification: "sfx", priority: 93, alias: "absorbCharger", family: "ground", rank: 4 },
    { name: "spark:absorb3", classification: "sfx", priority: 92, alias: "absorb3", family: "ground", rank: 3 },
    { name: "spark:absorb2", classification: "sfx", priority: 91, alias: "absorb2", family: "ground", rank: 2 },
    { name: "spark:absorb1", classification: "sfx", priority: 90, alias: "absorb1", family: "ground", rank: 1 },
    { name: "keeper:overcharge", classification: "sfx", priority: 94, alias: "overcharge", family: "ground", rank: 6 },
    { name: "wave:quota", classification: "sfx", priority: 96, alias: "quotaMet", family: "ground", rank: 7 },
    { name: "minor:absorb", classification: "sfx", priority: 85, alias: "absorbDrone" },
    { name: "scavenger:disable", classification: "sfx", priority: 70, alias: "scavenge" },
    { name: "wave:surge", classification: "jingle", priority: 60, alias: "jingle:surge" },
    { name: "game:start", classification: "jingle", priority: 60, alias: "jingle:start" },
    { name: "multiplier:max", classification: "sfx", priority: 55, alias: "multMax" },
    { name: "spark:bumper", classification: "sfx", priority: 40, alias: "bumper", minIntervalFrames: 3 },
    { name: "spark:deflect", classification: "sfx", priority: 30, alias: "deflect", minIntervalFrames: 4 },
    { name: "spark:launch", classification: "sfx", priority: 25, alias: "launch" },
    { name: "bgm:main", classification: "bgm", priority: 20, alias: { kind: "cue", id: "main" } },
    { name: "bgm:critical", classification: "bgm", priority: 20, alias: { kind: "cue", id: "critical" } },
    // Deliberate silences: the visuals already carry these, and sounding them
    // would turn constant terrain motion into background noise.
    { name: "keeper:recover", classification: "none", priority: 0 },
    { name: "wave:layout", classification: "none", priority: 0 },
    { name: "arrow:turn", classification: "none", priority: 0 },
  ];

  const ALIASES = {};
  for (const e of EVENTS) if (e.alias) ALIASES[e.name] = e.alias;

  const EVENT_BY_NAME = {};
  for (const e of EVENTS) EVENT_BY_NAME[e.name] = e;

  return {
    PROFILE,
    BUDGETS,
    PROGRAMS,
    PROGRAM_LIST,
    BGM_CUES,
    BGM_LAYERS,
    CUE_SWITCH,
    EVENTS,
    EVENT_BY_NAME,
    ALIASES,
    LOOP_SECONDS: LOOP,
    BAR_SECONDS: BAR,
    SWAP_GRID_SECONDS: SWAP_GRID,
  };
});
