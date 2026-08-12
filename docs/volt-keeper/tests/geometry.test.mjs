#!/usr/bin/env node
/*
 * Geometry and stability tests. These run the shipped main.js through the vm
 * harness, so what is asserted is the code the browser loads.
 */
import { loadGame } from "./harness.mjs";

let passed = 0;
const failures = [];
function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const game = loadGame({ seed: 20260804 });
const api = game.api;
const inDirs = (d) =>
  api.DIRS.some((v) => Math.abs(v.x - d.x) < 1e-9 && Math.abs(v.y - d.y) < 1e-9);

/* ------------------------------------------------------- direction lattice */

check("the direction set has 12 members, none axis-aligned", () => {
  assert(api.DIRS.length === 12, `expected 12 directions, got ${api.DIRS.length}`);
  for (const d of api.DIRS) {
    assert(Math.abs(d.x) > 1e-6 && Math.abs(d.y) > 1e-6, "an axis-aligned direction would run flat along a wall");
    assert(Math.abs(Math.hypot(d.x, d.y) - 1) < 1e-12, "directions must be unit vectors");
    const slope = Math.abs(d.y / d.x);
    assert(
      [0.5, 1, 2].some((s) => Math.abs(slope - s) < 1e-9),
      `slope ${slope} is not one of 1/2, 1, 2`
    );
  }
});

check("the four arrow directions are lattice members a quarter turn apart", () => {
  assert(api.ARROW_DIRS.length === 4, `expected 4 arrow directions, got ${api.ARROW_DIRS.length}`);
  for (const d of api.ARROW_DIRS) {
    assert(inDirs(d), `arrow direction (${d.x},${d.y}) is not on the lattice`);
    assert(Math.abs(Math.abs(d.x) - Math.abs(d.y)) < 1e-9, "an arrow direction must be slope 1");
  }
  // Index rotation is all a turning arrow does, so it has to be a real quarter
  // turn, clockwise, with two steps landing on the reversal.
  for (let i = 0; i < 4; i++) {
    const a = api.ARROW_DIRS[i];
    const b = api.ARROW_DIRS[(i + 1) % 4];
    const opp = api.ARROW_DIRS[(i + 2) % 4];
    assert(Math.abs(a.x * b.x + a.y * b.y) < 1e-12, `steps ${i}->${i + 1} are not perpendicular`);
    assert(a.x * b.y - a.y * b.x > 0, `step ${i} turns anticlockwise on screen`);
    assert(Math.abs(a.x + opp.x) < 1e-12 && Math.abs(a.y + opp.y) < 1e-12, "two steps must reverse");
  }
});

check("dirToward names the arrow direction that points at a target", () => {
  for (let i = 0; i < 4; i++) {
    const v = api.ARROW_DIRS[i];
    const got = api.dirToward(100, 100, 100 + v.x * 40, 100 + v.y * 40);
    assert(got === i, `dirToward answered ${got} where ${i} was wanted`);
  }
});

check("the set is closed under wall reflection", () => {
  for (const d of api.DIRS) {
    assert(inDirs({ x: -d.x, y: d.y }), "vertical wall reflection left the lattice");
    assert(inDirs({ x: d.x, y: -d.y }), "horizontal wall reflection left the lattice");
  }
});

check("an arrow sets the same direction whatever the spark arrived doing", () => {
  // The property the whole design turns on. A 90-degree turn is relative to the
  // spark's heading -- state the screen never shows -- so the same piece gave a
  // different answer every time and measured as unlearnable. An arrow must not
  // depend on the entry direction at all.
  for (let dir = 0; dir < 4; dir++) {
    const piece = { x: 120, y: 100, kind: "arrow", dir, spin: 0, phase: 0, disabledUntil: -1, flash: 0 };
    api.setPieces([piece]);
    const want = api.ARROW_DIRS[dir];
    for (const entry of api.DIRS) {
      for (const off of [-4, 0, 4]) {
        const spark = {
          x: piece.x + off,
          y: piece.y - off,
          dx: entry.x,
          dy: entry.y,
          speed: 2,
          type: "spark",
          size: 8,
          ignoreRef: null,
          ignoreUntil: 0,
        };
        game.sandbox.ticks = 1000;
        api.deflectSpark(spark);
        assert(
          Math.abs(spark.dx - want.x) < 1e-9 && Math.abs(spark.dy - want.y) < 1e-9,
          `dir ${dir}: entry (${entry.x.toFixed(2)},${entry.y.toFixed(2)}) left along (${spark.dx.toFixed(2)},${spark.dy.toFixed(2)})`
        );
        // Only the offset across the new heading is removed: a full snap would
        // put every spark this arrow ever touched on one exact line.
        const cross = (spark.x - piece.x) * want.y - (spark.y - piece.y) * want.x;
        assert(Math.abs(cross) < 1e-9, `dir ${dir}: the spark was left off the arrow's line`);
      }
    }
  }
});

check("a heavy spark is turned by an arrow exactly like any other", () => {
  // The old polar variant let heavies through, which was a rule stated nowhere
  // on the piece. Terrain that reads as one thing must behave as one thing.
  const piece = { x: 120, y: 100, kind: "arrow", dir: 2, spin: 0, phase: 0, disabledUntil: -1, flash: 0 };
  api.setPieces([piece]);
  const want = api.ARROW_DIRS[2];
  for (const type of ["spark", "heavy", "charger"]) {
    const spark = {
      x: piece.x, y: piece.y, dx: api.DIRS[0].x, dy: api.DIRS[0].y,
      speed: 1, type, size: type === "heavy" ? 12 : 8, ignoreRef: null, ignoreUntil: 0,
    };
    game.sandbox.ticks = 1000;
    api.deflectSpark(spark);
    assert(
      Math.abs(spark.dx - want.x) < 1e-9 && Math.abs(spark.dy - want.y) < 1e-9,
      `a ${type} was not turned by the arrow`
    );
  }
});

check("bumper output always snaps back onto the lattice and leaves the bumper", () => {
  for (const d of api.DIRS) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      const dot = d.x * nx + d.y * ny;
      const out = api.snapDir(d.x - 2 * dot * nx, d.y - 2 * dot * ny, nx, ny);
      assert(inDirs(out), "bumper reflection produced an off-lattice direction");
      assert(out.x * nx + out.y * ny > 0, "bumper reflection sent the spark back into the bumper");
    }
  }
});

/* ----------------------------------------------------------- LOOP circuit */

check("the LOOP circuit captures a spark whichever direction it enters from", () => {
  // With a relative turn this could only work for one entry direction, which is
  // why the old orbit had to be seeded pointing the right way. An absolute
  // direction makes capture unconditional, and that is the property that lets a
  // player read a board instead of simulating it.
  const family = api.FAMILIES.filter((f) => f.id === "LOOP")[0];
  const arrows = family.build(6).filter((r) => r.kind === "arrow");
  api.setPieces(arrows);
  const first = arrows[0];
  for (const entry of api.DIRS) {
    const spark = {
      x: first.x,
      y: first.y,
      dx: entry.x,
      dy: entry.y,
      speed: 2.16,
      type: "spark",
      size: 8,
      ignoreRef: null,
      ignoreUntil: 0,
    };
    let turns = 0;
    let worst = 0;
    for (let f = 0; f < 3000; f++) {
      game.sandbox.ticks = f;
      spark.x += spark.dx * spark.speed;
      spark.y += spark.dy * spark.speed;
      api.bounceWalls(spark);
      const bx = spark.dx;
      const by = spark.dy;
      api.deflectSpark(spark);
      if (spark.dx !== bx || spark.dy !== by) turns++;
      if (turns > 1) {
        // Once the circuit has taken it twice it is exactly the diamond through
        // the four arrows. The first turn is exempt because the entry direction
        // is arbitrary, so that one snap can leave the spark a couple of pixels
        // back along the outgoing edge, before the vertex rather than after it.
        const r = Math.abs(first.y - api.CY) || Math.abs(first.x - api.CX);
        worst = Math.max(worst, Math.abs(Math.abs(spark.x - api.CX) + Math.abs(spark.y - api.CY) - r));
      }
      assert(inDirs({ x: spark.dx, y: spark.dy }), `frame ${f}: direction left the lattice`);
    }
    assert(turns > 40, `entry (${entry.x.toFixed(2)},${entry.y.toFixed(2)}) produced only ${turns} turns: the circuit leaked`);
    assert(worst < 2.5, `entry (${entry.x.toFixed(2)},${entry.y.toFixed(2)}) drifted ${worst.toFixed(2)}px off the diamond`);
  }
});

/* ------------------------------------------------------- layout families */

check("layout families respect the concentration cap and the respawn keep-out", () => {
  const seen = new Map();
  for (let wave = 1; wave <= 30; wave++) {
    for (let i = 0; i < 12; i++) {
      const list = api.buildLayout(wave);
      for (const r of list) {
        const dist = Math.hypot(r.x - api.CX, r.y - api.CY);
        assert(dist >= 39.9, `wave ${wave}: piece ${dist.toFixed(1)}px from respawn point`);
        assert(
          r.x >= api.FIELD.left + api.EDGE_CLEAR - 1e-9 &&
            r.x <= api.FIELD.right - api.EDGE_CLEAR + 1e-9 &&
            r.y >= api.FIELD.top + api.EDGE_CLEAR - 1e-9 &&
            r.y <= api.FIELD.bottom - api.EDGE_CLEAR + 1e-9,
          `wave ${wave}: a piece sits inside the edge margin at (${r.x.toFixed(0)},${r.y.toFixed(0)})`
        );
      }
      // Two arrows aimed down the same line at each other trap a spark bouncing
      // between them forever, where it can never be absorbed. Absolute
      // direction is what makes that reachable, so it is checked, not trusted.
      for (const a of list) {
        if (a.kind !== "arrow" || a.spin) continue;
        const v = api.ARROW_DIRS[a.dir];
        for (const b of list) {
          if (b === a || b.kind !== "arrow" || b.spin) continue;
          if ((b.dir + 2) % 4 !== a.dir) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          assert(
            (dx * v.x + dy * v.y) / len <= 0.9,
            `wave ${wave}: two arrows face each other and would trap a spark forever`
          );
        }
      }
      const id = api.state().currentFamily;
      if (!seen.has(id)) seen.set(id, wave);
    }
  }
  assert(seen.get("OPEN") === 1, "OPEN must be the wave-1 layout");
  assert(seen.get("CIRCUIT") === 2, "wave 2 is the teaching board and is not drawn from the bag");
  assert(seen.size === 8, `the seven core families plus FINALE should appear, saw ${[...seen.keys()].join(",")}`);
  assert(seen.get("FINALE") === 17, "the dedicated FINALE layout must belong only to WAVE 17");
  // Twelve piloted runs ended at a median of wave 4 and never passed wave 6, so
  // a family first reachable later than that is content nobody ever sees. Two
  // of the previous six measured at 0 reaches in 12 runs.
  for (const [id, w] of seen) {
    if (id !== "FINALE") assert(w <= 4, `${id} first appears at wave ${w}, past where runs end`);
  }
});

