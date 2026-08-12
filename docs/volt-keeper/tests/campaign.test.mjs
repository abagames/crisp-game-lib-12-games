#!/usr/bin/env node
import { loadGame } from "./harness.mjs";

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
const extendAudioCount = (sim) => sim.api.audioLog().filter((e) => e.name === "keeper:extend").length;
const pay = (sim, points) => {
  sim.api.injectScore(points);
  sim.step([]);
};

check("a new run starts with three lives and fresh EXTEND progress", () => {
  const sim = loadGame({ seed: 3003 });
  sim.startPlay();
  const s = sim.api.state();
  assert(s.lives === 3, `initial lives were ${s.lives}`);
  assert(s.extendCount === 0 && s.nextExtend === 20000, "new-run EXTEND progress was not reset");
});

check("score EXTEND thresholds fire in order and are retained through MISS", () => {
  const sim = loadGame({ seed: 6060 });
  sim.startPlay();
  pay(sim, 19999);
  assert(sim.api.state().lives === 3 && sim.api.state().extendCount === 0, "19,999 awarded an EXTEND");
  assert(extendAudioCount(sim) === 0, "19,999 emitted EXTEND audio");

  pay(sim, 1);
  assert(sim.api.state().lives === 4 && sim.api.state().extendCount === 1, "20,000 did not award the first EXTEND");
  assert(sim.api.state().nextExtend === 50000, "the second threshold was not armed");
  assert(extendAudioCount(sim) === 1, "the first EXTEND did not emit exactly one sound");

  sim.api.loseLife("test");
  sim.step([]);
  assert(sim.api.state().phase === "miss", "test MISS did not enter its ceremony");
  assert(sim.api.state().extendCount === 1 && sim.api.state().nextExtend === 50000, "MISS reset EXTEND progress");
  while (sim.api.state().phase === "miss") sim.step([]);

  pay(sim, 30000);
  assert(sim.api.state().lives === 4 && sim.api.state().extendCount === 2, "50,000 did not award the second EXTEND");
  pay(sim, 50000);
  assert(sim.api.state().lives === 5 && sim.api.state().extendCount === 3, "100,000 did not award the third EXTEND");
  assert(sim.api.state().nextExtend === 200000, "the repeating threshold was not armed");
  pay(sim, 400000);
  assert(sim.api.state().lives === 5 && sim.api.state().extendCount === 7, "repeating EXTENDs stopped early");
  assert(sim.api.state().nextExtend === 600000, "the repeating EXTEND sequence drifted");
  assert(extendAudioCount(sim) === 4, "sequential score events did not emit once each");
});

check("one score event aggregates multiple EXTENDs and consumes them at the life cap", () => {
  const sim = loadGame({ seed: 3636 });
  sim.startPlay();
  pay(sim, 500000);
  const s = sim.api.state();
  assert(s.extendCount === 7, `only ${s.extendCount} thresholds were consumed`);
  assert(s.lives === 5, `internal life cap was ${s.lives}, expected 5`);
  assert(s.popups.some((p) => p.kind === "extend" && p.text === "EXTEND +7"), "multi-EXTEND notice was not aggregated");
  assert(extendAudioCount(sim) === 1, "multi-EXTEND score event emitted more than one sound");

  const capped = loadGame({ seed: 5555 });
  capped.startPlay();
  capped.api.injectWaveEnd(1, { lives: 5, score: 0 });
  pay(capped, 500000);
  assert(capped.api.state().lives === 5, "EXTEND exceeded the internal life cap");
  assert(capped.api.state().extendCount === 7 && capped.api.state().nextExtend === 600000, "life-cap EXTENDs were deferred instead of consumed");
  assert(extendAudioCount(capped) === 1, "life-cap threshold batch did not use one sound");
});

check("ATTRACT has no EXTEND effects and a new run resets progress", () => {
  const sim = loadGame({ seed: 7070 });
  sim.step([]);
  pay(sim, 360000);
  assert(sim.api.state().phase === "attract", "test left ATTRACT unexpectedly");
  assert(sim.api.state().extendCount === 0 && sim.api.state().lives === 3, "ATTRACT mutated EXTEND state");
  assert(extendAudioCount(sim) === 0, "ATTRACT emitted EXTEND audio");

  sim.api.startRun();
  assert(sim.api.state().gameScore === 0, "new run did not reset score");
  assert(sim.api.state().extendCount === 0 && sim.api.state().nextExtend === 20000, "new run did not reset thresholds");
  assert(sim.api.state().lives === 3, "new run did not restore initial lives");
});

check("HUD shows four reserve icons at the five-life cap", () => {
  const sim = loadGame({ seed: 4545 });
  sim.startPlay();
  pay(sim, 360000);
  assert(sim.api.state().extendBuildTimer > 0, "EXTEND did not start reserve assembly");
  for (let i = 0; i < sim.api.EXTEND_BUILD_FRAMES; i++) sim.step([]);
  sim.clearDraws();
  sim.step([]);
  const icons = sim.draws.filter(
    (d) => d.fn === "char" && d.text === sim.api.PROBE_FRAME_A && d.scale.x === 1 && d.y === sim.api.VISUAL.hud.lives.y
  );
  const plus = sim.draws.filter((d) => d.fn === "text" && d.text === "+");
  assert(icons.length === 4 && plus.length === 0, `five-life HUD drew ${icons.length} reserve probes and ${plus.length} pluses`);
});

