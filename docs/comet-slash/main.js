// ============================================================
// COMET SLASH — a 1980-style fixed-screen arcade game
// Cut the comet tails, dodge the heads.
//
// crisp-game-lib 1.5.0 (CDN). Audio: self-implemented WebAudio (audio.js).
//
// Named actions and physical bindings (single source of truth):
//   move    : Arrow keys / WASD            (hold = move; used in play)
//   slash   : Space / Z / X / J / K        (press edge swings; hold does NOT
//                                           auto-repeat; release unused)
//   confirm : slash keys + Enter           (attract -> start, gameover -> attract)
//   pause   : P / Escape                    (play only; resume has a short count-in)
//   mute    : M                             (all phases; persisted locally)
//   name    : Arrow keys / WASD             (edit initials in name entry)
//
// Arcade-cycle ownership: GAME-OWNED (title/description left undefined).
// A run is a finite 16-wave campaign: clearing W16 wins the run instead of
// looping, so difficulty is a budget spread over W1..W16 and the score table
// ranks execution over a fixed track rather than survival endurance.
// Phases: attract (auto demo) -> ready -> play -> dying -> play ...
//         play -> waveclear -> play ...  play -> gameover -> attract.
//         play -> allclear (W16 cleared) -> nameentry/attract.
//         play <-> paused; qualifying gameover/allclear -> nameentry -> scores
//         -> retry/title.
// end() is never called; score is drawn manually (isShowingScore: false).
// Replay is disabled, so hi-score persistence needs no isReplaying guard.
// ============================================================

characters = [
  // a: ship facing right (light green is reserved for the player)
  `
G
GGG
GGGGG
GGGGG
GGG
G
`,
  // b: ship facing down
  `
GGGGGG
GGGGGG
 GGGG
 GGGG
  GG
  GG
`,
  // c: ship facing left
  `
     G
   GGG
 GGGGG
 GGGGG
   GGG
     G
`,
  // d: ship facing up
  `
  GG
  GG
 GGGG
 GGGG
GGGGGG
GGGGGG
`,
  // e: comet head (purple). Character pixels own their palette in
  // crisp-game-lib, so color() cannot tint this sprite at draw time.
  `
 PPPP
PPPPPP
PPPPPP
PPPPPP
PPPPPP
 PPPP
`,
  // f: comet head (red)
  `
 RRRR
RRRRRR
RRRRRR
RRRRRR
RRRRRR
 RRRR
`,
  // g: compact HUD life ship (standard yellow for dark-background contrast)
  `
y
yyy
yyyyy
yyyyy
yyy
y
`,
];

options = {
  viewSize: { x: 200, y: 200 },
  theme: "dark",
  isShowingScore: false,
  isPlayingBgm: false,
  isReplayEnabled: false,
};

// title / description intentionally undefined (game-owned cycle).

// --- named input bindings ---
const moveX = () =>
  (keyboard.code.ArrowLeft.isPressed || keyboard.code.KeyA.isPressed ? -1 : 0) +
  (keyboard.code.ArrowRight.isPressed || keyboard.code.KeyD.isPressed ? 1 : 0);
const moveY = () =>
  (keyboard.code.ArrowUp.isPressed || keyboard.code.KeyW.isPressed ? -1 : 0) +
  (keyboard.code.ArrowDown.isPressed || keyboard.code.KeyS.isPressed ? 1 : 0);
const slashPressed = () =>
  keyboard.code.Space.isJustPressed ||
  keyboard.code.KeyZ.isJustPressed ||
  keyboard.code.KeyX.isJustPressed ||
  keyboard.code.KeyJ.isJustPressed ||
  keyboard.code.KeyK.isJustPressed;
const confirmPressed = () =>
  slashPressed() || keyboard.code.Enter.isJustPressed;
const pausePressed = () =>
  keyboard.code.KeyP.isJustPressed || keyboard.code.Escape.isJustPressed;
const mutePressed = () => keyboard.code.KeyM.isJustPressed;
const nameLeftPressed = () =>
  keyboard.code.ArrowLeft.isJustPressed || keyboard.code.KeyA.isJustPressed;
const nameRightPressed = () =>
  keyboard.code.ArrowRight.isJustPressed || keyboard.code.KeyD.isJustPressed;
const nameUpPressed = () =>
  keyboard.code.ArrowUp.isJustPressed || keyboard.code.KeyW.isJustPressed;
const nameDownPressed = () =>
  keyboard.code.ArrowDown.isJustPressed || keyboard.code.KeyS.isJustPressed;

// --- constants ---
const P_SPEED = 1.5;
const SLASH_R = 24; // arc radius
const SLASH_HALF = PI / 3; // arc half width (60 deg)
const SWING_T = 14; // total recovery ticks
const ACTIVE_T = 6; // cutting ticks
const WHIFF_T = 22; // an empty swing has a visible, meaningful recovery
const HIST_MAX = 80;
const SEG_GAP = 4;
const HIT_R = 8;
const REDLINE_R = 22;
const REDLINE_T = 24;
const ATTRACT_PAGE_T = 480; // 8 seconds per how-to / ranking page at 60 fps

// Hit stop. Era cabinets answered their biggest events by stopping the world
// for a beat (a captured ghost, a killed boss) rather than by shaking the
// screen, which raster hardware could not do anyway. Only decisive, rare events
// qualify: stopping on every cut would chop up the dodge read while a second
// comet is still closing, and NEAR is the common tier so it stays live.
const HITSTOP_TIER = { NEAR: 0, CLOSE: 3, RAZOR: 6 };
const HITSTOP_NAKED = 4;
const HITSTOP_MISS = 8;
const HITSTOP_MULTI = 6; // a two-comet swing; +1 per further comet, capped at MISS

// Multi-cut. One swing is one decision, so it also settles as one payment:
// every distinct comet the same swing reaches multiplies that swing's whole
// score. Formations already converge on a shared inner target, so the
// multiplier pays for meeting them at the crossing point — the most dangerous
// spot on the screen, with two heads closing on it — instead of picking the
// comets off one at a time from safety. It cannot be farmed by waiting: a
// comet that leaves uncut pays nothing and costs the wave's perfect bonus.
const MULTI_NAMES = ["", "", "DOUBLE", "TRIPLE", "QUAD", "PENTA"];

// A run is a finite 16-wave campaign, so the score economy is sized against a
// known ceiling instead of an open-ended survival total.
const FINAL_WAVE = 16;
const EXTEND_FIRST = 20000;
const EXTEND_STEP = 40000;
const ALL_CLEAR_BONUS = 30000;
const SHIP_BONUS = 5000; // per ship still held at the moment of the clear
const NO_MISS_BONUS = 20000;
const PERFECT_WAVE_BONUS = 500; // x wave, when a wave loses no comet

const VISUAL = {
  player: "light_green",
  playerHalo: "cyan",
  playerCore: "light_yellow",
  tailBlue: "cyan",
  tailBlueHalo: "blue",
  tailBlueCore: "light_cyan",
  // Every intact, unclaimed scoreable tail uses one shared language. Red is
  // reserved for the red species head and the actionable RAZOR tier.
  tailRed: "cyan",
  tailRedHalo: "blue",
  tailRedCore: "light_cyan",
  headNormalHalo: "purple",
  // A fully slashed head is no longer scoreable. Keep its motion trace dim
  // and neutral so it cannot be mistaken for remaining cyan/red tail pieces.
  nakedTrail: "light_black",
  cutDebris: "light_black",
  cutDebrisCore: "light_yellow",
  warning: "light_purple",
  warningHalo: "purple",
  warningDirection: "yellow",
  reward: "light_yellow",
  rewardHalo: "yellow",
  // The multi-cut is a reward, so it speaks the reward palette rather than
  // inventing a hue: every remaining color already names a species, a risk
  // tier, or the player. What separates it is where it lands — its ring is the
  // only reward ring drawn on the ship instead of on a cut site — plus the
  // named DOUBLE/TRIPLE popup and a stop no ordinary cut earns.
  multi: "light_yellow",
  multiHalo: "yellow",
  danger: "red",
  hudScore: "cyan",
  hudHigh: "purple",
  hudWave: "yellow",
  hudLives: "yellow",
  pauseShadow: "purple",
  pauseTitle: "yellow",
  // The attract demo runs live behind the masthead and its tails are the same
  // cyan family, so the title cannot rely on hue alone. It gets 2x scale plus a
  // dark blue keyline; the old 1px purple ghost sat at nearly the same
  // brightness as the glyphs and only smeared the strokes.
  title: "light_cyan",
  titleKeyline: "blue",
  pauseInstructionShadow: "blue",
  pauseInstruction: "cyan",
  // crisp's dark theme maps `black` to a white foreground, so use a restrained
  // blue keyline instead of the visually muddy white duplicate.
  hudShadow: "blue",
  // Preview dots name a species, so they must match the marker the player will
  // actually see arrive. Normal = the purple family of the warning and head
  // sprite; cyan here read as a third species because cyan is the shared tail.
  spawnPreviewNormal: "light_purple",
  spawnPreviewRed: "red",
  spawnPreviewUnknown: "blue",
  starFar: "blue",
  starMid: "purple",
  starNear: "cyan",
  risk: {
    NEAR: { halo: "cyan", core: "light_cyan" },
    CLOSE: { halo: "yellow", core: "light_yellow" },
    RAZOR: { halo: "red", core: "light_yellow" },
  },
};

