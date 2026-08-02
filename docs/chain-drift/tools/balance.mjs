// Balance harness: runs the same game under three control policies and reports
// what each earns. The decisive question is whether idle or mash play can keep
// pace with skilled play — if either does, the design is broken, not the tuning.
import { chromium } from "playwright";

const URL = process.argv[2] || "http://localhost:8231/index.html";
const SECONDS = Number(process.argv[3] || 60);

const browser = await chromium.launch();

async function run(mode) {
  const page = await browser.newPage({ viewport: { width: 480, height: 480 } });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForFunction(() => window.CD != null, { timeout: 10000 });
  // Wait for the first frame so the world exists before we drive it.
  await page.waitForFunction(() => window.CD.state().phase === "attract", {
    timeout: 10000,
  });

  await page.evaluate((m) => {
    window.CD.setAutopilot(m === "bot");
    window.CD.startGame();
  }, mode);

  let mashing = true;
  const mash = (async () => {
    while (mashing && mode === "mash") {
      await page.keyboard.press("Space").catch(() => {});
      await page.waitForTimeout(60);
    }
  })();

  const t0 = Date.now();
  let deaths = 0;
  let prevLives = 3;
  let maxMult = 1;
  while (Date.now() - t0 < SECONDS * 1000) {
    await page.waitForTimeout(500);
    const s = await page.evaluate(() => window.CD.state());
    if (s.lives < prevLives) deaths += prevLives - s.lives;
    prevLives = s.lives;
    if (s.mult > maxMult) maxMult = s.mult;
    if (s.phase === "entry" || s.phase === "table" || s.phase === "attract") break;
  }
  mashing = false;
  await mash;
  const s = await page.evaluate(() => window.CD.state());
  await page.close();
  return { mode, ...s, deaths, maxMult, errors: errors.length, errorTexts: [...new Set(errors)].slice(0, 5) };
}

// Policies have isolated pages and no shared state. Run them concurrently so a
// 90 s comparison costs 90 s of wall time rather than 270 s; each page still
// receives the exact same real-time observation window and sampling cadence.
const results = await Promise.all(["idle", "mash", "bot"].map(run));

console.log(`\n=== ${SECONDS}s per policy ===`);
for (const r of results) {
  console.log(
    `${r.mode.padEnd(5)} score=${String(r.score).padStart(7)} ` +
      `round=${r.round} lives=${r.lives} deaths=${r.deaths} ` +
      `maxMult=${r.maxMult} phase=${r.phase} err=${r.errors}`
  );
  for (const t of r.errorTexts) console.log(`      ! ${t}`);
}
const idle = results.find((r) => r.mode === "idle");
const mashR = results.find((r) => r.mode === "mash");
const bot = results.find((r) => r.mode === "bot");
console.log(
  `\nidle/bot = ${(idle.score / max1(bot.score)).toFixed(2)}   ` +
    `mash/bot = ${(mashR.score / max1(bot.score)).toFixed(2)}   ` +
    `(both must stay well under 1.0)`
);
function max1(v) {
  return v > 0 ? v : 1;
}

await browser.close();
