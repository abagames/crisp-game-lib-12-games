/* CHAIN DRIFT — crisp-game-lib 1.5.0
 *
 * `title` and `description` are intentionally left undefined. The bundle keeps
 * isNoTitle = true in that case and boots straight into initInGame(), so
 * update() runs from frame 0 forever and this file owns the whole arcade cycle:
 *   attract(title <-> bot demo) -> ready -> play -> chainout -> clear/death
 *   -> (round 18: allclear | no lives: gameover)
 *   -> (qualifying: entry -> table | non-qualifying: table) -> attract
 * end() is never called, and options.isShowingScore is off because the
 * library's score/HI display is only reset and updated inside initInGame().
 */

const TITLE_LOGO_SRC = "./assets/sprites/chain-drift-logo.png";
// External character "a" is the title wordmark. Defining `characters` does not
// hand title-screen control back to the library; `title` and `description`
// remain deliberately undefined.
characters = [TITLE_LOGO_SRC];

options = {
  viewSize: { x: 160, y: 144 },
  theme: "dark",
  isReplayEnabled: false,
  isShowingScore: false,
  isDrawingParticleFront: true,
  // The cabinet owns its own audio: see the `audio` section of this file. With
  // this off the library never initialises algo-chip / sounds-some-sounds and
  // never plays anything of its own, so there is exactly one sound path.
  isSoundEnabled: false,
};

// ---------------------------------------------------------------- layout ----

const VW = 160;
const VH = 144;
// Field interior. Mine and player centres are kept inside these bounds.
const FX0 = 4;
const FX1 = 156;
const FY0 = 18;
const FY1 = 138;
const CX = (FX0 + FX1) / 2;
const CY = (FY0 + FY1) / 2;
const TITLE_LOGO = {
  char: "a",
  width: 128,
  height: 24,
  centerX: CX,
  centerY: 31,
};

// Persistent visual roles use the base palette. `light_yellow` is reserved for
// momentary chain milestones; `light_black` is the one persistent exception,
// because it is the neutral grey that remains visible on the dark theme.
const VISUAL_PALETTE = {
  player: "cyan",
  inert: "blue",
  playerDanger: "red",
  fieldDanger: "purple",
  reward: "yellow",
  structure: "blue",
  neutral: "light_black",
};

// Two-row cabinet register. Keeping every persistent readout in this strip
// prevents later HUD additions from leaking into the playfield.
const HUD_LAYOUT = {
  row1Y: 2,
  row2Y: 9,
  roundFieldLabelY: 10,
  scoreX: 3,
  quotaGlyphX: 56,
  quotaTextX: 64,
  fieldLabelX: 21,
  fieldGaugeX: 31,
  fieldGaugeW: 38,
  multRight: 87,
  timeRight: 116,
  timeGaugeX: 91,
  timeGaugeW: 25,
  livesRight: 152,
  lifeCountIconX: 144,
  lifeCountTextX: 149,
};
const FIELD_LOAD_LABEL = "FL";

// ------------------------------------------------------------- constants ----

const PLAYER_R = 3;
const PLAYER_SPEED = 1.05;
const SHOVE_REACH = 8;
const SHOVE_ARC = 0.87; // ~50 degrees
const SHOVE_FORWARD_REACH = 11;
const SHOVE_FORWARD_ARC = 0.44; // ~25 degrees
const SHOVE_CD = 12;
const RESPAWN_INVULN = 120;

const MINE_R = 2.5;
const ARMED_SPEED = 1.4;
const ARM_FUSE = 10; // rotation-before-launch tell for a player shove
// A mine you just shoved cannot hit you until it has cleared this distance.
// Without it the 10-frame fuse is a trap: the player walks into their own mine
// while it is still stationary and dies the frame it launches.
const SHOVER_SAFE_DIST = MINE_R + PLAYER_R + 6;
const CHAIN_FUSE = 6; // shorter tell for mines armed by a blast
const MINE_HARD_MAX = 60;

const BLAST_LIFE = 12;
const BLAST_R0 = 3;
const BLAST_R1 = 16;

const SCAV_SPEED = 0.55;
const SCAV_RETARGET = 30;
const SCAV_SIZE = [7, 9, 11];
const SCAV_EAT_CAP = 3;

const LODE_RADIUS = 24;
const LODE_CORE_RADIUS = 7;
const LODE_PULL = 0.18;
const LODE_DRAG = 0.94;
const LODE_DENSE_COUNT = 6;
// A mine in flight is deflected toward the anchor as well, so a chain crossing
// the field does not land where it was aimed. No drag is applied: damping a
// 1.4 px/frame link would leave it hanging in the field instead of detonating
// on the next thing it touches. The per-mine budget is what makes capture
// impossible -- once it is spent the mine is ballistic again, so it cannot be
// held in orbit at any radius. 6 px is one mine-contact threshold and a third
// of a blast radius: enough to move a detonation off the aimed point.
const LODE_PULL_ARMED = 0.25;
const LODE_ARMED_BUDGET = 6;

// A capacitor is a fixed blast relay. The one-second charge is long enough to
// read and escape; its re-emission reaches 24 px instead of an ordinary
// blast's 16 px. A relayed blast is marked so it cannot be absorbed again.
const CAPACITOR_R = 5;
const CAPACITOR_DELAY = 60;
const CAPACITOR_BLAST_LIFE = 18;
const CAPACITOR_BLAST_R1 = 24;
// The intake is the same circle the discharge fills, so the one drawn diamond
// states both halves of the rule: what detonates in here is swallowed whole,
// and it comes back over exactly this ground. The first pass tested
// `blast radius + body radius` instead, an undrawn ~21 px cross-section that
// only bit once the blast had already armed part of its neighbourhood -- so
// absorption removed the tail of a chain front rather than the front.
const CAPACITOR_INTAKE_R = CAPACITOR_BLAST_R1;
// Live ordnance inside the intake is drawn toward the plates. This is the
// capacitor's continuous half, the counterpart of the lodestone's gathering:
// LODESTONE acts on material, CAPACITOR acts on ordnance. Same per-launch
// budget rule as the lodestone's deflection, so capture stays impossible --
// once the budget is spent the mine is ballistic again and cannot be held.
const CAPACITOR_PULL_ARMED = 0.25;
const CAPACITOR_ARMED_BUDGET = 6;
// After a discharge the intake stays shut for one more second. Without it the
// wider intake and the inward pull together let the discharge's own chain fall
// back in and re-charge the relay, which is the permanent scoring pulse the
// design forbids: the multiplier would stay alive with no player input. The
// bound this buys is hard rather than statistical -- at most one absorption and
// one discharge per 120 frames, whatever the chain does.
const CAPACITOR_COOLDOWN = 60;
// While it is loading -- and only then -- the capacitor gathers inert material
// into the blast it is about to fire, so the delay is a visible loading of the
// board rather than dead time. Two constraints fix these numbers rather than
// taste:
//
//   * gathering inside the discharge footprint would be worthless. Anything
//     already within 24 px is armed by the discharge either way, so the reach
//     must exceed it or the rule changes nothing.
//   * the reach is exactly how far a mine can travel in the time available:
//     `INTAKE + PULL * DELAY`. The drawn outer diamond therefore means something
//     exact -- everything inside it will be inside the blast when it goes off --
//     rather than vaguely marking influence.
//
// The pull rate is the same one the actor uses on ordnance: one speed for one
// actor. Drag is the lodestone's, for the lodestone's reason: damping ordinary
// drift is what makes material settle into a knot instead of sailing through.
// The core stops at half the discharge radius, far enough in that gathered
// material cannot drift back out and far enough out that the knot does not
// cover the charge cells the player is reading.
const CAPACITOR_GATHER_PULL = 0.25;
const CAPACITOR_GATHER_R =
  CAPACITOR_INTAKE_R + CAPACITOR_GATHER_PULL * CAPACITOR_DELAY;
const CAPACITOR_GATHER_DRAG = 0.94;
const CAPACITOR_CORE_R = CAPACITOR_BLAST_R1 / 2;

const CHAIN_TIME = 75;
const MULT_MAX = 32;
const MINE_SCORE = 50;
const SCAV_SCORE = 200;

const OVERLOAD_DELAY = 60;
const CHAIN_OUT_MAX = 300;
// Remaining mines at which the HUD glyph starts flashing and the cabinet says
// so once. One threshold, read by the readout and by the sound.
const QUOTA_LOW = 5;

const CLEAR_BONUS_PER_ROUND = 200;
const PAR_BONUS_PER_SEC = 50;
const PAR_SEC_PER_MINE = 1.2;

// Extend thresholds. Measured with the attract bot (see docs/), not guessed.
const EXTEND_FIRST = 40000;
const EXTEND_INTERVAL = 120000;
const LIVES_START = 3;
const LIVES_MAX = 9;
const LIVES_SHOWN = 4;

const FINAL_ROUND = 18;
const LIFE_BONUS_PER_LIFE = 1000;
// CLEAR leaves its complete reward cadence alone before either counter starts.
// GAME OVER likewise lets the 22-frame MISS impact finish before shutdown.
const CLEAR_ROUND_TALLY_AT = 152;
const CLEAR_TIME_TALLY_AT = 97;
const GAMEOVER_JINGLE_AT = 98;

const HISCORE_KEY = "chainDrift.hiScores.v2";
const HISCORE_DEFAULTS = [
  {
    name: "CDL",
    score: 35000,
    reachedRound: null,
    cleared: false,
    recordedAt: 0,
  },
  {
    name: "ARC",
    score: 24000,
    reachedRound: null,
    cleared: false,
    recordedAt: 0,
  },
  {
    name: "MNE",
    score: 17000,
    reachedRound: null,
    cleared: false,
    recordedAt: 0,
  },
  {
    name: "FSE",
    score: 12000,
    reachedRound: null,
    cleared: false,
    recordedAt: 0,
  },
  {
    name: "TND",
    score: 8000,
    reachedRound: null,
    cleared: false,
    recordedAt: 0,
  },
];

const ENTRY_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-";
const ENTRY_GRID_COLS = 10;
const ENTRY_GRID_ROWS = 4;
const ENTRY_KEYS = ENTRY_CHARS.split("").concat(["DEL", "END"]);
const ENTRY_GRID_LEFT = 13;
const ENTRY_GRID_TOP = 20;
const ENTRY_GRID_X_STEP = 15;
const ENTRY_GRID_Y_STEP = 11;
const ENTRY_CURSOR_W = 14;
const ENTRY_CURSOR_H = 10;
const ENTRY_CURSOR_Y_OFFSET = 2;
const ENTRY_TIMEOUT = 1800;
const PHASE_GRACE = 20;
const PLAYER_ACTION_LABEL = "PUSH";
/* One owner for the movement-key copy: every screen that takes a direction
 * takes the same synonyms (see dirPressed / readKeys), so it says so. */
const MOVE_KEYS_LABEL = "ARROWS/WASD";
const START_PROMPT = "PRESS SPACE";

// Nine authored personalities repeat once at higher pressure. The public
// counter is continuous from 1 through FINAL_ROUND; there is no lap counter.
// Pattern round 8 is the deliberate breather before each STORM climax.
const ROUNDS = [
  {
    name: "SHAKEDOWN",
    spawn: 48,
    drift: 0.18,
    cap: 16,
    scav: 0,
    lode: 0,
    capacitor: 0,
    quota: 20,
  },
  {
    name: "DRIFT LINE",
    spawn: 44,
    drift: 0.26,
    cap: 16,
    scav: 0,
    lode: 1,
    capacitor: 0,
    quota: 24,
  },
  {
    name: "CHARGE LINE",
    spawn: 42,
    drift: 0.22,
    cap: 16,
    scav: 0,
    lode: 0,
    capacitor: 1,
    quota: 26,
  },
  {
    name: "SWARM",
    spawn: 26,
    drift: 0.2,
    cap: 13,
    scav: 1,
    lode: 1,
    capacitor: 0,
    quota: 30,
  },
  {
    name: "SCAVENGE",
    spawn: 46,
    drift: 0.22,
    cap: 18,
    scav: 2,
    lode: 0,
    capacitor: 0,
    quota: 30,
  },
  {
    name: "SURGE",
    spawn: 38,
    drift: 0.36,
    cap: 15,
    scav: 1,
    lode: 0,
    capacitor: 1,
    quota: 36,
  },
  {
    name: "CRUSH",
    spawn: 24,
    drift: 0.28,
    cap: 10,
    scav: 2,
    lode: 1,
    capacitor: 0,
    quota: 40,
  },
  {
    name: "HARVEST",
    spawn: 20,
    drift: 0.16,
    cap: 24,
    scav: 0,
    lode: 0,
    capacitor: 0,
    quota: 44,
  },
  {
    name: "STORM",
    spawn: 22,
    drift: 0.34,
    cap: 12,
    scav: 3,
    lode: 1,
    capacitor: 0,
    quota: 48,
  },
];
// The cabinet demo teaches only the authored personalities. The second-cycle
// pressure variants remain part of a real run rather than attract footage.
const ATTRACT_ROUND_COUNT = ROUNDS.length;

// Fraction of the inert cap present when a round begins. Without a seeded
// field the first shove of a round has nothing to chain into.
const SEED_RATIO = 0.55;

// Lodestone anchors. Each lodestone round owns a different one, so the five of
// them stop sharing a single spatial layout, and the assignment rotates on the
// second nine-round cycle so it is not a replay of the first. Every pair is at least
// 2 * LODE_RADIUS = 48 px apart, so two footprints never overlap and the ring
// stays readable as one exact boundary; every anchor is at least 30 px from the
// centre spawn and its ring falls entirely inside the frame.
const LODE_ANCHORS = [
  [30, 44],
  [130, 44],
  [130, 112],
  [30, 112],
  [80, 44],
];
// Capacitors need their own anchors. They shared the lodestone's five for as
// long as both actors had a 24 px footprint, but the loading gather draws a
// 39 px boundary, and two of those need 78 px of separation to stay readable as
// two boundaries. The shared set has 50 px and 68 px pairs -- reachable from
// a later cycle -- where the drawn diamonds interpenetrate into an unreadable tangle.
//
// These three are the highest-traffic positions that satisfy every constraint at
// once: 78 px mutual separation with margin (82.4 / 101.3 / 82.1), the 24 px
// intake entirely inside the frame, and 30 px of clearance from the centre
// spawn. "Highest-traffic" is measured, not guessed -- see the spec's chain
// traffic map. Three is the most the field can hold at this separation, so the
// rotation cycle is three cycles rather than the lodestone's five, and at maximum
// scaling all three are in play and the rotation no longer varies anything.
const CAPACITOR_ANCHORS = [
  [32, 42],
  [72, 114],
  [132, 58],
];
// Anchor each actor round starts from, by `round - 1`. R3 is CAPACITOR's solo
// teaching round, so it gets the busiest anchor of the three.
const LODE_SLOT_BY_ROUND = [0, 0, 0, 2, 0, 0, 3, 0, 4];
const CAPACITOR_SLOT_BY_ROUND = [0, 0, 1, 0, 0, 2, 0, 0, 0];

// ----------------------------------------------------------------- state ----

let phase; // attract | ready | play | chainout | clear | allclear | death | gameover | entry | table
let phaseTimer;
let graceTimer;
let attractSub; // title | demo
let simActive; // false once the player is hit, so later steps in the same frame stop

let player;
let mines;
let blasts;
let scavs;
let lodestones;
let capacitors;
// Initialized at load, not on the first frame: startGame() is reachable from
// the debug handle before update() has ever run.
let pops = []; // floating score labels (we draw the score ourselves)
let noteQueue = []; // notes emitted but not yet due, in frames
let noteSeq = 0; // enqueue order, so same-priority arbitration is deterministic
let audioFrameTick = -1;
let audioFrameCounts = {};
let audioEventLog = [];
let audioNoteLog = []; // every dispatched note, played or dropped, for probes
let audioUnknown = []; // emissions of names the event registry does not declare
let audioMuted = false;
let bgm = null; // running BGM scheduler state, or null when the cue is stopped
let bgmLog = [];
let quotaLowWarned = false;
let chainPulse = 0;
let chainFlash = 0;

let gameScore;
let hiScores;
let realScores = [];
let lives;
let round;
let rp; // resolved round parameters
let quotaLeft;
let roundFrames;
let spawnTimer;
let overloadTimer;
let mult;
let chainTimer;
let nextExtendAt;
let clearBonus;
let parBonus;
let clearRoundPaid;
let clearTimePaid;
let lifeBonus;
let lifeBonusPaid;
let chainOutTimer;
let chainOutTimedOut;
let bot;
let entry;
let lastRunScore;
let lastRunRound;
let lastRunCleared;
let autopilot = false;
let scavRespawnTimer = 0;
let scavEatCap = SCAV_EAT_CAP;
// Release telemetry makes payload annihilation measurable in organic play.
// Each released mine keeps its origin until detonation; probes can distinguish
// a genuine zero-travel pile-up from an injected-state artifact.
let scavReleaseSeq = 0;
let scavReleaseLog = [];
// Death telemetry: what killed the player and how long after their own shove.
// "Unfair" is a measurable claim, so it gets an instrument.
let lastShoveFrame = -9999;
let deathLog = [];
// Render-only snapshot of the exact hazard that caused the current miss.
// The live field is still defused immediately; this object never participates
// in movement, collision, chaining or scoring.
let deathEcho = null;

// ------------------------------------------------------------- utilities ----

function angleDiff(a, b) {
  let d = a - b;
  while (d > PI) d -= PI * 2;
  while (d < -PI) d += PI * 2;
  return d;
}

function patternRound(r) {
  return ((r - 1) % ROUNDS.length) + 1;
}

function cycleIndex(r) {
  return floor((r - 1) / ROUNDS.length);
}

function roundParams(r) {
  const l = cycleIndex(r);
  const b = ROUNDS[patternRound(r) - 1];
  return {
    name: b.name,
    spawn: max(22, round2(b.spawn * pow(0.92, l))),
    drift: min(0.6, b.drift * pow(1.1, l)),
    cap: max(8, b.cap - l),
    scav: min(4, b.scav + floor(l / 2)),
    lode: b.lode === 0 ? 0 : min(3, b.lode + floor(l / 2)),
    capacitor: b.capacitor === 0 ? 0 : min(3, b.capacitor + floor(l / 2)),
    quota: round2(b.quota * pow(1.15, l)),
  };
}

function roundLabels(r) {
  return {
    full: `ROUND ${r}`,
    hud: `R${r}`,
  };
}

// `round` is taken by the round counter, so alias Math.round.
function round2(v) {
  return Math.round(v);
}

// ================================================================= audio ====
/* CHAIN DRIFT synthesises every sound itself, the same way it draws every
 * pixel itself. `options.isSoundEnabled` is false and no algo-chip /
 * sounds-some-sounds script is loaded, so the engine's own audio path is dead:
 * the four voices below are the whole cabinet.
 *
 * Dependency direction, and nothing may short-circuit it:
 *
 *   game code -> audioEmit(event) -> AUDIO_KIT program -> per-frame voice
 *   arbitration -> synthNote() -> Web Audio
 *
 * Gameplay code names events, never waveforms, and this section is the only
 * place in the file that touches an AudioContext. A program is data: frame
 * offsets at 60 Hz, one of four voices, one of five primitives, a MIDI pitch,
 * a length in frames, a gain and an optional slide. That is what makes
 * duration, voice use and loop boundaries measurable instead of audible-only.
 *
 * Era-inspired, not hardware-faithful: no specific chip is emulated. The
 * capability model is a small PSG-like board -- three tone voices and one
 * noise voice, each monophonic, updated once per frame.
 */

const AUDIO_PROFILE = {
  id: "chain-drift-psg-4v",
  fidelity: "era-inspired",
  // p1 is reserved for the player: control feedback and cabinet rewards. BGM
  // never touches it, so a shove is never competing with the music for a voice.
  voices: ["p1", "p2", "bass", "noise"],
  waves: ["p12", "p25", "p50", "tri", "noise"],
  master: { gain: 0.22, dcBlockHz: 30, softClip: true, channels: 1 },
  attackSec: 0.004,
  releaseSec: 0.012,
  stealFadeSec: 0.008,
  lookaheadSec: 0.03,
  noteGainMax: 0.6,
  bgmGainMax: 0.22,
  // What happens to the second request for a voice that has already started a
  // note this frame. `drop` is the honest reading of a four-voice board: a
  // retrigger 0 ms after the attack is a click, not a second sound.
  sameTickPolicy: "drop",
  // How far a sound must clear the cue it shares a screen with, measured on
  // rendered peaks. Recorded here rather than in the gate so the number is part
  // of the contract the kit is authored against.
  audibilityMargin: 1.25,
  // Peaks answer "can this be heard"; they do not answer "how loud is this",
  // and for a while nothing here did. Every program passed the peak checks
  // while the ceremony jingles sat 9 dB above the music over any window long
  // enough to contain them, because a sustained four-voice phrase and a
  // four-frame click reach the same sample value. 0.3 s is long enough for a
  // ceremony phrase to fill and short enough that one SFX still registers.
  sustainWindowSec: 0.3,
  // A ceremony interrupts a soundtrack the player has been hearing for minutes,
  // so the two have to belong to one cabinet. This caps how far the loudest
  // ceremony may sit above the loudest arrangement over that window. It is not
  // a masking limit -- READY and ROUND CLEAR play in silence -- it is what keeps
  // them from being the loudest thing in the session.
  ceremonyOverMusicMaxDb: 6,
  noteFramesMax: 60,
  sfxLastFrame: 36, // 0.6 s
  jingleLastFrame: 96, // 1.6 s
  stepsMax: 24,
  bgmLoopFramesMax: 240, // 4 s
};

