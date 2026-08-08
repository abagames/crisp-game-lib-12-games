#!/usr/bin/env node
/* Headless audio-bus tests against the mock adapter. */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const VKBus = require(path.join(root, "audio", "vk-bus.js"));
const kit = require(path.join(root, "audio", "vk-kit.js"));
const dsp = require(path.join(root, "audio", "vk-dsp.js"));

let passed = 0;
const failures = [];
function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);
}

function newBus() {
  const adapter = VKBus.createMockAdapter();
  const bus = VKBus.createBus({ adapter });
  bus.init();
  return { bus, adapter };
}
const played = (adapter) => adapter.calls.filter((c) => c.type === "program").map((c) => c.id);
const actions = (bus, name) => bus.log.filter((l) => l.name === name).map((l) => l.action);

/* -------------------------------------------------------- resolution/gating */

check("alias resolution plays the mapped program", () => {
  const { bus, adapter } = newBus();
  bus.beginFrame(0, false);
  bus.emit("keeper:ground");
  bus.endFrame();
  eq(played(adapter).join(), "ground", "keeper:ground should resolve to program ground");
});

check("every audible event resolves to existing data", () => {
  for (const event of kit.EVENTS) {
    const alias = kit.ALIASES[event.name];
    if (event.classification === "none") {
      assert(!alias, `none event ${event.name} must stay unmapped`);
      continue;
    }
    assert(alias, `${event.name} has no alias`);
    if (event.classification === "bgm") {
      assert(kit.BGM_CUES[alias.id], `${event.name} targets missing cue`);
    } else {
      const program = kit.PROGRAMS[alias];
      assert(program, `${event.name} targets missing program ${alias}`);
      eq(program.kind, event.classification, `${event.name} kind mismatch`);
    }
  }
});

check("none events produce no adapter call", () => {
  const { bus, adapter } = newBus();
  bus.beginFrame(0, false);
  bus.emit("keeper:recover");
  bus.emit("wave:layout");
  bus.emit("arrow:turn");
  bus.endFrame();
  eq(played(adapter).length, 0, "none events must not play");
  eq(bus.log.filter((l) => l.action === "none").length, 3, "none events must be logged");
});

check("mute suppresses everything", () => {
  const { bus, adapter } = newBus();
  bus.setMuted(true);
  bus.beginFrame(0, false);
  bus.emit("keeper:ground");
  bus.endFrame();
  eq(played(adapter).length, 0, "muted bus must not play");
  eq(actions(bus, "keeper:ground")[0], "suppressed:mute", "mute must be logged");
});

check("attract-mode emissions are suppressed by default and enabled on demand", () => {
  const { bus, adapter } = newBus();
  bus.beginFrame(0, true);
  bus.emit("keeper:ground");
  bus.endFrame();
  eq(played(adapter).length, 0, "demo frames must be silent by default");
  eq(actions(bus, "keeper:ground")[0], "suppressed:demo", "demo suppression must be logged");

  bus.setDemoSoundEnabled(true);
  bus.beginFrame(1, true);
  bus.emit("keeper:ground");
  bus.endFrame();
  eq(played(adapter).join(), "ground", "demo sound must play once enabled");
});

/* --------------------------------------------------- caps, cooldown, policy */

check("per-frame repeat cap bounds the queue", () => {
  const { bus } = newBus();
  bus.beginFrame(0, false);
  for (let i = 0; i < 5; i++) bus.emit("keeper:ground");
  bus.endFrame();
  const a = actions(bus, "keeper:ground");
  eq(a.filter((x) => x === "capped").length, 3, "5 emissions with cap 2 must log 3 capped");
  eq(a.filter((x) => x === "played").length, 1, "only one may actually sound");
  // The cap bounds the queue; the voice policy decides audibility. keeper:ground
  // belongs to the coalescing `ground` family, so the surplus merges rather
  // than being dropped -- and either way it is one sound, not two.
  eq(a.filter((x) => x === "coalesced").length, 1, "the surplus queued one must be coalesced, not layered");
});

