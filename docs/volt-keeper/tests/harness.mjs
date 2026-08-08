/*
 * Headless harness: runs the real main.js inside a Node vm with crisp-game-lib's
 * globals stubbed, and the real audio bus wired to the mock adapter. Tests
 * therefore exercise the shipped game code, not a copy of it.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const VKBus = require(path.join(root, "audio", "vk-bus.js"));

const KEYS = [
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "KeyA",
  "KeyD",
  "KeyW",
  "KeyS",
  "Space",
  "KeyZ",
  "KeyX",
  "KeyJ",
  "KeyK",
];

export function loadGame(options = {}) {
  let seed = options.seed == null ? 12345 : options.seed;
  const rndState = { s: seed >>> 0 || 1 };
  const nextRandom = () => {
    // xorshift32: deterministic and independent of the host RNG.
    let x = rndState.s;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5;
    x >>>= 0;
    rndState.s = x;
    return x / 4294967296;
  };

  const adapter = VKBus.createMockAdapter();
  const scores = [];
  const particles = [];
  const draws = [];
  let currentColor = "black";
  let endCalled = 0;
  let exposed = null;
  const draw = (fn, args) => {
    draws.push(Object.assign({ fn, color: currentColor }, args));
    return { isColliding: { rect: {}, char: {}, text: {} } };
  };

  const code = new Map();
  for (const key of KEYS) code[key] = { isPressed: false, isJustPressed: false, isJustReleased: false };

  const sandbox = {
    // math shortcuts
    PI: Math.PI,
    abs: Math.abs,
    sin: Math.sin,
    cos: Math.cos,
    atan2: Math.atan2,
    sqrt: Math.sqrt,
    pow: Math.pow,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    min: Math.min,
    max: Math.max,
    Math,
    JSON,
    String,
    Array,
    Object,
    Number,
    Infinity,
    console,
    // library helpers
    vec: (x, y) => ({ x, y }),
    rnd: (a, b) => (a == null ? nextRandom() : b == null ? nextRandom() * a : a + nextRandom() * (b - a)),
    rndi: (a, b) => (b == null ? Math.floor(nextRandom() * a) : a + Math.floor(nextRandom() * (b - a))),
    clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
    range: (n) => Array.from({ length: n }, (_, i) => i),
    times: (n, f) => { for (let i = 0; i < n; i++) f(i); },
    remove: (arr, f) => {
      for (let i = arr.length - 1; i >= 0; i--) if (f(arr[i], i)) arr.splice(i, 1);
    },
    // Drawing stubs. Collision is done by the game's own maths, so these only
    // need to be shape-compatible -- but they record what was drawn, so a test
    // can assert that HUD elements actually reach the screen.
    color: (c) => {
      currentColor = c;
    },
    rect: (x, y, w, h) => draw("rect", { x, y, w, h }),
    box: (pos, w, h) => draw("box", { x: pos.x, y: pos.y, w, h }),
    bar: (pos, len, thickness, angle) => draw("bar", { x: pos.x, y: pos.y, len, thickness, angle }),
    arc: (pos, radius, thickness, angleFrom, angleTo) =>
      draw("arc", { x: pos.x, y: pos.y, radius, thickness, angleFrom, angleTo }),
    line: (a, b, thickness) => draw("line", { x: a.x, y: a.y, x2: b.x, y2: b.y, thickness }),
    text: (s, x, y) => draw("text", { text: s, x, y }),
    char: (s, x, y) => draw("char", { text: s, x, y }),
    particle: (pos, opts) => particles.push({ pos, opts }),
    addScore: (points, x, y) => scores.push({ points, x, y }),
    end: () => { endCalled++; },
    ticks: 0,
    score: 0,
    difficulty: 1,
    isReplaying: false,
    input: { pos: { x: 0, y: 0 }, isPressed: false, isJustPressed: false, isJustReleased: false },
    keyboard: { code },
    // audio: the real bus, driven into the mock adapter
    VKBus: {
      createBus: (o) => VKBus.createBus(o),
      createMockAdapter: () => adapter,
      createWebAudioAdapter: () => Object.assign({}, adapter, { resume() {} }),
    },
    __VK_TEST__: {
      expose: (api) => {
        exposed = api;
      },
    },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const source = fs.readFileSync(path.join(root, "main.js"), "utf8");
  vm.runInContext(source, sandbox, { filename: "main.js" });
  if (!exposed) throw new Error("main.js did not expose its test seam");

  let frame = 0;
  const held = new Set();

  return {
    sandbox,
    adapter,
    api: exposed,
    scores,
    particles,
    draws,
    clearDraws() {
      draws.length = 0;
    },
    get endCount() {
      return endCalled;
    },
    get frame() {
      return frame;
    },
    press(key) {
      held.add(key);
    },
    release(key) {
      held.delete(key);
    },
    /** Advance one frame. `justPressed` fires only on this frame. */
    step(justPressed = []) {
      for (const key of KEYS) {
        code[key].isPressed = held.has(key) || justPressed.includes(key);
        code[key].isJustPressed = justPressed.includes(key);
      }
      // The game owns the arcade cycle, so ticks is monotonic for the whole
      // cabinet session: nothing resets it back to zero.
      sandbox.ticks = frame;
      exposed.update();
      frame++;
      return sandbox;
    },
    /** Leave attract mode and run out the READY ceremony. */
    startPlay() {
      this.step([]);
      let guard = 0;
      while (exposed.state().phase === "attract" && guard++ < 10) this.step(["KeyZ"]);
      while (exposed.state().phase === "ready" && guard++ < 400) this.step([]);
      if (exposed.state().phase !== "play") {
        throw new Error(`startPlay did not reach play (phase=${exposed.state().phase})`);
      }
    },
    reset() {
      frame = 0;
      endCalled = 0;
      adapter.reset();
    },
  };
}