// Arbitration order, straight down the cabinet's priorities: control feedback
// first, then danger, then the consequences a chain has to stay readable
// through, then reward/ceremony, then the music. A voice is stolen by an equal
// or higher priority and never by a lower one.
const AUDIO_PRIORITY = {
  control: 100,
  danger: 90,
  consequence: 70,
  cabinet: 55,
  bgmBass: 20,
  bgmPerc: 12,
  bgmMid: 8,
};

/* Every audible event, plus the moments that are deliberately silent, as
 * `[role, heardUnder]`.
 *
 * `heardUnder` names the cue this event can actually be playing over, or null
 * when it only ever sounds in silence. It is not documentation: the audibility
 * gate groups events by it and requires each one to clear the cue it shares a
 * screen with. Comparing every sound against the loudest music in the game
 * would fail sounds that can never be heard against it and pass sounds buried
 * under the music they do share a screen with -- so a new event that forgets to
 * declare this is a new event nobody checked. `CD.audioUnknown()` reports an
 * emission that is not declared here at all. */
const AUDIO_EVENTS = {
  shove: ["control", "drift"],
  "shove:whiff": ["control", "drift"],
  respawn: ["control", "drift"],
  "entry:move": ["control", "entry"],
  "entry:confirm": ["control", "entry"],
  "entry:delete": ["control", "entry"],
  miss: ["danger", "drift"],
  "overload:warn": ["danger", "drift"],
  "jingle:overload": ["danger", "drift"],
  "chain:detonate": ["consequence", "drift"],
  "chain:expire": ["consequence", "drift"],
  "scav:eat": ["consequence", "drift"],
  "scav:burst": ["consequence", "drift"],
  "capacitor:absorb": ["consequence", "drift"],
  "capacitor:release": ["consequence", "drift"],
  "quota:low": ["cabinet", "drift"],
  // The extend can be paid mid-round or during the clear tally, so it has to
  // clear the field music even though it usually arrives in silence.
  "jingle:extend": ["cabinet", "drift"],
  // These belong to screens the music has already left: CHAIN OUT stops the
  // cue on the frame it begins, and the ceremonies never had one.
  chainout: ["cabinet", null],
  tally: ["cabinet", null],
  "jingle:ready": ["cabinet", null],
  "jingle:clear": ["cabinet", null],
  "jingle:allclear": ["cabinet", null],
  "jingle:gameover": ["cabinet", null],
  "bgm:drift:idle": ["bgm", "drift"],
  "bgm:drift:build": ["bgm", "drift"],
  "bgm:drift:hot": ["bgm", "drift"],
  "bgm:drift:danger": ["bgm", "drift"],
  "bgm:entry:hold": ["bgm", "entry"],
  "bgm:entry:hurry": ["bgm", "entry"],
  // Deliberate silences. Each of these is a real moment in the simulation that
  // was considered and left unvoiced, because the field already reads it or
  // because a sound here would be constant noise rather than information.
  "mine:spawn": ["none", null], // continuous drift-in; the field shows it
  "mine:arm:overload": ["none", null], // the alarm covers the whole wave
  "lodestone:capture": ["none", null], // continuous gathering, not an event
  "capacitor:gather": ["none", null], // ditto, and the diamond is drawn
  "mult:milestone": ["none", null], // carried by the detonation pitch ladder
  "player:move": ["none", null],
};

/* The board's sound vocabulary. Steps are `{t, v, w, p, d, g, s}`:
 *   t  frame offset from the emission        v  voice
 *   w  primitive                             p  MIDI pitch (noise: colour)
 *   d  length in frames                      g  peak gain
 *   s  slide in semitones across the note
 * Two steps of one program never occupy one voice at the same time. */
const AUDIO_KIT = {
  // shove: dry high-low trigger snap, shorter than the 10-frame arming fuse
  shove: {
    kind: "sfx",
    steps: [
      { t: 0, v: "p1", w: "p12", p: 78, d: 4, g: 0.34, s: -10 },
      { t: 0, v: "noise", w: "noise", p: 72, d: 3, g: 0.16 },
    ],
  },
  // shove:whiff: one dull logic click, no noise layer and no reward contour
  "shove:whiff": {
    kind: "sfx",
    steps: [{ t: 0, v: "p1", w: "p25", p: 50, d: 3, g: 0.28 }],
  },
  // chain:detonate: noise burst over a falling pulse; the runtime transpose
  // turns a chain into a rising ladder, which is the multiplier made audible
  "chain:detonate": {
    kind: "sfx",
    repeatCap: 3,
    steps: [
      { t: 0, v: "noise", w: "noise", p: 52, d: 9, g: 0.4, s: -18 },
      { t: 0, v: "p2", w: "p50", p: 45, d: 6, g: 0.28, s: -9 },
    ],
  },
  // chain:expire: two falling relay clicks marking the lost multiplier
  "chain:expire": {
    kind: "sfx",
    steps: [
      { t: 0, v: "p2", w: "p25", p: 53, d: 4, g: 0.3, s: -4 },
      { t: 4, v: "p2", w: "p25", p: 46, d: 5, g: 0.24, s: -4 },
    ],
  },
  // scav:eat: low mechanical bite, deliberately behind player feedback
  "scav:eat": {
    kind: "sfx",
    steps: [
      { t: 0, v: "noise", w: "noise", p: 48, d: 4, g: 0.42, s: -6 },
      { t: 2, v: "p2", w: "p12", p: 43, d: 4, g: 0.3 },
    ],
  },
  // scav:burst: bright rising rupture, distinct from an ordinary mine
  "scav:burst": {
    kind: "sfx",
    steps: [
      { t: 0, v: "p2", w: "p12", p: 60, d: 6, g: 0.38, s: 14 },
      { t: 5, v: "noise", w: "noise", p: 66, d: 9, g: 0.36, s: -12 },
    ],
  },
  // capacitor:absorb: long downward glide into a relay closure -- the energy
  // leaving the blast, aimed opposite to the release
  "capacitor:absorb": {
    kind: "sfx",
    steps: [
      { t: 0, v: "p2", w: "p25", p: 74, d: 10, g: 0.36, s: -24 },
      { t: 9, v: "noise", w: "noise", p: 44, d: 3, g: 0.24 },
    ],
  },
  // capacitor:release: the same glide inverted, then the bigger blast
  "capacitor:release": {
    kind: "sfx",
    steps: [
      { t: 0, v: "p2", w: "p25", p: 50, d: 8, g: 0.32, s: 26 },
      { t: 7, v: "noise", w: "noise", p: 56, d: 12, g: 0.44, s: -22 },
    ],
  },
  // quota:low: two rising cabinet blips on bass, the one tone voice its
  // triggering detonation does not occupy. This keeps both onsets immediate.
  "quota:low": {
    kind: "sfx",
    steps: [
      { t: 0, v: "bass", w: "tri", p: 57, d: 4, g: 0.34 },
      { t: 6, v: "bass", w: "tri", p: 64, d: 8, g: 0.36 },
    ],
  },
  // overload:warn: single accelerating pre-alarm tick, transposed up per tick,
  // so the 60-frame fuse under the FIELD LOAD bar is audible before it fires
  "overload:warn": {
    kind: "sfx",
    steps: [
      { t: 0, v: "p2", w: "p12", p: 57, d: 3, g: 0.34 },
      { t: 0, v: "noise", w: "noise", p: 64, d: 2, g: 0.14 },
    ],
  },
  // chainout: an immediate bass lock followed by the latch clunk. The noise
  // waits for the quota-closing detonation's nine-frame burst to finish.
  chainout: {
    kind: "sfx",
    steps: [
      { t: 0, v: "bass", w: "tri", p: 33, d: 12, g: 0.3, s: -2 },
      { t: 9, v: "noise", w: "noise", p: 38, d: 5, g: 0.34, s: -10 },
    ],
  },
  // tally: bright counter tick, repeat-limited under rapid counting
  tally: {
    kind: "sfx",
    repeatCap: 1,
    steps: [{ t: 0, v: "p1", w: "p50", p: 86, d: 2, g: 0.16 }],
  },
  // respawn: three rising blips; the board coming back, opposite in contour to
  // the falling shove so the two can never be confused
  respawn: {
    kind: "sfx",
    steps: [
      { t: 0, v: "p1", w: "p12", p: 55, d: 4, g: 0.3 },
      { t: 5, v: "p1", w: "p12", p: 62, d: 4, g: 0.32 },
      { t: 10, v: "p1", w: "p12", p: 69, d: 7, g: 0.34 },
    ],
  },
  // entry:move: quiet cursor relay
  "entry:move": {
    kind: "sfx",
    steps: [{ t: 0, v: "p1", w: "p25", p: 64, d: 2, g: 0.345 }],
  },
  // entry:confirm: firm high relay closure
  "entry:confirm": {
    kind: "sfx",
    steps: [
      { t: 0, v: "p1", w: "p50", p: 76, d: 2, g: 0.3 },
      { t: 2, v: "p1", w: "p50", p: 83, d: 5, g: 0.3 },
    ],
  },
  // entry:delete: the same relay falling instead of closing
  "entry:delete": {
    kind: "sfx",
    steps: [{ t: 0, v: "p1", w: "p25", p: 56, d: 4, g: 0.3, s: -7 }],
  },
  // miss: noisy low impact under a collapsing bass; loud and low enough to
  // clear the sound field the way the collision clears the mine field
  miss: {
    kind: "sfx",
    steps: [
      { t: 0, v: "noise", w: "noise", p: 46, d: 22, g: 0.5, s: -24 },
      { t: 0, v: "bass", w: "tri", p: 38, d: 20, g: 0.4, s: -12 },
      { t: 8, v: "p2", w: "p12", p: 34, d: 14, g: 0.22, s: -6 },
    ],
  },
  // jingle:overload: descending four-note alarm over a drone; threat, not music
  "jingle:overload": {
    kind: "jingle",
    steps: [
      { t: 0, v: "bass", w: "tri", p: 30, d: 24, g: 0.16 },
      { t: 0, v: "p2", w: "p25", p: 74, d: 5, g: 0.208, s: -2 },
      { t: 5, v: "p2", w: "p25", p: 68, d: 5, g: 0.208, s: -2 },
      { t: 10, v: "p2", w: "p25", p: 62, d: 5, g: 0.208, s: -2 },
      { t: 15, v: "p2", w: "p25", p: 56, d: 8, g: 0.216, s: -3 },
    ],
  },
  // jingle:ready: compact rising board-awake phrase
  "jingle:ready": {
    kind: "jingle",
    steps: [
      { t: 0, v: "bass", w: "tri", p: 36, d: 30, g: 0.11 },
      { t: 0, v: "p1", w: "p50", p: 60, d: 8, g: 0.14 },
      { t: 10, v: "p1", w: "p50", p: 64, d: 8, g: 0.14 },
      { t: 20, v: "p1", w: "p50", p: 67, d: 16, g: 0.145 },
    ],
  },
  // jingle:clear: rising reward phrase that leaves room for the tally ticks
  "jingle:clear": {
    kind: "jingle",
    steps: [
      { t: 0, v: "bass", w: "tri", p: 43, d: 30, g: 0.11 },
      { t: 0, v: "p1", w: "p50", p: 67, d: 8, g: 0.145 },
      { t: 10, v: "p1", w: "p50", p: 71, d: 8, g: 0.145 },
      { t: 20, v: "p1", w: "p50", p: 74, d: 10, g: 0.145 },
      { t: 34, v: "bass", w: "tri", p: 48, d: 22, g: 0.11 },
      { t: 34, v: "p1", w: "p12", p: 79, d: 20, g: 0.164 },
    ],
  },
  // jingle:allclear: a compact four-voice summit. It ends at frame 28, leaving
  // two clean frames before the final life counter begins.
  "jingle:allclear": {
    kind: "jingle",
    steps: [
      { t: 0, v: "noise", w: "noise", p: 62, d: 4, g: 0.14, s: 8 },
      { t: 0, v: "bass", w: "tri", p: 43, d: 28, g: 0.126, s: 5 },
      { t: 0, v: "p1", w: "p12", p: 67, d: 5, g: 0.182 },
      { t: 6, v: "p1", w: "p12", p: 72, d: 5, g: 0.182 },
      { t: 12, v: "p1", w: "p12", p: 76, d: 5, g: 0.189 },
      { t: 18, v: "p1", w: "p12", p: 79, d: 10, g: 0.203 },
      { t: 18, v: "p2", w: "p25", p: 67, d: 10, g: 0.098 },
    ],
  },
  // jingle:extend: unmistakable four-step extra-life fanfare
  "jingle:extend": {
    kind: "jingle",
    steps: [
      { t: 0, v: "p1", w: "p12", p: 72, d: 5, g: 0.4 },
      { t: 6, v: "p1", w: "p12", p: 76, d: 5, g: 0.4 },
      { t: 12, v: "p1", w: "p12", p: 79, d: 5, g: 0.4 },
      { t: 18, v: "p1", w: "p12", p: 84, d: 18, g: 0.44 },
      { t: 18, v: "p2", w: "p25", p: 72, d: 18, g: 0.2 },
    ],
  },
  // jingle:gameover: sparse descending shutdown inside the 1.6 s budget
  "jingle:gameover": {
    kind: "jingle",
    steps: [
      { t: 0, v: "noise", w: "noise", p: 40, d: 20, g: 0.24, s: -18 },
      { t: 0, v: "bass", w: "tri", p: 40, d: 18, g: 0.214, s: -1 },
      { t: 20, v: "bass", w: "tri", p: 36, d: 18, g: 0.202 },
      { t: 40, v: "bass", w: "tri", p: 33, d: 18, g: 0.189 },
      { t: 60, v: "bass", w: "tri", p: 29, d: 18, g: 0.189 },
      { t: 85, v: "p2", w: "p25", p: 26, d: 11, g: 0.164 },
    ],
  },
};

/* ---------------------------------------------------------------- BGM ----
 * Two cues, each a sixteen-step loop, each driven by a gauge already on screen.
 *
 *   drift  the field. Its hook is a descending cell that answers itself, and
 *          its arrangement is chosen by FIELD LOAD -- so the music is a second
 *          readout of the crowd filling up, and the round writes its own score.
 *   entry  the initials screen. The same cell inverted, resolved upward: you
 *          got this far. Its arrangement is chosen by the countdown the screen
 *          is already showing, so the clock is heard as well as read.
 *
 * Everything else keeps its silence: READY, CHAIN OUT, the tally, MISS, GAME
 * OVER, the table and the whole attract cycle. The music stopping is how the
 * player hears control being taken away.
 */
const BGM_LOOP_STEPS = 16;
const BGM_PATTERNS = {
  // E D C A / E D C G -- the second half changes its last note, so the loop is
  // sixteen steps long rather than eight repeated twice.
  bass: [
    40,
    null,
    38,
    null,
    36,
    null,
    33,
    null,
    40,
    null,
    38,
    null,
    36,
    null,
    31,
    null,
  ],
  // A sparse answering figure, mostly rest.
  mid: [
    null,
    null,
    null,
    64,
    null,
    null,
    null,
    67,
    null,
    null,
    null,
    64,
    null,
    null,
    null,
    71,
  ],
  percOff: [
    null,
    null,
    58,
    null,
    null,
    null,
    58,
    null,
    null,
    null,
    58,
    null,
    null,
    null,
    58,
    null,
  ],
  percHot: [
    58,
    null,
    58,
    null,
    58,
    null,
    58,
    null,
    58,
    null,
    58,
    null,
    58,
    null,
    58,
    52,
  ],
  percDrive: [58, 48, 58, 48, 58, 48, 58, 48, 58, 48, 58, 48, 58, 48, 58, 52],
  // The field cell inverted: A C D E / A C D G, rising and landing a fourth
  // higher. Same four notes as the hook, same interval shape, opposite sign.
  entryBass: [
    33,
    null,
    36,
    null,
    38,
    null,
    40,
    null,
    33,
    null,
    36,
    null,
    38,
    null,
    43,
    null,
  ],
  // Wider spacing than the field's answer: this screen is not busy.
  entryMid: [
    null,
    null,
    null,
    null,
    69,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    72,
    null,
    null,
    76,
  ],
  // The clock, once a bar, then every other step when it is nearly out.
  entryTick: [
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    54,
  ],
  entryTickFast: [
    54,
    null,
    null,
    null,
    54,
    null,
    null,
    null,
    54,
    null,
    null,
    null,
    54,
    null,
    54,
    54,
  ],
};
const BGM_LAYERS = {
  // Both bass patterns place a note every second step, so the note has to span
  // two of them to be a bed rather than a pulse. At `sf + 2` the line sounded
  // for a little over half of every bar and the music read as thin against
  // sustained ceremony jingles -- not because it was mixed low, but because it
  // was absent half the time. One frame short of two steps keeps the voice
  // monophonic and the loop seamless.
  bass: {
    v: "bass",
    w: "tri",
    g: 0.16,
    d: (sf) => sf * 2 - 1,
    priority: AUDIO_PRIORITY.bgmBass,
  },
  mid: {
    v: "p2",
    w: "p12",
    g: 0.104,
    d: () => 5,
    priority: AUDIO_PRIORITY.bgmMid,
  },
  // A step short of its own step length: the answer lands on step 15, and a
  // note that outlives the loop it belongs to is a tail, not a phrase.
  entryMid: {
    v: "p2",
    w: "p25",
    g: 0.098,
    d: (sf) => sf - 1,
    priority: AUDIO_PRIORITY.bgmMid,
  },
  perc: {
    v: "noise",
    w: "noise",
    g: 0.104,
    d: () => 2,
    priority: AUDIO_PRIORITY.bgmPerc,
  },
};
/* Arrangements, keyed `cue:section`. `stepFrames` is the whole tempo control;
 * layers arrive rather than the arrangement being swapped out. `urgent` marks
 * an arrangement that may come and go at the next step instead of waiting for
 * a bar line, because it is announcing a deadline. */
const BGM_SECTIONS = {
  "drift:idle": {
    cue: "drift",
    stepFrames: 14,
    gain: 0.85,
    transpose: 0,
    tracks: [["bass", "bass"]],
  },
  "drift:build": {
    cue: "drift",
    stepFrames: 11,
    gain: 1,
    transpose: 0,
    tracks: [
      ["bass", "bass"],
      ["perc", "percOff"],
    ],
  },
  "drift:hot": {
    cue: "drift",
    stepFrames: 9,
    gain: 1,
    transpose: 0,
    tracks: [
      ["bass", "bass"],
      ["perc", "percHot"],
      ["mid", "mid"],
    ],
  },
  "drift:danger": {
    cue: "drift",
    stepFrames: 7,
    gain: 1.05,
    transpose: 5,
    urgent: true,
    tracks: [
      ["bass", "bass"],
      ["perc", "percDrive"],
      ["mid", "mid"],
    ],
  },
  "entry:hold": {
    cue: "entry",
    stepFrames: 13,
    gain: 0.85,
    transpose: 0,
    tracks: [
      ["bass", "entryBass"],
      ["entryMid", "entryMid"],
      ["perc", "entryTick"],
    ],
  },
  "entry:hurry": {
    cue: "entry",
    stepFrames: 9,
    gain: 0.95,
    transpose: 0,
    urgent: true,
    tracks: [
      ["bass", "entryBass"],
      ["entryMid", "entryMid"],
      ["perc", "entryTickFast"],
    ],
  },
};
// Cut from a measured bot-play distribution of the axis, not chosen: over 746
// samples of `play` the load ran 0.28..0.93 with a median of 0.56, so 0.5 and
// 0.7 sit near its 30th and 80th percentiles. A round is seeded at 0.55 of the
// cap, so play opens in `build`, relaxes to `idle` as the field is cleared out
// and tightens to `hot` as it crowds -- all three are reachable states rather
// than one live tier and two dead ones.
const BGM_HOT_LOAD = 0.7;
const BGM_BUILD_LOAD = 0.5;
const BGM_BAR_STEPS = 8;
// Frames left on the initials clock at which the entry cue starts hurrying.
// The screen shows the same countdown in whole seconds; five of them is the
// point where a player who is still deciding needs to be told.
const BGM_ENTRY_HURRY = 300;

// Frames within the 60-frame overload fuse at which the pre-alarm ticks. The
// gaps shorten (16, 12, 10, 8, 6) and each tick is transposed up, so the fuse
// is heard accelerating rather than merely counted.
const OVERLOAD_WARN_FRAMES = [6, 22, 34, 44, 52, 58];

// --------------------------------------------------------------- synth ----

