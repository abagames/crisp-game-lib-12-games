title = "THRUST STRAFE";

description = `
[Hold] Thrust up
`;

characters = [
  "./thruststrafe/images/background.png",
  "./thruststrafe/images/body.png",
  "./thruststrafe/images/wing.png",
  "./thruststrafe/images/missile.png",
];

audioFiles = {
  bgm: "./thruststrafe/audios/bgm.mp3",
  frame: "./thruststrafe/audios/frame.mp3",
  warn: "./thruststrafe/audios/warn.mp3",
  launch: "./thruststrafe/audios/launch.mp3",
  hit: "./thruststrafe/audios/hit.mp3",
  explosion: "./thruststrafe/audios/explosion.mp3",
  score: "./thruststrafe/audios/score.mp3",
};

options = {
  theme: "dark",
  isPlayingBgm: true,
  isReplayEnabled: true,
  isDrawingParticleFront: true,
  colorPalette: [
    [30, 97, 141],
    [7, 31, 66],
    [15, 50, 92],
    [116, 193, 220],
    [227, 240, 238],
    [229, 238, 237],
    [64, 194, 234],
    [0, 0, 0],
    [255, 255, 255],
    [32, 64, 128],
    [25, 29, 32],
    [150, 176, 180],
    [0, 0, 0],
    [241, 68, 45],
    [134, 28, 33],
    [253, 251, 253],
  ],
  bgmVolume: 4,
  audioTempo: 150,
};

// Game object variables
/**
 * @type {{
 * pos: Vector, vy: number, strafeDir: -1 | 1,
 * strafeSpeed: number, isWingAlive: boolean[], wingBackTicks: number[]
 * }} */
let jet;
/** @type {{pos: Vector, targetX: number, speed: number, nextSmokeTicks: number}[]} */
let missiles;
/** @type {{pos: Vector, vel: Vector, size: number, ticks: number}[]} */
let flames;
/** @type {{pos: Vector, vel: Vector, size: number, ticks: number}[]} */
let smokes;
let nextMissileSpawn;
let bgOffset;

// Constants
const jetSize = 3;
const gravity = 0.1;
const thrustForce = 0.2;
const missileSpeed = 1;
const maxMissiles = 10;