check("every populated family puts both piece kinds on one screen", () => {
  // The measured failure of the previous set: each family used exactly one
  // piece type, so the two behaviours never shared a screen and the difference
  // between them was unlearnable at any amount of play -- there was never an
  // occasion to compare. Bumper boards totalled 39 seconds across eight runs.
  for (const f of api.FAMILIES) {
    // CIRCUIT is the deliberate exception: first contact with terrain teaches
    // one piece with nothing else on the field to attribute its behaviour to.
    // Every board after it mixes.
    if (f.id === "OPEN" || f.id === "CIRCUIT") continue;
    for (let i = 0; i < 20; i++) {
      const kinds = new Set(f.build(8).map((r) => r.kind));
      assert(kinds.has("arrow"), `${f.id}: no arrows on the board`);
      assert(kinds.has("bumper"), `${f.id}: no bumper, so an arrow has nothing to be read against`);
    }
  }
});

check("wave 2 introduces terrain by itself: one piece type, and nothing eating it", () => {
  // First contact used to be three things at once -- two piece types that
  // behave nothing alike, plus an enemy walking in to remove them.
  for (let i = 0; i < 30; i++) {
    const list = api.buildLayout(2);
    assert(list.length > 0, "wave 2 must actually have terrain to teach");
    const kinds = new Set(list.map((r) => r.kind));
    assert(kinds.size === 1, `wave 2 showed ${[...kinds].join("+")}: two behaviours at first contact`);
    assert(kinds.has("arrow"), "the teaching piece is the arrow, which the economy runs on");
    assert(list.every((r) => !r.spin), "a turning arrow is a second rule; the first board states one");
  }
  assert(api.diff(2).scavPeriod === Infinity, "nothing may eat the board a player is still reading");
  assert(api.diff(3).scavPeriod < Infinity, "the scavenger still has to arrive inside a real run");
});

check("the same family builds a different board every wave", () => {
  // Fixed templates made every board of a family identical. Position jitter has
  // to move the pieces, and the flow has to actually reverse or re-aim, or the
  // family always plays the same way however often it comes up.
  for (const f of api.FAMILIES) {
    if (f.id === "OPEN") continue;
    const shapes = new Set();
    const flows = new Set();
    for (let i = 0; i < 40; i++) {
      const list = f.build(10);
      shapes.add(list.map((r) => `${r.x.toFixed(1)},${r.y.toFixed(1)}`).join("|"));
      flows.add(
        list
          .filter((r) => r.kind === "arrow")
          .map((r) => r.dir)
          .join("")
      );
    }
    assert(shapes.size >= 8, `${f.id}: only ${shapes.size} distinct boards in 40 builds`);
    assert(flows.size >= 2, `${f.id}: the flow never varied, so the family always plays the same way`);
  }
});

check("both halves of the ground gesture show their remaining time", () => {
  // The catch radius stays a full circle; the countdown is an inner sweep, and
  // ground and recovery use the same language so they read as one gesture.
  const sim = loadGame({ seed: 2468 });
  sim.startPlay();
  const sweeps = { ground: [], recover: [] };
  let ringSeen = 0;
  for (let f = 1; f < 4000; f++) {
    const st = sim.api.state();
    sim.clearDraws();
    sim.step(st.keeper.state === "free" && f % 40 === 0 ? ["KeyZ"] : []);
    const now = sim.api.state();
    if (now.keeper.invuln > 0) continue;
    const arcs = sim.draws.filter(
      (d) => d.fn === "arc" && Math.abs(d.x - now.keeper.x) < 1 && Math.abs(d.y - now.keeper.y) < 1
    );
    if (now.keeper.state === "ground") {
      const ring = arcs.filter((a) => a.radius === 22);
      const dial = arcs.filter((a) => a.radius === 10 && a.angleTo != null);
      assert(ring.length === 1, `grounded frame drew ${ring.length} catch rings`);
      assert(dial.length === 1, "grounded frame drew no countdown arc");
      ringSeen++;
      sweeps.ground.push((dial[0].angleTo - dial[0].angleFrom) / (now.keeper.timer / 30));
    } else if (now.keeper.state === "recover") {
      const dial = arcs.filter((a) => a.radius === 10 && a.angleTo != null);
      assert(dial.length === 1, "recovering frame drew no countdown arc");
      sweeps.recover.push((dial[0].angleTo - dial[0].angleFrom) / (now.keeper.timer / 45));
    }
  }
  assert(ringSeen > 20, `only ${ringSeen} grounded frames observed`);
  for (const phase of ["ground", "recover"]) {
    assert(sweeps[phase].length > 20, `${phase}: too few samples`);
    for (const s of sweeps[phase]) {
      assert(Math.abs(s - Math.PI * 2) < 1e-6, `${phase} arc does not track its timer (${s})`);
    }
  }
});

check("movement, stop and ground feedback are immediate and return to rest", () => {
  const sim = loadGame({ seed: 8642 });
  sim.startPlay();
  const st = sim.api.state();
  st.sparks.length = 0;
  st.pending.length = 0;
  sim.particles.length = 0;

  const x0 = st.keeper.x;
  sim.clearDraws();
  sim.step(["ArrowRight"]);
  assert(st.keeper.x > x0, "the first movement frame did not move the authoritative keeper");
  assert(
    sim.particles.some((p) => p.color === "light_cyan" && p.opts.count === sim.api.FEEL.moveBurst),
    "movement start produced no bounded cyan wake"
  );
  assert(sim.draws.some((d) => d.fn === "bar" && d.len === 5 && d.color === "light_cyan"), "movement drew no trail");

  sim.particles.length = 0;
  sim.clearDraws();
  sim.step([]);
  assert(
    sim.particles.some((p) => p.color === "light_black" && p.opts.count === sim.api.FEEL.moveBurst),
    "movement stop produced no neutral settling tick"
  );
  for (let i = 0; i < 8; i++) sim.step([]);
  assert(st.keeper.stopFlash === 0, `stop feedback accumulated instead of resting (${st.keeper.stopFlash})`);

  sim.particles.length = 0;
  sim.clearDraws();
  sim.step(["KeyZ"]);
  assert(st.keeper.state === "ground", "the action press was not applied on its first frame");
  assert(
    sim.particles.some((p) => p.color === "cyan" && p.opts.count === sim.api.FEEL.groundBurst),
    "ground start produced no radial confirmation"
  );
  const catchRings = sim.draws.filter(
    (d) => d.fn === "arc" && d.radius === 22 && Math.abs(d.x - st.keeper.x) < 1 && Math.abs(d.y - st.keeper.y) < 1
  );
  assert(catchRings.length === 1, `ground pulse duplicated or distorted the catch radius (${catchRings.length} rings)`);
});

check("every named movement and ground binding responds on its first frame", () => {
  for (const [key, axis, sign] of [
    ["ArrowLeft", "x", -1],
    ["KeyA", "x", -1],
    ["ArrowRight", "x", 1],
    ["KeyD", "x", 1],
    ["ArrowUp", "y", -1],
    ["KeyW", "y", -1],
    ["ArrowDown", "y", 1],
    ["KeyS", "y", 1],
  ]) {
    const sim = loadGame({ seed: 4321 });
    sim.startPlay();
    const before = sim.api.state().keeper[axis];
    sim.step([key]);
    const delta = sim.api.state().keeper[axis] - before;
    assert(Math.sign(delta) === sign, `${key} did not move ${axis} on its first frame (delta ${delta})`);
  }
  for (const key of ["Space", "KeyZ", "KeyX", "KeyJ", "KeyK"]) {
    const sim = loadGame({ seed: 5432 });
    sim.startPlay();
    sim.step([key]);
    assert(sim.api.state().keeper.state === "ground", `${key} did not ground on its first frame`);
  }
});

check("absorb feedback has explicit reward colours and bounded weight tiers", () => {
  const cases = [
    ["spark", "cyan", 8],
    ["charger", "light_green", 12],
    ["heavy", "green", 16],
  ];
  for (const [type, wantColor, wantCount] of cases) {
    const sim = loadGame({ seed: 9191 });
    sim.startPlay();
    const st = sim.api.state();
    st.sparks.length = 0;
    const d = sim.api.DIRS[0];
    const spark = sim.api.makeSpark(st.keeper.x, st.keeper.y, d, 1.5, type);
    st.sparks.push(spark);
    sim.particles.length = 0;
    sim.api.absorbSpark(spark, 0);
    const fx = sim.particles[sim.particles.length - 1];
    assert(fx && fx.color === wantColor, `${type} absorb used ${fx && fx.color}, expected ${wantColor}`);
    assert(fx.opts.count === wantCount, `${type} absorb emitted ${fx.opts.count}, expected ${wantCount}`);
    assert(fx.opts.angleWidth === Math.PI * 2, `${type} absorb was not a radial reward glint`);
  }
  const burstCaps = Object.entries(game.api.FEEL)
    .filter(([name]) => name.endsWith("Burst"))
    .map(([, value]) => value);
  assert(Math.max(...burstCaps) <= 24, "an individual feedback burst exceeds the 24-particle hard cap");
});

check("simultaneous feedback obeys the global per-frame particle cap", () => {
  const sim = loadGame({ seed: 9292 });
  sim.startPlay();
  sim.particles.length = 0;
  for (let i = 0; i < 4; i++) {
    sim.api.burst(100 + i, 100, "cyan", { count: 24, speed: 1, angle: 0, angleWidth: Math.PI * 2 });
  }
  const total = sim.particles.reduce((sum, p) => sum + p.opts.count, 0);
  assert(total === sim.api.FEEL.frameParticleCap, `same-frame bursts emitted ${total}, expected cap ${sim.api.FEEL.frameParticleCap}`);
});

