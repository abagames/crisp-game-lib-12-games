// Ad-hoc runtime inspector: loads the game, samples CD.state() over time and
// captures screenshots. Used to confirm the attract bot actually plays.
import { chromium } from "playwright";

const URL = process.argv[2] || "http://localhost:8231/index.html";
const OUT = process.argv[3] || "shots";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 640, height: 640 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: "load" });
await page.waitForFunction(() => window.CD != null, { timeout: 10000 });

const samples = [];
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(1500);
  samples.push(await page.evaluate(() => window.CD.state()));
}
console.log("=== attract samples ===");
for (const s of samples) {
  console.log(
    `phase=${s.phase}/${s.attractSub} bot=${s.botMode} R${s.round} ${s.roundName} ` +
      `score=${s.score} quotaLeft=${s.quotaLeft}/${s.quota} mines=${s.mines}(i${s.inert}/a${s.armed}) ` +
      `blasts=${s.blasts} scav=${s.scavs} mult=${s.mult} ovl=${s.overloadTimer}`
  );
}
await page.screenshot({ path: `${OUT}/attract.png` });

console.log("errors:", errors.length ? errors : "none");
await browser.close();