check("split wave-tally payments neither miss nor duplicate a score EXTEND", () => {
  const sim = loadGame({ seed: 7121 });
  sim.startPlay();
  sim.api.injectWaveEnd(7, { lives: 3, capacitor: 1, score: 19999 });
  sim.step([]);
  const crossed = sim.api.state();
  assert(crossed.gameScore === 20000, `first tally installment produced ${crossed.gameScore}`);
  assert(crossed.extendCount === 1 && crossed.lives === 4, "tally threshold did not award exactly one EXTEND");
  for (let i = 0; i < 40; i++) sim.step([]);
  const settled = sim.api.state();
  assert(settled.tallyPaid === 20 && settled.gameScore === 20019, "split tally did not settle its exact score");
  assert(settled.extendCount === 1 && settled.lives === 4, "later tally installments duplicated the EXTEND");
  assert(extendAudioCount(sim) === 1, "split tally emitted the EXTEND sound more than once");
});

check("WAVE 8 uses the ordinary settlement and advances directly to WAVE 9", () => {
  for (const quotaMet of [true, false]) {
    const sim = loadGame({ seed: quotaMet ? 8008 : 8009 });
    sim.startPlay();
    sim.api.injectWaveEnd(8, { lives: 2, capacitor: 73, score: 1000, quotaMet });
    sim.step([]);
    const entered = sim.api.state();
    assert(entered.phase === "play" && entered.wave === 9, `advanced to ${entered.phase} WAVE ${entered.wave}`);
    assert(entered.lives === 2 && entered.extendCount === 0, "WAVE 8 awarded a fixed EXTEND");
    assert(entered.quotaCleared === quotaMet, "quota result was not retained");
    assert(entered.capacitor === (quotaMet ? 70 : 40), `ordinary settlement produced ${entered.capacitor}`);
    assert(entered.surgeTimer > 0, "WAVE 9 did not begin with the ordinary surge");
    const names = sim.api.audioLog().map((e) => e.name);
    assert(names.includes("wave:surge"), "WAVE 8 did not emit the ordinary surge event");
    assert(!names.includes("chapter:clear"), "removed chapter-clear event was emitted");
    assert(!names.includes("keeper:extend"), "WAVE 8 emitted the removed fixed-EXTEND sound");
  }
});

check("WAVE 17 final tally consumes thresholds without an EXTEND reward or fanfare", () => {
  const sim = loadGame({ seed: 1717 });
  sim.startPlay();
  sim.api.injectWaveEnd(17, { lives: 4, capacitor: 80, score: 19999 });
  const setup = sim.api.state();
  assert(setup.currentFamily === "FINALE", `final family was ${setup.currentFamily}`);
  assert(setup.pieces.length === 8, `final board had ${setup.pieces.length} pieces`);
  assert(setup.pieces.filter((p) => p.kind === "arrow").length === 4, "final board needs four arrows");
  assert(setup.pieces.filter((p) => p.kind === "bumper").length === 4, "final board needs four bumpers");
  assert(sim.api.diff(17).chargerRatio === 0.25, "final enemy mix did not raise charger presence");
  const ordinaryQuota = Math.round(sim.api.diff(17).drainPerFrame * 1800 * 1.2);
  assert(setup.waveQuota > ordinaryQuota, "final quota did not apply its dedicated scale");

  sim.step([]);
  const entered = sim.api.state();
  assert(entered.phase === "finalclear", `phase was ${entered.phase}`);
  assert(entered.wave === 17, `final clear advanced to WAVE ${entered.wave}`);
  assert(entered.extendCount === 1, "final tally did not consume the crossed threshold");
  assert(entered.lives === 4, "final tally awarded a meaningless life");
  assert(!entered.popups.some((p) => p.kind === "extend"), "final clear displayed an EXTEND notice");
  assert(extendAudioCount(sim) === 0, "final clear emitted EXTEND audio");
  const frozenTimer = entered.waveTimer;
  const frozenKeeper = [entered.keeper.x, entered.keeper.y, entered.keeper.timer];

  sim.step(["KeyZ"]);
  assert(sim.api.state().phase === "finalclear", "final clear ignored its input grace period");
  for (let i = 0; i < 40; i++) sim.step(i % 2 ? ["ArrowLeft"] : []);
  const paid = sim.api.state();
  assert(paid.waveTimer === frozenTimer, "WAVE timer advanced during final clear");
  assert(JSON.stringify([paid.keeper.x, paid.keeper.y, paid.keeper.timer]) === JSON.stringify(frozenKeeper), "keeper moved during final clear");
  assert(paid.tallyPaid === paid.waveBonus, "the final battery tally did not settle completely");
  assert(paid.gameScore === 19999 + paid.waveBonus, "final score omitted or duplicated the WAVE 17 settlement");
  assert(paid.hiScore === paid.gameScore && paid.finalScoreSaved, "final score was not committed as the hi-score");
  assert(sim.api.audioLog().some((e) => e.name === "game:clear"), "the final-clear jingle event was not emitted");

  while (sim.api.state().phase === "finalclear" && sim.api.state().phaseTimer >= 299) sim.step([]);
  sim.step(["KeyZ"]);
  assert(sim.api.state().phase === "attract", "final clear did not return to ATTRACT after a legal skip");
  assert(sim.api.state().hiScore === paid.gameScore, "ATTRACT reload lost the cleared run's hi-score");
});

if (failures.length) {
  console.error(`Campaign tests FAILED (${failures.length}):`);
  failures.forEach((f) => console.error(`- ${f}`));
  process.exitCode = 1;
} else {
  console.log(`Campaign tests passed (${passed}).`);
}
