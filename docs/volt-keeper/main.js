/*
 * VOLT KEEPER — crisp-game-lib implementation.
 *
 * The capacitor drains constantly and the only way to refill it is to absorb
 * sparks, which requires standing in their path while grounded. The field
 * pieces are not obstacles: they are harvest terrain that decides where the
 * income is. An arrow forces whatever touches it onto the direction it points;
 * a bumper reflects off its normal and adds speed. The player reads them, and
 * cannot change them.
 *
 * Game-owned arcade cycle: `title` and `description` are deliberately left
 * undefined so update() owns frame zero onward, `end()` is never called, and
 * ATTRACT / READY / PLAY / MISS / GAME OVER are game phases. Score and
 * hi-score are drawn by this file, not by the library.
 *
 * Frame order: phase -> input -> player state -> spawn -> enemies ->
 *              sparks/collision -> economy -> wave -> draw -> audio flush.
 */

// The arrow, pointing up-right. Bars could not draw this: a 45-degree shaft and
// two barbs at 12px merge into a blob, and the one thing the piece has to say is
// which way it points. A sprite is pixel-exact, and because the four directions
// are exactly 90 degrees apart, `rotation` covers all of them from this one.
// Empty cells are spaces, not dots: a pattern containing "." is treated as an
// image path by the library and silently loads nothing.
characters = [
  `
   lll
    ll
   l l
  l
 l
l
`,
  // The scavenger. It used to be a 6px box, which is the same silhouette as an
  // ordinary spark -- identity carried by hue alone, in a palette entry
  // (light_purple, x3.5 contrast) barely above the background. Legs and pincers
  // read as a thing that eats terrain, at a glance and at 6px.
  `
l    l
 l  l
 llll
llllll
 l  l
l    l
`,
];

options = {
  viewSize: { x: 256, y: 224 },
  theme: "dark",
  isShowingScore: false, // the game-owned cycle draws its own score
  isUsingSmallText: true,
};

/* ------------------------------------------------------------------ layout */

const FIELD = { left: 2, right: 253, top: 25, bottom: 222 };
const CX = 128;
const CY = 124;
const BAR = { x: 8, y: 16, w: 240, h: 6 };
// The status row is full: score/hi at y=3, multiplier, wave label and lives at
// y=10, capacitor bar at y=16. The quota meter takes the one gap left, between
// the widest wave label ("W100 CHICANE") and the lives.
// The quota and the wave clock are one instrument in two rows, sharing a target
// tick: both fill left to right, and the question the player is actually asking
// -- "will I bank it in time?" -- is whichever mark reaches the tick first.
//
// The clock used to run down the top edge of the playfield, immediately under
// the capacitor bar. It read as a second capacitor emptying, which is exactly
// backwards: a wave running out is the payout arriving, not death approaching.
// Nothing that depletes is drawn next to the bar that kills you any more.
const QUOTA_BAR = { x: 150, y: 8, w: 58, h: 3 };
const CLOCK_BAR = { x: 150, y: 12, w: 58, h: 2 };
const CLOCK_WARN_FRAMES = 300; // the last five seconds flash

/* -------------------------------------------------- direction lattice (12) */

// Slopes +-1/2, +-1, +-2 only. No axis-aligned direction exists, so nothing
// ever runs flat along a wall. The set is closed under wall reflection, and it
// contains the four arrow directions, which is what keeps every trajectory on a
// readable lattice however many times it bounces or is turned.
const DIRS = [];
[
  [2, 1],
  [1, 1],
  [1, 2],
].forEach((slope) => {
  [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ].forEach((sign) => {
    const x = slope[0] * sign[0];
    const y = slope[1] * sign[1];
    const len = Math.sqrt(x * x + y * y);
    DIRS.push({ x: x / len, y: y / len });
  });
});

/* The four directions an arrow can point.
 *
 * Terrain used to turn a spark 90 degrees, which is a statement about the
 * spark's heading -- state the screen never showed. The same piece therefore
 * produced a different result every time it was used, and measurement showed
 * players could not tell the piece types apart at all. An absolute direction
 * is the opposite: the arrow's entire effect is written on the arrow.
 *
 * Only the slope-1 members qualify. The lattice has no axis-aligned direction
 * by construction, and its slope-1/2 and slope-2 members sit ~18 degrees apart
 * -- about three pixels of tip displacement on a 12px glyph, which is not
 * readable with a dozen of them on the field. Four directions 90 degrees apart
 * are unmistakable, and they are closed under index rotation, so a turning
 * arrow is just `dir + spin`. Index order is clockwise on screen. */
const ARROW_DIRS = [
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
].map(
  ([sx, sy]) =>
    DIRS.filter(
      (d) => Math.sign(d.x) === sx && Math.sign(d.y) === sy && Math.abs(Math.abs(d.x) - Math.abs(d.y)) < 1e-9
    )[0]
);

/** The arrow direction pointing from (x,y) toward (tx,ty). */
function dirToward(x, y, tx, ty) {
  return tx >= x ? (ty >= y ? 1 : 0) : ty >= y ? 2 : 3;
}
/** Nearest lattice direction to (x,y), constrained to the half-plane v.n > 0. */
function snapDir(x, y, nx, ny) {
  let best = null;
  let bestDot = -Infinity;
  for (const d of DIRS) {
    if (nx != null && d.x * nx + d.y * ny <= 0.05) continue;
    const dot = d.x * x + d.y * y;
    if (dot > bestDot) {
      bestDot = dot;
      best = d;
    }
  }
  return best || DIRS[0];
}

/* ------------------------------------------------------------- field pieces */

/**
 * An arrow forces any spark that touches it onto `dir`, whatever that spark was
 * doing when it arrived. `spin` of +-1 advances `dir` once per rotation period;
 * `phase` (0..1) staggers when within that period, so a field of turning arrows
 * reads as a wave crossing the board. The rotors this replaces all snapped on
 * one shared frame, which is why they read as noise rather than as a machine.
 */
function arrow(x, y, dir, spin = 0, phase = 0) {
  return { x, y, kind: "arrow", dir: ((dir % 4) + 4) % 4, spin, phase, disabledUntil: -1, flash: 0 };
}
/**
 * A bumper reflects off its surface normal and adds speed. It is the deliberate
 * opposite of an arrow -- its result depends on where it was struck, and it is
 * the only piece whose effect measurement could actually detect (sparks ran 17%
 * faster on bumper boards). Every family pairs the two so the contrast is on
 * one screen; a board of only one kind gives the player nothing to compare.
 */
function bumper(x, y) {
  return { x, y, kind: "bumper", disabledUntil: -1, flash: 0 };
}

