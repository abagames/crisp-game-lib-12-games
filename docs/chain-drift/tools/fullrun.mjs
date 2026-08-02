// Whole-run gate for CHAIN DRIFT. Every other gate either injects state
// (probe), holds one screen (ceremony) or watches a few seconds (smoke). This
// one plays the game from the first READY to the ranking screen and asserts the
// run held together: every round arrived in order, the ceremonies fired, the
// extends paid, and nothing threw on the way.
//
// It affords that by taking the frame clock off the display. crisp-game-lib
// drives update() from requestAnimationFrame but gates each frame on
// window.performance.now() against a 68 fps budget, so both have to move
// together: replacing rAF alone leaves the budget check skipping every frame.
// With both on a virtual clock a full 18-round run costs ~12 s instead of ~7
// minutes. Measured against a real-time botrun of the same autopilot, the
// pumped run lands within 6% on frame count and reaches the same outcome.
//
// What this gate deliberately does not cover: audio (the autopilot never
// presses anything, so audioResume() never runs, and AudioContext keeps its own
// real clock -- tools/audio.mjs owns that at speed), and anything specific to
// real vsync timing (tools/smoke-test.mjs still runs at 1x for that).
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/");
const { chromium } = require("playwright");

const url = process.argv[2] || "http://localhost:8231/index.html";
const failures = [];

