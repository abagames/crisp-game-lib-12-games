// Long autopilot run: measures round pacing and the score curve so the extend
// thresholds and the factory high-score table are set from data, not a guess.
import { chromium } from "playwright";

const URL = process.argv[2] || "http://localhost:8231/index.html";
const SECONDS = Number(process.argv[3] || 240);
const SCAV_EAT_CAP_OVERRIDE =
  process.argv[4] == null ? null : Number(process.argv[4]);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 480, height: 480 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(URL, { waitUntil: "load" });
await page.waitForFunction(() => window.CD != null, { timeout: 10000 });
await page.waitForFunction(() => window.CD.state().phase === "attract", { timeout: 10000 });
await page.evaluate((eatCap) => {
  window.CD.setAutopilot(true);
  if (eatCap != null) window.CD.setScavEatCap(eatCap);
  window.CD.startGame();
}, SCAV_EAT_CAP_OVERRIDE);

const t0 = Date.now();
let prevRound = 1;
let prevPhase = "ready";
let prevLives = 3;
let lastClear = 0;
const rounds = [];
let deaths = 0;
let over = null;

while (Date.now() - t0 < SECONDS * 1000) {
  await page.waitForTimeout(250);
  const s = await page.evaluate(() => window.CD.state());
  const t = (Date.now() - t0) / 1000;
  if (s.lives < prevLives) {
    deaths += prevLives - s.lives;
    prevLives = s.lives;
  } else if (s.lives > prevLives) {
    console.log(`  [${t.toFixed(0)}s] EXTEND -> lives ${s.lives} at score ${s.score}`);
    prevLives = s.lives;
  }
  if (s.round !== prevRound || (s.phase === "allclear" && prevPhase !== "allclear")) {
    rounds.push({
      round: prevRound,
      sec: +(t - lastClear).toFixed(1),
      score: s.score,
    });
    console.log(
      `  cleared R${prevRound} in ${(t - lastClear).toFixed(1)}s  total=${s.score}  lives=${s.lives}`
    );
    lastClear = t;
    prevRound = s.round;
  }
  prevPhase = s.phase;
  if (s.phase === "entry" || s.phase === "table" || s.phase === "attract") {
    over = { t, score: s.lastRunScore || s.score };
    break;
  }
}

const s = await page.evaluate(() => window.CD.state());
const deathTelemetry = await page.evaluate(() => window.CD.deaths());
console.log(`\nfinal: score=${s.score} round=${s.round} lives=${s.lives} deaths=${deaths} clear=${s.lastRunCleared}`);
console.log("death telemetry:", deathTelemetry.length ? deathTelemetry : "none");
if (over) {
  console.log(
    `${s.lastRunCleared ? "cleared run" : "game over"} at ${over.t.toFixed(0)}s with ${over.score}`
  );
}
if (rounds.length) {
  const secs = rounds.map((r) => r.sec);
  console.log(
    `round length: min=${Math.min(...secs)}s max=${Math.max(...secs)}s ` +
      `mean=${(secs.reduce((a, b) => a + b, 0) / secs.length).toFixed(1)}s over ${rounds.length} rounds`
  );
  console.log(`score rate: ${(s.score / ((Date.now() - t0) / 1000)).toFixed(0)} pts/sec`);
}
console.log("errors:", errors.length ? [...new Set(errors)] : "none");
await browser.close();