const FAMILIES = [
  { id: "OPEN", conc: 1, build: () => [] },
  {
    // The teaching board, and the only one that breaks the mixing rule below on
    // purpose. First contact with terrain used to arrive as three things at
    // once: two piece types that behave nothing alike, plus an enemy walking in
    // to eat them. One piece type, one behaviour, nothing else moving -- a bare
    // circuit, which is also the clearest statement the game has: four arrows
    // pointing at each other, sparks locked into the loop, and their volt rings
    // visibly growing as they go round.
    //
    // It sits at wave 2, not 3. At wave 3 only half of measured runs ever
    // reached it, because waves 1-2 were both empty and a median run is three
    // waves -- a full minute of blank field before the game showed its subject.
    // Moving it up took the teaching board from 50% of runs to 79%, and bumper,
    // mixed-board and scavenger exposure each from ~40% to 58%, with no change
    // in median survival. Terrain paying its way (see the volt economy) is what
    // made an earlier introduction affordable.
    //
    // `conc` keeps it out of the bag; wave 2 asks for it by name.
    id: "CIRCUIT",
    conc: 99,
    build: () => {
      const r = 62 + rnd(-6, 6);
      const cw = rndi(2) === 0;
      const pts = [
        [CX, CY - r],
        [CX + r, CY],
        [CX, CY + r],
        [CX - r, CY],
      ];
      return pts.map(([x, y], i) => {
        const [nx, ny] = pts[(i + (cw ? 1 : 3)) % 4];
        return arrow(x, y, dirToward(x, y, nx, ny));
      });
    },
  },
  // Every family draws fresh geometry each wave, so a template never produces
  // the same board twice -- and every one of them puts arrows and bumpers on
  // the same screen. Measurement of the previous set found each family used a
  // single piece type, so the two behaviours never appeared together and the
  // difference between them was structurally unlearnable however long you
  // played. Side by side is the only arrangement in which it can be read.
  {
    id: "LOOP",
    conc: 2,
    build: (w) => {
      // Four arrows aimed at each other around a diamond. A spark that touches
      // any one of them is on the circuit from that moment, whichever direction
      // it arrived from -- and that independence is the whole reason absolute
      // direction reads as terrain where a relative turn did not.
      const r = clamp(78 - 2 * (w - 3), 50, 78) + rnd(-4, 4);
      const cw = rndi(2) === 0;
      const pts = [
        [CX, CY - r],
        [CX + r, CY],
        [CX, CY + r],
        [CX - r, CY],
      ];
      const out = pts.map(([x, y], i) => {
        const [nx, ny] = pts[(i + (cw ? 1 : 3)) % 4];
        return arrow(x, y, dirToward(x, y, nx, ny));
      });
      // The bumpers sit outside the diamond on the diagonal the circuit leaves
      // free: they disturb what is about to enter the loop without breaking it.
      const b = r * 0.78;
      const s = rndi(2) === 0 ? 1 : -1;
      out.push(bumper(CX + b * s, CY + b));
      out.push(bumper(CX - b * s, CY - b));
      return out;
    },
  },
  {
    id: "CHICANE",
    conc: 2,
    build: () => {
      // Two rows driving opposite ways along the field. A spark caught between
      // them is pumped across the board instead of parked in an orbit, so the
      // income travels and the keeper has to travel with it.
      const dy = rndi(0, 21);
      const dx = rndi(0, 21) - 10;
      const right = rndi(2) === 0;
      const out = [];
      [56 + dx, 128, 200 - dx].forEach((x) => {
        out.push(arrow(x, 72 + dy, right ? 1 : 2));
        out.push(arrow(x, 176 - dy, right ? 0 : 3));
      });
      // Turned back at the ends by bumpers, so both piece types act on the same
      // spark a few seconds apart and can be compared on one trip.
      out.push(bumper(FIELD.left + 26, CY));
      out.push(bumper(FIELD.right - 26, CY));
      return out;
    },
  },
  {
    id: "SPINE",
    conc: 3,
    build: () => {
      const dx = rndi(0, 25);
      const dy = rndi(0, 25) - 12;
      const out = [];
      [48 + dx, 208 - dx].forEach((x) =>
        [74 + dy, 124, 174 - dy].forEach((y) => out.push(bumper(x, y)))
      );
      // Two arrows on the centre line feed the bumper walls. Standing between a
      // piece that chooses a direction and a piece that merely returns one is
      // the plainest place to learn which is which.
      const up = rndi(2) === 0;
      out.push(arrow(CX, CY - 56, up ? 2 : 1));
      out.push(arrow(CX, CY + 56, up ? 0 : 3));
      return out;
    },
  },
  {
    id: "FUNNEL",
    conc: 3,
    build: () => {
      // Every arrow points the same way, so the whole board carries one current
      // and the harvest is wherever it empties. Nothing here can face anything
      // else, which is the cheapest possible way to be certain of it.
      const d = rndi(4);
      const v = ARROW_DIRS[d];
      const jx = rnd(-8, 8);
      const jy = rnd(-8, 8);
      const out = [];
      for (let i = 0; i < 5; i++) {
        // A rake laid across the current rather than a queue along it.
        const t = (i - 2) * 30;
        out.push(arrow(CX - v.y * t - v.x * 40 + jx, CY + v.x * t - v.y * 40 + jy, d));
      }
      // Downstream, where the current empties: the only pieces on the board
      // that can send it back, and the reason the flow is a loop not a drain.
      out.push(bumper(CX + v.x * 62, CY + v.y * 62));
      out.push(bumper(CX + v.x * 30 - v.y * 44, CY + v.y * 30 + v.x * 44));
      return out;
    },
  },
  {
    id: "MILL",
    conc: 3,
    build: () => {
      // Every arrow turns, but never together: the phase is spread across the
      // rotation period so the board reads as a wave crossing it. The rotors
      // this replaces all snapped on one shared frame, which measured as twelve
      // machine turns for every player action and read as noise.
      const n = 6;
      const r = rnd(48, 66);
      const a0 = rnd(0, PI * 2);
      const spin = rndi(2) === 0 ? 1 : -1;
      const out = [];
      for (let i = 0; i < n; i++) {
        const a = a0 + (i * PI * 2) / n;
        out.push(arrow(CX + Math.cos(a) * r, CY + Math.sin(a) * r, rndi(4), spin, i / n));
      }
      out.push(bumper(CX, CY - 78));
      out.push(bumper(CX, CY + 78));
      return out;
    },
  },
];

const PORTS = [
  { x: FIELD.left + 2, y: 64 },
  { x: FIELD.left + 2, y: 124 },
  { x: FIELD.left + 2, y: 184 },
  { x: FIELD.right - 2, y: 64 },
  { x: FIELD.right - 2, y: 124 },
  { x: FIELD.right - 2, y: 184 },
  { x: 48, y: FIELD.top + 2 },
  { x: 128, y: FIELD.top + 2 },
  { x: 208, y: FIELD.top + 2 },
  { x: 48, y: FIELD.bottom - 2 },
  { x: 128, y: FIELD.bottom - 2 },
  { x: 208, y: FIELD.bottom - 2 },
];

/* --------------------------------------------------------------- difficulty */

function diff(w) {
  return {
    sparkCount: Math.min(12, 3 + w),
    sparkSpeed: Math.min(3.0, 1.2 + 0.08 * w),
    // Drain has to be read against income, not against the bar: measured play
    // banks 4.5 energy/s (36.7 absorbs/min, 3.5 per ground), so the old
    // 1.5-3.0/s was 40% of income and the capacitor pinned at 90-100 for 65%
    // of frames and never once ended a life. At this rate a full bar is ~22 s
    // of wave-1 silence, and the shadow simulation puts the bar's working range
    // at 20-50 instead of at the ceiling.
    //
    // The slope tracks measured income per wave (4.1/s at wave 1, 9.3/s at
    // wave 12) so the squeeze is constant rather than arriving all at once, and
    // the ceiling sits where income stops growing -- `sparkCount` caps at 12,
    // so past wave 12 a rising drain would be a wall no amount of skill could
    // answer, which is a clock, not a difficulty curve.
    drainPerFrame: Math.min(10.0, 4.0 + 0.5 * w) / 60,
    heavyRatio: Math.min(0.3, 0.05 * w),
    // Wave 5 put the scavenger past where runs end: it appeared in 3 of 12
    // measured runs, six times in twenty minutes of play. It is the only thing
    // that can take a piece off the board, so it has to be somewhere a run
    // actually goes -- one wave after terrain itself, so the teaching board is
    // never being eaten while it is being read. Holding it back a further wave
    // was measured and rejected: it cost 20 points of exposure (58% of runs
    // down to 38%) and bought nothing else.
    scavPeriod: w >= 3 ? Math.max(420, 1200 - 60 * w) : Infinity,
    chargerRatio: w >= 8 ? Math.min(0.2, 0.03 * (w - 7)) : 0,
    // Unlock pace, set from measured reach rather than from intent. Twelve
    // piloted runs ended at a median of wave 4 and never once passed wave 6,
    // so a schedule that opened the last families at waves 6 and 8 was shipping
    // content nobody would ever see -- two of the six were reached in 0 of 12
    // runs. Everything is now open by wave 3, because a median run only gets to
    // show three or four boards at all, and an unlock later than that is a
    // board nobody meets.
    concentrationCap: 1 + Math.floor(w / 1.5),
    rotPeriod: Math.max(90, 240 - 10 * w),
  };
}

/** Energy the wave demands: most of what it will drain over its full length. */
function quotaFor(w) {
  return Math.round(diff(w).drainPerFrame * WAVE_FRAMES * QUOTA_RATIO);
}

/* -------------------------------------------------------------- game state */

let keeper;
let sparks;
let scavengers;
let pieces;
let pending;
let capacitor;
let multiplier;
let multTimer;
let lives;
let wave;
let waveTimer;
let surgeTimer;
let waveBonus;
let tallyTimer;
let tallyCharge;
let tallyPaid;
let waveBanked;
let waveQuota;
let quotaMet;
let quotaCleared;
let scavTimer;
let warnTimer;
let groundAbsorbs;
let familyBag;
let familyBagKey;
let lastFamilyId;
let currentFamily;
let missPending;
let phase;
let phaseTimer;
let gameScore;
let hiScore;
let popups;
let attractCard;
let barFlash;