// Generated pixel-art sources live under assets/sprites/. crisp-game-lib has
// no documented PNG drawing API, so the validated palette pixels are embedded
// here and drawn with its native boxes. This keeps loading synchronous and the
// displayed art identical to the generated 12px/24px rasters.
const SPRITE_COLORS = {
  b: "blue",
  p: "purple",
  c: "cyan",
  C: "light_cyan",
  G: "light_green",
  y: "yellow",
  r: "red",
};
const PIXEL_SPRITES = {
  titleEmblem: {
    width: 24,
    height: 12,
    source: "assets/sprites/title-emblem.png",
    rows: [
      "           y",
      "         yC",
      "        yC",
      "    bbb y  bbbb",
      "  bCcccbyrbCccCcb b",
      "  cCCCCCcyrCCccbb",
      "  cCCCCccbyCcccbb",
      "  bcCccppbbybb",
      "   bccbb   y",
      "          yr",
      "         yr",
      "       y",
    ],
  },
  player: [
    {
      width: 12,
      height: 12,
      source: "assets/sprites/player-right.png",
      rows: [
        "",
        " GG",
        " cGGc",
        " GGGGG",
        "GGGcGGGGGc",
        " GGGGyG",
        "cGGGyGc  Gcc",
        "bGGGGGGGb",
        " cGGGc",
        " GGb",
        " cc",
        "",
      ],
    },
    {
      width: 12,
      height: 12,
      source: "assets/sprites/player-down.png",
      rows: [
        "    bc G",
        " cGcGGGGGcG",
        " cGGGGGGGGG",
        "  bGGGGcGG",
        "   GGyGGGc",
        "   cGGyGG",
        "    GcGG",
        "    G  G",
        "    b  G",
        "     G c",
        "     c",
        "     c",
      ],
    },
    {
      width: 12,
      height: 12,
      source: "assets/sprites/player-left.png",
      rows: [
        "",
        "         cc",
        "        bGG",
        "      cGGGc",
        "   bGGGGGGGb",
        "ccG  cGyGGGc",
        "     GyGGGG",
        "  cGGGGGcGGG",
        "      GGGGG",
        "       cGGc",
        "         GG",
        "",
      ],
    },
    {
      width: 12,
      height: 12,
      source: "assets/sprites/player-up.png",
      rows: [
        "      c",
        "      c",
        "    c G",
        "    G  b",
        "    G  G",
        "    GGcG",
        "   GGyGGc",
        "  cGGGyGG",
        "  GGcGGGGb",
        " GGGGGGGGGc",
        " GcGGGGGcGc",
        "    G cb",
      ],
    },
  ],
  cometNormal: {
    width: 12,
    height: 12,
    source: "assets/sprites/comet-normal.png",
    rows: [
      "     ppp",
      "   ppCppp",
      "   pppCppp",
      " pppppCCCpp",
      "bppppCyyCppp",
      "pCppCyCCyCpp",
      "ppppCyyyyCpp",
      " ppppCCCCppp",
      "  bpppCCCpb",
      "   ppCpppp",
      "    ppppb",
      "     ppp",
    ],
  },
  cometTracker: {
    width: 12,
    height: 12,
    source: "assets/sprites/comet-tracker.png",
    rows: [
      "",
      "   rr",
      "  rrrrrrr",
      " rrrrrrrrrr",
      "rrrryrrrrrrr",
      "rrryyyrr r",
      "rrrryrrr",
      "rrrrrrrrrrrr",
      "  rrrrrrrr",
      " rrrrrrr",
      "   rr",
      "",
    ],
  },
  extraLife: {
    width: 12,
    height: 12,
    source: "assets/sprites/extra-life.png",
    rows: [
      "",
      "         y",
      "     b   yG",
      "     G   yC",
      "     G     C",
      "     GG    C",
      "   GGGGGG  C",
      "   GGGGGG C",
      " C G G  G",
      "  CC    C",
      "    CCCC",
      "",
    ],
  },
  waveClear: {
    width: 12,
    height: 12,
    source: "assets/sprites/wave-clear.png",
    rows: [
      "      pp",
      "   pppb  p",
      "  bpCb pyb",
      " ccCCcpyr",
      "bCCCCcyr",
      "bCCCcrrppcp",
      "CCCcrypCCb",
      "CCCyypCCcC",
      " prypCCccp",
      " bypCCCCp",
      " ybcCCp",
      " p  pp",
    ],
  },
  rankMedal: {
    width: 12,
    height: 12,
    source: "assets/sprites/rank-medal.png",
    rows: [
      "     y",
      "     y",
      "    yyy",
      "   yyyyy",
      "yyyycccyyyy",
      " yycccccyy",
      "  ycccccy",
      "  yyc cyy",
      "  yyy yyy",
      "  pp   pp",
      " ppp   ppp",
      " pp     pp",
    ],
  },
};

function drawPixelSprite(sprite, pos) {
  const ox = pos.x - sprite.width / 2 + 0.5;
  const oy = pos.y - sprite.height / 2 + 0.5;
  sprite.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const role = SPRITE_COLORS[row[x]];
      if (!role) continue;
      color(role);
      box(ox + x, oy + y, 1);
    }
  });
}

// --- state ---
let phase, phaseT;
let wave, lives, sc, hi;
let nextExtend;
let misses; // run-wide, so the no-miss clear bonus survives a wave transition
let clearBonus; // ALL CLEAR tally, computed once at the moment of the clear
let scores, nameChars, nameCursor, nameT;
let player;
let comets, warns, crystals, popups, rings, stars;
let quota, spawnT;
let fullCuts; // comets fully slashed this wave (wave-clear bonus unit)
let nextCometId, resolvedComets;
let pausedFrom, pauseT;
let hitStop; // remaining presentation-freeze ticks; never freezes input intent
let slashBuffer; // a swing pressed inside a freeze, replayed on the first live tick
let slashTally; // cuts belonging to the swing in progress, for the multi-cut payment
let deathBurst; // hull break-up owed once the impact freeze finishes
let rngState;
let spawnSerial;

function setGameSeed(seed) {
  rngState = seed >>> 0 || 0x6d2b79f5;
}