check("near miss feedback confirms only a completed safe pass", () => {
  const sim = loadGame({ seed: 2121 });
  sim.startPlay();
  const st = sim.api.state();
  sim.api.setPieces([]);
  st.sparks.length = 0;
  st.pending.length = 0;
  st.keeper.invuln = 0;
  const d = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
  st.sparks.push(sim.api.makeSpark(st.keeper.x + 8, st.keeper.y + 8, d, 3, "spark"));
  const lives0 = st.lives;
  sim.particles.length = 0;
  sim.step([]); // enter the 15px envelope without touching the 12x12 body
  assert(sim.api.state().feedback.nearMissFlash === 0, "near miss fired before the spark had safely passed");
  sim.step([]); // leave the envelope: now the pass is confirmed
  assert(st.lives === lives0, "the supposed near miss was actually a hit");
  assert(sim.api.state().feedback.nearMissFlash > 0, "the completed safe pass produced no bracket");
  assert(
    sim.particles.some((p) => p.color === "light_black" && p.opts.count === 3),
    "near miss used no restrained neutral particle tick"
  );
});

check("a scavenged arrow visibly returns once and then settles", () => {
  const sim = loadGame({ seed: 3131 });
  sim.startPlay();
  const piece = {
    x: 150,
    y: 120,
    kind: "arrow",
    dir: 0,
    spin: 0,
    phase: 0,
    disabledUntil: sim.frame + 1,
    flash: 0,
    wasDisabled: true,
    restoreFlash: 0,
  };
  sim.api.setPieces([piece]);
  sim.particles.length = 0;
  sim.step([]);
  sim.step([]);
  assert(piece.restoreFlash > 0, "the arrow recovered with no visible state-change pulse");
  assert(
    sim.particles.some((p) => p.color === "light_cyan" && p.opts.count === 6),
    "arrow recovery used no bounded cyan burst"
  );
  for (let i = 0; i < 16; i++) sim.step([]);
  assert(piece.restoreFlash === 0, `arrow recovery feedback did not return to rest (${piece.restoreFlash})`);
});

check("each enemy type has its own silhouette, not just its own colour", () => {
  // At 8px a red square and a yellow square are the same object with a
  // different palette index. Identity has to be carried by shape.
  const sim = loadGame({ seed: 1357 });
  sim.startPlay();
  const shapeOf = new Map();
  for (let f = 1; f < 12000 && shapeOf.size < 3; f++) {
    const st = sim.api.state();
    const types = new Set(st.sparks.map((sp) => sp.type));
    if (types.size !== 1) {
      sim.step([]);
      continue;
    }
    const only = [...types][0];
    if (shapeOf.has(only) || st.sparks.length === 0) {
      sim.step([]);
      continue;
    }
    sim.clearDraws();
    sim.step([]);
    // Primitives drawn while exactly one enemy type is on screen.
    const prims = sim.draws.filter((d) => ["arc", "bar", "box"].includes(d.fn) && d.y > api.FIELD.top);
    shapeOf.set(only, {
      branch: prims.some((d) => d.fn === "bar" && d.thickness === 1),
      shell: prims.some((d) => d.fn === "arc" && d.radius === 6 && d.thickness === 2),
      streak: prims.some((d) => d.fn === "bar" && d.thickness === 3),
      splitCore: prims.some((d) => d.fn === "box" && d.w === 2),
      chargeCore: prims.some((d) => d.fn === "box" && d.w === 4),
    });
  }
  assert(shapeOf.has("spark"), "no frame contained only ordinary sparks");
  assert(shapeOf.get("spark").branch, "ordinary sparks need a one-pixel side discharge");
  assert(
    !shapeOf.has("heavy") || (shapeOf.get("heavy").shell && shapeOf.get("heavy").splitCore),
    "the heavy must be a hollow shell, showing what it splits into"
  );
  assert(
    !shapeOf.has("charger") || (shapeOf.get("charger").streak && shapeOf.get("charger").chargeCore),
    "the charger must be a thick speed streak with a compact core"
  );
});

/* ----------------------------------------------------- reward and cost rules */

check("surplus energy converts to score instead of being discarded", () => {
  const sim = loadGame({ seed: 606 });
  const s = () => sim.api.state();
  sim.startPlay();
  let sawOvercharge = false;
  let scoreAtOvercharge = null;
  // Driven by the shipped attract pilot, and across restarts. Now that drain
  // tracks income, the capacitor is only full enough to spill after a stretch
  // of competent play: a chase-the-nearest-spark policy dies in about four
  // seconds a life and never gets there, which would have made this test a
  // measure of the policy rather than of the rule. Overcharges must also be
  // seen in `play` -- attract pushes the same popup with the sound suppressed.
  // The run is not cut short at the first overcharge. Its cue shares the
  // `ground` coalescing family with the quota announcement, which outranks it,
  // so the very first overcharge may legitimately be merged away -- and now
  // that a circuit pays volts, quota and overcharge collide far more often.
  // What has to be true is that the moment sounds, not that it sounds first.
  for (let f = 1; f < 20000; f++) {
    const st = s();
    if (st.phase !== "play") {
      sim.step(st.phase === "attract" ? ["KeyZ"] : []);
      continue;
    }
    const inp = sim.api.demoInput();
    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].forEach((k) => sim.release(k));
    if (inp.left) sim.press("ArrowLeft");
    if (inp.right) sim.press("ArrowRight");
    if (inp.up) sim.press("ArrowUp");
    if (inp.down) sim.press("ArrowDown");
    const scoreBefore = st.gameScore;
    const capBefore = st.capacitor;
    sim.step(inp.action ? ["KeyZ"] : []);
    const now = s();
    if (!sawOvercharge && now.phase === "play" && now.popups.some((p) => p.kind === "overcharge" && p.life > 46)) {
      sawOvercharge = true;
      scoreAtOvercharge = { scoreBefore, capBefore, scoreAfter: now.gameScore };
    }
  }
  assert(sawOvercharge, "a 20000-frame piloted run never overcharged, so the reward is unreachable");
  assert(
    scoreAtOvercharge.scoreAfter > scoreAtOvercharge.scoreBefore,
    "an overcharge must pay score"
  );
  // A fully charged spark banks over twice what a fresh one does, so the bar no
  // longer has to be at 80 for a single absorb to spill it.
  assert(scoreAtOvercharge.capBefore > 55, "overcharge should only fire from an already-high capacitor");
  const ids = sim.adapter.calls.filter((c) => c.type === "program").map((c) => c.id);
  assert(ids.includes("overcharge"), "the overcharge moment must have its own sound");
});

/** Drive a piloted run for `frames`, restarting through attract, and call
 * `onPlayFrame(before, after, resumed)` for every frame actually spent in
 * `play`. `resumed` marks the first play frame after a gap -- a miss, a
 * ceremony, or a whole new run -- so a caller tracking something across frames
 * knows not to carry it over one. Without it these checks silently assumed the
 * pilot survived the entire sample, which is a property of the seed rather than
 * of the rule under test. */
function pilot(sim, frames, onPlayFrame) {
  const s = () => sim.api.state();
  let resumed = true;
  for (let f = 0; f < frames; f++) {
    const before = s();
    if (before.phase !== "play") {
      sim.step(before.phase === "attract" ? ["KeyZ"] : []);
      resumed = true;
      continue;
    }
    const inp = sim.api.demoInput();
    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].forEach((k) => sim.release(k));
    if (inp.left) sim.press("ArrowLeft");
    if (inp.right) sim.press("ArrowRight");
    if (inp.up) sim.press("ArrowUp");
    if (inp.down) sim.press("ArrowDown");
    const snapshot = {
      capacitor: before.capacitor,
      multiplier: before.multiplier,
      gameScore: before.gameScore,
      waveBanked: before.waveBanked,
      waveQuota: before.waveQuota,
    };
    // One frame of draws per callback: the non-play frames the pilot steps
    // through would otherwise pile up in front of the first one inspected.
    sim.clearDraws();
    sim.step(inp.action ? ["KeyZ"] : []);
    onPlayFrame(snapshot, s(), resumed);
    resumed = false;
  }
}

check("a wave clear cashes the capacitor out into score and fits a fresh battery", () => {
  const sim = loadGame({ seed: 4242 });
  sim.startPlay();
  let clears = 0;
  let pending = null;
  pilot(sim, 12000, (before, after, resumed) => {
    if (resumed) pending = null;
    if (pending) {
      // The bonus is paid across the tally: monotone, never overpaid, exactly
      // the bonus by the time it ends. It is checked on the ceremony's own
      // counter rather than on the score, because a spark caught in the ring at
      // the buzzer can still be banked during the freeze -- so the score may
      // legitimately outrun the tally, but never fall behind it.
      assert(after.tallyPaid >= pending.lastPaid, "the tally counted backwards");
      assert(
        after.tallyPaid <= pending.expected,
        `the tally overpaid: ${after.tallyPaid} of ${pending.expected}`
      );
      assert(
        after.gameScore >= pending.score + after.tallyPaid,
        `the score is ${after.gameScore - pending.score} behind a tally that has paid ${after.tallyPaid}`
      );
      pending.lastPaid = after.tallyPaid;
      if (after.tallyTimer === 0) {
        assert(after.tallyPaid === pending.expected, "the ceremony's number must end on the bonus");
        pending = null;
      }
      return;
    }
    // The payout frame is the first frame of the surge freeze.
    if (after.surgeTimer !== 60) return;
    clears++;
    // Read from the charge the payout actually cashed, not from the frame's
    // opening capacitor: an absorb landing on the clear frame itself is banked
    // before the wave block runs, so the two differ exactly when play was going
    // well at the buzzer -- which is the case worth getting right.
    const expected = Math.round(Math.max(0, after.tallyCharge)) * 20 * after.multiplier;
    assert(
      after.waveBonus === expected,
      `wave bonus was ${after.waveBonus}, expected ${expected} from ${after.tallyCharge.toFixed(1)} charge at x${after.multiplier}`
    );
    assert(
      after.tallyCharge >= before.capacitor - 1,
      `the payout cashed ${after.tallyCharge.toFixed(1)} against an opening charge of ${before.capacitor.toFixed(1)}`
    );
    assert(
      after.capacitor === (after.quotaCleared ? 70 : 40),
      `the surge fitted a ${after.capacitor} battery for a ${after.quotaCleared ? "met" : "missed"} quota`
    );
    assert(after.tallyTimer > 0, "the payout must open a tally rather than land in one lump");
    pending = { score: before.gameScore, expected, lastPaid: 0 };
  });
  assert(clears >= 2, `only ${clears} wave clears were observed, so the payout is barely tested`);
});

