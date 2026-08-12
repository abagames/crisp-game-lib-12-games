#!/usr/bin/env node
// Real-browser campaign probe, adapted from probing-web-game-mechanics' template.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "../tools/serve.mjs";

const PORT = 8124;
const shotDir = path.resolve(process.argv[2] || "build/campaign-shots");
fs.mkdirSync(shotDir, { recursive: true });

const errors = [];
const failures = [];
const check = (name, actual, expected) => {
  const ok =
    typeof expected === "function" ? expected(actual) : JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(actual)}`);
  if (!ok) failures.push(name);
};

const server = createServer();
await new Promise((resolve) => server.listen(PORT, resolve));
const browser = await chromium.launch({
  executablePath: process.env.VK_BROWSER_PATH || undefined,
});
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()} @ ${m.location().url || "unknown"}`);
});

try {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__voltKeeper && window.__voltKeeper.state().phase === "attract");
  await page.evaluate(() => localStorage.removeItem("voltKeeper.hiScore"));
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.__voltKeeper && window.__voltKeeper.state().phase === "attract");
  await page.screenshot({ path: path.join(shotDir, "attract-pixel-logo.png") });
  await page.keyboard.press("KeyZ");
  await page.waitForFunction(() => window.__voltKeeper.state().phase === "play");

  // Capacitor Probe presentation in the three live keeper states.
  const visual = await page.evaluate(() => window.__voltKeeper.visualContract());
  check("Probe visual contract exposes two frames and 2x world scale",
    [visual.probe.frameA, visual.probe.frameB, visual.probe.worldScale], ["c", "d", 2]);
  await page.waitForFunction(() => window.__voltKeeper.state().keeper.frame === "c");
  await page.screenshot({ path: path.join(shotDir, "probe-play-a.png") });
  await page.waitForFunction(() => window.__voltKeeper.state().keeper.frame === "d");
  await page.screenshot({ path: path.join(shotDir, "probe-play-b.png") });
  await page.keyboard.press("KeyZ");
  await page.waitForFunction(() => window.__voltKeeper.state().keeper.state === "ground");
  await page.screenshot({ path: path.join(shotDir, "probe-ground.png") });
  await page.waitForFunction(() => window.__voltKeeper.state().keeper.state === "recover");
  await page.screenshot({ path: path.join(shotDir, "probe-recover.png") });
  await page.waitForFunction(() => window.__voltKeeper.state().keeper.state === "free");

  // Scenario 1: one score event crosses several thresholds and shows the 5-life HUD.
  await page.evaluate(() => window.__voltKeeper.injectScore(500000));
  await page.waitForFunction(() => window.__voltKeeper.state().score === 500000);
  const extended = await page.evaluate(() => window.__voltKeeper.state());
  check("one score event consumes every crossed EXTEND up to five lives",
    [extended.score, extended.lives, extended.extendCount], [500000, 5, 7]);
  check("the next repeating EXTEND remains armed", extended.nextExtend, 600000);
  check("score EXTEND has one aggregated notice", extended.popups.some((p) => p.kind === "extend" && p.text === "EXTEND +7"), true);
  check("score EXTEND starts reserve assembly", extended.extendBuildTimer, (v) => v > 0);
  const firstExtendSounds = await page.evaluate(() => window.__voltKeeper.audio.bus.log.filter((e) => e.name === "keeper:extend").length);
  check("multi-EXTEND emits one audio event", firstExtendSounds, 1);
  await page.screenshot({ path: path.join(shotDir, "score-extend.png") });

  // Scenario 2: WAVE 8 is an ordinary boundary with no chapter reward.
  await page.evaluate(() => window.__voltKeeper.injectWaveEnd(8, { lives: 5, capacitor: 1, score: 500000 }));
  await page.waitForFunction(() => window.__voltKeeper.state().wave === 9);
  const wave9 = await page.evaluate(() => window.__voltKeeper.state());
  check("WAVE 8 advances through the ordinary WAVE 9 surge", [wave9.wave, wave9.phase, wave9.capacitor], [9, "play", 70]);
  check("WAVE 8 keeps EXTEND progress unchanged", wave9.extendCount, 7);
  const wave8Audio = await page.evaluate(() => window.__voltKeeper.audio.bus.log.map((e) => e.name));
  check("WAVE 8 emits ordinary surge audio", wave8Audio.includes("wave:surge"), true);
  check("removed chapter audio stays absent", wave8Audio.includes("chapter:clear"), false);
  await page.waitForFunction(() => window.__voltKeeper.state().tallyTimer === 0);

  // Scenario 3: inject the rare WAVE 17 completion just below a threshold.
  await page.evaluate(() => window.__voltKeeper.injectWaveEnd(17, { lives: 4, capacitor: 80, score: 599999 }));
  const finaleSetup = await page.evaluate(() => window.__voltKeeper.state());
  check("WAVE 17 uses the FINALE family", finaleSetup.currentFamily, "FINALE");
  check("WAVE 17 exposes the scaled quota", finaleSetup.waveQuota, (v) => v > 360);

  await page.waitForFunction(() => window.__voltKeeper.state().phase === "finalclear");
  const final0 = await page.evaluate(() => window.__voltKeeper.state());
  check("final tally consumes its crossed threshold", final0.extendCount, 8);
  check("final tally suppresses a meaningless life", final0.lives, 4);
  check("final tally suppresses EXTEND notice", final0.popups.some((p) => p.kind === "extend"), false);
  const finalExtendSounds = await page.evaluate(() => window.__voltKeeper.audio.bus.log.filter((e) => e.name === "keeper:extend").length);
  check("final tally suppresses EXTEND audio", finalExtendSounds, firstExtendSounds);
  await page.keyboard.press("KeyZ");
  await page.waitForTimeout(100);
  check("early final-clear input is blocked by grace", (await page.evaluate(() => window.__voltKeeper.state())).phase, "finalclear");
  await page.screenshot({ path: path.join(shotDir, "wave-17-game-clear.png") });
  await page.waitForFunction(() => window.__voltKeeper.state().finalScoreSaved === true);
  const final1 = await page.evaluate(() => ({
    state: window.__voltKeeper.state(),
    stored: Number(localStorage.getItem("voltKeeper.hiScore")),
    storage: Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)])),
    audio: window.__voltKeeper.audio.bus.log.map((e) => e.name),
  }));
  check("final clear never creates WAVE 18", final1.state.wave, 17);
  check("final clear freezes the WAVE timer", final1.state.waveTimer, final0.waveTimer);
  check("final tally reaches the final score", final1.state.tallyPaid, final1.state.waveBonus);
  check("final score is persisted", [final1.stored, final1.state.score, final1.state.hiScore, final1.state.finalScoreSaved, final1.storage],
    ([stored, score, high, saved]) => stored === score && high === score && saved === true);
  check("final clear emits its jingle event", final1.audio.includes("game:clear"), true);

  await page.waitForFunction(() => window.__voltKeeper.state().phaseTimer < 299);
  await page.keyboard.press("KeyZ");
  await page.waitForFunction(() => window.__voltKeeper.state().phase === "attract");
  const returned = await page.evaluate(() => window.__voltKeeper.state());
  check("final clear returns to ATTRACT", returned.phase, "attract");
  check("ATTRACT reloads the cleared hi-score", returned.hiScore, final1.stored);
} finally {
  await browser.close();
  server.close();
}

console.log(`ERRORS: ${errors.length ? JSON.stringify(errors) : "none"}`);
if (errors.length || failures.length) {
  console.error(`Campaign browser probe FAILED (${failures.length} assertions, ${errors.length} runtime errors).`);
  process.exitCode = 1;
} else {
  console.log(`Campaign browser probe passed; screenshots: ${shotDir}`);
}