function gameRnd(low, high) {
  rngState = (rngState + 0x6d2b79f5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const unit = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  if (low === undefined) return unit;
  if (high === undefined) return unit * low;
  return low + unit * (high - low);
}

const gameRndi = (maxValue) => floor(gameRnd(maxValue));

// --- text helpers (crisp text x = first-char center, y = char center) ---
function textL(str, x, y, opts) {
  text(str, x + 3, y + 3, opts);
}
function textC(str, cx, cy, opts) {
  // crisp advances by letterWidth * scale.x and takes x as the first char's
  // scaled center, so both terms scale together.
  const sx = (opts && opts.scale && opts.scale.x) || 1;
  const w = str.length * (opts && opts.isSmallText ? 4 : 6) * sx;
  text(str, cx - w / 2 + 3 * sx, cy, opts);
}
const pad6 = (n) => ("" + n).padStart(6, "0");

function loadHi() {
  try {
    return +localStorage.getItem("cometSlashHi") || 0;
  } catch (e) {
    return 0;
  }
}
function saveHi() {
  try {
    localStorage.setItem("cometSlashHi", "" + hi);
  } catch (e) {}
}

function loadScores() {
  try {
    const value = JSON.parse(localStorage.getItem("cometSlashScores") || "[]");
    if (Array.isArray(value)) {
      return value
        .filter(
          (v) => v && typeof v.name === "string" && Number.isFinite(+v.score),
        )
        .map((v) => ({
          name: v.name.slice(0, 3).padEnd(3, "A"),
          score: +v.score,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    }
  } catch (e) {}
  return [];
}

function saveScores() {
  try {
    localStorage.setItem("cometSlashScores", JSON.stringify(scores));
  } catch (e) {}
}

function qualifiesForTable() {
  return sc > 0 && (scores.length < 5 || sc > scores[scores.length - 1].score);
}

function beginNameEntry() {
  nameChars = ["A", "A", "A"];
  nameCursor = 0;
  nameT = 0;
  phase = "nameentry";
  phaseT = 0;
  // Name entry and the table that follows share one high-score theme.
  Sfx.startBgm("rank");
}

function commitNameEntry() {
  // An all-space name would leave a blank row in the table, so fall back to the
  // default initials. Names that only end in spaces keep them: the table lines
  // up on a fixed three-character column.
  const name = nameChars.join("");
  scores.push({ name: name.trim() === "" ? "AAA" : name, score: sc });
  scores.sort((a, b) => b.score - a.score);
  scores = scores.slice(0, 5);
  hi = max(hi, scores[0].score);
  saveScores();
  saveHi();
  Sfx.emit("ui:confirm");
  phase = "scores";
  phaseT = 0;
  Sfx.startBgm("rank");
}

function awardScore(points) {
  sc += points;
  while (sc >= nextExtend) {
    lives++;
    nextExtend += EXTEND_STEP;
    // The ALL CLEAR tally owns the centre column down to y=116, so an extend
    // paid by the tally itself moves into the empty left margin instead of
    // landing on top of the NO MISS line.
    const at = phase === "allclear" ? vec(36, 128) : vec(100, 116);
    popups.push({ pos: at, txt: "1UP", t: 90, tone: "CUT" });
    addRing(at, "light_green", 2);
    Sfx.emit("jingle:extend");
  }
}

// --- difficulty formulas (ticks = 60fps) ---
// The campaign is finite, so each curve is a budget spread across waves
// 1..FINAL_WAVE rather than an asymptote. speed / tail / red already reached
// their ceilings exactly at W16; interval, cap and meander used to saturate at
// W12 / W8 / W11 and left the last third of the run structurally identical.
const quotaFor = (w) => (w <= 3 ? 3 + w : 4 + w);
const speedFor = (w) => min(2.5, 1 + 0.1 * (w - 1));
const intervalFor = (w) => max(68, round(180 - 7.5 * (w - 1)));
const capFor = (w) => min(5, 1 + floor((w + 1) / 3));
const tailFor = (w) => min(16, 8 + floor(w / 2));
const meanderFor = (w) => min(30, 8 + 1.4 * w) / 100 / 60;
const redChanceFor = (w) => (w < 4 ? 0 : min(0.5, 0.2 + (w - 4) * 0.025));
// Warning lead is the player's preparation budget, and it is the one pressure
// dial that does not shrink the aim-and-swing geometry the slash needs.
const warnLeadFor = (w) => max(40, round(60 - (4 * (w - 1)) / 3));

function redlineTier(distance) {
  if (distance < 11) return { name: "RAZOR", add: 2 };
  if (distance < 16) return { name: "CLOSE", add: 1 };
  if (distance < 22) return { name: "NEAR", add: 0.5 };
  return null;
}

function riskVisual(name) {
  return VISUAL.risk[name] || VISUAL.risk.NEAR;
}

function effectVisual(tone) {
  if (VISUAL.risk[tone]) return VISUAL.risk[tone];
  if (tone === "DEBRIS")
    return { halo: VISUAL.cutDebris, core: VISUAL.cutDebrisCore };
  if (tone === "RED") return { halo: "red", core: "light_red" };
  if (tone === "BLUE") return { halo: "blue", core: "light_cyan" };
  if (tone === "LONG") return { halo: "yellow", core: "light_yellow" };
  if (tone === "MULTI") return { halo: VISUAL.multiHalo, core: VISUAL.multi };
  if (tone === "CUT") return { halo: "cyan", core: "light_cyan" };
  return { halo: VISUAL.rewardHalo, core: VISUAL.reward };
}

function addRing(pos, tone, strength = 1) {
  if (rings.length >= 12) rings.shift();
  rings.push({ pos: vec(pos.x, pos.y), tone, strength, t: 18 });
}

// A clear is a win, so it must not speak the death vocabulary: `miss()` owns the
// single centred ring plus radial burst. Clears get staggered, off-centre,
// multi-coloured shells whose sparks arc and fall — fireworks, not an impact.
// The launch pattern is authored rather than random on purpose: drawing from
// gameRnd here would shift the seeded spawn stream, so the same seed would stop
// producing the same comets after its first clear.
const FIREWORK_WAVE = [
  { at: 4, x: 64, y: 44, halo: "yellow", core: "light_yellow" },
  { at: 18, x: 140, y: 32, halo: "cyan", core: "light_cyan" },
  { at: 31, x: 40, y: 30, halo: "purple", core: "light_purple" },
  { at: 44, x: 160, y: 50, halo: "red", core: "light_red" },
  { at: 57, x: 100, y: 26, halo: "green", core: "light_green" },
];
// The ALL CLEAR tally fills the middle of the screen, so its shells stay in the
// side margins and keep coming while the bonus lines are still counting up.
const FIREWORK_ALLCLEAR = [
  { x: 24, y: 40, halo: "yellow", core: "light_yellow" },
  { x: 176, y: 62, halo: "cyan", core: "light_cyan" },
  { x: 30, y: 88, halo: "purple", core: "light_purple" },
  { x: 172, y: 34, halo: "green", core: "light_green" },
];
const FIREWORK_SPARKS = 12;

function launchFirework(b) {
  addRing(vec(b.x, b.y), b.core, 1.3);
  for (let i = 0; i < FIREWORK_SPARKS; i++) {
    const a = (PI * 2 * i) / FIREWORK_SPARKS + (b.x % 7) * 0.11;
    const speed = 0.9 + (i % 3) * 0.25;
    crystals.push({
      pos: vec(b.x, b.y),
      // Sparks start with an upward bias so the shell opens before it rains.
      vel: vec(cos(a) * speed, sin(a) * speed - 0.3),
      grav: 0.045,
      t: 30 + (i % 5) * 4,
      size: 3,
      halo: b.halo,
      core: b.core,
    });
  }
}

function waveClearFireworks(t) {
  FIREWORK_WAVE.forEach((b) => {
    if (t === b.at) launchFirework(b);
  });
}

function allClearFireworks(t) {
  if (t > ALL_CLEAR_ACCEPT_T || t % 46 !== 8) return;
  launchFirework(FIREWORK_ALLCLEAR[floor(t / 46) % FIREWORK_ALLCLEAR.length]);
}

// A clear is survival, not death, so the ship stays on screen and keeps flying
// through the ceremony. Nothing spawns and nothing can be cut here, so this is
// movement and the swing animation only: no collision, no whiff penalty, no
// spawning, and no intensity feedback.
function updateClearShip() {
  const mx = moveX(),
    my = moveY();
  if ((mx || my) && player.swing === 0) {
    if (abs(mx) >= abs(my)) player.dir = mx > 0 ? 0 : 2;
    else player.dir = my > 0 ? 1 : 3;
  }
  let vx = mx,
    vy = my;
  if (mx && my) {
    vx *= 0.7071;
    vy *= 0.7071;
  }
  player.pos.x = clamp(player.pos.x + vx * P_SPEED, 4, 196);
  player.pos.y = clamp(player.pos.y + vy * P_SPEED, 10, 194);
  if (slashPressed() && player.cool <= 0) {
    player.cool = SWING_T;
    player.swing = ACTIVE_T;
    // There is nothing to hit during a clear, so the swing counts as landed:
    // an empty-air penalty must not follow the ship into the next wave.
    player.swingHit = true;
    Sfx.emit("slash:swing");
  }
  if (player.cool > 0) player.cool--;
  if (player.swing > 0) player.swing--;
  if (player.inv > 0) player.inv--;
  drawPlayer();
}

// --- comet helpers ---
function segPos(c, k) {
  return c.hist[min((k + 1) * c.gap, c.hist.length - 1)];
}

function makeWarn(spec = {}) {
  const edge = spec.edge === undefined ? gameRndi(4) : spec.edge;
  let x, y;
  if (edge === 0) {
    x = 4;
    y = gameRnd(24, 176);
  } else if (edge === 1) {
    x = 196;
    y = gameRnd(24, 176);
  } else if (edge === 2) {
    x = gameRnd(20, 180);
    y = 12;
  } else {
    x = gameRnd(20, 180);
    y = 188;
  }
  // Aim through an inner target band. Every normal spawn therefore creates a
  // real interception opportunity instead of merely grazing an adjacent edge.
  const target = spec.target
    ? vec(spec.target.x, spec.target.y)
    : vec(gameRnd(52, 148), gameRnd(52, 148));
  const pos = vec(x, y);
  const red =
    spec.red === undefined
      ? wave >= 4 && gameRnd() < redChanceFor(wave)
      : !!spec.red;
  warns.push({
    pos,
    target,
    edge,
    angle: pos.angleTo(target),
    red,
    t: spec.t === undefined ? warnLeadFor(wave) : spec.t,
  });
  Sfx.emit("comet:warn", { red, demo: phase === "attract" });
}

function spawnPreviewColors() {
  // Species is selected when a warning is queued. Show those exact queued
  // specs first; future quota remains neutral until its formation is planned.
  const colors = warns.map((w) =>
    w.red ? VISUAL.spawnPreviewRed : VISUAL.spawnPreviewNormal,
  );
  const unselected = max(0, quota - warns.length);
  for (let i = 0; i < unselected; i++) colors.push(VISUAL.spawnPreviewUnknown);
  return colors.slice(0, 12);
}

// Pure in (wave, serial): the schedule is part of the campaign's declared
// shape, so it must be readable without reaching into live spawn state.
function formationSizeFor(w, serial) {
  if (w < 2) return 1;
  if (w < 4) return serial % 2 === 0 ? 2 : 1;
  if (w < 7) return 2;
  return serial % 3 === 2 ? 3 : 2;
}

function queueFormation() {
  const openSlots = capFor(wave) - comets.length - warns.length;
  const unplanned = quota - warns.length;
  // A formation is one scheduling unit. It may shrink only when the wave's
  // genuine remaining quota cannot afford its requested size; temporary
  // occupancy must wait instead of consuming the sequence as a partial group.
  // The cap also bounds the request itself. A formation larger than its own
  // wave's cap could never fit even on an empty screen, and would stall the
  // quota forever instead of merely waiting for room.
  const count = min(
    formationSizeFor(wave, spawnSerial),
    unplanned,
    capFor(wave),
  );
  if (count <= 0 || openSlots < count) return false;
  const target = vec(gameRnd(64, 136), gameRnd(64, 136));
  const firstEdge = gameRndi(4);
  for (let i = 0; i < count; i++) {
    const edge =
      i === 0 ? firstEdge : i === 1 ? (firstEdge + 2) % 4 : (firstEdge + 1) % 4;
    makeWarn({ edge, target });
  }
  spawnSerial++;
  return true;
}

function spawnComet(w) {
  const red = !!w.red;
  const speed = speedFor(wave) * gameRnd(0.9, 1.1);
  const hist = [];
  for (let i = 0; i < HIST_MAX; i++) {
    hist.push(vec(w.pos.x - cos(w.angle) * i, w.pos.y - sin(w.angle) * i));
  }
  comets.push({
    id: nextCometId++,
    pos: vec(w.pos.x, w.pos.y),
    angle: w.angle,
    speed,
    red,
    segs: tailFor(wave),
    hist,
    naked: false,
    nakedT: 0,
    gap: SEG_GAP,
    age: 0,
    visibleTicks: 0,
    centralTicks: 0,
    minPlayerDist: 999,
    cutSegments: 0,
    prevPlayerDist: 999,
    redlineArmed: false,
    redlineMin: 999,
    redlineT: 0,
    redlineClaimed: false,
    redlineTier: null,
    redlineBonus: 0,
  });
  Sfx.emit("comet:spawn", { red, demo: phase === "attract" });
}

function resolveComet(c, reason) {
  resolvedComets.push({
    id: c.id,
    wave,
    reason,
    visibleTicks: c.visibleTicks,
    centralTicks: c.centralTicks,
    minPlayerDist: round(c.minPlayerDist),
    cutSegments: c.cutSegments,
    fullCut: c.naked,
    redlineTier: c.redlineTier,
    redlineBonus: c.redlineBonus,
    effective:
      c.visibleTicks >= 90 &&
      (c.centralTicks > 0 ||
        c.minPlayerDist <= SLASH_R + 8 ||
        c.cutSegments > 0),
  });
  if (resolvedComets.length > 200) resolvedComets.shift();
}

function updateRedline(c, distance) {
  if (c.redlineT > 0) c.redlineT--;
  if (player.inv > 0 || c.naked || c.redlineClaimed) {
    c.prevPlayerDist = distance;
    return;
  }
  const closing = distance < c.prevPlayerDist - 0.05;
  const receding = distance > c.prevPlayerDist + 0.05;
  if (!c.redlineArmed && distance <= REDLINE_R && closing) {
    c.redlineArmed = true;
    c.redlineMin = distance;
  } else if (c.redlineArmed) {
    c.redlineMin = min(c.redlineMin, distance);
    if (c.redlineMin < HIT_R) {
      c.redlineArmed = false;
      c.redlineMin = 999;
    } else if (receding && distance > c.redlineMin + 1.2) {
      const tier = redlineTier(c.redlineMin);
      c.redlineArmed = false;
      if (tier) {
        c.redlineT = REDLINE_T;
        c.redlineTier = tier.name;
        Sfx.emit("comet:redline", {
          tier: tier.name,
          demo: phase === "attract",
        });
      }
    }
  }
  if (distance > REDLINE_R + 16 && c.redlineT <= 0) {
    c.redlineArmed = false;
    c.redlineMin = 999;
  }
  c.prevPlayerDist = distance;
}

function updateComets() {
  const mp = meanderFor(wave);
  remove(comets, (c) => {
    c.age++;
    if (!c.naked && gameRnd() < mp) c.angle += gameRnd() < 0.5 ? -0.26 : 0.26;
    if (c.red && !c.naked) {
      const da = wrap(c.pos.angleTo(player.pos) - c.angle, -PI, PI);
      c.angle += clamp(da, -0.014, 0.014);
    }
    if (c.nakedT > 0) c.nakedT--;
    c.pos.addWithAngle(c.angle, c.speed * (c.nakedT > 0 ? 0.7 : 1));
    c.hist.unshift(vec(c.pos.x, c.pos.y));
    if (c.hist.length > HIST_MAX) c.hist.pop();
    if (c.pos.isInRect(0, 0, 200, 200)) c.visibleTicks++;
    if (c.pos.isInRect(28, 28, 144, 144)) c.centralTicks++;
    const playerDist = c.pos.distanceTo(player.pos);
    c.minPlayerDist = min(c.minPlayerDist, playerDist);
    updateRedline(c, playerDist);
    const headGone = !c.pos.isInRect(-12, -12, 224, 224);
    let tailVisible = false;
    for (let k = 0; k < c.segs; k++) {
      if (segPos(c, k).isInRect(-3, -3, 206, 206)) {
        tailVisible = true;
        break;
      }
    }
    if ((headGone && !tailVisible) || c.age > 900) {
      resolveComet(c, c.age > 900 ? "timeout" : "exit");
      return true;
    }
    return false;
  });
}

function updateSpawning(demo) {
  remove(warns, (w) => {
    w.t--;
    if (w.t <= 0) {
      spawnComet(w);
      quota--;
      return true;
    }
    return false;
  });
  if (quota > warns.length) {
    spawnT--;
    if (spawnT <= 0 && comets.length + warns.length < capFor(wave)) {
      if (queueFormation()) spawnT = intervalFor(wave);
    }
  }
}

// --- cutting ---
function checkCuts(demo) {
  const pa = player.dir * (PI / 2);
  let didCut = false;
  comets.forEach((c) => {
    if (c.segs === 0) return;
    for (let k = 0; k < c.segs; k++) {
      const sp = segPos(c, k);
      if (
        sp.distanceTo(player.pos) <= SLASH_R &&
        abs(wrap(player.pos.angleTo(sp) - pa, -PI, PI)) <= SLASH_HALF
      ) {
        tallyCut(c, doCut(c, k, demo), demo);
        didCut = true;
        break;
      }
    }
  });
  return didCut;
}

function doCut(c, idx, demo) {
  const count = c.segs - idx;
  let basePts = 0;
  for (let k = idx; k < c.segs; k++) {
    const sp = segPos(c, k);
    basePts += k < 3 ? 50 : 10;
    crystals.push({
      pos: vec(sp.x, sp.y),
      vel: vec(gameRnd(-0.4, 0.4), gameRnd(-0.4, 0.4)),
      t: 36,
      tone: c.redlineT > 0 ? c.redlineTier : "DEBRIS",
    });
  }
  const longBonus = count >= 5 ? basePts : 0;
  let riskBonus = 0;
  let claimedTier = null;
  if (c.redlineT > 0 && !c.redlineClaimed) {
    const tier = redlineTier(c.redlineMin);
    if (tier) {
      riskBonus = round(basePts * tier.add);
      claimedTier = tier.name;
      c.redlineClaimed = true;
      c.redlineT = 0;
      c.redlineTier = tier.name;
      c.redlineBonus += riskBonus;
    }
  }
  const pts = basePts + longBonus + riskBonus;
  const cp = segPos(c, idx);
  // Feedback must remain on-screen even when a comet is cut as it enters from
  // an edge. Named risk bonuses are drawn above the generic total.
  const feedbackPos = vec(clamp(cp.x, 42, 158), clamp(cp.y, 28, 184));
  popups.push({
    pos: vec(feedbackPos.x, feedbackPos.y),
    txt: "+" + pts,
    t: 45,
    tone: claimedTier || (count >= 5 ? "LONG" : "CUT"),
  });
  if (claimedTier) {
    popups.push({
      pos: vec(feedbackPos.x, feedbackPos.y - 10),
      txt: claimedTier + " BONUS +" + riskBonus,
      t: 60,
      tone: claimedTier,
    });
    Sfx.emit("slash:redline", { tier: claimedTier, demo });
  } else if (
    c.redlineArmed &&
    c.redlineMin >= HIT_R &&
    c.redlineMin <= REDLINE_R
  ) {
    popups.push({
      pos: vec(feedbackPos.x, feedbackPos.y - 10),
      txt: "PASS FIRST",
      t: 36,
      tone: "CUT",
    });
  }
  if (!demo) awardScore(pts);
  c.cutSegments += count;
  Sfx.emit(count >= 5 ? "slash:long" : "slash:cut", { count, demo });
  const cutTone = claimedTier
    ? riskVisual(claimedTier).halo
    : count >= 5
      ? "yellow"
      : "cyan";
  addRing(cp, cutTone, claimedTier ? 2 : count >= 5 ? 1.5 : 1);
  color(cutTone);
  particle(cp, { count: min(20, count * 3), speed: 1.5 });
  // The stop is graded by how rare the moment is, so a RAZOR claim reads as
  // heavier than a CLOSE one without borrowing any of the miss vocabulary.
  if (!demo && claimedTier)
    hitStop = max(hitStop, HITSTOP_TIER[claimedTier] || 0);
  c.segs = idx;
  if (c.segs === 0) {
    c.naked = true;
    c.nakedT = 18;
    c.speed *= 1.4;
    fullCuts++;
    Sfx.emit("comet:naked", { red: c.red, demo });
    if (!demo) hitStop = max(hitStop, HITSTOP_NAKED);
    addRing(c.pos, "yellow", 1.5);
    color("light_yellow");
    particle(c.pos, { count: 24, speed: 2.2 });
  }
  return pts;
}

function resetSlashTally() {
  slashTally = {
    ids: [],
    sum: 0,
    awarded: 0,
    bonus: 0,
    lastN: 0,
    popups: null,
  };
}

// The multiplier is settled the instant it is earned rather than at the end of
// the swing window: each cut has already paid its own base at its own cut site,
// so this only tops the swing up to `sum x comets`. Paying as it happens keeps
// every extend causal, keeps the banner on the frame the player earned it, and
// means a death or a wave clear landing inside the 6-tick window cannot swallow
// points the screen already promised.
function tallyCut(c, pts, demo) {
  if (!slashTally) resetSlashTally();
  slashTally.sum += pts;
  slashTally.awarded += pts;
  // A swing can reach the same comet on several of its active ticks. That is
  // one comet, not two: only distinct heads raise the multiplier.
  if (slashTally.ids.indexOf(c.id) < 0) slashTally.ids.push(c.id);
  const n = slashTally.ids.length;
  if (n < 2) return;
  // A later cut on a comet the swing already counted does not raise the
  // multiplier, but it is still part of this swing's score, so it is paid at
  // the multiplier the swing has reached.
  const was = slashTally.lastN;
  slashTally.lastN = n;
  const extra = slashTally.sum * n - slashTally.awarded;
  if (extra <= 0) return;
  slashTally.awarded += extra;
  slashTally.bonus += extra;
  if (!demo) awardScore(extra);
  // The multiplier belongs to the whole swing, so it is announced rather than
  // dropped at a cut site: the swing's own +N popups already crowd the arc
  // within 24px of the ship, and two lines of a 5px font over each other are
  // two unreadable lines. It takes the empty band under the HUD and does not
  // drift, the way READY! and the clear banners hold still. The ship keeps the
  // spatial half of the message through the ring, the sparks and the stop.
  // A third comet usually lands on the same tick as the second, so an upgrade
  // rewrites the swing's own banner in place. Pushing a second one would stack
  // DOUBLE under TRIPLE at the same pixel and leave the total ambiguous.
  const label = (MULTI_NAMES[n] || "MULTI") + " CUT X" + n;
  const total = "+" + slashTally.bonus;
  const live =
    slashTally.popups && slashTally.popups.every((p) => popups.indexOf(p) >= 0);
  if (live) {
    const [banner, amount] = slashTally.popups;
    banner.txt = label;
    banner.t = 72;
    amount.txt = total;
    amount.t = 72;
  } else {
    slashTally.popups = [
      { pos: vec(100, 28), txt: label, t: 72, tone: "MULTI", fixed: true },
      { pos: vec(100, 37), txt: total, t: 72, tone: "MULTI", fixed: true },
    ];
    popups.push(slashTally.popups[0], slashTally.popups[1]);
  }
  // An upgrade resumes the run where the previous one stopped instead of
  // restarting it: two overlapping arpeggios from the same root only beat
  // against each other, while a continued climb is the multiplier rising.
  Sfx.emit("slash:multi", { count: n, from: was < 2 ? 0 : was, demo });
  addRing(player.pos, VISUAL.multiHalo, 2.5);
  color(VISUAL.multi);
  particle(player.pos, { count: 26, speed: 2 });
  // Rarer than a full slash and rarer than a RAZOR claim, so it stops longer
  // than either — but never longer than a miss, which owns the heaviest stop.
  if (!demo) hitStop = max(hitStop, min(HITSTOP_MISS, HITSTOP_MULTI + n - 2));
}

// --- phases ---
function initAll() {
  setGameSeed(Date.now() ^ 0xc05e7);
  stars = times(45, () => ({ x: gameRnd(200), y: gameRnd(200) }));
  hi = loadHi();
  scores = loadScores();
  if (scores.length) hi = max(hi, scores[0].score);
  sc = 0;
  nextExtend = EXTEND_FIRST;
  misses = 0;
  clearBonus = null;
  wave = 3;
  lives = 3;
  player = {
    pos: vec(100, 150),
    dir: 0,
    cool: 0,
    swing: 0,
    swingHit: false,
    dangerLatch: false,
    inv: 0,
  };
  comets = [];
  warns = [];
  crystals = [];
  popups = [];
  rings = [];
  fullCuts = 0;
  nextCometId = 1;
  resolvedComets = [];
  quota = quotaFor(wave);
  spawnT = 60;
  spawnSerial = 0;
  phase = "attract";
  phaseT = 0;
  pausedFrom = null;
  pauseT = 0;
  clearFreeze();
}

// A freeze, a held swing, or an owed hull break must never survive the screen
// it belongs to: leaking one would stop a fresh run on its first frame. The
// swing's own cut tally is the same kind of debt: carried across a screen it
// would pay a multiplier for two comets the player never faced together.
function clearFreeze() {
  hitStop = 0;
  slashBuffer = false;
  deathBurst = false;
  resetSlashTally();
}

function startGame() {
  sc = 0;
  nextExtend = EXTEND_FIRST;
  misses = 0;
  clearBonus = null;
  wave = 1;
  lives = 3;
  comets = [];
  warns = [];
  crystals = [];
  popups = [];
  rings = [];
  fullCuts = 0;
  nextCometId = 1;
  resolvedComets = [];
  quota = quotaFor(wave);
  spawnT = 100;
  spawnSerial = 0;
  player.pos.set(100, 170);
  player.dir = 3;
  player.cool = 0;
  player.swing = 0;
  player.swingHit = false;
  player.dangerLatch = false;
  player.inv = 0;
  phase = "ready";
  phaseT = 0;
  clearFreeze();
  Sfx.stopBgm();
  Sfx.emit("jingle:start");
}

function returnToAttract() {
  wave = 3;
  clearBonus = null;
  comets = [];
  warns = [];
  crystals = [];
  popups = [];
  rings = [];
  quota = quotaFor(wave);
  spawnT = 60;
  spawnSerial = 0;
  player.pos.set(100, 150);
  player.cool = 0;
  player.swing = 0;
  player.swingHit = false;
  player.dangerLatch = false;
  phase = "attract";
  phaseT = 0;
  clearFreeze();
  Sfx.stopBgm();
}

// The ship does not blink out of existence: the picture holds on the intact
// hull for the length of the freeze while the explosion is already sounding,
// and only then does the hull come apart. Debris carries the player's own
// cyan/green palette, so it reads as this ship rather than as cut tail debris,
// which stays dim `light_black`. The angles are authored rather than drawn from
// gameRnd because that stream must keep producing the same comets after a miss.
const SHIP_DEBRIS = 7;

function burstShip() {
  addRing(player.pos, "red", 2);
  addRing(player.pos, "purple", 1.4);
  color("red");
  particle(player.pos, { count: 30, speed: 2.5 });
  for (let i = 0; i < SHIP_DEBRIS; i++) {
    const a = (PI * 2 * i) / SHIP_DEBRIS + 0.3;
    const speed = 0.8 + (i % 3) * 0.22;
    crystals.push({
      pos: vec(player.pos.x, player.pos.y),
      vel: vec(cos(a) * speed, sin(a) * speed),
      t: 28 + (i % 4) * 3,
      size: 3,
      halo: i % 3 === 0 ? "cyan" : "green",
      core: i % 3 === 0 ? "light_cyan" : "light_green",
    });
  }
}

function miss() {
  lives--;
  misses++;
  fullCuts = 0;
  Sfx.pause();
  Sfx.emit("player:miss");
  hitStop = HITSTOP_MISS;
  deathBurst = true;
  if (lives > 0) {
    phase = "dying";
    phaseT = 0;
  } else {
    phase = "gameover";
    phaseT = 0;
    Sfx.stopBgm();
    Sfx.emit("jingle:over", { delay: 0.38 });
    if (sc > hi) {
      hi = sc;
      saveHi();
    }
  }
}

// Bonus rewards full slashes only: escaped comets pay nothing, so idling
// through a wave earns exactly 0. It scales with the wave so a finite run is
// back-loaded — the last third is where the run is actually won.
const waveBonusFor = (w, cuts) => 25 * w * cuts;
const isPerfectWave = (w, cuts) => cuts >= quotaFor(w);

function waveClear() {
  // A wave can end on the very cut that armed a freeze. The stop is kept — it
  // punctuates the last kill before the ceremony — but the swing buffered
  // inside it is dropped rather than fired blind into the next wave.
  slashBuffer = false;
  const perfect = isPerfectWave(wave, fullCuts);
  const bonus =
    waveBonusFor(wave, fullCuts) + (perfect ? PERFECT_WAVE_BONUS * wave : 0);
  awardScore(bonus);
  if (bonus > 0) {
    // Below the 1UP lane (y=116) and well clear of the banner: the bonus, the
    // extend and the CLEAR headline used to be stacked on the same few pixels.
    popups.push({
      pos: vec(100, 138),
      txt: (perfect ? "PERFECT " : "BONUS ") + bonus,
      t: 70,
      tone: perfect ? "RAZOR" : "LONG",
    });
  }
  Sfx.pause();
  phaseT = 0;
  // The final wave ends the run instead of advancing it: the campaign is the
  // whole game, so its last clear is a win state, not another transition. Its
  // own fanfare replaces the per-wave jingle rather than stacking on it.
  if (wave >= FINAL_WAVE) {
    phase = "allclear";
    beginAllClear();
  } else {
    phase = "waveclear";
    Sfx.emit("jingle:clear");
  }
}

// The ALL CLEAR tally is fixed at the instant of the clear. Extends awarded by
// the tally itself must not feed back into the ship bonus.
function beginAllClear() {
  clearBonus = {
    base: ALL_CLEAR_BONUS,
    ships: SHIP_BONUS * lives,
    shipCount: lives,
    noMiss: misses === 0 ? NO_MISS_BONUS : 0,
  };
  clearBonus.total = clearBonus.base + clearBonus.ships + clearBonus.noMiss;
  comets = [];
  warns = [];
  Sfx.stopBgm();
  Sfx.emit("jingle:allclear", { delay: 0.45 });
}

function finishAllClear() {
  if (sc > hi) {
    hi = sc;
    saveHi();
  }
  if (qualifiesForTable()) beginNameEntry();
  else returnToAttract();
}

// --- attract demo AI ---
function autoInput() {
  // flee any nearby head
  let danger = null,
    dmin = 26;
  comets.forEach((c) => {
    const d = c.pos.distanceTo(player.pos);
    if (d < dmin) {
      dmin = d;
      danger = c;
    }
  });
  if (danger) {
    const a = danger.pos.angleTo(player.pos);
    return { mx: round(cos(a)), my: round(sin(a)), face: -1, slash: false };
  }
  // chase the comet with the longest remaining tail
  let best = null,
    bestSegs = 0;
  comets.forEach((c) => {
    if (c.segs > bestSegs) {
      best = c;
      bestSegs = c.segs;
    }
  });
  if (!best) return { mx: 0, my: 0, face: -1, slash: false };
  const sp = segPos(best, floor(best.segs / 2));
  const dx = sp.x - player.pos.x,
    dy = sp.y - player.pos.y;
  const mx = abs(dx) > 3 ? (dx > 0 ? 1 : -1) : 0;
  const my = abs(dy) > 3 ? (dy > 0 ? 1 : -1) : 0;
  const fa = player.pos.angleTo(sp);
  const face = ((round(fa / (PI / 2)) % 4) + 4) % 4;
  let sd = 1e9;
  for (let k = 0; k < best.segs; k++) {
    sd = min(sd, segPos(best, k).distanceTo(player.pos));
  }
  return { mx, my, face, slash: player.cool <= 0 && sd < 20 };
}

// --- shared play simulation (demo = attract autoplay) ---
function updatePlay(demo) {
  phaseT++;
  // input
  let mx, my, doSlash;
  if (demo) {
    const a = autoInput();
    mx = a.mx;
    my = a.my;
    if (a.face >= 0 && player.swing === 0) player.dir = a.face;
    doSlash = a.slash;
  } else {
    mx = moveX();
    my = moveY();
    if ((mx || my) && player.swing === 0) {
      if (abs(mx) >= abs(my)) player.dir = mx > 0 ? 0 : 2;
      else player.dir = my > 0 ? 1 : 3;
    }
    doSlash = slashPressed() || slashBuffer;
  }
  slashBuffer = false;
  // state/physics: player
  let vx = mx,
    vy = my;
  if (mx && my) {
    vx *= 0.7071;
    vy *= 0.7071;
  }
  const recoveryMove = player.cool > 0 && player.swing === 0 ? 0.72 : 1;
  player.pos.x = clamp(player.pos.x + vx * P_SPEED * recoveryMove, 4, 196);
  player.pos.y = clamp(player.pos.y + vy * P_SPEED * recoveryMove, 10, 194);
  if (doSlash && player.cool <= 0) {
    player.cool = SWING_T;
    player.swing = ACTIVE_T;
    player.swingHit = false;
    // A new swing is a new payment: nothing the previous one cut counts here.
    resetSlashTally();
    Sfx.emit("slash:swing", { demo });
  }
  if (player.cool > 0) player.cool--;
  if (player.swing > 0) {
    player.swing--;
    if (checkCuts(demo)) player.swingHit = true;
    if (player.swing === 0 && !player.swingHit) {
      player.cool = max(player.cool, WHIFF_T - ACTIVE_T);
      Sfx.emit("slash:empty", { demo });
    }
  }
  if (player.inv > 0) player.inv--;
  // physics: comets
  updateComets();
  let nearestHead = 999;
  comets.forEach(
    (c) => (nearestHead = min(nearestHead, c.pos.distanceTo(player.pos))),
  );
  if (nearestHead < 25 && !player.dangerLatch) {
    player.dangerLatch = true;
    Sfx.emit("danger:near", { demo });
  } else if (nearestHead > 34) {
    player.dangerLatch = false;
  }
  // spawning
  updateSpawning(demo);
  Sfx.setIntensity(min(1, (wave - 1) / 10 + comets.length * 0.08));
  // wave clear
  if (quota === 0 && comets.length === 0 && warns.length === 0) {
    if (demo) {
      wave = wave >= 6 ? 3 : wave + 1;
      quota = quotaFor(wave);
      spawnT = 100;
      spawnSerial = 0;
    } else {
      waveClear();
    }
  }
  // drawing
  drawWarns();
  drawComets();
  drawPlayer();
  if (!demo) drawHud();
  // scoring/game-over: head collision (never unfair: tail is harmless)
  if (!demo && player.inv === 0) {
    for (const c of comets) {
      if (c.pos.distanceTo(player.pos) < HIT_R) {
        miss();
        break;
      }
    }
  }
}

function drawWarns() {
  warns.forEach((w) => {
    const cadence = w.t < 20 ? 4 : 10;
    if (ticks % cadence < cadence / 2) {
      color(w.red ? "red" : VISUAL.warningHalo);
      box(w.pos, w.red ? 11 : 9);
      color(w.red ? "light_red" : VISUAL.warning);
      box(w.pos, w.red ? 7 : 5);
      for (let i = 1; i <= 3; i++) {
        const p = vec(w.pos.x, w.pos.y);
        p.addWithAngle(w.angle, i * 4);
        color(VISUAL.warningDirection);
        box(p, max(1, 4 - i));
      }
    }
  });
}

function drawComets() {
  comets.forEach((c) => {
    const playerDist = c.pos.distanceTo(player.pos);
    const hotVisual = c.redlineT > 0 ? riskVisual(c.redlineTier) : null;
    for (let k = c.segs - 1; k >= 0; k--) {
      const sp = segPos(c, k);
      if (hotVisual) {
        color(hotVisual.halo);
        box(sp, ticks % 4 < 3 ? 9 : 7);
        color(hotVisual.core);
        box(sp, 5);
        color(c.red ? VISUAL.tailRed : VISUAL.tailBlue);
        box(sp, 2);
      } else {
        color(c.red ? VISUAL.tailRedHalo : VISUAL.tailBlueHalo);
        box(sp, 7);
        color(c.red ? VISUAL.tailRed : VISUAL.tailBlue);
        box(sp, 5);
      }
      if (k < 3) {
        color(c.red ? VISUAL.tailRedCore : VISUAL.tailBlueCore);
        box(sp, 2);
      }
    }
    if (c.naked) {
      color(VISUAL.nakedTrail);
      const trailCount = min(4, floor(c.hist.length / 6));
      for (let i = trailCount; i >= 1; i--) {
        if ((ticks + i) % 3 !== 0) box(c.hist[i * 5], max(1, 5 - i));
      }
      if (c.nakedT > 0 && ticks % 4 < 2) {
        color(c.red ? "red" : VISUAL.headNormalHalo);
        arc(c.pos, 8, 1, 0, PI * 2);
      }
    }
    drawPixelSprite(
      c.red ? PIXEL_SPRITES.cometTracker : PIXEL_SPRITES.cometNormal,
      c.pos,
    );
    if (hotVisual) {
      color(hotVisual.core);
      textC(
        c.redlineTier + " READY",
        clamp(c.pos.x, 32, 168),
        clamp(c.pos.y - 15, 18, 185),
        {
          isSmallText: true,
        },
      );
    }
    if (playerDist < 11 && ticks % 6 < 3) {
      color(VISUAL.danger);
      arc(c.pos, 9, 1, 0, PI * 2);
    }
  });
}

function drawPlayer() {
  if (player.inv > 0 && ticks % 6 < 3) return; // respawn blink
  if (player.swing > 0) {
    const a = player.dir * (PI / 2);
    color("cyan");
    arc(player.pos, SLASH_R + 1, 6, a - SLASH_HALF, a + SLASH_HALF);
    color("light_yellow");
    arc(player.pos, SLASH_R, 3, a - SLASH_HALF, a + SLASH_HALF);
  } else if (player.cool > 0 && ticks % 4 < 2) {
    color("yellow");
    const a = player.dir * (PI / 2);
    arc(player.pos, SLASH_R, 1, a - SLASH_HALF, a + SLASH_HALF);
  }
  const thrust = vec(player.pos.x, player.pos.y);
  thrust.addWithAngle(player.dir * (PI / 2) + PI, 5 + (ticks % 4 < 2 ? 2 : 0));
  color("cyan");
  box(thrust, 5);
  color("yellow");
  box(thrust, 2);
  drawPixelSprite(PIXEL_SPRITES.player[player.dir], player.pos);
  color(VISUAL.playerCore);
  box(player.pos, 2);
}

function drawHud() {
  // A one-pixel dark keyline keeps the small arcade font readable when a
  // bright star or effect passes directly behind it.
  color(VISUAL.hudShadow);
  textL("SC " + pad6(sc), 3, 3);
  textL("HI " + pad6(hi), 200 - 1 - 9 * 6, 3);
  // The run is finite, so the wave counter states the goal, not just position.
  const waveLabel = "W" + wave + "/" + FINAL_WAVE;
  textC(waveLabel, 101, 6);
  color(VISUAL.hudScore);
  textL("SC " + pad6(sc), 2, 2);
  color(VISUAL.hudHigh);
  textL("HI " + pad6(hi), 200 - 2 - 9 * 6, 2);
  color(VISUAL.hudWave);
  textC(waveLabel, 100, 5);
  // Arcade convention: the icon row is the stock, not the fleet. The ship the
  // player is flying is already on screen, so counting it again would read as
  // one more life than a miss actually leaves them.
  for (let i = 0; i < lives - 1; i++) {
    char("g", 6 + i * 9, 193);
  }
  const previewColors = spawnPreviewColors();
  for (let i = 0; i < previewColors.length; i++) {
    color(previewColors[i]);
    box(100 - (previewColors.length - 1) * 2 + i * 4, 13, 2);
  }
  if (Sfx.isMuted()) {
    color("yellow");
    textL("MUTE", 178, 188, { isSmallText: true });
  }
}

function updateFx(frozen = false) {
  remove(crystals, (p) => {
    if (!frozen) {
      if (p.grav) p.vel.y += p.grav; // firework sparks arc and fall; debris does not
      p.pos.add(p.vel);
      p.t--;
    }
    // Firework sparks carry their own palette pair instead of a gameplay tone,
    // so a celebration can use colours the cut/risk vocabulary does not own.
    const fv = p.core ? p : effectVisual(p.tone);
    const size = p.size || (p.tone === "DEBRIS" ? 3 : 5);
    color(fv.halo);
    box(p.pos, size);
    if (p.t % 6 < 3) {
      color(fv.core);
      box(p.pos, size <= 3 ? 1 : 2);
    }
    return p.t <= 0;
  });
  remove(popups, (p) => {
    if (!frozen) p.t--;
    return p.t <= 0;
  });
  remove(rings, (p) => {
    if (!frozen) p.t--;
    color(p.tone);
    const age = 18 - p.t;
    arc(p.pos, 3 + age * 0.9 * p.strength, p.t > 8 ? 2 : 1, 0, PI * 2);
    return p.t <= 0;
  });
}

function drawPopups() {
  popups.forEach((p) => {
    // Score chips rise away from the object that paid them; an announcement
    // that owns a fixed lane must stay in it instead of drifting into the HUD.
    const popupY = p.fixed ? p.pos.y : p.pos.y - (45 - min(p.t, 45)) * 0.4;
    if (p.txt === "1UP") {
      drawPixelSprite(PIXEL_SPRITES.extraLife, vec(p.pos.x - 14, popupY));
    }
    color(effectVisual(p.tone).core);
    textC(p.txt, p.txt === "1UP" ? p.pos.x + 7 : p.pos.x, popupY, {
      isSmallText: true,
    });
  });
}

function drawStars() {
  stars.forEach((s, i) => {
    if ((ticks + i * 7) % 50 < 40) {
      const layer = i % 7;
      const drift = layer === 0 ? 0.035 : layer < 3 ? 0.018 : 0.008;
      color(
        layer === 0
          ? VISUAL.starNear
          : layer < 3
            ? VISUAL.starMid
            : VISUAL.starFar,
      );
      box(
        wrap(s.x - ticks * drift, 0, 200),
        s.y,
        layer === 0 && ticks % 12 < 5 ? 2 : 1,
      );
    }
  });
}

function enterPause() {
  if (phase !== "play") return;
  pausedFrom = phase;
  phase = "paused";
  pauseT = -1;
  Sfx.pause();
}

function requestResume() {
  if (phase !== "paused" || pauseT >= 0) return;
  pauseT = 90;
  Sfx.resume();
}

function drawWorld() {
  drawWarns();
  drawComets();
  drawPlayer();
  drawHud();
}

function drawPausedWorld() {
  drawWorld();
  if (pauseT < 0) {
    color(VISUAL.pauseShadow);
    textC("PAUSED", 101, 92);
    color(VISUAL.pauseTitle);
    textC("PAUSED", 100, 91);
    color(VISUAL.pauseInstructionShadow);
    textC("P / ESC RESUME", 101, 109, { isSmallText: true });
    color(VISUAL.pauseInstruction);
    textC("P / ESC RESUME", 100, 108, { isSmallText: true });
  } else {
    const message = "READY " + max(1, ceil(pauseT / 30));
    color(VISUAL.pauseShadow);
    textC(message, 101, 101);
    color(VISUAL.pauseTitle);
    textC(message, 100, 100);
  }
}

// The clear tally is revealed one line at a time so each bonus reads as a
// separate award. A stage with no value still shows, dimmed: the player must
// be able to see which bonus they missed, not just which they earned.
const ALL_CLEAR_STAGES = [
  { at: 50, key: "base", label: () => "ALL CLEAR" },
  {
    at: 105,
    key: "ships",
    label: () => "SHIPS " + clearBonus.shipCount + " X " + SHIP_BONUS,
  },
  { at: 160, key: "noMiss", label: () => "NO MISS" },
];
const ALL_CLEAR_ACCEPT_T = 235;

function drawAllClear() {
  drawPixelSprite(PIXEL_SPRITES.waveClear, vec(100, 28));
  color(VISUAL.titleKeyline);
  TITLE_KEYLINE.forEach(([dx, dy]) =>
    textC("ALL CLEAR", 100 + dx, 54 + dy, { scale: TITLE_SCALE }),
  );
  color(VISUAL.reward);
  textC("ALL CLEAR", 100, 54, { scale: TITLE_SCALE });
  color("cyan");
  textC(FINAL_WAVE + " WAVES COMPLETE", 100, 72, { isSmallText: true });
  ALL_CLEAR_STAGES.forEach((stage, i) => {
    const value = clearBonus[stage.key];
    const y = 92 + i * 12;
    if (phaseT === stage.at && value > 0) {
      awardScore(value);
      addRing(vec(100, y), "yellow", 1.2);
      Sfx.emit("ui:confirm");
    }
    if (phaseT < stage.at) return;
    color(value > 0 ? VISUAL.reward : "light_black");
    textC(stage.label() + "   " + (value > 0 ? "+" + value : "---"), 100, y, {
      isSmallText: true,
    });
  });
  if (phaseT > ALL_CLEAR_ACCEPT_T - 40) {
    color(VISUAL.hudShadow);
    textC("SCORE " + pad6(sc), 101, 141);
    color("light_cyan");
    textC("SCORE " + pad6(sc), 100, 140);
  }
  if (phaseT > ALL_CLEAR_ACCEPT_T && phaseT % 80 < 50) {
    color("yellow");
    textC(qualifiesForTable() ? "ENTER NAME" : "Z / ENTER OK", 100, 162, {
      isSmallText: true,
    });
  }
  if (phaseT > ALL_CLEAR_ACCEPT_T && (confirmPressed() || phaseT > 900))
    finishAllClear();
}

function drawScoreTable(y) {
  color("light_cyan");
  textC("TOP PILOTS", 100, y);
  if (scores.length === 0) {
    color("cyan");
    textC("NO RECORDS YET", 100, y + 18, { isSmallText: true });
    return;
  }
  scores.forEach((entry, i) => {
    if (i === 0) drawPixelSprite(PIXEL_SPRITES.rankMedal, vec(62, y + 12));
    color(i === 0 ? "light_yellow" : "cyan");
    textC(`${i + 1} ${entry.name} ${pad6(entry.score)}`, 100, y + 12 + i * 9, {
      isSmallText: true,
    });
  });
}

// A full 8-neighbour keyline, not an offset drop shadow: a comet tail can cross
// the title from any direction, and a one-sided shadow leaves the opposite edge
// of every stroke touching the same cyan it is drawn in.
const TITLE_KEYLINE = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];
const TITLE_SCALE = { x: 2, y: 2 };

function drawTitle(cx, cy) {
  color(VISUAL.titleKeyline);
  TITLE_KEYLINE.forEach(([dx, dy]) =>
    textC("COMET SLASH", cx + dx, cy + dy, { scale: TITLE_SCALE }),
  );
  color(VISUAL.title);
  textC("COMET SLASH", cx, cy, { scale: TITLE_SCALE });
}

const ATTRACT_TIPS = [
  "LET HEADS PASS CLOSE",
  "CUT THE GLOWING WAKE",
  "LONG CUTS SCORE X2",
  "2 COMETS 1 SLASH = X2",
  "BARE HEADS SPEED UP",
];

function attractPage() {
  return floor(phaseT / ATTRACT_PAGE_T) % 2 === 0 ? "howto" : "ranking";
}

function drawAttractHowTo() {
  color("cyan");
  textC("CUT THE TAILS,", 100, 58, { isSmallText: true });
  textC("DODGE THE HEADS!", 100, 66, { isSmallText: true });
  // The run has an end, and a player who does not know that cannot aim for it.
  // This is the objective, so it stays up instead of rotating with the tips.
  color("light_cyan");
  textC("CLEAR ALL " + FINAL_WAVE + " WAVES", 100, 74, { isSmallText: true });
  color("light_yellow");
  // The tips share one page, so they split its time evenly however many there
  // are: hard-coded slices silently drop the last tip when one is added.
  const tip = floor(
    ((phaseT % ATTRACT_PAGE_T) / ATTRACT_PAGE_T) * ATTRACT_TIPS.length,
  );
  textC(ATTRACT_TIPS[min(tip, ATTRACT_TIPS.length - 1)], 100, 82, {
    isSmallText: true,
  });
  // Keep the center lane open for the live demo; compact control groups at
  // the sides replace the old opaque panel.
  color("light_yellow");
  textC("MOVE", 42, 151, { isSmallText: true });
  textC("SLASH", 158, 151, { isSmallText: true });
  color("yellow");
  textC("ARROWS/WASD", 42, 160, { isSmallText: true });
  textC("Z / SPACE", 158, 160, { isSmallText: true });
  textC("P PAUSE   M MUTE", 100, 176, { isSmallText: true });
}

function drawAttractRanking() {
  drawScoreTable(61);
  color("cyan");
  textC("MOVE ARROWS/WASD", 100, 151, { isSmallText: true });
  textC("SLASH Z / SPACE", 100, 160, { isSmallText: true });
  color("light_yellow");
  textC("HOW TO PLAY RETURNS SOON", 100, 176, { isSmallText: true });
}

function updateNameEntry() {
  nameT++;
  // A-Z plus the three separators period/dash/space, the way the era's cabinets
  // did it. Digits are left out: they would add ten more steps to every letter
  // cycle, and 0/O, 1/I and 8/B are hard to tell apart in the small font.
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ.- ";
  if (nameLeftPressed()) nameCursor = max(0, nameCursor - 1);
  if (nameRightPressed()) nameCursor = min(2, nameCursor + 1);
  if (nameUpPressed() || nameDownPressed()) {
    const delta = nameUpPressed() ? 1 : -1;
    const i = alphabet.indexOf(nameChars[nameCursor]);
    nameChars[nameCursor] =
      alphabet[(i + delta + alphabet.length) % alphabet.length];
    Sfx.emit("ui:move");
  }
  if (confirmPressed()) {
    if (nameCursor < 2) {
      nameCursor++;
      Sfx.emit("ui:move");
    } else {
      commitNameEntry();
      return;
    }
  }
  if (nameT > 900) {
    commitNameEntry();
    return;
  }
  color("light_yellow");
  textC("NEW HIGH SCORE", 100, 45);
  color("light_cyan");
  textC(pad6(sc), 100, 63);
  color("yellow");
  textC(nameChars.join(" "), 100, 91);
  const cursorX = 88 + nameCursor * 12;
  if (ticks % 20 < 14) box(cursorX, 99, 7, 2);
  color("cyan");
  textC("UP/DOWN CHAR", 100, 116, { isSmallText: true });
  textC("LEFT/RIGHT MOVE", 100, 124, { isSmallText: true });
  textC("Z / ENTER OK", 100, 132, { isSmallText: true });
  drawScoreTable(143);
}

// --- main loop ---
function update() {
  if (!ticks) {
    initAll();
  }
  drawStars();
  updateFx(phase === "paused" || hitStop > 0);
  if (hitStop > 0) {
    // Presentation only: the world is redrawn from unchanged state, so no
    // position, timer, or collision advances. A swing pressed inside the stop
    // is held rather than eaten, because the freeze lands exactly on the frames
    // where the player is already committing to the next dodge.
    if (slashPressed()) slashBuffer = true;
    hitStop--;
    // The hull survives the whole freeze and breaks on the frame the world
    // starts again, whether that lands in `dying` or in `gameover`.
    if (hitStop === 0 && deathBurst) {
      deathBurst = false;
      burstShip();
    }
    drawWorld();
    drawPopups();
    return;
  }
  if (mutePressed()) Sfx.toggleMute();
  if (pausePressed()) {
    if (phase === "play") enterPause();
    else if (phase === "paused") requestResume();
  }
  switch (phase) {
    case "attract": {
      updatePlay(true);
      drawTitle(100, 42);
      drawPixelSprite(PIXEL_SPRITES.titleEmblem, vec(100, 24));
      if (attractPage() === "howto") drawAttractHowTo();
      else drawAttractRanking();
      if (phaseT % 80 < 50) {
        color("yellow");
        textC("PRESS Z TO START", 100, 190);
      }
      color("light_cyan");
      textC("HI " + pad6(hi), 100, 12, { isSmallText: true });
      if (phaseT > 30 && confirmPressed()) startGame();
      break;
    }
    case "ready": {
      phaseT++;
      drawWarns();
      drawPlayer();
      drawHud();
      color("cyan");
      textC("READY!", 101, 101);
      color("yellow");
      textC("READY!", 100, 100);
      if (phaseT > 65) {
        phase = "play";
        phaseT = 0;
        Sfx.startBgm("play");
      }
      break;
    }
    case "play": {
      updatePlay(false);
      break;
    }
    case "dying": {
      phaseT++;
      drawWarns();
      drawComets();
      drawHud();
      // The break-up owns the first half-second alone; the word arrives once
      // the debris has cleared the centre instead of competing with it.
      if (phaseT > 26) {
        color("light_red");
        textC("OUCH!", 100, 100);
      }
      if (phaseT > 70) {
        player.pos.set(100, 170);
        player.dir = 3;
        player.cool = 0;
        player.swing = 0;
        player.swingHit = false;
        player.dangerLatch = false;
        player.inv = 60;
        phase = "play";
        phaseT = 0;
        Sfx.startBgm("play");
      }
      break;
    }
    case "paused": {
      drawPausedWorld();
      if (pauseT > 0) {
        pauseT--;
        if (pauseT === 0) {
          phase = pausedFrom || "play";
          pausedFrom = null;
          phaseT = 0;
          Sfx.startBgm("play");
        }
      }
      break;
    }
    case "waveclear": {
      phaseT++;
      waveClearFireworks(phaseT);
      updateClearShip();
      drawHud();
      // The banner sits in the upper third so the 1UP and bonus popups below it
      // have their own lanes, and so the shells burst above the text.
      color("cyan");
      textC("WAVE " + wave + " CLEAR!", 101, 73);
      color("yellow");
      textC("WAVE " + wave + " CLEAR!", 100, 72);
      if (phaseT > 75) {
        wave++;
        quota = quotaFor(wave);
        spawnT = 100;
        spawnSerial = 0;
        fullCuts = 0;
        phase = "play";
        phaseT = 0;
        Sfx.startBgm("play");
      }
      break;
    }
    case "allclear": {
      phaseT++;
      allClearFireworks(phaseT);
      updateClearShip();
      drawHud();
      drawAllClear();
      break;
    }
    case "gameover": {
      phaseT++;
      drawComets();
      drawHud();
      color("red");
      textC("GAME OVER", 101, 89);
      color("light_red");
      textC("GAME OVER", 100, 88);
      color("light_cyan");
      textC("SCORE " + sc, 100, 106);
      const qualifies = qualifiesForTable();
      if (phaseT > 90 && phaseT % 80 < 50) {
        color("yellow");
        textC(qualifies ? "ENTER NAME" : "ENTER RETRY", 100, 140, {
          isSmallText: true,
        });
        if (!qualifies) textC("Z TITLE", 100, 149, { isSmallText: true });
      }
      if (qualifies && (phaseT > 150 || (phaseT > 90 && confirmPressed()))) {
        beginNameEntry();
      } else if (
        !qualifies &&
        phaseT > 90 &&
        keyboard.code.Enter.isJustPressed
      ) {
        startGame();
      } else if (!qualifies && phaseT > 90 && slashPressed()) {
        returnToAttract();
      } else if (!qualifies && phaseT > 900) {
        returnToAttract();
      }
      break;
    }
    case "nameentry": {
      updateNameEntry();
      break;
    }
    case "scores": {
      phaseT++;
      drawScoreTable(55);
      color("light_yellow");
      textC("ENTER RETRY", 100, 132, { isSmallText: true });
      textC("Z / SPACE TITLE", 100, 142, { isSmallText: true });
      if (phaseT > 20 && keyboard.code.Enter.isJustPressed) startGame();
      else if (phaseT > 20 && slashPressed()) returnToAttract();
      break;
    }
  }
  // Score feedback is an overlay, not world scenery: draw it last so comet
  // bodies, particles, and ceremony art cannot cover named bonuses.
  drawPopups();
}

window.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    enterPause();
    Sfx.suspend();
  } else {
    Sfx.resume();
    // Play resumes its music through the pause count-in; the ranking screens
    // have no such gate, so restore their theme here.
    if (phase === "nameentry" || phase === "scores") Sfx.startBgm("rank");
  }
});

