title = "JUMPINBOX";

description = `
[Tap] Jump
`;

characters = [];

options = {
  theme: "shapeDark",
  isPlayingBgm: true,
  isReplayEnabled: true,
  isDrawingScoreFront: true,
  audioSeed: 20,
};

/**
 * @type {{
 * pos: Vector, vel: Vector, size: Vector,
 * angle: number, angleVel: number, wallSide: number, nextTrailTicks: number
 * }}
 */
let player;
/** @type {{pos: Vector, vel: Vector, size: Vector, isInScreen: boolean, isRed: boolean}[]} */
let golds;
let nextGoldTicks;
let nextGoldPos;
let nextGoldVel;
let nextRedCount;
/** @type {{pos: Vector, size: Vector, shrinkRatio: number}[]} */
let trails;
let multiplier;

const wallSize = 60;
const wallThickness = 3;

function update() {
  if (!ticks) {
    player = {
      pos: vec(50, 30),
      vel: vec(0, 2),
      size: vec(4, 4),
      angle: 0,
      angleVel: 1,
      wallSide: undefined,
      nextTrailTicks: 0,
    };
    golds = [];
    nextGoldTicks = 0;
    nextGoldPos = vec(50, 50);
    nextGoldVel = vec(1, 0).rotate(rnd(PI * 2));
    nextRedCount = 9;
    trails = [];
    multiplier = 1;
  }
  const sd = sqrt(difficulty);
  color("light_black");
  box(
    50,
    (100 - wallSize) / 2 - wallThickness / 2,
    wallSize + wallThickness * 2,
    wallThickness
  );
  box(
    50,
    (100 + wallSize) / 2 + wallThickness / 2,
    wallSize + wallThickness * 2,
    wallThickness
  );
  box(
    (100 - wallSize) / 2 - wallThickness / 2,
    50,
    wallThickness,
    wallSize + wallThickness * 2
  );
  box(
    (100 + wallSize) / 2 + wallThickness / 2,
    50,
    wallThickness,
    wallSize + wallThickness * 2
  );
  color("light_blue");
  remove(trails, (t) => {
    t.size.mul(1 - (1 - t.shrinkRatio) * sd);
    if (t.size.x + t.size.y < 5) {
      return true;
    }
    box(t.pos, t.size);
  });
  if (player.wallSide != null) {
    player.angle += player.angleVel * 0.08 * sd;
    if (
      (player.angle < (-PI / 7) * 3 && player.angleVel < 0) ||
      (player.angle > (PI / 7) * 3 && player.angleVel > 0)
    ) {
      player.angleVel *= -1;
    }
    color("blue");
    line(
      player.pos,
      vec(player.pos).addWithAngle(player.angle + player.wallSide, 20)
    );
    if (input.isJustPressed) {
      play("jump");
      player.vel.set(2 * sd).rotate(player.angle + player.wallSide);
      player.wallSide = undefined;
      multiplier /= 2;
    }
  }
  if (player.wallSide == null) {
    player.nextTrailTicks -= sd;
    if (player.nextTrailTicks < 0) {
      trails.push({
        pos: vec(player.pos),
        size: vec(player.size),
        shrinkRatio: 0.94,
      });
      player.nextTrailTicks += 2;
    }
    player.pos.add(player.vel);
    if (player.pos.x < (100 - wallSize) / 2 + player.size.x / 2) {
      play("hit");
      player.pos.x = (100 - wallSize) / 2 + player.size.x / 2;
      player.pos.y = clamp(
        player.pos.y,
        (100 - wallSize) / 2 + player.size.y / 2,
        (100 + wallSize) / 2 - player.size.y / 2
      );
      player.wallSide = 0;
    } else if (player.pos.y < (100 - wallSize) / 2 + player.size.y / 2) {
      play("hit");
      player.pos.x = clamp(
        player.pos.x,
        (100 - wallSize) / 2 + player.size.x / 2,
        (100 + wallSize) / 2 - player.size.x / 2
      );
      player.pos.y = (100 - wallSize) / 2 + player.size.y / 2;
      player.wallSide = PI / 2;
    } else if (player.pos.x > (100 + wallSize) / 2 - player.size.x / 2) {
      play("hit");
      player.pos.x = (100 + wallSize) / 2 - player.size.x / 2;
      player.pos.y = clamp(
        player.pos.y,
        (100 - wallSize) / 2 + player.size.y / 2,
        (100 + wallSize) / 2 - player.size.y / 2
      );
      player.wallSide = PI;
    } else if (player.pos.y > (100 + wallSize) / 2 - player.size.y / 2) {
      play("hit");
      player.pos.x = clamp(
        player.pos.x,
        (100 - wallSize) / 2 + player.size.x / 2,
        (100 + wallSize) / 2 - player.size.x / 2
      );
      player.pos.y = (100 + wallSize) / 2 - player.size.y / 2;
      player.wallSide = (PI / 2) * 3;
    }
  }
  color("black");
  box(player.pos, player.size);
  nextGoldPos.add(vec(nextGoldVel).mul(sd / 2));
  if (
    nextGoldPos.x < (100 - wallSize) / 2 ||
    nextGoldPos.x > (100 + wallSize) / 2
  ) {
    nextGoldVel.x *= -1;
    nextGoldVel.y += rnds(0.2);
    nextGoldVel.normalize();
  }
  if (
    nextGoldPos.y < (100 - wallSize) / 2 ||
    nextGoldPos.y > (100 + wallSize) / 2
  ) {
    nextGoldVel.y *= -1;
    nextGoldVel.x += rnds(0.2);
    nextGoldVel.normalize();
  }
  nextGoldTicks -= sd;
  if (nextGoldTicks < 0) {
    nextRedCount--;
    const isRed = nextRedCount < 0;
    const angle = (rndi(4) * PI) / 2;
    const pos = vec(isRed ? player.pos : nextGoldPos);
    pos.addWithAngle(angle + PI, 100);
    golds.push({
      pos,
      vel: vec(rnd(0.2, 0.3) * sd).rotate(angle),
      size: vec(rnd(10, 20), rnd(10, 20)),
      isInScreen: false,
      isRed,
    });
    if (isRed) {
      play("laser");
      nextRedCount = rndi(24, 27);
    }
    nextGoldTicks = 25;
  }
  remove(golds, (g) => {
    if (g.isRed) {
      return;
    }
    return moveGold(g);
  });
  remove(golds, (g) => {
    if (!g.isRed) {
      return;
    }
    return moveGold(g);
  });
  color("black");
  text(`x${ceil(multiplier)}`, 3, 9);
}

function moveGold(g) {
  g.pos.add(g.vel);
  color(g.isRed ? "red" : "yellow");
  const c = box(g.pos, g.size).isColliding.rect;
  if (g.isRed && c.black && !c.light_blue) {
    play("explosion");
    end();
    return;
  }
  if (c.black || c.light_blue) {
    play("coin");
    addScore(ceil(multiplier), g.pos);
    multiplier++;
    const t = {
      pos: g.pos,
      size: g.size,
      shrinkRatio: 0.88,
    };
    trails.push(t);
    color("light_blue");
    box(t.pos, t.size);
    return true;
  }
  if (
    g.pos.isInRect(
      -g.size.x / 2 + 10,
      -g.size.y / 2 + 10,
      80 + g.size.x,
      80 + g.size.y
    )
  ) {
    g.isInScreen = true;
  } else {
    if (g.isInScreen && g.isRed) {
      return true;
    }
    if (
      g.isInScreen &&
      !g.isRed &&
      !g.pos.isInRect(
        g.size.x / 2,
        g.size.y / 2,
        100 - g.size.x,
        100 - g.size.y
      )
    ) {
      play("laser");
      g.isRed = true;
      g.vel.rotate(PI);
    }
  }
}