check("cooldown throttles high-frequency terrain events", () => {
  const { bus } = newBus();
  bus.beginFrame(0, false);
  bus.emit("spark:deflect");
  bus.endFrame();
  bus.beginFrame(2, false);
  bus.emit("spark:deflect");
  bus.endFrame();
  bus.beginFrame(6, false);
  bus.emit("spark:deflect");
  bus.endFrame();
  const a = actions(bus, "spark:deflect");
  eq(a.join(), "played,cooldown,played", "deflect must be throttled to its 4-frame interval");
});

check("priority decides the winner when two events want one voice", () => {
  const { bus, adapter } = newBus();
  bus.beginFrame(0, false);
  bus.emit("spark:deflect"); // priority 30, pulse2
  bus.emit("capacitor:warning"); // priority 120, pulse2
  bus.endFrame();
  eq(played(adapter).join(), "warning", "the danger warning must win the voice");
  eq(actions(bus, "spark:deflect")[0], "dropped", "the loser must be logged as dropped");
});

check("the ground family coalesces to its highest chain member", () => {
  const { bus, adapter } = newBus();
  bus.beginFrame(0, false);
  bus.emit("spark:absorb1");
  bus.emit("spark:absorb2");
  bus.emit("spark:absorb3");
  bus.endFrame();
  eq(played(adapter).length, 1, "three absorbs in one tick are one sound");
  eq(played(adapter)[0], "absorb3", "the chain count is information: keep the highest");
  eq(bus.log.filter((l) => l.action === "coalesced").length, 2, "losers must log coalesced, not dropped");
  eq(bus.log.filter((l) => l.action === "dropped").length, 0, "coalesce must not be reported as drop");
});

check("the ground click merges into the absorb it produced", () => {
  // Grounding onto a spark that is already inside the ring emits both in one
  // tick. The absorb is what tells the player the timing worked, so it must be
  // the surviving sound -- this collision is the common case, not a corner one.
  const { bus, adapter } = newBus();
  bus.beginFrame(0, false);
  bus.emit("keeper:ground"); // priority 100, rank 0
  bus.emit("spark:absorb2"); // priority 91, rank 2
  bus.endFrame();
  eq(played(adapter).length, 1, "one gesture is one sound");
  eq(played(adapter)[0], "absorb2", "the absorb must survive, not the button click");
  eq(actions(bus, "keeper:ground")[0], "coalesced", "the click must merge, not be dropped");
});

/* -------------------------------------------------------------- voice model */

check("no voice starts more than one note per tick under the densest burst", () => {
  const { bus, adapter } = newBus();
  bus.startBgm();
  bus.setIntent(1); // every BGM layer on
  bus.beginFrame(0, false);
  for (const event of kit.EVENTS) {
    if (event.classification === "sfx" || event.classification === "jingle") bus.emit(event.name);
  }
  bus.endFrame();
  const starts = adapter.calls.filter((c) => c.type === "program");
  const perVoice = new Map();
  for (const call of starts) {
    for (const voice of call.voices) perVoice.set(voice, (perVoice.get(voice) || 0) + 1);
  }
  for (const [voice, n] of perVoice) eq(n, 1, `voice ${voice} started ${n} notes in one tick`);
  const used = bus.debug().voicesUsedLastTick;
  assert(
    used.length <= kit.PROFILE.voiceLimit,
    `tick used ${used.length} voices (${used.join(",")}), limit ${kit.PROFILE.voiceLimit}`
  );
  assert(
    !bus.log.some((l) => l.action === "voiceLimitExceeded"),
    "voice limit must never be exceeded"
  );
});

check("a note stealing a still-ringing voice is a steal, not a layer", () => {
  const { bus, adapter } = newBus();
  bus.beginFrame(0, false);
  bus.emit("keeper:ground"); // 0.06 s on pulse2 + noise
  bus.endFrame();
  bus.beginFrame(1, false);
  bus.emit("capacitor:warning"); // pulse2
  bus.endFrame();
  const steals = adapter.calls.filter((c) => c.type === "stopVoice");
  assert(
    steals.some((s) => s.voice === "pulse2" && s.previous === "ground" && s.next === "warning"),
    "the second pulse2 note must end the first"
  );

  adapter.reset();
  bus.beginFrame(200, false);
  bus.emit("keeper:ground");
  bus.endFrame();
  bus.beginFrame(240, false);
  bus.emit("capacitor:warning");
  bus.endFrame();
  eq(
    adapter.calls.filter((c) => c.type === "stopVoice").length,
    0,
    "a voice whose note already finished must not report a steal"
  );
});