let audioDev = null; // the live device, built on the first press
let audioBlocked = false;
const audioVoices = {
  p1: {
    until: -1,
    priority: -1,
    lastTick: -1,
    gain: null,
    event: null,
    log: null,
  },
  p2: {
    until: -1,
    priority: -1,
    lastTick: -1,
    gain: null,
    event: null,
    log: null,
  },
  bass: {
    until: -1,
    priority: -1,
    lastTick: -1,
    gain: null,
    event: null,
    log: null,
  },
  noise: {
    until: -1,
    priority: -1,
    lastTick: -1,
    gain: null,
    event: null,
    log: null,
  },
};

function midiToFreq(p) {
  return 440 * pow(2, (p - 69) / 12);
}

// A pulse of the given duty as a band-limited PeriodicWave: the harmonic
// amplitudes of a rectangular wave, truncated at 32 partials. Waves belong to
// the context that made them, so the cache lives on the device.
function pulseWave(dev, duty) {
  const key = `p${round2(duty * 100)}`;
  if (dev.waves[key]) return dev.waves[key];
  const n = 32;
  const real = new Float32Array(n + 1);
  const imag = new Float32Array(n + 1);
  for (let i = 1; i <= n; i++) {
    real[i] = (2 / (i * PI)) * sin(i * PI * duty);
  }
  dev.waves[key] = dev.ctx.createPeriodicWave(real, imag, {
    disableNormalization: false,
  });
  return dev.waves[key];
}

// Deterministic noise: one second of a fixed LCG, looped. The same seed every
// run means the noise voice has a stable timbre a probe can compare.
function buildNoiseBuffer(ctx) {
  const len = floor(ctx.sampleRate);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let s = 22695477;
  for (let i = 0; i < len; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    data[i] = s / 0x3fffffff - 1;
  }
  return buf;
}

function softClipCurve() {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2);
  }
  return curve;
}

/* The whole master chain, in one place and identical for the live cabinet and
 * for an offline render: sum -> gain -> DC block -> soft clip -> out, mono. */
function createAudioDevice(ctx) {
  const master = ctx.createGain();
  master.gain.value = AUDIO_PROFILE.master.gain;
  const dc = ctx.createBiquadFilter();
  dc.type = "highpass";
  dc.frequency.value = AUDIO_PROFILE.master.dcBlockHz;
  const clip = ctx.createWaveShaper();
  clip.curve = softClipCurve();
  clip.oversample = "none";
  master.connect(dc);
  dc.connect(clip);
  clip.connect(ctx.destination);
  return { ctx, master, noise: buildNoiseBuffer(ctx), waves: {} };
}

/* Built on the first real input, never at load: an AudioContext created before
 * a gesture is born suspended and the browser complains. Attract mode is
 * silent anyway, so there is nothing to lose by waiting for the first press. */
function audioResume() {
  if (audioBlocked) return;
  if (audioDev == null) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (Ctor == null) {
      audioBlocked = true;
      return;
    }
    try {
      audioDev = createAudioDevice(new Ctor());
    } catch (e) {
      audioBlocked = true;
      audioDev = null;
      return;
    }
  }
  if (audioDev.ctx.state === "suspended") audioDev.ctx.resume();
}

// One note on one voice. Everything above this function speaks in frames,
// pitches and gains; this is where that becomes an oscillator.
function synthNote(dev, n, startAt) {
  const ctx = dev.ctx;
  const dur = min(n.d, AUDIO_PROFILE.noteFramesMax) / 60;
  const peak = clamp(n.g, 0, AUDIO_PROFILE.noteGainMax);
  const g = ctx.createGain();
  g.connect(dev.master);
  let src;
  if (n.w === "noise") {
    src = ctx.createBufferSource();
    src.buffer = dev.noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 0.7;
    const cut = clamp(midiToFreq(n.p) * 6, 180, 14000);
    lp.frequency.setValueAtTime(cut, startAt);
    if (n.s) {
      lp.frequency.linearRampToValueAtTime(
        clamp(midiToFreq(n.p + n.s) * 6, 180, 14000),
        startAt + dur,
      );
    }
    src.connect(lp);
    lp.connect(g);
  } else {
    src = ctx.createOscillator();
    if (n.w === "tri") {
      src.type = "triangle";
    } else {
      src.setPeriodicWave(
        pulseWave(dev, n.w === "p12" ? 0.125 : n.w === "p25" ? 0.25 : 0.5),
      );
    }
    src.frequency.setValueAtTime(midiToFreq(n.p), startAt);
    if (n.s) {
      src.frequency.linearRampToValueAtTime(
        midiToFreq(n.p + n.s),
        startAt + dur,
      );
    }
    src.connect(g);
  }
  const a = AUDIO_PROFILE.attackSec;
  const r = AUDIO_PROFILE.releaseSec;
  g.gain.setValueAtTime(0, startAt);
  g.gain.linearRampToValueAtTime(peak, startAt + a);
  g.gain.linearRampToValueAtTime(peak * 0.55, startAt + max(a, dur * 0.6));
  g.gain.linearRampToValueAtTime(0, startAt + dur + r);
  src.start(startAt);
  src.stop(startAt + dur + r + 0.01);
  return g;
}

// Voice stealing, the PSG way: the note that wins the channel silences the one
// holding it instead of mixing over it.
function silenceVoice(dev, voice, at) {
  const g = voice.gain;
  voice.gain = null;
  if (g == null) return;
  const t = max(at - AUDIO_PROFILE.stealFadeSec, dev.ctx.currentTime);
  if (g.gain.cancelAndHoldAtTime) g.gain.cancelAndHoldAtTime(t);
  else g.gain.cancelScheduledValues(t);
  g.gain.linearRampToValueAtTime(0, t + AUDIO_PROFILE.stealFadeSec);
}

function audioMarkVoiceEnd(voice, endedBy) {
  if (voice.log == null || !voice.log.played || voice.until <= ticks) return;
  voice.log.actualFrames = min(
    voice.log.actualFrames,
    max(0, ticks - voice.log.tick),
  );
  voice.log.endedBy = endedBy;
}

function audioStopBgmVoices() {
  for (const voice of Object.values(audioVoices)) {
    if (voice.event == null || !voice.event.startsWith("bgm:")) continue;
    audioMarkVoiceEnd(voice, "phase");
    if (audioDev != null && voice.gain != null) {
      silenceVoice(
        audioDev,
        voice,
        audioDev.ctx.currentTime + AUDIO_PROFILE.stealFadeSec,
      );
    }
    voice.until = ticks;
    voice.priority = -1;
    voice.event = null;
    voice.log = null;
  }
}

function audioStopBgm() {
  audioStopBgmVoices();
  bgm = null;
}

// ----------------------------------------------------------------- bus ----

function audioEmit(event, opts = {}) {
  const declared = AUDIO_EVENTS[event];
  const role = declared == null ? null : declared[0];
  if (declared == null) {
    audioUnknown.push({ event, tick: ticks });
    if (audioUnknown.length > 20) audioUnknown.shift();
    return;
  }
  if (role === "none") return;
  const program = AUDIO_KIT[event];
  if (!program) return;
  if (opts.demo === true || phase === "attract") return;
  if (audioFrameTick !== ticks) {
    audioFrameTick = ticks;
    audioFrameCounts = {};
  }
  const count = audioFrameCounts[event] || 0;
  if (count >= (program.repeatCap || 1)) return;
  audioFrameCounts[event] = count + 1;
  const transpose = opts.transpose || 0;
  const priority = AUDIO_PRIORITY[role];
  for (const s of program.steps) {
    noteQueue.push({
      t: s.t,
      v: s.v,
      w: s.w,
      p: s.p + transpose,
      d: s.d,
      g: s.g,
      s: s.s || 0,
      event,
      priority,
      seq: noteSeq++,
    });
  }
  audioEventLog.push({ event, tick: ticks });
  if (audioEventLog.length > 80) audioEventLog.shift();
}

// A miss defuses the field; it defuses the sound field with it, so the chain
// the player just lost does not keep chattering over the MISS.
function audioStopQueued() {
  noteQueue = [];
  audioStopBgm();
}

/* `kept` is the arbitration result: the note won its voice. `sounded` is
 * whether it actually reached the hardware, which is a different question --
 * mute, a suspended context and a headless probe all keep arbitration running
 * with nothing coming out, and the gates need to tell those apart. */
function audioLogNote(n, kept, sounded, endedBy = null) {
  const record = {
    tick: ticks,
    event: n.event,
    voice: n.v,
    wave: n.w,
    pitch: n.p,
    frames: n.d,
    gain: +n.g.toFixed(3),
    priority: n.priority,
    played: kept,
    sounded,
    actualFrames: kept ? min(n.d, AUDIO_PROFILE.noteFramesMax) : 0,
    endedBy,
  };
  audioNoteLog.push(record);
  if (audioNoteLog.length > 400) audioNoteLog.shift();
  return record;
}

/* One dispatch per frame for the whole cabinet. Notes that came due this frame
 * -- from programs and from the BGM scheduler alike -- are sorted by priority
 * and handed the four voices in that order. A note that wants a voice held by
 * something more important is dropped, not mixed in: that is the ducking
 * policy, and it is why the music thins out inside a chain instead of the
 * chain thinning out. */
function audioUpdate() {
  const due = [];
  // Test before decrementing: a step at offset 4 must land four frames after
  // the step at offset 0, not three. Both still wait for the next dispatch,
  // because a program is emitted after this function has already run.
  for (let i = noteQueue.length - 1; i >= 0; i--) {
    const n = noteQueue[i];
    if (n.t <= 0) {
      due.push(n);
      noteQueue.splice(i, 1);
    } else {
      n.t--;
    }
  }
  bgmUpdate(due);
  if (due.length === 0) return;
  due.sort((a, b) => b.priority - a.priority || a.seq - b.seq);
  const dev = audioDev;
  const live = dev != null && !audioMuted && dev.ctx.state === "running";
  const startAt = live ? dev.ctx.currentTime + AUDIO_PROFILE.lookaheadSec : 0;
  for (const n of due) {
    const voice = audioVoices[n.v];
    // One start per voice per frame. Notes are handed out highest priority
    // first, so whatever already took this voice this frame outranks anything
    // still waiting -- three detonations in one frame are one note on the
    // board, and the other two are dropped rather than retriggered 0 ms apart.
    const takenThisFrame = voice.lastTick === ticks;
    if (
      takenThisFrame ||
      (voice.until > ticks && voice.priority > n.priority)
    ) {
      audioLogNote(n, false, false, takenThisFrame ? "same-tick" : "priority");
      continue;
    }
    if (voice.until > ticks) audioMarkVoiceEnd(voice, n.event);
    if (live) {
      silenceVoice(dev, voice, startAt);
      voice.gain = synthNote(dev, n, startAt);
    }
    voice.until = ticks + min(n.d, AUDIO_PROFILE.noteFramesMax);
    voice.priority = n.priority;
    voice.lastTick = ticks;
    voice.event = n.event;
    voice.log = audioLogNote(n, true, live);
  }
}

// --------------------------------------------------------- BGM scheduler ----

// The one clamped axis the music reads. `drawHud()` draws the same number, so
// the bar and the arrangement are incapable of disagreeing.
function fieldLoad() {
  const cap = rp ? rp.cap : 1;
  return clamp(inertCount() / max(1, cap), 0, 1);
}

function bgmSectionFor() {
  if (phase === "entry") {
    if (entry == null) return null;
    return entry.timer <= BGM_ENTRY_HURRY ? "entry:hurry" : "entry:hold";
  }
  if (phase !== "play" || rp == null || mines == null) return null;
  // Purple on the field, or a fuse burning towards it, outranks the gauge.
  if (overloadTimer > 0 || hasOverloadThreat()) return "drift:danger";
  const load = fieldLoad();
  if (load >= BGM_HOT_LOAD) return "drift:hot";
  if (load >= BGM_BUILD_LOAD) return "drift:build";
  return "drift:idle";
}

function bgmEmitStep(due) {
  const sec = BGM_SECTIONS[bgm.section];
  bgm.wait = sec.stepFrames;
  for (const [layerName, patternName] of sec.tracks) {
    const pitch = BGM_PATTERNS[patternName][bgm.step];
    if (pitch == null) continue;
    const layer = BGM_LAYERS[layerName];
    due.push({
      t: 0,
      v: layer.v,
      w: layer.w,
      p: pitch + sec.transpose,
      d: layer.d(sec.stepFrames),
      g: min(layer.g * sec.gain, AUDIO_PROFILE.bgmGainMax),
      s: 0,
      event: `bgm:${bgm.section}`,
      priority: layer.priority,
      seq: noteSeq++,
    });
  }
}

function bgmStartSection(section) {
  audioEventLog.push({ event: `bgm:${section}`, tick: ticks });
  if (audioEventLog.length > 80) audioEventLog.shift();
  bgmLog.push({
    tick: ticks,
    cue: BGM_SECTIONS[section].cue,
    section,
    step: bgm.step,
    loops: bgm.loops,
  });
  if (bgmLog.length > 64) bgmLog.shift();
}

/* Arrangement changes land on declared boundaries only: an ordinary tier change
 * waits for the next bar, so the loop keeps its shape, and an `urgent`
 * arrangement -- the overload, the initials clock running out -- is allowed in
 * and out at the next step, because a warning that waits for a bar line is not
 * a warning. Neither ever cuts a step in half. A change of *cue* is not a
 * change of arrangement: the cues live in different phases, so the running one
 * always stops first and the next one starts at step 0 of its own hook. */
function bgmUpdate(due) {
  const want = bgmSectionFor();
  if (want == null) {
    audioStopBgm();
    return;
  }
  if (bgm == null) {
    bgm = { section: want, pending: null, step: 0, wait: 0, loops: 0 };
    bgmStartSection(want);
    bgmEmitStep(due);
    return;
  }
  bgm.pending = want === bgm.section ? null : want;
  bgm.wait--;
  if (bgm.wait > 0) return;
  bgm.step = (bgm.step + 1) % BGM_LOOP_STEPS;
  if (bgm.step === 0) bgm.loops++;
  if (bgm.pending != null) {
    const urgent =
      BGM_SECTIONS[bgm.pending].urgent === true ||
      BGM_SECTIONS[bgm.section].urgent === true;
    if (urgent || bgm.step % BGM_BAR_STEPS === 0) {
      bgm.section = bgm.pending;
      bgm.pending = null;
      bgmStartSection(bgm.section);
    }
  }
  bgmEmitStep(due);
}

// ---------------------------------------------------------- diagnostics ----

/* Renders program or cue data through the same device chain, offline and
 * faster than real time, and returns what came out. A schema check cannot tell
 * a program that plays from one that is silent, inaudibly quiet or clipped;
 * this can, and it is the closest an automated gate gets to listening.
 * Diagnostics only -- nothing in the game calls it. */
function audioRenderNotes(notes, seconds) {
  const Ctor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (Ctor == null) return Promise.resolve(null);
  const rate = 44100;
  const ctx = new Ctor(1, ceil(seconds * rate), rate);
  const dev = createAudioDevice(ctx);
  for (const n of notes) synthNote(dev, n, n.at);
  return ctx.startRendering().then((buf) => {
    const data = buf.getChannelData(0);
    // `sustain` is the loudest window-length slice of the render, zero-padded at
    // both ends. Peak alone cannot rank a 4-frame click against a one-second
    // phrase -- they reach the same sample value and are nowhere near each other
    // to the ear -- so the thing the ear integrates is measured directly.
    const win = round2(AUDIO_PROFILE.sustainWindowSec * rate);
    let peak = 0;
    let sum = 0;
    let run = 0;
    let loudestWin = 0;
    let firstAt = -1;
    let lastAt = -1;
    for (let i = 0; i < data.length; i++) {
      const a = abs(data[i]);
      if (a > peak) peak = a;
      sum += data[i] * data[i];
      run += data[i] * data[i];
      if (i >= win) run -= data[i - win] * data[i - win];
      if (run > loudestWin) loudestWin = run;
      if (a > 0.002) {
        if (firstAt < 0) firstAt = i;
        lastAt = i;
      }
    }
    return {
      peak: +peak.toFixed(4),
      rms: +sqrt(sum / data.length).toFixed(4),
      sustain: +sqrt(loudestWin / win).toFixed(5),
      onsetSec: firstAt < 0 ? -1 : +(firstAt / rate).toFixed(3),
      tailSec: lastAt < 0 ? -1 : +(lastAt / rate).toFixed(3),
    };
  });
}

function audioRenderProgram(id) {
  const p = AUDIO_KIT[id];
  if (p == null) return Promise.resolve(null);
  const notes = p.steps.map((s) => ({ ...s, s: s.s || 0, at: s.t / 60 }));
  const end = max(...p.steps.map((s) => s.t + s.d)) / 60;
  return audioRenderNotes(notes, end + 0.2);
}

function audioRenderBgmSection(name) {
  const sec = BGM_SECTIONS[name];
  if (sec == null) return Promise.resolve(null);
  const notes = [];
  for (let i = 0; i < BGM_LOOP_STEPS; i++) {
    for (const [layerName, patternName] of sec.tracks) {
      const pitch = BGM_PATTERNS[patternName][i];
      if (pitch == null) continue;
      const layer = BGM_LAYERS[layerName];
      notes.push({
        v: layer.v,
        w: layer.w,
        p: pitch + sec.transpose,
        d: layer.d(sec.stepFrames),
        g: min(layer.g * sec.gain, AUDIO_PROFILE.bgmGainMax),
        s: 0,
        at: (i * sec.stepFrames) / 60,
      });
    }
  }
  return audioRenderNotes(notes, (BGM_LOOP_STEPS * sec.stepFrames) / 60 + 0.2);
}

// The manifest is derived from the data above, never maintained beside it, so
// it cannot drift out of sync with what the cabinet actually plays.
function audioManifest() {
  const programs = {};
  const aliases = {};
  const events = [];
  for (const [id, p] of Object.entries(AUDIO_KIT)) {
    programs[id] = {
      id,
      kind: p.kind,
      steps: p.steps.map((s) => ({
        offset: +(s.t / 60).toFixed(5),
        duration: +(s.d / 60).toFixed(5),
        voice: s.v,
      })),
    };
  }
  const bgmCues = {};
  for (const [id, sec] of Object.entries(BGM_SECTIONS)) {
    const steps = [];
    for (let i = 0; i < BGM_LOOP_STEPS; i++) {
      for (const [layerName, patternName] of sec.tracks) {
        if (BGM_PATTERNS[patternName][i] == null) continue;
        const layer = BGM_LAYERS[layerName];
        steps.push({
          offset: +((i * sec.stepFrames) / 60).toFixed(5),
          duration: +(layer.d(sec.stepFrames) / 60).toFixed(5),
          voice: layer.v,
        });
      }
    }
    bgmCues[id] = {
      id,
      durationSeconds: +((BGM_LOOP_STEPS * sec.stepFrames) / 60).toFixed(5),
      loopStartSeconds: 0,
      loopEndSeconds: +((BGM_LOOP_STEPS * sec.stepFrames) / 60).toFixed(5),
      steps,
    };
  }
  for (const [name, [role, heardUnder]] of Object.entries(AUDIO_EVENTS)) {
    const classification =
      role === "none" ? "none" : role === "bgm" ? "bgm" : AUDIO_KIT[name].kind;
    events.push({
      name,
      classification,
      heardUnder: heardUnder || null,
      // A declared silence still carries a priority field, and it is zero: it
      // never competes for a voice because it never asks for one.
      priority:
        role === "none"
          ? 0
          : role === "bgm"
            ? AUDIO_PRIORITY.bgmBass
            : AUDIO_PRIORITY[role],
    });
    if (role === "bgm") {
      aliases[name] = { kind: "cue", id: name.slice("bgm:".length) };
    } else if (role !== "none") {
      aliases[name] = name;
    }
  }
  return {
    version: 1,
    audioMode: "active",
    hardwareProfile: {
      id: AUDIO_PROFILE.id,
      fidelity: AUDIO_PROFILE.fidelity,
      voiceLimit: AUDIO_PROFILE.voices.length,
      primitives: AUDIO_PROFILE.waves.slice(),
      sameTickPolicy: AUDIO_PROFILE.sameTickPolicy,
    },
    budgets: {
      sfxMaxDurationSeconds: +(AUDIO_PROFILE.sfxLastFrame / 60).toFixed(5),
      jingleMaxDurationSeconds: +(AUDIO_PROFILE.jingleLastFrame / 60).toFixed(
        5,
      ),
      maxStepsPerProgram: AUDIO_PROFILE.stepsMax,
      bgmLoopMaxDurationSeconds: +(AUDIO_PROFILE.bgmLoopFramesMax / 60).toFixed(
        5,
      ),
      bgmLoopMaxTailSeconds: 0,
    },
    programs,
    aliases,
    events,
    bgmCues,
  };
}

// =============================================================== /audio ====

function addPoints(v, pos) {
  const p = floor(v);
  gameScore += p;
  pops.push({
    text: `${p}`,
    x: pos.x,
    y: pos.y,
    life: p >= 400 ? 58 : 40,
    hot: p >= 400,
  });
  if (phase !== "attract" && gameScore >= nextExtendAt) {
    grantExtend();
  }
}