const check = (name, actual, expected) => {
  const ok =
    typeof expected === "function"
      ? expected(actual)
      : JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(actual)}`);
  if (!ok) failures.push(name);
};

/* Installed before any page script. The trace is gathered inside the page so a
 * whole run costs a handful of round trips instead of one per frame. */
const installPump = () => {
  const queued = [];
  let now = 0;
  // One tick past the library's 1000/68 budget, so each pump is exactly one
  // game frame rather than a skipped one.
  const STEP = 1000 / 68 + 0.01;
  window.requestAnimationFrame = (cb) => queued.push(cb);
  window.cancelAnimationFrame = () => {};
  window.performance.now = () => now;
  window.__frames = 0;
  window.__trace = [];
  const step = () => {
    now += STEP;
    window.__frames++;
    for (const cb of queued.splice(0, queued.length)) cb(now);
  };
  window.__pump = (n) => {
    for (let i = 0; i < n; i++) step();
  };
  // Pumps until the run hands the player back to the ranking screens, recording
  // one row per phase / round / lives change.
  window.__runUntilOver = (maxFrames) => {
    const over = ["entry", "table", "attract"];
    let prev = "";
    for (let i = 0; i < maxFrames; i++) {
      step();
      const s = window.CD.state();
      const key = `${s.phase}|${s.round}|${s.lives}`;
      if (key !== prev) {
        prev = key;
        window.__trace.push({
          frame: window.__frames,
          phase: s.phase,
          round: s.round,
          lives: s.lives,
          score: s.score,
        });
      }
      if (over.includes(s.phase)) return true;
    }
    return false;
  };
};

/* Lives only ever move one at a time, so the trace carries the whole ledger. */
const ledger = (trace, state) => {
  let extendsPaid = 0;
  let deaths = 0;
  for (let i = 1; i < trace.length; i++) {
    if (trace[i].lives > trace[i - 1].lives) extendsPaid++;
    else if (trace[i].lives < trace[i - 1].lives) deaths++;
  }
  return { start: trace[0].lives, extends: extendsPaid, deaths, final: state.lives };
};

const runOnce = async (browser, autopilot, maxFrames) => {
  const context = await browser.newContext({ viewport: { width: 480, height: 480 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text());
  });
  await page.addInitScript(installPump);
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => window.CD != null, { timeout: 15000 });
  await page.evaluate((mode) => {
    window.CD.setAutopilot(mode);
    window.CD.startGame();
  }, autopilot);
  const t0 = Date.now();
  const finished = await page.evaluate((n) => window.__runUntilOver(n), maxFrames);
  const wall = (Date.now() - t0) / 1000;
  const trace = await page.evaluate(() => window.__trace);
  const state = await page.evaluate(() => window.CD.state());
  const deaths = await page.evaluate(() => window.CD.deaths());
  await context.close();
  return { finished, wall, trace, state, deaths, errors };
};

const browser = await chromium.launch();

// ---------------------------------------------------------------- skilled ----
console.log("--- a skilled run reaches the end of the game and clears it ---");
const bot = await runOnce(browser, true, 60 * 68 * 20);
const frames = bot.trace[bot.trace.length - 1].frame;
console.log(
  `  ${bot.wall.toFixed(1)}s wall for ${frames} frames (${(frames / 68).toFixed(0)}s of play), ` +
    `score ${bot.state.lastRunScore || bot.state.score}`
);
check("the run played itself out instead of hanging", bot.finished, true);
check("nothing threw across the whole run", bot.errors, []);

const roundsInOrder = [];
for (const row of bot.trace) {
  if (row.phase === "ready" && roundsInOrder[roundsInOrder.length - 1] !== row.round) {
    roundsInOrder.push(row.round);
  }
}
check(
  "every round from 1 to 18 arrived exactly once, in order",
  roundsInOrder,
  Array.from({ length: 18 }, (_, i) => i + 1)
);
check("the run ended on the clear, at the last round", {
  round: bot.state.lastRunRound,
  cleared: bot.state.lastRunCleared,
}, { round: 18, cleared: true });
check(
  "and it ended on a screen that offers the ranking",
  ["entry", "table"].includes(bot.state.phase),
  true
);

const phasesSeen = [...new Set(bot.trace.map((r) => r.phase))].sort();
check(
  "the whole ceremony vocabulary was reached by playing, not by injection",
  ["allclear", "chainout", "clear", "play", "ready"].filter((p) => !phasesSeen.includes(p)),
  []
);
// The peak life count is not a stable figure -- a run that trades a death for
// an extend never shows one -- but the ledger behind it is exact.
const botLedger = ledger(bot.trace, bot.state);
check(
  "the life ledger balances: three lives, plus every extend, minus every death",
  botLedger,
  (v) => v.start === 3 && v.extends > 0 && v.final === 3 + v.extends - v.deaths
);
check(
  "a full clear lands in the range the factory table was cut for",
  bot.state.lastRunScore,
  (v) => v > 300000 && v < 700000
);
check(
  "the run took a sane number of frames",
  frames,
  (v) => v > 15000 && v < 45000
);

// ------------------------------------------------------------------ naive ----
console.log("\n--- a weak run dies out, and dying is just as survivable ---");
const naive = await runOnce(browser, "naive", 60 * 68 * 20);
const naiveFrames = naive.trace[naive.trace.length - 1].frame;
console.log(
  `  ${naive.wall.toFixed(1)}s wall for ${naiveFrames} frames, out at round ` +
    `${naive.state.lastRunRound} with ${naive.state.lastRunScore}`
);
check("the losing run also played itself out", naive.finished, true);
check("nothing threw on the way down either", naive.errors, []);
check("it lost the game instead of clearing it", naive.state.lastRunCleared, false);
const naiveLedger = ledger(naive.trace, naive.state);
check(
  "it really died: the last life was spent and the ledger still balances",
  naiveLedger,
  (v) => v.deaths > 0 && v.final === 0 && v.final === 3 + v.extends - v.deaths
);
check(
  "every organic death names what killed the player",
  naive.deaths.filter((d) => !["mine", "own-blast", "field-blast"].includes(d.cause)),
  []
);
check(
  "game over handed the player to the ranking screens",
  ["entry", "table"].includes(naive.state.phase),
  true
);

await browser.close();
console.log(failures.length ? `\nFAILURES: ${failures.join(", ")}` : "\nALL ASSERTIONS PASSED");
process.exit(failures.length ? 1 : 0);