check("the wave quota gates the battery, and is a goal the wave can reach", () => {
  const sim = loadGame({ seed: 4242 });
  sim.startPlay();
  let clears = 0;
  let met = 0;
  let sawAnnounce = false;
  let prevBanked = 0;
  pilot(sim, 12000, (before, after, resumed) => {
    if (resumed) prevBanked = 0;
    if (after.quotaMet && after.waveBanked >= prevBanked) {
      sawAnnounce =
        sawAnnounce || after.popups.some((p) => p.kind === "quota" && p.life > 58);
    }
    if (after.surgeTimer !== 60) {
      // Banking only ever adds, and only from absorbing.
      if (after.waveBanked < prevBanked) assert(false, "banked energy went backwards mid-wave");
      prevBanked = after.waveBanked;
      return;
    }
    clears++;
    assert(
      after.quotaCleared === before.waveBanked >= before.waveQuota,
      `the surge recorded ${after.quotaCleared} for ${before.waveBanked.toFixed(0)}/${before.waveQuota}`
    );
    assert(
      after.capacitor === (after.quotaCleared ? 70 : 40),
      `a ${after.quotaCleared ? "met" : "missed"} quota fitted a ${after.capacitor} battery`
    );
    assert(after.waveBanked === 0, "the quota must start the next wave from zero");
    assert(after.waveQuota > before.waveQuota, "the quota must rise with the wave");
    if (after.quotaCleared) met++;
    prevBanked = 0;
  });
  assert(clears >= 2, `only ${clears} wave clears were observed`);
  assert(met > 0, "the pilot never met a quota, so the goal is out of reach");
  assert(sawAnnounce, "meeting the quota mid-wave must announce itself, not wait for the surge");
});

check("the wave clock runs down on screen and is refilled by the surge", () => {
  // Without a deadline the quota meter is a result, not a decision: a shortfall
  // can only be answered if the time left to answer it is visible.
  const sim = loadGame({ seed: 2468 });
  sim.startPlay();
  const widths = [];
  let refills = 0;
  let prev = null;
  pilot(sim, 4000, (before, after, resumed) => {
    if (resumed) prev = null;
    const clock = sim.draws.filter((d) => d.fn === "rect" && d.y === 12 && d.x === 150);
    assert(clock.length === 1, `expected one wave clock, saw ${clock.length}`);
    const w = clock[0].w;
    // The clock fills toward the same tick the quota fills toward: a wave
    // running out is the payout arriving, and a mark that drained next to the
    // capacitor bar said the opposite.
    if (prev !== null && w < prev - 1e-9) {
      assert(after.surgeTimer > 0, `the clock reset outside a surge (${prev} -> ${w})`);
      refills++;
    }
    prev = w;
    widths.push(w);
  });
  assert(widths[0] < 1, `the clock did not start empty (${widths[0]})`);
  assert(Math.max(...widths) > 28, "the clock never filled past half");
  assert(refills >= 1, "no surge ever restarted the clock");
});

check("the quota meter is on screen while there is still time to act on it", () => {
  // A quota only resolved at the surge would be a lottery. The meter has to be
  // visible during play and has to move, or the last ten seconds of a wave
  // cannot be played any differently from the first.
  const sim = loadGame({ seed: 909 });
  sim.startPlay();
  const widths = [];
  pilot(sim, 3000, (before, after) => {
    if (after.surgeTimer === 0 && after.tallyTimer === 0) {
      const meter = sim.draws.filter((d) => d.fn === "rect" && d.y === 8 && d.x === 150);
      assert(meter.length === 1, `expected one quota meter, saw ${meter.length}`);
      widths.push(meter[0].w);
    }
  });
  assert(widths.length > 600, `the meter was drawn on only ${widths.length} play frames`);
  assert(widths[0] < 1, "the meter must start empty");
  assert(Math.max(...widths) > 20, `the meter never filled past ${Math.max(...widths).toFixed(0)}px`);
  for (let i = 1; i < widths.length; i++) {
    assert(widths[i] >= widths[i - 1] - 1e-9 || widths[i] < 1, `the meter fell back at frame ${i}`);
  }
});

check("the tally shows the charge draining into the score", () => {
  // The rule -- charge becomes points -- is stated nowhere except here, so the
  // bar has to be seen emptying while the ceremony's number climbs. A bar that
  // simply snapped to the new battery would leave the payout unexplained.
  const sim = loadGame({ seed: 4242 });
  sim.startPlay();
  let widths = [];
  let paid = [];
  let checked = 0;
  pilot(sim, 12000, (before, after) => {
    if (after.tallyTimer > 0) {
      const bars = sim.draws.filter((d) => d.fn === "rect" && d.y === 16 && d.x === 8);
      assert(bars.length === 1, `expected one capacitor bar, saw ${bars.length}`);
      widths.push(bars[0].w);
      paid.push(after.tallyPaid);
    } else if (widths.length) {
      checked++;
      assert(widths.length >= 30, `the tally only lasted ${widths.length} frames`);
      assert(widths[0] > widths[widths.length - 1], "the bar did not drain during the tally");
      for (let i = 1; i < widths.length; i++) {
        assert(widths[i] <= widths[i - 1], `the bar grew back mid-tally at frame ${i}`);
        assert(paid[i] >= paid[i - 1], `the score counted down at frame ${i}`);
      }
      // The last drained frame sits one tick above empty; the frame after it is
      // the new battery snapping in, which is a swap and should read as one.
      assert(
        widths[widths.length - 1] <= widths[0] * 0.1,
        `the bar only drained to ${widths[widths.length - 1].toFixed(1)} of ${widths[0].toFixed(1)}`
      );
      assert(paid[paid.length - 1] > paid[0], "the ceremony's number never moved");
      widths = [];
      paid = [];
    }
  });
  assert(checked >= 2, `only ${checked} tallies were drawn, so the animation is barely tested`);
});

check("the capacitor is a resource the run is spent managing, not a full bar", () => {
  // The regression this guards is the one the mechanic shipped with: drain was
  // 40% of measured income, so the bar pinned at 90-100 for 65% of frames, no
  // life ever ended on it, and the BGM danger axis it feeds never moved. The
  // bounds are deliberately loose -- this asserts that the resource is in play
  // at all, not a particular difficulty.
  const sim = loadGame({ seed: 909 });
  sim.startPlay();
  let frames = 0;
  let high = 0;
  let low = 0;
  let min = 100;
  pilot(sim, 12000, (before, after) => {
    frames++;
    const c = after.capacitor;
    if (c > 90) high++;
    if (c < 60) low++;
    if (c < min) min = c;
  });
  assert(frames > 3000, `only ${frames} frames were spent in play, so the sample is too small`);
  assert(high / frames < 0.5, `the bar sat above 90 for ${((100 * high) / frames).toFixed(0)}% of play`);
  assert(low / frames > 0.05, `the bar dropped below 60 for only ${((100 * low) / frames).toFixed(0)}% of play`);
  assert(min < 40, `the bar never fell below 40 (min ${min.toFixed(0)}), so it is not a live constraint`);
});

check("an arrow charges the spark it turns, and only when it turns it", () => {
  // The circuit has to pay, or standing in the busy part of the board is simply
  // a mistake: a terrain-reading pilot measured live terrain as *costing* a wave
  // of survival for +9-14% income, which made every attack on the terrain a
  // favour to the player.
  const piece = { x: 120, y: 100, kind: "arrow", dir: 1, spin: 0, phase: 0, disabledUntil: -1, flash: 0 };
  api.setPieces([piece]);
  const want = api.ARROW_DIRS[1];
  const mk = (d) => ({ x: 120, y: 100, dx: d.x, dy: d.y, speed: 2, baseSpeed: 2, type: "spark", size: 8, volts: 0, ignoreRef: null, ignoreUntil: 0 });

  // Turned repeatedly: charge accumulates and then stops at the cap.
  const turned = mk(api.ARROW_DIRS[3]);
  const seen = [];
  for (let i = 0; i < 10; i++) {
    game.sandbox.ticks = 1000 + i * 10;
    turned.dx = api.ARROW_DIRS[3].x;
    turned.dy = api.ARROW_DIRS[3].y;
    turned.ignoreUntil = 0;
    api.deflectSpark(turned);
    seen.push(turned.volts);
  }
  assert(seen[0] === 1, `one turn should charge once, got ${seen[0]}`);
  const cap = seen[seen.length - 1];
  assert(cap > 1 && cap === Math.max(...seen), `charge must accumulate then hold, saw ${seen.join(",")}`);
  assert(new Set(seen.slice(-3)).size === 1, `charge must stop at a cap, saw ${seen.join(",")}`);

  // Already going that way: the arrow did no work, so it pays nothing. Without
  // this a spark banks volts by grazing one piece over and over.
  const grazing = mk(want);
  for (let i = 0; i < 10; i++) {
    game.sandbox.ticks = 2000 + i * 10;
    grazing.ignoreUntil = 0;
    api.deflectSpark(grazing);
  }
  assert(grazing.volts === 0, `a spark already on the arrow's heading was charged to ${grazing.volts}`);
});

check("a charged or sped-up spark is worth more, and a fresh one is worth base", () => {
  const base = { speed: 2, baseSpeed: 2, volts: 0 };
  assert(api.sparkBonus(base) === 0, "a spark straight off a port must pay exactly base");
  const charged = { speed: 2, baseSpeed: 2, volts: 4 };
  assert(api.sparkBonus(charged) > 0.9, `a fully charged spark only paid +${api.sparkBonus(charged)}`);
  const fast = { speed: 4, baseSpeed: 2, volts: 0 };
  assert(api.sparkBonus(fast) > 0.3, `a doubled-speed spark only paid +${api.sparkBonus(fast)}`);
  // Speed credit is measured against the spark's own launch speed. Against the
  // current wave's spawn speed instead, a spark that outlived its wave scored
  // no bonus at all and the bumper half of the board stayed unpaid.
  const stale = { speed: 2, baseSpeed: 1, volts: 0 };
  assert(api.sparkBonus(stale) > 0.3, "speed credit must be relative to the spark's own launch speed");
  assert(
    api.sparkBonus({ speed: 99, baseSpeed: 2, volts: 4 }) < 1.5,
    "the bonus has to be bounded or one lucky spark pays for a whole wave"
  );
});