function grantExtend() {
  nextExtendAt += EXTEND_INTERVAL;
  if (lives < LIVES_MAX) lives++;
  audioEmit("jingle:extend");
  pops.push({ text: "1UP", x: CX, y: CY - 20, life: 90 });
}

// Real entries only ever live in storage. The factory table is merged in for
// display, so it can never be written back and re-merged into duplicates.
function normalizedScore(e) {
  const reached = Number.isInteger(e.reachedRound)
    ? min(FINAL_ROUND, max(1, e.reachedRound))
    : null;
  const cleared = e.cleared === true;
  return {
    name: e.name,
    score: e.score,
    reachedRound: cleared ? FINAL_ROUND : reached,
    cleared,
    recordedAt: typeof e.recordedAt === "number" ? e.recordedAt : 0,
  };
}

function compareScores(a, b) {
  return (
    b.score - a.score ||
    Number(b.cleared) - Number(a.cleared) ||
    (b.reachedRound || 0) - (a.reachedRound || 0) ||
    (b.recordedAt || 0) - (a.recordedAt || 0)
  );
}

function loadRealScores() {
  let stored = [];
  try {
    // The continuous-round table starts fresh at V2. Older rows cannot state
    // reached round or clear status reliably, so they are deliberately ignored.
    const raw = localStorage.getItem(HISCORE_KEY);
    if (raw) stored = JSON.parse(raw);
  } catch (e) {
    stored = [];
  }
  if (!Array.isArray(stored)) stored = [];
  return stored
    .filter(
      (e) => e && typeof e.score === "number" && typeof e.name === "string",
    )
    .map(normalizedScore)
    .sort(compareScores)
    .slice(0, 5);
}

function mergeForDisplay(real) {
  // Real entries sort before factory entries on a tie, so a player who matches
  // a default displaces it.
  const merged = real
    .map((e) => ({ ...e, real: true }))
    .concat(HISCORE_DEFAULTS.map((e) => ({ ...e, real: false })));
  merged.sort((a, b) => compareScores(a, b) || (a.real ? -1 : 1));
  return merged.slice(0, 5).map(({ real, ...e }) => e);
}

function loadHiScores() {
  realScores = loadRealScores();
  return mergeForDisplay(realScores);
}

function qualifies(s, reachedRound, cleared) {
  if (s <= 0) return false;
  if (hiScores.length < 5) return true;
  const candidate = normalizedScore({
    name: "---",
    score: s,
    reachedRound,
    cleared,
    recordedAt: Date.now(),
  });
  return compareScores(candidate, hiScores[hiScores.length - 1]) <= 0;
}

function saveHiScore(name, s, reachedRound, cleared) {
  realScores.push(
    normalizedScore({
      name,
      score: s,
      reachedRound,
      cleared,
      recordedAt: Date.now(),
    }),
  );
  realScores.sort(compareScores);
  realScores = realScores.slice(0, 5);
  try {
    localStorage.setItem(HISCORE_KEY, JSON.stringify(realScores));
  } catch (e) {
    /* storage disabled: the table still works for this session */
  }
  hiScores = mergeForDisplay(realScores);
}

function displayedHiScoreState() {
  if (phase !== "entry" || !entry) {
    return { scores: hiScores, currentIndex: -1, highlightIndex: 0 };
  }
  const name = entry.chars.join("").padEnd(3, "-");
  const merged = mergeForDisplay(
    realScores.concat({
      ...normalizedScore({
        name,
        score: lastRunScore,
        reachedRound: lastRunRound,
        cleared: lastRunCleared,
        recordedAt: Date.now(),
      }),
      entryPreview: true,
    }),
  );
  const currentIndex = merged.findIndex((e) => e.entryPreview === true);
  return {
    scores: merged.map(({ entryPreview, ...score }) => score),
    currentIndex,
    highlightIndex: currentIndex,
  };
}

function displayedHiScores() {
  return displayedHiScoreState().scores;
}

// ------------------------------------------------------------- world ops ----

function newMine(pos, vel) {
  return {
    pos: vec(pos.x, pos.y),
    vel: vec(vel.x, vel.y),
    armed: false,
    fuse: 0,
    shoverSafe: false,
    // "player" once the chain is traceable back to a shove, "overload" when the
    // field armed itself. Only a player-caused chain carries the multiplier.
    src: null,
  };
}

function spawnMine() {
  const gate = rndi(4);
  let p, a;
  if (gate === 0) {
    p = vec(CX + rnd(-10, 10), FY0);
    a = PI / 2;
  } else if (gate === 1) {
    p = vec(CX + rnd(-10, 10), FY1);
    a = -PI / 2;
  } else if (gate === 2) {
    p = vec(FX0, CY + rnd(-10, 10));
    a = 0;
  } else {
    p = vec(FX1, CY + rnd(-10, 10));
    a = PI;
  }
  a += rnd(-0.7, 0.7);
  mines.push(newMine(p, vec(cos(a) * rp.drift, sin(a) * rp.drift)));
}

// Round-start field. Kept clear of the player spawn so the round never opens
// with a mine already inside shove range of a stationary player.
function seedField(n) {
  for (let i = 0; i < n; i++) {
    let p;
    let tries = 0;
    do {
      p = vec(rnd(FX0 + 8, FX1 - 8), rnd(FY0 + 8, FY1 - 8));
      tries++;
    } while (p.distanceTo(vec(CX, CY)) < 22 && tries < 20);
    const a = rnd(PI * 2);
    mines.push(newMine(p, vec(cos(a) * rp.drift, sin(a) * rp.drift)));
  }
}

function armMine(m, angle, fuse, src) {
  m.armed = true;
  m.fuse = fuse;
  m.src = src;
  m.vel.set(cos(angle) * ARMED_SPEED, sin(angle) * ARMED_SPEED);
  // Every launch carries its own deflection budget, so a mine that has already
  // been bent once cannot be bent indefinitely by the same field. The two fixed
  // actors never share a round, so only one of these is ever spent.
  m.lodeBudget = LODE_ARMED_BUDGET;
  m.capBudget = CAPACITOR_ARMED_BUDGET;
}

function newBlast(pos, src, opts = {}) {
  const r0 = opts.r0 == null ? BLAST_R0 : opts.r0;
  return {
    pos: vec(pos.x, pos.y),
    t: opts.t || 0,
    r: r0,
    r0,
    r1: opts.r1 == null ? BLAST_R1 : opts.r1,
    life: opts.life == null ? BLAST_LIFE : opts.life,
    hit: [],
    src,
    power: opts.power == null ? (src === "player" ? mult : 1) : opts.power,
    shoverSafe: opts.shoverSafe === true,
    // A discharge is one-use ordnance. Without this flag two capacitors could
    // relay the same blast forever on later laps.
    capacitorRelayed: opts.capacitorRelayed === true,
  };
}

function detonate(m) {
  if (m.scavReleaseId != null) {
    const release = scavReleaseLog.find((r) => r.id === m.scavReleaseId);
    if (release) {
      release.detonations.push({
        distance: +m.pos.distanceTo(m.scavReleasePos).toFixed(2),
        frame: ticks - release.frame,
      });
    }
  }
  const owned = m.src === "player";
  blasts.push(
    newBlast(m.pos, m.src, {
      power: owned ? mult : 1,
      // SHOVE reach is 8 px and a blast is 16 px, so the shove point is always
      // inside the shover's own blast. If the mine never got clear of them, its
      // first blast cannot punish them for shoving at all. Everything it arms is
      // a normal, lethal chain link.
      shoverSafe: m.shoverSafe === true,
    }),
  );
  quotaLeft = max(0, quotaLeft - 1);
  // Said once, on the way down, at the same count the HUD glyph starts to
  // flash at. Zero is not announced here: CHAIN OUT and the clear jingle own it.
  if (!quotaLowWarned && quotaLeft > 0 && quotaLeft <= QUOTA_LOW) {
    quotaLowWarned = true;
    audioEmit("quota:low", { demo: phase === "attract" });
  }
  addPoints(MINE_SCORE * (owned ? mult : 1), m.pos);
  audioEmit("chain:detonate", {
    transpose: min(owned ? mult : 1, 20) * 2,
    demo: phase === "attract",
  });
  particle(m.pos, { count: 8, speed: 1.6 });
  if (owned) {
    // The multiplier is the reward for a chain the player authored. A field
    // that ignites itself pays flat, so idling is never a scoring strategy.
    mult = min(mult + 1, MULT_MAX);
    chainTimer = CHAIN_TIME;
    chainPulse = max(chainPulse, min(14, 3 + floor(mult / 3)));
    if (mult === 8 || mult === 16 || mult === 32) chainFlash = 2;
  }
}

function inertCount() {
  if (!mines) return 0;
  let n = 0;
  for (const m of mines) if (!m.armed) n++;
  return n;
}

function densestInert(claimed = new Set()) {
  let best = null;
  let bestN = -1;
  for (const m of mines) {
    if (m.armed || claimed.has(m)) continue;
    let n = 0;
    for (const o of mines) {
      if (o !== m && !o.armed && m.pos.distanceTo(o.pos) < 20) n++;
    }
    if (n > bestN) {
      bestN = n;
      best = m;
    }
  }
  return best;
}

function scavFallback(s) {
  const count = max(1, scavs.length);
  const a = (PI * 2 * s.slot) / count;
  return vec(CX + cos(a) * 22, CY + sin(a) * 22);
}

// ------------------------------------------------------------ simulation ----

function simulate(ctrl) {
  simActive = true;
  stepPlayer(ctrl);
  if (!simActive) return;
  // Once the quota is met, the round is won but not yet safe. Stop adding new
  // material while any already-committed OVERLOAD ordnance plays out; the
  // player must survive that consequence, but the cleanup must stay finite.
  if (quotaLeft > 0) stepSpawner();
  stepLodestones();
  pullCapacitors();
  stepCapacitors();
  stepMines();
  if (!simActive) return;
  stepScavengers();
  if (!simActive) return;
  stepBlasts();
  if (!simActive) return;
  if (quotaLeft > 0) {
    stepOverload();
  } else {
    overloadTimer = 0;
  }
  if (chainTimer > 0) {
    chainTimer--;
    if (chainTimer === 0 && mult > 1) {
      mult = 1;
      audioEmit("chain:expire", { demo: phase === "attract" });
    }
  }
  roundFrames++;
  if (quotaLeft <= 0 && phase === "play" && !hasOverloadThreat()) {
    enterChainOut();
  }
}

function hasPlayerChain() {
  return (
    mines.some((m) => m.armed && m.src === "player") ||
    blasts.some((b) => b.src === "player")
  );
}

function hasOverloadThreat() {
  return (
    mines.some((m) => m.armed && m.src === "overload") ||
    blasts.some((b) => b.src === "overload") ||
    capacitors.some((c) => c.charge > 0 && c.src === "overload")
  );
}

function enterChainOut() {
  // Read the phase before it changes: the attract demo reaches this boundary
  // too, and the bus's own demo gate would already see "chainout" by then.
  const demo = phase === "attract";
  enterPhase("chainout", 0);
  // The controls locking, heard: the BGM stops with the phase and this clunk
  // is what replaces it while the committed chain pays out.
  audioEmit("chainout", { demo });
  chainOutTimer = CHAIN_OUT_MAX;
  chainOutTimedOut = false;
  overloadTimer = 0;
  // Natural play reaches this safety boundary only after field-owned ordnance
  // has resolved. Keep defensive cleanup for probes and malformed injected
  // states: invulnerability must never turn live OVERLOAD into safe scoring.
  for (let i = mines.length - 1; i >= 0; i--) {
    if (mines[i].armed && mines[i].src !== "player") mines.splice(i, 1);
  }
  for (let i = blasts.length - 1; i >= 0; i--) {
    if (blasts[i].src !== "player") blasts.splice(i, 1);
  }
  // Capacitors are autonomous delayed producers, so every stored charge is
  // grounded at the safety boundary. Nothing may wake up and score while the
  // player is input-locked and invulnerable.
  for (const c of capacitors) groundCapacitor(c);
  player.invuln = max(player.invuln, CHAIN_OUT_MAX + 1);
}

function finishChainOut(timedOut) {
  chainOutTimedOut = timedOut === true;
  if (chainOutTimedOut) {
    for (let i = mines.length - 1; i >= 0; i--) {
      if (mines[i].armed) mines.splice(i, 1);
    }
    blasts.length = 0;
  }
  enterClear();
}

function simulateChainOut() {
  simActive = true;
  // No player/input, spawner, scavenger motion/eating, capacitor charge step,
  // or overload step. Inert material is stationary but remains eligible to be
  // claimed by a red blast.
  // The committed chain still obeys the deflection and intake-pull rules it
  // obeyed a frame ago: CHAIN OUT protects the player, it does not change the
  // physics. Only the delayed producer is frozen -- every charge was grounded on
  // entry and `capacitorForBlast()` refuses to store during this phase, so a
  // pulled link simply detonates on the plates.
  // The player is not stepped here, so their velocity is stale; they are in
  // fact stationary, and shover safety reads relative velocity.
  player.vel.set(0, 0);
  stepLodestones(false);
  pullCapacitors(false);
  stepMines(false);
  if (!simActive) return;
  stepBlasts();
  if (!simActive) return;
  if (chainTimer > 0) {
    chainTimer--;
    if (chainTimer === 0 && mult > 1) {
      mult = 1;
      audioEmit("chain:expire");
    }
  }
  chainOutTimer--;
  if (!hasPlayerChain()) finishChainOut(false);
  else if (chainOutTimer <= 0) finishChainOut(true);
}

function stepPlayer(ctrl) {
  if (player.shoveCd > 0) player.shoveCd--;
  if (player.invuln > 0) player.invuln--;
  const dx = ctrl.mx;
  const dy = ctrl.my;
  const len = sqrt(dx * dx + dy * dy);
  const px0 = player.pos.x;
  const py0 = player.pos.y;
  if (len > 0.01) {
    const nx = dx / len;
    const ny = dy / len;
    player.facing.set(nx, ny);
    player.pos.x += nx * PLAYER_SPEED;
    player.pos.y += ny * PLAYER_SPEED;
    player.pos.clamp(
      FX0 + PLAYER_R,
      FX1 - PLAYER_R,
      FY0 + PLAYER_R,
      FY1 - PLAYER_R,
    );
  }
  // Actual displacement, taken after the wall clamp so a player pinned against
  // a border reads as stationary. Shover safety clears on the mine separating
  // from the player, which is a question about relative velocity, not position.
  player.vel.set(player.pos.x - px0, player.pos.y - py0);
  if (ctrl.shove && player.shoveCd <= 0) {
    player.shoveCd = SHOVE_CD;
    doShove();
  }
}