check("a SE claiming the shared noise generator ducks BGM percussion", () => {
  const { bus, adapter } = newBus();
  bus.startBgm();
  bus.setIntent(1);
  bus.beginFrame(0, false);
  bus.emit("spark:absorb1"); // uses noise
  bus.endFrame();
  const duck = adapter.calls.filter((c) => c.type === "duck");
  assert(duck.length === 1 && duck[0].voices.join() === "noise", "noise SE must duck the BGM noise voice");
});

check("a jingle pauses every BGM voice", () => {
  const { bus, adapter } = newBus();
  bus.startBgm();
  bus.setIntent(1);
  bus.beginFrame(0, false);
  bus.emit("keeper:miss");
  bus.endFrame();
  const duck = adapter.calls.filter((c) => c.type === "duck");
  eq(duck.length, 1, "one duck call expected");
  eq(duck[0].voices.sort().join(), "bass,noise,pulse1", "all BGM voices must be ducked");
  assert(duck[0].seconds >= kit.PROGRAMS["jingle:miss"].durationSeconds - 1e-9, "duck must cover the jingle");
});

/* ------------------------------------------------------------ BGM behaviour */

check("pausing stops the audio clock and resuming restarts it", () => {
  const { bus, adapter } = newBus();
  bus.startBgm();
  bus.setPaused(true);
  eq(adapter.calls.filter((c) => c.type === "suspend").length, 1, "pausing must suspend the context");
  eq(bus.debug().paused, true, "paused state must be visible");
  bus.setPaused(false);
  eq(adapter.calls.filter((c) => c.type === "resume").length, 1, "resuming must resume the context");
  eq(bus.debug().paused, false, "paused state must clear");
});

/** Run frames at a fixed danger level, holding the BGM cue. */
function bgmFrames(bus, count, danger, from) {
  let f = from || 0;
  for (let i = 0; i < count; i++, f++) {
    bus.beginFrame(f, false);
    bus.setIntent(danger);
    bus.emit("bgm:main");
    bus.endFrame();
  }
  return f;
}

check("the danger axis is clamped and the bed never thins out", () => {
  const { bus } = newBus();
  bus.startBgm();
  let f = bgmFrames(bus, 2, -5, 0);
  eq(bus.debug().danger, 0, "intent must clamp at 0");
  // Playing well pins this axis at zero for most of a run, so the bed has to
  // be musical there: a bass pedal on its own is what made this BGM monotonous.
  eq(bus.debug().bgmGains.bass, 1, "bass is always on");
  eq(bus.debug().bgmGains.pulse1, 1, "the lead is part of the bed, not a reward for being in trouble");
  f = bgmFrames(bus, 2, 99, f);
  eq(bus.debug().danger, 1, "intent must clamp at 1");
});

check("the percussion layer answers the axis, with hysteresis", () => {
  const { bus } = newBus();
  bus.startBgm();
  const bar = Math.round(kit.BAR_SECONDS * 60);
  // Probed relative to the kit's own thresholds: this test owns the mechanism,
  // and the tuning is owned by the measured-distribution test below. Retuning
  // the ladder must not require editing literals here.
  const on = kit.BGM_LAYERS[2].dangerOn;
  const off = kit.BGM_LAYERS[2].dangerOff;
  let f = bgmFrames(bus, 1, 0, 0);
  eq(bus.debug().bgmGains.noise, 0, "hats stay out at rest");
  f = bgmFrames(bus, bar, on + 0.05, f);
  eq(bus.debug().bgmGains.noise, 1, `hats enter above ${on}`);
  // Hysteresis: the axis crosses the on-threshold about 40 times a minute in
  // measured play, so falling just under it must not drop the layer.
  f = bgmFrames(bus, bar, (on + off) / 2, f);
  eq(bus.debug().bgmGains.noise, 1, "a dip below the on-threshold must not drop the layer");
  f = bgmFrames(bus, bar, Math.max(0, off - 0.05), f);
  eq(bus.debug().bgmGains.noise, 0, `hats leave below ${off}`);
});