check("the scavenger takes a piece on a timer, and can be stopped inside it", () => {
  // It is faster than the keeper, so it cannot be chased down. What makes it a
  // decision rather than a tax is that it stops dead on the piece it is taking
  // and the piece survives if it is killed inside the window. If the disable
  // ever became instant, the enemy would be unanswerable and would go the way
  // of the leaker.
  const run = (interrupt) => {
    const sim = loadGame({ seed: 31415 });
    sim.startPlay();
    const st = sim.api.state();
    const piece = { x: 150, y: 120, kind: "arrow", dir: 0, spin: 0, phase: 0, disabledUntil: -1, flash: 0 };
    sim.api.setPieces([piece]);
    st.scavengers.length = 0;
    st.scavengers.push({ x: 60, y: 120, target: null, chew: 0 });
    const scav = st.scavengers[0];
    let travelFrames = 0;
    let chewSeen = 0;
    for (let f = 0; f < 900; f++) {
      const before = { x: scav.x, y: scav.y };
      if (interrupt && scav.chew > 30) {
        // Stand on it and ground: this is the save the window exists for.
        st.keeper.x = scav.x;
        st.keeper.y = scav.y;
        sim.step(st.keeper.state === "free" ? ["KeyZ"] : []);
      } else {
        sim.step([]);
      }
      if (scav.chew > 0) chewSeen++;
      else if (Math.hypot(scav.x - before.x, scav.y - before.y) > 0.01) travelFrames++;
      if (piece.disabledUntil > sim.frame) break;
      if (!sim.api.state().scavengers.includes(scav)) break;
    }
    return { disabled: piece.disabledUntil > sim.frame, chewSeen, travelFrames, alive: sim.api.state().scavengers.includes(scav) };
  };

  const left = run(false);
  assert(left.disabled, "left alone, the scavenger must eventually take the piece");
  assert(
    left.chewSeen >= 60,
    `the piece was taken after only ${left.chewSeen} frames latched on: there is no window to answer`
  );
  assert(left.travelFrames > 0 && left.travelFrames < 90, `crossing 90px took ${left.travelFrames} frames`);

  const stopped = run(true);
  assert(!stopped.disabled, "grounding on the scavenger inside the window must save the piece");
  assert(!stopped.alive, "the scavenger must actually be absorbed, not merely delayed");
});

check("the scavenger leaves bumpers alone", () => {
  // Taking a bumper off the board measured as a *gain* of 8% score: it is a
  // hazard that pays a little, so destroying one is a favour. An enemy whose
  // effect is a favour is not an enemy.
  const sim = loadGame({ seed: 2718 });
  sim.startPlay();
  const st = sim.api.state();
  const bump = { x: 150, y: 120, kind: "bumper", disabledUntil: -1, flash: 0 };
  sim.api.setPieces([bump]);
  st.scavengers.length = 0;
  st.scavengers.push({ x: 60, y: 120, target: null, chew: 0 });
  const scav = st.scavengers[0];
  const start = { x: scav.x, y: scav.y };
  for (let f = 0; f < 900; f++) sim.step([]);
  assert(bump.disabledUntil <= sim.frame, "a bumper must never be taken by the scavenger");
  assert(
    Math.hypot(scav.x - start.x, scav.y - start.y) < 1,
    "with no arrow to eat the scavenger must idle, not home in on a bumper"
  );
});

check("a heavy's split children cannot be banked on the spot", () => {
  const sim = loadGame({ seed: 909 });
  const s = () => sim.api.state();
  sim.startPlay();
  let checked = 0;
  for (let f = 1; f < 30000 && checked < 3; f++) {
    const st = s();
    const heavy = st.sparks.filter((sp) => sp.type === "heavy")[0];
    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].forEach((k) => sim.release(k));
    const just = [];
    if (heavy) {
      if (heavy.x < st.keeper.x - 2) sim.press("ArrowLeft");
      else if (heavy.x > st.keeper.x + 2) sim.press("ArrowRight");
      if (heavy.y < st.keeper.y - 2) sim.press("ArrowUp");
      else if (heavy.y > st.keeper.y + 2) sim.press("ArrowDown");
      const d2 = (heavy.x - st.keeper.x) ** 2 + (heavy.y - st.keeper.y) ** 2;
      if (d2 < 24 * 24 && st.keeper.state === "free") just.push("KeyZ");
    }
    const heaviesBefore = st.sparks.filter((sp) => sp.type === "heavy").length;
    sim.step(just);
    const now = s();
    const children = now.sparks.filter((sp) => sp.immuneUntil);
    if (now.sparks.filter((sp) => sp.type === "heavy").length < heaviesBefore && children.length >= 2) {
      checked++;
      for (const c of children) {
        const dist = Math.hypot(c.x - now.keeper.x, c.y - now.keeper.y);
        assert(dist >= 22, `a split child spawned inside the ring (${dist.toFixed(1)}px)`);
      }
    }
  }
  assert(checked > 0, "no heavy was ever absorbed, so the rule is untested by this run");
});

check("difficulty levers are monotone and clamped", () => {
  let prevSpeed = 0;
  let prevDrain = 0;
  for (let w = 1; w <= 60; w++) {
    const d = api.diff(w);
    assert(d.sparkSpeed >= prevSpeed - 1e-9, "spark speed must not decrease");
    assert(d.drainPerFrame >= prevDrain - 1e-9, "drain must not decrease");
    assert(d.sparkSpeed <= 3.0 + 1e-9, "spark speed exceeded its clamp");
    assert(d.drainPerFrame <= 10.0 / 60 + 1e-9, "drain exceeded its clamp");
    assert(d.sparkCount <= 12, "spark count exceeded its clamp");
    prevSpeed = d.sparkSpeed;
    prevDrain = d.drainPerFrame;
  }
  assert(api.diff(2).scavPeriod === Infinity, "scavengers must not exist before wave 3");
  assert(api.diff(3).scavPeriod < Infinity, "the scavenger has to arrive inside a real run");
  assert(api.diff(7).chargerRatio === 0, "chargers must not exist before wave 8");
});

/* --------------------------------------------------- long gameplay run */

check("a long run stays finite, in bounds, and emits the expected audio", () => {
  const sim = loadGame({ seed: 99 });
  const s = () => sim.api.state();
  let maxSparks = 0;
  let maxScore = 0;
  const phasesSeen = new Set();
  sim.startPlay();
  for (let f = 1; f < 20000; f++) {
    const st = s();
    // Policy: chase the nearest spark, ground when it is nearly in range.
    let nearest = null;
    let best = Infinity;
    for (const sp of st.sparks) {
      const d = (sp.x - st.keeper.x) ** 2 + (sp.y - st.keeper.y) ** 2;
      if (d < best) {
        best = d;
        nearest = sp;
      }
    }
    const just = [];
    if (nearest) {
      sim.release("ArrowLeft");
      sim.release("ArrowRight");
      sim.release("ArrowUp");
      sim.release("ArrowDown");
      if (nearest.x < st.keeper.x - 2) sim.press("ArrowLeft");
      else if (nearest.x > st.keeper.x + 2) sim.press("ArrowRight");
      if (nearest.y < st.keeper.y - 2) sim.press("ArrowUp");
      else if (nearest.y > st.keeper.y + 2) sim.press("ArrowDown");
      if (best < 26 * 26 && st.keeper.state === "free") just.push("KeyZ");
    }
    sim.step(just);

    const now = s();
    assert(Number.isFinite(now.keeper.x) && Number.isFinite(now.keeper.y), `frame ${f}: keeper position is not finite`);
    assert(Number.isFinite(now.capacitor), `frame ${f}: capacitor is not finite`);
    assert(now.capacitor <= 100.0001, `frame ${f}: capacitor ${now.capacitor} above maximum`);
    assert(now.lives >= 0 && now.lives <= 3, `frame ${f}: lives out of range (${now.lives})`);
    assert(now.multiplier >= 1 && now.multiplier <= 9, `frame ${f}: multiplier out of range (${now.multiplier})`);
    assert(Number.isFinite(now.gameScore), `frame ${f}: score is not finite`);
    for (const sp of now.sparks) {
      // Every spark must carry every field, whoever built it. A spark missing
      // `volts` pays NaN energy and a NaN score the moment it is banked, and
      // the bug sat in the one creation site of three that a test rarely
      // reaches -- so the population is checked, not the constructors.
      assert(
        Number.isFinite(sp.volts) && sp.volts >= 0,
        `frame ${f}: a ${sp.type} carries volts=${sp.volts}, so banking it would pay NaN`
      );
      assert(Number.isFinite(sp.x) && Number.isFinite(sp.y), `frame ${f}: spark position is not finite`);
      assert(Math.abs(Math.hypot(sp.dx, sp.dy) - 1) < 1e-9, `frame ${f}: spark direction is not a unit vector`);
      assert(
        sp.x >= api.FIELD.left - 8 && sp.x <= api.FIELD.right + 8,
        `frame ${f}: spark escaped horizontally (${sp.x})`
      );
      assert(
        sp.y >= api.FIELD.top - 8 && sp.y <= api.FIELD.bottom + 8,
        `frame ${f}: spark escaped vertically (${sp.y})`
      );
    }
    maxSparks = Math.max(maxSparks, now.sparks.length);
    maxScore = Math.max(maxScore, now.gameScore);
    phasesSeen.add(now.phase);
  }
  assert(maxSparks <= 40, `spark population blew up to ${maxSparks}`);
  assert(maxScore > 0, "a 20000-frame chase run should have scored");
  // 20000 frames outlives three lives, so the whole cabinet cycle must appear.
  for (const p of ["play", "miss", "gameover", "attract", "ready"]) {
    assert(phasesSeen.has(p), `phase ${p} was never reached (saw ${[...phasesSeen].join(",")})`);
  }

  const ids = new Set(sim.adapter.calls.filter((c) => c.type === "program").map((c) => c.id));
  for (const required of ["ground", "absorb1", "launch"]) {
    assert(ids.has(required), `gameplay never emitted ${required}`);
  }
  assert(sim.endCount === 0, "a game-owned cycle must never call end()");
  assert(
    ["attract", "ready", "play", "miss", "gameover"].includes(s().phase),
    `run finished in an unknown phase (${s().phase})`
  );
});

