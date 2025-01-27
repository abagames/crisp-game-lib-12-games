title = "JUGGLING CHAIN";

description = `
[Tap] Change Direction
`;

characters = [
  "./jugglingchain/images/background.png",
  "./jugglingchain/images/ball.png",
  "./jugglingchain/images/arrow.png",
];

audioFiles = {
  bgm: "./jugglingchain/audios/bgm.mp3",
  tap: "./jugglingchain/audios/tap.mp3",
  crush: "./jugglingchain/audios/crush.mp3",
  revival: "./jugglingchain/audios/revival.mp3",
  gameover: "./jugglingchain/audios/gameover.mp3",
  score: "./jugglingchain/audios/score.mp3",
  arrow: "./jugglingchain/audios/arrow.mp3",
};

options = {
  theme: "dark",
  isPlayingBgm: true,
  isReplayEnabled: true,
  isDrawingScoreFront: true,
  isDrawingParticleFront: true,
  colorPalette: [
    [29, 29, 65],
    [49, 49, 78],
    [45, 45, 89],
    [82, 82, 106],
    [6, 194, 174],
    [32, 243, 217],
    [229, 255, 255],
    [4, 137, 140],
    [255, 252, 255],
    [2, 11, 21],
    [246, 46, 20],
    [171, 52, 39],
    [59, 5, 3],
  ],
  audioTempo: 150,
  bgmVolume: 4,
};

// Game center point
const CENTER = vec(50, 50);
const REVIVAL_TIME = 180; // 3 seconds at 60fps

// Define variables for game objects
/** @type {{
  pos: Vector,
  angle: number,
  radius: number,
  chainId: number,
  direction: 1 | -1,
  isDestroyed: boolean,
  revivalTicks: number
}[]} */
let balls;
let ballCount;
const rotationSpeed = 0.04;
const ballRadius = 20;

/** @type {{
  pos: Vector,
  vel: Vector,
  isVertical: boolean
  rotation: number,
  isInScreen: boolean
}[]} */
let obstacles;
let nextObstacleSpawn;

function update() {
  if (!ticks) {
    // Initialize game objects
    balls = [];
    ballCount = 0;
    obstacles = [];
    nextObstacleSpawn = 0;
    initializeGame();
  }
  color("black");
  char("a", 50, 50);
  updateObstacles();
  handleInput();
  updateBalls();
  checkRevival();
}

function initializeGame() {
  // Create three initial balls at different angles
  // Add balls spaced evenly around the circle
  for (let i = 0; i < 3; i++) {
    const angle = (i * 2 * PI) / 3;
    balls.push({
      pos: vec(
        CENTER.x + ballRadius * Math.cos(angle),
        CENTER.y + ballRadius * Math.sin(angle)
      ),
      angle,
      radius: ballRadius,
      chainId: 1,
      direction: 1,
      isDestroyed: false,
      revivalTicks: 0,
    });
  }
}

function updateBalls() {
  color("black");
  ballCount = 0;
  balls.forEach((ball) => {
    if (ball.isDestroyed) {
      return; // Skip destroyed balls
    }

    // Update ball angle
    ball.angle += rotationSpeed * ball.direction * sqrt(difficulty);

    // Update ball position
    ball.pos.x = CENTER.x + ball.radius * Math.cos(ball.angle);
    ball.pos.y = CENTER.y + ball.radius * Math.sin(ball.angle);

    // Draw ball
    color("black");
    const c = char("b", ball.pos.x, ball.pos.y).isColliding.char;
    if (c.b || c.c) {
      play("crush", { volume: 2 });
      color("cyan");
      particle(ball.pos, { count: 20, speed: 2 });
      color("light_blue");
      char("b", ball.pos.x, ball.pos.y);
      ball.isDestroyed = true;
      ball.revivalTicks = REVIVAL_TIME;
    } else {
      ballCount++;
    }
  });

  // Game over if all balls are destroyed
  if (ballCount === 0) {
    play("gameover");
    end();
  }
}

function handleInput() {
  if (input.isJustPressed) {
    play("tap", { volume: 2 });
    // Reverse direction of all balls
    balls.forEach((ball) => {
      ball.direction *= -1;
    });
  }
}

function updateObstacles() {
  nextObstacleSpawn -= sqrt(difficulty);
  if (nextObstacleSpawn < 0) {
    play("arrow");
    const isVertical = rnd() < 0.5;
    let rotation;
    let pos, vel;
    if (isVertical) {
      pos = vec(rnd(10, 90), rnd() < 0.5 ? -5 : 105);
      vel = vec(0, pos.y < 50 ? 1 : -1);
      rotation = vel.y > 0 ? 2 : 0;
    } else {
      pos = vec(rnd() < 0.5 ? -5 : 105, rnd(10, 90));
      vel = vec(pos.x < 50 ? 1 : -1, 0);
      rotation = vel.x > 0 ? 1 : 3;
    }
    vel.mul(rnd(0.5, 1)).mul(sqrt(difficulty));
    obstacles.push({ pos, vel, isVertical, rotation, isInScreen: false });
    nextObstacleSpawn = rnd(50, 70);
  }

  color("black");
  remove(obstacles, (o) => {
    o.pos.add(o.vel);
    char("c", o.pos, { rotation: o.rotation });
    if (!o.isInScreen && o.pos.isInRect(11, 11, 78, 78)) {
      o.isInScreen = true;
    }
    if (o.isInScreen && !o.pos.isInRect(10, 10, 80, 80)) {
      play("score");
      addScore([1, 3, 9][ballCount - 1], o.pos);
      return true;
    }
  });
}

function checkRevival() {
  balls.forEach((ball) => {
    if (ball.isDestroyed) {
      ball.revivalTicks--;
      if (ball.revivalTicks <= 0) {
        play("revival", { volume: 3 });
        ball.isDestroyed = false;
      }
    }
  });

  // Draw revival countdown above each destroyed ball
  color("cyan");
  balls.forEach((ball) => {
    if (ball.isDestroyed) {
      arc(ball.pos, sqrt(ball.revivalTicks), 1);
    }
  });
}
