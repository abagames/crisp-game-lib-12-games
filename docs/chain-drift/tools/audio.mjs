// Audio-contract gate for CHAIN DRIFT. Three layers, cheapest first:
//
//   1. the frozen contract         profile, budgets, registry, source boundary
//   2. what the data sounds like   every program rendered offline and measured
//   3. what the running game does  emission, gating, arbitration, BGM sections
//
// Layer 2 exists because a schema check cannot tell a program that plays from
// one that is silent, buried under the music or clipped. It is not a substitute
// for listening, but it fails on the things listening would catch first.
//
//   node tools/audio.mjs [url] [--manifest out.json]
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
const require = createRequire(process.cwd() + "/");
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const manifestIndex = args.indexOf("--manifest");
const manifestAt = manifestIndex >= 0 ? args[manifestIndex + 1] : null;
const url =
  args.find((a, i) => !a.startsWith("--") && i !== manifestIndex + 1) ||
  "http://localhost:8231/index.html";

const errors = [];
const failures = [];
const check = (name, actual, expected) => {
  const ok =
    typeof expected === "function"
      ? expected(actual)
      : JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(actual)}`);
  if (!ok) failures.push(name);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 500, height: 520 } });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text());
});
const wait = (ms) => page.waitForTimeout(ms);

await page.goto(url, { waitUntil: "load" });
await page.waitForFunction(() => window.CD != null, { timeout: 10000 });
await page.waitForFunction(() => window.CD.state().phase === "attract", {
  timeout: 10000,
});

// ---------------------------------------------------------------------------
console.log("\n--- frozen contract: one PSG-like board, four monophonic voices ---");

const profile = await page.evaluate(() => window.CD.audioProfile());
check("audio profile is the frozen era-inspired four-voice board", {
  id: profile.id,
  fidelity: profile.fidelity,
  voices: profile.voices,
  waves: profile.waves,
  master: profile.master,
}, {
  id: "chain-drift-psg-4v",
  fidelity: "era-inspired",
  voices: ["p1", "p2", "bass", "noise"],
  waves: ["p12", "p25", "p50", "tri", "noise"],
  master: { gain: 0.22, dcBlockHz: 30, softClip: true, channels: 1 },
});
check("budgets are the frozen ones the programs are authored against", {
  sfxLastFrame: profile.sfxLastFrame,
  jingleLastFrame: profile.jingleLastFrame,
  stepsMax: profile.stepsMax,
  noteFramesMax: profile.noteFramesMax,
  noteGainMax: profile.noteGainMax,
  bgmGainMax: profile.bgmGainMax,
  bgmLoopFramesMax: profile.bgmLoopFramesMax,
}, {
  sfxLastFrame: 36,
  jingleLastFrame: 96,
  stepsMax: 24,
  noteFramesMax: 60,
  noteGainMax: 0.6,
  bgmGainMax: 0.22,
  bgmLoopFramesMax: 240,
});
check(
  "loudness is contracted over a window, not on peaks alone",
  [profile.sustainWindowSec, profile.ceremonyOverMusicMaxDb],
  [0.3, 6]
);

const kit = await page.evaluate(() => window.CD.audioKit());
const registry = await page.evaluate(() => window.CD.audioEventRegistry());
const priorities = await page.evaluate(() => window.CD.audioPriorities());
const kitIds = Object.keys(kit);
const cueNames = await page.evaluate(() => window.CD.audioBgmCue().cues);

check("the kit defines 23 semantic programs", kitIds.length, 23);
check("priority order runs control > danger > consequence > cabinet > BGM", [
  priorities.control > priorities.danger,
  priorities.danger > priorities.consequence,
  priorities.consequence > priorities.cabinet,
  priorities.cabinet > priorities.bgmBass,
  priorities.bgmBass > priorities.bgmPerc,
  priorities.bgmPerc > priorities.bgmMid,
], [true, true, true, true, true, true]);
check(
  "every declared audible event resolves to a program, and every program is declared",
  {
    declaredWithoutProgram: Object.entries(registry)
      .filter(([n, r]) => r.role !== "none" && r.role !== "bgm" && kit[n] == null)
      .map(([n]) => n),
    programsNotDeclared: kitIds.filter((n) => registry[n] == null),
  },
  { declaredWithoutProgram: [], programsNotDeclared: [] }
);
check(
  "every audible event declares which cue it can be heard under, or that it is none",
  Object.entries(registry)
    .filter(([, r]) => r.role !== "none")
    .filter(([, r]) => r.heardUnder !== null && !cueNames.includes(r.heardUnder))
    .map(([n]) => n),
  []
);
check(
  "the same-tick policy is part of the contract, not of the test",
  [profile.sameTickPolicy, profile.audibilityMargin],
  ["drop", 1.25]
);
check(
  "the silent moments are declared silent, not merely absent",
  Object.entries(registry).filter(([, r]) => r.role === "none").map(([n]) => n).sort(),
  [
    "capacitor:gather",
    "lodestone:capture",
    "mine:arm:overload",
    "mine:spawn",
    "mult:milestone",
    "player:move",
  ]
);
check(
  "no silent event carries program data",
  Object.entries(registry)
    .filter(([n, r]) => r.role === "none" && kit[n] != null)
    .map(([n]) => n),
  []
);
check(
  "every SFX ends within 36 frames and every jingle within 96",
  kitIds.filter(
    (id) =>
      kit[id].lastFrame >
      (kit[id].kind === "jingle" ? profile.jingleLastFrame : profile.sfxLastFrame)
  ),
  []
);
check(
  "no program exceeds 24 steps, a 60-frame note or the 0.6 gain ceiling",
  kitIds.filter(
    (id) =>
      kit[id].steps > profile.stepsMax ||
      kit[id].endFrame - kit[id].lastFrame > profile.noteFramesMax ||
      kit[id].maxGain > profile.noteGainMax
  ),
  []
);
check(
  "no program asks one monophonic voice for two notes at once",
  kitIds.filter((id) => {
    const byVoice = {};
    for (const [v, from, to] of kit[id].spans) {
      (byVoice[v] = byVoice[v] || []).push([from, to]);
    }
    return Object.values(byVoice).some((spans) => {
      spans.sort((a, b) => a[0] - b[0]);
      return spans.some((s, i) => i > 0 && s[0] < spans[i - 1][1]);
    });
  }),
  []
);
check(
  "only the primitives and voices in the profile are ever used",
  kitIds.filter(
    (id) =>
      kit[id].voices.some((v) => !profile.voices.includes(v)) ||
      kit[id].waves.some((w) => !profile.waves.includes(w))
  ),
  []
);

const cue = await page.evaluate(() => window.CD.audioBgmCue());
check("two cues, each a sixteen-step loop, each read from a gauge on screen", {
  loopSteps: cue.loopSteps,
  barSteps: cue.barSteps,
  cues: cue.cues,
  sections: Object.keys(cue.sections),
  loadThresholds: [cue.buildLoad, cue.hotLoad],
  entryHurryFrames: cue.entryHurryFrames,
}, {
  loopSteps: 16,
  barSteps: 8,
  cues: ["drift", "entry"],
  sections: [
    "drift:idle",
    "drift:build",
    "drift:hot",
    "drift:danger",
    "entry:hold",
    "entry:hurry",
  ],
  loadThresholds: [0.5, 0.7],
  entryHurryFrames: 300,
});
check(
  "the field arrangement tightens with pressure: faster steps, never fewer layers",
  ["drift:idle", "drift:build", "drift:hot", "drift:danger"].map((s) => [
    cue.sections[s].stepFrames,
    cue.sections[s].layers.length,
  ]),
  [[14, 1], [11, 2], [9, 3], [7, 3]]
);
check(
  "the initials cue hurries when the clock does, and says so as urgent",
  ["entry:hold", "entry:hurry"].map((s) => [
    cue.sections[s].stepFrames,
    cue.sections[s].urgent,
  ]),
  [[13, false], [9, true]]
);
check(
  "only deadline arrangements may change outside a bar line",
  Object.entries(cue.sections).filter(([, s]) => s.urgent).map(([n]) => n),
  ["drift:danger", "entry:hurry"]
);
check(
  "p1 is reserved for the player: no arrangement ever takes that voice",
  Object.values(cue.sections).filter((s) => s.voices.includes("p1")),
  []
);
check(
  "every arrangement stays under the BGM gain ceiling",
  Object.values(cue.sections).filter((s) => s.maxGain > profile.bgmGainMax),
  []
);
check(
  "every loop fits the 4-second budget and ends inside itself: no tail",
  Object.entries(cue.sections).filter(
    ([, s]) =>
      s.loopFrames > profile.bgmLoopFramesMax || s.lastNoteEndFrame > s.loopFrames
  ).map(([n]) => n),
  []
);

// ---------------------------------------------------------------------------
console.log("\n--- source boundary: gameplay code never reaches the hardware ---");

const source = readFileSync("main.js", "utf8").split("\n");
const openAt = source.findIndex((l) => l.includes("======= audio ===="));
const closeAt = source.findIndex((l) => l.includes("======= /audio ===="));
const hardware = /\b(AudioContext|OfflineAudioContext|createOscillator|createBufferSource|createGain|createBiquadFilter|createPeriodicWave|createWaveShaper|startRendering)\b/;
check(
  "the audio section is delimited and non-empty",
  openAt > 0 && closeAt > openAt,
  true
);
check(
  "no Web Audio call exists outside the audio section",
  source
    .map((line, i) => [i + 1, line])
    .filter(([i, line]) => hardware.test(line) && (i < openAt || i > closeAt))
    .map(([i]) => i),
  []
);
check(
  "the engine's own sound path is never called and never initialised",
  {
    libraryPlayCalls: source.filter((l) => /(^|[^.\w])play\(/.test(l)).length,
    optionDisablesIt: source.some((l) => /isSoundEnabled:\s*false/.test(l)),
    audioLibraryInHtml: /algo-chip|sounds-some-sounds|\bsss\b/.test(
      readFileSync("index.html", "utf8").replace(/<!--[\s\S]*?-->/g, "")
    ),
  },
  { libraryPlayCalls: 0, optionDisablesIt: true, audioLibraryInHtml: false }
);

// ---------------------------------------------------------------------------
console.log("\n--- rendered output: what the data actually sounds like ---");

const rendered = await page.evaluate(async () => {
  const out = { programs: {}, bgm: {} };
  for (const id of Object.keys(window.CD.audioKit())) {
    out.programs[id] = await window.CD.audioRender(id);
  }
  for (const s of Object.keys(window.CD.audioBgmCue().sections)) {
    out.bgm[s] = await window.CD.audioRenderBgm(s);
  }
  return out;
});

check(
  "every program renders audible output",
  Object.entries(rendered.programs).filter(([, r]) => r.peak < 0.05).map(([n]) => n),
  []
);
check(
  "nothing clips the master chain",
  Object.entries(rendered.programs)
    .concat(Object.entries(rendered.bgm))
    .filter(([, r]) => r.peak > 0.95)
    .map(([n]) => n),
  []
);
const loudestSfxPeak = Math.max(
  ...Object.entries(rendered.programs)
    .filter(([id]) => kit[id].kind === "sfx")
    .map(([, r]) => r.peak)
);
check(
  "jingles never peak above the loudest gameplay SFX",
  Object.entries(rendered.programs)
    .filter(([id, r]) => kit[id].kind === "jingle" && r.peak > loudestSfxPeak)
    .map(([id]) => id),
  []
);

// Peak says a sound is present; it does not say how loud it is. A jingle is a
// sustained multi-voice phrase and an SFX is usually a click, so the two can
// share a peak and be nowhere near each other to the ear -- which is exactly
// how the ceremonies came to sit 9 dB over the music with every peak check
// green. These two measure the thing the ear integrates instead.
const dB = (x) => 20 * Math.log10(x);
const loudestSfxSustain = Math.max(
  ...Object.entries(rendered.programs)
    .filter(([id]) => kit[id].kind === "sfx")
    .map(([, r]) => r.sustain)
);
check(
  "and none of them sustains louder than it either",
  Object.entries(rendered.programs)
    .filter(([id, r]) => kit[id].kind === "jingle" && r.sustain > loudestSfxSustain)
    .map(([id]) => id),
  []
);
const loudestMusic = Math.max(...Object.values(rendered.bgm).map((r) => r.sustain));
const loudestCeremony = Math.max(
  ...Object.entries(rendered.programs)
    .filter(([id]) => kit[id].kind === "jingle")
    .map(([, r]) => r.sustain)
);
check(
  "the ceremonies and the music belong to one cabinet, not two mixes",
  +(dB(loudestCeremony) - dB(loudestMusic)).toFixed(1),
  (v) => v <= profile.ceremonyOverMusicMaxDb
);
check(
  "every program starts on its first frame",
  Object.entries(rendered.programs).filter(([, r]) => r.onsetSec > 0.02).map(([n]) => n),
  []
);
check(
  "no program rings past its own last note",
  Object.entries(rendered.programs)
    .filter(([id, r]) => r.tailSec > kit[id].endFrame / 60 + 0.06)
    .map(([n]) => n),
  []
);

// Everything that can sound while a cue is running has to clear *that* cue --
// a field sound is never heard against the initials music, or the other way
// round, so each group is measured against the music it actually competes with.
// The groups come from the event registry, not from a list kept here: a list
// here is a list someone forgets to extend, and the sound they added would then
// never be checked against anything.
const groups = {};
for (const [name, r] of Object.entries(registry)) {
  if (r.role === "none" || r.role === "bgm" || r.heardUnder == null) continue;
  (groups[r.heardUnder] = groups[r.heardUnder] || []).push(name);
}
const loudest = (cueName) =>
  Math.max(
    ...Object.entries(rendered.bgm)
      .filter(([id]) => id.startsWith(`${cueName}:`))
      .map(([, r]) => r.peak)
  );
check(
  "every cue has sounds declared against it, and every sound clears its own cue",
  Object.fromEntries(
    cueNames.map((c) => [
      c,
      {
        events: (groups[c] || []).length,
        below: (groups[c] || []).filter(
          (id) => rendered.programs[id].peak < loudest(c) * profile.audibilityMargin
        ),
      },
    ])
  ),
  (v) =>
    cueNames.every((c) => v[c] && v[c].events > 0 && v[c].below.length === 0)
);
check(
  "the music is under everything: no cue peaks above the quietest sound over it",
  cueNames.filter(
    (c) =>
      loudest(c) >=
      Math.min(...(groups[c] || []).map((id) => rendered.programs[id].peak))
  ),
  []
);
check(
  "the field arrangements grow denser with pressure rather than merely louder",
  ["drift:idle", "drift:build", "drift:hot", "drift:danger"].map((s) =>
    Math.round((rendered.bgm[s].rms / (cue.sections[s].loopFrames / 60)) * 1000)
  ),
  (v) => v.every((x, i) => i === 0 || x >= v[i - 1])
);

// ---------------------------------------------------------------------------
console.log("\n--- manifest: the generic audio-kit invariants, ported ---");

const manifest = await page.evaluate(() => window.CD.audioManifest());
if (manifestAt) {
  writeFileSync(manifestAt, JSON.stringify(manifest, null, 2));
  console.log(`(manifest written to ${manifestAt})`);
}
const cueIds = Object.keys(manifest.bgmCues);
const allSteps = Object.values(manifest.programs)
  .concat(Object.values(manifest.bgmCues))
  .flatMap((p) => p.steps);
check("the manifest declares an active kit", manifest.audioMode, "active");
check(
  "manifest ids match their registry keys",
  Object.entries(manifest.programs)
    .filter(([k, v]) => k !== v.id)
    .concat(Object.entries(manifest.bgmCues).filter(([k, v]) => k !== v.id))
    .map(([k]) => k),
  []
);
check(
  "event names are unique and every audible one resolves to data",
  {
    duplicates:
      manifest.events.length - new Set(manifest.events.map((e) => e.name)).size,
    unresolved: manifest.events
      .filter((e) => e.classification !== "none")
      .filter((e) => {
        const a = manifest.aliases[e.name];
        if (a == null) return true;
        return typeof a === "string"
          ? manifest.programs[a] == null
          : manifest.bgmCues[a.id] == null;
      })
      .map((e) => e.name),
    mappedSilences: manifest.events
      .filter((e) => e.classification === "none" && manifest.aliases[e.name] != null)
      .map((e) => e.name),
  },
  { duplicates: 0, unresolved: [], mappedSilences: [] }
);
check(
  "no program or cue is empty, and none is unreachable from an event",
  {
    empty: Object.values(manifest.programs)
      .concat(Object.values(manifest.bgmCues))
      .filter((p) => !Array.isArray(p.steps) || p.steps.length === 0)
      .map((p) => p.id),
    unreachable: Object.keys(manifest.programs)
      .filter((id) => !manifest.events.some((e) => manifest.aliases[e.name] === id))
      .concat(
        Object.keys(manifest.bgmCues).filter(
          (id) =>
            !manifest.events.some(
              (e) => manifest.aliases[e.name] && manifest.aliases[e.name].id === id
            )
        )
      ),
  },
  { empty: [], unreachable: [] }
);
check(
  "every program ends inside its budget, not merely starts inside it",
  Object.values(manifest.programs).filter((p) => {
    const end = Math.max(...p.steps.map((s) => s.offset + s.duration));
    const cap =
      p.kind === "jingle"
        ? manifest.budgets.jingleMaxDurationSeconds
        : manifest.budgets.sfxMaxDurationSeconds;
    return end > cap + 1e-9;
  }).map((p) => p.id),
  []
);
check(
  "no program or cue asks for more voices at once than the board has",
  Object.values(manifest.programs)
    .concat(Object.values(manifest.bgmCues))
    .filter((p) => {
      const edges = p.steps
        .flatMap((s) => [[s.offset, 1], [s.offset + s.duration, -1]])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      let active = 0;
      let peak = 0;
      for (const [, delta] of edges) {
        active += delta;
        peak = Math.max(peak, active);
      }
      return peak > manifest.hardwareProfile.voiceLimit;
    })
    .map((p) => p.id),
  []
);
check(
  "every event declares a finite, non-negative priority, silences included",
  manifest.events.filter(
    (e) => !Number.isFinite(e.priority) || e.priority < 0
  ).map((e) => e.name),
  []
);
check(
  "every step is a finite, non-negative offset with a positive duration",
  allSteps.filter(
    (s) =>
      !Number.isFinite(s.offset) ||
      s.offset < 0 ||
      !Number.isFinite(s.duration) ||
      s.duration <= 0
  ).length,
  0
);
check(
  "no cue overlaps itself on one voice, and every loop is seamless",
  cueIds.filter((id) => {
    const c = manifest.bgmCues[id];
    const byVoice = {};
    for (const s of c.steps) {
      (byVoice[s.voice] = byVoice[s.voice] || []).push([
        s.offset,
        s.offset + s.duration,
      ]);
    }
    const overlaps = Object.values(byVoice).some((spans) => {
      spans.sort((a, b) => a[0] - b[0]);
      return spans.some((s, i) => i > 0 && s[0] < spans[i - 1][1] - 1e-9);
    });
    const tail = Math.max(...c.steps.map((s) => s.offset + s.duration));
    return overlaps || tail > c.loopEndSeconds + 1e-9;
  }),
  []
);
check(
  "manifest durations stay inside the declared budgets",
  Object.values(manifest.programs).filter((p) => {
    const last = Math.max(...p.steps.map((s) => s.offset));
    const cap =
      p.kind === "jingle"
        ? manifest.budgets.jingleMaxDurationSeconds
        : manifest.budgets.sfxMaxDurationSeconds;
    return last > cap + 1e-9 || p.steps.length > manifest.budgets.maxStepsPerProgram;
  }).map((p) => p.id),
  []
);

// ---------------------------------------------------------------------------
console.log("\n--- running cabinet: gating, arbitration, BGM sections ---");

await page.evaluate(() => {
  window.CD.startAttract();
  window.CD.audioClear();
});
await wait(1200);
check(
  "the attract cycle stays silent, demo play included",
  await page.evaluate(() => ({
    events: window.CD.audioEvents().length,
    notes: window.CD.audioNotes().length,
    bgm: window.CD.audioBgm().running,
  })),
  { events: 0, notes: 0, bgm: false }
);

await page.keyboard.press("Space");
await wait(400);
check(
  "the first press starts our clock, and only ours",
  await page.evaluate(() => {
    const r = window.CD.audioRuntime();
    return { state: r.state, blocked: r.blocked, libraryAudio: r.libraryAudio };
  }),
  { state: "running", blocked: false, libraryAudio: false }
);

// A deterministic arena: no spawner, a fixed crowd, nothing that can kill.
async function arena(inert, cap) {
  await page.evaluate(
    (o) => {
      const CD = window.CD;
      CD.setAutopilot(false);
      CD.startGame();
      CD.setPhase("play", 0);
      CD.parkSpawner();
      CD.clearMines();
      CD.clearScavs();
      CD.clearLodestones();
      CD.clearCapacitors();
      CD.setQuotaLeft(999);
      CD.setCap(o.cap);
      CD.setInvuln(99999);
      CD.addInert(o.inert, 40, 40);
      CD.audioClear();
    },
    { inert, cap }
  );
}

await arena(2, 20); // load 0.10
await wait(2600);
check(
  "a quiet field plays the sparsest arrangement",
  await page.evaluate(() => {
    const b = window.CD.audioBgm();
    return { running: b.running, cue: b.cue, section: b.section, load: b.load < 0.5 };
  }),
  { running: true, cue: "drift", section: "drift:idle", load: true }
);

await page.evaluate(() => window.CD.addInert(10, 60, 60)); // load 0.60
await wait(2600);
check(
  "crowding past half the cap brings the percussion in at a bar line",
  await page.evaluate(() => window.CD.audioBgm().section),
  "drift:build"
);

await page.evaluate(() => window.CD.addInert(5, 90, 60)); // load 0.85
await wait(2600);
check(
  "crowding towards the cap brings the hook in",
  await page.evaluate(() => window.CD.audioBgm().section),
  "drift:hot"
);

await page.evaluate(() => window.CD.addArmed(120, 100, 0, "overload", 600));
await wait(400);
check(
  "purple on the field switches to the danger arrangement without waiting for a bar",
  await page.evaluate(() => {
    const b = window.CD.audioBgm();
    return { section: b.section, stepFrames: b.stepFrames };
  }),
  { section: "drift:danger", stepFrames: 7 }
);

const bgmLog = await page.evaluate(() => window.CD.audioBgm().log);
check(
  "arrangement changes only ever land on a step, tiers only on a bar line",
  bgmLog
    .slice(1)
    .filter((e, i) => {
      const prev = bgmLog[i];
      const urgent =
        cue.sections[e.section].urgent || cue.sections[prev.section].urgent;
      return !urgent && e.step % 8 !== 0;
    })
    .map((e) => `${e.section}@${e.step}`),
  []
);
check(
  "all four field arrangements were reached by pressure alone",
  [...new Set(bgmLog.map((e) => e.section))].sort(),
  ["drift:build", "drift:danger", "drift:hot", "drift:idle"]
);

// Voice budget and priority, measured over everything logged so far.
function frameStats(notes) {
  const byTick = {};
  for (const n of notes) {
    if (!n.played) continue;
    (byTick[n.tick] = byTick[n.tick] || []).push(n.voice);
  }
  const counts = Object.values(byTick);
  return {
    maxVoicesInAFrame: counts.length ? Math.max(...counts.map((c) => c.length)) : 0,
    doubleBookedFrames: counts.filter((c) => new Set(c).size !== c.length).length,
  };
}
check(
  "the four voices are never oversubscribed and never double-booked",
  frameStats(await page.evaluate(() => window.CD.audioNotes())),
  (v) => v.maxVoicesInAFrame > 0 && v.maxVoicesInAFrame <= 4 && v.doubleBookedFrames === 0
);

// Dense play: chains hammering the same voices the music is using.
await arena(14, 20);
await page.evaluate(() => window.CD.addArmed(120, 100, 0, "overload", 900));
for (let i = 0; i < 24; i++) {
  await page.evaluate(() => {
    window.CD.audioEmit("chain:detonate", { transpose: 6 });
    window.CD.audioEmit("chain:detonate", { transpose: 8 });
    window.CD.audioEmit("chain:detonate", { transpose: 10 });
    window.CD.audioEmit("scav:eat");
  });
  await wait(50);
}
const dense = await page.evaluate(() => window.CD.audioNotes());
check(
  "under a cascade the music yields and control feedback never does",
  {
    bgmDropped: dense.filter((n) => !n.played && n.event.startsWith("bgm:")).length > 0,
    controlOrDangerDropped: dense.filter((n) => !n.played && n.priority >= 90).length,
    voices: frameStats(dense),
  },
  (v) =>
    v.bgmDropped === true &&
    v.controlOrDangerDropped === 0 &&
    v.voices.maxVoicesInAFrame <= 4 &&
    v.voices.doubleBookedFrames === 0
);
check(
  "the per-frame repeat cap holds: three detonations, one tally",
  await page.evaluate(() => {
    window.CD.audioClear();
    for (let i = 0; i < 5; i++) window.CD.audioEmit("chain:detonate");
    for (let i = 0; i < 5; i++) window.CD.audioEmit("tally");
    const log = window.CD.audioEvents();
    return {
      detonate: log.filter((e) => e.event === "chain:detonate").length,
      tally: log.filter((e) => e.event === "tally").length,
    };
  }),
  { detonate: 3, tally: 1 }
);

// Mute is a bus-level gate: arbitration keeps running, the hardware goes quiet.
await page.evaluate(() => {
  window.CD.setAudioMuted(true);
  window.CD.audioClear();
});
await wait(900);
check(
  "mute silences the hardware without stopping the bus",
  await page.evaluate(() => {
    const n = window.CD.audioNotes();
    return { dispatched: n.length > 0, sounded: n.filter((x) => x.sounded).length };
  }),
  (v) => v.dispatched === true && v.sounded === 0
);
await page.evaluate(() => {
  window.CD.setAudioMuted(false);
  window.CD.audioClear();
});
await wait(600);
check(
  "unmuting restores it",
  await page.evaluate(
    () => window.CD.audioNotes().filter((n) => n.sounded).length > 0
  ),
  true
);

// The initials screen has its own cue; every other non-play screen is silent.
await page.evaluate(() => {
  window.CD.setPhase("entry", 600);
  window.CD.audioClear();
});
await wait(700);
check(
  "the initials screen plays its own cue, and not on the player's voice",
  await page.evaluate(() => {
    const b = window.CD.audioBgm();
    const notes = window.CD.audioNotes().filter((n) => n.event.startsWith("bgm:"));
    return {
      cue: b.cue,
      section: b.section,
      sounding: notes.length > 0,
      onP1: notes.filter((n) => n.voice === "p1").length,
    };
  }),
  { cue: "entry", section: "entry:hold", sounding: true, onP1: 0 }
);
await page.evaluate(
  (f) => window.CD.setEntryTimer(f - 30),
  cue.entryHurryFrames
);
await wait(300);
check(
  "the initials cue hurries as soon as the clock runs low, without waiting for a bar",
  await page.evaluate(() => {
    const b = window.CD.audioBgm();
    return { section: b.section, stepFrames: b.stepFrames };
  }),
  { section: "entry:hurry", stepFrames: 9 }
);

// Real sibling collisions, not isolated sound programs. These are the paths
// that exposed the difference between "started" and "survived for its authored
// duration" on a monophonic board.
await page.evaluate(() => {
  const CD = window.CD;
  CD.setPhase("play", 0);
  CD.setLives(1);
  CD.setInvuln(0);
  CD.audioClear();
  CD.killPlayer();
});
await wait(2100);
check(
  "GAME OVER waits for MISS, so every authored jingle note reaches a voice",
  await page.evaluate(() =>
    window.CD.audioNotes()
      .filter((n) => n.event === "jingle:gameover")
      .map((n) => n.played)
  ),
  [true, true, true, true, true, true]
);

await page.evaluate(() => window.CD.startGame());
await wait(800); // let READY finish before injecting the clear
await page.evaluate(() => {
  const CD = window.CD;
  CD.setPhase("play", 0);
  CD.setNextExtend(1e9);
  CD.audioClear();
  CD.enterClearAt(0);
});
await wait(1200);
check(
  "ROUND CLEAR's final cadence finishes before tally can take p1",
  await page.evaluate(() => {
    const n = window.CD.audioNotes().find(
      (x) => x.event === "jingle:clear" && x.voice === "p1" && x.frames === 20
    );
    return n == null
      ? null
      : { played: n.played, actualFrames: n.actualFrames, endedBy: n.endedBy };
  }),
  { played: true, actualFrames: 20, endedBy: null }
);

await page.evaluate(() => {
  const CD = window.CD;
  CD.setPhase("play", 0);
  CD.audioClear();
  CD.audioEmit("quota:low");
  CD.audioEmit("chain:detonate");
});
await wait(400);
check(
  "the two-note low-quota notice survives its triggering detonation",
  await page.evaluate(() =>
    window.CD.audioNotes()
      .filter((n) => n.event === "quota:low")
      .map((n) => n.played)
  ),
  [true, true]
);

await page.evaluate(() => {
  const CD = window.CD;
  CD.setPhase("play", 0);
  CD.audioClear();
  CD.audioEmit("chain:detonate");
  CD.audioEmit("chainout");
});
await wait(400);
check(
  "CHAIN OUT keeps both its lock tone and latch after the final detonation",
  await page.evaluate(() =>
    window.CD.audioNotes()
      .filter((n) => n.event === "chainout")
      .map((n) => n.played)
  ),
  [true, true]
);

await page.evaluate(() => {
  window.CD.setPhase("ready", 600);
});
await wait(80);
await page.evaluate(() => {
  window.CD.setPhase("entry", 600);
  window.CD.audioClear();
});
await page.waitForFunction(() =>
  window.CD.audioNotes().some(
    (n) => n.event.startsWith("bgm:") && n.played && n.frames > 5
  )
);
await page.evaluate(() => window.CD.setPhase("table", 600));
await wait(80);
check(
  "leaving a music phase explicitly ends an already sounding BGM note",
  await page.evaluate(() =>
    window.CD.audioNotes().some(
      (n) => n.event.startsWith("bgm:") && n.endedBy === "phase"
    )
  ),
  true
);

check(
  "ALL CLEAR fanfare ends before its life-bonus tally begins",
  kit["jingle:allclear"] == null ? null : kit["jingle:allclear"].endFrame,
  (v) => v != null && v <= 28
);

const bgmByPhase = {};
for (const phase of ["ready", "chainout", "clear", "death", "gameover", "table"]) {
  await page.evaluate((p) => {
    window.CD.setPhase(p, 600);
    window.CD.audioClear();
  }, phase);
  await wait(350);
  bgmByPhase[phase] = await page.evaluate(() => ({
    running: window.CD.audioBgm().running,
    bgmNotes: window.CD.audioNotes().filter((n) => n.event.startsWith("bgm:")).length,
  }));
}
check(
  "no ceremony, lock-out or table screen has music under it",
  Object.entries(bgmByPhase).filter(([, v]) => v.running || v.bgmNotes > 0).map(([p]) => p),
  []
);

// Determinism: same field, same frames, same music. The ceremony frame in
// front is what the round ceremony does in real play -- the cue stops there,
// so every round opens on step 0 of the hook rather than wherever it left off.
async function bgmRun() {
  await page.evaluate(() => window.CD.setPhase("ready", 600));
  await wait(150);
  await arena(11, 20); // 0.55, the load a round is seeded at
  await wait(2500);
  return page.evaluate(() => {
    const notes = window.CD.audioNotes().filter((n) => n.event.startsWith("bgm:"));
    const t0 = notes.length ? notes[0].tick : 0;
    return notes.map((n) => [n.tick - t0, n.event, n.voice, n.pitch, n.frames]);
  });
}
const runA = await bgmRun();
const runB = await bgmRun();
check(
  "the same field twice produces the same music, note for note",
  {
    notes: runA.length > 8,
    startsOnTheHook: runA.length > 0 && runA[0][3] === 40,
    identical:
      JSON.stringify(runA.slice(0, 8)) === JSON.stringify(runB.slice(0, 8)),
  },
  { notes: true, startsOnTheHook: true, identical: true }
);

// Coverage: a real game, played by the bot, through a clear.
await page.evaluate(() => {
  window.CD.startGame();
  window.CD.setAutopilot(true);
  window.CD.setPhase("play", 0);
  window.CD.setQuotaLeft(3);
  window.CD.audioClear();
});
await wait(800);
// Sampled while the round is still running: the event log is a ring buffer,
// and the ceremony that follows would scroll a one-off section start out of it.
const midRound = await page.evaluate(() => ({
  running: window.CD.audioBgm().running,
  bgmNotes: window.CD.audioNotes().filter((n) => n.event.startsWith("bgm:")).length,
}));
await wait(9000);
const seen = await page.evaluate(() => [
  ...new Set(window.CD.audioEvents().map((e) => e.event)),
]);
check(
  "a real round emits the play, chain-out and ceremony vocabulary",
  ["shove", "chain:detonate", "chainout", "jingle:clear", "tally"].filter(
    (e) => !seen.includes(e)
  ),
  []
);
check(
  "and the music was running under it",
  midRound,
  (v) => v.running === true && v.bgmNotes > 0
);
check(
  "nothing emitted an event the registry does not declare",
  await page.evaluate(() => window.CD.audioUnknown()),
  []
);

// The whole audio path costs frames; the cabinet still has to run at 60.
const t0 = Date.now();
const k0 = await page.evaluate(() => ticks);
await wait(3000);
const k1 = await page.evaluate(() => ticks);
const fps = (k1 - k0) / ((Date.now() - t0) / 1000);
check("the game still runs at frame rate with the audio path live", +fps.toFixed(1), (v) => v >= 50);

await browser.close();

console.log(`\nERRORS: ${errors.length ? errors.join("\n  ") : "none"}`);
if (failures.length || errors.length) {
  console.log(`FAILED (${failures.length}): ${failures.join(", ")}`);
  process.exit(1);
}
console.log("ALL ASSERTIONS PASSED");