window.__cometSlashDebug = {
  visualContract: () => ({
    ...VISUAL,
    metrics: {
      collisionRadius: HIT_R,
      redlineRadius: REDLINE_R,
      closeRadius: 16,
      razorRadius: 11,
      effectRingCap: 12,
      approachRiskPreview: false,
      enemySolidBackdrop: false,
      nakedFlashShape: "ring",
      cameraShake: false,
      hitStop: {
        ...HITSTOP_TIER,
        naked: HITSTOP_NAKED,
        multi: HITSTOP_MULTI,
        miss: HITSTOP_MISS,
      },
      shipDebris: SHIP_DEBRIS,
    },
  }),
  freeze: () => ({ hitStop, slashBuffer, deathBurst }),
  spriteContract: () => ({
    titleEmblem: {
      source: PIXEL_SPRITES.titleEmblem.source,
      size: [PIXEL_SPRITES.titleEmblem.width, PIXEL_SPRITES.titleEmblem.height],
    },
    player: PIXEL_SPRITES.player.map((s) => ({
      source: s.source,
      size: [s.width, s.height],
    })),
    cometNormal: {
      source: PIXEL_SPRITES.cometNormal.source,
      size: [PIXEL_SPRITES.cometNormal.width, PIXEL_SPRITES.cometNormal.height],
    },
    cometTracker: {
      source: PIXEL_SPRITES.cometTracker.source,
      size: [
        PIXEL_SPRITES.cometTracker.width,
        PIXEL_SPRITES.cometTracker.height,
      ],
    },
    ceremonies: [
      PIXEL_SPRITES.extraLife,
      PIXEL_SPRITES.waveClear,
      PIXEL_SPRITES.rankMedal,
    ].map((s) => ({ source: s.source, size: [s.width, s.height] })),
  }),
  resolved: () => resolvedComets.slice(),
  report: () => {
    const total = resolvedComets.length;
    const effective = resolvedComets.filter((c) => c.effective).length;
    const exits = resolvedComets.filter((c) => c.reason === "exit").length;
    const timeouts = resolvedComets.filter(
      (c) => c.reason === "timeout",
    ).length;
    return {
      seedState: rngState,
      total,
      effective,
      effectiveRate: total ? effective / total : null,
      exits,
      timeouts,
      redlineClaims: resolvedComets.filter((c) => c.redlineBonus > 0).length,
      redlineBonus: resolvedComets.reduce((sum, c) => sum + c.redlineBonus, 0),
      averageVisibleTicks: total
        ? resolvedComets.reduce((sum, c) => sum + c.visibleTicks, 0) / total
        : null,
    };
  },
  setSeed: (seed) => setGameSeed(seed),
  resetTelemetry: () => (resolvedComets = []),
  state: () => ({
    phase,
    wave,
    quota,
    warns: warns.length,
    comets: comets.length,
    lives,
    misses,
    sc,
    clearBonus,
  }),
  // The finite campaign's shape, so a probe asserts the intended curve instead
  // of re-deriving the formulas it is supposed to be checking.
  campaign: () => ({
    finalWave: FINAL_WAVE,
    extend: { first: EXTEND_FIRST, step: EXTEND_STEP },
    clear: { base: ALL_CLEAR_BONUS, ship: SHIP_BONUS, noMiss: NO_MISS_BONUS },
    waves: times(FINAL_WAVE, (i) => {
      const w = i + 1;
      return {
        wave: w,
        quota: quotaFor(w),
        speed: speedFor(w),
        interval: intervalFor(w),
        cap: capFor(w),
        tail: tailFor(w),
        meander: meanderFor(w),
        red: redChanceFor(w),
        warnLead: warnLeadFor(w),
        formation: times(6, (s) => formationSizeFor(w, s)),
      };
    }),
  }),
  attractPage: () => attractPage(),
};