const GROUND_FRAMES = 30;
// The recovery window is the price of committing to a ground. It is kept short
// enough to read as a beat rather than a punishment, and the keeper draws a
// countdown arc so the player always knows exactly when they are safe again.
const RECOVER_FRAMES = 45;
const RECOVER_SPEED = 0.9;
const GROUND_SPEED = 0.35;
const READY_FRAMES = 100;
const MISS_FRAMES = 90;
const GAMEOVER_FRAMES = 260;
const HI_SCORE_KEY = "voltKeeper.hiScore";
const RING_R = 22;
// The scavenger crosses ground faster than the keeper (1.25) on purpose, so it
// can never simply be run down -- travel is the costliest act in this economy,
// and an enemy answered by chasing is the one that got a previous enemy deleted
// (interception scored 76% worse than ignoring). It is caught while it eats
// instead: it stops dead on the piece it is taking, and the piece is not lost
// until the window closes. That window is the whole counter-play, so it is long
// enough to cross about 75px and still ground.
// A spark gains a volt every time an arrow turns it, and is worth that much
// more when it is banked. This exists because the premise did not hold: a
// terrain-reading pilot measured only +9-14% income from live terrain, against
// a full wave of survival lost to it -- straighter sparks are easier to dodge,
// so breaking the board was a *favour*. "Harvest terrain that decides where the
// income is" has to be paid for, or standing in the dangerous part of the field
// is simply a mistake and every enemy that damages terrain is a gift.
//
// It is charged by arrows only. That gives the two pieces separate economic
// jobs -- an arrow is the battery farm, a bumper is the accelerator -- and it
// makes a closed circuit the most valuable object on the board, which is what
// the geometry was always shaped to build.
// A bumper's contribution is speed, so speed is what it gets paid for. With
// volts alone the arrow half of the board came good (disabling arrows went from
// *gaining* 10% score to costing 25% income and 8% score) while bumpers stayed a
// pure tax: turning them off still bought 8% more score, because all they did
// was make sparks faster and therefore harder to survive. A fast spark crosses
// the catch ring in fewer frames, so paying more for one is reward for the
// difficulty it actually adds.
const VOLT_CAP = 4;
const VOLT_BONUS = 0.25;
const SPEED_BONUS = 0.4;
const SCAV_SPEED = 1.6;
const SCAV_CHEW_FRAMES = 90;
const SCAV_DISABLE_FRAMES = 300;
// Grounding used to also flip nearby pieces. It is gone, and not because it was
// weak: it was welded to the wrong action. Grounding is how the keeper takes
// the income that exists now, so shaping where future income goes could never
// be aimed -- it fired on 23-43% of grounds, 63-73% of the flips it did cause
// touched no spark within three seconds, and the ones that landed did so a
// median 1.0-1.8s later, somewhere the keeper had already left. Terrain is
// read now, not steered.
const WAVE_FRAMES = 1800;
const SURGE_FRAMES = 60;
// Clearing a wave cashes the capacitor out into score and drops in a fresh
// battery. A top-up (`capacitor + 50`) measured slightly gentler, but it cannot
// be shown honestly: the bar would have to appear to empty into the score while
// the number it carried was actually still there. Cashing out is the rule the
// ceremony can tell -- and it keeps starvation a live death cause (2% of deaths
// against 0% for any top-up, which erases the resource again) while every wave
// still opens from the same known state.
const WAVE_BATTERY = 70;
const TALLY_FRAMES = 36;
// The wave's quota, and the battery it decides. The quota is a multiple of what
// the wave will drain, so it is derived from the difficulty schedule rather than
// tuned against it: "out-earn the leak by a fifth" is the same demand at every
// wave, and it is the game's own sentence rather than a number in a table.
//
// It measures energy banked across the wave, not charge held at the end, and
// that separation is the point: the payout already rewards arriving charged, so
// a second reward for the same thing would compound a bad wave into a worse one.
// Throughput is what a player can still be doing well while the bar is low.
//
// The ratio is set by pass rate, and it has to be above 1.0 to be a gate at all:
// the measured pilot clears 100% of waves at every ratio up to 1.0, 89% at 1.1
// and 74% at 1.2. Past that the short battery starts feeding itself -- at 1.35
// the pass rate falls to 33%, runs shorten 14% and starvation reappears, which
// is a spiral rather than a goal.
const QUOTA_RATIO = 1.2;
const WAVE_BATTERY_SHORT = 40;

/* ------------------------------------------------------------------- audio */

const audio = {
  bus: null,
  ready: false,
  emit(name, opts) {
    if (this.bus) this.bus.emit(name, opts);
  },
};

function setupAudio(activated) {
  if (typeof VKBus === "undefined") return;
  if (!audio.bus) {
    audio.bus = VKBus.createBus({ adapter: VKBus.createWebAudioAdapter() });
    // The animation-frame loop stops when the tab is hidden, but a looping
    // BufferSource does not: without this the BGM keeps playing behind
    // whatever the player switched to.
    if (typeof document !== "undefined" && document.addEventListener) {
      document.addEventListener("visibilitychange", () => {
        if (audio.bus) audio.bus.setPaused(document.visibilityState === "hidden");
      });
    }
  }
  // Rendering the kit needs a user gesture, and attract mode has not had one.
  if (!audio.ready && activated) {
    try {
      audio.bus.init();
      audio.bus.adapter.resume();
      audio.ready = true;
    } catch (e) {
      audio.ready = false;
    }
  }
}

/* -------------------------------------------------------------- game setup */

function shuffled(list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rndi(i + 1);
    const t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return out;
}

function pickFamily(w) {
  // OPEN is the wave-1 board and nothing else. It stayed in the rotation as a
  // breather, which was affordable when a run lasted 8-13 waves; at a measured
  // median of 4 it means spending a quarter of a run on an empty field, and the
  // terrain is the part of the game with something to learn.
  const eligible = FAMILIES.filter((f) => f.id !== "OPEN" && f.conc <= diff(w).concentrationCap);
  const key = eligible.map((f) => f.id).join(",");
  if (key !== familyBagKey || familyBag.length === 0) {
    familyBagKey = key;
    familyBag = shuffled(eligible.map((f) => f.id));
  }
  let id = familyBag.pop();
  if (id === lastFamilyId && familyBag.length > 0) {
    const alt = familyBag.pop();
    familyBag.push(id);
    id = alt;
  }
  lastFamilyId = id;
  return FAMILIES.filter((f) => f.id === id)[0];
}

/* Absolute direction makes two configurations possible that a 90-degree turn
 * never could, and each of them stops the board dead:
 *
 *   - two arrows pointing straight at each other trap a spark ping-ponging
 *     between them forever. It can never be absorbed, because it never leaves
 *     the pair and the keeper cannot stand inside a piece.
 *   - an arrow aimed at a wall it is nearly touching gets the spark handed
 *     straight back off the bounce while it is still inside the catch box, and
 *     it stalls on the spot.
 *
 * Neither is a matter of taste, so both are structural rules rather than things
 * a family is trusted to get right: every piece is kept clear of the edges (a
 * turning arrow eventually points every way, so the margin has to hold in all
 * four), and a facing pair is repaired by turning one arrow a quarter, which
 * preserves the family's shape. */
const EDGE_CLEAR = 18;
const FACE_COS = 0.9; // "straight at each other" rather than merely towards

/** True if `r` is aimed at a fixed arrow that is aimed back down the same line. */
function facesAnother(r, list) {
  const v = ARROW_DIRS[r.dir];
  for (const o of list) {
    if (o === r || o.kind !== "arrow" || o.spin) continue;
    if ((o.dir + 2) % 4 !== r.dir) continue;
    const dx = o.x - r.x;
    const dy = o.y - r.y;
    const len = Math.hypot(dx, dy) || 1;
    if ((dx * v.x + dy * v.y) / len > FACE_COS) return true;
  }
  return false;
}

function buildLayout(w) {
  // Wave 1 opens the run on an empty field: the ground-and-absorb loop with
  // nothing else to attribute anything to. Filling this slot with terrain was
  // measured back when terrain did not pay for itself and cost a median wave of
  // survival; now that it does, only the first wave stays blank.
  if (w <= 1) {
    lastFamilyId = "OPEN";
    currentFamily = "OPEN";
    return [];
  }
  // Wave 2 is not drawn from the bag: it is the one board whose job is to be
  // understood rather than survived.
  const family = w === 2 ? FAMILIES.filter((f) => f.id === "CIRCUIT")[0] : pickFamily(w);
  if (w === 2) lastFamilyId = "CIRCUIT";
  currentFamily = family.id;
  const list = family.build(w);
  for (const r of list) {
    // Fairness rule: nothing within 40px of the respawn point. Pushing radially
    // keeps every family's symmetry intact.
    const rx = r.x - CX;
    const ry = r.y - CY;
    const dist = Math.sqrt(rx * rx + ry * ry);
    if (dist < 40) {
      const k = dist < 1 ? 0 : 40 / dist;
      r.x = dist < 1 ? CX + 40 : CX + rx * k;
      r.y = dist < 1 ? CY : CY + ry * k;
    }
    r.x = clamp(r.x, FIELD.left + EDGE_CLEAR, FIELD.right - EDGE_CLEAR);
    r.y = clamp(r.y, FIELD.top + EDGE_CLEAR, FIELD.bottom - EDGE_CLEAR);
  }
  for (const r of list) {
    if (r.kind !== "arrow" || r.spin) continue;
    for (let turn = 0; turn < 4 && facesAnother(r, list); turn++) r.dir = (r.dir + 1) % 4;
  }
  return list;
}

/* ---------------------------------------------------- score & persistence */