/* ------------------------------------------------------- game-owned cycle */

check("the cabinet boots into attract mode and never calls end()", () => {
  const sim = loadGame({ seed: 808 });
  sim.step([]);
  assert(sim.api.state().phase === "attract", "frame zero must belong to attract mode");
  for (let f = 0; f < 3000; f++) sim.step([]);
  assert(sim.endCount === 0, "a game-owned cycle must never call end()");
  assert(sim.api.state().phase === "attract", "with no input the cabinet stays in attract");
});

check("attract mode produces motion and score with no input at all", () => {
  const sim = loadGame({ seed: 4711 });
  sim.step([]);
  const positions = new Set();
  let keeperMoved = 0;
  let prev = { x: 0, y: 0 };
  for (let f = 0; f < 2400; f++) {
    sim.step([]);
    const st = sim.api.state();
    for (const sp of st.sparks) positions.add(`${Math.round(sp.x)},${Math.round(sp.y)}`);
    if (Math.abs(st.keeper.x - prev.x) > 0.5 || Math.abs(st.keeper.y - prev.y) > 0.5) keeperMoved++;
    prev = { x: st.keeper.x, y: st.keeper.y };
  }
  assert(positions.size > 500, `attract mode looks static (${positions.size} distinct spark positions)`);
  assert(keeperMoved > 600, `the demo pilot barely moved (${keeperMoved} frames)`);
  assert(sim.api.state().gameScore > 0, "the demo pilot never scored, so it is not really playing");
});

check("attract mode is silent and never writes the hi-score", () => {
  const sim = loadGame({ seed: 616 });
  sim.step([]);
  for (let f = 0; f < 2400; f++) sim.step([]);
  const played = sim.adapter.calls.filter((c) => c.type === "program");
  assert(played.length === 0, `attract emitted ${played.length} sounds; it must be demo-gated`);
  const suppressed = sim.api.audioLog().filter((l) => l.action === "suppressed:demo");
  assert(suppressed.length > 0, "attract emissions must be logged as demo-suppressed, not simply absent");
  assert(sim.api.state().hiScore === 0, "a demo run must not write the hi-score table");
});

check("the start press enters READY and cannot also ground the keeper", () => {
  const sim = loadGame({ seed: 1212 });
  sim.step([]);
  for (let f = 0; f < 120; f++) sim.step([]); // let attract settle
  sim.step(["KeyZ"]);
  const afterPress = sim.api.state();
  assert(afterPress.phase === "ready", `press must enter READY (got ${afterPress.phase})`);
  assert(afterPress.keeper.state === "free", "the start press must not bleed through into a ground");
  assert(afterPress.gameScore === 0, "a new run must start from zero");
  assert(afterPress.lives === 3, "a new run must start with three lives");
  let guard = 0;
  while (sim.api.state().phase === "ready" && guard++ < 200) sim.step([]);
  assert(sim.api.state().phase === "play", "READY must hand over to PLAY");
});

check("starting a run actually plays the start jingle", () => {
  // The frame that leaves attract is still flagged demo when beginFrame runs,
  // so anything emitted on it is suppressed unless it says otherwise.
  const sim = loadGame({ seed: 1928 });
  sim.step([]);
  for (let f = 0; f < 60; f++) sim.step([]);
  sim.adapter.reset();
  sim.step(["KeyZ"]);
  const played = sim.adapter.calls.filter((c) => c.type === "program").map((c) => c.id);
  assert(played.includes("jingle:start"), `starting a run played ${played.join(",") || "nothing"}`);
});

check("the last life plays game over, not the miss jingle", () => {
  const sim = loadGame({ seed: 3141 });
  sim.startPlay();
  let guard = 0;
  while (sim.api.state().phase !== "gameover" && guard++ < 40000) sim.step([]);
  assert(sim.api.state().phase === "gameover", "the run never reached game over");
  const log = sim.api.audioLog();
  const over = log.filter((l) => l.name === "game:over")[0];
  assert(over, "no game over jingle was ever emitted");
  const sameTick = log.filter((l) => l.frame === over.frame);
  const miss = sameTick.filter((l) => l.name === "keeper:miss")[0];
  assert(over.action === "played", `game over was ${over.action}, not played`);
  assert(miss && miss.action !== "played", "the miss jingle must lose the voice to game over");
});

check("losing the last life runs the GAME OVER ceremony and returns to attract", () => {
  const sim = loadGame({ seed: 2323 });
  sim.startPlay();
  // Park in the middle without grounding: contact or the capacitor ends the run.
  let guard = 0;
  while (sim.api.state().phase !== "gameover" && guard++ < 30000) sim.step([]);
  assert(sim.api.state().phase === "gameover", "the run never reached game over");
  assert(sim.api.state().lives === 0, "game over must mean no lives left");
  const overFrames = [];
  while (sim.api.state().phase === "gameover" && guard++ < 31000) {
    sim.clearDraws();
    sim.step([]);
    overFrames.push(sim.draws.filter((d) => d.fn === "text").map((d) => d.text));
  }
  assert(
    overFrames.some((texts) => texts.some((t) => t.includes("GAME OVER"))),
    "the game over ceremony must be shown"
  );
  assert(sim.api.state().phase === "attract", "the ceremony must fall back to attract");
  assert(sim.endCount === 0, "end() must still never be called");
});

check("the keeper is not on screen during the GAME OVER ceremony", () => {
  // loseLife() re-centres the keeper for a respawn, so at zero lives the body
  // is still sitting in the middle of the field with the ceremony over it.
  const sim = loadGame({ seed: 2323 });
  sim.startPlay();
  let guard = 0;
  while (sim.api.state().phase !== "gameover" && guard++ < 30000) sim.step([]);
  assert(sim.api.state().phase === "gameover", "the run never reached game over");
  let overFrames = 0;
  while (guard++ < 31000) {
    sim.clearDraws();
    sim.step([]);
    // The frame that ends the ceremony boots back to attract before drawing,
    // so its keeper belongs to the demo, not to the run that just ended.
    if (sim.api.state().phase !== "gameover") break;
    overFrames++;
    const body = sim.draws.filter((d) => d.fn === "char" && ["c", "d"].includes(d.text) && d.scale.x === 2);
    assert(body.length === 0, `the keeper was drawn at (${body[0] && body[0].x},${body[0] && body[0].y})`);
  }
  assert(overFrames > 60, `the ceremony only lasted ${overFrames} frames`);
});

check("the keeper stays hidden and inert during MISS, then returns on PLAY", () => {
  const sim = loadGame({ seed: 2323 });
  sim.startPlay();
  let guard = 0;
  while (sim.api.state().phase !== "miss" && sim.api.state().phase !== "gameover" && guard++ < 30000) {
    sim.clearDraws();
    const before = sim.api.state();
    sim.step([]);
    const after = sim.api.state();
    if (after.phase === "miss") {
      const body = sim.draws.filter((d) => d.fn === "char" && ["c", "d"].includes(d.text) && d.scale.x === 2);
      assert(body.length === 0, "MISS must not draw the respawned keeper");
      assert(after.keeper.x === 128 && after.keeper.y === 124, "MISS must retain the authoritative respawn position");
      assert(after.gameScore === before.gameScore, "MISS must not advance scoring");
      assert(after.sparks.length === before.sparks.length, "MISS must freeze the spark population");
      const missStart = after.phaseTimer;
      sim.clearDraws();
      sim.step([]);
      const during = sim.api.state();
      assert(during.phase === "miss", "MISS ended too early");
      assert(during.phaseTimer === missStart - 1, "MISS timer must advance exactly one frame");
      assert(
        sim.draws.filter((d) => d.fn === "char" && ["c", "d"].includes(d.text) && d.scale.x === 2).length === 0,
        "keeper appeared during MISS"
      );
      while (sim.api.state().phase === "miss") sim.step([]);
      assert(sim.api.state().phase === "play", "a remaining-life MISS must resume PLAY");
      assert(
        sim.draws.some((d) => d.fn === "char" && ["c", "d"].includes(d.text) && d.scale.x === 2),
        "keeper must return when PLAY resumes"
      );
      return;
    }
  }
  assert(false, "the deterministic run never reached a remaining-life MISS");
});

check("no phase paints a filled slab across the playfield", () => {
  // This theme has no palette entry darker than the background, so a "dimmed"
  // backing panel renders as a bright block that blanks the field. Ceremony
  // text must sit on thin rules instead. Draw-call counting alone missed this
  // once already; the rule is now explicit.
  const sim = loadGame({ seed: 777 });
  sim.startPlay();
  const seen = new Set();
  let guard = 0;
  while (guard++ < 30000 && !(seen.has("gameover") && seen.has("attract"))) {
    sim.clearDraws();
    sim.step([]);
    const st = sim.api.state();
    seen.add(st.phase);
    for (const d of sim.draws) {
      if (d.fn !== "rect") continue;
      if (d.y + (d.h || 0) <= api.FIELD.top) continue; // HUD strip is allowed
      assert(
        !(d.w >= 32 && d.h >= 3),
        `phase ${st.phase}: ${d.w}x${d.h} ${d.color} fill at (${d.x},${d.y}) covers the playfield`
      );
    }
  }
  assert(seen.has("gameover") && seen.has("attract"), "the check never reached the ceremony phases");
});

check("every frame draws the capacitor, wave, multiplier and lives", () => {
  // The capacitor is the resource the whole game turns on. A HUD element that
  // is computed but never drawn is invisible to every other test here, so it
  // gets its own assertion.
  const sim = loadGame({ seed: 31337 });
  sim.startPlay();
  for (let f = 1; f < 400; f++) {
    sim.clearDraws();
    sim.step(f % 90 === 0 ? ["KeyZ"] : []);
    const st = sim.api.state();
    const d = sim.draws;

    const barFill = d.filter(
      (x) => x.fn === "rect" && x.y >= 16 && x.y <= 22 && x.w > 0 && x.h <= 8 && x.x >= 8 && x.x <= 10
    );
    assert(barFill.length > 0, `frame ${f}: capacitor bar was not drawn`);
    const width = Math.max(...barFill.map((x) => x.w));
    const expected = 240 * (st.capacitor / 100);
    assert(
      Math.abs(width - expected) < 1.5,
      `frame ${f}: bar width ${width.toFixed(1)} does not track capacitor ${st.capacitor.toFixed(1)} (expected ${expected.toFixed(1)})`
    );

    const texts = d.filter((x) => x.fn === "text").map((x) => x.text);
    assert(texts.some((t) => t.includes(`W${st.wave}`)), `frame ${f}: wave not shown`);
    assert(texts.some((t) => t === `x${st.multiplier}`), `frame ${f}: multiplier not shown`);
    const lifeIcons = d.filter(
      (x) => x.fn === "char" && x.text === api.PROBE_FRAME_A && x.scale.x === 1 && x.y === api.VISUAL.hud.lives.y
    );
    assert(lifeIcons.length === Math.min(4, Math.max(0, st.lives - 1)), `frame ${f}: reserve lives not shown as probe icons`);
    assert(!texts.includes("+"), `frame ${f}: obsolete fifth-life plus returned`);
  }
});