// Single source of truth for "what would SHOVE hit right now", so the on-screen
// marker can never disagree with what the button actually does.
function findShoveTarget() {
  if (!mines || !player) return null;
  const fa = player.facing.angle;
  let best = null;
  let bestD = 1e9;
  for (const m of mines) {
    if (m.armed) continue;
    const d = player.pos.distanceTo(m.pos);
    const offAxis = abs(angleDiff(player.pos.angleTo(m.pos), fa));
    // Keep the broad close-range cone, then add a narrow forward lobe. Walking
    // straight at a mine otherwise crosses the 8 px reach in only a few frames,
    // while widening the whole cone would make diagonal targets too easy to
    // pick up accidentally.
    if (
      d > SHOVE_REACH &&
      (d > SHOVE_FORWARD_REACH || offAxis > SHOVE_FORWARD_ARC)
    ) {
      continue;
    }
    // At point-blank the angle test is meaningless -- one step past the centre
    // flips it by 180 degrees and locks the player out of shoving a mine they
    // are standing on. Inside 4 px, facing alone decides the launch direction.
    if (d > 4 && d <= SHOVE_REACH && offAxis > SHOVE_ARC) continue;
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}

function doShove() {
  const fa = player.facing.angle;
  const best = findShoveTarget();
  if (best) {
    armMine(best, fa, ARM_FUSE, "player");
    best.shoverSafe = true;
    lastShoveFrame = ticks;
    audioEmit("shove", { demo: phase === "attract" });
  } else {
    // A whiff still burns the cooldown: mashing guarantees the button is
    // unavailable at the moment a shove is actually wanted.
    audioEmit("shove:whiff", { demo: phase === "attract" });
  }
}

function stepSpawner() {
  spawnTimer--;
  if (spawnTimer <= 0 && mines.length < MINE_HARD_MAX) {
    spawnMine();
    spawnTimer = rp.spawn;
  }
}

// Which field owns this mine right now, or null. Shared by the simulation and
// the glyph so a drawn spoke can never claim a pull that is not happening.
function nearestLodestone(m) {
  let nearest = null;
  let nearestD = LODE_RADIUS + 0.001;
  for (const l of lodestones) {
    const d = m.pos.distanceTo(l.pos);
    if (d < nearestD) {
      nearest = l;
      nearestD = d;
    }
  }
  return nearest ? { lode: nearest, d: nearestD } : null;
}

// `moveInert` is false during the protected cash-out: gathered material stays
// exactly where it was, but the count is still recomputed so the visible core
// keeps agreeing with what is left on the field while the chain eats it.
function stepLodestones(moveInert = true) {
  for (const l of lodestones) l.active = 0;
  for (const m of mines) {
    // A mine on its fuse is the stationary tell the player is reading to plan
    // an escape. Only material actually moving through the field is deflected.
    if (m.armed && m.fuse > 0) continue;
    if (m.armed && m.lodeBudget <= 0) continue;
    const sel = nearestLodestone(m);
    if (!sel) continue;
    const gap = sel.d - LODE_CORE_RADIUS;
    if (m.armed) {
      // Deflection only, spent from a fixed budget. Nothing here arms, scores
      // or removes anything, so the mine's own `src` still owns the chain.
      const step = min(LODE_PULL_ARMED, m.lodeBudget, max(0, gap));
      if (step > 0) {
        m.pos.addWithAngle(m.pos.angleTo(sel.lode.pos), step);
        m.lodeBudget -= step;
      }
      continue;
    }
    sel.lode.active++;
    if (!moveInert) continue;
    // Damp ordinary drift before applying a fixed inward displacement. Mines
    // settle into a compact core instead of passing through one exact point.
    m.vel.x *= LODE_DRAG;
    m.vel.y *= LODE_DRAG;
    if (gap > 0) {
      m.pos.addWithAngle(m.pos.angleTo(sel.lode.pos), min(LODE_PULL, gap));
    }
  }
}

function groundCapacitor(c) {
  c.charge = 0;
  c.cooldown = 0;
  c.src = null;
  c.power = 1;
  c.pulling = 0;
  c.gathering = 0;
}

// One source of truth for "this diamond is live". A capacitor that is holding a
// charge or recovering from a discharge neither absorbs nor pulls, so the three
// drawn states -- open, charging, recovering -- are the three the rules use.
function intakeOpen(c) {
  return c.charge <= 0 && c.cooldown <= 0;
}

// Loading = holding a charge that is going to gather. Only a player-caused
// charge does, so this is the one predicate both the gather rule and the drawn
// outer boundary read: a boundary can never promise a gather that is not
// coming, and a gather can never happen without its boundary on screen.
function isLoading(c) {
  return c.charge > 0 && c.src === "player";
}

// The nearest capacitor whose open intake covers this mine. Shared by the
// simulation and the glyph so a drawn pull can never claim one that is not
// happening.
function nearestCapacitor(m) {
  let nearest = null;
  let nearestD = CAPACITOR_INTAKE_R + 0.001;
  for (const c of capacitors) {
    if (!intakeOpen(c)) continue;
    const d = m.pos.distanceTo(c.pos);
    if (d < nearestD) {
      nearest = c;
      nearestD = d;
    }
  }
  return nearest ? { cap: nearest, d: nearestD } : null;
}

// The nearest capacitor currently loading a shot that could still reach this
// mine. Gathering is not a standing property of the actor -- it exists only for
// the second between an absorption the player caused and the discharge it
// produces, which is what keeps CAPACITOR from being LODESTONE with extra steps.
function nearestLoadingCapacitor(m) {
  let nearest = null;
  let nearestD = CAPACITOR_GATHER_R + 0.001;
  for (const c of capacitors) {
    // Gathering makes the discharge catch more, so it is a reward mechanism and
    // has to answer the causality question like every other one: only a charge
    // the player authored loads itself. A field-caused absorption still returns
    // its wider blast -- the danger is not conditional -- but it fires into
    // whatever happened to be there. Without this, an idling player is paid for
    // the field's own collapses being concentrated on their behalf, which the
    // balance harness caught as an idle/bot ratio of 0.30 against a 0.01-0.07
    // band.
    if (!isLoading(c)) continue;
    const d = m.pos.distanceTo(c.pos);
    if (d < nearestD) {
      nearest = c;
      nearestD = d;
    }
  }
  return nearest ? { cap: nearest, d: nearestD } : null;
}

// The capacitor's continuous half, in two mutually exclusive modes that match
// the two states it can be in:
//
//   open      - bends live ordnance toward the intake about to swallow it
//   charging  - gathers inert material into the blast it is about to fire
//
// Nothing here arms, scores or removes anything, and gathering relocates
// material without changing its count, so FIELD LOAD and OVERLOAD accounting are
// untouched and every mine's own `src` still owns its chain.
//
// `moveInert` is false during the protected cash-out, mirroring the lodestone.
// Every charge is grounded on entry to `chainout` so nothing should be loading
// there anyway; the parameter makes that an enforced invariant rather than an
// incidental one.
function pullCapacitors(moveInert = true) {
  for (const c of capacitors) {
    c.pulling = 0;
    c.gathering = 0;
  }
  for (const m of mines) {
    if (!m.armed) {
      const sel = nearestLoadingCapacitor(m);
      if (!sel) continue;
      sel.cap.gathering++;
      if (!moveInert) continue;
      // Damp ordinary drift before displacing, so material settles into a knot
      // under the coming blast instead of sailing through the footprint.
      m.vel.x *= CAPACITOR_GATHER_DRAG;
      m.vel.y *= CAPACITOR_GATHER_DRAG;
      const gap = sel.d - CAPACITOR_CORE_R;
      if (gap > 0) {
        m.pos.addWithAngle(
          m.pos.angleTo(sel.cap.pos),
          min(CAPACITOR_GATHER_PULL, gap),
        );
      }
      continue;
    }
    // A mine still on its fuse is the stationary tell the player is reading to
    // plan an escape, exactly as at a lodestone. Only material actually moving
    // through the intake is pulled.
    if (m.fuse > 0) continue;
    if (!(m.capBudget > 0)) continue;
    const sel = nearestCapacitor(m);
    if (!sel) continue;
    // No drag, for the lodestone's reason: damping a link would leave it
    // hanging in the field instead of detonating on the next thing it touches.
    const step = min(
      CAPACITOR_PULL_ARMED,
      m.capBudget,
      max(0, sel.d - CAPACITOR_R),
    );
    if (step <= 0) continue;
    m.pos.addWithAngle(m.pos.angleTo(sel.cap.pos), step);
    m.capBudget -= step;
    sel.cap.pulling++;
  }
}

function stepCapacitors() {
  for (const c of capacitors) {
    if (c.charge <= 0) {
      if (c.cooldown > 0) c.cooldown--;
      continue;
    }
    c.charge--;
    if (c.charge > 0) continue;
    const src = c.src;
    const power = c.power;
    c.releases++;
    c.lastReleaseSrc = src;
    groundCapacitor(c);
    c.cooldown = CAPACITOR_COOLDOWN;
    blasts.push(
      newBlast(c.pos, src, {
        r1: CAPACITOR_BLAST_R1,
        life: CAPACITOR_BLAST_LIFE,
        power,
        capacitorRelayed: true,
      }),
    );
    audioEmit("capacitor:release", { demo: phase === "attract" });
    particle(c.pos, { count: 18, speed: 2 });
  }
}

// The intake takes what *detonates* inside it, not what expands over it. A
// blast born outside the diamond sweeps across the plates harmlessly however
// large it grows; a blast born inside never happens here at all, and comes back
// over the same ground a second later. That is what makes the drawn diamond an
// instruction rather than decoration.
function capacitorForBlast(b) {
  if (phase === "chainout" || b.capacitorRelayed) return null;
  let nearest = null;
  let nearestD = 1e9;
  for (const c of capacitors) {
    if (!intakeOpen(c)) continue;
    const d = b.pos.distanceTo(c.pos);
    if (d <= CAPACITOR_INTAKE_R && d < nearestD) {
      nearest = c;
      nearestD = d;
    }
  }
  return nearest;
}

function chargeCapacitor(c, b) {
  c.charge = CAPACITOR_DELAY;
  c.src = b.src;
  c.power = b.power;
  c.absorptions++;
  // The storage delay is spent from the player's own chain window, and nothing
  // here refreshes it. The first pass set the timer to DELAY + CHAIN_TIME, which
  // made routing a chain through the relay a strict gift -- the one actor that
  // cost nothing to use and nothing to ignore. Now the 60-frame delay eats 60 of
  // the 75-frame window, so a discharge arrives with roughly 15 frames of streak
  // left: the multiplier survives, but only just, and only if the chain was
  // still hot when it went in.
  audioEmit("capacitor:absorb", { demo: phase === "attract" });
  particle(c.pos, { count: 10, speed: 1.1 });
}

// Closing speed of an armed mine on the player, in px/frame along the
// mine->player axis. Positive means the mine is gaining on them. A mine still
// on its fuse already carries the launch velocity `armMine()` gave it, so the
// ten stationary frames read the same as the flight that follows them.
function closingSpeed(m) {
  const dx = player.pos.x - m.pos.x;
  const dy = player.pos.y - m.pos.y;
  const d = sqrt(dx * dx + dy * dy);
  if (d < 0.001) return 0;
  return ((m.vel.x - player.vel.x) * dx + (m.vel.y - player.vel.y) * dy) / d;
}

// `shoverSafe` protects a mine that is *leaving* its shover, and distance alone
// cannot tell that. A point-blank shove with the direction still held launches
// the mine from behind a player who keeps walking: separation passes
// SHOVER_SAFE_DIST while the mine is still stationary on its fuse, the flag
// clears, and the 1.4 px/frame mine then overtakes the 1.05 px/frame player
// from behind (bug #7, second form). The mine must be clear of the player *and*
// moving away before it is allowed to become lethal to them.
function shoverSafeCleared(m) {
  return m.pos.distanceTo(player.pos) > SHOVER_SAFE_DIST && closingSpeed(m) < 0;
}

function stepMines(moveInert = true) {
  const doomed = [];
  for (const m of mines) {
    if (!m.armed) {
      if (!moveInert) continue;
      m.pos.x += m.vel.x;
      m.pos.y += m.vel.y;
      if (m.pos.x < FX0 + MINE_R || m.pos.x > FX1 - MINE_R) m.vel.x *= -1;
      if (m.pos.y < FY0 + MINE_R || m.pos.y > FY1 - MINE_R) m.vel.y *= -1;
      m.pos.clamp(FX0 + MINE_R, FX1 - MINE_R, FY0 + MINE_R, FY1 - MINE_R);
      continue;
    }
    if (m.fuse > 0) {
      m.fuse--;
      if (m.shoverSafe && shoverSafeCleared(m)) m.shoverSafe = false;
      continue;
    }
    m.pos.x += m.vel.x;
    m.pos.y += m.vel.y;
    if (
      m.pos.x <= FX0 + MINE_R ||
      m.pos.x >= FX1 - MINE_R ||
      m.pos.y <= FY0 + MINE_R ||
      m.pos.y >= FY1 - MINE_R
    ) {
      doomed.push(m);
      continue;
    }
    let hitOther = false;
    for (const o of mines) {
      if (o === m || doomed.indexOf(o) >= 0) continue;
      if (o.armed && o.fuse > 0) continue;
      if (m.pos.distanceTo(o.pos) < MINE_R * 2) {
        hitOther = true;
        break;
      }
    }
    if (hitOther) {
      doomed.push(m);
      continue;
    }
    if (m.shoverSafe) {
      // Still leaving the shover: harmless to them, lethal to everything else.
      if (shoverSafeCleared(m)) m.shoverSafe = false;
    } else if (
      player.invuln <= 0 &&
      m.pos.distanceTo(player.pos) < MINE_R + PLAYER_R
    ) {
      doomed.push(m);
      hitPlayer("mine", m);
      break;
    }
  }
  // hitPlayer() defuses the field, which mutates `mines` under this loop.
  // Nothing queued before the miss may still detonate.
  if (!simActive) return;
  for (const m of doomed) {
    const i = mines.indexOf(m);
    if (i >= 0) mines.splice(i, 1);
    detonate(m);
  }
}

function stepScavengers() {
  // A live mine can be claimed by only one scavenger. Claims persist between
  // retarget ticks, so same-frame iteration order cannot collapse the group
  // onto one global densest point.
  const claimed = new Set(
    scavs
      .map((s) => s.targetMine)
      .filter((m) => m && mines.includes(m) && !m.armed),
  );
  for (const s of scavs) {
    if (s.targetMine && (!mines.includes(s.targetMine) || s.targetMine.armed)) {
      claimed.delete(s.targetMine);
      s.targetMine = null;
    }
    s.retarget--;
    if (s.retarget <= 0 || !s.targetMine) {
      claimed.delete(s.targetMine);
      const t = densestInert(claimed);
      s.targetMine = t;
      // With no inert target, patrol a slot-specific anchor around the centre.
      // A shared centre would recreate stacking; holding arbitrary edge
      // positions would let a cleared field park future payloads safely away.
      s.target = t ? vec(t.pos.x, t.pos.y) : scavFallback(s);
      s.retarget = SCAV_RETARGET;
    } else {
      s.target.set(s.targetMine.pos.x, s.targetMine.pos.y);
    }
    if (s.targetMine) claimed.add(s.targetMine);
    if (s.pos.distanceTo(s.target) > 0.5) {
      s.pos.addWithAngle(s.pos.angleTo(s.target), SCAV_SPEED);
    }
    const releaseMargin = scavReleaseRadius(scavEatCap * 2) + MINE_R;
    s.pos.clamp(
      FX0 + releaseMargin,
      FX1 - releaseMargin,
      FY0 + releaseMargin,
      FY1 - releaseMargin,
    );
    if (s.eaten < scavEatCap) {
      const reach = SCAV_SIZE[s.stage - 1] / 2 + MINE_R;
      for (let i = mines.length - 1; i >= 0; i--) {
        const m = mines[i];
        if (m.armed) continue;
        if (s.pos.distanceTo(m.pos) < reach) {
          mines.splice(i, 1);
          if (m === s.targetMine) s.targetMine = null;
          s.eaten++;
          s.stage = min(3, s.stage + 1);
          audioEmit("scav:eat", { demo: phase === "attract" });
          break;
        }
      }
    }
  }
}

function stepBlasts() {
  const detonateNext = [];
  for (let i = blasts.length - 1; i >= 0; i--) {
    const b = blasts[i];
    if (b == null) break; // the array was emptied by a miss earlier this frame
    b.t++;
    b.r = b.r0 + ((b.r1 - b.r0) * b.t) / b.life;
    const capacitor = capacitorForBlast(b);
    if (capacitor) {
      chargeCapacitor(capacitor, b);
      blasts.splice(i, 1);
      continue;
    }
    for (const m of mines) {
      if (b.hit.indexOf(m) >= 0) continue;
      if (b.pos.distanceTo(m.pos) > b.r + MINE_R) continue;
      b.hit.push(m);
      if (m.armed && m.fuse <= 0) {
        if (detonateNext.indexOf(m) < 0) detonateNext.push(m);
      } else {
        let a = b.pos.angleTo(m.pos);
        if (b.pos.distanceTo(m.pos) < 0.001) a = rnd(PI * 2);
        armMine(m, a, CHAIN_FUSE, b.src);
      }
    }
    for (let k = scavs.length - 1; k >= 0; k--) {
      const s = scavs[k];
      if (b.pos.distanceTo(s.pos) > b.r + SCAV_SIZE[s.stage - 1] / 2) continue;
      scavs.splice(k, 1);
      addPoints(SCAV_SCORE * (b.src === "player" ? mult : 1), s.pos);
      audioEmit("scav:burst", { demo: phase === "attract" });
      particle(s.pos, { count: 16, speed: 2 });
      // Everything it swallowed comes back out, armed.
      const n = s.eaten * 2;
      const releaseRadius = scavReleaseRadius(n);
      const release = {
        id: ++scavReleaseSeq,
        round,
        frame: ticks,
        payload: n,
        nearestScav: scavs.length
          ? +min(...scavs.map((o) => s.pos.distanceTo(o.pos))).toFixed(2)
          : null,
        detonations: [],
      };
      scavReleaseLog.push(release);
      if (scavReleaseLog.length > 300) scavReleaseLog.shift();
      for (let j = 0; j < n; j++) {
        const a = (PI * 2 * j) / max(1, n);
        const m = newMine(
          vec(
            s.pos.x + cos(a) * releaseRadius,
            s.pos.y + sin(a) * releaseRadius,
          ),
          vec(0, 0),
        );
        armMine(m, a, CHAIN_FUSE + j, b.src);
        m.scavReleaseId = release.id;
        m.scavReleasePos = vec(s.pos.x, s.pos.y);
        mines.push(m);
        // The blast that killed this scavenger has already spent its effect on
        // the payload. Without this, its next expansion step erases the fuse
        // stagger and re-derives every launch angle.
        b.hit.push(m);
      }
      scavRespawnTimer = 180;
    }
    if (
      player.invuln <= 0 &&
      !b.shoverSafe &&
      b.pos.distanceTo(player.pos) < b.r + PLAYER_R
    ) {
      hitPlayer(b.src === "player" ? "own-blast" : "field-blast", b);
      return;
    }
    if (b.t >= b.life) blasts.splice(i, 1);
  }
  if (!simActive) return;
  for (const m of detonateNext) {
    const i = mines.indexOf(m);
    if (i < 0) continue;
    mines.splice(i, 1);
    detonate(m);
  }
}

function scavReleaseRadius(n) {
  if (n <= 1) return 5;
  // Keep adjacent payload centres strictly outside the 5 px mine-contact
  // threshold as appetite grows.
  return max(5, MINE_R / sin(PI / n) + 0.5);
}

function stepOverload() {
  if (scavRespawnTimer > 0) {
    scavRespawnTimer--;
    if (scavRespawnTimer === 0 && scavs.length < rp.scav) spawnScav();
  }
  if (inertCount() > rp.cap) {
    overloadTimer++;
    // The fuse is drawn under the FIELD LOAD bar; these are the same 60 frames
    // heard, accelerating and rising, so the alarm is never the first warning.
    const warn = OVERLOAD_WARN_FRAMES.indexOf(overloadTimer);
    if (warn >= 0) {
      audioEmit("overload:warn", {
        transpose: warn * 2,
        demo: phase === "attract",
      });
    }
  } else if (overloadTimer > 0) {
    overloadTimer = 0;
  }
  if (overloadTimer >= OVERLOAD_DELAY) {
    overloadTimer = 0;
    let n = 0;
    for (const m of mines) {
      if (m.armed) continue;
      // Staggered fuses turn the overload into a readable cascade rather than
      // a single unavoidable frame.
      armMine(m, rnd(PI * 2), 6 + rndi(28), "overload");
      n++;
    }
    if (n > 0) {
      audioEmit("jingle:overload", { demo: phase === "attract" });
    }
  }
}

function spawnScav() {
  scavs.push({
    pos: vec(rnd(FX0 + 12, FX1 - 12), rnd(FY0 + 12, FY1 - 12)),
    stage: 1,
    eaten: 0,
    retarget: 0,
    target: null,
    targetMine: null,
    slot: scavs.length,
  });
}

function spawnLodestone(slot) {
  const p = LODE_ANCHORS[slot % LODE_ANCHORS.length];
  lodestones.push({ pos: vec(p[0], p[1]), active: 0 });
}

function spawnCapacitor(slot) {
  const p = CAPACITOR_ANCHORS[slot % CAPACITOR_ANCHORS.length];
  capacitors.push({
    pos: vec(p[0], p[1]),
    charge: 0,
    cooldown: 0,
    pulling: 0,
    gathering: 0,
    src: null,
    power: 1,
    absorptions: 0,
    releases: 0,
    lastReleaseSrc: null,
  });
}

// Where this round's fixed actors stand. The second nine-round cycle rotates
// the first anchor, and any extra fields take following anchors in that cycle.
function lodeSlot(r, i) {
  return LODE_SLOT_BY_ROUND[patternRound(r) - 1] + cycleIndex(r) + i;
}

function capacitorSlot(r, i) {
  return CAPACITOR_SLOT_BY_ROUND[patternRound(r) - 1] + cycleIndex(r) + i;
}

function hitPlayer(cause, culprit) {
  if (!simActive || player.invuln > 0) return;
  simActive = false;
  deathEcho =
    culprit == null
      ? null
      : {
          type: cause === "mine" ? "mine" : "blast",
          pos: vec(culprit.pos.x, culprit.pos.y),
          playerPos: vec(player.pos.x, player.pos.y),
          src: culprit.src || "player",
          radius: cause === "mine" ? MINE_R : culprit.r,
        };
  deathLog.push({
    cause: cause || "unknown",
    sinceShove: ticks - lastShoveFrame,
    round,
  });
  if (deathLog.length > 300) deathLog.shift();
  particle(player.pos, { count: 24, speed: 2.2 });
  audioStopQueued();
  audioEmit("miss", { demo: phase === "attract" });
  // Defuse the field: the player is never punished twice for one mistake.
  for (let i = mines.length - 1; i >= 0; i--)
    if (mines[i].armed) mines.splice(i, 1);
  blasts.length = 0;
  for (const c of capacitors) groundCapacitor(c);
  mult = 1;
  chainTimer = 0;
  if (phase === "attract") {
    deathEcho = null;
    player.pos.set(CX, CY);
    player.invuln = RESPAWN_INVULN;
    return;
  }
  lives--;
  if (lives <= 0) {
    enterPhase("gameover", 120);
    lastRunScore = gameScore;
    lastRunRound = round;
    lastRunCleared = false;
  } else {
    enterPhase("death", 45);
  }
}

// ---------------------------------------------------------------- phases ----

function enterPhase(p, t) {
  // Phase ownership is the cue gate. Stop voices here, not one update later,
  // so a scheduled tail cannot leak into a silent screen or another cue.
  if ((phase === "play" || phase === "entry") && p !== phase) audioStopBgm();
  phase = p;
  phaseTimer = t;
  graceTimer = PHASE_GRACE;
}

function startGame() {
  attractSub = null;
  gameScore = 0;
  lives = LIVES_START;
  round = 1;
  lastRunScore = 0;
  lastRunRound = 1;
  lastRunCleared = false;
  lifeBonus = 0;
  lifeBonusPaid = 0;
  entry = null;
  nextExtendAt = EXTEND_FIRST;
  hiScores = loadHiScores();
  initRound();
  enterPhase("ready", 90);
  audioEmit("jingle:ready");
}

function initRound() {
  rp = roundParams(round);
  quotaLeft = rp.quota;
  roundFrames = 0;
  spawnTimer = 20;
  overloadTimer = 0;
  mult = 1;
  chainTimer = 0;
  chainPulse = 0;
  chainFlash = 0;
  chainOutTimer = 0;
  chainOutTimedOut = false;
  quotaLowWarned = false;
  deathEcho = null;
  mines = [];
  blasts = [];
  scavs = [];
  lodestones = [];
  capacitors = [];
  pops = [];
  scavRespawnTimer = 0;
  seedField(floor(rp.cap * SEED_RATIO));
  for (let i = 0; i < rp.scav; i++) spawnScav();
  for (let i = 0; i < rp.lode; i++) spawnLodestone(lodeSlot(round, i));
  for (let i = 0; i < rp.capacitor; i++) {
    spawnCapacitor(capacitorSlot(round, i));
  }
  player = {
    pos: vec(CX, CY),
    vel: vec(0, 0),
    facing: vec(1, 0),
    shoveCd: 0,
    invuln: RESPAWN_INVULN,
  };
}

function enterClear() {
  parBonus = projectedTimeBonus();
  // The authored nine-step reward arc repeats once; using the public round
  // number here would make R10 worth ten times the old R1 and swamp chain play.
  clearBonus = CLEAR_BONUS_PER_ROUND * patternRound(round) * (lives + 1);
  clearRoundPaid = 0;
  clearTimePaid = 0;
  pops = [];
  enterPhase("clear", 210);
  audioEmit("jingle:clear");
}

function creditClearBonus(amount, kind) {
  if (amount <= 0) return;
  gameScore += amount;
  if (kind === "round") clearRoundPaid += amount;
  else clearTimePaid += amount;
  if (gameScore >= nextExtendAt) grantExtend();
  if (ticks % 3 === 0) audioEmit("tally");
}

function updateClearTally() {
  // The complete clear cadence gets 58 frames, then two separate count-up
  // registers. Each is guaranteed to finish inside 45 frames.
  if (phaseTimer <= CLEAR_ROUND_TALLY_AT && clearRoundPaid < clearBonus) {
    const left = clearBonus - clearRoundPaid;
    creditClearBonus(min(left, max(1, ceil(clearBonus / 45))), "round");
  } else if (phaseTimer <= CLEAR_TIME_TALLY_AT && clearTimePaid < parBonus) {
    const left = parBonus - clearTimePaid;
    creditClearBonus(min(left, max(1, ceil(max(1, parBonus) / 45))), "time");
  }
}

function finishClearTally() {
  creditClearBonus(clearBonus - clearRoundPaid, "round");
  creditClearBonus(parBonus - clearTimePaid, "time");
}

function enterAllClear() {
  lifeBonus = lives * LIFE_BONUS_PER_LIFE;
  lifeBonusPaid = 0;
  lastRunRound = FINAL_ROUND;
  lastRunCleared = true;
  enterPhase("allclear", 180);
  audioEmit("jingle:allclear");
}

function creditLifeBonus(amount) {
  if (amount <= 0) return;
  gameScore += amount;
  lifeBonusPaid += amount;
  // The run is already over, so this deliberately does not grant an extend.
  if (ticks % 3 === 0) audioEmit("tally");
}

function updateLifeBonusTally() {
  if (phaseTimer <= 150 && lifeBonusPaid < lifeBonus) {
    const left = lifeBonus - lifeBonusPaid;
    creditLifeBonus(min(left, max(1, ceil(lifeBonus / 45))));
  }
}

function finishLifeBonusTally() {
  creditLifeBonus(lifeBonus - lifeBonusPaid);
  lastRunScore = gameScore;
}

function enterRunResult() {
  if (qualifies(lastRunScore, lastRunRound, lastRunCleared)) {
    entry = {
      chars: [],
      cursor: 0,
      timer: ENTRY_TIMEOUT,
      saved: false,
    };
    enterPhase("entry", 0);
  } else {
    entry = null;
    enterPhase("table", 300);
  }
}

function nextRound() {
  finishClearTally();
  if (round >= FINAL_ROUND) {
    enterAllClear();
    return;
  }
  round++;
  initRound();
  enterPhase("ready", 90);
  audioEmit("jingle:ready");
}

// ----------------------------------------------------------------- input ----

function readKeys() {
  let mx = 0;
  let my = 0;
  if (keyboard.code.ArrowLeft.isPressed || keyboard.code.KeyA.isPressed)
    mx -= 1;
  if (keyboard.code.ArrowRight.isPressed || keyboard.code.KeyD.isPressed)
    mx += 1;
  if (keyboard.code.ArrowUp.isPressed || keyboard.code.KeyW.isPressed) my -= 1;
  if (keyboard.code.ArrowDown.isPressed || keyboard.code.KeyS.isPressed)
    my += 1;
  // Read the action on named keys only: input.isJustPressed is the OR of the
  // pointer and *every* key, so it fires on every movement press.
  const shove =
    keyboard.code.Space.isJustPressed ||
    keyboard.code.KeyZ.isJustPressed ||
    keyboard.code.KeyX.isJustPressed ||
    keyboard.code.KeyJ.isJustPressed ||
    keyboard.code.KeyK.isJustPressed;
  return { mx, my, shove };
}

/* Cursor navigation on ceremony screens reads the same direction synonyms as
 * play, edge-triggered instead of held. A player who moves on WASD has to be
 * able to drive every screen the game puts in front of them. */
function dirPressed() {
  let mx = 0;
  let my = 0;
  if (keyboard.code.ArrowLeft.isJustPressed || keyboard.code.KeyA.isJustPressed)
    mx -= 1;
  if (
    keyboard.code.ArrowRight.isJustPressed ||
    keyboard.code.KeyD.isJustPressed
  )
    mx += 1;
  if (keyboard.code.ArrowUp.isJustPressed || keyboard.code.KeyW.isJustPressed)
    my -= 1;
  if (keyboard.code.ArrowDown.isJustPressed || keyboard.code.KeyS.isJustPressed)
    my += 1;
  return { mx, my };
}

function confirmPressed() {
  return (
    keyboard.code.Space.isJustPressed ||
    keyboard.code.Enter.isJustPressed ||
    keyboard.code.KeyZ.isJustPressed ||
    keyboard.code.KeyX.isJustPressed ||
    keyboard.code.KeyJ.isJustPressed ||
    keyboard.code.KeyK.isJustPressed
  );
}

// ------------------------------------------------------------------- bot ----

/* The attract demo is a scripted autopilot, not a replay. It emits the same
 * {mx, my, shove} control record the keyboard produces, so the demo runs
 * through exactly one movement/shove code path. */
function botControl() {
  const ctrl = { mx: 0, my: 0, shove: false };
  // 1. Flee anything armed or exploding.
  let fx = 0;
  let fy = 0;
  let threat = false;
  for (const m of mines) {
    if (!m.armed) continue;
    const d = player.pos.distanceTo(m.pos);
    if (d > 30) continue;
    threat = true;
    const w = (30 - d) / 30;
    fx += ((player.pos.x - m.pos.x) / max(d, 0.1)) * w;
    fy += ((player.pos.y - m.pos.y) / max(d, 0.1)) * w;
  }
  for (const b of blasts) {
    const d = player.pos.distanceTo(b.pos);
    if (d > 34) continue;
    threat = true;
    const w = (34 - d) / 34;
    fx += ((player.pos.x - b.pos.x) / max(d, 0.1)) * w * 2;
    fy += ((player.pos.y - b.pos.y) / max(d, 0.1)) * w * 2;
  }
  if (threat) {
    // Bias away from walls so fleeing never corners the bot.
    fx += (CX - player.pos.x) / 90;
    fy += (CY - player.pos.y) / 90;
    ctrl.mx = fx;
    ctrl.my = fy;
    bot.mode = "flee";
    return ctrl;
  }
  // 2. Line up on a mine so that shoving it drives it into the pack.
  const cluster = densestInert();
  if (!cluster) {
    ctrl.mx = (CX - player.pos.x) / 40;
    ctrl.my = (CY - player.pos.y) / 40;
    bot.mode = "wait";
    return ctrl;
  }
  let target = null;
  let bestScore = -1e9;
  for (const m of mines) {
    if (m.armed) continue;
    if (m === cluster) continue;
    const toCluster = m.pos.distanceTo(cluster.pos);
    const toPlayer = player.pos.distanceTo(m.pos);
    const s = -toCluster * 1.0 - toPlayer * 0.6;
    if (s > bestScore) {
      bestScore = s;
      target = m;
    }
  }
  if (!target) target = cluster;
  const aimAngle = target.pos.angleTo(cluster.pos);
  // Stand on the far side of the target from the cluster.
  const ax = target.pos.x - cos(aimAngle) * 7;
  const ay = target.pos.y - sin(aimAngle) * 7;
  const dApproach = player.pos.distanceTo(vec(ax, ay));
  if (dApproach > 2.5) {
    ctrl.mx = ax - player.pos.x;
    ctrl.my = ay - player.pos.y;
    bot.mode = "approach";
    return ctrl;
  }
  ctrl.mx = cos(aimAngle);
  ctrl.my = sin(aimAngle);
  // Hold fire until the field is dense enough to chain. This is also the
  // strategy the demo is there to teach.
  const hoard = inertCount() < max(4, ceil(rp.cap * 0.6));
  bot.mode = hoard ? "stalk" : "strike";
  const d = player.pos.distanceTo(target.pos);
  if (
    !hoard &&
    d < SHOVE_REACH - 1 &&
    abs(angleDiff(player.pos.angleTo(target.pos), aimAngle)) <
      SHOVE_ARC * 0.6 &&
    player.shoveCd <= 0
  ) {
    ctrl.shove = true;
  }
  return ctrl;
}

/* Measurement policy (not gameplay): a player who walks straight at the nearest
 * mine, shoves whenever the marker is lit, and never retreats. The attract bot
 * flees too well to measure whether a player's own chain kills them unfairly. */
function naiveControl() {
  const ctrl = { mx: 0, my: 0, shove: false };
  let best = null;
  let bd = 1e9;
  for (const m of mines) {
    if (m.armed) continue;
    const d = player.pos.distanceTo(m.pos);
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  if (!best) {
    ctrl.mx = CX - player.pos.x;
    ctrl.my = CY - player.pos.y;
    return ctrl;
  }
  ctrl.mx = best.pos.x - player.pos.x;
  ctrl.my = best.pos.y - player.pos.y;
  if (player.shoveCd <= 0 && findShoveTarget()) ctrl.shove = true;
  return ctrl;
}

function startAttract() {
  phase = "attract";
  attractSub = "title";
  phaseTimer = 300;
  gameScore = 0;
  lives = LIVES_START;
  round = 1 + rndi(ATTRACT_ROUND_COUNT);
  hiScores = loadHiScores();
  initRound();
  bot = { mode: "wait" };
}

// ---------------------------------------------------------------- drawing ----

function snapPos(p) {
  return vec(round2(p.x), round2(p.y));
}

// Directional cyan interceptor: the silhouette carries facing even if the
// cooldown pip is hidden in a busy chain.
function drawPlayerGlyph(p, facing, bodyColor = "cyan") {
  const q = snapPos(p);
  const fx = facing.x;
  const fy = facing.y;
  const nx = -fy;
  const ny = fx;
  const tip = vec(q.x + fx * 4, q.y + fy * 4);
  const wingA = vec(q.x - fx * 3 + nx * 3, q.y - fy * 3 + ny * 3);
  const wingB = vec(q.x - fx * 3 - nx * 3, q.y - fy * 3 - ny * 3);
  color(bodyColor);
  line(tip, wingA, 2);
  line(tip, wingB, 2);
  line(wingA, wingB, 1);
  box(q, 2);
}

// Four-prong relay mine: unmistakably mechanical, with a compact collision-
// neutral drawing footprint. Armed mines rotate their prongs before launch.
function drawMineGlyph(m, hot, cold) {
  const q = snapPos(m.pos);
  const a = m.armed ? ((floor(ticks / 3) % 2) * PI) / 4 : 0;
  color(hot);
  bar(q, 6, 1, a);
  bar(q, 6, 1, a + PI / 2);
  color(cold);
  box(q, m.armed ? 3 : 2);
}

// Open-jaw collector: its mouth points at the current target, so its role is
// readable from geometry and motion rather than from the HUD.
function drawScavGlyph(s) {
  const q = snapPos(s.pos);
  const size = SCAV_SIZE[s.stage - 1];
  const a = s.target ? s.pos.angleTo(s.target) : 0;
  const fx = cos(a);
  const fy = sin(a);
  const nx = -fy;
  const ny = fx;
  const back = vec(q.x - fx * size * 0.42, q.y - fy * size * 0.42);
  const mouth = vec(q.x + fx * size * 0.42, q.y + fy * size * 0.42);
  color(VISUAL_PALETTE.fieldDanger);
  line(
    vec(back.x + nx * size * 0.42, back.y + ny * size * 0.42),
    vec(back.x - nx * size * 0.42, back.y - ny * size * 0.42),
    2,
  );
  line(
    vec(back.x + nx * size * 0.42, back.y + ny * size * 0.42),
    vec(mouth.x + nx * size * 0.42, mouth.y + ny * size * 0.42),
    2,
  );
  line(
    vec(back.x - nx * size * 0.42, back.y - ny * size * 0.42),
    vec(mouth.x - nx * size * 0.42, mouth.y - ny * size * 0.42),
    2,
  );
  color(VISUAL_PALETTE.fieldDanger);
  box(q, max(2, size - 6));
  // Appetite pips stay readable after the size ramp has topped out:
  // purple is already swallowed, grey is remaining capacity.
  const pipY = q.y + size * 0.5 + 2;
  for (let i = 0; i < SCAV_EAT_CAP; i++) {
    color(i < s.eaten ? VISUAL_PALETTE.fieldDanger : VISUAL_PALETTE.neutral);
    box(q.x - 3 + i * 2, pipY, 1);
  }
}

// Neutral four-pole gravity anchor. Its broken outer ring is the exact pull
// footprint; inward spokes identify the affected mines, and the core swells
// before the cluster becomes crowded. While the field is bending a live chain
// link the ring itself takes that link's hazard colour -- the inside of the
// ring is already full of glyphs, so the readout has to be the footprint.
function drawLodestoneGlyph(l) {
  const q = snapPos(l.pos);
  const dense = min(1, l.active / LODE_DENSE_COUNT);
  const held = (m) => {
    const sel = nearestLodestone(m);
    return sel != null && sel.lode === l;
  };
  const bending = mines.filter(
    (m) => m.armed && m.fuse === 0 && m.lodeBudget > 0 && held(m),
  );
  color(
    bending.some((m) => m.src === "player")
      ? VISUAL_PALETTE.playerDanger
      : bending.length > 0
        ? VISUAL_PALETTE.fieldDanger
        : VISUAL_PALETTE.neutral,
  );
  for (let i = 0; i < 8; i += 2) {
    const a = (PI * i) / 4;
    arc(q, LODE_RADIUS, 1, a, a + PI / 5);
  }
  color(VISUAL_PALETTE.neutral);
  const spoke = (m) => {
    const a = l.pos.angleTo(m.pos);
    const inner = vec(l.pos.x, l.pos.y).addWithAngle(a, LODE_CORE_RADIUS + 3);
    const outer = vec(l.pos.x, l.pos.y).addWithAngle(
      a,
      min(LODE_RADIUS - 2, l.pos.distanceTo(m.pos) - 3),
    );
    if (inner.distanceTo(outer) > 1) line(inner, outer, 1);
  };
  const pulled = mines
    .filter((m) => !m.armed && held(m))
    .sort((a, b) => a.pos.distanceTo(l.pos) - b.pos.distanceTo(l.pos))
    .slice(0, 4);
  for (const m of pulled) spoke(m);
  color(VISUAL_PALETTE.neutral);
  bar(q, 11, 2, PI / 4);
  bar(q, 11, 2, -PI / 4);
  color(VISUAL_PALETTE.structure);
  box(q, 2 + dense * 4);
}

// Fixed relay with two opposed plates. Its broken diamond is one shape carrying
// three rules: the intake that swallows a detonation, the field that draws live
// ordnance into that intake, and the exact footprint the discharge will fill.
// Three states, distinguished by more than presence:
//   open       - neutral outline, empty cells; takes the bent link's hazard
//                colour while it is actually pulling one, exactly as a
//                lodestone ring does
//   charging   - hazard outline, cells filling toward release, blinking late
//   recovering - neutral outline, cells draining in the actor's own structure
//                colour; the intake is shut and nothing can enter it
// Corner `i` of an axis-aligned diamond of the given radius. Both the intake
// footprint and the transient gather boundary are drawn from it, so the two can
// never drift into different shapes.
function vertexOf(q, r, i) {
  return [
    vec(q.x, q.y - r),
    vec(q.x + r, q.y),
    vec(q.x, q.y + r),
    vec(q.x - r, q.y),
  ][i];
}

function drawCapacitorGlyph(c) {
  const q = snapPos(c.pos);
  const charged = c.charge > 0;
  const cooling = !charged && c.cooldown > 0;
  // Same query the simulation pulls with, so a coloured outline can never claim
  // a link that is not being bent.
  const bending = mines.filter((m) => {
    if (!m.armed || m.fuse > 0 || !(m.capBudget > 0)) return false;
    const sel = nearestCapacitor(m);
    return sel != null && sel.cap === c;
  });
  const hazardColor = (
    charged ? c.src === "player" : bending.some((m) => m.src === "player")
  )
    ? VISUAL_PALETTE.playerDanger
    : VISUAL_PALETTE.fieldDanger;
  const warning =
    (charged && (c.charge > 18 || floor(ticks / 3) % 2 === 0)) ||
    bending.length > 0;

  // While loading, an outer diamond marks the exact reach of the gather: every
  // mine inside it will be inside the discharge when it fires. It is neutral
  // grey rather than the hazard colour on purpose -- the threat footprint is the
  // inner diamond, and a red boundary here would overstate where it is lethal by
  // more than half its radius.
  //
  // Only a player-caused charge gathers, so only a player-caused charge draws
  // this. Drawing it for a field-caused charge would put a boundary on screen
  // that promises a gather which is never going to happen -- the exact class of
  // defect this project keeps shipping, with the sign reversed.
  if (isLoading(c)) {
    color(VISUAL_PALETTE.neutral);
    for (let i = 0; i < 4; i++) {
      const a = vertexOf(q, CAPACITOR_GATHER_R, i);
      const b = vertexOf(q, CAPACITOR_GATHER_R, (i + 1) % 4);
      line(a, vec(a.x * 0.86 + b.x * 0.14, a.y * 0.86 + b.y * 0.14), 1);
      line(vec(a.x * 0.14 + b.x * 0.86, a.y * 0.14 + b.y * 0.86), b, 1);
    }
  }

  color(warning ? hazardColor : VISUAL_PALETTE.neutral);
  for (let i = 0; i < 4; i++) {
    const a = vertexOf(q, CAPACITOR_BLAST_R1, i);
    const b = vertexOf(q, CAPACITOR_BLAST_R1, (i + 1) % 4);
    line(a, vec(a.x * 0.72 + b.x * 0.28, a.y * 0.72 + b.y * 0.28), 1);
    line(vec(a.x * 0.28 + b.x * 0.72, a.y * 0.28 + b.y * 0.72), b, 1);
  }

  color(charged ? hazardColor : VISUAL_PALETTE.neutral);
  line(vec(q.x - 6, q.y - 5), vec(q.x - 6, q.y + 5), 2);
  line(vec(q.x + 6, q.y - 5), vec(q.x + 6, q.y + 5), 2);
  color(VISUAL_PALETTE.structure);
  line(vec(q.x - 10, q.y), vec(q.x - 6, q.y), 1);
  line(vec(q.x + 6, q.y), vec(q.x + 10, q.y), 1);

  // Cells fill toward a release and drain back while the intake is shut, so the
  // second of dead time after a discharge is a readout rather than a gap.
  const filled = charged
    ? min(4, floor((4 * (CAPACITOR_DELAY - c.charge)) / CAPACITOR_DELAY) + 1)
    : cooling
      ? min(4, ceil((4 * c.cooldown) / CAPACITOR_COOLDOWN))
      : 0;
  const cellColor = cooling ? VISUAL_PALETTE.structure : hazardColor;
  for (let i = 0; i < 4; i++) {
    color(i < filled ? cellColor : VISUAL_PALETTE.neutral);
    box(q.x - 3 + i * 2, q.y, 1);
  }
}

function drawDeathEcho() {
  if (!deathEcho || (phase !== "death" && phase !== "gameover")) return;
  const owned = deathEcho.src === "player";
  const hazardColor = owned
    ? VISUAL_PALETTE.playerDanger
    : VISUAL_PALETTE.fieldDanger;
  const blink = floor(ticks / 4) % 2 === 0;

  if (deathEcho.type === "mine") {
    drawMineGlyph(
      { pos: deathEcho.pos, armed: true },
      hazardColor,
      hazardColor,
    );
    color(blink ? VISUAL_PALETTE.reward : VISUAL_PALETTE.neutral);
    arc(deathEcho.pos, MINE_R + 5, 1);
    return;
  }

  color(hazardColor);
  arc(deathEcho.pos, deathEcho.radius, 2);
  const distance = deathEcho.pos.distanceTo(deathEcho.playerPos);
  const angle =
    distance > 0.001 ? deathEcho.pos.angleTo(deathEcho.playerPos) : 0;
  const contact = vec(deathEcho.pos.x, deathEcho.pos.y);
  contact.addWithAngle(angle, deathEcho.radius);
  color(blink ? VISUAL_PALETTE.reward : VISUAL_PALETTE.neutral);
  box(contact, 3);
}

function drawField() {
  color(
    chainFlash > 0
      ? "light_yellow"
      : chainPulse > 0
        ? VISUAL_PALETTE.reward
        : VISUAL_PALETTE.structure,
  );
  rect(FX0 - 2, FY0 - 2, FX1 - FX0 + 4, 1);
  rect(FX0 - 2, FY1 + 1, FX1 - FX0 + 4, 1);
  rect(FX0 - 2, FY0 - 2, 1, FY1 - FY0 + 4);
  rect(FX1 + 1, FY0 - 2, 1, FY1 - FY0 + 4);
  if (chainPulse >= 8 && floor(ticks / 2) % 2 === 0) {
    color(VISUAL_PALETTE.reward);
    rect(FX0, FY0, FX1 - FX0, 1);
    rect(FX0, FY1, FX1 - FX0, 1);
  }
  // Gate markers.
  color(VISUAL_PALETTE.structure);
  rect(CX - 10, FY0 - 2, 20, 1);
  rect(CX - 10, FY1 + 1, 20, 1);
  rect(FX0 - 2, CY - 10, 1, 20);
  rect(FX1 + 1, CY - 10, 1, 20);
}

function drawWorld() {
  for (const l of lodestones) {
    drawLodestoneGlyph(l);
  }
  for (const c of capacitors) {
    drawCapacitorGlyph(c);
  }
  for (const s of scavs) {
    drawScavGlyph(s);
  }
  for (const m of mines) {
    if (!m.armed) {
      drawMineGlyph(m, VISUAL_PALETTE.inert, VISUAL_PALETTE.inert);
    } else {
      // Player-owned chains are red and pay the multiplier; a field that armed
      // itself is purple and pays flat, so the two are never confused.
      const owned = m.src === "player";
      const hazardColor = owned
        ? VISUAL_PALETTE.playerDanger
        : VISUAL_PALETTE.fieldDanger;
      if (m.fuse > 0) {
        drawMineGlyph(m, hazardColor, hazardColor);
        // Danger footprint while the fuse burns: this is the circle to leave.
        if (!m.shoverSafe) {
          color(
            floor(ticks / 3) % 2 === 0
              ? VISUAL_PALETTE.playerDanger
              : VISUAL_PALETTE.neutral,
          );
          arc(m.pos, BLAST_R1, 1);
        }
      } else {
        drawMineGlyph(m, hazardColor, hazardColor);
      }
    }
  }
  // SHOVE affordance: mark the mine the button would arm and show where it
  // would fly. Without this the core verb is invisible until it works.
  const tgt = findShoveTarget();
  if (tgt && (phase === "play" || phase === "attract")) {
    const ready = player.shoveCd <= 0;
    color(ready ? VISUAL_PALETTE.reward : VISUAL_PALETTE.neutral);
    arc(tgt.pos, 5.5, 1);
    if (ready) {
      color(VISUAL_PALETTE.reward);
      line(
        vec(tgt.pos.x + player.facing.x * 4, tgt.pos.y + player.facing.y * 4),
        vec(tgt.pos.x + player.facing.x * 13, tgt.pos.y + player.facing.y * 13),
        1,
      );
    }
  }
  for (const b of blasts) {
    color(
      b.src === "player" ? VISUAL_PALETTE.reward : VISUAL_PALETTE.fieldDanger,
    );
    arc(b.pos, b.r, 2);
    if (b.power >= 8 && b.r > 6) {
      const r = min(b.r, 10);
      line(vec(b.pos.x - r, b.pos.y), vec(b.pos.x + r, b.pos.y), 1);
      line(vec(b.pos.x, b.pos.y - r), vec(b.pos.x, b.pos.y + r), 1);
    }
  }
  if (
    phase === "chainout" ||
    player.invuln <= 0 ||
    floor(ticks / 4) % 2 === 0
  ) {
    drawPlayerGlyph(
      player.pos,
      player.facing,
      phase === "chainout" ? "blue" : "cyan",
    );
    // Facing pip doubles as the cooldown light: dim means SHOVE is not ready.
    color(
      phase === "chainout"
        ? VISUAL_PALETTE.neutral
        : player.shoveCd > 0
          ? VISUAL_PALETTE.neutral
          : VISUAL_PALETTE.player,
    );
    box(
      vec(
        player.pos.x + player.facing.x * 5,
        player.pos.y + player.facing.y * 5,
      ),
      3,
    );
  }
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    p.life--;
    p.y -= 0.25;
    color(VISUAL_PALETTE.reward);
    text(p.text, p.x - p.text.length * 2, p.y, { isSmallText: !p.hot });
    if (p.life <= 0) pops.splice(i, 1);
  }
  drawDeathEcho();
}

function pad(n, w) {
  let s = `${n}`;
  while (s.length < w) s = "0" + s;
  return s;
}

function maxTimeBonus() {
  return rp ? floor(rp.quota * PAR_SEC_PER_MINE * PAR_BONUS_PER_SEC) : 0;
}

// The exact amount the clear tally would award if the quota were completed on
// this frame. CHAIN OUT does not advance roundFrames, so this freezes naturally
// while the committed cascade finishes.
function projectedTimeBonus() {
  if (!rp) return 0;
  const parSec = rp.quota * PAR_SEC_PER_MINE;
  const usedSec = roundFrames / 60;
  return floor(max(0, parSec - usedSec) * PAR_BONUS_PER_SEC);
}

// Four or fewer lives read fastest as one cabinet lamp per life. Beyond that,
// repeated lamps become counting work, so the same glyph switches to an exact
// total (■5..■9) instead of an ambiguous overflow such as +1.
function lifeDisplay(lifeCount) {
  const count = max(0, floor(lifeCount));
  return count > LIVES_SHOWN
    ? { mode: "total", icons: 1, label: `${count}` }
    : { mode: "icons", icons: count, label: "" };
}

// The round strip belongs to gameplay screens only; the title, how-to, entry
// and table screens own the whole field area.
function showsRoundHud() {
  return (
    phase === "ready" ||
    phase === "play" ||
    phase === "chainout" ||
    phase === "clear" ||
    phase === "death" ||
    phase === "gameover" ||
    (phase === "attract" && attractSub === "demo")
  );
}

function drawHud() {
  // Initials entry owns the full screen: its NAME/SCORE register would
  // otherwise be overprinted by this global score line.
  if (phase === "entry") return;

  color(VISUAL_PALETTE.player);
  text(pad(floor(gameScore), 7), HUD_LAYOUT.scoreX, HUD_LAYOUT.row1Y);
  const hi = hiScores && hiScores.length ? hiScores[0].score : 0;
  const hs = `HI ${pad(hi, 7)}`;
  color(VISUAL_PALETTE.structure);
  text(hs, VW - 3 - hs.length * 6, HUD_LAYOUT.row1Y);

  // Clear condition, live. A mine glyph plus the remaining count needs no
  // wording: the player watches the same shape they see on the field tick down
  // to zero. It flashes under 6 to sell the last stretch of the round.
  if (showsRoundHud()) {
    const left = max(0, quotaLeft);
    const low = left <= QUOTA_LOW;
    color(
      low && floor(ticks / 6) % 2 === 0
        ? VISUAL_PALETTE.reward
        : VISUAL_PALETTE.structure,
    );
    const quotaPos = vec(HUD_LAYOUT.quotaGlyphX, 5);
    bar(quotaPos, 6, 1, 0);
    bar(quotaPos, 6, 1, PI / 2);
    box(quotaPos, 2);
    color(
      low && floor(ticks / 6) % 2 === 0
        ? VISUAL_PALETTE.reward
        : VISUAL_PALETTE.player,
    );
    text(`${left}`, HUD_LAYOUT.quotaTextX, HUD_LAYOUT.row1Y);
  }

  if (!showsRoundHud()) return;

  // One continuous counter preserves room for the field-load gauge and makes
  // the fixed R18 objective legible without a second progress concept.
  color(VISUAL_PALETTE.structure);
  text(roundLabels(round).hud, 3, HUD_LAYOUT.roundFieldLabelY, {
    isSmallText: true,
  });

  // FIELD LOAD: inert mines vs this round's cap. Overload is a crowding rule,
  // not a timer, so the player needs to watch the crowd fill up.
  const gx = HUD_LAYOUT.fieldGaugeX;
  const gw = HUD_LAYOUT.fieldGaugeW;
  const inert = inertCount();
  const cap = rp ? rp.cap : 1;
  const over = inert > cap;
  // One source of truth: the bar and the BGM arrangement read the same number.
  const load = fieldLoad();
  color(VISUAL_PALETTE.structure);
  text(FIELD_LOAD_LABEL, HUD_LAYOUT.fieldLabelX, HUD_LAYOUT.roundFieldLabelY, {
    isSmallText: true,
  });
  color(VISUAL_PALETTE.neutral);
  rect(gx, 10, gw, 3);
  if (load > 0) {
    color(
      over
        ? floor(ticks / 4) % 2 === 0
          ? "red"
          : VISUAL_PALETTE.neutral
        : load > 0.75
          ? VISUAL_PALETTE.reward
          : VISUAL_PALETTE.structure,
    );
    rect(gx, 10, max(1, gw * load), 3);
  }
  if (over) {
    // Second bar: the 60-frame fuse before the field arms itself.
    color(VISUAL_PALETTE.playerDanger);
    rect(gx, 14, max(1, (gw * overloadTimer) / OVERLOAD_DELAY), 1);
  }

  const ms = `x${mult}`;
  color(mult > 1 ? VISUAL_PALETTE.reward : VISUAL_PALETTE.structure);
  text(ms, HUD_LAYOUT.multRight - ms.length * 4, HUD_LAYOUT.row2Y, {
    isSmallText: true,
  });

  // Projected TIME BONUS shares the second register row with every other
  // persistent value. It never enters or covers the playfield.
  if (phase !== "clear") {
    const bonus = projectedTimeBonus();
    const maximum = maxTimeBonus();
    const ratio = maximum > 0 ? bonus / maximum : 0;
    const low = bonus > 0 && ratio <= 0.2;
    const lit = !low || floor(ticks / 6) % 2 !== 0;
    const label = `T+${bonus}`;
    color(bonus > 0 && lit ? VISUAL_PALETTE.reward : VISUAL_PALETTE.neutral);
    text(label, HUD_LAYOUT.timeRight - label.length * 4, HUD_LAYOUT.row2Y, {
      isSmallText: true,
    });
    color(VISUAL_PALETTE.neutral);
    rect(HUD_LAYOUT.timeGaugeX, 14, HUD_LAYOUT.timeGaugeW, 1);
    if (bonus > 0 && lit) {
      color(VISUAL_PALETTE.reward);
      rect(HUD_LAYOUT.timeGaugeX, 14, max(1, HUD_LAYOUT.timeGaugeW * ratio), 1);
    }
  }

  if (phase !== "attract") {
    const lifeHud = lifeDisplay(lives);
    color(VISUAL_PALETTE.player);
    if (lifeHud.mode === "total") {
      box(vec(HUD_LAYOUT.lifeCountIconX, 11), 3);
      text(lifeHud.label, HUD_LAYOUT.lifeCountTextX, HUD_LAYOUT.row2Y, {
        isSmallText: true,
      });
    } else {
      for (let i = 0; i < lifeHud.icons; i++) {
        box(vec(HUD_LAYOUT.livesRight - i * 6, 11), 3);
      }
    }
  }

  if (overloadTimer > 0 && floor(ticks / 5) % 2 === 0) {
    color(VISUAL_PALETTE.playerDanger);
    centerText("OVERLOAD", 24);
  }
  if (phase === "play" && quotaLeft <= 0 && hasOverloadThreat()) {
    color(VISUAL_PALETTE.fieldDanger);
    centerText("SURVIVE OVERLOAD", 24, true);
  }
}

function centerText(s, y, isSmall) {
  const w = isSmall ? 4 : 6;
  text(s, CX - (s.length * w) / 2, y, { isSmallText: !!isSmall });
}

function drawTitleLogo() {
  // `black` preserves the PNG's own four colors; other character colors would
  // tint the whole image inside crisp-game-lib.
  char(TITLE_LOGO.char, TITLE_LOGO.centerX, TITLE_LOGO.centerY, {
    color: "black",
    isCheckingCollision: false,
  });
}

/* Attract "how to play": a looping diagram of the one thing a new player has to
 * learn — walk up to a mine, press SHOVE, watch it chain. Text alone did not
 * make the verb discoverable. */
function drawHowTo() {
  color(VISUAL_PALETTE.player);
  centerText("HOW TO PLAY", 26);

  const T = 240;
  const t = ticks % T;
  const laneY = 58;
  const cluster = [
    [100, 52],
    [112, 62],
    [123, 54],
  ];

  color(VISUAL_PALETTE.structure);
  if (t < 60) centerText("WALK UP TO A MINE", 84, true);
  else if (t < 95)
    centerText(`PRESS SPACE TO ${PLAYER_ACTION_LABEL} IT`, 84, true);
  else if (t < 150) centerText("IT ARMS AND FLIES", 84, true);
  else centerText("EVERY BLAST ARMS MORE", 84, true);

  for (let i = 0; i < cluster.length; i++) {
    const lit = t >= 152 + i * 10 && t < 205;
    drawMineGlyph(
      { pos: vec(cluster[i][0], cluster[i][1]), armed: lit },
      lit ? VISUAL_PALETTE.playerDanger : VISUAL_PALETTE.inert,
      lit ? VISUAL_PALETTE.playerDanger : VISUAL_PALETTE.inert,
    );
  }
  if (t >= 142 && t < 172) {
    color("yellow");
    arc(vec(98, 56), 3 + (t - 142) * 0.5, 2);
  }
  if (t < 205) {
    const shoved = t >= 95;
    const mx = shoved ? 62 + min((t - 95) * 0.78, 34) : 62;
    drawMineGlyph(
      { pos: vec(mx, laneY), armed: shoved },
      shoved ? VISUAL_PALETTE.playerDanger : VISUAL_PALETTE.inert,
      shoved ? VISUAL_PALETTE.playerDanger : VISUAL_PALETTE.inert,
    );
    if (!shoved && t >= 60 && floor(ticks / 8) % 2 === 0) {
      color("yellow");
      arc(vec(62, laneY), 5.5, 1);
    }
  }

  const px = t < 60 ? 32 + t * 0.37 : 54;
  drawPlayerGlyph(vec(px, laneY), vec(1, 0));
  color(t >= 60 && t < 95 ? VISUAL_PALETTE.reward : VISUAL_PALETTE.player);
  box(vec(px + 5, laneY), 3);
  if (t >= 60 && t < 95 && floor(ticks / 8) % 2 === 0) {
    color("yellow");
    text("SPACE", 38, 40, { isSmallText: true });
  }

  color(VISUAL_PALETTE.reward);
  centerText("CHAIN THEM FOR x2 x3 x4", 98, true);
  color(VISUAL_PALETTE.fieldDanger);
  centerText("YOUR OWN BOMB KILLS YOU", 106, true);
  color(VISUAL_PALETTE.playerDanger);
  centerText("TOP GAUGE FULL = OVERLOAD", 116, true);
}

function drawHiTable(y, rowStep = 7, scores = hiScores, highlightIndex = 0) {
  color("light_black");
  centerText("BEST TENDERS", y, true);
  for (let i = 0; i < scores.length; i++) {
    color(i === highlightIndex ? VISUAL_PALETTE.reward : VISUAL_PALETTE.player);
    const progress = scores[i].cleared
      ? `C${FINAL_ROUND}`
      : scores[i].reachedRound == null
        ? "---"
        : `R${pad(scores[i].reachedRound, 2)}`;
    centerText(
      `${i + 1} ${scores[i].name} ${pad(scores[i].score, 7)} ${progress}`,
      y + 8 + i * rowStep,
      true,
    );
  }
}

// ------------------------------------------------------------------ main ----

function update() {
  if (!ticks) {
    pops = [];
    audioStopQueued();
    hiScores = loadHiScores();
    lastRunScore = 0;
    lastRunRound = 1;
    lastRunCleared = false;
    startAttract();
  }
  // A browser will not start an audio clock without a gesture, and the attract
  // cycle is silent by design, so the first press is exactly the right moment.
  if (input.isJustPressed) audioResume();
  audioUpdate();
  if (chainPulse > 0) chainPulse--;
  if (chainFlash > 0) chainFlash--;
  drawField();

  if (phase === "attract") {
    updateAttract();
  } else if (phase === "ready") {
    phaseTimer--;
    color(VISUAL_PALETTE.structure);
    centerText(roundLabels(round).full, CY - 12);
    color("cyan");
    centerText(rp.name, CY + 2);
    color(VISUAL_PALETTE.reward);
    centerText(`BLOW UP ${rp.quota} MINES`, CY + 18);
    if (rp.lode > 0) {
      color(VISUAL_PALETTE.neutral);
      centerText("LODESTONE CLUSTERS MINES", CY + 30, true);
    }
    if (rp.capacitor > 0) {
      color(VISUAL_PALETTE.neutral);
      centerText("CAPACITOR EATS BLASTS + FIRES BACK", CY + 30, true);
    }
    if (phaseTimer <= 0) enterPhase("play", 0);
  } else if (phase === "play") {
    // autopilot is a measurement hook (extend thresholds, balance runs), not a
    // gameplay path: it feeds the same control record the keyboard produces.
    simulate(
      autopilot === "naive"
        ? naiveControl()
        : autopilot
          ? botControl()
          : readKeys(),
    );
    drawWorld();
    // Control reminder for the opening round only.
    if (phase === "play" && round === 1) {
      color("light_black");
      centerText(
        `${MOVE_KEYS_LABEL} MOVE  SPACE ${PLAYER_ACTION_LABEL}`,
        VH - 14,
        true,
      );
    }
    if (phase === "chainout") {
      color(VISUAL_PALETTE.reward);
      centerText("CHAIN OUT", 26, true);
    }
  } else if (phase === "chainout") {
    simulateChainOut();
    drawWorld();
    if (phase === "chainout") {
      color(VISUAL_PALETTE.reward);
      centerText("CHAIN OUT", 26, true);
    }
  } else if (phase === "clear") {
    phaseTimer--;
    updateClearTally();
    color("yellow");
    centerText("ROUND CLEAR", CY - 16);
    if (phaseTimer < CLEAR_ROUND_TALLY_AT) {
      color(VISUAL_PALETTE.player);
      centerText(`ROUND BONUS  ${clearRoundPaid}`, CY - 2, true);
    }
    if (phaseTimer < CLEAR_TIME_TALLY_AT) {
      color(VISUAL_PALETTE.player);
      centerText(`TIME BONUS   ${clearTimePaid}`, CY + 6, true);
    }
    if (phaseTimer <= 0) nextRound();
  } else if (phase === "allclear") {
    phaseTimer--;
    updateLifeBonusTally();
    color(VISUAL_PALETTE.reward);
    centerText("ALL CLEAR", CY - 16);
    if (phaseTimer < 150) {
      color(VISUAL_PALETTE.player);
      centerText(`LIFE BONUS  ${lifeBonusPaid}`, CY, true);
    }
    if (phaseTimer < 95) {
      color(VISUAL_PALETTE.player);
      centerText(`FINAL SCORE ${pad(floor(gameScore), 7)}`, CY + 10, true);
    }
    if (phaseTimer <= 0) {
      finishLifeBonusTally();
      enterRunResult();
    }
  } else if (phase === "death") {
    drawWorld();
    phaseTimer--;
    color("red");
    centerText("MISS", FY0 + 10);
    if (phaseTimer <= 0) {
      deathEcho = null;
      player.pos.set(CX, CY);
      player.invuln = RESPAWN_INVULN;
      player.shoveCd = 0;
      enterPhase("play", 0);
      audioEmit("respawn");
    }
  } else if (phase === "gameover") {
    drawWorld();
    phaseTimer--;
    if (phaseTimer === GAMEOVER_JINGLE_AT) audioEmit("jingle:gameover");
    color("red");
    centerText("GAME OVER", FY0 + 10);
    if (phaseTimer <= 0) {
      deathEcho = null;
      enterRunResult();
    }
  } else if (phase === "entry") {
    updateEntry();
  } else if (phase === "table") {
    phaseTimer--;
    color(VISUAL_PALETTE.player);
    centerText("CHAIN DRIFT", 24);
    drawHiTable(46);
    color("light_black");
    const result = lastRunCleared
      ? `C${FINAL_ROUND}`
      : `R${pad(lastRunRound, 2)}`;
    centerText(`YOUR SCORE ${pad(lastRunScore, 7)} ${result}`, 112, true);
    if (graceTimer > 0) graceTimer--;
    if (phaseTimer <= 0 || (graceTimer <= 0 && confirmPressed()))
      startAttract();
  }

  drawHud();
}

function updateAttract() {
  phaseTimer--;
  if (attractSub === "title") {
    drawTitleLogo();
    color(VISUAL_PALETTE.structure);
    centerText("THE ONLY THING THAT CAN", 48, true);
    centerText("KILL YOU IS YOUR OWN BOMB", 56, true);
    drawHiTable(70);
    // On 2/3 of the blink cycle, so a glance never misses it.
    if (floor(ticks / 20) % 3 !== 0) {
      color("yellow");
      centerText(START_PROMPT, 116);
    }
    if (phaseTimer <= 0) {
      attractSub = "howto";
      phaseTimer = 480;
    }
  } else if (attractSub === "howto") {
    drawHowTo();
    if (phaseTimer <= 0) {
      attractSub = "demo";
      phaseTimer = 1080;
      round = 1 + rndi(ATTRACT_ROUND_COUNT);
      initRound();
    }
  } else {
    simulate(botControl());
    drawWorld();
    if (floor(ticks / 30) % 2 === 0) {
      color(VISUAL_PALETTE.reward);
      centerText("DEMO PLAY", VH - 24, true);
    }
    if (phaseTimer <= 0 || quotaLeft <= 0) {
      attractSub = "title";
      phaseTimer = 300;
      gameScore = 0;
    }
  }
  color(VISUAL_PALETTE.structure);
  centerText(
    `${MOVE_KEYS_LABEL} MOVE  SPACE ${PLAYER_ACTION_LABEL}`,
    VH - 16,
    true,
  );
  if (input.isJustPressed) startGame();
}

function updateEntry() {
  if (graceTimer > 0) graceTimer--;
  entry.timer--;

  const enteredName = entry.chars.join("").padEnd(3, "-");
  color(VISUAL_PALETTE.player);
  centerText(`NAME ${enteredName}   SCORE ${pad(lastRunScore, 7)}`, 2, true);

  for (let i = 0; i < ENTRY_KEYS.length; i++) {
    const col = i % ENTRY_GRID_COLS;
    const row = floor(i / ENTRY_GRID_COLS);
    const cx = ENTRY_GRID_LEFT + col * ENTRY_GRID_X_STEP;
    const y = ENTRY_GRID_TOP + row * ENTRY_GRID_Y_STEP;
    const key = ENTRY_KEYS[i];
    const selected = i === entry.cursor;
    if (selected) {
      color(VISUAL_PALETTE.player);
      box(vec(cx, y + ENTRY_CURSOR_Y_OFFSET), ENTRY_CURSOR_W, ENTRY_CURSOR_H);
      color("black");
    } else {
      color(
        key === "DEL" || key === "END"
          ? VISUAL_PALETTE.reward
          : VISUAL_PALETTE.structure,
      );
    }
    text(key, cx - key.length * 2, y, { isSmallText: true });
  }

  color("light_black");
  centerText(`${MOVE_KEYS_LABEL} MOVE  SPACE SELECT`, 64, true);
  color(VISUAL_PALETTE.neutral);
  rect(4, 72, 152, 1);
  const ranking = displayedHiScoreState();
  drawHiTable(77, 10, ranking.scores, ranking.highlightIndex);
  color("light_black");
  centerText(`TIME ${ceil(entry.timer / 60)}`, 136, true);

  if (graceTimer <= 0) {
    const dir = dirPressed();
    if (dir.my !== 0) {
      entry.cursor =
        (entry.cursor + dir.my * ENTRY_GRID_COLS + ENTRY_KEYS.length) %
        ENTRY_KEYS.length;
      audioEmit("entry:move");
    }
    if (dir.mx !== 0) {
      const row = floor(entry.cursor / ENTRY_GRID_COLS);
      const col =
        ((entry.cursor % ENTRY_GRID_COLS) + dir.mx + ENTRY_GRID_COLS) %
        ENTRY_GRID_COLS;
      entry.cursor = row * ENTRY_GRID_COLS + col;
      audioEmit("entry:move");
    }
    if (confirmPressed()) {
      const key = ENTRY_KEYS[entry.cursor];
      audioEmit(key === "DEL" ? "entry:delete" : "entry:confirm");
      if (key === "DEL") {
        entry.chars.pop();
      } else if (key === "END") {
        finishEntry();
        return;
      } else if (entry.chars.length < 3) {
        entry.chars.push(key);
      }
    }
  }
  if (entry.timer <= 0) finishEntry();
}

function finishEntry() {
  if (!entry.saved) {
    entry.saved = true;
    const name = entry.chars.join("").padEnd(3, "-");
    if (qualifies(lastRunScore, lastRunRound, lastRunCleared)) {
      saveHiScore(name, lastRunScore, lastRunRound, lastRunCleared);
    }
  }
  enterPhase("table", 300);
}

// -------------------------------------------------------- debug handle -----

/* Deliberate handle for state-injection probes. Keeping phase, round and the
 * resolved round parameters reachable is what makes the rule set verifiable. */
window.CD = {
  state() {
    return {
      phase,
      attractSub,
      round,
      patternRound: patternRound(round),
      cycleIndex: cycleIndex(round),
      finalRound: FINAL_ROUND,
      attractRoundCount: ATTRACT_ROUND_COUNT,
      roundName: rp ? rp.name : null,
      quota: rp ? rp.quota : 0,
      quotaLeft,
      score: gameScore,
      lives,
      mult,
      chainTimer,
      overloadTimer,
      inert: inertCount(),
      armed: mines ? mines.length - inertCount() : 0,
      redArmed: mines
        ? mines.filter((m) => m.armed && m.src === "player").length
        : 0,
      overloadArmed: mines
        ? mines.filter((m) => m.armed && m.src === "overload").length
        : 0,
      mines: mines ? mines.length : 0,
      blasts: blasts ? blasts.length : 0,
      redBlasts: blasts ? blasts.filter((b) => b.src === "player").length : 0,
      overloadBlasts: blasts
        ? blasts.filter((b) => b.src === "overload").length
        : 0,
      scavs: scavs ? scavs.length : 0,
      lodestones: lodestones ? lodestones.length : 0,
      capacitors: capacitors ? capacitors.length : 0,
      chargedCapacitors: capacitors
        ? capacitors.filter((c) => c.charge > 0).length
        : 0,
      overloadChargedCapacitors: capacitors
        ? capacitors.filter((c) => c.charge > 0 && c.src === "overload").length
        : 0,
      coolingCapacitors: capacitors
        ? capacitors.filter((c) => c.charge <= 0 && c.cooldown > 0).length
        : 0,
      pullingCapacitors: capacitors
        ? capacitors.filter((c) => c.pulling > 0).length
        : 0,
      gatheringCapacitors: capacitors
        ? capacitors.filter((c) => c.gathering > 0).length
        : 0,
      loadingCapacitors: capacitors ? capacitors.filter(isLoading).length : 0,
      scavEatCap,
      cap: rp ? rp.cap : 0,
      nextExtendAt,
      botMode: bot ? bot.mode : null,
      hiScores,
      lastRunScore,
      lastRunRound,
      lastRunCleared,
      phaseTimer,
      clearBonus: clearBonus || 0,
      parBonus: parBonus || 0,
      clearRoundPaid: clearRoundPaid || 0,
      clearTimePaid: clearTimePaid || 0,
      lifeBonus: lifeBonus || 0,
      lifeBonusPaid: lifeBonusPaid || 0,
      chainPulse,
      chainFlash,
      chainOutTimer: chainOutTimer || 0,
      chainOutTimedOut: chainOutTimedOut === true,
      waitingForOverload:
        phase === "play" && quotaLeft <= 0 && hasOverloadThreat(),
      roundFrames,
      canShove: phase === "play",
      shoveCd: player ? player.shoveCd : -1,
      playerX: player ? player.pos.x : -1,
      playerY: player ? player.pos.y : -1,
      invuln: player ? player.invuln : -1,
      timeBonusNow: projectedTimeBonus(),
      timeBonusMax: maxTimeBonus(),
      deathEcho: deathEcho
        ? {
            type: deathEcho.type,
            x: +deathEcho.pos.x.toFixed(1),
            y: +deathEcho.pos.y.toFixed(1),
            playerX: +deathEcho.playerPos.x.toFixed(1),
            playerY: +deathEcho.playerPos.y.toFixed(1),
            src: deathEcho.src,
            radius: +deathEcho.radius.toFixed(1),
          }
        : null,
      entry: entry
        ? {
            name: entry.chars.join("").padEnd(3, "-"),
            length: entry.chars.length,
            cursor: entry.cursor,
            selected: ENTRY_KEYS[entry.cursor],
          }
        : null,
    };
  },
  params: (r) => roundParams(r),
  roundLabels: (r) => roundLabels(r),
  lifeDisplay: (n) => ({ ...lifeDisplay(n) }),
  displayedHiScores: () => displayedHiScores().map((e) => ({ ...e })),
  displayedHiScoreState: () => {
    const ranking = displayedHiScoreState();
    return {
      scores: ranking.scores.map((e) => ({ ...e })),
      currentIndex: ranking.currentIndex,
      highlightIndex: ranking.highlightIndex,
    };
  },
  visualContract() {
    return {
      palette: { ...VISUAL_PALETTE },
      hud: { ...HUD_LAYOUT },
      livesShown: LIVES_SHOWN,
      persistentLightException: VISUAL_PALETTE.neutral,
      transientLightAccent: "light_yellow",
      entryGrid: {
        columns: ENTRY_GRID_COLS,
        rows: ENTRY_GRID_ROWS,
        keys: ENTRY_KEYS.slice(),
        firstCenterX: ENTRY_GRID_LEFT,
        lastCenterX:
          ENTRY_GRID_LEFT + (ENTRY_GRID_COLS - 1) * ENTRY_GRID_X_STEP,
        topTextY: ENTRY_GRID_TOP,
        bottomTextY: ENTRY_GRID_TOP + (ENTRY_GRID_ROWS - 1) * ENTRY_GRID_Y_STEP,
        cursorWidth: ENTRY_CURSOR_W,
        cursorHeight: ENTRY_CURSOR_H,
        cursorCenterYOffset: ENTRY_CURSOR_Y_OFFSET,
        frame: {
          left: FX0 - 2,
          right: FX1 + 1,
          top: FY0 - 2,
        },
      },
      entryTimeoutFrames: ENTRY_TIMEOUT,
      copy: {
        playerAction: PLAYER_ACTION_LABEL,
        startPrompt: START_PROMPT,
        fieldLoadLabel: FIELD_LOAD_LABEL,
      },
      capacitor: {
        radius: CAPACITOR_R,
        delay: CAPACITOR_DELAY,
        blastRadius: CAPACITOR_BLAST_R1,
        blastLife: CAPACITOR_BLAST_LIFE,
        // The drawn diamond is all three of these at once: the intake that
        // swallows a detonation, the field that pulls live ordnance into it, and
        // the footprint the discharge fills.
        intakeRadius: CAPACITOR_INTAKE_R,
        pullArmed: CAPACITOR_PULL_ARMED,
        armedBudget: CAPACITOR_ARMED_BUDGET,
        cooldown: CAPACITOR_COOLDOWN,
        gatherRadius: CAPACITOR_GATHER_R,
        gatherPull: CAPACITOR_GATHER_PULL,
        coreRadius: CAPACITOR_CORE_R,
      },
      titleLogo: {
        src: TITLE_LOGO_SRC,
        char: TITLE_LOGO.char,
        width: TITLE_LOGO.width,
        height: TITLE_LOGO.height,
        centerX: TITLE_LOGO.centerX,
        centerY: TITLE_LOGO.centerY,
        opaqueColors: 4,
      },
    };
  },
  audioKit() {
    const out = {};
    for (const [id, p] of Object.entries(AUDIO_KIT)) {
      out[id] = {
        kind: p.kind,
        role: AUDIO_EVENTS[id] ? AUDIO_EVENTS[id][0] : null,
        heardUnder: AUDIO_EVENTS[id] ? AUDIO_EVENTS[id][1] || null : null,
        repeatCap: p.repeatCap || 1,
        steps: p.steps.length,
        lastFrame: max(...p.steps.map((s) => s.t)),
        endFrame: max(...p.steps.map((s) => s.t + s.d)),
        maxGain: +max(...p.steps.map((s) => s.g)).toFixed(3),
        voices: [...new Set(p.steps.map((s) => s.v))].sort(),
        waves: [...new Set(p.steps.map((s) => s.w))].sort(),
        // Frame intervals per voice, so a probe can prove one program never
        // asks a monophonic voice for two notes at once.
        spans: p.steps.map((s) => [s.v, s.t, s.t + s.d]),
      };
    }
    return out;
  },
  audioProfile() {
    return JSON.parse(JSON.stringify(AUDIO_PROFILE));
  },
  audioEventRegistry() {
    const out = {};
    for (const [name, [role, heardUnder]] of Object.entries(AUDIO_EVENTS)) {
      out[name] = { role, heardUnder: heardUnder || null };
    }
    return out;
  },
  audioPriorities() {
    return { ...AUDIO_PRIORITY };
  },
  audioManifest,
  audioEvents() {
    return audioEventLog.slice();
  },
  audioNotes() {
    return audioNoteLog.slice();
  },
  audioUnknown() {
    return audioUnknown.slice();
  },
  audioClear() {
    audioEventLog = [];
    audioNoteLog = [];
    audioUnknown = [];
    bgmLog = [];
  },
  audioBgm() {
    return {
      running: bgm != null,
      cue: bgm == null ? null : BGM_SECTIONS[bgm.section].cue,
      section: bgm == null ? null : bgm.section,
      step: bgm == null ? -1 : bgm.step,
      loops: bgm == null ? 0 : bgm.loops,
      pending: bgm == null ? null : bgm.pending,
      stepFrames: bgm == null ? 0 : BGM_SECTIONS[bgm.section].stepFrames,
      load: +fieldLoad().toFixed(3),
      log: bgmLog.slice(),
    };
  },
  audioBgmCue() {
    const sections = {};
    for (const [name, sec] of Object.entries(BGM_SECTIONS)) {
      sections[name] = {
        cue: sec.cue,
        stepFrames: sec.stepFrames,
        transpose: sec.transpose,
        urgent: sec.urgent === true,
        loopFrames: sec.stepFrames * BGM_LOOP_STEPS,
        layers: sec.tracks.map(([layer]) => layer),
        voices: sec.tracks.map(([layer]) => BGM_LAYERS[layer].v),
        maxGain: +max(
          ...sec.tracks.map(([layer]) =>
            min(BGM_LAYERS[layer].g * sec.gain, AUDIO_PROFILE.bgmGainMax),
          ),
        ).toFixed(3),
        notesPerLoop: sec.tracks.reduce(
          (n, [, pattern]) =>
            n + BGM_PATTERNS[pattern].filter((p) => p != null).length,
          0,
        ),
        // Longest note end within the loop, for the zero-tail assertion.
        lastNoteEndFrame: max(
          ...sec.tracks.map(([layer, pattern]) => {
            const last = BGM_PATTERNS[pattern].reduce(
              (acc, p, i) => (p == null ? acc : i),
              0,
            );
            return last * sec.stepFrames + BGM_LAYERS[layer].d(sec.stepFrames);
          }),
        ),
      };
    }
    return {
      loopSteps: BGM_LOOP_STEPS,
      barSteps: BGM_BAR_STEPS,
      cues: [...new Set(Object.values(BGM_SECTIONS).map((s) => s.cue))],
      buildLoad: BGM_BUILD_LOAD,
      hotLoad: BGM_HOT_LOAD,
      entryHurryFrames: BGM_ENTRY_HURRY,
      sections,
    };
  },
  audioRender: audioRenderProgram,
  audioRenderBgm: audioRenderBgmSection,
  audioRuntime() {
    return {
      contextCreated: audioDev != null,
      state: audioDev == null ? "none" : audioDev.ctx.state,
      blocked: audioBlocked,
      muted: audioMuted,
      pending: noteQueue.length,
      libraryAudio: options.isSoundEnabled === true,
    };
  },
  setAudioMuted(v) {
    audioMuted = !!v;
  },
  audioEmit(event, opts) {
    audioEmit(event, opts || {});
  },
  setAutopilot(v) {
    autopilot = v === "naive" ? "naive" : !!v;
  },
  startGame,
  startAttract,
  setPhase(p, t) {
    // Initials entry is the one phase with a state object behind it. A probe
    // that jumps straight to it used to crash update() on the next frame.
    if (p === "entry" && entry == null) {
      entry = { chars: [], cursor: 0, timer: ENTRY_TIMEOUT, saved: false };
    }
    enterPhase(p, t == null ? 60 : t);
  },
  setPhaseTimer(v) {
    phaseTimer = v;
  },
  setEntryTimer(v) {
    if (entry != null) entry.timer = v;
  },
  setAttractSub(sub, t) {
    phase = "attract";
    attractSub = sub;
    phaseTimer = t == null ? 60 : t;
    if (sub === "demo") {
      round = 1;
      initRound();
    }
  },
  setRound(r) {
    round = min(FINAL_ROUND, max(1, floor(r)));
    initRound();
  },
  setScore(v) {
    gameScore = v;
  },
  setLives(v) {
    lives = v;
  },
  setNextExtend(v) {
    nextExtendAt = v;
  },
  setQuotaLeft(v) {
    quotaLeft = v;
  },
  setRoundFrames(v) {
    roundFrames = v;
  },
  enterClearAt(roundFrameCount) {
    roundFrames = roundFrameCount;
    enterClear();
  },
  beginChainOutAt(roundFrameCount) {
    roundFrames = roundFrameCount;
    quotaLeft = 0;
    enterChainOut();
  },
  setChainOutTimer(v) {
    chainOutTimer = v;
  },
  setOverloadTimer(v) {
    overloadTimer = v;
  },
  clearMines() {
    mines.length = 0;
    blasts.length = 0;
  },
  parkSpawner() {
    rp.spawn = 99999;
    spawnTimer = 99999;
  },
  setSpawner(interval, timer) {
    rp.spawn = interval;
    spawnTimer = timer;
  },
  setCap(v) {
    rp.cap = v;
  },
  setScavEatCap(v) {
    scavEatCap = max(1, floor(v));
  },
  setMult(v) {
    mult = v;
  },
  setChainTimer(v) {
    chainTimer = v;
  },
  addArmed(x, y, angle, src, fuse, shoverSafe = false) {
    const m = newMine(vec(x, y), vec(0, 0));
    armMine(m, angle, fuse == null ? 0 : fuse, src);
    m.shoverSafe = shoverSafe === true;
    mines.push(m);
    return m;
  },
  addBlast(x, y, src, age) {
    const t = age || 0;
    const b = newBlast(vec(x, y), src, { t });
    b.r = b.r0 + ((b.r1 - b.r0) * t) / b.life;
    blasts.push(b);
    return b;
  },
  mineSrcs() {
    return mines.map((m) => (m.armed ? m.src || "none" : "inert"));
  },
  deaths() {
    return deathLog.slice();
  },
  scavReleases() {
    return scavReleaseLog.map((r) => ({
      ...r,
      detonations: r.detonations.map((d) => ({ ...d })),
    }));
  },
  clearScavReleases() {
    scavReleaseLog = [];
  },
  clearScavs() {
    scavs.length = 0;
  },
  clearLodestones() {
    lodestones.length = 0;
  },
  clearCapacitors() {
    capacitors.length = 0;
  },
  addLodestone(x, y) {
    lodestones.push({ pos: vec(x, y), active: 0 });
  },
  pullLodestonesOnce(moveInert = true) {
    stepLodestones(moveInert);
  },
  lodestoneList() {
    return lodestones.map((l) => ({
      x: +l.pos.x.toFixed(2),
      y: +l.pos.y.toFixed(2),
      active: l.active,
    }));
  },
  addCapacitor(x, y) {
    capacitors.push({
      pos: vec(x, y),
      charge: 0,
      cooldown: 0,
      pulling: 0,
      gathering: 0,
      src: null,
      power: 1,
      absorptions: 0,
      releases: 0,
      lastReleaseSrc: null,
    });
  },
  stepCapacitorsOnce() {
    stepCapacitors();
  },
  pullCapacitorsOnce(moveInert = true) {
    pullCapacitors(moveInert);
  },
  stepBlastsOnce() {
    simActive = true;
    stepBlasts();
  },
  capacitorList() {
    return capacitors.map((c) => ({
      x: +c.pos.x.toFixed(2),
      y: +c.pos.y.toFixed(2),
      charge: c.charge,
      cooldown: c.cooldown,
      intakeOpen: intakeOpen(c),
      loading: isLoading(c),
      pulling: c.pulling,
      gathering: c.gathering,
      src: c.src,
      absorptions: c.absorptions,
      releases: c.releases,
      lastReleaseSrc: c.lastReleaseSrc,
    }));
  },
  addScav(x, y, eaten = 0) {
    scavs.push({
      pos: vec(x, y),
      stage: min(3, eaten + 1),
      eaten,
      retarget: 99999,
      target: vec(x, y),
      targetMine: null,
      slot: scavs.length,
    });
  },
  scavList() {
    return scavs.map((s) => ({
      x: +s.pos.x.toFixed(1),
      y: +s.pos.y.toFixed(1),
      stage: s.stage,
      eaten: s.eaten,
      targetX: s.target ? +s.target.x.toFixed(1) : null,
      targetY: s.target ? +s.target.y.toFixed(1) : null,
    }));
  },
  clearDeaths() {
    deathLog = [];
  },
  mineList() {
    return mines.map((m) => ({
      x: +m.pos.x.toFixed(2),
      y: +m.pos.y.toFixed(2),
      armed: m.armed,
      fuse: m.fuse,
      src: m.src,
      safe: m.shoverSafe,
      lodeBudget: m.lodeBudget == null ? null : +m.lodeBudget.toFixed(2),
      capBudget: m.capBudget == null ? null : +m.capBudget.toFixed(2),
      d: +m.pos.distanceTo(player.pos).toFixed(1),
      // Positive = gaining on the player. Shover safety clears only once this
      // is negative and the mine is past SHOVER_SAFE_DIST.
      closing: m.armed ? +closingSpeed(m).toFixed(2) : null,
    }));
  },
  blastList() {
    return blasts.map((b) => ({
      x: +b.pos.x.toFixed(1),
      y: +b.pos.y.toFixed(1),
      r: +b.r.toFixed(1),
      r1: b.r1,
      life: b.life,
      src: b.src,
      capacitorRelayed: b.capacitorRelayed,
      d: +b.pos.distanceTo(player.pos).toFixed(1),
    }));
  },
  // What the on-screen SHOVE marker is pointing at, straight from the same
  // function the button uses.
  shoveTarget() {
    const t = findShoveTarget();
    return t ? { x: t.pos.x, y: t.pos.y } : null;
  },
  face(x, y) {
    const l = Math.sqrt(x * x + y * y) || 1;
    player.facing.set(x / l, y / l);
  },
  storage() {
    try {
      return localStorage.getItem(HISCORE_KEY);
    } catch (e) {
      return null;
    }
  },
  seedStorage(list) {
    try {
      localStorage.setItem(HISCORE_KEY, JSON.stringify(list));
    } catch (e) {}
    hiScores = loadHiScores();
  },
  addInert(n, x, y) {
    for (let i = 0; i < n; i++) {
      mines.push(
        newMine(
          vec(
            x == null ? rnd(FX0 + 10, FX1 - 10) : x + i * 0.1,
            y == null ? rnd(FY0 + 10, FY1 - 10) : y,
          ),
          vec(0, 0),
        ),
      );
    }
  },
  addPoints(v) {
    addPoints(v, vec(CX, CY));
  },
  killPlayer() {
    player.invuln = 0;
    simActive = true;
    hitPlayer("forced");
  },
  setInvuln(v) {
    player.invuln = v;
  },
  playerPos(x, y) {
    player.pos.set(x, y);
  },
  wipeHiScores() {
    try {
      localStorage.removeItem(HISCORE_KEY);
    } catch (e) {}
    hiScores = loadHiScores();
  },
};