function loadHiScore() {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(HI_SCORE_KEY) : null;
    const value = raw == null ? 0 : parseInt(raw, 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch (e) {
    return 0;
  }
}

function saveHiScore() {
  // Never written from attract mode: a demo run must not rewrite the table.
  if (phase === "attract") return;
  if (gameScore <= hiScore) return;
  hiScore = gameScore;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(HI_SCORE_KEY, String(hiScore));
  } catch (e) {
    /* storage unavailable: the session hi-score still stands */
  }
}

/** Score with no popup: for points that are already being shown some other way. */
function payScore(points) {
  gameScore += points;
  if (gameScore > hiScore && phase !== "attract") hiScore = gameScore;
}

function award(points, x, y) {
  payScore(points);
  popups.push({ x, y, text: String(points), life: 42, kind: "score" });
  if (popups.length > 32) popups.shift();
}

function pad7(v) {
  const s = String(Math.max(0, Math.floor(v)));
  return "0".repeat(Math.max(0, 7 - s.length)) + s;
}

/* ------------------------------------------------------------ run lifecycle */

function initGame() {
  keeper = { x: CX, y: CY, state: "free", timer: 0, invuln: 0 };
  sparks = [];
  scavengers = [];
  pending = [];
  capacitor = 100;
  multiplier = 1;
  multTimer = 0;
  lives = 3;
  wave = 1;
  waveTimer = 0;
  surgeTimer = 0;
  waveBonus = 0;
  tallyTimer = 0;
  tallyCharge = 0;
  tallyPaid = 0;
  waveBanked = 0;
  quotaMet = false;
  quotaCleared = false;
  waveQuota = quotaFor(wave);
  scavTimer = 0;
  warnTimer = 0;
  groundAbsorbs = 0;
  familyBag = [];
  familyBagKey = "";
  lastFamilyId = "";
  currentFamily = "OPEN";
  missPending = false;
  gameScore = 0;
  popups = [];
  barFlash = 0;
  pieces = buildLayout(wave);
}

/** Frame zero of the whole cabinet, not of a run. */
function boot() {
  hiScore = loadHiScore();
  attractCard = 0;
  initGame();
  phase = "attract";
  phaseTimer = 0;
}

function startRun() {
  initGame();
  phase = "ready";
  phaseTimer = READY_FRAMES;
  if (audio.bus) {
    audio.bus.startBgm();
    // The frame that starts a run was still attract when beginFrame ran, so it
    // is flagged demo and every emission on it is suppressed. This one is not
    // a demo emission by definition -- the run is starting.
    audio.emit("game:start", { demo: false });
  }
}

function restartDemo() {
  initGame();
  phaseTimer = 0;
}

/* ---------------------------------------------------------- input bindings */

const moveLeft = () => keyboard.code.ArrowLeft.isPressed || keyboard.code.KeyA.isPressed;
const moveRight = () => keyboard.code.ArrowRight.isPressed || keyboard.code.KeyD.isPressed;
const moveUp = () => keyboard.code.ArrowUp.isPressed || keyboard.code.KeyW.isPressed;
const moveDown = () => keyboard.code.ArrowDown.isPressed || keyboard.code.KeyS.isPressed;
const actionPressed = () =>
  keyboard.code.Space.isJustPressed ||
  keyboard.code.KeyZ.isJustPressed ||
  keyboard.code.KeyX.isJustPressed ||
  keyboard.code.KeyJ.isJustPressed ||
  keyboard.code.KeyK.isJustPressed;

/* -------------------------------------------------------------- spark logic */

/**
 * Every spark is built here. Three call sites used to spell out their own field
 * lists, and when `volts` was added the one that was missed produced NaN energy
 * and a NaN score on absorb -- silently, because nothing absorbs that
 * particular spark often enough for a test to trip over it. A single factory is
 * the only version of this that stays correct when a field is added.
 */
function makeSpark(x, y, d, speed, type, extra) {
  return Object.assign(
    {
      x,
      y,
      dx: d.x,
      dy: d.y,
      speed,
      // What it was launched at, so "sped up" means sped up from where this
      // spark started rather than from whatever the current wave spawns at. A
      // spark outlives the wave that made it, and against the moving reference
      // the bonus almost never fired at all.
      baseSpeed: speed,
      type,
      size: type === "heavy" ? 12 : 8,
      volts: 0,
      ignoreRef: null,
      ignoreUntil: 0,
    },
    extra
  );
}

/**
 * How much more than base a spark is worth: 0 for one fresh off a port, up to
 * 1.4 for one that has been round a circuit and been sped up. Both halves of the
 * terrain feed this, which is why it is one number and gets one indicator --
 * the player's question is "which spark do I cross the field for", and the
 * cause of the value does not change the answer.
 */
function sparkBonus(s) {
  const base = s.baseSpeed || diff(wave).sparkSpeed;
  const fast = clamp((s.speed - base) / base, 0, 1);
  return VOLT_BONUS * s.volts + SPEED_BONUS * fast;
}

function spawnSpark(port, type) {
  const inward = { x: CX - port.x, y: CY - port.y };
  const d = snapDir(inward.x, inward.y, inward.x, inward.y);
  const speed = diff(wave).sparkSpeed * (type === "heavy" ? 0.6 : 1);
  // Start clear of the wall so the first frame is travel, not an instant bounce.
  sparks.push(makeSpark(port.x + d.x * 10, port.y + d.y * 10, d, speed, type));
}

function schedulePort() {
  const d = diff(wave);
  const alive = sparks.length + pending.length;
  if (alive >= d.sparkCount) return;
  const port = PORTS[rndi(PORTS.length)];
  let type = "spark";
  if (rnd() < d.chargerRatio) type = "charger";
  else if (rnd() < d.heavyRatio) type = "heavy";
  pending.push({ port, type, at: ticks + 40 });
  audio.emit("spark:launch");
}

function deflectSpark(s) {
  for (const r of pieces) {
    if (r.disabledUntil > ticks) continue;
    if (s.ignoreRef === r && ticks < s.ignoreUntil) continue;
    if (r.kind === "bumper") {
      const rx = s.x - r.x;
      const ry = s.y - r.y;
      const d2 = rx * rx + ry * ry;
      if (d2 > 64) continue;
      const len = Math.sqrt(d2) || 1;
      const nx = rx / len;
      const ny = ry / len;
      const dot = s.dx * nx + s.dy * ny;
      const snapped = snapDir(s.dx - 2 * dot * nx, s.dy - 2 * dot * ny, nx, ny);
      s.dx = snapped.x;
      s.dy = snapped.y;
      s.x = r.x + nx * 10;
      s.y = r.y + ny * 10;
      s.speed = Math.min(4.0, s.speed + 0.2);
      r.flash = 6;
      audio.emit("spark:bumper");
    } else {
      if (Math.abs(s.x - r.x) > 6 || Math.abs(s.y - r.y) > 6) continue;
      const v = ARROW_DIRS[r.dir];
      // Absolute, not relative: whatever the spark was doing, it leaves along
      // the arrow. The incoming direction is not consulted at all, which is
      // exactly what makes the piece readable -- everything it will do is
      // drawn on it, so the board can be understood without simulating it.
      const turned = Math.abs(s.dx - v.x) > 1e-9 || Math.abs(s.dy - v.y) > 1e-9;
      s.dx = v.x;
      s.dy = v.y;
      // Only the offset across the new heading is snapped away. Snapping the
      // position outright would put every spark that ever touched this arrow on
      // one exact line, and a board of single-file streams has no geometry left
      // to read; leaving the offset alone instead lets a circuit leak, because
      // an entry offset of +-6 becomes +-12 by the next piece and misses it.
      // Zeroing only the cross-track part keeps a circuit exactly closed while
      // sparks still arrive spread out along it.
      const along = (s.x - r.x) * v.x + (s.y - r.y) * v.y;
      s.x = r.x + v.x * along;
      s.y = r.y + v.y * along;
      s.ignoreRef = r;
      s.ignoreUntil = ticks + 4;
      // A spark already travelling this way was not turned by anything, and
      // flashing as though it were is a claim the player learns to distrust.
      if (!turned) return;
      // Charged on the turn, not on the touch: a spark already running the way
      // the arrow points was not worked on by it, and paying for that would let
      // a spark bank volts by grazing one piece over and over.
      if (s.volts < VOLT_CAP) s.volts++;
      r.flash = 5;
      audio.emit("spark:deflect");
      return;
    }
    s.ignoreRef = r;
    s.ignoreUntil = ticks + 4;
    return;
  }
}

function bounceWalls(s) {
  const h = s.size / 2;
  let hit = false;
  if (s.x < FIELD.left + h) {
    s.x = FIELD.left + h;
    s.dx = -s.dx;
    hit = true;
  } else if (s.x > FIELD.right - h) {
    s.x = FIELD.right - h;
    s.dx = -s.dx;
    hit = true;
  }
  if (s.y < FIELD.top + h) {
    s.y = FIELD.top + h;
    s.dy = -s.dy;
    hit = true;
  } else if (s.y > FIELD.bottom - h) {
    s.y = FIELD.bottom - h;
    s.dy = -s.dy;
    hit = true;
  }
  if (hit && s.type === "charger") s.speed = Math.min(5.0, s.speed + 0.25);
}