check("Capacitor Probe frames, facing, grounding and recovery match the visual contract", () => {
  const sim = loadGame({ seed: 4242 });
  const rows = (pattern) => pattern.split("\n").slice(1, -1).map((row) => row.padEnd(6, " "));
  const frameA = rows(sim.sandbox.characters[2]);
  const frameB = rows(sim.sandbox.characters[3]);
  assert(
    JSON.stringify(frameA) === JSON.stringify([" cccc ", "cccccc", "cc  cc", "cccccc", "cc ccc", "cccccc"]),
    "Capacitor Probe Frame A pixels drifted"
  );
  assert(
    JSON.stringify(frameB) === JSON.stringify([" cccc ", "cccccc", "cc  cc", "cccccc", "ccc cc", "cccccc"]),
    "Capacitor Probe Frame B pixels drifted"
  );

  const rotate = (grid) => grid[0].map((_, x) => grid.map((row) => row[x]).reverse());
  const pixels = (grid) => grid.map((row) => [...row]);
  const frontProjection = [
    ([x, y]) => -y,
    ([x]) => x,
    ([, y]) => y,
    ([x]) => -x,
  ];
  let rotatedA = pixels(frameA);
  let rotatedB = pixels(frameB);
  for (let rotation = 0; rotation < 4; rotation++) {
    const differences = [];
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 6; x++) {
        if (rotatedA[y][x] !== rotatedB[y][x]) differences.push([x, y]);
        if (x === 0 || x === 5 || y === 0 || y === 5) {
          assert(rotatedA[y][x] === rotatedB[y][x], `rotation ${rotation}: outer contour changed at ${x},${y}`);
        }
      }
    }
    assert(differences.length === 2, `rotation ${rotation}: animation changed ${differences.length} cells`);
    const projection = differences.map(frontProjection[rotation]);
    assert(projection[0] === projection[1], `rotation ${rotation}: animated current moved toward or away from the front`);
    rotatedA = rotate(rotatedA);
    rotatedB = rotate(rotatedB);
  }
  assert(frameA[0] === frameB[0], "upward-facing terminal must be fixed");
  assert(frameA[2] === frameB[2] && frameA[2] === "cc  cc", "face-like gaps must stay on one row");
  assert(frameA[5] === frameB[5] && frameA[5] === "cccccc", "grounding bus must be fixed");
  sim.startPlay();
  const body = () =>
    sim.draws.filter(
      (d) => d.fn === "char" && [api.PROBE_FRAME_A, api.PROBE_FRAME_B].includes(d.text) && d.scale.x === 2
    );

  const idleFrames = new Set();
  for (let i = 0; i < api.PROBE_ANIMATION_FRAMES * 2 + 2; i++) {
    sim.clearDraws();
    sim.step([]);
    const probe = body()[0];
    assert(probe && probe.color === "cyan" && probe.rotation === 0, "idle probe lost its cyan upward presentation");
    idleFrames.add(probe.text);
  }
  assert(idleFrames.has(api.PROBE_FRAME_A) && idleFrames.has(api.PROBE_FRAME_B), "free probe did not alternate A/B");

  for (const [key, rotation] of [
    ["ArrowRight", 1],
    ["ArrowDown", 2],
    ["ArrowLeft", 3],
    ["ArrowUp", 0],
  ]) {
    sim.clearDraws();
    sim.step([key]);
    assert(body()[0]?.rotation === rotation, `${key} produced rotation ${body()[0]?.rotation}`);
  }

  sim.step(["ArrowRight"]);
  sim.clearDraws();
  sim.step(["ArrowRight", "ArrowUp"]);
  assert(body()[0]?.rotation === 1, "up-right diagonal did not retain compatible right facing");
  sim.clearDraws();
  sim.step(["ArrowLeft", "ArrowUp"]);
  assert(body()[0]?.rotation === 0, "incompatible diagonal did not choose its stable vertical axis");
  sim.clearDraws();
  sim.step(["ArrowLeft", "ArrowUp"]);
  assert(body()[0]?.rotation === 0, "held diagonal flickered away from its chosen axis");

  sim.clearDraws();
  sim.step(["KeyZ"]);
  let probe = body()[0];
  assert(sim.api.state().keeper.state === "ground", "action did not enter ground");
  assert(probe?.text === api.PROBE_FRAME_B && probe.color === "cyan", "ground must lock cyan Frame B");
  while (sim.api.state().keeper.state === "ground") sim.step([]);
  sim.clearDraws();
  sim.step([]);
  probe = body()[0];
  assert(sim.api.state().keeper.state === "recover", "ground did not enter recover");
  assert(probe?.text === api.PROBE_FRAME_A && probe.color === "purple", "recover must lock purple Frame A");
  assert(sim.draws.some((d) => d.fn === "arc" && d.color === "purple"), "recover countdown arc disappeared");
});

check("the invulnerable Probe blinks 4f on / 4f off and MISS remains hidden", () => {
  const sim = loadGame({ seed: 9191 });
  sim.startPlay();
  sim.api.loseLife("test");
  sim.clearDraws();
  sim.step([]);
  assert(sim.api.state().phase === "miss", "test miss did not enter MISS");
  assert(
    !sim.draws.some((d) => d.fn === "char" && [api.PROBE_FRAME_A, api.PROBE_FRAME_B].includes(d.text) && d.scale.x === 2),
    "Probe appeared during MISS"
  );
  while (sim.api.state().phase === "miss") sim.step([]);
  for (let i = 0; i < 8; i++) {
    sim.clearDraws();
    sim.step([]);
    const tick = sim.frame - 1;
    const shown = sim.draws.some(
      (d) => d.fn === "char" && [api.PROBE_FRAME_A, api.PROBE_FRAME_B].includes(d.text) && d.scale.x === 2
    );
    assert(shown === (tick % 8 < 4), `invulnerability blink disagreed at tick ${tick}`);
  }
});

check("ATTRACT, READY and GAME CLEAR retain the Probe under existing phase rules", () => {
  const hasProbe = (sim) =>
    sim.draws.some(
      (d) => d.fn === "char" && [api.PROBE_FRAME_A, api.PROBE_FRAME_B].includes(d.text) && d.scale.x === 2
    );
  const attract = loadGame({ seed: 1111 });
  attract.clearDraws();
  attract.step([]);
  assert(attract.api.state().phase === "attract" && hasProbe(attract), "ATTRACT did not draw the Probe");
  attract.clearDraws();
  attract.step(["KeyZ"]);
  assert(attract.api.state().phase === "ready" && hasProbe(attract), "READY did not draw the Probe");

  for (const [wave, phase] of [[17, "finalclear"]]) {
    const sim = loadGame({ seed: wave });
    sim.startPlay();
    sim.api.injectWaveEnd(wave, { capacitor: 80, score: 1000 });
    let shown = false;
    for (let i = 0; i < 8; i++) {
      sim.clearDraws();
      sim.step([]);
      assert(sim.api.state().phase === phase, `WAVE ${wave} did not enter ${phase}`);
      shown ||= hasProbe(sim);
    }
    assert(shown, `${phase} never showed the Probe during its 4f blink window`);
  }
});

check("the Probe keeps the authoritative ±6px contact envelope", () => {
  for (const [dx, dy] of [[0, 0], [6, 0], [-6, 6], [0, -6]]) {
    assert(api.touchesKeeper(dx, dy), `(${dx},${dy}) escaped the old contact envelope`);
  }
  for (const [dx, dy] of [[6.001, 0], [-6.001, 0], [0, 6.001], [0, -6.001]]) {
    assert(!api.touchesKeeper(dx, dy), `(${dx},${dy}) entered beyond the old contact envelope`);
  }
});

check("life HUD uses one cyan Probe per reserve life", () => {
  const sim = loadGame({ seed: 5151 });
  for (let lives = 1; lives <= 5; lives++) {
    sim.api.setLives(lives);
    sim.clearDraws();
    sim.api.drawLivesHud();
    const icons = sim.draws.filter(
      (d) => d.fn === "char" && d.text === api.PROBE_FRAME_A && d.scale.x === 1 && d.y === api.VISUAL.hud.lives.y
    );
    assert(icons.length === Math.max(0, lives - 1), `${lives} total lives drew ${icons.length} reserve icons`);
    assert(icons.every((d) => d.color === "cyan" && d.rotation === 0), "life icons changed colour or facing");
    assert(icons.every((d, i) => d.x === api.VISUAL.hud.lives.x + i * 7), "life icons lost their fixed spacing");
    const plus = sim.draws.filter((d) => d.fn === "text" && d.text === "+");
    assert(plus.length === 0, `${lives} lives produced an obsolete plus marker`);
    assert(icons.every((d) => d.x - 3 > 132 && d.x + 3 < 256), "life icon overlaps WAVE label or screen edge");
  }
});

check("pixel ports, specialist sparks and title logo keep distinct silhouettes", () => {
  const sim = loadGame({ seed: 5152 });
  assert(sim.api.PORT_FRAME_IDLE === "e" && sim.api.PORT_FRAME_CHARGED === "f", "port frames lost their stable IDs");
  assert(sim.api.portRotation({ x: 2, y: 124 }) === 0, "left port did not face inward");
  assert(sim.api.portRotation({ x: 253, y: 124 }) === 2, "right port did not face inward");
  assert(sim.api.portRotation({ x: 128, y: 25 }) === 1, "top port did not face inward");
  assert(sim.api.portRotation({ x: 128, y: 222 }) === 3, "bottom port did not face inward");

  const sample = { x: 100, y: 100, dx: 1, dy: 0, speed: 2 };
  sim.clearDraws();
  sim.api.drawHeavySpark(sample, false);
  const heavy = sim.draws.map((d) => d.fn);
  sim.clearDraws();
  sim.api.drawChargerSpark(sample, false);
  const charger = sim.draws.map((d) => d.fn);
  assert(JSON.stringify(heavy) !== JSON.stringify(charger), "Heavy and Charger collapsed to one silhouette");
  assert(heavy.filter((fn) => fn === "box").length === 2, "Heavy lost its two split cores");
  assert(charger.includes("bar") && charger.includes("box"), "Charger lost its needle-and-tail shape");

  sim.clearDraws();
  sim.api.drawPixelTitle();
  assert(sim.draws.filter((d) => d.fn === "rect").length > 40, "pixel title did not draw a full VOLT mark");
});

