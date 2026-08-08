#!/usr/bin/env node
/*
 * BGM continuity tests.
 *
 * Runs the real Web Audio adapter against a fake AudioContext so the melody
 * voice can be followed through the sequences a session actually produces:
 * jingles ducking it, game over stopping it, a new run restarting it, cue
 * swaps on the four-bar grid, and the tab being hidden. Schema and bus tests
 * cannot see any of this -- gain automation and source lifetime live in the
 * adapter.
 */
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const VKBus = require(path.join(root, "audio", "vk-bus.js"));
const kit = require(path.join(root, "audio", "vk-kit.js"));

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

/* ------------------------------------------------------- fake Web Audio */

function makeParam(node) {
  const events = [];
  return {
    events,
    value: 0,
    setTargetAtTime(target, when, timeConstant) {
      events.push({ target, when, tc: timeConstant });
    },
    setValueAtTime(target, when) {
      events.push({ target, when, tc: 0 });
    },
    cancelScheduledValues(when) {
      for (let i = events.length - 1; i >= 0; i--) if (events[i].when >= when) events.splice(i, 1);
    },
    /** Target of the last event at or before t (what the code asked for). */
    target(t) {
      let v = node.initialValue;
      for (const e of events) if (e.when <= t + 1e-9) v = e.target;
      return v;
    },
    /**
     * Actual instantaneous value at t, integrating every setTargetAtTime ramp.
     * Targets alone cannot tell a clean stop from one that audibly swells
     * first, which is exactly the class of BGM bug worth looking for.
     */
    at(t) {
      const list = events.slice().sort((a, b) => a.when - b.when);
      let v = node.initialValue;
      let cursor = -Infinity;
      let active = null;
      const advance = (to) => {
        if (active && active.tc > 0 && cursor > -Infinity) {
          v = active.target + (v - active.target) * Math.exp(-(to - cursor) / active.tc);
        } else if (active) {
          v = active.target;
        }
        cursor = to;
      };
      for (const e of list) {
        if (e.when > t) break;
        advance(e.when);
        active = e;
        if (!e.tc) v = e.target;
      }
      advance(t);
      return v;
    },
  };
}

function makeContext() {
  const ctx = {
    currentTime: 0,
    sampleRate: 48000,
    state: "running",
    destination: { connect: () => {} },
    sources: [],
    gains: [],
    createBuffer(_ch, length, sr) {
      return { length, sampleRate: sr, copyToChannel() {} };
    },
    createGain() {
      const node = { initialValue: 0, connect: (n) => n };
      node.gain = makeParam(node);
      Object.defineProperty(node.gain, "value", {
        get: () => node.initialValue,
        set: (v) => {
          node.initialValue = v;
        },
      });
      ctx.gains.push(node);
      return node;
    },
    createWaveShaper() {
      return { curve: null, oversample: "none", connect: (n) => n };
    },
    createBiquadFilter() {
      return { type: "", frequency: { value: 0 }, connect: (n) => n };
    },
    createBufferSource() {
      const src = {
        buffer: null,
        loop: false,
        startedAt: null,
        stoppedAt: null,
        connect: () => {},
        startOffset: 0,
        start(t, offset) {
          src.startedAt = t == null ? ctx.currentTime : t;
          src.startOffset = offset || 0;
          ctx.sources.push(src);
        },
        stop(t) {
          src.stoppedAt = t == null ? ctx.currentTime : t;
        },
      };
      return src;
    },
    suspend() {
      ctx.state = "suspended";
    },
    resume() {
      ctx.state = "running";
    },
  };
  return ctx;
}

/** Sources that are looping and not scheduled to stop before time t. */
function liveLoops(ctx, t) {
  return ctx.sources.filter((s) => s.loop && s.startedAt <= t && (s.stoppedAt == null || s.stoppedAt > t));
}

function makeSession() {
  const ctx = makeContext();
  global.window = { AudioContext: function () { return ctx; } };
  const adapter = VKBus.createWebAudioAdapter();
  const bus = VKBus.createBus({ adapter });
  bus.init();
  let frame = 0;
  const step = (emits = [], danger = 0.5) => {
    bus.beginFrame(frame, false);
    bus.setIntent(danger);
    for (const e of emits) bus.emit(e);
    bus.endFrame();
    frame++;
    ctx.currentTime += 1 / 60;
  };
  const leadGain = () => adapter.__leadGain;
  return { ctx, adapter, bus, step, get frame() { return frame; }, leadGain };
}

/* The adapter keeps its BGM gain nodes private; identify the melody node by
 * the order they are created (BGM_LAYERS order) among the gains it made. */
function melodyGain(session) {
  const leadIndex = kit.BGM_LAYERS.findIndex((l) => l.voice === "pulse1");
  // gains[0] is the master; per-layer gains follow in BGM_LAYERS order.
  return session.ctx.gains[1 + leadIndex];
}

