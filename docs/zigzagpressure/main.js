title = "Zig-Zag Pressure";

description = `
[Tap] Turn
`;

characters = [];

options = {
  theme: "dark",
  viewSize: { x: 150, y: 100 },
  isPlayingBgm: true,
  isReplayEnabled: true,
  audioSeed: 222,
};

/** @type {{pos: Vector, vel: Vector}} */
let ball;
/** @type {{pos: Vector, size: Vector, vx: number}[]} */
let walls;
let nextWallTicks;
let nextWallSide;
let nextWallY;
let multiplier;
let left;
let nextExtend;
let invincibleTicks;

function update() {
  if (!ticks) {
    ball = { pos: vec(75, 50), vel: vec(1, 1) };
    walls = [
      { pos: vec(40, 50), size: vec(5, 30), vx: 1 },
      { pos: vec(110, 50), size: vec(5, 30), vx: -1 },
    ];
    nextWallTicks = 0;
    nextWallSide = -1;
    nextWallY = 50;
    multiplier = 1;
    left = 2;
    nextExtend = 100;
    invincibleTicks = 0;
  }
  const gameSpeed = sqrt(difficulty);
  nextWallTicks--;
  if (nextWallTicks < 0) {
    const x = nextWallSide > 0 ? -2 : 152;
    nextWallY = wrap(nextWallY + rnd(40, 50), 20, 80);
    const h = rnd(20, 40);
    walls.push({ pos: vec(x, nextWallY), size: vec(5, h), vx: nextWallSide });
    nextWallSide *= -1;
    nextWallTicks = rnd(50, 80) / gameSpeed;
  }
  if (invincibleTicks > 0) {
    color("white");
    box(ball.pos, 3);
    invincibleTicks--;
  }
  color("cyan");
  remove(walls, (w) => {
    w.pos.x += w.vx * 0.2 * gameSpeed;
    return (
      box(w.pos, w.size).isColliding.rect.white || w.pos.x < -5 || w.pos.x > 155
    );
  });
  if (input.isJustPressed) {
    ball.vel.y *= -1;
    play("hit");
  }
  ball.pos.add(vec(ball.vel).mul(0.7 * gameSpeed));
  ball.pos.y = wrap(ball.pos.y, 0, 100);
  color("transparent");
  if (box(ball.pos.x + ball.vel.x, ball.pos.y, 3).isColliding.rect.cyan) {
    ball.vel.x *= -1;
    ball.pos.x += ball.vel.x;
    if (invincibleTicks <= 0) {
      addScore(multiplier);
      multiplier++;
      play("select");
    }
  }
  if (box(ball.pos.x, ball.pos.y + ball.vel.y, 3).isColliding.rect.cyan) {
    ball.vel.y *= -1;
    ball.pos.y += ball.vel.y;
  }
  color(invincibleTicks > 0 && invincibleTicks % 10 > 5 ? "white" : "red");
  if (
    box(ball.pos, 3).isColliding.rect.cyan ||
    ball.pos.x < -5 ||
    ball.pos.x > 155
  ) {
    if (invincibleTicks <= 0) {
      left--;
      multiplier = ceil(multiplier / 2);
      play("explosion");
    }
    if (left < 0) {
      end();
    } else {
      invincibleTicks = 60;
    }
    ball.pos.x = wrap(ball.pos.x, -5, 155);
  }
  if (ticks % 60 === 0 && multiplier > 1) {
    multiplier--;
  }
  if (score >= nextExtend) {
    left = clamp(left + 1, 0, 2);
    nextExtend = floor(nextExtend / 100) * 2 * 100;
    play("powerUp");
  }
  color("black");
  text(`x${multiplier}`, 3, 9, { isSmallText: true });
  text(`${nextExtend}`, 3, 91, { isSmallText: true });
  color("red");
  for (let i = 0; i < left; i++) {
    box(i * 5 + 3, 97, 3);
  }
}