check("ATTRACT combines the pixel VOLT mark with one KEEPER subtitle", () => {
  const sim = loadGame({ seed: 5154 });
  sim.clearDraws();
  sim.step([]);
  const texts = sim.draws.filter((d) => d.fn === "text").map((d) => d.text);
  assert(texts.includes("KEEPER"), "ATTRACT lost the KEEPER subtitle");
  assert(!texts.includes("VOLT KEEPER"), "ATTRACT duplicated VOLT in its subtitle");
});

check("EXTEND assembles only an actually added reserve and returns to rest", () => {
  const sim = loadGame({ seed: 5153 });
  sim.startPlay();
  sim.api.injectScore(20000);
  sim.step([]);
  assert(sim.api.state().lives === 4 && sim.api.state().extendBuildTimer > 0, "awarded reserve did not begin assembly");
  sim.clearDraws();
  sim.api.drawLivesHud();
  assert(sim.draws.some((d) => d.fn === "rect" || d.fn === "box"), "assembly did not draw Probe parts");
  for (let i = 0; i < sim.api.EXTEND_BUILD_FRAMES; i++) sim.api.drawLivesHud();
  sim.clearDraws();
  sim.api.drawLivesHud();
  const settled = sim.draws.filter((d) => d.fn === "char" && d.text === sim.api.PROBE_FRAME_A);
  assert(settled.length === 3 && sim.api.state().extendBuildTimer === 0, "assembled reserve did not settle to three icons");

  sim.api.setLives(5);
  sim.api.injectScore(500000);
  sim.step([]);
  assert(sim.api.state().extendBuildTimer === 0, "thresholds crossed at the life cap fabricated an assembly");
});

check("the runtime visual contract keeps HUD roles distinct from gameplay colours", () => {
  const v = api.VISUAL;
  assert(v.theme === "dark" && v.background === "#090c1b", "the renderer must declare the theme it was audited on");
  assert(v.text.primary === "black", "primary state should use the dark theme's near-white ink");
  assert(v.text.energy === "cyan", "energy information must keep the keeper's cyan role");
  assert(v.text.reward === "green" && v.text.rewardScore === "yellow", "reward roles must remain distinct");
  assert(v.text.danger === "red", "danger and loss must use red");
  assert(v.text.secondary === "light_black", "only secondary information should use the half-bright neutral");
  assert(v.probe.frameA === "c" && v.probe.frameB === "d", "visual contract lost the two Probe frames");
  assert(v.probe.worldScale === 2 && v.probe.hudScale === 1 && v.probe.hudMaxIcons === 4, "Probe scale contract drifted");
  assert(
    v.hud.waveMeterBounds.left === 149 && v.hud.waveMeterBounds.right === 208,
    "wave meter boundary anchors drifted"
  );
  assert(new Set(Object.values(v.text)).size >= 5, "text roles collapsed into too few colours");
  for (const key of ["score", "hiScore", "multiplier", "wave", "lives"]) {
    const p = v.hud[key];
    assert(p && Number.isFinite(p.x) && Number.isFinite(p.y), `${key} is missing a runtime-readable HUD anchor`);
  }
});

check("the quota and clock use paired neutral boundary ticks", () => {
  const sim = loadGame({ seed: 6007 });
  sim.startPlay();
  sim.clearDraws();
  sim.step([]);
  const bounds = api.VISUAL.hud.waveMeterBounds;
  const ticks = sim.draws.filter(
    (d) =>
      d.fn === "rect" &&
      (d.x === bounds.left || d.x === bounds.right) &&
      d.y === bounds.top &&
      d.w === 1 &&
      d.h === bounds.bottom - bounds.top
  );
  assert(ticks.length === 2, `expected two wave-meter boundary ticks, saw ${ticks.length}`);
  assert(ticks.every((d) => d.color === api.VISUAL.instrument.structure), "wave-meter boundaries lost their neutral role");
});

check("HI score is readable primary ink and turns yellow for a live record", () => {
  const sim = loadGame({ seed: 6008 });
  sim.clearDraws();
  sim.step([]);
  let hi = sim.draws.find((d) => d.fn === "text" && d.text.startsWith("HI "));
  assert(hi?.color === api.VISUAL.text.primary, `inactive HI used ${hi?.color} instead of primary ink`);

  sim.startPlay();
  sim.api.injectScore(100);
  sim.clearDraws();
  sim.step([]);
  hi = sim.draws.find((d) => d.fn === "text" && d.text.startsWith("HI "));
  assert(hi?.color === api.VISUAL.text.rewardScore, `record HI used ${hi?.color} instead of reward yellow`);
});

check("important text never falls back to low-contrast light colours", () => {
  const sim = loadGame({ seed: 6006 });
  const forbidden = new Set(["white", "light_cyan", "light_red", "light_green", "light_blue", "light_purple"]);
  const phases = new Set();
  for (let f = 0; f < 12000; f++) {
    sim.clearDraws();
    if (f === 2) sim.step(["KeyZ"]);
    else sim.step(f % 95 === 0 ? ["KeyZ"] : []);
    phases.add(sim.api.state().phase);
    for (const d of sim.draws) {
      if (d.fn === "text") assert(!forbidden.has(d.color), `${d.text} used low-contrast ${d.color}`);
    }
    if (phases.has("attract") && phases.has("ready") && phases.has("play") && phases.has("gameover")) break;
  }
  assert(phases.has("ready") && phases.has("play"), `text audit missed active phases: ${[...phases].join(",")}`);
});

check("a normal spark is an animated directed discharge inside its contact envelope", () => {
  const s = { x: 100, y: 100, dx: Math.SQRT1_2, dy: -Math.SQRT1_2 };
  const signatures = new Set();
  for (let tick = 0; tick < 3; tick++) {
    game.clearDraws();
    game.sandbox.ticks = tick;
    api.drawNormalSpark(s, false);
    const glyph = game.draws.slice();
    assert(glyph.filter((d) => d.fn === "bar").length === 2, "spark needs a core and a side discharge");
    assert(glyph.some((d) => d.fn === "box" && d.w <= 3), "spark needs a compact leading edge");
    assert(!glyph.some((d) => d.fn === "box" && d.w === 6), "the old yellow square silhouette returned");
    assert(glyph.every((d) => d.color === "yellow" || d.color === "light_yellow"), "normal spark left its power palette");
    for (const d of glyph) {
      assert(Math.abs(d.x - s.x) <= 5.5 && Math.abs(d.y - s.y) <= 5.5, "spark draw escaped its 12x12 contact envelope");
    }
    signatures.add(glyph.map((d) => `${d.fn}:${d.len || d.w}:${d.x.toFixed(2)}:${d.y.toFixed(2)}`).join("|"));
  }
  assert(signatures.size === 3, `expected three spark beats, saw ${signatures.size}`);
});

check("the low-capacitor warning is visible, not only audible", () => {
  const sim = loadGame({ seed: 5150 });
  sim.startPlay();
  let sawFlash = false;
  let sawNormal = false;
  let minSeen = 100;
  const KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
  for (let f = 1; f < 6000; f++) {
    // Flee everything and never ground: the only way out of this is the
    // capacitor running down, which is exactly the state under test.
    const before = sim.api.state();
    KEYS.forEach((k) => sim.release(k));
    let ax = (128 - before.keeper.x) * 0.00015;
    let ay = (124 - before.keeper.y) * 0.00015;
    for (const sp of before.sparks) {
      const rx = before.keeper.x - sp.x;
      const ry = before.keeper.y - sp.y;
      const dd = Math.max(8, Math.hypot(rx, ry));
      ax += rx / (dd * dd);
      ay += ry / (dd * dd);
    }
    if (ax < 0) sim.press("ArrowLeft");
    else if (ax > 0) sim.press("ArrowRight");
    if (ay < 0) sim.press("ArrowUp");
    else if (ay > 0) sim.press("ArrowDown");

    sim.clearDraws();
    sim.step([]);
    const st = sim.api.state();
    minSeen = Math.min(minSeen, st.capacitor);
    const fill = sim.draws.filter((x) => x.fn === "rect" && x.y === 16 && x.x === 8);
    if (!fill.length) continue;
    const c = fill[0].color;
    if (st.capacitor < 30) {
      if (c === "red" || c === "light_red") sawFlash = true;
    } else if (st.capacitor >= 60) {
      if (c === "green") sawNormal = true;
    }
    if (sawFlash && sawNormal) break;
  }
  assert(sawNormal, "a healthy capacitor should draw green");
  assert(sawFlash, `a capacitor below 30 should draw in the alarm colour (lowest seen: ${minSeen.toFixed(1)})`);
});

check("the bus reports no resolution or voice-limit failure during play", () => {
  const sim = loadGame({ seed: 4242 });
  sim.startPlay();
  for (let f = 0; f < 6000; f++) sim.step(f % 120 === 0 ? ["KeyZ"] : []);
  const log = sim.api.audioLog();
  assert(log.length > 0, "the run produced no audio activity at all");
  for (const action of ["unknown", "unresolved", "unavailable", "voiceLimitExceeded"]) {
    const hit = log.filter((l) => l.action === action);
    assert(hit.length === 0, `bus reported ${action} for ${hit.map((h) => h.name).join(",")}`);
  }
  // Arbitration must be visible, not silent: dropping and coalescing are the
  // declared policies and a run this long has to exercise at least one.
  assert(
    log.some((l) => l.action === "dropped" || l.action === "coalesced" || l.action === "cooldown"),
    "no arbitration was ever logged, so the policy is untested by this run"
  );
});

console.log(`Geometry and gameplay tests: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach((f) => console.error(`- ${f}`));
  process.exitCode = 1;
}
