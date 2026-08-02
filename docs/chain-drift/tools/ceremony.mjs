// Walks the full arcade cycle and screenshots every ceremony screen. The
// entry/table bug class (screen skipped in one frame, clipped text) passes
// value assertions and only shows up in an image.
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const URL = process.argv[2] || "http://localhost:8231/index.html";
const OUT = "shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 520, height: 560 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(URL, { waitUntil: "load" });
await page.waitForFunction(() => window.CD != null, { timeout: 10000 });

const seen = [];
const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const s = await page.evaluate(() => window.CD.state());
  seen.push(`${name}: phase=${s.phase}${s.attractSub ? "/" + s.attractSub : ""} score=${s.score} lives=${s.lives}`);
};
const waitPhase = (p, sub) =>
  page.waitForFunction(
    ([p, sub]) => {
      const s = window.CD.state();
      return s.phase === p && (sub == null || s.attractSub === sub);
    },
    [p, sub],
    { timeout: 30000 }
  );
const pressEntry = async (key) => {
  await page.keyboard.press(key);
  await page.waitForTimeout(100);
};

// --- attract cycle -----------------------------------------------------
await waitPhase("attract", "title");
await page.waitForFunction(() => Math.floor(ticks / 20) % 3 !== 0);
await shot("01-attract-title");
await page.evaluate(() => window.CD.setAttractSub("howto", 480));
await waitPhase("attract", "howto");
await page.waitForFunction(() => {
  const t = ticks % 240;
  return t >= 65 && t < 90;
});
await shot("02-attract-howto");
await page.evaluate(() => window.CD.setAttractSub("demo", 1080));
await waitPhase("attract", "demo");
await page.waitForTimeout(1200);
await shot("03-attract-demo");

// --- game --------------------------------------------------------------
await page.evaluate(() => window.CD.startGame());
await waitPhase("ready");
await page.evaluate(() => window.CD.setLives(5));
await page.waitForTimeout(150);
await shot("04-ready");

await page.evaluate(() => window.CD.setPhaseTimer(1));
await waitPhase("play");
await page.evaluate(() => window.CD.setAutopilot(true));
await page.waitForTimeout(1200);
await shot("05-play");

// protected chain cash-out
await page.evaluate(() => {
  window.CD.addArmed(80, 78, 0, "player", 90);
  window.CD.beginChainOutAt(600);
});
await waitPhase("chainout");
await page.waitForTimeout(200);
await shot("06-chain-out");

// round clear
await page.evaluate(() => window.CD.setChainOutTimer(1));
await waitPhase("clear");
await page.waitForFunction(() => window.CD.state().clearRoundPaid > 0);
await shot("07-clear-round-tally");
await page.waitForFunction(
  () =>
    window.CD.state().clearRoundPaid === window.CD.state().clearBonus &&
    window.CD.state().clearTimePaid > 0
);
await shot("08-clear-time-tally");

// miss (lives remaining)
await page.evaluate(() => window.CD.setPhaseTimer(1));
await waitPhase("ready");
await page.evaluate(() => window.CD.setPhaseTimer(1));
await waitPhase("play");
await page.evaluate(() => {
  window.CD.setAutopilot(false);
  window.CD.setLives(6);
  window.CD.clearMines();
  window.CD.playerPos(80, 78);
  window.CD.setInvuln(0);
  window.CD.addArmed(78.6, 78, 0, "player", 0);
});
await waitPhase("death");
await page.waitForTimeout(200);
await shot("09-death");

// game over -> entry -> table
await page.evaluate(() => window.CD.setPhaseTimer(1));
await waitPhase("play");
await page.evaluate(() => {
  window.CD.setAutopilot(false);
  window.CD.setScore(41234);
  window.CD.setLives(1);
  window.CD.clearMines();
  window.CD.playerPos(80, 78);
  window.CD.setInvuln(0);
  window.CD.addBlast(70, 78, "overload", 5);
});
await waitPhase("gameover");
await page.waitForTimeout(200);
await shot("10-gameover");

await page.evaluate(() => window.CD.setPhaseTimer(1));
await waitPhase("entry");
await page.waitForTimeout(400);
await pressEntry("Space");
await pressEntry("ArrowRight");
await pressEntry("ArrowRight");
await page.waitForTimeout(300);
await shot("11-entry");

await pressEntry("ArrowUp");
await pressEntry("ArrowLeft");
await pressEntry("ArrowLeft");
await pressEntry("ArrowLeft");
await pressEntry("Space");
await waitPhase("table");
await page.waitForTimeout(250);
await shot("12-table");

// --- back to attract: the cycle must close ------------------------------
await page.evaluate(() => window.CD.setPhaseTimer(1));
await waitPhase("attract", "title");
await page.waitForTimeout(200);
await shot("13-attract-again");

// --- fixed endpoint -----------------------------------------------------
await page.evaluate(() => {
  const CD = window.CD;
  CD.startGame();
  CD.setRound(18);
  CD.setScore(50000);
  CD.setLives(5);
  CD.setNextExtend(9e9);
  CD.enterClearAt(0);
  CD.setPhaseTimer(1);
});
await waitPhase("allclear");
await page.waitForTimeout(150);
await shot("14-all-clear");
await page.waitForFunction(() => window.CD.state().lifeBonusPaid === 5000, {
  timeout: 3000,
});
await page.evaluate(() => window.CD.setPhaseTimer(90));
await page.waitForTimeout(100);
await shot("15-all-clear-life-bonus");
await page.evaluate(() => window.CD.setPhaseTimer(1));
await waitPhase("entry");
await page.waitForTimeout(250);
await shot("16-clear-entry-preview");

const st = await page.evaluate(() => window.CD.state());
console.log(seen.join("\n"));
console.log("\nhi table after entry:", JSON.stringify(st.hiScores));
console.log("errors:", errors.length ? [...new Set(errors)] : "none");
await browser.close();