/* -------------------------------------------------------------- tests */

/* The percussion gain node, identified the same way as the melody's. */
function hatGain(session) {
  const index = kit.BGM_LAYERS.findIndex((l) => l.voice === "noise");
  return session.ctx.gains[1 + index];
}

check("the melody is up from the first frame, at any danger level", () => {
  const s = makeSession();
  s.bus.startBgm();
  s.step(["bgm:main"], 0);
  const lead = melodyGain(s);
  assert(lead.gain.target(s.ctx.currentTime) === 1, "the lead must be part of the bed");
  for (let i = 0; i < 120; i++) s.step(["bgm:main"], 0);
  assert(
    lead.gain.at(s.ctx.currentTime) > 0.9,
    "a run that is going well must not decay into a bass pedal"
  );
});

check("the percussion layer comes up once the danger axis opens it", () => {
  const s = makeSession();
  s.bus.startBgm();
  s.step(["bgm:main"], 0);
  const hats = hatGain(s);
  assert(hats.gain.target(s.ctx.currentTime) === 0, "the hats must stay out at rest");
  for (let i = 0; i < 200; i++) s.step(["bgm:main"], 0.5);
  assert(hats.gain.at(s.ctx.currentTime) > 0.9, "the hats must enter under danger");
  for (let i = 0; i < 200; i++) s.step(["bgm:main"], 0);
  assert(hats.gain.at(s.ctx.currentTime) < 0.1, "the hats must leave again when the danger passes");
});

check("a cue swap keeps its place in the form and lands on the four-bar grid", () => {
  const s = makeSession();
  s.bus.startBgm();
  for (let i = 0; i < 30; i++) s.step(["bgm:main"], 0.2);
  const firstStart = s.ctx.sources[0].startedAt;
  // Danger crosses; the swap is scheduled, not immediate.
  // Driven from the kit's own threshold: the tuning lives in vk-kit.js and is
  // pinned against the measured axis there, so this test asks only that a swap
  // happens and lands on the grid.
  const hot = kit.CUE_SWITCH.toCritical + 0.05;
  for (let i = 0; i < 700; i++) s.step(["bgm:" + s.bus.desiredCue()], hot);
  const swapped = s.ctx.sources.filter((x) => x.startedAt > firstStart + 0.001);
  assert(swapped.length > 0, "the danger axis never produced a cue swap");
  const grid = kit.SWAP_GRID_SECONDS;
  for (const src of swapped) {
    const phase = (src.startedAt - firstStart) % grid;
    assert(
      Math.min(phase, grid - phase) < 1e-6,
      `a cue swap started at +${(src.startedAt - firstStart).toFixed(3)}s, off the ${grid}s grid`
    );
    // Phase-preserving: a swap at 6.4 s into a 12.8 s loop must start the
    // incoming cue at 6.4 s, not restart its phrase from the top.
    const expected = (src.startedAt - firstStart) % kit.LOOP_SECONDS;
    assert(
      Math.abs(src.startOffset - expected) < 1e-6,
      `a cue swap restarted the phrase: offset ${src.startOffset.toFixed(3)}s, expected ${expected.toFixed(3)}s`
    );
  }
});

check("the swap grid is shorter than the loop, so a spike is not missed", () => {
  // The whole point of the grid: with a 12.8 s loop and a loop-boundary swap,
  // a danger spike shorter than a loop can begin and end before `critical`
  // ever arrives.
  assert(
    kit.SWAP_GRID_SECONDS < kit.LOOP_SECONDS,
    "the cue swap waits for a full loop"
  );
  assert(
    kit.LOOP_SECONDS % kit.SWAP_GRID_SECONDS === 0,
    "the swap grid does not divide the loop, so swaps would drift off the form"
  );
  assert(
    kit.SWAP_GRID_SECONDS % kit.BAR_SECONDS === 0,
    "the swap grid is not a whole number of bars"
  );
});

check("a jingle ducks the melody and gives it back", () => {
  const s = makeSession();
  s.bus.startBgm();
  for (let i = 0; i < 60; i++) s.step(["bgm:main"], 0.5);
  const lead = melodyGain(s);
  const duckAt = s.ctx.currentTime;
  s.step(["bgm:main", "keeper:miss"], 0.5);
  assert(lead.gain.at(duckAt + 0.05) < 0.05, "the jingle must duck the melody");
  const jingle = kit.PROGRAMS["jingle:miss"].durationSeconds;
  for (let i = 0; i < 120; i++) s.step(["bgm:main"], 0.5);
  assert(
    lead.gain.at(duckAt + jingle + 0.5) > 0.9,
    "the melody must come back after the jingle, not stay ducked"
  );
});

