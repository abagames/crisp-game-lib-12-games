// Organic-play scavenger release measurement. Repeats one selected round under
// the attract policy and reports how much released payload detonated in place.
import { chromium } from "playwright";

const URL = process.argv[2] || "http://localhost:8231/index.html";
const SECONDS = Number(process.argv[3] || 90);
const ROUNDS = (process.argv[4] || "4,6,8").split(",").map(Number);
const EAT_CAPS = (process.argv[5] || "4").split(",").map(Number);
const LODE_OVERRIDE =
  process.argv[6] == null ? null : Number(process.argv[6]);

const browser = await chromium.launch();

async function run(round, eatCap) {
  const page = await browser.newPage({ viewport: { width: 480, height: 480 } });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForFunction(() => window.CD?.state().phase === "attract", {
    timeout: 10000,
  });
  await page.evaluate(([r, cap, lodeOverride]) => {
    window.CD.setAutopilot(true);
    window.CD.setScavEatCap(cap);
    window.CD.setRound(r);
    if (lodeOverride === 0) window.CD.clearLodestones();
    window.CD.setPhase("play", 0);
    window.CD.clearScavReleases();
  }, [round, eatCap, LODE_OVERRIDE]);

  const deadline = Date.now() + SECONDS * 1000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(250);
    const state = await page.evaluate(() => window.CD.state());
    if (
      state.round !== round ||
      !["play", "chainout"].includes(state.phase)
    ) {
      await page.evaluate(([r, lodeOverride]) => {
        window.CD.setRound(r);
        if (lodeOverride === 0) window.CD.clearLodestones();
        window.CD.setPhase("play", 0);
      }, [round, LODE_OVERRIDE]);
    }
  }

  const releases = await page.evaluate(() => window.CD.scavReleases());
  const state = await page.evaluate(() => window.CD.state());
  const overloads = await page.evaluate(
    () => window.CD.audioEvents().filter((e) => e.id === "jingle:overload").length
  );
  await page.screenshot({
    path: `shots/scav-round-${round}-cap-${eatCap}.png`,
  });
  await page.close();
  const detonations = releases.flatMap((r) => r.detonations);
  const zeroTravel = detonations.filter((d) => d.distance <= 0.1).length;
  return {
    round,
    eatCap,
    lodestones: state.lodestones,
    score: state.score,
    overloads,
    releases: releases.length,
    payload: releases.reduce((n, r) => n + r.payload, 0),
    detonated: detonations.length,
    zeroTravel,
    nearest: releases
      .map((r) => r.nearestScav)
      .filter((v) => v != null),
    errors: [...new Set(errors)],
  };
}

const results = await Promise.all(
  EAT_CAPS.flatMap((cap) => ROUNDS.map((round) => run(round, cap)))
);
for (const r of results) {
  const rate = r.detonated ? r.zeroTravel / r.detonated : 0;
  const close = r.nearest.filter((d) => d < 10).length;
  console.log(
    `cap=${r.eatCap} R${r.round} lode=${r.lodestones}: score=${r.score} overloads=${r.overloads} ` +
      `releases=${r.releases} payload=${r.payload} ` +
      `detonated=${r.detonated} zeroTravel=${r.zeroTravel} ` +
      `(${(rate * 100).toFixed(1)}%) closeRelease=${close}/${r.releases} ` +
      `errors=${r.errors.length}`
  );
  for (const e of r.errors) console.log(`  ! ${e}`);
}

await browser.close();