check("a layer change lands on a bar boundary, not on the frame the axis moved", () => {
  const { bus } = newBus();
  bus.startBgm();
  const bar = Math.round(kit.BAR_SECONDS * 60);
  let f = bgmFrames(bus, 1, 0, 0);
  const barAtStart = bus.debug().layerBar;
  // Mid-bar: the axis jumps, the arrangement does not follow yet.
  f = bgmFrames(bus, 10, 0.9, f);
  eq(bus.debug().bgmGains.noise, 0, "the layer changed mid-bar");
  eq(bus.debug().layerBar, barAtStart, "the bar clock moved without a bar passing");
  f = bgmFrames(bus, bar - 11, 0.9, f);
  eq(bus.debug().bgmGains.noise, 0, "the layer changed before the bar was over");
  f = bgmFrames(bus, 1, 0.9, f);
  eq(bus.debug().bgmGains.noise, 1, "the layer did not change at the bar boundary");
});

check("cue selection has hysteresis", () => {
  const { bus } = newBus();
  bus.startBgm();
  const { toCritical, toMain } = kit.CUE_SWITCH;
  bus.setIntent(toCritical - 0.05);
  eq(bus.desiredCue(), "main", `just under ${toCritical} is still main`);
  bus.setIntent(toCritical + 0.05);
  eq(bus.desiredCue(), "critical", `crossing ${toCritical} asks for critical`);
  bus.beginFrame(0, false);
  bus.emit("bgm:critical");
  bus.endFrame();
  bus.setIntent((toMain + toCritical) / 2);
  eq(bus.desiredCue(), "critical", "a dip between the two thresholds must not flap straight back");
  bus.setIntent(Math.max(0, toMain - 0.05));
  eq(bus.desiredCue(), "main", `below ${toMain} it returns to main`);
});

check("both cue thresholds sit inside the range the axis actually reaches", () => {
  // Anything the arrangement depends on has to be reachable in ordinary play.
  // The first ladder asked for 0.85 (hats) and 0.6 (critical) against an axis
  // that never passed 0.58, so both were dead data. The bound is a high
  // percentile rather than the maximum on purpose: the axis now touches 1.0,
  // but only in the instant a capacitor runs out, and a layer that can only be
  // heard as somebody dies is dead data of a subtler kind. 0.69 is the measured
  // p95 over waves 1-12 of the shipped build (p50 0.33, p90 0.62, p99 0.84).
  const REACHED = 0.69;
  for (const layer of kit.BGM_LAYERS) {
    assert(
      layer.dangerOn <= REACHED,
      `layer ${layer.voice} opens at ${layer.dangerOn}, past the ${REACHED} the axis reaches`
    );
    assert(layer.dangerOff <= layer.dangerOn, `layer ${layer.voice} has no hysteresis`);
  }
  assert(
    kit.CUE_SWITCH.toCritical <= REACHED,
    `critical needs danger ${kit.CUE_SWITCH.toCritical}, past the ${REACHED} the axis reaches`
  );
  assert(kit.CUE_SWITCH.toMain < kit.CUE_SWITCH.toCritical, "the cue switch has no hysteresis");
});

check("the two cues are different music, not one phrase transposed", () => {
  // `critical` used to be `main` + 12 semitones with the same rhythm, so the
  // swap changed register and nothing else.
  const notes = (id, voice) =>
    kit.BGM_CUES[id].steps.filter((s) => s.voice === voice).map((s) => `${s.offset.toFixed(2)}@${s.freq.toFixed(1)}`);
  const rhythm = (id, voice) =>
    kit.BGM_CUES[id].steps.filter((s) => s.voice === voice).map((s) => s.offset.toFixed(2)).join(",");
  assert(notes("main", "pulse1").join() !== notes("critical", "pulse1").join(), "the leads are the same notes");
  assert(rhythm("main", "pulse1") !== rhythm("critical", "pulse1"), "the leads share a rhythm");
  assert(rhythm("main", "bass") !== rhythm("critical", "bass"), "the basses share a rhythm");
  for (const id of ["main", "critical"]) {
    const c = kit.BGM_CUES[id];
    // Both halves of the form must carry the lead: an 8-bar loop whose second
    // half is empty is a 4-bar loop with a rest.
    const half = c.durationSeconds / 2;
    const lead = c.steps.filter((s) => s.voice === "pulse1");
    assert(lead.some((s) => s.offset < half), `${id}: no lead in the A half`);
    assert(lead.some((s) => s.offset >= half), `${id}: no lead in the B half`);
    // ...and the two halves must not be the same bars twice.
    const cell = (lo, hi) =>
      lead.filter((s) => s.offset >= lo && s.offset < hi).map((s) => `${(s.offset - lo).toFixed(2)}@${s.freq.toFixed(1)}`).join();
    assert(cell(0, half) !== cell(half, c.durationSeconds), `${id}: the B half repeats the A half`);
  }
});

