// Reproduction: does shoving a mine while still holding the direction key kill
// the shover? Player 1.05 px/f, ARM_FUSE 10 f stationary, shove reach 8 px --
// on paper the player walks into their own mine before it launches.
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/");
const { chromium } = require("playwright");

const url = process.argv[2] || "http://localhost:8231/index.html";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 480, height: 500 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: "load" });
await page.waitForFunction(() => window.CD != null);
await page.waitForFunction(() => window.CD.state().phase === "attract");

async function scenario(name, setup, holdMs) {
  await page.evaluate(() => {
    window.CD.setAutopilot(false);
    window.CD.startGame();
    window.CD.setPhase("play", 0);
    window.CD.parkSpawner();
    window.CD.clearMines();
    window.CD.setLives(9);
    window.CD.setInvuln(0);
    window.CD.setQuotaLeft(999);
    window.CD.clearDeaths();
  });
  await page.waitForTimeout(120);
  await page.evaluate(setup);
  await page.waitForTimeout(80);
  const before = (await page.evaluate(() => window.CD.state())).lives;
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(120);
  await page.keyboard.press("Space");
  await page.waitForTimeout(holdMs);
  await page.keyboard.up("ArrowRight");
  await page.waitForTimeout(120);
  const s = await page.evaluate(() => window.CD.state());
  const d = await page.evaluate(() => window.CD.deaths());
  const last = d[d.length - 1];
  const died = before - s.lives;
  console.log(
    `${died > 0 ? "DIED  " : "SAFE  "} ${name}: lives ${before} -> ${s.lives}` +
      (died > 0 && last
        ? `  cause=${last.cause} framesAfterShove=${last.sinceShove}`
        : "")
  );
  return died;
}

let deaths = 0;
for (let i = 0; i < 5; i++) {
  deaths += await scenario(
    `hold-through shove #${i + 1}`,
    () => {
      window.CD.playerPos(70, 78);
      window.CD.addInert(1, 77, 78);
      window.CD.face(1, 0);
    },
    900
  );
}
console.log(`\nhold-through deaths: ${deaths}/5`);

let blastDeaths = 0;
for (let i = 0; i < 5; i++) {
  blastDeaths += await scenario(
    `shove into adjacent pack #${i + 1}`,
    () => {
      window.CD.playerPos(70, 78);
      window.CD.addInert(1, 77, 78);
      window.CD.addInert(1, 88, 78);
      window.CD.addInert(1, 92, 84);
      window.CD.face(1, 0);
    },
    900
  );
}
console.log(`point-blank chain deaths: ${blastDeaths}/5`);
console.log("errors:", errors.length ? [...new Set(errors)] : "none");
await browser.close();