/* ------------------------------------------------------------------ economy */

// Wave-level announcements share one lane just inside the top of the field.
// They do not drift, because popups are drawn with the world and the HUD is
// drawn over them: a banner that rises off the top of the playfield ends up
// behind the capacitor bar, which is where OVERCHARGE used to vanish. Two can
// fire on the same absorb -- one spark can cross the quota and overflow the
// capacitor at once -- so a new banner stacks below any still on screen rather
// than overprinting it.
const BANNER = { y: 28, step: 12 };

function banner(s, kind, life) {
  // Overcharge repeats for as long as the player stays topped up, so the same
  // word re-fires while it is still on screen. Refresh it in place: stacking
  // duplicates would walk the lane down the playfield saying one thing.
  const live = popups.find((p) => p.banner && p.text === s);
  if (live) {
    live.life = life;
    return;
  }
  const lane = popups.reduce((n, p) => n + (p.banner ? 1 : 0), 0);
  popups.push({ x: CX, y: BANNER.y + lane * BANNER.step, text: s, life, kind, banner: true });
}

/**
 * Add energy and show it. Anything past 100 is not thrown away: it converts to
 * score, so absorbing while topped up is still worth doing and a full
 * capacitor becomes a scoring state rather than a reason to stop.
 */
function addEnergy(v, x, y) {
  const before = capacitor;
  // Banked gross, before the ceiling: energy that spilled was still harvested,
  // and a player who is topped up has not stopped working.
  if (v > 0) {
    waveBanked += v;
    if (!quotaMet && waveBanked >= waveQuota) {
      quotaMet = true;
      banner("QUOTA MET", "quota", 60);
      audio.emit("wave:quota");
    }
  }
  capacitor = Math.min(100, capacitor + v);
  const gained = capacitor - before;
  const px = x == null ? keeper.x : x;
  const py = y == null ? keeper.y : y;
  if (gained >= 0.5) {
    popups.push({ x: px, y: py, text: "+" + Math.round(gained), life: 40, kind: "energy" });
    barFlash = 10;
  }
  const overflow = before + v - 100;
  if (overflow >= 0.5) {
    award(Math.round(overflow) * 10 * multiplier, px, py - 10);
    banner("OVERCHARGE", "overcharge", 48);
    barFlash = 24;
    audio.emit("keeper:overcharge");
  }
}

function absorbSpark(s, index) {
  groundAbsorbs++;
  const chain = groundAbsorbs;
  // What the terrain was for. A spark that has been round a loop and picked up
  // speed is worth well over twice one that came straight off a port, and that
  // difference is the reason to stand in the busy part of the board rather than
  // fish in open water.
  const volt = 1 + sparkBonus(s);
  if (s.type === "heavy") {
    addEnergy(20 * volt, s.x, s.y);
    multiplier = Math.min(9, multiplier + 2);
    audio.emit("heavy:absorb");
    // A heavy pays the most and immediately doubles the board. The children
    // are fired away from the keeper and cannot be absorbed for 45 frames, so
    // the split is a real cost instead of two more free absorbs in the ring
    // you are already standing in.
    const away = Math.atan2(s.y - keeper.y, s.x - keeper.x);
    for (let k = 0; k < 2; k++) {
      const a = away + (k === 0 ? 0.9 : -0.9);
      const d = snapDir(Math.cos(a), Math.sin(a), Math.cos(away), Math.sin(away));
      // The children come out flat: a heavy's volts are cashed by the heavy,
      // and splitting is not a way to duplicate them.
      sparks.push(
        makeSpark(s.x + d.x * (RING_R + 4), s.y + d.y * (RING_R + 4), d, s.speed * 1.2, "spark", {
          ignoreUntil: ticks + 6,
          immuneUntil: ticks + 45,
        })
      );
    }
  } else if (s.type === "charger") {
    addEnergy(6 * volt, s.x, s.y);
    multiplier = Math.min(9, multiplier + 3);
    audio.emit("charger:absorb");
  } else {
    addEnergy((chain === 1 ? 9 : chain === 2 ? 12 : 15) * volt, s.x, s.y);
    multiplier = Math.min(9, multiplier + 1);
    audio.emit("spark:absorb" + Math.min(3, chain));
  }
  if (multiplier >= 9) audio.emit("multiplier:max");
  multTimer = 0;
  const points = Math.round((s.type === "charger" ? 300 : 100) * multiplier * volt);
  award(points, s.x, s.y);
  particle(vec(s.x, s.y), { count: 8, speed: 1.6, angle: 0, angleWidth: PI * 2 });
  sparks.splice(index, 1);
}

function loseLife(reason) {
  lives--;
  audio.emit("keeper:miss");
  particle(vec(keeper.x, keeper.y), { count: 24, speed: 2.4, angle: 0, angleWidth: PI * 2 });
  // Push every spark to its nearest wall so the respawn is never a re-death.
  for (const s of sparks) {
    const dl = s.x - FIELD.left;
    const dr = FIELD.right - s.x;
    const dt = s.y - FIELD.top;
    const db = FIELD.bottom - s.y;
    const m = Math.min(dl, dr, dt, db);
    if (m === dl) s.x = FIELD.left + s.size;
    else if (m === dr) s.x = FIELD.right - s.size;
    else if (m === dt) s.y = FIELD.top + s.size;
    else s.y = FIELD.bottom - s.size;
  }
  capacitor = 50;
  multiplier = 1;
  keeper.x = CX;
  keeper.y = CY;
  keeper.state = "free";
  keeper.timer = 0;
  keeper.invuln = 90;
  groundAbsorbs = 0;
  // The phase machine decides what a miss means; this function only reports it.
  missPending = true;
}

/* --------------------------------------------------------------------- draw */

function drawField() {
  color("light_black");
  rect(FIELD.left - 1, FIELD.top - 1, FIELD.right - FIELD.left + 2, 1);
  rect(FIELD.left - 1, FIELD.bottom + 1, FIELD.right - FIELD.left + 2, 1);
  rect(FIELD.left - 1, FIELD.top - 1, 1, FIELD.bottom - FIELD.top + 3);
  rect(FIELD.right + 1, FIELD.top - 1, 1, FIELD.bottom - FIELD.top + 3);
}

function drawHud() {
  // Score is drawn here, not by the library: this is a game-owned cycle.
  color("light_cyan");
  text("SCORE " + pad7(gameScore), 4, 3, { isSmallText: true });
  color(gameScore >= hiScore && gameScore > 0 ? "yellow" : "light_black");
  text("HI " + pad7(hiScore), 200, 3, { isSmallText: true });

  // During the tally the bar shows the charge being spent, not the fresh
  // battery already sitting in `capacitor`: the drain is the payment. The alarm
  // colour is suppressed for the same reason -- an emptying bar here is the
  // reward being counted, not the warning it would be during play.
  const shown = tallyTimer > 0 ? (tallyCharge * tallyTimer) / TALLY_FRAMES : capacitor;
  const ratio = shown / 100;
  color("light_black");
  rect(BAR.x - 1, BAR.y - 1, BAR.w + 2, BAR.h + 2);
  if (barFlash > 0) {
    barFlash--;
    color(ticks % 4 < 2 ? "light_green" : "light_cyan");
  } else {
    color(capacitor < 30 ? (ticks % 16 < 8 ? "red" : "light_red") : capacitor < 60 ? "yellow" : "green");
  }
  rect(BAR.x, BAR.y, Math.max(0, BAR.w * ratio), BAR.h);
  color("light_cyan");
  text("W" + wave + " " + currentFamily, 92, 10, { isSmallText: true });
  text("x" + multiplier, 8, 10, { isSmallText: true });
  color("light_red");
  text("*".repeat(Math.max(0, lives)), 216, 10, { isSmallText: true });

  // Quota meter. A quota only revealed at the surge would be a lottery: the
  // whole point is that the last ten seconds of a wave can be played
  // differently, which requires seeing how far short the wave is while there is
  // still time to fix it. It sits on the status row rather than under the
  // capacitor bar because the two are different quantities -- one is a level,
  // one is a total -- and stacking them invites reading one as the other.
  // Growing marks against a shared target tick, with no track behind them: on
  // this theme an empty track is a bright slab, and a bright slab above the
  // capacitor bar reads as a second capacitor sitting nearly empty. The tick is
  // the only static part, and it is the finish line for both marks.
  const q = clamp(waveBanked / Math.max(1, waveQuota), 0, 1);
  const t = surgeTimer > 0 ? 0 : clamp(waveTimer / WAVE_FRAMES, 0, 1);
  color("light_black");
  rect(QUOTA_BAR.x + QUOTA_BAR.w, QUOTA_BAR.y, 1, CLOCK_BAR.y + CLOCK_BAR.h - QUOTA_BAR.y);
  color(quotaMet ? (ticks % 8 < 4 ? "light_green" : "green") : q > 0.75 ? "light_yellow" : "yellow");
  rect(QUOTA_BAR.x, QUOTA_BAR.y, Math.max(0, QUOTA_BAR.w * q), QUOTA_BAR.h);
  const last = !surgeTimer && waveTimer > WAVE_FRAMES - CLOCK_WARN_FRAMES;
  color(last ? (ticks % 8 < 4 ? "cyan" : "blue") : "blue");
  rect(CLOCK_BAR.x, CLOCK_BAR.y, Math.max(0, CLOCK_BAR.w * t), CLOCK_BAR.h);
}

