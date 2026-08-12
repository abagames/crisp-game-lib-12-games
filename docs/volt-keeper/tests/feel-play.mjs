#!/usr/bin/env node
/*
 * Normal-speed browser play check for the feel pass. It reads only the public
 * debug snapshot and drives real keyboard input; no game state is injected.
 * The first successful grounded absorb is captured for visual inspection.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "../tools/serve.mjs";

const PORT = 8124;
const shot = path.resolve(process.argv[2] || "build/shots/feel-busy-ground.png");
const busyShot = path.join(path.dirname(shot), "feel-busy.png");
const errors = [];
const server = createServer();

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(PORT, "127.0.0.1", resolve);
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
});
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("crash", () => errors.push("page crashed"));

const held = new Set();
async function setHeld(next) {
  for (const key of held) {
    if (!next.has(key)) {
      await page.keyboard.up(key);
      held.delete(key);
    }
  }
  for (const key of next) {
    if (!held.has(key)) {
      await page.keyboard.down(key);
      held.add(key);
    }
  }
}

let captured = false;
let busyCaptured = false;
let lastShotScore = -1;
let bestStack = 0;
let maxSparks = 0;
let maxScore = 0;
let startTicks = 0;
let endTicks = 0;
let startTime = 0;

try {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__voltKeeper && window.__voltKeeper.state().phase === "attract");
  await page.keyboard.press("KeyZ");
  await page.waitForFunction(() => window.__voltKeeper.state().phase === "play", null, { timeout: 5000 });

  startTicks = await page.evaluate(() => window.ticks);
  startTime = Date.now();
  const deadline = startTime + 30000;
  while (Date.now() < deadline && (!busyCaptured || maxScore <= 0)) {
    const st = await page.evaluate(() => window.__voltKeeper.state());
    maxSparks = Math.max(maxSparks, st.sparks);
    maxScore = Math.max(maxScore, st.score);
    bestStack = Math.max(bestStack, st.groundAbsorbs || 0);

    if (st.phase !== "play" || !st.keeper || st.sparkSamples.length === 0) {
      await setHeld(new Set());
      await new Promise((resolve) => setTimeout(resolve, 16));
      continue;
    }

    const k = st.keeper;
    let target = null;
    let targetDist = Infinity;
    for (const s of st.sparkSamples) {
      // A short lead keeps the keeper moving toward where the spark will be,
      // while the action itself still fires only from visible proximity.
      const tx = s.x + s.dx * s.speed * 7;
      const ty = s.y + s.dy * s.speed * 7;
      const d = Math.hypot(tx - k.x, ty - k.y);
      if (d < targetDist) {
        targetDist = d;
        target = { ...s, tx, ty };
      }
    }

    const next = new Set();
    if (target) {
      if (target.tx < k.x - 2) next.add("ArrowLeft");
      else if (target.tx > k.x + 2) next.add("ArrowRight");
      if (target.ty < k.y - 2) next.add("ArrowUp");
      else if (target.ty > k.y + 2) next.add("ArrowDown");
      const visibleDist = Math.hypot(target.x - k.x, target.y - k.y);
      if (k.state === "free" && k.invuln <= 0 && st.sparks >= 4) await page.keyboard.press("KeyZ");
      else if (k.state === "free" && visibleDist <= 25) await page.keyboard.press("KeyZ");
    }
    await setHeld(next);

    const busyFrame = st.sparks >= 4 && st.keeper.invuln <= 0;
    const freshAbsorb =
      (st.groundAbsorbs || 0) > 0 &&
      st.score > lastShotScore &&
      st.keeper.state === "ground" &&
      st.keeper.invuln <= 0;
    if (freshAbsorb && !captured) {
      fs.mkdirSync(path.dirname(shot), { recursive: true });
      await page.screenshot({ path: shot });
      captured = true;
      lastShotScore = st.score;
    }
    if (busyFrame && !busyCaptured) {
      fs.mkdirSync(path.dirname(busyShot), { recursive: true });
      await page.screenshot({ path: busyShot });
      busyCaptured = true;
    }
    await new Promise((resolve) => setTimeout(resolve, 16));
  }

  await setHeld(new Set());
  endTicks = await page.evaluate(() => window.ticks);
  const elapsed = (Date.now() - startTime) / 1000;
  const fps = (endTicks - startTicks) / Math.max(0.001, elapsed);
  const final = await page.evaluate(() => window.__voltKeeper.state());
  if (!captured) errors.push("no high-feedback frame was captured in 30 seconds of normal-speed play");
  maxScore = Math.max(maxScore, final.score);
  if (!busyCaptured) errors.push("no normal-speed frame with 4 live sparks was captured");
  if (maxScore <= 0) errors.push("normal-speed play produced no score");
  if (fps < 55) errors.push(`tick rate ${fps.toFixed(1)} fps is below the 55 fps budget`);

  console.log(
    `Feel play: captured=${captured}, busyCaptured=${busyCaptured}, maxScore=${maxScore}, maxSparks=${maxSparks}, ` +
      `bestGroundStack=${bestStack}, fps=${fps.toFixed(1)}, feedbackShot=${shot}, busyShot=${busyShot}`
  );
} finally {
  await setHeld(new Set()).catch(() => {});
  await browser.close();
  server.close();
}

if (errors.length) {
  console.error(`Feel play FAILED (${errors.length}):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log("Feel play passed: real input scored at normal speed with no browser errors.");
}
