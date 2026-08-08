// COMET SLASH — mechanics probe (spec-conformance checks via state injection).
// Run from the project dir: node tests/probe.mjs http://127.0.0.1:8931/index.html
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/");
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const target = process.argv[2] || "index.html";
const url = /^https?:/.test(target) ? target : "file://" + path.resolve(target);

const errors = [];
const failures = [];
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {}),
});
const page = await browser.newPage({ viewport: { width: 500, height: 500 } });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text());
});

const check = (name, actual, expected) => {
  const ok = typeof expected === "function" ? expected(actual) : actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(actual)}`);
  if (!ok) failures.push(name);
};

fs.mkdirSync("tests/shots", { recursive: true });

// Measure the master output. Headless Chromium renders audio into a null sink
// on a thread that can stall under load, so a window with mostly stale frames
// is an invalid measurement, not a failing one: retry before believing it.
const live = (m) => m && m.frames >= (m.frames + m.stale) * 0.6 && m.frames > 8;
const skip = (name, m) =>
  console.log(`SKIP ${name}: headless audio sink produced ${m.frames}/${m.frames + m.stale} live frames`);
const meter = async (ms) => {
  let last = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    last = await page.evaluate((d) => window.__meter(d), ms);
    if (live(last)) return last;
    await page.waitForTimeout(400);
  }
  return last;
};

// Park confounders while keeping phase "play": quota=1 blocks the wave-clear
// branch (quota===0 && no comets/warns), spawnT blocks natural spawns.
const park = () =>
  page.evaluate(() => {
    quota = 1;
    spawnT = 99999;
    warns = [];
    comets = [];
    player.inv = 99999;
  });
const injectSlashTarget = () =>
  page.evaluate(() => {
    comets = [];
    crystals = [];
    spawnComet({ pos: vec(124, 100), angle: 0 });
    const c = comets[0];
    c.speed = 0;
    c.segs = 6;
    c.hist = [];
    for (let i = 0; i < 80; i++) c.hist.push(vec(124 - i, 100));
    player.pos.set(100, 100);
    player.dir = 0;
    player.cool = 0;
    player.swing = 0;
    player.inv = 99999;
    window.__sc0 = sc;
  });

// Tap the real master -> destination signal so audio checks measure rendered
// output, not just "did we schedule something". crisp-game-lib may open its own
// AudioContext, so every destination is tapped and metered together rather than
// only whichever graph happened to connect first.
await page.addInitScript(() => {
  const origConnect = AudioNode.prototype.connect;
  const taps = new Map();
  window.__taps = [];
  AudioNode.prototype.connect = function (dest, ...rest) {
    if (dest && dest.constructor && dest.constructor.name === "AudioDestinationNode") {
      let an = taps.get(dest);
      if (!an) {
        an = dest.context.createAnalyser();
        an.fftSize = 2048;
        origConnect.call(an, dest);
        taps.set(dest, an);
        window.__taps.push({ analyser: an, buf: new Float32Array(an.fftSize) });
      }
      return origConnect.call(this, an, ...rest);
    }
    return origConnect.call(this, dest, ...rest);
  };
  // Each analyser holds one 2048-sample window (~46ms). Under load the audio
  // thread can stall and hand back the *same* window again; counting those
  // repeats would report stale level as live signal, so frames are
  // deduplicated and only fresh ones are measured.
  window.__meter = (ms) =>
    new Promise((res) => {
      let peak = 0, sum = 0, n = 0, quiet = 0, stale = 0, prev = NaN;
      const iv = setInterval(() => {
        let p = 0, s = 0, sig = 0, len = 0;
        for (const t of window.__taps) {
          t.analyser.getFloatTimeDomainData(t.buf);
          for (let i = 0; i < t.buf.length; i++) {
            const v = t.buf[i];
            const a = Math.abs(v);
            if (a > p) p = a;
            s += v * v;
            if (i % 37 === 0) sig += v * (i + 1);
          }
          len += t.buf.length;
        }
        if (!len || sig === prev) {
          stale++;
          return;
        }
        prev = sig;
        if (p < 0.0008) quiet++;
        peak = Math.max(peak, p);
        sum += s / len;
        n++;
      }, 46);
      setTimeout(() => {
        clearInterval(iv);
        res({ peak, rms: n ? Math.sqrt(sum / n) : 0, quietFrac: n ? quiet / n : 1, frames: n, stale });
      }, ms);
    });
});

await page.goto(url, { waitUntil: "load" });
// Wait on observable state, never a fixed timeout (boot-frame race).
await page.waitForFunction(() => typeof phase !== "undefined" && phase === "attract");
await page.waitForTimeout(500);

// ---- S0: boot into game-owned attract mode ----
check("S0 boot phase is attract", await page.evaluate(() => phase), "attract");
check(
  "S0 game-owned cycle (title undefined)",
  await page.evaluate(() => typeof title),
  "undefined"
);
await page.screenshot({ path: "tests/shots/attract.png" });
check(
  "S0 attract opens on how-to page",
  await page.evaluate(() => window.__cometSlashDebug.attractPage()),
  "howto"
);
await page.evaluate(() => (phaseT = ATTRACT_PAGE_T));
await page.waitForTimeout(80);
check(
  "S0 attract rotates to ranking page",
  await page.evaluate(() => window.__cometSlashDebug.attractPage()),
  "ranking"
);
await page.screenshot({ path: "tests/shots/attract-ranking.png" });
await page.evaluate(() => (phaseT = ATTRACT_PAGE_T * 2));
await page.waitForTimeout(80);
check(
  "S0 attract rotates back to how-to page",
  await page.evaluate(() => window.__cometSlashDebug.attractPage()),
  "howto"
);

// ---- S1: confirm (Z) starts game: attract -> ready -> play ----
await page.keyboard.press("KeyZ");
await page.waitForFunction(() => phase === "ready");
check("S1 Z confirm enters ready", await page.evaluate(() => phase), "ready");
await page.waitForFunction(() => phase === "play", null, { timeout: 4000 });
check("S1 ready advances to play", await page.evaluate(() => phase), "play");
check(
  "S1 audio context running after gesture",
  await page.evaluate(() => Sfx.isReady()),
  true
);
await park();

// ---- S2: movement synonyms (ArrowLeft / KeyD / KeyW) ----
await page.evaluate(() => player.pos.set(100, 170));
const sx0 = await page.evaluate(() => player.pos.x);
await page.keyboard.down("ArrowLeft");
await page.waitForTimeout(300);
await page.keyboard.up("ArrowLeft");
const sx1 = await page.evaluate(() => player.pos.x);
check("S2 ArrowLeft moves left", sx1 < sx0 - 10, true);
await page.keyboard.down("KeyD");
await page.waitForTimeout(300);
await page.keyboard.up("KeyD");
const sx2 = await page.evaluate(() => player.pos.x);
check("S2 KeyD moves right", sx2 > sx1 + 10, true);
const sy0 = await page.evaluate(() => player.pos.y);
await page.keyboard.down("KeyW");
await page.waitForTimeout(300);
await page.keyboard.up("KeyW");
const sy1 = await page.evaluate(() => player.pos.y);
check("S2 KeyW moves up", sy1 < sy0 - 10, true);

// ---- S3: scoring formula via doCut (near-head x5, long-slash x2) ----
await injectSlashTarget();
await page.evaluate(() => doCut(comets[0], 1, false));
const r3 = await page.evaluate(() => ({
  gained: sc - window.__sc0,
  segs: comets[0].segs,
  crystals: crystals.length,
}));
check("S3 cut@k=1 of 6 scores 260 (50*2+10*3, x2 long)", r3.gained, 260);
check("S3 remaining segs = 1", r3.segs, 1);
check("S3 5 crystals spawned", r3.crystals, 5);
await page.evaluate(() => {
  window.__sc0 = sc;
  doCut(comets[0], 0, false);
});
const r3b = await page.evaluate(() => ({
  gained: sc - window.__sc0,
  naked: comets[0].naked,
  fullCuts,
}));
check("S3 cut@k=0 scores 50 (near-head)", r3b.gained, 50);
check("S3 fully cut head becomes naked", r3b.naked, true);
check("S3 full cut counted for wave bonus", r3b.fullCuts, 1);
await page.screenshot({ path: "tests/shots/naked-tail.png" });

// ---- S4: real key slash integration (Space, then KeyZ synonym) ----
await injectSlashTarget();
await page.keyboard.press("Space");
await page.waitForTimeout(250);
const r4 = await page.evaluate(() => ({
  gained: sc - window.__sc0,
  segs: comets[0].segs,
}));
check("S4 Space slash cuts via input", r4.gained > 0 && r4.segs < 6, true);
await injectSlashTarget();
await page.keyboard.press("KeyZ");
await page.waitForTimeout(250);
const r4b = await page.evaluate(() => ({
  gained: sc - window.__sc0,
  segs: comets[0].segs,
}));
check("S4 KeyZ slash cuts via input", r4b.gained > 0 && r4b.segs < 6, true);
await page.screenshot({ path: "tests/shots/play.png" });

// ---- S8: red comet homing (wave>=4) ----
await page.evaluate(() => {
  comets = [];
  warns = [];
  wave = 4;
  player.pos.set(150, 150);
  player.inv = 99999;
  spawnComet({ pos: vec(60, 30), angle: PI / 2 });
  comets[0].red = true;
  comets[0].speed = 1.5;
});
await page.waitForTimeout(1500);
const r8 = await page.evaluate(() => (comets.length ? comets[0].angle : null));
// PI/2 - 0.2 = 1.3708; initial angle was straight down (PI/2)
check("S8 red comet steers toward player", r8 !== null && r8 < 1.3708, true);
await page.screenshot({ path: "tests/shots/red-comet-normal.png" });

// ---- S9: warn -> spawn pipeline ----
await page.evaluate(() => {
  comets = [];
  warns = [];
  quota = 2;
  spawnT = 99999;
  makeWarn();
});
check("S9 makeWarn queues a warn", await page.evaluate(() => warns.length), 1);
const r9a = await page.evaluate(() => ({
  quota,
  targetInside:
    warns[0].target.x >= 52 &&
    warns[0].target.x <= 148 &&
    warns[0].target.y >= 52 &&
    warns[0].target.y <= 148,
  angleError: Math.abs(
    wrap(warns[0].pos.angleTo(warns[0].target) - warns[0].angle, -PI, PI)
  ),
}));
check("S9 warning does not consume quota before spawn", r9a.quota, 2);
check("S9 trajectory aims through inner playfield", r9a.targetInside, true);
check("S9 stored angle points at inner target", r9a.angleError < 0.0001, true);
await page.waitForTimeout(1400);
check(
  "S9 warn becomes a comet after ~60 ticks",
  await page.evaluate(() => comets.length >= 1),
  true
);
check("S9 spawned comet consumes exactly one quota", await page.evaluate(() => quota), 1);
const r9b = await page.evaluate(() => {
  const snapshot = () => {
    const w = warns[0];
    return [w.pos.x, w.pos.y, w.target.x, w.target.y, w.angle, w.red];
  };
  warns = [];
  window.__cometSlashDebug.setSeed(777);
  makeWarn();
  const a = snapshot();
  warns = [];
  window.__cometSlashDebug.setSeed(777);
  makeWarn();
  const b = snapshot();
  warns = [];
  return { a, b };
});
check("S9 fixed seed reproduces the same warning", JSON.stringify(r9b.a), JSON.stringify(r9b.b));

const r9c = await page.evaluate(() => {
  wave = 4;
  quota = 3;
  warns = [];
  comets = [];
  spawnT = 99999;
  makeWarn({ edge: 0, target: vec(100, 100), red: true });
  makeWarn({ edge: 1, target: vec(100, 100), red: false });
  return {
    specs: warns.map((w) => w.red),
    colors: spawnPreviewColors(),
    roles: window.__cometSlashDebug.visualContract(),
  };
});
check("S9 mixed formation retains red/normal warning specs", JSON.stringify(r9c.specs), "[true,false]");
check(
  "S9 spawn preview shows queued red, queued normal, then unknown quota",
  JSON.stringify(r9c.colors),
  '["red","light_purple","blue"]'
);
check(
  "S9 spawn preview colors use declared visual roles",
  JSON.stringify(r9c.colors),
  JSON.stringify([
    r9c.roles.spawnPreviewRed,
    r9c.roles.spawnPreviewNormal,
    r9c.roles.spawnPreviewUnknown,
  ])
);
await page.waitForTimeout(100);
await page.screenshot({ path: "tests/shots/spawn-preview.png" });

// ---- S16: W2 opens with a warned crossing pair ----
await page.evaluate(() => {
  wave = 2;
  quota = 2;
  warns = [];
  comets = [];
  spawnT = 0;
  spawnSerial = 0;
  window.__cometSlashDebug.setSeed(202);
  updateSpawning(false);
});
const r16 = await page.evaluate(() => ({
  count: warns.length,
  quota,
  opposite: warns.length === 2 && warns[1].edge === (warns[0].edge + 2) % 4,
  sharedTarget:
    warns.length === 2 &&
    warns[0].target.x === warns[1].target.x &&
    warns[0].target.y === warns[1].target.y,
}));
check("S16 W2 queues two warnings together", r16.count, 2);
check("S16 formation does not consume quota before spawn", r16.quota, 2);
check("S16 pair enters from opposite edges", r16.opposite, true);
check("S16 pair crosses at a shared inner target", r16.sharedTarget, true);

const r16b = await page.evaluate(() => {
  const collectWavePattern = (w) => {
    wave = w;
    quota = quotaFor(w);
    warns = [];
    comets = [];
    spawnSerial = 0;
    const sizes = [];
    while (quota > 0) {
      if (!queueFormation()) break;
      const count = warns.length;
      sizes.push(count);
      // Resolve the queued formation as a unit so this checks the complete
      // deterministic schedule independently of travel time.
      quota -= count;
      warns = [];
      comets = [];
    }
    return sizes;
  };

  const pressureCase = (w, serial) => {
    wave = w;
    quota = quotaFor(w);
    warns = [];
    comets = [{}];
    spawnSerial = serial;
    const queuedWhileFull = queueFormation();
    const serialWhileFull = spawnSerial;
    const warnedWhileFull = warns.length;
    comets = [];
    const queuedAfterOpen = queueFormation();
    return {
      queuedWhileFull,
      serialWhileFull,
      warnedWhileFull,
      queuedAfterOpen,
      warnedAfterOpen: warns.length,
      serialAfterOpen: spawnSerial,
    };
  };

  const patterns = {
    w2: collectWavePattern(2),
    w4: collectWavePattern(4),
    w7: collectWavePattern(7),
  };
  const pressure = {
    w2Pair: pressureCase(2, 2),
    w4Pair: pressureCase(4, 1),
    w7Triple: pressureCase(7, 2),
  };

  wave = 7;
  quota = 1;
  warns = [];
  comets = [];
  spawnSerial = 2;
  const remainderQueued = queueFormation();
  const remainder = {
    queued: remainderQueued,
    count: warns.length,
    serial: spawnSerial,
  };
  return { patterns, pressure, remainder };
});
// W2's quota is 5 in the compressed opening, so the 2/1 cycle ends on a pair.
check("S16 whole W2 formation pattern is 2/1/2", JSON.stringify(r16b.patterns.w2), "[2,1,2]");
check(
  "S16 W2 formations spend exactly the wave's quota",
  r16b.patterns.w2.reduce((sum, n) => sum + n, 0),
  await page.evaluate(() => quotaFor(2))
);
check("S16 whole W4 formation pattern is all pairs", JSON.stringify(r16b.patterns.w4), "[2,2,2,2]");
check("S16 whole W7 formation pattern preserves 2/2/3 cycle", JSON.stringify(r16b.patterns.w7), "[2,2,3,2,2]");
check(
  "S16 capacity pressure waits without consuming pair/triple sequence",
  Object.values(r16b.pressure).every(
    (v) =>
      v.queuedWhileFull === false &&
      v.serialWhileFull === (v === r16b.pressure.w2Pair ? 2 : v === r16b.pressure.w7Triple ? 2 : 1) &&
      v.warnedWhileFull === 0 &&
      v.queuedAfterOpen === true &&
      v.warnedAfterOpen === (v === r16b.pressure.w7Triple ? 3 : 2) &&
      v.serialAfterOpen === v.serialWhileFull + 1
  ),
  true
);
check("S16 genuine final quota remainder may shrink a triple", JSON.stringify(r16b.remainder), '{"queued":true,"count":1,"serial":3}');

// ---- S17: close pass arms one-shot redline scoring ----
await park();
await page.evaluate(() => {
  wave = 1;
  player.pos.set(100, 100);
  player.inv = 0;
  spawnComet({ pos: vec(85, 110), angle: 0, red: false });
  const c = comets[0];
  c.speed = 1.5;
  c.red = false;
});
await page.waitForFunction(() => comets.length === 1 && comets[0].redlineT > 0);
const r17 = await page.evaluate(() => ({
  tier: comets[0].redlineTier,
  min: comets[0].redlineMin,
  hot: comets[0].redlineT,
  claimed: comets[0].redlineClaimed,
}));
check("S17 non-colliding close pass arms RAZOR", r17.tier, "RAZOR");
check("S17 closest approach stays outside collision", r17.min >= 8, true);
check("S17 redline window is active before the cut", r17.hot > 0, true);
check("S17 opportunity is initially unclaimed", r17.claimed, false);
await page.screenshot({ path: "tests/shots/redline.png" });
const r17b = await page.evaluate(() => {
  const c = comets[0];
  c.speed = 0;
  c.segs = 6;
  c.hist = [];
  for (let i = 0; i < 80; i++) c.hist.push(vec(124 - i, 100));
  const s0 = sc;
  doCut(c, 1, false); // base 130 + long 130 + RAZOR 260
  const first = sc - s0;
  const s1 = sc;
  doCut(c, 0, false); // same comet cannot claim risk twice
  return {
    first,
    second: sc - s1,
    claimed: c.redlineClaimed,
    bonus: c.redlineBonus,
    bonusPopup: popups.find((p) => p.txt.includes("BONUS"))?.txt,
    popupOnscreen: popups
      .filter((p) => p.txt.includes("BONUS"))
      .every((p) => p.pos.x >= 42 && p.pos.x <= 158 && p.pos.y >= 18 && p.pos.y <= 174),
  };
});
check("S17 RAZOR long slash scores additive x4", r17b.first, 520);
check("S17 same comet cannot claim redline twice", r17b.second, 50);
check("S17 redline opportunity is consumed", r17b.claimed, true);
check("S17 telemetry records only the risk bonus", r17b.bonus, 260);
check("S17 named takedown bonus remains visible", r17b.bonusPopup, "RAZOR BONUS +260");
check("S17 named bonus popup is clamped on-screen", r17b.popupOnscreen, true);
await page.screenshot({ path: "tests/shots/redline-bonus.png" });
const r17c = await page.evaluate(() => {
  comets = [];
  spawnComet({ pos: vec(100, 100), angle: 0, red: false });
  const c = comets[0];
  c.redlineArmed = true;
  c.redlineMin = 7.5; // inside the collision boundary
  c.prevPlayerDist = 7.5;
  updateRedline(c, 9);
  const collisionBreach = { hot: c.redlineT, armed: c.redlineArmed };
  c.redlineArmed = false;
  c.redlineMin = 999;
  c.prevPlayerDist = 10;
  updateRedline(c, 12); // receding without a prior approach
  const result = {
    collisionBreach,
    recedingOnly: { hot: c.redlineT, armed: c.redlineArmed },
  };
  comets = [];
  player.inv = 99999;
  return result;
});
check("S17 collision-boundary breach gives no redline", r17c.collisionBreach.hot, 0);
check("S17 collision-boundary breach disarms the opportunity", r17c.collisionBreach.armed, false);
check("S17 receding proximity alone cannot arm redline", r17c.recedingOnly.hot, 0);

// ---- S18: redline display contract matches scoring thresholds ----
await page.evaluate(() => {
  quota = 1;
  spawnT = 99999;
  warns = [];
  comets = [];
  crystals = [];
  popups = [];
  rings = [];
  player.pos.set(100, 100);
  player.inv = 99999;
  spawnComet({ pos: vec(114, 100), angle: 0, red: false });
  const c = comets[0];
  c.speed = 0;
  c.redlineArmed = true;
  c.redlineMin = 14;
  c.prevPlayerDist = 15;
});
// Let unrelated built-in particles from earlier scoring cases expire so this
// screenshot isolates the intentionally cue-free approach state.
await page.waitForTimeout(700);
const r18 = await page.evaluate(() => ({
  trackedTier: redlineTier(comets[0].pos.distanceTo(player.pos)).name,
  contract: window.__cometSlashDebug.visualContract(),
  rings: rings.length,
}));
check("S18 14px approach still tracks CLOSE eligibility internally", r18.trackedTier, "CLOSE");
check("S18 pre-eligibility risk preview is disabled", r18.contract.metrics.approachRiskPreview, false);
check("S18 visible redline outer radius equals scoring radius", r18.contract.metrics.redlineRadius, 22);
check("S18 CLOSE and NEAR use distinct halo colors", r18.contract.risk.CLOSE.halo !== r18.contract.risk.NEAR.halo, true);
check("S18 CLOSE and RAZOR use distinct halo colors", r18.contract.risk.CLOSE.halo !== r18.contract.risk.RAZOR.halo, true);
check("S18 effect rings stay within visual budget", r18.rings <= r18.contract.metrics.effectRingCap, true);
await page.screenshot({ path: "tests/shots/redline-close.png" });

const r18b = await page.evaluate(() => {
  const cases = [
    { name: "NEAR", min: 18, bonus: 65 },
    { name: "CLOSE", min: 14, bonus: 130 },
    { name: "RAZOR", min: 9, bonus: 260 },
  ];
  const awarded = cases.map((spec) => {
    comets = [];
    popups = [];
    spawnComet({ pos: vec(124, 100), angle: 0, red: false });
    const c = comets[0];
    c.speed = 0;
    c.segs = 6;
    c.hist = [];
    for (let i = 0; i < 80; i++) c.hist.push(vec(124 - i, 100));
    c.redlineT = REDLINE_T;
    c.redlineTier = spec.name;
    c.redlineMin = spec.min;
    const before = sc;
    doCut(c, 1, false);
    return {
      name: spec.name,
      gained: sc - before,
      popup: popups.find((p) => p.txt.includes("BONUS"))?.txt,
      expectedGain: 260 + spec.bonus,
      expectedPopup: `${spec.name} BONUS +${spec.bonus}`,
    };
  });

  comets = [];
  popups = [];
  spawnComet({ pos: vec(124, 100), angle: 0, red: false });
  const early = comets[0];
  early.speed = 0;
  early.segs = 6;
  early.hist = [];
  for (let i = 0; i < 80; i++) early.hist.push(vec(124 - i, 100));
  early.redlineArmed = true;
  early.redlineMin = 14;
  early.redlineT = 0;
  const beforeEarly = sc;
  doCut(early, 1, false);
  return {
    awarded,
    earlyGain: sc - beforeEarly,
    earlyFeedback: popups.find((p) => p.txt === "PASS FIRST")?.txt,
    earlyBonus: popups.some((p) => p.txt.includes("BONUS")),
  };
});
check(
  "S18 NEAR/CLOSE/RAZOR each award and label their exact bonus",
  r18b.awarded.every(
    (v) => v.gained === v.expectedGain && v.popup === v.expectedPopup
  ),
  true
);
check("S18 cutting before the pass awards base/long points only", r18b.earlyGain, 260);
check("S18 an early cut explains why risk bonus was ineligible", r18b.earlyFeedback, "PASS FIRST");
check("S18 an early cut cannot emit a risk bonus label", r18b.earlyBonus, false);

// ---- S12: whiff has a larger recovery than a successful swing ----
await park();
await page.evaluate(() => {
  player.cool = 0;
  player.swing = 0;
  player.swingHit = false;
});
await page.keyboard.press("Space");
await page.waitForFunction(() => player.swing === 0 && player.cool > 0);
const r12 = await page.evaluate(() => ({ cool: player.cool, hit: player.swingHit }));
check("S12 empty swing is marked as a whiff", r12.hit, false);
check("S12 whiff recovery remains visibly active", r12.cool > 8, true);

// ---- S13: pause aliases freeze play and stop the BGM transport ----
await page.evaluate(() => {
  spawnComet({ pos: vec(60, 60), angle: 0, red: false });
  comets[0].speed = 0;
});
await page.waitForTimeout(100);
await page.keyboard.press("KeyP");
await page.waitForFunction(() => phase === "paused");
const r13 = await page.evaluate(() => ({
  phase,
  bgmRunning: Sfx.debug().bgmRunning,
  cometAges: comets.map((c) => c.age),
}));
await page.waitForTimeout(250);
const r13b = await page.evaluate(() => ({
  phase,
  cometAges: comets.map((c) => c.age),
}));
check("S13 P enters explicit pause", r13.phase, "paused");
check("S13 pause stops BGM transport", r13.bgmRunning, false);
check(
  "S13 paused world does not advance",
  JSON.stringify(r13b.cometAges),
  JSON.stringify(r13.cometAges)
);
const r13c = await page.evaluate(() => window.__cometSlashDebug.visualContract());
check(
  "S13 pause text uses only strong non-light palette roles",
  [
    r13c.pauseShadow,
    r13c.pauseTitle,
    r13c.pauseInstructionShadow,
    r13c.pauseInstruction,
  ].every((name) => typeof name === "string" && !name.startsWith("light_")),
  true
);
await page.screenshot({ path: "tests/shots/paused.png" });
await page.keyboard.press("Escape");
await page.waitForFunction(() => phase === "play", null, { timeout: 3000 });
check("S13 Escape resumes after count-in", await page.evaluate(() => phase), "play");

// ---- S14: machine-readable visual/audio contracts ----
const r14 = await page.evaluate(() => ({
  visual: window.__cometSlashDebug.visualContract(),
  sprites: window.__cometSlashDebug.spriteContract(),
  audio: Sfx.debug(),
}));
check("S14 player and blue tail use distinct roles", r14.visual.player !== r14.visual.tailBlue, true);
check("S14 warning and red danger use distinct roles", r14.visual.warning !== r14.visual.danger, true);
check("S14 enemy sprites have no solid backdrop", r14.visual.metrics.enemySolidBackdrop, false);
check("S14 naked flash is a ring instead of a box", r14.visual.metrics.nakedFlashShape, "ring");
check(
  "S14 normal comet sprite uses light-purple pixels",
  await page.evaluate(
    () =>
      PIXEL_SPRITES.cometNormal.rows.some((row) => row.includes("p")) &&
      !PIXEL_SPRITES.cometNormal.rows.some((row) => row.includes("r"))
  ),
  true
);
check(
  "S14 title emblem is a 24x12 generated sprite",
  JSON.stringify(r14.sprites.titleEmblem.size),
  "[24,12]"
);
check("S14 player has four generated directions", r14.sprites.player.length, 4);
check(
  "S14 comet species use distinct generated sources",
  r14.sprites.cometNormal.source !== r14.sprites.cometTracker.source,
  true
);
check("S14 all three ceremony sprites are wired", r14.sprites.ceremonies.length, 3);
check(
  "S14 wave and lives use strong standard-yellow HUD roles",
  r14.visual.hudWave === "yellow" && r14.visual.hudLives === "yellow",
  true
);
check("S14 HUD keyline avoids white-mapped black", r14.visual.hudShadow, "blue");
check("S14 HI uses readable standard purple", r14.visual.hudHigh, "purple");
check(
  "S14 life icons use an intrinsic standard-yellow HUD sprite",
  await page.evaluate(() => characters[6].includes("y") && !characters[6].includes("Y")),
  true
);
check("S14 naked trail uses a subordinate neutral role", r14.visual.nakedTrail, "light_black");
check(
  "S14 naked trail cannot mimic either scoreable tail",
  r14.visual.nakedTrail !== r14.visual.tailBlue &&
    r14.visual.nakedTrail !== r14.visual.tailBlueHalo &&
    r14.visual.nakedTrail !== r14.visual.tailRed &&
    r14.visual.nakedTrail !== r14.visual.tailRedHalo,
  true
);
check("S14 cut debris uses a subordinate neutral role", r14.visual.cutDebris, "light_black");
check(
  "S14 cut debris cannot mimic either scoreable tail",
  r14.visual.cutDebris !== r14.visual.tailBlue &&
    r14.visual.cutDebris !== r14.visual.tailBlueHalo &&
    r14.visual.cutDebris !== r14.visual.tailRed &&
    r14.visual.cutDebris !== r14.visual.tailRedHalo,
  true
);
check("S14 player uses distinct halo and body colors", r14.visual.playerHalo !== r14.visual.player, true);
check("S14 blue tail uses distinct halo and body colors", r14.visual.tailBlueHalo !== r14.visual.tailBlue, true);
check("S14 red tail uses distinct halo and body colors", r14.visual.tailRedHalo !== r14.visual.tailRed, true);
check(
  "S14 red comet normal tail uses the shared blue/cyan scoreable roles",
  r14.visual.tailRed === r14.visual.tailBlue &&
    r14.visual.tailRedHalo === r14.visual.tailBlueHalo &&
    r14.visual.tailRedCore === r14.visual.tailBlueCore,
  true
);
check(
  "S14 normal red-comet tail remains distinct from actionable RAZOR glow",
  r14.visual.tailRedHalo !== r14.visual.risk.RAZOR.halo &&
    r14.visual.tailRedCore !== r14.visual.risk.RAZOR.core,
  true
);
check("S14 background has three color layers", new Set([r14.visual.starFar, r14.visual.starMid, r14.visual.starNear]).size, 3);
check("S14 audio uses bounded voices", r14.audio.voices <= 24, true);
const r14b = await page.evaluate(() => {
  const before = Sfx.debug().voices;
  Sfx.emit("slash:long", { count: 8, demo: true });
  const d = Sfx.debug();
  return { before, after: d.voices, last: d.events[d.events.length - 1] };
});
check("S14 demo event is tagged", r14b.last.demo, true);
check("S14 demo event creates no audio voice", r14b.after, r14b.before);
check(
  "S14 every SE/jingle stays within duration and step budgets",
  Object.values(r14.audio.programs).every(
    (p) => p.steps <= 24 && p.duration <= (p.kind === "se" ? 0.6 : 1.6)
  ),
  true
);

// ---- S15: score extend is causal and advances its threshold ----
const r15 = await page.evaluate(() => {
  const old = { sc, lives, nextExtend };
  sc = 19990;
  lives = 2;
  nextExtend = 20000;
  awardScore(20);
  const result = { sc, lives, nextExtend };
  sc = old.sc;
  lives = old.lives;
  nextExtend = old.nextExtend;
  return result;
});
check("S15 crossing the first extend awards one life", r15.lives, 3);
check("S15 extend threshold advances by the repeat step", r15.nextExtend, 60000);

// ---- S5: head contact = miss, dying -> respawn with invincibility ----
await page.evaluate(() => {
  comets = [];
  warns = [];
  spawnComet({ pos: vec(100, 150), angle: 0 });
  comets[0].speed = 0;
  player.pos.set(100, 150);
  player.inv = 0;
  fullCuts = 2;
  window.__l0 = lives;
});
await page.waitForFunction(() => phase === "dying");
const r5 = await page.evaluate(() => ({ lives, l0: window.__l0 }));
check("S5 head contact costs one life", r5.lives, r5.l0 - 1);
check("S5 miss resets wave full-cut bonus", await page.evaluate(() => fullCuts), 0);
await page.waitForFunction(() => phase === "play", null, { timeout: 4000 });
const r5b = await page.evaluate(() => ({ inv: player.inv, x: player.pos.x }));
check("S5 respawn grants invincibility", r5b.inv > 50, true);

// ---- S6: wave-clear bonus = 25 x wave x fullCuts (and 0 when idle) ----
await park();
await page.evaluate(() => {
  wave = 2;
  fullCuts = 2;
  quota = 0; // now the clear branch may fire
  window.__sc0 = sc;
});
await page.waitForFunction(() => phase === "waveclear");
const r6 = await page.evaluate(() => sc - window.__sc0);
check("S6 bonus = 25 x W2 x 2 full cuts", r6, 100);
await page.screenshot({ path: "tests/shots/waveclear.png" });
// The clear is a win, so it celebrates instead of repeating the death burst,
// and the ship keeps flying rather than vanishing for the ceremony.
await page.waitForFunction(() => phase === "waveclear" && phaseT >= 6, null, { timeout: 4000 });
check("S6 the clear launches fireworks", await page.evaluate(() => crystals.length > 0), true);
const r6fx = await page.evaluate(() => {
  phaseT = 5; // widen the ceremony window for the input check below
  window.__px = player.pos.x;
  return player.pos.x;
});
await page.keyboard.down("ArrowLeft");
await page.waitForTimeout(200);
const r6ship = await page.evaluate(() => ({ x: player.pos.x, phase }));
await page.keyboard.up("ArrowLeft");
check("S6 the ship is still flyable during the clear", r6ship.x < r6fx, true);
check("S6 the clear ceremony is not skipped by flying", r6ship.phase, "waveclear");
await page.waitForFunction(() => phase === "play", null, { timeout: 5000 });
const r6b = await page.evaluate(() => ({ wave, quota, fullCuts }));
check("S6 wave increments to 3", r6b.wave, 3);
check("S6 new quota = quotaFor(3)", r6b.quota, 6);
check("S6 fullCuts resets", r6b.fullCuts, 0);
// The same cut count is worth more later: a finite run is back-loaded.
const r6d = await page.evaluate(() => [
  waveBonusFor(2, 2),
  waveBonusFor(12, 2),
  isPerfectWave(2, quotaFor(2)),
  isPerfectWave(2, quotaFor(2) - 1),
]);
check("S6 late waves pay more for identical work", r6d[1] > r6d[0], true);
check("S6 sweeping a wave's whole quota is perfect", r6d[2], true);
check("S6 one escaped comet breaks perfect", r6d[3], false);
// S6b: clear again with no cuts -> zero bonus (no idle income)
await page.evaluate(() => {
  quota = 0;
  comets = [];
  warns = [];
  fullCuts = 0;
  window.__sc0 = sc;
});
await page.waitForFunction(() => phase === "waveclear");
const r6c = await page.evaluate(() => sc - window.__sc0);
check("S6b clear with zero cuts pays zero", r6c, 0);
await page.waitForFunction(() => phase === "play", null, { timeout: 5000 });

// ---- S7: game over, hi-score persist, name entry, then attract ----
await park();
await page.evaluate(() => {
  lives = 1;
  spawnComet({ pos: vec(100, 170), angle: 0 });
  comets[0].speed = 0;
  player.pos.set(100, 170);
  player.inv = 0;
});
await page.waitForFunction(() => phase === "gameover");
check("S7 last life triggers gameover", await page.evaluate(() => phase), "gameover");
await page.waitForTimeout(400);
await page.screenshot({ path: "tests/shots/gameover.png" });
const r7 = await page.evaluate(() => ({
  stored: +localStorage.getItem("cometSlashHi") || 0,
  sc,
}));
check("S7 hi-score persisted to localStorage", r7.stored >= r7.sc && r7.sc > 0, true);
await page.waitForTimeout(1500); // pass the phaseT>90 gate
await page.keyboard.press("Enter");
await page.waitForFunction(() => phase === "nameentry");
check("S7 qualifying score enters name entry", await page.evaluate(() => phase), "nameentry");
// The alphabet wraps backwards through the three separators, not straight to Z.
await page.keyboard.press("ArrowDown"); // A -> space
await page.waitForTimeout(80);
await page.keyboard.press("ArrowDown"); // space -> dash
await page.waitForTimeout(80);
check("S7 name entry offers separators below A", await page.evaluate(() => nameChars[0]), "-");
await page.keyboard.press("ArrowUp");
await page.waitForTimeout(80);
await page.keyboard.press("ArrowUp"); // back to A
await page.waitForTimeout(80);
check("S7 separators wrap back to A", await page.evaluate(() => nameChars[0]), "A");
await page.keyboard.press("ArrowUp"); // A -> B (arrow alias)
await page.waitForTimeout(80);
await page.keyboard.press("KeyD"); // cursor right (WASD alias)
await page.waitForTimeout(80);
await page.keyboard.press("KeyW"); // A -> B (WASD alias)
await page.waitForTimeout(80);
await page.screenshot({ path: "tests/shots/nameentry.png" });
await page.keyboard.press("Enter"); // advance to third character
await page.waitForTimeout(100);
await page.keyboard.press("Enter"); // commit BBA
await page.waitForFunction(() => phase === "scores");
const r7b = await page.evaluate(() => JSON.parse(localStorage.getItem("cometSlashScores")));
check("S7 name entry stores initials", r7b[0].name, "BBA");
check("S7 committed name opens score table", await page.evaluate(() => phase), "scores");
await page.waitForTimeout(400);
await page.keyboard.press("Enter");
await page.waitForFunction(() => phase === "ready");
check("S7 Enter starts a direct retry", await page.evaluate(() => phase), "ready");
await page.evaluate(() => returnToAttract());
await page.waitForFunction(() => phase === "attract");

// ---- S17: BGM is audible, phase-correct, and stays under the SEs ----
check("S17 attract stays music-free", await page.evaluate(() => Sfx.debug().bgmRunning), false);
const r17tracks = await page.evaluate(() => Sfx.debug().tracks);
check(
  "S17 both tracks declare a multi-second loop",
  r17tracks.play.loop > 3 && r17tracks.rank.loop > 3,
  true
);
await page.evaluate(() => {
  startGame();
  phaseT = 9999; // skip the READY hold
});
await page.waitForFunction(() => phase === "play", null, { timeout: 4000 });
await park();
const r17play = await page.evaluate(() => Sfx.debug());
check("S17 play runs the gameplay track", r17play.bgmTrack, "play");
check("S17 play transport is running", r17play.bgmRunning, true);
check("S17 BGM stays inside its reserved voice budget", r17play.bgmVoices <= 12, true);
check("S17 no voice outlives its scheduled tail (pool does not leak)", r17play.voiceLife.every((s) => s < 2), true);
// One full loop of the gameplay theme, measured at the master output with the
// gameplay SEs parked: this is the check that would have caught the inaudible
// 55Hz bass-only loop.
const r17loopMs = Math.round(r17tracks.play.loop * 1000);
const r17lvl = await meter(r17loopMs);
// Level checks depend on the headless sink actually rendering. When it stalls
// the window is unmeasured, not failing: report that instead of inventing a
// verdict, and keep the deterministic transport checks above as the hard gate.
if (!live(r17lvl)) {
  skip("S17 output-level checks", r17lvl);
} else {
  check("S17 gameplay BGM reaches the output", r17lvl.rms > 0.002, true);
  check("S17 gameplay BGM sounds through most of the loop", r17lvl.quietFrac < 0.4, true);
  check("S17 gameplay BGM does not clip", r17lvl.peak < 0.9, true);
  // ...and the level really is the music: stopping the transport must drop it.
  await park();
  await page.evaluate(() => Sfx.stopBgm());
  await page.waitForTimeout(1500); // let tails and any render backlog drain
  const r17off = await meter(1200);
  const r17offState = await page.evaluate(() => ({
    phase,
    events: Sfx.debug().events.slice(-3).map((e) => e.name),
  }));
  if (!live(r17off)) skip("S17 transport-off level check", r17off);
  else check("S17 stopping the transport removes that level", r17off.rms < r17lvl.rms / 3, true);
  console.log(
    "  (bgm rms:", r17lvl.rms.toFixed(4),
    `frames ${r17lvl.frames}/${r17lvl.frames + r17lvl.stale}`,
    "| stopped:", r17off.rms.toFixed(4),
    "in phase", r17offState.phase, "last events", JSON.stringify(r17offState.events), ")"
  );
  // Control feedback has to punch through the music bed, not sit inside it.
  const r17se = await page.evaluate(async () => {
    const p = window.__meter(700);
    Sfx.emit("slash:cut", { count: 5 });
    setTimeout(() => Sfx.emit("slash:cut", { count: 5 }), 300);
    return p;
  });
  if (!live(r17se)) skip("S17 SE-over-music check", r17se);
  else check("S17 a single SE peaks well above the music bed", r17se.peak > r17lvl.rms * 3, true);
}
// Ranking screens carry their own theme.
await page.evaluate(() => {
  sc = 99999;
  beginNameEntry();
});
const r17name = await page.evaluate(() => Sfx.debug());
check("S17 name entry switches to the ranking track", r17name.bgmTrack, "rank");
check("S17 name entry restarts the track from its head", r17name.bgmStep < 4, true);
const r17rank = await meter(1500);
if (!live(r17rank)) skip("S17 ranking-BGM level check", r17rank);
else check("S17 ranking BGM reaches the output", r17rank.rms > 0.002, true);
await page.keyboard.press("Enter");
await page.waitForTimeout(120);
await page.keyboard.press("Enter");
await page.waitForTimeout(120);
await page.keyboard.press("Enter");
await page.waitForFunction(() => phase === "scores");
const r17scores = await page.evaluate(() => Sfx.debug());
check("S17 score table keeps the ranking track", r17scores.bgmTrack, "rank");
check("S17 score table transport is running", r17scores.bgmRunning, true);
await page.evaluate(() => returnToAttract());
await page.waitForFunction(() => phase === "attract");
check(
  "S17 leaving the ranking stops the music",
  await page.evaluate(() => Sfx.debug().bgmRunning),
  false
);

// ---- S10: idle bot never scores (anti-degenerate invariant) ----
await page.evaluate(() => {
  window.__cometSlashDebug.setSeed(4242);
  startGame();
});
await page.waitForFunction(() => phase === "play", null, { timeout: 5000 });
await page.waitForTimeout(12000);
const r10 = await page.evaluate(() => ({ sc, phase, lives }));
check("S10 idle 12s scores exactly 0", r10.sc, 0);
console.log("  (idle end state:", JSON.stringify(r10), ")");

// ---- S11: active bot out-scores idle ----
await page.evaluate(() => {
  window.__cometSlashDebug.setSeed(4242);
  startGame();
});
await page.waitForFunction(() => phase === "play", null, { timeout: 5000 });
let maxSc = 0;
for (let i = 0; i < 110; i++) {
  const st = await page.evaluate(() => ({
    phase,
    sc,
    px: player.pos.x,
    py: player.pos.y,
    targets: comets
      .filter((c) => c.segs > 0)
      .map((c) => {
        const s = segPos(c, floor(c.segs / 2));
        return { x: s.x, y: s.y };
      }),
  }));
  maxSc = Math.max(maxSc, st.sc);
  if (st.phase === "gameover") {
    await page.keyboard.press("KeyZ");
    await page.waitForTimeout(400);
    await page.keyboard.press("KeyZ");
    await page.waitForTimeout(400);
    continue;
  }
  if (st.phase !== "play") {
    await page.waitForTimeout(200);
    continue;
  }
  if (st.targets.length) {
    const t = st.targets[0];
    const dx = t.x - st.px,
      dy = t.y - st.py;
    const keys = [];
    if (Math.abs(dx) > 4) keys.push(dx > 0 ? "ArrowRight" : "ArrowLeft");
    if (Math.abs(dy) > 4) keys.push(dy > 0 ? "ArrowDown" : "ArrowUp");
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(150);
    for (const k of keys) await page.keyboard.up(k);
    if (Math.hypot(dx, dy) < 22) await page.keyboard.press("KeyZ");
  } else {
    await page.waitForTimeout(200);
  }
}
check("S11 active bot scores > 0 (idle scored 0)", maxSc > 0, true);
console.log("  (active bot maxSc:", maxSc, ")");

// ---- S19: the campaign is a budget spread across W1..W16, not an asymptote ----
const r19 = await page.evaluate(() => window.__cometSlashDebug.campaign());
check("S19 the run is a finite 16-wave campaign", r19.finalWave, 16);
// The defect this guards: a dial that reaches its ceiling early leaves the
// last waves structurally identical to the ones before them.
const lastChange = (pick) => {
  let at = 1;
  for (let i = 1; i < r19.waves.length; i++) {
    if (pick(r19.waves[i]) !== pick(r19.waves[i - 1])) at = i + 1;
  }
  return at;
};
const dials = {
  speed: (w) => w.speed,
  interval: (w) => w.interval,
  cap: (w) => w.cap,
  tail: (w) => w.tail,
  meander: (w) => w.meander,
  red: (w) => w.red,
  warnLead: (w) => w.warnLead,
};
const saturation = Object.fromEntries(
  Object.entries(dials).map(([name, pick]) => [name, lastChange(pick)])
);
console.log("  (saturation wave per dial:", JSON.stringify(saturation), ")");
check(
  "S19 no dial stops moving before W11",
  Math.min(...Object.values(saturation)) >= 11,
  true
);
check(
  "S19 pressure still rises entering the final wave",
  Object.values(saturation).filter((w) => w === 16).length >= 5,
  true
);
check(
  "S19 spawn interval is monotonically tighter",
  r19.waves.every((w, i) => i === 0 || w.interval <= r19.waves[i - 1].interval),
  true
);
check(
  "S19 warning lead only shrinks, and never below reaction time",
  r19.waves.every((w, i) => (i === 0 || w.warnLead <= r19.waves[i - 1].warnLead) && w.warnLead >= 40),
  true
);
// A formation larger than its own wave's cap could never be queued, and the
// wave's quota would never drain.
check(
  "S19 every wave's cap can hold its largest formation",
  r19.waves.every((w) => w.cap >= Math.max(...w.formation)),
  true
);
check(
  "S19 opening waves are compressed against the 4+w baseline",
  r19.waves.slice(0, 3).every((w) => w.quota === 3 + w.wave),
  true
);
const totalComets = r19.waves.reduce((sum, w) => sum + w.quota, 0);
console.log("  (comets in a full run:", totalComets, ")");
check("S19 a full run stays in arcade length", totalComets >= 150 && totalComets <= 240, true);

// ---- S20: W16 clear ends the run with a tallied ALL CLEAR ----
await page.evaluate(() => {
  window.__cometSlashDebug.setSeed(1616);
  startGame();
});
await page.waitForFunction(() => phase === "play", null, { timeout: 5000 });
// Boundary: the wave before the last still advances the campaign.
await park();
await page.evaluate(() => {
  wave = 15;
  fullCuts = 0;
  quota = 0;
});
await page.waitForFunction(() => phase !== "play", null, { timeout: 4000 });
check("S20 W15 clear is an ordinary wave transition", await page.evaluate(() => phase), "waveclear");
await page.waitForFunction(() => phase === "play", null, { timeout: 5000 });
check("S20 the campaign advances to its final wave", await page.evaluate(() => wave), 16);

await park();
await page.evaluate(() => {
  lives = 1;
  misses = 1;
  sc = 1000;
  fullCuts = 0;
  nextExtend = 9999999; // isolate the tally from extend feedback
  quota = 0;
});
await page.waitForFunction(() => phase === "allclear", null, { timeout: 4000 });
const r20 = await page.evaluate(() => ({ ...window.__cometSlashDebug.state() }));
check("S20 clearing W16 wins the run instead of looping", r20.phase, "allclear");
check("S20 a missed run earns no no-miss bonus", r20.clearBonus.noMiss, 0);
check("S20 ship bonus is 5000 x ships held at the clear", r20.clearBonus.ships, 5000);
check("S20 tally total = base + ships + no-miss", r20.clearBonus.total, 35000);
check("S20 the tally is not paid before it is shown", r20.sc, 1000);
await page.waitForFunction(() => phaseT > 60, null, { timeout: 4000 });
check("S20 the first stage pays the ALL CLEAR base", await page.evaluate(() => sc), 31000);
await page.waitForFunction(() => phaseT > 180, null, { timeout: 4000 });
check("S20 the finished tally pays exactly its total", await page.evaluate(() => sc), 36000);
check(
  "S20 extends granted by the tally cannot inflate the ship bonus",
  await page.evaluate(() => window.__cometSlashDebug.state().clearBonus.shipCount),
  1
);
// Shoot the finished screen: every tally line, the final score, and the prompt.
await page.waitForFunction(() => phaseT > 240, null, { timeout: 4000 });
await page.screenshot({ path: "tests/shots/allclear.png" });
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
check("S20 a qualifying clear hands off to name entry", await page.evaluate(() => phase), "nameentry");
const r20b = await page.evaluate(() => ({
  hi,
  stored: +localStorage.getItem("cometSlashHi"),
}));
check("S20 a winning run persists its hi-score", r20b.stored >= 36000 && r20b.hi >= 36000, true);

// An all-space name must not leave a blank row in the table.
await page.evaluate(() => {
  nameChars = [" ", " ", " "];
  commitNameEntry();
});
const r20blank = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("cometSlashScores"))
);
check("S20 a blank name falls back to the default initials", r20blank[0].name, "AAA");

// A clean run collects the no-miss award the missed run could not.
await page.evaluate(() => {
  returnToAttract();
  window.__cometSlashDebug.setSeed(1717);
  startGame();
});
await page.waitForFunction(() => phase === "play", null, { timeout: 5000 });
await park();
await page.evaluate(() => {
  wave = 16;
  lives = 3;
  misses = 0;
  fullCuts = 0;
  quota = 0;
});
await page.waitForFunction(() => phase === "allclear", null, { timeout: 4000 });
const r20c = await page.evaluate(() => window.__cometSlashDebug.state().clearBonus);
check("S20 a no-miss clear collects the full tally", r20c.total, 30000 + 15000 + 20000);
check("S20 no-miss bonus is awarded only when misses === 0", r20c.noMiss, 20000);

// ---- S21: hit stop is graded by rarity, and the hull breaks up after it ----
// The stop is presentation only, so the checks are that nothing in the world
// advances during it, that it always drains, and that the swing a player
// commits to inside it is replayed instead of eaten.
await page.evaluate(() => {
  returnToAttract();
  window.__cometSlashDebug.setSeed(4242);
  startGame();
});
await page.waitForFunction(() => phase === "play", null, { timeout: 5000 });

// `partial: true` stands the player off near the tail's far end so the swing
// lands mid-tail: a cut from index 0 fully slashes the comet, and the naked stop
// would then mask the tier stop under test.
const injectTierTarget = (redlineMin, { segs = 6, partial = false } = {}) =>
  page.evaluate(
    ({ redlineMin, segs, partial }) => {
      comets = [];
      crystals = [];
      spawnComet({ pos: vec(124, 100), angle: 0 });
      const c = comets[0];
      c.speed = 0;
      c.segs = segs;
      c.hist = [];
      for (let i = 0; i < 80; i++) c.hist.push(vec(124 - i, 100));
      if (redlineMin !== null) {
        c.redlineT = REDLINE_T;
        c.redlineArmed = true;
        c.redlineClaimed = false;
        c.redlineMin = redlineMin;
      }
      player.pos.set(partial ? 60 : 100, 100);
      player.dir = 0;
      player.cool = 0;
      player.swing = 0;
      player.inv = 99999;
    },
    { redlineMin, segs, partial }
  );

const swingAndPeek = async () => {
  await page.evaluate(() => {
    window.__peek = [];
    const step = () => {
      window.__peek.push({
        hitStop: window.__cometSlashDebug.freeze().hitStop,
        naked: comets[0] ? comets[0].segs === 0 : null,
        x: comets[0] ? Math.round(comets[0].pos.x * 100) / 100 : null,
      });
      if (window.__peek.length < 24) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  await page.keyboard.press("KeyZ");
  await page.waitForTimeout(450);
  return page.evaluate(() => window.__peek);
};
const maxStop = (peek) => peek.reduce((m, p) => Math.max(m, p.hitStop), 0);
const stayedAlive = (peek) => peek.every((p) => p.naked === false);

const r21contract = await page.evaluate(
  () => window.__cometSlashDebug.visualContract().metrics
);
check("S21 the era answer to impact is a stop, not a shake", r21contract.cameraShake, false);

await park();
await injectTierTarget(18, { segs: 14, partial: true });
const r21near = await swingAndPeek();
check("S21 the NEAR case cuts without fully slashing", stayedAlive(r21near), true);
check("S21 the common NEAR tier never stops the world", maxStop(r21near), 0);

await park();
await injectTierTarget(14, { segs: 14, partial: true });
const r21close = await swingAndPeek();
check("S21 the CLOSE case cuts without fully slashing", stayedAlive(r21close), true);
check("S21 CLOSE stops for its 3 ticks", maxStop(r21close), r21contract.hitStop.CLOSE);

await park();
await injectTierTarget(9, { segs: 14, partial: true });
const r21razor = await swingAndPeek();
check("S21 the RAZOR case cuts without fully slashing", stayedAlive(r21razor), true);
check("S21 the rarest tier gets the longest cut stop", maxStop(r21razor), r21contract.hitStop.RAZOR);
check(
  "S21 stop length rises with tier rarity",
  maxStop(r21near) < maxStop(r21close) && maxStop(r21close) < maxStop(r21razor),
  true
);

await park();
await injectTierTarget(null, { segs: 2 });
const r21naked = await swingAndPeek();
check("S21 a full slash stops on its own budget", maxStop(r21naked), r21contract.hitStop.naked);

// Nothing may move while the world is stopped, and the stop must always drain.
await park();
await page.evaluate(() => {
  comets = [];
  spawnComet({ pos: vec(124, 100), angle: 0 });
  const c = comets[0];
  c.segs = 2;
  c.speed = 1.5;
  c.hist = [];
  for (let i = 0; i < 80; i++) c.hist.push(vec(124 - i, 100));
  player.pos.set(100, 100);
  player.dir = 0;
  player.cool = 0;
  player.inv = 99999;
});
const r21trace = await swingAndPeek();
const frozenFrames = r21trace.filter((f) => f.hitStop > 0);
check(
  "S21 comet position is held on every frozen frame",
  frozenFrames.length > 0 && frozenFrames.every((f, i) => i === 0 || f.x === frozenFrames[i - 1].x),
  true
);
check("S21 the stop always drains to zero", await page.evaluate(() => window.__cometSlashDebug.freeze().hitStop), 0);
check("S21 the world moves again after the stop", r21trace[r21trace.length - 1].x !== frozenFrames[0].x, true);

// A real 3-6 tick stop is too short to aim a keypress into, so the stop is held
// open artificially here: the mechanism under test is the input buffer, not the
// duration the tier checks above already pin down.
await park();
await injectTierTarget(null, { segs: 14, partial: true });
await page.evaluate(() => {
  hitStop = 45;
  player.cool = 0;
  player.swing = 0;
  window.__watch = { n: 0, held: false, swungWhileFrozen: false, swungAfter: false };
  const step = () => {
    const f = window.__cometSlashDebug.freeze();
    const swinging = player.swing > 0 || player.cool > 0;
    if (f.slashBuffer) window.__watch.held = true;
    if (swinging && f.hitStop > 0) window.__watch.swungWhileFrozen = true;
    if (swinging && f.hitStop === 0) window.__watch.swungAfter = true;
    if (++window.__watch.n < 120) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
});
await page.waitForTimeout(220); // land the press well inside the stop
await page.keyboard.press("KeyZ");
await page.waitForTimeout(1400);
const r21buf = await page.evaluate(() => ({
  ...window.__watch,
  buffer: window.__cometSlashDebug.freeze().slashBuffer,
}));
check("S21 a swing pressed inside the stop is held", r21buf.held, true);
check("S21 no swing starts while the world is stopped", r21buf.swungWhileFrozen, false);
check("S21 the held swing fires when the world restarts", r21buf.swungAfter, true);
check("S21 the held swing is consumed, not sticky", r21buf.buffer, false);

// Death: the intact hull is held for the whole stop, then it comes apart.
await park();
await page.evaluate(() => {
  crystals = [];
  lives = 3;
  player.pos.set(100, 100);
  player.inv = 0;
  comets = [];
  spawnComet({ pos: vec(103, 100), angle: 0 });
  comets[0].speed = 0;
  comets[0].segs = 0;
});
await page.waitForFunction(() => phase === "dying", null, { timeout: 3000 });
const r21hit = await page.evaluate(() => ({
  freeze: window.__cometSlashDebug.freeze(),
  debris: crystals.length,
}));
check("S21 a miss stops the world hardest", r21hit.freeze.hitStop > 0, true);
check("S21 the hull is still whole during the stop", r21hit.debris, 0);
check("S21 the break-up is owed, not skipped", r21hit.freeze.deathBurst, true);
await page.waitForFunction(
  () => window.__cometSlashDebug.freeze().hitStop === 0 && crystals.length > 0,
  null,
  { timeout: 2000 }
);
const r21burst = await page.evaluate(() => ({
  freeze: window.__cometSlashDebug.freeze(),
  ship: crystals.filter((c) => c.core === "light_green" || c.core === "light_cyan").length,
}));
check("S21 the hull breaks into ship-coloured debris", r21burst.ship, r21contract.shipDebris);
check("S21 nothing is left owed after the break-up", r21burst.freeze.deathBurst, false);
check("S21 the stop is released before the debris flies", r21burst.freeze.hitStop, 0);
await page.waitForTimeout(150);
await page.screenshot({ path: "tests/shots/death-breakup.png" });
await page.waitForFunction(() => phase === "play", null, { timeout: 4000 });
check("S21 death effects do not accumulate", await page.evaluate(() => crystals.length), 0);

// The demo must not stutter behind the attract overlays.
await page.evaluate(() => returnToAttract());
await page.waitForTimeout(6000);
check(
  "S21 the attract demo never stops the world",
  await page.evaluate(() => window.__cometSlashDebug.freeze().hitStop),
  0
);

// ---- S22: one swing is one payment (multi-cut multiplier) ----
// Every distinct comet a single swing reaches multiplies that swing's whole
// score. Each comet here is a 6-segment tail cut at the head: 50*3 + 10*3 = 180
// base, doubled by the long-cut bonus = 360. The ship keeps its invulnerability
// so no redline can arm and inflate the totals.
const injectMultiTargets = (specs) =>
  page.evaluate((specs) => {
    comets = [];
    warns = [];
    crystals = [];
    popups = [];
    specs.forEach(([hx, hy, ang]) => {
      spawnComet({ pos: vec(hx, hy), angle: ang });
      const c = comets[comets.length - 1];
      c.speed = 0;
      c.segs = 6;
      c.hist = [];
      for (let i = 0; i < 80; i++) c.hist.push(vec(hx - cos(ang) * i, hy - sin(ang) * i));
    });
    player.pos.set(100, 100);
    player.dir = 0;
    player.cool = 0;
    player.swing = 0;
    player.inv = 99999;
    window.__sc0 = sc;
    // The attract demo lands multi-cuts of its own, and every emit is logged
    // whether or not it made a sound, so this counts from a baseline.
    window.__multi0 = Sfx.debug().events.filter(
      (e) => e.name === "slash:multi" && !e.demo
    ).length;
  }, specs);
const multiBanners = () =>
  page.evaluate(() =>
    popups.filter((p) => p.tone === "MULTI" && p.txt.indexOf("CUT X") >= 0).map((p) => p.txt)
  );

await page.evaluate(() => startGame());
await page.waitForFunction(() => phase === "play", null, { timeout: 4000 });
await park();
await injectMultiTargets([
  [124, 100, 0],
  [118, 112, 0],
]);
const r22two = await swingAndPeek();
const r22twoState = await page.evaluate(() => ({
  gained: sc - window.__sc0,
  naked: comets.filter((c) => c.segs === 0).length,
  amount: popups.filter((p) => p.tone === "MULTI" && p.txt[0] === "+").map((p) => p.txt),
  event:
    Sfx.debug().events.filter((e) => e.name === "slash:multi" && !e.demo).length -
    window.__multi0,
  onscreen: popups
    .filter((p) => p.tone === "MULTI")
    .every((p) => p.pos.x >= 42 && p.pos.x <= 158 && p.pos.y >= 24 && p.pos.y <= 184),
}));
check("S22 two comets in one swing pay 720 x2", r22twoState.gained, 1440);
check("S22 both tails are actually severed", r22twoState.naked, 2);
check(
  "S22 the swing names its multiplier",
  JSON.stringify(await multiBanners()),
  '["DOUBLE CUT X2"]'
);
check(
  "S22 the multiplier reports the bonus it added",
  JSON.stringify(r22twoState.amount),
  '["+720"]'
);
check("S22 the banner stays on-screen", r22twoState.onscreen, true);
check("S22 the multiplier has its own SE", r22twoState.event, 1);
check("S22 a multi-cut stops longer than the full slash it contains", maxStop(r22two), r21contract.hitStop.multi);
await page.screenshot({ path: "tests/shots/multi-cut.png" });

await park();
await injectMultiTargets([
  [124, 100, 0],
  [118, 112, 0],
  [118, 88, 0],
]);
await swingAndPeek();
const r22three = await page.evaluate(() => ({
  gained: sc - window.__sc0,
  amount: popups.filter((p) => p.tone === "MULTI" && p.txt[0] === "+").map((p) => p.txt),
  stop: window.__cometSlashDebug.visualContract().metrics.hitStop,
}));
check("S22 three comets in one swing pay 1080 x3", r22three.gained, 3240);
// The third comet lands on the same tick as the second, so the swing must
// rewrite its own banner instead of stacking DOUBLE underneath TRIPLE.
check(
  "S22 an upgraded multiplier replaces its banner",
  JSON.stringify(await multiBanners()),
  '["TRIPLE CUT X3"]'
);
check(
  "S22 the banner totals the whole swing's bonus",
  JSON.stringify(r22three.amount),
  '["+2160"]'
);

// A new swing is a new payment: nothing the previous swing cut counts here.
await park();
// This pair cannot be taken together: the second comet trails away from the
// ship, so its tail only enters the arc while the ship faces down.
await injectMultiTargets([
  [124, 100, 0],
  [100, 116, -Math.PI / 2],
]);
await page.keyboard.press("KeyZ");
await page.waitForTimeout(400);
await page.evaluate(() => {
  player.dir = 1;
  player.cool = 0;
});
await page.keyboard.press("KeyZ");
await page.waitForTimeout(400);
const r22split = await page.evaluate(() => ({
  gained: sc - window.__sc0,
  naked: comets.filter((c) => c.segs === 0).length,
}));
check("S22 two comets over two swings stay unmultiplied", r22split.gained, 720);
check("S22 both were nonetheless cut", r22split.naked, 2);
check("S22 no multiplier is claimed across swings", JSON.stringify(await multiBanners()), "[]");

const r22rules = await page.evaluate(() => {
  const mk = (x, y) => {
    spawnComet({ pos: vec(x, y), angle: 0 });
    return comets[comets.length - 1];
  };
  comets = [];
  popups = [];
  resetSlashTally();
  const a = mk(124, 100);
  const b = mk(118, 112);
  const s0 = sc;
  tallyCut(a, 100, false);
  tallyCut(a, 100, false); // the same comet reached twice by one swing
  const repeat = sc - s0;
  const banners = popups.filter((p) => p.tone === "MULTI").length;
  const s1 = sc;
  tallyCut(b, 100, false); // a second comet multiplies the whole swing
  const second = sc - s1;
  comets = [];
  popups = [];
  resetSlashTally();
  const s2 = sc;
  tallyCut(mk(124, 100), 100, true);
  tallyCut(mk(118, 112), 100, true);
  const demo = sc - s2;
  resetSlashTally();
  return { repeat, banners, second, demo };
});
check("S22 one comet reached twice is still one comet", r22rules.repeat, 0);
check("S22 a single comet claims no multiplier banner", r22rules.banners, 0);
check("S22 the multiplier pays the whole swing, repeats included", r22rules.second, 300);
check("S22 the attract demo earns no multiplier score", r22rules.demo, 0);

console.log("ERRORS:", errors.length ? errors : "none");
await browser.close();
process.exit(errors.length || failures.length ? 1 : 0);