/* On this theme every `light_*` entry is its base colour at half brightness, not
 * a lighter tint, so the palette runs (contrast against the #090c1b field):
 * light_blue x3.4, light_cyan x5.0, light_green x5.2, blue x6.8, light_yellow
 * x7.4, light_black x9.3, green x10.5, black x18.6 (near-white). The pieces
 * were once coloured as if `light_` meant brighter, which inverted all three
 * states: the commonest piece sat at x3.4 -- the dimmest mark on the field --
 * while `light_black` made a disabled one x9.3, brighter than anything live,
 * and the `light_` hit flash dimmed the very piece it was meant to announce.
 *
 * So the three states are ordered by brightness, which is what a player
 * actually reads: ghost when off, legible terrain when live, white pop on a
 * hit. Arrows take the neutral silver and bumpers the green, so the two are
 * separated by shape and hue at once.
 */
function drawPieces() {
  for (const r of pieces) {
    const disabled = r.disabledUntil > ticks;
    // Off is dimmer than anything live; a hit is brighter than anything live.
    const off = "light_blue";
    const hit = "black";
    if (r.kind === "bumper") {
      color(disabled ? off : r.flash > 0 ? hit : "green");
      arc(vec(r.x, r.y), 8, 2);
    } else {
      color(disabled ? off : r.flash > 0 ? hit : "light_black");
      // A literal arrow. The piece has exactly one thing to say -- everything
      // that touches me leaves this way -- and an arrow is the shape that says
      // it without a legend. The chevron this replaces had to encode a turn
      // direction, which is a fact about the spark rather than about the piece,
      // and no glyph can draw that. Drawn at 2x so it fills the 12x12 catch box.
      char("a", r.x, r.y, { rotation: r.dir, scale: { x: 2, y: 2 } });
      // A ring means this one turns on its own, so a board of them can be told
      // from a board that will still be pointing the same way in ten seconds.
      if (r.spin) arc(vec(r.x, r.y), 9, 1);
    }
    if (r.flash > 0) r.flash--;
  }
}

/* ------------------------------------------------------------ world update */

/** One frame of the simulation. `inp` comes from the keyboard or the demo bot. */
function stepWorld(inp) {
  const d = diff(wave);
  const surging = surgeTimer > 0;

  /* --- input & player state ------------------------------------------- */
  // Grounding still commits, but it no longer takes the controls away: the
  // keeper can creep about 10px over the whole 30-frame window. That cannot
  // dodge anything (a spark crosses the ring in ~10 frames) and it cannot
  // chase anything, so it lowers no risk -- sparks inside the ring are being
  // absorbed, not threatening. It only lets a good read be nudged into a
  // catch, which is the part of the gesture worth rewarding.
  const speed =
    keeper.state === "ground" ? GROUND_SPEED : keeper.state === "recover" ? RECOVER_SPEED : 1.25;
  if (inp.left) keeper.x -= speed;
  if (inp.right) keeper.x += speed;
  if (inp.up) keeper.y -= speed;
  if (inp.down) keeper.y += speed;
  keeper.x = clamp(keeper.x, FIELD.left + 8, FIELD.right - 8);
  keeper.y = clamp(keeper.y, FIELD.top + 8, FIELD.bottom - 8);
  if (keeper.state === "free" && inp.action && !surging) {
    keeper.state = "ground";
    keeper.timer = GROUND_FRAMES;
    groundAbsorbs = 0;
    capacitor -= 4;
    audio.emit("keeper:ground");
  } else if (keeper.state === "ground") {
    keeper.timer--;
    if (keeper.timer <= 0) {
      if (groundAbsorbs === 0) {
        multiplier = Math.max(1, multiplier - 1);
        audio.emit("keeper:groundEmpty");
      }
      keeper.state = "recover";
      keeper.timer = RECOVER_FRAMES;
    }
  } else if (keeper.state === "recover") {
    keeper.timer--;
    if (keeper.timer <= 0) {
      keeper.state = "free";
      audio.emit("keeper:recover");
    }
  }
  if (keeper.invuln > 0) keeper.invuln--;

  /* --- spawning -------------------------------------------------------- */
  if (!surging) {
    if (ticks % 30 === 0) schedulePort();
    remove(pending, (p) => {
      if (ticks < p.at) return false;
      spawnSpark(p.port, p.type);
      return true;
    });
    scavTimer++;
    if (scavTimer >= d.scavPeriod && pieces.length > 0) {
      scavTimer = 0;
      scavengers.push({
        x: rnd() < 0.5 ? FIELD.left + 3 : FIELD.right - 3,
        y: FIELD.top + 6,
        target: null,
        chew: 0,
      });
    }
  }

  /* --- turning arrows -------------------------------------------------- */
  // Staggered by phase, never on a shared frame: a whole field changing its
  // mind at once is an event the player cannot attribute to anything, which is
  // how the old rotors managed to turn 605 times a wave and still read as
  // nothing happening.
  for (const r of pieces) {
    if (r.kind !== "arrow" || !r.spin || r.disabledUntil > ticks) continue;
    if (ticks > 0 && (ticks + Math.floor(r.phase * d.rotPeriod)) % d.rotPeriod === 0) {
      r.dir = (r.dir + r.spin + 4) % 4;
      r.flash = 10;
      audio.emit("arrow:turn");
    }
  }

  /* --- scavengers ------------------------------------------------------ */
  // The leaker enemy was removed after measurement: as a periodic drain it
  // changed no outcome, as an expensive drain it was a tax with no affordable
  // counter-play (intercepting scored 76% worse than ignoring), and as a
  // camp-detector it fired on normal play while the camping it targeted was
  // already lethal on its own within ~36 seconds.
  const grounded = keeper.state === "ground";
  remove(scavengers, (s) => {
    if (grounded && (s.x - keeper.x) ** 2 + (s.y - keeper.y) ** 2 <= RING_R * RING_R) {
      addEnergy(5, s.x, s.y);
      award(50 * multiplier, s.x, s.y);
      groundAbsorbs++;
      audio.emit("minor:absorb");
      return true;
    }
    if (surging) return false;
    // Arrows only. Measured against a terrain-reading pilot, taking an arrow
    // off the board costs 25% of income and 8% of score, while taking a bumper
    // off *gains* 8% score -- a bumper is a hazard that pays a little, so
    // removing one is a favour. An enemy whose effect is a favour is not an
    // enemy, so it eats the half of the terrain that is actually worth having.
    const live = pieces.filter((r) => r.kind === "arrow" && r.disabledUntil <= ticks);
    if (live.length === 0) return false;
    if (!s.target || s.target.disabledUntil > ticks) {
      let best = live[0];
      let bd = Infinity;
      for (const r of live) {
        const dd = (r.x - s.x) ** 2 + (r.y - s.y) ** 2;
        if (dd < bd) {
          bd = dd;
          best = r;
        }
      }
      s.target = best;
      s.chew = 0;
    }
    const dx = s.target.x - s.x;
    const dy = s.target.y - s.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    if (len >= 8) {
      s.x += (dx / len) * SCAV_SPEED;
      s.y += (dy / len) * SCAV_SPEED;
      s.chew = 0;
      return false;
    }
    // Latched on, stationary, and the piece is not lost yet. Everything about
    // this enemy is arranged around this window: it is why the thing is allowed
    // to outrun the keeper, and it turns "a piece went away" into "that arrow
    // is going in a second and a half unless you leave what you are doing".
    s.chew++;
    if (s.chew >= SCAV_CHEW_FRAMES) {
      s.target.disabledUntil = ticks + SCAV_DISABLE_FRAMES;
      s.target = null;
      s.chew = 0;
      audio.emit("scavenger:disable");
    }
    return false;
  });

  /* --- sparks: move, deflect, absorb, kill ----------------------------- */
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    if (!surging) {
      s.x += s.dx * s.speed;
      s.y += s.dy * s.speed;
      bounceWalls(s);
      deflectSpark(s);
    }
    const dx = s.x - keeper.x;
    const dy = s.y - keeper.y;
    const dist2 = dx * dx + dy * dy;
    // A freshly split child is inert in both directions: it cannot be banked
    // and it cannot kill. Anything else would be a spawn you cannot react to.
    if (s.immuneUntil && ticks < s.immuneUntil) continue;
    if (grounded) {
      if (dist2 <= RING_R * RING_R) {
        absorbSpark(s, i);
        continue;
      }
    } else if (keeper.invuln <= 0 && Math.abs(dx) <= 6 && Math.abs(dy) <= 6) {
      loseLife("contact");
      break;
    }
  }

  /* --- capacitor, multiplier, warning ---------------------------------- */
  if (!surging) capacitor -= d.drainPerFrame;
  multTimer++;
  if (multTimer >= 180) {
    multTimer = 0;
    multiplier = Math.max(1, multiplier - 1);
  }
  if (capacitor < 30 && lives > 0) {
    warnTimer--;
    if (warnTimer <= 0) {
      warnTimer = 20 + Math.max(0, Math.floor(capacitor));
      audio.emit("capacitor:warning");
    }
  }
  if (capacitor <= 0 && !missPending) loseLife("capacitor");

  /* --- waves ----------------------------------------------------------- */
  if (surgeTimer > 0) {
    surgeTimer--;
    if (surgeTimer === 30) {
      // Layout is swapped only while every spark is frozen.
      pieces = buildLayout(wave);
      audio.emit("wave:layout");
      if (currentFamily === "LOOP") {
        // Seed the circuit so it is running before the player has to read it.
        // With an absolute direction there is nothing to derive: the arrow says
        // where its traffic goes, so the seed just leaves along the first one.
        const a = pieces.filter((r) => r.kind === "arrow")[0];
        const v = ARROW_DIRS[a.dir];
        sparks.push(
          makeSpark(a.x + v.x * 9, a.y + v.y * 9, v, diff(wave).sparkSpeed, "spark", {
            ignoreUntil: ticks + 6,
          })
        );
      }
    }
  } else {
    waveTimer++;
    if (waveTimer >= WAVE_FRAMES) {
      waveTimer = 0;
      // Wave clear cashes the capacitor out into score and drops in a fresh
      // battery. That is what gives the resource an arc -- a wave opens from a
      // known state and closes wherever play left it -- and it is the reason to
      // arrive at the surge holding charge instead of coasting in on empty.
      // The points are paid across the tally, not in one lump: the bar draining
      // into the score is the only place the rule is ever stated.
      tallyCharge = Math.max(0, capacitor);
      waveBonus = Math.round(tallyCharge) * 20 * multiplier;
      tallyPaid = 0;
      tallyTimer = TALLY_FRAMES;
      // The battery the wave earned. A short one is not a second punishment for
      // a bad wave -- the payout has already been small -- it is the next wave
      // starting from further back, which is the only currency this game has.
      quotaCleared = quotaMet;
      capacitor = quotaCleared ? WAVE_BATTERY : WAVE_BATTERY_SHORT;
      barFlash = TALLY_FRAMES + 8;
      wave++;
      waveBanked = 0;
      quotaMet = false;
      waveQuota = quotaFor(wave);
      surgeTimer = SURGE_FRAMES;
      audio.emit("wave:surge");
    }
  }

  /* --- wave-clear tally ------------------------------------------------ */
  // Paid in installments so the score counts up with the bar draining, and the
  // remainder is settled on the last frame: the total has to be exactly the
  // bonus, not the sum of 36 roundings.
  if (tallyTimer > 0) {
    tallyTimer--;
    const target = tallyTimer > 0 ? Math.round(waveBonus * (1 - tallyTimer / TALLY_FRAMES)) : waveBonus;
    payScore(target - tallyPaid);
    tallyPaid = target;
  }

  for (const p of popups) p.life--;
  remove(popups, (p) => p.life <= 0);
}

