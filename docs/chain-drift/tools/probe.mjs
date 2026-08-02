// Spec-conformance probes for CHAIN DRIFT. Each scenario injects the minimal
// state, parks every confounder (spawner, other mines, death), lets frames
// settle, and asserts a concrete value from docs/chain-drift-spec.md.
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/");
const { chromium } = require("playwright");

const url = process.argv[2] || "http://localhost:8231/index.html";
const errors = [];
const failures = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 500, height: 520 } });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text());
});
// The cabinet has to boot from what it ships with. Collected across every
// navigation this probe makes, asserted at the end.
const origin = new URL(url).origin;
const offOrigin = new Set();
page.on("request", (r) => {
  if (!r.url().startsWith(origin) && !r.url().startsWith("data:")) {
    offOrigin.add(new URL(r.url()).origin);
  }
});

const check = (name, actual, expected) => {
  const ok =
    typeof expected === "function"
      ? expected(actual)
      : JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(actual)}`);
  if (!ok) failures.push(name);
};
const st = () => page.evaluate(() => window.CD.state());
const wait = (ms) => page.waitForTimeout(ms);

await page.goto(url, { waitUntil: "load" });
await page.waitForFunction(() => window.CD != null, { timeout: 10000 });
await page.waitForFunction(() => window.CD.state().phase === "attract", { timeout: 10000 });

console.log("\n--- visual contract: ordered HUD and restrained persistent palette ---");
const visual = await page.evaluate(() => window.CD.visualContract());
check("persistent palette assigns one base color per gameplay role", visual.palette, {
  player: "cyan",
  inert: "blue",
  playerDanger: "red",
  fieldDanger: "purple",
  reward: "yellow",
  structure: "blue",
  neutral: "light_black",
});
check("light colors are limited to neutral grey and transient chain accent", {
  persistent: visual.persistentLightException,
  transient: visual.transientLightAccent,
}, { persistent: "light_black", transient: "light_yellow" });
check("HUD readouts occupy one fixed two-row cabinet strip", {
  row1Y: visual.hud.row1Y,
  row2Y: visual.hud.row2Y,
  roundFieldLabelY: visual.hud.roundFieldLabelY,
  fieldGauge: [
    visual.hud.fieldGaugeX,
    visual.hud.fieldGaugeW,
  ],
  multiplierRight: visual.hud.multRight,
  time: [
    visual.hud.timeRight,
    visual.hud.timeGaugeX,
    visual.hud.timeGaugeW,
  ],
  livesRight: visual.hud.livesRight,
  lifeCount: [visual.hud.lifeCountIconX, visual.hud.lifeCountTextX],
  livesShown: visual.livesShown,
}, {
  row1Y: 2,
  row2Y: 9,
  roundFieldLabelY: 10,
  fieldGauge: [31, 38],
  multiplierRight: 87,
  time: [116, 91, 25],
  livesRight: 152,
  lifeCount: [144, 149],
  livesShown: 4,
});
check(
  "life HUD uses individual glyphs through four, then one glyph plus the total",
  await page.evaluate(() => [4, 5, 9].map((n) => window.CD.lifeDisplay(n))),
  [
    { mode: "icons", icons: 4, label: "" },
    { mode: "total", icons: 1, label: "5" },
    { mode: "total", icons: 1, label: "9" },
  ]
);
check(
  "one continuous round counter names the fixed run progress",
  await page.evaluate(() => window.CD.roundLabels(10)),
  { full: "ROUND 10", hud: "R10" }
);
check("title logo uses the specified native arcade asset contract", visual.titleLogo, {
  src: "./assets/sprites/chain-drift-logo.png",
  char: "a",
  width: 128,
  height: 24,
  centerX: 80,
  centerY: 31,
  opaqueColors: 4,
});
check(
  "player-facing copy calls the action PUSH and the start prompt PRESS SPACE",
  visual.copy,
  { playerAction: "PUSH", startPrompt: "PRESS SPACE", fieldLoadLabel: "FL" }
);
check("capacitor visual contract exposes its exact danger timing and footprint", visual.capacitor, {
  radius: 5,
  delay: 60,
  blastRadius: 24,
  blastLife: 18,
  intakeRadius: 24,
  pullArmed: 0.25,
  armedBudget: 6,
  cooldown: 60,
  gatherRadius: 39,
  gatherPull: 0.25,
  coreRadius: 12,
});
check(
  "the drawn diamond is one radius for intake, pull and discharge alike",
  visual.capacitor.intakeRadius === visual.capacitor.blastRadius,
  true
);
check(
  "the gather boundary is exactly what a mine can cross in the delay it has",
  visual.capacitor.gatherRadius,
  visual.capacitor.intakeRadius +
    visual.capacitor.gatherPull * visual.capacitor.delay
);
check(
  "and it reaches past the discharge, or gathering would change nothing",
  visual.capacitor.gatherRadius > visual.capacitor.blastRadius,
  true
);
check(
  "title logo PNG loads at its specified native dimensions",
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const image = new Image();
        image.onload = () =>
          resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => resolve({ width: 0, height: 0 });
        image.src = window.CD.visualContract().titleLogo.src;
      })
  ),
  { width: 128, height: 24 }
);

console.log("\n--- sound kit: wired, and owned by tools/audio.mjs ---");
// The audio contract -- profile, budgets, voice arbitration, BGM sections,
// rendered output, the demo gate -- is asserted in `npm run audio`, which owns
// it in one place. What belongs here is the one fact this file's scenarios
// depend on: the kit the rest of the game emits into is present and complete.
const audioKit = await page.evaluate(() => window.CD.audioKit());
const audioRegistry = await page.evaluate(() => window.CD.audioEventRegistry());
check("sound kit defines 23 semantic programs", Object.keys(audioKit).length, 23);
check(
  "every program is a declared event and every audible event has a program",
  {
    undeclared: Object.keys(audioKit).filter((id) => audioRegistry[id] == null),
    unimplemented: Object.entries(audioRegistry)
      .filter(([n, r]) => r.role !== "none" && r.role !== "bgm" && audioKit[n] == null)
      .map(([n]) => n),
  },
  { undeclared: [], unimplemented: [] }
);

// Fresh, deterministic playfield: a real game, spawner parked, field empty,
// player parked in a corner and invulnerable so nothing interrupts a probe.
async function arena(opts = {}) {
  await page.evaluate((o) => {
    const CD = window.CD;
    CD.setAutopilot(false);
    CD.startGame();
    if (o.round != null) CD.setRound(o.round);
    CD.setPhase("play", 0);
    CD.parkSpawner();
    CD.clearMines();
    CD.setLives(o.lives == null ? 3 : o.lives);
    CD.setScore(o.score == null ? 0 : o.score);
    CD.setMult(o.mult == null ? 1 : o.mult);
    CD.setChainTimer(0);
    CD.setQuotaLeft(o.quotaLeft == null ? 999 : o.quotaLeft);
    CD.setNextExtend(o.nextExtend == null ? 9e9 : o.nextExtend);
    CD.playerPos(20, 130);
    CD.setInvuln(o.invuln == null ? 99999 : o.invuln);
    if (o.cap != null) CD.setCap(o.cap);
  }, opts);
  await wait(120);
}

await arena({ mult: 32, lives: 9 });
await page.screenshot({ path: "shots/hud-max-registers.png" });

console.log("\n--- causality: only a player-authored chain carries the multiplier ---");

// A lone armed mine sent at the right wall detonates exactly once.
await arena({ mult: 1, quotaLeft: 999 });
let s0 = await st();
await page.evaluate(() => window.CD.addArmed(140, 80, 0, "player", 0));
await wait(400);
let s1 = await st();
check("player detonation scores 50 x mult1", s1.score - s0.score, 50);
check("player detonation raises mult to 2", s1.mult, 2);
check("player detonation counts toward quota", s0.quotaLeft - s1.quotaLeft, 1);

await arena({ mult: 5 });
s0 = await st();
await page.evaluate(() => window.CD.addArmed(140, 80, 0, "player", 0));
await wait(400);
s1 = await st();
check("player detonation at mult5 scores 250", s1.score - s0.score, 250);
check("player detonation at mult5 raises mult to 6", s1.mult, 6);

await arena({ mult: 5 });
s0 = await st();
await page.evaluate(() => window.CD.addArmed(140, 80, 0, "overload", 0));
await wait(400);
s1 = await st();
check("overload detonation scores flat 50 even at mult5", s1.score - s0.score, 50);
check("overload detonation leaves mult unchanged", s1.mult, 5);
check("overload detonation still counts toward quota", s0.quotaLeft - s1.quotaLeft, 1);

await arena({ round: 10, mult: 5 });
s0 = await st();
await page.evaluate(() => window.CD.addArmed(140, 80, 0, "player", 0));
await wait(400);
s1 = await st();
check("R10 player detonation keeps the exact 50 x mult5 score", s1.score - s0.score, 250);
await page.screenshot({ path: "shots/r10-fixed-score-values.png" });

await arena({ round: 10, mult: 3 });
s0 = await st();
await page.evaluate(() => {
  window.CD.clearScavs();
  window.CD.addScav(80, 70);
  window.CD.addBlast(80, 70, "player", 1);
  window.CD.stepBlastsOnce();
});
s1 = await st();
check("R10 player-chain scavenger keeps the exact 200 x mult3 score", s1.score - s0.score, 600);

await arena({ mult: 7 });
await page.evaluate(() => window.CD.addArmed(140, 80, 0, "player", 0));
await page.waitForFunction(() => window.CD.state().chainPulse > 0, { timeout: 2000 });
check("reaching x8 energizes the field frame", (await st()).chainPulse > 0, true);
await page.screenshot({ path: "shots/chain-surge.png" });

console.log("\n--- chain timer decay ---");
await arena({ mult: 1 });
await page.evaluate(() => window.CD.addArmed(140, 80, 0, "player", 0));
await wait(300);
const mid = await st();
check("chain timer armed after a player detonation", mid.chainTimer > 0, true);
await wait(1600); // > 75 frames with no further detonation
const late = await st();
check("mult resets to 1 after the chain timer expires", late.mult, 1);

console.log("\n--- capacitor: one-shot delayed blast relay with preserved cause ---");
await arena({ score: 700, mult: 5, quotaLeft: 12 });
const absorbedPlayer = await page.evaluate(() => {
  const CD = window.CD;
  CD.setPhase("ready", 99999);
  CD.clearMines();
  CD.clearCapacitors();
  CD.addCapacitor(80, 70);
  CD.setChainTimer(70);
  // A detonation 15 px from the plates is inside the 24 px intake, so it is
  // swallowed whole on the first step -- before its 4.08 px ring has armed
  // anything at all.
  CD.addBlast(65, 70, "player", 0);
  CD.stepBlastsOnce();
  return {
    state: CD.state(),
    capacitor: CD.capacitorList()[0],
    blasts: CD.blastList(),
  };
});
check("a detonation inside the intake is consumed and starts the exact 60-frame charge", {
  charge: absorbedPlayer.capacitor.charge,
  src: absorbedPlayer.capacitor.src,
  absorptions: absorbedPlayer.capacitor.absorptions,
  blasts: absorbedPlayer.blasts.length,
}, { charge: 60, src: "player", absorptions: 1, blasts: 0 });
check("absorption itself changes no score, multiplier or quota", {
  score: absorbedPlayer.state.score,
  mult: absorbedPlayer.state.mult,
  quotaLeft: absorbedPlayer.state.quotaLeft,
}, { score: 700, mult: 5, quotaLeft: 12 });
check("storage is spent from the player's own chain window, never refreshed", absorbedPlayer.state.chainTimer, 70);
check("a charged intake is shut to further absorption", {
  intakeOpen: absorbedPlayer.capacitor.intakeOpen,
  cooldown: absorbedPlayer.capacitor.cooldown,
}, { intakeOpen: false, cooldown: 0 });

const preRelease = await page.evaluate(() => {
  for (let i = 0; i < 59; i++) window.CD.stepCapacitorsOnce();
  return {
    capacitor: window.CD.capacitorList()[0],
    blasts: window.CD.blastList(),
  };
});
check("no blast exists with one charge frame remaining", {
  charge: preRelease.capacitor.charge,
  blasts: preRelease.blasts.length,
}, { charge: 1, blasts: 0 });
const releasedPlayer = await page.evaluate(() => {
  window.CD.stepCapacitorsOnce();
  return {
    capacitor: window.CD.capacitorList()[0],
    blast: window.CD.blastList()[0],
  };
});
check("release shuts the intake for a further 60 frames", {
  cooldown: releasedPlayer.capacitor.cooldown,
  intakeOpen: releasedPlayer.capacitor.intakeOpen,
}, { cooldown: 60, intakeOpen: false });
check("release is a one-use player blast with exact larger geometry", {
  charge: releasedPlayer.capacitor.charge,
  releases: releasedPlayer.capacitor.releases,
  lastReleaseSrc: releasedPlayer.capacitor.lastReleaseSrc,
  x: releasedPlayer.blast.x,
  y: releasedPlayer.blast.y,
  r: releasedPlayer.blast.r,
  r1: releasedPlayer.blast.r1,
  life: releasedPlayer.blast.life,
  src: releasedPlayer.blast.src,
  relayed: releasedPlayer.blast.capacitorRelayed,
}, {
  charge: 0,
  releases: 1,
  lastReleaseSrc: "player",
  x: 80,
  y: 70,
  r: 3,
  r1: 24,
  life: 18,
  src: "player",
  relayed: true,
});

const relayResult = await page.evaluate(() => {
  const CD = window.CD;
  // 20 px from the discharge: squarely inside a second, wide-open intake. If
  // the relayed flag were not honoured this capacitor would swallow it.
  CD.addCapacitor(100, 70);
  CD.addInert(1, 103, 70);
  for (let i = 0; i < 18; i++) CD.stepBlastsOnce();
  return {
    sources: CD.mineSrcs(),
    capacitors: CD.capacitorList(),
    blasts: CD.blastList().length,
  };
});
check("the 24 px discharge reaches and arms material beyond an ordinary blast", relayResult.sources, ["player"]);
check("a relayed blast cannot charge a second open intake or loop", {
  secondIntakeOpen: relayResult.capacitors[1].intakeOpen,
  secondAbsorptions: relayResult.capacitors[1].absorptions,
  blasts: relayResult.blasts,
}, { secondIntakeOpen: true, secondAbsorptions: 0, blasts: 0 });

// The cooldown is the hard bound on the relay's duty cycle: the discharge's own
// chain cannot fall back in and restart it, so waiting can never manufacture a
// standing scoring pulse.
const coolingRefusal = await page.evaluate(() => {
  const CD = window.CD;
  CD.clearCapacitors();
  CD.clearMines();
  CD.addCapacitor(80, 70);
  CD.stepCapacitorsOnce(); // open, cooldown 0
  CD.addBlast(80, 70, "player", 0);
  CD.stepBlastsOnce();
  const cooled = [];
  for (let i = 0; i < 60; i++) CD.stepCapacitorsOnce();
  cooled.push(CD.capacitorList()[0].cooldown); // 60 charge frames -> release
  for (let i = 0; i < 59; i++) CD.stepCapacitorsOnce();
  CD.clearMines(); // also drops the discharge, so only the probe blast is live
  CD.addBlast(80, 70, "player", 0);
  CD.stepBlastsOnce();
  const refused = CD.capacitorList()[0];
  return { cooled, refusedAbsorptions: refused.absorptions, cooldown: refused.cooldown };
});
check("an ordinary blast inside a recovering intake is refused", {
  cooldownAfterRelease: coolingRefusal.cooled[0],
  absorptions: coolingRefusal.refusedAbsorptions,
  cooldown: coolingRefusal.cooldown,
}, { cooldownAfterRelease: 60, absorptions: 1, cooldown: 1 });
const reopened = await page.evaluate(() => {
  const CD = window.CD;
  CD.stepCapacitorsOnce(); // cooldown 1 -> 0
  const open = CD.capacitorList()[0].intakeOpen;
  CD.clearMines();
  CD.addBlast(80, 70, "player", 0);
  CD.stepBlastsOnce();
  return { open, capacitor: CD.capacitorList()[0] };
});
check("the intake reopens on the frame the cooldown ends", {
  open: reopened.open,
  absorptions: reopened.capacitor.absorptions,
  charge: reopened.capacitor.charge,
}, { open: true, absorptions: 2, charge: 60 });

console.log("\n--- capacitor intake: an exact drawn boundary, and a budgeted pull ---");
const boundary = await page.evaluate(() => {
  const CD = window.CD;
  CD.clearCapacitors();
  CD.clearMines();
  CD.addCapacitor(80, 70);
  CD.addBlast(80 + 24, 70, "player", 0);
  CD.stepBlastsOnce();
  const at24 = CD.capacitorList()[0].charge;
  CD.clearCapacitors();
  CD.addCapacitor(80, 70);
  // 25 px out: outside the diamond, and it stays outside no matter how wide the
  // ring grows, because the intake takes what detonates in it rather than what
  // expands over it.
  CD.addBlast(80 + 25, 70, "player", 0);
  for (let i = 0; i < 12; i++) CD.stepBlastsOnce();
  const c = CD.capacitorList()[0];
  return { at24, at25: c.charge, absorptions25: c.absorptions };
});
check("a detonation exactly on the drawn intake boundary is swallowed", boundary.at24, 60);
check("a detonation one pixel outside is never swallowed, at any ring size", {
  charge: boundary.at25,
  absorptions: boundary.absorptions25,
}, { charge: 0, absorptions: 0 });

const pull = await page.evaluate(() => {
  const CD = window.CD;
  CD.clearCapacitors();
  CD.clearMines();
  CD.addCapacitor(80, 70);
  CD.addInert(1, 80, 90); // 20 px out: inside the intake, and irrelevant to it
  const live = CD.addArmed(100, 70, 0, "player", 0); // 20 px out, in flight
  const samples = [];
  for (let i = 0; i < 40; i++) {
    CD.pullCapacitorsOnce();
    samples.push(CD.mineList());
  }
  const last = samples[samples.length - 1];
  const armedRow = last.find((m) => m.armed);
  const inertRow = last.find((m) => !m.armed);
  return {
    startX: 100,
    endX: armedRow.x,
    budget: armedRow.capBudget,
    inert: [inertRow.x, inertRow.y],
    inertBudget: inertRow.capBudget,
    pulling: CD.capacitorList()[0].pulling,
    live: live != null,
  };
});
check("a live link inside the intake is drawn in by exactly its 6 px budget", {
  moved: +(pull.startX - pull.endX).toFixed(2),
  budget: pull.budget,
}, { moved: 6, budget: 0 });
check("a spent budget makes capture impossible: the pull stops for good", pull.pulling, 0);
check("inert material is untouched -- rearranging the field is the lodestone's job", {
  pos: pull.inert,
  budget: pull.inertBudget,
}, { pos: [80, 90], budget: null });

const fusePull = await page.evaluate(() => {
  const CD = window.CD;
  CD.clearMines();
  CD.addArmed(100, 70, 0, "player", 30); // still on its fuse
  for (let i = 0; i < 10; i++) CD.pullCapacitorsOnce();
  const m = CD.mineList()[0];
  return { x: m.x, budget: m.capBudget };
});
check("a mine still on its fuse is not pulled: the stationary tell survives", fusePull, {
  x: 100,
  budget: 6,
});

console.log("\n--- capacitor loading: the delay gathers the shot it is about to fire ---");
const idleGather = await page.evaluate(() => {
  const CD = window.CD;
  CD.clearCapacitors();
  CD.clearMines();
  CD.addCapacitor(80, 70);
  CD.addInert(1, 80 + 30, 70);
  for (let i = 0; i < 60; i++) CD.pullCapacitorsOnce();
  return { x: CD.mineList()[0].x, gathering: CD.capacitorList()[0].gathering };
});
check("an open capacitor never gathers: it is not a standing field", idleGather, {
  x: 110,
  gathering: 0,
});

const loading = await page.evaluate(() => {
  const CD = window.CD;
  CD.clearCapacitors();
  CD.clearMines();
  CD.addCapacitor(80, 70);
  CD.addInert(1, 80 + 39, 70); // exactly on the gather boundary
  CD.addInert(1, 80 + 45, 70); // outside it
  const held = CD.addArmed(80 + 20, 70, 0, "player", 0); // live, inside the intake
  CD.addBlast(80, 70, "player", 0);
  CD.stepBlastsOnce(); // absorbed -> charge 60
  const inertAtStart = CD.state().inert;
  let gatheringPeak = 0;
  for (let i = 0; i < 60; i++) {
    CD.pullCapacitorsOnce();
    gatheringPeak = Math.max(gatheringPeak, CD.capacitorList()[0].gathering);
    CD.stepCapacitorsOnce();
  }
  const rows = CD.mineList();
  return {
    onBoundary: rows[0].x,
    outside: rows[1].x,
    liveX: rows[2].x,
    liveBudget: rows[2].capBudget,
    gatheringPeak,
    inertAtStart,
    inertNow: CD.state().inert,
    releases: CD.capacitorList()[0].releases,
    held: held != null,
  };
});
check("a mine on the gather boundary arrives exactly inside the discharge", {
  from: 119,
  to: loading.onBoundary,
  discharged: loading.releases,
}, { from: 119, to: 104, discharged: 1 });
check("a mine outside the boundary is never touched", loading.outside, 125);
check("gathering never touches live ordnance, and a shut intake stops the pull", {
  x: loading.liveX,
  budget: loading.liveBudget,
}, { x: 100, budget: 6 });
check("gathering relocates material without changing the count FIELD LOAD reads", {
  before: loading.inertAtStart,
  after: loading.inertNow,
  peak: loading.gatheringPeak > 0,
}, { before: 2, after: 2, peak: true });

const gathered = await page.evaluate(() => {
  const CD = window.CD;
  for (let i = 0; i < 18; i++) CD.stepBlastsOnce();
  return CD.mineSrcs();
});
// Two rows survive: the gathered mine and the one outside the boundary. The
// live link that was sitting in the intake is detonated by the discharge, which
// is the ordinary blast rule and why it is no longer in the list.
check(
  "the discharge arms what it gathered and nothing beyond the boundary",
  gathered,
  ["player", "inert"]
);

const overloadGather = await page.evaluate(() => {
  const CD = window.CD;
  CD.clearCapacitors();
  CD.clearMines();
  CD.addCapacitor(80, 70);
  CD.addInert(1, 80 + 30, 70);
  CD.addBlast(80, 70, "overload", 0);
  CD.stepBlastsOnce();
  const charge = CD.capacitorList()[0].charge;
  for (let i = 0; i < 60; i++) {
    CD.pullCapacitorsOnce();
    CD.stepCapacitorsOnce();
  }
  const c = CD.capacitorList()[0];
  return { charge, x: CD.mineList()[0].x, gathering: c.gathering, releases: c.releases };
});
check(
  "a field-caused charge still returns its wider blast but gathers nothing",
  overloadGather,
  { charge: 60, x: 110, gathering: 0, releases: 1 }
);
// The drawn outer boundary and the gather rule read one predicate, so a
// boundary can never promise a gather that is not coming.
const loadingFlag = await page.evaluate(() => {
  const CD = window.CD;
  const sample = (src) => {
    CD.clearCapacitors();
    CD.clearMines();
    CD.addCapacitor(80, 70);
    CD.addBlast(80, 70, src, 0);
    CD.stepBlastsOnce();
    const c = CD.capacitorList()[0];
    return { charge: c.charge, loading: c.loading, state: CD.state().loadingCapacitors };
  };
  return { player: sample("player"), overload: sample("overload") };
});
check(
  "only a player-caused charge counts as loading, and only it draws the boundary",
  loadingFlag,
  {
    player: { charge: 60, loading: true, state: 1 },
    overload: { charge: 60, loading: false, state: 0 },
  }
);

const frozenGather = await page.evaluate(() => {
  const CD = window.CD;
  CD.clearCapacitors();
  CD.clearMines();
  CD.addCapacitor(80, 70);
  CD.addInert(1, 80 + 30, 70);
  CD.addBlast(80, 70, "player", 0);
  CD.stepBlastsOnce();
  for (let i = 0; i < 20; i++) CD.pullCapacitorsOnce(false);
  return { x: CD.mineList()[0].x, gathering: CD.capacitorList()[0].gathering };
});
check("the protected cash-out counts gathered material but never moves it", frozenGather, {
  x: 110,
  gathering: 1,
});

await arena({ score: 300, mult: 7, quotaLeft: 9 });
const absorbedOverload = await page.evaluate(() => {
  const CD = window.CD;
  CD.setPhase("ready", 99999);
  CD.clearMines();
  CD.clearCapacitors();
  CD.setChainTimer(0);
  CD.addCapacitor(80, 70);
  CD.addBlast(65, 70, "overload", 6);
  CD.stepBlastsOnce();
  for (let i = 0; i < 60; i++) CD.stepCapacitorsOnce();
  return {
    state: CD.state(),
    capacitor: CD.capacitorList()[0],
    blast: CD.blastList()[0],
  };
});
check("overload cause survives absorption and release without refreshing reward state", {
  src: absorbedOverload.blast.src,
  relayed: absorbedOverload.blast.capacitorRelayed,
  mult: absorbedOverload.state.mult,
  chainTimer: absorbedOverload.state.chainTimer,
  score: absorbedOverload.state.score,
  quotaLeft: absorbedOverload.state.quotaLeft,
}, {
  src: "overload",
  relayed: true,
  mult: 7,
  chainTimer: 0,
  score: 300,
  quotaLeft: 9,
});

await page.evaluate(() => {
  const CD = window.CD;
  CD.setRound(3);
  CD.setPhase("ready", 99999);
});
await wait(80);
await page.screenshot({ path: "shots/capacitor-ready.png" });
await page.evaluate(() => {
  const CD = window.CD;
  CD.setPhase("play", 0);
  CD.parkSpawner();
  CD.clearMines();
  CD.setInvuln(99999);
  CD.playerPos(20, 130);
});
await wait(80);
await page.screenshot({ path: "shots/capacitor-field.png" });
// Open intake bending a live link: the diamond takes that link's hazard colour
// while the cells stay empty, so "pulling" can never be read as "charging".
await page.evaluate(() => {
  const CD = window.CD;
  const c = CD.capacitorList()[0];
  CD.addArmed(c.x + 18, c.y, Math.PI, "player", 0);
});
await page.waitForFunction(() => window.CD.state().pullingCapacitors === 1, {
  timeout: 3000,
});
await page.screenshot({ path: "shots/capacitor-pulling.png" });
const pullingLive = await st();
check("the pulling readout is live during play, not only in a probe step", {
  pulling: pullingLive.pullingCapacitors,
  charged: pullingLive.chargedCapacitors,
}, { pulling: 1, charged: 0 });
await page.evaluate(() => window.CD.clearMines());
// Seed the annulus between the discharge footprint and the gather boundary, so
// the charged screenshot shows the rule that matters: material outside the
// blast being drawn into it while the cells fill.
await page.evaluate(() => {
  const CD = window.CD;
  const c = CD.capacitorList()[0];
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8 + 0.2;
    CD.addInert(1, c.x + Math.cos(a) * 33, c.y + Math.sin(a) * 33);
  }
  CD.addBlast(c.x - 15, c.y, "player", 6);
});
await page.waitForFunction(() => window.CD.state().chargedCapacitors === 1);
await wait(400);
await page.screenshot({ path: "shots/capacitor-charged.png" });
check("the charged screenshot really is loading material, not just counting down", {
  gathering: (await st()).gatheringCapacitors,
  charged: (await st()).chargedCapacitors,
}, { gathering: 1, charged: 1 });
await page.waitForFunction(
  () => window.CD.blastList().some((b) => b.capacitorRelayed),
  { timeout: 3000 }
);
await page.screenshot({ path: "shots/capacitor-release.png" });
// Recovering: intake shut, cells draining in the actor's own structure colour.
await page.waitForFunction(() => window.CD.state().coolingCapacitors === 1, {
  timeout: 3000,
});
// Let the 18-frame discharge and its particles clear first, or the screenshot
// shows the explosion rather than the state it is meant to prove.
await wait(350);
await page.screenshot({ path: "shots/capacitor-cooling.png" });
check(
  "the recovering state is still on screen once the discharge itself has finished",
  await page.evaluate(() => {
    const c = window.CD.capacitorList()[0];
    return {
      cooling: c.cooldown > 0,
      open: c.intakeOpen,
      // The chain the discharge started may well still be running -- that is the
      // point of it. What must be gone is the 18-frame discharge ring itself.
      relayedRings: window.CD.blastList().filter((b) => b.capacitorRelayed).length,
    };
  }),
  { cooling: true, open: false, relayedRings: 0 }
);

await page.evaluate(() => {
  window.CD.setRound(3);
  window.CD.clearMines();
});


console.log("\n--- overload: inert > cap for 60 frames arms the whole field ---");
await arena({ cap: 4 });
// Spread the mines out: stacking them makes them annihilate each other the
// instant they arm, which reads as an empty field and tests nothing.
await page.evaluate(() => {
  window.CD.setCap(4);
  const spots = [
    [30, 40],
    [70, 40],
    [110, 40],
    [30, 110],
    [70, 110],
    [110, 110],
  ];
  for (const [x, y] of spots) window.CD.addInert(1, x, y);
});
await wait(400);
const preOvl = await st();
check("overload timer counting while inert(6) > cap(4)", preOvl.overloadTimer > 0, true);
check("field still inert before the 60-frame delay", preOvl.inert, 6);
// Sample at the first frame the field is armed, before the mines start
// detonating each other.
await page.waitForFunction(() => window.CD.state().armed > 0, { timeout: 4000 });
const postOvl = await page.evaluate(() => window.CD.mineSrcs());
check(
  "every armed mine carries src=overload",
  postOvl.filter((s) => s !== "inert"),
  (a) => a.length > 0 && a.every((s) => s === "overload")
);
await page.screenshot({ path: "shots/overload-palette.png" });

// The trigger is crowding, not elapsed time, and the comparison is strictly
// greater than the cap -- sitting exactly at the cap is safe forever.
await arena({ cap: 6 });
await page.evaluate(() => {
  window.CD.setCap(6);
  const spots = [[30, 40], [60, 40], [90, 40], [30, 110], [60, 110], [90, 110]];
  for (const [x, y] of spots) window.CD.addInert(1, x, y);
});
await wait(1600); // far longer than the 60-frame delay
const atCap = await st();
check("inert exactly at cap never starts the overload timer", atCap.overloadTimer, 0);
check("and the field is still inert after 1.6 s", atCap.inert, 6);
await page.evaluate(() => window.CD.addInert(1, 120, 75));
await wait(300);
check("one mine over the cap starts the timer", (await st()).overloadTimer > 0, true);

console.log("\n--- quota during OVERLOAD: survive committed purple ordnance first ---");

await arena({ score: 0, quotaLeft: 1, lives: 3, mult: 1, invuln: 0 });
await page.evaluate(() => {
  const CD = window.CD;
  CD.clearMines();
  CD.clearCapacitors();
  CD.clearScavs();
  CD.clearLodestones();
  CD.playerPos(20, 130);
  CD.addArmed(130, 40, 0, "overload", 90);
  CD.addArmed(140, 80, 0, "player", 0);
});
await page.waitForFunction(
  () => window.CD.state().waitingForOverload,
  { timeout: 2000 }
);
const settling0 = await st();
check("quota hit stays in vulnerable play while purple ordnance remains", {
  phase: settling0.phase,
  quotaLeft: settling0.quotaLeft,
  waiting: settling0.waitingForOverload,
  overloadArmed: settling0.overloadArmed,
  canShove: settling0.canShove,
  invuln: settling0.invuln,
}, {
  phase: "play",
  quotaLeft: 0,
  waiting: true,
  overloadArmed: 1,
  canShove: true,
  invuln: 0,
});
check("the quota detonation has paid exact player x1 score", settling0.score, 50);
const settlingFrames = settling0.roundFrames;
const settlingMines = settling0.mines;
await page.evaluate(() => {
  const CD = window.CD;
  CD.setSpawner(1, 0);
  CD.setOverloadTimer(55);
});
await wait(250);
const settling1 = await st();
check("settlement suppresses spawning and a second OVERLOAD", {
  mines: settling1.mines,
  overloadTimer: settling1.overloadTimer,
}, {
  mines: settlingMines,
  overloadTimer: 0,
});
check("round clock keeps advancing during OVERLOAD settlement", settling1.roundFrames > settlingFrames, true);
await page.screenshot({ path: "shots/overload-settlement.png" });
await page.waitForFunction(
  () => window.CD.state().phase === "clear",
  { timeout: 4000 }
);
const settled = await st();
check("clear waits for the committed purple mine and blast to disappear", {
  phase: settled.phase,
  overloadArmed: settled.overloadArmed,
  overloadBlasts: settled.overloadBlasts,
  waiting: settled.waitingForOverload,
}, {
  phase: "clear",
  overloadArmed: 0,
  overloadBlasts: 0,
  waiting: false,
});
check("the surviving OVERLOAD detonation pays one flat 50", settled.score, 100);

// A purple blast hidden inside a capacitor is still committed ordnance. It
// must discharge and expire before protected cash-out can begin.
await arena({ score: 0, quotaLeft: 1, lives: 3, mult: 1, invuln: 0 });
await page.evaluate(() => {
  const CD = window.CD;
  CD.clearMines();
  CD.clearCapacitors();
  CD.clearScavs();
  CD.clearLodestones();
  CD.playerPos(20, 130);
  CD.addCapacitor(80, 70);
  CD.addBlast(80, 70, "overload", 0);
  CD.stepBlastsOnce();
  CD.setQuotaLeft(0);
});
await page.waitForFunction(
  () => window.CD.state().waitingForOverload,
  { timeout: 2000 }
);
const heldPurple = await st();
check("an overload-authored capacitor charge holds settlement open", {
  phase: heldPurple.phase,
  overloadArmed: heldPurple.overloadArmed,
  overloadBlasts: heldPurple.overloadBlasts,
  overloadChargedCapacitors: heldPurple.overloadChargedCapacitors,
}, {
  phase: "play",
  overloadArmed: 0,
  overloadBlasts: 0,
  overloadChargedCapacitors: 1,
});
await page.waitForFunction(
  () => window.CD.state().phase === "clear",
  { timeout: 3000 }
);
const releasedPurple = await st();
check("clear follows only after stored purple ordnance releases and expires", {
  overloadChargedCapacitors: releasedPurple.overloadChargedCapacitors,
  overloadBlasts: releasedPurple.overloadBlasts,
}, {
  overloadChargedCapacitors: 0,
  overloadBlasts: 0,
});

console.log("\n--- CHAIN OUT: protected authored-chain cash-out ---");

// Control/safety invariant: while one red mine is deliberately held on a long
// fuse, input, autonomous production and purple field ordnance are all locked.
await arena({ score: 0, quotaLeft: 1, lives: 3, mult: 1, invuln: 0 });
await page.evaluate(() => {
  const CD = window.CD;
  CD.clearMines();
  CD.clearCapacitors();
  CD.playerPos(70, 78);
  CD.face(1, 0);
  CD.addCapacitor(80, 40);
  CD.addBlast(65, 40, "player", 6);
  CD.stepBlastsOnce();
  CD.addInert(1, 76, 78);
  CD.addArmed(120, 40, 0, "player", 90);
  CD.addArmed(130, 40, 0, "overload", 90);
  CD.addBlast(130, 100, "overload", 0);
  CD.setOverloadTimer(55);
  CD.beginChainOutAt(600);
});
await wait(100);
const lock0 = await st();
check("CHAIN OUT is a distinct phase", lock0.phase, "chainout");
check("quota clamps at zero", lock0.quotaLeft, 0);
check("only the one red armed mine survives entry", {
  armed: lock0.armed,
  redArmed: lock0.redArmed,
  blasts: lock0.blasts,
}, { armed: 1, redArmed: 1, blasts: 0 });
check("overload timer is cancelled on entry", lock0.overloadTimer, 0);
check("stored capacitor energy is grounded on CHAIN OUT entry", {
  charged: lock0.chargedCapacitors,
  charge: await page.evaluate(() => window.CD.capacitorList()[0].charge),
}, { charged: 0, charge: 0 });
check("SHOVE input is gated off", lock0.canShove, false);
check("player receives at least the 301-frame safety reserve", lock0.invuln >= 301, true);
const lockedPos = { x: lock0.playerX, y: lock0.playerY };
await page.keyboard.down("ArrowRight");
await page.keyboard.press("Space");
await wait(150);
await page.keyboard.up("ArrowRight");
const lock1 = await st();
check("movement input cannot move the protected player", {
  x: lock1.playerX,
  y: lock1.playerY,
}, lockedPos);
check("SHOVE cannot arm the inert mine during safety", await page.evaluate(() => window.CD.mineSrcs()), ["inert", "player"]);
check("round clock remains frozen at 600", lock1.roundFrames, 600);
check("projected TIME BONUS freezes at exact 10-second value", {
  before: lock0.timeBonusNow,
  after: lock1.timeBonusNow,
  maximum: lock1.timeBonusMax,
}, { before: 700, after: 700, maximum: 1200 });
check("no life can be lost during the protected phase", lock1.lives, 3);
check(
  "a committed blast passes a frozen capacitor without charging it",
  await page.evaluate(() => {
    const CD = window.CD;
    CD.addBlast(65, 40, "player", 6);
    CD.stepBlastsOnce();
    return {
      charge: CD.capacitorList()[0].charge,
      redBlasts: CD.state().redBlasts,
    };
  }),
  { charge: 0, redBlasts: 1 }
);
await page.evaluate(() => window.CD.setRoundFrames(1440));
check("projected TIME BONUS bottoms out at zero", (await st()).timeBonusNow, 0);
await page.screenshot({ path: "shots/time-bonus-zero.png" });
await page.evaluate(() => window.CD.setRoundFrames(600));
await page.screenshot({ path: "shots/chain-out.png" });
await page.screenshot({ path: "shots/capacitor-chainout.png" });

// Fail-safe is concrete and observable: a stuck red fuse is extinguished.
await page.evaluate(() => window.CD.setChainOutTimer(1));
await page.waitForFunction(() => window.CD.state().phase === "clear", { timeout: 2000 });
const timedOut = await st();
check("300-frame fail-safe records a timeout", timedOut.chainOutTimedOut, true);
check("fail-safe clears all live ordnance", {
  armed: timedOut.armed,
  blasts: timedOut.blasts,
}, { armed: 0, blasts: 0 });
check("frozen 10-second round clock yields exact par bonus 700", timedOut.parBonus, 700);

// Normal completion: the quota mine's blast claims one inert mine. Both red
// detonations pay (50 at x1, then 100 at x2) before the clear tally starts.
await arena({ score: 0, quotaLeft: 1, lives: 3, mult: 1, invuln: 0 });
const beforeRound = (await st()).round;
await page.evaluate(() => {
  const CD = window.CD;
  CD.clearMines();
  CD.playerPos(20, 130);
  CD.addArmed(140, 80, 0, "player", 0);
  CD.addInert(1, 145, 80);
});
await page.waitForFunction(() => window.CD.state().phase === "chainout", { timeout: 2000 });
const draining = await st();
check("quota hit enters CHAIN OUT before clear", draining.phase, "chainout");
check("round clock has stopped during the drain", draining.roundFrames > 0, true);
const frozenFrames = draining.roundFrames;
await page.waitForFunction(() => window.CD.state().phase === "clear", { timeout: 3000 });
const drained = await st();
check("authored chain pays exact 50 + 100 before clear", drained.score, 150);
check("both red detonations advance multiplier to 3", drained.mult, 3);
check("normal drain does not report fail-safe", drained.chainOutTimedOut, false);
check("round clock stayed fixed through the drain", drained.roundFrames, frozenFrames);
check("player kept all lives while the chain resolved", drained.lives, 3);

console.log("\n--- quota -> chainout -> clear -> next round ---");
await wait(4400); // 210-frame clear ceremony plus scheduling margin
const afterClear = await st();
check("round advances after the clear ceremony", afterClear.round, beforeRound + 1);
check("phase returns to ready", afterClear.phase, "ready");

console.log("\n--- round-clear bonus: two exact count-up registers ---");
await arena({ score: 1000, lives: 3 });
await page.evaluate(() => window.CD.enterClearAt(600));
const tallyStart = await st();
check("R1 clear bonus is 200 x 1 x (3+1) = 800", tallyStart.clearBonus, 800);
check("at 10 seconds, par bonus is (24-10) x 50 = 700", tallyStart.parBonus, 700);
check("bonuses are not credited on clear entry", {
  delta: tallyStart.score - 1000,
  roundPaid: tallyStart.clearRoundPaid,
  timePaid: tallyStart.clearTimePaid,
}, { delta: 0, roundPaid: 0, timePaid: 0 });
await page.waitForFunction(
  () => {
    const s = window.CD.state();
    return s.clearRoundPaid === 800 && s.clearTimePaid === 700;
  },
  { timeout: 4000 }
);
const tallyDone = await st();
check("the two registers credit exactly 1500 points", tallyDone.score - 1000, 1500);
check("the round register finishes at 800", tallyDone.clearRoundPaid, 800);
check("the time register finishes at 700", tallyDone.clearTimePaid, 700);

console.log("\n--- extend ---");
await arena({ score: 39900, nextExtend: 40000, lives: 3, mult: 1 });
await page.evaluate(() => window.CD.addPoints(200));
await wait(250);
const ext = await st();
check("crossing 40000 grants a life", ext.lives, 4);
check("next extend moves to 160000", ext.nextExtendAt, 160000);

console.log("\n--- shove whiff burns the cooldown (anti-mash) ---");
await arena();
await page.evaluate(() => window.CD.clearMines());
await wait(100);
await page.keyboard.press("Space");
await wait(60);
const whiff = await st();
check("whiffed shove leaves a cooldown", whiff.shoveCd > 0, true);

console.log("\n--- SHOVE affordance: the marker matches what the button does ---");
async function aim(px, py, fx, fy, mx, my) {
  await arena();
  await page.evaluate(
    ([px, py, fx, fy, mx, my]) => {
      window.CD.clearMines();
      window.CD.playerPos(px, py);
      window.CD.addInert(1, mx, my);
      window.CD.face(fx, fy);
    },
    [px, py, fx, fy, mx, my]
  );
  await wait(120);
  return page.evaluate(() => window.CD.shoveTarget());
}
check("mine in the broad 8 px cone is targeted", await aim(70, 78, 1, 0, 76, 78), (t) => t != null);
check("mine 11 px straight ahead is targeted by the forward lobe", await aim(70, 78, 1, 0, 81, 78), (t) => t != null);
await page.evaluate(() => window.CD.setInvuln(0));
await wait(20);
await page.screenshot({ path: "shots/shove-forward-reach.png" });
check("the forward lobe stops beyond 11 px", await aim(70, 78, 1, 0, 81.1, 78), null);
check(
  "the forward extension excludes a mine 10 px away at 30 degrees",
  await aim(70, 78, 1, 0, 78.66, 83),
  null
);
check(
  "the original cone still includes a mine 7.5 px away at 45 degrees",
  await aim(70, 78, 1, 0, 75.3, 83.3),
  (t) => t != null
);
check("same mine behind the player is not", await aim(70, 78, -1, 0, 76, 78), null);
check("mine well beyond both reaches is not targeted", await aim(70, 78, 1, 0, 92, 78), null);
// The marker is what the player reads; the button must agree with it.
await aim(70, 78, 1, 0, 81, 78);
await page.keyboard.press("Space");
await wait(150);
check("SPACE arms exactly the mine marked in the forward lobe", await page.evaluate(() => window.CD.mineSrcs()), ["player"]);
check("no marker remains once the mine is armed", await page.evaluate(() => window.CD.shoveTarget()), null);
for (const key of ["x", "k"]) {
  await aim(70, 78, 1, 0, 81, 78);
  await page.keyboard.press(key);
  await wait(150);
  check(
    `${key.toUpperCase()} is a functional SHOVE alternative`,
    await page.evaluate(() => window.CD.mineSrcs()),
    ["player"]
  );
}

console.log("\n--- fairness: your own shove cannot punish you before it clears you ---");
// SHOVE reach is 8 px, blast radius 16 px, so the shove point is always inside
// the shover's own blast. The mine and its first blast are harmless until the
// mine has separated; everything it arms afterwards is lethal as normal.
await arena({ lives: 5 });
await page.evaluate(() => {
  window.CD.clearMines();
  window.CD.setInvuln(0);
  window.CD.playerPos(70, 78);
  window.CD.addInert(1, 76, 78);
  window.CD.face(1, 0);
});
await wait(120);
await page.keyboard.press("Space");
await wait(80);
check("the shoved mine is flagged safe for the shover", await page.evaluate(() => window.CD.mineList()[0].safe), true);
// hold the player on top of it through the whole fuse and launch
await page.keyboard.down("ArrowRight");
await wait(700);
await page.keyboard.up("ArrowRight");
await wait(150);
check("walking into your own shoved mine does not kill you", (await st()).lives, 5);

// Isolate the FIRST blast: one mine, shoved into the near wall so it detonates
// 8 px away while it is still flagged safe, with nothing else able to chain.
await arena({ lives: 5 });
await page.evaluate(() => {
  window.CD.clearMines();
  window.CD.setInvuln(0);
  window.CD.playerPos(145, 78);
  window.CD.addInert(1, 151, 78);
  window.CD.face(1, 0);
});
await wait(120);
await page.keyboard.press("Space");
await wait(700);
const pb = await st();
check("your own first blast cannot kill you at point blank", pb.lives, 5);
check("it still counted as a destroyed mine", pb.score > 0, true);
check("field is clear afterwards (nothing else chained)", pb.mines, 0);

// Bug #7, second form. The flag protects a mine that is *leaving* its shover,
// so distance alone cannot clear it: a point-blank shove with the direction
// still held launches the mine from behind a player who keeps walking. The pair
// separates past SHOVER_SAFE_DIST (11.5 px) while the mine is still stationary
// on its fuse, and the 1.4 px/f mine then runs down the 1.05 px/f player from
// behind. The state below is exactly what that shove produces at the frame the
// fuse ends, injected rather than raced for so the geometry is deterministic.
await arena({ lives: 5 });
await page.evaluate(() => {
  window.CD.clearMines();
  window.CD.setInvuln(0);
  window.CD.playerPos(60, 78);
  window.CD.face(1, 0);
});
await page.keyboard.down("ArrowRight");
await wait(150);
await page.evaluate(() => {
  const s = window.CD.state();
  // 11.9 px directly behind a player who is still walking away from it.
  window.CD.addArmed(s.playerX - 11.9, s.playerY, 0, "player", 6, true);
  window.__trace = [];
  window.__traceOn = true;
  const tick = () => {
    if (!window.__traceOn) return;
    const m = window.CD.mineList()[0];
    if (m && m.armed) window.__trace.push({ safe: m.safe, d: m.d, closing: m.closing });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
await wait(60);
const behind = (await page.evaluate(() => window.CD.mineList()))[0];
check(
  "a fused shover-safe mine behind a walking shover is past the 11.5 px clearing distance",
  behind.d > 11.5,
  true
);
check(
  "it is gaining on them at exactly ARMED_SPEED - PLAYER_SPEED",
  behind.closing,
  0.35
);
check("so the flag has not cleared on distance alone", behind.safe, true);
await page.waitForFunction(() => {
  const m = window.CD.mineList()[0];
  return m && m.d < 5.5;
}, { timeout: 2000 });
check("being overtaken by your own shove does not kill you", (await st()).lives, 5);
// The safety assertion ends at contact. After the mine overtakes the player it
// legitimately becomes lethal again; make that later clearing observation
// invulnerable so a wall blast cannot contaminate the earlier survival check.
await page.evaluate(() => window.CD.setInvuln(99999));
await page.keyboard.up("ArrowRight");
await wait(300);
const chase = await page.evaluate(() => {
  window.__traceOn = false;
  return window.__trace;
});
check(
  "no frame of that approach clears the flag while the mine is still closing",
  chase.filter((f) => f.closing > 0 && !f.safe).length,
  0
);
check(
  "the mine reaches contact range from behind (it would have hit)",
  Math.min(...chase.map((f) => f.d)) < 5.5,
  true
);
const cleared = chase.find((f) => !f.safe);
check(
  "it becomes lethal again only once it is past 11.5 px AND moving away",
  cleared ? { past: cleared.d > 11.5, leaving: cleared.closing < 0 } : null,
  { past: true, leaving: true }
);

// The other half of that rule: a mine that really is leaving must still clear,
// or the shover would be permanently immune to their own ordnance.
await arena({ lives: 5 });
await page.evaluate(() => {
  window.CD.clearMines();
  window.CD.setInvuln(0);
  window.CD.playerPos(70, 78);
  window.CD.addInert(1, 76, 78);
  window.CD.face(1, 0);
});
await wait(120);
await page.keyboard.press("Space");
await wait(400);
const leaving = (await page.evaluate(() => window.CD.mineList()))[0];
check(
  "a mine leaving a standing shover still clears at full launch speed",
  { safe: leaving.safe, closing: leaving.closing, past: leaving.d > 11.5 },
  { safe: false, closing: -1.4, past: true }
);

console.log("\n--- scavenger lifecycle: appetite and release remain functional ---");
await arena();
await page.evaluate(() => {
  window.CD.clearScavs();
  window.CD.addScav(80, 70);
  window.CD.addInert(3, 80, 70);
});
await wait(180);
check(
  "a scavenger eats three nearby mines instead of stopping after two",
  (await page.evaluate(() => window.CD.scavList()))[0].eaten,
  3
);
check("the measured appetite cap is three meals", (await st()).scavEatCap, 3);
await page.screenshot({ path: "shots/scav-appetite.png" });

await arena();
await page.evaluate(() => {
  window.CD.clearScavs();
  window.CD.addScav(80, 70, 2);
});
await wait(80);
await page.screenshot({ path: "shots/scav-appetite-one-left.png" });

await arena();
await page.evaluate(() => {
  window.CD.clearScavs();
  window.CD.addScav(40, 40);
  window.CD.addScav(120, 100);
  window.CD.addInert(1, 50, 50);
  window.CD.addInert(1, 110, 90);
  // Force both added scavengers to choose on the next frame.
  window.CD.scavList();
});
await wait(80);
const scavTargets = await page.evaluate(() =>
  window.CD.scavList().map((s) => [s.targetX, s.targetY])
);
check(
  "two scavengers claim two distinct live mine targets",
  new Set(scavTargets.map(JSON.stringify)).size,
  2
);

await arena();
await page.evaluate(() => {
  window.CD.clearScavs();
  window.CD.addScav(40, 40);
  window.CD.addScav(120, 100);
});
await wait(80);
check(
  "with no inert target, scavengers receive distinct centre anchors",
  await page.evaluate(() =>
    window.CD.scavList().map((s) => [s.targetX, s.targetY])
  ),
  [[102, 78], [58, 78]]
);

await arena();
await page.evaluate(() => {
  window.CD.clearScavs();
  window.CD.clearScavReleases();
  window.CD.addScav(80, 70, 2);
  window.CD.addBlast(80, 70, "player", 0);
});
await page.waitForFunction(() => window.CD.scavReleases().length === 1);
await wait(80); // the killing blast has stepped several more times
const releasedFuses = (await page.evaluate(() => window.CD.mineList()))
  .map((m) => m.fuse)
  .sort((a, b) => a - b);
check(
  "the killing blast preserves four distinct stagger offsets",
  releasedFuses.map((f) => f - releasedFuses[0]),
  [0, 1, 2, 3]
);

await page.waitForFunction(
  () => window.CD.scavReleases()[0]?.detonations.length > 0,
  { timeout: 4000 }
);
const firstReleaseTravel = await page.evaluate(
  () => window.CD.scavReleases()[0].detonations[0].distance
);
check(
  "released payload travels at least one 1.4 px launch step before detonation",
  firstReleaseTravel >= 1.4,
  true
);

console.log("\n--- lodestone field: inert-only pull, causality neutrality and freeze ---");
await arena({ score: 700, quotaLeft: 12 });
await page.evaluate(() => {
  const CD = window.CD;
  CD.setPhase("ready", 99999);
  CD.clearMines();
  CD.clearLodestones();
  CD.addLodestone(80, 70);
  CD.addInert(1, 100, 70);
  CD.addInert(1, 113, 70);
  // Both armed mines sit *inside* the 24 px field, so each assertion is about
  // the fuse state rather than about being out of reach.
  CD.addArmed(95, 75, 0, "player", 99);
  CD.addArmed(100, 60, 0, "player", 0);
});
const lodeBefore = await st();
await page.evaluate(() => window.CD.pullLodestonesOnce());
const lodeMines = await page.evaluate(() => window.CD.mineList());
const lodeAfter = await st();
check("an inert mine 20 px away receives the exact 0.18 px inward pull", lodeMines[0].x, 99.82);
check("an inert mine outside the 24 px field is unchanged", lodeMines[1].x, 113);
check("an armed mine still on its fuse is not deflected", [lodeMines[2].x, lodeMines[2].y], [95, 75]);
check(
  "an armed mine in flight is deflected by exactly 0.25 px and spends it",
  [lodeMines[3].x, lodeMines[3].y, lodeMines[3].lodeBudget],
  [99.78, 60.11, 5.75]
);
check("one affected inert mine fills one unit of the visible core", await page.evaluate(() => window.CD.lodestoneList()[0].active), 1);
check("lodestone rearrangement preserves inert count, score and quota", {
  inert: lodeAfter.inert,
  score: lodeAfter.score,
  quotaLeft: lodeAfter.quotaLeft,
}, {
  inert: lodeBefore.inert,
  score: lodeBefore.score,
  quotaLeft: lodeBefore.quotaLeft,
});

await arena({ quotaLeft: 12 });
await page.evaluate(() => {
  const CD = window.CD;
  CD.clearMines();
  CD.clearLodestones();
  CD.addLodestone(80, 70);
  CD.addLodestone(120, 70);
  CD.addInert(1, 105, 70);
  CD.setPhase("ready", 99999);
  CD.pullLodestonesOnce();
});
check(
  "an inert mine chooses only the nearest overlapping lodestone field",
  await page.evaluate(() => ({
    x: window.CD.mineList()[0].x,
    active: window.CD.lodestoneList().map((l) => l.active),
  })),
  { x: 105.18, active: [0, 1] }
);

await arena({ quotaLeft: 12 });
await page.evaluate(() => {
  const CD = window.CD;
  CD.clearMines();
  CD.clearLodestones();
  CD.addLodestone(80, 70);
  CD.addInert(1, 100, 70);
  CD.addArmed(140, 110, 0, "player", 200);
  CD.beginChainOutAt(600);
});
const frozenLodeX = (await page.evaluate(() => window.CD.mineList()))[0].x;
await wait(250);
check("lodestone remains frozen throughout CHAIN OUT", {
  phase: (await st()).phase,
  x: (await page.evaluate(() => window.CD.mineList()))[0].x,
}, { phase: "chainout", x: frozenLodeX });
check(
  "the visible core still counts the pile it is holding during CHAIN OUT",
  await page.evaluate(() => window.CD.lodestoneList()[0].active),
  1
);
await page.screenshot({ path: "shots/lodestone-chainout.png" });

// CHAIN OUT protects the player; it does not change the physics. One step is
// applied and read inside a single evaluate so no frames run in between.
await arena({ quotaLeft: 12 });
check(
  "CHAIN OUT still bends the committed chain while the pile stays put",
  await page.evaluate(() => {
    const CD = window.CD;
    CD.clearMines();
    CD.clearLodestones();
    CD.addLodestone(80, 70);
    CD.addInert(1, 100, 70);
    CD.addArmed(100, 60, 0, "player", 0);
    CD.beginChainOutAt(600);
    CD.pullLodestonesOnce(false);
    const ms = CD.mineList();
    return { inertX: ms[0].x, armedX: ms[1].x, active: CD.lodestoneList()[0].active };
  }),
  { inertX: 100, armedX: 99.78, active: 1 }
);

// The budget is what makes capture impossible. A link fired tangentially past
// the core is the worst case: it must still leave the field and detonate.
for (const offset of [8, 12, 16, 20]) {
  await arena({ quotaLeft: 99 });
  await page.evaluate((dy) => {
    const CD = window.CD;
    CD.parkSpawner();
    CD.clearMines();
    CD.clearScavs();
    CD.clearLodestones();
    CD.setInvuln(999999);
    CD.playerPos(80, 20);
    CD.addLodestone(80, 78);
    CD.addArmed(10, 78 + dy, 0, "player", 0);
  }, offset);
  await wait(3000);
  check(
    `a chain link fired ${offset} px off-centre is never captured`,
    await page.evaluate(() => window.CD.mineList().filter((m) => m.armed).length),
    0
  );
}

await page.evaluate(() => {
  const CD = window.CD;
  CD.setRound(2);
  CD.setPhase("ready", 99999);
});
await wait(80);
await page.screenshot({ path: "shots/lodestone-ready.png" });
await page.evaluate(() => {
  const CD = window.CD;
  CD.setPhase("play", 0);
  CD.parkSpawner();
  CD.clearMines();
  CD.setInvuln(99999);
  // Four inside R2's anchor (30,44), two outside it.
  for (const [x, y] of [
    [40, 44], [47, 39], [50, 48], [36, 59], [56, 44], [44, 66],
  ]) CD.addInert(1, x, y);
});
await wait(800);
await page.screenshot({ path: "shots/lodestone-field.png" });

// The deflection readout: a red spoke means the field has hold of a live chain
// link and the blast will not land where it was aimed.
await page.evaluate(() => {
  const CD = window.CD;
  CD.playerPos(120, 120);
  // Crosses R2's anchor 14 px off-centre, clear of the gathered pile.
  CD.addArmed(8, 30, 0, "player", 0);
});
await wait(200);
await page.screenshot({ path: "shots/lodestone-deflect.png" });

// A mine armed by a player blast is a normal, lethal chain link, not safe.
await arena({ lives: 5 });
await page.evaluate(() => {
  window.CD.clearMines();
  window.CD.setInvuln(99999);
  window.CD.playerPos(30, 120);
  window.CD.addArmed(80, 60, 0, "player", 0);
  window.CD.addInert(1, 88, 60);
});
await wait(300);
check(
  "chained mines are not shover-safe",
  await page.evaluate(() =>
    window.CD.mineList().filter((m) => m.armed).every((m) => m.safe === false)
  ),
  true
);

console.log("\n--- a miss defuses the field and resets the multiplier ---");
await arena({ mult: 9, lives: 3, invuln: 0 });
await page.evaluate(() => {
  window.CD.clearCapacitors();
  window.CD.addCapacitor(80, 40);
  window.CD.addBlast(65, 40, "player", 6);
  window.CD.stepBlastsOnce();
  window.CD.addArmed(60, 60, 0, "player", 40);
  window.CD.addArmed(70, 60, 0, "player", 40);
  window.CD.killPlayer();
});
await wait(200);
const miss = await st();
check("a miss costs exactly one life", miss.lives, 2);
check("a miss defuses every armed mine", miss.armed, 0);
check("a miss grounds every charged capacitor", miss.chargedCapacitors, 0);
check("a miss resets the multiplier", miss.mult, 1);
check("phase is death", miss.phase, "death");
check("a forced debug miss has no fabricated culprit", miss.deathEcho, null);

console.log("\n--- the exact death hazard remains as a render-only echo ---");
await arena({ lives: 3, invuln: 0 });
await page.evaluate(() => {
  window.CD.playerPos(80, 78);
  window.CD.setInvuln(0);
  // At 1.4 px/frame this reaches x=80 on the collision frame.
  window.CD.addArmed(78.6, 78, 0, "player", 0);
});
await page.waitForFunction(() => window.CD.state().phase === "death", { timeout: 2000 });
const mineMiss = await st();
check("mine miss keeps the exact culprit snapshot", mineMiss.deathEcho, {
  type: "mine",
  x: 80,
  y: 78,
  playerX: 80,
  playerY: 78,
  src: "player",
  radius: 2.5,
});
check("mine culprit is absent from the live field", [mineMiss.armed, mineMiss.blasts], [0, 0]);
await page.screenshot({ path: "shots/probe-death-mine.png" });
await page.evaluate(() => window.CD.setPhaseTimer(1));
await page.waitForFunction(() => window.CD.state().phase === "play", { timeout: 2000 });
check("death echo clears on respawn", (await st()).deathEcho, null);

await arena({ lives: 3, invuln: 0 });
await page.evaluate(() => {
  window.CD.playerPos(80, 78);
  window.CD.setInvuln(0);
  // Age 5 becomes age 6/radius 9.5 on the collision frame.
  window.CD.addBlast(70, 78, "overload", 5);
});
await page.waitForFunction(() => window.CD.state().phase === "death", { timeout: 2000 });
const blastMiss = await st();
check("blast miss freezes source, centre and collision radius", blastMiss.deathEcho, {
  type: "blast",
  x: 70,
  y: 78,
  playerX: 80,
  playerY: 78,
  src: "overload",
  radius: 9.5,
});
check("blast culprit is absent from the live field", blastMiss.blasts, 0);
await page.screenshot({ path: "shots/probe-death-blast.png" });

console.log("\n--- regression: a miss during a multi-blast frame ---");
// hitPlayer() defuses the field, mutating `mines` and `blasts` while the step
// loops are still indexing them. Several simultaneous detonations around a
// vulnerable player is the exact frame that used to throw.
for (let attempt = 0; attempt < 6; attempt++) {
  await arena({ mult: 3, lives: 5, invuln: 0 });
  await page.evaluate(() => {
    window.CD.playerPos(80, 78);
    window.CD.setInvuln(0);
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI * 2 * k) / 6;
      window.CD.addArmed(
        80 + Math.cos(a) * 6,
        78 + Math.sin(a) * 6,
        a + Math.PI,
        "player",
        0
      );
    }
  });
  await wait(500);
}
const crashFree = errors.filter((e) => /stepBlasts|stepMines|reading 't'/.test(e));
check("no mid-loop mutation crash across 6 multi-blast deaths", crashFree, []);
check("player still loses lives normally", (await st()).lives < 5, true);

console.log("\n--- eighteen-round run and repeated personality table ---");
check(
  "R1-R9 have the exact nine authored actor mixes",
  await page.evaluate(() =>
    Array.from({ length: 9 }, (_, i) => {
      const p = window.CD.params(i + 1);
      return [p.name, p.scav, p.lode, p.capacitor, p.quota];
    })
  ),
  [
    ["SHAKEDOWN", 0, 0, 0, 20],
    ["DRIFT LINE", 0, 1, 0, 24],
    ["CHARGE LINE", 0, 0, 1, 26],
    ["SWARM", 1, 1, 0, 30],
    ["SCAVENGE", 2, 0, 0, 30],
    ["SURGE", 1, 0, 1, 36],
    ["CRUSH", 2, 1, 0, 40],
    ["HARVEST", 0, 0, 0, 44],
    ["STORM", 3, 1, 0, 48],
  ]
);
check("the run has one fixed R18 endpoint", (await st()).finalRound, 18);
check("attract demos are capped at the nine authored rounds", (await st()).attractRoundCount, 9);
check(
  "repeated attract starts never select a second-cycle round",
  await page.evaluate(() => {
    const rounds = [];
    for (let i = 0; i < 100; i++) {
      window.CD.startAttract();
      rounds.push(window.CD.state().round);
    }
    return rounds.every((r) => r >= 1 && r <= 9);
  }),
  true
);
check(
  "LODESTONE and CAPACITOR are mutually exclusive through the full run",
  await page.evaluate(() => {
    for (let r = 1; r <= 18; r++) {
      const p = window.CD.params(r);
      if (p.lode > 0 && p.capacitor > 0) return false;
    }
    return true;
  }),
  true
);

const p13 = await page.evaluate(() => window.CD.params(13));
check("R13 repeats SWARM at cycle index 1", p13.name, "SWARM");
check("R13 spawn = round(26*0.92)", p13.spawn, 24);
check("R13 cap = 13 - 1", p13.cap, 12);
check("R13 quota = round(30*1.15)", p13.quota, 35);
check("R13 has no cycle score multiplier", Object.hasOwn(p13, "valueMul"), false);
check(
  "first-cycle fixed-actor rounds match the authored progression",
  await page.evaluate(() => ({
    lode: [2, 4, 7, 9].map((r) => window.CD.params(r).lode),
    capacitor: [3, 6].map((r) => window.CD.params(r).capacitor),
  })),
  { lode: [1, 1, 1, 1], capacitor: [1, 1] }
);
check(
  "R1 opening and R8 pre-climax breather start without fixed actors",
  await page.evaluate(() => [1, 8].map((r) => {
    const p = window.CD.params(r);
    return [p.lode, p.capacitor];
  })),
  [[0, 0], [0, 0]]
);

await page.evaluate(() => {
  const CD = window.CD;
  CD.setRound(9);
  CD.setPhase("ready", 99999);
});
await wait(80);
await page.screenshot({ path: "shots/round9-ready.png" });
await page.evaluate(() => {
  const CD = window.CD;
  CD.enterClearAt(0);
});
await wait(80);
await page.screenshot({ path: "shots/round9-clear.png" });
await page.evaluate(() => window.CD.setPhaseTimer(1));
await page.waitForFunction(
  () => {
    const s = window.CD.state();
    return s.phase === "ready" && s.round === 10;
  },
  { timeout: 2000 }
);
await page.screenshot({ path: "shots/round10-ready.png" });
check("round 9 advances to continuous round 10", {
  round: (await st()).round,
  patternRound: (await st()).patternRound,
  cycleIndex: (await st()).cycleIndex,
  label: await page.evaluate(() => window.CD.roundLabels(10).full),
}, { round: 10, patternRound: 1, cycleIndex: 1, label: "ROUND 10" });

console.log("\n--- fixed-actor anchors rotate on the second cycle ---");
const anchorsAt = (r) =>
  page.evaluate((rr) => {
    window.CD.setRound(rr);
    return window.CD.lodestoneList().map((x) => [x.x, x.y]);
  }, r);
check(
  "each first-cycle lodestone round stands on a different anchor",
  await (async () => {
    const out = {};
    for (const r of [2, 4, 7, 9]) out[`R${r}`] = (await anchorsAt(r))[0];
    return out;
  })(),
  { R2: [30, 44], R4: [130, 112], R7: [30, 112], R9: [80, 44] }
);
check(
  "R11 rotates the R2 lodestone assignment",
  { R2: (await anchorsAt(2))[0], R11: (await anchorsAt(11))[0] },
  { R2: [30, 44], R11: [130, 44] }
);
check(
  "every anchor keeps the centre spawn clear and its ring inside the frame",
  await (async () => {
    const seen = [];
    for (const r of [2, 4, 7, 9, 11, 13, 16, 18]) seen.push(...(await anchorsAt(r)));
    return seen.every(
      ([x, y]) =>
        Math.hypot(x - 80, y - 78) >= 30 && x - 24 >= 4 && x + 24 <= 156 && y - 24 >= 18 && y + 24 <= 138
    );
  })(),
  true
);

const capacitorAnchorsAt = (r) =>
  page.evaluate((rr) => {
    window.CD.setRound(rr);
    return window.CD.capacitorList().map((x) => [x.x, x.y]);
  }, r);
check(
  "the two first-cycle capacitor rounds use different anchors",
  {
    R3: (await capacitorAnchorsAt(3))[0],
    R6: (await capacitorAnchorsAt(6))[0],
  },
  { R3: [72, 114], R6: [132, 58] }
);
check(
  "capacitor placement rotates in the second cycle",
  {
    R3: (await capacitorAnchorsAt(3))[0],
    R12: (await capacitorAnchorsAt(12))[0],
  },
  { R3: [72, 114], R12: [132, 58] }
);
check(
  "every capacitor anchor keeps its intake inside the frame and the spawn clear",
  await page.evaluate(() => {
    const seen = [];
    for (const r of [3, 6, 12, 15]) {
      window.CD.setRound(r);
      for (const c of window.CD.capacitorList()) seen.push([c.x, c.y]);
    }
    return seen.every(
      ([x, y]) =>
        x - 24 >= 4 && x + 24 <= 156 && y - 24 >= 18 && y + 24 <= 138 &&
        Math.hypot(x - 80, y - 78) >= 30
    );
  }),
  true
);
check(
  "capacitors no longer stand on lodestone anchors: the two sets are disjoint",
  await page.evaluate(() => {
    const lode = [[30, 44], [130, 44], [130, 112], [30, 112], [80, 44]];
    const caps = [];
    for (const r of [3, 6, 12, 15]) {
      window.CD.setRound(r);
      for (const c of window.CD.capacitorList()) caps.push([c.x, c.y]);
    }
    return caps.some(([x, y]) => lode.some(([a, b]) => a === x && b === y));
  }),
  false
);

console.log("\n--- R18 clear -> ALL CLEAR -> life bonus ---");
await page.evaluate(() => window.CD.wipeHiScores());
await arena({ score: 1000, lives: 3, nextExtend: 9e9 });
await page.evaluate(() => {
  const CD = window.CD;
  CD.setRound(18);
  CD.setScore(1000);
  CD.setLives(3);
  CD.setNextExtend(9e9);
  CD.enterClearAt(0);
});
const finalTally = await st();
check("R18 round bonus repeats pattern R9: 200 x 9 x 4", finalTally.clearBonus, 7200);
check("R18 zero-second time bonus is 55 x 1.2 x 50", finalTally.parBonus, 3300);
await page.screenshot({ path: "shots/round18-clear.png" });
await page.evaluate(() => window.CD.setPhaseTimer(1));
await page.waitForFunction(() => window.CD.state().phase === "allclear", { timeout: 2000 });
const allClearStart = await st();
check(
  "the unique ALL CLEAR ceremony emits its own jingle",
  (await page.evaluate(() => window.CD.audioEvents())).some(
    (e) => e.event === "jingle:allclear"
  ),
  true
);
check("R18 ends the run instead of advancing to R19", {
  phase: allClearStart.phase,
  round: allClearStart.round,
  score: allClearStart.score,
}, { phase: "allclear", round: 18, score: 11500 });
check("three remaining lives project exactly 3000 final bonus", allClearStart.lifeBonus, 3000);
await page.screenshot({ path: "shots/all-clear-start.png" });
await page.waitForFunction(() => window.CD.state().lifeBonusPaid === 3000, { timeout: 3000 });
const allClearPaid = await st();
check("life bonus credits exactly once without granting an ending extend", {
  delta: allClearPaid.score - allClearStart.score,
  paid: allClearPaid.lifeBonusPaid,
  lives: allClearPaid.lives,
}, { delta: 3000, paid: 3000, lives: 3 });
await page.evaluate(() => window.CD.setPhaseTimer(90));
await wait(100);
await page.screenshot({ path: "shots/all-clear-paid.png" });
await page.evaluate(() => window.CD.setPhaseTimer(1));
await page.waitForFunction(() => window.CD.state().phase === "entry", { timeout: 2000 });
check("clear result records score, reached round and clear flag", {
  score: (await st()).lastRunScore,
  round: (await st()).lastRunRound,
  cleared: (await st()).lastRunCleared,
}, { score: 14500, round: 18, cleared: true });

console.log("\n--- initials entry: qualifying enters, sixth place skips ---");
const pressEntry = async (key) => {
  await page.keyboard.press(key);
  await wait(100);
};
check(
  "V1-only ranking storage is discarded instead of migrated into V2",
  await page.evaluate(() => {
    localStorage.removeItem("chainDrift.hiScores.v2");
    localStorage.setItem(
      "chainDrift.hiScores.v1",
      JSON.stringify([{ name: "OLD", score: 999999 }])
    );
    window.CD.startGame();
    const names = window.CD.state().hiScores.map((e) => e.name);
    localStorage.removeItem("chainDrift.hiScores.v1");
    return names;
  }),
  ["CDL", "ARC", "MNE", "FSE", "TND"]
);
check(
  "entry grid is the specified 10 x 4 character/action board",
  await page.evaluate(() => {
    const { columns, rows, keys } = window.CD.visualContract().entryGrid;
    return { columns, rows, keys };
  }),
  {
    columns: 10,
    rows: 4,
    keys: [
      "A", "B", "C", "D", "E", "F", "G", "H", "I", "J",
      "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T",
      "U", "V", "W", "X", "Y", "Z", "0", "1", "2", "3",
      "4", "5", "6", "7", "8", "9", ".", "-", "DEL", "END",
    ],
  }
);
check(
  "initials entry allows exactly 30 seconds at 60 fps",
  await page.evaluate(() => window.CD.visualContract().entryTimeoutFrames),
  1800
);
check(
  "entry grid cursor clears the field frame on its top, left and right edges",
  await page.evaluate(() => {
    const g = window.CD.visualContract().entryGrid;
    return {
      left: g.firstCenterX - g.cursorWidth / 2 > g.frame.left,
      right: g.lastCenterX + g.cursorWidth / 2 < g.frame.right,
      top:
        g.topTextY + g.cursorCenterYOffset - g.cursorHeight / 2 >
        g.frame.top,
    };
  }),
  { left: true, right: true, top: true }
);
await page.evaluate(() => window.CD.wipeHiScores());
await arena({ score: 50000, lives: 1, invuln: 0 });
await page.evaluate(() => {
  window.CD.setScore(50000);
  window.CD.killPlayer();
});
await page.waitForFunction(() => window.CD.state().phase === "entry", { timeout: 15000 });
await wait(500);
check(
  "initials entry ranking already includes the qualifying current score",
  (await page.evaluate(() => window.CD.displayedHiScores()))[0].score,
  50000
);
await page.screenshot({ path: "shots/probe-entry-preview.png" });
// Every phase that takes a direction takes the same synonyms. An arrow-only
// cursor stranded WASD players here, and a probe that only pressed arrows
// could not see it. Both paths start and end on cursor 0.
const cursorPath = async (keys) => {
  const path = [];
  for (const k of keys) {
    await pressEntry(k);
    path.push((await st()).entry.cursor);
  }
  return path;
};
const arrowCursorPath = await cursorPath([
  "ArrowRight",
  "ArrowDown",
  "ArrowLeft",
  "ArrowUp",
]);
const wasdCursorPath = await cursorPath(["d", "s", "a", "w"]);
check(
  "arrows walk the entry cursor right, down, left and up",
  arrowCursorPath,
  [1, 11, 10, 0]
);
check(
  "WASD walks the entry cursor exactly as the arrows do",
  wasdCursorPath,
  arrowCursorPath
);
await pressEntry("x"); // A: X is a confirm alternative
await pressEntry("ArrowRight");
await pressEntry("Space"); // B
await pressEntry("ArrowRight");
await pressEntry("Space"); // C
await wait(200);
check(
  "grid entry appends the selected characters",
  (await st()).entry,
  { name: "ABC", length: 3, cursor: 2, selected: "C" }
);
check(
  "initials entry ranking updates the provisional name without saving early",
  {
    first: await page.evaluate(() => {
      const e = window.CD.displayedHiScores()[0];
      return {
        name: e.name,
        score: e.score,
        reachedRound: e.reachedRound,
        cleared: e.cleared,
      };
    }),
    stored: await page.evaluate(() => window.CD.storage()),
  },
  {
    first: { name: "ABC", score: 50000, reachedRound: 1, cleared: false },
    stored: null,
  }
);
await pressEntry("ArrowUp"); // 6
for (let i = 0; i < 6; i++) await pressEntry("ArrowRight");
await pressEntry("Space"); // DEL
await wait(200);
check(
  "DEL removes exactly the last character",
  (await st()).entry,
  { name: "AB-", length: 2, cursor: 38, selected: "DEL" }
);
await pressEntry("ArrowRight"); // END
await pressEntry("k"); // END: K is a confirm alternative
await page.waitForFunction(() => window.CD.state().phase === "table", { timeout: 5000 });
const savedRaw = await page.evaluate(() => window.CD.storage());
check("qualifying score is persisted", JSON.parse(savedRaw || "[]")[0].score, 50000);
check("END saves the displayed padded name", JSON.parse(savedRaw || "[]")[0].name, "AB-");
check("a miss stores its reached round and non-clear result", {
  reachedRound: JSON.parse(savedRaw || "[]")[0].reachedRound,
  cleared: JSON.parse(savedRaw || "[]")[0].cleared,
}, { reachedRound: 1, cleared: false });
check(
  "storage holds only real entries, never the factory table",
  JSON.parse(savedRaw || "[]").length,
  1
);
// same-frame bleed: the confirm that ended entry must not also dismiss the table
check("table is still showing right after entry", (await st()).phase, "table");

await page.evaluate(() => window.CD.wipeHiScores());
await arena({ score: 13000, lives: 1, invuln: 0 });
await page.evaluate(() => window.CD.killPlayer());
await page.waitForFunction(() => window.CD.state().phase === "entry", { timeout: 15000 });
await wait(200);
const fourthPlaceEntry = await page.evaluate(() => window.CD.displayedHiScoreState());
check(
  "initials entry highlights its actual fourth-place preview instead of first place",
  {
    currentIndex: fourthPlaceEntry.currentIndex,
    highlightIndex: fourthPlaceEntry.highlightIndex,
    score: fourthPlaceEntry.scores[fourthPlaceEntry.currentIndex].score,
  },
  { currentIndex: 3, highlightIndex: 3, score: 13000 }
);
await page.screenshot({ path: "shots/probe-entry-fourth-place.png" });
await page.evaluate(() => window.CD.setEntryTimer(1));
await page.waitForFunction(() => window.CD.state().phase === "table", { timeout: 5000 });

await page.evaluate(() =>
  window.CD.seedStorage([
    { name: "OLD", score: 60000, reachedRound: 18, cleared: false, recordedAt: 1 },
    { name: "FAR", score: 60000, reachedRound: 17, cleared: false, recordedAt: 4 },
    { name: "CLR", score: 60000, reachedRound: 18, cleared: true, recordedAt: 2 },
    { name: "NEW", score: 60000, reachedRound: 18, cleared: false, recordedAt: 3 },
  ])
);
check(
  "score ties sort by clear, reached round, then newer record",
  (await page.evaluate(() => window.CD.state().hiScores)).map((e) => e.name),
  ["CLR", "NEW", "OLD", "FAR", "CDL"]
);

await page.evaluate(() =>
  window.CD.seedStorage([
    { name: "AAA", score: 900000 },
    { name: "BBB", score: 800000 },
    { name: "CCC", score: 700000 },
    { name: "DDD", score: 600000 },
    { name: "EEE", score: 500000 },
  ])
);
await arena({ score: 499999, lives: 1, invuln: 0 });
await page.evaluate(() => {
  window.CD.setScore(499999);
  window.CD.killPlayer();
});
await page.waitForFunction(() => window.CD.state().phase === "table", { timeout: 5000 });
const raw2 = JSON.parse((await page.evaluate(() => window.CD.storage())) || "[]");
check("one point below fifth place does not write the table", raw2.length, 5);
check(
  "sixth place skips initials and goes directly to the table",
  { phase: (await st()).phase, entry: (await st()).entry },
  { phase: "table", entry: null }
);
await page.screenshot({ path: "shots/probe-table.png" });

console.log("\n--- the table screen answers every confirm synonym, and nothing else ---");
// The table is the last screen a run puts in front of the player, and it reads
// confirmPressed(), so it owes the same synonym set as entry and play. A gate
// that presses one key cannot see a screen that strands half the players on it.
const tableDismiss = async (key) => {
  await page.evaluate(() => window.CD.setPhase("table", 600));
  await wait(400); // outlast the 20-frame phase grace
  await page.keyboard.press(key);
  await wait(150);
  return (await st()).phase;
};
for (const key of ["Enter", "Space", "z", "x", "j", "k"]) {
  check(
    `${key} dismisses the high-score table to attract`,
    await tableDismiss(key),
    "attract"
  );
}
// Inverse case: without this, every check above would also pass on a screen
// that simply timed out.
await page.evaluate(() => window.CD.setPhase("table", 600));
await wait(400);
await page.keyboard.press("ArrowLeft");
await wait(150);
const heldTable = await st();
check(
  "a movement key is not a confirm: the table stays up on its own clock",
  { phase: heldTable.phase, clockStillLong: heldTable.phaseTimer > 400 },
  { phase: "table", clockStillLong: true }
);

console.log("\n--- cold boot: a real reload is how a returning player meets their table ---");
// Everything above reaches the ranking through window.CD in one page life. The
// load path -- parse, reject, normalize, merge -- only runs on a fresh document,
// which is exactly the trip a player makes between two sessions.
await page.evaluate(() =>
  window.CD.seedStorage([
    { name: "RLD", score: 123456, reachedRound: 12, cleared: false, recordedAt: 7 },
  ])
);
const coldBoot = async () => {
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.CD != null, { timeout: 10000 });
  await page.waitForFunction(() => window.CD.state().phase === "attract", { timeout: 10000 });
};
await coldBoot();
check(
  "a saved run survives a real page reload, seated above the factory table",
  (await page.evaluate(() => window.CD.state().hiScores)).map((e) => [e.name, e.score]),
  [["RLD", 123456], ["CDL", 35000], ["ARC", 24000], ["MNE", 17000], ["FSE", 12000]]
);
check(
  "the reload read the stored row rather than rewriting it",
  JSON.parse((await page.evaluate(() => window.CD.storage())) || "[]"),
  [{ name: "RLD", score: 123456, reachedRound: 12, cleared: false, recordedAt: 7 }]
);
await page.evaluate(() =>
  window.CD.seedStorage([
    { name: "BAD" },
    { score: 5 },
    null,
    { name: "SUR", score: 99999, reachedRound: 3, cleared: false, recordedAt: 9 },
  ])
);
await coldBoot();
check(
  "unusable stored rows are dropped on load and the sound ones still rank",
  (await page.evaluate(() => window.CD.state().hiScores)).map((e) => e.name),
  ["SUR", "CDL", "ARC", "MNE", "FSE"]
);
await page.evaluate(() => localStorage.setItem("chainDrift.hiScores.v2", "{ not json"));
await coldBoot();
check(
  "unreadable storage boots the factory table instead of failing",
  (await page.evaluate(() => window.CD.state().hiScores)).map((e) => e.name),
  ["CDL", "ARC", "MNE", "FSE", "TND"]
);
check(
  "and the game is playable straight off that cold boot",
  await page.evaluate(() => {
    window.CD.startGame();
    return window.CD.state().phase;
  }),
  "ready"
);

check(
  "nothing on the page was fetched from another origin, engine included",
  [...offOrigin],
  []
);

console.log("\nERRORS:", errors.length ? errors : "none");
console.log(failures.length ? `FAILURES: ${failures.join(", ")}` : "ALL ASSERTIONS PASSED");
await browser.close();
process.exit(errors.length || failures.length ? 1 : 0);