function update() {
  if (!ticks) {
    // Initialize game state
    jet = {
      pos: vec(50, 50),
      vy: 0,
      strafeDir: 1,
      strafeSpeed: 1,
      isWingAlive: [true, true],
      wingBackTicks: [0, 0],
    };
    missiles = [];
    flames = [];
    smokes = [];
    nextMissileSpawn = 60;
    bgOffset = 15;
  }

  const sd = sqrt(difficulty);
  // Update and draw scrolling background
  color("black");
  bgOffset += 0.01;
  char("a", 50, bgOffset);

  if (input.isJustPressed) {
    // Create flame attack
    play("frame", { volume: 0.5 });
    times(5, () => {
      flames.push({
        pos: vec(jet.pos),
        vel: vec(rnd(1, 2), 0)
          .rotate(PI / 2 + rnds(0.5))
          .mul(sd), // Downward with random spread
        size: 10,
        ticks: 40 / sd,
      });
    });
  }

  // Update and draw flames
  color("red");
  remove(flames, (f) => {
    f.pos.add(f.vel);
    f.vel.mul(1 - 0.05 * sd); // Gradually slow down
    f.size *= 1 - 0.1 * sd; // Gradually shrink
    const c = box(f.pos, f.size).isColliding.rect;
    f.ticks--;
    return f.ticks < 0 || f.size < 0.5;
  });

  // Update and draw smokes
  color("light_blue");
  remove(smokes, (s) => {
    s.pos.add(s.vel);
    s.vel.mul(0.9); // Gradually slow down
    s.size *= 0.8; // Gradually shrink
    box(s.pos, s.size);
    s.ticks--;
    return s.ticks < 0 || s.size < 0.5;
  });

  if (input.isPressed) {
    // Apply thrust when button is held
    jet.vy -= thrustForce;
  }
  // Apply gravity
  jet.vy += gravity * (jet.isWingAlive[0] && jet.isWingAlive[1] ? 1 : 1.3);

  // Update vertical position
  jet.pos.y +=
    jet.vy * sd * (jet.isWingAlive[0] && jet.isWingAlive[1] ? 1 : 0.5);

  // Keep jet in bounds vertically
  if (jet.pos.y < 5) {
    jet.pos.y = 5;
    jet.vy = 0;
  }
  if (jet.pos.y > 95) {
    jet.pos.y = 95;
    jet.vy = 0;
  }

  // Update horizontal strafe movement
  let vx = jet.strafeSpeed * jet.strafeDir * sd;
  if (!jet.isWingAlive[0]) {
    vx -= 0.3 * sd;
  }
  if (!jet.isWingAlive[1]) {
    vx += 0.3 * sd;
  }
  jet.pos.x += vx;
  if (
    (jet.pos.x < 10 && jet.strafeDir < 0) ||
    (jet.pos.x > 90 && jet.strafeDir > 0)
  ) {
    jet.strafeDir *= -1;
  }

  // Draw jet
  // Jet body
  const angle = jet.vy * 0.2; // Tilt based on vertical velocity
  color("black");
  char("b", jet.pos);
  // Wings
  if (jet.isWingAlive[0]) {
    color("black");
    char("c", vec(jet.pos).addWithAngle(angle, -7));
  } else {
    color("red");
    particle(vec(jet.pos).addWithAngle(angle, -7), {
      count: 1,
      speed: 2,
      edgeColor: "blue",
    });
    jet.wingBackTicks[0]--;
    if (jet.wingBackTicks[0] % 20 === 0) {
      play("warn", { volume: 2 });
    }
    if (jet.wingBackTicks[0] < 0) {
      jet.isWingAlive[0] = true;
    }
  }
  if (jet.isWingAlive[1]) {
    color("black");
    char("c", vec(jet.pos).addWithAngle(angle, 7));
  } else {
    color("red");
    particle(vec(jet.pos).addWithAngle(angle, 7), {
      count: 1,
      speed: 2,
      edgeColor: "blue",
    });
    jet.wingBackTicks[1]--;
    if (jet.wingBackTicks[1] % 20 === 0) {
      play("warn", { volume: 2 });
    }
    if (jet.wingBackTicks[1] < 0) {
      jet.isWingAlive[1] = true;
    }
  }

  // Draw thrust effect when button is held
  if (input.isPressed) {
    color("light_blue");
    particle(jet.pos.x, jet.pos.y + 5, {
      count: 1,
      speed: 1,
      angle: PI / 2,
      angleWidth: PI / 4,
    });
  }

  // Update missiles
  nextMissileSpawn--;
  if (nextMissileSpawn <= 0 && missiles.length < maxMissiles) {
    // Spawn new missile
    play("launch", { volume: 2 });
    missiles.push({
      pos: vec(rnd(10, 90), 105),
      targetX: jet.pos.x,
      speed: missileSpeed * sd,
      nextSmokeTicks: 0,
    });
    nextMissileSpawn = rnd(20, 80) / sd;
  }

  // Update and draw missiles
  remove(missiles, (m) => {
    // Move missile towards target Y
    const dx = m.targetX - m.pos.x;
    m.pos.y -= m.speed;
    m.pos.x += clamp(dx * 0.1, -1, 1) * sd; // Gentle homing behavior

    // Generate smoke
    m.nextSmokeTicks -= sd;
    if (m.nextSmokeTicks <= 0) {
      smokes.push({
        pos: vec(m.pos).add(0, 5),
        vel: vec(rnds(1), 0),
        size: 9,
        ticks: 9,
      });
      m.nextSmokeTicks = 3;
    }

    // Draw missile
    color("black");
    const c = char("d", m.pos).isColliding;

    // Check collision with jet
    if (c.char.b) {
      play("explosion", { volume: 2 });
      color("black");
      particle(jet.pos, { count: 50, speed: 3 });
      if (!jet.isWingAlive[0] || !jet.isWingAlive[1]) {
        // If both wings are destroyed, end the game
        end();
      } else if (jet.pos.x > m.pos.x) {
        jet.isWingAlive[0] = false;
        jet.wingBackTicks[0] = 120;
        return true;
      } else {
        jet.isWingAlive[1] = false;
        jet.wingBackTicks[1] = 120;
        return true;
      }
    }

    // Check collision with flames
    if (c.rect.red) {
      play("hit");
      particle(m.pos);
      return true;
    }

    // Remove missiles that go off screen
    if (m.pos.y < -5) {
      play("score", { volume: 1.5 });
      addScore(1);
      return true;
    }
  });
}