/* -------------------------------------------------------------------- draw */

function drawWorld() {
  drawField();
  drawPieces();

  color("light_black");
  for (const p of pending) {
    if (ticks % 8 < 4) box(vec(p.port.x, p.port.y), 5);
  }
  for (const s of scavengers) {
    if (s.chew > 0) {
      // Eating: the countdown is drawn in the same language the keeper's own
      // commitments use, a dial that empties. A deadline you can still beat has
      // to be shown as one, or the piece simply vanishes and the enemy reads as
      // weather rather than as something that was worth answering.
      color(ticks % 8 < 4 ? "light_yellow" : "purple");
      char("b", s.x, s.y);
      // Wider than the bumper's own 8px ring, or the two circles merge into one
      // tangle and the deadline stops reading as a separate thing.
      color("light_yellow");
      arc(
        vec(s.x, s.y),
        13,
        2,
        -PI / 2,
        -PI / 2 + (PI * 2 * (SCAV_CHEW_FRAMES - s.chew)) / SCAV_CHEW_FRAMES
      );
    } else {
      color("purple");
      char("b", s.x, s.y);
    }
  }
  // Enemy identity is carried by silhouette, not hue: at 8px a red square and
  // a yellow square are the same object with a different palette index.
  for (const s of sparks) {
    const inert = s.immuneUntil && ticks < s.immuneUntil;
    if (s.type === "heavy") {
      // Hollow shell with two cores: what it splits into is drawn on it.
      color(inert ? "light_black" : "red");
      arc(vec(s.x, s.y), 6, 2);
      color(inert ? "light_black" : "light_red");
      box(vec(s.x - 2.5, s.y), 2);
      box(vec(s.x + 2.5, s.y), 2);
    } else if (s.type === "charger") {
      // The streak grows with speed, so its acceleration is visible directly.
      color("light_red");
      bar(vec(s.x, s.y), 4 + s.speed * 4, 3, Math.atan2(s.dy, s.dx));
      color(ticks % 6 < 3 ? "light_yellow" : "light_red");
      box(vec(s.x, s.y), 4);
    } else {
      color(inert ? "light_black" : "yellow");
      box(vec(s.x, s.y), 6);
    }
    // The volt ring. Which spark is worth crossing the field for has to be
    // legible before the decision, not after it, so worth is drawn as an aura
    // that grows -- outside every enemy silhouette, so it never reads as part
    // of one -- and in the energy colour rather than an enemy colour.
    const bonus = inert ? 0 : sparkBonus(s);
    if (bonus > 0.05) {
      color("cyan");
      arc(vec(s.x, s.y), 7 + bonus * 5, 1);
    }
  }
  // The keeper is gone once the last life is spent: loseLife() blows it up and
  // then re-centres it for a respawn that, at zero lives, never comes. Drawing
  // it through the ceremony contradicts the explosion the player just watched
  // and puts a live-looking keeper under the words GAME OVER.
  if (phase !== "gameover" && (keeper.invuln <= 0 || ticks % 8 < 4)) {
    if (keeper.state === "ground") {
      // Full circle = the catch radius, which must always read as an area. It
      // was drawn in `light_cyan`, which on this theme is cyan at half
      // brightness -- x5.0 against the field where plain cyan is x10.0. The
      // same half-brightness trap had already hidden the terrain (light_blue,
      // x3.4) and the scavenger (light_purple, x3.5): the one mark telling the
      // player how far they reach was dimmer than the keeper drawing it.
      color("cyan");
      arc(vec(keeper.x, keeper.y), RING_R, 1);
      // Inner sweep = how much of the window is left, in the same visual
      // language as the recovery arc, so both halves of the commitment are
      // read the same way.
      color("cyan");
      arc(vec(keeper.x, keeper.y), 10, 2, -PI / 2, -PI / 2 + (PI * 2 * keeper.timer) / GROUND_FRAMES);
      if (groundAbsorbs > 0) {
        color("light_yellow");
        text("x" + groundAbsorbs, keeper.x - 4, keeper.y - RING_R - 4, { isSmallText: true });
      }
      color("cyan");
    } else if (keeper.state === "recover") {
      // Countdown arc: the commitment has a visible, finite end.
      color("purple");
      arc(vec(keeper.x, keeper.y), 10, 2, -PI / 2, -PI / 2 + (PI * 2 * keeper.timer) / RECOVER_FRAMES);
      color("purple");
    } else {
      color("cyan");
    }
    box(vec(keeper.x, keeper.y), 12);
  }
  if (surgeTimer > 0) {
    // The freeze exists because a layout must never change under a spark in
    // flight. Say so, instead of showing an unexplained pause.
    // The block goes to whichever half the keeper is not in. The world is
    // frozen for the whole freeze, so this cannot flicker -- and with four
    // lines to read, the two that carry the payout and the quota are exactly
    // the ones a keeper parked at the centre used to sit on.
    const top = keeper.y > CY ? 64 : 148;
    centered("WAVE " + wave, top, "light_cyan");
    centered("FIELD REBUILD : " + currentFamily, top + 12, "yellow");
    // Counts up in step with the bar draining, so the two halves of the rule --
    // charge leaves, score arrives -- are one movement rather than two numbers
    // that happen to match.
    centered("CHARGE BONUS " + tallyPaid, top + 24, ticks % 8 < 4 ? "light_green" : "green");
    // Say what the quota bought, in the units the player just watched fill.
    centered(
      quotaCleared ? "QUOTA MET : BATTERY " + WAVE_BATTERY : "QUOTA MISSED : BATTERY " + WAVE_BATTERY_SHORT,
      top + 36,
      quotaCleared ? "light_cyan" : "light_red"
    );
  }
  for (const p of popups) {
    color(
      p.kind === "energy"
        ? "green"
        : p.kind === "quota"
        ? ticks % 6 < 3
          ? "light_cyan"
          : "cyan"
        : p.kind === "overcharge"
        ? // On the bar's own flash period, not the popups' -- the word and the
          // bar it is about pulse together, so they read as one event rather
          // than two things that happen to be lit. This is what buys the link
          // to the gauge; the word itself cannot go *in* the gauge, which is
          // six pixels tall and full of green at exactly this moment.
          ticks % 4 < 2
          ? "light_yellow"
          : "yellow"
        : p.kind === "loss"
        ? "light_red"
        : "light_yellow"
    );
    if (p.banner) {
      text(p.text, p.x - p.text.length * 2, p.y, { isSmallText: true });
    } else {
      const rise = p.kind === "energy" ? 0.5 : 0.25;
      text(p.text, p.x - p.text.length * 2, p.y - 6 - (48 - p.life) * rise, { isSmallText: true });
    }
  }
}