check("game over silences the melody and it does not creep back", () => {
  const s = makeSession();
  s.bus.startBgm();
  // The layer gain ramps with a 0.08 s time constant, so let it settle.
  for (let i = 0; i < 60; i++) s.step(["bgm:main"], 0.9);
  const lead = melodyGain(s);
  assert(lead.gain.at(s.ctx.currentTime) > 0.9, "precondition: the melody is playing");

  // What main.js does on the last life: emit the jingle, then stop the BGM.
  s.bus.beginFrame(s.frame, false);
  s.bus.emit("game:over");
  s.bus.endFrame();
  s.bus.stopBgm();
  const overAt = s.ctx.currentTime;
  s.ctx.currentTime += 1 / 60;

  // Ceremony plus attract: several seconds with no BGM emission.
  for (let i = 0; i < 600; i++) s.step([], 0.9);
  const jingle = kit.PROGRAMS["jingle:gameover"].durationSeconds;
  // Sample densely across the whole ceremony: a stop that is overridden for a
  // few frames shows up as a swell, not as a wrong final target.
  let worst = 0;
  let worstAt = 0;
  // Start after the duck ramp itself has landed (its time constant is 5 ms);
  // what matters is whether anything brings the melody back afterwards.
  for (let t = overAt + 0.1; t < overAt + 6; t += 1 / 240) {
    const v = lead.gain.at(t);
    if (v > worst) {
      worst = v;
      worstAt = t;
    }
  }
  assert(
    worst < 0.02,
    `the melody swelled back to ${worst.toFixed(3)} at t=+${(worstAt - overAt).toFixed(3)}s after game over`
  );
});

check("a new run brings the melody back after a game over", () => {
  const s = makeSession();
  s.bus.startBgm();
  for (let i = 0; i < 60; i++) s.step(["bgm:main"], 0.9);
  s.bus.beginFrame(s.frame, false);
  s.bus.emit("game:over");
  s.bus.endFrame();
  s.bus.stopBgm();
  s.ctx.currentTime += 1 / 60;
  for (let i = 0; i < 400; i++) s.step([], 0.9);

  // New run.
  s.bus.startBgm();
  for (let i = 0; i < 60; i++) s.step(["bgm:main"], 0.5);
  const lead = melodyGain(s);
  assert(lead.gain.at(s.ctx.currentTime) > 0.9, "the melody never restarted for the second run");
  assert(liveLoops(s.ctx, s.ctx.currentTime).length === kit.BGM_LAYERS.length, "a BGM voice lost its source");
});

check("swapping cues never leaves a voice without a source", () => {
  const s = makeSession();
  s.bus.startBgm();
  for (let i = 0; i < 60; i++) s.step(["bgm:main"], 0.5);
  for (let round = 0; round < 4; round++) {
    // Above toCritical, then below toMain: each round has to actually swap.
    const want = round % 2 === 0 ? kit.CUE_SWITCH.toCritical + 0.05 : Math.max(0, kit.CUE_SWITCH.toMain - 0.05);
    for (let i = 0; i < 700; i++) {
      s.step(["bgm:" + s.bus.desiredCue()], want);
      const live = liveLoops(s.ctx, s.ctx.currentTime);
      const voices = new Set(live.map((x) => x.voiceTag));
      assert(
        live.length >= kit.BGM_LAYERS.length,
        `frame ${s.frame}: only ${live.length} looping voices during a swap`
      );
      void voices;
    }
  }
  // Once every scheduled stop has passed, exactly one loop per voice remains.
  const settled = s.ctx.currentTime + 20;
  assert(
    liveLoops(s.ctx, settled).length === kit.BGM_LAYERS.length,
    `after settling, ${liveLoops(s.ctx, settled).length} loops remain (expected ${kit.BGM_LAYERS.length})`
  );
});

check("hiding and restoring the tab leaves the melody running", () => {
  const s = makeSession();
  s.bus.startBgm();
  for (let i = 0; i < 60; i++) s.step(["bgm:main"], 0.5);
  const before = liveLoops(s.ctx, s.ctx.currentTime).length;
  s.bus.setPaused(true);
  assert(s.ctx.state === "suspended", "hiding the tab must suspend the context");
  // A suspended context's clock does not advance.
  const frozen = s.ctx.currentTime;
  s.bus.setPaused(false);
  assert(s.ctx.state === "running", "returning must resume the context");
  s.ctx.currentTime = frozen;
  for (let i = 0; i < 60; i++) s.step(["bgm:main"], 0.5);
  assert(
    liveLoops(s.ctx, s.ctx.currentTime).length === before,
    "a BGM voice was lost across the suspend"
  );
  assert(melodyGain(s).gain.at(s.ctx.currentTime) > 0.9, "the melody did not come back after resuming");
});

console.log(`BGM continuity tests: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach((f) => console.error(`- ${f}`));
  process.exitCode = 1;
}