check("a cue is started once, not restarted every frame", () => {
  const { bus, adapter } = newBus();
  bus.startBgm();
  for (let f = 0; f < 10; f++) {
    bus.beginFrame(f, false);
    bus.emit("bgm:main");
    bus.endFrame();
  }
  eq(adapter.calls.filter((c) => c.type === "cue").length, 1, "startCue must be idempotent");
});

/* ------------------------------------------------------------- determinism */

check("a fixed seed reproduces the same samples", () => {
  const a = dsp.renderProgram(kit.PROGRAMS.absorb1, { sampleRate: 24000, seed: 3 });
  const b = dsp.renderProgram(kit.PROGRAMS.absorb1, { sampleRate: 24000, seed: 3 });
  const c = dsp.renderProgram(kit.PROGRAMS.absorb1, { sampleRate: 24000, seed: 4 });
  eq(a.length, b.length, "same seed, same length");
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) throw new Error(`sample ${i} differs for a fixed seed`);
  let differs = false;
  for (let i = 0; i < a.length; i++) if (a[i] !== c[i]) differs = true;
  assert(differs, "a different seed must change the noise realisation");
});

check("the same emission sequence reproduces the same resolved timeline", () => {
  const run = () => {
    const { bus, adapter } = newBus();
    bus.startBgm();
    for (let f = 0; f < 6; f++) {
      bus.beginFrame(f, false);
      bus.setIntent(f / 6);
      bus.emit("spark:absorb1");
      bus.emit("spark:deflect");
      bus.emit("bgm:" + bus.desiredCue());
      bus.endFrame();
    }
    return JSON.stringify(adapter.calls.filter((c) => c.type === "program" || c.type === "cue"));
  };
  eq(run(), run(), "resolution must be deterministic");
});

/* --------------------------------------------------------- event coverage */

// The names built at runtime by string concatenation in main.js.
const DYNAMIC_PREFIXES = ['"spark:absorb" +', '"bgm:" +'];

check("every kit event is reachable from the game code", () => {
  const source = fs.readFileSync(path.join(root, "main.js"), "utf8");
  const missing = [];
  for (const event of kit.EVENTS) {
    if (source.includes(`"${event.name}"`)) continue;
    const dynamic = DYNAMIC_PREFIXES.some((prefix) => {
      const literal = prefix.slice(1, prefix.indexOf('" +'));
      return event.name.startsWith(literal) && source.includes(prefix);
    });
    if (!dynamic) missing.push(event.name);
  }
  eq(missing.join(", "), "", "events declared but never emitted");
});

check("every event emitted by the game exists in the kit", () => {
  const source = fs.readFileSync(path.join(root, "main.js"), "utf8");
  const unknown = [];
  const re = /audio\.emit\(\s*"([^"]+)"\s*([+)])/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    const [, name, next] = match;
    if (next === "+") continue; // dynamic prefix, covered by the check above
    if (!kit.EVENT_BY_NAME[name]) unknown.push(name);
  }
  eq(unknown.join(", "), "", "game emits event names the kit does not declare");
});

check("gameplay code never calls the synth or the adapter directly", () => {
  const source = fs.readFileSync(path.join(root, "main.js"), "utf8");
  for (const forbidden of ["VKDsp.", "playProgram(", "startCue(", "renderProgram("]) {
    assert(!source.includes(forbidden), `main.js must not reference ${forbidden}`);
  }
});

/* -------------------------------------------------------------------- report */

console.log(`Audio bus tests: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach((f) => console.error(`- ${f}`));
  process.exitCode = 1;
}