/* Ceremony text sits directly on the playfield between two thin rules.
 * A filled backing panel is not an option here: on this theme `black` renders
 * as a near-white slab that blanks the playfield, and there is no palette
 * entry darker than the background. */
function rules(y, h) {
  color("light_black");
  rect(0, y, 256, 1);
  rect(0, y + h - 1, 256, 1);
}

function centered(s, y, c) {
  color(c);
  text(s, 128 - s.length * 2, y, { isSmallText: true });
}

function drawOverlay() {
  if (phase === "attract") {
    rules(74, 42);
    centered("V O L T   K E E P E R", 84, "light_cyan");
    const cards = [
      "GROUND YOURSELF ON THE SPARKS",
      "SPARKS ARE THE ONLY ENERGY",
      "RUN AWAY AND THE CAPACITOR DIES",
    ];
    centered(cards[attractCard % cards.length], 98, "light_yellow");
    rules(150, 14);
    if (ticks % 60 < 40) centered("PUSH Z TO START", 156, "cyan");
    centered("DEMO PLAY", 214, "light_black");
  } else if (phase === "ready") {
    rules(104, 30);
    centered("WAVE " + wave, 110, "light_cyan");
    centered("READY", 122, "yellow");
  } else if (phase === "miss") {
    rules(110, 16);
    centered("MISS", 116, "light_red");
  } else if (phase === "gameover") {
    rules(96, 46);
    centered("GAME OVER", 104, "light_red");
    centered("SCORE " + pad7(gameScore), 118, "light_cyan");
    if (gameScore >= hiScore && gameScore > 0) centered("NEW RECORD", 130, "yellow");
  }
}

/* -------------------------------------------------------------------- main */

function readInput() {
  return {
    left: moveLeft(),
    right: moveRight(),
    up: moveUp(),
    down: moveDown(),
    action: actionPressed(),
  };
}

/* Attract-mode pilot: predicts where a spark will pass, grounds just before it
 * arrives, and backs away from everything while recovering. It plays the same
 * game through the same stepWorld() the player drives. */
function demoInput() {
  const inp = { left: false, right: false, up: false, down: false, action: false };
  if (!sparks.length) return inp;
  let best = null; // smallest predicted closest approach
  let danger = null;
  let dangerD = Infinity;
  for (const sp of sparks) {
    const rx = sp.x - keeper.x;
    const ry = sp.y - keeper.y;
    const dist = Math.sqrt(rx * rx + ry * ry);
    if (dist < dangerD) {
      dangerD = dist;
      danger = sp;
    }
    const vx = sp.dx * sp.speed;
    const vy = sp.dy * sp.speed;
    const t = Math.max(0, -(rx * vx + ry * vy) / Math.max(1e-6, vx * vx + vy * vy));
    const miss = Math.hypot(rx + vx * t, ry + vy * t);
    if (!best || miss < best.miss) best = { sp, t, miss, ix: sp.x + vx * t, iy: sp.y + vy * t };
  }
  const goTo = (x, y) => {
    if (x < keeper.x - 2) inp.left = true;
    else if (x > keeper.x + 2) inp.right = true;
    if (y < keeper.y - 2) inp.up = true;
    else if (y > keeper.y + 2) inp.down = true;
  };
  if (keeper.state === "recover" && danger && dangerD < 60) {
    goTo(keeper.x + (keeper.x - danger.x), keeper.y + (keeper.y - danger.y));
  } else if (best.miss < 20 && best.t <= 28) {
    if (keeper.state === "free") inp.action = true;
  } else {
    // No shot lined up: keep repositioning toward where a spark will pass, so
    // attract mode is never a stationary keeper watching sparks go by.
    goTo(clamp(best.ix, FIELD.left + 12, FIELD.right - 12), clamp(best.iy, FIELD.top + 12, FIELD.bottom - 12));
  }
  return inp;
}

function update() {
  if (!ticks) boot();
  const starting = phase === "attract" && actionPressed();
  setupAudio(phase !== "attract" || starting);
  if (audio.bus) audio.bus.beginFrame(ticks, phase === "attract");

  if (phase === "attract") {
    phaseTimer++;
    if (phaseTimer % 420 === 0) attractCard++;
    stepWorld(demoInput());
    if (missPending) {
      missPending = false;
      if (lives <= 0) restartDemo();
    }
    if (starting) startRun();
  } else if (phase === "ready") {
    phaseTimer--;
    if (phaseTimer <= 0) phase = "play";
  } else if (phase === "play") {
    stepWorld(readInput());
    if (missPending) {
      missPending = false;
      if (lives <= 0) {
        phase = "gameover";
        phaseTimer = GAMEOVER_FRAMES;
        saveHiScore();
        audio.emit("game:over");
        if (audio.bus) audio.bus.stopBgm();
      } else {
        phase = "miss";
        phaseTimer = MISS_FRAMES;
      }
    }
  } else if (phase === "miss") {
    phaseTimer--;
    if (phaseTimer <= 0) phase = "play";
  } else if (phase === "gameover") {
    phaseTimer--;
    // Any input skips the rest of the ceremony, but never starts a run from
    // the same press: attract owns the start input.
    if (phaseTimer <= 0 || (actionPressed() && phaseTimer < GAMEOVER_FRAMES - 60)) {
      boot();
    }
  }

  drawWorld();
  drawHud();
  drawOverlay();

  if (audio.bus) {
    audio.bus.setIntent(1 - Math.max(0, capacitor) / 100);
    if (audio.ready && (phase === "play" || phase === "ready" || phase === "miss")) {
      audio.emit("bgm:" + audio.bus.desiredCue());
    }
    audio.bus.endFrame();
  }
}

/* Browser debug seam, used by the smoke test and for hand inspection in the
 * console. It exposes read-only state; it never drives the game. */
if (typeof window !== "undefined") {
  window.__voltKeeper = {
    audio,
    state: () => ({
      phase,
      wave,
      capacitor,
      multiplier,
      lives,
      score: gameScore,
      hiScore,
      currentFamily,
      sparks: sparks ? sparks.length : 0,
    }),
  };
}

/* Headless-test seam. The browser never reaches this: `__VK_TEST__` is only
 * defined by tests/harness.mjs, which runs this file in a Node vm context. */
if (typeof __VK_TEST__ !== "undefined") {
  __VK_TEST__.expose({
    DIRS,
    ARROW_DIRS,
    FAMILIES,
    PORTS,
    FIELD,
    CX,
    CY,
    EDGE_CLEAR,
    dirToward,
    snapDir,
    sparkBonus,
    diff,
    buildLayout,
    deflectSpark,
    bounceWalls,
    // The attract pilot, so a gameplay test can be driven by the same policy
    // every balance figure is measured with instead of a weaker ad-hoc one. It
    // reads state and returns an input; it never writes.
    demoInput,
    update,
    setPieces: (list) => {
      pieces = list;
    },
    setWave: (w) => {
      wave = w;
    },
    audioLog: () => (audio.bus ? audio.bus.log : []),
    state: () => ({
      keeper,
      sparks,
      scavengers,
      pieces,
      capacitor,
      multiplier,
      lives,
      wave,
      currentFamily,
      surgeTimer,
      waveBonus,
      waveBanked,
      waveQuota,
      quotaMet,
      quotaCleared,
      tallyTimer,
      tallyCharge,
      tallyPaid,
      pending,
      phase,
      phaseTimer,
      gameScore,
      hiScore,
      popups,
    }),
  });
}
