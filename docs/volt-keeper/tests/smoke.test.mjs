#!/usr/bin/env node
/*
 * Browser smoke test: loads the real build in headless Chromium, idles, then
 * sends input bursts. Fails on any console error, uncaught exception, or page
 * crash. Also checks that audio actually came up after user activation, which
 * is the one thing the Node tests structurally cannot see.
 */
import { chromium } from "playwright";
import { createServer } from "../tools/serve.mjs";

const PORT = 8123;
const errors = [];
const consoleErrors = [];
const shotDir = process.argv.includes("--shots")
  ? process.argv[process.argv.indexOf("--shots") + 1] || "build/shots"
  : null;
if (shotDir) (await import("node:fs")).mkdirSync(shotDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = createServer();
await new Promise((resolve) => server.listen(PORT, resolve));

const browser = await chromium.launch();
const page = await browser.newPage();

page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (e) => consoleErrors.push(`uncaught: ${e.message}`));
page.on("crash", () => consoleErrors.push("page crashed"));

try {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "load" });
  await sleep(500);

  // 1. Idle: the game owns frame zero, so this is attract mode, not a library
  //    title screen. It must be moving on its own.
  await sleep(1500);
  const bundleLoaded = await page.evaluate(() => typeof window.onLoad === "function" && !!document.querySelector("canvas"));
  if (!bundleLoaded) errors.push("crisp-game-lib did not create a canvas");
  const attract = await page.evaluate(() => window.__voltKeeper.state());
  if (attract.phase !== "attract") errors.push(`idle phase is "${attract.phase}", expected attract`);
  if (shotDir) await page.screenshot({ path: `${shotDir}/1-attract.png` });

  // 2. Start the run (this is the user activation the AudioContext needs).
  await page.keyboard.press("KeyZ");
  await sleep(200);
  const ready = await page.evaluate(() => window.__voltKeeper.state());
  if (ready.phase !== "ready" && ready.phase !== "play") {
    errors.push(`the start press did not begin a run (phase=${ready.phase})`);
  }
  if (shotDir) await page.screenshot({ path: `${shotDir}/2-ready.png` });
  await sleep(2000);

  // 3. Input bursts: movement plus rapid grounding.
  for (let burst = 0; burst < 6; burst++) {
    for (const key of ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"]) {
      await page.keyboard.down(key);
      await sleep(90);
      await page.keyboard.up(key);
    }
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("KeyZ");
      await sleep(40);
    }
  }
  await sleep(500);
  if (shotDir) await page.screenshot({ path: `${shotDir}/3-play.png` });

  // 4. Audio must have come up on the user gesture, not stayed suspended.
  const audio = await page.evaluate(() => {
    const vk = window.__voltKeeper;
    if (!vk || !vk.audio) return { present: false };
    const ctx = vk.audio.bus && vk.audio.bus.adapter && vk.audio.bus.adapter.context;
    const log = vk.audio.bus ? vk.audio.bus.log : [];
    const counts = {};
    for (const entry of log) counts[entry.action] = (counts[entry.action] || 0) + 1;
    return {
      present: true,
      ready: vk.audio.ready,
      contextState: ctx ? ctx.state : null,
      sampleRate: ctx ? ctx.sampleRate : null,
      bgmStarted: vk.audio.bus ? vk.audio.bus.adapter.isStarted : false,
      counts,
      debug: vk.audio.bus ? vk.audio.bus.debug() : null,
      state: vk.state(),
    };
  });

  if (!audio.present) errors.push("__voltKeeper debug seam missing");
  else {
    if (!audio.ready) errors.push("audio never initialised after user activation");
    if (audio.contextState !== "running") errors.push(`AudioContext is "${audio.contextState}", expected "running"`);
    if (!audio.bgmStarted) errors.push("BGM cue never started");
    if (!audio.counts.played) errors.push("no program was ever played");
    if (audio.counts.unknown || audio.counts.unresolved || audio.counts.voiceLimitExceeded) {
      errors.push(`bus reported failures: ${JSON.stringify(audio.counts)}`);
    }
  }

  // 4b. A hidden tab must not keep playing. The animation frame loop stops on
  //     its own, but a looping BufferSource does not.
  const hidden = await page.evaluate(async () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((r) => setTimeout(r, 120));
    const state = window.__voltKeeper.audio.bus.adapter.context.state;
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((r) => setTimeout(r, 120));
    return { hidden: state, restored: window.__voltKeeper.audio.bus.adapter.context.state };
  });
  if (hidden.hidden !== "suspended") errors.push(`hiding the tab left audio "${hidden.hidden}", expected suspended`);
  if (hidden.restored !== "running") errors.push(`returning to the tab left audio "${hidden.restored}", expected running`);

  // 5. The game must actually be running, not frozen on frame 0.
  const ticks = await page.evaluate(() => window.ticks || 0);
  if (ticks < 60) errors.push(`game loop appears stalled (ticks=${ticks})`);
  if (audio.state && audio.state.phase !== "play" && audio.state.phase !== "miss" && audio.state.phase !== "gameover") {
    errors.push(`after input bursts the phase is "${audio.state.phase}", expected a run in progress`);
  }
  // Deliberately no assertion on score here: blind input bursts do not
  // reliably score, and this gate is for runtime health. Scoring is asserted
  // in tests/geometry.test.mjs, where the input is a real policy.

  console.log(
    `Smoke: ticks=${ticks}, audio=${JSON.stringify({
      ready: audio.ready,
      ctx: audio.contextState,
      sr: audio.sampleRate,
      bgm: audio.bgmStarted,
    })}`
  );
  console.log(`  bus actions: ${JSON.stringify(audio.counts)}`);
  console.log(`  game state:  ${JSON.stringify(audio.state)}  intent: ${JSON.stringify(audio.debug)}`);
} finally {
  await browser.close();
  server.close();
}

if (consoleErrors.length) errors.push(`console errors: ${consoleErrors.join(" | ")}`);

if (errors.length) {
  console.error(`\nBrowser smoke test FAILED (${errors.length}):`);
  errors.forEach((e) => console.error(`- ${e}`));
  process.exitCode = 1;
} else {
  console.log("\nBrowser smoke test passed: no console errors, loop running, audio active.");
}
